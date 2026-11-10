// @ts-check
// The worker's message handling, run in Node against a fake chrome. Written from DESIGN.md and RELEASE-PLAN.md.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');
const DEFAULT_ICON = JSON.parse(fs.readFileSync(path.join(SRC, '..', 'manifest.json'), 'utf8')).action.default_icon;
// setIcon resolves relative paths against the worker's folder, so the worker sends the manifest's paths from the root.
const DROP_ICON = Object.fromEntries(Object.entries(DEFAULT_ICON).map(([size, file]) => [size, `/${file}`]));
const YT = { tab: { id: 1 }, url: 'https://www.youtube.com/watch?v=abc', origin: 'https://www.youtube.com' };
const PAGE = { url: 'chrome-extension://drip/src/options/options.html', origin: 'chrome-extension://drip' };

/** @param {any} value @returns {any} */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
  return value;
}

/**
 * Loads background.js in a fresh context with in-memory storage.
 * @param {any} [initial]
 * @param {{dev?: boolean, panel?: boolean, stores?: {local: Record<string, any>, session: Record<string, any>}, src?: string}} [opts]
 *   dev: the checkout has dev/ENABLED. panel: false for a manifest without the dev panel. stores: storage kept from an
 *   earlier worker, as when Chrome stops the worker and starts it again. src: the src folder to load, such as a store
 *   build's.
 */
function worker(initial = undefined, { dev = false, panel = true, stores = undefined, contexts = [], src = SRC } = {}) {
  /** @type {Record<string, any>} */
  const store = stores ? stores.local : initial === undefined ? {} : { drip: structuredClone(initial) };
  /** @type {Record<string, any>} */
  const session = stores ? stores.session : {};
  let writes = 0;
  let failNext = 0;
  let failMessage = 'write failed';
  let failSession = 0;
  let failIcon = 0;
  let failDraw = 0;
  let elapsed = 0;
  let timerId = 0;
  const timers = new Map();
  class WorkerDate extends Date { static now() { return Date.now() + elapsed; } }
  /** @type {any[]} */
  const icons = [];
  /** @type {Function | null} */
  let onMessage = null;
  let externalListeners = 0;
  /** @type {Function | null} */
  let onInstalled = null;
  /** @type {Function | null} */
  let onStartup = null;
  /** @type {string[]} */
  const opened = [];
  /** @type {{url: string}[]} */
  const created = [];
  /** @type {any[]} What the worker did to existing tabs and windows, and told extension pages. */
  const calls = [];
  const chrome = {
    runtime: {
      getURL: (/** @type {string} */ p) => p,
      getManifest: () => ({
        action: { default_icon: DEFAULT_ICON },
        externally_connectable: { matches: ['http://localhost/*'] },
        content_scripts: panel ? [{ js: ['src/devpanel/panel.js'] }] : [],
      }),
      onMessage: { addListener: (/** @type {Function} */ fn) => { onMessage = fn; } },
      onMessageExternal: { addListener: () => { externalListeners++; } },
      onInstalled: { addListener: (/** @type {Function} */ fn) => { onInstalled = fn; } },
      onStartup: { addListener: (/** @type {Function} */ fn) => { onStartup = fn; } },
      reload() {},
      getContexts: async () => contexts,
      sendMessage: async (/** @type {any} */ msg) => { calls.push(['broadcast', msg]); },
    },
    windows: { update: async (/** @type {number} */ id, /** @type {any} */ props) => { calls.push(['window', id, props]); } },
    storage: {
      local: {
        // Chrome returns stored objects with their keys sorted.
        get: async (/** @type {string} */ key) => (key in store ? { [key]: sortKeys(structuredClone(store[key])) } : {}),
        set: async (/** @type {Record<string, any>} */ items) => {
          if (failNext > 0) {
            failNext--;
            throw new Error(failMessage);
          }
          writes++;
          Object.assign(store, structuredClone(items));
        },
        remove: async (/** @type {string} */ key) => { delete store[key]; },
      },
      onChanged: { addListener() {} },
      session: {
        get: async (/** @type {string} */ key) => (key in session ? { [key]: structuredClone(session[key]) } : {}),
        set: async (/** @type {Record<string, any>} */ items) => {
          if (failSession > 0) {
            failSession--;
            throw new Error('session write failed');
          }
          Object.assign(session, structuredClone(items));
        },
      },
    },
    tabs: {
      create: (/** @type {{url: string}} */ opts) => { opened.push(opts.url); created.push(opts); },
      update: async (/** @type {number} */ id, /** @type {any} */ props) => { calls.push(['tab', id, props]); },
    },
    action: { setIcon: async (/** @type {any} */ icon) => {
      if (failIcon > 0) { failIcon--; throw new Error('setIcon failed'); }
      icons.push(icon);
    } },
  };
  class FakeCanvas {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() {
      if (failDraw > 0) { failDraw--; throw new Error('drawing failed'); }
      const fills = [];
      const ctx = {
        fillStyle: '', globalAlpha: 1,
        translate() {}, scale() {}, save() {}, restore() {}, clip() {},
        fill(p) { fills.push({ path: p.d, color: ctx.fillStyle, alpha: ctx.globalAlpha }); },
        getImageData: () => ({ width: this.width, height: this.height, fills }),
      };
      return ctx;
    }
  }
  /** @type {any} */
  const context = { chrome, console, Date: WorkerDate,
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, at: WorkerDate.now() + ms }); return id; },
    clearTimeout: (id) => timers.delete(id), structuredClone, URL,
    fetch: async (/** @type {string} */ url) => (url.startsWith('src/icons/')
      ? (fs.existsSync(path.join(SRC, '..', url)) ? { ok: true, text: async () => fs.readFileSync(path.join(SRC, '..', url), 'utf8') } : { ok: false })
      : { ok: dev }),
    OffscreenCanvas: FakeCanvas, Path2D: class { constructor(d) { this.d = d; } } };
  context.globalThis = context;
  context.importScripts = (/** @type {string} */ file) => vm.runInContext(fs.readFileSync(path.join(src, file), 'utf8'), context);
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(src, 'background.js'), 'utf8'), context);
  /** @param {any} msg @param {any} [sender] @returns {Promise<any>} */
  const send = (msg, sender = YT) => new Promise((resolve) => {
    const async = /** @type {Function} */ (onMessage)(msg, sender, resolve);
    if (async !== true) setTimeout(() => resolve(undefined), 0);
  });
  const install = (/** @type {string} */ reason) => /** @type {Function} */ (onInstalled)({ reason });
  const restart = () => worker(undefined, { dev, panel, stores: { local: store, session }, src });
  const advance = async (ms) => {
    elapsed += ms;
    for (const [id, timer] of timers) {
      if (timer.at <= WorkerDate.now()) { timers.delete(id); timer.fn(); }
    }
    await vm.runInContext('queue', context);
  };
  return { send, install, restart, opened, created, calls, store, session, icons,
    advance, externalListeners: () => externalListeners,
    startup: () => /** @type {Function} */ (onStartup)(), idle: () => vm.runInContext('queue', context),
    failIcons: (n) => { failIcon = n; }, failDrawing: (n) => { failDraw = n; },
    writes: () => writes, failWrites: (/** @type {number} */ n, message = 'write failed') => { failNext = n; failMessage = message; }, failSessionWrites: (/** @type {number} */ n) => { failSession = n; }, Drip: context.Drip };
}

