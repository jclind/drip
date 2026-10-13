// @ts-check
// The watch clock (watch.js) against a fake page, a fake video, and a fake worker that runs the real rules.
// Written from DESIGN.md (Q3, Q10, "The clock with several tabs") and AUDIT.md findings 1, 4, 12, 13.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');

class FakeElement {
  /** @param {string} tag */
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    /** @type {Map<string, string>} */
    this.attrs = new Map();
    /** @type {any[]} */
    this.children = [];
    /** @type {FakeElement | null} */
    this.parent = null;
    this.className = '';
    this.rebuilds = 0;
    /** @type {Record<string, string>} */
    this.dataset = {};
    const props = new Map();
    this.style = { cssText: '', transform: '', opacity: '', /** @param {string} k @param {string} v */ setProperty: (k, v) => props.set(k, v) };
    const el = this;
    this.classList = {
      /** @param {string} c */
      contains: (c) => el.className.split(' ').includes(c),
      /** @param {string} c */
      add: (c) => { if (!el.classList.contains(c)) el.className = `${el.className} ${c}`.trim(); },
      /** @param {string} c */
      remove: (c) => { el.className = el.className.split(' ').filter((x) => x && x !== c).join(' '); },
      /** @param {string} c @param {boolean} [on] */
      toggle: (c, on) => { if (on ?? !el.classList.contains(c)) el.classList.add(c); else el.classList.remove(c); },
    };
  }
  get parentElement() { return this.parent; }
  /** @param {any} other */
  contains(other) { return this.all().includes(other); }
  get id() { return this.attrs.get('id') || ''; }
  /** @param {string} k @param {string} v */
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  /** @param {string} k */
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  /** @param {string} k */
  hasAttribute(k) { return this.attrs.has(k); }
  /** @param {string} k */
  removeAttribute(k) { this.attrs.delete(k); }
  /** @param {string} k @param {boolean} [on] */
  toggleAttribute(k, on) { if (on ?? !this.attrs.has(k)) this.attrs.set(k, ''); else this.attrs.delete(k); }
  addEventListener() {}
  /** @param {...any} kids */
  append(...kids) { for (const k of kids) { if (k instanceof FakeElement) k.parent = this; this.children.push(k); } }
  /** @param {...any} kids */
  replaceChildren(...kids) { this.children = []; this.rebuilds++; this.append(...kids); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  /** Only `.class` selectors, which is all watch.js asks of its own elements. @param {string} sel */
  querySelector(sel) {
    if (!sel.startsWith('.')) return null;
    return this.all().slice(1).find((el) => el.className.split(' ').includes(sel.slice(1))) || null;
  }
  /** @param {any} other */
  replaceWith(other) {
    const parent = this.parent;
    if (!parent) return;
    const i = parent.children.indexOf(this);
    other.parent = parent;
    parent.children[i] = other;
    this.parent = null;
  }
  get textContent() { return this.children.map((c) => (c instanceof FakeElement ? c.textContent : String(c))).join(''); }
  /** @returns {FakeElement[]} */
  all() { return [this, ...this.children.flatMap((c) => (c instanceof FakeElement ? c.all() : []))]; }
}

function fakeStorage() {
  const items = new Map();
  return {
    /** @param {string} k */
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    /** @param {string} k @param {string} v */
    setItem: (k, v) => { items.set(k, String(v)); },
    /** @param {string} k */
    removeItem: (k) => { items.delete(k); },
  };
}

