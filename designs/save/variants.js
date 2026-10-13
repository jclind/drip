// The save round's variants. base.js reads globalThis.MOCK_VARIANTS[body's data-variant].

globalThis.MOCK_VARIANTS = {
  // A, Rise: the bookmark is a small glass. The water rises from the bottom with a wave that sloshes and settles, and
  // the bookmark bobs once when it's full. Taking it out lowers the water the same way.
  a: {
    async stash(api, ctx) {
      const { bm } = ctx;
      await api.frames(620, (t, ms) => {
        bm.set(api.ease.out(t), { amp: 60 * (1 - t), tilt: 120 * Math.sin(t * 3 * Math.PI) * (1 - t), phase: ms * 0.7 });
      });
      bm.set(1);
      ctx.mark(true);
      await api.animate(bm.svg, [{ translate: '0 0' }, { translate: '0 -2px' }, { translate: '0 0.5px' }, { translate: '0 0' }],
        { duration: 300, easing: 'ease-out' });
    },
    async unstash(api, ctx) {
      const { bm } = ctx;
      ctx.mark(false);
      await api.frames(480, (t, ms) => {
        bm.set(1 - api.ease.in(t), { amp: 50 * Math.sin(Math.PI * t), tilt: -70 * Math.sin(t * 2 * Math.PI) * (1 - t), phase: -ms * 0.7 });
      });
      bm.set(0);
    },
  },

  // B, Drop: the glass's own motion (round 1's B). One drop falls into the top of the bookmark with a small ring, the
  // water rises fast, and the bookmark bobs. Taking it out, the water drains and one drop falls out of the notch.
  b: {
    async stash(api, ctx) {
      const { bm } = ctx;
      const { x, r } = api.box(bm.svg);
      const width = ctx.kind === 'pill' ? 5 : 6;
      const drop = api.dropEl(width);
      const top = r.top + 1;
      const from = top - 28;
      await api.frames(300, (t) => {
        const e = api.ease.in(t);
        drop.style.transform = api.at(x, from + (top - from) * e, `scale(${1 - 0.1 * e}, ${1 + 0.15 * e})`);
        drop.style.opacity = String(Math.min(1, t * 4));
      });
      drop.remove();
      api.ring(x, top, r.width + 6, 5, 420);
      await api.frames(380, (t, ms) => {
        bm.set(api.ease.out(t), { amp: 55 * (1 - t), phase: ms * 0.8 });
      });
      bm.set(1);
      ctx.mark(true);
      await api.animate(bm.svg, [{ scale: '1' }, { scale: '1.14' }, { scale: '0.97' }, { scale: '1' }], { duration: 280, easing: 'ease-out' });
    },
    async unstash(api, ctx) {
      const { bm } = ctx;
      const { x, r } = api.box(bm.svg);
      ctx.mark(false);
      const width = ctx.kind === 'pill' ? 5 : 6;
      const drop = api.dropEl(width);
      const from = r.bottom - 2;
      const fall = api.frames(420, (t) => {
        const e = api.ease.in(t);
        drop.style.transform = api.at(x, from + 20 * e, `scale(${0.6 + 0.4 * Math.min(1, t * 3)})`);
        drop.style.opacity = String(t < 0.7 ? 1 : (1 - t) / 0.3);
      }).then(() => drop.remove());
      await api.frames(420, (t, ms) => {
        bm.set(1 - api.ease.inOut(t), { amp: 40 * Math.sin(Math.PI * t), phase: -ms * 0.8 });
      });
      bm.set(0);
      await fall;
    },
  },

  // C, Tide: the whole button fills. Light blue water rises through the button, and the bookmark turns blue as the
  // waterline passes it. Stashed, the button stays a soft blue. Taking it out, the tide runs out.
  c: {
    tide: true,
    async stash(api, ctx) {
      await flow(api, ctx, 0, 1, 640, api.ease.out, true);
    },
    async unstash(api, ctx) {
      ctx.mark(false);
      await flow(api, ctx, 1, 0, 520, api.ease.inOut, false);
    },
  },

  now: { now: true },
};

/** C: moves the button's tide from one level to another, with the bookmark filling or emptying where the line crosses it. */
async function flow(api, ctx, from, to, ms, easing, marking) {
  const { bm, tide, btn } = ctx;
  const b = btn.getBoundingClientRect();
  const i = bm.svg.getBoundingClientRect();
  let marked = !marking;
  await api.frames(ms, (t, elapsed) => {
    const level = from + (to - from) * easing(t);
    const amp = 2.6 * Math.sin(Math.PI * Math.min(1, t * 1.2));
    const lineY = b.top + tide.set(level, { amp, phase: elapsed * 0.05 });
    // The bookmark's water is the same line, in its own units.
    const iconLevel = Math.max(0, Math.min(1, (i.bottom - lineY) / i.height));
    bm.set(iconLevel, { amp: amp * 30, phase: elapsed * 0.05 * 37 });
    if (!marked && t > 0.55) {
      marked = true;
      ctx.mark(true);
    }
  });
  tide.set(to);
  bm.set(to);
}
