// @ts-check
// The watch clock (watch.js) against a fake page, a fake video, and a fake worker that runs the real rules.
// Written from DESIGN.md (Q3, Q10, "The clock with several tabs") and AUDIT.md findings 1, 4, 12, 13.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');

/** Every time a lock is taken off a page, for the test that checks it rises once. */
let lockRemoved = 0;

/** A text node, so morph.js can patch text in place. */
class FakeText {
  /** @param {string} data */
  constructor(data) {
    this.nodeType = 3;
    this.data = data;
    /** @type {any} */
    this.parent = null;
  }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((/** @type {any} */ c) => c !== this); this.parent = null; }
  toString() { return this.data; }
}

class FakeElement {
  /** @param {string} tag */
  constructor(tag) {
    this.nodeType = 1;
    this.localName = tag.toLowerCase();
    this.tagName = tag.toUpperCase();
    /** @type {Map<string, string>} */
    this.attrs = new Map();
    /** @type {any[]} */
    this.children = [];
    /** @type {FakeElement | null} */
    this.parent = null;
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
  get parentNode() { return this.parent; }
  get childNodes() { return this.children; }
  get attributes() { return [...this.attrs].map(([name, value]) => ({ name, value })); }
  // As in a browser, className is the class attribute.
  get className() { return this.attrs.get('class') || ''; }
  set className(v) { if (v) this.attrs.set('class', String(v)); else this.attrs.delete('class'); }
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
  /** Kept so a test can press a lock button, never fired on its own. It runs with the element as this, as in a browser. @param {string} type @param {Function} fn */
  addEventListener(type, fn) { (this.listeners ||= {})[type] = (/** @type {any} */ e = {}) => fn.call(this, Object.assign(e, { type: e.type || type })); }
  /** Takes a node from wherever it was, as appending in a browser does. @param {any} k */
  adopt(k) {
    const node = typeof k === 'string' || typeof k === 'number' ? new FakeText(String(k)) : k;
    if (node instanceof FakeElement || node instanceof FakeText) { node.remove(); node.parent = this; }
    return node;
  }
  /** @param {...any} kids */
  append(...kids) { for (const k of kids) this.children.push(this.adopt(k)); }
  /** @param {any} node @param {any} ref */
  insertBefore(node, ref) {
    if (!ref) return this.append(node);
    const n = this.adopt(node);
    this.children.splice(this.children.indexOf(ref), 0, n);
  }
  /** @param {...any} kids */
  replaceChildren(...kids) { for (const c of this.children) c.parent = null; this.children = []; this.rebuilds++; this.append(...kids); }
  remove() { if (this.id === 'drip-lock' && this.parent) lockRemoved++; if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
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
    if (other.parent) other.remove();
    other.parent = parent;
    parent.children[i] = other;
    this.parent = null;
  }
  get textContent() { return this.children.map((c) => (c instanceof FakeElement ? c.textContent : String(c))).join(''); }
  set textContent(v) { for (const c of this.children) c.parent = null; this.children = []; this.append(String(v)); }
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
  /** @type {any} */ (playerEl).classList = { contains: (/** @type {string} */ c) => c === 'playing-mode' && !video.paused };
  const playButton = { clicks: 0, click() { this.clicks++; video.pause(); } };
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
    title: 'Test video - YouTube',
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
      if (sel === '#movie_player video.html5-main-video') return tab.noPlayer || tab.noVideo ? null : video;
      if (sel === 'ytd-watch-flexy') return player.hasPage ? page : null;
      if (sel === '#movie_player.ad-showing, #movie_player.ad-interrupting') return player.ad ? playerEl : null;
      if (sel === '#movie_player') return tab.noPlayer ? null : playerEl;
      if (sel === '#movie_player .ytp-play-button') return tab.noPlayer ? null : playButton;
      if (sel === 'ytd-watch-metadata ytd-channel-name a, #owner ytd-channel-name a') return tab.owner;
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
    document, location, URLSearchParams, JSON, Math, Number, String, Set, Array, Object, Promise, console, crypto,
    MutationObserver: FakeMutationObserver,
    localStorage: fakeStorage(), sessionStorage: fakeStorage(),
    performance: { now: () => world.now },
    Date: class extends Date { static now() { return world.epoch + world.now; } },
    CustomEvent: class { /** @param {string} type */ constructor(type) { this.type = type; } },
    setTimeout, matchMedia: () => ({ matches: false }),
    // Reduced motion, so a lock button press skips the drop animation, which needs real layout.
    window: { matchMedia: () => ({ matches: true }), innerHeight: 800 },
    setInterval: (/** @type {Function} */ fn) => { intervals.set(++nextInterval, fn); return nextInterval; },
    clearInterval: (/** @type {number} */ id) => { intervals.delete(id); },
    chrome: {
      runtime: { id: 'drip', onMessage: { addListener() {} }, sendMessage: (/** @type {any} */ msg) => world.handle(msg), getManifest: () => ({ version: '0.1.0' }), getURL: (/** @type {string} */ p) => p },
      storage: { onChanged: { addListener: (/** @type {Function} */ fn) => world.listeners.push(fn) } },
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ['lib/state.js', 'lib/glass.js', 'lib/morph.js', 'content/common.js', 'content/stash.js', 'content/swap.js', 'content/watch.js']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), context);
  }
  const removedBefore = lockRemoved;
  const tab = {
    noPlayer: false,
    noVideo: false,
    /** @type {FakeElement | null} */
    owner: null,
    player, page, theaterButton, playButton,
    /** Starts or ends an ad, the way YouTube flips the player's class. @param {boolean} on */
    setAd: (on) => { player.ad = on; for (const fn of [...classWatchers]) fn(); },
    /** Runs every timer once, as one second passing would. */
    second: async () => { for (const fn of [...intervals.values()]) await fn(); await settle(); },
    broken: () => document.getElementById('drip-broken'),
    video, root, body, location,
    pill: () => document.getElementById('drip-pill'),
    locked: () => !!document.getElementById('drip-lock'),
    lockText: () => document.getElementById('drip-lock')?.textContent || '',
    /** How many times the lock was taken off the page. */
    lockRemovals: () => lockRemoved - removedBefore,
    /** Presses the lock button with this data-k. @param {string} k */
    press: async (k) => {
      const button = document.getElementById('drip-lock')?.all().find((/** @type {any} */ el) => el.getAttribute('data-k') === k);
      assert.ok(button, `no lock button ${k}`);
      button.listeners.click({ detail: 1 });
      await settle();
    },
    /** Types into the lock's reason box. @param {string} text */
    type: (text) => {
      const box = document.getElementById('drip-lock')?.all().find((/** @type {any} */ el) => el.tagName === 'TEXTAREA');
      assert.ok(box, 'no reason box');
      box.value = text;
    },
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
    /** @type {{type: string, seconds?: number, videoId?: string, key?: string, playing?: boolean, ago?: number}[]} */
    sent: [],
    /** @type {Function[]} */
    listeners: [],
    /** @type {any[]} */
    tabs: [],
    failTicks: 0,
    /** Ticks the worker charges whose reply never reaches the tab. */
    loseReplies: 0,
    /** @param {any} msg */
    async handle(msg) {
      world.sent.push(msg);
      const now = world.epoch + world.now;
      // As the worker does before every message but a tick, whose seconds it charges first (Q32).
      if (msg.type !== 'tick') D.enterDry(world.state, now);
      let result;
      if (msg.type === 'tick') {
        if (world.failTicks > 0) {
          world.failTicks--;
          return { ok: false, error: 'Error: write failed' };
        }
        result = { ok: true, ...D.chargeTick(world.state, world.clock, now, msg.seconds, msg.videoId, msg.ago, msg.key), locked: world.lockedReply(msg.videoId, now) };
        if (world.loseReplies > 0) {
          world.loseReplies--;
          return undefined;
        }
      } else if (msg.type === 'status') result = { ok: true, ...D.watchStatus(world.state, msg.videoId) };
      else if (msg.type === 'spendWatch') result = D.spendWatch(world.state, now);
      else if (msg.type === 'needThis') result = D.needThis(world.state, msg.videoId, msg.title || '', msg.reason || '', now);
      else if (msg.type === 'addBacklog') result = D.addBacklog(world.state, msg.video, msg.index, now);
      else if (msg.type === 'removeBacklog') result = D.removeBacklog(world.state, msg.id);
      else if (msg.type === 'swapBacklog') result = D.swapBacklog(world.state, msg.video, String(msg.dropId), msg.index, now);
      else if (msg.type === 'allowedVideo') result = D.allowedVideo(world.state, msg.videoId, msg.channel);
      else result = { ok: true };
      D.enterDry(world.state, now);
      const saved = structuredClone(world.state);
      for (const fn of world.listeners) fn({ drip: { newValue: saved } }, 'local');
      return { ...result, state: saved };
    },
    /** The tick reply's lock, as background.js computes it. @param {string} id @param {number} now */
    lockedReply: (id, now) => D.watchStatus(world.state, id, now).locked,
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

test('ticks carry the playing flag, including an immediate stop with zero ago', async () => {
  const { world, tab } = await setup();
  await play(world, tab, 5);
  assert.equal(world.ticks().at(-1).playing, true);
  world.advance(1);
  tab.video.pause();
  await tab.tick();
  const stopped = world.ticks().at(-1);
  assert.equal(stopped.playing, false);
  assert.equal(stopped.ago, 0);
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

test('during an ad, zero-second ticks keep the toolbar told that playback goes on (Codex, 2026-10-14)', async () => {
  const { world, tab } = await setup();
  tab.setAd(true);
  await play(world, tab, 20);
  const heartbeats = world.ticks().filter((t) => t.seconds === 0);
  assert.ok(heartbeats.length >= 3, `${heartbeats.length} heartbeats in 20 seconds of ad`);
  assert.ok(heartbeats.every((t) => t.playing === true && !t.key));
  assert.equal(world.state.watchSecondsLeft, 900);
});

test('a pause with no time banked still tells the toolbar playback stopped (Codex, 2026-10-14)', async () => {
  const { world, tab } = await setup();
  await play(world, tab, 5);
  tab.video.pause();
  await tab.tick();
  world.sent.length = 0;
  await tab.video.play();
  await tab.tick();
  assert.equal(world.ticks().at(-1)?.playing, true, 'playing again is told at once');
  tab.video.pause();
  await tab.tick();
  const last = world.ticks().at(-1);
  assert.equal(last?.playing, false);
  assert.equal(last?.seconds, 0);
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

for (const [minutes, label] of [[15, '15m'], [75, '1h 15m']]) {
  test(`the first lock of the day with drops says how to start, at ${minutes} minutes per drop`, async () => {
    const world = makeWorld();
    world.state.settings.minutesPerToken = minutes;
    world.state.log['2026-09-29'] = { ...structuredClone(world.D.logDay(world.state)), watchedSec: 3000 };
    const tab = makeTab(world, 'aaa');
    await settle();
    await tab.second();
    assert.ok(tab.locked());
    assert.match(tab.lockText(), /^Start with a drop\./);
    assert.ok(tab.lockText().includes(`Each drop buys ${label} of watching.`));
    assert.doesNotMatch(tab.lockText(), /watched today|last Tuesday|Time for a breather/);
  });
}

test('a first lock redraws with the watched line once any watching is logged today', async () => {
  const world = makeWorld();
  const tab = makeTab(world, 'aaa');
  await settle();
  await tab.second();
  assert.match(tab.lockText(), /^Start with a drop\./);
  for (const [seconds, label] of [[1, '<1m'], [60, '1m']]) {
    world.D.logDay(world.state).watchedSec = seconds;
    saved(world);
    await settle();
    assert.match(tab.lockText(), /^Time for a breather\./);
    assert.ok(tab.lockText().includes(`${label} watched today`));
    assert.doesNotMatch(tab.lockText(), /Start with a drop|Each drop buys/);
  }
});

test('a first lock with no drops keeps the fill headline and watched line', async () => {
  const world = makeWorld();
  world.state.tokens.watch = 0;
  const tab = makeTab(world, 'aaa');
  await settle();
  await tab.second();
  assert.match(tab.lockText(), /^You've had your fill\./);
  assert.match(tab.lockText(), /0m watched today/);
  assert.doesNotMatch(tab.lockText(), /Start with a drop|Each drop buys|\+15m/);
});

test('the lock screen says what can still happen: buy minutes, unlock, or nothing until the reset (DESIGN.md "Lock screen")', async () => {
  const { world, tab } = await setup(3);
  await play(world, tab, 5);
  assert.match(tab.lockText(), /^Time for a breather\./);
  assert.match(tab.lockText(), /watched today/);
  assert.doesNotMatch(tab.lockText(), /last Monday/, 'no log a week back, so no comparison');
  assert.match(tab.lockText(), /\+15m/);
  assert.match(tab.lockText(), /Done for now/);
  assert.match(tab.lockText(), /I need this one · 3 left this week/);
  assert.doesNotMatch(tab.lockText(), /token/i);
  assert.doesNotMatch(tab.lockText(), /Next unlock back/);

  world.state.tokens.watch = 0;
  world.state.log['2026-09-29'] = { ...structuredClone(world.state.log[world.state.day]), watchedSec: 3000 };
  // Three uses this week, the oldest on Friday the 2nd at 9:14pm, so the next one comes back Friday the 9th.
  const at = new Date(2026, 9, 2, 21, 14).getTime();
  world.state.log['2026-10-02'] = { ...structuredClone(world.state.log[world.state.day]), needThis: [{ videoId: 'x', title: '', reason: 'Class', at }] };
  world.state.log[world.state.day].needThis = [{ videoId: 'y', title: '', reason: 'Class', at: at + 3600e3 }, { videoId: 'z', title: '', reason: 'Class', at: at + 7200e3 }];
  await tab.second();
  assert.match(tab.lockText(), /^You've had your fill\./);
  assert.match(tab.lockText(), /· 50m last Tuesday/);
  assert.doesNotMatch(tab.lockText(), /\+15m|I need this one/);
  assert.match(tab.lockText(), /The glass refills at 4:00am\./);
  assert.match(tab.lockText(), /Next unlock back Friday at 9:14pm\./);
});

for (const dry of [false, true]) {
  test(`with drops left and no unlocks, the lock shows only when an unlock returns${dry ? ' during Dry hours' : ''}`, async () => {
    const world = makeWorld();
    Object.assign(world.state.settings, { dryHours: dry, dryFrom: 11, dryTo: 13 });
    world.D.logDay(world.state).needThis = [1, 2, 3].map((n) => ({ videoId: `v${n}`, title: '', reason: 'Class', at: world.epoch - n * 60e3 }));
    const tab = makeTab(world, 'aaa');
    await settle();
    await tab.second();
    assert.ok(tab.locked());
    assert.ok(world.state.tokens.watch > 0);
    assert.doesNotMatch(tab.lockText(), /refills|I need this one/);
    assert.match(tab.lockText(), /Next unlock back next Tuesday at 11:57am\./);
    if (dry) assert.match(tab.lockText(), /Dry until 1:00pm\./);
    else assert.match(tab.lockText(), /\+15m/);
  });
}

test('with drops left and unlocks disabled, the lock has no empty notes wrapper', async () => {
  const world = makeWorld();
  world.state.settings.needThisPerWeek = 0;
  const tab = makeTab(world, 'aaa');
  await settle();
  await tab.second();
  assert.ok(tab.locked());
  assert.doesNotMatch(tab.lockText(), /refills|Next unlock back|I need this one/);
  const panel = tab.body.querySelector('.drip-lock-panel');
  assert.ok(panel);
  assert.deepEqual(panel.children.filter((el) => el instanceof FakeElement).map((el) => el.className), ['drip-lock-title', 'drip-lock-sub', 'drip-lock-actions']);
});

test('a lock left open past midnight turns "tomorrow" into "today" (Codex, 2026-11-04)', async () => {
  const { world, tab } = await setup(3);
  world.state.tokens.watch = 0;
  // The oldest use comes back at 9:14am on the 7th, tomorrow.
  const at = new Date(2026, 8, 30, 9, 14).getTime();
  world.state.log['2026-09-30'] = { ...structuredClone(world.D.logDay(world.state)), needThis: [{ videoId: 'x', title: '', reason: 'Class', at }] };
  world.state.log[world.state.day] = { ...structuredClone(world.D.logDay(world.state)), needThis: [1, 2].map((n) => ({ videoId: `v${n}`, title: '', reason: 'Class', at: world.epoch - n * 60e3 })) };
  await play(world, tab, 5);
  assert.match(tab.lockText(), /Next unlock back tomorrow at 9:14am\./);
  world.advance(12 * 3600 + 60);
  for (let i = 0; i < 30; i++) await tab.second();
  assert.match(tab.lockText(), /Next unlock back today at 9:14am\./);
});

test("a failed unlock says the week's unlocks are used", async () => {
  const { world, tab } = await setup(3);
  await play(world, tab, 5);
  await tab.press('need');
  tab.type('For school');
  // Another tab used the week's last one while the reason was being typed.
  world.state.log[world.state.day].needThis = [1, 2, 3].map((n) => ({ videoId: `v${n}`, title: '', reason: 'Class', at: world.epoch - n * 60e3 }));
  await tab.press('unlock');
  assert.match(tab.lockText(), /You've used this week's unlocks\./);
  assert.doesNotMatch(tab.lockText(), /left this week|Unlock this video/, 'the lock stops offering one');
  assert.match(tab.lockText(), /Next unlock back next Tuesday at 11:57am\./);
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

test('a tick charged but whose reply got lost is not charged again after another tab plays (Codex, 2026-10-13)', async () => {
  const world = makeWorld();
  world.state.watchSecondsLeft = 900;
  const a = makeTab(world, 'aaa');
  const b = makeTab(world, 'bbb');
  await settle();
  await a.video.play();
  await a.tick();
  world.sent.length = 0;
  // Tab A plays 5 seconds. The worker charges them, but the reply never comes back.
  world.loseReplies = 1;
  await play(world, a, 5);
  a.video.pause();
  // Tab A's timers are throttled now. Tab B plays 5 seconds, which moves the clock past A's time.
  await b.video.play();
  await b.tick();
  await play(world, b, 5);
  b.video.pause();
  await b.tick();
  world.advance(1);
  await a.tick();
  const resent = world.ticks().filter((t) => t.videoId === 'aaa');
  assert.ok(resent.length >= 2 && resent[0].key === resent[1].key, `keys ${resent.map((t) => t.key)}`);
  assert.ok(Math.abs(world.state.watchSecondsLeft - 890) < 0.01, `${900 - world.state.watchSecondsLeft} charged for 10 played`);
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

test('the pill keeps its Stash button while the minutes tick down, so a press on it is not lost (Codex, 2026-11-05)', async () => {
  const { world, tab } = await setup(15 * 60);
  const stashButton = () => tab.pill().all().find((/** @type {any} */ el) => el.getAttribute('data-k') === 'pill-save');
  const before = stashButton();
  assert.match(tab.pill().textContent, /^15m/);
  // Two minutes of playing: the label goes 15m, 14m, 13m.
  await play(world, tab, 120);
  assert.match(tab.pill().textContent, /^13m/);
  assert.equal(stashButton(), before, 'the same Stash button');
});

test('Stash on the pill still says Stashed, and back, when the pill redraws in place', async () => {
  const { world, tab } = await setup(15 * 60);
  const stashButton = () => tab.pill().all().find((/** @type {any} */ el) => el.getAttribute('data-k') === 'pill-save');
  await stashButton().listeners.click({ detail: 1 });
  await settle();
  assert.equal(world.state.backlog.length, 1);
  // The word beside the bookmark; the hidden ghost after it always says Stashed, to hold the width.
  const word = () => stashButton().querySelector('.drip-stash-row')?.textContent;
  assert.equal(word(), 'Stashed');
  await stashButton().listeners.click({ detail: 1 });
  await settle();
  assert.equal(world.state.backlog.length, 0);
  assert.equal(word(), 'Stash');
});

test("the pill doesn't count a tick twice when the saved state arrives before the tick's reply (Codex, 2026-11-05)", async () => {
  // 2m 5s left. The first tick charges 5 seconds, leaving exactly 2m. The worker saves before it replies, so the
  // tab hears the new balance while those 5 seconds still wait in unsent, and used to show 1m for a moment.
  const { world, tab } = await setup(125);
  /** @type {string[]} */
  const drawn = [];
  world.listeners.push(() => drawn.push(tab.pill().textContent));
  await play(world, tab, 5);
  assert.ok(world.ticks().length >= 1, 'a tick went out');
  assert.ok(drawn.length >= 1, 'the tab heard the save');
  for (const text of drawn) assert.match(text, /^2m/, `pill drawn as "${text}" with 2m left`);
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

/** A world whose clock starts at this local time on Oct 6, with Dry hours on from 11pm to 6am. @param {number} hour @param {number} minute @param {number} [second] @param {number} [ms] */
function dryWorld(hour, minute, second = 0, ms = 0) {
  const world = makeWorld();
  world.epoch = new Date(2026, 9, 6, hour, minute, second, ms).getTime();
  world.state.day = world.D.dayKey(world.epoch, 4);
  Object.assign(world.state.settings, { dryHours: true, dryFrom: 23, dryTo: 6 });
  return world;
}

for (const [hour, minute, line] of [[23, 30, 'Dry until 6:00am.'], [22, 56, 'Dry hours start at 11:00pm.']]) {
  test(`a first lock keeps the Dry hours line: ${line}`, async () => {
    const world = dryWorld(hour, minute);
    const tab = makeTab(world, 'aaa');
    await settle();
    await tab.second();
    assert.match(tab.lockText(), /^Time for a breather\./);
    assert.ok(tab.lockText().includes(line));
    assert.doesNotMatch(tab.lockText(), /Start with a drop|Each drop buys|watched today|\+15m/);
  });
}

test('a paid video pauses when Dry hours start, with minutes left and grace mode on (Jesse, 2026-11-04)', async () => {
  const world = dryWorld(22, 59, 57);
  world.state.watchSecondsLeft = 600;
  world.state.settings.graceMode = true;
  const tab = makeTab(world, 'aaa');
  await settle();
  await tab.video.play();
  await play(world, tab, 2);
  assert.equal(tab.video.paused, false, 'before 11pm it plays');
  await play(world, tab, 2);
  assert.equal(tab.video.paused, true, 'it stops within a second of 11pm');
  assert.ok(tab.locked());
  assert.match(tab.lockText(), /Dry until 6:00am\./);
  assert.equal(tab.root.getAttribute('data-drip-grace'), null, 'no grace');
});

test('the lock rises once when Dry hours start, not up, down, and up again (Jesse, 2026-11-04)', async () => {
  const world = dryWorld(22, 59, 50);
  world.state.watchSecondsLeft = 600;
  const tab = makeTab(world, 'aaa');
  await settle();
  await tab.video.play();
  let shown = 0;
  let wasLocked = false;
  for (let i = 0; i < 20; i++) {
    world.advance(1);
    await tab.tick();
    if (tab.locked() && !wasLocked) shown++;
    wasLocked = tab.locked();
  }
  assert.ok(wasLocked);
  assert.equal(shown, 1, `the lock rose ${shown} times`);
  assert.equal(tab.lockRemovals(), 0, 'and never came down');
});

test('a tick answered just before Dry hours but arriving after them leaves the lock up (Codex, 2026-11-04)', async () => {
  const world = dryWorld(22, 59, 50);
  world.state.watchSecondsLeft = 600;
  const tab = makeTab(world, 'aaa');
  await settle();
  await tab.video.play();
  // Every reply says "not locked", as one the worker answered at 10:59:59pm would.
  world.lockedReply = () => false;
  for (let i = 0; i < 20; i++) {
    world.advance(1);
    await tab.tick();
  }
  assert.ok(tab.locked());
  assert.equal(tab.lockRemovals(), 0);
});

test('an unlocked video plays on when Dry hours start', async () => {
  const world = dryWorld(22, 59, 57);
  world.state.watchSecondsLeft = 600;
  world.state.unlocked = ['aaa'];
  const tab = makeTab(world, 'aaa');
  await settle();
  await tab.video.play();
  await play(world, tab, 6);
  assert.equal(tab.video.paused, false);
  assert.equal(tab.locked(), false);
});

test('the pill counts down to Dry hours in the 5 minutes before, and shimmers', async () => {
  const world = dryWorld(22, 54, 30);
  world.state.watchSecondsLeft = 900;
  const tab = makeTab(world, 'aaa');
  await settle();
  await tab.video.play();
  await play(world, tab, 2);
  assert.doesNotMatch(tab.pill().textContent, /Dry in/);
  await play(world, tab, 30);
  // The notice shows first (the next test), then the countdown.
  await play(world, tab, 6);
  assert.match(tab.pill().textContent, /Dry in 5m/);
  assert.ok(tab.pill().classList.contains('is-low'));
  world.advance(4 * 60);
  await tab.tick();
  await play(world, tab, 6);
  assert.match(tab.pill().textContent, /Dry in <1m/);
});

test('a video finishing on grace counts down to Dry hours too, since they stop it (Codex, 2026-11-05)', async () => {
  // 22:54:30 with 10 seconds left and grace on: the video runs out and goes on to finish, then Dry hours come.
  const world = dryWorld(22, 54, 30);
  world.state.settings.graceMode = true;
  world.state.watchSecondsLeft = 10;
  const tab = makeTab(world, 'aaa');
  await settle();
  await tab.video.play();
  await play(world, tab, 15);
  assert.equal(tab.video.paused, false, 'grace lets it play on');
  // The label waits for the glass to drain, on a real 700ms timer.
  await new Promise((r) => setTimeout(r, 750));
  await play(world, tab, 1);
  assert.match(tab.pill().textContent, /Finishing this one/);
  // At 22:55 the pill says Dry hours stop it, with the rings, then counts down, and shimmers.
  await play(world, tab, 15);
  assert.doesNotMatch(tab.pill().textContent, /Finishing this one/);
  assert.match(tab.pill().textContent, /Dry hours · video stops at 11:00pm/);
  await play(world, tab, 6);
  assert.match(tab.pill().textContent, /Dry in 5m/);
  assert.ok(tab.pill().classList.contains('is-low'));
  world.advance(4 * 60);
  await tab.tick();
  await play(world, tab, 60);
  assert.equal(tab.video.paused, true, 'Dry hours stop it');
  assert.ok(tab.locked());
});

test('a video started in Dry hours stops at zero like any other', async () => {
  const world = dryWorld(23, 30);
  world.state.watchSecondsLeft = 3;
  const tab = makeTab(world, 'aaa');
  await settle();
  await tab.video.play();
  await play(world, tab, 5);
  assert.equal(tab.video.paused, true);
  assert.ok(tab.locked());
});

test('the lock in Dry hours has no +15m, says when they end, and keeps "I need this one" (B8)', async () => {
  const world = dryWorld(23, 30);
  world.state.watchSecondsLeft = 3;
  const tab = makeTab(world, 'aaa');
  await settle();
  await tab.video.play();
  await play(world, tab, 5);
  assert.match(tab.lockText(), /^Time for a breather\./, 'the title still follows the drops');
  assert.match(tab.lockText(), /Dry until 6:00am\./);
  assert.doesNotMatch(tab.lockText(), /\+15m/);
  assert.match(tab.lockText(), /I need this one · 3 left this week/);
});

test('the warning spells itself out with rings at 5 minutes and again at 1, then shrinks to the countdown', async () => {
  const world = dryWorld(22, 54, 58);
  world.state.watchSecondsLeft = 900;
  const tab = makeTab(world, 'aaa');
  await settle();
  await tab.video.play();
  await play(world, tab, 1);
  assert.doesNotMatch(tab.pill().textContent, /Dry/);
  await play(world, tab, 3);
  assert.match(tab.pill().textContent, /Dry hours · video stops at 11:00pm/);
  assert.ok(tab.pill().classList.contains('is-grace-attention'), 'the rings');
  await play(world, tab, 6);
  assert.match(tab.pill().textContent, /Dry in 5m/);
  assert.equal(tab.pill().classList.contains('is-grace-attention'), false);
  world.advance(3 * 60 + 50);
  await tab.tick();
  assert.match(tab.pill().textContent, /Dry in 2m/);
  await play(world, tab, 3);
  assert.match(tab.pill().textContent, /Dry hours · video stops at 11:00pm/, 'again at 1 minute');
  await play(world, tab, 6);
  assert.match(tab.pill().textContent, /Dry in <1m/);
});

test('a +15m refused because the warning began redraws the lock without it', async () => {
  const world = dryWorld(22, 54, 50);
  world.state.watchSecondsLeft = 3;
  const tab = makeTab(world, 'aaa');
  await settle();
  await tab.video.play();
  await play(world, tab, 5);
  assert.match(tab.lockText(), /\+15m/);
  world.advance(10);
  await tab.press('add');
  await settle();
  assert.doesNotMatch(tab.lockText(), /No drops left|\+15m/);
  assert.match(tab.lockText(), /Dry hours start at 11:00pm\./);
  assert.equal(world.state.tokens.watch, 4, 'no drop spent');
});

test('the locked page brings +15m back when Dry hours end', async () => {
  const world = dryWorld(5, 59, 40);
  world.state.watchSecondsLeft = 3;
  const tab = makeTab(world, 'aaa');
  await settle();
  await tab.video.play();
  await play(world, tab, 5);
  assert.match(tab.lockText(), /Dry until 6:00am\./);
  world.advance(30);
  for (let i = 0; i < 30; i++) await tab.second();
  assert.match(tab.lockText(), /\+15m/);
  assert.doesNotMatch(tab.lockText(), /Dry until/);
});

test('a lock left open as Dry hours end shows +15m within a second, not at the next 30-second check (Codex, 2026-11-05)', async () => {
  const world = dryWorld(5, 59, 40);
  world.state.watchSecondsLeft = 3;
  const tab = makeTab(world, 'aaa');
  await settle();
  await tab.video.play();
  await play(world, tab, 5);
  assert.match(tab.lockText(), /Dry until 6:00am\./);
  // 6:00:01, and only the 1-second tick runs.
  world.advance(16);
  await tab.tick();
  assert.match(tab.lockText(), /\+15m/);
  assert.doesNotMatch(tab.lockText(), /Dry until/);
});

test('a lock left open into the 5 minutes before Dry hours drops +15m within a second (Codex, 2026-11-05)', async () => {
  const world = dryWorld(22, 54, 40);
  world.state.watchSecondsLeft = 3;
  const tab = makeTab(world, 'aaa');
  await settle();
  await tab.video.play();
  await play(world, tab, 5);
  assert.match(tab.lockText(), /\+15m/);
  // 22:55:01.
  world.advance(16);
  await tab.tick();
  assert.doesNotMatch(tab.lockText(), /\+15m/);
  assert.match(tab.lockText(), /Dry hours start at 11:00pm\./);
});

test('the lock is not rebuilt each second while nothing on it changes', async () => {
  const { world, tab } = await setup(3);
  await play(world, tab, 5);
  assert.ok(tab.locked());
  const before = tab.lockRemovals();
  const lock = tab.body.all().find((/** @type {any} */ el) => el.id === 'drip-lock') || tab.root.all().find((/** @type {any} */ el) => el.id === 'drip-lock');
  for (let i = 0; i < 10; i++) {
    world.advance(1);
    await tab.tick();
  }
  assert.equal(tab.lockRemovals(), before);
  const after = tab.body.all().find((/** @type {any} */ el) => el.id === 'drip-lock') || tab.root.all().find((/** @type {any} */ el) => el.id === 'drip-lock');
  assert.equal(after, lock, 'the same lock element');
});

/** A full stash of one, with the pill's Stash pressed so its list is open. */
async function fullStashOpen() {
  const { world, tab } = await setup(900);
  world.state.settings.stashMax = 1;
  world.state.backlog = [{ id: 'old', title: 'Old stashed video', channel: 'Channel', length: '1:00' }];
  saved(world);
  await settle();
  await pressStash(tab);
  assert.match(swapText(tab), /Old stashed video/, 'the list is open');
  return { world, tab };
}

/** Tells every tab the state changed, as another tab's save does. @param {any} world */
function saved(world) {
  for (const fn of world.listeners) fn({ drip: { newValue: structuredClone(world.state) } }, 'local');
}

/** @param {any} tab */
async function pressStash(tab) {
  const button = tab.pill().all().find((/** @type {any} */ el) => el.getAttribute('data-k') === 'pill-save');
  assert.ok(button, 'no Stash on the pill');
  await button.listeners.click({ detail: 1 });
  await settle();
}

/** The full-stash list's text, or '' when it's closed. @param {any} tab */
function swapText(tab) {
  const layer = tab.pill()?.parentElement?.all().find((/** @type {any} */ el) => el.classList.contains('drip-swap-layer'));
  return layer ? layer.textContent : '';
}

test('an open full-stash list closes when another tab makes room (Codex, 2026-11-05)', async () => {
  const { world, tab } = await fullStashOpen();
  world.state.backlog = [];
  saved(world);
  await settle();
  assert.equal(swapText(tab), '');
});

test('an open full-stash list shows what another tab swapped in (Codex, 2026-11-05)', async () => {
  const { world, tab } = await fullStashOpen();
  world.state.backlog = [{ id: 'new', title: 'Swapped in elsewhere', channel: 'Channel', length: '2:00' }];
  saved(world);
  await settle();
  assert.doesNotMatch(swapText(tab), /Old stashed video/);
  assert.match(swapText(tab), /Swapped in elsewhere/);
});

test('swapping out a video another tab already took out brings the list back with what is there now (Codex, 2026-11-05)', async () => {
  const { world, tab } = await fullStashOpen();
  // Another tab swapped it, and this tab hasn't heard yet.
  world.state.backlog = [{ id: 'new', title: 'Swapped in elsewhere', channel: 'Channel', length: '2:00' }];
  const layer = tab.pill().parentElement.all().find((/** @type {any} */ el) => el.classList.contains('drip-swap-layer'));
  const swapOut = layer.all().find((/** @type {any} */ el) => el.tagName === 'BUTTON' && /Swap out/.test(el.textContent));
  assert.ok(swapOut, 'no Swap out button');
  await swapOut.listeners.click({ detail: 1 });
  await settle();
  assert.match(swapText(tab), /Swapped in elsewhere/);
  assert.doesNotMatch(swapText(tab), /Old stashed video/);
});

test('swapping out a video another tab already took out, leaving room, closes the list (Codex, 2026-11-05)', async () => {
  const { world, tab } = await fullStashOpen();
  // Another tab took it out, and this tab hasn't heard yet.
  world.state.backlog = [];
  const layer = tab.pill().parentElement.all().find((/** @type {any} */ el) => el.classList.contains('drip-swap-layer'));
  const swapOut = layer.all().find((/** @type {any} */ el) => el.tagName === 'BUTTON' && /Swap out/.test(el.textContent));
  await swapOut.listeners.click({ detail: 1 });
  await settle();
  assert.equal(swapText(tab), '');
});

test("a Stash answered after moving to the next video doesn't open the list over it (Codex, 2026-11-05)", async () => {
  const { world, tab } = await setup(900);
  world.state.settings.stashMax = 1;
  world.state.backlog = [{ id: 'old', title: 'Old stashed video', channel: 'Channel', length: '1:00' }];
  saved(world);
  await settle();
  const handle = world.handle;
  /** @type {() => void} */
  let release = () => {};
  const gate = new Promise((r) => { release = () => r(undefined); });
  world.handle = async (/** @type {any} */ msg) => {
    if (msg.type === 'addBacklog') {
      await gate;
      return { ok: false, error: 'stash-full', state: structuredClone(world.state) };
    }
    return handle(msg);
  };
  const button = tab.pill().all().find((/** @type {any} */ el) => el.getAttribute('data-k') === 'pill-save');
  const pending = button.listeners.click({ detail: 1 });
  await tab.navigate('bbb');
  release();
  await pending;
  await settle();
  assert.equal(swapText(tab), '', 'no list over the next video');
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

test('a missed video selector fails open without pausing through YouTube controls on later ticks (Q25, A18)', async () => {
  const world = makeWorld();
  const tab = makeTab(world, 'aaa');
  // The video selector broke, but common.js can still reach YouTube's play button.
  tab.noVideo = true;
  await settle();
  for (let i = 0; i < 11; i++) { world.advance(1); await tab.second(); }
  assert.ok(tab.broken());
  assert.match(tab.broken().textContent, /video player/);
  assert.equal(tab.locked(), false);
  assert.ok(tab.root.hasAttribute('data-drip-broken'));
  const clicks = tab.playButton.clicks;
  await tab.video.play();
  for (let i = 0; i < 3; i++) {
    world.advance(1);
    await tab.second();
    assert.equal(tab.video.paused, false, 'later ticks and status replies leave playback running');
    assert.equal(tab.locked(), false);
  }
  assert.equal(tab.playButton.clicks, clicks, 'no pause through YouTube controls');
  assert.equal(world.ticks().filter((t) => t.seconds > 0).length, 0, 'broken playback is unmetered');
  tab.noVideo = false;
  await tab.second();
  assert.equal(tab.root.hasAttribute('data-drip-broken'), false);
  assert.equal(tab.video.paused, true, 'finding the player restores enforcement');
  assert.ok(tab.locked());
});

test('an allowed owner row arriving after four seconds removes the lock and makes playback free (Q31, A19)', async () => {
  const world = makeWorld();
  world.state.channels.allow = [{ ids: ['@allowed'], name: 'Allowed' }];
  const tab = makeTab(world, 'aaa', { hasPage: true });
  tab.page.setAttribute('video-id', 'aaa');
  saved(world);
  await settle();
  assert.equal(tab.locked(), false, 'the lock waits briefly for identity');
  await play(world, tab, 3);
  assert.ok(tab.locked(), 'the lock rises after the two-second wait');
  assert.equal(world.sent.filter((m) => m.type === 'allowedVideo').length, 0);
  world.advance(1);
  tab.owner = new FakeElement('a');
  tab.owner.setAttribute('href', '/@allowed');
  tab.owner.textContent = 'Allowed';
  await tab.tick();
  assert.equal(world.sent.filter((m) => m.type === 'allowedVideo').length, 1);
  assert.equal(world.D.watchStatus(world.state, 'aaa', world.epoch + world.now).allowed, true);
  assert.equal(tab.locked(), false);
  // A positive balance proves free playback doesn't drain minutes.
  world.state.watchSecondsLeft = 60;
  saved(world);
  await tab.video.play();
  await play(world, tab, 6);
  assert.equal(tab.video.paused, false);
  assert.equal(tab.locked(), false);
  assert.equal(world.state.watchSecondsLeft, 60);
  assert.equal(world.D.logDay(world.state).watchedSec, 5, 'free time still reaches the worker');
  assert.equal(world.sent.filter((m) => m.type === 'allowedVideo').length, 1, 'a read identity is checked once');
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
