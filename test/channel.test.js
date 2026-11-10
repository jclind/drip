// @ts-check
// The Allow button on a channel page (channel.js) against a fake header and the real rules. Q31: the button shows only
// while watch time is on, since with the clock off an allowed channel is no different from any other.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');
const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime();

/** A page element with only what channel.js touches. @param {string} tag @param {Record<string, any>} [props] */
function el(tag, props = {}) {
  /** @type {any} */
  const node = {
    tag, id: '', textContent: '', children: [], parentElement: null, attrs: {},
    classList: { remove() {} },
    append(/** @type {any} */ child) { child.parentElement = node; node.children.push(child); },
    remove() {
      if (node.parentElement) node.parentElement.children = node.parentElement.children.filter((/** @type {any} */ c) => c !== node);
      node.parentElement = null;
    },
    contains: (/** @type {any} */ other) => other === node,
    addEventListener() {},
    focus() {},
    ...props,
  };
  return node;
}

/**
 * A channel page for @woodshop with channel.js loaded on it.
 * @param {(state: any, Drip: any) => void} [prepare] Changes the state before the page reads it.
 */
function channelPage(prepare) {
  const actions = el('yt-flexible-actions-view-model');
  /** @type {Record<string, any[]>} */
  const found = {
    'yt-page-header-view-model': [el('yt-page-header-view-model')],
    'yt-page-header-view-model h1': [el('h1', { textContent: 'Wood Shop' })],
    'yt-page-header-view-model yt-content-metadata-view-model span': [el('span', { textContent: '@woodshop' })],
    'yt-page-header-view-model yt-flexible-actions-view-model': [actions],
    'yt-page-header-view-model yt-avatar-shape img': [],
  };
  /** @type {any[]} */
  const sent = [];
  /** @type {(state: any) => void} */
  let tell = () => {};
  /** @type {any} */
  const context = {
    console, Date, JSON, Promise,
    location: { pathname: '/@woodshop' },
    document: {
      title: 'Wood Shop - YouTube',
      activeElement: null,
      querySelector: (/** @type {string} */ sel) => (found[sel] || [])[0] || null,
      querySelectorAll: (/** @type {string} */ sel) => found[sel] || [],
      getElementById: (/** @type {string} */ id) => actions.children.find((/** @type {any} */ c) => c.id === id) || null,
      addEventListener() {},
    },
    setInterval() {},
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(SRC, 'lib/state.js'), 'utf8'), context);
  const Drip = context.Drip;
  const state = Drip.initialState(NOW);
  state.rev = 1;
  if (prepare) prepare(state, Drip);
  context.DripUI = {
    send: async (/** @type {any} */ msg) => { sent.push(msg); return msg.type === 'get' ? { ok: true, state } : { ok: true }; },
    h: (/** @type {string} */ tag, /** @type {Record<string, any>} */ attrs = {}, /** @type {any[]} */ ...children) => {
      const node = el(tag, { id: attrs.id || '', attrs });
      for (const child of children) if (child && typeof child === 'object') node.append(child);
      node.textContent = children.map((c) => (typeof c === 'string' ? c : c && c.textContent) || '').join('');
      return node;
    },
    onState: (/** @type {(state: any) => void} */ cb) => { tell = cb; },
    hourLabel: (/** @type {number} */ hour) => `${hour}:00am`,
    icon: () => el('svg'),
  };
  vm.runInContext(fs.readFileSync(path.join(SRC, 'content/channel.js'), 'utf8'), context);
  return {
    Drip, state, sent,
    button: () => actions.children.find((/** @type {any} */ c) => c.id === 'drip-allow') || null,
    /** A newer state arrives, as a save in Settings sends one. @param {(state: any) => void} change */
    save(change) {
      change(state);
      state.rev += 1;
      tell(state);
    },
    /** Lets the first `get` reply land. */
    settle: () => new Promise((resolve) => setImmediate(resolve)),
  };
}

test('with watch time on, the channel page has the Allow button', async () => {
  const page = channelPage();
  await page.settle();
  assert.equal(page.button()?.textContent, 'Allow in drip');
});

for (const mode of /** @type {const} */ (['quiet', 'curated'])) {
  test(`in ${mode}, where watch time is off, the channel page has no Allow button`, async () => {
    const page = channelPage((state, Drip) => Object.assign(state.settings, Drip.MODES[mode]));
    await page.settle();
    assert.equal(page.state.settings.clock, false);
    assert.equal(page.button(), null);
  });
}

test('the Allow button goes when watch time turns off and comes back when it turns on', async () => {
  const page = channelPage();
  await page.settle();
  assert.ok(page.button());
  page.save((state) => { state.settings.clock = false; });
  assert.equal(page.button(), null);
  page.save((state) => { state.settings.clock = true; });
  assert.equal(page.button()?.textContent, 'Allow in drip');
});

test('with watch time off, a channel blocked by handle still learns its name from the page', async () => {
  const page = channelPage((state, Drip) => {
    Object.assign(state.settings, Drip.MODES.curated);
    assert.equal(Drip.blockChannel(state, { ids: ['@woodshop'], name: '' }).ok, true);
  });
  await page.settle();
  assert.equal(page.button(), null);
  const seen = page.sent.filter((msg) => msg.type === 'seenChannel');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].channel.name, 'Wood Shop');
});
