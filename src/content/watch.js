// @ts-check
// The watch clock. Measures how long the main player plays, reports it to the worker, and locks the player at zero.

(function () {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;
  /** @type {any} */
  const { send: sendMessage, h, onState, hourLabel } = /** @type {any} */ (globalThis).DripUI;

  // YouTube selectors. These break when YouTube changes its markup.
  const SEL = {
    video: '#movie_player video.html5-main-video',
    ads: '#movie_player.ad-showing, #movie_player.ad-interrupting',
    app: 'ytd-app',
    miniplayerAttr: 'miniplayer-is-active',
    title: 'ytd-watch-metadata h1, h1.ytd-watch-metadata',
    channel: 'ytd-watch-metadata ytd-channel-name a, #owner ytd-channel-name a',
  };

  /** @type {any} */
  let state = null;
  /** @type {HTMLVideoElement | null} */
  let video = null;
  let playedMs = 0;
  /** @type {number | null} */
  let runningSince = null;
  let locked = false;
  /** Video allowed to finish after time ran out, when grace mode is on. */
  let graceId = '';
  let lastVideoId = '';
  let disconnected = false;
  /** @type {{id: string, paid: boolean, startedAt: number} | null} */
  let pendingTick = null;

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

  function inGrace() {
    return !!graceId && graceId === videoId();
  }

  /** @param {object} msg */
  async function send(msg) {
    if (disconnected) return { ok: false, error: 'disconnected' };
    const res = await sendMessage(msg);
    if (res && res.error === 'disconnected') {
      disconnected = true;
      graceId = '';
      stopRun();
      video?.pause();
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
    if (runningSince === null) runningSince = performance.now();
  }

  function stopRun() {
    if (runningSince !== null) {
      playedMs += performance.now() - runningSince;
      runningSince = null;
    }
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

  function onPlay() {
    if (disconnected || (locked && !inGrace())) {
      video?.pause();
      if (disconnected) showDisconnected();
      else showLock();
      return;
    }
    startRun();
  }

  function onEnded() {
    if (document.querySelector(SEL.ads)) return;
    stopRun();
    const id = videoId();
    if (id && state && state.backlog.some((/** @type {any} */ v) => v.id === id)) send({ type: 'removeBacklog', id });
    if (locked) {
      graceId = '';
      showLock();
    }
  }

  /** Attaches listeners to the main video element, which YouTube may swap out. */
  function attach() {
    const el = /** @type {HTMLVideoElement | null} */ (document.querySelector(SEL.video));
    if (el === video) return;
    if (video) {
      stopRun();
      video.removeEventListener('playing', onPlay);
      for (const ev of ['pause', 'waiting', 'emptied']) video.removeEventListener(ev, stopRun);
      video.removeEventListener('ended', onEnded);
    }
    video = el;
    if (!video) return;
    video.addEventListener('playing', onPlay);
    for (const ev of ['pause', 'waiting', 'emptied']) video.addEventListener(ev, stopRun);
    video.addEventListener('ended', onEnded);
    // A video waiting on autoplay isn't paused but hasn't played anything. 'playing' fires once it really starts.
    if (!video.paused && video.readyState >= 3) onPlay();
  }

  /** @param {any} status @param {boolean} [deferLock] */
  function applyStatus(status, deferLock = false) {
    if (disconnected) return;
    const id = videoId();
    if (state && state.settings.graceMode === false) graceId = '';
    locked = !!status.locked;
    if (!locked) {
      graceId = '';
      hideLock();
      return;
    }
    if (inGrace()) return;
    // Storage may arrive before our tick response. Only that response can grant grace.
    if (deferLock && state.settings.graceMode) return;
    if (video && !video.paused) video.pause();
    if (clockActive() && id) showLock();
  }

  async function tick() {
    if (disconnected) return;
    if (pendingTick) {
      if (performance.now() - pendingTick.startedAt >= 5000) {
        attach();
        video?.pause();
      }
      return;
    }
    attach();
    const id = videoId();
    if (!clockActive() || !id) {
      takePlayed();
      hideLock();
      return;
    }
    const seconds = takePlayed();
    if (seconds > 0) {
      const before = state && Drip.watchStatus(state, id);
      const request = { id, paid: !!(before && !before.locked && !before.unlocked && before.secondsLeft > 0 && video && !video.paused), startedAt: performance.now() };
      pendingTick = request;
      try {
        const res = await send({ type: 'tick', seconds, videoId: id });
        if (res && res.ok && !disconnected) {
          state = res.state;
          if (id === videoId()) {
            if (request.paid && res.locked && state.settings.graceMode && video && !video.paused) graceId = id;
            applyStatus(res);
          } else applyStatus(Drip.watchStatus(state, videoId()));
        } else if (state) applyStatus(Drip.watchStatus(state, videoId()));
      } finally {
        pendingTick = null;
      }
    }
    if (locked && video && !video.paused && !inGrace()) video.pause();
    renderPill();
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

  function hideLock() {
    if (disconnected) return;
    lockView = '';
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
    if (!state || disconnected) return;
    const s = state.settings;
    const needLeft = Math.max(0, s.needThisPerDay - state.unlocked.length);
    const canBuy = state.tokens.watch > 0;
    const existing = document.getElementById('drip-lock');
    const view = JSON.stringify([videoId(), state.tokens.watch, needLeft, s.minutesPerToken, s.resetHour, reasonOpen, lockMessage]);
    if (existing && lockView === view) return;
    lockView = view;
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
      needLeft > 0 && !reasonOpen && h('button', { class: 'drip-btn', onclick: () => { reasonOpen = true; showLock(); document.querySelector('#drip-lock textarea')?.focus(); } }, 'I need this one'),
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

  function renderPill() {
    const id = videoId();
    let pill = document.getElementById('drip-pill');
    if (!id || !state) {
      pill?.remove();
      return;
    }
    const saved = state.backlog.some((/** @type {any} */ v) => v.id === id);
    const unlocked = state.unlocked.includes(id);
    const time = unlocked ? 'unlocked' : `${Drip.formatMinutes(state.watchSecondsLeft)} left`;
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
    state = next;
    const id = videoId();
    applyStatus(Drip.watchStatus(state, id), !!(pendingTick && pendingTick.id === id && pendingTick.paid));
    renderPill();
  });
  document.addEventListener('yt-navigate-finish', () => {
    if (disconnected) return;
    const id = videoId();
    if (graceId !== id) graceId = '';
    hideLock();
    refreshStatus();
  });
  const tickTimer = setInterval(tick, 1000);
  const statusTimer = setInterval(() => { if (locked) refreshStatus(); }, 30000);
  refreshStatus();
})();
