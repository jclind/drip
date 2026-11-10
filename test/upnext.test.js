// @ts-check
// YouTube's "next video" (upnext.js) on a fake watch page: Shift+N and the player's Next button stop on a plain watch
// page, where the next video is YouTube's pick, and work in a playlist, which plays on (Q2). Written from the signed-in
// test of 2026-11-10, where Shift+N played YouTube's up-next video with no card spent.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');
const PLAIN = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const LIST = 'https://www.youtube.com/watch?v=2Hww7aqAs5o&list=PLKozl91Vtbkxs0R597UzSlLtsaQJLh-lu';
// The Next button's hrefs as YouTube wrote them on 2026-11-10.
const PICK_HREF = 'https://www.youtube.com/watch?v=RD_Jwka9NaY';
const LIST_HREF = 'https://www.youtube.com/watch?list=PLKozl91Vtbkxs0R597UzSlLtsaQJLh-lu&v=cPKkbFbfiTU';

class FakeElement {
  /** @param {string} tag @param {Record<string, string>} [attrs] @param {FakeElement | null} [parent] */
  constructor(tag, attrs = {}, parent = null) {
    this.localName = tag;
    this.attrs = attrs;
    this.parent = parent;
    this.isContentEditable = attrs.contenteditable === '' || attrs.contenteditable === 'true' || (parent?.isContentEditable ?? false);
  }
  /** @param {string} name */
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
  /** The selectors upnext.js asks for: tags, [contenteditable="..."], and a trailing .class. @param {string} sel */
  matches(sel) {
    return sel.split(',').map((s) => s.trim()).some((part) => {
      const cls = /\.([\w-]+)$/.exec(part);
      if (cls) return (this.attrs.class || '').split(' ').includes(cls[1]);
      const attr = /^\[contenteditable="([^"]*)"\]$/.exec(part);
      if (attr) return this.attrs.contenteditable === attr[1];
      return this.localName === part;
    });
  }
  /** @param {string} sel */
  closest(sel) {
    for (let el = /** @type {FakeElement | null} */ (this); el; el = el.parent) if (el.matches(sel)) return el;
    return null;
  }
}

/** @param {string} url @param {string | null} nextHref The Next button's href, or null for no button. */
function makePage(url, nextHref) {
  /** @type {{type: string, fn: Function, capture: boolean}[]} */
  const listeners = [];
  const location = new URL(url);
  const player = new FakeElement('div', { id: 'movie_player' });
  const next = new FakeElement('a', { class: 'ytp-next-button ytp-button', ...(nextHref === null ? {} : { href: nextHref }) }, player);
  const document = {
    /** @param {string} sel */
    querySelector: (sel) => (sel === '#movie_player .ytp-next-button' && nextHref !== null ? next : null),
  };
  const window = {
    /** @param {string} type @param {Function} fn @param {boolean} capture */
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
  };
  const context = vm.createContext({ window, document, location, Element: FakeElement, URL });
  for (const file of ['lib/state.js', 'content/upnext.js']) vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), context);
  return {
    player, next,
    /**
     * Fires an event at window's capture listeners, as the first stop on its way to YouTube's. Returns whether it got
     * through to YouTube.
     * @param {string} type @param {any} init
     */
    fire(type, init) {
      const target = init.target || player;
      const event = {
        type, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, key: '', ...init, target,
        canceled: false, stopped: false,
        composedPath: () => [target],
        preventDefault() { this.canceled = true; },
        stopImmediatePropagation() { this.stopped = true; },
      };
      for (const l of listeners) if (l.type === type && l.capture) l.fn(event);
      assert.equal(event.canceled, event.stopped, 'a canceled event also stops');
      return !event.stopped;
    },
    /** @param {string} key @param {any} [more] */
    key(key, more = {}) { return this.fire('keydown', { key, ...more }); },
  };
}

test('Shift+N stops on a plain watch page, where the next video is YouTube\'s pick', () => {
  const page = makePage(PLAIN, PICK_HREF);
  assert.equal(page.key('N', { shiftKey: true }), false);
  // Caps Lock gives "n" with Shift.
  assert.equal(page.key('n', { shiftKey: true }), false);
});

test('Shift+N stops with no Next button on a page without a list', () => {
  assert.equal(makePage(PLAIN, null).key('N', { shiftKey: true }), false);
});

test('Shift+N and Shift+P keep working in a playlist (Q2)', () => {
  const page = makePage(LIST, LIST_HREF);
  assert.equal(page.key('N', { shiftKey: true }), true);
  assert.equal(page.key('P', { shiftKey: true }), true);
  assert.equal(makePage(LIST, null).key('N', { shiftKey: true }), true);
});

test("Shift+N stops at a playlist's end when the Next button points to YouTube's pick", () => {
  assert.equal(makePage(LIST, PICK_HREF).key('N', { shiftKey: true }), false);
});

test("YouTube's other shortcuts get through on a plain watch page", () => {
  const page = makePage(PLAIN, PICK_HREF);
  for (const key of ['k', 'j', 'l', 'f', 'm', 'c', 'n', 'N', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '0', '5', '9', ' ']) {
    assert.equal(page.key(key), true, key);
  }
  assert.equal(page.key('P', { shiftKey: true }), true, 'Shift+P');
  assert.equal(page.key('?', { shiftKey: true }), true, 'Shift+?');
  assert.equal(page.key('>', { shiftKey: true }), true, 'Shift+> for speed');
  for (const mod of ['ctrlKey', 'metaKey', 'altKey']) assert.equal(page.key('N', { shiftKey: true, [mod]: true }), true, mod);
});

test('a capital N typed into a field stays a letter', () => {
  const page = makePage(PLAIN, PICK_HREF);
  const form = new FakeElement('div');
  for (const target of [
    new FakeElement('input', {}, form),
    new FakeElement('textarea', {}, form),
    new FakeElement('select', {}, form),
    // YouTube's comment box is a contenteditable div. A child of one counts too.
    new FakeElement('span', {}, new FakeElement('div', { contenteditable: 'true', id: 'contenteditable-root' }, form)),
    new FakeElement('div', { contenteditable: 'plaintext-only' }, form),
  ]) {
    assert.equal(page.key('N', { shiftKey: true, target }), true, target.localName);
  }
  assert.equal(page.key('N', { shiftKey: true, isComposing: true }), true, 'mid-composition');
});

test('Shift+N is left alone off the watch page', () => {
  assert.equal(makePage('https://www.youtube.com/results?search_query=dovetail', null).key('N', { shiftKey: true }), true);
});

test("the player's Next button stops on a plain watch page and works in a playlist", () => {
  const plain = makePage(PLAIN, PICK_HREF);
  assert.equal(plain.fire('click', { target: plain.next }), false);
  // A click on its icon inside it.
  assert.equal(plain.fire('click', { target: new FakeElement('svg', {}, plain.next) }), false);
  // Clicks elsewhere in the player get through.
  assert.equal(plain.fire('click', { target: plain.player }), true);
  const list = makePage(LIST, LIST_HREF);
  assert.equal(list.fire('click', { target: list.next }), true);
});
