// @ts-check
// The watch clock. Measures how long the main player plays, reports it to the worker, and locks the player at zero.

(function () {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;
  /** @type {any} */
  const { send, h, onState, hourLabel } = /** @type {any} */ (globalThis).DripUI;

  // YouTube selectors. These break when YouTube changes its markup.
  const SEL = {
    video: '#movie_player video.html5-main-video',
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
  let runningSince = 0;
  let locked = false;
  /** Video allowed to finish after time ran out, when grace mode is on. */
  let graceId = '';

  function videoId() {
    if (location.pathname !== '/watch') return '';
    return new URLSearchParams(location.search).get('v') || '';
  }

  /** The clock runs on watch pages and in the miniplayer. */
  function clockActive() {
    const app = document.querySelector(SEL.app);
    return location.pathname === '/watch' || !!(app && app.hasAttribute(SEL.miniplayerAttr));
  }

  function startRun() {
    if (!runningSince) runningSince = Date.now();
  }

  function stopRun() {
    if (runningSince) {
      playedMs += Date.now() - runningSince;
      runningSince = 0;
    }
  }

  /** Seconds played since the last call. */
  function takePlayed() {
    const now = Date.now();
    let ms = playedMs;
    if (runningSince) {
      ms += now - runningSince;
      runningSince = now;
    }
    playedMs = 0;
    return ms / 1000;
  }

  function onPlay() {
    if (locked && graceId !== videoId()) {
      video?.pause();
      showLock();
      return;
    }
    startRun();
  }

  function onEnded() {
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
    if (!video.paused) startRun();
  }

  /** @param {any} status */
  function applyStatus(status) {
    const id = videoId();
    const wasLocked = locked;
    locked = !!status.locked;
    if (!locked) {
      graceId = '';
      hideLock();
      return;
    }
    if (!wasLocked && state && state.settings.graceMode && video && !video.paused && id) graceId = id;
    if (graceId && graceId === id) return;
    if (video && !video.paused) video.pause();
    if (clockActive() && id) showLock();
  }

  async function tick() {
    attach();
    const id = videoId();
    if (!clockActive()) {
      takePlayed();
      hideLock();
      return;
    }
    const seconds = takePlayed();
    if (seconds > 0) {
      const res = await send({ type: 'tick', seconds, videoId: id });
      if (res && res.ok) {
        state = res.state;
        applyStatus(res);
      }
    }
    if (locked && video && !video.paused && graceId !== id) video.pause();
    renderPill();
  }

  async function refreshStatus() {
    const res = await send({ type: 'status', videoId: videoId() });
    if (res && res.ok) {
      state = res.state;
      applyStatus(res);
    }
    renderPill();
  }

  // The lock overlay.

  let reasonOpen = false;
  let lockMessage = '';

  function hideLock() {
    document.getElementById('drip-lock')?.remove();
    reasonOpen = false;
    lockMessage = '';
  }

  async function onAddTime() {
    const res = await send({ type: 'spendWatch' });
    if (res && res.ok) {
      state = res.state;
      locked = false;
      hideLock();
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
    const res = await send({ type: 'needThis', videoId: id, title, reason });
    if (res && res.ok) {
      state = res.state;
      locked = false;
      hideLock();
      video?.play();
      return;
    }
    lockMessage = res && res.error === 'reason-required' ? 'Write a few words about why.' : "You've used all of today's unlocks.";
    showLock();
  }

  function showLock() {
    if (!state) return;
    const s = state.settings;
    const needLeft = Math.max(0, s.needThisPerDay - state.unlocked.length);
    const canBuy = state.tokens.watch > 0;
    /** @type {HTMLTextAreaElement} */
    const reason = /** @type {any} */ (h('textarea', { rows: 3, placeholder: 'Why do you need this one?' }));
    const panel = h(
      'div',
      { class: 'drip-lock-panel' },
      h('div', { class: 'drip-lock-title' }, 'Out of watch time'),
      h('div', { class: 'drip-meta' }, `watch tokens ${state.tokens.watch} · unlocks left today ${needLeft}`),
      lockMessage && h('div', { class: 'drip-message' }, lockMessage),
      canBuy && h('button', { class: 'drip-btn drip-primary', onclick: onAddTime }, `Add ${s.minutesPerToken} min · 1 watch`),
      needLeft > 0 && !reasonOpen && h('button', { class: 'drip-btn', onclick: () => { reasonOpen = true; showLock(); } }, 'I need this one'),
      needLeft > 0 && reasonOpen && h('div', { class: 'drip-reason' }, reason,
        h('button', { class: 'drip-btn drip-primary', onclick: () => onNeedThis(reason.value) }, 'Unlock this video')),
      !canBuy && needLeft === 0 && h('div', { class: 'drip-meta' }, `Done for today. Tokens come back at ${hourLabel(s.resetHour)}.`),
      h('a', { class: 'drip-link', href: '/' }, 'Back to drip home'),
    );
    const existing = document.getElementById('drip-lock');
    if (existing) existing.replaceChildren(panel);
    else document.body.append(h('div', { id: 'drip-lock' }, panel));
    if (reasonOpen) reason.focus();
  }

  // The pill with minutes left and the Save button.

  async function onSave() {
    const id = videoId();
    const title = document.querySelector(SEL.title)?.textContent?.trim() || document.title.replace(/ - YouTube$/, '');
    const channel = document.querySelector(SEL.channel)?.textContent?.trim() || '';
    const secs = video && Number.isFinite(video.duration) ? Math.round(video.duration) : 0;
    const length = secs ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '';
    const res = await send({ type: 'addBacklog', video: { id, title, channel, length } });
    if (res && res.ok) state = res.state;
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
    state = next;
    renderPill();
  });
  document.addEventListener('yt-navigate-finish', () => {
    graceId = '';
    hideLock();
    refreshStatus();
  });
  setInterval(tick, 1000);
  refreshStatus();
})();
