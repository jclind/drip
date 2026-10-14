// @ts-check
// The glass of water that shows minutes left (DESIGN.md, "Minutes and the watch page pill"). Built from Jesse's
// drawings in cup-icons/ as one SVG: the outline, the water body, and a wavy waterline whose height comes from the
// fraction left. A classic script that sets globalThis.DripGlass, so content scripts and extension pages can share it.

(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const VIEW = { width: 618, height: 814 };
  // full-cup.svg. The outline takes currentColor, so CSS picks its gray for light and dark.
  const OUTLINE = 'M538.026 709.552C540.526 735.552 541.026 805.552 472.026 813.052C471.954 813.052 153.526 813.552 151.026 813.552C148.526 813.552 69.5265 810.051 79.0264 709.552C108.511 775.517 175.455 765.563 175.526 765.552C175.526 765.552 365.026 766.052 444.526 765.552C523.94 765.053 537.996 709.673 538.026 709.552ZM311.028 0.0520645C311.34 0.0472573 633.452 -4.90563 617.026 83.0521C600.593 171.052 546.03 619.552 535.528 677.552C525.026 735.552 478.527 750.052 453.028 750.052H164.028C98.5275 750.052 84.027 687.553 82.0283 677.552C80.0299 667.552 15.8855 170.552 0.526361 83.0521C-14.8325 -4.44786 311.028 0.0520645 311.028 0.0520645ZM565.561 143.749C565.061 137.749 563.061 132.249 550.561 133.749C445.561 166.249 278.561 166.749 141.561 152.249C141.561 152.249 141.579 152.374 141.606 152.612C141.413 152.591 141.22 152.573 141.026 152.552C141.026 152.552 143.026 164.052 133.026 178.552C123.026 193.052 110.526 192.552 110.526 221.052C110.526 230.856 107.966 250.041 90.4111 260.17C84.768 263.313 77.6159 265.534 68.5605 266.249C68.5605 266.249 68.5711 266.335 68.5918 266.503C68.4041 266.519 68.2157 266.537 68.0264 266.552C68.0264 266.552 113.026 632.052 115.526 652.552C118.026 673.052 123.026 703.552 192.526 702.552C262.026 701.552 406.026 703.052 419.526 703.052C428.386 703.052 458.778 703.483 480.039 691.202C491.433 684.78 500.314 674.79 502.061 659.249C507.061 614.749 566.061 149.749 565.561 143.749ZM105.526 139.052C67.5267 138.052 53.5265 174.052 51.5264 182.552C49.5264 191.052 49.5265 223.052 53.5264 234.052C57.5157 245.023 68.9654 245.052 69.0264 245.052C69.0264 245.052 83.0264 244.052 84.5264 234.052C86.0263 224.052 83.0264 192.052 83.0264 192.052C83.0444 191.998 90.0466 171.052 105.526 171.052C121.026 171.052 121.026 155.052 121.026 155.052C121.026 154.988 120.994 139.459 105.526 139.052ZM311.028 28.5521C257.527 28.5521 43.5274 39.5523 43.5264 78.5521C43.5264 117.552 255.028 126.052 310.526 125.052C366.025 124.052 575.026 117.052 574.526 78.5521C574.025 40.0523 364.53 28.5521 311.028 28.5521Z';
  // The top of the water, seen through the rim when the glass is full.
  const SURFACE = 'M310.749 52.9995C263.998 52.9995 77 58.4667 77 77.8504C77 97.234 261.815 101.459 310.31 100.962C358.806 100.465 541.436 96.9855 540.999 77.8504C540.562 58.7152 357.5 52.9995 310.749 52.9995Z';
  // Everything inside the glass. The waterline clips it.
  const BODY = 'M527.546 161.779C432.895 191.076 282.356 191.527 158.859 178.456C158.859 178.456 160.662 188.822 151.648 201.893C142.634 214.964 131.366 214.513 131.366 240.204C131.366 251.923 127.309 278.515 93.0547 281.219C93.0547 281.219 133.619 610.694 135.873 629.173C138.126 647.652 142.634 675.146 205.283 674.245C267.933 673.343 397.74 674.695 409.909 674.695C422.078 674.695 479.319 675.597 483.826 635.483C488.334 595.369 541.518 176.202 541.068 170.794C540.617 165.385 538.814 160.427 527.546 161.779Z';
  // A waterline at y = 0 like the one in 1-half-cup.svg, filled down past the bottom of the glass.
  const WAVE = 'M-20 2C100 16 200 20 310 6S520 -14 640 -4V900H-20Z';
  const WATER_BOTTOM = 675;
  // Where the waterline sits just under full, below the shimmer notch at the top left.
  const WATER_TOP = 205;
  const BLUE = '#42A5F6';

  let ids = 0;

  /**
   * @param {string} tag
   * @param {Record<string, string>} attrs
   */
  function el(tag, attrs) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  }

  /**
   * Where the waterline goes, in viewBox units. Near 0 the water thins to a sliver, but while any minutes are left it
   * stays at least 2 screen pixels tall, so a small glass can tell low from empty.
   * @param {number} fraction
   * @param {number} heightPx The glass's height on screen.
   */
  function waterline(fraction, heightPx) {
    if (!(fraction > 0)) return WATER_BOTTOM + 40;
    const minUnits = (2 * VIEW.height) / Math.max(heightPx, 1) + 14;
    const y = WATER_BOTTOM - Math.min(fraction, 1) * (WATER_BOTTOM - WATER_TOP);
    return Math.min(y, WATER_BOTTOM - minUnits);
  }

  /**
   * A glass that's `fraction` full, drawn `heightPx` tall.
   * @param {number} fraction 0 is empty, 1 is full.
   * @param {number} heightPx
   * @returns {SVGSVGElement}
   */
  function make(fraction, heightPx) {
    const id = `drip-glass-${++ids}`;
    const svg = /** @type {SVGSVGElement} */ (el('svg', {
      class: 'drip-glass', viewBox: `0 0 ${VIEW.width} ${VIEW.height}`, height: String(heightPx),
      width: String(Math.round((heightPx * VIEW.width) / VIEW.height)), 'aria-hidden': 'true', focusable: 'false',
    }));
    const clip = el('clipPath', { id });
    const wave = el('path', { d: WAVE, class: 'drip-glass-wave' });
    clip.append(wave);
    const defs = el('defs', {});
    defs.append(clip);
    svg.append(
      defs,
      el('path', { d: OUTLINE, fill: 'currentColor', class: 'drip-glass-outline' }),
      el('path', { d: BODY, fill: BLUE, 'clip-path': `url(#${id})`, class: 'drip-glass-body' }),
      el('path', { d: SURFACE, fill: BLUE, class: 'drip-glass-surface' }),
    );
    set(svg, fraction, heightPx);
    return svg;
  }

  /**
   * Moves the water in a glass from make(). CSS can transition the wave's transform, so the level glides.
   * @param {SVGSVGElement} svg
   * @param {number} fraction
   * @param {number} heightPx
   */
  function set(svg, fraction, heightPx) {
    const full = fraction >= 1;
    const wave = /** @type {SVGPathElement | null} */ (svg.querySelector('.drip-glass-wave'));
    // Full raises the waterline past the rim, so the body shows whole under the surface ellipse.
    if (wave) wave.style.transform = `translateY(${full ? 0 : waterline(fraction, heightPx)}px)`;
    const surface = /** @type {SVGPathElement | null} */ (svg.querySelector('.drip-glass-surface'));
    if (surface) surface.style.opacity = full ? '1' : '0';
    svg.dataset.level = String(Math.max(0, Math.min(1, fraction)));
  }

  /**
   * How full the glass is: minutes left out of the minutes bought today. Minutes that came from nowhere (the dev panel,
   * or state from before the field) count as full.
   * @param {{watchSecondsLeft: number, watchSecondsBought: number}} state
   */
  function fraction(state) {
    if (state.watchSecondsLeft <= 0) return 0;
    if (state.watchSecondsBought <= 0) return 1;
    return Math.min(1, state.watchSecondsLeft / state.watchSecondsBought);
  }

  // Data only, so the worker can draw the same glass without creating any DOM nodes.
  const paths = Object.freeze({ outline: OUTLINE, body: BODY, surface: SURFACE, wave: WAVE });
  /** @type {any} */ (globalThis).DripGlass = { make, set, fraction, waterline, paths, viewBox: Object.freeze(VIEW), blue: BLUE };
})();
