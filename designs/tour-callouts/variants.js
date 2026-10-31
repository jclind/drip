// @ts-check
// Tour callouts, round 1. Runs on top of the real welcome page (tour.html loads it after welcome.js) and only watches
// the stage: it never touches the tour's state. Every 100ms it reads what the stage shows, turns a change into an
// event (a drop spent, minutes added, a card used, play, pause, the lock), and the variant draws its answer.
//   A, Notes: a short note with a drawn arrow, only when the thing it points at moves, then it goes.
//   B, Live: no notes. The player looks like it's playing, and each number that changes says by how much.
//   C, Spotlight: the stage dims except for the one thing to look at now, with a line under it. The light moves on as
//      things happen.
// &live=1 adds B's player to A or C.

(() => {
  const params = new URLSearchParams(location.search);
  const v = params.get('v') || 'a';
  const live = v === 'b' ? params.get('live') !== '0' : params.get('live') === '1';
  document.documentElement.dataset.variant = v;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const stage = /** @type {HTMLElement} */ (document.getElementById('stage'));
  /** @param {string} sel */
  const q = (sel) => /** @type {HTMLElement | null} */ (stage.querySelector(sel));

  // One layer over the stage for notes and the spotlight. A step change empties the stage, so it's put back each tick.
  const layer = document.createElement('div');
  layer.className = 'cv-layer';
  layer.setAttribute('aria-hidden', 'true');

  /** Where an element sits inside the stage's padding box. @param {Element} el */
  function box(el) {
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const x = r.left - s.left - stage.clientLeft;
    const y = r.top - s.top - stage.clientTop;
    return { x, y, w: r.width, h: r.height, cx: x + r.width / 2, cy: y + r.height / 2, sw: stage.clientWidth, sh: stage.clientHeight };
  }

  /** @type {Set<ReturnType<typeof setTimeout>>} */
  const timers = new Set();
  /** @param {() => void} fn @param {number} ms */
  function later(fn, ms) {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
  }

  // A: notes. Each is a chip with a line that draws from the chip to its target. Up to two at once; a note at the same
  // target replaces the one there.

  /** @type {Map<string, HTMLElement>} */
  const notes = new Map();
  /** How to put each note back on its target. @type {Map<HTMLElement, () => void>} */
  const placers = new Map();
  /** Where each note's chip sits, oldest first. @type {Map<HTMLElement, { left: number, top: number, w: number, h: number }>} */
  const chipBoxes = new Map();

  /**
   * `side` puts the chip above or below its target; by default the stats row gets notes above it, since the buttons sit
   * right under it, and anything else goes to the roomier half. `align` 'start' runs the chip right from the target and
   * 'end' runs it left, so two notes on one row don't cover each other.
   * @param {string} sel @param {string} text @param {number} [hold]
   * @param {{ side?: 'above' | 'below' | 'right', align?: 'start' | 'end', gap?: number, width?: number }} [opt]
   */
  function note(sel, text, hold = 2800, opt = {}) {
    if (!q(sel)) return;
    const old = notes.get(sel);
    if (old) { old.remove(); placers.delete(old); chipBoxes.delete(old); }
    const el = document.createElement('div');
    el.className = 'cv-note';
    const chip = document.createElement('span');
    chip.className = 'cv-chip';
    chip.textContent = text;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'cv-line');
    svg.innerHTML = '<path pathLength="1"/><path class="cv-head"/>';
    el.append(svg, chip);
    layer.append(el);
    // The target can still be moving when the note starts (a card dealt in pushes the stats up), so tick() calls this
    // again every 100ms and the note follows it.
    const place = () => {
      const target = q(sel);
      if (!target) return;
      const b = box(target);
      const cw = chip.offsetWidth;
      const ch = chip.offsetHeight;
      const gap = 40;
      let side = opt.side || (target.closest('.drip-stats') ? 'above' : b.cy < b.sh * 0.55 ? 'below' : 'above');
      // No room above (the stats at the stage's top edge): go below instead.
      if (side === 'above' && b.y - gap - ch < 6) side = 'below';
      const below = side === 'below';
      const right = side === 'right';
      el.classList.toggle('is-below', below);
      el.classList.toggle('is-above', side === 'above');
      el.classList.toggle('is-right', right);
      if (opt.width) chip.style.maxWidth = `${opt.width}px`;
      let left, top, fromX, fromY, toX, toY, midX, midY;
      if (right) {
        // Beside the target, in the strip between it and the stage's edge.
        left = Math.min(b.sw - cw - 8, b.x + b.w + (opt.gap ?? 22));
        top = b.cy - ch / 2;
        fromX = left - 4;
        fromY = top + ch / 2;
        toX = b.x + b.w + 4;
        toY = b.cy;
        midX = (fromX + toX) / 2;
        midY = (fromY + toY) / 2;
      } else {
        // The chip sits 40px past the target, kept inside the stage.
        const want = opt.align === 'start' ? b.cx - 14 : opt.align === 'end' ? b.cx - cw + 14 : b.cx - cw / 2;
        left = Math.max(10, Math.min(b.sw - cw - 10, want));
        top = below ? b.y + b.h + gap : b.y - gap - ch;
        // On a narrow stage two notes on one row can meet: this one stacks past any earlier note it would cover.
        for (const [other, r] of chipBoxes) {
          if (other === el) break;
          if (left < r.left + r.w && left + cw > r.left && top < r.top + r.h && top + ch > r.top) {
            top = below ? r.top + r.h + 6 : r.top - ch - 6;
          }
        }
        // The line: from the chip's near edge to just short of the target, bowed to one side.
        fromX = Math.max(left + 14, Math.min(left + cw - 14, b.cx + (b.cx < b.sw / 2 ? 18 : -18)));
        fromY = below ? top - 4 : top + ch + 4;
        toX = b.cx;
        toY = below ? b.y + b.h + 5 : b.y - 5;
        midX = (fromX + toX) / 2 + (fromX < toX ? -1 : 1) * 16;
        midY = (fromY + toY) / 2;
      }
      chip.style.left = `${left}px`;
      chip.style.top = `${top}px`;
      chipBoxes.set(el, { left, top, w: cw, h: ch });
      const ang = Math.atan2(toY - midY, toX - midX);
      const head = (/** @type {number} */ turn) => `${toX - 7 * Math.cos(ang + turn)},${toY - 7 * Math.sin(ang + turn)}`;
      svg.setAttribute('width', String(b.sw));
      svg.setAttribute('height', String(b.sh));
      const [line, tip] = svg.children;
      line.setAttribute('d', `M${fromX},${fromY} Q${midX},${midY} ${toX},${toY}`);
      tip.setAttribute('d', `M${head(0.5)} L${toX},${toY} L${head(-0.5)}`);
    };
    place();
    placers.set(el, place);
    notes.set(sel, el);
    later(() => {
      el.classList.add('is-going');
      later(() => { el.remove(); placers.delete(el); chipBoxes.delete(el); if (notes.get(sel) === el) notes.delete(sel); }, 400);
    }, hold);
  }

  // C: the spotlight. One hole in a dim veil, with a chip under or over it. `hold` 0 keeps it until the next one.

  const spot = document.createElement('div');
  spot.className = 'cv-spot';
  const spotChip = document.createElement('span');
  spotChip.className = 'cv-chip cv-spot-chip';
  let spotSel = '';
  /** @type {{ side?: 'above' | 'below', align?: 'start', under?: string }} */
  let spotOpt = {};
  let spotGen = 0;

  /**
   * `side` picks above or below the hole; `align` 'start' lines the chip up with the hole's left edge; `under` puts the
   * chip below another element (the lock's panel) instead of right against the hole.
   * @param {string} sel @param {string} text @param {number} [hold]
   * @param {{ side?: 'above' | 'below', align?: 'start', under?: string }} [opt]
   */
  function light(sel, text, hold = 3000, opt = {}) {
    const target = q(sel);
    if (!target) return;
    spotSel = sel;
    spotOpt = opt;
    const gen = ++spotGen;
    spotChip.textContent = text;
    if (!spot.isConnected) layer.append(spot, spotChip);
    placeSpot();
    layer.classList.add('is-lit');
    if (hold) later(() => { if (gen === spotGen) dark(); }, hold);
  }

  function dark() {
    spotGen++;
    spotSel = '';
    layer.classList.remove('is-lit');
  }

  /** Keeps the hole on its target, which can move as the stage redraws. */
  function placeSpot() {
    const target = spotSel && q(spotSel);
    if (!target) return;
    const b = box(target);
    const pad = 8;
    Object.assign(spot.style, { left: `${b.x - pad}px`, top: `${b.y - pad}px`, width: `${b.w + pad * 2}px`, height: `${b.h + pad * 2}px` });
    // The stats row's chip goes above it, since the buttons sit right under it; anything else goes to the roomier half,
    // or below when there's no room above.
    const ch = spotChip.offsetHeight;
    let below = spotOpt.side ? spotOpt.side === 'below' : target.closest('.drip-stats') ? false : b.cy < b.sh * 0.55;
    if (!below && b.y - pad - 12 - ch < 6) below = true;
    const cw = spotChip.offsetWidth;
    const want = spotOpt.align === 'start' ? b.x : b.cx - cw / 2;
    spotChip.style.left = `${Math.max(10, Math.min(b.sw - cw - 10, want))}px`;
    const under = spotOpt.under && q(spotOpt.under);
    const floor = under ? box(under) : b;
    spotChip.style.top = below || under ? `${floor.y + floor.h + (under ? 14 : pad + 12)}px` : `${b.y - pad - 12 - ch}px`;
  }

  // B: a number that changed says by how much, beside it, and floats away.

  /** `above` centers it over the number instead, for a number with another right beside it. @param {string} sel @param {string} text @param {'right' | 'above'} [at] */
  function delta(sel, text, at = 'right') {
    const target = q(sel);
    if (!target) return;
    const b = box(target);
    const el = document.createElement('span');
    el.className = `cv-delta${text.startsWith('+') ? ' is-up' : ''}`;
    el.textContent = text;
    if (at === 'above') {
      el.classList.add('is-above');
      el.style.left = `${b.cx}px`;
      el.style.top = `${b.y - 6}px`;
    } else {
      el.style.left = `${b.x + b.w + 6}px`;
      el.style.top = `${b.cy}px`;
    }
    layer.append(el);
    later(() => el.remove(), 1800);
  }

  // The playing player: the watched video's picture, moving while it plays, a running timecode, and "90× speed".

  /** The video the player shows: the card Watch was pressed on, or the tour's first sample. */
  let video = { length: '14:02', thumb: 'linear-gradient(135deg, #8a5a3c, #3d2618)', title: 'How Japanese joinery holds without nails' };
  document.addEventListener('click', (e) => {
    const card = /** @type {Element} */ (e.target).closest?.('.drip-watch')?.closest('.drip-card');
    if (!card) return;
    video = {
      length: card.querySelector('.drip-length')?.textContent || video.length,
      thumb: /** @type {HTMLElement | null} */ (card.querySelector('.tour-thumb'))?.style.getPropertyValue('--thumb') || video.thumb,
      title: card.querySelector('.drip-card-title')?.textContent || video.title,
    };
  }, true);

  /** @param {string} t "14:02" @returns {number} */
  const seconds = (t) => t.split(':').reduce((a, p) => a * 60 + Number(p), 0);
  /** @param {number} s */
  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function dressPlayer() {
    const p = q('.tour-player');
    if (!p) return;
    if (!p.querySelector('.lv-scene')) {
      const scene = document.createElement('div');
      scene.className = 'lv-scene';
      scene.style.setProperty('--thumb', video.thumb);
      scene.innerHTML = '<span class="lv-pic"></span><span class="lv-glow lv-g1"></span><span class="lv-glow lv-g2"></span><span class="lv-glow lv-g3"></span>';
      const title = document.createElement('span');
      title.className = 'lv-title';
      title.textContent = video.title;
      const speed = document.createElement('span');
      speed.className = 'lv-speed';
      speed.textContent = '90× speed';
      const time = document.createElement('span');
      time.className = 'lv-time';
      p.prepend(scene);
      p.append(title, speed, time);
    }
    const bar = /** @type {HTMLElement | null} */ (p.querySelector('.tour-player-bar > span'));
    const pct = bar ? parseFloat(bar.style.width) || 0 : 0;
    const len = seconds(video.length);
    const time = /** @type {HTMLElement} */ (p.querySelector('.lv-time'));
    time.textContent = `${clock((pct / 100) * len)} / ${video.length}`;
  }

  // What the stage shows, read each tick, and the events a change between two ticks makes.

  /** @param {string} token */
  const count = (token) => {
    const n = /** @type {HTMLElement | null} */ (stage.querySelector(`.drip-stats .drip-count:has(.${token}) .drip-num`));
    return n ? Number(n.dataset.n) : null;
  };

  function read() {
    const lockPanel = q('#drip-lock:not(.is-leaving):not(.is-draining) .drip-lock-panel');
    const card = q('.drip-card:not(.is-loading) .drip-card-title');
    const say = (document.getElementById('say')?.textContent || '').toLowerCase();
    return {
      key: location.hash,
      kind: lockPanel ? 'lock' : q('.tour-player') ? 'player' : q('.tour-changes') ? 'changes' : say.includes('reveal') ? 'reveal' : 'home',
      drops: count('drip-token-drop'),
      cards: count('drip-token-card'),
      time: q('.drip-stats .drip-time')?.textContent || null,
      card: card?.textContent || null,
      playing: !!q('.tour-player.is-playing'),
      paused: !!q('#drip-pill .is-paused'),
      lock: !!lockPanel,
    };
  }

  /** @type {ReturnType<typeof read> | null} */
  let was = null;

  function tick() {
    if (!layer.isConnected) stage.append(layer);
    if (live) dressPlayer();
    if (spotSel) placeSpot();
    for (const place of placers.values()) place();
    const now = read();
    if (!was || was.key !== now.key) {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      layer.replaceChildren();
      notes.clear();
      placers.clear();
      chipBoxes.clear();
      dark();
      was = now;
      const kind = now.kind;
      later(() => arrive(kind), 500);
      return;
    }
    const lockScreen = now.lock || was.lock;
    if (now.drops !== null && was.drops !== null && now.drops < was.drops && !lockScreen) on('drop', now);
    if (now.time && was.time && now.time !== was.time && !lockScreen) on('time', now);
    if (now.cards !== null && was.cards !== null && now.cards < was.cards) on('card', now);
    if (now.card && now.card !== was.card) on('shown', now);
    if (now.playing && !was.playing) on('play', now);
    if (!now.playing && was.playing && now.paused) on('pause', now);
    if (now.lock && !was.lock) on('lock', now);
    was = now;
  }

  const DROP = '.drip-stats .drip-count:has(.drip-token-drop)';
  const CARD = '.drip-stats .drip-count:has(.drip-token-card)';
  /** @param {number} n @param {string} word */
  const left = (n, word) => `${n} ${word}${n === 1 ? '' : 's'} left today`;

  /**
   * What each variant shows on arriving at a step. The lock rising counts as a move, so A notes it. Otherwise only C
   * lights something before anything moves.
   * @param {string} kind
   */
  function arrive(kind) {
    if (kind === 'lock' && was) on('lock', was);
    if (v !== 'c') return;
    if (kind === 'home') light('.drip-actions .drip-add', 'Spend a drop for 15 minutes of watching', 0, { side: 'below' });
    if (kind === 'player') light('#drip-pill', 'Your time left. It drains while a video plays.', 0);
  }

  /**
   * @param {'drop' | 'time' | 'card' | 'shown' | 'play' | 'pause' | 'lock'} what
   * @param {ReturnType<typeof read>} now
   */
  function on(what, now) {
    if (v === 'a') {
      if (what === 'drop') note(DROP, `One drop spent. ${left(now.drops ?? 0, 'drop')}.`, 2800, { align: 'start' });
      if (what === 'time') note('.drip-stats .drip-glass-tile', 'The drop fills your glass', 2800, { align: 'end' });
      if (what === 'card') note(CARD, `One card used. ${left(now.cards ?? 0, 'card')}.`, 2800, { align: 'start' });
      if (what === 'shown') later(() => note('.drip-card .drip-pass', 'Passing is free', 2600, { side: 'right', width: 60, gap: 14 }), 1100);
      if (what === 'play') note('#drip-pill', 'Your time drains while a video plays', 3200);
      if (what === 'pause') note('#drip-pill', 'Paused. Nothing drains.', 2400);
      if (what === 'lock') later(() => note('#drip-lock .drip-lock-link', 'Unlocks one video you need, with a reason', 3400, { side: 'below' }), 1300);
    }
    if (v === 'b') {
      if (what === 'drop') delta(DROP, '−1');
      if (what === 'time') delta('.drip-stats .drip-time', '+15m', 'above');
      if (what === 'card') delta(CARD, '−1');
    }
    if (v === 'c') {
      if (what === 'drop') light(DROP, left(now.drops ?? 0, 'drop'), 0);
      // The drop counter and the minutes change in the same tick: light the glass first, then the drops left.
      if (what === 'time') {
        light('.drip-stats .drip-glass-tile', 'The drop fills your glass', 0);
        const gen = spotGen;
        const drops = now.drops ?? 0;
        later(() => { if (gen === spotGen) light(DROP, left(drops, 'drop'), 0); }, 2400);
      }
      if (what === 'card') light(CARD, left(now.cards ?? 0, 'card'), 0);
      if (what === 'shown') later(() => light('.drip-card .drip-card-actions', 'Stash it, or pass for free', 3200, { side: 'above', align: 'start' }), 1100);
      if (what === 'play') light('#drip-pill', 'Your time drains while a video plays', 0);
      if (what === 'pause') light('#drip-pill', 'Paused. Nothing drains.', 0);
      if (what === 'lock') later(() => light('#drip-lock .drip-lock-actions', 'Spend another drop, or stop here', 3400, { under: '#drip-lock .drip-lock-panel' }), 1300);
    }
  }

  setInterval(tick, reduced ? 200 : 100);
  tick();
})();
