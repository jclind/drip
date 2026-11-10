// @ts-check
// Search results (search.js) against a real search row captured from YouTube on 2026-11-10, a fake page, and a fake
// worker that runs the real rules. Written from the signed-in test of 2026-11-10, where Stash saved the channel as
// "Wood and Shop Wood and Shop", because the row's ytd-channel-name repeats the name in its tooltip.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');
const NOW = new Date(2026, 10, 10, 12).getTime();

// A selector engine for what search.js asks: tags, #id, .class, [attr], [attr="v"], [attr*="v"], [attr^="v"], and
// descendant and child combinators in comma lists. Copied from home.test.js, without :is and :scope.

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
 * @typedef {{tag: string, id: string, classes: string[], attrs: {name: string, op: string, value: string}[]}} Compound
 * @typedef {{compounds: Compound[], combinators: string[]}} Complex
 */

/** @param {string} s @returns {Compound} */
function parseCompound(s) {
  /** @type {Compound} */
  const c = { tag: '', id: '', classes: [], attrs: [] };
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
  for (const t of splitTop(s.replace(/\s*>\s*/g, ' > '), ' ')) {
    if (t === '>') combinators[compounds.length - 1] = '>';
    else {
      if (compounds.length && combinators.length < compounds.length) combinators.push(' ');
      compounds.push(parseCompound(t));
    }
  }
  return { compounds, combinators };
}

/** @param {string} s @returns {Complex[]} */
const parseList = (s) => splitTop(s, ',').map(parseComplex);

/** @param {FakeElement} el @param {Compound} c */
function matchCompound(el, c) {
  if (c.tag && el.localName !== c.tag) return false;
  if (c.id && el.getAttribute('id') !== c.id) return false;
  const classes = el.className.split(' ');
  if (!c.classes.every((k) => classes.includes(k))) return false;
  return c.attrs.every((a) => {
    const v = el.getAttribute(a.name);
    if (v === null) return false;
    if (a.op === '=') return v === a.value;
    if (a.op === '*=') return v.includes(a.value);
    if (a.op === '^=') return v.startsWith(a.value);
    return true;
  });
}

/** @param {FakeElement} el @param {Complex} cx @param {number} [k] @returns {boolean} */
function matchComplex(el, cx, k = cx.compounds.length - 1) {
  if (!matchCompound(el, cx.compounds[k])) return false;
  if (k === 0) return true;
  if (cx.combinators[k - 1] === '>') return !!el.parent && matchComplex(el.parent, cx, k - 1);
  for (let a = el.parent; a; a = a.parent) if (matchComplex(a, cx, k - 1)) return true;
  return false;
}

