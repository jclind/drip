// @ts-check
// morph.js: a page brought up to date in place keeps every node that still matches, so a press, a focus, or an
// animation on it survives (Codex's flicker audit, 2026-11-05).

const test = require('node:test');
const assert = require('node:assert/strict');

class Text {
  /** @param {string} data */
  constructor(data) { this.nodeType = 3; this.data = data; /** @type {El | null} */ this.parentNode = null; }
  remove() { this.parentNode?.removeChild(this); }
}

class El {
  /** @param {string} tag */
  constructor(tag) {
    this.nodeType = 1;
    this.localName = tag;
    /** @type {Map<string, string>} */
    this.attrs = new Map();
    /** @type {any[]} */
    this.childNodes = [];
    /** @type {El | null} */
    this.parentNode = null;
    /** @type {Record<string, Function[]>} */
    this.listeners = {};
    /** How many times this node was taken out of its parent. */
    this.removals = 0;
  }
  get attributes() { return [...this.attrs].map(([name, value]) => ({ name, value })); }
  /** @param {string} k */
  getAttribute(k) { return this.attrs.has(k) ? /** @type {string} */ (this.attrs.get(k)) : null; }
  /** @param {string} k @param {string} v */
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  /** @param {string} k */
  hasAttribute(k) { return this.attrs.has(k); }
  /** @param {string} k */
  removeAttribute(k) { this.attrs.delete(k); }
  /** @param {string} type @param {Function} fn */
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  /** @param {string} type */
  fire(type) { for (const fn of this.listeners[type] || []) fn.call(this, { type }); }
  /** @param {any} node */
  removeChild(node) {
    this.childNodes = this.childNodes.filter((c) => c !== node);
    node.parentNode = null;
    if (node instanceof El) node.removals++;
  }
  /** @param {any} node @param {any} before */
  insertBefore(node, before) {
    node.parentNode?.removeChild(node);
    const i = before ? this.childNodes.indexOf(before) : -1;
    if (i < 0) this.childNodes.push(node);
    else this.childNodes.splice(i, 0, node);
    node.parentNode = this;
  }
  /** @param {...any} kids */
  append(...kids) { for (const k of kids) this.insertBefore(typeof k === 'string' ? new Text(k) : k, null); }
  remove() { this.parentNode?.removeChild(this); }
  get textContent() { return this.childNodes.map((c) => (c instanceof El ? c.textContent : c.data)).join(''); }
}

require('../src/lib/morph.js');
const { morph, listen } = /** @type {any} */ (globalThis).DripMorph;

/** The h() pages use, with handlers through listen(). @param {string} tag @param {Record<string, any>} [attrs] @param {...any} kids */
function h(tag, attrs = {}, ...kids) {
  const el = new El(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false || v === null) continue;
    if (k.startsWith('on')) listen(el, k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...kids.filter((k) => k !== null && k !== undefined && k !== false));
  return el;
}

/** A home-like page with the minutes and two buttons. @param {string} minutes @param {Function} onWatch */
const page = (minutes, onWatch, rows = ['a', 'b']) => h('div', { class: 'page' },
  h('div', { class: 'time' }, minutes),
  h('button', { 'data-k': 'watch', onclick: onWatch }, 'Watch'),
  h('ul', {}, ...rows.map((id) => h('li', { 'data-k': `row-${id}` }, `Video ${id}`))));

test('a minute change patches the label and keeps every button', () => {
  const live = page('12m', () => {});
  const watch = live.childNodes[1];
  const rows = [...live.childNodes[2].childNodes];
  morph(live, page('11m', () => {}));
  assert.equal(live.childNodes[0].textContent, '11m');
  assert.equal(live.childNodes[1], watch, 'the same Watch button');
  assert.equal(watch.removals, 0);
  assert.deepEqual([...live.childNodes[2].childNodes], rows);
});

test('a kept button runs the new view\'s handler, once', () => {
  /** @type {string[]} */
  const calls = [];
  const live = page('12m', () => calls.push('old'));
  const watch = live.childNodes[1];
  morph(live, page('12m', () => calls.push('new')));
  watch.fire('click');
  assert.deepEqual(calls, ['new']);
});

