// The shared mockup for the glass round: drip's home page (home.js view()) and a watch page with the pill and the lock
// (watch.js renderPill() and showLock()), drawn with drip's real CSS and glass.js. Each variant supplies three motions:
//   pour(api, ctx)      +15m on the home page
//   lastDrop(api, ctx)  the pill hits 0 and the lock comes up
//   lockAdd(api, ctx)   +15m on the lock: the water drains and the pill's glass fills
// ?scene=home or ?scene=watch. ?theme=light drops html[dark]. ?slow=4 plays everything 4 times slower. ?reduced=1
// previews prefers-reduced-motion.

(() => {
  const params = new URLSearchParams(location.search);
  const SLOW = Math.max(1, Number(params.get('slow')) || 1);
  const SCENE = params.get('scene') === 'watch' ? 'watch' : 'home';
  if (params.get('theme') !== 'light') document.documentElement.setAttribute('dark', '');
  const REDUCED = params.get('reduced') === '1' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (REDUCED) document.documentElement.classList.add('mock-reduced');

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

  function formatMinutes(seconds) {
    if (!(seconds > 0)) return '0m';
    if (seconds < 60) return '<1m';
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (!hours) return `${minutes}m`;
    return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  }

  // Slow motion: every Web Animation runs at 1/SLOW, and wait() and frames() stretch to match.
  if (SLOW > 1) {
    const rate = 1 / SLOW;
    const tick = () => {
      for (const a of document.getAnimations()) if (a.playbackRate !== rate) a.playbackRate = rate;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms * SLOW));

  /** Element.animate that resolves when done. Under reduced motion it jumps to the end. */
  function animate(el, keyframes, options) {
    const a = el.animate(keyframes, { fill: 'both', ...options });
    if (REDUCED) a.finish();
    else if (SLOW > 1) a.playbackRate = 1 / SLOW;
    return a.finished.then(() => a, () => a);
  }

  /** Runs step(t) every frame for ms, t from 0 to 1. */
  function frames(ms, step) {
    if (REDUCED) { step(1); return Promise.resolve(); }
    return new Promise((resolve) => {
      const start = performance.now();
      const loop = (now) => {
        const t = Math.min(1, (now - start) / (ms * SLOW));
        step(t);
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
  };

  // A layer over everything for things that fly between elements: drops, streams, rings.
  const fx = h('div', { class: 'mock-fx', 'aria-hidden': 'true' });

  function dropEl(width) {
    const img = h('img', { class: 'mock-drop', src: 'icons/drop.svg', alt: '' });
    img.style.width = `${width}px`;
    fx.append(img);
    return img;
  }

  /** Where a box's center is, in viewport pixels. */
  function center(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
  }

  /** Places an fx element so its center is at x, y. */
  function place(el, x, y, extra = '') {
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) ${extra}`;
  }

  // The glass. Its water is a waterline (glass.js WAVE) moved by translateY in viewBox units; these read and move it.
  const G = globalThis.DripGlass;
  const VIEW_H = 814;
  const wave = (svg) => svg.querySelector('.drip-glass-wave');
  const waveY = (fraction, px) => (fraction >= 1 ? 0 : G.waterline(fraction, px));

  /** Sets the glass with no transition, so a variant's own animation can take it from here. */
  function glassNow(svg, fraction, px) {
    const w = wave(svg);
    w.style.transition = 'none';
    G.set(svg, fraction, px);
    w.getBoundingClientRect();
    requestAnimationFrame(() => { w.style.transition = ''; });
  }

  /** The waterline's height on screen, for placing things on the water. */
  function surfaceY(svg, fraction, px) {
    const r = svg.getBoundingClientRect();
    return r.top + (Math.max(0, waveY(fraction, px)) / VIEW_H) * r.height;
  }

  /**
   * Moves the water through keyframes, each { y, tilt }: y as a fraction (0 to 1) of full, tilt in degrees. The tilt
   * turns the waterline about its middle, so the water sloshes.
   */
  function water(svg, px, keys, options) {
    const w = wave(svg);
    w.style.transformOrigin = '310px 0px';
    const frames = keys.map((k) => {
      const f = { transform: `translateY(${waveY(k.y, px)}px) rotate(${k.tilt || 0}deg)` };
      if (k.offset !== undefined) f.offset = k.offset;
      if (k.easing) f.easing = k.easing;
      return f;
    });
    return animate(w, frames, { fill: 'none', ...options });
  }

  function toast(text) {
    const t = h('div', { class: 'mock-toast' }, text);
    document.body.append(t);
    setTimeout(() => t.remove(), 1800);
  }

  // Real videos, from the stash on air on 2026-10-11.
  const STASH = [
    { title: 'Eat Everything In A Grocery Store, Win $1,000,000', channel: 'MrBeast', length: '57:59' },
    { title: '4 woodworking jigs you’ll actually use', channel: 'TWCDesign', length: '10:46' },
    { title: 'I Found a NEW Woodworking Jig That Changes EVERYTHING! (genius sled)', channel: '731 Woodworks', length: '19:32' },
  ];

  // The home page: a day on the default settings, one drop already spent and 11 of its 15 minutes watched.
  function homeScene(variant) {
    const s = { drops: 3, cards: 10, left: 4 * 60, bought: 15 * 60 };
    const GLASS_PX = 34;
    const glass = G.make(s.left / s.bought, GLASS_PX);
    const time = h('div', { class: 'drip-time' }, formatMinutes(s.left));
    const dropNum = h('span', {}, String(s.drops));
    const dropIcon = icon('drop', 'drip-token-drop');
    const dropCount = h('div', { class: 'drip-count' }, dropIcon, dropNum, h('span', { class: 'drip-sr' }, ' drops'));
    const tile = h('div', { class: 'drip-glass-tile' }, glass);
    let busy = false;
    const add = h('button', { class: 'drip-b drip-b-gray drip-add', title: 'Add 15 minutes for 1 drop', onclick: onAdd },
      icon('clock'), h('span', {}, '+15m'), price('drop'));

    async function onAdd() {
      if (busy || s.drops < 1) return;
      busy = true;
      const from = s.left / s.bought;
      s.drops -= 1;
      s.left += 15 * 60;
      s.bought += 15 * 60;
      const to = s.left / s.bought;
      const ctx = {
        glass, tile, px: GLASS_PX, from, to, dropIcon, dropCount, button: add,
        spendDrop: () => {
          dropNum.textContent = String(s.drops);
          dropCount.classList.toggle('is-zero', s.drops < 1);
          add.disabled = s.drops < 1;
        },
        showTime: () => { time.textContent = formatMinutes(s.left); },
      };
      if (REDUCED) {
        ctx.spendDrop();
        ctx.showTime();
        G.set(glass, to, GLASS_PX);
      } else await variant.pour(api, ctx);
      G.set(glass, to, GLASS_PX);
      busy = false;
      if (s.drops < 1) toast('Out of drops. Replay to start over.');
    }

    const rows = STASH.map((v) => h('li', { class: 'drip-saved-row' },
      h('a', { class: 'drip-saved-link', href: '#' },
        h('span', { class: 'drip-saved-title' }, v.title),
        h('span', { class: 'drip-saved-meta' }, `${v.channel} · ${v.length}`)),
      h('button', { class: 'drip-saved-x', title: 'Remove from stash' }, icon('x')),
      h('span', { class: 'drip-saved-play', 'aria-hidden': 'true' }, h('span', { class: 'drip-saved-price' }, '-1', icon('drop', 'drip-token-drop')), icon('play'))));
    const page = h('div', { class: 'drip-page' },
      h('div', { class: 'drip-stats' },
        tile,
        h('div', { class: 'drip-time-block' }, time, h('div', { class: 'drip-sub' }, 'left today')),
        h('div', { class: 'drip-counts' },
          dropCount,
          h('div', { class: 'drip-count' }, icon('card', 'drip-token-card'), h('span', {}, String(s.cards)), h('span', { class: 'drip-sr' }, ' cards')))),
      h('div', { class: 'drip-actions' },
        add,
        h('button', { class: 'drip-b drip-b-gold drip-reveal', onclick: () => toast('Reveal is the last round. Try +15m.') }, h('span', {}, 'Reveal video'), price('card'))),
      h('section', { class: 'drip-saved is-open' },
        h('button', { class: 'drip-saved-head', 'aria-expanded': 'true' }, icon('chevron-down', 'drip-chevron'), h('span', {}, 'Stash · 3 videos · 1h 28m')),
        h('ul', { class: 'drip-saved-list' }, ...rows)));
    document.body.append(
      h('div', { class: 'mock-mast' }, h('span', { class: 'mock-logo' }, 'YouTube')),
      h('div', { id: 'drip-home', class: 'drip-ui' }, page),
      fx);
    if (params.get('auto') === '1') setTimeout(() => add.click(), 700 * SLOW);
  }

  const VIDEO = { id: 'plN7JMbadRg', title: 'Eat Everything In A Grocery Store, Win $1,000,000', channel: 'MrBeast' };
  const BUBBLES = 14;

  function sea() {
    const between = (min, max) => min + Math.random() * (max - min);
    const bubbles = Array.from({ length: BUBBLES }, () => {
      const bubble = h('span', { class: 'drip-bubble' }, h('span', {}));
      bubble.style.setProperty('--x', `${between(3, 97).toFixed(1)}%`);
      bubble.style.setProperty('--size', `${Math.round(between(4, 13))}px`);
      bubble.style.setProperty('--rise', `${between(10, 19).toFixed(1)}s`);
      bubble.style.setProperty('--delay', `${between(0.9, 12).toFixed(1)}s`);
      bubble.style.setProperty('--sway', `${between(2.4, 4.2).toFixed(1)}s`);
      return bubble;
    });
    const fish = ['drip-fish-a', 'drip-fish-b'].map((name) => h('span', { class: `drip-fish ${name}` }, h('span', {})));
    return h('div', { class: 'drip-sea', 'aria-hidden': 'true' }, ...bubbles, ...fish);
  }

  // The watch page: the last seconds of the day's minutes, 45m watched so far. Play counts down, and at 0 the lock comes
  // up. +15m on the lock drains it and the video plays on.
  function watchScene(variant) {
    const s = { drops: 2, left: 4, bought: 45 * 60, playing: false, locked: false };
    const PILL_PX = 20;
    const glass = G.make(s.left / s.bought, PILL_PX);
    const minutes = h('span', { class: 'drip-pill-minutes' }, formatMinutes(s.left));
    const time = h('span', { class: 'drip-pill-time' }, glass, h('span', { class: 'drip-pill-label' }, minutes, h('span', { class: 'drip-sr' }, ' left today')));
    const pill = h('div', { id: 'drip-pill', class: 'drip-ui' },
      time,
      h('button', { class: 'drip-pill-save', title: 'Stash it for later' }, icon('save-outline'), h('span', {}, 'Stash')));
    const player = h('div', { class: 'mock-player' },
      h('img', { src: `https://i.ytimg.com/vi/${VIDEO.id}/maxresdefault.jpg`, alt: '' }),
      pill,
      h('div', { class: 'mock-bar' }, h('div', { class: 'mock-bar-fill' })));
    const playBtn = h('button', { class: 'mock-play', onclick: play }, 'Play');
    document.body.append(
      h('div', { class: 'mock-watch' },
        h('div', { class: 'mock-mast' }, h('span', { class: 'mock-logo' }, 'YouTube')),
        player,
        h('div', { class: 'mock-title' }, VIDEO.title),
        h('div', { class: 'mock-channel' }, VIDEO.channel, ' · ', playBtn)),
      fx);

    function pillLook() {
      const low = s.playing && s.left > 0 && s.left <= 120;
      pill.classList.toggle('is-low', low);
      playBtn.textContent = s.playing ? 'Pause' : 'Play';
      player.classList.toggle('is-playing', s.playing);
    }

    let timer;
    function play() {
      if (s.locked) return;
      if (s.playing) { s.playing = false; clearInterval(timer); pillLook(); return; }
      s.playing = true;
      pillLook();
      timer = setInterval(tick, 1000);
    }

    async function tick() {
      s.left = Math.max(0, s.left - 1);
      minutes.textContent = formatMinutes(s.left);
      if (s.left > 0) {
        G.set(glass, s.left / s.bought, PILL_PX);
        return;
      }
      clearInterval(timer);
      s.playing = false;
      s.locked = true;
      pillLook();
      const ctx = { pill, glass, px: PILL_PX, player, from: 1 / s.bought };
      if (REDUCED) {
        G.set(glass, 0, PILL_PX);
        lock();
      } else await variant.lastDrop(api, ctx);
    }

    /** The lock as watch.js showLock() builds it with drops left. The real CSS rises the water when it's added. */
    function lock() {
      const add = h('button', { class: 'drip-b drip-b-gray drip-lock-add', 'data-k': 'add', title: 'Add 15 minutes for 1 drop', onclick: () => onLockAdd(el, add) },
        icon('clock'), h('span', {}, '+15m'), price('drop'));
      const panel = h('div', { class: 'drip-lock-panel is-new', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'drip-lock-title' },
        h('h2', { class: 'drip-lock-title', id: 'drip-lock-title' }, 'Time for a breather.'),
        h('div', { class: 'drip-lock-sub' }, '45m watched today · 50m last Monday'),
        h('div', { class: 'drip-lock-actions' },
          add,
          h('button', { class: 'drip-b drip-b-primary drip-done', 'data-k': 'done', onclick: () => toast('Done for now was round 2 of the lock. Try +15m.') }, h('span', {}, 'Done for now'))),
        h('button', { class: 'drip-lock-link', 'data-k': 'need' }, 'I need this one · 2 left'));
      const el = h('div', { id: 'drip-lock', class: 'drip-ui' }, sea(), panel);
      document.body.append(el);
      return el;
    }

    let adding = false;
    async function onLockAdd(el, button) {
      if (adding) return;
      adding = true;
      s.drops -= 1;
      s.left = 15 * 60;
      s.bought += 15 * 60;
      const to = s.left / s.bought;
      const ctx = {
        lock: el, button, pill, glass, px: PILL_PX, to,
        /** The real drain: 600ms, then the overlay goes. */
        drain: () => {
          el.classList.add('is-draining');
          return wait(600).then(() => el.remove());
        },
        showTime: () => { minutes.textContent = formatMinutes(s.left); },
      };
      if (REDUCED) {
        el.remove();
        ctx.showTime();
        G.set(glass, to, PILL_PX);
      } else await variant.lockAdd(api, ctx);
      G.set(glass, to, PILL_PX);
      ctx.showTime();
      // The video plays on. 15 minutes is longer than the demo, so the pill stops counting here.
      s.locked = false;
      s.playing = true;
      adding = false;
      pillLook();
    }

    api.lock = lock;
    setTimeout(play, 900);
  }

  const api = {
    h, icon, wait, animate, frames, ease, fx, dropEl, center, place, wave, waveY, glassNow, surfaceY, water, toast,
    SLOW, REDUCED, lock: () => null,
  };

  globalThis.Mock = {
    api,
    run(variant) {
      if (SCENE === 'watch') watchScene(variant);
      else homeScene(variant);
    },
  };
})();
