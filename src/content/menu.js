// @ts-check
// YouTube's sidebar becomes a short menu under its menu button, on every page and in every mode (design C, Jesse
// 2026-10-15). early.css hides the sidebar and its icon strip while <html> has data-drip-menu, and the bell while it has
// data-drip-hide-bell. Both go on at document_start, so neither shows for a moment first. This also keeps the search
// box saying "Search", since early.css hides its Ask YouTube chip.

(function () {
  // YouTube selectors. These break when YouTube changes its markup.
  const SEL = {
    // The menu button at the top left. Without it, drip leaves YouTube's sidebar alone.
    guideButton: 'ytd-masthead #guide-button',
    // The search box. Quiet's home page moves it into the page (home.js), and the watch below goes with it.
    searchBox: 'ytd-masthead #center',
    searchInput: 'textarea[name="search_query"], input[name="search_query"]',
  };

  /** What the menu holds: Home, the You section, and the channels page, which lists channels without their videos. */
  const SECTIONS = [
    [{ href: '/', icon: 'house', label: 'Home' }],
    [
      { href: '/feed/you', label: 'You', heading: true },
      { href: '/feed/history', icon: 'history', label: 'History' },
      { href: '/feed/playlists', icon: 'list-video', label: 'Playlists' },
      { href: '/playlist?list=WL', icon: 'clock-line', label: 'Watch later' },
      { href: '/playlist?list=LL', icon: 'thumbs-up', label: 'Liked videos' },
      // YouTube's own link needs the channel's id. Studio opens on that channel.
      { href: 'https://studio.youtube.com/', icon: 'square-play', label: 'Your videos' },
      { href: '/feed/downloads', icon: 'download', label: 'Downloads' },
    ],
    [{ href: '/feed/channels', icon: 'users', label: 'Channels' }],
  ];

  const root = document.documentElement;
  root.toggleAttribute('data-drip-menu', true);
  root.toggleAttribute('data-drip-hide-bell', true);

  /**
   * @param {string} tag
   * @param {Record<string, string>} attrs
   * @param {...(Node | string)} children
   */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    node.append(...children);
    return node;
  }

  /** @param {string} name */
  function icon(name) {
    const node = el('span', { class: `drip-i drip-i-${name}`, 'aria-hidden': 'true' });
    node.style.setProperty('--drip-icon', `url("${chrome.runtime.getURL(`src/icons/${name}.svg`)}")`);
    return node;
  }

  function build() {
    return el('nav', { id: 'drip-menu', class: 'drip-ui', 'aria-label': 'YouTube' }, ...SECTIONS.map((links) =>
      el('div', { class: 'drip-menu-sec' }, ...links.map((link) => link.heading
        ? el('a', { class: 'drip-menu-head', href: link.href }, link.label, icon('chevron-right'))
        : el('a', { class: 'drip-menu-item', href: link.href }, icon(/** @type {string} */ (link.icon)), link.label)))));
  }

  /** @type {HTMLElement | null} */
  let menu = null;
  /** @type {HTMLElement | null} */
  let opener = null;

  /** @param {Element} button @param {boolean} keyboard */
  function open(button, keyboard) {
    opener = /** @type {HTMLElement} */ (button.querySelector('button') || button);
    menu = build();
    const r = button.getBoundingClientRect();
    menu.style.top = `${Math.round(r.bottom + 4)}px`;
    menu.style.left = `${Math.max(8, Math.round(r.left))}px`;
    document.body.append(menu);
    opener.setAttribute('aria-expanded', 'true');
    if (keyboard) /** @type {HTMLElement | null} */ (menu.querySelector('a'))?.focus();
  }

  /** @param {boolean} [refocus] */
  function close(refocus = false) {
    if (!menu) return;
    menu.remove();
    menu = null;
    opener?.setAttribute('aria-expanded', 'false');
    if (refocus) opener?.focus();
  }

  // Capture on window runs before YouTube's own handler on the button, which would open the hidden sidebar.
  window.addEventListener('click', (e) => {
    if (!root.hasAttribute('data-drip-menu') || !(e.target instanceof Element)) return;
    const button = e.target.closest(SEL.guideButton);
    if (!button) {
      if (menu && !menu.contains(e.target)) close();
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (menu) close();
    else open(button, e.detail === 0);
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu) close(true); });
  document.addEventListener('yt-navigate-start', () => close());
  window.addEventListener('resize', () => close());

  /** With no menu button to open it, the menu can't work, so YouTube's sidebar comes back. */
  function checkButton() {
    root.toggleAttribute('data-drip-menu', !!document.querySelector(SEL.guideButton));
  }

  /** @type {Element | null} */
  let box = null;
  function shortenPlaceholder() {
    const input = box?.querySelector(SEL.searchInput);
    if (input && input.getAttribute('placeholder') !== 'Search') input.setAttribute('placeholder', 'Search');
  }
  // YouTube builds a new field whenever the box moves, so this watches the box itself, wherever it goes.
  const placeholderWatch = new MutationObserver(shortenPlaceholder);
  function watchSearch() {
    if (box?.isConnected) return;
    box = document.querySelector(SEL.searchBox);
    if (!box) return;
    placeholderWatch.disconnect();
    placeholderWatch.observe(box, { subtree: true, childList: true, attributes: true, attributeFilter: ['placeholder'] });
    shortenPlaceholder();
  }

  function onPage() {
    checkButton();
    watchSearch();
  }
  window.addEventListener('load', onPage);
  document.addEventListener('yt-navigate-finish', onPage);
  document.addEventListener('DOMContentLoaded', watchSearch);

  // The bell is a setting, hidden by default (Q16). A newer storage event wins over the first read.
  let known = false;
  /** @param {any} state */
  function setBell(state) {
    known = true;
    root.toggleAttribute('data-drip-hide-bell', state?.settings?.hideBell !== false);
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.drip) setBell(changes.drip.newValue);
  });
  chrome.storage.local.get('drip').then((stored) => { if (!known) setBell(stored.drip); }).catch(() => {});
})();
