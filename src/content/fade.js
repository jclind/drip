// @ts-check
// Starts each YouTube page blank and fades it in once the page data has arrived, so navigation feels calm.
// early.css hides ytd-app until <html> gets data-drip-shown. If this script never runs, a CSS animation shows the page anyway.
// A watch page shows once watch.js has applied theater mode, so the layout doesn't jump after the fade. On a full load
// that's often seconds before YouTube's page-data event, so a watch page doesn't wait for that event too.
// On a slow connection the page used to stay black for up to 6 seconds with no sign it was loading (Jesse, 2026-11-09),
// and drip hides YouTube's own loading signs with the page. Now it shows after 2.5 seconds, loaded or not. A locked
// watch page asks for longer (drip-fade-hold), since its lock can wait 2 seconds on the channel and 1.1 on the water.

(function () {
  const ATTR = 'data-drip-shown';
  const FAILSAFE_MS = 2500;
  /** The longest a locked watch page holds the dark screen. early.css's own failsafe, 5s, has to stay longer. */
  const HOLD_MS = 4500;
  const root = document.documentElement;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  let frame = 0;
  let dataReady = false;
  let theaterReady = false;
  let hiddenAt = performance.now();
  let holding = false;

  function show() {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    root.setAttribute(ATTR, '');
  }

  function hide() {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    dataReady = false;
    theaterReady = false;
    holding = false;
    hiddenAt = performance.now();
    root.removeAttribute(ATTR);
    timer = setTimeout(show, FAILSAFE_MS);
  }

  function maybeShow() {
    if (location.pathname === '/watch' ? !theaterReady : !dataReady) return;
    // Two frames, so the theater layout has been painted before the fade starts. Frames don't run in a hidden tab,
    // so a page loaded in the background fades in when you switch to it. The failsafe timer still stands.
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(show);
    });
  }

  document.addEventListener('yt-navigate-start', hide);
  document.addEventListener('yt-page-data-updated', () => {
    dataReady = true;
    maybeShow();
  });
  document.addEventListener('drip-theater-done', () => {
    theaterReady = true;
    maybeShow();
  });
  document.addEventListener('drip-fade-hold', () => {
    if (holding || root.hasAttribute(ATTR)) return;
    holding = true;
    clearTimeout(timer);
    timer = setTimeout(show, Math.max(0, hiddenAt + HOLD_MS - performance.now()));
  });
  timer = setTimeout(show, FAILSAFE_MS);
})();
