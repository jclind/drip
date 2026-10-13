// The shared mockup for the save round: drip's home card (home.js card()) and the watch page pill (watch.js renderPill),
// with drip's real CSS and glass.js, in two scenes:
//   ?scene=card   the home page with a card up: Stash on the card
//   ?scene=pill   the watch page: Stash on the pill
// The bookmark is one SVG (bookmark() below): the shape or outline in the text color, and blue water clipped by a
// wavy line, the glass's idea at icon size. Each variant supplies:
//   stash(api, ctx)    the water coming in
//   unstash(api, ctx)  the water going out
//   tide               true when the button holds water too (C)
// ?theme=light drops html[dark]. ?slow=4 plays everything 4 times slower. ?reduced=1 previews prefers-reduced-motion.
// ?auto=1 stashes, waits, and takes it out again, for screenshots.

(() => {
  const params = new URLSearchParams(location.search);
  const SLOW = Math.max(1, Number(params.get('slow')) || 1);
  const SCENE = params.get('scene') === 'pill' ? 'pill' : 'card';
  if (params.get('theme') !== 'light') document.documentElement.setAttribute('dark', '');
  document.documentElement.setAttribute('data-drip-shown', '');
  const REDUCED = params.get('reduced') === '1' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (REDUCED) document.documentElement.classList.add('mock-reduced');
  const variant = globalThis.MOCK_VARIANTS[document.body.dataset.variant];
  const BLUE = '#42a5f6';
  const NS = 'http://www.w3.org/2000/svg';

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else if (key === 'class') el.className = value;
      else el.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(child);
    return el;
  }

  function s(tag, attrs = {}, ...children) {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    el.append(...children);
    return el;
  }

  function icon(name, cls = '') {
    const el = h('span', { class: `drip-i drip-i-${name} ${cls}`.trim(), 'aria-hidden': 'true' });
    el.style.setProperty('--drip-icon', `url("icons/${name}.svg")`);
    return el;
  }

  function price(token) {
    return h('span', { class: 'drip-price' },
      h('span', { class: 'drip-sep', 'aria-hidden': 'true' }, '·'),
      h('span', { 'aria-hidden': 'true' }, '-1'),
      icon(token, `drip-token-${token}`),
      h('span', { class: 'drip-sr' }, `, costs 1 ${token}`));
  }

  // Slow motion: every Web Animation runs at 1/SLOW, and wait() and frames() stretch to match.
  const wait = (ms) => new Promise((r) => setTimeout(r, REDUCED ? 0 : ms * SLOW));

  /** Element.animate that resolves when done. Under reduced motion it jumps to the end. */
  function animate(el, keyframes, options) {
    const a = el.animate(keyframes, { fill: 'both', ...options });
    if (REDUCED) a.finish();
    else if (SLOW > 1) a.playbackRate = 1 / SLOW;
    return a.finished.then(() => a, () => a);
  }

  /** Runs step(t, elapsedMs) every frame for ms, t from 0 to 1. */
  function frames(ms, step) {
    if (REDUCED) { step(1, ms); return Promise.resolve(); }
    return new Promise((resolve) => {
      const start = performance.now();
      const loop = (now) => {
        const elapsed = (now - start) / SLOW;
        const t = Math.min(1, elapsed / ms);
        step(t, elapsed);
        if (t < 1) requestAnimationFrame(loop);
        else resolve();
      };
      requestAnimationFrame(loop);
    });
  }

  const ease = {
    inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
    out: (t) => 1 - (1 - t) ** 3,
    in: (t) => t * t,
    /** Overshoots the end a little and settles, like water bobbing up. */
    back: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
  };

  const fx = h('div', { class: 'mock-fx', 'aria-hidden': 'true' });

  /** A drop from drop.svg, `width` px wide, placed by its middle. */
  function dropEl(width) {
    const img = h('img', { class: 'mock-drop', src: 'icons/drop.svg', alt: '' });
    img.style.width = `${width}px`;
    fx.append(img);
    return img;
  }

  const at = (x, y, extra = '') => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) ${extra}`.trim();

  /** pour.js ring(): a ring spreading at x, y out to w by hgt px, fading. */
  function ring(x, y, w, hgt, ms = 500) {
    const r = h('div', { class: 'mock-ring' });
    fx.append(r);
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    return animate(r, [
      { width: '0px', height: '0px', translate: '-50% -50%', opacity: 1 },
      { width: `${w}px`, height: `${hgt}px`, translate: '-50% -50%', opacity: 0 },
    ], { duration: ms, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }).then(() => r.remove());
  }

  // save.svg, Jesse's cartoon bookmark, and save-outline.svg's lucide outline. Both fill the same box.
  const SHAPE = 'M282.911 546.837C294.304 540.259 309.493 540.259 320.886 546.837L491.772 649.368C491.864 649.431 516.491 666.457 535.443 666.457C535.598 666.473 588.63 671.797 603.798 615.19V677.849C603.798 685.443 596.203 744.304 535.443 744.305C495.57 744.305 317.088 626.583 301.898 626.583C275.315 626.584 108.228 744.305 68.3545 744.305C55.0634 744.305 0 732.912 0 675.95V615.19C0 615.19 17.0887 666.456 68.3545 666.456C98.7342 666.456 263.922 558.23 282.911 546.837ZM461.393 0C512.658 1.88375e-05 598.102 9.49432 598.102 121.52C598.102 233.545 596.202 552.533 596.202 584.812C596.202 617.09 546.836 647.92 516.456 630.381C486.076 612.841 332.278 519.237 320.886 512.659C309.493 506.082 294.303 506.082 282.911 512.659C271.517 519.238 95.3127 626.581 85.4434 632.279C75.5773 637.976 9.49428 645.571 9.49414 573.419C9.49414 501.267 5.69629 167.09 5.69629 121.52C5.69629 75.9499 28.4813 0 123.418 0H461.393ZM189.905 36.0762C148.097 36.0764 49.3632 85.4436 43.7002 193.671C43.7002 193.671 45.6018 214.558 62.6904 214.558C79.779 214.558 83.6052 205.064 85.4756 197.469C87.346 189.874 89.2446 157.595 119.652 121.52C119.652 121.52 144.308 89.2411 189.905 77.8486C206.994 72.1524 206.994 55.0635 206.994 55.0635C206.994 54.9827 206.957 36.0762 189.905 36.0762Z';
  const OUTLINE = 'M19 21L12 17L5 21V5C5 3.9 5.9 3 7 3H17C18.1 3 19 3.9 19 5V21Z';
  const W = 604;
  const H = 745;
  let ids = 0;

  /**
   * The bookmark: the cartoon shape (card) or the outline (pill) in the text color, and blue water over it clipped by a
   * wavy line. level 0 is empty, 1 is full. amp is the wave's height and tilt leans the line, both in viewBox units.
   */
  function bookmark(outline, { dry = false } = {}) {
    const id = `mock-water-${++ids}`;
    const line = s('path');
    // dry: the outline only shows above the water, so the white line never sits under the blue.
    const above = s('path');
    const base = outline
      // The outline is in lucide's 24-unit space, scaled inside a group so a clip on the group stays in this SVG's units.
      ? s('g', {}, s('path', { d: OUTLINE, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linejoin': 'round', transform: 'scale(37.75 37.25) translate(-4 -2)' }))
      : s('path', { d: SHAPE, fill: 'currentColor' });
    const water = s('path', { d: SHAPE, fill: BLUE, 'clip-path': `url(#${id})` });
    const svg = s('svg', { class: 'mock-bm', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' },
      s('defs', {}, s('clipPath', { id, clipPathUnits: 'userSpaceOnUse' }, line), s('clipPath', { id: `${id}-dry`, clipPathUnits: 'userSpaceOnUse' }, above)), base, water);
    if (dry) base.setAttribute('clip-path', `url(#${id}-dry)`);
    const bm = { svg, base, level: 0, amp: 0, tilt: 0, phase: 0 };
    /** Draws the water at bm's level, amp, tilt, and phase. */
    bm.draw = () => {
      const y = H + 70 - bm.level * (H + 140);
      let d = '';
      for (let x = -40; x <= W + 40; x += 22) {
        const wy = y + bm.amp * Math.sin((2 * Math.PI * (x - bm.phase)) / 420) + (bm.tilt * (x - W / 2)) / (W / 2);
        d += `${d ? 'L' : 'M'}${x} ${wy.toFixed(1)}`;
      }
      line.setAttribute('d', `${d}L${W + 40} ${H + 400}L-40 ${H + 400}Z`);
      above.setAttribute('d', `${d}L${W + 40} -400L-40 -400Z`);
      // Full, the outline would show through the shine. Water covers it instead.
      if (!dry) base.style.opacity = outline && bm.level >= 1 && !bm.amp ? '0' : '';
    };
    bm.set = (level, { amp = 0, tilt = 0, phase = 0 } = {}) => {
      Object.assign(bm, { level, amp, tilt, phase });
      bm.draw();
    };
    bm.set(0);
    return bm;
  }

  /** Where an element sits on screen. */
  function box(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
  }

  /**
   * C's water in the whole button: an SVG the button's size, its wave in px. Like bookmark(), level 0 to 1 with amp and
   * phase, and onLine(yPx) reports where the line is so the icon can fill in step.
   */
  function tide(btn) {
    const path = s('path');
    const svg = s('svg', { class: 'mock-tide', 'aria-hidden': 'true', preserveAspectRatio: 'none' }, path);
    btn.classList.add('mock-has-tide');
    btn.prepend(svg);
    const t = { svg, level: 0, amp: 0, phase: 0 };
    t.draw = () => {
      const w = btn.clientWidth;
      const hgt = btn.clientHeight;
      svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
      const y = hgt + 4 - t.level * (hgt + 8);
      let d = '';
      for (let x = -4; x <= w + 4; x += 3) {
        const wy = y + t.amp * Math.sin((2 * Math.PI * (x - t.phase)) / 46);
        d += `${d ? 'L' : 'M'}${x} ${wy.toFixed(2)}`;
      }
      path.setAttribute('d', `${d}L${w + 4} ${hgt + 20}L-4 ${hgt + 20}Z`);
      return y;
    };
    t.set = (level, { amp = 0, phase = 0 } = {}) => {
      Object.assign(t, { level, amp, phase });
      return t.draw();
    };
    t.set(0);
    return t;
  }

  const api = { h, s, icon, wait, animate, frames, ease, dropEl, ring, box, at, fx, REDUCED, SLOW };

  // The card on the home page, as home.js card() builds it, from the tour's sample videos (welcome.js).
  const VIDEO = { title: 'How Japanese joinery holds without nails', channel: 'Workshop Notes', length: '14:02', thumb: 'linear-gradient(135deg, #8a5a3c, #3d2618)' };
  const STASH = [
    { title: 'Riding the ridge trail before the storm', length: '21:35' },
    { title: 'Sourdough with a schedule that fits a workday', length: '9:08' },
    { title: 'Why the Moon always shows the same face', length: '12:47' },
  ];
  const lengthSeconds = (len) => len.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
  function formatMinutes(seconds) {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (!hours) return `${minutes}m`;
    return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  }

  let saved = false;
  let busy = false;
  const now = !!variant.now;

  function stashHead(list) {
    const total = list.reduce((sum, v) => sum + lengthSeconds(v.length), 0);
    return `Stash · ${list.length} videos · ${formatMinutes(total)}`;
  }

  /**
   * Both words in one grid cell, the one not shown hidden, so the button is always as wide as "Stashed" and nothing
   * beside it moves when the word changes. The same trick as the counts' --drip-room.
   */
  function reserved(cls = 'drip-save-label') {
    const words = ['Stash', 'Stashed'].map((w, i) => h('span', { class: 'mock-word', 'aria-hidden': i ? 'true' : undefined }, w));
    const el = h('span', { class: `${cls} mock-reserved`.trim() }, ...words);
    el.show = (on) => words.forEach((w, i) => {
      w.classList.toggle('is-off', i !== Number(on));
      if (i === Number(on)) w.removeAttribute('aria-hidden');
      else w.setAttribute('aria-hidden', 'true');
    });
    el.show(false);
    return el;
  }

  function buildCard() {
    const bm = now ? null : bookmark(false);
    const label = variant.reserve ? reserved() : h('span', { class: 'drip-save-label' }, 'Stash');
    const btn = h('button', {
      class: 'drip-b drip-b-gray drip-card-save', 'aria-pressed': 'false', title: 'Stash it for later',
    }, now ? icon('save') : bm.svg, label);
    const head = h('span', {}, stashHead(STASH));
    const glass = DripGlass.make(22 / 30, 34);
    const page = h('div', { class: 'drip-page is-open' },
      h('div', { class: 'drip-stats' },
        h('div', { class: 'drip-glass-tile' }, glass),
        h('div', { class: 'drip-time-block' }, h('div', { class: 'drip-time' }, '22m'), h('div', { class: 'drip-sub' }, 'left today')),
        h('div', { class: 'drip-counts', style: '--drip-room: 2' },
          h('div', { class: 'drip-count' }, icon('drop', 'drip-token-drop'), h('span', { class: 'drip-num' }, h('span', {}, '3'))),
          h('div', { class: 'drip-count' }, icon('card', 'drip-token-card'), h('span', { class: 'drip-num' }, h('span', {}, '8'))))),
      h('div', { class: 'drip-card' },
        h('div', { class: 'drip-thumb', style: `background: ${VIDEO.thumb}` }),
        h('div', { class: 'drip-card-title', title: VIDEO.title }, VIDEO.title),
        h('div', { class: 'drip-card-meta-row' },
          h('span', { class: 'drip-meta' }, `${VIDEO.channel} · ${VIDEO.length}`),
          h('button', { class: 'drip-b drip-b-primary drip-watch' }, icon('play'), h('span', {}, 'Watch'))),
        h('div', { class: 'drip-card-actions' },
          btn,
          h('button', { class: 'drip-b drip-b-gray drip-next' }, icon('arrow'), h('span', { class: 'drip-next-label' }, 'Reveal next'), price('card')),
          h('button', { class: 'drip-b drip-b-gray drip-pass', 'aria-label': 'Pass' }, icon('x')))),
      h('section', { class: 'drip-saved' },
        h('button', { class: 'drip-saved-head', 'aria-expanded': 'false' }, icon('chevron-down', 'drip-chevron'), head)));
    document.body.append(
      h('div', { class: 'mock-mast' }, h('span', { class: 'mock-logo' }, 'YouTube')),
      h('div', { id: 'drip-home', class: 'drip-ui' }, page),
      fx);
    return { kind: 'card', btn, bm, label, words: ['Stash', 'Stashed'],
      after: (on) => { head.textContent = stashHead(on ? [...STASH, VIDEO] : STASH); } };
  }

  function buildPill() {
    const bm = now ? null : bookmark(true, { dry: !!variant.dry });
    const label = variant.reserve ? reserved('') : h('span', {}, 'Stash');
    const btn = h('button', { class: 'drip-pill-save', 'aria-pressed': 'false', title: 'Stash it for later' }, now ? icon('save-outline') : bm.svg, label);
    const pill = h('div', { id: 'drip-pill', class: 'drip-ui' },
      h('span', { class: 'drip-pill-time' },
        DripGlass.make(12 / 15, 20),
        h('span', { class: 'drip-pill-label' }, h('span', { class: 'drip-pill-minutes' }, '12m'), h('span', { class: 'drip-sr' }, ' left today'))),
      btn);
    document.body.append(
      h('div', { class: 'mock-mast' }, h('span', { class: 'mock-logo' }, 'YouTube')),
      h('div', { class: 'mock-watch' },
        h('div', { class: 'mock-player' }, h('div', { class: 'mock-bar' }, h('div', { class: 'mock-bar-fill' })), pill),
        h('div', { class: 'mock-title' }, VIDEO.title),
        h('div', { class: 'mock-channel' }, VIDEO.channel)),
      fx);
    return { kind: 'pill', btn, bm, label, words: ['Stash', 'Stashed'], after: () => {} };
  }

  const ctx = SCENE === 'pill' ? buildPill() : buildCard();
  if (variant.tide) ctx.tide = tide(ctx.btn);

  /** Stash or Stashed, aria-pressed, and the title, as the real button does. */
  // E: the button is as wide as it is with "Stashed", and the icon and word sit centered in it.
  // Measured once Roboto has loaded, or the width would be the fallback font's.
  if (variant.fit === 'center') {
    ctx.btn.classList.add('mock-centered');
    document.fonts.ready.then(() => {
      const shown = ctx.label.textContent;
      ctx.label.textContent = ctx.words[1];
      ctx.btn.style.minWidth = `${ctx.btn.getBoundingClientRect().width}px`;
      ctx.label.textContent = shown;
    });
  }

  ctx.mark = (on) => {
    // F: the button eases to its new width, and what's beside it slides along.
    const from = variant.fit === 'slide' ? ctx.btn.getBoundingClientRect().width : 0;
    if (ctx.label.show) ctx.label.show(on);
    else ctx.label.textContent = ctx.words[on ? 1 : 0];
    if (from) {
      const to = ctx.btn.getBoundingClientRect().width;
      ctx.btn.classList.add('mock-sliding');
      api.animate(ctx.btn, [{ width: `${from}px` }, { width: `${to}px` }], { duration: 240, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)', fill: 'none' })
        .then(() => ctx.btn.classList.remove('mock-sliding'));
    }
    ctx.btn.classList.toggle('is-saved', on);
    ctx.btn.setAttribute('aria-pressed', String(on));
    ctx.btn.title = on ? 'In your stash. Click to take it out.' : 'Stash it for later';
  };

  async function toggle() {
    if (busy) return;
    busy = true;
    saved = !saved;
    if (now) {
      ctx.mark(saved);
      if (ctx.kind === 'pill') ctx.btn.replaceChildren(icon(saved ? 'save' : 'save-outline'), ctx.label);
    } else if (REDUCED) {
      ctx.bm.set(saved ? 1 : 0);
      ctx.tide?.set(saved ? 1 : 0);
      ctx.mark(saved);
    } else await (saved ? variant.stash(api, ctx) : variant.unstash(api, ctx));
    ctx.after(saved);
    busy = false;
  }
  ctx.btn.addEventListener('click', toggle);

  if (params.get('auto') === '1') {
    (async () => {
      await wait(700);
      await toggle();
      await wait(1600);
      await toggle();
    })();
  }
  globalThis.MOCK = { ctx, api, toggle, bookmark };
})();
