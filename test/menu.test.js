// @ts-check
// drip's menu under YouTube's menu button (menu.js, design C) on a fake page: it opens, and closes on a click outside or
// Escape, but not on a click a script made (release review, 2026-11-10).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');

class FakeElement {
  /** @param {string} tag @param {string[]} [selectors] What it matches besides its tag. */
  constructor(tag, selectors = []) {
    this.localName = tag;
    this.selectors = selectors;
    /** @type {Map<string, string>} */
    this.attrs = new Map();
    /** @type {any[]} */
    this.children = [];
    /** @type {FakeElement | null} */
    this.parent = null;
    /** @type {Record<string, string>} */
    this.style = {};
    this.focused = false;
  }
  /** @param {string} k @param {string} v */
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  /** @param {string} k */
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  /** @param {...any} kids */
  append(...kids) {
    for (const k of kids) {
      if (k instanceof FakeElement) { k.remove(); k.parent = this; }
      this.children.push(k);
    }
  }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  /** @param {any} other */
  contains(other) {
    for (let el = other; el; el = el.parent) if (el === this) return true;
    return false;
  }
  /** @param {string} sel */
  matches(sel) { return sel === this.localName || this.selectors.includes(sel); }
  /** @param {string} sel */
  closest(sel) {
    for (let el = /** @type {FakeElement | null} */ (this); el; el = el.parent) if (el.matches(sel)) return el;
    return null;
  }
  /** @param {string} sel @returns {FakeElement | null} */
  querySelector(sel) {
    for (const c of this.children) {
      if (!(c instanceof FakeElement)) continue;
      if (c.matches(sel)) return c;
      const inner = c.querySelector(sel);
      if (inner) return inner;
    }
    return null;
  }
  getBoundingClientRect() { return { top: 0, bottom: 40, left: 16, right: 56 }; }
  focus() { this.focused = true; }
}

/** A YouTube page with the menu button and menu.js loaded. */
function makePage() {
  /** @type {Record<string, Function[]>} */
  const winHandlers = {};
  /** @type {Record<string, Function[]>} */
  const docHandlers = {};
  const root = new FakeElement('html');
  const rootAttrs = new Set();
  Object.assign(root, {
    /** @param {string} k */
    hasAttribute: (k) => rootAttrs.has(k),
    /** @param {string} k @param {boolean} [on] */
    toggleAttribute: (k, on) => { if (on ?? !rootAttrs.has(k)) rootAttrs.add(k); else rootAttrs.delete(k); },
  });
  const body = new FakeElement('body');
  const guide = new FakeElement('yt-icon-button', ['ytd-masthead #guide-button']);
  const guideButton = new FakeElement('button');
  guide.append(guideButton);
  const elsewhere = new FakeElement('div');
  const link = new FakeElement('a');
  link.setAttribute('href', '/feed/history');
  body.append(guide, elsewhere, link);
  /** @type {any[]} */
  const navigations = [];
  const document = {
    documentElement: root,
    body,
    /** @param {string} tag */
    createElement: (tag) => new FakeElement(tag),
    /** @param {string} sel */
    querySelector: (sel) => (sel === 'ytd-masthead #guide-button' ? guide : null),
    /** @param {string} type @param {Function} fn */
    addEventListener: (type, fn) => { (docHandlers[type] ||= []).push(fn); },
    /** @param {any} e */
    dispatchEvent: (e) => {
      if (e.type === 'drip-navigate') navigations.push(e.detail);
      return true;
    },
  };
  const context = vm.createContext({
    document,
    location: { href: 'https://www.youtube.com/', origin: 'https://www.youtube.com' },
    window: { addEventListener: (/** @type {string} */ type, /** @type {Function} */ fn) => { (winHandlers[type] ||= []).push(fn); } },
    Element: FakeElement,
    URL,
    CustomEvent: class { /** @param {string} type @param {any} o */ constructor(type, o) { this.type = type; this.detail = o.detail; } },
    MutationObserver: class { observe() {} disconnect() {} },
    DripIcons: { paint() {} },
    chrome: { storage: { onChanged: { addListener() {} }, local: { get: async () => ({}) } } },
  });
  vm.runInContext(fs.readFileSync(path.join(SRC, 'content/menu.js'), 'utf8'), context);
  return {
    guide, guideButton, elsewhere, link, navigations,
    menu: () => body.children.find((c) => c instanceof FakeElement && c.getAttribute('id') === 'drip-menu') || null,
    /**
     * A click on `target`, through window's capture listeners as in a browser. Without `isTrusted` it's a plain
     * object, as other tests send. @param {FakeElement} target @param {{isTrusted?: boolean}} [o]
     */
    click(target, o = {}) {
      const e = { type: 'click', target, button: 0, detail: 1, defaultPrevented: false, ...o,
        preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() {} };
      for (const fn of winHandlers.click || []) fn(e);
      return e;
    },
    /** @param {string} key */
    key(key) { for (const fn of docHandlers.keydown || []) fn({ type: 'keydown', key }); },
  };
}

test('the menu button opens drip\'s menu, and a click outside closes it', () => {
  const page = makePage();
  page.click(page.guideButton, { isTrusted: true });
  assert.ok(page.menu(), 'open');
  assert.equal(page.guideButton.getAttribute('aria-expanded'), 'true');
  page.click(page.elsewhere, { isTrusted: true });
  assert.equal(page.menu(), null);
  assert.equal(page.guideButton.getAttribute('aria-expanded'), 'false');
});

test('a click outside the menu that a script made leaves it open (release review, 2026-11-10)', () => {
  const page = makePage();
  page.click(page.guideButton, { isTrusted: true });
  // watch.js clicked YouTube's hidden autoplay switch every second in a new profile.
  for (let i = 0; i < 10; i++) page.click(page.elsewhere, { isTrusted: false });
  assert.ok(page.menu(), 'still open');
  page.click(page.elsewhere, { isTrusted: true });
  assert.equal(page.menu(), null, 'the user\'s click closes it');
});

test('a script\'s click on a link outside the menu is left alone', () => {
  const page = makePage();
  page.click(page.guideButton, { isTrusted: true });
  const e = page.click(page.link, { isTrusted: false });
  assert.equal(e.defaultPrevented, false);
  assert.deepEqual(page.navigations, []);
  assert.ok(page.menu(), 'still open');
});

test('a plain event object with no isTrusted counts as the user\'s click', () => {
  const page = makePage();
  page.click(page.guideButton);
  assert.ok(page.menu());
  page.click(page.elsewhere);
  assert.equal(page.menu(), null);
});

test('Escape closes the menu and puts focus back on the button', () => {
  const page = makePage();
  page.click(page.guideButton, { isTrusted: true });
  page.key('Escape');
  assert.equal(page.menu(), null);
  assert.equal(page.guideButton.focused, true);
});
