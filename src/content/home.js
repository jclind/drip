// @ts-check
// Replaces the home grid with the drip page. The grid stays hidden in the DOM (early.css), and this reads videos out of it.

(function () {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;
  /** @type {any} */
  const { send, h, onState, hourLabel, watchUrl, icon, price, cardMenu, updateCardMenu, blockedCardView, KEPT_KEY, reportBroken, watchFor } = /** @type {any} */ (globalThis).DripUI;
  const DripMorph = /** @type {any} */ (globalThis).DripMorph;
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
    // A link to the channel. Late 2026 lockups have none, only /watch links (checked on air, 2026-11-03), so a card
    // usually has just the channel's name. The older markup's channel name was a link.
    channelLink: 'ytd-channel-name a[href^="/@"], ytd-channel-name a[href^="/channel/"]',
    length: '.ytBadgeShapeText, .yt-badge-shape__text, .badge-shape-wiz__text, ytd-thumbnail-overlay-time-status-renderer #text',
    // The line after the title: channel, views, and age. Late 2026 writes "184K" and "3d ago", the older markup
    // "184K views" and "3 days ago". The parts are told apart by VIEWS and AGE, so the age is English only (checked 2026-10-14).
    metaPart: '.ytContentMetadataViewModelMetadataText, .yt-content-metadata-view-model__metadata-text, #metadata-line span',
    watched: 'ytd-thumbnail-overlay-resume-playback-renderer, yt-thumbnail-overlay-progress-bar-view-model, .ytThumbnailOverlayProgressBarHost',
    ad: 'ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer',
    // What kind of video an item is, for what a reveal may deal (Q30). Read on air on 2026-10-16 from channel pages,
    // which use the home grid's markup. An upcoming video has a "Notify me" button under the card and no length. The
    // holder has no name of its own, so it only counts on a card without a length. The older markup marked upcoming
    // and live on the length overlay, and members-only with its own badge.
    notify: 'lockup-attachments-view-model',
    upcoming: 'ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"]',
    live: '.ytBadgeShapeThumbnailLive, ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"]',
    members: '.ytBadgeShapeCommerce, .badge-style-type-members-only',
    // The top bar's search box and voice search, which Quiet's home page moves into the middle of the page (Q29).
    searchBox: 'ytd-masthead #center',
  };
  const AGE = /\bago$/i;
  const VIEWS = /^[\d.,]+\s?[KMB]?(\s+views?)?$/i;
  // A past stream's markup is a normal video's, except its age reads "Streamed 23h ago". English only, like AGE.
  const STREAMED = /^streamed\b/i;
  // An upcoming video's line under the title, for when its "Notify me" button hasn't rendered. English only too.
  const SCHEDULED = /^(scheduled for|premieres)\b/i;
  const DURATION = /^\d+(:\d\d)+$/;

  /** @typedef {{id: string, title: string, channel: string, length: string, views: string, age: string, kind: string, channelIds?: string[]}} Candidate */

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
   * The views and age from a grid item's line under the title, as YouTube writes them, or '' for a part it lacks.
   * @param {Element} item
   * @param {string} channel Left out, in case a channel's name is a number or ends in "ago" (Codex, 2026-10-14).
   */
  function viewsAndAge(item, channel) {
    let views = '';
    let age = '';
    for (const el of item.querySelectorAll(SEL.metaPart)) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text === channel) continue;
      if (!views && VIEWS.test(text)) views = /views?$/i.test(text) ? text : `${text} views`;
      else if (!age && AGE.test(text)) age = text;
    }
    return { views, age };
  }

  /**
   * What kind of video a grid item is. The worker decides which kinds a reveal may deal (Drip.mayReveal, Q30).
   * @param {Element} item
   * @param {string} channel Left out of the text checks, so a channel named "Premieres Daily" isn't read as one.
   * @param {string} length
   * @param {string} age From viewsAndAge, which leaves out the channel, so a channel named "Streamed Highlights" doesn't
   *   make every upload a past stream (Codex, 2026-10-16).
   * @returns {'video' | 'upcoming' | 'live' | 'streamed' | 'members'}
   */
  function kindOf(item, channel, length, age) {
    if (item.querySelector(SEL.upcoming) || (item.querySelector(SEL.notify) && !DURATION.test(length))) return 'upcoming';
    for (const el of item.querySelectorAll(SEL.metaPart)) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text !== channel && SCHEDULED.test(text)) return 'upcoming';
    }
    if (item.querySelector(SEL.members)) return 'members';
    if (item.querySelector(SEL.live)) return 'live';
    return STREAMED.test(age) ? 'streamed' : 'video';
  }

  /**
   * Videos currently in a feed's grid, minus ads, Shorts, mixes, and ones already watched.
   * @param {ParentNode} root The page, or a hidden frame's document.
   * @param {string} browseSelector
   */
  function readPool(root = document, browseSelector = SEL.homeBrowse) {
    const browse = root.querySelector(browseSelector);
    if (!browse) return [];
    /** @type {Candidate[]} */
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
      const channel = firstText(item, SEL.channel);
      const length = firstText(item, SEL.length);
      const { views, age } = viewsAndAge(item, channel);
      const channelId = Drip.channelId(item.querySelector(SEL.channelLink)?.getAttribute('href') || '');
      pool.push({ id, title, channel, length, views, age, kind: kindOf(item, channel, length, age), ...(channelId ? { channelIds: [channelId] } : {}) });
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

  /** Whether the worker's reveal could deal this video, by its own rule. @param {Candidate} video */
  function isNew(video) {
    return !!state && Drip.canDeal(state, video);
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
  async function readCandidates() {
    if (state && state.settings.feedSource === 'subscriptions') return readFeedInFrame('/feed/subscriptions', SEL.subsBrowse);
    const pool = await waitForPool();
    if (pool.some(isNew)) return pool;
    // This page's grid is hidden, so YouTube never loads past its first screenful. With all of that revealed, a hidden
    // frame of the home page scrolls for more, the way YouTube loads them when you scroll (Jesse, 2026-10-15).
    // What it read is kept for the next reveals, so each one doesn't load the page again.
    if (!morePool.some(isNew)) morePool = await readFeedInFrame('/', SEL.homeBrowse);
    return morePool.length ? morePool : pool;
  }

  /** Videos the hidden home frame read past this page's grid. */
  /** @type {Candidate[]} */
  let morePool = [];

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
      case 'dry-hours':
        return `Dry until ${dryLabel()}.`;
      case 'dry-soon':
        return `Dry hours start at ${drySoonLabel()}.`;
      // Reveal with a card already up, or Reveal next and × on one that's gone: another tab got there first.
      case 'stale-card':
      case 'resolve-current':
      case 'no-current':
        return 'That card changed in another tab.';
      case 'not-stashed':
        return 'That video already left your stash, maybe in another tab.';
      case 'block-full':
        return 'Your block list is full. Remove a channel in Settings first.';
      case 'bad-channel':
        return "drip couldn't tell which channel this is.";
      case 'pool-empty':
        return state && state.settings.feedSource === 'subscriptions'
          ? 'Nothing new from your subscriptions. No card spent.'
          : "YouTube hasn't loaded anything new to show. No card spent. Try again after a refresh.";
      default:
        return 'Something went wrong. Refresh and try again.';
    }
  }

  /** The card whose ⋯ menu is open, or ''. */
  let menuFor = '';
  /** The card whose Block was clicked once and waits for the second click, or ''. */
  let armedFor = '';
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let armTimer;
  /** When Block was armed. A second click sooner than DOUBLE_MS is one double-click, not two choices. */
  let armedAt = 0;
  /** The blocked video kept on this page until another reveal or navigation. @type {any} */
  let blockedCard = null;
  /** Changes when this page is left, so a pending Block cannot bring its card back afterwards. */
  let homeVisit = 0;
  /** Holds redraws while Block waits for the worker, so the card stays in place until the result arrives. */
  let blocking = false;
  /** How long Block waits for its second click (design K, 2026-11-04). */
  const ARM_MS = 3000;
  const DOUBLE_MS = 250;

  /** What's in flight: a reveal from the empty page, or Reveal next on a card. The page shows a placeholder for it. */
  /** @type {'' | 'reveal' | 'next'} */
  let busy = '';
  /** The read for a reveal has taken longer than SLOW_MS. */
  let slow = false;
  const SLOW_MS = 5000;
  /** Watch was pressed and the watch page is loading. Redraws stop, so the card stays up instead of the empty page. */
  let leaving = false;
  /** Where Watch went, once the worker said yes. */
  let goingTo = '';

  /**
   * The reveal animation is running (reveal.js). It draws on the page's own elements until it's done, so render()
   * waits, and the page is drawn once at the end.
   */
  let moving = false;

  /** Reveals, Reveal next, and Pass animate unless the browser asks for reduced motion. */
  const animates = () => !DripReveal.reduced();
  // Mode parts (Q29). Until the worker answers, the page draws as Full drip.
  /**
   * The parts as a running animation started. A mode change partway can't take away a button it's moving, and the
   * redraw after it draws the new mix (Codex, 2026-10-15).
   * @type {{clock: boolean, cards: 'off' | 'unlimited' | 'limited', stash: boolean} | null}
   */
  let animParts = null;
  const partsNow = () => animParts || (state ? state.settings : null);
  const clockOn = () => partsNow()?.clock !== false;
  /** @returns {'off' | 'unlimited' | 'limited'} */
  const cardsMode = () => partsNow()?.cards ?? 'limited';
  const stashOn = () => partsNow()?.stash !== false;
  /** The reveal animations morph Full drip's +15m, card counter, and Stash, so other mixes change without them. */
  const deals = () => animates() && clockOn() && cardsMode() === 'limited' && stashOn();
  /** The card up now. With cards off it stays stored for when they're back on, but the page doesn't show it (Codex, 2026-10-15). */
  const shownCard = () => (cardsMode() === 'off' ? null : state.current || blockedCard);

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
      let pool;
      try {
        pool = await readCandidates();
        // No videos at all, not just none new: the grid's markup changed (Q25).
        const homeFeed = !state || state.settings.feedSource !== 'subscriptions';
        if (homeFeed && pool.length === 0 && !document.querySelector(`${SEL.homeBrowse} :is(${SEL.item})`)) {
          reportBroken('grid', SEL.item);
          message = errorText('pool-empty');
          return null;
        }
      } catch (err) {
        // A read that throws never got as far as asking the worker, so nothing was spent. Without this the reveal ended
        // with no message, and Reveal next's half-dealt card stayed on the old thumbnail (Codex, 2026-10-16). In a tab
        // whose drip was reloaded, reportBroken is what throws, and the page asks for a refresh instead.
        console.error('drip: reading the feed failed', err);
        if (!chrome.runtime?.id) disconnected = true;
        message = errorText('');
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
    if (busy || moving || blocking) return;
    busy = kind;
    message = '';
    if (deals()) {
      const run = kind === 'reveal' ? DripReveal.reveal : DripReveal.next;
      const { ok, focused } = await animate(run, async () => (await findWith(msg))?.video || null);
      // The button that had focus is gone. Focus goes to what you'd press next.
      if (focused) focusOn(ok ? (kind === 'reveal' ? 'watch' : 'next') : kind === 'reveal' ? 'reveal' : 'next');
      return;
    }
    // Without the animation the pressed button can go too (Reveal video once a card is up), so focus goes to what
    // you'd press next here as well (Codex, 2026-10-15).
    const had = !!document.getElementById('drip-home')?.contains(document.activeElement);
    render();
    let ok = false;
    try {
      ok = !!(await findWith(msg));
    } finally {
      busy = '';
      render();
    }
    if (had) focusOn(ok ? (kind === 'reveal' ? 'watch' : 'next') : kind === 'reveal' ? 'reveal' : 'next');
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
    // Pass sets it before asking the worker, from the page the card was dealt on.
    animParts ||= { clock: clockOn(), cards: cardsMode(), stash: stashOn() };
    let ok = false;
    try {
      ok = !!(await run({
        root, page, find,
        counter: page?.querySelector('.drip-stats .drip-token-card'),
        card: (/** @type {any} */ video) => (video ? card(video) : openingCard()),
        actions,
        ready: (/** @type {any} */ video) => thumbReady(video),
        saved: {
          now: () => root.querySelector('.drip-saved'),
          build: (/** @type {boolean} */ open) => savedList(open ? 'empty' : 'card'),
        },
      }));
    } finally {
      moving = false;
      animParts = null;
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
    if (busy || moving || blocking) return;
    const had = !!document.getElementById('drip-home')?.contains(document.activeElement);
    blockedCard = null;
    closeMenu();
    // The reveal animation starts from the empty page's buttons.
    render();
    // With no minutes or drops, the page is out for the day and has no Reveal: nothing to reveal into (Codex, 2026-11-04).
    if (outForDay()) {
      if (had) focusFirst(['saved-head']);
      return;
    }
    if (had) focusIn('reveal');
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

  /** +15m's purchase is on its way to the worker. Without the drop's fall, this holds a second press (code review, 2026-10-16). */
  let buying = false;

  async function onAddTime() {
    if (pouring || buying) return;
    message = '';
    const counter = document.querySelector('#drip-home .drip-stats .drip-token-drop');
    // A tab in the background has nobody to watch the drop.
    const pours = animates() && !document.hidden && !!counter && !!glassEl?.isConnected && !!state;
    const from = pours ? { counter: /** @type {Element} */ (counter).getBoundingClientRect(), level: DripGlass.fraction(state) } : null;
    if (from) {
      pouring = true;
      heldLeft = state.watchSecondsLeft;
    }
    buying = true;
    let res;
    try {
      res = absorb(await send({ type: 'spendWatch' }));
    } finally {
      buying = false;
    }
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
   * @param {'watch' | 'save' | 'unsave' | 'pass' | 'block'} action @param {string} videoId The card the button was on.
   * @param {boolean} [keyboard] Pressed from the keyboard, so a full stash's list takes focus.
   */
  async function onResolve(action, videoId, keyboard = false) {
    // While a reveal is in flight the card's buttons are disabled, but its picture still links to Watch (Codex, 2026-10-16).
    if (moving || busy || blocking || blockedCard?.id === videoId) return;
    // Watch is on its way, or its page is loading. Asking the worker again would get no-current and draw an error over the
    // page as it leaves. Once the trip has started, another Watch repeats it, which also restarts a load the user stopped.
    if (leaving) {
      if (action === 'watch' && goingTo) location.assign(goingTo);
      return;
    }
    message = '';
    // Closing the menu removes its focused Block item before the worker answers.
    const had = !!document.getElementById('drip-home')?.contains(document.activeElement);
    closeMenu();
    if (action === 'pass' && deals() && document.querySelector('#drip-home .drip-card .drip-deal')) {
      // Redraws wait while the worker answers, so the card is still there to animate.
      moving = true;
      animParts = { clock: clockOn(), cards: cardsMode(), stash: stashOn() };
      const res = absorb(await send({ type: 'resolve', action, videoId }));
      moving = false;
      if (!res || !res.ok) {
        animParts = null;
        message = errorText(res ? res.error : '');
        render();
        return;
      }
      const out = outForDay();
      seaRises = out;
      const { focused } = await animate(out ? DripReveal.passOut : DripReveal.pass, async () => null);
      if (focused) focusOn(out ? 'saved-head' : 'reveal');
      return;
    }
    // The worker's save redraws the page through the storage listener, which would show the empty page while the
    // watch page loads.
    if (action === 'watch') leaving = true;
    const video = state.current;
    const visit = homeVisit;
    blocking = action === 'block';
    const res = absorb(await send({ type: 'resolve', action, videoId }));
    blocking = false;
    if (action === 'block' && res?.ok && !state.current && visit === homeVisit) blockedCard = video;
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
      goingTo = resumeUrl(res.video.id);
      location.assign(goingTo);
      return;
    }
    leaving = false;
    render();
    // Pass without the animation takes its button away too. Focus goes where the animated Pass sends it.
    if (had && res?.ok) {
      if (action === 'block') focusFirst(['next', 'close']);
      else if (action === 'pass') focusOn(outForDay() ? 'saved-head' : 'reveal');
    }
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
    return clockOn() && state.watchSecondsLeft <= 0 && state.tokens.watch > 0 && !dryEnd() && !drySoonAt() && !Drip.freeToStart(state, id);
  }

  /** When the Dry hours going on now end, or 0 (Q32). No drop can be spent until then. */
  function dryEnd() {
    return state && clockOn() ? Drip.dryUntil(state, Date.now()) : 0;
  }

  /** When Dry hours start, if that's in the next 5 minutes, or 0. Drops stop selling then (Jesse, 2026-11-04). */
  function drySoonAt() {
    return state && clockOn() ? Drip.drySoon(state, Date.now()) : 0;
  }

  /** "6:00am" for the end of Dry hours. */
  function dryLabel() {
    return hourLabel(new Date(dryEnd()).getHours());
  }

  /** "11:00pm" for the start of Dry hours, in the 5 minutes before. */
  function drySoonLabel() {
    return hourLabel(new Date(drySoonAt()).getHours());
  }

  /** The Dry hours this page asked the worker about, so it asks once. */
  let askedDry = 0;

  /**
   * Dry hours the worker hasn't handled yet, at 11pm on an idle page: asking it takes the minutes back as drops, which
   * then land in the counter (Q32).
   */
  function askDry() {
    const end = dryEnd();
    if (!end || state.drySeen === end || askedDry === end) return;
    askedDry = end;
    send({ type: 'get' }).then((res) => {
      absorb(res);
      render();
    });
  }

  /** What the page draws for Dry hours, which changes once a minute in the warning. */
  function dryKey() {
    const soon = drySoonAt();
    return `${dryEnd()}:${soon ? Math.ceil((soon - Date.now()) / 60000) : 0}`;
  }

  /** No drop to spend now: none left, Dry hours, or the 5 minutes before them. */
  function noDropToSpend() {
    return state.tokens.watch < 1 || dryEnd() > 0 || drySoonAt() > 0;
  }

  /**
   * Saved rows removed in the last few seconds, shown as "Removed · Undo" where they were. `before` is the ids that sat
   * before the row, oldest first, counting other rows still waiting on Undo, so several undos in any order restore the
   * original order (Codex).
   * @type {Map<string, {video: any, before: string[], timer: number, height?: number}>}
   */
  const removed = new Map();
  const UNDO_MS = 5000;
  const EVAPORATE_MS = 260;
  const ROW_VISIBLE = { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' };
  const ROW_VAPOR = { opacity: 0, filter: 'blur(3px)', transform: 'translateY(-9px)' };
  /** Kept until the worker replies, so another × cannot remove the same row twice. */
  /** @type {Map<string, {started: number | null, height?: number, animations: Animation[]}>} */
  const evaporating = new Map();
  /**
   * Undo starts on the restored node, even if storage draws it before the worker replies. Each id maps to when its
   * condense began, or null until its row is drawn, so a rebuild mid-condense resumes it (Codex, 2026-10-14).
   * @type {Map<string, number | null>}
   */
  const condensing = new Map();
  const CONDENSE_MS = 300;

  /** @param {HTMLElement} root @param {string} id */
  function stashRow(root, id) {
    return root.querySelector(`[data-k="x-${CSS.escape(id)}"]`)?.closest('li');
  }

  /** Resumes any evaporate or condense on the new row at its original elapsed time. @param {HTMLElement} root */
  function syncRowMotion(root) {
    for (const [id, motion] of evaporating) {
      motion.animations.forEach((a) => a.cancel());
      motion.animations = [];
      const row = stashRow(root, id);
      if (!row || motion.started === null || !animates()) continue;
      row.setAttribute('aria-busy', 'true');
      const elapsed = Math.min(EVAPORATE_MS, performance.now() - motion.started);
      motion.animations = Array.from(row.children, (el) => {
        const a = el.animate([ROW_VISIBLE, ROW_VAPOR], { duration: EVAPORATE_MS, easing: 'ease-out', fill: 'forwards' });
        a.currentTime = elapsed;
        return a;
      });
    }
    for (const [id, started] of condensing) {
      const row = stashRow(root, id);
      if (!row) continue;
      const now = performance.now();
      const elapsed = started === null ? 0 : now - started;
      if (!animates() || elapsed >= CONDENSE_MS) {
        condensing.delete(id);
        continue;
      }
      if (started === null) condensing.set(id, now);
      for (const el of row.children) {
        const a = el.animate([ROW_VAPOR, ROW_VISIBLE], { duration: CONDENSE_MS, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' });
        a.currentTime = elapsed;
      }
    }
  }

  /** @param {string} id */
  async function onRemove(id) {
    if (!state || evaporating.has(id) || !state.backlog.some((/** @type {any} */ v) => v.id === id)) return;
    const root = document.getElementById('drip-home');
    const row = root && stashRow(root, id);
    const motion = { started: row && animates() ? performance.now() : null, height: row?.getBoundingClientRect().height, animations: /** @type {Animation[]} */ ([]) };
    evaporating.set(id, motion);
    try {
      if (root && motion.started !== null) {
        syncRowMotion(root);
        await sleep(EVAPORATE_MS);
      }
      // A tick or another tab may have updated the video while it evaporated.
      const video = state.backlog.find((/** @type {any} */ v) => v.id === id);
      if (!video) return;
      const rows = savedRows();
      const before = rows.slice(0, rows.findIndex((r) => r.video.id === id)).map((r) => r.video.id);
      const timer = window.setTimeout(() => {
        removed.delete(id);
        render();
      }, UNDO_MS);
      removed.set(id, { video, before, timer, height: motion.height });
      absorb(await send({ type: 'removeBacklog', id }));
    } finally {
      evaporating.delete(id);
      motion.animations.forEach((a) => a.cancel());
      if (root) stashRow(root, id)?.removeAttribute('aria-busy');
      render();
    }
  }

  /** @param {string} id */
  async function onUndo(id) {
    const entry = removed.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    removed.delete(id);
    const index = state ? state.backlog.filter((/** @type {any} */ v) => entry.before.includes(v.id)).length : undefined;
    condensing.set(id, null);
    try {
      absorb(await send({ type: 'addBacklog', video: entry.video, index }));
      if (!state?.backlog.some((/** @type {any} */ v) => v.id === id)) condensing.delete(id);
      render();
      // If a reveal is holding renders, keep the condense queued until the row is actually drawn.
    } catch (error) {
      condensing.delete(id);
      throw error;
    }
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

  // Stash opens on the normal empty page, and starts folded with a card up, when out for the day, and under the search
  // box with cards off (design H, Q29).
  const savedOpen = { empty: true, card: false, out: false, search: false };
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
   * @param {{id: string, length?: string}} video
   */
  function thumbnail(video) {
    const id = video.id;
    if (thumbCache && thumbCache.id === id) {
      if (blockedCard?.id !== id) {
        thumbCache.el.setAttribute('href', watchUrl(id));
        thumbCache.el.querySelector('.drip-blocked-chip')?.remove();
      }
      return thumbCache.el;
    }
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
      onclick: (/** @type {Event} */ e) => { e.preventDefault(); if (blockedCard?.id !== id) onResolve('watch', id); },
    }, DripReveal.dealCard(img, true));
    // The length sits on the picture, as on YouTube's grid, so it turns over with the card.
    if (video.length) el.querySelector('.drip-deal-front')?.append(h('span', { class: 'drip-length' }, video.length));
    thumbCache = { id, el };
    thumbLoads.set(el, done);
    return el;
  }

  /**
   * Resolves once the video's thumbnail can show: loaded, failed in both sizes, or still loading after 8 seconds, when
   * the card turns over onto its gray front rather than wait any longer.
   * @param {{id: string, length?: string}} video
   */
  function thumbReady(video) {
    const done = thumbLoads.get(thumbnail(video)) || Promise.resolve();
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
    const held = Math.min((arriving ? arriving[kind] : 0) + (queued ? queued[kind] : 0), state.tokens[kind]);
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

  /** The glass, minutes, and counts, each only while its part is on. Curated and Quiet have none of them (Q29). */
  function stats() {
    const clock = clockOn();
    const counted = cardsMode() === 'limited';
    if (!clock && !counted) return null;
    const left = Drip.formatMinutes(heldLeft ?? state.watchSecondsLeft);
    return h('div', { class: 'drip-stats' },
      clock && h('div', { class: 'drip-glass-tile' }, glass()),
      clock && h('div', { class: 'drip-time-block' },
        h('div', { class: 'drip-time' }, left),
        h('div', { class: 'drip-sub' }, 'left today')),
      h('div', { class: 'drip-counts', style: `--drip-room: ${countRoom()}` }, clock && countRow('watch'), counted && countRow('rec')),
      // With cards off there's no row of buttons, so +15m ends the stats line, over the search box (design F, 2026-10-15).
      clock && cardsMode() === 'off' && !outForDay() && addButton());
  }

  /** What the page last drew for Dry hours (dryKey), so mount() can redraw an idle page when it changes. */
  let drawnDry = '';

  /** Set when Pass on the last card leaves the page out for the day, so the sea rises in where the card dropped. */
  let seaRises = false;

  /** No minutes or tokens left, and no card still to watch or stash. */
  function outForDay() {
    // Cards left don't count: with no minutes or drops, a reveal can't lead to watching anything (Jesse, 2026-10-14).
    // In Dry hours nothing paid plays, minutes or not (Jesse, 2026-11-04).
    if (clockOn() && !shownCard() && dryEnd()) return true;
    return clockOn() && !shownCard() && noDropToSpend() && state.watchSecondsLeft <= 0;
  }

  /** How many of today's cards the reset keeps, under the rollover cap, by the settings tomorrow will use. */
  function cardsCarried() {
    const settings = { ...state.settings, ...state.pending?.changes };
    // Cards that aren't counted tomorrow don't carry over to anything (Q29).
    if (settings.cards !== 'limited') return 0;
    const perDay = settings.recTokensPerDay;
    return Math.max(0, Math.min(state.tokens.rec + perDay, Drip.caps(settings).rec) - perDay);
  }

  /** The gray line under the buttons when something has run out. */
  function outNote() {
    const reset = hourLabel(state.settings.resetHour);
    const noDrops = clockOn() && state.tokens.watch < 1;
    const noCards = cardsMode() === 'limited' && state.tokens.rec < 1;
    if (shownCard()) return noCards ? `No cards left. More at ${reset}.` : '';
    if (outForDay()) return `You're out for today. Drops and cards refill at ${reset}.`;
    if (noCards) return `No cards left. More at ${reset}.`;
    if (clockOn() && dryEnd()) return `Dry until ${dryLabel()}.`;
    if (drySoonAt()) return `Dry hours start at ${drySoonLabel()}.`;
    if (noDrops) return `No drops left. More at ${reset}.`;
    return '';
  }

  /** Variant J, "Small sea": still water and one faint fish. Screen readers get the copy as plain text, not a status, so a rebuild (opening the Stash) doesn't read it out again. */
  function outSea() {
    const rises = seaRises && animates();
    seaRises = false;
    return h('section', { class: `drip-out-sea${rises ? ' is-new' : ''}` },
      h('div', { class: 'drip-sea', 'aria-hidden': 'true' },
        animates() && h('span', { class: 'drip-fish' }, h('span', {}))),
      h('div', { class: 'drip-out-copy' },
        ...(dryEnd()
          ? [h('h2', {}, 'Dry hours.'), h('p', {}, `Drops work again at ${dryLabel()}.`)]
          // In the 5 minutes before, the drops are held back, not gone, so the page doesn't say "out for today".
          : drySoonAt()
            ? [h('h2', {}, `Dry hours at ${drySoonLabel()}.`),
              h('p', {}, `Drops work again at ${hourLabel(new Date(Drip.dryUntil(state, drySoonAt())).getHours())}.`)]
          : [h('h2', {}, "You're out for today."), h('p', {}, `The glass refills at ${hourLabel(state.settings.resetHour)}.`)]),
        cardsCarried() > 0 && h('p', {}, `${cardsCarried()} ${cardsCarried() === 1 ? 'card carries' : 'cards carry'} over to tomorrow.`)));
  }

  /** +15m with the clock on, and Reveal video with cards on. It costs a card only when cards are counted (Q29). */
  function actions() {
    const cards = cardsMode();
    // With cards off, +15m sits in the stats line instead (stats()).
    if (cards === 'off') return null;
    return h('div', { class: 'drip-actions' },
      clockOn() && addButton(),
      h('button', {
        // While the animation runs, it draws these buttons as they'll be once it's done.
        class: 'drip-b drip-b-gold drip-reveal', 'data-k': 'reveal', onclick: onReveal,
        disabled: (cards === 'limited' && state.tokens.rec < 1) || (!!busy && !moving),
      }, h('span', {}, 'Reveal video'), cards === 'limited' && price('card')));
  }

  function addButton() {
    const s = state.settings;
    return h('button', {
      class: 'drip-b drip-b-gray drip-add', 'data-k': 'add', onclick: onAddTime, disabled: noDropToSpend(),
      title: dryEnd() ? `Dry until ${dryLabel()}.` : drySoonAt() ? `Dry hours start at ${drySoonLabel()}.` : `Add ${s.minutesPerToken} minutes for 1 drop`,
    }, icon('clock'), h('span', {}, `+${Drip.formatMinutes(s.minutesPerToken * 60)}`), price('drop'));
  }

  /** What the loading card says, which changes once the read has taken SLOW_MS. */
  function loadingText() {
    const subs = state.settings.feedSource === 'subscriptions';
    if (slow) return subs ? 'Still checking. Subscriptions can take 15 seconds.' : 'Still looking…';
    return subs ? 'Checking your subscriptions…' : 'Finding a video…';
  }

  /** The reveal card while a reveal from the empty page reads the feed. Same size as the real one, so nothing jumps. */
  function placeholderCard() {
    return h('div', { class: 'drip-card is-loading', 'data-k': 'card-loading', 'aria-busy': 'true' },
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

  /**
   * "Channel · 394K views · 3d ago". A long channel name is cut short before the views and age are. The length badge
   * is on the thumbnail, which screen readers skip, so they get the length here.
   * @param {any} video
   */
  function metaLine(video) {
    const rest = [video.views, video.age].filter(Boolean).join(' · ');
    return h('span', { class: 'drip-meta drip-meta-split' },
      h('span', { class: 'drip-meta-channel' }, video.channel),
      rest && h('span', { class: 'drip-meta-rest' }, video.channel ? ` · ${rest}` : rest),
      video.length && h('span', { class: 'drip-sr' }, `, length ${video.length}`));
  }

  /**
   * The ⋯ menu on the card and its Block, clicked twice (design K, 2026-11-04). Blocking passes the card, with no card
   * back. The second click has to come within ARM_MS, and closing the menu forgets the first.
   */
  function closeMenu() {
    clearTimeout(armTimer);
    menuFor = '';
    armedFor = '';
    updateCardMenu(document.querySelector('#drip-home .drip-card-menu'), { open: false });
  }

  /** Applies the current menu state without redrawing the card. */
  function syncMenu() {
    const video = state?.current;
    updateCardMenu(document.querySelector('#drip-home .drip-card-menu'), {
      open: !!video && menuFor === video.id, channel: video?.channel, armed: armedFor === video?.id,
      onPick: () => pickBlock(video.id),
    });
  }

  /** @param {string} id */
  function toggleMenu(id) {
    const opening = menuFor !== id;
    closeMenu();
    if (opening) menuFor = id;
    syncMenu();
    focusIn(opening ? 'block' : 'card-more');
  }

  /**
   * Closes the menu without redrawing the card. A redraw on pointerdown would replace the button being pressed, and its
   * click would be lost (Codex, 2026-11-04). The next redraw draws it closed.
   */
  function dropMenu() {
    closeMenu();
  }

  /** @param {string} id */
  function pickBlock(id) {
    if (armedFor === id) {
      if (Date.now() - armedAt >= DOUBLE_MS) onResolve('block', id);
      return;
    }
    armedFor = id;
    armedAt = Date.now();
    clearTimeout(armTimer);
    armTimer = setTimeout(() => {
      armedFor = '';
      syncMenu();
    }, ARM_MS);
    syncMenu();
    focusIn('block');
  }

  /**
   * Focuses the first of these controls that's there and enabled. A disabled button can't take focus, and focus would
   * be lost (Codex, 2026-11-04).
   * @param {string[]} keys
   */
  function focusFirst(keys) {
    for (const key of keys) {
      const el = /** @type {HTMLElement | null} */ (document.querySelector(`#drip-home [data-k="${key}"]`));
      if (el && !el.hasAttribute('disabled')) return el.focus();
    }
  }

  /** Focus a button on the page even when focus is already inside it, as after a redraw. @param {string} key */
  function focusIn(key) {
    /** @type {HTMLElement | null} */ (document.querySelector(`#drip-home [data-k="${key}"]`))?.focus();
  }

  /** @param {any} video */
  function card(video) {
    if (blockedCard?.id === video.id) return blockedCardView(video, thumbnail(video), {
      counted: cardsMode() === 'limited',
      // Out of cards, or out of minutes and drops (the page behind it is out for the day), there's nothing to reveal.
      disabled: (cardsMode() === 'limited' && state.tokens.rec < 1) || (clockOn() && noDropToSpend() && state.watchSecondsLeft <= 0),
      onReveal,
      onClose: () => {
        blockedCard = null;
        render();
        focusFirst(['reveal', 'saved-head']);
      },
    });
    const saved = state.backlog.some((/** @type {any} */ v) => v.id === video.id);
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
    return h('div', { class: `drip-card${next ? ' is-next' : ''}${isNew ? ' is-new' : ''}`, 'data-k': `card-${video.id}`, 'aria-busy': next ? 'true' : undefined },
      thumbnail(video),
      h('div', { class: 'drip-card-head' },
        h('div', { class: 'drip-card-title', title: video.title }, video.title),
        video.channel && cardMenu({
          channel: video.channel, open: menuFor === video.id && !next, armed: armedFor === video.id, disabled: next,
          onToggle: () => toggleMenu(video.id), onPick: () => pickBlock(video.id),
        })),
      h('div', { class: 'drip-card-meta-row' },
        metaLine(video),
        h('button', { class: 'drip-b drip-b-primary drip-watch', 'data-k': 'watch', disabled: next, onclick: () => onResolve('watch', video.id) },
          icon('play'), h('span', {}, 'Watch'), buys && price('drop'))),
      h('div', { class: 'drip-card-actions' },
        stashOn() && h('button', {
          class: `drip-b drip-b-gray drip-card-save drip-stash${saved ? ' is-saved' : ''}`, 'data-k': 'save', 'aria-pressed': String(saved), disabled: next,
          'data-swap-anchor': true, 'aria-expanded': swapping ? 'true' : undefined,
          // detail is 0 for a click from the keyboard (Enter or Space).
          onclick: (/** @type {MouseEvent} */ e) => (swapping ? closeSwap() : onResolve(saved ? 'unsave' : 'save', video.id, e.detail === 0)),
          title: saved ? 'In your stash. Click to take it out.' : 'Stash it for later',
        }, ...stash.nodes),
        cardsMode() !== 'off' && h('button', {
          class: 'drip-b drip-b-gray drip-next', 'data-k': 'next', disabled: next || (cardsMode() === 'limited' && state.tokens.rec < 1),
          onclick: () => onRevealNext(video.id),
        }, icon('arrow'), h('span', { class: 'drip-next-label' }, next ? 'Revealing…' : 'Reveal next'), !next && cardsMode() === 'limited' && price('card')),
        h('button', {
          class: 'drip-b drip-b-gray drip-pass', 'data-k': 'pass', disabled: next, onclick: () => onResolve('pass', video.id),
          title: "Pass. It's free, and this video won't come back.", 'aria-label': 'Pass',
        }, icon('x')),
        swapping && swapList()),
      swapped && swapped.newId === video.id && DripSwap.note(swapped.dropped, onSwapUndo));
  }

  /** @param {'empty' | 'card' | 'out'} [as] Draw it as on that page. The reveal animation opens and folds it ahead of time. */
  function savedList(as) {
    const mode = as || (shownCard() || busy === 'reveal' ? 'card' : outForDay() ? 'out' : cardsMode() === 'off' ? 'search' : 'empty');
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
          ? h('li', { class: 'drip-saved-row is-removed', 'data-k': `row-${video.id}`, style: removed.get(video.id)?.height ? `min-height: ${removed.get(video.id)?.height}px` : undefined },
            h('span', {}, 'Removed'), h('span', { class: 'drip-sep', 'aria-hidden': 'true' }, '·'),
            h('button', { class: 'drip-undo', 'data-k': `undo-${video.id}`, onclick: () => onUndo(video.id) }, 'Undo'))
          : h('li', {
            class: `drip-saved-row${DripSwap.fraction(video) > 0 ? ' has-bar' : ''}`, 'data-k': `row-${video.id}`,
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
    const current = shownCard();
    const showCard = current || busy === 'reveal';
    const out = !showCard && outForDay();
    const note = out ? '' : outNote();
    // With a card up, the page is open: the stats sit a little higher (drip.css), as the reveal animation left them.
    // With cards off there's nothing to reveal, so the page is YouTube's search box (Quiet, Q29), under the stats when
    // the clock is on (design F, 2026-10-15).
    const search = cardsMode() === 'off';
    return h('div', { class: `drip-page${showCard ? ' is-open' : out ? ' is-out' : ''}${search ? ' is-search' : ''}${search && !stashOn() && !clockOn() ? ' is-search-only' : ''}` },
      stats(),
      // YouTube's search box goes in here (placeSearch), so a redraw keeps what's in it.
      search && h('div', { class: 'drip-search-slot', 'data-k': 'search-slot', 'data-morph-keep': true }),
      !showCard && (out ? outSea() : actions()),
      current ? card(current) : busy === 'reveal' && placeholderCard(),
      (message || note) && h('div', { class: 'drip-message', role: 'status' }, message || note),
      stashOn() && savedList());
  }

  /**
   * Where the top bar's search box came from, to put it back when the page leaves Quiet's layout or YouTube's home.
   * @type {{el: Element, parent: Node, next: Node | null} | null}
   */
  let movedSearch = null;
  /** drip's own search box, for when YouTube's can't be found. Kept across redraws so typing survives them. */
  /** @type {HTMLElement | null} */
  let ownSearch = null;

  /**
   * Quiet's home page (Q29): YouTube's own search box, mic and all, moves from the top bar into the page, so its
   * suggestions and voice search still work. Without it, drip's own box searches the same way.
   * @param {HTMLElement} root
   */
  function placeSearch(root) {
    const slot = root.querySelector('.drip-search-slot');
    if (!slot || location.pathname !== '/') return restoreSearch();
    const el = movedSearch?.el || document.querySelector(SEL.searchBox);
    if (!el) {
      const form = ownSearch || (ownSearch = makeOwnSearch());
      if (form.parentElement !== slot) slot.append(form);
      return;
    }
    if (!movedSearch) movedSearch = { el, parent: /** @type {Node} */ (el.parentNode), next: el.nextSibling };
    // drip's own box stood in while YouTube's hadn't loaded. The kept slot would show both (Codex, 2026-10-15).
    ownSearch?.remove();
    if (el.parentElement !== slot) slot.append(el);
    document.documentElement.toggleAttribute('data-drip-search-moved', true);
    fitSuggestions();
  }

  /**
   * YouTube sizes its suggestion list for the top bar, so in the middle of the page the list ran off the bottom of the
   * screen and only the first few showed (Jesse, 2026-10-15). drip.css caps it at the room left under the box.
   */
  function fitSuggestions() {
    const slot = document.querySelector('#drip-home .drip-search-slot');
    if (!slot) return;
    const room = Math.max(160, window.innerHeight - slot.getBoundingClientRect().bottom - 16);
    document.documentElement.style.setProperty('--drip-suggest-room', `${Math.round(room)}px`);
  }

  /**
   * Brings the page up to the new view in place (morph.js): a control that's still there stays the same node, so a
   * press, focus, or an open menu on it survives a redraw (Codex, 2026-11-05). Quiet's search box never leaves the
   * page: YouTube's box rebuilds itself empty whenever it's moved, even with moveBefore, which loses what was typed and
   * the focus (Chrome 154, 2026-10-15). Its slot is marked data-morph-keep, so morph leaves what's in it.
   * @param {HTMLElement} root
   * @param {HTMLElement} next
   */
  function swapIn(root, next) {
    const page = root.childElementCount === 1 ? root.firstElementChild : null;
    if (!page || page.localName !== next.localName) return root.replaceChildren(next);
    DripMorph.morph(page, next);
  }

  /** drip's own search box: a form that goes to YouTube's results page. */
  function makeOwnSearch() {
    const input = /** @type {HTMLInputElement} */ (h('input', { type: 'search', class: 'drip-search-input', placeholder: 'Search', 'aria-label': 'Search YouTube' }));
    return /** @type {HTMLElement} */ (h('form', {
      class: 'drip-search-form', role: 'search',
      onsubmit: (/** @type {SubmitEvent} */ e) => {
        e.preventDefault();
        const q = input.value.trim();
        if (q) location.href = `/results?search_query=${encodeURIComponent(q)}`;
      },
    }, input, h('button', { class: 'drip-b drip-b-gray', type: 'submit', 'aria-label': 'Search' }, icon('search'))));
  }

  function restoreSearch() {
    document.documentElement.toggleAttribute('data-drip-search-moved', false);
    if (!movedSearch) return;
    const { el, parent, next } = movedSearch;
    movedSearch = null;
    if (parent.isConnected) parent.insertBefore(el, next && next.parentNode === parent ? next : null);
  }

  let rendered = '';
  /** The minutes the stats were last drawn with. */
  let drawnTime = '';

  /**
   * Brings up to date, without a rebuild, what moves with every tick while another tab plays: the glass's water, and
   * each started video's bar and resume link (Codex, 2026-10-13).
   * @param {HTMLElement} root
   */
  function freshen(root) {
    if (!state) return;
    if (glassEl && !pouring) DripGlass.set(glassEl, DripGlass.fraction(state), GLASS_PX);
    for (const video of state.backlog) {
      const id = CSS.escape(video.id);
      const link = root.querySelector(`[data-k="play-${id}"]`);
      const href = resumeUrl(video.id);
      if (link && link.getAttribute('href') !== href) link.setAttribute('href', href);
      // The stash row's bar, and the same video's bar in the full-stash list when it's open (Codex, 2026-10-14).
      const bars = [link?.closest('li')?.querySelector('.drip-stash-bar'), root.querySelector(`[data-k="swap-${id}"] .drip-stash-bar`)];
      for (const bar of bars) /** @type {HTMLElement | null | undefined} */ (bar)?.style.setProperty('--drip-at', DripSwap.fraction(video).toFixed(3));
    }
  }

  /** Rebuilds the page only when something it shows changed. A button replaced mid-click loses the click. */
  function render() {
    if (state?.current) blockedCard = null;
    askDry();
    const root = document.getElementById('drip-home');
    if (!root || moving || leaving || blocking) return;
    takeRefill();
    // The glass level and a stashed video's progress change on every tick, so they're left out here and freshen()
    // sets them in place. The minutes and each row's "12m left" change once a minute.
    const key = JSON.stringify([state && [
      Drip.formatMinutes(state.watchSecondsLeft), state.watchSecondsLeft > 0,
      state.tokens, state.current, state.unlocked, state.channels, state.allowedToday, state.settings.feedSource, state.settings.minutesPerToken,
      // The sea's "N cards carry over" follows the allowance, the rollover cap, and pending settings (Codex, 2026-10-14).
      state.settings.resetHour, state.settings.stashMax, cardsCarried(),
      state.settings.clock, state.settings.cards, state.settings.stash, dryKey(), state.dryBack,
      state.backlog.map((/** @type {any} */ v) => [v.id, v.title, v.channel, DripSwap.meta(v), DripSwap.fraction(v) > 0]),
      Drip.formatMinutes(state.backlog.reduce((/** @type {number} */ sum, /** @type {any} */ v) => sum + DripSwap.leftSec(v), 0)),
    ], message, busy, disconnected, savedOpen, savedShowAll, [...removed.keys()], heldLeft, pouring, arriving, swapFor, swapped && swapped.newId, blockedCard]);
    if (root.firstChild && key === rendered) {
      placeSearch(root);
      return freshen(root);
    }
    rendered = key;
    drawnDry = state ? dryKey() : '';
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
    swapIn(root, view());
    placeSearch(root);
    syncRowMotion(root);
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
   * @type {{kind: 'kept' | 'new' | 'back', watch: number, rec: number} | null}
   */
  let arriving = null;
  /**
   * The landing after this one, held back too. "Done for now" into Dry hours lands the kept drops, then the drops back
   * with their own tag (Jesse, 2026-11-05).
   * @type {{kind: 'kept' | 'new' | 'back', watch: number, rec: number} | null}
   */
  let queued = null;
  /** The landing is running. */
  let landing = false;
  /** The landing is waiting for the page to show. */
  let waiting = false;
  /** The reset whose refill this page has taken, so it plays once. */
  let refillTaken = '';
  /** The Dry hours whose drops back this page has shown. */
  let dryBackTaken = 0;
  /** The Dry hours whose drops back the kept drops count, or 0 when the lock saved them before the drops came back. */
  let keptBack = 0;
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
      // "7:1730845200000": 7 drops, counting the drops back from the Dry hours that end then (watch.js onDone).
      const [n, back] = String(sessionStorage.getItem(KEPT_KEY) || '').split(':');
      kept = Number(n);
      keptBack = Number(back) || 0;
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
  /** The drops handed back when Dry hours began fall into the counter with "2 back", once (Q32). */
  function takeDryBack() {
    const b = state && state.dryBack;
    // Behind the kept drops, they land second with their own tag (Jesse, 2026-11-05).
    // The kept landing is already waiting for the page, so this doesn't wait for it too.
    const behind = !!arriving && arriving.kind === 'kept' && !queued;
    if (!b || b.until === dryBackTaken || (arriving && !behind) || (!behind && !homeInView())) return;
    dryBackTaken = b.until;
    const counted = keptBack === b.until;
    // Seen only once the kept drops were already falling, and they hold these: no second landing, or the "Kept" tag
    // would count them too.
    if (behind && counted && landing) {
      send({ type: 'dryBackSeen' }).then(absorb);
      return;
    }
    if (behind && clockOn()) {
      // Kept drops the lock counted after the drops came back hold them already, so they're taken out here. Both stay
      // held back, so the count only rises (Codex, 2026-11-05).
      const back = counted ? Math.min(b.watch, arriving.watch) : b.watch;
      if (counted) arriving.watch -= back;
      queued = { kind: 'back', watch: back, rec: 0 };
      rendered = '';
      return;
    }
    if (!clockOn()) {
      send({ type: 'dryBackSeen' }).then(absorb);
      return;
    }
    arriving = { kind: 'back', watch: b.watch, rec: 0 };
    rendered = '';
    landWhenShown();
  }

  function takeRefill() {
    takeDryBack();
    const r = state && state.refill;
    // Behind drops back that haven't started landing, the refill waits its turn but is held back from now, so the count
    // doesn't rise with the first landing and fall when the second comes up (Codex, 2026-11-05).
    const behind = !!arriving && arriving.kind === 'back' && !landing && !queued;
    if (!r || r.day !== state.day || r.day === refillTaken || (arriving && !behind) || !homeInView()) return;
    refillTaken = r.day;
    // Without both counters on the page there's nowhere for the refill to land, so it's only marked seen (Q29).
    if (!clockOn() || cardsMode() !== 'limited') {
      send({ type: 'refillSeen' }).then(absorb);
      return;
    }
    const refill = /** @type {const} */ ({ kind: 'new', watch: r.watch, rec: r.rec });
    if (behind) queued = refill;
    else arriving = refill;
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
        if (Date.now() - started > 10000) {
          arriving = null;
          queued = null;
          rendered = '';
          render();
          return;
        }
        // Another tab showed it first: the next one, if any, waits its turn.
        if ((arriving.kind === 'new' && state && !state.refill) || (arriving.kind === 'back' && state && !state.dryBack)) {
          arriving = queued;
          queued = null;
          rendered = '';
          render();
          continue;
        }
        const fell = lockFellAt >= started;
        // watch.js lets the water fall within 4 seconds of home showing. Past 6, the drops come in anyway.
        const lockUp = !!document.getElementById('drip-lock') && !fell && Date.now() - started < 6000;
        if (state && counts.watch?.row.isConnected && homeInView() && !lockUp && !moving) break;
        await sleep(50);
      }
      if (!arriving) return;
      await sleep(lockFellAt >= started ? 250 : 400);
      // State that came in during the wait may hold drops back to go after the kept drops.
      takeDryBack();
      await land();
    } finally {
      waiting = false;
    }
    // A landing that came up while this one ran (the drops back, or the day's refill) goes next.
    if (arriving && !landing) landWhenShown();
  }


  async function land() {
    const a = arriving;
    try {
      if (!a || !state || !counts.watch || !counts.rec) return;
      landing = true;
      if (a.kind === 'back') send({ type: 'dryBackSeen' }).then(absorb);
      // Kept drops after a reset carry the refill in them already.
      else if (state.refill) {
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
      arriving = queued;
      queued = null;
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
      // An idle page changes to its dry form at the start of Dry hours and back at the end (DRY-HOURS-PLAN.md B9).
      if (state && dryKey() !== drawnDry) render();
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
    // Block's second click is meant, so it's let through; pickBlock still ignores one that's part of a double-click.
    root.addEventListener('click', (e) => {
      if (e.detail > 1 && !/** @type {Element} */ (e.target)?.closest?.('.drip-menu-item.is-armed')) e.stopPropagation();
    }, true);
    // Holding Enter repeats a button's click, and keyboard clicks get past the guard above. A repeat could carry on into
    // the Watch a finished reveal moves focus to, or start another Reveal next (Codex, 2026-10-16).
    root.addEventListener('keydown', (e) => {
      if (e.repeat && e.key === 'Enter') e.preventDefault();
      if (e.key === 'Escape' && menuFor) {
        dropMenu();
        focusIn('card-more');
      }
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
    // The stash turned off with its full-stash list open: the list goes with its button (Codex, 2026-10-15).
    if (state && state.settings.stash === false) swapFor = '';
    render();
  });
  watchFor('home', SEL.homeBrowse, (/** @type {string} */ path) => path === '/');
  document.addEventListener('yt-navigate-finish', () => mount(true));
  document.addEventListener('yt-navigate-start', () => {
    restoreSearch();
    homeVisit++;
    blockedCard = null;
    closeMenu();
  });
  for (const ev of ['resize', 'scroll']) window.addEventListener(ev, fitSuggestions, { passive: true });
  document.addEventListener('focusin', fitSuggestions);
  // A click anywhere but the card's ⋯ menu closes it.
  document.addEventListener('pointerdown', (e) => {
    if (!menuFor || /** @type {Element} */ (e.target)?.closest?.('.drip-card-menu')) return;
    dropMenu();
  });
  // Back from the watch page can bring this page back from Chrome's cache, still waiting on Watch.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted || !leaving) return;
    leaving = false;
    goingTo = '';
    mount(true);
  });
  setInterval(() => mount(), 500);
  mount();
})();
