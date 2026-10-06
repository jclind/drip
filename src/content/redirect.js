// @ts-check
// Top-level players must go through the watch clock. Embeds on other sites stay free.
// Shorts become ordinary watch pages, so the clock and the lock apply to them too.
// The subscriptions and Explore feeds and pages go to the home page, where the token page lives (decision Q16).

(function () {
  // Subscriptions, Explore, and its topic pages (decision Q16). Channel pages stay.
  const FEEDS = /^\/(?:feed\/(?:subscriptions|explore|trending|storefront|courses_destination|news_destination|music_destination)|gaming|shopping|podcasts|playables|hype|courses|learning|fashion|news|sports|music|live)\/?$/;
  if (window.top !== window) return;
  const url = new URL(location.href);
  if (url.hostname === 'm.youtube.com') {
    url.hostname = 'www.youtube.com';
    location.replace(url.href);
    return;
  }
  if (url.hostname === 'www.youtube.com' && /^\/tv(?:\/|$)/.test(url.pathname)) {
    location.replace('https://www.youtube.com/');
    return;
  }
  const embed = /^\/embed\/([^/]+)\/?$/.exec(url.pathname);
  if (embed && (url.hostname === 'www.youtube.com' || url.hostname === 'www.youtube-nocookie.com')) {
    const target = new URL('https://www.youtube.com/watch');
    target.searchParams.set('v', embed[1]);
    const time = (url.searchParams.get('t') || url.searchParams.get('start') || '').replace(/s$/, '');
    if (/^\d+$/.test(time)) target.searchParams.set('t', `${time}s`);
    location.replace(target.href);
    return;
  }
  redirectPath(location.pathname);
  // Clicks inside YouTube don't reload the page. Catch the click, so the Short or feed never paints, and check
  // after each in-page navigation too, for links that don't come from a click.
  document.addEventListener('click', onClick, true);
  document.addEventListener('yt-navigate-finish', () => redirectPath(location.pathname));

  /** Where a path should go instead, or '' to leave it alone. */
  function redirectTarget(/** @type {string} */ pathname) {
    const short = /^\/shorts\/([^/]+)\/?$/.exec(pathname);
    if (short) return `https://www.youtube.com/watch?v=${encodeURIComponent(short[1])}`;
    if (FEEDS.test(pathname)) return 'https://www.youtube.com/';
    return '';
  }

  function redirectPath(/** @type {string} */ pathname) {
    if (location.hostname !== 'www.youtube.com') return;
    const target = redirectTarget(pathname);
    if (target) location.replace(target);
  }

  function onClick(/** @type {MouseEvent} */ event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link) return;
    const url = new URL(/** @type {HTMLAnchorElement} */ (link).href, location.href);
    if (url.hostname !== 'www.youtube.com') return;
    const target = redirectTarget(url.pathname);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(target);
  }
})();
