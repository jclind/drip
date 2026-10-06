// @ts-check
// Starts each YouTube page blank and fades it in once the page data has arrived, so navigation feels calm.
// early.css hides ytd-app until <html> gets data-drip-shown. If this script never runs, a CSS animation shows the page anyway.

(function () {
  const ATTR = 'data-drip-shown';
  const DELAY_MS = 150;
  const FAILSAFE_MS = 3000;
  const root = document.documentElement;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;

  function show() {
    clearTimeout(timer);
    root.setAttribute(ATTR, '');
  }

  function hide() {
    clearTimeout(timer);
    root.removeAttribute(ATTR);
    timer = setTimeout(show, FAILSAFE_MS);
  }

  document.addEventListener('yt-navigate-start', hide);
  document.addEventListener('yt-page-data-updated', () => {
    clearTimeout(timer);
    timer = setTimeout(show, DELAY_MS);
  });
  timer = setTimeout(show, FAILSAFE_MS);
})();
