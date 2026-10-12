// @ts-check
// Replaces the home grid with the drip page. The grid stays hidden in the DOM (early.css), and this reads videos out of it.

(function () {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;
  /** @type {any} */
  const { send, h, onState, hourLabel, watchUrl, icon, price, KEPT_KEY, reportBroken, watchFor } = /** @type {any} */ (globalThis).DripUI;
  /** @type {any} */
  const DripGlass = /** @type {any} */ (globalThis).DripGlass;
  /** @type {any} */
  const DripReveal = /** @type {any} */ (globalThis).DripReveal;
  /** @type {any} */
  const DripPour = /** @type {any} */ (globalThis).DripPour;

  // YouTube selectors. These break when YouTube changes its markup.
  const SEL = {
    homeBrowse: 'ytd-browse[page-subtype="home"]',
    subsBrowse: 'ytd-browse[page-subtype="subscriptions"]',
    mount: 'ytd-two-column-browse-results-renderer #primary',
    item: 'ytd-rich-item-renderer, ytd-grid-video-renderer',
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

  /**
   * Videos currently in a feed's grid, minus ads, Shorts, mixes, and ones already watched.
   * @param {ParentNode} root The page, or a hidden frame's document.
   * @param {string} browseSelector
   */
  function readPool(root = document, browseSelector = SEL.homeBrowse) {
    const browse = root.querySelector(browseSelector);
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

  /** @param {{id: string}} video Not revealed before and not in the backlog, the same test reveal() applies. */
  function isNew(video) {
    return !!state && !state.seen.includes(video.id) && !state.backlog.some((/** @type {any} */ v) => v.id === video.id);
  }

  /**
   * Loads another feed in a hidden same-origin frame and reads its grid. The frame is on screen but invisible,
   * because YouTube only fills a feed that's in view. drip's scripts don't run inside it.
   * @param {string} path
   * @param {string} browseSelector
   */
  async function readFeedInFrame(path, browseSelector, timeoutMs = 15000) {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:900px;border:0;opacity:0;pointer-events:none;z-index:-1';
    frame.src = path;
    try {
      document.body.append(frame);
      await new Promise((resolve) => {
        frame.addEventListener('load', resolve, { once: true });
        setTimeout(resolve, timeoutMs);
      });
      const start = Date.now();
      let pool = [];
      while (Date.now() - start < timeoutMs) {
        const doc = frame.contentDocument;
        if (doc) pool = readPool(doc, browseSelector);
        if (pool.some(isNew)) break;
        // The first screenful can be all revealed already, so scroll to make YouTube load older videos.
        frame.contentWindow?.scrollTo(0, doc ? doc.documentElement.scrollHeight : 0);
        await new Promise((r) => setTimeout(r, 400));
      }
      return pool;
    } catch {
      return [];
    } finally {
      frame.remove();
    }
  }

  /** The videos the next reveal can pick from, newest first for subscriptions. */
  function readCandidates() {
    if (state && state.settings.feedSource === 'subscriptions') return readFeedInFrame('/feed/subscriptions', SEL.subsBrowse);
    return waitForPool();
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
        return `No cards left. More at ${reset}.`;
      case 'no-watch-tokens':
        return `No drops left. More at ${reset}.`;
      case 'stale-card':
        return 'That card changed in another tab.';
      case 'pool-empty':
        return state && state.settings.feedSource === 'subscriptions'
          ? 'Nothing new from your subscriptions. No card spent.'
          : "YouTube hasn't loaded anything new to show. No card spent. Try again after a refresh.";
      default:
        return 'Something went wrong. Refresh and try again.';
    }
  }

  /** What's in flight: a reveal from the empty page, or Reveal next on a card. The page shows a placeholder for it. */
  /** @type {'' | 'reveal' | 'next'} */
  let busy = '';
  /** The read for a reveal has taken longer than SLOW_MS. */
  let slow = false;
  const SLOW_MS = 5000;
  /** Watch was pressed and the watch page is loading. Redraws stop, so the card stays up instead of the empty page. */
  let leaving = false;

  /**
   * The reveal animation is running (reveal.js). It draws on the page's own elements until it's done, so render()
   * waits, and the page is drawn once at the end.
   */
  let moving = false;

  /** Reveals, Reveal next, and Pass animate unless the browser asks for reduced motion. */
  const animates = () => !DripReveal.reduced();

  /**
   * Reads the feed, then sends `msg` with the videos it found. Resolves with the worker's reply when it worked, or
   * null after setting the message that says why not.
   * @param {Record<string, unknown>} msg
   */
  async function findWith(msg) {
    // A slow read (Subscriptions can take 15 seconds) says so on the loading card. The animation holds redraws, so the
    // text changes in place.
    slow = false;
    const timer = setTimeout(() => {
      slow = true;
      for (const el of document.querySelectorAll('#drip-home .drip-card.is-loading .drip-meta')) el.textContent = loadingText();
    }, SLOW_MS);
    try {
      const pool = await readCandidates();
      // No videos at all, not just none new: the grid's markup changed (Q25).
      const homeFeed = !state || state.settings.feedSource !== 'subscriptions';
      if (homeFeed && pool.length === 0 && !document.querySelector(`${SEL.homeBrowse} :is(${SEL.item})`)) {
        reportBroken('grid', SEL.item);
        message = errorText('pool-empty');
        return null;
      }
      const res = absorb(await send({ ...msg, candidates: pool }));
      if (res && !res.ok) message = errorText(res.error);
      return res && res.ok ? res : null;
    } finally {
      clearTimeout(timer);
      slow = false;
    }
  }

  /**
   * Reveal and Reveal next. Shared by both.
   * @param {'reveal' | 'next'} kind
   * @param {Record<string, unknown>} msg
   */
  async function revealWith(kind, msg) {
    if (busy || moving) return;
    busy = kind;
    message = '';
    if (animates()) {
      const run = kind === 'reveal' ? DripReveal.reveal : DripReveal.next;
      const { ok, focused } = await animate(run, async () => (await findWith(msg))?.video || null);
      // The button that had focus is gone. Focus goes to what you'd press next.
      if (focused) focusOn(ok ? (kind === 'reveal' ? 'watch' : 'next') : kind === 'reveal' ? 'reveal' : 'next');
      return;
    }
    render();
    try {
      await findWith(msg);
    } finally {
      busy = '';
      render();
    }
  }

  /**
   * Runs one of reveal.js's animations, then draws the page once. reveal.js's last frame looks like the page this
   * draws, so nothing jumps.
   * @param {(o: any) => Promise<boolean | void>} run
   * @param {() => Promise<any>} find Finds and pays for the video a reveal shows.
   * @returns {Promise<{ok: boolean, focused: boolean}>} Whether it worked, and whether drip's page had keyboard focus.
   */
  async function animate(run, find) {
    const root = /** @type {HTMLElement} */ (document.getElementById('drip-home'));
    const page = root.querySelector('.drip-page');
    const focused = root.contains(document.activeElement);
    moving = true;
    let ok = false;
    try {
      ok = !!(await run({
        root, page, find,
        counter: page?.querySelector('.drip-stats .drip-token-card'),
        card: (/** @type {any} */ video) => (video ? card(video) : openingCard()),
        actions,
        ready: (/** @type {any} */ video) => thumbReady(video.id),
        saved: {
          now: () => root.querySelector('.drip-saved'),
          build: (/** @type {boolean} */ open) => savedList(open ? 'empty' : 'card'),
        },
      }));
    } finally {
      moving = false;
      busy = '';
      rendered = '';
      render();
    }
    return { ok, focused };
  }

  /**
   * Puts keyboard focus on a control by its data-k, if nothing on drip's page has it.
   * @param {string} key
   */
  function focusOn(key) {
    const root = document.getElementById('drip-home');
    if (!root || root.contains(document.activeElement)) return;
    /** @type {HTMLElement | null} */ (root.querySelector(`[data-k="${key}"]`))?.focus();
  }

  function onReveal() {
    return revealWith('reveal', { type: 'reveal' });
  }

  /** @param {string} videoId The card the button was on. */
  function onRevealNext(videoId) {
    return revealWith('next', { type: 'revealNext', videoId });
  }

  /** While +15m's drop is in the air, the glass is pour.js's and the minutes read what they were until it lands. */
  let pouring = false;
  /** @type {number | null} */
  let heldLeft = null;

  async function onAddTime() {
    if (pouring) return;
    message = '';
    const counter = document.querySelector('#drip-home .drip-stats .drip-token-drop');
    // A tab in the background has nobody to watch the drop.
    const pours = animates() && !document.hidden && !!counter && !!glassEl?.isConnected && !!state;
    const from = pours ? { counter: /** @type {Element} */ (counter).getBoundingClientRect(), level: DripGlass.fraction(state) } : null;
    if (from) {
      pouring = true;
      heldLeft = state.watchSecondsLeft;
    }
    const res = absorb(await send({ type: 'spendWatch' }));
    if (!from || !res || !res.ok) {
      pouring = false;
      heldLeft = null;
      if (res && !res.ok) message = errorText(res.error);
      render();
      return;
    }
    render();
    await DripPour.pour({
      counter: from.counter, glass: glassEl, px: GLASS_PX, from: from.level, to: DripGlass.fraction(state),
      onLand: () => {
        heldLeft = null;
        render();
      },
    });
    pouring = false;
    render();
  }

  /** @param {'watch' | 'save' | 'unsave' | 'pass'} action @param {string} videoId The card the button was on. */
  async function onResolve(action, videoId) {
    if (moving) return;
    message = '';
    if (action === 'pass' && animates() && document.querySelector('#drip-home .drip-card .drip-deal')) {
      // Redraws wait while the worker answers, so the card is still there to animate.
      moving = true;
      const res = absorb(await send({ type: 'resolve', action, videoId }));
      moving = false;
      if (!res || !res.ok) {
        message = errorText(res ? res.error : '');
        render();
        return;
      }
      const { focused } = await animate(DripReveal.pass, async () => null);
      if (focused) focusOn('reveal');
      return;
    }
    // The worker's save redraws the page through the storage listener, which would show the empty page while the
    // watch page loads.
    if (action === 'watch') leaving = true;
    const res = absorb(await send({ type: 'resolve', action, videoId }));
    if (res && !res.ok) message = errorText(res.error);
    if (action === 'watch' && res && res.ok) {
      location.assign(watchUrl(res.video.id));
      return;
    }
    leaving = false;
    render();
  }

  /**
   * Plays a saved video. At 0 minutes this buys a drop's minutes first, like Watch on the card (Q18).
   * @param {string} id
   */
  async function onPlaySaved(id) {
    // The card showing now, saved and played from the list, ends as Watch, the same as its Watch button (Codex).
    if (state && state.current && state.current.id === id) return onResolve('watch', id);
    if (state && state.watchSecondsLeft <= 0) absorb(await send({ type: 'buyIfOut', videoId: id }));
    location.assign(watchUrl(id));
  }

  /**
   * Whether watching this video now costs a drop: no minutes left, a drop to spend, and not unlocked (Q18).
   * @param {string} id
   */
  function costsDrop(id) {
    return state.watchSecondsLeft <= 0 && state.tokens.watch > 0 && !state.unlocked.includes(id);
  }

  /**
   * Saved rows removed in the last few seconds, shown as "Removed · Undo" where they were. `before` is the ids that sat
   * before the row, oldest first, counting other rows still waiting on Undo, so several undos in any order restore the
   * original order (Codex).
   * @type {Map<string, {video: any, before: string[], timer: number}>}
   */
  const removed = new Map();
  const UNDO_MS = 5000;

  /** @param {string} id */
  async function onRemove(id) {
    if (!state) return;
    const video = state.backlog.find((/** @type {any} */ v) => v.id === id);
    if (!video) return;
    const rows = savedRows();
    const before = rows.slice(0, rows.findIndex((r) => r.video.id === id)).map((r) => r.video.id);
    const timer = window.setTimeout(() => {
      removed.delete(id);
      render();
    }, UNDO_MS);
    removed.set(id, { video, before, timer });
    absorb(await send({ type: 'removeBacklog', id }));
    render();
  }

  /** @param {string} id */
  async function onUndo(id) {
    const entry = removed.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    removed.delete(id);
    const index = state ? state.backlog.filter((/** @type {any} */ v) => entry.before.includes(v.id)).length : undefined;
    absorb(await send({ type: 'addBacklog', video: entry.video, index }));
    render();
  }

  /**
   * Saved, oldest first like the backlog, with rows removed in the last few seconds back where they were.
   * @returns {{video: any, removed: boolean}[]}
   */
  function savedRows() {
    const rows = state.backlog.map((/** @type {any} */ video) => ({ video, removed: false }));
    for (const entry of removed.values()) {
      if (rows.some((r) => r.video.id === entry.video.id)) continue;
      const at = rows.filter((r) => entry.before.includes(r.video.id)).length;
      rows.splice(at, 0, { video: entry.video, removed: true });
    }
    return rows;
  }

  // Whether Saved is open, kept separately for the empty page (open by default) and while a card is up (collapsed).
  const savedOpen = { empty: true, card: false };
  let savedShowAll = false;

  /**
   * Seconds in a length string like "8:31" or "1:02:03", or 0 when there's none.
   * @param {string} length
   */
  function lengthSeconds(length) {
    if (!/^\d+(:\d{1,2}){1,2}$/.test(length || '')) return 0;
    return length.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  }

  // Kept across renders, so a rebuild doesn't reload the thumbnail or jump the glass's water.
  /** @type {{id: string, el: HTMLElement} | null} */
  let thumbCache = null;
  /** @type {SVGSVGElement | null} */
  let glassEl = null;
  const GLASS_PX = 34;
  let lastCardId = '';

  /** Resolves when a thumbnail from thumbnail() has loaded, or failed in both sizes. */
  /** @type {WeakMap<HTMLElement, Promise<void>>} */
  const thumbLoads = new WeakMap();

  /**
   * The card's box for a video: a face-up card (reveal.js) with the thumbnail on its front.
   * @param {string} id
   */
  function thumbnail(id) {
    if (thumbCache && thumbCache.id === id) return thumbCache.el;
    const img = /** @type {HTMLImageElement} */ (h('img', { alt: '', decoding: 'async' }));
    /** @type {() => void} */
    let loaded = () => {};
    const done = new Promise((resolve) => { loaded = () => resolve(undefined); });
    // hq720 is 16:9 with no black bars, but some videos don't have it. Then YouTube answers with a 120px gray
    // placeholder, or an error, and hqdefault is the fallback.
    const fallback = () => {
      if (img.src.includes('/hqdefault.jpg')) return false;
      img.src = `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
      return true;
    };
    img.addEventListener('load', () => {
      if (img.naturalWidth <= 120 && fallback()) return;
      img.classList.add('is-loaded');
      loaded();
    });
    img.addEventListener('error', () => {
      if (!fallback()) loaded();
    });
    img.src = `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hq720.jpg`;
    const el = h('a', {
      class: 'drip-thumb is-dealt', href: watchUrl(id), tabindex: '-1', 'aria-hidden': 'true',
      onclick: (/** @type {Event} */ e) => { e.preventDefault(); onResolve('watch', id); },
    }, DripReveal.dealCard(img, true));
    thumbCache = { id, el };
    thumbLoads.set(el, done);
    return el;
  }

  /**
   * Resolves once the thumbnail for `id` can show: loaded, failed in both sizes, or still loading after 8 seconds, when
   * the card turns over onto its gray front rather than wait any longer.
   * @param {string} id
   */
  function thumbReady(id) {
    const done = thumbLoads.get(thumbnail(id)) || Promise.resolve();
    return Promise.race([done, new Promise((r) => setTimeout(r, 8000))]);
  }

  function glass() {
    const fraction = DripGlass.fraction(state);
    if (!glassEl) glassEl = DripGlass.make(fraction, GLASS_PX);
    else if (!pouring) DripGlass.set(glassEl, fraction, GLASS_PX);
    return glassEl;
  }

  function stats() {
    const left = Drip.formatMinutes(heldLeft ?? state.watchSecondsLeft);
    const { watch, rec } = state.tokens;
    return h('div', { class: 'drip-stats' },
      h('div', { class: 'drip-glass-tile' }, glass()),
      h('div', { class: 'drip-time-block' },
        h('div', { class: 'drip-time' }, left),
        h('div', { class: 'drip-sub' }, 'left today')),
      h('div', { class: 'drip-counts' },
        h('div', { class: `drip-count${watch ? '' : ' is-zero'}` }, icon('drop', 'drip-token-drop'), h('span', {}, String(watch)), h('span', { class: 'drip-sr' }, watch === 1 ? ' drop' : ' drops')),
        h('div', { class: `drip-count${rec ? '' : ' is-zero'}` }, icon('card', 'drip-token-card'), h('span', {}, String(rec)), h('span', { class: 'drip-sr' }, rec === 1 ? ' card' : ' cards'))));
  }

  /** The gray line under the buttons when something has run out. */
  function outNote() {
    const reset = hourLabel(state.settings.resetHour);
    const noDrops = state.tokens.watch < 1;
    const noCards = state.tokens.rec < 1;
    if (state.current) return noCards ? `No cards left. More at ${reset}.` : '';
    if (noDrops && noCards && state.watchSecondsLeft <= 0) return `You're out for today. Drops and cards refill at ${reset}.`;
    if (noCards) return `No cards left. More at ${reset}.`;
    if (noDrops) return `No drops left. More at ${reset}.`;
    return '';
  }

  function actions() {
    const s = state.settings;
    return h('div', { class: 'drip-actions' },
      h('button', {
        class: 'drip-b drip-b-gray drip-add', 'data-k': 'add', onclick: onAddTime, disabled: state.tokens.watch < 1,
        title: `Add ${s.minutesPerToken} minutes for 1 drop`,
      }, icon('clock'), h('span', {}, `+${Drip.formatMinutes(s.minutesPerToken * 60)}`), price('drop')),
      h('button', {
        // While the animation runs, it draws these buttons as they'll be once it's done.
        class: 'drip-b drip-b-gold drip-reveal', 'data-k': 'reveal', onclick: onReveal, disabled: state.tokens.rec < 1 || (!!busy && !moving),
      }, h('span', {}, 'Reveal video'), price('card')));
  }

  /** What the loading card says, which changes once the read has taken SLOW_MS. */
  function loadingText() {
    const subs = state.settings.feedSource === 'subscriptions';
    if (slow) return subs ? 'Still checking. Subscriptions can take 15 seconds.' : 'Still looking…';
    return subs ? 'Checking your subscriptions…' : 'Finding a video…';
  }

  /** The reveal card while a reveal from the empty page reads the feed. Same size as the real one, so nothing jumps. */
  function placeholderCard() {
    return h('div', { class: 'drip-card is-loading', 'aria-busy': 'true' },
      h('div', { class: 'drip-thumb' }),
      h('div', { class: 'drip-card-title' }, h('span', { class: 'drip-skel' }), h('span', { class: 'drip-skel drip-skel-short' })),
      h('div', { class: 'drip-card-meta-row' }, h('span', { class: 'drip-meta' }, loadingText())));
  }

  /**
   * The loading card with the card's buttons under it, which the reveal animation opens up and turns +15m and Reveal
   * video into (reveal.js). Nothing on it is clickable until the real card replaces it.
   */
  function openingCard() {
    const el = placeholderCard();
    el.append(h('div', { class: 'drip-card-actions' },
      h('button', { class: 'drip-b drip-b-gray drip-card-save', tabindex: '-1' }, icon('save'), h('span', { class: 'drip-save-label' }, 'Stash')),
      h('button', { class: 'drip-b drip-b-gray drip-next', tabindex: '-1' }, icon('arrow'), h('span', { class: 'drip-next-label' }, 'Reveal next'), price('card')),
      h('button', { class: 'drip-b drip-b-gray drip-pass', tabindex: '-1', 'aria-label': 'Pass' }, icon('x'))));
    return el;
  }

  /** @param {any} video */
  function card(video) {
    const saved = state.backlog.some((/** @type {any} */ v) => v.id === video.id);
    const meta = [video.channel, video.length].filter(Boolean).join(' · ');
    // At 0 minutes Watch buys a drop's minutes and plays (Q18). With no drops either, it goes to the lock screen.
    const buys = costsDrop(video.id);
    // The animation shows Reveal next its own way, and draws the card as it'll be once it's done.
    const next = busy === 'next' && !moving;
    // Only a newly revealed card rises in. Rebuilds for Save and the like leave it still.
    const isNew = video.id !== lastCardId;
    lastCardId = video.id;
    return h('div', { class: `drip-card${next ? ' is-next' : ''}${isNew ? ' is-new' : ''}`, 'aria-busy': next ? 'true' : undefined },
      thumbnail(video.id),
      h('div', { class: 'drip-card-title', title: video.title }, video.title),
      h('div', { class: 'drip-card-meta-row' },
        h('span', { class: 'drip-meta' }, meta),
        h('button', { class: 'drip-b drip-b-primary drip-watch', 'data-k': 'watch', disabled: next, onclick: () => onResolve('watch', video.id) },
          icon('play'), h('span', {}, 'Watch'), buys && price('drop'))),
      h('div', { class: 'drip-card-actions' },
        h('button', {
          class: `drip-b drip-b-gray drip-card-save${saved ? ' is-saved' : ''}`, 'data-k': 'save', 'aria-pressed': String(saved), disabled: next,
          onclick: () => onResolve(saved ? 'unsave' : 'save', video.id), title: saved ? 'In your stash. Click to take it out.' : 'Stash it for later',
        }, icon('save'), h('span', { class: 'drip-save-label' }, saved ? 'Stashed' : 'Stash')),
        h('button', {
          class: 'drip-b drip-b-gray drip-next', 'data-k': 'next', disabled: next || state.tokens.rec < 1,
          onclick: () => onRevealNext(video.id),
        }, icon('arrow'), h('span', { class: 'drip-next-label' }, next ? 'Revealing…' : 'Reveal next'), !next && price('card')),
        h('button', {
          class: 'drip-b drip-b-gray drip-pass', 'data-k': 'pass', disabled: next, onclick: () => onResolve('pass', video.id),
          title: "Pass. It's free, and this video won't come back.", 'aria-label': 'Pass',
        }, icon('x'))));
  }

  /** @param {'empty' | 'card'} [as] Draw it as on that page. The reveal animation opens and folds it ahead of time. */
  function savedList(as) {
    const mode = as || (state.current || busy === 'reveal' ? 'card' : 'empty');
    const open = savedOpen[mode];
    const count = state.backlog.length;
    const total = state.backlog.reduce((/** @type {number} */ sum, /** @type {any} */ v) => sum + lengthSeconds(v.length), 0);
    const head = ['Stash'];
    if (count) head.push(`${count} ${count === 1 ? 'video' : 'videos'}`);
    if (total) head.push(Drip.formatMinutes(total));

    // Newest first.
    const rows = savedRows().reverse();
    const shown = savedShowAll ? rows : rows.slice(0, 3);
    const hidden = rows.length - 3;

    return h('section', { class: `drip-saved${open ? ' is-open' : ''}` },
      h('button', {
        class: 'drip-saved-head', 'data-k': 'saved-head', 'aria-expanded': String(open),
        onclick: () => { savedOpen[mode] = !open; render(); },
      }, icon('chevron-down', 'drip-chevron'), h('span', {}, head.join(' · '))),
      open && (rows.length === 0
        ? h('div', { class: 'drip-saved-empty' }, 'Videos you stash show up here.')
        : h('ul', { class: 'drip-saved-list' }, ...shown.map(({ video, removed: gone }) => gone
          ? h('li', { class: 'drip-saved-row is-removed' },
            h('span', {}, 'Removed'), h('span', { class: 'drip-sep', 'aria-hidden': 'true' }, '·'),
            h('button', { class: 'drip-undo', 'data-k': `undo-${video.id}`, onclick: () => onUndo(video.id) }, 'Undo'))
          : h('li', {
            class: 'drip-saved-row',
            onclick: (/** @type {MouseEvent} */ e) => {
              if (/** @type {Element} */ (e.target).closest('.drip-saved-x, a')) return;
              onPlaySaved(video.id);
            },
          },
          h('a', {
            class: 'drip-saved-link', href: watchUrl(video.id), 'data-k': `play-${video.id}`,
            onclick: (/** @type {MouseEvent} */ e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              onPlaySaved(video.id);
            },
          },
          h('span', { class: 'drip-saved-title' }, video.title || 'Untitled'),
          h('span', { class: 'drip-saved-meta' }, [video.channel, video.length].filter(Boolean).join(' · '))),
          h('button', {
            class: 'drip-saved-x', 'data-k': `x-${video.id}`, title: 'Remove from stash', 'aria-label': `Remove ${video.title || 'video'} from stash`,
            onclick: () => onRemove(video.id),
          }, icon('x')),
          h('span', { class: 'drip-saved-play', 'aria-hidden': 'true' }, costsDrop(video.id) && h('span', { class: 'drip-saved-price' }, '-1', icon('drop', 'drip-token-drop')), icon('play')))))),
      open && hidden > 0 && h('button', {
        class: 'drip-saved-more', 'data-k': 'more', onclick: () => { savedShowAll = !savedShowAll; render(); },
      }, h('span', {}, savedShowAll ? 'Show less' : `Show ${hidden} more`), icon('chevron-down', `drip-chevron${savedShowAll ? ' is-up' : ''}`)));
  }

  function view() {
    if (disconnected) return h('div', { class: 'drip-message' }, 'drip was updated. Refresh this page.');
    if (!state) return h('div', { class: 'drip-loading', 'aria-busy': 'true' });
    const note = outNote();
    const showCard = state.current || busy === 'reveal';
    // The kept drops rise in once, as the lock's water falls away. Rebuilds after that leave the message still.
    const rises = !!message && message === keptMessage;
    // With a card up, the page is open: the stats sit a little higher (drip.css), as the reveal animation left them.
    return h('div', { class: `drip-page${showCard ? ' is-open' : ''}` },
      stats(),
      !showCard && actions(),
      state.current ? card(state.current) : busy === 'reveal' && placeholderCard(),
      (message || note) && h('div', { class: `drip-message${rises ? ' is-kept' : ''}`, role: 'status' }, message || note),
      savedList());
  }

  let rendered = '';

  /** Rebuilds the page only when something it shows changed. A button replaced mid-click loses the click. */
  function render() {
    const root = document.getElementById('drip-home');
    if (!root || moving || leaving) return;
    const key = JSON.stringify([state && [
      Drip.formatMinutes(state.watchSecondsLeft), state.watchSecondsLeft > 0, DripGlass.fraction(state).toFixed(3),
      state.tokens, state.current, state.backlog, state.unlocked, state.settings.feedSource, state.settings.minutesPerToken,
      state.settings.resetHour,
    ], message, busy, disconnected, savedOpen, savedShowAll, [...removed.keys()], heldLeft, pouring]);
    if (root.firstChild && key === rendered) return;
    rendered = key;
    // Keep keyboard focus on the same control across the rebuild.
    const focused = /** @type {HTMLElement | null} */ (document.activeElement)?.closest?.('[data-k]')?.getAttribute('data-k');
    root.classList.add('drip-ui');
    root.replaceChildren(view());
    keptSeen(root);
    if (focused) /** @type {HTMLElement | null} */ (root.querySelector(`[data-k="${CSS.escape(focused)}"]`))?.focus();
  }

  let refreshing = false;

  /** "Kept 3 drops." until it has been drawn once with its rise. */
  let keptMessage = '';

  /**
   * The message has risen once it's drawn on a page that shows. YouTube keeps the home page hidden until its data
   * arrives, and builds drawn before then keep the rise for when it shows.
   * @param {HTMLElement} root
   */
  function keptSeen(root) {
    if (keptMessage && root.getClientRects().length && document.documentElement.hasAttribute('data-drip-shown')) keptMessage = '';
  }

  /** Shows the drops the lock screen's "Done for now" left unspent, read once (watch.js onDone). */
  function takeKept() {
    let kept = 0;
    try {
      kept = Number(sessionStorage.getItem(KEPT_KEY));
      sessionStorage.removeItem(KEPT_KEY);
    } catch {
      // Storage blocked: no message.
    }
    if (kept <= 0) return;
    message = keptMessage = `Kept ${kept} ${kept === 1 ? 'drop' : 'drops'}.`;
    // The same words may already be on the page from last time. Rebuild anyway, so they rise now.
    rendered = '';
  }

  /**
   * Puts the drip page into the home browse page if it isn't there yet.
   * @param {boolean} [navigated] YouTube just finished a navigation, rather than the half-second check.
   */
  function mount(navigated = false) {
    if (location.pathname !== '/') return;
    const browse = document.querySelector(SEL.homeBrowse);
    if (!browse) return;
    if (browse.querySelector('#drip-home')) {
      const root = /** @type {HTMLElement} */ (browse.querySelector('#drip-home'));
      // "Done for now" came back through YouTube's in-page navigation, to a home page drip had already built.
      if (navigated) {
        takeKept();
        render();
      }
      keptSeen(root);
      // A page left open past the reset asks once for the new day's balances.
      if (state && !refreshing && Drip.dayKey(Date.now(), state.settings.resetHour) > state.day) {
        refreshing = true;
        send({ type: 'get' }).then((res) => {
          absorb(res);
          refreshing = false;
          render();
        });
      }
      return;
    }
    const target = browse.querySelector(SEL.mount) || browse;
    target.prepend(h('div', { id: 'drip-home' }));
    takeKept();
    rendered = '';
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
  watchFor('home', SEL.homeBrowse, (/** @type {string} */ path) => path === '/');
  document.addEventListener('yt-navigate-finish', () => mount(true));
  // Back from the watch page can bring this page back from Chrome's cache, still waiting on Watch.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted || !leaving) return;
    leaving = false;
    mount(true);
  });
  setInterval(() => mount(), 500);
  mount();
})();
