// The counter round's variants. Each one gives drops landing in the counter (land) and a count changing (roll) its own
// motion. base.js calls them. Landings use the same drop, ring, and splash as the glass's B "Drop" (pour.js).

(() => {
  const { api } = globalThis.Mock;
  const { wait, animate, frames, ease } = api;

  const mix = (a, b, t) => a + (b - a) * t;

  /** The icon squashes as a drop lands in it, and springs back. */
  function squash(token) {
    return animate(token.icon, [
      { transform: 'none' },
      { transform: 'translateY(2px) scale(1.25, 0.78)', offset: 0.3 },
      { transform: 'translateY(-2px) scale(0.92, 1.1)', offset: 0.62 },
      { transform: 'none' },
    ], { duration: 420, easing: 'ease-out', fill: 'none' });
  }

  /** A drop or card from its svg, flying in the fx layer. */
  function flyer(name, width) {
    const img = api.h('img', { class: 'mock-drop', src: `icons/${name}.svg`, alt: '' });
    img.style.width = `${width}px`;
    api.fx.append(img);
    return img;
  }

  // A, Rain: the drops fall from the top of the window, straight down into the counter, one at a time. Counts roll like
  // an odometer: up when they grow, down when something is spent.
  const A = {
    async roll(_, el, from, to) {
      const up = to > from;
      await api.swap(el, to,
        [{ transform: 'translateY(0)' }, { transform: `translateY(${up ? -100 : 100}%)` }],
        [{ transform: `translateY(${up ? 100 : -100}%)` }, { transform: 'translateY(0)' }],
        { ms: 280 });
    },

    async land(_, ctx) {
      if (ctx.kind === 'kept') {
        ctx.showMessage('Kept 3 drops.');
        await wait(250);
      }
      const t = ctx.drop;
      const falls = [];
      for (let n = t.from + 1; n <= t.to; n += 1) {
        falls.push(A.rain(t, n));
        await wait(ctx.kind === 'new' ? 240 : 320);
      }
      await Promise.all(falls);
      if (ctx.card.to !== ctx.card.from) {
        await wait(150);
        squash(ctx.card);
        await A.roll(api, ctx.card.num, ctx.card.from, ctx.card.to);
      }
    },

    async rain(t, n) {
      const { x, y } = api.center(t.icon);
      const d = api.dropEl(13);
      await animate(d, [
        { transform: api.at(x, -16) },
        { transform: api.at(x, y - 2, 'scale(0.75, 1.3)') },
      ], { duration: 460, easing: 'cubic-bezier(0.5, 0, 1, 1)' });
      d.remove();
      api.ring(x, y + 7, 30, 7, 560);
      api.splash(x, y - 4, 3, 9, 10);
      squash(t);
      await A.roll(api, t.num, n - 1, n);
    },
  };

  // B, Left behind: the drops are what the water leaves on the window. On Done for now, beads stay next to the counter as
  // the lock's water falls past, then run into it one by one. On a new day they gather out of nothing, like dew. Counts
  // drip: the new number always falls in from above and the old one sinks away.
  const B = {
    async roll(_, el, from, to) {
      await api.swap(el, to,
        [{ transform: 'none', opacity: 1 }, { transform: 'translateY(70%) scale(0.9, 1.1)', opacity: 0 }],
        [
          { transform: 'translateY(-90%) scale(0.8, 1.3)', opacity: 0 },
          { transform: 'translateY(10%) scale(1.15, 0.85)', opacity: 1, offset: 0.6 },
          { transform: 'none', opacity: 1 },
        ],
        { ms: 380, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', clip: false });
    },

    /** Where the beads sit: a loose row to the right of the drop count. */
    spots(ctx, n) {
      const r = ctx.drop.count.getBoundingClientRect();
      const { y } = api.center(ctx.drop.icon);
      const dy = [-11, 5, -4, 10, -9];
      return Array.from({ length: n }, (_, i) => ({ x: r.right + 16 + i * 17, y: y + dy[i % dy.length], tilt: [-8, 6, -3, 9][i % 4] }));
    },

    bead(spot, ms) {
      const d = api.dropEl(10);
      api.place(d, spot.x, spot.y, `rotate(${spot.tilt}deg)`);
      animate(d, [
        { transform: api.at(spot.x, spot.y, `rotate(${spot.tilt}deg) scale(0)`), opacity: 0 },
        { transform: api.at(spot.x, spot.y, `rotate(${spot.tilt}deg) scale(1.2, 0.85)`), opacity: 1, offset: 0.6 },
        { transform: api.at(spot.x, spot.y, `rotate(${spot.tilt}deg)`), opacity: 1 },
      ], { duration: ms, easing: 'ease-out' });
      return d;
    },

    /** A bead runs across to the counter's icon, stretching as it goes, and merges with it. */
    async run(t, d, spot, n) {
      const { x, y } = api.center(t.icon);
      d.getAnimations().forEach((a) => a.cancel());
      await frames(340, (p) => {
        const e = ease.in(p);
        api.place(d, mix(spot.x, x, e), mix(spot.y, y, e) + Math.sin(Math.PI * p) * 5, `rotate(${mix(spot.tilt, 0, p)}deg) scale(${1 + 0.35 * e}, ${1 - 0.25 * e})`);
      });
      d.remove();
      api.ring(x, y, 26, 26, 420);
      squash(t);
      await B.roll(api, t.num, n - 1, n);
    },

    async land(_, ctx) {
      const t = ctx.drop;
      const count = t.to - t.from;
      const spots = B.spots(ctx, count);
      let beads;
      if (ctx.kind === 'kept') {
        // A bead appears the moment the falling water uncovers its spot.
        const shown = new Array(count).fill(null);
        await new Promise((resolve) => {
          const started = performance.now();
          const look = () => {
            const top = api.waterTop(ctx.lock);
            spots.forEach((s, i) => { if (!shown[i] && top > s.y + 6) shown[i] = B.bead(s, 300); });
            if (shown.every(Boolean) || performance.now() - started > 1500 * api.SLOW) resolve();
            else requestAnimationFrame(look);
          };
          look();
        });
        beads = shown.map((d, i) => d || B.bead(spots[i], 300));
        await wait(650);
        ctx.showMessage('Kept 3 drops.');
        await wait(450);
      } else {
        beads = [];
        for (const s of spots) {
          beads.push(B.bead(s, 460));
          await wait(150);
        }
        await wait(500);
      }
      const runs = [];
      for (let i = 0; i < count; i += 1) {
        runs.push(B.run(t, beads[i], spots[i], t.from + i + 1));
        await wait(210);
      }
      await Promise.all(runs);
      if (ctx.card.to !== ctx.card.from) {
        await wait(150);
        squash(ctx.card);
        await B.roll(api, ctx.card.num, ctx.card.from, ctx.card.to);
      }
    },
  };

  // C, Thrown in: the message line carries the drops. "Kept 3 drops." rises with three drops after it, and they lift
  // out one at a time and arc up into the counter, the way +15m's drop arcs from the counter into the glass. A new day
  // gets a line of its own. Counts spin through every number between, like a slot machine settling.
  const C = {
    async roll(_, el, from, to) {
      const step = to > from ? 1 : -1;
      const steps = Math.abs(to - from);
      const each = steps > 1 ? Math.max(38, 340 / steps) : 0;
      for (let n = from + step; n !== to + step; n += step) {
        const last = n === to;
        const up = step > 0;
        await api.swap(el, n,
          [{ transform: 'translateY(0)' }, { transform: `translateY(${up ? -100 : 100}%)` }],
          [{ transform: `translateY(${up ? 100 : -100}%)` }, { transform: 'translateY(0)' }],
          last ? { ms: 300, easing: 'cubic-bezier(0.3, 1.45, 0.5, 1)' } : { ms: each, easing: 'linear' });
      }
    },

    /** One drop or card leaves the message and arcs into its counter. */
    async throw(t, from, name, width, n, by) {
      const a = api.center(from);
      from.style.visibility = 'hidden';
      const b = api.center(t.icon);
      const d = flyer(name, width);
      await frames(480, (p) => {
        const e = ease.inOut(p);
        api.place(d, mix(a.x, b.x, e), mix(a.y, b.y, e) - Math.sin(Math.PI * p) * 46, `rotate(${(-30 * Math.sin(Math.PI * p)).toFixed(1)}deg)`);
      });
      d.remove();
      api.ring(b.x, b.y, 30, 30, 460);
      api.splash(b.x, b.y - 8, 3, 9, 9);
      squash(t);
      await C.roll(api, t.num, n - by, n);
    },

    async land(_, ctx) {
      const t = ctx.drop;
      const count = t.to - t.from;
      const drops = Array.from({ length: count }, () => api.h('img', { src: 'icons/drop.svg', alt: '' }));
      const card = ctx.card.to !== ctx.card.from && api.h('img', { class: 'mock-msg-card', src: 'icons/card.svg', alt: '' });
      const tray = api.h('span', { class: 'mock-msg-drops', 'aria-hidden': 'true' }, ...drops, card);
      const words = ctx.kind === 'kept' ? 'Kept 3 drops.' : 'A new day. 4 drops and 10 cards.';
      ctx.showMessage([words, tray]);
      // The line rises (400ms in, 600ms long), and on Done for now the water is still falling away.
      await wait(ctx.kind === 'kept' ? 1150 : 1000);
      const throws = [];
      for (let i = 0; i < count; i += 1) {
        throws.push(C.throw(t, drops[i], 'drop', 12, t.from + i + 1, 1));
        await wait(240);
      }
      if (card) {
        await wait(120);
        throws.push(C.throw(ctx.card, card, 'card', 14, ctx.card.to, ctx.card.to - ctx.card.from));
      }
      await Promise.all(throws);
      // The emptied space closes up, and the words settle back to the middle.
      tray.style.width = `${tray.offsetWidth}px`;
      await animate(tray, [{ width: `${tray.offsetWidth}px`, marginLeft: '6px' }, { width: '0px', marginLeft: '0px' }], { duration: 280, easing: 'ease-in-out' });
      tray.remove();
    },
  };

  // As built: "Kept 3 drops." rises in, and every count changes at once.
  const now = {
    instant: true,
    async roll(_, el, from, to) {
      api.setNum(el, to);
    },
    async land(_, ctx) {
      api.setNum(ctx.drop.num, ctx.drop.to);
      api.setNum(ctx.card.num, ctx.card.to);
      if (ctx.kind === 'kept') ctx.showMessage('Kept 3 drops.');
    },
  };

  globalThis.Variants = { a: A, b: B, c: C, now };
})();
