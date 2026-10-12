// The glass round's variants. Each one gives the same three moments its own motion: +15m on the home page (pour),
// the pill hitting 0 (lastDrop), and +15m on the lock (lockAdd). base.js calls them.

(() => {
  const { api } = globalThis.Mock;
  const { h, fx, frames, ease, animate, wait } = api;
  const G = globalThis.DripGlass;

  /** Lerp. */
  const mix = (a, b, t) => a + (b - a) * t;

  /** The glass's box and its middle, in viewport pixels. */
  function box(glass) {
    const r = glass.getBoundingClientRect();
    return { r, x: r.left + r.width / 2 };
  }

  /** Sets the water to fraction y with a tilt, at once. For frame-by-frame motion. */
  function setWater(glass, px, y, tilt = 0) {
    const w = api.wave(glass);
    w.style.transition = 'none';
    w.style.transformOrigin = '310px 0px';
    w.style.transform = `translateY(${api.waveY(y, px)}px) rotate(${tilt}deg)`;
  }

  /** Hands the water back to glass.js at fraction y, with its transition, once the frame is drawn. */
  function releaseWater(glass, px, y) {
    G.set(glass, y, px);
    requestAnimationFrame(() => { api.wave(glass).style.transition = ''; });
  }

  /** A drop flies from one point to another in an arc that lifts `lift` px at its middle, tipping as it goes. */
  function arc(drop, from, to, ms, lift, tip = -40) {
    return frames(ms, (t) => {
      const e = ease.inOut(t);
      api.place(drop, mix(from.x, to.x, e), mix(from.y, to.y, e) - Math.sin(Math.PI * t) * lift, `rotate(${tip * Math.sin(Math.PI * t)}deg)`);
    });
  }

  function stream(width = 3) {
    const s = h('div', { class: 'mock-stream' });
    s.style.width = `${width}px`;
    fx.append(s);
    return s;
  }

  /** A ring spreading on the water at x, y, from 0 to w by hgt px, fading out. */
  function ring(x, y, w, hgt, ms = 650, delay = 0) {
    const r = h('div', { class: 'mock-ring' });
    fx.append(r);
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    return animate(r, [
      { width: '0px', height: '0px', translate: '-50% -50%', opacity: 1 },
      { width: `${w}px`, height: `${hgt}px`, translate: '-50% -50%', opacity: 0 },
    ], { duration: ms, delay, easing: 'cubic-bezier(.2,.7,.3,1)' }).then(() => r.remove());
  }

  /** Two tiny droplets thrown up and out from x, y. */
  function splash(x, y, size = 4, spread = 10, height = 12, ms = 380) {
    return Promise.all([-1, 1].map((side) => {
      const d = h('div', { class: 'mock-splash' });
      d.style.width = d.style.height = `${size}px`;
      fx.append(d);
      return frames(ms, (t) => {
        api.place(d, x + side * spread * t, y - 4 * height * t * (1 - t));
        d.style.opacity = String(1 - t * t);
      }).then(() => d.remove());
    }));
  }

  /**
   * The lock's water rises from where something landed: the overlay is cut to an ellipse around that point on the
   * bottom edge, which grows faster than the crest climbs, so the water pools there and spreads out as it rises.
   */
  function spreadRise(lock, x, ms = 1050) {
    const W = innerWidth;
    const H = innerHeight;
    return animate(lock, [
      { clipPath: `ellipse(0px 0px at ${x}px 100%)` },
      { clipPath: `ellipse(${W * 0.35}px ${H * 0.45}px at ${x}px 100%)`, offset: 0.35 },
      { clipPath: `ellipse(${W * 1.8}px ${H * 1.4}px at ${x}px 100%)` },
    ], { duration: ms, easing: 'cubic-bezier(.3,.55,.35,1)', fill: 'none' });
  }

  // As built today: the level glides over 700ms, and the lock's water rises flat from the bottom.
  const now = {
    async pour(_, ctx) {
      ctx.spendDrop();
      ctx.showTime();
      G.set(ctx.glass, ctx.to, ctx.px);
      await wait(700);
    },
    async lastDrop(_, ctx) {
      G.set(ctx.glass, 0, ctx.px);
      api.lock();
    },
    async lockAdd(_, ctx) {
      await ctx.drain();
      ctx.showTime();
      G.set(ctx.glass, ctx.to, ctx.px);
    },
  };

  // A, Pour. Water moves as a stream. A drop leaves the counter, tips over the glass, and pours in; the water rises
  // under the stream and sloshes once. The pill's last water runs out as a trickle down the window, and the lock pools
  // up from where it lands. On the lock, +15m drains the water and a short stream refills the pill's glass.
  async function pourInto(glass, px, from, to, { lip, width, ms, slosh }) {
    const { x } = box(glass);
    const s = stream(width);
    s.style.left = `${x - width / 2}px`;
    s.style.top = `${lip}px`;
    setWater(glass, px, from);
    // The head falls to the water.
    const start = api.surfaceY(glass, from, px);
    await frames(150, (t) => { s.style.height = `${(start - lip) * ease.in(t)}px`; });
    // The water rises under it, and the stream shortens with the surface.
    await frames(ms, (t) => {
      const y = mix(from, to, ease.out(t));
      setWater(glass, px, y, -2.5 * Math.sin(Math.PI * t));
      s.style.height = `${Math.max(0, api.surfaceY(glass, y, px) - lip)}px`;
    });
    // The tail falls in.
    const end = api.surfaceY(glass, to, px);
    await frames(130, (t) => {
      const top = mix(lip, end, ease.in(t));
      s.style.top = `${top}px`;
      s.style.height = `${Math.max(0, end - top)}px`;
    });
    s.remove();
    await frames(slosh, (t) => {
      setWater(glass, px, to, 5 * Math.exp(-4 * t) * Math.sin(t * Math.PI * 3));
    });
    releaseWater(glass, px, to);
  }

  const a = {
    async pour(_, ctx) {
      const { glass, px, from, to } = ctx;
      const src = api.center(ctx.dropIcon);
      const { r, x } = box(glass);
      const lip = r.top - 22;
      const drop = api.dropEl(14);
      api.place(drop, src.x, src.y);
      ctx.spendDrop();
      await arc(drop, src, { x: x + 3, y: lip }, 480, 40, -50);
      // It tips over the glass and turns into the stream.
      animate(drop, [{ opacity: 1, scale: '1 1' }, { opacity: 0, scale: '0.3 1.3' }], { duration: 160 }).then(() => drop.remove());
      setTimeout(ctx.showTime, 250 * api.SLOW);
      await pourInto(glass, px, from, to, { lip, width: 3, ms: 620, slosh: 900 });
    },

    async lastDrop(_, ctx) {
      const { glass, px } = ctx;
      const { r, x } = box(glass);
      setWater(glass, px, 0);
      const H = innerHeight;
      const top0 = r.top + r.height * 0.82;
      const s = stream(2);
      s.style.left = `${x - 1}px`;
      s.style.top = `${top0}px`;
      // The trickle runs down to the bottom of the window.
      await frames(520, (t) => { s.style.height = `${(H - top0) * ease.in(t)}px`; });
      const lock = api.lock();
      spreadRise(lock, x);
      ring(x, H - 6, 90, 14, 700);
      // Its tail follows it down.
      await frames(320, (t) => {
        const top = mix(top0, H, ease.in(t));
        s.style.top = `${top}px`;
        s.style.height = `${H - top}px`;
      });
      s.remove();
      releaseWater(glass, px, 0);
    },

    async lockAdd(_, ctx) {
      const { glass, px, to } = ctx;
      const draining = ctx.drain();
      // The pill is near the top, so the falling water clears it early.
      await wait(160);
      const { r } = box(glass);
      ctx.showTime();
      await pourInto(glass, px, 0, to, { lip: r.top - 16, width: 2, ms: 480, slosh: 700 });
      await draining;
    },
  };

  // B, Drop. Water moves one drop at a time, and lands with a ring. A drop leaves the counter and falls into the glass;
  // a ring spreads and the water bobs up to its new level. The pill's last water falls as one drop, splashes at the
  // bottom of the window, and the lock rises from there. On the lock, the drop on +15m falls into the water, the water
  // drains, and the pill's glass bobs up.
  async function bob(glass, px, from, to, ms = 700) {
    setWater(glass, px, from);
    await frames(ms, (t) => {
      // Up past the new level, back under it, and still: a damped bounce.
      const y = to + (from - to) * Math.exp(-5 * t) * Math.cos(t * Math.PI * 2.5);
      setWater(glass, px, Math.max(0, y));
    });
    releaseWater(glass, px, to);
  }

  const b = {
    async pour(_, ctx) {
      const { glass, px, from, to } = ctx;
      const src = api.center(ctx.dropIcon);
      const { r, x } = box(glass);
      const drop = api.dropEl(14);
      api.place(drop, src.x, src.y);
      ctx.spendDrop();
      const above = { x, y: r.top - 30 };
      await arc(drop, src, above, 420, 34, -30);
      // It falls, stretching.
      const hit = api.surfaceY(glass, from, px);
      await frames(200, (t) => api.place(drop, x, mix(above.y, hit, ease.in(t)), `scale(${1 - 0.25 * t}, ${1 + 0.3 * t})`));
      drop.remove();
      ctx.showTime();
      ring(x, api.surfaceY(glass, to, px), r.width * 0.75, 6, 600);
      splash(x, hit - 2, 3, 8, 10);
      await bob(glass, px, from, to);
    },

    async lastDrop(_, ctx) {
      const { glass, px } = ctx;
      const { r, x } = box(glass);
      const H = innerHeight;
      setWater(glass, px, 0);
      // The last of the water gathers under the glass as a drop, hangs, and lets go.
      const drop = api.dropEl(9);
      const y0 = r.bottom - 1;
      await frames(260, (t) => api.place(drop, x, y0 + 5 * ease.out(t), `scale(${ease.out(t)})`));
      await frames(560, (t) => api.place(drop, x, mix(y0 + 5, H - 8, ease.in(t)), `scale(${1 - 0.2 * t}, ${1 + 0.35 * t})`));
      drop.remove();
      const lock = api.lock();
      spreadRise(lock, x);
      ring(x, H - 8, 120, 18, 800);
      ring(x, H - 8, 70, 11, 700, 140);
      splash(x, H - 10, 5, 22, 26, 460);
      releaseWater(glass, px, 0);
    },

    async lockAdd(_, ctx) {
      const { glass, px, to, button } = ctx;
      const icon = button.querySelector('.drip-price .drip-token-drop');
      const c = api.center(icon);
      icon.style.visibility = 'hidden';
      // It falls past the panel into the open water under it.
      const land = ctx.lock.querySelector('.drip-lock-panel').getBoundingClientRect().bottom + 36;
      const drop = api.dropEl(12);
      await frames(380, (t) => api.place(drop, c.x, mix(c.y, land, ease.in(t)), `scale(${1 - 0.3 * t}, ${1 + 0.3 * t})`));
      drop.remove();
      ring(c.x, land + 2, 70, 13, 650);
      const draining = ctx.drain();
      await wait(180);
      ctx.showTime();
      const { r, x } = box(glass);
      ring(x, api.surfaceY(glass, to, px), r.width * 0.8, 4, 500);
      await bob(glass, px, 0, to, 650);
      await draining;
    },
  };

  // C, Slosh. Nothing flies. The glass and the water move like they have weight. +15m sets the glass down hard: it dips,
  // the water surges past its new level and sloshes twice, and a few bubbles rise. At 0 the pill's glass tips over, and
  // the lock's water comes in as a wave sloped down from the pill's corner, then levels. On the lock, the water drains
  // toward that corner first, and the pill's glass rights itself and fills with a slosh.
  async function slosh(glass, px, from, to, ms, size = 1) {
    setWater(glass, px, from);
    const over = Math.min(1.08, to + 0.14 * size);
    await frames(ms, (t) => {
      // Surge: to the overshoot by 30%, then a damped settle, tilting side to side.
      const y = t < 0.3 ? mix(from, over, ease.out(t / 0.3)) : to + (over - to) * Math.exp(-4.5 * (t - 0.3)) * Math.cos((t - 0.3) * Math.PI * 3.2);
      const tilt = 10 * size * Math.sin(t * Math.PI * 3.6) * Math.exp(-3 * t);
      setWater(glass, px, Math.max(0, y), tilt);
    });
    releaseWater(glass, px, to);
  }

  function bubbles(glass, to, px, count = 3) {
    const { r } = box(glass);
    const top = api.surfaceY(glass, to, px);
    for (let i = 0; i < count; i++) {
      const bub = h('div', { class: 'mock-bubble' });
      const size = 2 + Math.round(Math.random() * 2);
      bub.style.width = bub.style.height = `${size}px`;
      fx.append(bub);
      const x = r.left + r.width * (0.35 + 0.3 * Math.random());
      const y0 = r.top + r.height * 0.78;
      wait(120 + i * 140).then(() => frames(520, (t) => {
        api.place(bub, x + Math.sin(t * 6) * 1.2, mix(y0, top + 2, t));
        bub.style.opacity = String(t < 0.85 ? 0.9 : (1 - t) * 6);
      })).then(() => bub.remove());
    }
  }

  /** The overlay cut by a straight sloped line, with its left and right ends at these heights (% from the top). */
  const slope = (left, right) => ({ clipPath: `polygon(0 100%, 100% 100%, 100% ${right}%, 0 ${left}%)` });

  const c = {
    async pour(_, ctx) {
      const { glass, px, from, to, tile } = ctx;
      ctx.spendDrop();
      animate(ctx.dropIcon, [{ scale: '1' }, { scale: '0.7', offset: 0.4 }, { scale: '1' }], { duration: 320, fill: 'none' });
      animate(tile, [
        { translate: '0 0', scale: '1 1' },
        { translate: '0 3px', scale: '1.05 0.95', offset: 0.28 },
        { translate: '0 -1px', scale: '0.99 1.01', offset: 0.6 },
        { translate: '0 0', scale: '1 1' },
      ], { duration: 460, easing: 'ease-out', fill: 'none' });
      setTimeout(ctx.showTime, 200 * api.SLOW);
      bubbles(glass, to, px);
      await slosh(glass, px, from, to, 1150);
    },

    async lastDrop(_, ctx) {
      const { glass, px } = ctx;
      glass.style.transformOrigin = '50% 55%';
      setWater(glass, px, 0);
      glass._tip = glass.animate([
        { rotate: '0deg' },
        { rotate: '-104deg', offset: 0.55, easing: 'ease-in-out' },
        { rotate: '-90deg', offset: 0.8 },
        { rotate: '-95deg' },
      ], { duration: 600, fill: 'forwards', easing: 'cubic-bezier(.4,0,.3,1)' });
      if (api.SLOW > 1) glass._tip.playbackRate = 1 / api.SLOW;
      await wait(260);
      const lock = api.lock();
      // The crest climbs faster than usual, so the slope leads.
      lock.style.animationDuration = '700ms';
      await animate(lock, [
        slope(100, 100),
        slope(88, 42),
        slope(30, 6),
        slope(3, 16),
        slope(-6, -6),
      ], { duration: 1400, easing: 'cubic-bezier(.35,.5,.4,1)', fill: 'none' });
      releaseWater(glass, px, 0);
    },

    async lockAdd(_, ctx) {
      const { glass, px, to, lock } = ctx;
      lock.classList.add('is-draining');
      lock.style.animationDuration = '1000ms';
      animate(lock, [
        slope(-6, -6),
        slope(4, 34),
        slope(42, 70),
        slope(100, 104),
      ], { duration: 900, easing: 'cubic-bezier(.5,0,.6,.6)', fill: 'forwards' });
      setTimeout(() => lock.remove(), 1000 * api.SLOW);
      await wait(200);
      // The pill's glass rights itself, and fills as it lands.
      glass._tip?.cancel();
      animate(glass, [{ rotate: '-95deg' }, { rotate: '6deg', offset: 0.7 }, { rotate: '0deg' }], { duration: 420, easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'none' });
      await wait(240);
      ctx.showTime();
      await slosh(glass, px, 0, to, 1000, 1.2);
      await wait(400);
    },
  };

  globalThis.Variants = { now, a, b, c };
})();
