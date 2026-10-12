// The shared mockup: drip's home page built the way home.js view() builds it, with drip's real CSS, and a fake feed.
// Each variant page supplies reveal, next, and pass, and animates them its own way.
// ?theme=light drops html[dark]. ?slow=4 plays every animation and timer 4 times slower. ?load=slow makes the feed
// take 3 seconds, like a reveal from Subscriptions. ?reduced=1 previews prefers-reduced-motion.

(() => {
  const params = new URLSearchParams(location.search);
  const SLOW = Math.max(1, Number(params.get('slow')) || 1);
  if (params.get('theme') !== 'light') document.documentElement.setAttribute('dark', '');
  const REDUCED = params.get('reduced') === '1' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (REDUCED) document.documentElement.classList.add('mock-reduced');

  // How long the feed read and the thumbnail take. Home is near instant in the real page, since the grid is already
  // loaded under it; Subscriptions loads a feed in a hidden frame first.
  const LOAD = params.get('load') === 'slow' ? { feed: 3000, thumb: 600 } : { feed: 80, thumb: 450 };

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

  // Slow motion: every animation and transition runs at 1/SLOW, and wait() stretches timers to match.
  if (SLOW > 1) {
    const rate = 1 / SLOW;
    const tick = () => {
      for (const a of document.getAnimations()) if (a.playbackRate !== rate) a.playbackRate = rate;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms * SLOW));
  /** Element.animate, skipped under reduced motion: it jumps to the end and resolves at once. */
  function animate(el, keyframes, options) {
    const a = el.animate(keyframes, { fill: 'both', ...options });
    if (REDUCED) a.finish();
    else if (SLOW > 1) a.playbackRate = 1 / SLOW;
    return a.finished.catch(() => {});
  }

  // Real videos from a YouTube search for "woodworking jig", 2026-10-12.
  const VIDEOS = [
    { id: 'U35Rl1VwUd4', title: '99% of Beginners Need These 5 Woodworking Jigs!', channel: '731 Woodworks', length: '10:51' },
    { id: 'GsZFdkU3CV0', title: 'I can throw away my table saw jigs. This is all I need!', channel: 'Stumpy Nubs (James Hamilton)', length: '4:32' },
    { id: 'oEd39koM_Pc', title: "The Most Versatile Table Saw Jig You'll Ever Build?", channel: 'HoneyBadger WoodWorks', length: '12:13' },
    { id: 'jkd22bExEHU', title: "I don't get why people buy expensive woodworking jigs", channel: 'MWA Woodworks', length: '15:17' },
    { id: 'NN28myW9-qo', title: '11 Woodworking Jigs So Simple You’ll Regret Not Building Them Sooner', channel: 'The Evening Woodworker', length: '11:52' },
    { id: 'Fi6sJVDc248', title: 'The ONLY Jig You Need? Cuts Perfectly Straight with 3 Different Tools!', channel: 'Casual DIY', length: '9:25' },
  ];
  const STASH = [
    { id: 'cGg0ynaUBMQ', title: 'I Found a NEW Woodworking Jig That Changes EVERYTHING! (genius sled)', channel: '731 Woodworks', length: '19:33' },
    { id: '_CVhn40dpmk', title: '5 Jigs That Make Woodworking Easier', channel: 'TWCDesign', length: '10:00' },
  ];

  // A day like the welcome page's defaults, one drop already turned into minutes.
  const state = { watch: 3, rec: 10, current: null, saved: new Set(), next: 0 };

  function toast(text) {
    const t = h('div', { class: 'mock-toast' }, text);
    document.body.append(t);
    setTimeout(() => t.remove(), 1600);
  }

  /**
   * Builds the page and wires its buttons to the variant's handlers.
   * @param {{reveal: Function, next: Function, pass: Function}} handlers Each gets the api and returns a promise.
   */
  function app(handlers) {
    let busy = false;
    const run = (fn) => async () => {
      if (busy) return;
      busy = true;
      try { await fn(api); } finally { busy = false; }
    };

    const recNum = h('span', {}, String(state.rec));
    const recIcon = icon('card', 'drip-token-card');
    const stats = h('div', { class: 'drip-stats' },
      h('div', { class: 'drip-glass-tile' }, globalThis.DripGlass.make(1, 34)),
      h('div', { class: 'drip-time-block' }, h('div', { class: 'drip-time' }, '15m'), h('div', { class: 'drip-sub' }, 'left today')),
      h('div', { class: 'drip-counts' },
        h('div', { class: 'drip-count' }, icon('drop', 'drip-token-drop'), h('span', {}, String(state.watch)), h('span', { class: 'drip-sr' }, ' drops')),
        h('div', { class: 'drip-count' }, recIcon, recNum, h('span', { class: 'drip-sr' }, ' cards'))));

    function actions() {
      return h('div', { class: 'drip-actions' },
        h('button', { class: 'drip-b drip-b-gray drip-add', title: 'Add 15 minutes for 1 drop', onclick: () => toast('+15m buys minutes. Not part of this demo.') },
          icon('clock'), h('span', {}, '+15m'), price('drop')),
        h('button', { class: 'drip-b drip-b-gold drip-reveal', onclick: run(handlers.reveal) }, h('span', {}, 'Reveal video'), price('card')));
    }

    /** The card as home.js card() builds it. The image waits for loadThumb, and the variant decides how it shows. */
    function card(video) {
      const img = h('img', { alt: '', decoding: 'async' });
      const thumb = h('a', { class: 'drip-thumb', href: '#', tabindex: '-1', 'aria-hidden': 'true', onclick: (e) => { e.preventDefault(); toast('Watch opens the video.'); } }, img);
      const save = h('button', {
        class: 'drip-b drip-b-gray drip-card-save', 'aria-pressed': 'false', title: 'Stash it for later',
        onclick: () => {
          const on = !state.saved.has(video.id);
          if (on) state.saved.add(video.id); else state.saved.delete(video.id);
          save.classList.toggle('is-saved', on);
          save.setAttribute('aria-pressed', String(on));
          save.querySelector('.drip-save-label').textContent = on ? 'Stashed' : 'Stash';
          drawSaved();
        },
      }, icon('save'), h('span', { class: 'drip-save-label' }, 'Stash'));
      const next = h('button', { class: 'drip-b drip-b-gray drip-next', onclick: run(handlers.next) },
        icon('arrow'), h('span', { class: 'drip-next-label' }, 'Reveal next'), price('card'));
      const pass = h('button', { class: 'drip-b drip-b-gray drip-pass', title: "Pass. It's free, and this video won't come back.", 'aria-label': 'Pass', onclick: run(handlers.pass) }, icon('x'));
      const title = h('div', { class: 'drip-card-title', title: video.title }, video.title);
      const meta = h('span', { class: 'drip-meta' }, `${video.channel} · ${video.length}`);
      const watch = h('button', { class: 'drip-b drip-b-primary drip-watch', onclick: () => toast('Watch opens the video.') }, icon('play'), h('span', {}, 'Watch'));
      const metaRow = h('div', { class: 'drip-card-meta-row' }, meta, watch);
      const row = h('div', { class: 'drip-card-actions' }, save, next, pass);
      const el = h('div', { class: 'drip-card' }, thumb, title, metaRow, row);
      return { el, img, thumb, title, meta, metaRow, watch, row, save, next, pass, video };
    }

    /** The loading shell: the 16:9 box, two title bars, and "Finding a video…". */
    function shell() {
      const subs = LOAD.feed > 1000;
      const thumb = h('div', { class: 'drip-thumb' });
      const title = h('div', { class: 'drip-card-title' }, h('span', { class: 'drip-skel' }), h('span', { class: 'drip-skel drip-skel-short' }));
      const metaRow = h('div', { class: 'drip-card-meta-row' }, h('span', { class: 'drip-meta' }, subs ? 'Checking your subscriptions…' : 'Finding a video…'));
      const el = h('div', { class: 'drip-card is-loading', 'aria-busy': 'true' }, thumb, title, metaRow);
      return { el, thumb, title, metaRow };
    }

    const slot = h('div', { class: 'mock-slot' }, actions());
    let savedOpen = true;
    const saved = h('section', { class: 'drip-saved' });
    function drawSaved() {
      const rows = [...VIDEOS.filter((v) => state.saved.has(v.id)).reverse(), ...STASH];
      const total = rows.reduce((s, v) => s + v.length.split(':').reduce((t, p) => t * 60 + Number(p), 0), 0);
      const mins = Math.round(total / 60);
      const head = `Stash · ${rows.length} videos · ${mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`}`;
      saved.classList.toggle('is-open', savedOpen);
      saved.replaceChildren(...[
        h('button', { class: 'drip-saved-head', 'aria-expanded': String(savedOpen), onclick: () => { savedOpen = !savedOpen; drawSaved(); } },
          icon('chevron-down', 'drip-chevron'), h('span', {}, head)),
        savedOpen && h('ul', { class: 'drip-saved-list' }, ...rows.slice(0, 3).map((v) => h('li', { class: 'drip-saved-row' },
          h('a', { class: 'drip-saved-link', href: '#' }, h('span', { class: 'drip-saved-title' }, v.title), h('span', { class: 'drip-saved-meta' }, `${v.channel} · ${v.length}`)),
          h('button', { class: 'drip-saved-x', title: 'Remove from stash' }, icon('x')),
          h('span', { class: 'drip-saved-play', 'aria-hidden': 'true' }, icon('play'))))),
      ].filter(Boolean));
    }
    drawSaved();

    const page = h('div', { class: 'drip-page' }, stats, slot, saved);
    const root = h('div', { id: 'drip-home', class: 'drip-ui' }, page);
    document.body.append(h('div', { class: 'mock-mast' }, h('span', { class: 'mock-logo' }, 'YouTube')), root);
    document.body.append(h('button', { class: 'mock-reset', onclick: () => location.reload() }, 'Start over'));

    const api = {
      root, page, stats, slot, saved, recIcon, recNum, actions, card, shell, state, LOAD,
      /** Saved opens on the empty page and folds while a card is up, like home.js. */
      setMode(mode) {
        savedOpen = mode === 'empty';
        drawSaved();
      },
      setRec(n) {
        state.rec = n;
        recNum.textContent = String(n);
      },
      /** Reads the "feed" and spends a card, as background.js does once a reveal succeeds. */
      async feed() {
        await wait(LOAD.feed);
        const video = VIDEOS[state.next++ % VIDEOS.length];
        api.setRec(state.rec - 1);
        state.current = video;
        return video;
      },
      /** Loads the thumbnail like home.js thumbnail(), hq720 with hqdefault as the fallback. Resolves once it can show. */
      loadThumb(img, video) {
        const started = performance.now();
        return new Promise((resolve) => {
          const done = async () => {
            const left = LOAD.thumb - (performance.now() - started) / SLOW;
            if (left > 0) await wait(left);
            resolve();
          };
          img.addEventListener('load', () => {
            if (img.naturalWidth <= 120 && !img.src.includes('hqdefault')) { img.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`; return; }
            done();
          });
          img.addEventListener('error', () => {
            if (!img.src.includes('hqdefault')) img.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
            else done();
          });
          img.src = `https://i.ytimg.com/vi/${video.id}/hq720.jpg`;
        });
      },
    };
    return api;
  }

  globalThis.Mock = { h, icon, price, wait, animate, app, SLOW, REDUCED, LOAD };
})();