test('toolbar shows the drop while idle, draws on fresh ticks, and skips unchanged glass levels', async () => {
  const w = worker();
  await w.idle();
  assert.equal(w.icons.length, 1);
  assert.equal(w.writes(), 0);
  assert.deepEqual({ ...w.icons[0].path }, DROP_ICON);
  await w.send({ type: 'get' });
  await w.send({ type: 'spendWatch' });
  await w.send({ type: 'status', videoId: 'abc' });
  assert.equal(w.icons.length, 1);
  await w.send({ type: 'tick', videoId: 'abc', seconds: .001, ago: 0, playing: true });
  assert.equal(w.icons.length, 2);
  for (const size of [16, 32]) {
    const data = w.icons[1].imageData[size];
    assert.equal(data.width, size);
    assert.equal(data.height, size);
    assert.equal(data.fills[0].color, '#909090');
    assert.equal(data.fills[1].color, '#42A5F6');
  }
  assert.equal(w.icons[1].imageData[32].fills.length, 3);
  await w.send({ type: 'tick', videoId: 'abc', seconds: .001, ago: 0, playing: true });
  assert.equal(w.icons.length, 2);
  await w.send({ type: 'spendWatch' });
  assert.equal(w.icons.length, 2);
  await w.advance(5000);
  await w.send({ type: 'tick', videoId: 'abc', seconds: .001, ago: 0, playing: true });
  assert.equal(w.icons.length, 2);
  w.store.drip.watchSecondsLeft = 900;
  await w.send({ type: 'tick', videoId: 'abc', seconds: .001, ago: 0, playing: true });
  assert.equal(w.icons.length, 3);
  assert.equal(w.icons[2].imageData[32].fills.length, 2);
});

test('a stop tick restores the drop and the next playing tick redraws even at the same level', async () => {
  const w = worker();
  await w.send({ type: 'spendWatch' });
  await w.send({ type: 'needThis', videoId: 'abc', reason: 'for school' });
  const writes = w.writes();
  await w.send({ type: 'tick', videoId: 'abc', seconds: 0, ago: 0, playing: true });
  assert.equal(w.writes(), writes, 'unlocked playback does not need a state save to show the glass');
  assert.equal(w.icons.length, 2);
  await w.send({ type: 'tick', videoId: 'abc', seconds: 5, ago: 0, playing: true });
  assert.equal(w.store.drip.watchSecondsLeft, 900);
  assert.equal(w.icons.length, 2);
  await w.send({ type: 'tick', videoId: 'abc', seconds: 1, ago: 0, playing: false });
  assert.equal(w.icons.length, 3);
  assert.deepEqual({ ...w.icons[2].path }, DROP_ICON);
  await w.send({ type: 'tick', videoId: 'abc', seconds: 5, ago: 0, playing: true });
  assert.equal(w.icons.length, 4);
  assert.ok(w.icons[3].imageData);
});

test('missing playing clears the tab, and positive ago with playing true still shows the glass', async () => {
  const w = worker();
  await w.send({ type: 'spendWatch' });
  await w.send({ type: 'needThis', videoId: 'abc', reason: 'for school' });
  await w.send({ type: 'tick', videoId: 'abc', seconds: 5, ago: 5000, playing: true });
  assert.ok(w.icons.at(-1).imageData);
  await w.send({ type: 'tick', videoId: 'abc', seconds: 1, ago: 0 });
  assert.deepEqual({ ...w.icons.at(-1).path }, DROP_ICON);
});

