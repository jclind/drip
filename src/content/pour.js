// @ts-check
// How water moves into and out of the glass (DESIGN.md, "The glass's motion as built"), shared by the home page
// (home.js), the watch page (watch.js), and the welcome tour (welcome.js). Water moves one drop at a time and lands with
// a ring. +15m sends a drop from the drop counter into the glass, and the water bobs up to its new level. When the pill
// hits 0, its last water falls out as a drop and the lock's water rises from where it lands. +15m on the lock drops the
// button's drop into the water, and the pill's glass bobs back up. A classic script that sets globalThis.DripPour.
//
// Everything here is Web Animations, so it finishes in a background tab too. The drops and rings fly in a layer of
// their own over the whole window. Reduced motion never calls in here.

(() => {
  const DripGlass = /** @type {any} */ (globalThis).DripGlass;
  const BLUE = '#42a5f6';
  // glass.js's viewBox height, to turn the waterline into screen pixels.
  const VIEW_H = 814;
  const ARC_MS = 420;
  const FALL_MS = 200;
  const BOB_MS = 700;

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** @param {number} ms */
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Element.animate as a promise. It resolves when the animation ends or is cancelled, or after its length plus a
   * margin, so a caller waiting on it is never stuck.
   * @param {Element} el @param {Keyframe[]} keyframes @param {KeyframeAnimationOptions} options
   */
  function play(el, keyframes, options) {
    const a = el.animate(keyframes, { fill: 'both', ...options });
    const ms = Number(options.duration || 0) + Number(options.delay || 0);
    return Promise.race([a.finished.then(() => {}, () => {}), sleep(ms + 500)]);
  }

  /** The layer the drops and rings fly in, fixed over the window. */
  function layer() {
    let el = document.getElementById('drip-pour');
    if (!el) {
      el = document.createElement('div');
      el.id = 'drip-pour';
      el.setAttribute('aria-hidden', 'true');
      Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '2147483646', pointerEvents: 'none', overflow: 'hidden' });
    }
    if (el.parentElement !== document.body) document.body.append(el);
    return el;
  }

  /**
   * A drop, `width` px wide, drawn from drop.svg so it has the cartoon shimmer. Placed by its middle.
   * @param {number} width
   */
  function drop(width) {
    const img = document.createElement('img');
    img.src = chrome.runtime.getURL('src/icons/drop.svg');
    img.alt = '';
    Object.assign(img.style, { position: 'absolute', left: '0', top: '0', width: `${width}px`, height: 'auto', translate: '-50% -50%' });
    layer().append(img);
    return img;
  }

  /**
   * Where something is on screen, as a transform for an element in the layer.
   * @param {number} x @param {number} y @param {string} [extra]
   */
  const at = (x, y, extra = '') => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${extra}`.trim();

  /**
   * A ring spreading on the water at x, y, out to w by h px, fading as it goes.
   * @param {number} x @param {number} y @param {number} w @param {number} h @param {number} [ms] @param {number} [delay]
   */
  function ring(x, y, w, h, ms = 650, delay = 0) {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute', left: `${x}px`, top: `${y}px`, width: '0', height: '0', translate: '-50% -50%',
      border: `1.5px solid ${BLUE}`, borderRadius: '50%', boxSizing: 'border-box',
    });
    layer().append(el);
    return play(el, [
      { width: '0px', height: '0px', opacity: 1 },
      { width: `${w}px`, height: `${h}px`, opacity: 0 },
    ], { duration: ms, delay, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }).then(() => el.remove());
  }

  /**
   * Two tiny droplets thrown up and out from x, y.
   * @param {number} x @param {number} y @param {number} size @param {number} spread @param {number} height @param {number} [ms]
   */
  function splash(x, y, size, spread, height, ms = 380) {
    return Promise.all([-1, 1].map((side) => {
      const el = document.createElement('div');
      Object.assign(el.style, { position: 'absolute', left: '0', top: '0', width: `${size}px`, height: `${size}px`, translate: '-50% -50%', borderRadius: '50%', background: BLUE });
      layer().append(el);
      // A parabola, sampled.
      const frames = Array.from({ length: 9 }, (_, i) => {
        const t = i / 8;
        return { transform: at(x + side * spread * t, y - 4 * height * t * (1 - t)), opacity: 1 - t * t };
      });
      return play(el, frames, { duration: ms, easing: 'linear' }).then(() => el.remove());
    }));
  }

  /**
   * The waterline's transform for a fraction. glass.js puts a full glass's waterline past the rim, well above where
   * just under full sits, so the last 5% closes that gap gradually and the water doesn't jump on its way up.
   * @param {number} fraction @param {number} px
   */
  function level(fraction, px) {
    const near = DripGlass.waterline(0.95, px);
    const y = fraction >= 1 ? 0 : fraction > 0.95 ? near * (1 - fraction) / 0.05 : DripGlass.waterline(fraction, px);
    return `translateY(${y.toFixed(2)}px)`;
  }

  /**
   * The water's surface on screen.
   * @param {SVGSVGElement} glass @param {number} fraction @param {number} px
   */
  function surfaceY(glass, fraction, px) {
    const r = glass.getBoundingClientRect();
    return r.top + (Math.max(0, fraction >= 1 ? 0 : DripGlass.waterline(fraction, px)) / VIEW_H) * r.height;
  }

  /**
   * The water bobs from `from` up past `to`, back under it, and settles. The glass is set to `to` at once, so the
   * caller's redraws, which set the same level, change nothing. Until `delay` is up the water stays at `from`.
   * @param {SVGSVGElement} glass @param {number} px @param {number} from @param {number} to
   * @param {{delay?: number, ms?: number}} [opts]
   */
  function bob(glass, px, from, to, { delay = 0, ms = BOB_MS } = {}) {
    const wave = /** @type {SVGPathElement | null} */ (glass.querySelector('.drip-glass-wave'));
    if (!wave) return Promise.resolve();
    wave.getAnimations().forEach((a) => a.cancel());
    wave.style.transition = 'none';
    DripGlass.set(glass, to, px);
    // A full glass shows the water's surface through the rim. It appears as the water gets there, not before.
    const surface = glass.querySelector('.drip-glass-surface');
    if (surface && to >= 1) play(surface, [{ opacity: 0 }, { opacity: 0, offset: 0.75 }, { opacity: 1 }], { duration: delay + ms, fill: 'none' });
    // A damped bounce, sampled.
    const frames = Array.from({ length: 15 }, (_, i) => {
      const t = i / 14;
      const f = to + (from - to) * Math.exp(-5 * t) * Math.cos(t * Math.PI * 2.5);
      return { transform: level(Math.max(0, Math.min(1, f)), px) };
    });
    return play(wave, frames, { duration: ms, delay, easing: 'linear', fill: 'backwards' }).then(() => {
      wave.style.transition = '';
    });
  }

  /**
   * +15m: a drop leaves the drop counter, arcs over the glass, and falls in. A ring spreads, two droplets splash, and
   * the water bobs up from `from` to `to`. `onLand` runs as it hits the water, for the minutes to change then.
   * `counter` is where the drop counter's icon was when +15m was pressed, since the page may have redrawn it since.
   * @param {{counter: DOMRect, glass: SVGSVGElement, px: number, from: number, to: number, onLand?: () => void}} o
   */
  async function pour({ counter: c, glass, px, from, to, onLand }) {
    const g = glass.getBoundingClientRect();
    const x = g.left + g.width / 2;
    const start = { x: c.left + c.width / 2, y: c.top + c.height / 2 };
    const above = { x, y: g.top - 30 };
    const hit = surfaceY(glass, from, px);
    const d = drop(14);
    const landed = bob(glass, px, from, to, { delay: ARC_MS + FALL_MS });
    // Up out of the counter and over, tipping as it goes, then straight down, stretching.
    const arc = Array.from({ length: 11 }, (_, i) => {
      const t = i / 10;
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      return { transform: at(start.x + (above.x - start.x) * e, start.y + (above.y - start.y) * e - Math.sin(Math.PI * t) * 34, `rotate(${(-30 * Math.sin(Math.PI * t)).toFixed(1)}deg)`) };
    });
    await play(d, arc, { duration: ARC_MS, easing: 'linear' });
    await play(d, [
      { transform: at(x, above.y) },
      { transform: at(x, hit, 'scale(0.75, 1.3)') },
    ], { duration: FALL_MS, easing: 'cubic-bezier(0.5, 0, 1, 1)' });
    d.remove();
    onLand?.();
    ring(x, surfaceY(glass, to, px), g.width * 0.75, 6, 600);
    splash(x, hit - 2, 3, 8, 10);
    await landed;
  }

  /**
   * At 0: the glass's last water gathers under it as a drop, hangs, and falls to `floor` (a y on screen), where it
   * splashes with two rings. Resolves with the x it landed at, as soon as it lands.
   * @param {SVGSVGElement} glass @param {number} px @param {number} floor
   */
  async function lastDrop(glass, px, floor) {
    const wave = /** @type {SVGPathElement | null} */ (glass.querySelector('.drip-glass-wave'));
    if (wave) {
      wave.style.transition = 'none';
      DripGlass.set(glass, 0, px);
      requestAnimationFrame(() => { wave.style.transition = ''; });
    }
    const g = glass.getBoundingClientRect();
    const x = g.left + g.width / 2;
    const y0 = g.bottom - 1;
    const d = drop(9);
    await play(d, [{ transform: at(x, y0, 'scale(0)') }, { transform: at(x, y0 + 5, 'scale(1)') }], { duration: 260, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' });
    await play(d, [
      { transform: at(x, y0 + 5) },
      { transform: at(x, floor - 8, 'scale(0.8, 1.35)') },
    ], { duration: 560, easing: 'cubic-bezier(0.5, 0, 1, 1)' });
    d.remove();
    ring(x, floor - 8, 120, 18, 800);
    ring(x, floor - 8, 70, 11, 700, 140);
    splash(x, floor - 10, 5, 22, 26, 460);
    return x;
  }

  /**
   * The lock's water rises from x (on screen) at its bottom edge instead of evenly: the overlay is cut to an ellipse
   * around that point that grows faster than the crest climbs, so the water pools there and spreads as it rises.
   * @param {HTMLElement} lock @param {number} x
   */
  function riseFrom(lock, x) {
    const r = lock.getBoundingClientRect();
    const cx = x - r.left;
    return play(lock, [
      { clipPath: `ellipse(0px 0px at ${cx}px 100%)` },
      { clipPath: `ellipse(${r.width * 0.35}px ${r.height * 0.45}px at ${cx}px 100%)`, offset: 0.35 },
      { clipPath: `ellipse(${r.width * 1.8}px ${r.height * 1.4}px at ${cx}px 100%)` },
    ], { duration: 1050, easing: 'cubic-bezier(0.3, 0.55, 0.35, 1)', fill: 'none' });
  }

  /**
   * +15m on the lock: the drop in the button's price falls out, past the panel, into the water at `floor`, with a ring.
   * @param {HTMLElement} button @param {number} floor
   */
  async function fallIn(button, floor) {
    const icon = /** @type {HTMLElement | null} */ (button.querySelector('.drip-price .drip-token-drop'));
    if (!icon) return;
    const c = icon.getBoundingClientRect();
    const x = c.left + c.width / 2;
    icon.style.visibility = 'hidden';
    const d = drop(12);
    await play(d, [
      { transform: at(x, c.top + c.height / 2) },
      { transform: at(x, floor, 'scale(0.7, 1.3)') },
    ], { duration: 380, easing: 'cubic-bezier(0.5, 0, 1, 1)' });
    d.remove();
    ring(x, floor + 2, 70, 13, 650);
  }

  /**
   * The pill's glass bobs up from empty after +15m on the lock, with a ring on the water. It stays empty for `delay`.
   * @param {SVGSVGElement} glass @param {number} px @param {number} to @param {number} [delay]
   */
  function refill(glass, px, to, delay = 0) {
    const g = glass.getBoundingClientRect();
    const done = bob(glass, px, 0, to, { delay, ms: 650 });
    ring(g.left + g.width / 2, surfaceY(glass, to, px), g.width * 0.8, 4, 500, delay);
    return done;
  }

  // The drop, ring, and splash are counter.js's too, for drops falling into the drop counter.
  /** @type {any} */ (globalThis).DripPour = { reduced, pour, lastDrop, riseFrom, fallIn, refill, play, drop, ring, splash, at };
})();
