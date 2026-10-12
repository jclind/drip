// @ts-check
// The reveal animation (DESIGN.md, "Reveal animation as built"), shared by the home page (home.js) and the welcome
// tour (welcome.js). A reveal deals a face-down card from the card counter into the card's box while the page opens
// to make room: the stats lift, the buttons ride down, and on the way +15m and Reveal video turn into Stash, Reveal
// next, and × through a goo filter. The card waits with a sheen until the video is found and its picture loads, then
// flips over. Reveal next flips the old card face down and tosses it aside as the next is dealt. Pass flips it, drops
// it, and runs the opening backwards. A classic script that sets globalThis.DripReveal.
//
// The callers own their markup and their state. Each animation takes the live page and a few builders, works on the
// page's own elements, and resolves when it's done. The caller holds its redraws until then, and redraws once at the
// end; the last frame and that redraw look the same, so nothing jumps. Reduced motion never calls in here.

(() => {
  /** @type {any} */
  const { h, icon } = /** @type {any} */ (globalThis).DripUI;

  const OPEN_MS = 560;
  const OPEN_EASE = 'cubic-bezier(0.3, 0.7, 0.2, 1)';
  const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
  const GOO_MS = 950;
  const DEAL_MS = 640;
  const FLIP_MS = 560;
  const SHEEN_MS = 1600;
  /** Reveal next deals the new card this long after the old one starts going, so for a moment both are on screen. */
  const NEXT_DEAL_AT = 300;
  /** The +15m bead and ×, the size of a round button. */
  const BEAD = 42;

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Element.animate, holding its last frame, as a promise that resolves when it ends or is cancelled.
   * @param {Element} el @param {Keyframe[]} keyframes @param {KeyframeAnimationOptions} options
   */
  function play(el, keyframes, options) {
    return el.animate(keyframes, { fill: 'both', ...options }).finished.then(() => {}, () => {});
  }

  /** @param {Element} el */
  const stop = (el) => el.getAnimations().forEach((a) => a.cancel());
  /** @param {number} ms */
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // The card. Its box (.drip-thumb.is-dealt) holds one .drip-deal with a back and a front. Face up, the front shows
  // the picture; the card on the page always has this shape, animating or not.

  /**
   * A card for a thumbnail box: the gold back, and `face` (the picture) on the front.
   * @param {Node | null} face
   * @param {boolean} up Face up, as on a card already revealed.
   */
  function dealCard(face, up) {
    return h('div', { class: `drip-deal${up ? ' is-up' : ''}`, 'aria-hidden': 'true' },
      h('div', { class: 'drip-deal-face drip-deal-back' }, icon('card')),
      h('div', { class: 'drip-deal-face drip-deal-front' }, face));
  }

  /**
   * Chrome restarts a CSS animation whenever its element is put back into the page, and the waiting card moves boxes
   * when the video arrives. A negative delay from the page's clock starts every restart at the same point of the
   * sweep, so the move doesn't show. Call it right after the card goes into a box on the page.
   * @param {HTMLElement} card
   */
  function keepSheen(card) {
    const now = Number(document.timeline.currentTime) || 0;
    card.style.setProperty('--drip-sheen-at', `${-(now % SHEEN_MS)}ms`);
  }

  /**
   * Places a card in `root`'s own layer over `thumb`'s box, so nothing clips it while it flies.
   * @param {HTMLElement} root @param {HTMLElement} card @param {HTMLElement} thumb
   */
  function fly(root, card, thumb) {
    const r = root.getBoundingClientRect();
    const box = thumb.getBoundingClientRect();
    card.classList.add('is-flying');
    Object.assign(card.style, {
      left: `${box.left - r.left}px`, top: `${box.top - r.top}px`, width: `${box.width}px`, height: `${box.height}px`,
    });
    root.append(card);
    return box;
  }

  /** Where `from`'s center is from `box`'s, and the scale that makes the box `from`'s height when turned a quarter. */
  function offset(/** @type {DOMRect} */ box, /** @type {Element} */ from) {
    const f = from.getBoundingClientRect();
    return { dx: f.left + f.width / 2 - (box.left + box.width / 2), dy: f.top + f.height / 2 - (box.top + box.height / 2), k: f.height / box.width };
  }

  /** The flight from the counter's card icon to the box: it turns from portrait to landscape and grows as it comes. */
  function flight(/** @type {{dx: number, dy: number, k: number}} */ o) {
    return [
      { transform: `translate(${o.dx}px, ${o.dy}px) rotate(-78deg) scale(${o.k})` },
      { transform: `translate(${o.dx * 0.4}px, ${o.dy * 0.4 - 26}px) rotate(-24deg) scale(0.62)`, offset: 0.55 },
      { transform: 'translate(0, -3px) rotate(0.6deg) scale(1.02)', offset: 0.85 },
      { transform: 'none' },
    ];
  }

  /**
   * Deals a face-down card from `from` (the counter's card icon) into `thumb`. Resolves with the card once it's in the
   * box, waiting with its sheen.
   * @param {HTMLElement} root @param {Element} from @param {HTMLElement} thumb
   */
  async function deal(root, from, thumb) {
    const card = /** @type {HTMLElement} */ (dealCard(null, false));
    const box = fly(root, card, thumb);
    const back = /** @type {HTMLElement} */ (card.firstElementChild);
    // Fades go on the faces, never the card: opacity on the card flattens its 3D, and the back shows through the front.
    play(back, [{ opacity: 0 }, { opacity: 1 }], { duration: 60 });
    await play(card, flight(offset(box, from)), { duration: DEAL_MS, easing: 'cubic-bezier(0.3, 0.6, 0.3, 1)' });
    stop(card);
    stop(back);
    card.classList.remove('is-flying');
    card.removeAttribute('style');
    thumb.append(card);
    thumb.classList.remove('is-empty');
    card.classList.add('is-waiting');
    keepSheen(card);
    return card;
  }

  /**
   * A reveal that found nothing spent nothing, so the card flies back to the counter.
   * @param {HTMLElement} root @param {HTMLElement} card @param {Element} to
   */
  async function undeal(root, card, to) {
    const thumb = /** @type {HTMLElement} */ (card.parentElement);
    card.classList.remove('is-waiting');
    const box = fly(root, card, thumb);
    const back = /** @type {HTMLElement} */ (card.firstElementChild);
    play(back, [{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: DEAL_MS });
    // The deal's flight played backwards: the frames reversed, and each offset measured from the other end.
    const path = flight(offset(box, to)).reverse().map((f) => ('offset' in f ? { ...f, offset: 1 - Number(f.offset) } : f));
    await play(card, path, { duration: DEAL_MS, easing: 'cubic-bezier(0.5, 0, 0.7, 0.4)' });
    card.remove();
  }

  /**
   * Turns the card face up. The sheen fades as it turns instead of stopping mid-sweep.
   * @param {HTMLElement} card
   */
  async function flip(card) {
    card.classList.add('is-settling');
    await play(card, [
      { transform: 'rotateY(0deg)' },
      { transform: 'rotateY(90deg) scale(1.05) translateY(-4px)', offset: 0.5 },
      { transform: 'rotateY(180deg)' },
    ], { duration: FLIP_MS, easing: EASE });
    stop(card);
    card.classList.remove('is-waiting', 'is-settling');
    card.classList.add('is-up');
  }

  /**
   * Turns a face-up card face down, then tosses it: aside for Reveal next, straight down for Pass.
   * @param {HTMLElement} card @param {'aside' | 'down'} toward
   */
  async function toss(card, toward) {
    card.classList.remove('is-up');
    await play(card, [
      { transform: 'rotateY(180deg)' },
      { transform: 'rotateY(270deg) scale(1.03)', offset: 0.5 },
      { transform: 'rotateY(360deg)' },
    ], { duration: 420, easing: EASE });
    const out = toward === 'aside' ? 'translate(-44px, 14px) rotate(-7deg) scale(0.94)' : 'translateY(36px) scale(0.96)';
    play(/** @type {Element} */ (card.firstElementChild), [{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-in' });
    await play(card, [{ transform: 'rotateY(360deg)' }, { transform: `${out} rotateY(360deg)` }], { duration: 300, easing: 'ease-in' });
    card.remove();
  }

  // The buttons. Plain pills stand in for them while they move, under an SVG goo filter that blurs them together and
  // sharpens the result, so pills that touch merge and pills that part pinch apart like water.

  /** @type {Element | null} */
  let blurNode = null;

  function gooFilter() {
    if (blurNode && blurNode.isConnected) return blurNode;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
    const filter = document.createElementNS(ns, 'filter');
    filter.id = 'drip-goo';
    for (const [k, v] of Object.entries({ x: '-10%', y: '-50%', width: '120%', height: '200%' })) filter.setAttribute(k, v);
    const blur = document.createElementNS(ns, 'feGaussianBlur');
    blur.setAttribute('in', 'SourceGraphic');
    blur.setAttribute('stdDeviation', '0');
    blur.setAttribute('result', 'blur');
    const matrix = document.createElementNS(ns, 'feColorMatrix');
    matrix.setAttribute('in', 'blur');
    matrix.setAttribute('mode', 'matrix');
    matrix.setAttribute('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10');
    filter.append(blur, matrix);
    svg.append(filter);
    document.body.append(svg);
    blurNode = blur;
    return blur;
  }

  /**
   * Eases the goo's blur between two values. It's up while the pills merge and split, and back to 0 before they land,
   * so they settle as clean pills.
   * @param {number} from @param {number} to @param {number} ms @param {number} [delay]
   */
  function blur(from, to, ms, delay = 0) {
    const node = gooFilter();
    let start = 0;
    /** @param {number} now */
    const step = (now) => {
      if (!start) start = now + delay;
      const t = Math.min(1, Math.max(0, (now - start) / ms));
      node.setAttribute('stdDeviation', (from + (to - from) * t).toFixed(2));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** @typedef {{x: number, w: number}} Span */

  /** Left edge and width of `el` inside `row`. @returns {Span} */
  function span(/** @type {Element} */ el, /** @type {Element} */ row) {
    const r = el.getBoundingClientRect();
    return { x: r.left - row.getBoundingClientRect().left, w: r.width };
  }

  /** @param {number} x @param {number} w @param {Record<string, string | number>} [more] */
  const at = (x, w, more = {}) => ({ left: `${x}px`, width: `${w}px`, ...more });
  /** @param {Element} el */
  const color = (el) => getComputedStyle(el).backgroundColor;

  /**
   * Where the empty page's +15m and Reveal video sit, and their colors.
   * @typedef {{a: Span, r: Span, W: number, gray: string, gold: string}} Empty
   * @param {HTMLElement} row The empty page's .drip-actions.
   * @returns {Empty}
   */
  function measureEmpty(row) {
    const add = /** @type {HTMLElement} */ (row.querySelector('.drip-add'));
    const rev = /** @type {HTMLElement} */ (row.querySelector('.drip-reveal'));
    return { a: span(add, row), r: span(rev, row), W: row.offsetWidth, gray: color(add), gold: color(rev) };
  }

  /**
   * Where the card's Stash, Reveal next, and × sit.
   * @typedef {{s: Span, n: Span, p: Span}} Three
   * @param {Element} row The card's .drip-card-actions.
   * @returns {Three}
   */
  function measureThree(row) {
    /** @param {string} sel */
    const of = (sel) => span(/** @type {Element} */ (row.querySelector(sel)), row);
    return { s: of('.drip-card-save'), n: of('.drip-next'), p: of('.drip-pass') };
  }

  /**
   * +15m and Reveal video turning into Stash, Reveal next, and ×. +15m shrinks to a bead against Reveal, and Stash grows
   * back out of it. × waits under Reveal's end and pinches off as Reveal next pulls back. Reveal turns gray on the way.
   * @param {Empty} e @param {Three} t
   */
  function forward(e, t) {
    const { a, r, W, gray, gold } = e;
    const gap = 14;
    const stashMid = t.s.w - 6;
    return [
      [at(a.x, a.w, { backgroundColor: gray }), at(a.x, BEAD, { offset: 0.4 }), at(a.x, stashMid, { offset: 0.8 }), at(t.s.x, t.s.w, { backgroundColor: gray })],
      [at(W - BEAD, BEAD, { backgroundColor: gray }), at(W - BEAD, BEAD, { offset: 0.4 }), at(W - BEAD, BEAD, { offset: 0.8 }), at(t.p.x, t.p.w, { backgroundColor: gray })],
      [at(r.x, r.w, { backgroundColor: gold }), at(a.x + BEAD, W - a.x - BEAD, { offset: 0.4, backgroundColor: gray }),
        at(stashMid + gap, W - BEAD - gap - (stashMid + gap), { offset: 0.8, backgroundColor: gray }), at(t.n.x, t.n.w, { backgroundColor: gray })],
    ];
  }

  /** The same, backwards: × runs into Reveal next, Stash shrinks to the bead, and they settle as +15m and gold Reveal. */
  function backward(/** @type {Empty} */ e, /** @type {Three} */ t) {
    const { a, r, W, gray, gold } = e;
    return [
      [at(t.s.x, t.s.w, { backgroundColor: gray }), at(a.x, BEAD, { offset: 0.5 }), at(a.x, a.w, { backgroundColor: gray })],
      [at(t.p.x, t.p.w, { backgroundColor: gray }), at(W - BEAD, BEAD, { offset: 0.5 }), at(W - BEAD, BEAD, { backgroundColor: gray })],
      [at(t.n.x, t.n.w, { backgroundColor: gray }), at(a.x + BEAD, W - a.x - BEAD, { offset: 0.5, backgroundColor: gray }), at(r.x, r.w, { backgroundColor: gold })],
    ];
  }

  /**
   * Runs pills through their keyframes over `wrap`, under the goo. Resolves with the layer once they land.
   * @param {HTMLElement} wrap @param {Keyframe[][]} frames
   */
  async function morph(wrap, frames) {
    gooFilter();
    const layer = h('div', { class: 'drip-blobs', 'aria-hidden': 'true' });
    wrap.append(layer);
    const runs = frames.map((keys) => {
      const blob = h('span', {});
      blob.style.backgroundColor = String(keys[0].backgroundColor);
      layer.append(blob);
      return play(blob, keys, { duration: GOO_MS, easing: EASE });
    });
    blur(0, 4, GOO_MS * 0.15);
    blur(4, 0, GOO_MS * 0.12, GOO_MS * 0.74);
    await Promise.all(runs);
    return layer;
  }

  /**
   * Fades a row's labels and icons in or out, leaving the buttons' backgrounds alone.
   * @param {Element} row @param {boolean} show @param {number} ms
   */
  function labels(row, show, ms) {
    const parts = [...row.querySelectorAll('.drip-b > *')];
    return Promise.all(parts.map((el) => play(el, show ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], { duration: ms })));
  }

  /** Fades elements in with a small rise, one after another. @param {Element[]} els @param {number} delay */
  function textIn(els, delay) {
    return Promise.all(els.map((el, i) => play(el, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
      { duration: 320, delay: delay + i * 90, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' })));
  }

  /** @param {Element[]} els */
  function textOut(els) {
    return Promise.all(els.map((el) => play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 })));
  }

  // Stash opens and folds in step with the card's space, so the page moves as one piece.

  /**
   * @typedef {{now: () => HTMLElement | null, build: (open: boolean) => HTMLElement}} Saved
   * @param {Saved | undefined} saved @param {boolean} open @param {KeyframeAnimationOptions} timing
   */
  async function foldSaved(saved, open, timing) {
    const old = saved?.now();
    if (!saved || !old) return;
    const next = saved.build(open);
    const from = old.offsetHeight;
    if (open) {
      old.replaceWith(next);
      const to = next.offsetHeight;
      if (to === from) return;
      next.style.overflow = 'hidden';
      const list = next.querySelector('.drip-saved-list, .drip-saved-empty');
      if (list) play(list, [{ opacity: 0 }, { opacity: 1 }], { duration: Number(timing.duration) * 0.6, delay: Number(timing.delay || 0) + Number(timing.duration) * 0.4 });
      await play(next, [{ height: `${from}px` }, { height: `${to}px` }], timing);
      stop(next);
      next.style.overflow = '';
      if (list) stop(list);
      return;
    }
    // Folding, the rows stay in until the section is down to its heading.
    const head = old.querySelector('.drip-saved-head');
    const to = head ? /** @type {HTMLElement} */ (head).offsetHeight : 0;
    if (to === from) {
      old.replaceWith(next);
      return;
    }
    old.style.overflow = 'hidden';
    const list = old.querySelector('.drip-saved-list, .drip-saved-empty');
    if (list) play(list, [{ opacity: 1 }, { opacity: 0 }], { duration: Number(timing.duration) * 0.4, delay: timing.delay });
    await play(old, [{ height: `${from}px` }, { height: `${to}px` }], timing);
    old.replaceWith(next);
  }

  // The card's space. While the animation runs, the card's picture, title, and meta row sit in one block that opens
  // and closes, with the buttons in a row under it.

  /**
   * Splits a card into the block that opens and the buttons' row. The layout doesn't change: the block's 16px of
   * padding is the space drip.css puts above the buttons.
   * @param {HTMLElement} card
   */
  function split(card) {
    const thumb = /** @type {HTMLElement} */ (card.querySelector('.drip-thumb'));
    const title = /** @type {HTMLElement} */ (card.querySelector('.drip-card-title'));
    const meta = /** @type {HTMLElement} */ (card.querySelector('.drip-card-meta-row'));
    const row = /** @type {HTMLElement} */ (card.querySelector('.drip-card-actions'));
    const body = h('div', { class: 'drip-open-body' }, thumb, title, meta);
    const wrap = h('div', { class: 'drip-open-row' }, row);
    card.replaceChildren(body, wrap);
    return { body, wrap, thumb, title, meta, row };
  }

  /**
   * The card's parts, from a card the caller built.
   * @param {HTMLElement} card
   */
  function parts(card) {
    const thumb = /** @type {HTMLElement} */ (card.querySelector('.drip-thumb'));
    return {
      thumb,
      deal: /** @type {HTMLElement | null} */ (thumb.querySelector('.drip-deal')),
      title: /** @type {HTMLElement} */ (card.querySelector('.drip-card-title')),
      meta: /** @type {HTMLElement} */ (card.querySelector('.drip-card-meta-row')),
      row: /** @type {HTMLElement} */ (card.querySelector('.drip-card-actions')),
    };
  }

  /**
   * Swaps the landed card into the real card's box, in place of the face-up one the caller drew, and takes that one's
   * picture onto its front. The caller's box (home.js keeps it across redraws) then holds the card that was dealt.
   * @param {HTMLElement} landed @param {ReturnType<typeof parts>} real
   */
  function adopt(landed, real) {
    const front = /** @type {HTMLElement} */ (landed.querySelector('.drip-deal-front'));
    const drawn = real.deal;
    if (drawn) {
      front.replaceChildren(...drawn.querySelector('.drip-deal-front')?.childNodes || []);
      drawn.replaceWith(landed);
    } else real.thumb.append(landed);
    real.thumb.classList.add('is-dealt');
    keepSheen(landed);
  }

  /**
   * What every animation needs from its caller.
   * @typedef {object} Options
   * @property {HTMLElement} root The home page's #drip-home. The flying card is drawn in it.
   * @property {HTMLElement} page Its .drip-page, which lifts the stats while a card is up.
   * @property {Element} counter The card icon in the stats, where cards are dealt from.
   * @property {(video: any) => HTMLElement} card The caller's card for a video, or its loading card for null.
   * @property {() => HTMLElement} actions The empty page's +15m and Reveal video.
   * @property {() => Promise<any>} find Finds and pays for the next video. Resolves with it, or null if that failed.
   * @property {(video: any) => Promise<void>} ready Resolves once the video's picture has loaded, or given up on.
   * @property {Saved} [saved] Stash, which folds while a card is up.
   */

  /** Shows the count one card lower as the card leaves it. Returns a function that puts it back. */
  function spendShown(/** @type {Element} */ counter) {
    const count = counter.nextElementSibling;
    if (!count) return () => {};
    const was = count.textContent;
    const n = Number(was);
    if (Number.isFinite(n) && n > 0) count.textContent = String(n - 1);
    return () => { count.textContent = was; };
  }

  /**
   * Reveal from the empty page. Resolves true once the card is face up with its buttons, or false after a failed
   * reveal has put everything back.
   * @param {Options} o
   */
  async function reveal(o) {
    const oldRow = /** @type {HTMLElement} */ (o.page.querySelector('.drip-actions'));
    const empty = measureEmpty(oldRow);

    // The loading card goes in where the buttons were, its block 0px tall, and its buttons under it.
    const shell = o.card(null);
    const s = split(shell);
    s.thumb.classList.add('is-empty');
    shell.inert = true;
    oldRow.replaceWith(shell);
    const H = s.body.offsetHeight;
    const three = measureThree(s.row);
    s.row.style.opacity = '0';
    // The old buttons' labels fade over the pills.
    oldRow.classList.add('drip-ghost');
    s.wrap.append(oldRow);
    play(oldRow, [{ opacity: 1 }, { opacity: 0 }], { duration: 150 }).then(() => oldRow.remove());

    o.page.classList.add('is-open');
    foldSaved(o.saved, false, { duration: OPEN_MS, easing: OPEN_EASE });
    // The padding opens with the height. Left at 16px, it would drop the buttons 16px the moment the space started.
    const opened = play(s.body, [{ height: '0px', paddingBottom: '0px' }, { height: `${H}px`, paddingBottom: '16px' }], { duration: OPEN_MS, easing: OPEN_EASE })
      .then(() => {
        stop(s.body);
        s.body.style.overflow = 'visible';
      });
    const putBack = spendShown(o.counter);
    const landing = deal(o.root, o.counter, s.thumb);
    const formed = morph(s.wrap, forward(empty, three)).then(async (layer) => {
      s.row.style.opacity = '';
      layer.remove();
      await labels(s.row, true, 200);
    });

    const video = await o.find();
    if (!video) {
      putBack();
      const [card] = await Promise.all([landing, opened, formed]);
      await undeal(o.root, card, o.counter);
      await close(o, shell, s, empty);
      return false;
    }

    const real = parts(o.card(video));
    const [card] = await Promise.all([landing, opened]);
    adopt(card, real);
    real.title.classList.add('drip-held');
    real.meta.classList.add('drip-held');
    s.body.replaceChildren(real.thumb, real.title, real.meta);
    // The buttons that just formed look the same as the real ones, which take over once the pills have landed.
    const rowIn = formed.then(() => s.wrap.replaceChildren(real.row));
    await o.ready(video);
    const flipped = flip(card);
    real.title.classList.remove('drip-held');
    real.meta.classList.remove('drip-held');
    await Promise.all([flipped, rowIn, textIn([real.title, real.meta], 240)]);
    return true;
  }

  /**
   * Reveal next, on a card that's up. Resolves true once the new card is face up, or false if nothing new came, after
   * the dealt card has gone back to the counter.
   * @param {Options} o
   */
  async function next(o) {
    const shown = /** @type {HTMLElement} */ (o.page.querySelector('.drip-card'));
    const old = parts(shown);
    shown.inert = true;
    const nextButton = old.row.querySelector('.drip-next');
    const label = nextButton?.querySelector('.drip-next-label');
    if (label) label.textContent = 'Revealing…';
    nextButton?.querySelector('.drip-price')?.remove();
    old.row.classList.add('is-waiting');
    textOut([old.title, old.meta]);
    const tossed = old.deal ? toss(old.deal, 'aside') : Promise.resolve();
    await wait(NEXT_DEAL_AT);
    const putBack = spendShown(o.counter);
    const dealing = deal(o.root, o.counter, old.thumb);
    // The new card goes into the real box only once the old one is gone.
    const landing = Promise.all([dealing, tossed]).then(([card]) => card);

    const video = await o.find();
    if (!video) {
      putBack();
      await undeal(o.root, await landing, o.counter);
      return false;
    }
    const real = parts(o.card(video));
    const card = await landing;
    old.thumb.replaceWith(real.thumb);
    adopt(card, real);
    real.title.classList.add('drip-held');
    real.meta.classList.add('drip-held');
    old.title.replaceWith(real.title);
    old.meta.replaceWith(real.meta);
    real.row.classList.add('is-waiting');
    old.row.replaceWith(real.row);
    await o.ready(video);
    const flipped = flip(card);
    real.title.classList.remove('drip-held');
    real.meta.classList.remove('drip-held');
    await Promise.all([flipped, textIn([real.title, real.meta], 240)]);
    real.row.classList.remove('is-waiting');
    return true;
  }

  /**
   * Closes the card's space and turns its buttons back into +15m and Reveal video, with Stash opening in step. Ends
   * with the empty page's buttons where the card was.
   * @param {Options} o @param {HTMLElement} card @param {ReturnType<typeof split>} s @param {Empty} empty
   */
  async function close(o, card, s, empty) {
    const three = measureThree(s.row);
    await labels(s.row, false, 120);
    s.row.style.opacity = '0';
    s.body.style.overflow = '';
    const H = s.body.offsetHeight;
    o.page.classList.remove('is-open');
    const timing = { duration: OPEN_MS, delay: 120, easing: EASE };
    // The padding closes with the height, or the buttons jump up 16px once the space is gone.
    const closing = play(s.body, [{ height: `${H}px`, paddingBottom: '16px' }, { height: '0px', paddingBottom: '0px' }], timing);
    const saved = foldSaved(o.saved, true, timing);
    const layer = await morph(s.wrap, backward(empty, three));
    await closing;
    const actions = o.actions();
    card.replaceWith(actions);
    layer.remove();
    await Promise.all([labels(actions, true, 200), saved]);
  }

  /**
   * Pass, on a card that's up: the card turns face down and drops, and the page closes back to the empty one.
   * @param {Options} o
   */
  async function pass(o) {
    const shown = /** @type {HTMLElement} */ (o.page.querySelector('.drip-card'));
    const old = parts(shown);
    shown.inert = true;
    textOut([old.title, old.meta]);
    if (old.deal) await toss(old.deal, 'down');
    // The empty page's buttons, measured where they'll be, under the card's row.
    const s = split(shown);
    const probe = o.actions();
    probe.style.cssText = 'position:absolute;left:0;right:0;top:0;visibility:hidden';
    s.wrap.append(probe);
    const empty = measureEmpty(probe);
    probe.remove();
    await close(o, shown, s, empty);
  }

  /** @type {any} */ (globalThis).DripReveal = { reveal, next, pass, dealCard, reduced };
})();