class FakeVideo {
  constructor() {
    this.paused = true;
    this.readyState = 4;
    this.duration = 600;
    /** @type {Record<string, Function[]>} */
    this.handlers = {};
  }
  /** @param {string} ev @param {Function} fn */
  addEventListener(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  /** @param {string} ev @param {Function} fn */
  removeEventListener(ev, fn) { this.handlers[ev] = (this.handlers[ev] || []).filter((f) => f !== fn); }
  /** @param {string} ev */
  fire(ev) { for (const fn of this.handlers[ev] || []) fn(); }
  async play() { if (this.paused) { this.paused = false; this.fire('playing'); } }
  pause() { if (!this.paused) { this.paused = true; this.fire('pause'); } }
}

/**
 * One YouTube tab running watch.js, and a worker shared by every tab made with the same `world`.
 * @param {ReturnType<typeof makeWorld>} world
 * @param {string} videoId
 */
function makeTab(world, videoId, { hasPage = false, theater = false, ready = false } = {}) {
  const video = new FakeVideo();
  const root = new FakeElement('html');
  const body = new FakeElement('body');
  /** @type {Record<string, Function[]>} */
  const docHandlers = {};
  const location = { pathname: '/watch', search: `?v=${videoId}` };
  /** @type {Map<number, Function>} */
  const intervals = new Map();
  let nextInterval = 0;
  // The watch page and its theater button. Like YouTube on a full load, a click before the player is ready does nothing,
  // and a click that lands changes the layout a moment later, not during the click.
  // These flags exist before watch.js loads, because it looks for the page while it starts.
  const player = { hasPage, ready, ad: false };
  const page = new FakeElement('ytd-watch-flexy');
  page.toggleAttribute('theater', theater);
  // #movie_player, and the observers watching its class for ads.
  const playerEl = new FakeElement('div');
  /** @type {any} */ (playerEl).classList = { contains: () => false };
  /** @type {Function[]} */
  const classWatchers = [];
  class FakeMutationObserver {
    /** @param {Function} fn */
    constructor(fn) { this.fn = fn; }
    observe() { classWatchers.push(this.fn); }
    disconnect() { const i = classWatchers.indexOf(this.fn); if (i >= 0) classWatchers.splice(i, 1); }
  }
  const theaterButton = {
    clicks: 0,
    click() {
      this.clicks++;
      if (player.ready) setImmediate(() => page.toggleAttribute('theater'));
    },
  };
  /** @param {string} sel */
  page.querySelector = (sel) => (sel === '.ytp-size-button' ? theaterButton : null);
  const document = {
    documentElement: root,
    body,
    activeElement: null,
    fullscreenElement: null,
    /** @param {string} tag */
    createElement: (tag) => new FakeElement(tag),
    /** @param {string} _ns @param {string} tag */
    createElementNS: (_ns, tag) => new FakeElement(tag),
    /** @param {string} sel */
    querySelector: (sel) => {
      if (sel === '#movie_player video.html5-main-video') return tab.noPlayer ? null : video;
      if (sel === 'ytd-watch-flexy') return player.hasPage ? page : null;
      if (sel === '#movie_player.ad-showing, #movie_player.ad-interrupting') return player.ad ? playerEl : null;
      if (sel === '#movie_player') return tab.noPlayer ? null : playerEl;
      return null;
    },
    /** @param {string} id */
    /** @param {string} id @returns {any} */
    getElementById: (id) => [...body.all(), ...playerEl.all()].find((el) => el.id === id) || null,
    /** @param {string} ev @param {Function} fn */
    addEventListener: (ev, fn) => { (docHandlers[ev] ||= []).push(fn); },
    /** @param {{type: string}} event */
    dispatchEvent: (event) => { for (const fn of docHandlers[event.type] || []) fn(event); return true; },
  };
  /** @type {any} */
  const context = {
    navigator: { userAgent: 'test', clipboard: { writeText: async () => {} } },
    document, location, URLSearchParams, JSON, Math, Number, String, Set, Array, Object, Promise, console,
    MutationObserver: FakeMutationObserver,
    localStorage: fakeStorage(), sessionStorage: fakeStorage(),
    performance: { now: () => world.now },
    Date: class extends Date { static now() { return world.epoch + world.now; } },
    CustomEvent: class { /** @param {string} type */ constructor(type) { this.type = type; } },
    setTimeout, matchMedia: () => ({ matches: false }),
    setInterval: (/** @type {Function} */ fn) => { intervals.set(++nextInterval, fn); return nextInterval; },
    clearInterval: (/** @type {number} */ id) => { intervals.delete(id); },
    chrome: {
      runtime: { id: 'drip', onMessage: { addListener() {} }, sendMessage: (/** @type {any} */ msg) => world.handle(msg), getManifest: () => ({ version: '0.1.0' }), getURL: (/** @type {string} */ p) => p },
      storage: { onChanged: { addListener: (/** @type {Function} */ fn) => world.listeners.push(fn) } },
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ['lib/state.js', 'lib/glass.js', 'content/common.js', 'content/stash.js', 'content/swap.js', 'content/watch.js']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), context);
  }
  const tab = {
    noPlayer: false,
    player, page, theaterButton,
    /** Starts or ends an ad, the way YouTube flips the player's class. @param {boolean} on */
    setAd: (on) => { player.ad = on; for (const fn of [...classWatchers]) fn(); },
    /** Runs every timer once, as one second passing would. */
    second: async () => { for (const fn of [...intervals.values()]) await fn(); await settle(); },
    broken: () => document.getElementById('drip-broken'),
    video, root, body, location,
    pill: () => document.getElementById('drip-pill'),
    locked: () => !!document.getElementById('drip-lock'),
    lockText: () => document.getElementById('drip-lock')?.textContent || '',
    /** Runs watch.js's 1-second tick. */
    tick: async () => { await /** @type {Function} */ ([...intervals.values()].find((fn) => fn.name === 'tick'))(); await settle(); },
    /** @param {string} id */
    navigate: async (id) => {
      document.dispatchEvent({ type: 'yt-navigate-start' });
      location.search = `?v=${id}`;
      // Loading a new source empties the element and sets paused without a pause event, as the HTML spec says.
      video.fire('emptied');
      video.paused = true;
      document.dispatchEvent({ type: 'yt-navigate-finish' });
      await settle();
    },
  };
  world.tabs.push(tab);
  return tab;
}

