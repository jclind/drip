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
