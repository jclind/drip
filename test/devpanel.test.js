// @ts-check
// The dev panel (src/devpanel/panel.js) against a small fake page: it follows the Developer mode toggle, and nothing
// late brings it back once it's off.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');

class El {
  /** @param {string} tag */
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    /** @type {any[]} */
    this.children = [];
    /** @type {El | null} */
    this.parent = null;
    this.hidden = false;
    this.className = '';
    /** @type {Record<string, Function[]>} */
    this.handlers = {};
    /** @type {Record<string, string>} */
    this.attrs = {};
    this._text = '';
  }
  /** @param {string} k @param {string} v */
  setAttribute(k, v) { this.attrs[k] = v; }
  /** @param {string} ev @param {Function} fn */
  addEventListener(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  /** @param {...any} kids */
  append(...kids) { for (const k of kids) { if (k instanceof El) k.parent = this; this.children.push(k); } }
  /** @param {...any} kids */
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  get childElementCount() { return this.children.filter((c) => c instanceof El).length; }
  /** @returns {string} */
  get textContent() { return this.children.length ? this.children.map((c) => (c instanceof El ? c.textContent : String(c))).join('') : this._text; }
  set textContent(t) { this.children = []; this._text = t; }
}

/** Loads common.js and panel.js with a fake worker. devOn is what the worker says about developer mode. */
function load() {
  const root = new El('html');
  /** @type {Function[]} */
  const storageListeners = [];
  /** @type {Map<number, Function>} */
  const timers = new Map();
  let nextTimer = 0;
  const world = {
    devOn: true,
    root,
    panel: () => root.children.find((c) => c.attrs.id === 'drip-dev') || null,
    /** Flips the toggle the way Settings does, which the panel hears as a storage change. @param {boolean} on */
    async toggle(on) { world.devOn = on; for (const fn of storageListeners) fn({ dripDev: { newValue: on } }, 'local'); await settle(); },
    /** Runs every pending timer, as if they all came due. */
    async fireTimers() { const due = [...timers.values()]; timers.clear(); for (const fn of due) fn(); await settle(); },
    /** @param {string} label */
    button: (label) => {
      /** @param {El} el @returns {El | null} */
      const find = (el) => (el.tagName === 'BUTTON' && el.textContent === label ? el : el.children.filter((c) => c instanceof El).map(find).find(Boolean) || null);
      const p = world.panel();
      return p && find(p);
    },
  };
  const state = { day: '2026-10-07', settings: { resetHour: 4, needThisPerWeek: 3, graceMode: false }, log: {}, watchSecondsLeft: 0, tokens: { watch: 4, rec: 10 }, unlocked: [], pending: null };
  const context = /** @type {any} */ ({
    document: { documentElement: root, createElement: (/** @type {string} */ t) => new El(t), querySelector: () => null },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout: (/** @type {Function} */ fn) => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: (/** @type {number} */ id) => { timers.delete(id); },
    console, Promise, JSON, Object, Math, String, Number, Array,
    chrome: {
      runtime: {
        id: 'drip',
        onMessage: { addListener() {} },
        sendMessage: async (/** @type {any} */ msg) => {
          if (msg.type === 'devStatus') return { ok: true, toggle: true, file: false, enabled: world.devOn };
          if (msg.type === 'get') return { ok: true, state };
          return { ok: true, state };
        },
      },
      storage: { onChanged: { addListener: (/** @type {Function} */ fn) => storageListeners.push(fn) } },
    },
  });
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ['lib/state.js', 'content/common.js', 'devpanel/panel.js']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), context);
  }
  return world;
}

async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
}

test('the panel shows while developer mode is on and goes when it is turned off', async () => {
  const w = load();
  await settle();
  assert.ok(w.panel());
  await w.toggle(false);
  assert.equal(w.panel(), null);
  await w.toggle(true);
  assert.ok(w.panel());
});

test("Start fresh's confirm timer doesn't bring the panel back after developer mode is off (Codex)", async () => {
  const w = load();
  await settle();
  const fresh = w.button('Start fresh');
  assert.ok(fresh);
  for (const fn of fresh.handlers.click) fn();
  await w.toggle(false);
  await w.fireTimers();
  assert.equal(w.panel(), null);
});

test('a panel that starts off stays off', async () => {
  const w = load();
  w.devOn = false;
  await w.toggle(false);
  await w.fireTimers();
  assert.equal(w.panel(), null);
});
