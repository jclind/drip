// @ts-check
// Where the full-stash list opens (swap.js place) against a small layout model: a list 380px wide that starts under its
// Stash button, as on search results, in windows down to 360px wide. Written from the release review, 2026-11-10,
// which measured its right edge at 768px in a 760px window, 688 in 600, and 660 in 420.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const EDGE = 16;

/**
 * swap.js in a window `width` wide, and a list whose left edge starts at `left`, as CSS puts it under its button.
 * The list is 380px wide, or 100vw less 32px, as drip.css has it, and inline max-width narrows it further.
 * @param {{width: number, scrollbar?: number, left: number, height?: number}} o
 */
function load({ width, scrollbar = 0, left, height = 900 }) {
  const win = { innerWidth: width, innerHeight: height };
  const root = { clientWidth: width - scrollbar };
  const context = vm.createContext({
    window: win,
    document: { documentElement: root, addEventListener() {} },
    DripUI: { h() {} },
    Drip: {},
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'swap.js'), 'utf8'), context);

  const classes = new Set();
  /** @type {Record<string, string>} */
  const style = { translate: '', maxWidth: '' };
  const list = { style: { maxHeight: '' }, offsetHeight: 200, scrollHeight: 200 };
  const el = {
    left,
    style,
    dataset: /** @type {Record<string, string>} */ ({}),
    classList: { remove: (/** @type {string} */ c) => classes.delete(c), toggle: (/** @type {string} */ c, /** @type {boolean} */ on) => { if (on) classes.add(c); else classes.delete(c); } },
    /** @param {string} sel */
    querySelector: (sel) => (sel === '.drip-swap-list' ? list : null),
    get offsetWidth() {
      const css = Math.min(380, win.innerWidth - 32);
      return style.maxWidth ? Math.min(css, parseFloat(style.maxWidth)) : css;
    },
    get offsetHeight() { return 300; },
    getBoundingClientRect() {
      const shift = style.translate ? parseFloat(style.translate) : 0;
      return { left: el.left + shift, right: el.left + shift + el.offsetWidth, top: 400, bottom: 700 };
    },
  };
  const anchor = { getBoundingClientRect: () => ({ top: 360, bottom: 392, left, right: left + 80 }) };
  return {
    win, root, el, anchor,
    place: () => context.DripSwap.place(el, anchor),
    box: () => el.getBoundingClientRect(),
  };
}

// Where a search result's Stash button sat in the review's windows, so the list ran off the right.
for (const [width, left] of [[1280, 600], [760, 388], [600, 308], [420, 280]]) {
  test(`the full-stash list stays inside a ${width}px window (release review, 2026-11-10)`, () => {
    const page = load({ width, left });
    page.place();
    const box = page.box();
    assert.ok(box.left >= EDGE, `left ${box.left}`);
    assert.ok(box.right <= width - EDGE, `right ${box.right}`);
  });
}

test('a list that fits is left where it is', () => {
  const page = load({ width: 1280, left: 600 });
  page.place();
  assert.equal(page.el.style.translate, '');
  assert.equal(page.el.style.maxWidth, '');
});

test('a list wider than the window less its margins narrows to fit, scrollbar left out', () => {
  // 100vw counts the scrollbar, so drip.css alone leaves the list 388px wide in a window 405px wide inside.
  const page = load({ width: 420, scrollbar: 15, left: 200 });
  page.place();
  const box = page.box();
  assert.equal(page.el.style.maxWidth, `${405 - 2 * EDGE}px`);
  assert.equal(box.left, EDGE);
  assert.equal(box.right, 405 - EDGE);
});

test('a list that starts left of the window moves right, never past the right edge', () => {
  const page = load({ width: 600, left: -40 });
  page.place();
  assert.equal(page.box().left, EDGE);
  assert.ok(page.box().right <= 600 - EDGE);
});

test('each placement starts from no shift', () => {
  const page = load({ width: 600, left: 308 });
  page.place();
  assert.notEqual(page.el.style.translate, '');
  // The window got wider, and the list opens again.
  page.win.innerWidth = 1280;
  page.root.clientWidth = 1280;
  page.place();
  assert.equal(page.el.style.translate, '');
  assert.equal(page.el.style.maxWidth, '');
  assert.equal(page.box().left, 308);
});

test('the pill\'s list, which hangs in the player under the pill, is not moved sideways', () => {
  // Theater mode: the player reaches the window's edge, and the pill and its list sit 12px in from it.
  const page = load({ width: 1280, left: 1280 - 12 - 380 });
  page.el.dataset.flips = 'false';
  page.place();
  assert.equal(page.el.style.translate, '');
  assert.equal(page.box().right, 1280 - 12);
});