test('12 seconds without a fresh tick restores the drop, and playing ticks renew the timeout', async () => {
  const w = worker();
  await w.send({ type: 'spendWatch' });
  await w.send({ type: 'tick', videoId: 'abc', seconds: 5, ago: 0, playing: true });
  await w.advance(5000);
  await w.send({ type: 'tick', videoId: 'abc', seconds: 5, ago: 5000, playing: true });
  const draws = w.icons.length;
  const writes = w.writes();
  await w.advance(7000);
  assert.equal(w.icons.length, draws, 'the first tick timeout was canceled');
  await w.advance(4900);
  assert.equal(w.icons.length, draws);
  await w.advance(100);
  assert.equal(w.icons.length, draws + 1);
  assert.deepEqual({ ...w.icons.at(-1).path }, DROP_ICON);
  assert.equal(w.writes(), writes, 'timeout only changes the icon');
  await w.send({ type: 'tick', videoId: 'abc', seconds: .001, ago: 0, playing: true });
  assert.ok(w.icons.at(-1).imageData, 'the timeout cleared the glass cache');
});

test('a stopped tab does not hide another playing tab, which still expires after 12 seconds', async () => {
  const w = worker();
  const other = { ...YT, tab: { id: 2 } };
  await w.send({ type: 'spendWatch' });
  await w.send({ type: 'tick', videoId: 'abc', seconds: 5, ago: 0, playing: true });
  await w.advance(5000);
  await w.send({ type: 'tick', videoId: 'other', seconds: 5, ago: 0, playing: true }, other);
  await w.send({ type: 'tick', videoId: 'abc', seconds: 1, ago: 100, playing: false });
  assert.ok(w.icons.at(-1).imageData);
  await w.advance(7000);
  await w.send({ type: 'tick', videoId: 'abc', seconds: 1, ago: 200, playing: false });
  assert.ok(w.icons.at(-1).imageData);
  await w.advance(5000);
  assert.deepEqual({ ...w.icons.at(-1).path }, DROP_ICON);
});

test('a worker restart shows the drop until a fresh tick, even with stored minutes and clock', async () => {
  const w = worker();
  await w.send({ type: 'spendWatch' });
  await w.send({ type: 'tick', videoId: 'abc', seconds: 5, ago: 0, playing: true });
  const restarted = w.restart();
  await restarted.idle();
  assert.equal(restarted.icons.length, 1);
  assert.deepEqual({ ...restarted.icons[0].path }, DROP_ICON);
  await restarted.send({ type: 'get' });
  assert.equal(restarted.icons.length, 1);
  await restarted.send({ type: 'tick', videoId: 'abc', seconds: 5, ago: 0, playing: true });
  assert.ok(restarted.icons.at(-1).imageData);
});

test('a timeout queued alongside a fresh tick leaves the playing glass visible', async () => {
  const w = worker();
  await w.send({ type: 'spendWatch' });
  await w.send({ type: 'tick', videoId: 'abc', seconds: 5, ago: 0, playing: true });
  const response = w.send({ type: 'tick', videoId: 'abc', seconds: .001, ago: 0, playing: true });
  await w.advance(12000);
  await response;
  assert.ok(w.icons.at(-1).imageData);
  await w.advance(12000);
  assert.deepEqual({ ...w.icons.at(-1).path }, DROP_ICON);
});

test('startup and install/update clear an active glass until another playing tick', async () => {
  const w = worker();
  await w.send({ type: 'spendWatch' });
  for (const reset of [w.startup, () => w.install('update')]) {
    await w.send({ type: 'tick', videoId: 'abc', seconds: .001, ago: 0, playing: true });
    assert.ok(w.icons.at(-1).imageData);
    const writes = w.writes();
    reset();
    await w.idle();
    assert.deepEqual({ ...w.icons.at(-1).path }, DROP_ICON);
    const count = w.icons.length;
    await w.advance(12000);
    assert.equal(w.icons.length, count);
    assert.equal(w.writes(), writes);
  }
});

test('toolbar drawing and setIcon failures leave state writes and responses intact and can retry', async () => {
  const w = worker();
  await w.send({ type: 'spendWatch' });
  await w.idle();
  w.failDrawing(1);
  assert.equal((await w.send({ type: 'tick', videoId: 'abc', seconds: .001, ago: 0, playing: true })).ok, true);
  assert.ok(w.store.drip.watchSecondsLeft < 900);
  assert.equal(w.icons.length, 1);
  w.failIcons(1);
  assert.equal((await w.send({ type: 'addBacklog', video: { id: 'abc', title: 'A' } })).ok, true);
  assert.equal(w.icons.length, 1);
  assert.equal(w.store.drip.backlog.length, 1);
  await w.send({ type: 'removeBacklog', id: 'abc' });
  assert.equal(w.icons.length, 2);
  w.failWrites(1);
  const left = w.store.drip.watchSecondsLeft;
  assert.equal((await w.send({ type: 'tick', videoId: 'abc', seconds: 450, ago: 60000, playing: true })).ok, false);
  assert.equal(w.icons.length, 2);
  assert.equal(w.store.drip.watchSecondsLeft, left);
  w.failIcons(1);
  await w.send({ type: 'tick', videoId: 'abc', seconds: 1, ago: 100, playing: false });
  assert.equal(w.icons.length, 2);
  await w.send({ type: 'addBacklog', video: { id: 'retry', title: 'Retry' } });
  assert.deepEqual({ ...w.icons.at(-1).path }, DROP_ICON);
});

