// @ts-check
// YouTube's sidebar becomes a short menu under its menu button, on every page and in every mode (design C, Jesse
// 2026-10-15). early.css hides the sidebar and its icon strip while <html> has data-drip-menu, and the bell while it has
// data-drip-hide-bell, and the Shorts shelves while it has data-drip-hide-shorts. All go on at document_start, so none
// shows for a moment first. This also keeps the search
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
  root.toggleAttribute('data-drip-hide-shorts', true);

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
    /** @type {any} */ (globalThis).DripIcons.paint(node, name);
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

  /**
   * A plain link would load a whole new page and lose the watch time watch.js hasn't sent yet, so guard.js hands
   * YouTube's links to its in-page navigation. A new-tab click, or Studio's link, goes the plain way.
   * @param {MouseEvent} e
   */
  function follow(e) {
    const link = /** @type {Element} */ (e.target).closest('a');
    if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const url = new URL(link.getAttribute('href') || '', location.href);
    if (url.origin !== location.origin) return;
    const handled = !document.dispatchEvent(new CustomEvent('drip-navigate', { cancelable: true, detail: url.pathname + url.search }));
    if (!handled) return;
    e.preventDefault();
    close();
  }

  // Capture on window runs before YouTube's own handler on the button, which would open the hidden sidebar.
  window.addEventListener('click', (e) => {
    if (!root.hasAttribute('data-drip-menu') || !(e.target instanceof Element)) return;
    const button = e.target.closest(SEL.guideButton);
    if (!button) {
      if (!menu) return;
      if (menu.contains(e.target)) follow(e);
      // Only the user's click outside closes it. Scripts click too: watch.js clicked YouTube's hidden autoplay switch
      // every second in a new profile, and the menu closed by itself (release review, 2026-11-10). A test's plain
      // event object has no isTrusted, so it counts as the user's.
      else if (e.isTrusted !== false) close();
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

  // The bell (Q16) and the Shorts shelves (Q2) are settings, hidden by default. A newer storage event wins over the
  // first read.
  let known = false;
  /** @param {any} state */
  function setHidden(state) {
    known = true;
    root.toggleAttribute('data-drip-hide-bell', state?.settings?.hideBell !== false);
    root.toggleAttribute('data-drip-hide-shorts', state?.settings?.hideShorts !== false);
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.drip) setHidden(changes.drip.newValue);
  });
  chrome.storage.local.get('drip').then((stored) => { if (!known) setHidden(stored.drip); }).catch(() => {});
})();
