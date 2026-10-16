// @ts-check
// Runs in YouTube's own page world at document_start. While early.js marks the page as held, YouTube's calls to
// play() are refused the way a blocked autoplay is, so a locked video never starts, not even for a moment.
// drip's own play() calls come from the isolated world, which has its own prototype, so they aren't affected.

(function () {
  const HOLD_ATTR = 'data-drip-hold';
  const native = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    // data-drip-broken: watch.js can't find the player, so drip fails open (Q25).
    const root = document.documentElement;
    if (root.hasAttribute(HOLD_ATTR) && !root.hasAttribute('data-drip-broken') && this.matches('#movie_player video')) {
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
  const APP = 'ytd-app';
  // Only the latest request can fall back, so two quick clicks never load the older page.
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let fallback;
  document.addEventListener('yt-navigate-start', () => clearTimeout(fallback));
  document.addEventListener('drip-navigate', (e) => {
    const url = /** @type {CustomEvent} */ (e).detail;
    const app = document.querySelector(APP);
    if (typeof url !== 'string' || !app) return;
    e.preventDefault();
    clearTimeout(fallback);
    fallback = setTimeout(() => location.assign(url), 1000);
    app.dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint: { commandMetadata: { webCommandMetadata: { url } } } } }));
  });
})();
