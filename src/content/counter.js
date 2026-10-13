// @ts-check
// The drop and card counts' motion (DESIGN.md, "The counter's motion as built"), shared by the home page (home.js), the
// reveal animation (reveal.js), and the welcome tour (welcome.js). A count that changes by one rolls like an odometer,
// up when it grows and down when something is spent. A count that jumps spins through the numbers between, 10 of them
// at most. Drops that arrive, kept by "Done for now" or added by the day's reset, fall from the top of the window into
// the drop counter, and a gray tag beside the counter says how many ("3 kept", "4 new") for 3 seconds. The day's new
// cards spin up with a tag of their own.
//
// A classic script that sets globalThis.DripCounter. The drops, rings, and splashes are pour.js's. Reduced motion
// changes the counts at once, and the tags appear and go without moving.

(() => {
  const pour = () => /** @type {any} */ (globalThis).DripPour;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** @param {number} ms */
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const OUT = 'cubic-bezier(0.3, 0.7, 0.2, 1)';
  const TAG_MS = 3000;

  /** @param {number} n */
  function digit(n) {
    const el = document.createElement('span');
    el.className = 'drip-digit';
    el.textContent = String(n);
    return el;
  }

  /**
   * A count's number. While it changes, the old and new digits share one grid cell, so they can pass each other.
   * @param {number} n
   */
  function num(n) {
    const el = document.createElement('span');
    el.className = 'drip-num';
    el.dataset.n = String(n);
    el.append(digit(n));
    return el;
  }

  /**
   * The number a count shows, or is on its way to.
   * @param {HTMLElement} el A num() element.
   */
  const value = (el) => Number(el.dataset.n) || 0;

  /**
   * Each number's moves run one after another. Setting one at once bumps `gen`, so the moves still waiting are dropped.
   * @type {WeakMap<HTMLElement, {chain: Promise<void>, gen: number}>}
   */
  const queues = new WeakMap();

  /**
   * Moves a count to `n`: a roll by one, a spin through a jump, or with `animate` false, at once. Resolves once it
   * shows `n`. `most` caps how many numbers a spin shows, and `settle` is how long its last one takes to settle.
   * @param {HTMLElement} el A num() element. @param {number} n
   * @param {{animate?: boolean, most?: number, settle?: number}} [o]
   */
  function to(el, n, { animate = true, most = 10, settle = 300 } = {}) {
    let q = queues.get(el);
    if (!q) queues.set(el, (q = { chain: Promise.resolve(), gen: 0 }));
    const queue = q;
    const from = value(el);
    el.dataset.n = String(n);
    // At 0 the counter's icon dims (drip.css), and it lights up as the first drop lands.
    el.closest('.drip-count')?.classList.toggle('is-zero', n < 1);
    if (!animate || reduced()) {
      queue.gen += 1;
      el.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      el.classList.remove('is-clip');
      el.replaceChildren(digit(n));
      queue.chain = Promise.resolve();
      return queue.chain;
    }
    if (from === n) return queue.chain;
    const gen = queue.gen;
    queue.chain = queue.chain.then(() => (queue.gen === gen ? move(el, from, n, most, settle, () => queue.gen !== gen) : undefined));
    return queue.chain;
  }

  /**
   * @param {HTMLElement} el @param {number} from @param {number} n @param {number} most @param {number} settle
   * @param {() => boolean} stale Whether a set at once has taken over.
   */
  async function move(el, from, n, most, settle, stale) {
    const up = n > from;
    const steps = Math.min(Math.abs(n - from), most);
    for (let i = 1; i <= steps; i += 1) {
      if (stale()) return;
      const last = i === steps;
      // One step is the odometer's roll. Several run fast and even, and the last settles with a small overshoot.
      const timing = steps === 1 ? { ms: 280, easing: OUT }
        : last ? { ms: settle, easing: 'cubic-bezier(0.3, 1.45, 0.5, 1)' }
        : { ms: Math.max(38, 340 / steps), easing: 'linear' };
      await swap(el, Math.round(from + ((n - from) * i) / steps), up, timing);
    }
  }

  /**
   * The old digits leave one way and the new ones come in from the other, clipped to the line.
   * @param {HTMLElement} el @param {number} n @param {boolean} up @param {{ms: number, easing: string}} timing
   */
  async function swap(el, n, up, { ms, easing }) {
    el.classList.add('is-clip');
    const old = el.lastElementChild;
    const next = digit(n);
    el.append(next);
    const dist = up ? 100 : -100;
    await Promise.all([
      old && pour().play(old, [{ transform: 'translateY(0)' }, { transform: `translateY(${-dist}%)` }], { duration: ms, easing }),
      pour().play(next, [{ transform: `translateY(${dist}%)` }, { transform: 'translateY(0)' }], { duration: ms, easing }),
    ]);
    // A set at once may have replaced the digits meanwhile.
    if (!next.isConnected) return;
    while (el.firstElementChild && el.firstElementChild !== next) el.firstElementChild.remove();
    next.getAnimations().forEach((a) => a.cancel());
    el.classList.remove('is-clip');
  }

  /**
   * A counter's icon squashes as something lands in it, and springs back.
   * @param {Element} icon
   */
  function squash(icon) {
    return pour().play(icon, [
      { transform: 'none' },
      { transform: 'translateY(2px) scale(1.25, 0.78)', offset: 0.3 },
      { transform: 'translateY(-2px) scale(0.92, 1.1)', offset: 0.62 },
      { transform: 'none' },
    ], { duration: 420, easing: 'ease-out', fill: 'none' });
  }

  /**
   * One drop falls from the top of the window into the counter's icon, with a ring and a splash.
   * @param {Element} icon
   */
  async function fall(icon) {
    const p = pour();
    const r = icon.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const d = p.drop(13);
    await p.play(d, [
      { transform: p.at(x, -16) },
      { transform: p.at(x, y - 2, 'scale(0.75, 1.3)') },
    ], { duration: 460, easing: 'cubic-bezier(0.5, 0, 1, 1)' });
    d.remove();
    p.ring(x, y + 7, 30, 7, 560);
    p.splash(x, y - 4, 3, 9, 10);
    squash(icon);
  }

  /**
   * @typedef {object} Counter
   * @property {HTMLElement} row The .drip-count, which the tag sits beside.
   * @property {Element} icon Its icon.
   * @property {HTMLElement} num Its num().
   */

  /**
   * Drops fall into the counter from the top of the window, one every `gap` ms, and the count rolls up as each lands.
   * Five fall at most. With more to add, each carries its share and the count spins up by it, quickly enough (3
   * numbers, about 0.24 seconds) to be done before the next one lands.
   * @param {Counter} c @param {number} n @param {number} gap
   */
  async function rain(c, n, gap) {
    const from = value(c.num);
    const added = n - from;
    const count = Math.min(added, 5);
    const falls = [];
    for (let i = 1; i <= count; i += 1) {
      const at = from + Math.round((added * i) / count);
      falls.push(fall(c.icon).then(() => to(c.num, at, { most: 3, settle: 160 })));
      if (i < count) await sleep(gap);
    }
    await Promise.all(falls);
  }

  const TAG_IN = [
    { clipPath: 'inset(0 100% 0 0 round 12px)', transform: 'translate(-10px, -50%)', opacity: 0 },
    { clipPath: 'inset(0 0 0 0 round 12px)', transform: 'translate(0, -50%)', opacity: 1 },
  ];
  const TAG_OUT = [TAG_IN[1], { ...TAG_IN[0], transform: 'translate(-14px, -50%)' }];

  /**
   * A gray tag beside a counter, hidden until it slides out. It shows the counter's icon and `words` ("3 kept"), and
   * screen readers hear `said` ("Kept 3 drops.").
   * @param {Counter} c @param {string} words @param {string} said @param {boolean} still Reduced motion.
   */
  async function showTag(c, words, said, still) {
    const el = document.createElement('span');
    el.className = 'drip-tag';
    el.setAttribute('role', 'status');
    const shown = document.createElement('span');
    shown.setAttribute('aria-hidden', 'true');
    shown.textContent = words;
    const sr = document.createElement('span');
    sr.className = 'drip-sr';
    sr.textContent = said;
    el.append(c.icon.cloneNode(true), shown, sr);
    c.row.querySelector('.drip-tag')?.remove();
    c.row.append(el);
    if (!still) await pour().play(el, TAG_IN, { duration: 420, easing: OUT });
    return el;
  }

  /** @param {HTMLElement} el @param {Counter} c @param {boolean} still */
  async function hideTag(el, c, still) {
    if (!still) await pour().play(el, TAG_OUT, { duration: 360, easing: 'cubic-bezier(0.5, 0, 0.75, 0.3)' });
    el.remove();
    if (!still) squash(c.icon);
  }

  /** @param {number} n @param {string} one @param {string} many */
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /**
   * Drops arriving in the drop counter, and on a new day cards in the card counter (Jesse's pick, design round 2's D,
   * 2026-10-13). The drops fall in, then a tag says how many. A new day's cards spin up after, with a tag of their own.
   * The tags stay 3 seconds and slide back in. Each counter starts from the number it shows. The caller holds back
   * what's arriving until this runs.
   * @param {{kind: 'kept' | 'new', drops: Counter & {to: number}, cards?: Counter & {to: number}}} o
   */
  async function land({ kind, drops, cards }) {
    const still = reduced();
    const addedDrops = drops.to - value(drops.num);
    const addedCards = cards ? cards.to - value(cards.num) : 0;
    /** @type {[HTMLElement, Counter][]} */
    const tags = [];
    if (addedDrops > 0) {
      if (still) to(drops.num, drops.to, { animate: false });
      else await rain(drops, drops.to, kind === 'new' ? 240 : 320);
      const said = kind === 'kept' ? `Kept ${plural(addedDrops, 'drop', 'drops')}.` : `${plural(addedDrops, 'new drop', 'new drops')}.`;
      tags.push([await showTag(drops, `${addedDrops} ${kind}`, said, still), drops]);
    }
    if (cards && addedCards > 0) {
      if (still) to(cards.num, cards.to, { animate: false });
      else {
        await sleep(150);
        squash(cards.icon);
        await to(cards.num, cards.to);
      }
      tags.push([await showTag(cards, `${addedCards} new`, `${plural(addedCards, 'new card', 'new cards')}.`, still), cards]);
    }
    if (!tags.length) return;
    await sleep(TAG_MS);
    await Promise.all(tags.map(([el, c], i) => sleep(i * 120).then(() => hideTag(el, c, still))));
  }

  /** @type {any} */ (globalThis).DripCounter = { num, value, to, squash, land };
})();