test('toolbar refreshes on startup and install/update, keeping the day reset lazy', async () => {
  const w = worker();
  await w.send({ type: 'get' });
  w.store.drip.day = w.Drip.addDays(w.store.drip.day, -1);
  w.store.drip.watchSecondsLeft = w.store.drip.watchSecondsBought = 900;
  const writes = w.writes();
  w.startup();
  await w.idle();
  assert.equal(w.icons.length, 1);
  assert.equal(w.store.drip.watchSecondsLeft, 900);
  assert.equal(w.writes(), writes);
  w.store.drip.watchSecondsLeft = 450;
  w.install('update');
  await w.idle();
  assert.equal(w.icons.length, 1);
  assert.equal(w.opened.length, 0);
  await w.send({ type: 'get' });
  assert.equal(w.icons.length, 1);
  assert.equal(w.store.drip.watchSecondsLeft, 0);
  const installed = worker();
  installed.install('install');
  await installed.idle();
  assert.equal(installed.icons.length, 1);
  assert.ok(installed.store.drip);
  assert.equal(installed.opened.length, 1);
});

test('every reply carries the saved state', async () => {
  const w = worker();
  const res = await w.send({ type: 'get' }, PAGE);
  assert.equal(res.ok, true);
  assert.equal(res.state.version, 1);
});

test('unknown messages are refused', async () => {
  const w = worker();
  const res = await w.send({ type: 'nope' }, PAGE);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'unknown-message');
});

test('ticks only count from youtube.com tabs', async () => {
  const w = worker();
  await w.send({ type: 'spendWatch' }, PAGE);
  for (const sender of [PAGE, { ...YT, tab: undefined }, { ...YT, url: 'https://evil.example/watch' }]) {
    const res = await w.send({ type: 'tick', seconds: 60, videoId: 'abc', playing: true }, sender);
    assert.deepEqual({ ...res }, { ok: false, error: 'bad-sender' });
  }
  assert.equal(w.store.drip.watchSecondsLeft, 900);
  assert.equal(w.icons.length, 1, 'rejected ticks cannot start the glass');
});

test('messages run one at a time, so two tabs cannot both spend the last token', async () => {
  const w = worker();
  const one = await w.send({ type: 'get' }, PAGE);
  const state = one.state;
  state.tokens.watch = 1;
  const w2 = worker(state);
  const results = await Promise.all([w2.send({ type: 'spendWatch' }), w2.send({ type: 'spendWatch' })]);
  assert.deepEqual(results.map((r) => r.ok).sort(), [false, true]);
  assert.equal(w2.store.drip.tokens.watch, 0);
  assert.equal(w2.store.drip.watchSecondsLeft, 900);
});

// Finding 1 in RELEASE-PLAN.md: a message that changes nothing shouldn't write storage, because every write wakes
// every YouTube tab.
test('get and status do not write storage once state exists', async () => {
  const w = worker();
  await w.send({ type: 'get' }, PAGE);
  const before = w.writes();
  await w.send({ type: 'get' }, PAGE);
  await w.send({ type: 'status', videoId: 'abc' });
  assert.equal(w.writes(), before);
});

test('a zero-second tick does not write storage', async () => {
  const w = worker();
  await w.send({ type: 'get' }, PAGE);
  const before = w.writes();
  await w.send({ type: 'tick', seconds: 0, videoId: 'abc' });
  assert.equal(w.writes(), before);
});

test('the first message on a new day still saves the rolled day', async () => {
  const w = worker();
  const res = await w.send({ type: 'get' }, PAGE);
  const old = res.state;
  old.day = w.Drip.addDays(old.day, -1);
  old.tokens = { watch: 0, rec: 0 };
  const w2 = worker(old);
  await w2.send({ type: 'get' }, PAGE);
  assert.equal(w2.store.drip.tokens.watch, 4);
});

// Finding 7: a malformed payload must not corrupt state for good.
test('a malformed Save is refused and leaves the backlog alone', async () => {
  const w = worker();
  for (const video of [undefined, null, {}, { id: '' }, { id: 42 }, 'abc']) {
    const res = await w.send({ type: 'addBacklog', video });
    assert.equal(res.ok, false, `video ${JSON.stringify(video)}`);
  }
  assert.deepEqual(w.store.drip.backlog, []);
});

test('reveal ignores malformed candidates', async () => {
  const w = worker();
  const res = await w.send({ type: 'reveal', candidates: [null, { title: 'no id' }, { id: 'ok1', title: 'Good' }] });
  assert.equal(res.ok, true);
  assert.equal(res.video.id, 'ok1');
});

test('resolve with an unknown action is refused and keeps the card', async () => {
  const w = worker();
  await w.send({ type: 'reveal', candidates: [{ id: 'v1', title: 'One', channel: '', length: '' }] });
  const res = await w.send({ type: 'resolve', action: 'eat' });
  assert.equal(res.ok, false);
  assert.equal(w.store.drip.current.id, 'v1');
});

test('resolve names the card it was shown for', async () => {
  const w = worker();
  await w.send({ type: 'reveal', candidates: [{ id: 'v1', title: 'One' }] });
  const stale = await w.send({ type: 'resolve', action: 'save', videoId: 'v0' });
  assert.equal(stale.error, 'stale-card');
  const ok = await w.send({ type: 'resolve', action: 'save', videoId: 'v1' });
  assert.equal(ok.ok, true);
});

