// @ts-check
// Search results: shows 10 at a time with a free "More results" button, and adds a Save button to each video.
// A search with nothing left to show gets a "No results found" note. The cap and the Save buttons are mode parts
// (Q29), so Quiet shows every result with no buttons.
// The injected shelves and ads are hidden in early.css.

(function () {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;
  const { send, h, onState, watchFor } = /** @type {any} */ (globalThis).DripUI;
  /** @type {any} */
  const DripSwap = /** @type {any} */ (globalThis).DripSwap;

  const PAGE = 10;

  // YouTube selectors. These break when YouTube changes its markup.
  const SEL = {
    results: 'ytd-search ytd-item-section-renderer #contents',
    continuation: 'ytd-search ytd-continuation-item-renderer',
    primary: 'ytd-search #primary',
    video: 'ytd-video-renderer',
    link: 'a#video-title, a[href*="/watch?v="]',
    title: '#video-title',
    // The channel's link, or its name's text where it has no link. Never ytd-channel-name itself: its tooltip repeats
    // the name, so it read "Wood and Shop Wood and Shop" (signed in, 2026-11-10).
    channel: 'ytd-channel-name a, #channel-name a',
    channelText: 'ytd-channel-name #text, #channel-name #text',
    // Its href is the channel's /@handle (checked on air, 2026-11-03).
    channelLink: 'ytd-channel-name a[href]',
    length: 'ytd-thumbnail-overlay-time-status-renderer, .ytBadgeShapeText, .yt-badge-shape__text',
    saveSlot: '#meta, .text-wrapper',
    // "Did you mean" and "Showing results for" sit above results. On their own they mean nothing was found.
    hint: 'yt-did-you-mean-renderer, ytd-showing-results-for-renderer',
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
  /** @type {HTMLElement | null} */
  let emptyNote = null;
  /** @type {Element | null} */
  let watched = null;
  /** @type {MutationObserver | null} */
  let observer = null;
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
    const channelId = Drip.channelId(row.querySelector(SEL.channelLink)?.getAttribute('href') || '');
    return id ? {
      id, title: text(row, SEL.title) || link?.getAttribute('title') || '', channel: text(row, SEL.channel) || text(row, SEL.channelText), length: length ? length[0] : '',
      ...(channelId ? { channelIds: [channelId] } : {}),
    } : null;
  }

  /** @param {string} id */
  function isSaved(id) {
    return !!state && state.backlog.some((/** @type {any} */ v) => v.id === id);
  }

  /** @param {HTMLElement} button */
  function paintSave(button) {
    const saved = isSaved(button.dataset.videoId || '');
    // Only write when it changed. Writing the same text still counts as a DOM change and would wake the observer.
    const label = saved ? 'Stashed' : 'Stash';
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
    const button = h('button', { class: 'drip-btn drip-save', 'data-video-id': video.id, 'data-swap-anchor': true, onclick: async (/** @type {MouseEvent} */ e) => {
      if (swap && swap.button === button) return closeSwap();
      const current = readVideo(row) || video;
      const res = await send({ type: 'addBacklog', video: current });
      // A full stash asks which video to swap out instead (Q28).
      if (res && !res.ok && res.error === 'stash-full') {
        if (res.state) state = Drip.newer(state, res.state);
        // detail is 0 for a click from the keyboard (Enter or Space).
        openSwap(button, current, e.detail === 0);
      }
    } });
    paintSave(button);
    (row.querySelector(SEL.saveSlot) || row).append(h('div', { class: 'drip-save-row drip-ui' }, button));
  }

  // A full stash (Q28): the list under one result's Stash, and the note after a swap.
  /** @type {{button: HTMLElement, el: HTMLElement, video: any, ids: string[]} | null} */
  let swap = null;
  /** @type {{el: HTMLElement, dropped: any, index: number, newId: string, timer: number} | null} */
  let swapped = null;

  /** @param {HTMLElement} button @param {any} video @param {boolean} keyboard Opened from the keyboard, so it takes focus. */
  function openSwap(button, video, keyboard) {
    closeSwap();
    const el = DripSwap.picker({ backlog: state.backlog, onPick: (/** @type {any} */ drop) => onSwap(button, video, drop), onClose: closeSwap });
    button.setAttribute('aria-expanded', 'true');
    button.parentElement?.append(el);
    swap = { button, el, video, ids: state.backlog.map((/** @type {any} */ v) => v.id) };
    DripSwap.place(el, button);
    if (keyboard) el.focusFirst();
  }

  function closeSwap() {
    if (!swap) return;
    const { button, el } = swap;
    const had = el.contains(document.activeElement);
    swap = null;
    el.remove();
    button.removeAttribute('aria-expanded');
    if (had) button.focus();
  }

  /** The stash changed under the open list, say in another tab: it closes, or shows what's there now (Codex, 2026-11-05). */
  function followSwap() {
    if (!swap || !state) return;
    const what = Drip.swapFollow(swap.ids, state, swap.video.id);
    if (what === 'close') closeSwap();
    else if (what === 'redraw') openSwap(swap.button, swap.video, swap.el.contains(document.activeElement));
  }

  /** @param {HTMLElement} button @param {any} video @param {any} drop */
  async function onSwap(button, video, drop) {
    const index = state.backlog.findIndex((/** @type {any} */ v) => v.id === drop.id);
    closeSwap();
    const res = await send({ type: 'swapBacklog', video, dropId: drop.id });
    // The video picked went from the stash in the meantime: the list comes back with what's there now.
    if (res && !res.ok && res.error === 'not-stashed' && res.state) {
      state = Drip.newer(state, res.state);
      if (button.isConnected && Drip.swapFollow([], state, video.id) !== 'close') openSwap(button, video, false);
      return;
    }
    if (!res || !res.ok || !res.dropped) return;
    clearSwapped();
    const dropped = res.dropped;
    const el = DripSwap.note(dropped, onSwapUndo);
    button.parentElement?.append(el);
    swapped = { el, dropped, index, newId: video.id, timer: window.setTimeout(clearSwapped, DripSwap.UNDO_MS) };
  }

  function clearSwapped() {
    if (!swapped) return;
    clearTimeout(swapped.timer);
    swapped.el.remove();
    swapped = null;
  }

  async function onSwapUndo() {
    if (!swapped) return;
    const { dropped, index, newId } = swapped;
    clearSwapped();
    await send({ type: 'swapBacklog', video: dropped, dropId: newId, index });
  }

  function showMore() {
    shown += PAGE;
    apply();
  }

  function apply() {
    if (location.pathname !== '/results') {
      closeSwap();
      clearSwapped();
      moreButton?.remove();
      moreButton = null;
      emptyNote?.remove();
      emptyNote = null;
      return;
    }
    if (location.search !== query) {
      query = location.search;
      shown = PAGE;
      closeSwap();
      clearSwapped();
    }
    // Until the worker answers, the cap and the buttons are on, as in Full drip.
    const cap = !state || state.settings.searchCap !== false;
    const stash = !state || state.settings.stash !== false;
    const limit = cap ? shown : Infinity;
    const rows = [...document.querySelectorAll(SEL.results)].flatMap((c) => [...c.children]);
    const items = rows.filter(isResult);
    items.forEach((el, i) => {
      el.toggleAttribute('data-drip-over', i >= limit);
      if (i < limit && el.matches(SEL.video) && stash) addSave(el);
      else if (!stash) el.querySelector('.drip-save-row')?.remove();
    });
    if (!stash) closeSwap();
    // YouTube loads the next page only while its loader is on screen. Hold it back until the last button press
    // asks for more than the page has, so nothing loads (or flashes) before you click.
    for (const el of document.querySelectorAll(SEL.continuation)) el.toggleAttribute('data-drip-hold', items.length >= limit);
    const more = cap && (items.length > shown || (document.querySelector(SEL.continuation) !== null && items.length > 0));
    const search = document.querySelector('ytd-search');
    if (search && search !== watched) {
      watched = search;
      observer?.disconnect();
      // Hide new rows before the next frame paints them, not at the next half-second check. YouTube adds rows in
      // bursts, so one check per frame covers the whole burst and reads the rows' layout once (Codex, 2026-10-13).
      observer = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          apply();
        });
      });
      observer.observe(search, { childList: true, subtree: true });
    }
    const primary = document.querySelector(SEL.primary);
    if (more && primary) {
      if (!moreButton) moreButton = h('div', { id: 'drip-more', class: 'drip-ui' }, h('button', { class: 'drip-btn', onclick: showMore }, 'More results'));
      if (moreButton.parentElement !== primary) primary.append(moreButton);
    } else if (moreButton) {
      moreButton.remove();
      moreButton = null;
    }
    // Signed in, a search with no results comes back as only ads, which early.css hides, so the page is blank.
    // Say so ourselves once rows have arrived and nothing but a hint is shown. Signed out, YouTube's own message is a row.
    const empty = rows.some((el) => !el.matches(SEL.continuation)) && items.every((el) => el.matches(SEL.hint)) && !document.querySelector(SEL.continuation);
    if (empty && primary) {
      if (!emptyNote) emptyNote = h('div', { id: 'drip-no-results', class: 'drip-ui' }, h('div', { class: 'drip-no-results-title' }, 'No results found'), h('div', { class: 'drip-meta' }, 'Try different keywords or remove search filters'));
      if (emptyNote.parentElement !== primary) primary.append(emptyNote);
    } else if (emptyNote) {
      emptyNote.remove();
      emptyNote = null;
    }
  }

  onState((next) => {
    if (Drip.isOlder(next, state)) return;
    state = next;
    followSwap();
    apply();
  });
  send({ type: 'get' }).then((res) => {
    if (res && res.state) state = Drip.newer(state, res.state);
    apply();
  });
  watchFor('search', SEL.results, (/** @type {string} */ path) => path === '/results');
  document.addEventListener('yt-navigate-finish', apply);
  setInterval(apply, 500);
  apply();
})();
