// @ts-check
// The home page's reveal flow (home.js) when something fails partway, against a fake page, fake timers, and a fake
// worker that runs the real rules. Written from AUDIT.md, "Reveals that fail partway", and the second review of it
// (2026-10-16). Most cases use a reveal stub: find, ready, then resolve. Empty-feed cases run the real reveal.js
// with immediate animation promises to check its deal and return paths as well as home.js's state.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');
const EPOCH = new Date(2026, 9, 16, 12).getTime();

// A selector engine for what home.js asks: tags, #id, .class, [attr], [attr="v"], [attr*="v"], [attr^="v"], :is(), :scope,
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
  if (s[0] === '*') i++;
  else if (/[\w-]/.test(s[0])) c.tag = name().toLowerCase();
  while (i < s.length) {
    const ch = s[i++];
    if (ch === '#') c.id = name();
    else if (ch === '.') c.classes.push(name());
    else if (ch === '[') {
      const end = s.indexOf(']', i);
      const m = /^([\w-]+)(?:([*^]?=)"([^"]*)")?$/.exec(s.slice(i, end));
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
    if (a.op === '^=' && !v.startsWith(a.value)) return false;
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

/** A text node, so morph.js can patch text in place. */
class FakeText {
  /** @param {string} data */
  constructor(data) {
    this.nodeType = 3;
    this.data = data;
    /** @type {any} */
    this.parent = null;
    Object.defineProperty(this, 'parent', { enumerable: false });
  }
  get parentNode() { return this.parent; }
  get textContent() { return this.data; }
  remove() {
    if (this.parent) this.parent.childNodes = this.parent.childNodes.filter((/** @type {any} */ c) => c !== this);
    this.parent = null;
  }
  toString() { return this.data; }
}

class FakeElement {
  /** @param {any} doc @param {string} tag */
  constructor(doc, tag) {
    this.nodeType = 1;
    this.ownerDocument = doc;
    this.localName = tag.toLowerCase();
    this.tagName = tag.toUpperCase();
    /** @type {Map<string, string>} */
    this.attrs = new Map();
    /** @type {any[]} */
    this.childNodes = [];
    /** @type {FakeElement | null} */
    this.parent = null;
    // Browser nodes don't expose their document and parent as own enumerable fields. Keep these back references
    // out of assertion diffs too: expanding them walks the whole fake page repeatedly and can stall a failed test.
    Object.defineProperties(this, { ownerDocument: { enumerable: false }, parent: { enumerable: false } });
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
  get attributes() { return [...this.attrs].map(([name, value]) => ({ name, value })); }
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
  set textContent(v) { this.detachAll(); this.childNodes = [this.adopt(String(v))]; }
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
        // As in a browser, a listener runs with the element it's on as this and currentTarget.
        event.currentTarget = el;
        l.fn.call(el, event);
      }
    };
    for (const el of [...chain].reverse().slice(0, -1)) fire(el, true);
    if (!event.stopped) fire(this, false);
    if (event.bubbles !== false) for (const el of chain.slice(1)) { if (event.stopped) break; fire(el, false); }
    // As in a browser, Enter on a button clicks it, with detail 0, unless a listener prevented the keydown.
    if (event.type === 'keydown' && event.key === 'Enter' && !event.defaultPrevented && this.localName === 'button') this.click(0);
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
    if (typeof node === 'string' || typeof node === 'number') node = new FakeText(String(node));
    if (node instanceof FakeElement || node instanceof FakeText) { node.remove(); node.parent = this; }
    return node;
  }
  detachAll() { for (const c of this.childNodes) c.parent = null; }
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
    for (const node of nodes) { const n = p.adopt(node); p.childNodes.splice(p.childNodes.indexOf(this), 0, n); }
  }
  /** @param {any} node @param {any} ref */
  insertBefore(node, ref) {
    if (!ref) return this.append(node);
    const n = this.adopt(node);
    this.childNodes.splice(this.childNodes.indexOf(ref), 0, n);
  }
  /** @param {any} other */
  replaceWith(other) {
    const p = this.parent;
    if (!p) return;
    const n = p.adopt(other);
    p.childNodes[p.childNodes.indexOf(this)] = n;
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
  /** No layout, except a page a test puts in view (makeTab's inView), where drip's home page has a box. */
  getClientRects() { return this.ownerDocument.inView && this.attrs.get('id') === 'drip-home' ? [{}] : []; }
  getAnimations() { return []; }
  animate(frames, options) {
    this.ownerDocument.motions?.push({ el: this, frames, options, classes: this.className });
    return { finished: Promise.resolve(), cancel() {}, currentTime: 0 };
  }
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
      // As the worker does before every message (Q32).
      D.enterDry(draft, world.time());
      const result = world.run(draft, msg);
      D.enterDry(draft, world.time());
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
        case 'spendWatch': return D.spendWatch(state, world.time());
        case 'reveal': return D.reveal(state, msg.candidates);
        case 'revealNext': return D.revealNext(state, msg.videoId, msg.candidates);
        case 'resolve': return D.resolveCurrent(state, msg.action, msg.videoId, EPOCH);
        case 'buyIfOut': return D.buyIfOut(state, msg.videoId, world.time());
        case 'dryBackSeen': return D.dryBackSeen(state);
        case 'refillSeen': return D.refillSeen(state);
        default: return { ok: false, error: 'unknown-message' };
      }
    },
    /** @param {string} type */
    count: (type) => world.sent.filter((m) => m.type === type).length,
    /** The worker's clock, which the newest tab sets to its own. */
    time: () => EPOCH,
    /** Runs while a landing plays, before its drops come in. @type {((o: any) => Promise<void>) | null} */
    duringLand: null,
  };
  return world;
}

/**
 * The markup YouTube gives each kind of grid item, as read on air on 2026-10-16: NASA's streams tab for upcoming, live,
 * and past streams, and Linus Tech Tips' videos tab for members-only.
 * @param {any} document @param {any} item @param {string} kind
 */
function gridMarks(document, item, kind) {
  /** @param {string} cls @param {string} text */
  const badge = (cls, text) => {
    const host = new FakeElement(document, 'div');
    host.className = `ytBadgeShapeHost ${cls}`;
    const label = new FakeElement(document, 'div');
    label.className = 'ytBadgeShapeText';
    label.textContent = text;
    host.append(label);
    item.append(host);
  };
  /** @param {string} text */
  const meta = (text) => {
    const el = new FakeElement(document, 'span');
    el.className = 'ytContentMetadataViewModelMetadataText';
    el.textContent = text;
    item.append(el);
  };
  if (kind === 'video') {
    badge('ytBadgeShapeThumbnailDefault', '14:02');
    meta('184K');
    meta('3d ago');
  } else if (kind === 'upcoming') {
    badge('ytBadgeShapeThumbnailDefault', 'Upcoming');
    meta('5 waiting');
    meta('Scheduled for 10/23/26, 2:00 PM');
    // The "Notify me" button.
    item.append(new FakeElement(document, 'lockup-attachments-view-model'));
  } else if (kind === 'live') {
    badge('ytBadgeShapeThumbnailLive', 'LIVE');
    meta('168 watching');
  } else if (kind === 'streamed') {
    badge('ytBadgeShapeThumbnailDefault', '1:42:26');
    meta('60K');
    meta('Streamed 23h ago');
  } else if (kind === 'members') {
    badge('ytBadgeShapeThumbnailDefault', '14:02');
    badge('ytBadgeShapeCommerce', 'Members only');
    meta('3d ago');
  } else if (kind === 'attached') {
    // Not seen yet: a normal video with something under the card, like a Join button. It still has a length.
    gridMarks(document, item, 'video');
    item.append(new FakeElement(document, 'lockup-attachments-view-model'));
  } else if (kind === 'premiere') {
    // An upcoming premiere whose "Notify me" button hasn't rendered, with the channel line Home and Subscriptions have.
    badge('ytBadgeShapeThumbnailDefault', 'Upcoming');
    meta('Some Channel');
    meta('Premieres 10/23/26, 2:00 PM');
  } else if (kind === 'members-old') {
    // The older markup's members-only badge.
    const old = new FakeElement(document, 'div');
    old.className = 'badge badge-style-type-members-only';
    old.textContent = 'Members only';
    item.append(old);
    meta('3d ago');
  } else throw new Error(`no markup for ${kind}`);
}

