// @ts-check
// The home page's reveal flow (home.js) when something fails partway, against a fake page, fake timers, and a fake
// worker that runs the real rules. Written from AUDIT.md, "Reveals that fail partway", and the second review of it
// (2026-10-16). reveal.js's animations are stood in for by a stub that keeps their contract: find, then ready, then
// resolve true, or false when find found nothing.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');
const EPOCH = new Date(2026, 9, 16, 12).getTime();

// A selector engine for what home.js asks: tags, #id, .class, [attr], [attr="v"], [attr*="v"], :is(), :scope,
// descendant and child combinators, and comma lists.

/** @param {string} s @param {string} sep @returns {string[]} Parts of `s` split on `sep` outside brackets and quotes. */
function splitTop(s, sep) {
  /** @type {string[]} */
  const parts = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of s) {
    if (quote) { if (ch === quote) quote = ''; cur += ch; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth--;
    if (depth === 0 && ch === sep) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * @typedef {{tag: string, id: string, classes: string[], attrs: {name: string, op: string, value: string}[], is: Complex[][], scope: boolean}} Compound
 * @typedef {{compounds: Compound[], combinators: string[]}} Complex
 */

/** @param {string} s @returns {Compound} */
function parseCompound(s) {
  /** @type {Compound} */
  const c = { tag: '', id: '', classes: [], attrs: [], is: [], scope: false };
  let i = 0;
  const name = () => {
    const m = /^[\w-]+/.exec(s.slice(i));
    i += m ? m[0].length : 0;
    return m ? m[0] : '';
  };
  if (/[\w-]/.test(s[0])) c.tag = name().toLowerCase();
  while (i < s.length) {
    const ch = s[i++];
    if (ch === '#') c.id = name();
    else if (ch === '.') c.classes.push(name());
    else if (ch === '[') {
      const end = s.indexOf(']', i);
      const m = /^([\w-]+)(?:([*]?=)"([^"]*)")?$/.exec(s.slice(i, end));
      if (!m) throw new Error(`fake DOM can't parse [${s.slice(i, end)}]`);
      c.attrs.push({ name: m[1], op: m[2] || '', value: m[3] || '' });
      i = end + 1;
    } else if (ch === ':') {
      const pseudo = name();
      if (pseudo === 'scope') c.scope = true;
      else if (pseudo === 'is') {
        let depth = 1;
        const start = ++i;
        while (depth) { if (s[i] === '(') depth++; if (s[i] === ')') depth--; i++; }
        c.is.push(parseList(s.slice(start, i - 1)));
      } else throw new Error(`fake DOM can't parse :${pseudo}`);
    } else throw new Error(`fake DOM can't parse ${s}`);
  }
  return c;
}

/** @param {string} s @returns {Complex} */
function parseComplex(s) {
  /** @type {Compound[]} */
  const compounds = [];
  /** @type {string[]} */
  const combinators = [];
  const tokens = splitTop(s.replace(/\s*>\s*/g, ' > '), ' ');
  for (const t of tokens) {
    if (t === '>') combinators[compounds.length - 1] = '>';
    else {
      if (compounds.length && combinators.length < compounds.length) combinators.push(' ');
      compounds.push(parseCompound(t));
    }
  }
  return { compounds, combinators };
}

/** @param {string} s @returns {Complex[]} */
function parseList(s) {
  return splitTop(s, ',').map(parseComplex);
}

/** @param {FakeElement} el @param {Compound} c @param {any} scope */
function matchCompound(el, c, scope) {
  if (c.tag && el.localName !== c.tag) return false;
  if (c.id && el.getAttribute('id') !== c.id) return false;
  if (c.scope && el !== scope) return false;
  const classes = el.className.split(' ');
  if (!c.classes.every((k) => classes.includes(k))) return false;
  for (const a of c.attrs) {
    const v = el.getAttribute(a.name);
    if (v === null) return false;
    if (a.op === '=' && v !== a.value) return false;
    if (a.op === '*=' && !v.includes(a.value)) return false;
  }
  return c.is.every((list) => list.some((cx) => matchComplex(el, cx, scope)));
}

/** @param {FakeElement} el @param {Complex} cx @param {any} scope @param {number} [k] */
function matchComplex(el, cx, scope, k = cx.compounds.length - 1) {
  if (!matchCompound(el, cx.compounds[k], scope)) return false;
  if (k === 0) return true;
  if (cx.combinators[k - 1] === '>') return !!el.parent && matchComplex(el.parent, cx, scope, k - 1);
  for (let a = el.parent; a; a = a.parent) if (matchComplex(a, cx, scope, k - 1)) return true;
  return false;
}

class FakeElement {
  /** @param {any} doc @param {string} tag */
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.localName = tag.toLowerCase();
    this.tagName = tag.toUpperCase();
    /** @type {Map<string, string>} */
    this.attrs = new Map();
    /** @type {any[]} */
    this.childNodes = [];
    /** @type {FakeElement | null} */
    this.parent = null;
    /** @type {{type: string, fn: Function, capture: boolean, once: boolean}[]} */
    this.listeners = [];
    this.inert = false;
    this.offsetHeight = 0;
    this.naturalWidth = 0;
    this.src = '';
    this.scrollTop = 0;
    const props = new Map();
    this.style = { cssText: '', opacity: '', overflow: '', setProperty: (/** @type {string} */ k, /** @type {string} */ v) => props.set(k, v) };
    const el = this;
    this.classList = {
      /** @param {string} c */
      contains: (c) => el.className.split(' ').includes(c),
      /** @param {...string} cs */
      add: (...cs) => { for (const c of cs) if (!el.classList.contains(c)) el.className = `${el.className} ${c}`.trim(); },
      /** @param {...string} cs */
      remove: (...cs) => { el.className = el.className.split(' ').filter((x) => x && !cs.includes(x)).join(' '); },
      /** @param {string} c @param {boolean} [on] */
      toggle: (c, on) => { if (on ?? !el.classList.contains(c)) el.classList.add(c); else el.classList.remove(c); },
    };
  }
  get className() { return this.attrs.get('class') || ''; }
  set className(v) { this.attrs.set('class', String(v)); }
  get id() { return this.attrs.get('id') || ''; }
  get href() { return this.attrs.get('href') || ''; }
  get parentElement() { return this.parent; }
  get parentNode() { return this.parent; }
  get children() { return this.childNodes.filter((c) => c instanceof FakeElement); }
  get firstChild() { return this.childNodes[0] ?? null; }
  get firstElementChild() { return this.children[0] ?? null; }
  get childElementCount() { return this.children.length; }
  get nextSibling() { return this.parent ? this.parent.childNodes[this.parent.childNodes.indexOf(this) + 1] ?? null : null; }
  get nextElementSibling() {
    if (!this.parent) return null;
    const kids = this.parent.children;
    return kids[kids.indexOf(this) + 1] ?? null;
  }
  get isConnected() {
    let el = /** @type {FakeElement} */ (this);
    while (el.parent) el = el.parent;
    return el === this.ownerDocument.documentElement;
  }
  get textContent() { return this.childNodes.map((c) => (c instanceof FakeElement ? c.textContent : String(c))).join(''); }
  set textContent(v) { this.detachAll(); this.childNodes = [String(v)]; }
  /** @param {string} k @param {any} v */
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  /** @param {string} k */
  getAttribute(k) { return this.attrs.has(k) ? /** @type {string} */ (this.attrs.get(k)) : null; }
  /** @param {string} k */
  hasAttribute(k) { return this.attrs.has(k); }
  /** @param {string} k */
  removeAttribute(k) { this.attrs.delete(k); }
  /** @param {string} k @param {boolean} [on] */
  toggleAttribute(k, on) { if (on ?? !this.attrs.has(k)) this.attrs.set(k, ''); else this.attrs.delete(k); return this.attrs.has(k); }
  /** @param {string} type @param {Function} fn @param {boolean | {capture?: boolean, once?: boolean}} [opts] */
  addEventListener(type, fn, opts) {
    const o = typeof opts === 'boolean' ? { capture: opts } : opts || {};
    this.listeners.push({ type, fn, capture: !!o.capture, once: !!o.once });
  }
  removeEventListener() {}
  /** @param {any} event */
  dispatchEvent(event) {
    event.target ||= this;
    event.stopPropagation = () => { event.stopped = true; };
    event.preventDefault = () => { event.defaultPrevented = true; };
    /** @type {FakeElement[]} */
    const chain = [];
    for (let el = /** @type {FakeElement | null} */ (this); el; el = el.parent) chain.push(el);
    const fire = (/** @type {FakeElement} */ el, /** @type {boolean} */ capture) => {
      for (const l of [...el.listeners]) {
        if (event.stopped) return;
        if (l.type !== event.type || (l.capture !== capture && el !== this)) continue;
        if (l.once) el.listeners = el.listeners.filter((x) => x !== l);
        l.fn(event);
      }
    };
    for (const el of [...chain].reverse().slice(0, -1)) fire(el, true);
    if (!event.stopped) fire(this, false);
    if (event.bubbles !== false) for (const el of chain.slice(1)) { if (event.stopped) break; fire(el, false); }
    return !event.defaultPrevented;
  }
  /** A real click: nothing on a disabled button, or inside an inert element. @param {number} [detail] */
  click(detail = 1) {
    if (this.hasAttribute('disabled')) return;
    for (let el = /** @type {FakeElement | null} */ (this); el; el = el.parent) if (el.inert) return;
    this.dispatchEvent({ type: 'click', detail, button: 0 });
  }
  focus() { this.ownerDocument.activeElement = this; }
  /** @param {any} node */
  adopt(node) {
    if (node instanceof FakeElement) { node.remove(); node.parent = this; }
    return node;
  }
  detachAll() { for (const c of this.childNodes) if (c instanceof FakeElement) c.parent = null; }
  /** @param {...any} kids */
  append(...kids) { for (const k of kids) this.childNodes.push(this.adopt(k)); }
  /** @param {...any} kids */
  prepend(...kids) { this.childNodes.unshift(...kids.map((k) => this.adopt(k))); }
  /** @param {...any} kids */
  replaceChildren(...kids) { this.detachAll(); this.childNodes = []; this.append(...kids); }
  /** @param {...any} nodes */
  before(...nodes) {
    const p = this.parent;
    if (!p) return;
    for (const n of nodes) { p.adopt(n); p.childNodes.splice(p.childNodes.indexOf(this), 0, n); }
  }
  /** @param {any} node @param {any} ref */
  insertBefore(node, ref) {
    if (!ref) return this.append(node);
    this.adopt(node);
    this.childNodes.splice(this.childNodes.indexOf(ref), 0, node);
  }
  /** @param {any} other */
  replaceWith(other) {
    const p = this.parent;
    if (!p) return;
    p.adopt(other);
    p.childNodes[p.childNodes.indexOf(this)] = other;
    this.parent = null;
  }
  remove() {
    if (this.parent) this.parent.childNodes = this.parent.childNodes.filter((c) => c !== this);
    this.parent = null;
  }
  /** @param {any} other */
  contains(other) {
    for (let el = other; el; el = el.parent) if (el === this) return true;
    return false;
  }
  /** @returns {FakeElement[]} */
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  /** @param {string} sel */
  querySelectorAll(sel) {
    const list = parseList(sel);
    return this.descendants().filter((el) => list.some((cx) => matchComplex(el, cx, this)));
  }
  /** @param {string} sel */
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  /** @param {string} sel */
  closest(sel) {
    const list = parseList(sel);
    for (let el = /** @type {FakeElement | null} */ (this); el; el = el.parent) if (list.some((cx) => matchComplex(el, cx, el))) return el;
    return null;
  }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  getClientRects() { return []; }
  getAnimations() { return []; }
  animate() { return { finished: Promise.resolve(), cancel() {}, currentTime: 0 }; }
}

