// @ts-check
// Tour callouts, round 2 (design/tour-callouts only). welcome.js says when a step starts and when the visitor does
// something on the stage, and this file draws one callout for it. Nothing here watches the stage for changes: round 1's
// layer did, and the tour's own redraws made its notes replay and its spotlight jump (Jesse, 2026-10-31).
//   D, Notes: a note answers each thing you do, with a line to what changed. One note at a time.
//   E, Spotlight on Next: each step is a few stops. The rest of the stage dims, and Next, or doing what the stop asks,
//      moves the light on. Nothing else moves it.
//   F, Notes on Next: E's stops drawn as D's notes, with nothing dimmed.
// ?v=d, e, or f picks one. Anything else leaves the callouts off, so round 1's mockups and the real page are unchanged.

(() => {
  const v = new URLSearchParams(location.search).get('v') || '';
  /** @type {'notes' | 'spot' | 'paced' | ''} */
  const mode = v === 'd' ? 'notes' : v === 'e' ? 'spot' : v === 'f' ? 'paced' : '';

  /**
   * What welcome.js hands over: the stage, and the tour's numbers, read when a callout is drawn.
   * @typedef {{
   *   stage: HTMLElement, tour: HTMLElement, busy: () => boolean, dropTime: () => string, drops: () => number,
   *   cards: () => number, counted: () => boolean, clock: () => boolean, stash: () => boolean, needLeft: () => number, resetLabel: () => string,
   *   last?: string,
   * }} Ctx
   */
  /** @typedef {'above' | 'below' | 'right' | 'left'} Side */
  /** `at` is what the note sits beside (or the spotlight lights); `point`, when given, is the part its arrow ends on. */
  /** @typedef {{ at: string, point?: string, say: (c: Ctx) => string, sides?: Side[] }} Callout */
  /**
   * A stop with `until` waits for that action. Doing it shows `then`, or, with no `then` (or one whose `need` is false),
   * moves on to the next stop.
   * @typedef {Callout & { need?: (c: Ctx) => boolean, ready?: (c: Ctx) => boolean, until?: string[], then?: Callout & { need?: (c: Ctx) => boolean } }} Stop
   */

  /** @param {number} n @param {string} word */
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // Where each callout points, inside the stage. YouTube's markup isn't involved: these are the tour's own drawings.
  const SEL = {
    // The glass and the minutes beside it, lit as one.
    time: '.drip-stats .drip-glass-tile, .drip-stats .drip-time-block',
    minutes: '.drip-stats .drip-time',
    glass: '.drip-stats .drip-glass-tile',
    drops: '.drip-stats .drip-count:has(.drip-token-drop)',
    cards: '.drip-stats .drip-count:has(.drip-token-card)',
    add: '#drip-home .drip-add',
    revealBtn: '#drip-home .drip-reveal',
    cardActions: '.drip-card .drip-card-actions',
    watch: '.drip-card .drip-watch',
    stash: '.drip-card .drip-stash',
    playIcon: '.tour-player-play .drip-i',
    // The pill's glass and minutes, not the whole pill, whose middle is the line before Stash.
    pill: '#drip-pill .drip-pill-time',
    lockAdd: '#drip-lock .drip-lock-add',
    lockLink: '#drip-lock .drip-lock-link',
    done: '#drip-lock .drip-done',
  };

  /** A card is up and dealt, so the reveal step's stops have something to point at. @param {Ctx} c */
  const dealt = (c) => !!c.stage.querySelector('.drip-card:not(.is-loading)');
  /** @type {Side[]} The stats row: above when there's room, beside it when it's at the stage's top edge. */
  const STATS_SIDES = ['above', 'right', 'below'];

  /** The reveal step's first words. Curated's tour starts here, so it says what the page is first. @param {Ctx} c */
  const pressReveal = (c) => (c.counted() ? 'Press Reveal video. It uses a card.' : 'This is your home page now. No feed, one button. Press Reveal video.');
  /** @param {Ctx} c */
  const cardsLeft = (c) => `${plural(c.cards(), 'card')} left today.`;
  /** @param {Ctx} c */
  const dropsLeft = (c) => (c.drops() ? `${plural(c.drops(), 'drop')} left today.` : "That was today's last drop.");
  /** @param {Ctx} c */
  const playing = (c) => (c.last === 'pause' ? 'Paused. Nothing drains.' : 'Draining, 90 times faster for the tour.');

  // D: what each step says on arriving, and what answers each thing the visitor does. Null says nothing new.

  /** @type {Record<string, { arrive?: (c: Ctx) => Callout | null, on?: Record<string, (c: Ctx) => Callout | null> }>} */
  const NOTES = {
    home: {
      arrive: () => ({ at: SEL.add, say: () => 'Spend a drop here', sides: ['below', 'left'] }),
      on: {
        add: () => ({ at: SEL.time, point: SEL.glass, say: (c) => `${c.dropTime()} in your glass. ${dropsLeft(c)}`, sides: STATS_SIDES }),
      },
    },
    reveal: {
      arrive: (c) => ({ at: SEL.revealBtn, say: () => pressReveal(c), sides: ['below', 'above'] }),
      on: {
        // Curated's cards are free, so its first reveal points at what to do with the card instead.
        reveal: (c) => (c.counted()
          ? { at: SEL.cards, say: (x) => `One card used. ${cardsLeft(x)}`, sides: STATS_SIDES }
          : { at: SEL.cardActions, point: SEL.stash, say: (x) => (x.stash() ? 'Stash it for later, reveal another, or pass.' : 'Reveal another, or pass.'), sides: ['left', 'right', 'above'] }),
        next: (c) => (c.counted() ? { at: SEL.cards, say: (x) => `One card used. ${cardsLeft(x)}`, sides: STATS_SIDES } : null),
        pass: () => ({ at: SEL.revealBtn, say: (c) => `${c.counted() ? 'Passed, for free.' : 'Passed.'} That one won't come back.`, sides: ['below', 'above'] }),
        stash: () => ({ at: SEL.stash, say: () => 'Stashed for later', sides: ['below', 'left', 'above'] }),
        unstash: () => ({ at: SEL.stash, say: () => 'Out of your stash', sides: ['below', 'left', 'above'] }),
      },
    },
    player: {
      arrive: () => ({ at: SEL.pill, say: () => 'Your minutes, on every video', sides: ['below', 'left'] }),
      on: {
        play: () => ({ at: SEL.pill, say: playing, sides: ['below', 'left'] }),
        pause: () => ({ at: SEL.pill, say: playing, sides: ['below', 'left'] }),
      },
    },
    lock: {
      arrive: (c) => (c.needLeft() ? { at: SEL.lockLink, say: () => 'Need this video? Unlock it with a reason.', sides: ['below'] } : null),
      on: {
        lock: (c) => (c.needLeft() ? { at: SEL.lockLink, say: () => 'Need this video? Unlock it with a reason.', sides: ['below'] } : null),
        lockadd: () => ({ at: SEL.pill, say: (c) => `${c.dropTime()} more. It plays on.`, sides: ['below', 'left'] }),
        unlock: () => ({ at: SEL.pill, say: () => "Unlocked. This one won't use minutes.", sides: ['below', 'left'] }),
        done: (c) => (c.drops() ? { at: SEL.drops, say: (x) => `Back home. The ${plural(x.drops(), 'drop')} you didn't spend are still here.`, sides: STATS_SIDES } : null),
      },
    },
  };

  // E and F: each step's stops, in order. A stop with `until` waits for that action, and doing it shows `then`.

  /** @type {Record<string, Stop[]>} */
  const STOPS = {
    home: [
      { at: SEL.time, point: SEL.minutes, say: () => 'What you can watch today. Nothing until you spend a drop.', sides: STATS_SIDES },
      { at: SEL.drops, say: (c) => `Your drops. New ones come at ${c.resetLabel()}.`, sides: STATS_SIDES },
      {
        at: SEL.add, say: (c) => `Press +${c.dropTime()} to spend one.`, sides: ['below', 'left'], until: ['add'],
        then: { at: SEL.time, point: SEL.glass, say: (c) => `${c.dropTime()} in your glass. ${dropsLeft(c)}`, sides: STATS_SIDES },
      },
    ],
    reveal: [
      {
        at: SEL.revealBtn, say: pressReveal, sides: ['below', 'above'], until: ['reveal'],
        // Full drip shows what the card cost. Curated's cards are free, so it moves straight on to the card.
        then: { at: SEL.cards, say: (c) => `That reveal used a card. ${cardsLeft(c)}`, sides: STATS_SIDES, need: (c) => c.counted() },
      },
      {
        // From the left, so the arrow lands on Stash, the start of the row the sentence reads along.
        at: SEL.cardActions, point: SEL.stash, ready: dealt, sides: ['left', 'right', 'above'],
        // "Passing is free" only means something where cards cost one.
        say: (c) => `${c.stash() ? 'Stash it for later, reveal another, or pass.' : 'Reveal another, or pass.'}${c.counted() ? ' Passing is free.' : ''}`,
      },
      { at: SEL.watch, say: (c) => (c.clock() ? 'Or watch it, and your minutes start.' : 'Or watch it.'), ready: dealt, sides: ['right', 'below', 'above'] },
    ],
    player: [
      { at: SEL.pill, say: () => 'Your minutes, on every video.', sides: ['below', 'left'] },
      {
        // Right under the play button, inside the player, where there's room.
        at: SEL.playIcon, say: () => 'Press play, and watch the glass.', sides: ['below', 'above'], until: ['play'],
        then: { at: SEL.pill, say: playing, sides: ['below', 'left'] },
      },
    ],
    lock: [
      {
        at: SEL.lockAdd, say: (c) => `Another drop buys ${c.dropTime()} more.`, sides: ['left', 'above'], need: (c) => c.drops() > 0,
        until: ['lockadd'], then: { at: SEL.pill, say: (c) => `${c.dropTime()} more. It plays on.`, sides: ['below', 'left'] },
      },
      {
        at: SEL.lockLink, say: () => 'Unlock a video you need, with a reason.', sides: ['below'], need: (c) => c.needLeft() > 0,
        until: ['unlock'], then: { at: SEL.pill, say: () => "Unlocked. This one won't use minutes.", sides: ['below', 'left'] },
      },
      {
        at: SEL.done, say: () => 'Or stop here. The drops you have left stay.', sides: ['right', 'above'], until: ['done'],
        then: { at: SEL.drops, say: (c) => `Back home. The ${plural(c.drops(), 'drop')} you didn't spend are still here.`, sides: STATS_SIDES },
      },
    ],
  };

  // The drawing. One fixed layer over the page, outside the stage, so the stage's redraws never touch it and a chip can
  // sit past the stage's edge where there's room. One chip, one line, one hole, each built once and moved.

  const layer = document.createElement('div');
  layer.className = `co-layer co-${mode}`;
  layer.setAttribute('aria-hidden', 'true');
  const veil = document.createElement('div');
  veil.className = 'co-veil';
  const hole = document.createElement('div');
  hole.className = 'co-hole';
  veil.append(hole);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'co-line');
  svg.innerHTML = '<path pathLength="1"/><path class="co-head"/>';
  const [line, tip] = /** @type {SVGPathElement[]} */ ([...svg.children]);
  const chip = document.createElement('div');
  chip.className = 'co-chip';
  const text = document.createElement('span');
  const count = document.createElement('span');
  count.className = 'co-count';
  chip.append(text, count);
  if (mode === 'spot') layer.append(veil);
  if (mode !== 'spot') layer.append(svg);
  layer.append(chip);

  /** @type {Ctx | null} */
  let ctx = null;
  let stepId = '';
  /** @type {Stop[]} */
  let stops = [];
  let at = 0;
  let thenShown = false;
  /** D's current note. @type {Callout | null} */
  let note = null;
  /** What's drawn now. @type {{ at: string, text: string } | null} */
  let shown = null;
  /** Where it was last placed, so a frame only writes styles when something moved. */
  let placed = '';
  let swapTimer = 0;
  let glideTimer = 0;
  /** While a note fades out to move, it stays where it is: frame() leaves it alone until the new one is placed. */
  let fading = false;

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** The callout this moment calls for. @returns {Callout | null} */
  function current() {
    if (!ctx) return null;
    if (mode === 'notes') return note;
    const stop = stops[at];
    if (!stop) return null;
    if (thenShown && stop.then) return stop.then;
    if (stop.ready && !stop.ready(ctx)) return null;
    return stop;
  }

  /** Draws what current() says, changing only what differs from what's drawn. */
  function render() {
    const co = current();
    const next = co && ctx ? { at: co.at, text: co.say(ctx) } : null;
    count.textContent = mode !== 'notes' && stops.length > 1 && next ? `${at + 1} of ${stops.length}` : '';
    if (!next) {
      layer.classList.remove('is-on');
      shown = null;
      return;
    }
    const moved = !shown || shown.at !== next.at;
    if (!shown || (moved && mode !== 'spot')) {
      // From nothing, or a note moving to another thing: the old one fades out where it is, and the new one comes in
      // at its own place, placed with its own words, line drawn fresh. Nothing slides across the page.
      const wasOn = layer.classList.contains('is-on');
      layer.classList.remove('is-on');
      fading = true;
      clearTimeout(swapTimer);
      const target = next;
      swapTimer = window.setTimeout(() => {
        fading = false;
        text.textContent = target.text;
        placed = '';
        frame();
        drawLine();
        layer.classList.add('is-on');
      }, reduced() ? 0 : wasOn ? 170 : 120);
      shown = next;
      return;
    } else if (moved) {
      // The spotlight glides to its next stop, and its words change on the way.
      glide();
      swap(next.text);
    } else if (shown.text !== next.text) {
      swap(next.text);
    }
    shown = next;
    // Placed before it shows, so it never appears where the last one was.
    frame();
    layer.classList.add('is-on');
  }

  /** Changes the chip's words with a quick fade, so a new sentence never just pops in. @param {string} words */
  function swap(words) {
    if (text.textContent === words) return;
    if (reduced()) {
      text.textContent = words;
      return;
    }
    chip.classList.add('is-swapping');
    clearTimeout(swapTimer);
    swapTimer = window.setTimeout(() => {
      text.textContent = words;
      chip.classList.remove('is-swapping');
    }, 130);
  }

  /** Turns on the slide for the hole and chip for one move. */
  function glide() {
    if (reduced()) return;
    layer.classList.add('is-gliding');
    clearTimeout(glideTimer);
    glideTimer = window.setTimeout(() => layer.classList.remove('is-gliding'), 480);
  }

  /** Starts the line drawing from the chip again. */
  function drawLine() {
    for (const p of [line, tip]) {
      p.style.animation = 'none';
      p.getBoundingClientRect();
      p.style.animation = '';
    }
  }

  /**
   * Where the chip goes: the first side, in the callout's order, where it fits in the window across and inside the
   * stage up and down.
   * @param {DOMRect} r the target @param {DOMRect} s the stage @param {number} w @param {number} h @param {Side[]} sides
   */
  function spot(r, s, w, h, sides) {
    const gap = mode === 'spot' ? 16 : 34;
    const vw = document.documentElement.clientWidth;
    const minX = 8;
    const maxX = vw - 8;
    const top = s.top + 6;
    const bottom = s.bottom - 6;
    const cx = Math.max(minX, Math.min(maxX - w, r.left + r.width / 2 - w / 2));
    const cy = Math.max(top, Math.min(bottom - h, r.top + r.height / 2 - h / 2));
    /** @type {Record<Side, { x: number, y: number, fits: boolean }>} */
    const at = {
      above: { x: cx, y: r.top - gap - h, fits: r.top - gap - h >= top },
      below: { x: cx, y: r.bottom + gap, fits: r.bottom + gap + h <= bottom },
      right: { x: r.right + gap, y: cy, fits: r.right + gap + w <= maxX },
      left: { x: r.left - gap - w, y: cy, fits: r.left - gap - w >= minX },
    };
    const order = [...sides, ...(/** @type {Side[]} */ (['below', 'above', 'right', 'left'])).filter((x) => !sides.includes(x))];
    const side = order.find((x) => at[x].fits) || order[0];
    return { side, ...at[side] };
  }

  /** Sets a class on the layer only when it changes, since frame() runs 60 times a second. @param {string} name @param {boolean} on */
  function flag(name, on) {
    if (layer.classList.contains(name) !== on) layer.classList.toggle(name, on);
  }

  /** Puts the chip, line, and hole on the target. Runs every frame while a callout shows, and writes only on a change. */
  function frame() {
    if (!ctx || !shown || fading) return;
    if (ctx.tour.hidden) {
      flag('is-away', true);
      return;
    }
    const targets = [...ctx.stage.querySelectorAll(shown.at)];
    const target = targets[0];
    // The tour's own animations (a card dealt, a drop poured) move things around: the callout holds still until they're
    // done, then goes to where things settled.
    if (!target || ctx.busy()) {
      flag('is-away', !target);
      return;
    }
    flag('is-away', false);
    // A selector list lights everything it matches, as one box.
    const boxes = targets.map((t) => t.getBoundingClientRect());
    const left = Math.min(...boxes.map((b) => b.left));
    const top = Math.min(...boxes.map((b) => b.top));
    const r = new DOMRect(left, top, Math.max(...boxes.map((b) => b.right)) - left, Math.max(...boxes.map((b) => b.bottom)) - top);
    const s = ctx.stage.getBoundingClientRect();
    const w = chip.offsetWidth;
    const h = chip.offsetHeight;
    const co = current();
    const p = spot(r, s, w, h, co?.sides || ['below']);
    const pointRect = co?.point ? ctx.stage.querySelector(co.point)?.getBoundingClientRect() : null;
    const key = [r.left, r.top, r.width, r.height, s.left, s.top, s.width, s.height, w, h, pointRect?.left ?? 0, pointRect?.top ?? 0].map(Math.round).join();
    if (key === placed) return;
    // Settling after an animation (not a first draw) slides there instead of jumping.
    if (placed && !layer.classList.contains('is-gliding') && mode === 'spot') glide();
    placed = key;
    chip.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
    chip.dataset.side = p.side;
    if (mode === 'spot') {
      const pad = 8;
      Object.assign(veil.style, { left: `${s.left}px`, top: `${s.top}px`, width: `${s.width}px`, height: `${s.height}px` });
      Object.assign(hole.style, { left: `${r.left - s.left - pad}px`, top: `${r.top - s.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      return;
    }
    // The line: from the chip's near edge to just short of the part it points at, bowed a little.
    const pointAt = co?.point ? ctx.stage.querySelector(co.point) : null;
    const pr = pointAt ? pointAt.getBoundingClientRect() : r;
    const cxr = pr.left + pr.width / 2;
    const cyr = pr.top + pr.height / 2;
    const clampX = (/** @type {number} */ x) => Math.max(p.x + 16, Math.min(p.x + w - 16, x));
    /** @type {[number, number, number, number]} */
    const ends = p.side === 'above' ? [clampX(cxr + 14), p.y + h + 4, cxr, pr.top - 4]
      : p.side === 'below' ? [clampX(cxr + 14), p.y - 4, cxr, pr.bottom + 4]
        : p.side === 'right' ? [p.x - 4, p.y + h / 2, pr.right + 4, cyr]
          : [p.x + w + 4, p.y + h / 2, pr.left - 4, cyr];
    const [fx, fy, tx, ty] = ends;
    const vertical = p.side === 'above' || p.side === 'below';
    const mx = (fx + tx) / 2 + (vertical ? 12 : 0);
    const my = (fy + ty) / 2 + (vertical ? 0 : 10);
    const ang = Math.atan2(ty - my, tx - mx);
    const head = (/** @type {number} */ turn) => `${tx - 7 * Math.cos(ang + turn)},${ty - 7 * Math.sin(ang + turn)}`;
    line.setAttribute('d', `M${fx},${fy} Q${mx},${my} ${tx},${ty}`);
    tip.setAttribute('d', `M${head(0.5)} L${tx},${ty} L${head(-0.5)}`);
  }

  function loop() {
    frame();
    requestAnimationFrame(loop);
  }

  /** @type {any} */ (globalThis).DripCoach = {
    /** A step started. @param {string} id @param {Ctx} c */
    start(id, c) {
      if (!mode) return;
      if (!ctx) {
        document.body.append(layer);
        requestAnimationFrame(loop);
      }
      ctx = c;
      ctx.last = '';
      stepId = id;
      at = 0;
      thenShown = false;
      stops = (STOPS[id] || []).filter((s) => !s.need || s.need(c));
      note = NOTES[id]?.arrive?.(c) || null;
      // A new step starts clean: whatever the last step showed goes, and this one's first callout comes in fresh.
      // The stage redraws at once, so the old callout goes at once too, with no fade over the new screen.
      layer.classList.add('is-instant');
      layer.classList.remove('is-on', 'is-gliding');
      layer.getBoundingClientRect();
      layer.classList.remove('is-instant');
      shown = null;
      fading = false;
      clearTimeout(swapTimer);
      render();
    },

    /** The visitor did something on the stage. @param {string} action */
    did(action) {
      if (!mode || !ctx) return;
      ctx.last = action;
      if (mode === 'notes') {
        const make = NOTES[stepId]?.on?.[action];
        if (make) {
          const next = make(ctx);
          if (next) note = next;
        }
      } else {
        // Doing what a stop asks shows its answer. Doing what a later stop asks jumps there, since that's where the
        // visitor already is.
        const i = stops.findIndex((s, n) => n >= at && s.until?.includes(action));
        if (i >= 0) {
          const then = stops[i].then;
          if (then && (!then.need || then.need(ctx))) {
            at = i;
            thenShown = true;
          } else if (i + 1 < stops.length) {
            at = i + 1;
            thenShown = false;
          }
        }
      }
      render();
    },

    /** Next. True when it moved the callout to the step's next stop, so the tour stays on this step. */
    next() {
      if (mode !== 'spot' && mode !== 'paced') return false;
      if (at >= stops.length - 1) return false;
      at++;
      thenShown = false;
      render();
      return true;
    },

    /** Back. True when it went back a stop. */
    back() {
      if (mode !== 'spot' && mode !== 'paced') return false;
      if (at === 0) return false;
      at--;
      thenShown = false;
      render();
      return true;
    },
  };
})();
