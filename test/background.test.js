// @ts-check
// The worker's message handling, run in Node against a fake chrome. Written from DESIGN.md and RELEASE-PLAN.md.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');
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
 * @param {{dev?: boolean, panel?: boolean}} [opts] dev: the checkout has dev/ENABLED. panel: false for a store build,
 *   which has no dev panel.
 */
function worker(initial = undefined, { dev = false, panel = true } = {}) {
  /** @type {Record<string, any>} */
  const store = initial === undefined ? {} : { drip: structuredClone(initial) };
  let writes = 0;
  let failNext = 0;
  /** @type {Function | null} */
  let onMessage = null;
  /** @type {Function | null} */
  let onInstalled = null;
  /** @type {string[]} */
  const opened = [];
  const chrome = {
    runtime: {
      getURL: (/** @type {string} */ p) => p,
      getManifest: () => ({
        externally_connectable: { matches: ['http://localhost/*'] },
        content_scripts: panel ? [{ js: ['src/devpanel/panel.js'] }] : [],
      }),
      onMessage: { addListener: (/** @type {Function} */ fn) => { onMessage = fn; } },
      onMessageExternal: { addListener() {} },
      onInstalled: { addListener: (/** @type {Function} */ fn) => { onInstalled = fn; } },
      reload() {},
    },
    storage: {
      local: {
        // Chrome returns stored objects with their keys sorted.
        get: async (/** @type {string} */ key) => (key in store ? { [key]: sortKeys(structuredClone(store[key])) } : {}),
        set: async (/** @type {Record<string, any>} */ items) => {
          if (failNext > 0) {
            failNext--;
            throw new Error('write failed');
          }
          writes++;
          Object.assign(store, structuredClone(items));
        },
      },
    },
    tabs: { create: (/** @type {{url: string}} */ opts) => { opened.push(opts.url); } },
  };
  /** @type {any} */
  const context = { chrome, console, setTimeout, structuredClone, URL, fetch: async () => ({ ok: dev }) };
  context.globalThis = context;
  context.importScripts = (/** @type {string} */ file) => vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), context);
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(SRC, 'background.js'), 'utf8'), context);
  /** @param {any} msg @param {any} [sender] @returns {Promise<any>} */
  const send = (msg, sender = YT) => new Promise((resolve) => {
    const async = /** @type {Function} */ (onMessage)(msg, sender, resolve);
    if (async !== true) setTimeout(() => resolve(undefined), 0);
  });
  const install = (/** @type {string} */ reason) => /** @type {Function} */ (onInstalled)({ reason });
  return { send, install, opened, store, writes: () => writes, failWrites: (/** @type {number} */ n) => { failNext = n; }, Drip: context.Drip };
}

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
    const res = await w.send({ type: 'tick', seconds: 60, videoId: 'abc' }, sender);
    assert.deepEqual({ ...res }, { ok: false, error: 'bad-sender' });
  }
  assert.equal(w.store.drip.watchSecondsLeft, 900);
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