function makeWorld() {
  require('../src/lib/state.js');
  const D = /** @type {any} */ (globalThis).Drip;
  const world = {
    epoch: new Date(2026, 9, 6, 12).getTime(),
    now: 0,
    state: D.initialState(new Date(2026, 9, 6, 12).getTime()),
    clock: { lastChargeEnd: 0 },
    /** @type {{type: string, seconds?: number, videoId?: string}[]} */
    sent: [],
    /** @type {Function[]} */
    listeners: [],
    /** @type {any[]} */
    tabs: [],
    failTicks: 0,
    /** @param {any} msg */
    async handle(msg) {
      world.sent.push(msg);
      const now = world.epoch + world.now;
      let result;
      if (msg.type === 'tick') {
        if (world.failTicks > 0) {
          world.failTicks--;
          return { ok: false, error: 'Error: write failed' };
        }
        result = { ok: true, ...D.chargeTick(world.state, world.clock, now, msg.seconds, msg.videoId, msg.ago) };
      } else if (msg.type === 'status') result = { ok: true, ...D.watchStatus(world.state, msg.videoId) };
      else if (msg.type === 'spendWatch') result = D.spendWatch(world.state);
      else result = { ok: true };
      const saved = structuredClone(world.state);
      for (const fn of world.listeners) fn({ drip: { newValue: saved } }, 'local');
      return { ...result, state: saved };
    },
    /** @param {number} seconds */
    advance(seconds) { world.now += seconds * 1000; },
    ticks: () => world.sent.filter((m) => m.type === 'tick'),
    D,
  };
  return world;
}

async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
}

/** Plays for `seconds`, running the 1-second tick after each second. */
async function play(/** @type {any} */ world, /** @type {any} */ tab, /** @type {number} */ seconds) {
  for (let i = 0; i < seconds; i++) {
    world.advance(1);
    await tab.tick();
  }
}

async function setup(watchSeconds = 900) {
  const world = makeWorld();
  world.state.watchSecondsLeft = watchSeconds;
  const tab = makeTab(world, 'aaa');
  await settle();
  await tab.video.play();
  await tab.tick();
  world.sent.length = 0;
  return { world, tab };
}

test('playback is charged in full, in a few batched ticks rather than one per second (finding 1)', async () => {
  const { world, tab } = await setup();
  await play(world, tab, 12);
  tab.video.pause();
  await tab.tick();
  const ticks = world.ticks();
  assert.ok(ticks.length <= 4, `${ticks.length} ticks`);
  const total = ticks.reduce((sum, t) => sum + /** @type {number} */ (t.seconds), 0);
  assert.ok(Math.abs(total - 12) < 0.01, `charged ${total}`);
  assert.ok(Math.abs(world.state.watchSecondsLeft - 888) < 0.01);
});

test('ad time is not charged, and the video after it is (Q27)', async () => {
  const { world, tab } = await setup();
  tab.setAd(true);
  await play(world, tab, 20);
  tab.setAd(false);
  await play(world, tab, 10);
  tab.video.pause();
  await tab.tick();
  const total = world.ticks().reduce((sum, t) => sum + /** @type {number} */ (t.seconds), 0);
  assert.ok(Math.abs(total - 10) < 0.01, `charged ${total}`);
  assert.ok(Math.abs(world.state.watchSecondsLeft - 890) < 0.01);
});

