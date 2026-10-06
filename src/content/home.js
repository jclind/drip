// @ts-check
// Replaces the home grid with the drip page. The grid stays hidden in the DOM (early.css), and this reads videos out of it.

(function () {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;
  /** @type {any} */
  const { send, h, onState, hourLabel, watchUrl } = /** @type {any} */ (globalThis).DripUI;

  // YouTube selectors. These break when YouTube changes its markup.
  const SEL = {
    homeBrowse: 'ytd-browse[page-subtype="home"]',
    mount: 'ytd-two-column-browse-results-renderer #primary',
    item: 'ytd-rich-item-renderer',
    link: 'a[href*="/watch?v="]',
    title: '#video-title, h3 a, h3',
    // Late 2026 markup uses camelCase classes (checked 2026-10-05); the kebab-case ones are the older markup.
    channel: '.ytContentMetadataViewModelMetadataText, .yt-content-metadata-view-model__metadata-text, ytd-channel-name a, ytd-channel-name #text',
    length: '.ytBadgeShapeText, .yt-badge-shape__text, .badge-shape-wiz__text, ytd-thumbnail-overlay-time-status-renderer #text',
    watched: 'ytd-thumbnail-overlay-resume-playback-renderer, yt-thumbnail-overlay-progress-bar-view-model, .ytThumbnailOverlayProgressBarHost',
    ad: 'ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer',
  };

  /** @type {any} */
  let state = null;
  let backlogOpen = false;
  let message = '';
  let disconnected = false;

  /**
   * @param {Element} root
   * @param {string} selector
   */
  function firstText(root, selector) {
    for (const el of root.querySelectorAll(selector)) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    return '';
  }

  /** Videos currently in the hidden grid, minus ads, Shorts, mixes, and ones already watched. */
  function readPool() {
    const browse = document.querySelector(SEL.homeBrowse);
    if (!browse) return [];
    /** @type {{id: string, title: string, channel: string, length: string}[]} */
    const pool = [];
    const ids = new Set();
    for (const item of browse.querySelectorAll(SEL.item)) {
      if (item.querySelector(SEL.ad) || item.querySelector(SEL.watched)) continue;
      const link = /** @type {HTMLAnchorElement | null} */ (item.querySelector(SEL.link));
      if (!link) continue;
      const url = new URL(link.href, location.origin);
      const id = url.searchParams.get('v');
      if (!id || url.searchParams.has('list') || ids.has(id)) continue;
      const title = firstText(item, SEL.title) || link.getAttribute('title') || '';
      if (!title) continue;
      ids.add(id);
      pool.push({ id, title, channel: firstText(item, SEL.channel), length: firstText(item, SEL.length) });
    }
    return pool;
  }

  /** Waits up to timeoutMs for the grid to have something in it. */
  async function waitForPool(timeoutMs = 6000) {
    const start = Date.now();
    let pool = readPool();
    while (pool.length === 0 && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 300));
      pool = readPool();
    }
    return pool;
  }

  /** @param {any} res */
  function absorb(res) {
    if (res && res.error === 'disconnected') disconnected = true;
    if (res && res.state) state = res.state;
    return res;
  }

  /** @param {string} error */
  function errorText(error) {
    const reset = state ? hourLabel(state.settings.resetHour) : 'the reset';
    switch (error) {
      case 'no-rec-tokens':
        return `No rec tokens left. More at ${reset}.`;
      case 'no-watch-tokens':
        return `No watch tokens left. More at ${reset}.`;
      case 'pool-empty':
        return "YouTube hasn't loaded anything new to show. No token spent. Try again after a refresh.";
      default:
        return 'Something went wrong. Refresh and try again.';
    }
  }

  async function onReveal() {
    message = '';
    const pool = await waitForPool();
    const res = absorb(await send({ type: 'reveal', candidates: pool }));
    if (res && !res.ok) message = errorText(res.error);
    render();
  }

  async function onAddTime() {
    message = '';
    const res = absorb(await send({ type: 'spendWatch' }));
    if (res && !res.ok) message = errorText(res.error);
    render();
  }

  /** @param {'watch' | 'save' | 'pass'} action */
  async function onResolve(action) {
    message = '';
    const res = absorb(await send({ type: 'resolve', action }));
    if (action === 'watch' && res && res.ok) {
      location.assign(watchUrl(res.video.id));
      return;
    }
    render();
  }

  /** @param {string} id */
  async function onRemove(id) {
    absorb(await send({ type: 'removeBacklog', id }));
    render();
  }

  /** @param {any} video */
  function card(video) {
    const meta = [video.channel, video.length].filter(Boolean).join(' · ');
    return h(
      'div',
      { class: 'drip-card' },
      h('a', { class: 'drip-thumb', href: watchUrl(video.id), onclick: (/** @type {Event} */ e) => { e.preventDefault(); onResolve('watch'); } },
        h('img', { src: `https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/hqdefault.jpg`, alt: '' })),
      h('div', { class: 'drip-card-title' }, video.title),
      meta && h('div', { class: 'drip-meta' }, meta),
      h(
        'div',
        { class: 'drip-row' },
        h('button', { class: 'drip-btn drip-primary', onclick: () => onResolve('watch') }, 'Watch'),
        h('button', { class: 'drip-btn', onclick: () => onResolve('save') }, 'Save'),
        h('button', { class: 'drip-btn', onclick: () => onResolve('pass') }, 'Pass'),
      ),
    );
  }

  function backlogList() {
    const items = [...state.backlog].reverse();
    const details = h(
      'details',
      { class: 'drip-backlog', open: backlogOpen },
      h('summary', {}, `Backlog (${items.length})`),
      items.length === 0
        ? h('div', { class: 'drip-meta drip-empty' }, 'Nothing saved yet.')
        : h(
            'ul',
            {},
            ...items.map((v) =>
              h(
                'li',
                {},
                h('a', { href: watchUrl(v.id) }, v.title),
                h('span', { class: 'drip-meta' }, [v.channel, v.length].filter(Boolean).join(' · ')),
                h('button', { class: 'drip-x', title: 'Remove from backlog', 'aria-label': 'Remove from backlog', onclick: () => onRemove(v.id) }, '×'),
              ),
            ),
          ),
    );
    details.addEventListener('toggle', () => {
      backlogOpen = /** @type {HTMLDetailsElement} */ (details).open;
    });
    return details;
  }

  function view() {
    if (disconnected) return h('div', { class: 'drip-message' }, 'drip was updated. Refresh this page.');
    if (!state) return h('div', { class: 'drip-meta' }, 'Loading…');
    const s = state.settings;
    return h(
      'div',
      {},
      h(
        'div',
        { class: 'drip-balances' },
        h('span', { class: 'drip-time' }, `${Drip.formatMinutes(state.watchSecondsLeft)} left today`),
        h('span', { class: 'drip-meta' }, `watch tokens ${state.tokens.watch} · rec tokens ${state.tokens.rec}`),
      ),
      h(
        'div',
        { class: 'drip-row' },
        !state.current && h('button', { class: 'drip-btn drip-primary', onclick: onReveal, disabled: state.tokens.rec < 1 }, 'Reveal next video · 1 rec'),
        h('button', { class: 'drip-btn', onclick: onAddTime, disabled: state.tokens.watch < 1 }, `Add ${s.minutesPerToken} min · 1 watch`),
      ),
      message && h('div', { class: 'drip-message' }, message),
      state.current && card(state.current),
      backlogList(),
    );
  }

  function render() {
    const root = document.getElementById('drip-home');
    if (root) root.replaceChildren(view());
  }

  /** Puts the drip page into the home browse page if it isn't there yet. */
  function mount() {
    if (location.pathname !== '/') return;
    const browse = document.querySelector(SEL.homeBrowse);
    if (!browse) return;
    if (browse.querySelector('#drip-home')) return;
    const target = browse.querySelector(SEL.mount) || browse;
    target.prepend(h('div', { id: 'drip-home' }));
    render();
    send({ type: 'get' }).then((res) => {
      absorb(res);
      render();
    });
  }

  onState((next) => {
    state = next;
    render();
  });
  document.addEventListener('yt-navigate-finish', mount);
  setInterval(mount, 500);
  mount();
})();