// Finding 17: a write that fails must not count as charged.
test('a tick whose write fails is charged by the next tick that resends it', async () => {
  const w = worker();
  await w.send({ type: 'spendWatch' });
  w.failWrites(1);
  const failed = await w.send({ type: 'tick', seconds: 10, videoId: 'abc' });
  assert.equal(failed.ok, false);
  assert.equal(w.store.drip.watchSecondsLeft, 900);
  await w.send({ type: 'tick', seconds: 10, videoId: 'abc' });
  assert.ok(w.store.drip.watchSecondsLeft <= 890, `left ${w.store.drip.watchSecondsLeft}`);
});

test("an import over storage's quota says storage-full, and storage and the next reply keep the state from before", async () => {
  const w = worker();
  await w.send({ type: 'addBacklog', video: { id: 'mine', title: 'Mine', channel: 'C', length: '1:00' } }, PAGE);
  const before = structuredClone(w.store.drip);
  // The error Chrome 157 throws from chrome.storage.local.set past QUOTA_BYTES.
  w.failWrites(1, 'Resource::kQuotaBytes quota exceeded');
  const res = await w.send({ type: 'importData', data: { app: 'drip', format: 1, backlog: [{ id: 'theirs', title: 'Theirs' }] } }, PAGE);
  assert.deepEqual([res.ok, res.error, 'state' in res], [false, 'storage-full', false]);
  assert.deepEqual(w.store.drip, before);
  const next = await w.send({ type: 'get' }, PAGE);
  assert.deepEqual(next.state.backlog.map((/** @type {any} */ v) => v.id), ['mine']);
  // Any other failure still says what it was.
  w.failWrites(1);
  assert.equal((await w.send({ type: 'importData', data: { app: 'drip', format: 1, backlog: [{ id: 'theirs' }] } }, PAGE)).error, 'Error: write failed');
});

test('a new install opens the welcome page once, and an update does not', () => {
  const w = worker();
  w.install('install');
  w.install('update');
  assert.deepEqual([...w.opened], ['src/welcome/welcome.html']);
});

test('a new install saves the state, so the first day starts then, not at the first visit (Q6, Codex)', async () => {
  const w = worker();
  const before = Date.now();
  w.install('install');
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(w.store.drip && w.store.drip.installedAt >= before, 'installedAt saved on install');
  const updated = worker();
  updated.install('update');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(updated.store.drip, undefined);
});

test('the dev panel stays hidden and its buttons do nothing without dev/ENABLED', async () => {
  const w = worker();
  assert.equal((await w.send({ type: 'devStatus' })).enabled, false);
  const res = await w.send({ type: 'devAction', action: 'minutes+15' });
  assert.equal(res.error, 'dev-off');
  const state = (await w.send({ type: 'get' }, PAGE)).state;
  assert.equal(state.watchSecondsLeft, 0);
});

test('with dev/ENABLED, a dev button changes state and the reply carries it', async () => {
  const w = worker(undefined, { dev: true });
  assert.equal((await w.send({ type: 'devStatus' })).enabled, true);
  const res = await w.send({ type: 'devAction', action: 'minutes+15' });
  assert.equal(res.ok, true);
  assert.equal(res.state.watchSecondsLeft, 900);
});

test('Run reset now is rolled over by the next message, as a real reset would be', async () => {
  const w = worker(undefined, { dev: true });
  await w.send({ type: 'devAction', action: 'watch-0' });
  const rewound = await w.send({ type: 'devAction', action: 'reset-now' });
  assert.equal(rewound.state.tokens.watch, 0);
  const next = await w.send({ type: 'get' }, PAGE);
  assert.equal(next.state.tokens.watch, 4);
  assert.equal(next.state.day, w.Drip.dayKey(Date.now(), 4));
});

test('an unknown dev action is refused', async () => {
  const w = worker(undefined, { dev: true });
  const res = await w.send({ type: 'devAction', action: 'nope' });
  assert.equal(res.error, 'unknown-dev-action');
});

test('the Settings toggle turns developer mode on and off without dev/ENABLED', async () => {
  const w = worker();
  const before = await w.send({ type: 'devStatus' }, PAGE);
  assert.equal(before.toggle, true);
  assert.equal(before.enabled, false);
  const on = await w.send({ type: 'setDevMode', on: true }, PAGE);
  assert.equal(on.enabled, true);
  assert.equal((await w.send({ type: 'devAction', action: 'minutes+5' })).state.watchSecondsLeft, 300);
  const off = await w.send({ type: 'setDevMode', on: false }, PAGE);
  assert.equal(off.enabled, false);
  assert.equal((await w.send({ type: 'devAction', action: 'minutes+5' })).error, 'dev-off');
});

test('a store build has no developer mode, even with the toggle stored as on', async () => {
  const w = worker(undefined, { dev: true, panel: false });
  w.store.dripDev = true;
  const status = await w.send({ type: 'devStatus' }, PAGE);
  assert.equal(status.toggle, false);
  assert.equal(status.enabled, false);
  assert.equal((await w.send({ type: 'setDevMode', on: true }, PAGE)).error, 'dev-off');
  assert.equal((await w.send({ type: 'devAction', action: 'minutes+5' })).error, 'dev-off');
});

