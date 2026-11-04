// @ts-check
// Guard the main player's first play before the watch clock and overlay load.

(function () {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;

  // YouTube selectors. These break when YouTube changes its markup.
  const SEL = {
    video: '#movie_player video.html5-main-video',
    player: '#movie_player',
    playButton: '#movie_player .ytp-play-button',
  };

  // Keep behavior identical to DripUI.pausePlayer in common.js, which loads later.
  /** @param {HTMLVideoElement | null} video */
  function pausePlayer(video) {
    const player = document.querySelector(SEL.player);
    if (player?.classList.contains('playing-mode')) {
      const button = /** @type {HTMLElement | null} */ (document.querySelector(SEL.playButton));
      button?.click();
    }
    if (video && !video.paused) video.pause();
  }

  /** @type {any} */
  let state;
  let storageKnown = false;
  /** @type {boolean | null} */
  let locked = null;
  let decisionId = '';
  /** @type {{video: HTMLVideoElement, id: string} | null} */
  let pausedWhileUnknown = null;
  /**
   * The video held because no minutes were left. When a watch page then shows it's from an allowed channel, it starts
   * on its own (CHANNEL-LISTS-PLAN.md, call 8). Set when the hold goes up, not on a play event, since guard.js refuses
   * YouTube's play() before one fires (Codex, 2026-11-03).
   */
  let heldId = '';

  function videoId() {
    return location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') || '' : '';
  }

  /** Tells guard.js, in the page world, whether to refuse YouTube's play() calls. */
  /** @param {boolean} hold */
  function setHold(hold) {
    document.documentElement.toggleAttribute('data-drip-hold', hold);
  }

  /**
   * @param {boolean} [fromStorage] A balance change while the page is open. With grace mode on, pausing a video that's
   *   already playing is watch.js's job then, because only it knows whether that video has grace.
   */
  function decide(fromStorage = false) {
    const id = videoId();
    if (id !== decisionId) {
      pausedWhileUnknown = null;
      heldId = '';
    }
    decisionId = id;
    if (!storageKnown) {
      locked = null;
      setHold(!!id);
      return;
    }
    // Grace is watch.js's call, for a video already playing when time ran out. It marks that video on <html>.
    locked = Drip.earlyLocked(state, Date.now(), id) && document.documentElement.getAttribute('data-drip-grace') !== id;
    setHold(!!id && locked);

    const pending = pausedWhileUnknown;
    pausedWhileUnknown = null;
    if (!id) return;
    const video = /** @type {HTMLVideoElement | null} */ (document.querySelector(SEL.video));
    const held = heldId;
    heldId = locked ? id : '';
    if (locked && !(fromStorage && state?.settings?.graceMode)) pausePlayer(video);
    else if (!locked && pending && pending.id === id && pending.video === video) {
      // Only undo our temporary pause, once. Autoplay can still reject playback.
      video.play().catch(() => {});
    } else if (!locked && held === id && video && video.paused && allowedToday(id)) {
      video.play().catch(() => {});
    }
  }

  document.addEventListener('play', (event) => {
    if (location.pathname !== '/watch') return;
    const target = event.target;
    if (!(target instanceof HTMLVideoElement) || !target.matches(SEL.video)) return;
    if (videoId() !== decisionId) decide();
    if (locked === null) {
      pausedWhileUnknown = { video: target, id: videoId() };
      pausePlayer(target);
    } else if (locked) pausePlayer(target);
  }, true);

  /** Whether the worker has marked this video free through the allow list. @param {string} id */
  function allowedToday(id) {
    const list = state && Array.isArray(state.allowedToday) ? state.allowedToday : [];
    return list.some((/** @type {any} */ e) => e && e.id === id);
  }

  document.addEventListener('yt-navigate-finish', () => decide());
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.drip) return;
    const first = !storageKnown;
    state = changes.drip.newValue;
    storageKnown = true;
    decide(!first);
  });
  document.addEventListener('drip-grace', () => decide(true));
  decide();
  chrome.storage.local.get('drip').then((stored) => {
    // A newer storage event must win over the initial snapshot.
    if (storageKnown) return;
    state = stored.drip;
    storageKnown = true;
    decide();
  }).catch(() => {
    if (storageKnown) return;
    storageKnown = true;
    decide();
  });
})();
