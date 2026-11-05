// @ts-check
// The watch clock. Measures how long the main player plays, reports it to the worker, and locks the player at zero.

(function () {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;
  /** @type {any} */
  const { send: sendMessage, h, onState, hourLabel, dayTimeLabel, icon, price, KEPT_KEY, pausePlayer, watchFor } = /** @type {any} */ (globalThis).DripUI;
  /** @type {any} */
  const DripGlass = /** @type {any} */ (globalThis).DripGlass;
  /** @type {any} */
  const DripStash = /** @type {any} */ (globalThis).DripStash;
  /** @type {any} */
  const DripSwap = /** @type {any} */ (globalThis).DripSwap;
  /** @type {any} */
  const DripPour = /** @type {any} */ (globalThis).DripPour;

  // YouTube selectors. These break when YouTube changes its markup.
  const SEL = {
    video: '#movie_player video.html5-main-video',
    watchPage: 'ytd-watch-flexy',
    theaterAttr: 'theater',
    theaterButton: '.ytp-size-button',
    autoplayToggle: '.ytp-autonav-toggle-button[aria-checked="true"]',
    ads: '#movie_player.ad-showing, #movie_player.ad-interrupting',
    player: '#movie_player',
    // YouTube hides its controls with this class a few seconds into playback.
    playerIdle: '#movie_player.ytp-autohide',
    app: 'ytd-app',
    miniplayerAttr: 'miniplayer-is-active',
    title: 'ytd-watch-metadata h1, h1.ytd-watch-metadata',
    // The owner link's href is the channel's /@handle (checked on air, 2026-11-03). On a move between videos it and the
    // flexy's video-id change in the same frame, so the link is this video's once video-id matches the URL.
    channel: 'ytd-watch-metadata ytd-channel-name a, #owner ytd-channel-name a',
    videoIdAttr: 'video-id',
    // The YouTube logo. "Done for now" clicks it, so YouTube goes home in the page instead of loading a new one.
    homeLink: 'ytd-topbar-logo-renderer a#logo',
  };

  const GRACE_ATTR = 'data-drip-grace';
  /** How long the lock waits for the channel to be read, so an allowed channel's video doesn't flash it. */
  const CHANNEL_WAIT_MS = 2000;

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
   * The key stays the same on a resend, so the worker can tell time it already charged from new time.
   * @type {{id: string, seconds: number, endedAt: number, key: string}[]}
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

  /**
   * Whether a video that runs out of minutes now may finish: grace mode, but never in Dry hours, which stop every paid
   * video when they start (Jesse, 2026-11-04).
   * @param {string} _id
   */
  function graceAllowed(_id) {
    return !!state && state.settings.graceMode === true && !Drip.dryUntil(state, Date.now());
  }

  // Channel lists (CHANNEL-LISTS-PLAN.md, calls 7 and 8). The page tells the worker which channel this video is from,
  // when a list has that channel, and an allowed channel's video is free.

  /**
   * The video whose channel was read and, if a list had it, sent, with the day and allow list it was checked against.
   * A reset clears allowedToday and a new allow can free a video already open, so either one checks again (Codex).
   */
  let channelDone = '';
  /** @param {string} id */
  function channelCheckKey(id) {
    const allow = state && state.channels ? state.channels.allow.map((/** @type {any} */ c) => c.ids) : [];
    return JSON.stringify([id, state ? state.day : '', allow]);
  }
  /** @type {{id: string, until: number} | null} */
  let channelWait = null;

  /** This video's channel from the owner row, or null while the row is still the last video's. @param {string} id */
  function pageChannel(id) {
    const flexy = document.querySelector(SEL.watchPage);
    if (!id || !flexy || flexy.getAttribute(SEL.videoIdAttr) !== id) return null;
    const link = document.querySelector(SEL.channel);
    const channelId = Drip.channelId(link?.getAttribute('href') || '');
    return channelId ? { ids: [channelId], name: link?.textContent?.trim() || '' } : null;
  }

  /** @param {any} channel */
  function onAList(channel) {
    const lists = state && state.channels ? [...state.channels.allow, ...state.channels.block] : [];
    return lists.some((/** @type {any} */ entry) => Drip.sameChannel(entry, channel));
  }

  /** Whether a locked video should wait for its channel before the lock shows. @param {string} id */
  function waitingForChannel(id) {
    if (!id || channelDone === channelCheckKey(id) || !state || !state.channels || !state.channels.allow.length) return false;
    if (!channelWait || channelWait.id !== id) channelWait = { id, until: performance.now() + CHANNEL_WAIT_MS };
    return performance.now() < channelWait.until;
  }

  async function checkChannel() {
    const id = location.pathname === '/watch' ? videoId() : '';
    if (!id || channelDone === channelCheckKey(id) || !state || !state.channels) return;
    const channel = pageChannel(id);
    if (!channel) {
      // Not readable in time: the lock rises as it would without lists.
      if (channelWait && channelWait.id === id && performance.now() >= channelWait.until) {
        channelDone = channelCheckKey(id);
        applyStatus(Drip.watchStatus(state, id, Date.now()));
      }
      return;
    }
    channelDone = channelCheckKey(id);
    if (!onAList(channel)) {
      if (locked) applyStatus(Drip.watchStatus(state, id, Date.now()));
      return;
    }
    const res = await send({ type: 'allowedVideo', videoId: id, channel });
    if (res && res.ok && !disconnected) {
      state = res.state;
      if (id === videoId()) applyStatus(Drip.watchStatus(state, id, Date.now()));
      renderPill();
    }
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
    placeLockPanel(h('div', { class: 'drip-lock-panel' }, 'drip was updated. Refresh this page.'));
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
  /** Set at an ad change, so the time after it goes in its own entry. The worker reads an entry as one unbroken stretch
   * ending at endedAt, and merging across an ad would hide the gap from its check against other tabs. */
  let splitNext = false;
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
    pillLook();
    const now = !!document.querySelector(SEL.ads);
    if (now === adShowing) return;
    if (clockActive()) bank();
    else takePlayed();
    adShowing = now;
    splitNext = true;
  }

  /** Moves measured playback into unsent, under the video it played on. Time played during an ad is dropped. */
  function bank() {
    const seconds = takePlayed();
    if (adShowing) return;
    if (seconds <= 0 || !runId) return;
    const endedAt = performance.now();
    const last = unsent[unsent.length - 1];
    if (last && last.id === runId && !splitNext) {
      last.seconds += seconds;
      last.endedAt = endedAt;
    } else unsent.push({ id: runId, seconds, endedAt, key: crypto.randomUUID() });
    splitNext = false;
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
      for (const ev of ['play', 'pause']) video.removeEventListener(ev, renderPill);
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
    for (const ev of ['play', 'pause']) video.addEventListener(ev, renderPill);
    // A video waiting on autoplay isn't paused but hasn't played anything. 'playing' fires once it really starts.
    if (!video.paused && video.readyState >= 3) onPlay();
  }

  /** @param {any} status @param {boolean} [deferLock] */
  function applyStatus(status, deferLock = false) {
    if (disconnected) return;
    const id = videoId();
    if (state && !graceAllowed(id)) setGrace('');
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
    if (deferLock && graceAllowed(id)) return;
    pausePlayer(video);
    // The channel may be on the allow list. Held, not locked, until checkChannel knows.
    if (waitingForChannel(id)) return;
    // Not over the miniplayer, which drip hides: the lock would cover whatever page YouTube moved to.
    if (location.pathname === '/watch' && id) showLock();
    // A locked video skips theater mode, so let fade.js show the page now.
    theaterDone();
  }

  /** Whether unsent time should go to the worker now rather than wait for SEND_EVERY seconds. */
  function sendDue() {
    const first = unsent[0];
    if (!first || first.seconds <= 0) return false;
    if (unsent.length > 1 || first.id !== videoId() || !video || video.paused) return true;
    if (first.seconds >= SEND_EVERY || !state) return true;
    // With the clock off nothing runs out, so time waits for the usual send (Q29).
    if (state.settings.clock === false) return false;
    const status = Drip.watchStatus(state, first.id, Date.now());
    return !status.unlocked && !status.allowed && status.secondsLeft - first.seconds <= 1;
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
    await checkChannel();
    if (state && Drip.dayKey(Date.now(), state.settings.resetHour) > state.day) await refreshStatus();
    if (sendDue()) await sendTick();
    else toolbarHeartbeat();
    if (!clockActive() || !videoId()) {
      hideLock();
      renderPill();
      return;
    }
    // Dry hours start on the hour, between ticks to the worker: the page stops a paid video itself, within a second.
    if (state && Drip.dryUntil(state, Date.now())) {
      const status = Drip.watchStatus(state, videoId(), Date.now());
      if (status.locked && (!locked || inGrace())) applyStatus(status);
    }
    if (locked && !inGrace()) pausePlayer(video);
    renderPill();
  }

  /**
   * Where the player is, for a stashed video's progress bar (Q28). Only for the video on the page, and not during an
   * ad, when the player's time is the ad's.
   * @param {string} id
   */
  function position(id) {
    if (id !== videoId() || !video || adShowing || document.querySelector(SEL.ads)) return {};
    if (!Number.isFinite(video.currentTime) || !(video.currentTime > 0)) return {};
    return { position: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : undefined };
  }

  // What the toolbar last heard from this tab, and when. Ticks only go out with time to charge, so during an ad, or
  // on a pause with nothing banked, a zero-second tick tells it instead (Codex, 2026-10-14).
  let toolbarSaid = false;
  let toolbarSaidAt = -Infinity;

  /** Keeps the toolbar's 12 second playing window fresh, and tells it at once when playback starts or stops. */
  function toolbarHeartbeat() {
    const id = videoId();
    const playing = clockActive() && !!id && !!video && !video.paused;
    if (playing === toolbarSaid && (!playing || performance.now() - toolbarSaidAt < SEND_EVERY * 1000)) return;
    toolbarSaid = playing;
    toolbarSaidAt = performance.now();
    // No key and no seconds, so the worker charges nothing and saves nothing.
    send({ type: 'tick', seconds: 0, videoId: id, ago: 0, playing });
  }

  /** Sends the oldest unsent time. If the worker doesn't confirm it, it stays unsent and goes again next tick. */
  async function sendTick() {
    const entry = unsent[0];
    const seconds = entry.seconds;
    const id = entry.id;
    const before = state && Drip.watchStatus(state, id, Date.now());
    const playing = id === videoId() && !!video && !video.paused;
    toolbarSaid = playing;
    toolbarSaidAt = performance.now();
    const request = { id, paid: !!(before && !before.locked && !before.unlocked && !before.allowed && before.secondsLeft > 0 && playing), startedAt: performance.now() };
    pendingTick = request;
    try {
      const res = await send({ type: 'tick', seconds, videoId: id, key: entry.key, ago: Math.round(performance.now() - entry.endedAt), playing, ...position(id) });
      if (res && res.ok && !disconnected) {
        entry.seconds -= seconds;
        // Time that played while the tick was out is new, so it goes under a new key.
        entry.key = crypto.randomUUID();
        if (entry.seconds <= 0.001 && unsent[0] === entry) unsent.shift();
        state = res.state;
        if (id === videoId()) {
          // From the reply's state at the time it arrives, not the worker's lock: a tick answered just before Dry hours
          // can land after the page locked for them, and its "not locked" would drop the lock (Codex, 2026-11-04).
          const status = Drip.watchStatus(state, id, Date.now());
          if (request.paid && status.locked && graceAllowed(id) && video && !video.paused) setGrace(id);
          applyStatus(status);
        } else applyStatus(Drip.watchStatus(state, videoId(), Date.now()));
      } else if (state) applyStatus(Drip.watchStatus(state, videoId(), Date.now()));
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
      applyStatus(Drip.watchStatus(state, videoId(), Date.now()));
    }
    renderPill();
  }

  // The lock overlay.

  let reasonOpen = false;
  let lockMessage = '';
  let reasonText = '';
  let lockView = '';
  let lockVideoId = '';

  /** The lock overlay showing now, or null. One still draining away, or leaving for the home page, doesn't count. */
  function liveLock() {
    const lock = document.getElementById('drip-lock');
    return lock && !lock.classList.contains('is-draining') && !lock.classList.contains('is-leaving') ? lock : null;
  }

  /** Whether "Done for now" is taking the lock to the home page. Nothing else touches the lock until it's gone. */
  function leavingLock() {
    return !!document.querySelector('#drip-lock.is-leaving');
  }

  /**
   * Puts a panel in the lock overlay. A new overlay plays the water rising and then the panel surfacing. A panel swapped
   * into an overlay that's already up just replaces the old one, so the water doesn't rise again.
   * @param {HTMLElement} panel
   */
  function placeLockPanel(panel) {
    if (falling) {
      falling.panel = panel;
      return;
    }
    const lock = liveLock();
    if (lock) {
      const old = lock.querySelector('.drip-lock-panel');
      if (old) old.replaceWith(panel);
      else lock.append(panel);
      return;
    }
    // A lock still draining away goes at once, and a new one rises.
    document.getElementById('drip-lock')?.remove();
    panel.classList.add('is-new');
    // Only running out drops the last of the water. The "drip was updated" notice goes up at once.
    const glass = locked && !disconnected ? lastDropGlass() : null;
    if (!glass) {
      document.body.append(h('div', { id: 'drip-lock', class: 'drip-ui' }, sea(), panel));
      return;
    }
    // The pill's last water falls as a drop, and the lock's water rises from where it lands (pour.js).
    const fall = { panel };
    falling = fall;
    // A drop that can't fall (drip was updated under the page) still lets the lock come up.
    DripPour.lastDrop(glass, PILL_GLASS_PX, window.innerHeight).catch(() => null).then((/** @type {number | null} */ x) => {
      if (falling !== fall) return;
      falling = null;
      if (!locked || location.pathname !== '/watch') return;
      const lock = h('div', { id: 'drip-lock', class: 'drip-ui' }, sea(), fall.panel);
      document.body.append(lock);
      if (x !== null) DripPour.riseFrom(lock, x);
    });
  }

  /**
   * While the pill's last drop falls, the lock waits for it to land. This holds the newest panel to show then.
   * @type {{panel: HTMLElement} | null}
   */
  let falling = null;

  /** When the pill's glass last had water in it, so running out can tell itself from arriving with none. */
  let pillWetAt = -Infinity;

  /** The pill's glass, when the minutes just ran out with it in view, so its last drop can fall. Otherwise null. */
  function lastDropGlass() {
    if (!pillGlass?.isConnected || reducedMotion() || document.hidden || document.fullscreenElement) return null;
    if (performance.now() - pillWetAt > 3000) return null;
    if (document.getElementById('drip-pill')?.classList.contains('is-idle')) return null;
    const r = pillGlass.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight ? pillGlass : null;
  }

  const BUBBLES = 14;

  /**
   * Life under the water behind the lock panel: bubbles drifting up at different sizes and speeds, and two small fish
   * that cross now and then. Kept faint, so it reads as atmosphere, not something to watch.
   */
  function sea() {
    /** @param {number} min @param {number} max */
    const between = (min, max) => min + Math.random() * (max - min);
    const bubbles = Array.from({ length: BUBBLES }, () => {
      const bubble = h('span', { class: 'drip-bubble' }, h('span', {}));
      bubble.style.setProperty('--x', `${between(3, 97).toFixed(1)}%`);
      bubble.style.setProperty('--size', `${Math.round(between(4, 13))}px`);
      bubble.style.setProperty('--rise', `${between(10, 19).toFixed(1)}s`);
      // The first ones leave soon after the water is up, the rest spread out.
      bubble.style.setProperty('--delay', `${between(0.9, 12).toFixed(1)}s`);
      bubble.style.setProperty('--sway', `${between(2.4, 4.2).toFixed(1)}s`);
      return bubble;
    });
    const fish = ['drip-fish-a', 'drip-fish-b'].map((name) => h('span', { class: `drip-fish ${name}` }, h('span', {})));
    return h('div', { class: 'drip-sea', 'aria-hidden': 'true' }, ...bubbles, ...fish);
  }

  /** Set just before buying minutes or an unlock lifts the lock, so the water drains away instead of vanishing. */
  let drainNext = false;
  const DRAIN_MS = 600;

  function hideLock() {
    if (disconnected) return;
    // +15m's drop is still falling into the water. The lock drains once it lands.
    if (landing && drainNext) {
      landing.then(hideLock);
      return;
    }
    falling = null;
    lockView = '';
    lockVideoId = '';
    reasonText = '';
    const lock = liveLock();
    if (lock && drainNext) {
      lock.classList.add('is-draining');
      setTimeout(() => lock.remove(), DRAIN_MS);
    } else lock?.remove();
    drainNext = false;
    reasonOpen = false;
    lockMessage = '';
  }

  /**
   * While +15m's drop falls from the lock's button into the water. Resolves once it lands.
   * @type {Promise<void> | null}
   */
  let landing = null;
  /** +15m's purchase is on its way to the worker. Without the drop's fall, this holds a held Enter's repeats. */
  let buying = false;

  /** @param {Event} e */
  async function onAddTime(e) {
    // A double-click buys one drop, as home's +15m does. Without the drop's fall, nothing else holds the second click.
    if (landing || buying || /** @type {MouseEvent} */ (e).detail > 1) return;
    // The worker's storage change can lift the lock before this reply arrives, so the drain is asked for up front.
    drainNext = true;
    const button = /** @type {HTMLElement} */ (e.currentTarget);
    const panel = liveLock()?.querySelector('.drip-lock-panel');
    // The button's drop falls past the panel into the water, then the water drains and the pill's glass bobs up.
    const pours = !!panel && !reducedMotion() && !document.hidden;
    if (pours) {
      landing = DripPour.fallIn(button, Math.min(panel.getBoundingClientRect().bottom + 36, window.innerHeight - 24))
        .catch(() => {})
        .then(() => { landing = null; });
    }
    buying = true;
    let res;
    try {
      res = await send({ type: 'spendWatch' });
    } finally {
      buying = false;
    }
    if (landing) await landing;
    if (disconnected) return;
    if (res && res.ok) {
      state = res.state;
      applyStatus(Drip.watchStatus(state, videoId(), Date.now()));
      drainNext = false;
      // The draining water clears the pill near the top of the window about this long in.
      if (pours && pillGlass?.isConnected) DripPour.refill(pillGlass, PILL_GLASS_PX, DripGlass.fraction(state), 180);
      video?.play();
    } else {
      drainNext = false;
      // Dry hours, or the 5 minutes before them, began between the draw and the click: the lock redraws without +15m.
      if (res && (res.error === 'dry-hours' || res.error === 'dry-soon')) {
        if (res.state) state = res.state;
        lockMessage = '';
      } else lockMessage = 'No drops left.';
      showLock();
    }
  }

  const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  /** @param {number} ms */
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Hovering or keyboard focus on "Done for now" sends a ring out around it this often. */
  const RING_EVERY_MS = 1400;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let ringTimer;
  /** @type {HTMLElement | null} */
  let ringButton = null;

  /** @param {HTMLElement} button */
  function ring(button) {
    const panel = button.closest('.drip-lock-panel');
    // A panel rebuilt or a lock lifted under the pointer sends no pointerleave, so the timer stops itself here.
    if (!panel || !button.isConnected || button.classList.contains('is-leaving')) {
      stopRings();
      return;
    }
    // In the panel rather than the button, so it can grow past the button's edge.
    const p = panel.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    const r = h('span', { class: 'drip-done-ring', 'aria-hidden': 'true' });
    r.style.cssText = `left:${b.left - p.left}px;top:${b.top - p.top}px;width:${b.width}px;height:${b.height}px`;
    panel.append(r);
    r.addEventListener('animationend', () => r.remove());
  }

  /** @param {Event} e */
  function startRings(e) {
    const button = /** @type {HTMLElement} */ (e.currentTarget);
    if ((ringTimer !== undefined && ringButton === button) || reducedMotion() || (e.type === 'focus' && !button.matches(':focus-visible'))) return;
    stopRings();
    ringButton = button;
    ring(button);
    ringTimer = setInterval(() => ring(button), RING_EVERY_MS);
  }

  function stopRings() {
    clearInterval(ringTimer);
    ringTimer = undefined;
    ringButton = null;
  }

  /** The click's rings play this long before the water starts to fall. */
  const LEAVE_MS = 700;
  /** While YouTube is still fetching its home page, another ring goes out this often. On air that fetch took 1.2s. */
  const WAIT_RING_MS = 800;
  /** The water falling away, top first (drip.css #drip-lock.is-surfacing). */
  const SURFACE_MS = 1000;
  /** Past this with no navigation started, YouTube ignored the logo click, so drip loads home instead. */
  const NAV_WAIT_MS = 1500;
  /** Set while "Done for now" waits on the home page. Back to a watch page in that time cancels it (yt-navigate-finish). */
  let cancelLeave = false;
  /** Past this, the water falls even if drip's home page hasn't shown up yet. */
  const HOME_WAIT_MS = 4000;

  /** drip's home page is drawn and fade.js has started fading the page in. */
  function homeShown() {
    return location.pathname === '/' && document.documentElement.hasAttribute('data-drip-shown')
      && !!document.getElementById('drip-home')?.getClientRects().length;
  }

  /**
   * A splash and two rings from where the button was pressed, out through the panel. Returns a function that sends
   * one more ring from the same point.
   * @param {HTMLElement} panel
   * @param {HTMLElement} button
   * @param {MouseEvent} e
   */
  function leaveRings(panel, button, e) {
    const p = panel.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    // From the pointer, or from the middle for a keyboard press, which reports 0, 0.
    const x = (e.clientX || box.left + box.width / 2) - p.left;
    const y = (e.clientY || box.top + box.height / 2) - p.top;
    const far = Math.hypot(Math.max(x, p.width - x), Math.max(y, p.height - y)) * 2;
    const burst = 'cubic-bezier(0.2, 0.6, 0.3, 1)';
    /** @param {string} cls @param {number} size @param {number} ms @param {number} delay @param {string} easing @param {number} opacity */
    const grow = (cls, size, ms, delay, easing = burst, opacity = 1) => {
      const r = h('span', { class: cls, 'aria-hidden': 'true' });
      r.style.cssText = `left:${x}px;top:${y}px`;
      panel.append(r);
      r.animate([{ width: '0px', height: '0px', opacity }, { width: `${size}px`, height: `${size}px`, opacity: 0 }],
        { duration: ms, delay, easing, fill: 'both' });
    };
    grow('drip-leave-ring is-splash', 110, 420, 0);
    grow('drip-leave-ring', far, 900, 0);
    grow('drip-leave-ring', far, 900, 140);
    // The rings that fill a wait are slower and fainter than the click's, so the panel calms down instead of pulsing.
    return () => grow('drip-leave-ring', far, 1800, 0, 'cubic-bezier(0.3, 0.3, 0.5, 1)', 0.6);
  }

  /**
   * Rings run out through the panel while YouTube goes home underneath, the way its logo does, so the page and the
   * lock stay up. Once drip's home page is there, the water falls away the way it rose. Drops left unspent ride along
   * in sessionStorage, so the home page can say "Kept 3 drops." once (home.js).
   * @param {MouseEvent} e
   */
  async function onDone(e) {
    const button = /** @type {HTMLElement} */ (e.currentTarget);
    const lock = liveLock();
    const panel = /** @type {HTMLElement | null} */ (button.closest('.drip-lock-panel'));
    if (!lock || !panel || button.classList.contains('is-leaving')) return;
    button.classList.add('is-leaving');
    lock.classList.add('is-leaving');
    stopRings();
    const kept = state ? state.tokens.watch : 0;
    try {
      // With the Dry hours whose drops back the count holds, if any, so home lands those second without counting them
      // twice. A lock that went up before the drops came back saved a count without them (Codex, 2026-11-05).
      if (kept > 0) sessionStorage.setItem(KEPT_KEY, `${kept}:${state?.dryBack?.until || 0}`);
    } catch {
      // Storage blocked: the home page just won't mention the drops.
    }
    const reduced = reducedMotion();
    const moreRing = reduced ? null : leaveRings(panel, button, e);
    const started = performance.now();
    let lastRing = 140;
    let navStarted = false;
    document.addEventListener('yt-navigate-start', () => { navStarted = true; }, { once: true });
    cancelLeave = false;
    // early.css fades the page behind the water out instead of hiding it at once when YouTube starts navigating.
    document.documentElement.setAttribute('data-drip-leaving', '');
    const logo = /** @type {HTMLElement | null} */ (document.querySelector(SEL.homeLink));
    logo?.click();
    while (true) {
      await sleep(50);
      if (cancelLeave || !lock.isConnected) {
        document.documentElement.removeAttribute('data-drip-leaving');
        return;
      }
      const waited = performance.now() - started;
      if (!reduced && waited < LEAVE_MS) continue;
      if (homeShown()) break;
      // No logo, or YouTube ignored the click: the old way, a full page load. The lock stays up until the page goes.
      if (!logo || (!navStarted && waited > NAV_WAIT_MS)) {
        location.assign('/');
        return;
      }
      if (waited > HOME_WAIT_MS) break;
      if (moreRing && waited - lastRing >= WAIT_RING_MS) {
        moreRing();
        lastRing = waited;
      }
    }
    document.documentElement.removeAttribute('data-drip-leaving');
    if (reduced) {
      lock.remove();
      return;
    }
    lock.classList.add('is-surfacing');
    // The home page's kept drops land as the water falls (home.js).
    document.dispatchEvent(new CustomEvent('drip-lock-falling'));
    setTimeout(() => lock.remove(), SURFACE_MS);
  }

  /** @param {string} reason */
  async function onNeedThis(reason) {
    const id = videoId();
    const title = document.querySelector(SEL.title)?.textContent?.trim() || '';
    if (!id) return;
    drainNext = true;
    const res = await send({ type: 'needThis', videoId: id, title, reason });
    if (disconnected) return;
    if (res && res.ok) {
      state = res.state;
      applyStatus(Drip.watchStatus(state, videoId(), Date.now()));
      drainNext = false;
      video?.play();
      return;
    }
    drainNext = false;
    // A refusal's state shows the count now, which another tab may have used up.
    if (res && res.state) state = res.state;
    lockMessage = res && res.error === 'reason-required' ? 'Write a few words about why.' : "You've used this week's unlocks.";
    showLock();
  }

  /** "1h 15m watched today · 50m last Tuesday", or only the first half when last week has no log. */
  function watchedLine() {
    const { today, lastWeek, weekday } = Drip.watchedSummary(state);
    const first = `${Drip.formatMinutes(today)} watched today`;
    return lastWeek === null ? first : `${first} · ${Drip.formatMinutes(lastWeek)} last ${weekday}`;
  }

  function openReason() {
    reasonOpen = true;
    showLock();
    /** @type {HTMLTextAreaElement | null} */ (document.querySelector('#drip-lock textarea'))?.focus();
  }

  function closeReason() {
    reasonOpen = false;
    lockMessage = '';
    showLock();
  }

  // DESIGN.md "Lock screen". The satisfying moment is leaving: "Done for now" is the one primary button and the only
  // thing that moves. Buying more stays neutral gray, and "I need this one" is a quiet link with a typed reason.
  function showLock() {
    if (!state || disconnected || playerBroken || leavingLock()) return;
    const s = state.settings;
    const now = Date.now();
    const needLeft = Drip.needThisLeft(state, now);
    // When the next unlock comes back, once the week's are used (Q20).
    const needBack = Drip.needThisBack(state, now);
    // The label, not the time, goes in the view key, so "tomorrow" turns into "today" at midnight (Codex, 2026-11-04).
    const backLabel = needBack > 0 ? dayTimeLabel(needBack, now) : '';
    // In Dry hours no drop can be bought, and the line under the title says when they end (Q32).
    const dryEnd = Drip.dryUntil(state, now);
    // Drops stop selling 5 minutes before, since the minutes would stop at the start.
    const drySoon = Drip.drySoon(state, now);
    const hasDrops = state.tokens.watch > 0;
    const canBuy = hasDrops && !dryEnd && !drySoon;
    const line = dryEnd ? `Dry until ${hourLabel(new Date(dryEnd).getHours())}.`
      : drySoon ? `Dry hours start at ${hourLabel(new Date(drySoon).getHours())}.` : watchedLine();
    const existing = liveLock();
    const view = JSON.stringify([videoId(), canBuy, hasDrops, needLeft, backLabel, s.minutesPerToken, s.resetHour, reasonOpen, lockMessage, line]);
    if (existing && lockView === view) return;
    lockView = view;
    lockVideoId = videoId();
    const active = document.activeElement;
    const oldReason = existing?.querySelector('textarea');
    const focused = !!oldReason && active === oldReason;
    const selectionStart = oldReason?.selectionStart ?? 0;
    const selectionEnd = oldReason?.selectionEnd ?? 0;
    /** @type {HTMLTextAreaElement} */
    const reason = /** @type {any} */ (h('textarea', {
      rows: 3, placeholder: 'Why do you need this one?', 'aria-label': 'Why do you need this one?',
      oninput: (/** @type {Event} */ e) => { reasonText = /** @type {HTMLTextAreaElement} */ (e.target).value; },
    }));
    reason.value = reasonText;
    const unlocks = needLeft > 0 && !reasonOpen
      ? h('button', { class: 'drip-lock-link', 'data-k': 'need', onclick: openReason }, `I need this one · ${needLeft} left this week`)
      : needLeft > 0
        ? h('div', { class: 'drip-reason' }, reason,
          h('div', { class: 'drip-reason-row' },
            h('button', { class: 'drip-lock-link', 'data-k': 'cancel', onclick: closeReason }, 'Cancel'),
            h('button', { class: 'drip-b drip-b-gray', 'data-k': 'unlock', onclick: () => onNeedThis(reason.value) }, icon('unlock'), h('span', {}, 'Unlock this video'))))
        : h('div', {},
          h('div', { class: 'drip-lock-note' }, `The glass refills at ${hourLabel(s.resetHour)}.`),
          backLabel && h('div', { class: 'drip-lock-note' }, `Next unlock back ${backLabel}.`));
    const panel = h(
      'div',
      { class: 'drip-lock-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'drip-lock-title' },
      h('h2', { class: 'drip-lock-title', id: 'drip-lock-title' }, hasDrops ? 'Time for a breather.' : "You've had your fill."),
      h('div', { class: 'drip-lock-sub' }, line),
      h('div', { class: `drip-lock-actions${canBuy ? '' : ' is-alone'}` },
        canBuy && h('button', { class: 'drip-b drip-b-gray drip-lock-add', 'data-k': 'add', onclick: onAddTime, title: `Add ${s.minutesPerToken} minutes for 1 drop` },
          icon('clock'), h('span', {}, `+${Drip.formatMinutes(s.minutesPerToken * 60)}`), price('drop')),
        h('button', {
          class: 'drip-b drip-b-primary drip-done', 'data-k': 'done', onclick: onDone,
          onpointerenter: startRings, onpointerleave: stopRings, onfocus: startRings, onblur: stopRings,
        }, h('span', {}, 'Done for now'))),
      lockMessage && h('div', { class: 'drip-lock-note', role: 'status' }, lockMessage),
      unlocks,
    );
    placeLockPanel(panel);
    if (focused && reasonOpen && needLeft > 0) {
      reason.focus();
      reason.setSelectionRange(selectionStart, selectionEnd);
    }
  }

  // The pill with minutes left and the Save button.

  /** Stashes the video, or takes it back out of the stash when it's already there, like Stash on the home page's card. */
  /** @param {MouseEvent} [e] */
  async function onSave(e) {
    const id = videoId();
    if (!id || !state) return;
    if (swapOpen) return closeSwap();
    // detail is 0 for a click from the keyboard (Enter or Space).
    const keyboard = !!e && e.detail === 0;
    let res;
    if (state.backlog.some((/** @type {any} */ v) => v.id === id)) res = await send({ type: 'removeBacklog', id });
    else res = await send({ type: 'addBacklog', video: thisVideo(id) });
    if (res && !res.ok && res.error === 'stash-full' && !disconnected) {
      state = res.state;
      openSwap(keyboard);
      return;
    }
    took(res);
  }

  /** Takes the worker's answer to a stash change and redraws. @param {any} res */
  function took(res) {
    if (res && res.ok && !disconnected) {
      state = res.state;
      applyStatus(Drip.watchStatus(state, videoId(), Date.now()));
    }
    renderPill();
  }

  /** This page's video as the stash keeps it, with how far in it is. @param {string} id */
  function thisVideo(id) {
    const title = document.querySelector(SEL.title)?.textContent?.trim() || document.title.replace(/ - YouTube$/, '');
    const channel = document.querySelector(SEL.channel)?.textContent?.trim() || '';
    const read = pageChannel(id);
    const secs = video && Number.isFinite(video.duration) ? Math.round(video.duration) : 0;
    const length = secs ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '';
    const at = position(id);
    return { id, title, channel, length, resumeSec: at.position, durationSec: at.duration, channelIds: read ? read.ids : undefined };
  }

  // A full stash (Q28): the list under the pill that asks which video to swap out, and the note after a swap. They sit
  // in their own layer in the player, since the pill clips what overflows it.
  /** @type {HTMLElement | null} */
  let swapLayer = null;
  /** The video whose list is up, or ''. */
  let swapOpen = '';
  /** @type {{dropped: any, index: number, newId: string, timer: number} | null} */
  let swapped = null;

  function drawSwap() {
    const id = videoId();
    if (swapped && swapped.newId !== id) {
      clearTimeout(swapped.timer);
      swapped = null;
    }
    if (swapOpen && (!state || swapOpen !== id || state.backlog.some((/** @type {any} */ v) => v.id === id))) swapOpen = '';
    const parts = [
      swapOpen && DripSwap.picker({ backlog: state.backlog, onPick: onSwap, onClose: closeSwap }),
      swapped && DripSwap.note(swapped.dropped, onSwapUndo),
    ].filter(Boolean);
    if (!parts.length) {
      swapLayer?.remove();
      swapLayer = null;
      return;
    }
    if (!swapLayer) {
      swapLayer = h('div', { class: 'drip-swap-layer' });
      for (const ev of ['click', 'dblclick', 'mousedown', 'pointerdown', 'keydown']) swapLayer.addEventListener(ev, keepFromPlayer);
    }
    const parent = document.querySelector(SEL.player) || document.body;
    swapLayer.classList.toggle('is-floating', parent === document.body);
    swapLayer.replaceChildren(...parts);
    if (swapLayer.parentElement !== parent) parent.append(swapLayer);
  }

  /** @param {boolean} keyboard Opened from the keyboard, so the list takes focus. */
  function openSwap(keyboard) {
    swapOpen = videoId();
    drawSwap();
    const list = /** @type {any} */ (swapLayer?.querySelector('.drip-swap'));
    if (list) {
      list.dataset.flips = 'false';
      DripSwap.place(list, document.querySelector('#drip-pill'));
      if (keyboard) list.focusFirst();
    }
    renderPill();
  }

  function closeSwap() {
    const had = !!swapLayer?.contains(document.activeElement);
    swapOpen = '';
    drawSwap();
    renderPill();
    if (had) /** @type {HTMLElement | null} */ (document.querySelector('#drip-pill [data-k="pill-save"]'))?.focus();
  }

  /** @param {any} drop */
  async function onSwap(drop) {
    const id = videoId();
    if (!id || !state) return;
    const index = state.backlog.findIndex((/** @type {any} */ v) => v.id === drop.id);
    swapOpen = '';
    const res = await send({ type: 'swapBacklog', video: thisVideo(id), dropId: drop.id });
    if (res && res.ok && res.dropped) {
      if (swapped) clearTimeout(swapped.timer);
      const timer = window.setTimeout(() => {
        swapped = null;
        drawSwap();
      }, DripSwap.UNDO_MS);
      swapped = { dropped: res.dropped, index, newId: id, timer };
    }
    took(res);
    drawSwap();
    /** @type {HTMLElement | null} */ (document.querySelector('#drip-pill [data-k="pill-save"]'))?.focus();
  }

  async function onSwapUndo() {
    if (!swapped) return;
    const { dropped, index, newId, timer } = swapped;
    clearTimeout(timer);
    swapped = null;
    took(await send({ type: 'swapBacklog', video: dropped, dropId: newId, index }));
    drawSwap();
  }

  let pillView = '';
  /** Grace presentation waits for the existing 700ms water drain, without changing grace's rules. */
  let pillGrace = { id: '', ready: false, attentionAt: -Infinity };
  /** The pill's Stash as last drawn, so a rebuild after stashing fills the bookmark from where it was (stash.js). */
  let stashDrawn = { id: '', stashed: false };
  /** @type {SVGSVGElement | null} */
  let pillGlass = null;
  /** When the current water drain began, including a zero reached between worker replies. */
  let pillDrainAt = -Infinity;
  /** @type {Animation | null} */
  let pillGraceFade = null;
  const PILL_GLASS_PX = 20;
  /** In the last this many seconds, the pill stays up over the video and shimmers. */
  const LOW_SECONDS = 120;
  const GRACE_ATTENTION_MS = 3000;

  /**
   * Keeps clicks and keys on the pill away from the player, which would otherwise read a click as play or pause.
   * @param {Event} e
   */
  function keepFromPlayer(e) {
    e.stopPropagation();
  }

  /** Whether the minutes are nearly gone, set by renderPill and read by pillLook. */
  let pillLow = false;

  /**
   * Dry hours' warning gets noticed: at 5 minutes and again at 1, the pill spells it out with the grace rings for this
   * long, then shrinks back to the countdown (Jesse, 2026-11-04).
   */
  const DRY_NOTICE_MS = 5000;
  /** Which notices this page has shown, as "video:start:stage", so each shows once per video. */
  const dryNoticed = new Set();
  let dryNoticeAt = -Infinity;

  /**
   * The pill hides along with YouTube's controls a few seconds into playback, except in the last minutes, when it stays
   * up and shimmers, and for three seconds after the grace label appears. Checked every tick and whenever the
   * player's class changes.
   */
  function pillLook() {
    const pill = document.getElementById('drip-pill');
    if (!pill) return;
    const playing = !!video && !video.paused;
    pill.classList.toggle('is-grace', inGrace() && pillGrace.ready);
    pill.classList.toggle('is-low', pillLow && playing);
    // From grace starting until 3 seconds after its label shows, the pill stays up, so it changes in place instead of
    // vanishing while the last water drains. The rings play only once the label is there.
    const holding = inGrace() && (!pillGrace.ready || performance.now() - pillGrace.attentionAt < GRACE_ATTENTION_MS);
    const dryNotice = performance.now() - dryNoticeAt < DRY_NOTICE_MS;
    const attention = (holding && pillGrace.ready) || dryNotice;
    if (attention && !pill.classList.contains('is-grace-attention')) {
      // A replacement pill joins the same two rings where they are, rather than starting them again.
      const since = dryNotice ? dryNoticeAt : pillGrace.attentionAt;
      pill.style.setProperty('--drip-grace-ring-delay', `${-Math.max(0, performance.now() - since)}ms`);
    }
    pill.classList.toggle('is-grace-attention', attention);
    // The notice's sentence is longer than the countdown, so the pill may widen while it shows.
    pill.classList.toggle('is-dry-notice', dryNotice);
    // Never hidden while it has keyboard focus, or Enter would act on a button nobody can see.
    const focused = pill.contains(document.activeElement);
    pill.classList.toggle('is-idle', playing && !pillLow && !holding && !dryNotice && !focused && !!document.querySelector(SEL.playerIdle));
  }

  // DESIGN.md "Minutes and the watch page pill": the glass, minutes left, and Save. It never offers to buy minutes.
  // It sits inside the player's top right, so it shows in fullscreen too (Jesse picked this placement, 2026-10-10).
  function renderPill() {
    const id = videoId();
    let pill = document.getElementById('drip-pill');
    // Mode parts (Q29): with the clock off the pill has no glass or minutes, and with the stash off too it has nothing.
    const clockOn = !!state && state.settings.clock !== false;
    const stashOn = !!state && state.settings.stash !== false;
    // The stash turned off with its full-stash list open: the list goes with its button (Codex, 2026-10-15).
    if (swapOpen && state && !stashOn) {
      swapOpen = '';
      drawSwap();
    }
    if (!id || !state || (!clockOn && !stashOn)) {
      pill?.remove();
      pillView = '';
      pillGrace = { id: '', ready: false, attentionAt: -Infinity };
      pillGraceFade?.cancel();
      pillGraceFade = null;
      if (swapOpen || swapped) {
        swapOpen = '';
        drawSwap();
      }
      return;
    }
    // Moved on to another video: its list and note were for the last one.
    if ((swapOpen && swapOpen !== id) || (swapped && swapped.newId !== id)) drawSwap();
    const saved = state.backlog.some((/** @type {any} */ v) => v.id === id);
    const grace = inGrace();
    const reduced = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const graceVideo = grace ? id : '';
    if (pillGrace.id !== graceVideo) {
      const drainMs = pillGlass && Number(pillGlass.dataset.level) > 0 ? 700 : Math.max(0, 700 - (performance.now() - pillDrainAt));
      const next = { id: graceVideo, ready: !grace || reduced || drainMs === 0, attentionAt: -Infinity };
      pillGrace = next;
      if (!next.ready) setTimeout(() => {
        // Ending grace or navigating cancels this presentation, including another grace on the same video.
        if (pillGrace !== next) return;
        next.ready = true;
        renderPill();
      }, drainMs);
    }
    if (grace && reduced) pillGrace.ready = true;
    const finishing = grace && pillGrace.ready;
    if (finishing && pillGrace.attentionAt === -Infinity) {
      const current = pillGrace;
      current.attentionAt = performance.now();
      setTimeout(() => {
        if (pillGrace === current) pillLook();
      }, GRACE_ATTENTION_MS);
    }
    if (!finishing || reduced) {
      pillGraceFade?.cancel();
      pillGraceFade = null;
    }
    const wasFinishing = !!pill?.classList.contains('is-grace');
    const status = Drip.watchStatus(state, id, Date.now());
    const allowed = !grace && status.allowed;
    const unlocked = !grace && (status.unlocked || allowed);
    // Count down between ticks, which only go out every few seconds. During an ad, the time not banked yet is all ad
    // (syncAd banked what came before it), and ads aren't charged (Q27).
    const live = adShowing ? 0 : (runningSince === null ? playedMs : playedMs + performance.now() - runningSince) / 1000;
    // The worker saves before it replies, so the state can already count a tick still waiting here. Those seconds
    // aren't taken off twice (Codex, 2026-11-05).
    const counted = (/** @type {string} */ key) => state.ticksIn.find((/** @type {[string, number]} */ t) => t[0] === key)?.[1] || 0;
    const pending = unsent.reduce((sum, entry) => sum + Math.max(0, entry.seconds - counted(entry.key)), 0) + live;
    const left = Math.max(0, state.watchSecondsLeft - pending);
    // The 5 minutes before Dry hours, the pill counts down to them instead, and shimmers (Jesse, 2026-11-04). A video
    // finishing on grace too, since Dry hours stop it as well (Q32), and "Finishing this one" would promise otherwise.
    const soon = clockOn && !unlocked && !allowed ? Drip.drySoon(state, Date.now()) : 0;
    const soonSec = (soon - Date.now()) / 1000;
    // At 5 minutes and at 1, once each for each video that plays, the pill says what happens, with rings.
    const stage = soon ? (soonSec <= 60 ? 1 : 5) : 0;
    const noticeKey = `${id}:${soon}:${stage}`;
    if (stage && video && !video.paused && !dryNoticed.has(noticeKey)) {
      dryNoticed.add(noticeKey);
      dryNoticeAt = performance.now();
      setTimeout(renderPill, DRY_NOTICE_MS + 50);
    }
    const noticing = !!soon && performance.now() - dryNoticeAt < DRY_NOTICE_MS;
    // Rounded up, so it says "Dry in 5m" right at the start, then "<1m" for the last minute.
    const soonText = !soon ? ''
      : noticing ? `Dry hours · video stops at ${hourLabel(new Date(soon).getHours())}`
        : `Dry in ${soonSec < 60 ? '<1m' : Drip.formatMinutes(Math.ceil(soonSec / 60) * 60)}`;
    const time = soonText || (finishing ? 'Finishing this one' : allowed ? 'Allowed channel' : unlocked ? 'Unlocked' : Drip.formatMinutes(left));
    // Paused, the minutes aren't draining, and the pill says so.
    const paused = !grace && !unlocked && !adShowing && !!video && video.paused && left > 0;
    // With grace on, the pill stays up through 0 too, until grace takes over, so it never blinks out at the switch.
    pillLow = clockOn && !unlocked && !adShowing && ((!grace && (left > 0 || state.settings.graceMode) && left <= LOW_SECONDS) || !!soon);
    if (clockOn && !unlocked) {
      const fraction = grace ? 0 : DripGlass.fraction({ watchSecondsLeft: left, watchSecondsBought: state.watchSecondsBought });
      if (fraction === 0 && pillGlass && Number(pillGlass.dataset.level) > 0) pillDrainAt = performance.now();
      if (!pillGlass) pillGlass = DripGlass.make(fraction, PILL_GLASS_PX);
      else DripGlass.set(pillGlass, fraction, PILL_GLASS_PX);
      if (fraction > 0) pillWetAt = performance.now();
    }
    const parent = document.querySelector(SEL.player) || document.body;
    // Rebuild only when the text changes. A button replaced mid-click loses the click.
    const view = JSON.stringify([id, time, saved, adShowing, paused, swapOpen, grace, finishing, clockOn, stashOn]);
    if (pill && pillView === view && pill.parentElement === parent) return pillLook();
    pillView = view;
    // Stashed or taken out since the last draw: the new button starts as the old one was, and the water moves.
    const fills = stashDrawn.id === id && stashDrawn.stashed !== saved;
    stashDrawn = { id, stashed: saved };
    const stash = DripStash.parts(fills ? !saved : saved, { outline: true });
    if (fills) stash.to(saved);
    const content = [
      clockOn && h('span', { class: `drip-pill-time${unlocked ? ' is-unlocked' : ''}${paused ? ' is-paused' : ''}` },
        !unlocked && pillGlass,
        // One inline line, so the smaller note sits on the minutes' baseline instead of being centered as its own box.
        h('span', { class: 'drip-pill-label' },
          h('span', { class: 'drip-pill-minutes' }, time),
          !unlocked && h('span', { class: 'drip-sr' }, noticing ? '' : soon ? ', then no watching until they end' : finishing ? ', time is up' : ' left today'),
          paused && h('span', { class: 'drip-pill-note' }, h('span', { class: 'drip-sep', 'aria-hidden': 'true' }, ' · '), 'paused'),
          adShowing && h('span', { class: 'drip-pill-note' }, ' Ad, not counted'))),
      stashOn && h('button', {
        class: `drip-pill-save drip-stash${saved ? ' is-saved' : ''}`, 'data-k': 'pill-save', 'aria-pressed': String(saved), onclick: onSave,
        'data-swap-anchor': true, 'aria-expanded': swapOpen ? 'true' : undefined,
        title: saved ? 'In your stash. Click to take it out.' : 'Stash it for later',
      }, ...stash.nodes),
    ];
    if (!pill) {
      pill = h('div', { id: 'drip-pill', class: 'drip-ui' });
      for (const ev of ['click', 'dblclick', 'mousedown', 'pointerdown', 'keydown']) pill.addEventListener(ev, keepFromPlayer);
      for (const ev of ['focusin', 'focusout']) pill.addEventListener(ev, () => setTimeout(pillLook));
    }
    const focused = pill.contains(document.activeElement);
    pill.replaceChildren(...content.filter(Boolean));
    if (pill.parentElement !== parent) parent.append(pill);
    // No player found: pinned to the window instead, below YouTube's top bar, where it can still be seen and clicked.
    pill.classList.toggle('is-floating', parent === document.body);
    if (focused) /** @type {HTMLElement | null} */ (pill.querySelector('[data-k="pill-save"]'))?.focus();
    pillLook();
    if (finishing && !wasFinishing && !reduced) {
      // The SVG survives rebuilds. Animate after reattaching it so the fade doesn't depend on a CSS transition
      // surviving replaceChildren; the class keeps the final opacity after this animation ends.
      pillGraceFade = pillGlass?.querySelector('.drip-glass-outline')?.animate?.([{ opacity: 1 }, { opacity: 0.35 }], { duration: 300, easing: 'ease' }) || null;
    }
  }

  // setGrace also runs in the middle of applying a status. Draw once that status has finished applying.
  document.addEventListener('drip-grace', () => { Promise.resolve().then(renderPill); });

  onState((next) => {
    if (disconnected) return;
    const id = videoId();
    const wasFunded = !!state && !!id && !Drip.watchStatus(state, id, Date.now()).locked;
    const clockWasOff = !!state && state.settings.clock === false;
    state = next;
    // Time played while the clock was off was free, so turning it on mid-video drops what hadn't gone to the worker
    // yet instead of charging it. History loses those few seconds (Codex, 2026-10-15).
    if (clockWasOff && state.settings.clock !== false) {
      bank();
      unsent.length = 0;
    }
    const status = Drip.watchStatus(state, id, Date.now());
    // Another tab may have used up the minutes. A video playing here when that happened gets grace too (Q3).
    if (wasFunded && status.locked && graceAllowed(id) && clockActive() && video && !video.paused) setGrace(id);
    applyStatus(status, !!(pendingTick && pendingTick.id === id && pendingTick.paid));
    renderPill();
  });
  // Time played up to here belongs to the video being left, not the next one.
  document.addEventListener('yt-navigate-start', bank);
  document.addEventListener('yt-navigate-finish', () => {
    if (disconnected) return;
    if (leavingLock() && location.pathname === '/watch') {
      cancelLeave = true;
      document.getElementById('drip-lock')?.remove();
      try {
        sessionStorage.removeItem(KEPT_KEY);
      } catch {
        // Storage blocked: nothing was saved.
      }
    }
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
