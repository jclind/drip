// @ts-check
// Top-level players must go through the watch clock. Embeds on other sites stay free.
// Shorts become ordinary watch pages, so the clock and the lock apply to them too.
// The subscriptions and Explore feeds and pages go to the home page, where the token page lives (decision Q16).

(function () {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;
  if (window.top !== window) return;
  const first = Drip.redirectTarget(location.href);
  if (first) {
    location.replace(first);
    return;
  }
  // Clicks inside YouTube don't reload the page. Catch the click, so the Short or feed never paints, and check
  // after each in-page navigation too, for links that don't come from a click.
  document.addEventListener('click', onClick, true);
  document.addEventListener('yt-navigate-finish', () => {
    const target = Drip.redirectTarget(location.href);
    if (target) location.replace(target);
  });

  function onClick(/** @type {MouseEvent} */ event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link) return;
    const url = new URL(/** @type {HTMLAnchorElement} */ (link).href, location.href);
    if (url.hostname !== 'www.youtube.com') return;
    const target = Drip.redirectTarget(url.href);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(target);
  }
})();