/** Loads the captured empty-feed fixture into the fake DOM. @param {FakeElement} root */
function addFeedNudge(root) {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'youtube-feed-nudge.html'), 'utf8');
  const stack = [root];
  for (const token of html.replace(/<!--[\s\S]*?-->/g, '').match(/<[^>]+>|[^<]+/g) || []) {
    if (token.startsWith('</')) {
      assert.equal(stack.pop()?.localName, token.slice(2, -1));
    } else if (token.startsWith('<')) {
      const tag = /^<([\w-]+)/.exec(token)[1];
      const el = new FakeElement(root.ownerDocument, tag);
      for (const attr of token.matchAll(/([\w-]+)="([^"]*)"/g)) el.setAttribute(attr[1], attr[2]);
      stack[stack.length - 1].append(el);
      if (tag !== 'img') stack.push(el);
    } else if (token.trim()) stack[stack.length - 1].append(token.trim());
  }
  assert.equal(stack.length, 1, 'the fixture is balanced');
}

/**
 * One YouTube tab on the home page, running home.js.
 * @param {ReturnType<typeof makeWorld>} world
 * @param {{reduced?: boolean, grid?: string[], inView?: boolean, kept?: string, realReveal?: boolean, offline?: boolean}} [opts] reduced: the browser asks for
 *   reduced motion, so nothing animates. grid: the ids in YouTube's hidden home grid. An id written "kind:id" gets that
 *   kind's markup (gridMarks). inView: drip's home page is on screen, so drops land in the counter, and tab.landings
 *   records each landing. kept: what "Done for now" left in sessionStorage, "N" or "N:dryUntil" (watch.js onDone).
 */
