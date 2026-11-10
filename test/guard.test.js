// @ts-check
// The MAIN-world play guard and the isolated-world clock signal on a fake YouTube page.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');
const NOW = new Date(2026, 10, 6, 12).getTime();

function makePage() {
  const attrs = new Set();
  const root = {
    /** @param {string} name */
    hasAttribute: (name) => attrs.has(name),
    /** @param {string} name */
    getAttribute: (name) => attrs.has(name) ? '' : null,
    /** @param {string} name @param {boolean} on */
    toggleAttribute: (name, on) => { if (on) attrs.add(name); else attrs.delete(name); },
  };
  class PageMedia {
    constructor(main = false) { this.main = main; this.plays = 0; }
    /** @param {string} sel */
    matches(sel) { return this.main && sel === '#movie_player video'; }
    async play() { this.plays++; }
  }
  // Chrome gives isolated-world media wrappers a separate prototype.
  class IsolatedVideo {
    async play() {}
  }
  /** @type {Record<string, Function[]>} */
  const handlers = {};
  /** @type {Function[]} */
  const storageListeners = [];
  const location = { pathname: '/watch', search: '?v=aaa' };
  const document = {
    documentElement: root,
    querySelector: () => null,
    /** @param {string} name @param {Function} fn */
    addEventListener: (name, fn) => { (handlers[name] ||= []).push(fn); },
  };
  /** @type {Function} */
  let resolveStorage;
  const initialStorage = new Promise((resolve) => { resolveStorage = resolve; });
  const context = vm.createContext({
    document, location, HTMLMediaElement: PageMedia, HTMLVideoElement: IsolatedVideo,
    DOMException, URLSearchParams, setTimeout, clearTimeout,
    Date: class extends Date { static now() { return NOW; } },
    chrome: {
      storage: {
        local: { get: () => initialStorage },
        onChanged: { addListener: (/** @type {Function} */ fn) => storageListeners.push(fn) },
      },
    },
  });
  /** @param {string} file */
  const load = (file) => vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), context);
  load('content/guard.js');
  return {
    root, location, PageMedia, IsolatedVideo,
    loadEarly() { load('lib/state.js'); load('content/early.js'); },
    state: () => context.Drip.initialState(NOW),
    /** @param {any} state */
    async initial(state) { resolveStorage({ drip: state }); await initialStorage; await Promise.resolve(); },
    /** @param {any} state @param {string} [area] */
    changed(state, area = 'local') { for (const fn of storageListeners) fn({ drip: { newValue: state } }, area); },
  };
}

test('guard refuses preview and audio play with the clock on, on and off /watch', async () => {
  const page = makePage();
  page.root.toggleAttribute('data-drip-clock', true);
  for (const pathname of ['/watch', '/results', '/@channel']) {
    page.location.pathname = pathname;
    const media = new page.PageMedia();
    await assert.rejects(media.play(), { name: 'NotAllowedError' });
    assert.equal(media.plays, 0);
  }
});

test('guard allows other players with the clock off', async () => {
  const page = makePage();
  page.location.pathname = '/@channel';
  const media = new page.PageMedia();
  await media.play();
  assert.equal(media.plays, 1);
});

test('guard allows the main player on /watch unless held, and refuses it off /watch', async () => {
  const page = makePage();
  page.root.toggleAttribute('data-drip-clock', true);
  const main = new page.PageMedia(true);
  await main.play();
  assert.equal(main.plays, 1);
  page.root.toggleAttribute('data-drip-hold', true);
  await assert.rejects(main.play(), { name: 'NotAllowedError' });
  page.root.toggleAttribute('data-drip-hold', false);
  page.location.pathname = '/results';
  await assert.rejects(main.play(), { name: 'NotAllowedError' });
  assert.equal(main.plays, 1);
});

test('guard fails open for held main playback and other media when marked broken (Q25)', async () => {
  const page = makePage();
  page.root.toggleAttribute('data-drip-clock', true);
  page.root.toggleAttribute('data-drip-hold', true);
  page.root.toggleAttribute('data-drip-broken', true);
  page.location.pathname = '/@channel';
  for (const main of [false, true]) {
    const media = new page.PageMedia(main);
    await media.play();
    assert.equal(media.plays, 1);
  }
});

