// @ts-check
// The channel page (channel.js) on a fake YouTube channel header, with a fake worker that runs the real rules. Checks
// that the page tells the worker what it saw of a listed channel once, not on every one-second redraw.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');
const NOW = new Date(2026, 10, 10, 12).getTime();
const AVATAR = 'https://yt3.googleusercontent.com/abc=s160-c-k-c0x00ffffff-no-rj';

class FakeElement {
  /** @param {string} tag */
  constructor(tag) {
    this.tag = tag;
    /** @type {Record<string, string>} */
    this.attrs = {};
    /** @type {any[]} */
    this.children = [];
    /** @type {FakeElement | null} */
    this.parentElement = null;
    this.textContent = '';
    this.src = '';
    const classes = new Set();
    this.classList = { add: (/** @type {string} */ c) => classes.add(c), remove: (/** @type {string} */ c) => classes.delete(c) };
  }
  get id() { return this.attrs.id || ''; }
  /** @param {...any} kids */
  append(...kids) {
    for (const k of kids) {
      if (!k) continue;
      if (k instanceof FakeElement) { k.remove(); k.parentElement = this; }
      this.children.push(k);
    }
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
    this.parentElement = null;
  }
  /** @param {any} other */
  contains(other) { for (let el = other; el; el = el.parentElement) if (el === this) return true; return false; }
  addEventListener() {}
  focus() {}
}

/**
 * A channel page for `name` at `/@cooking`, and a worker whose state lists `entry`.
 * @param {{name: string, entry: any, picture?: string}} o
 */
function makePage({ name, entry, picture = AVATAR }) {
  require('../src/lib/state.js');
  const D = /** @type {any} */ (globalThis).Drip;
  const world = { state: D.initialState(NOW - 3 * 86400000), sent: /** @type {any[]} */ ([]) };
  world.state.channels.allow.push(entry);
  /** @type {Function[]} */
  const listeners = [];
  /** @type {Function[]} */
  const timers = [];
  const header = new FakeElement('yt-page-header-view-model');
  const h1 = new FakeElement('h1');
  h1.textContent = name;
  const handle = new FakeElement('span');
  handle.textContent = '@Cooking';
  const avatar = new FakeElement('img');
  avatar.src = picture;
  const actions = new FakeElement('yt-flexible-actions-view-model');
  /** @type {Record<string, any>} */
  const one = {
    'yt-page-header-view-model': header,
    'yt-page-header-view-model h1': h1,
    'yt-page-header-view-model yt-flexible-actions-view-model': actions,
  };
  /** @type {Record<string, any[]>} */
  const all = {
    'yt-page-header-view-model yt-content-metadata-view-model span': [handle],
    'yt-page-header-view-model yt-avatar-shape img': [avatar],
  };
  const document = {
    title: `${name} - YouTube`,
    activeElement: null,
    /** @param {string} sel */
    querySelector: (sel) => one[sel] || null,
    /** @param {string} sel */
    querySelectorAll: (sel) => all[sel] || [],
    /** @param {string} id */
    getElementById: (id) => actions.children.find((c) => c.id === id) || null,
    addEventListener() {},
  };
  const h = (/** @type {string} */ tag, /** @type {Record<string, any>} */ attrs = {}, /** @type {any[]} */ ...kids) => {
    const el = new FakeElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (typeof v === 'string') el.attrs[k] = v;
    el.append(...kids);
    return el;
  };
  /**
   * The worker: the real rules, and a state that changed is saved, so every page hears of it, as background.js does.
   * @param {any} msg
   */
  async function send(msg) {
    world.sent.push(msg);
    // A message to the worker is never answered in the same turn.
    await new Promise((resolve) => setImmediate(resolve));
    const before = JSON.stringify(world.state);
    if (msg.type === 'seenChannel') D.seenChannel(world.state, msg.channel);
    const state = structuredClone(world.state);
    if (JSON.stringify(world.state) !== before) {
      world.state.rev += 1;
      state.rev = world.state.rev;
      for (const fn of listeners) fn(structuredClone(state));
    }
    return { ok: true, state };
  }
  const context = vm.createContext({
    document,
    location: { pathname: '/@cooking' },
    Date: class extends Date { static now() { return NOW; } },
    setInterval: (/** @type {Function} */ fn) => { timers.push(fn); return timers.length; },
    Drip: D,
    DripUI: {
      send, h, hourLabel: () => '4:00am', icon: (/** @type {string} */ name) => h('span', { class: `drip-i-${name}` }),
      onState: (/** @type {Function} */ fn) => { listeners.push(fn); },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(SRC, 'content/channel.js'), 'utf8'), context);
  return {
    world,
    seen: () => world.sent.filter((m) => m.type === 'seenChannel'),
    /** Runs the one-second redraw `n` times. The worker answers well within a second. @param {number} n */
    async seconds(n) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < 10; j++) await new Promise((resolve) => setImmediate(resolve));
        for (const fn of timers) fn();
      }
      for (let j = 0; j < 10; j++) await new Promise((resolve) => setImmediate(resolve));
    },
    button: () => actions.children.find((c) => c.id === 'drip-allow') || null,
  };
}

// cleanChannel turns these into plain spaces, so the stored name never matched the page's (release review, 2026-11-10).
for (const [space, label] of [['　', 'U+3000'], [' ', 'a no-break space']]) {
  test(`a channel name with ${label} is told to the worker once, not every second`, async () => {
    const name = `料理${space}チャンネル`;
    const page = makePage({ name, entry: { ids: ['@cooking'], name: '' } });
    await page.seconds(10);
    assert.ok(page.button(), 'the Allow button is up');
    assert.equal(page.seen().length, 1, 'one seenChannel');
    assert.equal(page.world.state.channels.allow[0].name, '料理 チャンネル', 'the worker stores it cleaned');
  });

  test(`a listed channel already stored with its name cleaned of ${label} sends nothing`, async () => {
    const page = makePage({ name: `料理${space}チャンネル`, entry: { ids: ['@cooking'], name: '料理 チャンネル', avatar: AVATAR } });
    await page.seconds(10);
    assert.deepEqual(page.seen(), []);
  });
}

test('a picture the worker won\'t keep is not sent again every second', async () => {
  // On yt3, so the page reads it, but with a query string, which cleanChannel's picture rule refuses.
  const page = makePage({ name: 'Cooking', entry: { ids: ['@cooking'], name: 'Cooking' }, picture: 'https://yt3.googleusercontent.com/abc?x=1' });
  await page.seconds(10);
  assert.deepEqual(page.seen(), []);
});

test('a listed channel whose name, id, or picture is new to the list is told once', async () => {
  const page = makePage({ name: 'Cooking', entry: { ids: ['@cooking'], name: 'Old name' } });
  await page.seconds(5);
  assert.equal(page.seen().length, 1);
  assert.equal(page.world.state.channels.allow[0].name, 'Cooking');
  assert.equal(page.world.state.channels.allow[0].avatar, AVATAR);
});