test("the store build's worker has no dev tools: their messages are unknown, and the rest still works", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drip-store-'));
  try {
    for (const p of ['manifest.json', 'src', 'icons']) fs.cpSync(path.join(SRC, '..', p), path.join(dir, p), { recursive: true });
    require('../bin/release-tree').strip(dir);
    const w = worker(undefined, { dev: true, panel: false, src: path.join(dir, 'src') });
    w.store.dripDev = true;
    assert.equal(w.externalListeners(), 0, 'no onMessageExternal listener');
    assert.equal(w.Drip.devAction, undefined);
    // Settings asks for devStatus, and an answer without ok keeps its Developer mode section hidden.
    for (const msg of [{ type: 'devStatus' }, { type: 'setDevMode', on: true }, { type: 'devAction', action: 'minutes+5' }]) {
      const res = await w.send(msg, PAGE);
      assert.equal(res.ok, false, msg.type);
      assert.equal(res.error, 'unknown-message', msg.type);
    }
    assert.equal((await w.send({ type: 'get' }, PAGE)).state.watchSecondsLeft, 0);
    assert.equal((await w.send({ type: 'spendWatch' })).state.watchSecondsLeft, 15 * 60);
    assert.equal(w.store.dripDevClock, undefined);
    assert.equal(worker(undefined, { dev: true }).externalListeners(), 1, 'the unpacked tree keeps the localhost route');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dev/ENABLED keeps developer mode on whatever the toggle says', async () => {
  const w = worker(undefined, { dev: true });
  const off = await w.send({ type: 'setDevMode', on: false }, PAGE);
  assert.equal(off.file, true);
  assert.equal(off.enabled, true);
});

test('the home page messages: revealNext, buyIfOut, and addBacklog with an index', async () => {
  const w = worker();
  await w.send({ type: 'reveal', candidates: [{ id: 'aaa', title: 'A' }] });
  const next = await w.send({ type: 'revealNext', videoId: 'aaa', candidates: [{ id: 'aaa', title: 'A' }, { id: 'bbb', title: 'B' }] });
  assert.equal(next.ok, true);
  assert.equal(w.store.drip.current.id, 'bbb');
  const stale = await w.send({ type: 'revealNext', videoId: 'aaa', candidates: [{ id: 'ccc', title: 'C' }] });
  assert.equal(stale.error, 'stale-card');
  const buy = await w.send({ type: 'buyIfOut', videoId: 'zzz' });
  assert.equal(buy.bought, true);
  assert.equal(w.store.drip.watchSecondsBought, 900);
  for (const id of ['x1', 'x2']) await w.send({ type: 'addBacklog', video: { id, title: id } });
  await w.send({ type: 'addBacklog', video: { id: 'x0', title: 'x0' }, index: 0 });
  assert.deepEqual(w.store.drip.backlog.map((/** @type {any} */ v) => v.id), ['x0', 'x1', 'x2']);
});

test('the worker applies a raise at once in the first day after install (Q6)', async () => {
  const w = worker();
  const res = await w.send({ type: 'updateSettings', changes: { stashMax: 20 } });
  assert.equal(res.applied.stashMax, 20);
  assert.equal(w.store.drip.settings.stashMax, 20);
  const old = worker({ ...w.store.drip, installedAt: Date.now() - 2 * 86400000 });
  assert.equal((await old.send({ type: 'updateSettings', changes: { stashMax: 30 } })).pending.stashMax, 30);
  assert.equal(old.store.drip.settings.stashMax, 20);
});

test('a status message persists first-day expiry through worker restart and clock rollback (Q6, A20)', async () => {
  const now = Date.now();
  const raw = worker().Drip.initialState(now);
  raw.installedAt = now - 86400000 - 1000;
  delete raw.firstDayEnded; // Storage from before this flag was added.
  const w = worker(raw);
  const status = await w.send({ type: 'status', videoId: 'abc' });
  assert.equal(status.state.day, raw.day, 'expiry needs no day rollover');
  assert.equal(w.store.drip.firstDayEnded, true);
  assert.equal(w.writes(), 1, 'the regular status path saves expiry');
  await w.send({ type: 'status', videoId: 'abc' });
  assert.equal(w.writes(), 1, 'later status messages need no extra write');
  const restarted = w.restart();
  await restarted.advance(-23 * 3600000);
  const result = await restarted.send({ type: 'updateSettings', changes: { clock: false } });
  assert.deepEqual({ ...result.applied }, {});
  assert.equal(result.pending.clock, false);
  assert.equal(restarted.store.drip.settings.clock, true);
  assert.equal(restarted.store.drip.firstDayEnded, true);
});

test('swapBacklog and a tick with the player position reach the stash (Q28)', async () => {
  const w = worker();
  await w.send({ type: 'updateSettings', changes: { stashMax: 1 } });
  await w.send({ type: 'addBacklog', video: { id: 'aaa', title: 'A' } });
  const full = await w.send({ type: 'addBacklog', video: { id: 'bbb', title: 'B' } });
  assert.equal(full.error, 'stash-full');
  const swap = await w.send({ type: 'swapBacklog', video: { id: 'bbb', title: 'B' }, dropId: 'aaa' });
  assert.equal(swap.ok, true);
  assert.deepEqual(w.store.drip.backlog.map((/** @type {any} */ v) => v.id), ['bbb']);
  await w.send({ type: 'spendWatch' });
  await w.send({ type: 'tick', seconds: 5, videoId: 'bbb', position: 125.4, duration: 600 });
  assert.equal(w.store.drip.backlog[0].resumeSec, 125);
  assert.equal(w.store.drip.backlog[0].durationSec, 600);
});

