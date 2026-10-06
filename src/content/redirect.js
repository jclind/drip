// @ts-check
// Top-level players must go through the watch clock. Embeds on other sites stay free.

(function () {
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
  }
})();