test('guard leaves the isolated-world play prototype alone', async () => {
  const page = makePage();
  page.root.toggleAttribute('data-drip-clock', true);
  page.root.toggleAttribute('data-drip-hold', true);
  await new page.IsolatedVideo().play();
});

test('early marks the clock from initial storage even off /watch, then follows settings changes', async () => {
  const page = makePage();
  page.location.pathname = '/results';
  page.loadEarly();
  const state = page.state();
  await page.initial(state);
  assert.equal(page.root.hasAttribute('data-drip-clock'), true);
  await assert.rejects(new page.PageMedia().play(), { name: 'NotAllowedError' });
  state.settings.clock = false;
  page.changed(state, 'sync');
  assert.equal(page.root.hasAttribute('data-drip-clock'), true, 'ignore other storage areas');
  page.changed(state);
  assert.equal(page.root.hasAttribute('data-drip-clock'), false);
  await new page.PageMedia().play();
  state.settings.clock = true;
  page.changed(state);
  assert.equal(page.root.hasAttribute('data-drip-clock'), true);
});

test('early leaves the clock off for Quiet and Curated, including a newer storage event', async () => {
  for (const beforeSnapshot of [false, true]) {
    const page = makePage();
    page.loadEarly();
    const state = page.state();
    state.settings.clock = false;
    if (beforeSnapshot) page.changed(state);
    await page.initial(beforeSnapshot ? page.state() : state);
    assert.equal(page.root.hasAttribute('data-drip-clock'), false);
    await new page.PageMedia().play();
  }
});

test('early keeps a waiting clock change on until its reset day, then clears the signal', async () => {
  const page = makePage();
  page.loadEarly();
  const state = page.state();
  state.pending = { effectiveDay: '2026-11-07', changes: { clock: false } };
  await page.initial(state);
  assert.equal(page.root.hasAttribute('data-drip-clock'), true);
  state.pending.effectiveDay = '2026-11-06';
  page.changed(state);
  assert.equal(page.root.hasAttribute('data-drip-clock'), false);
  await new page.PageMedia().play();
});

// drip's menu asks guard.js for YouTube's in-page navigation (design C). Written from the signed-in test of 2026-11-10,
// where Downloads went blank, and the logged-out check the same day, where Channels stalled on its way to a sign-in.

/** A page with ytd-app, fake timers, and a record of what YouTube was asked and what loaded the plain way. */
function makeNavPage() {
  /** @type {Record<string, Function[]>} */
  const handlers = {};
  /** @type {{at: number, fn: Function, id: number}[]} */
  let timers = [];
  let now = 0;
  let nextId = 0;
  /** @type {string[]} */
  const assigned = [];
  /** @type {any[]} */
  const asked = [];
  const app = { dispatchEvent: (/** @type {any} */ e) => { asked.push(e.detail.endpoint); return true; } };
  const document = {
    documentElement: { hasAttribute: () => false },
    querySelector: (/** @type {string} */ sel) => (sel === 'ytd-app' ? app : null),
    /** @param {string} name @param {Function} fn */
    addEventListener: (name, fn) => { (handlers[name] ||= []).push(fn); },
  };
  class CustomEvent {
    /** @param {string} type @param {any} [init] */
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  }
  const context = vm.createContext({
    document, CustomEvent, URL, DOMException, HTMLMediaElement: class { play() {} },
    location: { origin: 'https://www.youtube.com', pathname: '/feed/history', assign: (/** @type {string} */ url) => assigned.push(url) },
    setTimeout: (/** @type {Function} */ fn, /** @type {number} */ ms) => { timers.push({ at: now + ms, fn, id: ++nextId }); return nextId; },
    clearTimeout: (/** @type {number} */ id) => { timers = timers.filter((t) => t.id !== id); },
  });
  vm.runInContext(fs.readFileSync(path.join(SRC, 'content/guard.js'), 'utf8'), context);
  /** @param {string} name @param {any} detail */
  const fire = (name, detail) => {
    const event = { detail, canceled: false, preventDefault() { this.canceled = true; } };
    for (const fn of handlers[name] || []) fn(event);
    return event;
  };
  /** The endpoint as YouTube's navigation events carry it. @param {string} url */
  const endpoint = (url) => ({ commandMetadata: { webCommandMetadata: { url } } });
  return {
    assigned, asked,
    /** menu.js's request. Returns whether guard.js took it. @param {string} url */
    menu: (url) => fire('drip-navigate', url).canceled,
    /** @param {string} url */
    start: (url) => fire('yt-navigate-start', { endpoint: endpoint(url), url }),
    /** @param {string} url @param {any} page The page's JSON as YouTube fetched it. */
    finish: (url, page) => fire('yt-navigate-finish', { endpoint: endpoint(url), response: { page: 'browse', response: page } }),
    /** @param {number} ms */
    wait(ms) {
      now += ms;
      for (const t of timers.filter((x) => x.at <= now)) { timers = timers.filter((x) => x !== t); t.fn(); }
    },
  };
}