// Codex, 2026-10-13: Chrome stops an idle worker and drops its variables. The clock lives in session storage, so two
// tabs playing at once aren't both charged after a restart.
test('the clock survives a worker restart, so overlapping time from two tabs is charged once', async () => {
  const w = worker();
  await w.send({ type: 'spendWatch' });
  await w.send({ type: 'tick', seconds: 5, videoId: 'aaa' });
  const w2 = w.restart();
  await w2.send({ type: 'tick', seconds: 5, videoId: 'bbb' });
  assert.ok(w2.store.drip.watchSecondsLeft >= 894, `left ${w2.store.drip.watchSecondsLeft}`);
});

test('a resent tick key is charged only for its new seconds, and a failed write records nothing', async () => {
  const w = worker();
  await w.send({ type: 'spendWatch' });
  w.failWrites(1);
  await w.send({ type: 'tick', seconds: 5, videoId: 'aaa', key: 'k1', ago: 60000 });
  assert.equal(w.store.drip.watchSecondsLeft, 900);
  await w.send({ type: 'tick', seconds: 5, videoId: 'aaa', key: 'k1', ago: 60000 });
  assert.equal(w.store.drip.watchSecondsLeft, 895);
  // Two more seconds played under the same key, ending two seconds later.
  await w.send({ type: 'tick', seconds: 7, videoId: 'aaa', key: 'k1', ago: 58000 });
  assert.equal(w.store.drip.watchSecondsLeft, 893);
});

test('a tick whose state saved but whose clock did not is still ok, so the tab does not resend it (Codex, 2026-10-14)', async () => {
  const w = worker();
  await w.send({ type: 'spendWatch' });
  w.failSessionWrites(1);
  const res = await w.send({ type: 'tick', seconds: 5, videoId: 'aaa', key: 'k1', ago: 60000 });
  assert.equal(res.ok, true);
  assert.equal(w.store.drip.watchSecondsLeft, 895);
});

// Codex, 2026-10-13: only drip's own scripts can send these, but a bad shape mustn't get around a limit.
test('needThis refuses an id that is not a video id', async () => {
  const w = worker();
  for (const videoId of [{}, ['a'], 42, '', 'has space']) {
    const res = await w.send({ type: 'needThis', videoId, reason: 'for school' });
    assert.equal(res.error, 'bad-video', JSON.stringify(videoId));
  }
  assert.deepEqual([...w.store.drip.unlocked], []);
  const ok = await w.send({ type: 'needThis', videoId: 'abc', reason: 42 });
  assert.equal(ok.error, 'reason-required');
});

test('a pasted reason of megabytes is stored at the cap, not whole (B2)', async () => {
  const w = worker();
  const res = await w.send({ type: 'needThis', videoId: 'abc', title: 'T'.repeat(3e6), reason: `for school ${'r'.repeat(3e6)}` });
  assert.equal(res.ok, true);
  const [use] = Object.values(w.store.drip.log).flatMap((/** @type {any} */ day) => day.needThis);
  assert.equal(use.reason.length, 300);
  assert.equal(use.title.length, 200);
  assert.ok(JSON.stringify(w.store.drip).length < 10000);
});

test('a message that is not an object is refused', async () => {
  const w = worker();
  for (const msg of [null, 'get', 7]) assert.equal((await w.send(msg, PAGE)).error, 'unknown-message');
});

test('Undo can go over the stash cap, but not past the highest cap Settings allows', async () => {
  const w = worker();
  await w.send({ type: 'updateSettings', changes: { stashMax: 1 } });
  for (let i = 0; i < 60; i++) await w.send({ type: 'addBacklog', video: { id: `v${i}`, title: '' }, index: 0 });
  assert.equal(w.store.drip.backlog.length, 50);
});

const OPTIONS = 'src/options/options.html';

test('openSettings opens Settings at the section in a new tab', async () => {
  const w = worker();
  assert.equal((await w.send({ type: 'openSettings', section: 'watch' })).ok, true);
  assert.deepEqual(w.created.map((c) => ({ ...c })), [{ url: `${OPTIONS}#watch` }]);
  assert.equal(w.writes(), 0);
});

test('openSettings opens the top of Settings for an unknown or empty section', async () => {
  const w = worker();
  await w.send({ type: 'openSettings', section: 'nope' }, PAGE);
  await w.send({ type: 'openSettings', section: '' }, PAGE);
  assert.deepEqual(w.created.map((c) => ({ ...c })), [{ url: OPTIONS }, { url: OPTIONS }]);
});

test('openSettings accepts the YouTube section and the Settings and History tabs', async () => {
  const w = worker();
  for (const section of ['youtube', 'settings', 'history']) {
    assert.equal((await w.send({ type: 'openSettings', section })).ok, true);
  }
  assert.deepEqual(w.created.map((c) => ({ ...c })), ['youtube', 'settings', 'history'].map((section) => ({ url: `${OPTIONS}#${section}` })));
});

