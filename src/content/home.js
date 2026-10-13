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
  const DripStash = /** @type {any} */ (globalThis).DripStash;
  /** @type {any} */
  const DripReveal = /** @type {any} */ (globalThis).DripReveal;
  /** @type {any} */
  const DripPour = /** @type {any} */ (globalThis).DripPour;
  /** @type {any} */
  const DripCounter = /** @type {any} */ (globalThis).DripCounter;
  /** @type {any} */
  const DripSwap = /** @type {any} */ (globalThis).DripSwap;

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
      // Reveal with a card already up, or Reveal next and × on one that's gone: another tab got there first.
      case 'stale-card':
      case 'resolve-current':
      case 'no-current':
        return 'That card changed in another tab.';
      case 'not-stashed':
        return 'That video already left your stash, maybe in another tab.';
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
    try {
      await DripPour.pour({
        counter: from.counter, glass: glassEl, px: GLASS_PX, from: from.level, to: DripGlass.fraction(state),
        onLand: () => {
          heldLeft = null;
          render();
        },
      });
    } catch {
      // drip was updated under the page. The redraw below shows where things stand.
    }
    pouring = false;
    heldLeft = null;
    render();
  }

  /**
   * @param {'watch' | 'save' | 'unsave' | 'pass'} action @param {string} videoId The card the button was on.
   * @param {boolean} [keyboard] Pressed from the keyboard, so a full stash's list takes focus.
   */
  async function onResolve(action, videoId, keyboard = false) {
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
    // A full stash asks which video to swap out instead (Q28).
    if (res && !res.ok && res.error === 'stash-full') {
      leaving = false;
      swapFor = videoId;
      render();
      if (keyboard) /** @type {any} */ (swapEl)?.focusFirst();
      return;
    }
    if (res && !res.ok) message = errorText(res.error);
    if (action === 'watch' && res && res.ok) {
      // A stashed card that was started in another tab opens where it stopped, like its stash row (Codex).
      location.assign(resumeUrl(res.video.id));
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
    location.assign(resumeUrl(id));
  }

  /**
   * A stashed video's watch page, at the second it stopped, if it was started (Q28).
   * @param {string} id
   */
  function resumeUrl(id) {
    const video = state && state.backlog.find((/** @type {any} */ v) => v.id === id);
    return video && video.resumeSec ? `${watchUrl(id)}&t=${video.resumeSec}s` : watchUrl(id);
  }

  /** The card whose full-stash list is up, or ''. */
  let swapFor = '';
  /**
   * The list as built, kept across redraws like the thumbnail, so its scroll stays put and a click on a row isn't lost
   * when the page redraws mid-press. Minutes ticking down in another tab redraw the page every few seconds.
   * @type {HTMLElement | null}
   */
  let swapEl = null;
  /** What swapEl was built from: the card and the stash's ids. */
  let swapBuilt = '';

  /** The full-stash list for the card, built again only when the stash changes. */
  function swapList() {
    const built = JSON.stringify([swapFor, state.backlog.map((/** @type {any} */ v) => [v.id, v.resumeSec || 0])]);
    if (!swapEl || built !== swapBuilt) {
      swapEl = DripSwap.picker({ backlog: state.backlog, onPick: onSwap, onClose: closeSwap });
      swapBuilt = built;
      swapPlaced = false;
    }
    return swapEl;
  }
  /** Whether swapEl has been placed above or below its button since it was built. */
  let swapPlaced = false;
  /**
   * The last swap, for its "Swapped out … · Undo" note under the card: who went out, where it sat, and who came in.
   * @type {{dropped: any, index: number, newId: string, timer: number} | null}
   */
  let swapped = null;

  /** Closes the full-stash list. Focus goes back to Stash if it was in the list. */
  function closeSwap() {
    const had = !!document.querySelector('#drip-home .drip-swap')?.contains(document.activeElement);
    swapFor = '';
    render();
    if (had) /** @type {HTMLElement | null} */ (document.querySelector('#drip-home [data-k="save"]'))?.focus();
  }

  /** Swaps `drop` out of the stash for the card. @param {any} drop */
  async function onSwap(drop) {
    const video = state && state.current;
    if (!video) return;
    const index = state.backlog.findIndex((/** @type {any} */ v) => v.id === drop.id);
    swapFor = '';
    const res = absorb(await send({ type: 'swapBacklog', video, dropId: drop.id }));
    if (res && !res.ok) message = errorText(res.error);
    else if (res && res.dropped) {
      if (swapped) clearTimeout(swapped.timer);
      const timer = window.setTimeout(() => {
        swapped = null;
        render();
      }, DripSwap.UNDO_MS);
      swapped = { dropped: res.dropped, index, newId: video.id, timer };
    }
    render();
    focusOn('save');
  }

  /** Puts the swapped-out video back where it was, and takes the card's video back out. */
  async function onSwapUndo() {
    if (!swapped) return;
    const { dropped, index, newId, timer } = swapped;
    clearTimeout(timer);
    swapped = null;
    absorb(await send({ type: 'swapBacklog', video: dropped, dropId: newId, index }));
    render();
    focusOn('save');
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

  // Kept across renders, so a rebuild doesn't reload the thumbnail or jump the glass's water.
  /** @type {{id: string, el: HTMLElement} | null} */
  let thumbCache = null;
  /** @type {SVGSVGElement | null} */
  let glassEl = null;
  const GLASS_PX = 34;
  let lastCardId = '';
  /** The card's Stash as last drawn, so a rebuild after stashing fills the bookmark from where it was (stash.js). */
  let stashDrawn = { id: '', stashed: false };

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

  /**
   * The drop and card counts, kept across redraws like the glass, so a count can roll while the page redraws around it.
   * @type {Record<'watch' | 'rec', {row: HTMLElement, icon: HTMLElement, num: HTMLElement, sr: HTMLElement} | null>}
   */
  const counts = { watch: null, rec: null };

  /**
   * What a count shows: the balance, less what's still on its way in.
   * @param {'watch' | 'rec'} kind
   */
  function shownCount(kind) {
    const held = arriving ? Math.min(arriving[kind], state.tokens[kind]) : 0;
    return Math.max(0, state.tokens[kind] - held);
  }

  /** @param {'watch' | 'rec'} kind */
  function countRow(kind) {
    let c = counts[kind];
    if (!c) {
      const token = kind === 'watch' ? 'drop' : 'card';
      const n = shownCount(kind);
      const ic = icon(token, `drip-token-${token}`);
      const num = DripCounter.num(n);
      const sr = h('span', { class: 'drip-sr' });
      c = counts[kind] = { row: h('div', { class: `drip-count${n ? '' : ' is-zero'}` }, ic, num, sr), icon: ic, num, sr };
    }
    return c.row;
  }

  /**
   * Brings each count to what it shows now: a roll or a spin on a page in view, at once otherwise. While a landing
   * runs, a spend still counts at once, and what's still arriving stays held back.
   */
  function syncCounts() {
    if (!state) return;
    for (const kind of /** @type {const} */ (['watch', 'rec'])) {
      const c = counts[kind];
      if (!c) continue;
      const n = shownCount(kind);
      c.sr.textContent = kind === 'watch' ? (n === 1 ? ' drop' : ' drops') : n === 1 ? ' card' : ' cards';
      if (DripCounter.value(c.num) === n) continue;
      // Drops held back before a landing leave the count at once, under the lock's water.
      DripCounter.to(c.num, n, { animate: animates() && !document.hidden && !(arriving && !landing) });
    }
  }

  /**
   * How many digits the counts keep room for: enough for the most the settings allow, now or after a waiting change,
   * so a new digit moves nothing.
   */
  function countRoom() {
    const now = Drip.caps(state.settings);
    const next = Drip.caps({ ...state.settings, ...state.pending?.changes });
    return String(Math.max(now.watch, now.rec, next.watch, next.rec, state.tokens.watch, state.tokens.rec)).length;
  }

  function stats() {
    const left = Drip.formatMinutes(heldLeft ?? state.watchSecondsLeft);
    return h('div', { class: 'drip-stats' },
      h('div', { class: 'drip-glass-tile' }, glass()),
      h('div', { class: 'drip-time-block' },
        h('div', { class: 'drip-time' }, left),
        h('div', { class: 'drip-sub' }, 'left today')),
      h('div', { class: 'drip-counts', style: `--drip-room: ${countRoom()}` }, countRow('watch'), countRow('rec')));
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
      h('button', { class: 'drip-b drip-b-gray drip-card-save drip-stash', tabindex: '-1' }, ...DripStash.parts(false, { labelClass: 'drip-save-label' }).nodes),
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
    // Stashed or taken out since the last draw: the new button starts as the old one was, and the water moves.
    const fills = stashDrawn.id === video.id && stashDrawn.stashed !== saved;
    stashDrawn = { id: video.id, stashed: saved };
    const stash = DripStash.parts(fills ? !saved : saved, { labelClass: 'drip-save-label' });
    if (fills) stash.to(saved);
    const swapping = swapFor === video.id && !saved && !next;
    return h('div', { class: `drip-card${next ? ' is-next' : ''}${isNew ? ' is-new' : ''}`, 'aria-busy': next ? 'true' : undefined },
      thumbnail(video.id),
      h('div', { class: 'drip-card-title', title: video.title }, video.title),
      h('div', { class: 'drip-card-meta-row' },
        h('span', { class: 'drip-meta' }, meta),
        h('button', { class: 'drip-b drip-b-primary drip-watch', 'data-k': 'watch', disabled: next, onclick: () => onResolve('watch', video.id) },
          icon('play'), h('span', {}, 'Watch'), buys && price('drop'))),
      h('div', { class: 'drip-card-actions' },
        h('button', {
          class: `drip-b drip-b-gray drip-card-save drip-stash${saved ? ' is-saved' : ''}`, 'data-k': 'save', 'aria-pressed': String(saved), disabled: next,
          'data-swap-anchor': true, 'aria-expanded': swapping ? 'true' : undefined,
          // detail is 0 for a click from the keyboard (Enter or Space).
          onclick: (/** @type {MouseEvent} */ e) => (swapping ? closeSwap() : onResolve(saved ? 'unsave' : 'save', video.id, e.detail === 0)),
          title: saved ? 'In your stash. Click to take it out.' : 'Stash it for later',
        }, ...stash.nodes),
        h('button', {
          class: 'drip-b drip-b-gray drip-next', 'data-k': 'next', disabled: next || state.tokens.rec < 1,
          onclick: () => onRevealNext(video.id),
        }, icon('arrow'), h('span', { class: 'drip-next-label' }, next ? 'Revealing…' : 'Reveal next'), !next && price('card')),
        h('button', {
          class: 'drip-b drip-b-gray drip-pass', 'data-k': 'pass', disabled: next, onclick: () => onResolve('pass', video.id),
          title: "Pass. It's free, and this video won't come back.", 'aria-label': 'Pass',
        }, icon('x')),
        swapping && swapList()),
      swapped && swapped.newId === video.id && DripSwap.note(swapped.dropped, onSwapUndo));
  }

  /** @param {'empty' | 'card'} [as] Draw it as on that page. The reveal animation opens and folds it ahead of time. */
  function savedList(as) {
    const mode = as || (state.current || busy === 'reveal' ? 'card' : 'empty');
    const open = savedOpen[mode];
    const count = state.backlog.length;
    // What's left to watch, so a half-watched video counts only its unwatched part.
    const total = state.backlog.reduce((/** @type {number} */ sum, /** @type {any} */ v) => sum + DripSwap.leftSec(v), 0);
    const head = ['Stash'];
    if (count) head.push(`${count} of ${state.settings.stashMax}`);
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
            class: `drip-saved-row${DripSwap.fraction(video) > 0 ? ' has-bar' : ''}`,
            onclick: (/** @type {MouseEvent} */ e) => {
              if (/** @type {Element} */ (e.target).closest('.drip-saved-x, a')) return;
              onPlaySaved(video.id);
            },
          },
          h('a', {
            class: 'drip-saved-link', href: resumeUrl(video.id), 'data-k': `play-${video.id}`,
            onclick: (/** @type {MouseEvent} */ e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              onPlaySaved(video.id);
            },
          },
          h('span', { class: 'drip-saved-title' }, video.title || 'Untitled'),
          h('span', { class: 'drip-saved-meta' }, DripSwap.meta(video))),
          h('button', {
            class: 'drip-saved-x', 'data-k': `x-${video.id}`, title: 'Remove from stash', 'aria-label': `Remove ${video.title || 'video'} from stash`,
            onclick: () => onRemove(video.id),
          }, icon('x')),
          h('span', { class: 'drip-saved-play', 'aria-hidden': 'true' }, costsDrop(video.id) && h('span', { class: 'drip-saved-price' }, '-1', icon('drop', 'drip-token-drop')), icon('play')),
          DripSwap.bar(video))))),
      open && hidden > 0 && h('button', {
        class: 'drip-saved-more', 'data-k': 'more', onclick: () => { savedShowAll = !savedShowAll; render(); },
      }, h('span', {}, savedShowAll ? 'Show less' : `Show ${hidden} more`), icon('chevron-down', `drip-chevron${savedShowAll ? ' is-up' : ''}`)));
  }

  function view() {
    if (disconnected) return h('div', { class: 'drip-message' }, 'drip was updated. Refresh this page.');
    if (!state) return h('div', { class: 'drip-loading', 'aria-busy': 'true' });
    const note = outNote();
    const showCard = state.current || busy === 'reveal';
    // With a card up, the page is open: the stats sit a little higher (drip.css), as the reveal animation left them.
    return h('div', { class: `drip-page${showCard ? ' is-open' : ''}` },
      stats(),
      !showCard && actions(),
      state.current ? card(state.current) : busy === 'reveal' && placeholderCard(),
      (message || note) && h('div', { class: 'drip-message', role: 'status' }, message || note),
      savedList());
  }

  let rendered = '';
  /** The minutes the stats were last drawn with. */
  let drawnTime = '';

  /** Rebuilds the page only when something it shows changed. A button replaced mid-click loses the click. */
  function render() {
    const root = document.getElementById('drip-home');
    if (!root || moving || leaving) return;
    takeRefill();
    const key = JSON.stringify([state && [
      Drip.formatMinutes(state.watchSecondsLeft), state.watchSecondsLeft > 0, DripGlass.fraction(state).toFixed(3),
      state.tokens, state.current, state.backlog, state.unlocked, state.settings.feedSource, state.settings.minutesPerToken,
      state.settings.resetHour, state.settings.stashMax,
    ], message, busy, disconnected, savedOpen, savedShowAll, [...removed.keys()], heldLeft, pouring, arriving, swapFor, swapped && swapped.newId]);
    if (root.firstChild && key === rendered) return;
    rendered = key;
    // Keep keyboard focus on the same control across the rebuild.
    const focused = /** @type {HTMLElement | null} */ (document.activeElement)?.closest?.('[data-k]')?.getAttribute('data-k');
    root.classList.add('drip-ui');
    // The stats are centered as a group, so minutes that get wider ("50m" to "1h 5m") move it. It glides there instead
    // of jumping. Measured only when the minutes change, on a page in view.
    const time = state ? Drip.formatMinutes(heldLeft ?? state.watchSecondsLeft) : '';
    const glides = !!drawnTime && time !== drawnTime && !!glassEl?.isConnected && animates() && !document.hidden;
    drawnTime = time;
    const was = glides ? /** @type {SVGSVGElement} */ (glassEl).getBoundingClientRect().left : null;
    // Moving the kept list out and back in resets its scroll, so it's put back after.
    const listTop = swapEl?.querySelector('.drip-swap-list')?.scrollTop || 0;
    root.replaceChildren(view());
    syncCounts();
    if (swapEl && swapEl.isConnected) {
      if (!swapPlaced) {
        DripSwap.place(swapEl, root.querySelector('[data-k="save"]'));
        swapPlaced = true;
      }
      const list = swapEl.querySelector('.drip-swap-list');
      if (list) list.scrollTop = listTop;
    } else if (!swapFor) {
      swapEl = null;
    }
    if (was !== null && glassEl?.isConnected) {
      const dx = was - glassEl.getBoundingClientRect().left;
      if (Math.abs(dx) > 0.5) root.querySelector('.drip-stats')?.animate([{ translate: `${dx}px 0` }, { translate: '0 0' }], { duration: 420, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' });
    }
    // Without scrolling: a control kept across the redraw is already where it was.
    if (focused) /** @type {HTMLElement | null} */ (root.querySelector(`[data-k="${CSS.escape(focused)}"]`))?.focus({ preventScroll: true });
  }

  let refreshing = false;

  /** @param {number} ms */
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Drops and cards on their way into the counters, which the counts hold back until they land (counter.js): the drops
   * "Done for now" kept, or what the day's reset added. Set until the landing is over.
   * @type {{kind: 'kept' | 'new', watch: number, rec: number} | null}
   */
  let arriving = null;
  /** The landing is running. */
  let landing = false;
  /** The landing is waiting for the page to show. */
  let waiting = false;
  /** The reset whose refill this page has taken, so it plays once. */
  let refillTaken = '';
  /** When the lock's water last started falling away (watch.js onDone). */
  let lockFellAt = 0;
  document.addEventListener('drip-lock-falling', () => { lockFellAt = Date.now(); });

  /** drip's home page is on screen. */
  function homeInView() {
    const root = document.getElementById('drip-home');
    return !!root?.getClientRects().length && !document.hidden && document.documentElement.hasAttribute('data-drip-shown');
  }

  /** The drops the lock screen's "Done for now" left unspent land in the counter, read once (watch.js onDone). */
  function takeKept() {
    let kept = 0;
    try {
      kept = Number(sessionStorage.getItem(KEPT_KEY));
      sessionStorage.removeItem(KEPT_KEY);
    } catch {
      // Storage blocked: the drops are just there.
    }
    if (kept <= 0 || landing) return;
    arriving = { kind: 'kept', watch: kept, rec: 0 };
    rendered = '';
    landWhenShown();
  }

  /**
   * What the day's reset added lands in the counters once, on the first home page that shows it. A home page kept
   * hidden behind a watch page leaves it for when it's back in view.
   */
  function takeRefill() {
    const r = state && state.refill;
    if (!r || r.day !== state.day || r.day === refillTaken || arriving || !homeInView()) return;
    refillTaken = r.day;
    arriving = { kind: 'new', watch: r.watch, rec: r.rec };
    rendered = '';
    landWhenShown();
  }

  /**
   * Waits until the home page is in view, then lands what's arriving. After "Done for now" that's 250ms after the
   * lock's water starts falling away, as Jesse picked it (design round 2's D, 2026-10-13). Another tab that shows the
   * day's refill first takes it from this one.
   */
  async function landWhenShown() {
    if (waiting) return;
    waiting = true;
    const started = Date.now();
    try {
      while (arriving) {
        // Another tab showed the refill first, or the page never came into view: the counts just show the balance.
        if ((arriving.kind === 'new' && state && !state.refill) || Date.now() - started > 10000) {
          arriving = null;
          rendered = '';
          render();
          return;
        }
        const fell = lockFellAt >= started;
        // watch.js lets the water fall within 4 seconds of home showing. Past 6, the drops come in anyway.
        const lockUp = !!document.getElementById('drip-lock') && !fell && Date.now() - started < 6000;
        if (state && counts.watch?.row.isConnected && homeInView() && !lockUp && !moving) break;
        await sleep(50);
      }
      if (!arriving) return;
      await sleep(lockFellAt >= started ? 250 : 400);
      await land();
    } finally {
      waiting = false;
    }
  }

  async function land() {
    const a = arriving;
    try {
      if (!a || !state || !counts.watch || !counts.rec) return;
      landing = true;
      // Kept drops after a reset carry the refill in them already.
      if (state.refill) {
        refillTaken = state.refill.day;
        send({ type: 'refillSeen' }).then(absorb);
      }
      /** Lets `n` more of what's arriving into a count. @param {'watch' | 'rec'} kind */
      const release = (kind) => (/** @type {number} */ n, /** @type {any} */ roll = {}) => {
        if (arriving) arriving[kind] = Math.max(0, arriving[kind] - n);
        return DripCounter.to(/** @type {any} */ (counts[kind]).num, shownCount(kind), { animate: animates() && !document.hidden, ...roll });
      };
      await DripCounter.land({
        kind: a.kind,
        drops: { ...counts.watch, add: Math.min(a.watch, state.tokens.watch), release: release('watch') },
        cards: a.kind === 'new' ? { ...counts.rec, add: Math.min(a.rec, state.tokens.rec), release: release('rec') } : undefined,
      });
    } finally {
      arriving = null;
      landing = false;
      rendered = '';
      render();
    }
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
      // "Done for now" came back through YouTube's in-page navigation, to a home page drip had already built.
      if (navigated) {
        takeKept();
        render();
      }
      // Back home from a watch page after the reset.
      takeRefill();
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
    const root = h('div', { id: 'drip-home' });
    // A double-click's second click lands on whatever the first one drew there. With reduced motion, +15m bought two
    // drops and × said "Something went wrong" (2026-10-13). Nothing on the page needs a double-click.
    root.addEventListener('click', (e) => {
      if (e.detail > 1) e.stopPropagation();
    }, true);
    target.prepend(root);
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
