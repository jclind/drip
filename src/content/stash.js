// @ts-check
// The Stash button's bookmark and how it fills (DESIGN.md, "The stash fill as built"), shared by the home page's card
// (home.js), the watch page pill (watch.js), and the welcome tour (welcome.js). The bookmark is one SVG: Jesse's
// cartoon bookmark (save.svg) or, on the pill before it's stashed, the lucide outline (save-outline.svg), in the text
// color, with blue water over it clipped by a wavy line, like the glass. Stashing raises the water with a wave that
// sloshes and settles, and the bookmark bobs once. Taking it out lowers the water. The word under it says "Stash" or
// "Stashed", over a hidden "Stashed" that keeps the button that wide, so nothing beside it moves when the word changes.
//
// A classic script that sets globalThis.DripStash. The water is drawn every frame while it moves, and its clock starts
// on the first frame, so a fill started while the tab is hidden waits and plays when the tab shows. Reduced motion
// changes it at once.

(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const BLUE = '#42A5F6';
  // save.svg's path and box. The outline below fills the same box.
  const SHAPE = 'M282.911 546.837C294.304 540.259 309.493 540.259 320.886 546.837L491.772 649.368C491.864 649.431 516.491 666.457 535.443 666.457C535.598 666.473 588.63 671.797 603.798 615.19V677.849C603.798 685.443 596.203 744.304 535.443 744.305C495.57 744.305 317.088 626.583 301.898 626.583C275.315 626.584 108.228 744.305 68.3545 744.305C55.0634 744.305 0 732.912 0 675.95V615.19C0 615.19 17.0887 666.456 68.3545 666.456C98.7342 666.456 263.922 558.23 282.911 546.837ZM461.393 0C512.658 1.88375e-05 598.102 9.49432 598.102 121.52C598.102 233.545 596.202 552.533 596.202 584.812C596.202 617.09 546.836 647.92 516.456 630.381C486.076 612.841 332.278 519.237 320.886 512.659C309.493 506.082 294.303 506.082 282.911 512.659C271.517 519.238 95.3127 626.581 85.4434 632.279C75.5773 637.976 9.49428 645.571 9.49414 573.419C9.49414 501.267 5.69629 167.09 5.69629 121.52C5.69629 75.9499 28.4813 0 123.418 0H461.393ZM189.905 36.0762C148.097 36.0764 49.3632 85.4436 43.7002 193.671C43.7002 193.671 45.6018 214.558 62.6904 214.558C79.779 214.558 83.6052 205.064 85.4756 197.469C87.346 189.874 89.2446 157.595 119.652 121.52C119.652 121.52 144.308 89.2411 189.905 77.8486C206.994 72.1524 206.994 55.0635 206.994 55.0635C206.994 54.9827 206.957 36.0762 189.905 36.0762Z';
  const W = 604;
  const H = 745;
  // save-outline.svg's path, in lucide's 24-unit box, and the scale that puts its stroke's outer edge on save.svg's box.
  const OUTLINE = 'M19 21L12 17L5 21V5C5 3.9 5.9 3 7 3H17C18.1 3 19 3.9 19 5V21Z';
  const OUTLINE_FIT = 'scale(37.75 37.25) translate(-4 -2)';
  // How far past the bookmark's top and bottom the waterline goes when full and empty, so the wave never shows there.
  const OVER = 70;
  const WAVELENGTH = 420;
  const FILL_MS = 620;
  const DRAIN_MS = 480;
  const BOB_MS = 300;

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * @typedef {{level: number, amp: number, tilt: number, phase: number, gen: number,
   *   water: SVGPathElement, dry: SVGPathElement}} Water
   * @type {WeakMap<SVGSVGElement, Water>}
   */
  const waters = new WeakMap();
  let ids = 0;

  /**
   * @param {string} tag @param {Record<string, string>} attrs @param {...Node} children
   */
  function el(tag, attrs, ...children) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    node.append(...children);
    return node;
  }

  /**
   * Draws the water: the waterline at its level, a wave `amp` high, leaning by `tilt`, slid along by `phase`, all in
   * the viewBox's units. Under the line is water. The bookmark under it shows only above the line, so its edge never
   * peeks out around the blue.
   * @param {Water} w
   */
  function draw(w) {
    const y = H + OVER - w.level * (H + 2 * OVER);
    let line = '';
    for (let x = -40; x <= W + 40; x += 22) {
      const wy = y + w.amp * Math.sin((2 * Math.PI * (x - w.phase)) / WAVELENGTH) + (w.tilt * (x - W / 2)) / (W / 2);
      line += `${line ? 'L' : 'M'}${x} ${wy.toFixed(1)}`;
    }
    w.water.setAttribute('d', `${line}L${W + 40} ${H + 400}L-40 ${H + 400}Z`);
    w.dry.setAttribute('d', `${line}L${W + 40} -400L-40 -400Z`);
  }

  /**
   * The bookmark, empty or full.
   * @param {boolean} full @param {{outline?: boolean}} [o] outline: drawn empty as the outline (the pill).
   */
  function make(full, { outline = false } = {}) {
    const id = `drip-stash-${++ids}`;
    const waterLine = /** @type {SVGPathElement} */ (el('path', {}));
    const dryLine = /** @type {SVGPathElement} */ (el('path', {}));
    const base = outline
      ? el('path', { d: OUTLINE, fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linejoin': 'round', transform: OUTLINE_FIT })
      : el('path', { d: SHAPE, fill: 'currentColor' });
    const svg = /** @type {SVGSVGElement} */ (el('svg', { class: 'drip-stash-icon', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' },
      el('defs', {},
        el('clipPath', { id: `${id}-water`, clipPathUnits: 'userSpaceOnUse' }, waterLine),
        el('clipPath', { id: `${id}-dry`, clipPathUnits: 'userSpaceOnUse' }, dryLine)),
      // The outline is scaled inside the group, so the group's clip stays in the viewBox's units.
      el('g', { 'clip-path': `url(#${id}-dry)` }, base),
      el('path', { d: SHAPE, fill: BLUE, 'clip-path': `url(#${id}-water)` })));
    const w = { level: full ? 1 : 0, amp: 0, tilt: 0, phase: 0, gen: 0, water: waterLine, dry: dryLine };
    waters.set(svg, w);
    draw(w);
    return svg;
  }

  /**
   * Runs step(t, ms) every frame for `ms`, t from 0 to 1. Stops early, without the last step, if `live()` turns false.
   * The clock starts on the first frame, so a fill started in a hidden tab plays in full when the tab shows.
   * @param {number} ms @param {(t: number, elapsed: number) => void} step @param {() => boolean} live
   * @returns {Promise<boolean>} Whether it ran to the end.
   */
  function frames(ms, step, live) {
    return new Promise((resolve) => {
      let start = -1;
      /** @param {number} now */
      const loop = (now) => {
        if (!live()) return resolve(false);
        if (start < 0) start = now;
        const elapsed = now - start;
        const t = Math.min(1, elapsed / ms);
        step(t, elapsed);
        if (t < 1) requestAnimationFrame(loop);
        else resolve(true);
      };
      requestAnimationFrame(loop);
    });
  }

  /**
   * Fills the bookmark (stashed) or empties it, from wherever its water is. `word` is called with the new word when it
   * should change: once full, or as it starts to empty. A newer fill on the same bookmark stops this one.
   * @param {SVGSVGElement} svg @param {boolean} on @param {(stashed: boolean) => void} [word]
   */
  async function fill(svg, on, word = () => {}) {
    const w = waters.get(svg);
    if (!w) return;
    const gen = ++w.gen;
    const live = () => w.gen === gen;
    const from = w.level;
    if (reduced()) {
      Object.assign(w, { level: on ? 1 : 0, amp: 0, tilt: 0 });
      draw(w);
      word(on);
      return;
    }
    if (on) {
      const done = await frames(FILL_MS * (1 - from) || 1, (t, ms) => {
        const out = 1 - (1 - t) ** 3;
        Object.assign(w, { level: from + (1 - from) * out, amp: 60 * (1 - t), tilt: 120 * Math.sin(t * 3 * Math.PI) * (1 - t), phase: ms * 0.7 });
        draw(w);
      }, live);
      if (!done) return;
      Object.assign(w, { level: 1, amp: 0, tilt: 0 });
      draw(w);
      word(true);
      svg.animate([{ translate: '0 0' }, { translate: '0 -2px' }, { translate: '0 0.5px' }, { translate: '0 0' }],
        { duration: BOB_MS, easing: 'ease-out' });
      return;
    }
    word(false);
    const done = await frames(DRAIN_MS * from || 1, (t, ms) => {
      Object.assign(w, { level: from * (1 - t * t), amp: 50 * Math.sin(Math.PI * t), tilt: -70 * Math.sin(t * 2 * Math.PI) * (1 - t), phase: -ms * 0.7 });
      draw(w);
    }, live);
    if (!done) return;
    Object.assign(w, { level: 0, amp: 0, tilt: 0 });
    draw(w);
  }

  /**
   * A Stash button's insides: the bookmark and the word, over a hidden "Stashed" with a gap the bookmark's size, which
   * keeps the button as wide as "Stashed". The button gets the class drip-stash (drip.css centers both in one cell).
   * @param {boolean} stashed What it shows now. @param {{outline?: boolean, labelClass?: string}} [o]
   *   outline: the pill's empty bookmark. labelClass: a class for the word, which narrow cards hide.
   */
  function parts(stashed, { outline = false, labelClass = '' } = {}) {
    const icon = make(stashed, { outline });
    const word = document.createElement('span');
    word.className = labelClass;
    word.textContent = stashed ? 'Stashed' : 'Stash';
    const row = document.createElement('span');
    row.className = 'drip-stash-row';
    row.append(icon, word);
    const ghost = document.createElement('span');
    ghost.className = 'drip-stash-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    const gap = document.createElement('span');
    gap.className = 'drip-stash-icon';
    ghost.append(gap, 'Stashed');
    /** Fills or empties the bookmark, and changes the word when it should. @param {boolean} on */
    const to = (on) => {
      // This animates the nodes just built, so a page that patches itself in place puts these in, not its old ones.
      row.setAttribute('data-morph-new', '');
      return fill(icon, on, (s) => { word.textContent = s ? 'Stashed' : 'Stash'; });
    };
    return { nodes: [row, ghost], icon, word, to };
  }

  /** @type {any} */ (globalThis).DripStash = { make, fill, parts };
})();