test('openSettings without a section selects Settings in an existing tab', async () => {
  const w = worker(undefined, { contexts: [
    { contextType: 'TAB', tabId: 9, windowId: 4, documentUrl: `${OPTIONS}#history` },
  ] });
  assert.equal((await w.send({ type: 'openSettings' })).ok, true);
  assert.deepEqual(w.created, []);
  assert.deepEqual(JSON.parse(JSON.stringify(w.calls)), [
    ['tab', 9, { active: true }], ['window', 4, { focused: true }],
    ['broadcast', { type: 'settingsGoto', section: 'settings' }],
  ]);
});

test('openSettings brings an open Settings tab forward and tells it where to go, without reloading it', async () => {
  const w = worker(undefined, { contexts: [
    { contextType: 'TAB', tabId: 7, windowId: 3, documentUrl: `chrome-extension://drip/src/welcome/welcome.html` },
    { contextType: 'TAB', tabId: 9, windowId: 4, documentUrl: `${OPTIONS}#day` },
  ] });
  assert.equal((await w.send({ type: 'openSettings', section: 'cards' })).ok, true);
  assert.deepEqual(w.created, []);
  assert.deepEqual(JSON.parse(JSON.stringify(w.calls)), [
    ['tab', 9, { active: true }],
    ['window', 4, { focused: true }],
    ['broadcast', { type: 'settingsGoto', section: 'cards' }],
  ]);
});

test('a tick at the start of Dry hours is charged before the minutes come back as drops (Codex, 2026-11-04)', async () => {
  require('../src/lib/state.js');
  const D = /** @type {any} */ (globalThis).Drip;
  const now = Date.now();
  const hour = new Date(now).getHours();
  const state = D.initialState(now);
  // Dry hours over the current hour, not yet handled, with 30 minutes and 2 seconds left and no drops.
  Object.assign(state.settings, { dryHours: true, dryFrom: hour, dryTo: (hour + 1) % 24 });
  state.watchSecondsLeft = 30 * 60 + 2;
  state.watchSecondsBought = state.watchSecondsLeft;
  state.tokens.watch = 0;
  const w = worker(state);
  await w.send({ type: 'tick', videoId: 'abc', seconds: 5, ago: 0, playing: true, key: 'k1' });
  await w.idle();
  const saved = w.store.drip;
  assert.equal(saved.watchSecondsLeft, 0);
  assert.equal(saved.tokens.watch, 1, '29m57s is one whole drop, not two');
});

test('the dev clock jumps to 6 minutes before Dry hours and back to real time', async () => {
  require('../src/lib/state.js');
  const D = /** @type {any} */ (globalThis).Drip;
  const state = D.initialState(Date.now());
  // Dry hours from 3 hours on, so the jump is ahead whatever the hour is now.
  const from = (new Date().getHours() + 3) % 24;
  Object.assign(state.settings, { dryHours: true, dryFrom: from, dryTo: (from + 2) % 24 });
  const w = worker(state, { dev: true });
  const res = await w.send({ type: 'devAction', action: 'clock-dry-6m' });
  assert.equal(res.ok, true);
  const offset = w.store.dripDevClock.offset;
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 3).getTime();
  assert.ok(Math.abs(Date.now() + offset - (start - 6 * 60e3)) < 2000, `offset ${offset}`);
  // 6 minutes before, drops still sell; a minute on, the warning has begun.
  assert.equal((await w.send({ type: 'spendWatch' })).ok, true);
  await w.send({ type: 'devAction', action: 'clock+1m' });
  assert.ok(Math.abs(w.store.dripDevClock.offset - offset - 60e3) < 1000);
  assert.equal((await w.send({ type: 'spendWatch' })).error, 'dry-soon');
  assert.equal((await w.send({ type: 'devAction', action: 'clock-real' })).ok, true);
  assert.equal('dripDevClock' in w.store, false);
  assert.equal((await w.send({ type: 'spendWatch' })).ok, true, 'real time again');
});

test('the dev clock refuses without developer mode, and without Dry hours to jump to', async () => {
  const off = worker();
  assert.equal((await off.send({ type: 'devAction', action: 'clock+1h' })).error, 'dev-off');
  const w = worker(undefined, { dev: true });
  assert.equal((await w.send({ type: 'devAction', action: 'clock-dry-6m' })).error, 'no-dry-hours');
  assert.equal('dripDevClock' in w.store, false);
});

test('the worker sends content scripts the text of the icons they ask for, and nothing outside src/icons', async () => {
  const w = worker();
  const res = await w.send({ type: 'icons', names: ['clock', 'nope', '../manifest', 'x', 7] });
  assert.equal(res.ok, true);
  assert.deepEqual(Object.keys(res.icons).sort(), ['clock', 'x']);
  assert.equal(res.icons.clock, fs.readFileSync(path.join(SRC, 'icons', 'clock.svg'), 'utf8'));
  assert.deepEqual(Object.keys((await w.send({ type: 'icons', names: 'clock' })).icons), []);
});

test('every save bumps the revision by one, and a message that changes nothing leaves it', async () => {
  const w = worker();
  const first = await w.send({ type: 'get' });
  const rev = w.store.drip.rev;
  assert.equal(first.state.rev, rev);
  const again = await w.send({ type: 'get' });
  assert.equal(w.store.drip.rev, rev);
  assert.equal(again.state.rev, rev);
  const bought = await w.send({ type: 'spendWatch' });
  assert.equal(bought.ok, true);
  assert.equal(w.store.drip.rev, rev + 1);
  assert.equal(bought.state.rev, rev + 1);
  await w.send({ type: 'spendWatch' });
  assert.equal(w.store.drip.rev, rev + 2);
});
