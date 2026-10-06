// @ts-check
// Runs in YouTube's own page world at document_start. While early.js marks the page as held, YouTube's calls to
// play() are refused the way a blocked autoplay is, so a locked video never starts, not even for a moment.
// drip's own play() calls come from the isolated world, which has its own prototype, so they aren't affected.

(function () {
  const HOLD_ATTR = 'data-drip-hold';
  const native = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (document.documentElement.hasAttribute(HOLD_ATTR) && this.matches('#movie_player video')) {
      return Promise.reject(new DOMException('drip: out of watch time', 'NotAllowedError'));
    }
    return native.call(this);
  };

  // YouTube animates navigation with a View Transition. Behind a lock there's nothing to animate, and the
  // transition's snapshot hid drip's overlay for a moment, so skip it while held.
  if (typeof document.startViewTransition === 'function') {
    const nativeVT = document.startViewTransition;
    document.startViewTransition = function (...args) {
      const vt = nativeVT.apply(this, args);
      if (document.documentElement.hasAttribute(HOLD_ATTR)) vt.skipTransition();
      return vt;
    };
  }
})();
