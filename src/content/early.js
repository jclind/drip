// @ts-check
// Guard the main player's first play before the watch clock and overlay load.

(function () {
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

  function videoId() {
    return location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') || '' : '';
  }

  function decide() {
    const id = videoId();
    if (id !== decisionId) pausedWhileUnknown = null;
    decisionId = id;
    if (!storageKnown) {
      locked = null;
      return;
    }
    const resetHour = state?.settings?.resetHour ?? 4;
    const date = new Date(Date.now() - resetHour * 3600000);
    const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const expired = typeof state?.day === 'string' && state.day < today;
    const seconds = expired ? 0 : state?.watchSecondsLeft ?? 0;
    // A reset also clears yesterday's unlocks. Grace belongs to watch.js.
    const unlocked = !expired && Array.isArray(state?.unlocked) && state.unlocked.includes(id);
    locked = !state?.settings?.graceMode && seconds <= 0 && !unlocked;

    const pending = pausedWhileUnknown;
    pausedWhileUnknown = null;
    if (!id) return;
    const video = /** @type {HTMLVideoElement | null} */ (document.querySelector(SEL.video));
    if (locked) pausePlayer(video);
    else if (pending && pending.id === id && pending.video === video) {
      // Only undo our temporary pause, once. Autoplay can still reject playback.
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

  document.addEventListener('yt-navigate-finish', decide);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.drip) return;
    state = changes.drip.newValue;
    storageKnown = true;
    decide();
  });
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
