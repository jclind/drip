// @ts-check
// The welcome page against a small DOM and the real state rules. Only what a test reads is real: a hidden element
// measures 0, as in Chrome, and the shared helpers from common.js, pour.js, and the rest are stubs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SRC = path.join(__dirname, '..', 'src');

/** What a visible element measures. The stage's real height is its 500px minimum. */
const VISIBLE_PX = 500;

/**
 * Anything at all: every property is another stub, and calling one returns a stub. Stands in for the helpers the tour
 * borrows from YouTube's screens, which no test here reads.
 * @returns {any}
 */
function stub() {
  const fn = () => {};
  return new Proxy(fn, {
    get: (_t, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'then' ? () => stub() : stub()),
    apply: () => stub(),
  });
}

/** @param {string} hash */
function page(hash) {
  /** @type {any} */
  let activeElement = null;
  class El {
    /** @param {string} tag */
    constructor(tag) {
      this.tag = tag;
      /** @type {Record<string, string>} */
      this.attrs = {};
      /** @type {any[]} */
      this.children = [];
      /** @type {any} */
      this.parent = null;
      /** @type {Record<string, Function[]>} */
      this.events = {};
      /** @type {Record<string, string>} */
      const props = {};
      this.style = { setProperty: (/** @type {string} */ k, /** @type {string} */ v) => { props[k] = v; }, getPropertyValue: (/** @type {string} */ k) => props[k] || '', cssText: '' };
      this.classList = {
        contains: (/** @type {string} */ name) => this.className.split(' ').includes(name),
        toggle: (/** @type {string} */ name, /** @type {boolean} */ on = !this.classList.contains(name)) => {
          const names = new Set(this.className.split(' ').filter(Boolean));
          if (on) names.add(name); else names.delete(name);
          this.className = [...names].join(' ');
        },
        add: (/** @type {string[]} */ ...names) => names.forEach((name) => this.classList.toggle(name, true)),
        remove: (/** @type {string[]} */ ...names) => names.forEach((name) => this.classList.toggle(name, false)),
      };
    }
    get className() { return this.attrs.class || ''; }
    set className(value) { this.attrs.class = value; }
    get id() { return this.attrs.id || ''; }
    get hidden() { return 'hidden' in this.attrs; }
    set hidden(value) { this.toggleAttribute('hidden', value); }
    get textContent() { return this.children.map((c) => typeof c === 'string' ? c : c.textContent).join(''); }
    set textContent(value) { this.replaceChildren(value); }
    set innerHTML(_value) { this.children = []; }
    get isConnected() { return this.tag === 'body' || !!this.parent?.isConnected; }
    /** 0 while it or a parent is hidden or off the page, as in Chrome. */
    get offsetHeight() {
      for (let el = /** @type {El | null} */ (this); el; el = el.parent) if (el.hidden) return 0;
      return this.isConnected ? VISIBLE_PX : 0;
    }
    getBoundingClientRect() { const h = this.offsetHeight; return { left: 0, top: 0, right: h ? 300 : 0, bottom: h, width: h ? 300 : 0, height: h, x: 0, y: 0 }; }
    /** @param {string} k @param {string} v */
    setAttribute(k, v) { this.attrs[k] = String(v); }
    /** @param {string} k */
    getAttribute(k) { return this.attrs[k] ?? null; }
    /** @param {string} k */
    hasAttribute(k) { return k in this.attrs; }
    /** @param {string} k */
    removeAttribute(k) { delete this.attrs[k]; }
    /** @param {string} k @param {boolean} [on] */
    toggleAttribute(k, on = !(k in this.attrs)) { if (on) this.attrs[k] = ''; else delete this.attrs[k]; return on; }
    /** @param {any[]} kids */
    append(...kids) { for (const kid of kids) { if (kid instanceof El) { kid.remove(); kid.parent = this; } this.children.push(kid instanceof El ? kid : String(kid)); } }
    /** @param {any[]} kids */
    prepend(...kids) { const rest = this.children; this.children = []; this.append(...kids); this.children.push(...rest); }
    /** @param {any[]} kids */
    replaceChildren(...kids) { this.children = []; this.append(...kids); }
    /** @param {El | null} node @returns {boolean} */
    contains(node) { return node === this || this.children.some((c) => c instanceof El && c.contains(node)); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((/** @type {any} */ c) => c !== this); this.parent = null; }
    /** @param {El} node */
    replaceWith(node) { if (!this.parent) return; this.before(node); this.remove(); }
    /** @param {El} node */
    before(node) { node.remove(); const at = this.parent.children.indexOf(this); this.parent.children.splice(at, 0, node); node.parent = this.parent; }
    /** @param {El} node */
    after(node) { node.remove(); const at = this.parent.children.indexOf(this); this.parent.children.splice(at + 1, 0, node); node.parent = this.parent; }
    /** @param {El} node @param {El | undefined} ref */
    insertBefore(node, ref) { if (ref && ref.parent === this) ref.before(node); else this.append(node); }
    /** @param {string} selector @returns {El | null} */
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
    /** Tags, ids, classes, and attributes, joined by spaces or commas. Enough for the selectors welcome.js uses. @param {string} selector @returns {boolean} */
    matches(selector) {
      if (selector.includes(',')) return selector.split(',').some((s) => this.matches(s.trim()));
      const parts = selector.trim().match(/(?:\[[^\]]*\]|[^\s])+/g) || [];
      if (parts.length > 1) return this.matches(parts.at(-1) || '') && !!this.parent?.closest(parts.slice(0, -1).join(' '));
      const attrs = [...selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
      if (attrs.some(([, k, v]) => !(k in this.attrs) || (v !== undefined && this.attrs[k] !== v))) return false;
      const simple = selector.replace(/\[[^\]]*\]/g, '').replace(/:[\w-]+(\([^)]*\))?/g, '');
      const id = /#([\w-]+)/.exec(simple)?.[1];
      if (id && this.attrs.id !== id) return false;
      const tag = /^[\w-]+/.exec(simple)?.[0];
      return (!tag || tag === this.tag) && [...simple.matchAll(/\.([\w-]+)/g)].every(([, cls]) => this.classList.contains(cls));
    }
    /** @param {string} selector @returns {El[]} */
    querySelectorAll(selector) {
      return this.children.filter((c) => typeof c !== 'string').flatMap((c) => [...(c.matches(selector) ? [c] : []), ...c.querySelectorAll(selector)]);
    }
    /** @param {string} selector */
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    /** @param {string} event @param {Function} fn */
    addEventListener(event, fn) { (this.events[event] ||= []).push(fn); }
    removeEventListener() {}
    focus() { activeElement = this; }
    blur() {}
    animate() { return stub(); }
    getAnimations() { return []; }
    scrollIntoView() {}
  }
  const html = new El('html');
  const body = new El('body');
  const source = fs.readFileSync(path.join(SRC, 'welcome/welcome.html'), 'utf8');
  const stack = [body];
  for (const [token] of source.split('<body')[1].split('</body>')[0].replace(/^[^>]*>/, '').matchAll(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g)) {
    if (token.startsWith('<!--') || token.startsWith('<script') || token.startsWith('</script')) continue;
    if (token.startsWith('</')) { stack.pop(); continue; }
    if (!token.startsWith('<')) { if (token.trim()) stack[stack.length - 1].append(token); continue; }
    const [, tag, attrs] = /^<(\w+)\b([^>]*)>/.exec(token) || [];
    const el = new El(tag);
    for (const [, k, v] of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) el.setAttribute(k, v ?? '');
    stack[stack.length - 1].append(el);
    if (!['input', 'br', 'hr', 'img', 'meta', 'link'].includes(tag)) stack.push(el);
  }
  const document = {
    body,
    documentElement: html,
    createElement: (/** @type {string} */ tag) => new El(tag),
    createElementNS: (/** @type {string} */ _ns, /** @type {string} */ tag) => new El(tag),
    getElementById: (/** @type {string} */ id) => body.querySelector(`[id="${id}"]`),
    querySelector: (/** @type {string} */ selector) => body.querySelector(selector),
    querySelectorAll: (/** @type {string} */ selector) => body.querySelectorAll(selector),
    addEventListener() {},
    get activeElement() { return activeElement; },
  };
  /** @param {any} [state] @param {string} [_title] @param {string} [url] */
  const setUrl = (state, _title, url = '') => { ctx.history.state = state; ctx.location.hash = /#.*$/.exec(url)?.[0] || ''; };
  const h = (/** @type {string} */ tag, /** @type {Record<string, any>} */ attrs = {}, /** @type {any[]} */ ...children) => {
    const el = new El(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
    return el;
  };
  const ctx = vm.createContext({
    document, console, structuredClone, setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    window: { matchMedia: () => ({ matches: true, addEventListener() {} }), addEventListener() {}, scrollTo() {} },
    history: { state: null, replaceState: setUrl, pushState: setUrl, back() {} },
    location: { hash, pathname: '/src/welcome/welcome.html', search: '', href: '' },
    chrome: { runtime: { sendMessage: () => new Promise(() => {}), getURL: (/** @type {string} */ p) => p, openOptionsPage() {} } },
    DripUI: {
      h, icon: () => h('span'), price: () => h('span'), lockFoot: () => h('div'), blockedCardView: () => h('div'), cardMenu: () => h('div'),
      updateCardMenu() {}, hourLabel: () => '4:00am', dayTimeLabel: () => 'Monday', orbiter: () => () => {},
    },
    DripGlass: stub(), DripStash: stub(), DripReveal: stub(), DripPour: stub(), DripCounter: stub(),
  });
  ctx.globalThis = ctx;
  vm.runInContext(fs.readFileSync(path.join(SRC, 'lib/state.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(SRC, 'welcome/welcome.js'), 'utf8'), ctx);
  return { get: (/** @type {string} */ id) => document.getElementById(id), ctx };
}

test('a reload on any tour step draws it on the shown screen, so the lock measures the stage', () => {
  for (const n of [1, 2, 3, 4, 5]) {
    const p = page(`#tour-${n}`);
    assert.equal(p.get('tour').hidden, false, `#tour-${n}`);
    assert.equal(p.get('choose').hidden, true, `#tour-${n}`);
    assert.equal(p.ctx.location.hash, `#tour-${n}`);
    assert.equal(p.get('dots').querySelector('[aria-current="step"]')?.getAttribute('aria-label'), `Step ${n} of 5`);
    const lock = p.get('stage').querySelector('#drip-lock');
    if (n !== 4) {
      assert.equal(lock, null, `#tour-${n}`);
      continue;
    }
    // A hidden stage measured 0, and +15m or Done for now then drained the water from -26px to 0 (review, 2026-11-10).
    assert.equal(lock.style.getPropertyValue('--tour-depth'), `${VISIBLE_PX}px`);
    assert.equal(p.get('stage').style.getPropertyValue('min-height') || p.get('stage').style.minHeight, `max(var(--tour-h), ${VISIBLE_PX + 32}px)`);
  }
});

test('with no hash the page opens on the choice, and the tour waits hidden at its first step', () => {
  const p = page('');
  assert.equal(p.get('choose').hidden, false);
  assert.equal(p.get('tour').hidden, true);
  assert.equal(p.ctx.location.hash, '');
  assert.equal(p.get('say').textContent, 'Drops');
});