async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
}

/**
 * The worker, with the real rules and a shared state, and knobs for the ways a message can fail.
 */
function makeWorld() {
  require('../src/lib/state.js');
  const D = /** @type {any} */ (globalThis).Drip;
  const world = {
    D,
    state: D.initialState(EPOCH),
    /** @type {any[]} */
    sent: [],
    /** @type {Function[]} */
    listeners: [],
    /**
     * How the next message fails: 'throw' rejects before the worker runs, as a port that closes does. 'lose-reply'
     * lets the worker save, then rejects. 'disconnect' is a reloaded extension. 'write' is a failed storage write.
     * @type {'' | 'throw' | 'lose-reply' | 'disconnect' | 'write'}
     */
    failNext: '',
    /** Messages wait for this before the worker answers, so a test can act mid-flight. @type {Promise<void> | null} */
    hold: null,
    /** @param {any} msg */
    async handle(msg) {
      world.sent.push(msg);
      if (world.hold) await world.hold;
      const fail = world.failNext;
      world.failNext = '';
      if (fail === 'throw') throw new Error('The message port closed before a response was received.');
      if (fail === 'disconnect') throw new Error('Extension context invalidated.');
      const draft = structuredClone(world.state);
      const result = world.run(draft, msg);
      if (fail === 'write') return { ok: false, error: 'Error: write failed' };
      if (JSON.stringify(draft) !== JSON.stringify(world.state)) {
        world.state = draft;
        const saved = structuredClone(draft);
        for (const fn of world.listeners) fn({ drip: { newValue: saved } }, 'local');
      }
      if (fail === 'lose-reply') throw new Error('The message port closed before a response was received.');
      return { ...result, state: structuredClone(world.state) };
    },
    /** @param {any} state @param {any} msg */
    run(state, msg) {
      switch (msg.type) {
        case 'get': return { ok: true };
        case 'spendWatch': return D.spendWatch(state);
        case 'reveal': return D.reveal(state, msg.candidates);
        case 'revealNext': return D.revealNext(state, msg.videoId, msg.candidates);
        case 'resolve': return D.resolveCurrent(state, msg.action, msg.videoId, EPOCH);
        case 'buyIfOut': return D.buyIfOut(state, msg.videoId);
        default: return { ok: false, error: 'unknown-message' };
      }
    },
    /** @param {string} type */
    count: (type) => world.sent.filter((m) => m.type === type).length,
  };
  return world;
}