test('a delayed tick spanning video, an ad, and video again charges only the video (Codex, Q27)', async () => {
  const { world, tab } = await setup();
  // No tick runs in between, as when Chrome throttles a background tab's timers.
  world.advance(3);
  tab.setAd(true);
  world.advance(20);
  tab.setAd(false);
  world.advance(1);
  await tab.tick();
  tab.video.pause();
  await tab.tick();
  const total = world.ticks().reduce((sum, t) => sum + /** @type {number} */ (t.seconds), 0);
  assert.ok(Math.abs(total - 4) < 0.01, `charged ${total}`);
});

test('time before and after an ad stays in separate entries, so another tab during the ad is still charged (Codex, Q27)', async () => {
  const world = makeWorld();
  world.state.watchSecondsLeft = 900;
  const a = makeTab(world, 'aaa');
  const b = makeTab(world, 'bbb');
  await settle();
  await a.video.play();
  await a.tick();
  world.sent.length = 0;
  // Tab A's timers are throttled, so it doesn't tick until the end.
  world.advance(3);
  a.setAd(true);
  // Tab B plays the last 4 seconds of A's 20-second ad.
  world.advance(16);
  await b.video.play();
  await b.tick();
  for (let i = 0; i < 4; i++) { world.advance(1); await b.tick(); }
  b.video.pause();
  await b.tick();
  a.setAd(false);
  world.advance(1);
  await a.tick();
  a.video.pause();
  await a.tick();
  assert.ok(Math.abs(world.state.watchSecondsLeft - 892) < 0.01, `${900 - world.state.watchSecondsLeft} charged`);
});

test('the pill does not count down during an ad (Codex, Q27)', async () => {
  const { world, tab } = await setup();
  tab.setAd(true);
  // A state update renders the pill mid-ad, before the next tick has dropped the ad time.
  world.advance(90);
  await world.handle({ type: 'get' });
  await settle();
  assert.match(tab.pill().textContent, /^15m left today/);
});

test('nothing is sent while the video is paused', async () => {
  const { world, tab } = await setup();
  tab.video.pause();
  await tab.tick();
  world.sent.length = 0;
  for (let i = 0; i < 10; i++) {
    world.advance(1);
    await tab.tick();
  }
  assert.equal(world.ticks().length, 0);
});

test('time runs out on time: the video stops within a second of zero (Q3)', async () => {
  const { world, tab } = await setup(3);
  await play(world, tab, 5);
  assert.equal(tab.video.paused, true);
  assert.equal(world.state.watchSecondsLeft, 0);
  assert.ok(tab.locked());
  const total = world.ticks().reduce((sum, t) => sum + /** @type {number} */ (t.seconds), 0);
  assert.ok(total <= 4.01, `played ${total} seconds on a 3-second balance`);
});

