// B's opening page and button morph, shared by D, E, and F. The card's space opens under the stats, the buttons ride
// down with it, and on the way the empty page's +15m and Reveal video turn into the card's Stash, Reveal next, and ×.
// Three ways to turn them:
//   goo: B's. +15m shrinks to a bead and Stash grows back out of it; × pinches off the end of Reveal next.
//   split: E's. Reveal video has left as the card, so +15m stretches across the row and splits into all three.
//   crisp: F's. No goo. Each button slides and resizes into its new job, and × grows in.

(() => {
  const { h, animate, SLOW, REDUCED } = Mock;
  const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
  const OPEN_MS = 560;
  const OPEN_EASE = 'cubic-bezier(0.3, 0.7, 0.2, 1)';
  const GOO_MS = 950;
  const CRISP_MS = 420;
  const BLANK = { id: 'blank', title: '', channel: '', length: '' };

  document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <filter id="b-goo" x="-10%" y="-50%" width="120%" height="200%">
      <feGaussianBlur id="b-blur" in="SourceGraphic" stdDeviation="0" result="blur" />
      <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10" />
    </filter></svg>`);
  const blurNode = document.getElementById('b-blur');

  /** Eases the goo filter's blur from one value to another. */
  function blur(from, to, ms, delay = 0) {
    if (REDUCED) { blurNode.setAttribute('stdDeviation', String(to)); return; }
    let start = 0;
    const step = (now) => {
      if (!start) start = now + delay * SLOW;
      const t = Math.min(1, Math.max(0, (now - start) / (ms * SLOW)));
      blurNode.setAttribute('stdDeviation', (from + (to - from) * t).toFixed(2));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Left edge and width of an element inside its row. */
  function rel(el, base) {
    const r = el.getBoundingClientRect();
    const b = base.getBoundingClientRect();
    return { x: r.left - b.left, w: r.width };
  }

  const at = (x, w, extra = {}) => ({ left: `${x}px`, width: `${w}px`, ...extra });
  const bg = (el) => getComputedStyle(el).backgroundColor;

  /** Runs plain pills through their keyframes over the row. With goo, the blur is up while they merge and split. */
  async function blobs(wrap, frames, goo) {
    const ms = goo ? GOO_MS : CRISP_MS;
    const layer = h('div', { class: `b-blobs${goo ? ' is-goo' : ''}`, 'aria-hidden': 'true' });
    wrap.append(layer);
    const runs = frames.map((keys) => {
      const blob = h('span', {});
      blob.style.backgroundColor = keys[0].backgroundColor;
      layer.append(blob);
      return animate(blob, keys, { duration: ms, easing: EASE });
    });
    if (goo) {
      blur(0, 4, ms * 0.15);
      blur(4, 0, ms * 0.12, ms * 0.74);
    }
    await Promise.all(runs);
    return layer;
  }

  /** Fades a row's labels and icons in or out, leaving the buttons' own backgrounds alone. */
  function labels(row, show, ms = 160) {
    const parts = [...row.querySelectorAll('.drip-b > *')];
    return Promise.all(parts.map((el) => animate(el, show ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], { duration: ms })));
  }

  /** The keyframes from the empty page's two buttons to the card's three, for each style. */
  function forward(style, e, fin) {
    const { a, r, W, gray, gold } = e;
    const sep = 14;
    if (style === 'goo') {
      return [
        [at(a.x, a.w, { backgroundColor: gray }), at(a.x, 42, { offset: 0.4 }), at(a.x, fin.s.w - 6, { offset: 0.8 }), at(fin.s.x, fin.s.w)],
        [at(W - 42, 42, { backgroundColor: gray }), at(W - 42, 42, { offset: 0.4 }), at(W - 42, 42, { offset: 0.8 }), at(fin.p.x, fin.p.w)],
        [at(r.x, r.w, { backgroundColor: gold }), at(a.x + 42, W - a.x - 42, { offset: 0.4, backgroundColor: gray }),
          at(fin.s.w - 6 + sep, W - 42 - sep - (fin.s.w - 6 + sep), { offset: 0.8, backgroundColor: gray }), at(fin.n.x, fin.n.w, { backgroundColor: gray })],
      ];
    }
    if (style === 'split') {
      // All three start as +15m, run across the row where Reveal video was, then pinch apart.
      const full = at(a.x, W - a.x, { offset: 0.38 });
      return [
        [at(a.x, a.w, { backgroundColor: gray }), full, at(a.x, fin.s.w - 6, { offset: 0.8 }), at(fin.s.x, fin.s.w)],
        [at(a.x, a.w, { backgroundColor: gray }), at(W - 42, 42, { offset: 0.38 }), at(W - 42, 42, { offset: 0.8 }), at(fin.p.x, fin.p.w)],
        [at(a.x, a.w, { backgroundColor: gray }), full, at(fin.s.w - 6 + sep, W - 42 - sep - (fin.s.w - 6 + sep), { offset: 0.8 }), at(fin.n.x, fin.n.w)],
      ];
    }
    return [
      [at(a.x, a.w, { backgroundColor: gray }), at(fin.s.x, fin.s.w)],
      [at(r.x, r.w, { backgroundColor: gold }), at(fin.n.x, fin.n.w, { backgroundColor: gray })],
      [at(fin.p.x + 21, 0, { backgroundColor: gray, opacity: 0 }), at(fin.p.x, fin.p.w, { opacity: 1 })],
    ];
  }

  /** The keyframes from the card's three buttons back to the empty page's two. */
  function backward(style, e, now) {
    const { a, r, W, gray, gold } = e;
    const { s, n, p } = now;
    if (style === 'goo') {
      return [
        [at(s.x, s.w, { backgroundColor: gray }), at(a.x, 42, { offset: 0.5 }), at(a.x, a.w)],
        [at(p.x, p.w, { backgroundColor: gray }), at(W - 42, 42, { offset: 0.5 }), at(W - 42, 42)],
        [at(n.x, n.w, { backgroundColor: gray }), at(a.x + 42, W - a.x - 42, { offset: 0.5, backgroundColor: gray }), at(r.x, r.w, { backgroundColor: gold })],
      ];
    }
    if (style === 'split') {
      // Gold buds from the right end of one long gray pill, which then shrinks back to +15m.
      const full = at(a.x, W - a.x, { offset: 0.5 });
      return [
        [at(p.x, p.w, { backgroundColor: gold }), at(W - 42, 42, { offset: 0.5 }), at(r.x, r.w)],
        [at(s.x, s.w, { backgroundColor: gray }), full, at(a.x, a.w)],
        [at(n.x, n.w, { backgroundColor: gray }), full, at(a.x, a.w)],
        [at(p.x, p.w, { backgroundColor: gray }), at(W - 42, 42, { offset: 0.5 }), at(a.x + a.w - 42, 42)],
      ];
    }
    return [
      [at(s.x, s.w, { backgroundColor: gray }), at(a.x, a.w)],
      [at(n.x, n.w, { backgroundColor: gray }), at(r.x, r.w, { backgroundColor: gold })],
      [at(p.x, p.w, { backgroundColor: gray, opacity: 1 }), at(p.x + 21, 0, { opacity: 0 })],
    ];
  }

  /**
   * Opens the card's space with the loading shell in it. The empty page's buttons stay as fading labels over the
   * blobs until form() turns them. Returns the state the rest needs.
   */
  function open(api) {
    api.root.classList.add('b-root');
    const oldRow = api.slot.firstElementChild;
    const [add, rev] = oldRow.children;
    const e = { a: rel(add, oldRow), r: rel(rev, oldRow), W: oldRow.offsetWidth, gray: bg(add), gold: bg(rev) };
    const revRect = rev.getBoundingClientRect();

    const shell = api.shell();
    shell.thumb.classList.add('c-stage', 'c-empty');
    const body = h('div', { class: 'b-body' }, shell.thumb, shell.title, shell.metaRow);
    const stand = api.card(BLANK);
    const wrap = h('div', { class: 'b-wrap' }, stand.row);
    api.slot.replaceChildren(h('div', { class: 'drip-card' }, body, wrap));
    // Stash folds while the space opens, so the two move as one.
    api.setMode('card', { ms: OPEN_MS, easing: OPEN_EASE });
    const H = body.offsetHeight;
    const fin = { s: rel(stand.save, stand.row), n: rel(stand.next, stand.row), p: rel(stand.pass, stand.row) };
    stand.row.style.opacity = '0';
    wrap.style.pointerEvents = 'none';

    oldRow.classList.add('b-ghost');
    wrap.append(oldRow);
    animate(oldRow, [{ opacity: 1 }, { opacity: 0 }], { duration: 150 }).then(() => oldRow.remove());

    api.page.classList.add('b-open');
    // The padding opens with the height. Left at 16px, it would drop the buttons 16px the moment the space starts opening.
    const opened = animate(body, [{ height: '0px', paddingBottom: '0px' }, { height: `${H}px`, paddingBottom: '16px' }], { duration: OPEN_MS, easing: OPEN_EASE }).then(() => {
      body.getAnimations().forEach((x) => x.cancel());
      // Open, the card can lift past the box's edge when it flips.
      body.style.overflow = 'visible';
    });
    return { api, body, wrap, stand, shell, e, fin, revRect, opened };
  }

  /** Turns the old buttons into the card's. When they land, the real buttons take over and their labels fade in. */
  async function form(ctx, style) {
    const layer = await blobs(ctx.wrap, forward(style, ctx.e, ctx.fin), style !== 'crisp');
    ctx.stand.row.style.opacity = '';
    layer.remove();
    await labels(ctx.stand.row, true, 200);
  }

  /** Puts a real card's picture, title, and meta row into the open space. */
  function placeBody(ctx, card) {
    ctx.body.replaceChildren(card.thumb, card.title, card.metaRow);
  }

  /** Puts a real card's buttons in, in place of the ones that just formed. They look the same. */
  function placeRow(ctx, card) {
    ctx.wrap.replaceChildren(card.row);
  }

  /** Closes the space and turns the card's buttons back into +15m and Reveal video. */
  async function close(ctx, card, style) {
    const { api, body, wrap } = ctx;
    const now = { s: rel(card.save, card.row), n: rel(card.next, card.row), p: rel(card.pass, card.row) };
    await labels(card.row, false, 120);
    card.row.style.opacity = '0';
    body.style.overflow = '';
    const H = body.offsetHeight;
    api.page.classList.remove('b-open');
    // The padding closes with the height, or the buttons jump up 16px when the space is gone. Stash opens in step.
    const closing = animate(body, [{ height: `${H}px`, paddingBottom: '16px' }, { height: '0px', paddingBottom: '0px' }], { duration: OPEN_MS, delay: 120, easing: EASE });
    const stash = api.setMode('empty', { ms: OPEN_MS, delay: 120, easing: EASE });
    const layer = await blobs(wrap, backward(style, ctx.e, now), style !== 'crisp');
    await closing;
    const actions = api.actions();
    api.slot.replaceChildren(actions);
    layer.remove();
    labels(actions, true, 200);
    await stash;
  }

  globalThis.Opening = { open, form, placeBody, placeRow, close };
})();
