// @ts-check
// Starts each YouTube page blank and fades it in once the page data has arrived, so navigation feels calm.
// early.css hides ytd-app until <html> gets data-drip-shown. If this script never runs, a CSS animation shows the page anyway.
// A watch page shows once watch.js has applied theater mode, so the layout doesn't jump after the fade. On a full load
// that's often seconds before YouTube's page-data event, so a watch page doesn't wait for that event too.

(function () {
  const ATTR = 'data-drip-shown';
  const DELAY_MS = 150;
  const FAILSAFE_MS = 6000;
  const root = document.documentElement;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  let dataReady = false;
  let theaterReady = false;

  function show() {
    clearTimeout(timer);
    root.setAttribute(ATTR, '');
  }

  function hide() {
    clearTimeout(timer);
    dataReady = false;
    theaterReady = false;
    root.removeAttribute(ATTR);
    timer = setTimeout(show, FAILSAFE_MS);
  }

  function maybeShow() {
    if (location.pathname === '/watch' ? !theaterReady : !dataReady) return;
    clearTimeout(timer);
    timer = setTimeout(show, DELAY_MS);
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
  timer = setTimeout(show, FAILSAFE_MS);
})();
