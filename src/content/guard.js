// @ts-check
// Runs in YouTube's own page world at document_start. Refuses held playback and, with the clock on, any media
// outside the main watch player. early.js marks the clock and hold on <html>.
// drip's own play() calls come from the isolated world, which has its own prototype, so they aren't affected.

(function () {
  // YouTube selectors. These break when YouTube changes its markup.
  const SEL = {
    mainVideo: '#movie_player video',
    app: 'ytd-app',
  };

  const HOLD_ATTR = 'data-drip-hold';
  const native = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    // data-drip-broken: watch.js can't find the player, so drip fails open (Q25).
    const root = document.documentElement;
    const main = this.matches(SEL.mainVideo);
    const outsideWatch = root.hasAttribute('data-drip-clock') && (!main || location.pathname !== '/watch');
    if (!root.hasAttribute('data-drip-broken') && (outsideWatch || (main && root.hasAttribute(HOLD_ATTR)))) {
      return Promise.reject(new DOMException('drip: out of watch time', 'NotAllowedError'));
    }
    return native.call(this);
  };

  // YouTube animates navigation with a View Transition, a cross-fade of page snapshots. It hid drip's overlay for a
  // moment, and it fights fade.js, which fades each page in itself. Skip it. Reduced-motion users get no fade from
  // drip, so they keep YouTube's own transition.
  if (typeof document.startViewTransition === 'function') {
    const nativeVT = document.startViewTransition;
    document.startViewTransition = function (...args) {
      const vt = nativeVT.apply(this, args);
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute(HOLD_ATTR)) vt.skipTransition();
      return vt;
    };
  }

  // drip's menu (menu.js) lives in the isolated world, and its plain links would load a whole new page. That drops the
  // watch time watch.js hasn't sent yet. So menu.js asks here, and YouTube's own in-page navigation takes the link.
  // Canceling the event tells menu.js it was handled. If YouTube ignores the event, the page loads the plain way.
  // Only the latest request can fall back, so two quick clicks never load the older page.
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let fallback;
  document.addEventListener('yt-navigate-start', () => clearTimeout(fallback));
  document.addEventListener('drip-navigate', (e) => {
    const url = /** @type {CustomEvent} */ (e).detail;
    const app = document.querySelector(SEL.app);
    if (typeof url !== 'string' || !app) return;
    e.preventDefault();
    clearTimeout(fallback);
    fallback = setTimeout(() => location.assign(url), 1000);
    app.dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint: { commandMetadata: { webCommandMetadata: { url } } } } }));
  });
})();
