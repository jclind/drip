// @ts-check
// drip's icons as data: URLs, for the CSS masks that draw them on YouTube's pages. A mask pointing at a
// chrome-extension:// URL still draws, but Chrome first tries to load it as an SVG document, which a youtube.com page
// may not, and logs "Unsafe attempt to load URL ... Domains, protocols and ports must match." under Errors on drip's
// card in chrome://extensions, once per icon per page (Jesse, 2026-11-05). A data: URL has no origin to cross.
// Every icon is fetched once when the script loads, so they're ready before the first draw. A classic script that sets
// globalThis.DripIcons; menu.js and common.js run in the same content-script world and share it.

(() => {
  const g = /** @type {any} */ (globalThis);
  if (g.DripIcons) return;

  // Every file in src/icons. test/icons.test.js checks the two match.
  const NAMES = [
    'arrow-right', 'arrow-up-right', 'arrow', 'ban', 'card', 'check', 'chevron-down', 'chevron-left', 'chevron-right',
    'circle-arrow-down', 'circle-arrow-up', 'clock-line', 'clock', 'download', 'drop', 'ellipsis-vertical', 'history',
    'house', 'list-video', 'menu', 'minus', 'pause', 'play-line', 'play', 'plus', 'save-outline', 'save', 'search',
    'settings', 'smartphone', 'square-play', 'thumbs-up', 'unlock', 'users', 'x',
  ];

  /** @type {Map<string, string>} */
  const ready = new Map();
  /** @type {Map<string, Promise<string>>} */
  const loading = new Map();

  /** @param {string} name @returns {Promise<string>} */
  function load(name) {
    let pending = loading.get(name);
    if (!pending) {
      pending = fetch(chrome.runtime.getURL(`src/icons/${name}.svg`))
        .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`icon ${name}: ${res.status}`))))
        .then((svg) => {
          const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
          ready.set(name, url);
          return url;
        });
      // A failed load (the extension reloaded under the page) can be tried again on the next draw.
      pending.catch(() => loading.delete(name));
      loading.set(name, pending);
    }
    return pending;
  }

  /**
   * Gives el the icon as its --drip-icon mask: now if it's loaded, else as soon as it is. Never a chrome-extension://
   * URL, so a mask drawn before the icon arrives is blank for those few milliseconds instead of logging an error.
   * @param {HTMLElement} el @param {string} name
   */
  function paint(el, name) {
    const url = ready.get(name);
    if (url) {
      el.style.setProperty('--drip-icon', `url("${url}")`);
      return;
    }
    load(name).then((later) => el.style.setProperty('--drip-icon', `url("${later}")`), () => {});
  }

  for (const name of NAMES) load(name).catch(() => {});

  g.DripIcons = { NAMES, paint, load, url: (/** @type {string} */ name) => ready.get(name) };
})();