test('keyed rows move with their keys, and only the gone one is removed', () => {
  const live = page('12m', () => {}, ['a', 'b', 'c']);
  const [a, b, c] = live.childNodes[2].childNodes;
  morph(live, page('12m', () => {}, ['c', 'a', 'd']));
  const list = live.childNodes[2].childNodes;
  assert.deepEqual(list.map((/** @type {any} */ el) => el.getAttribute('data-k')), ['row-c', 'row-a', 'row-d']);
  assert.equal(list[0], c);
  assert.equal(list[1], a);
  assert.equal(b.parentNode, null);
});

test('attributes follow the new view: changed, added, and dropped', () => {
  const live = h('div', {}, h('button', { 'data-k': 'x', class: 'b is-busy', 'aria-busy': 'true' }));
  const button = live.childNodes[0];
  morph(live, h('div', {}, h('button', { 'data-k': 'x', class: 'b', title: 'Go' })));
  assert.equal(live.childNodes[0], button);
  assert.equal(button.getAttribute('class'), 'b');
  assert.equal(button.getAttribute('title'), 'Go');
  assert.equal(button.hasAttribute('aria-busy'), false);
});

test('a different key or tag is a new node', () => {
  const live = h('div', {}, h('div', { 'data-k': 'card-a' }, 'A'), h('span', {}, 'x'));
  const [cardA, span] = live.childNodes;
  morph(live, h('div', {}, h('div', { 'data-k': 'card-b' }, 'B'), h('b', {}, 'x')));
  assert.notEqual(live.childNodes[0], cardA);
  assert.equal(live.childNodes[0].getAttribute('data-k'), 'card-b');
  assert.notEqual(live.childNodes[1], span);
  assert.equal(live.textContent, 'Bx');
});

test('a node the view reuses by identity is moved in as it is', () => {
  const glass = h('svg', { class: 'glass', 'data-level': '0.5' });
  const live = h('div', {}, h('div', { class: 'tile' }, glass));
  // The view puts the same glass in its new tree, which takes it out of the live one.
  const next = h('div', {}, h('div', { class: 'tile' }, glass));
  morph(live, next);
  assert.equal(live.childNodes[0].childNodes[0], glass);
  assert.equal(glass.getAttribute('data-level'), '0.5');
});

test('data-morph-keep keeps the live children something else put there', () => {
  const youtubeSearch = h('form', { id: 'yt-search' });
  const live = h('div', {}, h('div', { 'data-k': 'search-slot', 'data-morph-keep': true }, youtubeSearch));
  morph(live, h('div', {}, h('div', { 'data-k': 'search-slot', 'data-morph-keep': true })));
  assert.equal(live.childNodes[0].childNodes[0], youtubeSearch);
});

test('a page that turns into another one entirely ends up exactly like the new view', () => {
  const live = page('12m', () => {});
  const next = h('div', { class: 'page is-out' }, h('p', {}, "You're out for today."), h('button', { 'data-k': 'add' }, '+15m'));
  morph(live, next);
  assert.equal(live.getAttribute('class'), 'page is-out');
  assert.equal(live.textContent, "You're out for today.+15m");
  assert.deepEqual(live.childNodes.map((/** @type {any} */ el) => el.localName), ['p', 'button']);
});

test('data-morph-new is never matched: it goes in fresh, and goes when the next view has a plain one', () => {
  const live = h('button', { 'data-k': 'save' }, h('span', { class: 'row' }, 'Stash'), h('span', { class: 'ghost' }, 'Stashed'));
  const [oldRow, ghost] = live.childNodes;
  // The view built the art in its old state and is animating it to the new one.
  const animating = h('span', { class: 'row', 'data-morph-new': true }, 'Stash');
  morph(live, h('button', { 'data-k': 'save' }, animating, h('span', { class: 'ghost' }, 'Stashed')));
  assert.deepEqual(live.childNodes, [animating, ghost], 'the animated node is on the page, and the ghost is kept');
  assert.equal(oldRow.parentNode, null);
  // The next redraw is plain: the animated node isn't matched to anything, so it doesn't end up in the ghost's place.
  morph(live, h('button', { 'data-k': 'save' }, h('span', { class: 'row' }, 'Stash'), h('span', { class: 'ghost' }, 'Stashed')));
  assert.equal(live.childNodes.length, 2);
  assert.equal(live.childNodes[1], ghost);
  assert.equal(live.childNodes[0].hasAttribute('data-morph-new'), false);
  assert.equal(live.textContent, 'StashStashed');
});
