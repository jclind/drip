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
  // Canceling the event tells menu.js it was handled. Only the latest request can fall back, so two quick clicks never
  // load the older page.
  //
  // The request gives YouTube only a URL, so YouTube fetches that page's JSON and draws what comes back. Downloads is
  // drawn in the browser from the videos saved on the device, and YouTube finds it only by its browse id. Its JSON is
  // empty, so the page went blank and the top bar lost its logo, mic, and avatar (signed in, 2026-11-10). Pages like
  // that are left to load the plain way. The page also loads the plain way if YouTube ignores the request for a second,
  // starts it but doesn't finish in 10 seconds (logged out, Channels wants a sign-in and stalls), or finishes with
  // nothing to show.
  const PLAIN = new Set(['/feed/downloads']);
  const IGNORED_MS = 1000;
  const FINISH_MS = 10000;
  /** The URL drip asked YouTube for, until YouTube finishes it or starts another page. */
  let asked = '';
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let fallback;

  /** @param {any} detail */
  const urlOf = (detail) => detail?.endpoint?.commandMetadata?.webCommandMetadata?.url;

  /** @param {string} url @param {number} ms */
  function loadPlainAfter(url, ms) {
    clearTimeout(fallback);
    fallback = setTimeout(() => {
      asked = '';
      location.assign(url);
    }, ms);
  }

  document.addEventListener('yt-navigate-start', (e) => {
    clearTimeout(fallback);
    if (!asked) return;
    if (urlOf(/** @type {CustomEvent} */ (e).detail) === asked) loadPlainAfter(asked, FINISH_MS);
    else asked = '';
  });
  document.addEventListener('yt-navigate-finish', (e) => {
    const url = asked;
    if (!url) return;
    clearTimeout(fallback);
    asked = '';
    const detail = /** @type {CustomEvent} */ (e).detail;
    // The page's JSON is the response's response. With neither contents nor a top bar it's the blank page above. A
    // missing playlist has only a top bar and an alert, which YouTube shows fine (logged out, 2026-11-10).
    const page = detail?.response?.response;
    if (urlOf(detail) === url && page && typeof page === 'object' && !page.contents && !page.topbar) location.assign(url);
  });
  document.addEventListener('drip-navigate', (e) => {
    const url = /** @type {CustomEvent} */ (e).detail;
    const app = document.querySelector(SEL.app);
    if (typeof url !== 'string' || !app || PLAIN.has(new URL(url, location.origin).pathname)) return;
    e.preventDefault();
    asked = url;
    loadPlainAfter(url, IGNORED_MS);
    app.dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint: { commandMetadata: { webCommandMetadata: { url } } } } }));
  });
})();
