// @ts-check
// drip's icons as data: URLs, for the CSS masks that draw them on YouTube's pages. A youtube.com page that loads a
// chrome-extension:// file itself, by fetch or as a mask, gets it, but Chrome lists "Unsafe attempt to load URL ...
// Domains, protocols and ports must match." under Errors on drip's card each time (Jesse, 2026-11-05). So the page
// never loads one: the worker reads the SVGs and sends their text, in one message, and they become data: URLs.
// A prerendered page (the copy of youtube.com Chrome loads unseen while the address bar is typed in) waits until it's
// shown, since it may never be.
//
// A classic script that sets globalThis.DripIcons; menu.js and common.js run in the same content-script world and
// share it.

(() => {
  const g = /** @type {any} */ (globalThis);
  if (g.DripIcons) return;

  // Every file in src/icons. test/icons.test.js checks the two match.
  const NAMES = [
    'arrow-right', 'arrow-up-right', 'arrow', 'ban', 'card', 'check', 'chevron-down', 'chevron-left', 'chevron-right',
    'circle-arrow-down', 'circle-arrow-up', 'clock-line', 'clock', 'download', 'drop', 'ellipsis-vertical', 'history',
    'house', 'list-video', 'menu', 'minus', 'pause', 'play-line', 'play', 'plus', 'save-outline', 'save', 'search-fill', 'search',
    'settings', 'smartphone', 'square-play-fill', 'square-play', 'thumbs-up', 'unlock', 'users', 'x',
  ];

  /** Settles once the page is shown: at once, or when a prerendered page is activated. */
  const shown = /** @type {any} */ (document).prerendering
    ? new Promise((resolve) => document.addEventListener('prerenderingchange', () => resolve(undefined), { once: true }))
    : Promise.resolve();

  /** @type {Map<string, string>} */
  const ready = new Map();
  /** @type {Promise<void> | null} */
  let loading = null;

  /** Asks the worker for every icon once. A failed ask (the worker restarting, the extension reloaded) is tried again. */
  function loadAll() {
    if (!loading) {
      loading = shown
        .then(() => chrome.runtime.sendMessage({ type: 'icons', names: NAMES }))
        .then((res) => {
          if (!res || !res.ok || !res.icons) throw new Error('icons: no answer');
          for (const [name, svg] of Object.entries(res.icons)) {
            if (typeof svg === 'string') ready.set(name, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
          }
        });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  /**
   * Gives el the icon as its --drip-icon mask: now if it's loaded, else as soon as it is. Never a chrome-extension://
   * URL, so a mask drawn before the icons arrive is blank for those few milliseconds.
   * @param {HTMLElement} el @param {string} name
   */
  function paint(el, name) {
    const url = ready.get(name);
    if (url) {
      el.style.setProperty('--drip-icon', `url("${url}")`);
      return;
    }
    loadAll().then(() => {
      const later = ready.get(name);
      if (later) el.style.setProperty('--drip-icon', `url("${later}")`);
    }, () => {});
  }

  loadAll().catch(() => {});

  g.DripIcons = { NAMES, paint, url: (/** @type {string} */ name) => ready.get(name) };
})();