test('the lock screen says what can still happen: buy minutes, unlock, or nothing until the reset (DESIGN.md "Lock screen")', async () => {
  const { world, tab } = await setup(3);
  await play(world, tab, 5);
  assert.match(tab.lockText(), /^Time for a breather\./);
  assert.match(tab.lockText(), /watched today/);
  assert.doesNotMatch(tab.lockText(), /last Monday/, 'no log a week back, so no comparison');
  assert.match(tab.lockText(), /\+15m/);
  assert.match(tab.lockText(), /Done for now/);
  assert.match(tab.lockText(), /I need this one · 2 left/);
  assert.doesNotMatch(tab.lockText(), /token/i);

  world.state.tokens.watch = 0;
  world.state.unlocked = ['x', 'y'];
  world.state.log['2026-09-29'] = { ...structuredClone(world.state.log[world.state.day]), watchedSec: 3000 };
  await tab.second();
  assert.match(tab.lockText(), /^You've had your fill\./);
  assert.match(tab.lockText(), /· 50m last Tuesday/);
  assert.doesNotMatch(tab.lockText(), /\+15m|I need this one/);
  assert.match(tab.lockText(), /The glass refills at 4:00am\./);
});

test("time played before a navigation is charged to the video it played on (finding 12)", async () => {
  const { world, tab } = await setup();
  world.state.unlocked = ['bbb'];
  await play(world, tab, 3);
  await tab.navigate('bbb');
  await tab.video.play();
  await play(world, tab, 3);
  tab.video.pause();
  await tab.tick();
  const byVideo = /** @type {Record<string, number>} */ ({});
  for (const t of world.ticks()) byVideo[/** @type {string} */ (t.videoId)] = (byVideo[/** @type {string} */ (t.videoId)] || 0) + /** @type {number} */ (t.seconds);
  assert.ok(Math.abs((byVideo.aaa || 0) - 3) < 0.01, JSON.stringify(byVideo));
  assert.ok(Math.abs((byVideo.bbb || 0) - 3) < 0.01, JSON.stringify(byVideo));
  assert.ok(Math.abs(world.state.watchSecondsLeft - 897) < 0.01, `left ${world.state.watchSecondsLeft}`);
});

test('paid time held back across a navigation is charged in full, not merged with the next video (Codex)', async () => {
  const { world, tab } = await setup();
  await play(world, tab, 3);
  await tab.navigate('bbb');
  await tab.video.play();
  await play(world, tab, 3);
  tab.video.pause();
  await tab.tick();
  await tab.tick();
  assert.ok(Math.abs(world.state.watchSecondsLeft - 894) < 0.01, `left ${world.state.watchSecondsLeft}`);
});

test('a tick the worker refuses is sent again, not lost (finding 17)', async () => {
  const { world, tab } = await setup();
  world.failTicks = 1;
  await play(world, tab, 10);
  tab.video.pause();
  await tab.tick();
  await tab.tick();
  assert.ok(Math.abs(world.state.watchSecondsLeft - 890) < 0.01, `left ${world.state.watchSecondsLeft}`);
});

test('the pill says paused while the video is paused, and stays up and shimmers in the last two minutes', async () => {
  const { world, tab } = await setup(900);
  assert.doesNotMatch(tab.pill().textContent, /paused/);
  tab.video.pause();
  await tab.tick();
  assert.match(tab.pill().textContent, /^15m left today · paused/);
  assert.doesNotMatch(tab.pill().className, /is-low/);

  world.state.watchSecondsLeft = 100;
  // Any message saves the state, and the tab hears about it like a storage change.
  await world.handle({ type: 'status', videoId: 'aaa' });
  await tab.video.play();
  await tab.tick();
  assert.match(tab.pill().className, /is-low/);
  assert.doesNotMatch(tab.pill().textContent, /paused/);
  tab.video.pause();
  await tab.tick();
  assert.doesNotMatch(tab.pill().className, /is-low/, 'no shimmer while nothing drains');
});

test('the Save button is not rebuilt while nothing it shows changes (finding 4)', async () => {
  const { world, tab } = await setup();
  tab.video.pause();
  await tab.tick();
  const pill = tab.pill();
  assert.ok(pill);
  const before = pill.rebuilds;
  for (let i = 0; i < 10; i++) {
    world.advance(1);
    await tab.tick();
  }
  assert.equal(pill.rebuilds, before);
});

test('with grace on, a video playing in another tab when time runs out also gets to finish (finding 13, Q3)', async () => {
  const world = makeWorld();
  world.state.watchSecondsLeft = 2;
  world.state.settings.graceMode = true;
  const a = makeTab(world, 'aaa');
  const b = makeTab(world, 'bbb');
  await settle();
  await a.video.play();
  await b.video.play();
  await a.tick();
  await b.tick();
  for (let i = 0; i < 4; i++) {
    world.advance(1);
    await a.tick();
    await b.tick();
  }
  assert.equal(world.state.watchSecondsLeft, 0);
  assert.equal(a.video.paused, false, 'tab A keeps playing in grace');
  assert.equal(b.video.paused, false, 'tab B keeps playing in grace');
  assert.equal(a.root.getAttribute('data-drip-grace'), 'aaa');
  assert.equal(b.root.getAttribute('data-drip-grace'), 'bbb');
});

test('with grace off, every playing tab stops at zero', async () => {
  const world = makeWorld();
  world.state.watchSecondsLeft = 2;
  const a = makeTab(world, 'aaa');
  const b = makeTab(world, 'bbb');
  await settle();
  await a.video.play();
  await b.video.play();
  for (let i = 0; i < 4; i++) {
    world.advance(1);
    await a.tick();
    await b.tick();
  }
  assert.equal(a.video.paused, true);
  assert.equal(b.video.paused, true);
});

test('a watch page with no player for 10 seconds says drip is broken and locks nothing (Q25)', async () => {
  const world = makeWorld();
  const tab = makeTab(world, 'aaa');
  tab.noPlayer = true;
  await settle();
  for (let i = 0; i < 9; i++) {
    world.advance(1);
    await tab.second();
  }
  assert.equal(tab.broken(), null, 'not before 10 seconds');
  for (let i = 0; i < 2; i++) {
    world.advance(1);
    await tab.second();
  }
  assert.ok(tab.broken());
  assert.match(tab.broken().textContent, /video player/);
  assert.equal(tab.locked(), false);
  assert.ok(tab.root.hasAttribute('data-drip-broken'), 'guard.js lets play() through');
});

test('a player that comes back and then goes missing again drops the lock again (Codex)', async () => {
  const world = makeWorld();
  const tab = makeTab(world, 'aaa');
  tab.noPlayer = true;
  await settle();
  for (let i = 0; i < 11; i++) { world.advance(1); await tab.second(); }
  tab.noPlayer = false;
  for (let i = 0; i < 2; i++) { world.advance(1); await tab.second(); }
  assert.equal(tab.root.hasAttribute('data-drip-broken'), false);
  assert.ok(tab.locked(), 'the lock is back with a player and 0 minutes');
  tab.noPlayer = true;
  for (let i = 0; i < 12; i++) { world.advance(1); await tab.second(); }
  assert.equal(tab.locked(), false);
  assert.ok(tab.root.hasAttribute('data-drip-broken'));
});

/** A funded tab whose watch page and theater button exist from the start, as on a full page load. */
function theaterSetup(theaterOn = false) {
  const world = makeWorld();
  world.state.watchSecondsLeft = 900;
  const tab = makeTab(world, 'aaa', { hasPage: true, theater: theaterOn });
  return { world, tab };
}

test('a theater click YouTube ignores on a full load is tried again until theater mode is on (Q26)', async () => {
  const { world, tab } = theaterSetup();
  await settle();
  assert.equal(tab.theaterButton.clicks, 1, 'clicked as soon as the button was there');
  assert.equal(tab.page.hasAttribute('theater'), false, 'too early, so YouTube ignored it');
  tab.player.ready = true;
  world.advance(1.5);
  await tab.second();
  assert.equal(tab.theaterButton.clicks, 2);
  assert.ok(tab.page.hasAttribute('theater'));
  for (let i = 0; i < 12; i++) { world.advance(1); await tab.second(); }
  assert.equal(tab.theaterButton.clicks, 2, 'stops once theater mode is on, so it never turns it back off');
  assert.ok(tab.page.hasAttribute('theater'));
});

test('a player that is ready at once gets one click, not a second one that turns theater back off', async () => {
  const world = makeWorld();
  world.state.watchSecondsLeft = 900;
  const tab = makeTab(world, 'aaa', { hasPage: true, ready: true });
  await settle();
  for (let i = 0; i < 3; i++) { world.advance(1); await tab.second(); }
  assert.equal(tab.theaterButton.clicks, 1);
  assert.ok(tab.page.hasAttribute('theater'));
});

test('a page already in theater mode gets no click', async () => {
  const { world, tab } = theaterSetup(true);
  await settle();
  for (let i = 0; i < 3; i++) { world.advance(1); await tab.second(); }
  assert.equal(tab.theaterButton.clicks, 0);
  assert.ok(tab.page.hasAttribute('theater'));
});

test('a player that never takes the click is left alone after 10 seconds, even while it plays (Codex)', async () => {
  const { world, tab } = theaterSetup();
  await settle();
  // Playback sends ticks, and each reply calls applyStatus. That must not start the clicking over.
  await tab.video.play();
  for (let i = 0; i < 10; i++) { world.advance(1); await tab.second(); }
  const clicks = tab.theaterButton.clicks;
  assert.ok(clicks > 1 && clicks <= 8, `${clicks} clicks in 10 seconds`);
  for (let i = 0; i < 20; i++) { world.advance(1); await tab.second(); }
  assert.equal(tab.theaterButton.clicks, clicks);
});
