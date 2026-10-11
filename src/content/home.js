// @ts-check
// Replaces the home grid with the drip page. The grid stays hidden in the DOM (early.css), and this reads videos out of it.

(function () {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;
  /** @type {any} */
  const { send, h, onState, hourLabel, watchUrl, reportBroken, watchFor } = /** @type {any} */ (globalThis).DripUI;
  /** @type {any} */
  const DripGlass = /** @type {any} */ (globalThis).DripGlass;

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
  /** A source change still saving. Reveal waits for it, so it reads the feed that was just picked. */
  let sourceSaving = Promise.resolve();

  /**
   * Reads the feed, then sends `msg` with the videos it found. Shared by Reveal and Reveal next.
   * @param {'reveal' | 'next'} kind
   * @param {Record<string, unknown>} msg
   */
  async function revealWith(kind, msg) {
    if (busy) return;
    busy = kind;
    message = '';
    render();
    try {
      await sourceSaving;
      const pool = await readCandidates();
      // No videos at all, not just none new: the grid's markup changed (Q25).
      const homeFeed = !state || state.settings.feedSource !== 'subscriptions';
      if (homeFeed && pool.length === 0 && !document.querySelector(`${SEL.homeBrowse} :is(${SEL.item})`)) {
        reportBroken('grid', SEL.item);
        message = errorText('pool-empty');
        return;
      }
      const res = absorb(await send({ ...msg, candidates: pool }));
      if (res && !res.ok) message = errorText(res.error);
    } finally {
      busy = '';
      render();
    }
  }

  function onReveal() {
    return revealWith('reveal', { type: 'reveal' });
  }

  /** @param {string} videoId The card the button was on. */
  function onRevealNext(videoId) {
    return revealWith('next', { type: 'revealNext', videoId });
  }

  /** @param {'home' | 'subscriptions'} source */
  async function onSource(source) {
    if (busy || !state || state.settings.feedSource === source) return;
    message = '';
    sourceSaving = send({ type: 'updateSettings', changes: { feedSource: source } }).then(absorb);
    await sourceSaving;
    render();
  }

  async function onAddTime() {
    message = '';
    const res = absorb(await send({ type: 'spendWatch' }));
    if (res && !res.ok) message = errorText(res.error);
    render();
  }

  /** @param {'watch' | 'save' | 'unsave' | 'pass'} action @param {string} videoId The card the button was on. */
  async function onResolve(action, videoId) {
    message = '';
    const res = absorb(await send({ type: 'resolve', action, videoId }));
    if (res && !res.ok) message = errorText(res.error);
    if (action === 'watch' && res && res.ok) {
      location.assign(watchUrl(res.video.id));
      return;
    }
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
   * A cartoon or lucide icon from src/icons, drawn as a CSS mask so it takes the color of the text around it.
   * @param {string} name
   * @param {string} [cls]
   */
  function icon(name, cls = '') {
    const el = h('span', { class: `drip-i drip-i-${name} ${cls}`.trim(), 'aria-hidden': 'true' });
    el.style.setProperty('--drip-icon', `url("${chrome.runtime.getURL(`src/icons/${name}.svg`)}")`);
    return el;
  }

  /**
   * A price on a button: "-1" and the token's icon. Screen readers get "costs 1 drop".
   * @param {'drop' | 'card'} token
   */
  function price(token) {
    return h('span', { class: 'drip-price' },
      h('span', { class: 'drip-sep', 'aria-hidden': 'true' }, '·'),
      h('span', { 'aria-hidden': 'true' }, '-1'),
      icon(token, `drip-token-${token}`),
      h('span', { class: 'drip-sr' }, `, costs 1 ${token}`));
  }

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

  /** @param {string} id */
  function thumbnail(id) {
    if (thumbCache && thumbCache.id === id) return thumbCache.el;
    const img = /** @type {HTMLImageElement} */ (h('img', { alt: '', decoding: 'async' }));
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
    });
    img.addEventListener('error', fallback);
    img.src = `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hq720.jpg`;
    const el = h('a', {
      class: 'drip-thumb', href: watchUrl(id), tabindex: '-1', 'aria-hidden': 'true',
      onclick: (/** @type {Event} */ e) => { e.preventDefault(); onResolve('watch', id); },
    }, img);
    thumbCache = { id, el };
    return el;
  }

  function glass() {
    const fraction = DripGlass.fraction(state);
    if (!glassEl) glassEl = DripGlass.make(fraction, GLASS_PX);
    else DripGlass.set(glassEl, fraction, GLASS_PX);
    return glassEl;
  }

  function stats() {
    const left = Drip.formatMinutes(state.watchSecondsLeft);
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
        class: 'drip-b drip-b-gold drip-reveal', 'data-k': 'reveal', onclick: onReveal, disabled: state.tokens.rec < 1 || !!busy,
      }, h('span', {}, 'Reveal video'), price('card')));
  }

  /**
   * Where the next reveal comes from (Q5). It's the feedSource setting, so it stays until changed.
   * @param {string} current
   */
  function sourceToggle(current) {
    const options = /** @type {const} */ ([['home', 'Home'], ['subscriptions', 'Subscriptions']]);
    return h('div', { class: 'drip-source', role: 'group', 'aria-label': 'Reveal from' },
      h('span', {}, 'From'),
      ...options.map(([value, label]) => h('button', {
        class: 'drip-source-opt', 'data-k': `source-${value}`, 'aria-pressed': String(value === current), disabled: !!busy,
        onclick: () => onSource(value),
      }, label)));
  }

  /** The reveal card while a reveal from the empty page reads the feed. Same size as the real one, so nothing jumps. */
  function placeholderCard() {
    const subs = state.settings.feedSource === 'subscriptions';
    return h('div', { class: 'drip-card is-loading', 'aria-busy': 'true' },
      h('div', { class: 'drip-thumb' }),
      h('div', { class: 'drip-card-title' }, h('span', { class: 'drip-skel' }), h('span', { class: 'drip-skel drip-skel-short' })),
      h('div', { class: 'drip-card-meta-row' }, h('span', { class: 'drip-meta' }, subs ? 'Checking your subscriptions…' : 'Finding a video…')));
  }

  /** @param {any} video */
  function card(video) {
    const saved = state.backlog.some((/** @type {any} */ v) => v.id === video.id);
    const meta = [video.channel, video.length].filter(Boolean).join(' · ');
    // At 0 minutes Watch buys a drop's minutes and plays (Q18). With no drops either, it goes to the lock screen.
    const buys = costsDrop(video.id);
    const next = busy === 'next';
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
          onclick: () => onResolve(saved ? 'unsave' : 'save', video.id), title: saved ? 'In Saved. Click to take it out.' : 'Keep it in Saved for later',
        }, icon('save'), h('span', { class: 'drip-save-label' }, saved ? 'Saved' : 'Save')),
        h('button', {
          class: 'drip-b drip-b-gray drip-next', 'data-k': 'next', disabled: next || state.tokens.rec < 1,
          onclick: () => onRevealNext(video.id),
        }, icon('arrow'), h('span', { class: 'drip-next-label' }, next ? 'Revealing…' : 'Reveal next'), !next && price('card')),
        h('button', {
          class: 'drip-b drip-b-gray drip-pass', 'data-k': 'pass', disabled: next, onclick: () => onResolve('pass', video.id),
          title: "Pass. It's free, and this video won't come back.", 'aria-label': 'Pass',
        }, icon('x'))));
  }

  function savedList() {
    const mode = state.current || busy === 'reveal' ? 'card' : 'empty';
    const open = savedOpen[mode];
    const count = state.backlog.length;
    const total = state.backlog.reduce((/** @type {number} */ sum, /** @type {any} */ v) => sum + lengthSeconds(v.length), 0);
    const head = ['Saved'];
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
        ? h('div', { class: 'drip-saved-empty' }, 'Videos you save show up here.')
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
            class: 'drip-saved-x', 'data-k': `x-${video.id}`, title: 'Remove from Saved', 'aria-label': `Remove ${video.title || 'video'} from Saved`,
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
    return h('div', { class: 'drip-page' },
      stats(),
      !showCard && actions(),
      !showCard && sourceToggle(state.settings.feedSource),
      state.current ? card(state.current) : busy === 'reveal' && placeholderCard(),
      (message || note) && h('div', { class: 'drip-message', role: 'status' }, message || note),
      savedList());
  }

  let rendered = '';

  /** Rebuilds the page only when something it shows changed. A button replaced mid-click loses the click. */
  function render() {
    const root = document.getElementById('drip-home');
    if (!root) return;
    const key = JSON.stringify([state && [
      Drip.formatMinutes(state.watchSecondsLeft), state.watchSecondsLeft > 0, DripGlass.fraction(state).toFixed(3),
      state.tokens, state.current, state.backlog, state.unlocked, state.settings.feedSource, state.settings.minutesPerToken,
      state.settings.resetHour,
    ], message, busy, disconnected, savedOpen, savedShowAll, [...removed.keys()]]);
    if (root.firstChild && key === rendered) return;
    rendered = key;
    // Keep keyboard focus on the same control across the rebuild.
    const focused = /** @type {HTMLElement | null} */ (document.activeElement)?.closest?.('[data-k]')?.getAttribute('data-k');
    root.classList.add('drip-ui');
    root.replaceChildren(view());
    if (focused) /** @type {HTMLElement | null} */ (root.querySelector(`[data-k="${CSS.escape(focused)}"]`))?.focus();
  }

  let refreshing = false;

  /** Puts the drip page into the home browse page if it isn't there yet. */
  function mount() {
    if (location.pathname !== '/') return;
    const browse = document.querySelector(SEL.homeBrowse);
    if (!browse) return;
    if (browse.querySelector('#drip-home')) {
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
  document.addEventListener('yt-navigate-finish', mount);
  setInterval(mount, 500);
  mount();
})();
