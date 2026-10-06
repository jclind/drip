// @ts-check
// Search results: shows 10 at a time with a free "More results" button, and adds a Save button to each video.
// The injected shelves and ads are hidden in early.css.

(function () {
  /** @type {any} */
  const { send, h, onState, watchFor } = /** @type {any} */ (globalThis).DripUI;

  const PAGE = 10;

  // YouTube selectors. These break when YouTube changes its markup.
  const SEL = {
    results: 'ytd-search ytd-item-section-renderer #contents',
    continuation: 'ytd-search ytd-continuation-item-renderer',
    primary: 'ytd-search #primary',
    video: 'ytd-video-renderer',
    link: 'a#video-title, a[href*="/watch?v="]',
    title: '#video-title',
    channel: 'ytd-channel-name a, #channel-name a, #channel-name',
    length: 'ytd-thumbnail-overlay-time-status-renderer, .ytBadgeShapeText, .yt-badge-shape__text',
    saveSlot: '#meta, .text-wrapper',
  };
  // The shelves, ads, and promos in the list are hidden by early.css, so any other row that's on screen is a result.
  // Rows this script hid itself keep their mark so they stay counted.
  /** @param {Element} el */
  function isResult(el) {
    if (el.tagName === 'YTD-CONTINUATION-ITEM-RENDERER') return false;
    return el.hasAttribute('data-drip-over') || (getComputedStyle(el).display !== 'none' && /** @type {HTMLElement} */ (el).offsetHeight > 0);
  }

  /** @type {any} */
  let state = null;
  let shown = PAGE;
  let query = '';
  /** @type {HTMLElement | null} */
  let moreButton = null;
  /** @type {Element | null} */
  let watched = null;
  let queued = false;

  /** @param {Element} root @param {string} selector */
  function text(root, selector) {
    const el = root.querySelector(selector);
    return (el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /** @param {Element} row */
  function readVideo(row) {
    const link = /** @type {HTMLAnchorElement | null} */ (row.querySelector(SEL.link));
    const id = link ? new URL(link.href, location.origin).searchParams.get('v') : null;
    const length = /\d+(?::\d\d)+/.exec(text(row, SEL.length));
    return id ? { id, title: text(row, SEL.title) || link?.getAttribute('title') || '', channel: text(row, SEL.channel), length: length ? length[0] : '' } : null;
  }

  /** @param {string} id */
  function isSaved(id) {
    return !!state && state.backlog.some((/** @type {any} */ v) => v.id === id);
  }

  /** @param {HTMLElement} button */
  function paintSave(button) {
    const saved = isSaved(button.dataset.videoId || '');
    // Only write when it changed. Writing the same text still counts as a DOM change and would wake the observer.
    const label = saved ? 'In backlog' : 'Save';
    if (button.textContent !== label) button.textContent = label;
    /** @type {HTMLButtonElement} */ (button).disabled = saved;
  }

  /** @param {Element} row */
  function addSave(row) {
    const video = readVideo(row);
    if (!video) return;
    const existing = /** @type {HTMLElement | null} */ (row.querySelector('.drip-save'));
    if (existing) {
      if (existing.dataset.videoId === video.id) return paintSave(existing);
      existing.remove();
    }
    const button = h('button', { class: 'drip-btn drip-save', 'data-video-id': video.id, onclick: async () => {
      const current = readVideo(row) || video;
      await send({ type: 'addBacklog', video: current });
    } });
    paintSave(button);
    (row.querySelector(SEL.saveSlot) || row).append(h('div', { class: 'drip-save-row drip-ui' }, button));
  }

  function showMore() {
    shown += PAGE;
    apply();
  }

  function apply() {
    if (location.pathname !== '/results') {
      moreButton?.remove();
      moreButton = null;
      return;
    }
    if (location.search !== query) {
      query = location.search;
      shown = PAGE;
    }
    const items = [...document.querySelectorAll(SEL.results)].flatMap((c) => [...c.children]).filter(isResult);
    items.forEach((el, i) => {
      el.toggleAttribute('data-drip-over', i >= shown);
      if (i < shown && el.matches(SEL.video)) addSave(el);
    });
    // YouTube loads the next page only while its loader is on screen. Hold it back until the last button press
    // asks for more than the page has, so nothing loads (or flashes) before you click.
    for (const el of document.querySelectorAll(SEL.continuation)) el.toggleAttribute('data-drip-hold', items.length >= shown);
    const more = items.length > shown || (document.querySelector(SEL.continuation) !== null && items.length > 0);
    const search = document.querySelector('ytd-search');
    if (search && search !== watched) {
      watched = search;
      // Hide new rows the moment YouTube adds them, not at the next half-second check.
      new MutationObserver(() => {
        if (queued) return;
        queued = true;
        queueMicrotask(() => {
          queued = false;
          apply();
        });
      }).observe(search, { childList: true, subtree: true });
    }
    const primary = document.querySelector(SEL.primary);
    if (more && primary) {
      if (!moreButton) moreButton = h('div', { id: 'drip-more', class: 'drip-ui' }, h('button', { class: 'drip-btn', onclick: showMore }, 'More results'));
      if (moreButton.parentElement !== primary) primary.append(moreButton);
    } else if (moreButton) {
      moreButton.remove();
      moreButton = null;
    }
  }

  onState((next) => {
    state = next;
    apply();
  });
  send({ type: 'get' }).then((res) => {
    if (res && res.state) state = res.state;
    apply();
  });
  watchFor('search', SEL.results, (/** @type {string} */ path) => path === '/results');
  document.addEventListener('yt-navigate-finish', apply);
  setInterval(apply, 500);
  apply();
})();
