// @ts-check
// The Stash button's insides and fill (stash.js) against a small fake DOM. Written from DESIGN.md, "The stash fill as
// built": the word sits over a hidden "Stashed" that keeps the width, the word changes once the bookmark is full or as
// it starts to empty, and reduced motion changes it at once.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeNode {
  /** @param {string} tag */
  constructor(tag) {
    this.tagName = tag;
    /** @type {Map<string, string>} */
    this.attrs = new Map();
    /** @type {any[]} */
    this.children = [];
    this.className = '';
    this.textContent = '';
    /** @type {any[]} */
    this.animations = [];
  }
  /** @param {string} k @param {string} v */
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  /** @param {string} k */
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  /** @param {...any} kids */
  append(...kids) { this.children.push(...kids); }
  /** @param {any[]} keyframes */
  animate(keyframes) { this.animations.push(keyframes); }
}

/** @param {{reduced?: boolean}} [o] */
function load({ reduced = false } = {}) {
  /** @type {Function[]} */
  let frames = [];
  let now = 0;
  /** @type {any} */
  const context = {
    document: { createElement: (/** @type {string} */ tag) => new FakeNode(tag), createElementNS: (/** @type {string} */ _ns, /** @type {string} */ tag) => new FakeNode(tag) },
    matchMedia: () => ({ matches: reduced }),
    performance: { now: () => now },
    requestAnimationFrame: (/** @type {Function} */ fn) => { frames.push(fn); },
    Math, Object, Promise, WeakMap, Number, String,
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'stash.js'), 'utf8'), context);
  /** Runs animation frames `ms` apart until none are left, or `limit` of them. */
  async function run(ms = 16, limit = 200) {
    for (let i = 0; i < limit && frames.length; i++) {
      const due = frames;
      frames = [];
      now += ms;
      for (const fn of due) fn(now);
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
  return { DripStash: context.DripStash, run };
}

test('the word sits over a hidden "Stashed" with a gap the bookmark\'s size, so the button keeps one width', () => {
  const { DripStash } = load();
  const stash = DripStash.parts(false, { labelClass: 'drip-save-label' });
  const [row, ghost] = stash.nodes;
  assert.equal(row.className, 'drip-stash-row');
  assert.deepEqual(row.children, [stash.icon, stash.word]);
  assert.equal(stash.word.textContent, 'Stash');
  assert.equal(stash.word.className, 'drip-save-label');
  assert.equal(ghost.getAttribute('aria-hidden'), 'true');
  assert.equal(ghost.children[0].className, 'drip-stash-icon');
  assert.equal(ghost.children[1], 'Stashed');
  assert.equal(DripStash.parts(true).word.textContent, 'Stashed');
});

test('stashing changes the word to "Stashed" only once the bookmark is full, and bobs it once', async () => {
  const { DripStash, run } = load();
  const stash = DripStash.parts(false);
  const done = stash.to(true);
  await run(16, 20);
  assert.equal(stash.word.textContent, 'Stash', 'still filling about 320ms in');
  await run();
  await done;
  assert.equal(stash.word.textContent, 'Stashed');
  assert.equal(stash.icon.animations.length, 1);
});

test('taking it out changes the word to "Stash" as the water starts to fall', async () => {
  const { DripStash, run } = load();
  const stash = DripStash.parts(true);
  const done = stash.to(false);
  assert.equal(stash.word.textContent, 'Stash');
  await run();
  await done;
  assert.equal(stash.icon.animations.length, 0, 'no bob on the way out');
});

test('a newer fill on the same bookmark stops the one before it', async () => {
  const { DripStash, run } = load();
  const stash = DripStash.parts(false);
  const first = stash.to(true);
  await run(16, 10);
  const second = stash.to(false);
  await run();
  await Promise.all([first, second]);
  assert.equal(stash.word.textContent, 'Stash', 'the first fill never got to say "Stashed"');
  assert.equal(stash.icon.animations.length, 0);
});

test('with reduced motion the word and the water change at once', async () => {
  const { DripStash } = load({ reduced: true });
  const stash = DripStash.parts(false);
  await stash.to(true);
  assert.equal(stash.word.textContent, 'Stashed');
  assert.equal(stash.icon.animations.length, 0);
});
