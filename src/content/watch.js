// @ts-check
// The watch clock. Measures how long the main player plays, reports it to the worker, and locks the player at zero.

(function () {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;
  /** @type {any} */
  const { send: sendMessage, h, onState, hourLabel, pausePlayer, watchFor } = /** @type {any} */ (globalThis).DripUI;

  // YouTube selectors. These break when YouTube changes its markup.
  const SEL = {
    video: '#movie_player video.html5-main-video',
    watchPage: 'ytd-watch-flexy',
    theaterAttr: 'theater',
    theaterButton: '.ytp-size-button',
    autoplayToggle: '.ytp-autonav-toggle-button[aria-checked="true"]',
    ads: '#movie_player.ad-showing, #movie_player.ad-interrupting',
    player: '#movie_player',
    app: 'ytd-app',
    miniplayerAttr: 'miniplayer-is-active',
    title: 'ytd-watch-metadata h1, h1.ytd-watch-metadata',
    channel: 'ytd-watch-metadata ytd-channel-name a, #owner ytd-channel-name a',
  };

  const GRACE_ATTR = 'data-drip-grace';

  /** @type {any} */
  let state = null;
  /** @type {HTMLVideoElement | null} */
  let video = null;
  let playedMs = 0;
  /** @type {number | null} */
  let runningSince = null;
  let locked = false;
  /** Video allowed to finish after time ran out, when grace mode is on. Set it with setGrace. */
  let graceId = '';
  let lastVideoId = '';
  let disconnected = false;
  /** Set when watchFor gave up finding the player. Cleared once attach() finds one. */
  let playerBroken = false;

  /**
   * Also marks <html>, so guard.js stops refusing play() on a player drip can't see (Q25).
   * @param {boolean} broken
   */
  function setPlayerBroken(broken) {
    playerBroken = broken;
    document.documentElement.toggleAttribute('data-drip-broken', broken);
    if (broken) hideLock();
  }
  /** @type {{id: string, paid: boolean, startedAt: number} | null} */
  let pendingTick = null;
  /** The video the running stretch of playback belongs to. */
  let runId = '';
  /**
   * Played time measured but not yet charged, oldest first, one entry per video. It goes to the worker every
   * SEND_EVERY seconds, at once when it would use up the balance, and whenever playback stops or the video changes.
   * @type {{id: string, seconds: number, endedAt: number}[]}
   */
  const unsent = [];
  const SEND_EVERY = 5;

  /** @type {Set<string>} */
  const theaterHandled = new Set();
  /** @type {ReturnType<typeof setInterval> | null} */
  let theaterTimer = null;
  /** The video the running theater loop is for. */
  let theaterFor = '';
  const THEATER_RETRY_MS = 1500;

  /** Tells fade.js the page layout is settled, so it can fade in after theater mode has been applied, not while it's moving. */
  function theaterDone() {
    document.dispatchEvent(new CustomEvent('drip-theater-done'));
  }

  function defaultTheater() {
    const id = location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') || '' : '';
    // State and the status reply both call this on load. A second loop would click right after the first and could
    // turn theater mode back off, so a loop already running for this video keeps going instead.
    if (theaterTimer !== null && theaterFor === id) return;
    if (theaterTimer !== null) clearInterval(theaterTimer);
    theaterTimer = null;
    if (!id || theaterHandled.has(id) || (locked && !inGrace())) {
      theaterDone();
      return;
    }
    if (!state) return;
    const deadline = performance.now() + 10000;
    let clickedAt = -Infinity;
    function stop() {
      if (theaterTimer !== null) clearInterval(theaterTimer);
      theaterTimer = null;
      theaterDone();
    }
    function attempt() {
      if (locked && !inGrace()) return stop();
      const currentId = location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') || '' : '';
      if (disconnected || currentId !== id) return stop();
      if (performance.now() >= deadline) {
        // Once it has clicked, giving up is final. Otherwise every state update during playback would start a new loop.
        if (clickedAt > -Infinity) theaterHandled.add(id);
        return stop();
      }
      const page = document.querySelector(SEL.watchPage);
      const button = /** @type {HTMLElement | null} */ (page?.querySelector(SEL.theaterButton));
      if (!page || !button) return;
      if (page.hasAttribute(SEL.theaterAttr) || document.fullscreenElement !== null) {
        theaterHandled.add(id);
        return stop();
      }
      // On a full page load the button shows up before the player is ready, and YouTube ignores a click that early
      // (checked 2026-10-06). So click again until theater mode is on, spaced out so a click that did land has time
      // to take effect before the next one would turn it back off.
      if (performance.now() - clickedAt >= THEATER_RETRY_MS) {
        clickedAt = performance.now();
        button.click();
      }
    }
    theaterFor = id;
    theaterTimer = setInterval(attempt, 100);
    attempt();
  }

  /** Keeps YouTube's autoplay switch off, so a finished video doesn't roll into the next one (decision Q2). */
  function autoplayOff() {
    const toggle = /** @type {HTMLElement | null} */ (document.querySelector(SEL.autoplayToggle));
    toggle?.click();
  }

  function miniplayerActive() {
    const app = document.querySelector(SEL.app);
    return !!(app && app.hasAttribute(SEL.miniplayerAttr));
  }

  function videoId() {
    const id = location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') || '' : '';
    if (id) lastVideoId = id;
    return id || (miniplayerActive() ? lastVideoId : '');
  }

  /** The clock runs on watch pages and in the miniplayer. */
  function clockActive() {
    return location.pathname === '/watch' || miniplayerActive();
  }

  /**
   * Also marks the grace video on <html>, so early.js doesn't hold a video that's finishing in grace.
   * @param {string} id
   */
  function setGrace(id) {
    graceId = id;
    if (id) document.documentElement.setAttribute(GRACE_ATTR, id);
    else document.documentElement.removeAttribute(GRACE_ATTR);
    document.dispatchEvent(new CustomEvent('drip-grace'));
  }

  function inGrace() {
    return !!graceId && graceId === videoId();
  }

  /** @param {object} msg */
  async function send(msg) {
    if (disconnected) return { ok: false, error: 'disconnected' };
    const res = await sendMessage(msg);
    if (res && res.error === 'disconnected') {
      disconnected = true;
      setGrace('');
      stopRun();
      pausePlayer(video);
      clearInterval(tickTimer);
      clearInterval(statusTimer);
      showDisconnected();
    }
    return res;
  }

  function showDisconnected() {
    const panel = h('div', { class: 'drip-lock-panel' }, 'drip was updated. Refresh this page.');
    const existing = document.getElementById('drip-lock');
    if (existing) existing.replaceChildren(panel);
    else document.body.append(h('div', { id: 'drip-lock' }, panel));
  }

  function startRun() {
    if (runningSince === null) {
      runningSince = performance.now();
      runId = videoId();
    }
  }

  function stopRun() {
    if (runningSince !== null) {
      playedMs += performance.now() - runningSince;
      runningSince = null;
    }
  }

  // Ads play in the same video element, and their time is dropped, not charged (Q27). A delayed tick can span an ad
  // and the video around it, so time is settled the moment the player's ad class changes, under the state it had.
  let adShowing = false;
  /** @type {Element | null} */
  let watchedPlayer = null;
  const adObserver = new MutationObserver(syncAd);

  /** Starts watching the player's class, again if YouTube swapped the player element. */
  function watchAds() {
    const player = document.querySelector(SEL.player);
    if (player === watchedPlayer) return;
    adObserver.disconnect();
    watchedPlayer = player;
    if (player) adObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
    syncAd();
  }

  function syncAd() {
    const now = !!document.querySelector(SEL.ads);
    if (now === adShowing) return;
    if (clockActive()) bank();
    else takePlayed();
    adShowing = now;
  }

  /** Moves measured playback into unsent, under the video it played on. Time played during an ad is dropped. */
  function bank() {
    const seconds = takePlayed();
    if (adShowing) return;
    if (seconds <= 0 || !runId) return;
    const endedAt = performance.now();
    const last = unsent[unsent.length - 1];
    if (last && last.id === runId) {
      last.seconds += seconds;
      last.endedAt = endedAt;
    } else unsent.push({ id: runId, seconds, endedAt });
  }

  /** Seconds played since the last call. */
  function takePlayed() {
    const now = performance.now();
    let ms = playedMs;
    if (runningSince !== null) {
      ms += now - runningSince;
      runningSince = now;
    }
    playedMs = 0;
    return ms / 1000;
  }

  function stopAndBank() {
    stopRun();
    bank();
  }

  function onPlay() {
    if (disconnected || (locked && !inGrace())) {
      pausePlayer(video);
      if (disconnected) showDisconnected();
      else showLock();
      return;
    }
    watchAds();
    startRun();
  }

  function onEnded() {
    if (document.querySelector(SEL.ads)) return;
    stopAndBank();
    const id = videoId();
    if (id && state && state.backlog.some((/** @type {any} */ v) => v.id === id)) send({ type: 'removeBacklog', id });
    if (locked) {
      setGrace('');
      showLock();
    }
  }

  /** Attaches listeners to the main video element, which YouTube may swap out. */
  function attach() {
    const el = /** @type {HTMLVideoElement | null} */ (document.querySelector(SEL.video));
    if (el === video) return;
    if (video) {
      stopAndBank();
      video.removeEventListener('playing', onPlay);
      for (const ev of ['pause', 'waiting', 'emptied']) video.removeEventListener(ev, stopAndBank);
      video.removeEventListener('ended', onEnded);
    }
    video = el;
    if (!video) return;
    if (playerBroken) {
      setPlayerBroken(false);
      refreshStatus();
    }
    video.addEventListener('playing', onPlay);
    for (const ev of ['pause', 'waiting', 'emptied']) video.addEventListener(ev, stopAndBank);
    video.addEventListener('ended', onEnded);
    // A video waiting on autoplay isn't paused but hasn't played anything. 'playing' fires once it really starts.
    if (!video.paused && video.readyState >= 3) onPlay();
  }

  /** @param {any} status @param {boolean} [deferLock] */
  function applyStatus(status, deferLock = false) {
    if (disconnected) return;
    const id = videoId();
    if (state && state.settings.graceMode === false) setGrace('');
    locked = !!status.locked;
    if (!locked) {
      setGrace('');
      hideLock();
      if (!theaterHandled.has(id)) defaultTheater();
      return;
    }
    if (inGrace()) {
      if (!theaterHandled.has(id)) defaultTheater();
      return;
    }
    // Storage may arrive before our tick response. Only that response can grant grace.
    if (deferLock && state.settings.graceMode) return;
    pausePlayer(video);
    if (clockActive() && id) showLock();
    // A locked video skips theater mode, so let fade.js show the page now.
    theaterDone();
  }

  /** Whether unsent time should go to the worker now rather than wait for SEND_EVERY seconds. */
  function sendDue() {
    const first = unsent[0];
    if (!first || first.seconds <= 0) return false;
    if (unsent.length > 1 || first.id !== videoId() || !video || video.paused) return true;
    if (first.seconds >= SEND_EVERY || !state) return true;
    const status = Drip.watchStatus(state, first.id);
    return !status.unlocked && status.secondsLeft - first.seconds <= 1;
  }

  async function tick() {
    if (disconnected) return;
    if (pendingTick) {
      if (performance.now() - pendingTick.startedAt >= 5000) {
        attach();
        pausePlayer(video);
      }
      return;
    }
    attach();
    watchAds();
    autoplayOff();
    // drip hides the miniplayer (early.css), so a video that drops into it gets paused rather than playing unseen.
    // The main player playing off /watch means the miniplayer, however YouTube marks it.
    if (location.pathname !== '/watch' && video) pausePlayer(video);
    if (clockActive()) bank();
    else takePlayed();
    if (state && Drip.dayKey(Date.now(), state.settings.resetHour) > state.day) await refreshStatus();
    if (sendDue()) await sendTick();
    if (!clockActive() || !videoId()) {
      hideLock();
      renderPill();
      return;
    }
    if (locked && !inGrace()) pausePlayer(video);
    renderPill();
  }

  /** Sends the oldest unsent time. If the worker doesn't confirm it, it stays unsent and goes again next tick. */
  async function sendTick() {
    const entry = unsent[0];
    const seconds = entry.seconds;
    const id = entry.id;
    const before = state && Drip.watchStatus(state, id);
    const playing = id === videoId() && !!video && !video.paused;
    const request = { id, paid: !!(before && !before.locked && !before.unlocked && before.secondsLeft > 0 && playing), startedAt: performance.now() };
    pendingTick = request;
    try {
      const res = await send({ type: 'tick', seconds, videoId: id, ago: Math.round(performance.now() - entry.endedAt) });
      if (res && res.ok && !disconnected) {
        entry.seconds -= seconds;
        if (entry.seconds <= 0.001 && unsent[0] === entry) unsent.shift();
        state = res.state;
        if (id === videoId()) {
          if (request.paid && res.locked && state.settings.graceMode && video && !video.paused) setGrace(id);
          applyStatus(res);
        } else applyStatus(Drip.watchStatus(state, videoId()));
      } else if (state) applyStatus(Drip.watchStatus(state, videoId()));
    } finally {
      pendingTick = null;
    }
  }

  async function refreshStatus() {
    if (disconnected) return;
    const id = videoId();
    const res = await send({ type: 'status', videoId: id });
    if (res && res.ok && !disconnected) {
      state = res.state;
      applyStatus(Drip.watchStatus(state, videoId()));
    }
    renderPill();
  }

  // The lock overlay.

  let reasonOpen = false;
  let lockMessage = '';
  let reasonText = '';
  let lockView = '';
  let lockVideoId = '';

  function hideLock() {
    if (disconnected) return;
    lockView = '';
    lockVideoId = '';
    reasonText = '';
    document.getElementById('drip-lock')?.remove();
    reasonOpen = false;
    lockMessage = '';
  }

  async function onAddTime() {
    const res = await send({ type: 'spendWatch' });
    if (disconnected) return;
    if (res && res.ok) {
      state = res.state;
      applyStatus(Drip.watchStatus(state, videoId()));
      video?.play();
    } else {
      lockMessage = 'No watch tokens left.';
      showLock();
    }
  }

  /** @param {string} reason */
  async function onNeedThis(reason) {
    const id = videoId();
    const title = document.querySelector(SEL.title)?.textContent?.trim() || '';
    if (!id) return;
    const res = await send({ type: 'needThis', videoId: id, title, reason });
    if (disconnected) return;
    if (res && res.ok) {
      state = res.state;
      applyStatus(Drip.watchStatus(state, videoId()));
      video?.play();
      return;
    }
    lockMessage = res && res.error === 'reason-required' ? 'Write a few words about why.' : "You've used all of today's unlocks.";
    showLock();
  }

  function showLock() {
    if (!state || disconnected || playerBroken) return;
    const s = state.settings;
    const needLeft = Math.max(0, s.needThisPerDay - state.unlocked.length);
    const canBuy = state.tokens.watch > 0;
    const existing = document.getElementById('drip-lock');
    const view = JSON.stringify([videoId(), state.tokens.watch, needLeft, s.minutesPerToken, s.resetHour, reasonOpen, lockMessage]);
    if (existing && lockView === view) return;
    lockView = view;
    lockVideoId = videoId();
    const active = document.activeElement;
    const oldReason = existing?.querySelector('textarea');
    const focused = !!oldReason && active === oldReason;
    const selectionStart = oldReason?.selectionStart ?? 0;
    const selectionEnd = oldReason?.selectionEnd ?? 0;
    /** @type {HTMLTextAreaElement} */
    const reason = /** @type {any} */ (h('textarea', { rows: 3, placeholder: 'Why do you need this one?', oninput: (/** @type {Event} */ e) => { reasonText = /** @type {HTMLTextAreaElement} */ (e.target).value; } }));
    reason.value = reasonText;
    const panel = h(
      'div',
      { class: 'drip-lock-panel' },
      h('div', { class: 'drip-lock-title' }, 'Out of watch time'),
      h('div', { class: 'drip-meta' }, `watch tokens ${state.tokens.watch} · unlocks left today ${needLeft}`),
      lockMessage && h('div', { class: 'drip-message' }, lockMessage),
      canBuy && h('button', { class: 'drip-btn drip-primary', onclick: onAddTime }, `Add ${s.minutesPerToken} min · 1 watch`),
      needLeft > 0 && !reasonOpen && h('button', { class: 'drip-btn', onclick: () => { reasonOpen = true; showLock(); /** @type {HTMLTextAreaElement | null} */ (document.querySelector('#drip-lock textarea'))?.focus(); } }, 'I need this one'),
      needLeft > 0 && reasonOpen && h('div', { class: 'drip-reason' }, reason,
        h('button', { class: 'drip-btn drip-primary', onclick: () => onNeedThis(reason.value) }, 'Unlock this video')),
      !canBuy && needLeft === 0 && h('div', { class: 'drip-meta' }, `Done for today. Tokens come back at ${hourLabel(s.resetHour)}.`),
      h('a', { class: 'drip-link', href: '/' }, 'Back to drip home'),
    );
    if (existing) existing.replaceChildren(panel);
    else document.body.append(h('div', { id: 'drip-lock' }, panel));
    if (focused && reasonOpen && needLeft > 0) {
      reason.focus();
      reason.setSelectionRange(selectionStart, selectionEnd);
    }
  }

  // The pill with minutes left and the Save button.

  async function onSave() {
    const id = videoId();
    const title = document.querySelector(SEL.title)?.textContent?.trim() || document.title.replace(/ - YouTube$/, '');
    const channel = document.querySelector(SEL.channel)?.textContent?.trim() || '';
    const secs = video && Number.isFinite(video.duration) ? Math.round(video.duration) : 0;
    const length = secs ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '';
    const res = await send({ type: 'addBacklog', video: { id, title, channel, length } });
    if (res && res.ok && !disconnected) {
      state = res.state;
      applyStatus(Drip.watchStatus(state, videoId()));
    }
    renderPill();
  }

  let pillView = '';

  function renderPill() {
    const id = videoId();
    let pill = document.getElementById('drip-pill');
    if (!id || !state) {
      pill?.remove();
      pillView = '';
      return;
    }
    const saved = state.backlog.some((/** @type {any} */ v) => v.id === id);
    const unlocked = state.unlocked.includes(id);
    // Count down between ticks, which only go out every few seconds.
    const pending = unsent.reduce((sum, entry) => sum + entry.seconds, 0) + (runningSince === null ? playedMs : playedMs + performance.now() - runningSince) / 1000;
    const time = unlocked ? 'unlocked' : `${Drip.formatMinutes(Math.max(0, state.watchSecondsLeft - pending))} left`;
    // Rebuild only when the text changes. A button replaced mid-click loses the click.
    const view = JSON.stringify([id, time, saved]);
    if (pill && pillView === view) return;
    pillView = view;
    const content = [
      h('span', {}, time),
      saved ? h('span', { class: 'drip-meta' }, 'In backlog') : h('button', { class: 'drip-btn', onclick: onSave }, 'Save to backlog'),
    ];
    if (!pill) {
      pill = h('div', { id: 'drip-pill' });
      document.body.append(pill);
    }
    pill.replaceChildren(...content);
  }

  onState((next) => {
    if (disconnected) return;
    const id = videoId();
    const wasFunded = !!state && !!id && !Drip.watchStatus(state, id).locked;
    state = next;
    const status = Drip.watchStatus(state, id);
    // Another tab may have used up the minutes. A video playing here when that happened gets grace too (Q3).
    if (wasFunded && status.locked && state.settings.graceMode && clockActive() && video && !video.paused) setGrace(id);
    applyStatus(status, !!(pendingTick && pendingTick.id === id && pendingTick.paid));
    renderPill();
  });
  // Time played up to here belongs to the video being left, not the next one.
  document.addEventListener('yt-navigate-start', bank);
  document.addEventListener('yt-navigate-finish', () => {
    if (disconnected) return;
    bank();
    if (runningSince !== null) runId = videoId();
    defaultTheater();
    const id = videoId();
    if (graceId !== id) setGrace('');
    if (id !== lockVideoId) hideLock();
    refreshStatus();
  });
  // No player means YouTube's markup changed. drip fails open (Q25): the lock would only cover a page it can't control.
  watchFor('player', SEL.video, (/** @type {string} */ path) => path === '/watch', () => setPlayerBroken(true));
  const tickTimer = setInterval(tick, 1000);
  const statusTimer = setInterval(() => { if (locked) refreshStatus(); }, 30000);
  defaultTheater();
  refreshStatus();
})();