class FakeElement {
  /** @param {string} tag */
  constructor(tag) {
    this.localName = tag.toLowerCase();
    this.tagName = tag.toUpperCase();
    /** @type {Map<string, string>} */
    this.attrs = new Map();
    /** @type {(FakeElement | string)[]} */
    this.childNodes = [];
    /** @type {FakeElement | null} */
    this.parent = null;
    Object.defineProperty(this, 'parent', { enumerable: false, writable: true });
    /** @type {Record<string, Function[]>} */
    this.listeners = {};
    this.disabled = false;
    // Every row has a box, as one on screen does.
    this.offsetHeight = 20;
  }
  get className() { return this.attrs.get('class') || ''; }
  set className(v) { this.attrs.set('class', String(v)); }
  get id() { return this.attrs.get('id') || ''; }
  get href() { return this.attrs.get('href') || ''; }
  get parentElement() { return this.parent; }
  get children() { return /** @type {FakeElement[]} */ (this.childNodes.filter((c) => c instanceof FakeElement)); }
  get isConnected() { return true; }
  get dataset() {
    /** @type {Record<string, string>} */
    const data = {};
    for (const [k, v] of this.attrs) if (k.startsWith('data-')) data[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
    return data;
  }
  /** @returns {string} */
  get textContent() { return this.childNodes.map((c) => (c instanceof FakeElement ? c.textContent : c)).join(''); }
  set textContent(v) { this.childNodes = [String(v)]; }
  /** @param {string} k @param {any} v */
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  /** @param {string} k */
  getAttribute(k) { return this.attrs.has(k) ? /** @type {string} */ (this.attrs.get(k)) : null; }
  /** @param {string} k */
  hasAttribute(k) { return this.attrs.has(k); }
  /** @param {string} k */
  removeAttribute(k) { this.attrs.delete(k); }
  /** @param {string} k @param {boolean} [on] */
  toggleAttribute(k, on) { if (on ?? !this.attrs.has(k)) this.attrs.set(k, ''); else this.attrs.delete(k); }
  /** @param {string} type @param {Function} fn */
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() { for (const fn of this.listeners.click || []) fn.call(this, { detail: 1, target: this }); }
  /** @param {...(FakeElement | string)} kids */
  append(...kids) {
    for (const k of kids) {
      if (k instanceof FakeElement) { k.remove(); k.parent = this; }
      this.childNodes.push(k);
    }
  }
  remove() {
    if (this.parent) this.parent.childNodes = this.parent.childNodes.filter((c) => c !== this);
    this.parent = null;
  }
  /** @returns {FakeElement[]} */
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  /** @param {string} sel */
  querySelectorAll(sel) {
    const list = parseList(sel);
    return this.descendants().filter((el) => list.some((cx) => matchComplex(el, cx)));
  }
  /** @param {string} sel */
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  /** @param {string} sel */
  matches(sel) { return parseList(sel).some((cx) => matchComplex(this, cx)); }
}

/** Parses captured markup the way home.test.js parses its fixture, and returns its first element. @param {string} html */
function parse(html) {
  const holder = new FakeElement('div');
  const stack = [holder];
  for (const token of html.replace(/<!--[\s\S]*?-->/g, '').match(/<[^>]+>|[^<]+/g) || []) {
    if (token.startsWith('</')) {
      assert.equal(stack.pop()?.localName, token.slice(2, -1));
    } else if (token.startsWith('<')) {
      const tag = /^<([\w-]+)/.exec(token)?.[1] || '';
      const el = new FakeElement(tag);
      for (const attr of token.matchAll(/([\w-]+)="([^"]*)"/g)) el.setAttribute(attr[1], attr[2]);
      stack[stack.length - 1].append(el);
      stack.push(el);
    } else stack[stack.length - 1].append(token.trim() || ' ');
  }
  assert.equal(stack.length, 1, 'the fixture is balanced');
  return holder.children[0];
}

/** The captured search row. @param {(row: string) => string} [edit] */
function searchRow(edit = (html) => html) {
  return parse(edit(fs.readFileSync(path.join(__dirname, 'fixtures', 'youtube-search-row.html'), 'utf8')));
}

/**
 * Search's filter row, as YouTube wrote it logged out on 2026-11-10 (signed in, Ask YouTube comes first), with style
 * classes and the touch feedback trimmed.
 * @param {string[]} words
 */
function chipRow(words) {
  const chip = (/** @type {string} */ word) => `<yt-chip-cloud-chip-renderer chip-style="STYLE_HOME_FILTER"><div id="chip-shape-container"> <chip-shape class="ytChipShapeHost" role="presentation"><button class="ytChipShapeButtonReset" role="tab" aria-selected="false"><div class="ytChipShapeChip ytChipShapeInactive ytChipShapeOnlyTextPadding"><div class="ytChipShapeText">${word}</div><yt-touch-feedback-shape aria-hidden="true"></yt-touch-feedback-shape></div></button></chip-shape> </div></yt-chip-cloud-chip-renderer>`;
  return parse(`<div id="header"><ytd-search-header-renderer><div id="chip-bar"><yt-chip-cloud-renderer><div id="container"><div id="scroll-container"><iron-selector id="chips" role="tablist">${words.map(chip).join('')}</iron-selector></div></div></yt-chip-cloud-renderer></div></ytd-search-header-renderer></div>`);
}

/**
 * A search page holding one row, running search.js, with a worker that runs the real rules.
 * @param {FakeElement} row
 * @param {FakeElement} [header] The filter row above the results.
 */
function makeSearch(row, header) {
  require('../src/lib/state.js');
  const D = /** @type {any} */ (globalThis).Drip;
  let state = D.initialState(NOW);
  /** @type {any[]} */
  const sent = [];
  const root = new FakeElement('html');
  const search = new FakeElement('ytd-search');
  const primary = new FakeElement('div');
  primary.setAttribute('id', 'primary');
  const section = new FakeElement('ytd-item-section-renderer');
  const contents = new FakeElement('div');
  contents.setAttribute('id', 'contents');
  contents.append(row);
  section.append(contents);
  primary.append(section);
  if (header) search.append(header);
  search.append(primary);
  root.append(search);
  /** search.js's half-second check. @type {Function} */
  let check = () => {};
  const document = {
    documentElement: root,
    /** @param {string} sel */
    querySelector: (sel) => root.querySelector(sel),
    /** @param {string} sel */
    querySelectorAll: (sel) => root.querySelectorAll(sel),
    addEventListener() {},
  };
  /** @param {string} tag @param {Record<string, any>} [attrs] @param {...any} kids */
  const h = (tag, attrs = {}, ...kids) => {
    const el = new FakeElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    el.append(...kids.filter((k) => k !== null && k !== undefined && k !== false));
    return el;
  };
  const context = vm.createContext({
    Drip: D,
    DripUI: {
      h, watchFor() {}, onState() {},
      /** @param {any} msg */
      async send(msg) {
        sent.push(msg);
        if (msg.type !== 'addBacklog') return { ok: true, state };
        const draft = structuredClone(state);
        const res = D.addBacklog(draft, msg.video, msg.index, NOW);
        if (res.ok) state = draft;
        return { ...res, state };
      },
    },
    DripSwap: {},
    document,
    location: { pathname: '/results', search: '?search_query=wood+and+shop+dovetail', origin: 'https://www.youtube.com' },
    URL,
    getComputedStyle: () => ({ display: 'block' }),
    MutationObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: () => 0,
    setInterval: (/** @type {Function} */ fn) => { check = fn; return 0; },
  });
  vm.runInContext(fs.readFileSync(path.join(SRC, 'content/search.js'), 'utf8'), context);
  return {
    D, sent,
    check: () => check(),
    get state() { return state; },
    /** Presses the row's Stash and returns the video it sent. */
    async stash() {
      const button = row.querySelector('.drip-save');
      assert.ok(button, 'the row has a Stash button');
      button.click();
      await new Promise((r) => setImmediate(r));
      const msg = sent.find((m) => m.type === 'addBacklog');
      assert.ok(msg, 'Stash asked the worker');
      return msg.video;
    },
  };
}

test('the captured row repeats the channel name in its tooltip, as YouTube writes it', () => {
  const row = searchRow();
  const names = row.querySelectorAll('ytd-channel-name');
  assert.equal(names.length, 2);
  for (const name of names) assert.equal(name.textContent.replace(/\s+/g, ' ').trim(), 'Wood and Shop Wood and Shop');
});

test('Stash from search saves the channel name once, with its handle', async () => {
  const page = makeSearch(searchRow());
  const video = await page.stash();
  assert.equal(video.channel, 'Wood and Shop');
  // Spread, since the array comes from search.js's own realm.
  assert.deepEqual([...video.channelIds], ['@woodandshop']);
  assert.equal(video.title, 'How to Cut a DOVETAIL JOINT with Hand Tools (Quick Version)');
  assert.equal(video.length, '9:43');
  assert.equal(page.state.backlog[0].channel, 'Wood and Shop');
});

test('a row whose channel name has no link saves the name once, from its text', async () => {
  // Some rows write the name without a link: keep the text, drop the <a>.
  const page = makeSearch(searchRow((html) => html.replace(/<a href="\/@WoodAndShop">Wood and Shop<\/a>/g, 'Wood and Shop')));
  const video = await page.stash();
  assert.equal(video.channel, 'Wood and Shop');
  assert.equal(video.channelIds, undefined);
});

test('a channel blocked by name from a home card matches a video read from search (Q31)', async () => {
  const page = makeSearch(searchRow());
  const video = await page.stash();
  // A home card has only the channel's name, so a block from there has no ids, and the name decides.
  const blocked = { ids: [], name: 'Wood and Shop' };
  assert.equal(page.D.sameChannel(blocked, { ids: video.channelIds || [], name: video.channel }), true);
  const state = page.D.initialState(NOW);
  assert.equal(page.D.blockChannel(state, blocked).ok, true);
  assert.equal(page.D.canDeal(state, video), false, 'a reveal skips it');
});

// The Shorts chip in search's filter row led to a spinner and "No more results" with Hide Shorts on, since early.css
// hides the Shorts it finds (signed in, 2026-11-10).

/** @param {FakeElement} header */
const marked = (header) => header.querySelectorAll('yt-chip-cloud-chip-renderer')
  .filter((c) => c.hasAttribute('data-drip-shorts-chip')).map((c) => c.textContent.replace(/\s+/g, ' ').trim());

test('search marks its Shorts chip and no other, Ask YouTube included', () => {
  const header = chipRow(['Ask YouTube', 'All', 'Shorts', 'Unwatched', 'Watched', 'Videos', 'Recently uploaded', 'Live']);
  makeSearch(searchRow(), header);
  assert.deepEqual(marked(header), ['Shorts']);
});

test('a chip YouTube reuses for another word loses or gains the mark', () => {
  const header = chipRow(['All', 'Shorts', 'Videos']);
  const page = makeSearch(searchRow(), header);
  const [all, shorts] = header.querySelectorAll('.ytChipShapeText');
  shorts.textContent = 'Videos';
  all.textContent = 'Shorts';
  page.check();
  assert.deepEqual(marked(header), ['Shorts']);
  assert.equal(header.querySelectorAll('yt-chip-cloud-chip-renderer')[0].hasAttribute('data-drip-shorts-chip'), true);
});

test('early.css hides the marked chip only while Hide Shorts is on (Q2)', () => {
  const css = fs.readFileSync(path.join(SRC, 'content/early.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /([^{}]+)\{([^}]*)\}/g;
  const hiding = [...css.matchAll(rule)].filter((m) => /display:\s*none/.test(m[2])).flatMap((m) => m[1].split(',').map((s) => s.trim()));
  assert.ok(hiding.includes('html[data-drip-hide-shorts] ytd-search yt-chip-cloud-chip-renderer[data-drip-shorts-chip]'));
  assert.ok(!hiding.some((s) => s.includes('data-drip-shorts-chip') && !s.startsWith('html[data-drip-hide-shorts]')));
});
