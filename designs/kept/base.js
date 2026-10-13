// The shared mockup for the counter round: drip's home page (home.js view()) with drip's real CSS, glass.js, and pour.js,
// in three scenes:
//   ?scene=kept   "Done for now" on the lock, which falls away onto the home page: "Kept 3 drops."
//   ?scene=new    The first home page after the 4:00am reset: 3 drops kept from yesterday, 4 new ones, cards 8 to 18.
//   ?scene=spend  +15m and Reveal video, to see the counts change when something is spent.
// Each variant supplies:
//   land(api, ctx)          drops (and cards) arriving in the counter, for the kept and new scenes
//   roll(api, num, from, to) how a count changes from one number to another
// ?theme=light drops html[dark]. ?slow=4 plays everything 4 times slower. ?reduced=1 previews prefers-reduced-motion.

(() => {
  const params = new URLSearchParams(location.search);
  const SLOW = Math.max(1, Number(params.get('slow')) || 1);
  const SCENE = ['kept', 'new', 'spend'].includes(params.get('scene')) ? params.get('scene') : 'kept';
  if (params.get('theme') !== 'light') document.documentElement.setAttribute('dark', '');
  document.documentElement.setAttribute('data-drip-shown', '');
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

  // A layer over everything, the lock included, for drops and rings.
  const fx = h('div', { class: 'mock-fx', 'aria-hidden': 'true' });

  /** A drop from drop.svg, `width` px wide, placed by its middle with place(). */
  function dropEl(width) {
    const img = h('img', { class: 'mock-drop', src: 'icons/drop.svg', alt: '' });
    img.style.width = `${width}px`;
    fx.append(img);
    return img;
  }

  function center(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
  }

  function place(el, x, y, extra = '') {
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) ${extra}`;
  }

  const at = (x, y, extra = '') => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) ${extra}`.trim();

  /** pour.js ring(): a ring spreading at x, y out to w by hgt px, fading. */
  function ring(x, y, w, hgt, ms = 650, delay = 0) {
    const r = h('div', { class: 'mock-ring' });
    fx.append(r);
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    return animate(r, [
      { width: '0px', height: '0px', translate: '-50% -50%', opacity: 1 },
      { width: `${w}px`, height: `${hgt}px`, translate: '-50% -50%', opacity: 0 },
    ], { duration: ms, delay, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }).then(() => r.remove());
  }

  /** pour.js splash(): two tiny droplets thrown up and out from x, y. */
  function splash(x, y, size = 3, spread = 8, height = 10, ms = 380) {
    return Promise.all([-1, 1].map((side) => {
      const el = h('div', { class: 'mock-splash' });
      el.style.width = el.style.height = `${size}px`;
      fx.append(el);
      const keys = Array.from({ length: 9 }, (_, i) => {
        const t = i / 8;
        return { transform: at(x + side * spread * t, y - 4 * height * t * (1 - t)), opacity: 1 - t * t };
      });
      return animate(el, keys, { duration: ms, easing: 'linear' }).then(() => el.remove());
    }));
  }

  // A count's number. Variants roll it with swap(): the old and new numbers share one grid cell, so both can move.
  function num(n) {
    return h('span', { class: 'mock-num' }, h('span', { class: 'mock-digit' }, String(n)));
  }

  /**
   * Swaps a count's number from its current one to `to`, the old one leaving with `out` keyframes and the new one
   * arriving with `inn`. `clip` hides what moves outside the line, like an odometer.
   */
  async function swap(el, to, out, inn, { ms = 260, easing = 'cubic-bezier(0.3, 0.7, 0.2, 1)', clip = true } = {}) {
    el.classList.toggle('is-clip', clip);
    const old = el.lastElementChild;
    const next = h('span', { class: 'mock-digit' }, String(to));
    el.append(next);
    zero(el, to);
    await Promise.all([
      old ? animate(old, out, { duration: ms, easing }) : null,
      animate(next, inn, { duration: ms, easing }),
    ]);
    // Another swap may have started meanwhile. Only what came before this number goes.
    while (next.isConnected && el.firstElementChild !== next) el.firstElementChild.remove();
    if (next.isConnected) next.getAnimations().forEach((a) => a.cancel());
  }

  /** Sets a count at once. */
  function setNum(el, n) {
    el.replaceChildren(h('span', { class: 'mock-digit' }, String(n)));
    zero(el, n);
  }

  function zero(el, n) {
    el.closest('.drip-count')?.classList.toggle('is-zero', n < 1);
  }

  function toast(text) {
    const t = h('div', { class: 'mock-toast' }, text);
    document.body.append(t);
    setTimeout(() => t.remove(), 2200);
  }

  // Real videos, from the stash on air on 2026-10-11.
  const STASH = [
    { title: 'Eat Everything In A Grocery Store, Win $1,000,000', channel: 'MrBeast', length: '57:59' },
    { title: '4 woodworking jigs you’ll actually use', channel: 'TWCDesign', length: '10:46' },
    { title: 'I Found a NEW Woodworking Jig That Changes EVERYTHING! (genius sled)', channel: '731 Woodworks', length: '19:32' },
  ];

  /**
   * The home page. Each scene starts from a real day on the default settings (4 drops and 10 cards a day, kept up to 2
   * days, 15 minutes a drop).
   */
  function homeScene(variant) {
    const start = {
      // Bought 30m, watched it all, hit the lock with 3 drops left, and pressed Done for now. The variants count the kept
      // drops in from 0; as built, the counter already shows 3.
      kept: { drops: variant.instant ? 3 : 0, cards: 8, left: 0, bought: 30 * 60 },
      // The first page after the reset: yesterday's 3 drops and 8 cards are kept, the minutes are back to 0.
      new: { drops: 3, cards: 8, left: 0, bought: 0 },
      // Midday: one drop spent, 11 of its 15 minutes watched.
      spend: { drops: 3, cards: 9, left: 4 * 60, bought: 15 * 60 },
    }[SCENE];
    const s = { ...start };
    const GLASS_PX = 34;
    const glass = G.make(s.bought ? s.left / s.bought : 0, GLASS_PX);
    const time = h('div', { class: 'drip-time' }, formatMinutes(s.left));
    const dropNum = num(s.drops);
    const cardNum = num(s.cards);
    const dropIcon = icon('drop', 'drip-token-drop');
    const cardIcon = icon('card', 'drip-token-card');
    const dropCount = h('div', { class: `drip-count${s.drops ? '' : ' is-zero'}` }, dropIcon, dropNum, h('span', { class: 'drip-sr' }, ' drops'));
    const cardCount = h('div', { class: `drip-count${s.cards ? '' : ' is-zero'}` }, cardIcon, cardNum, h('span', { class: 'drip-sr' }, ' cards'));
    const tile = h('div', { class: 'drip-glass-tile' }, glass);
    let busy = false;

    const add = h('button', { class: 'drip-b drip-b-gray drip-add', title: 'Add 15 minutes for 1 drop', onclick: onAdd, disabled: s.drops < 1 && SCENE !== 'kept' },
      icon('clock'), h('span', {}, '+15m'), price('drop'));
    const reveal = h('button', { class: 'drip-b drip-b-gold drip-reveal', onclick: onReveal }, h('span', {}, 'Reveal video'), price('card'));
    const actions = h('div', { class: 'drip-actions' }, add, reveal);

    async function onAdd() {
      if (busy || s.drops < 1) return;
      busy = true;
      const from = s.bought ? s.left / s.bought : 0;
      const counter = dropIcon.getBoundingClientRect();
      s.drops -= 1;
      s.left += 15 * 60;
      s.bought += 15 * 60;
      const to = s.left / s.bought;
      add.disabled = s.drops < 1;
      const rolled = variant.roll(api, dropNum, s.drops + 1, s.drops);
      if (REDUCED) {
        time.textContent = formatMinutes(s.left);
        G.set(glass, to, GLASS_PX);
      } else {
        await globalThis.DripPour.pour({ counter, glass, px: GLASS_PX, from, to, onLand: () => { time.textContent = formatMinutes(s.left); } });
      }
      await rolled;
      busy = false;
      if (s.drops < 1) toast('Out of drops. Replay to start over.');
    }

    async function onReveal() {
      if (busy || s.cards < 1) return;
      busy = true;
      s.cards -= 1;
      reveal.disabled = s.cards < 1;
      await variant.roll(api, cardNum, s.cards + 1, s.cards);
      busy = false;
      toast('The reveal itself is its own animation. Only the count is shown here.');
    }

    const rows = STASH.map((v) => h('li', { class: 'drip-saved-row' },
      h('a', { class: 'drip-saved-link', href: '#' },
        h('span', { class: 'drip-saved-title' }, v.title),
        h('span', { class: 'drip-saved-meta' }, `${v.channel} · ${v.length}`)),
      h('button', { class: 'drip-saved-x', title: 'Remove from stash' }, icon('x')),
      h('span', { class: 'drip-saved-play', 'aria-hidden': 'true' }, h('span', { class: 'drip-saved-price' }, '-1', icon('drop', 'drip-token-drop')), icon('play'))));
    const saved = h('section', { class: 'drip-saved is-open' },
      h('button', { class: 'drip-saved-head', 'aria-expanded': 'true' }, icon('chevron-down', 'drip-chevron'), h('span', {}, 'Stash · 3 videos · 1h 28m')),
      h('ul', { class: 'drip-saved-list' }, ...rows));
    const page = h('div', { class: 'drip-page' },
      h('div', { class: 'drip-stats' },
        tile,
        h('div', { class: 'drip-time-block' }, time, h('div', { class: 'drip-sub' }, 'left today')),
        h('div', { class: 'drip-counts' }, dropCount, cardCount)),
      actions,
      saved);
    document.body.append(
      h('div', { class: 'mock-mast' }, h('span', { class: 'mock-logo' }, 'YouTube')),
      h('div', { id: 'drip-home', class: 'drip-ui' }, page),
      fx);

    /** home.js's gray message line under the buttons. `rise` gives it the kept message's rise. */
    function showMessage(content, { rise = true } = {}) {
      page.querySelector('.drip-message')?.remove();
      const el = h('div', { class: `drip-message${rise ? ' is-kept' : ''}`, role: 'status' });
      el.append(...[].concat(content));
      actions.after(el);
      return el;
    }

    const ctx = {
      kind: SCENE, page, glass, px: GLASS_PX, showMessage,
      drop: { count: dropCount, icon: dropIcon, num: dropNum, from: s.drops, to: SCENE === 'kept' ? 3 : 7 },
      card: { count: cardCount, icon: cardIcon, num: cardNum, from: s.cards, to: SCENE === 'new' ? 18 : s.cards },
    };

    async function land() {
      if (REDUCED) {
        setNum(dropNum, ctx.drop.to);
        setNum(cardNum, ctx.card.to);
        if (SCENE === 'kept') showMessage('Kept 3 drops.', { rise: false });
      } else await variant.land(api, ctx);
      s.drops = ctx.drop.to;
      s.cards = ctx.card.to;
      add.disabled = false;
    }

    if (SCENE === 'kept') {
      add.disabled = false;
      const lock = lockOver();
      ctx.lock = lock;
      ctx.surface = (async () => {
        await wait(1100);
        lock.querySelector('.drip-done').focus({ preventScroll: true });
        await wait(500);
        // watch.js onDone: Done's rings run while YouTube goes home, then the water falls away top first.
        lock.classList.add('is-leaving');
        await wait(300);
        lock.style.animation = '';
        lock.classList.add('is-surfacing');
        ctx.surfaceAt = performance.now();
        if (REDUCED) lock.remove();
        else setTimeout(() => lock.remove(), 1000 * SLOW);
      })();
      ctx.surface.then(land);
    } else if (SCENE === 'new') {
      setTimeout(land, 800 * SLOW);
    } else if (params.get('auto') === '1') {
      setTimeout(() => add.click(), 700 * SLOW);
    }
  }

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

  /** The lock as watch.js showLock() builds it with drops left, already risen, over the home page. */
  function lockOver() {
    const panel = h('div', { class: 'drip-lock-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'drip-lock-title' },
      h('h2', { class: 'drip-lock-title', id: 'drip-lock-title' }, 'Time for a breather.'),
      h('div', { class: 'drip-lock-sub' }, '30m watched today · 50m last Monday'),
      h('div', { class: 'drip-lock-actions' },
        h('button', { class: 'drip-b drip-b-gray drip-lock-add', title: 'Add 15 minutes for 1 drop' }, icon('clock'), h('span', {}, '+15m'), price('drop')),
        h('button', { class: 'drip-b drip-b-primary drip-done' }, h('span', {}, 'Done for now'))),
      h('button', { class: 'drip-lock-link' }, 'I need this one · 2 left'));
    const el = h('div', { id: 'drip-lock', class: 'drip-ui' }, sea(), panel);
    el.style.animation = 'none';
    document.body.append(el);
    return el;
  }

  /** The lock's waterline on screen: the top of its water, from 0 (full) to the window's height (gone). */
  function waterTop(lock) {
    if (!lock?.isConnected) return Infinity;
    return parseFloat(getComputedStyle(lock).getPropertyValue('--drip-water')) || 0;
  }

  const G = globalThis.DripGlass;

  const api = {
    h, icon, wait, animate, frames, ease, fx, dropEl, center, place, at, ring, splash, swap, setNum, toast, waterTop,
    SLOW, REDUCED,
  };

  globalThis.Mock = {
    api,
    run(variant) {
      homeScene(variant);
    },
  };
})();
