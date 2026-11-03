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
  const reduced = () => pour().reduced();
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
   * `roll` sets the length and easing of a one-number roll, for counts that roll on a clock (rain).
   * @param {HTMLElement} el A num() element. @param {number} n
   * @param {{animate?: boolean, most?: number, settle?: number, roll?: {ms: number, easing: string}}} [o]
   */
  function to(el, n, { animate = true, most = 10, settle = 300, roll = undefined } = {}) {
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
    queue.chain = queue.chain.then(() => (queue.gen === gen ? move(el, from, n, most, settle, () => queue.gen !== gen, roll) : undefined));
    return queue.chain;
  }

  /**
   * @param {HTMLElement} el @param {number} from @param {number} n @param {number} most @param {number} settle
   * @param {() => boolean} stale Whether a set at once has taken over.
   * @param {{ms: number, easing: string}} [roll]
   */
  async function move(el, from, n, most, settle, stale, roll) {
    const up = n > from;
    const steps = Math.min(Math.abs(n - from), most);
    for (let i = 1; i <= steps; i += 1) {
      if (stale()) return;
      const last = i === steps;
      // One step is the odometer's roll. Several run fast and even, and the last settles with a small overshoot.
      const timing = steps === 1 ? roll || { ms: 280, easing: OUT }
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
   * A counter that something is arriving in. The caller holds what's arriving back from the count, and `release`
   * lets `n` more of it in, rolling the count with `roll`. So a drop spent while others are still falling counts at
   * once, and the count always ends on the balance.
   * @typedef {object} Arrival
   * @property {HTMLElement} row The .drip-count, which the tag sits beside.
   * @property {Element} icon Its icon.
   * @property {HTMLElement} num Its num().
   * @property {number} add How many are arriving.
   * @property {(n: number, roll?: {animate?: boolean, most?: number, settle?: number}) => Promise<void>} release
   */

  /** The counter's page was left or hidden, so nothing should fall into it. @param {Arrival} c */
  const gone = (c) => !c.row.isConnected || !c.row.getClientRects().length || document.hidden;

  /**
   * Drops fall into the counter from the top of the window, one every `gap` ms, and the count rolls up as each lands.
   * Five fall at most. With more to add, the count rolls on a clock instead (`climb`). If the page goes away meanwhile,
   * the rest come in at once.
   * @param {Arrival} c @param {number} gap
   */
  async function rain(c, gap) {
    if (c.add > 5) return climb(c, gap);
    const count = c.add;
    let released = 0;
    const falls = [];
    for (let i = 1; i <= count; i += 1) {
      if (gone(c)) break;
      const share = Math.round((c.add * i) / count) - Math.round((c.add * (i - 1)) / count);
      released += share;
      falls.push(fall(c.icon).then(() => c.release(share, { most: 3, settle: 160 })));
      if (i < count) await sleep(gap);
    }
    await Promise.all(falls);
    if (released < c.add) await c.release(c.add - released, { animate: false });
  }

  /** The most numbers a climb shows. Past it, each roll skips ahead by an even share. */
  const CLIMB_MOST = 24;
  /** How early a climb queues its next roll. */
  const LEAD_MS = 40;

  /**
   * Five drops fall, and the count climbs one number at a time, at one even pace, from the first landing to the last,
   * with only the last number settling. Spinning up by each drop's share in turn read as five jumps, each with its
   * own bounce (Jesse, 2026-11-02, on 15 kept drops: "it jumps and then jumps again and then jumps again").
   * @param {Arrival} c @param {number} gap
   */
  async function climb(c, gap) {
    const drops = 5;
    const steps = Math.min(c.add, CLIMB_MOST);
    // From the first landing to the last. The last number lands with the last drop.
    const span = gap * (drops - 1);
    const tick = span / (steps - 1);
    const falls = [fall(c.icon)];
    const dropping = (async () => {
      for (let i = 2; i <= drops; i += 1) {
        await sleep(gap);
        if (gone(c)) return;
        falls.push(fall(c.icon));
      }
    })();
    await falls[0];
    let released = 0;
    const start = performance.now();
    for (let i = 1; i <= steps; i += 1) {
      if (gone(c)) break;
      const share = Math.round((c.add * i) / steps) - Math.round((c.add * (i - 1)) / steps);
      released += share;
      const last = i === steps;
      // Even rolls, back to back, so the digits never stop between numbers. The last eases in.
      // most: 1, so a share bigger than one is still one roll, not a spin of its own.
      const rolled = c.release(share, { most: 1, roll: last ? { ms: 280, easing: OUT } : { ms: tick, easing: 'linear' } });
      if (last) await rolled;
      // Paced off the clock, so a slow frame doesn't push every later number back. The next roll is queued a little
      // before this one ends, so they run back to back instead of resting a frame between numbers.
      else await sleep(Math.max(0, start + tick * i - LEAD_MS - performance.now()));
    }
    await dropping;
    await Promise.all(falls);
    if (released < c.add) await c.release(c.add - released, { animate: false });
  }

  const TAG_IN = [
    { clipPath: 'inset(0 100% 0 0 round 12px)', transform: 'translate(-10px, -50%)', opacity: 0 },
    { clipPath: 'inset(0 0 0 0 round 12px)', transform: 'translate(0, -50%)', opacity: 1 },
  ];
  const TAG_OUT = [TAG_IN[1], { ...TAG_IN[0], transform: 'translate(-14px, -50%)' }];

  /**
   * A gray tag beside a counter, hidden until it slides out. It shows the counter's icon and `words` ("3 kept"), and
   * screen readers hear `said` ("Kept 3 drops.").
   * @param {Arrival} c @param {string} words @param {string} said @param {boolean} still Reduced motion.
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

  /** @param {HTMLElement} el @param {Arrival} c @param {boolean} still */
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
   * The tags stay 3 seconds and slide back in. If the page goes away partway, what's left comes in at once, with no
   * tags.
   * @param {{kind: 'kept' | 'new', drops: Arrival, cards?: Arrival}} o
   */
  async function land({ kind, drops, cards }) {
    const still = reduced();
    /** @type {[HTMLElement, Arrival][]} */
    const tags = [];
    if (drops.add > 0) {
      if (still) await drops.release(drops.add, { animate: false });
      else await rain(drops, kind === 'new' ? 240 : 320);
      if (gone(drops)) {
        if (cards && cards.add > 0) await cards.release(cards.add, { animate: false });
        return;
      }
      const n = drops.add;
      const said = kind === 'kept' ? `Kept ${plural(n, 'drop', 'drops')}.` : `${plural(n, 'new drop', 'new drops')}.`;
      tags.push([await showTag(drops, `${n} ${kind}`, said, still), drops]);
    }
    if (cards && cards.add > 0) {
      if (still || gone(cards)) await cards.release(cards.add, { animate: false });
      else {
        await sleep(150);
        squash(cards.icon);
        await cards.release(cards.add);
      }
      if (!gone(cards)) tags.push([await showTag(cards, `${cards.add} new`, `${plural(cards.add, 'new card', 'new cards')}.`, still), cards]);
    }
    if (!tags.length) return;
    await sleep(TAG_MS);
    await Promise.all(tags.map(([el, c], i) => sleep(i * 120).then(() => hideTag(el, c, still))));
  }

  /** @type {any} */ (globalThis).DripCounter = { num, value, to, squash, land };
})();