/**
 * One YouTube tab on the home page, running home.js.
 * @param {ReturnType<typeof makeWorld>} world
 * @param {{reduced?: boolean, grid?: string[]}} [opts] reduced: the browser asks for reduced motion, so nothing
 *   animates. grid: the ids in YouTube's hidden home grid.
 */
async function makeTab(world, { reduced = true, grid = ['v1', 'v2', 'v3'] } = {}) {
  let now = 0;
  /** @type {Map<number, {fn: Function, at: number, every: number}>} */
  const timers = new Map();
  let nextTimer = 0;
  /** @param {Function} fn @param {number} ms @param {number} every */
  const addTimer = (fn, ms, every) => { timers.set(++nextTimer, { fn, at: now + Math.max(0, ms || 0), every }); return nextTimer; };
  /** @type {any[]} */
  const errors = [];

  /** @type {any} */
  const document = {
    hidden: false,
    activeElement: null,
    /** @param {string} tag */
    createElement: (tag) => new FakeElement(document, tag),
    /** @param {string} _ns @param {string} tag */
    createElementNS: (_ns, tag) => new FakeElement(document, tag),
    /** @param {string} id */
    getElementById: (id) => document.documentElement.querySelector(`#${id}`),
    /** @param {string} sel */
    querySelector: (sel) => document.documentElement.querySelector(sel),
    /** @param {string} sel */
    querySelectorAll: (sel) => document.documentElement.querySelectorAll(sel),
    listeners: /** @type {Record<string, Function[]>} */ ({}),
    /** @param {string} type @param {Function} fn */
    addEventListener: (type, fn) => { (document.listeners[type] ||= []).push(fn); },
    /** @param {any} event */
    dispatchEvent: (event) => { for (const fn of document.listeners[event.type] || []) fn(event); return true; },
  };
  document.documentElement = new FakeElement(document, 'html');
  document.body = new FakeElement(document, 'body');
  document.documentElement.append(document.body);
  document.activeElement = document.body;

  // YouTube's home page: the browse page, its hidden grid, and the column drip mounts in.
  const browse = new FakeElement(document, 'ytd-browse');
  browse.setAttribute('page-subtype', 'home');
  const results = new FakeElement(document, 'ytd-two-column-browse-results-renderer');
  const primary = new FakeElement(document, 'div');
  primary.setAttribute('id', 'primary');
  results.append(primary);
  browse.append(results);
  document.body.append(browse);
  for (const id of grid) {
    const item = new FakeElement(document, 'ytd-rich-item-renderer');
    const link = new FakeElement(document, 'a');
    link.setAttribute('href', `/watch?v=${id}`);
    const title = new FakeElement(document, 'span');
    title.setAttribute('id', 'video-title');
    title.textContent = `Video ${id}`;
    link.append(title);
    item.append(link);
    primary.append(item);
  }

  const location = {
    pathname: '/', search: '', origin: 'https://www.youtube.com', href: 'https://www.youtube.com/',
    /** @type {string[]} */
    assigned: [],
    /** @param {string} url */
    assign(url) { location.assigned.push(url); },
  };
  const h = (/** @type {string} */ tag, /** @type {Record<string, any>} */ attrs = {}, /** @type {any[]} */ ...kids) => {
    const el = new FakeElement(document, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.append(...kids);
    return el;
  };
  const runtime = {
    id: 'drip',
    onMessage: { addListener() {} },
    getManifest: () => ({ version: '1.0.0' }),
    getURL: (/** @type {string} */ p) => p,
    sendMessage: (/** @type {any} */ msg) => world.handle(msg).catch((err) => {
      if (/invalidated/.test(String(err))) /** @type {any} */ (runtime).id = undefined;
      throw err;
    }),
  };
  const tab = {
    reduced,
    document, location, world, errors, browse,
    /** @type {any[]} */
    reveals: [],
    /** The card the animation stub dealt, which home.js draws for real once the animation is done. @type {any} */
    dealt: null,
  };

  /** @type {any} */
  const context = {
    document, location, console, JSON, Math, Number, String, Boolean, Set, Map, WeakMap, Array, Object, Promise, Error,
    URL, URLSearchParams, structuredClone, navigator: { userAgent: 'test', clipboard: { writeText: async () => {} } },
    CSS: { escape: (/** @type {string} */ s) => s.replace(/["\\]/g, '\\$&') },
    innerHeight: 900,
    performance: { now: () => now },
    Date: class extends Date { static now() { return EPOCH + now; } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout: (/** @type {Function} */ fn, /** @type {number} */ ms) => addTimer(fn, ms, 0),
    clearTimeout: (/** @type {number} */ id) => { timers.delete(id); },
    setInterval: (/** @type {Function} */ fn, /** @type {number} */ ms) => addTimer(fn, ms, ms),
    clearInterval: (/** @type {number} */ id) => { timers.delete(id); },
    addEventListener() {},
    chrome: {
      runtime,
      storage: { onChanged: { addListener: (/** @type {Function} */ fn) => world.listeners.push(fn) } },
    },
    // The parts home.js draws with but these tests don't look at.
    DripGlass: { fraction: () => 0.5, make: () => h('svg'), set() {} },
    DripStash: { parts: () => ({ nodes: [h('span', {}, 'Stash')], to() {} }) },
    DripSwap: { leftSec: () => 0, meta: () => '', fraction: () => 0, bar: () => null, picker: () => h('div'), place() {}, note: () => null, UNDO_MS: 5000 },
    DripPour: { pour: async () => {} },
    DripCounter: {
      num: (/** @type {number} */ n) => h('span', { class: 'drip-num' }, String(n)),
      value: (/** @type {any} */ el) => Number(el.textContent),
      to: (/** @type {any} */ el, /** @type {number} */ n) => { el.textContent = String(n); },
      land: async () => {},
    },
    // reveal.js's contract, without its animation: find and pay, then wait for the picture, then done.
    DripReveal: {
      reduced: () => tab.reduced,
      dealCard: (/** @type {any} */ img) => h('div', { class: 'drip-deal' }, h('div', { class: 'drip-deal-front' }, img)),
      reveal: async (/** @type {any} */ o) => {
        tab.reveals.push('reveal');
        const video = await o.find();
        if (!video) return false;
        tab.dealt = o.card(video);
        await o.ready(video);
        return true;
      },
      next: async (/** @type {any} */ o) => {
        tab.reveals.push('next');
        const video = await o.find();
        if (!video) return false;
        tab.dealt = o.card(video);
        await o.ready(video);
        return true;
      },
      pass: async () => {},
      passOut: async () => {},
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ['lib/state.js', 'content/common.js', 'content/home.js']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), context, { filename: file });
  }

  /** Runs every timer due in the next `ms`, in order, letting promises settle between them. @param {number} ms */
  async function advance(ms) {
    const end = now + ms;
    await settle();
    for (;;) {
      let due = null;
      for (const [id, t] of timers) if (t.at <= end && (!due || t.at < due[1].at)) due = [id, t];
      if (!due) break;
      const [id, t] = /** @type {[number, {fn: Function, at: number, every: number}]} */ (due);
      now = Math.max(now, t.at);
      if (t.every) t.at = now + t.every;
      else timers.delete(id);
      try {
        await t.fn();
      } catch (err) {
        errors.push(err);
      }
      await settle();
    }
    now = end;
    await settle();
  }

  const root = () => document.getElementById('drip-home');
  /** @param {string} key */
  const button = (key) => root()?.querySelector(`[data-k="${key}"]`) ?? null;
  Object.assign(tab, {
    advance,
    root,
    button,
    /** Clicks a control by its data-k, as a mouse would, and waits for what it started. @param {string} key */
    async click(key, detail = 1) {
      const el = button(key);
      assert.ok(el, `no ${key} button`);
      el.click(detail);
      await settle();
    },
    /** The line under the buttons. */
    message: () => root()?.querySelector('.drip-message')?.textContent || '',
    card: () => root()?.querySelectorAll('.drip-card').find((/** @type {any} */ el) => !el.classList.contains('is-loading')) ?? null,
    cardTitle: () => root()?.querySelector('.drip-card-title')?.textContent || '',
    /** The card's picture, which the test loads or leaves hanging. While the animation runs, it's on the stub's card. */
    img: () => root()?.querySelector('.drip-thumb img') ?? tab.dealt?.querySelector('.drip-thumb img') ?? null,
  });
  // drip mounts on its half-second check, then asks the worker for state.
  await advance(600);
  return /** @type {any} */ (tab);
}

/** Lets the card's picture load, as YouTube's image server answering does. @param {any} tab */
async function loadPicture(tab) {
  const img = tab.img();
  if (!img) return;
  img.naturalWidth = 1280;
  img.dispatchEvent({ type: 'load' });
  await settle();
}

// Most of these run both ways: with reduced motion, where home.js draws a placeholder and redraws, and with the
// animation, where reveal.js holds redraws until it's done.
for (const reduced of [true, false]) {
  const how = reduced ? 'reduced motion' : 'animated';

  test(`a reveal that works spends one card and shows it (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced });
    await tab.click('reveal');
    await loadPicture(tab);
    await tab.advance(100);
    assert.equal(world.state.tokens.rec, 9);
    assert.equal(world.state.current.id, 'v1');
    assert.equal(tab.cardTitle(), 'Video v1');
    assert.equal(tab.message(), '');
  });

  test(`nothing new in the grid spends nothing and says so (${how})`, async () => {
    const world = makeWorld();
    world.state.seen = ['v1', 'v2', 'v3'];
    const tab = await makeTab(world, { reduced });
    await tab.click('reveal');
    // The hidden frame that looks for more never loads in the fake page, so this waits out its timeouts.
    await tab.advance(35000);
    assert.equal(world.state.tokens.rec, 10);
    assert.equal(world.state.current, null);
    assert.match(tab.message(), /hasn't loaded anything new/);
    assert.ok(tab.button('reveal') && !tab.button('reveal').hasAttribute('disabled'), 'Reveal works again');
  });

  test(`a message that never reaches the worker spends nothing, and Reveal works again (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced });
    world.failNext = 'throw';
    await tab.click('reveal');
    await tab.advance(100);
    assert.equal(world.state.tokens.rec, 10);
    assert.match(tab.message(), /Something went wrong/);
    await tab.click('reveal');
    await loadPicture(tab);
    await tab.advance(100);
    assert.equal(world.state.current?.id, 'v1');
    assert.equal(tab.message(), '');
  });

  test(`a failed storage write spends nothing (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced });
    world.failNext = 'write';
    await tab.click('reveal');
    await tab.advance(100);
    assert.equal(world.state.tokens.rec, 10);
    assert.equal(world.state.current, null);
    assert.match(tab.message(), /Something went wrong/);
  });

  test(`a reveal whose reply is lost still shows the card it bought (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced });
    world.failNext = 'lose-reply';
    await tab.click('reveal');
    await tab.advance(100);
    assert.equal(world.state.tokens.rec, 9);
    assert.equal(tab.cardTitle(), 'Video v1', 'the card from the storage update');
  });

  test(`a reloaded extension asks for a refresh and spends nothing (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced });
    world.failNext = 'disconnect';
    await tab.click('reveal');
    await tab.advance(100);
    assert.equal(world.state.tokens.rec, 10);
    assert.match(tab.root().textContent, /drip was updated\. Refresh this page\./);
  });

  test(`a feed read that throws ends the reveal with a message (${how})`, async () => {
    const world = makeWorld();
    // A grid link whose href can't be parsed makes readPool throw.
    const tab = await makeTab(world, { reduced, grid: ['v1'] });
    tab.browse.querySelector('a').setAttribute('href', 'http://[/watch?v=v1');
    await tab.click('reveal');
    await tab.advance(100);
    assert.equal(world.count('reveal'), 0, 'nothing sent');
    assert.match(tab.message(), /Something went wrong/);
    assert.deepEqual(tab.errors, [], 'no error escapes');
    assert.ok(tab.button('reveal') && !tab.button('reveal').hasAttribute('disabled'), 'Reveal works again');
  });

  test(`a second click before the first is answered does nothing (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced });
    // Two separate clicks, not a double-click, so the page's double-click guard doesn't catch the second.
    const reveal = tab.button('reveal');
    reveal.click();
    reveal.click();
    await tab.advance(100);
    await loadPicture(tab);
    await tab.advance(100);
    assert.equal(world.count('reveal'), 1);
    assert.equal(world.state.tokens.rec, 9);
  });

  test(`Reveal next that finds nothing new keeps the card and spends nothing (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced });
    await tab.click('reveal');
    await loadPicture(tab);
    await tab.advance(100);
    world.state.seen = ['v1', 'v2', 'v3'];
    await tab.click('next');
    await tab.advance(35000);
    assert.equal(world.state.tokens.rec, 9);
    assert.equal(world.state.current.id, 'v1');
    assert.equal(tab.cardTitle(), 'Video v1');
    assert.match(tab.message(), /hasn't loaded anything new/);
  });
}

test('a picture that never loads holds the animated reveal for 8 seconds, not forever', async () => {
  const world = makeWorld();
  const tab = await makeTab(world, { reduced: false });
  await tab.click('reveal');
  await tab.advance(7000);
  assert.equal(world.state.tokens.rec, 9, 'the card is paid for');
  assert.equal(tab.card(), null, 'still turning over');
  await tab.advance(1500);
  assert.equal(tab.cardTitle(), 'Video v1');
});

test('Subscriptions that never load end within about 30 seconds with nothing spent', async () => {
  const world = makeWorld();
  world.state.settings.feedSource = 'subscriptions';
  const tab = await makeTab(world, { reduced: true });
  await tab.click('reveal');
  await tab.advance(5500);
  assert.match(tab.root().textContent, /Still checking/);
  await tab.advance(26000);
  assert.equal(world.state.tokens.rec, 10);
  assert.match(tab.message(), /Nothing new from your subscriptions\. No card spent\./);
  assert.equal(tab.document.querySelector('iframe'), null, 'the hidden frame is gone');
});

test('the thumbnail does nothing while Reveal next waits on the worker (reduced motion)', async () => {
  const world = makeWorld();
  world.state.watchSecondsLeft = 0;
  const tab = await makeTab(world, { reduced: true });
  await tab.click('reveal');
  await loadPicture(tab);
  await tab.advance(100);
  /** @type {() => void} */
  let release = () => {};
  world.hold = new Promise((r) => { release = () => r(undefined); });
  await tab.click('next');
  // While Reveal next waits on the worker, the old card's picture is still a link to Watch.
  tab.root().querySelector('.drip-thumb').click();
  await tab.advance(100);
  const resolves = world.count('resolve');
  world.hold = null;
  release();
  await tab.advance(100);
  assert.equal(resolves, 0, 'no Watch sent');
  assert.equal(world.state.tokens.watch, 4, 'no drop bought');
  assert.deepEqual(tab.location.assigned, []);
});

test('holding Enter on a button clicks it once, not once per key repeat', async () => {
  const world = makeWorld();
  const tab = await makeTab(world, { reduced: true });
  const add = tab.button('add');
  const first = { type: 'keydown', key: 'Enter', repeat: false };
  const held = { type: 'keydown', key: 'Enter', repeat: true };
  add.dispatchEvent(first);
  add.dispatchEvent(held);
  assert.equal(/** @type {any} */ (first).defaultPrevented, undefined, 'the first press goes through');
  assert.equal(/** @type {any} */ (held).defaultPrevented, true, 'a repeat is held back');
});

test('+15m that fails says why, and a later press works (reduced motion)', async () => {
  const world = makeWorld();
  const tab = await makeTab(world, { reduced: true });
  world.failNext = 'throw';
  await tab.click('add');
  await tab.advance(100);
  assert.equal(world.state.tokens.watch, 4);
  assert.match(tab.message(), /Something went wrong/);
  await tab.click('add');
  await tab.advance(100);
  assert.equal(world.state.tokens.watch, 3);
  assert.equal(world.state.watchSecondsLeft, 900);
});

test('Watch that fails leaves the card up and redrawing', async () => {
  const world = makeWorld();
  world.state.watchSecondsLeft = 600;
  const tab = await makeTab(world, { reduced: true });
  await tab.click('reveal');
  await loadPicture(tab);
  await tab.advance(100);
  world.failNext = 'throw';
  await tab.click('watch');
  await tab.advance(100);
  assert.deepEqual(tab.location.assigned, []);
  assert.match(tab.message(), /Something went wrong/);
  // Redraws aren't held: a change from another tab shows.
  world.state.tokens.rec = 7;
  await world.handle({ type: 'spendWatch' });
  await tab.advance(100);
  const counts = tab.root().querySelectorAll('.drip-num').map((/** @type {any} */ el) => el.textContent);
  assert.ok(counts.includes('7'), `counts ${counts}`);
});