// What YouTube's JSON for each page held, logged out on 2026-11-10.
const HISTORY_JSON = { responseContext: {}, contents: { twoColumnBrowseResultsRenderer: {} }, topbar: {} };
const DOWNLOADS_JSON = { responseContext: {} };
const MISSING_PLAYLIST_JSON = { responseContext: {}, alerts: [{}], trackingParams: '', topbar: {}, microformat: {} };

test('the menu leaves Downloads to load the plain way, since YouTube draws it blank from a URL', () => {
  const page = makeNavPage();
  assert.equal(page.menu('/feed/downloads'), false);
  assert.deepEqual(page.asked, []);
  page.wait(20000);
  assert.deepEqual(page.assigned, [], 'the link itself loads it, not guard.js');
});

test('a menu link YouTube shows stays in the page', () => {
  const page = makeNavPage();
  assert.equal(page.menu('/feed/history'), true);
  assert.equal(page.asked.length, 1);
  page.start('/feed/history');
  page.finish('/feed/history', HISTORY_JSON);
  page.wait(20000);
  assert.deepEqual(page.assigned, []);
  // Watch later logged out: no contents, but an alert under the top bar, which YouTube shows.
  page.menu('/playlist?list=WL');
  page.start('/playlist?list=WL');
  page.finish('/playlist?list=WL', MISSING_PLAYLIST_JSON);
  page.wait(20000);
  assert.deepEqual(page.assigned, []);
});

test('a menu link YouTube ignores loads the plain way after a second', () => {
  const page = makeNavPage();
  page.menu('/feed/channels');
  page.wait(999);
  assert.deepEqual(page.assigned, []);
  page.wait(1);
  assert.deepEqual(page.assigned, ['/feed/channels']);
});

test('a menu link YouTube starts but never finishes loads the plain way after 10 seconds', () => {
  const page = makeNavPage();
  page.menu('/feed/channels');
  page.start('/feed/channels');
  page.wait(9999);
  assert.deepEqual(page.assigned, []);
  page.wait(1);
  assert.deepEqual(page.assigned, ['/feed/channels']);
});

test('a menu link YouTube finishes with nothing to show loads the plain way at once', () => {
  const page = makeNavPage();
  page.menu('/feed/playlists');
  page.start('/feed/playlists');
  page.finish('/feed/playlists', DOWNLOADS_JSON);
  assert.deepEqual(page.assigned, ['/feed/playlists']);
  page.wait(20000);
  assert.deepEqual(page.assigned, ['/feed/playlists'], 'once');
});

test("another page started meanwhile ends drip's request without a plain load", () => {
  const page = makeNavPage();
  page.menu('/feed/history');
  page.start('/feed/history');
  page.start('/watch?v=abc');
  page.finish('/watch?v=abc', DOWNLOADS_JSON);
  page.wait(20000);
  assert.deepEqual(page.assigned, []);
});

test("YouTube's own navigations are never loaded the plain way", () => {
  const page = makeNavPage();
  page.start('/feed/downloads');
  page.finish('/feed/downloads', DOWNLOADS_JSON);
  page.wait(20000);
  assert.deepEqual(page.assigned, []);
});

test('only the latest of two quick menu clicks can load the plain way', () => {
  const page = makeNavPage();
  page.menu('/feed/history');
  page.menu('/feed/channels');
  page.wait(20000);
  assert.deepEqual(page.assigned, ['/feed/channels']);
});