async function makeTab(world, { reduced = true, grid = ['v1', 'v2', 'v3'], inView = false, kept = '', realReveal = false, offline = false } = {}) {
  let now = 0;
  world.time = () => EPOCH + now;
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
    inView,
    timeline: { currentTime: 0 },
    motions: [],
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
  if (inView) document.documentElement.setAttribute('data-drip-shown', '');
  document.body = new FakeElement(document, 'body');
  /** @type {Map<string, string>} */
  const session = new Map(kept ? [['drip-kept', kept]] : []);
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
  for (const entry of grid) {
    const [kind, id] = entry.includes(':') ? entry.split(':') : ['video', entry];
    const item = new FakeElement(document, 'ytd-rich-item-renderer');
    const link = new FakeElement(document, 'a');
    link.setAttribute('href', `/watch?v=${id}`);
    const title = new FakeElement(document, 'span');
    title.setAttribute('id', 'video-title');
    title.textContent = `Video ${id}`;
    link.append(title);
    item.append(link);
    gridMarks(document, item, kind);
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
    /** navigator.onLine reads this, so a test can drop the connection mid-way. */
    offline,
    document, location, world, errors, browse, runtime,
    flights: () => document.motions.filter((m) => m.classes.includes('drip-deal is-flying')),
    morphs: () => document.motions.filter((m) => m.el.parentElement?.classList.contains('drip-blobs')),
    /** What home.js logged with console.error. @type {any[][]} */
    logged: [],
    /** @type {any[]} */
    reveals: [],
    /** The card the animation stub dealt, which home.js draws for real once the animation is done. @type {any} */
    dealt: null,
    /** Each landing the counter played, with the drop count shown just before it. @type {any[]} */
    landings: [],
    /** Full-stash lists built, and the ones placed by their button. @type {any[]} */
    pickers: [],
    /** @type {any[]} */
    placed: [],
    /** Every number the drop count was set to, in order. @type {number[]} */
    dropsShown: [],
    /** The drop count on the page. */
    drops: () => Number(document.querySelector('.drip-count .drip-num')?.textContent ?? NaN),
  };

  /** @type {any} */
  const context = {
    document, location, console: { ...console, error: (/** @type {any[]} */ ...args) => tab.logged.push(args) }, JSON, Math, Number, String, Boolean, Set, Map, WeakMap, Array, Object, Promise, Error,
    URL, URLSearchParams, structuredClone, navigator: { userAgent: 'test', get onLine() { return !tab.offline; }, clipboard: { writeText: async () => {} } },
    CSS: { escape: (/** @type {string} */ s) => s.replace(/["\\]/g, '\\$&') },
    innerHeight: 900,
    matchMedia: () => ({ matches: reduced }),
    getComputedStyle: () => ({ backgroundColor: '#272727' }),
    requestAnimationFrame: (fn) => addTimer(() => fn(now), 16, 0),
    performance: { now: () => now },
    Date: class extends Date { static now() { return EPOCH + now; } },
    sessionStorage: {
      getItem: (/** @type {string} */ k) => session.get(k) ?? null,
      setItem: (/** @type {string} */ k, /** @type {string} */ v) => { session.set(k, String(v)); },
      removeItem: (/** @type {string} */ k) => { session.delete(k); },
    },
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
    DripSwap: {
      // Progress shows in the meta line and the bar, as in swap.js, so playing a stashed video redraws its row.
      leftSec: () => 0, meta: (/** @type {any} */ v) => (v.resumeSec ? `${v.resumeSec}s in` : ''), fraction: (/** @type {any} */ v) => (v.resumeSec ? 0.2 : 0),
      bar: () => null, note: () => null, UNDO_MS: 5000,
      // Records each list built and each one placed, so a test can see the one on the page is the one placed.
      picker: () => { const el = h('div', { class: 'drip-swap' }, h('ul', { class: 'drip-swap-list' })); tab.pickers.push(el); return el; },
      place: (/** @type {any} */ el) => {
        tab.placed.push(el);
        el.classList.add('is-placed', 'is-above');
        el.querySelector('.drip-swap-list').style.maxHeight = '180px';
      },
    },
    DripPour: { pour: async () => {} },
    DripCounter: {
      num: (/** @type {number} */ n) => h('span', { class: 'drip-num' }, String(n)),
      value: (/** @type {any} */ el) => Number(el.textContent),
      to: (/** @type {any} */ el, /** @type {number} */ n) => {
        if (el === document.querySelector('.drip-count .drip-num')) tab.dropsShown.push(n);
        el.textContent = String(n);
      },
      // Records what lands and lets it all in at once, as the real one does by the end.
      land: async (/** @type {any} */ o) => {
        tab.landings.push({ kind: o.kind, drops: o.drops.add, cards: o.cards ? o.cards.add : 0, shownBefore: tab.drops() });
        const hook = world.duringLand;
        if (hook) await hook(o);
        await o.drops.release(o.drops.add);
        if (o.cards) await o.cards.release(o.cards.add);
      },
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
      revealEmpty: async (/** @type {any} */ o) => {
        tab.reveals.push('revealEmpty');
        await o.find();
        return false;
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
  for (const file of ['lib/state.js', 'lib/morph.js', 'content/common.js', ...(realReveal ? ['content/reveal.js'] : []), 'content/home.js']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), context, { filename: file });
    if (file === 'content/reveal.js') {
      for (const name of ['reveal', 'revealEmpty', 'next']) {
        const run = context.DripReveal[name];
        context.DripReveal[name] = (o) => { tab.reveals.push(name); return run(o); };
      }
    }
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
    /** Moves the clock on without running the timers in between, as a tab left alone does. @param {number} ms */
    skip(ms) {
      now += ms;
      for (const t of timers.values()) t.at = Math.max(t.at, now);
    },
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

/** Reveals a card and confirms Block through its menu. @param {any} tab */
async function blockCard(tab) {
  await tab.click('reveal');
  await loadPicture(tab);
  await tab.advance(100);
  await tab.click('card-more');
  await tab.click('block');
  await tab.advance(300);
  await tab.click('block');
}

/** @type {{name: string, setup: (s: any) => void, priced: boolean}[]} */
const stashPrices = [
  { name: 'a drop will be bought', setup: (s) => {}, priced: true },
  { name: 'minutes remain', setup: (s) => { s.watchSecondsLeft = 60; }, priced: false },
  { name: 'the clock is off', setup: (s) => { s.settings.clock = false; }, priced: false },
  { name: 'the video is unlocked', setup: (s) => { s.unlocked = ['s1']; }, priced: false },
  { name: 'no drops remain', setup: (s) => { s.tokens.watch = 0; }, priced: false },
];
for (const { name, setup, priced } of stashPrices) {
  test(`a Stash link announces its price only when it costs a drop: ${name}`, async () => {
    const world = makeWorld();
    world.state.backlog = [{ id: 's1', title: 'Stashed one', channel: 'C', length: '10:00' }];
    setup(world.state);
    const tab = await makeTab(world);
    if (!tab.button('play-s1')) await tab.click('saved-head');
    const link = tab.button('play-s1');
    assert.ok(link);
    assert.equal(link.textContent.includes(', costs 1 drop'), priced);
    if (priced) {
      const price = link.querySelector('.drip-sr');
      assert.equal(price.getAttribute('aria-hidden'), null, 'the price is available to screen readers');
      await tab.click('play-s1');
      assert.equal(world.state.tokens.watch, 3, 'activating the priced link buys one drop');
    }
  });
}

test('a normal reveal starts the original deal and goo morph before the worker answers', async () => {
  const world = makeWorld();
  const tab = await makeTab(world, { reduced: false, realReveal: true });
  let release;
  world.hold = new Promise((r) => { release = r; });
  await tab.click('reveal');
  assert.deepEqual(tab.reveals, ['reveal'], 'calls the original choreography');
  assert.equal(world.count('reveal'), 1);
  assert.equal(world.state.current, null, 'the video is not found yet');
  assert.equal(tab.flights().length, 1);
  assert.equal(tab.flights()[0].options.duration, 640);
  const morphs = tab.morphs();
  assert.equal(morphs.length, 3, 'all three goo pills form while the card is being dealt');
  assert.ok(morphs.every((m) => m.options.duration === 950));
  assert.ok(morphs.every((m) => m.frames[1].offset === 0.4 && m.frames[2].offset === 0.8));
  const opening = tab.document.motions.find((m) => m.classes === 'drip-open-body');
  assert.equal(opening.options.duration, 560);
  assert.equal(opening.frames[0].paddingBottom, '0px');
  assert.equal(opening.frames.at(-1).paddingBottom, '16px');
  world.hold = null;
  release();
  await settle();
  await loadPicture(tab);
  await tab.advance(100);
  assert.equal(tab.cardTitle(), 'Video v1');
  assert.equal(world.state.tokens.rec, 9);
  assert.equal(tab.morphs().length, 3, 'the controls do not morph again after finding the video');
  assert.deepEqual(tab.errors, []);
});

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

  for (const mode of ['Full drip', 'Curated']) {
    for (const signedOut of [true, false]) {
      test(`an empty feed holds its space in ${mode}, signed ${signedOut ? 'out' : 'in'} (${how})`, async () => {
        const world = makeWorld();
        if (mode === 'Curated') Object.assign(world.state.settings, { clock: false, cards: 'unlimited' });
        const tab = await makeTab(world, { reduced, grid: [], realReveal: true });
        addFeedNudge(tab.browse.querySelector('#primary'));
        const href = 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F';
        if (signedOut) {
          const masthead = tab.document.createElement('ytd-masthead');
          const link = tab.document.createElement('a');
          link.setAttribute('href', href);
          link.textContent = 'Sign in';
          masthead.append(link);
          tab.document.body.prepend(masthead);
        }
        const before = structuredClone(world.state);
        await tab.click('reveal');
        await tab.advance(100);
        const space = tab.root().querySelector('.drip-feed-space.is-empty');
        assert.ok(space, 'the dashed state holds the loaded body');
        assert.equal(tab.root().querySelector('.drip-page').classList.contains('is-open'), true);
        assert.equal(space.querySelector('h2').textContent, signedOut ? "You're signed out of YouTube." : 'Your YouTube watch history is off.');
        assert.equal(space.querySelector('p').textContent, signedOut ? "YouTube only recommends videos when you're signed in." : 'YouTube needs it to recommend videos.');
        assert.equal(tab.root().querySelector('[data-k="feed-status"]').textContent,
          `${space.querySelector('h2').textContent} ${space.querySelector('p').textContent}`, 'a screen reader hears why');
        assert.equal(tab.flights().length, !reduced && mode === 'Full drip' ? 2 : 0, 'one deal and one return, or no flight');
        assert.equal(tab.morphs().length, 0, 'a pre-checked empty feed never morphs the buttons');
        assert.deepEqual(tab.reveals, !reduced && mode === 'Full drip' ? ['revealEmpty'] : []);
        const action = space.querySelector('a');
        assert.equal(action.textContent, signedOut ? 'Sign in' : 'Turn on watch history');
        assert.equal(action.href, signedOut ? href : 'https://www.youtube.com/feed/history');
        assert.equal(space.querySelector('.drip-card').getAttribute('aria-hidden'), 'true');
        assert.doesNotMatch(space.textContent, /card|drop|refresh|report/i);
        assert.equal(tab.document.getElementById('drip-broken'), null);
        assert.deepEqual(world.state, before, 'no card, drop, or reveal log charged');
        assert.equal(world.count('reveal'), 0, 'the worker was never asked to spend');
        assert.equal(tab.document.querySelector('iframe'), null);
        assert.equal(tab.button('pass'), null);
        assert.equal(tab.button('next'), null);
        assert.equal(tab.button('save'), null);
        assert.match(tab.button('reveal').textContent, /Reveal video/);
        assert.equal(tab.button('reveal').hasAttribute('disabled'), false);
        if (mode === 'Full drip') assert.match(tab.button('add').textContent, /\+15m/);
        else {
          assert.equal(tab.button('add'), null);
          assert.doesNotMatch(tab.button('reveal').textContent, /card/);
          assert.deepEqual(tab.reveals, [], 'Curated never deals a card');
        }

        action.focus();
        const flights = tab.flights().length;
        world.state.watchSecondsLeft = 599;
        for (const fn of world.listeners) fn({ drip: { newValue: structuredClone(world.state) } }, 'local');
        await tab.advance(2000);
        assert.equal(tab.root().querySelector('.drip-feed-space'), space, 'redraw keeps the box');
        assert.equal(tab.button('feed-action'), action, 'redraw keeps the link and focus');
        assert.equal(tab.document.activeElement, action);
        assert.equal(tab.flights().length, flights, 'ticks never replay the flight');

        await tab.click('reveal');
        await tab.advance(100);
        assert.ok(tab.root().querySelector('.drip-feed-space.is-empty'), 'a repeated empty read returns to the note');
        assert.equal(tab.flights().length, flights * 2, 'only a new press deals and returns another card');
        assert.equal(world.count('reveal'), 0);

        // The next press enters the normal loading state and reads again, as after signing in.
        tab.browse.querySelector('ytd-feed-nudge-renderer').remove();
        await tab.click('reveal');
        assert.equal(tab.root().querySelector('.drip-feed-note'), null, 'the old note gives way to loading');
        assert.ok(tab.root().querySelector('.drip-card.is-loading'));
        assert.match(tab.root().textContent, /Finding a video…/);
        const item = tab.document.createElement('ytd-rich-item-renderer');
        const link = tab.document.createElement('a');
        link.setAttribute('href', '/watch?v=retry');
        const title = tab.document.createElement('h3');
        title.textContent = 'Video after sign in';
        link.append(title);
        item.append(link);
        tab.browse.querySelector('#primary').append(item);
        await tab.advance(400);
        await loadPicture(tab);
        await tab.advance(100);
        assert.equal(world.count('reveal'), 1, 'a later Reveal reads the feed again');
        assert.equal(world.state.current.id, 'retry');
        assert.equal(tab.root().querySelector('.drip-feed-space'), null);
        assert.deepEqual(tab.errors, []);
      });
    }
  }

  for (const signedOut of [true, false]) {
    test(`Reveal next keeps the current card and explains the empty feed, signed ${signedOut ? 'out' : 'in'} (${how})`, async () => {
      const world = makeWorld();
      const tab = await makeTab(world, { reduced, realReveal: true });
      await tab.click('reveal');
      await loadPicture(tab);
      await tab.advance(100);
      assert.equal(tab.cardTitle(), 'Video v1');
      const before = structuredClone(world.state);
      for (const item of tab.browse.querySelectorAll('ytd-rich-item-renderer')) item.remove();
      addFeedNudge(tab.browse.querySelector('#primary'));
      if (signedOut) {
        const masthead = tab.document.createElement('ytd-masthead');
        const link = tab.document.createElement('a');
        link.setAttribute('href', 'https://accounts.google.com/ServiceLogin?service=youtube');
        masthead.append(link);
        tab.document.body.prepend(masthead);
      }

      await tab.click('next');
      await tab.advance(400);
      assert.equal(tab.cardTitle(), 'Video v1');
      assert.equal(tab.message(), signedOut
        ? "You're signed out of YouTube, so there's nothing new."
        : "Your YouTube watch history is off, so there's nothing new.");
      assert.equal(tab.root().querySelector('.drip-feed-space'), null);
      assert.equal(tab.button('next').hasAttribute('disabled'), false);
      assert.deepEqual(world.state, before, 'the failed read spends nothing and keeps the card');
      assert.equal(world.count('revealNext'), 0);
      assert.deepEqual(tab.errors, []);
    });
  }

  for (const dry of [false, true]) {
    test(`the out view replaces an empty feed when ${dry ? 'Dry hours begin' : 'minutes and drops run out'} in another tab (${how})`, async () => {
      const world = makeWorld();
      const tab = await makeTab(world, { reduced, grid: [], realReveal: true });
      addFeedNudge(tab.browse.querySelector('#primary'));
      await tab.click('reveal');
      await tab.advance(100);
      assert.ok(tab.root().querySelector('.drip-feed-space.is-empty'));

      if (dry) dryAtNoon(world);
      else {
        world.state.tokens.watch = 0;
        world.state.watchSecondsLeft = 0;
      }
      for (const fn of world.listeners) fn({ drip: { newValue: structuredClone(world.state) } }, 'local');
      await tab.advance(2000);

      assert.ok(tab.root().querySelector('.drip-page.is-out'));
      assert.ok(tab.root().querySelector('.drip-out-sea'));
      assert.match(tab.root().textContent, dry ? /Dry hours\./ : /You're out for today\./);
      assert.equal(tab.root().querySelector('.drip-feed-space'), null);
      assert.equal(tab.button('reveal'), null);
      assert.equal(tab.button('add'), null);
      assert.equal(world.count('reveal'), 0);
      assert.deepEqual(tab.errors, []);
    });
  }

  test(`no videos and no nudge still show the broken-grid banner (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced, grid: [], realReveal: true });
    await tab.click('reveal');
    await tab.advance(40000);
    const banner = tab.document.getElementById('drip-broken');
    assert.ok(banner);
    assert.match(banner.textContent, /YouTube probably changed its page, and drip needs an update/);
    assert.match(banner.textContent, /Send report/);
    assert.match(tab.message(), /Try again after a refresh/);
    assert.equal(world.state.tokens.rec, 10);
    assert.equal(world.count('reveal'), 0);
  });

  test(`offline, drip's note takes the place of Reveal and +15m (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced, grid: [], offline: true });
    await tab.advance(1000);
    assert.match(tab.root().querySelector('.drip-offline').textContent, /You're offline\./);
    assert.equal(tab.button('reveal'), null);
    assert.equal(tab.button('add'), null);
    assert.equal(tab.document.getElementById('drip-broken'), null);
  });

  test(`YouTube's offline message brings drip's note, and Retry presses YouTube's (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced, grid: [] });
    assert.ok(tab.button('reveal'));
    const promo = tab.document.createElement('ytd-background-promo-renderer');
    promo.setAttribute('icon-name', 'offline-no-content:OFFLINE_NO_CONTENT');
    const retry = tab.document.createElement('button');
    let pressed = 0;
    retry.addEventListener('click', () => { pressed++; });
    promo.append(retry);
    tab.browse.querySelector('#primary').append(promo);
    await tab.advance(600);
    assert.ok(tab.root().querySelector('.drip-offline'));
    assert.equal(tab.button('reveal'), null);
    await tab.click('retry');
    assert.equal(pressed, 1);
    // Retry worked: YouTube takes its message away, and Reveal comes back on the next check.
    promo.remove();
    await tab.advance(600);
    assert.equal(tab.root().querySelector('.drip-offline'), null);
    assert.ok(tab.button('reveal'));
  });

  test(`Reveal next while offline says so and asks for no report (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced, realReveal: true });
    await tab.click('reveal');
    await loadPicture(tab);
    await tab.advance(100);
    assert.equal(tab.cardTitle(), 'Video v1');
    const cards = world.state.tokens.rec;
    for (const item of tab.browse.querySelectorAll('ytd-rich-item-renderer')) item.remove();
    tab.offline = true;
    await tab.click('next');
    await tab.advance(40000);
    assert.equal(tab.document.getElementById('drip-broken'), null);
    assert.match(tab.message(), /You're offline\. No card spent\./);
    assert.equal(tab.cardTitle(), 'Video v1');
    assert.equal(world.state.tokens.rec, cards);
  });

  for (const staleGrid of [false, true]) {
    test(`the hidden home frame's nudge shows the empty-feed note with ${staleGrid ? 'already-seen videos' : 'a loading grid'} (${how})`, async () => {
      const world = makeWorld();
      if (staleGrid) world.state.seen.push('v1');
      const tab = await makeTab(world, { reduced, grid: staleGrid ? ['v1'] : [], realReveal: true });
      const before = structuredClone(world.state);
      await tab.click('reveal');
      assert.deepEqual(tab.reveals, reduced ? [] : ['reveal'], 'the pre-check cannot know this feed is empty');
      assert.equal(tab.morphs().length, reduced ? 0 : 3, 'normal forward morph starts before the feed read completes');
      await tab.advance(6100);
      const frame = tab.document.querySelector('iframe');
      assert.ok(frame);
      const browse = new FakeElement(tab.document, 'ytd-browse');
      browse.setAttribute('page-subtype', 'home');
      addFeedNudge(browse);
      const html = new FakeElement(tab.document, 'html');
      html.append(browse);
      frame.contentDocument = { querySelector: (sel) => html.querySelector(sel) };
      frame.dispatchEvent({ type: 'load' });
      await tab.advance(100);
      assert.equal(tab.document.getElementById('drip-broken'), null);
      assert.match(tab.root().querySelector('.drip-feed-note').textContent, /Your YouTube watch history is off/);
      assert.doesNotMatch(tab.message(), /cards?|drops?|refresh|report|update/i);
      assert.equal(world.state.tokens.rec, 10);
      assert.deepEqual(world.state, before, 'no card, drop, or history entry spent');
      assert.equal(tab.flights().length, reduced ? 0 : 2, 'deals and returns the card');
      const morphs = tab.morphs();
      assert.equal(morphs.length, reduced ? 0 : 6, 'forward and backward goo, or no morph with reduced motion');
      assert.ok(morphs.slice(3).every((m) => m.options.duration === 950 && m.frames[1].offset === 0.5), 'reuses the pass morph backwards');
      assert.equal(tab.root().querySelector('.drip-page').classList.contains('is-open'), true);
      assert.ok(tab.root().querySelector('.drip-feed-space.is-empty'));
      assert.match(tab.button('reveal').textContent, /Reveal video/);
      assert.match(tab.button('add').textContent, /\+15m/);
      assert.equal(tab.button('next'), null);
      assert.equal(tab.button('pass'), null);
      assert.equal(tab.button('save'), null);
      assert.equal(tab.document.motions.some((m) => m.classes === 'drip-open-body' && m.frames.at(-1).paddingBottom === '0px'), false, 'the body never closes and the row keeps its position');
      assert.equal(world.count('reveal'), 0);
      assert.equal(tab.document.querySelector('iframe'), null, 'the frame is removed after reading the nudge');
      assert.deepEqual(tab.errors, []);
    });
  }

  test(`the empty-feed nudge is recognized by its tag in another language (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced, grid: [] });
    addFeedNudge(tab.browse.querySelector('#primary'));
    tab.browse.querySelector('#title').textContent = 'Recherchez des vidéos pour commencer';
    tab.browse.querySelector('#subtitle').textContent = 'Regardez des vidéos pour obtenir des recommandations.';
    await tab.click('reveal');
    await tab.advance(100);
    assert.equal(tab.document.getElementById('drip-broken'), null);
    assert.match(tab.root().querySelector('.drip-feed-note').textContent, /Your YouTube watch history is off/);
    assert.equal(world.state.tokens.rec, 10);
  });

  test(`a nudge beside videos still lets Reveal deal a video (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced, realReveal: true });
    addFeedNudge(tab.browse.querySelector('#primary'));
    await tab.click('reveal');
    await loadPicture(tab);
    await tab.advance(100);
    assert.equal(world.state.tokens.rec, 9);
    assert.equal(tab.cardTitle(), 'Video v1');
    assert.equal(tab.message(), '');
    assert.equal(tab.document.getElementById('drip-broken'), null);
    assert.deepEqual(tab.reveals, reduced ? [] : ['reveal']);
    assert.equal(tab.morphs().length, reduced ? 0 : 3);
  });

  test(`Block in the card's ⋯ menu takes two clicks, then keeps the blocked card until Reveal next (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced });
    for (const [i, item] of tab.browse.querySelectorAll('ytd-rich-item-renderer').entries()) {
      const channel = new FakeElement(tab.document, 'span');
      channel.className = 'ytContentMetadataViewModelMetadataText';
      channel.textContent = `Channel ${i}`;
      item.prepend(channel);
    }
    await tab.click('reveal');
    await loadPicture(tab);
    await tab.advance(100);
    const channel = world.state.current.channel;
    assert.ok(channel);
    assert.equal(tab.button('block'), null, 'Block is in the menu, not on the card');
    await tab.click('card-more');
    assert.equal(tab.button('block').getAttribute('aria-label'), `Block ${channel}`);
    await tab.click('block');
    assert.match(tab.button('block').getAttribute('class'), /is-armed/);
    assert.equal(tab.button('block').getAttribute('aria-label'), `Click again to block ${channel}`);
    assert.equal(world.state.channels.block.length, 0, 'one click blocks nothing');
    await tab.advance(3000);
    assert.doesNotMatch(tab.button('block').getAttribute('class'), /is-armed/, 'the first click is forgotten after 3 seconds');
    await tab.click('block');
    await tab.click('block', 2);
    assert.equal(world.state.channels.block.length, 0, 'a double-click is one click, not two choices');
    await tab.advance(300);
    await tab.click('block', 3);
    await tab.advance(100);
    assert.deepEqual(world.state.channels.block, [{ ids: [], name: channel }], 'a later click blocks, even one the browser counts as a double-click');
    assert.equal(world.state.current, null);
    assert.equal(world.state.tokens.rec, 9);
    assert.equal(world.state.log[world.state.day].passed, 1);
    assert.equal(tab.message(), '');
    assert.ok(tab.card().classList.contains('is-blocked'));
    assert.equal(tab.cardTitle(), 'Video v1');
    assert.match(tab.card().textContent, /is blocked/);
    assert.equal(tab.button('watch'), null);
    assert.equal(tab.button('card-more'), null);
    assert.equal(tab.button('save'), null);
    assert.equal(tab.button('pass'), null);
    assert.ok(tab.button('next'));
    assert.ok(tab.document.activeElement === tab.button('next'), 'focus moves to Reveal next');
    await tab.click('next');
    await loadPicture(tab);
    await tab.advance(100);
    assert.equal(world.state.tokens.rec, 8, 'Reveal next spends one card');
    assert.ok(!tab.card().classList.contains('is-blocked'));
    assert.ok(tab.button('watch'));
    if (!reduced) assert.equal(tab.reveals.at(-1), 'reveal', 'starts the empty page reveal');
  });

  test(`× on a blocked card puts it away with nothing spent, and Reveal video is back (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced });
    await blockCard(tab);
    await tab.advance(100);
    assert.ok(tab.card().classList.contains('is-blocked'));
    const rec = world.state.tokens.rec;
    await tab.click('close');
    await tab.advance(100);
    assert.equal(tab.root().querySelector('.drip-card'), null, 'the card is gone');
    assert.ok(tab.button('reveal'), 'the empty page is back');
    assert.equal(world.state.tokens.rec, rec, 'nothing spent');
    assert.ok(tab.document.activeElement === tab.button('reveal'), 'focus goes to Reveal video');
  });

  for (const close of ['Escape', 'outside']) {
    test(`the card menu opens again after ${close} (${how})`, async () => {
      const tab = await makeTab(makeWorld(), { reduced });
      await tab.click('reveal');
      await loadPicture(tab);
      await tab.advance(100);
      const card = tab.card();
      await tab.click('card-more');
      assert.equal(tab.document.activeElement, tab.button('block'));
      if (close === 'Escape') {
        tab.button('block').dispatchEvent({ type: 'keydown', key: 'Escape' });
        assert.equal(tab.document.activeElement, tab.button('card-more'));
      } else tab.document.dispatchEvent({ type: 'pointerdown', target: tab.document.body });
      assert.equal(tab.button('block'), null);
      assert.equal(tab.button('card-more').getAttribute('aria-expanded'), 'false');
      await tab.click('card-more');
      assert.ok(tab.button('block'));
      assert.ok(!tab.button('block').classList.contains('is-armed'));
      assert.ok(tab.card() === card, 'opening and closing keep the card');
    });
  }

  test(`arming and disarming Block keep the card and menu elements (${how})`, async () => {
    const tab = await makeTab(makeWorld(), { reduced });
    await tab.click('reveal');
    await loadPicture(tab);
    await tab.advance(100);
    await tab.click('card-more');
    const card = tab.card();
    const thumb = card.querySelector('.drip-thumb');
    const menu = card.querySelector('.drip-menu');
    const block = tab.button('block');
    await tab.click('block');
    assert.ok(tab.card().querySelector('.drip-thumb') === thumb);
    assert.ok(tab.card() === card, 'arming does not rebuild the card');
    assert.ok(tab.card().querySelector('.drip-menu') === menu);
    assert.ok(tab.document.activeElement === block);
    await tab.advance(3000);
    assert.ok(tab.card() === card);
    assert.ok(tab.button('block') === block);
    assert.ok(tab.card().querySelector('.drip-menu') === menu, 'disarming keeps the menu animation from replaying');
    assert.ok(tab.document.activeElement === block);
  });

  test(`the blocked card survives redraws and its thumbnail cannot Watch (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced });
    await blockCard(tab);
    await tab.click('saved-head');
    assert.ok(tab.card().classList.contains('is-blocked'));
    assert.equal(tab.card().querySelectorAll('.drip-blocked-chip').length, 1);
    const thumb = tab.card().querySelector('.drip-thumb');
    assert.equal(thumb.getAttribute('href'), null);
    thumb.click();
    await settle();
    assert.equal(world.count('resolve'), 1, 'only Block was sent');
    assert.equal(tab.location.assigned.length, 0);
  });

  for (const clear of ['reload', 'navigation', 'current card']) {
    test(`the blocked card clears on ${clear} (${how})`, async () => {
      const world = makeWorld();
      const tab = await makeTab(world, { reduced });
      await blockCard(tab);
      if (clear === 'reload') {
        const fresh = await makeTab(world, { reduced });
        assert.equal(fresh.card(), null);
        assert.ok(fresh.button('reveal'));
      } else if (clear === 'navigation') {
        tab.document.dispatchEvent({ type: 'yt-navigate-start' });
        tab.document.dispatchEvent({ type: 'yt-navigate-finish' });
        assert.equal(tab.card(), null);
        assert.ok(tab.button('reveal'));
      } else {
        // The same video can return after a reset and an unblock. Its cached picture must work normally again.
        world.state.channels.block = [];
        world.state.current = { id: 'v1', title: 'Video v1', channel: 'Channel' };
        for (const fn of world.listeners) fn({ drip: { newValue: structuredClone(world.state) } }, 'local');
        assert.ok(!tab.card().classList.contains('is-blocked'));
        assert.equal(tab.card().querySelector('.drip-blocked-chip'), null);
        assert.equal(tab.card().querySelector('.drip-thumb').getAttribute('href'), '/watch?v=v1');
        assert.ok(tab.button('watch'));
      }
    });
  }

  test(`a failed block keeps the playable card (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced });
    await tab.click('reveal');
    await loadPicture(tab);
    await tab.advance(100);
    await tab.click('card-more');
    await tab.click('block');
    await tab.advance(300);
    world.failNext = 'write';
    await tab.click('block');
    assert.ok(!tab.card().classList.contains('is-blocked'));
    assert.ok(tab.button('watch'));
    assert.equal(world.state.current.id, 'v1');
    assert.equal(world.state.channels.block.length, 0);
    assert.match(tab.message(), /Something went wrong/);
  });

  test(`a pending block cannot restore its card after navigation (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced });
    await tab.click('reveal');
    await loadPicture(tab);
    await tab.advance(100);
    await tab.click('card-more');
    await tab.click('block');
    await tab.advance(300);
    let release = () => {};
    world.hold = new Promise((resolve) => { release = () => resolve(undefined); });
    await tab.click('block');
    tab.document.dispatchEvent({ type: 'yt-navigate-start' });
    release();
    await settle();
    tab.document.dispatchEvent({ type: 'yt-navigate-finish' });
    assert.equal(world.state.channels.block.length, 1);
    assert.equal(tab.card(), null);
    assert.ok(tab.button('reveal'));
  });

  test(`a state redraw preserves the open and armed menu (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced });
    await tab.click('reveal');
    await loadPicture(tab);
    await tab.advance(100);
    await tab.click('card-more');
    await tab.click('block');
    world.state.tokens.watch--;
    for (const fn of world.listeners) fn({ drip: { newValue: structuredClone(world.state) } }, 'local');
    assert.ok(tab.button('block').classList.contains('is-armed'));
    assert.equal(tab.button('card-more').getAttribute('aria-expanded'), 'true');
    assert.ok(tab.document.activeElement === tab.button('block'));
    await tab.advance(3000);
    assert.ok(!tab.button('block').classList.contains('is-armed'));
  });

  test(`a minute ticking down keeps every control and an open menu, and changes only the minutes (${how}, Codex 2026-11-05)`, async () => {
    const world = makeWorld();
    world.state.watchSecondsLeft = 15 * 60;
    world.state.backlog = [{ id: 's1', title: 'Stashed one', channel: 'C', length: '10:00' }];
    const tab = await makeTab(world, { reduced });
    await tab.click('reveal');
    await loadPicture(tab);
    await tab.advance(100);
    // With a card up, the stash folds to its header; open it so its rows are there too.
    await tab.click('saved-head');
    await tab.click('card-more');
    const keys = ['watch', 'save', 'card-more', 'block', 'saved-head', 'x-s1', 'play-s1'];
    const before = Object.fromEntries(keys.map((k) => [k, tab.button(k)]));
    for (const k of keys) assert.ok(before[k], `no ${k} before`);
    const card = tab.card();
    assert.match(tab.root().textContent, /15m/);
    // Another tab plays a minute.
    world.state.watchSecondsLeft = 14 * 60;
    for (const fn of world.listeners) fn({ drip: { newValue: structuredClone(world.state) } }, 'local');
    await tab.advance(10);
    assert.match(tab.root().textContent, /14m/);
    for (const k of keys) assert.equal(tab.button(k), before[k], `${k} is the same element`);
    assert.equal(tab.card(), card, 'the same card');
    assert.equal(tab.button('card-more').getAttribute('aria-expanded'), 'true', 'the menu is still open');
  });

  test(`a full-stash list rebuilt while open is the one on the page, and placed (${how}, Codex 2026-11-05)`, async () => {
    const world = makeWorld();
    world.state.settings.stashMax = 1;
    world.state.backlog = [{ id: 's1', title: 'Stashed one', channel: 'C', length: '10:00' }];
    const tab = await makeTab(world, { reduced });
    await tab.click('reveal');
    await loadPicture(tab);
    await tab.advance(100);
    await tab.click('save');
    await tab.advance(10);
    const first = tab.root().querySelector('.drip-swap');
    assert.ok(first, 'the list is open');
    // Another tab plays some of the stashed video, so the list is built again with its new progress.
    world.state.backlog[0].resumeSec = 120;
    for (const fn of world.listeners) fn({ drip: { newValue: structuredClone(world.state) } }, 'local');
    await tab.advance(10);
    const live = tab.root().querySelector('.drip-swap');
    assert.notEqual(live, first, 'progress rebuilds the list');
    assert.equal(live, tab.pickers.at(-1), 'the list on the page is the one just built');
    assert.ok(tab.placed.includes(live), 'and it was placed by its button');
    assert.ok(live.classList.contains('is-placed'));
    // An unrelated redraw reuses the cached list, with its scroll and placement intact.
    const list = live.querySelector('.drip-swap-list');
    list.scrollTop = 75;
    const built = tab.pickers.length;
    const placed = tab.placed.length;
    world.state.tokens.rec--;
    for (const fn of world.listeners) fn({ drip: { newValue: structuredClone(world.state) } }, 'local');
    await tab.advance(10);
    assert.equal(tab.pickers.length, built, 'the unchanged list is reused');
    assert.equal(tab.root().querySelector('.drip-swap'), live, 'the cached list stays on the page');
    assert.equal(list.scrollTop, 75, 'its scroll stays put');
    assert.equal(tab.placed.length, placed, 'it does not need placing again');
    assert.ok(live.classList.contains('is-placed'));
    assert.ok(live.classList.contains('is-above'));
    assert.equal(list.style.maxHeight, '180px');
  });

  test(`a kept button runs the handler for what it shows now (${how}, Codex 2026-11-05)`, async () => {
    const world = makeWorld();
    world.state.backlog = [{ id: 's1', title: 'Stashed one', channel: 'C', length: '10:00' }, { id: 's2', title: 'Stashed two', channel: 'C', length: '10:00' }];
    const tab = await makeTab(world, { reduced });
    const head = tab.button('saved-head');
    // The stash list toggles: a kept header's handler has to see the list as it is now, not as first drawn.
    const open = () => tab.root().querySelector('.drip-saved')?.classList.contains('is-open');
    const was = open();
    await tab.click('saved-head');
    assert.equal(open(), !was);
    assert.equal(tab.button('saved-head'), head);
    await tab.click('saved-head');
    assert.equal(open(), was);
  });

  for (const cards of ['limited', 'unlimited']) {
    test(`blocked Reveal next follows ${cards} card price and availability (${how})`, async () => {
      const world = makeWorld();
      world.state.settings.cards = cards;
      world.state.tokens.rec = cards === 'limited' ? 1 : 0;
      const tab = await makeTab(world, { reduced });
      await blockCard(tab);
      assert.equal(tab.button('next').hasAttribute('disabled'), cards === 'limited');
      assert.equal(!!tab.button('next').querySelector('.drip-price'), cards === 'limited');
    });
  }

  test(`a block that leaves no cards puts focus on ×, not the disabled Reveal next (${how})`, async () => {
    const world = makeWorld();
    world.state.tokens.rec = 1;
    const tab = await makeTab(world, { reduced });
    await blockCard(tab);
    await tab.advance(100);
    assert.ok(tab.button('next').hasAttribute('disabled'));
    assert.ok(tab.document.activeElement === tab.button('close'));
  });

  test(`with no minutes or drops, a blocked card's Reveal next is disabled (${how})`, async () => {
    const world = makeWorld();
    const tab = await makeTab(world, { reduced });
    await tab.click('reveal');
    await loadPicture(tab);
    await tab.advance(100);
    world.state.tokens.watch = 0;
    world.state.watchSecondsLeft = 0;
    await tab.click('card-more');
    await tab.click('block');
    await tab.advance(300);
    await tab.click('block');
    await tab.advance(100);
    assert.ok(tab.card().classList.contains('is-blocked'));
    assert.ok(tab.button('next').hasAttribute('disabled'), 'nothing to reveal into: the page behind is out for the day');
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
    assert.equal(tab.logged.length, 1, 'the error is logged');
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

test('a reveal reads what kind each grid item is, and deals only what it may (Q30)', async () => {
  const world = makeWorld();
  const tab = await makeTab(world, { grid: ['upcoming:s1', 'live:l1', 'members:m1', 'streamed:p1', 'video:v1'] });
  await tab.click('reveal');
  await tab.advance(100);
  const sent = world.sent.find((msg) => msg.type === 'reveal');
  assert.deepEqual(Array.from(sent.candidates, (/** @type {any} */ v) => `${v.kind}:${v.id}`), ['upcoming:s1', 'live:l1', 'members:m1', 'streamed:p1', 'video:v1']);
  assert.equal(sent.candidates[4].length, '14:02');
  assert.equal(world.state.current.id, 'v1');
  assert.equal(world.state.tokens.rec, 9);
});

test('a channel named "Streamed ..." does not make its uploads past streams (Q30, Codex 2026-10-16)', async () => {
  const world = makeWorld();
  const tab = await makeTab(world, { grid: ['v1'] });
  const item = tab.browse.querySelector('ytd-rich-item-renderer');
  const channel = new FakeElement(tab.document, 'span');
  channel.className = 'ytContentMetadataViewModelMetadataText';
  channel.textContent = 'Streamed Highlights';
  item.insertBefore(channel, item.firstChild);
  await tab.click('reveal');
  await tab.advance(100);
  const sent = world.sent.find((msg) => msg.type === 'reveal');
  assert.equal(sent.candidates[0].kind, 'video');
  assert.equal(world.state.current.id, 'v1');
});

test('a card with a length is not upcoming, a premiere is upcoming by its text, and the older members badge counts (Q30)', async () => {
  const world = makeWorld();
  const tab = await makeTab(world, { grid: ['premiere:s1', 'members-old:m1', 'attached:v1'] });
  await tab.click('reveal');
  await tab.advance(100);
  const sent = world.sent.find((msg) => msg.type === 'reveal');
  assert.deepEqual(Array.from(sent.candidates, (/** @type {any} */ v) => `${v.kind}:${v.id}`), ['upcoming:s1', 'members:m1', 'video:v1']);
  assert.equal(world.state.current.id, 'v1');
});

test('with streams allowed, a live stream can be dealt (Q30)', async () => {
  const world = makeWorld();
  world.state.settings.streams = true;
  const tab = await makeTab(world, { grid: ['upcoming:s1', 'live:l1', 'video:v1'] });
  await tab.click('reveal');
  await tab.advance(100);
  assert.equal(world.state.current.id, 'l1');
});

test('a grid of only videos a reveal may not deal looks further and spends nothing (Q30)', async () => {
  const world = makeWorld();
  const tab = await makeTab(world, { grid: ['upcoming:s1', 'members:m1', 'live:l1', 'streamed:p1'] });
  await tab.click('reveal');
  // None of these count as new, so it doesn't stop at this grid. It asks the hidden home frame for more, which never
  // loads in the fake page, so the worker hears nothing until that times out.
  await tab.advance(1000);
  assert.equal(world.sent.filter((msg) => msg.type === 'reveal').length, 0, 'it looked further first');
  await tab.advance(35000);
  assert.equal(world.state.current, null);
  assert.equal(world.state.tokens.rec, 10);
  assert.match(tab.message(), /hasn't loaded anything new/);
});

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
  // No number of seconds: the read can take about 30, and the old text promised 15 (AUDIT.md, 2026-10-16).
  assert.match(tab.root().textContent, /Still checking\. Subscriptions can take a while\./);
  assert.doesNotMatch(tab.root().textContent, /\d+ seconds/);
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
  tab.button('add').dispatchEvent({ type: 'keydown', key: 'Enter', repeat: false });
  await tab.advance(100);
  assert.equal(world.count('spendWatch'), 1);
  // The first purchase is done, so only the keydown guard stands in the way of the repeats.
  for (let i = 0; i < 3; i++) tab.button('add').dispatchEvent({ type: 'keydown', key: 'Enter', repeat: true });
  await tab.advance(100);
  assert.equal(world.count('spendWatch'), 1);
  assert.equal(world.state.tokens.watch, 3);
});

test('two presses on +15m before the first is answered buy one drop (reduced motion)', async () => {
  const world = makeWorld();
  const tab = await makeTab(world, { reduced: true });
  /** @type {() => void} */
  let release = () => {};
  world.hold = new Promise((r) => { release = () => r(undefined); });
  // A click, then Enter: separate presses, so neither the double-click guard nor the repeat guard catches the second.
  tab.button('add').click(1);
  tab.button('add').dispatchEvent({ type: 'keydown', key: 'Enter', repeat: false });
  await tab.advance(100);
  world.hold = null;
  release();
  await tab.advance(100);
  assert.equal(world.count('spendWatch'), 1);
  assert.equal(world.state.tokens.watch, 3);
});

test('a second Watch while the watch page loads goes there again without asking the worker', async () => {
  const world = makeWorld();
  world.state.watchSecondsLeft = 600;
  const tab = await makeTab(world, { reduced: true });
  await tab.click('reveal');
  await loadPicture(tab);
  await tab.advance(100);
  await tab.click('watch');
  await tab.advance(100);
  assert.deepEqual(tab.location.assigned, ['/watch?v=v1']);
  // The page is held while it leaves, so the old card and its Watch are still there.
  await tab.click('watch');
  await tab.advance(100);
  assert.equal(world.count('resolve'), 1);
  assert.deepEqual(tab.location.assigned, ['/watch?v=v1', '/watch?v=v1']);
  assert.equal(tab.message(), '');
});

test('a feed read in a tab whose drip was reloaded asks for a refresh, with nothing thrown', async () => {
  const world = makeWorld();
  const tab = await makeTab(world, { reduced: true, grid: [] });
  // What Chrome does to a content script whose extension was reloaded: the id goes, and its APIs throw.
  tab.runtime.id = undefined;
  tab.runtime.getManifest = () => { throw new Error('Extension context invalidated.'); };
  await tab.click('reveal');
  // 6 seconds waiting for the grid, then about 30 for the hidden frame that looks for more.
  await tab.advance(40000);
  assert.equal(world.count('reveal'), 0);
  assert.match(tab.root().textContent, /drip was updated\. Refresh this page\./);
  assert.equal(tab.logged.length, 0);
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

/** Dry hours on around EPOCH (noon): from 11am to 2pm. @param {any} world */
function dryAtNoon(world) {
  Object.assign(world.state.settings, { dryHours: true, dryFrom: 11, dryTo: 14 });
}

test('in Dry hours with no minutes, the home page is out: "Dry hours." and when drops work again (B9)', async () => {
  const world = makeWorld();
  dryAtNoon(world);
  const tab = await makeTab(world);
  const text = tab.root().textContent;
  assert.match(text, /Dry hours\./);
  assert.match(text, /Drops work again at 2:00pm\./);
  assert.doesNotMatch(text, /You're out for today/);
  assert.equal(tab.button('add'), null, 'the out page has no +15m');
});

test('in Dry hours the home page is out even with minutes left, and they come back as drops (Jesse, 2026-11-04)', async () => {
  const world = makeWorld();
  dryAtNoon(world);
  world.state.watchSecondsLeft = 40 * 60;
  world.state.tokens.watch = 2;
  const tab = await makeTab(world);
  await tab.advance(2000);
  assert.match(tab.root().textContent, /Dry hours\./);
  assert.equal(world.state.watchSecondsLeft, 0);
  assert.equal(world.state.tokens.watch, 4, '40 minutes is 2 whole drops back');
  // The fake page has no layout, so the drops never land here: the "2 back" tag is a browser check.
  assert.deepEqual(world.state.dryBack, { until: world.D.dryUntil(world.state, world.time()), watch: 2 });
});

/** Whether a list of numbers never goes down. @param {number[]} list */
const neverDown = (list) => list.every((n, i) => i === 0 || n >= list[i - 1]);

test('"Done for now" into Dry hours lands the kept drops, then "2 back", and the count ends right (Codex, 2026-11-05)', async () => {
  const world = makeWorld();
  dryAtNoon(world);
  world.state.watchSecondsLeft = 40 * 60;
  world.state.tokens.watch = 2;
  // The lock saw 4 drops when "Done for now" was clicked: 2 kept, and 2 back from the 40 minutes.
  const until = world.D.dryUntil(world.state, world.time());
  const tab = await makeTab(world, { inView: true, kept: `4:${until}` });
  await tab.advance(3000);
  assert.deepEqual(tab.landings.map((/** @type {any} */ l) => [l.kind, l.drops]), [['kept', 2], ['back', 2]]);
  assert.equal(tab.drops(), 4);
  assert.equal(world.state.dryBack, null, 'the drops back were marked seen');
  assert.ok(neverDown(tab.dropsShown), `the count went ${tab.dropsShown.join(', ')}`);
});

test('kept drops the lock saved before the drops came back land in full, then "2 back" (Codex, 2026-11-05)', async () => {
  const world = makeWorld();
  dryAtNoon(world);
  world.state.watchSecondsLeft = 40 * 60;
  world.state.tokens.watch = 2;
  // A paused page locks on its own at the start, before any message has handed the drops back.
  const tab = await makeTab(world, { inView: true, kept: '2:0' });
  await tab.advance(3000);
  assert.deepEqual(tab.landings.map((/** @type {any} */ l) => [l.kind, l.drops]), [['kept', 2], ['back', 2]]);
  assert.equal(tab.drops(), 4);
  assert.ok(neverDown(tab.dropsShown), `the count went ${tab.dropsShown.join(', ')}`);
});

test('drops back the page hears of only once the kept drops are falling are in them: one landing, marked seen', async () => {
  const world = makeWorld();
  dryAtNoon(world);
  const until = world.D.dryUntil(world.state, world.time());
  // The worker handed 1 drop back and the lock counted it, but this page's state hasn't heard yet.
  world.state.tokens.watch = 7;
  world.state.drySeen = until;
  /** @type {any} */ (world).duringLand = async () => {
    /** @type {any} */ (world).duringLand = null;
    world.state.dryBack = { until, watch: 1 };
    for (const fn of world.listeners) fn({ drip: { newValue: structuredClone(world.state) } }, 'local');
    await settle();
  };
  const tab = await makeTab(world, { inView: true, kept: `7:${until}` });
  await tab.advance(4000);
  assert.deepEqual(tab.landings.map((/** @type {any} */ l) => [l.kind, l.drops]), [['kept', 7]]);
  assert.equal(tab.drops(), 7);
  assert.equal(world.state.dryBack, null, 'marked seen');
  assert.ok(neverDown(tab.dropsShown), `the count went ${tab.dropsShown.join(', ')}`);
});

test('drops back and the day\'s refill both land, one after the other, and neither gets stuck (Codex, 2026-11-05)', async () => {
  const world = makeWorld();
  dryAtNoon(world);
  world.state.watchSecondsLeft = 40 * 60;
  world.state.tokens.watch = 2;
  world.state.refill = { day: world.state.day, watch: 2, rec: 10 };
  const tab = await makeTab(world, { inView: true });
  await tab.advance(4000);
  assert.deepEqual(tab.landings.map((/** @type {any} */ l) => [l.kind, l.drops]), [['back', 2], ['new', 2]]);
  assert.equal(tab.drops(), 4);
  assert.equal(world.state.dryBack, null);
  assert.equal(world.state.refill, null);
  assert.ok(neverDown(tab.dropsShown), `the count went ${tab.dropsShown.join(', ')}`);
});

test('kept drops with nothing back land once, as before', async () => {
  const world = makeWorld();
  world.state.tokens.watch = 3;
  const tab = await makeTab(world, { inView: true, kept: '3:0' });
  await tab.advance(3000);
  assert.deepEqual(tab.landings.map((/** @type {any} */ l) => [l.kind, l.drops]), [['kept', 3]]);
  assert.equal(tab.drops(), 3);
});

test('in the 5 minutes before Dry hours, +15m is off and the gray line says when they start', async () => {
  const world = makeWorld();
  Object.assign(world.state.settings, { dryHours: true, dryFrom: 13, dryTo: 15 });
  world.state.watchSecondsLeft = 600;
  const tab = await makeTab(world);
  assert.equal(tab.button('add').hasAttribute('disabled'), false);
  tab.skip(56 * 60e3);
  await tab.advance(1000);
  const add = tab.button('add');
  assert.equal(add.hasAttribute('disabled'), true);
  assert.equal(add.getAttribute('title'), 'Dry hours start at 1:00pm.');
  assert.match(tab.root().textContent, /Dry hours start at 1:00pm\./);
});

test('card Watch at 0 minutes in Dry hours shows no price and spends nothing', async () => {
  const world = makeWorld();
  dryAtNoon(world);
  world.state.watchSecondsLeft = 0;
  world.state.current = { id: 'v1', title: 'Title v1', channel: 'Channel', length: '1:00' };
  const tab = await makeTab(world);
  const watch = tab.button('watch');
  assert.ok(watch);
  assert.doesNotMatch(watch.textContent, /-1/);
  await tab.click('watch');
  await tab.advance(100);
  assert.equal(world.state.tokens.watch, 4);
});

test('a +15m that reaches the worker in Dry hours says when they end', async () => {
  const world = makeWorld();
  const tab = await makeTab(world);
  assert.equal(tab.button('add').hasAttribute('disabled'), false);
  // Dry hours turned on in another tab, and this page hasn't heard yet.
  world.state.settings = { ...world.state.settings, dryHours: true, dryFrom: 11, dryTo: 14 };
  await tab.click('add');
  await tab.advance(100);
  assert.equal(world.state.tokens.watch, 4);
  assert.match(tab.message(), /Dry until 2:00pm\./);
});

test('an idle home page changes to its dry form when Dry hours end, with no reload', async () => {
  const world = makeWorld();
  Object.assign(world.state.settings, { dryHours: true, dryFrom: 11, dryTo: 13 });
  const tab = await makeTab(world);
  assert.match(tab.root().textContent, /Dry hours\./);
  tab.skip(3600e3);
  await tab.advance(1000);
  assert.doesNotMatch(tab.root().textContent, /Dry hours\./);
  assert.ok(tab.button('add'), '+15m is back');
  assert.equal(tab.button('add').hasAttribute('disabled'), false);
});

test('with no minutes in the 5 minutes before Dry hours, the out page says when they start, not "out for today"', async () => {
  const world = makeWorld();
  Object.assign(world.state.settings, { dryHours: true, dryFrom: 13, dryTo: 15 });
  const tab = await makeTab(world);
  tab.skip(56 * 60e3);
  await tab.advance(1000);
  const text = tab.root().textContent;
  assert.match(text, /Dry hours at 1:00pm\./);
  assert.match(text, /Drops work again at 3:00pm\./);
  assert.doesNotMatch(text, /out for today/);
});
