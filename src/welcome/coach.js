// @ts-check
// The welcome tour's callouts. welcome.js says when a step starts and when the visitor does something on the stage, and
// this file draws one note for it: a gray chip with a blue line to what it's about. Each step is a few stops, walked by
// Next and Back. A stop can wait for an action (+15m, Reveal video, play), and doing it shows the stop's answer.
// A blue ring marks the one thing to press: the button a stop waits for, or else the tour's Next. It shows on a step's
// last stop, and on any stop left alone for 4 seconds.
// Picked from three design rounds as H (Jesse, 2026-11-02). Nothing here watches the stage for changes: an early round
// did, and the tour's own redraws made its notes replay (Jesse, 2026-10-31).

(() => {
  /** How long a stop waits before it rings, except a step's last stop, which rings at once. */
  const IDLE_MS = 4000;
  /** What the last stop's count says Next goes to, by the next step's id. @type {Record<string, string>} */
  const NEXT_NAMES = { reveal: 'the cards', player: 'the player', lock: 'the lock', changes: 'the rest of YouTube' };

  /**
   * What welcome.js hands over: the stage, and the tour's numbers, read when a callout is drawn.
   * @typedef {{
   *   stage: HTMLElement, tour: HTMLElement, busy: () => boolean, dropTime: () => string, drops: () => number,
   *   cards: () => number, dropsPerDay: () => number, cardsPerDay: () => number, counted: () => boolean, clock: () => boolean, stash: () => boolean, needLeft: () => number, resetLabel: () => string,
   *   carries: () => boolean, nextStep: () => string, last?: string,
   * }} Ctx
   */
  /** 'over' sits inside the bottom of the target, for a picture with nothing to read in it. */
  /** @typedef {'above' | 'below' | 'right' | 'left' | 'over'} Side */
  /**
   * `at` is what the note sits beside; `point`, when given, is the part its arrow ends on.
   * `alt` is where it goes when none of `sides` fits, as on a phone, where a side note would cover the next thing to read.
   * `go` is a button on the stage that also moves the tour on from here, like Reveal video after +15m, which the ring
   * goes to instead of the tour's Next.
   * @typedef {{ at: string, point?: string, say: (c: Ctx) => string, sides?: Side[], alt?: { at: string, sides: Side[] }, go?: string }} Callout
   */
  /**
   * A stop with `until` waits for that action. Doing it shows `then`, or, with no `then` (or one whose `need` is false),
   * moves on to the next stop.
   * `touch` lists actions that bring the note back to this stop without finishing it, like opening the reason form.
   * @typedef {Callout & { need?: (c: Ctx) => boolean, ready?: (c: Ctx) => boolean, until?: string[], touch?: string[], then?: Callout & { need?: (c: Ctx) => boolean } }} Stop
   */

  /** @param {number} n @param {string} word */
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // Where each callout points, inside the stage. YouTube's markup isn't involved: these are the tour's own drawings.
  const SEL = {
    // The glass and the minutes beside it, as one.
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
    thumb: '.drip-card .drip-thumb',
    playIcon: '.tour-player-play .drip-i',
    playButton: '.tour-player-play',
    // The pill's glass, which holds still while the minutes beside it change width. An unlocked video's pill has no
    // glass, so then its time.
    pill: '#drip-pill .drip-pill-time > svg, #drip-pill .drip-pill-time:not(:has(> svg))',
    lockPanel: '#drip-lock .drip-lock-panel',
    lockAdd: '#drip-lock .drip-lock-add',
    // "I need this one", or, once its form is open, Unlock this video. Cancel shares the link's class.
    lockLink: '#drip-lock .drip-lock-panel > .drip-lock-link, #drip-lock .drip-reason .drip-b',
    done: '#drip-lock .drip-done',
  };

  /** A card is up and dealt, so the reveal step's stops have something to point at. @param {Ctx} c */
  const dealt = (c) => !!c.stage.querySelector('.drip-card:not(.is-loading)');
  /** @type {Side[]} The stats row: above when there's room, beside it when it's at the stage's top edge. */
  const STATS_SIDES = ['above', 'right', 'below'];
  /** @type {Side[]} The glass and minutes: never to their right, where the drop and card counts are. */
  const TIME_SIDES = ['above', 'below'];

  /** The reveal step's first words. Curated's tour starts here, so it says what the page is first. @param {Ctx} c */
  const pressReveal = (c) => (c.counted() ? 'Press Reveal video. It uses a card.' : 'This is your home page now. No feed, one button. Press Reveal video.');
  /** @param {Ctx} c */
  const cardsLeft = (c) => `${plural(c.cards(), 'card')} left today.`;
  /** @param {Ctx} c */
  const dropsLeft = (c) => (c.drops() ? `${plural(c.drops(), 'drop')} left today.` : "That was today's last drop.");
  /**
   * What a dealt card's buttons do. Reveal next is left out with no cards to pay for it.
   * @param {Ctx} c
   */
  const cardChoices = (c) => {
    const parts = [];
    if (c.stash()) parts.push('stash it for later');
    if (!c.counted() || c.cards() > 0) parts.push('reveal the next one');
    parts.push('pass with ×');
    const s = parts.length > 1 ? `${parts.slice(0, -1).join(', ')}, or ${parts[parts.length - 1]}` : parts[0];
    // "Passing is free" only means something where cards cost one.
    return `${s[0].toUpperCase()}${s.slice(1)}.${c.counted() ? ' Passing is free.' : ''}`;
  };
  /** The answer to play: what the pill is, now that it's moving. @param {Ctx} c */
  const pillAnswer = (c) => (c.last === 'pause'
    ? 'Paused, so nothing drains.'
    : 'Your minutes, on every YouTube video. They drain while it plays, 90 times faster here.');

  /** Each step's stops, in order. @type {Record<string, Stop[]>} */
  const STOPS = {
    home: [
      // The step's facts live on the notes that point at them, since the line above the stage is only the step's name
      // (design D, 2026-11-10): the drops' on the drop counter, the cards' on the card counter.
      { at: SEL.time, point: SEL.minutes, say: () => 'What you can watch today. Nothing plays until you spend a drop.', sides: TIME_SIDES },
      {
        at: SEL.drops, sides: STATS_SIDES,
        say: (c) => `You get ${plural(c.dropsPerDay(), 'drop')} a day, ${c.dropTime()} each. New ones come at ${c.resetLabel()}.`,
      },
      {
        at: SEL.add, say: (c) => `Press +${c.dropTime()} to spend one.`, sides: ['below', 'left'], until: ['add'],
        // Reveal video is what comes next, and pressing it moves the tour on and deals.
        then: {
          at: SEL.time, point: SEL.glass, sides: TIME_SIDES, go: SEL.revealBtn,
          say: (c) => `${c.dropTime()} in your glass. ${dropsLeft(c)}${c.stage.querySelector(SEL.revealBtn) ? ' Next, press Reveal video.' : ''}`,
        },
      },
    ],
    reveal: [
      {
        at: SEL.revealBtn, say: pressReveal, sides: ['below', 'above'], until: ['reveal'],
        // Full drip shows what the card cost. Curated's cards are free, so it moves straight on to the card.
        then: {
          at: SEL.cards, sides: STATS_SIDES, need: (c) => c.counted(),
          say: (c) => `That used one of your ${plural(c.cardsPerDay(), 'card')} a day. ${cardsLeft(c)}`,
        },
      },
      {
        // From the left, so the arrow lands on Stash, the start of the row the sentence reads along.
        // On a phone, over the picture, so the title and Watch stay readable.
        // Any of them moves on to Watch, once its animation is done.
        at: SEL.cardActions, point: SEL.stash, ready: dealt, sides: ['left', 'right'], alt: { at: SEL.thumb, sides: ['over'] }, say: cardChoices,
        until: ['stash', 'unstash', 'next', 'pass'],
        // A pass takes the card away, so there's no Watch to go on to: it says so and points at Reveal video.
        then: {
          at: SEL.revealBtn, sides: ['below', 'above'], go: SEL.revealBtn, need: (c) => c.last === 'pass',
          say: () => "Passed. That one won't come back. Press Reveal video for another.",
        },
      },
      {
        // Watch opens the player, the next step.
        at: SEL.watch, ready: dealt, sides: ['right'], alt: { at: SEL.thumb, sides: ['over'] }, go: SEL.watch,
        say: (c) => (c.clock() ? 'Or watch it, and your minutes start.' : 'Or watch it. No clock runs while you watch.'),
      },
    ],
    // Play first, then what the pill is, while it's moving (Jesse, 2026-11-02).
    player: [
      {
        // Right under the play button, inside the player, where there's room.
        at: SEL.playIcon, say: () => 'Press play, and watch the glass.', sides: ['below', 'above'], until: ['play'],
        then: { at: SEL.pill, say: pillAnswer, sides: ['below', 'left'] },
      },
    ],
    lock: [
      {
        // On a phone, under the panel, since above it is the lock's title.
        at: SEL.lockAdd, say: (c) => `Another drop buys ${c.dropTime()} more.`, sides: ['left'], alt: { at: SEL.lockPanel, sides: ['below'] },
        point: SEL.lockAdd, need: (c) => c.drops() > 0,
        until: ['lockadd'], then: { at: SEL.pill, say: (c) => `${c.dropTime()} more. It plays on.`, sides: ['below', 'left'] },
      },
      {
        // The form won't unlock without a reason, so once it's open the note says so.
        at: SEL.lockLink, sides: ['below'], need: (c) => c.needLeft() > 0, touch: ['reason', 'cancel'],
        say: (c) => (c.stage.querySelector('#drip-lock .drip-reason')
          ? 'Write a few words about why, then press Unlock this video.'
          : 'Unlock a video you need, with a reason.'),
        until: ['unlock'], then: { at: SEL.pill, say: () => "Unlocked. This one won't use minutes.", sides: ['below', 'left'] },
      },
      {
        at: SEL.done, point: SEL.done, sides: ['right'], alt: { at: SEL.lockPanel, sides: ['below'] }, until: ['done'],
        say: (c) => (c.drops() && c.carries() ? 'Or stop here. Unspent drops carry over to tomorrow.' : 'Or stop here for today.'),
        then: {
          at: SEL.drops, sides: STATS_SIDES,
          say: (c) => (c.drops() && c.carries()
            ? `Back home. Your ${plural(c.drops(), 'drop')} ${c.drops() === 1 ? 'carries' : 'carry'} over to tomorrow.`
            : `Back home. New drops come at ${c.resetLabel()}.`),
        },
      },
    ],
  };

  // The drawing. One fixed layer over the page, outside the stage, so the stage's redraws never touch it and a chip can
  // sit past the stage's edge where there's room. One chip and one line, each built once and moved.

  const layer = document.createElement('div');
  layer.className = 'co-layer';
  layer.setAttribute('aria-hidden', 'true');
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
  layer.append(svg, chip);
  // The ring: its own element, outside the layer, since it can sit on the tour's Next below the stage.
  const ring = document.createElement('div');
  ring.className = 'co-ring';
  ring.setAttribute('aria-hidden', 'true');
  // The chip and its line are hidden from screen readers, so each note's words are read out from here instead. Next
  // often moves between notes without changing the step's sentence, and without this it would say nothing (Codex's
  // review, 2026-11-02).
  const said = document.createElement('div');
  said.className = 'co-said';
  said.setAttribute('aria-live', 'polite');

  /** Reads a note's words out, once each time they change. @param {string} words */
  const announce = (words) => {
    if (said.textContent !== words) said.textContent = words;
  };

  /** @type {Ctx | null} */
  let ctx = null;
  let stepId = '';
  /** @type {Stop[]} */
  let stops = [];
  let at = 0;
  let thenShown = false;
  /**
   * The stops whose action the visitor has done, so coming back to one shows its answer, not the ask again. Steps 1
   * and 2 keep theirs across steps, since what was done there (a drop spent, a card dealt) is still on the page.
   * The player and the lock redraw fresh each time, so theirs start over.
   * @type {Set<Stop>}
   */
  let answered = new Set();
  /** @type {Record<string, Set<Stop>>} */
  const kept = { home: new Set(), reveal: new Set() };
  /** Step 1's Reveal video already asked for a card, so step 2 says nothing until it's dealt. */
  let waiting = false;
  /** What's drawn now, or about to be once a fade ends. @type {{ at: string, text: string, count: string } | null} */
  let shown = null;
  /** Where it was last placed, so a frame only writes styles when something moved. */
  let placed = '';
  let swapTimer = 0;
  let fadeTimer = 0;
  /** While a note fades out to move, it stays where it is: frame() leaves it alone until the new one is placed. */
  let fading = false;
  /** Where the shown note sits. @type {{ at: string, x: number, y: number } | null} */
  let held = null;
  /** A note waiting to come in: frame() turns the layer on once it has placed it, never before. */
  let revealing = false;
  /** When the current stop started, for the ring's wait. */
  let stopSince = 0;
  let lastStopKey = '';
  /** What the ring is on and where, so a frame only writes on a change. */
  let ringPlaced = '';

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** The callout this moment calls for. @returns {Callout | null} */
  function current() {
    if (!ctx || waiting) return null;
    const stop = stops[at];
    if (!stop) return null;
    if (thenShown && stop.then) return stop.then;
    if (stop.ready && !stop.ready(ctx)) return null;
    return stop;
  }

  /** "2 of 3", and on a step's last stop where Next goes from here. */
  function countLine() {
    if (!ctx) return '';
    const where = at === stops.length - 1 ? NEXT_NAMES[ctx.nextStep()] : '';
    const n = stops.length > 1 ? `${at + 1} of ${stops.length}` : '';
    return where ? `${n ? `${n} · ` : ''}Next: ${where}` : n;
  }

  /** Draws what current() says, changing only what differs from what's drawn. */
  function render() {
    const co = current();
    const stopKey = `${stepId}:${at}:${thenShown}`;
    if (stopKey !== lastStopKey) {
      lastStopKey = stopKey;
      stopSince = performance.now();
      ring.classList.remove('is-on');
    }
    const next = co && ctx ? { at: co.at, text: co.say(ctx), count: countLine() } : null;
    if (!next) {
      clearTimeout(fadeTimer);
      fading = false;
      revealing = false;
      layer.classList.remove('is-on');
      shown = null;
      return;
    }
    // Placed but waiting for the stage to settle: it comes in with the newest words.
    if (revealing && shown?.at === next.at) {
      shown = next;
      text.textContent = next.text;
      count.textContent = next.count;
      return;
    }
    // Mid-fade, the note that comes in is whatever's newest when the fade ends. Starting over here would leave a
    // second action's note stuck where the first one was (a double-click on play did).
    if (fading) {
      shown = next;
      return;
    }
    if (!shown || shown.at !== next.at) {
      // From nothing, or a note moving to another thing: the old one fades out where it is, and the new one comes in
      // at its own place, placed with its own words, line drawn fresh. Nothing slides across the page.
      const wasOn = layer.classList.contains('is-on');
      layer.classList.remove('is-on');
      clearTimeout(swapTimer);
      chip.classList.remove('is-swapping');
      fading = true;
      shown = next;
      fadeTimer = window.setTimeout(() => {
        fading = false;
        if (!shown) return;
        text.textContent = shown.text;
        count.textContent = shown.count;
        placed = '';
        revealing = true;
        frame();
      }, reduced() ? 0 : wasOn ? 170 : 120);
      return;
    }
    if (shown.text !== next.text || shown.count !== next.count) swap(next);
    shown = next;
    // Placed before it shows, so it never appears where the last one was.
    if (!layer.classList.contains('is-on')) revealing = true;
    frame();
  }

  /**
   * Changes the chip's words, and its count with them, with a quick fade, so a new sentence never just pops in.
   * @param {{ text: string, count: string }} to
   */
  function swap(to) {
    if (text.textContent === to.text && count.textContent === to.count) return;
    const put = () => {
      text.textContent = to.text;
      count.textContent = to.count;
      announce(to.text);
    };
    if (reduced()) return put();
    chip.classList.add('is-swapping');
    clearTimeout(swapTimer);
    swapTimer = window.setTimeout(() => {
      put();
      chip.classList.remove('is-swapping');
    }, 130);
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
   * stage up and down. A chip is all inside the stage or all outside it, never across its dashed edge. With `strict`,
   * only the sides given count, and `fits` says whether one did.
   * @param {DOMRect} r the target @param {DOMRect} s the stage @param {number} w @param {number} h @param {Side[]} sides
   * @param {boolean} [strict]
   */
  function spot(r, s, w, h, sides, strict = false) {
    const gap = 34;
    const vw = document.documentElement.clientWidth;
    const minX = 8;
    const maxX = vw - 8;
    const top = s.top + 6;
    const bottom = s.bottom - 6;
    // Above, below, and over sit inside the stage, so they keep inside its sides too, when it's wide enough.
    const inLeft = s.width >= w + 12 ? s.left + 6 : minX;
    const inRight = s.width >= w + 12 ? s.right - 6 : maxX;
    const cx = Math.max(inLeft, Math.min(inRight - w, r.left + r.width / 2 - w / 2));
    const cy = Math.max(top, Math.min(bottom - h, r.top + r.height / 2 - h / 2));
    // Beside the target: a chip that would cross the stage's edge moves out past it.
    let rx = r.right + gap;
    if (rx < s.right - 6 && rx + w > s.right - 6) rx = s.right + 14;
    let lx = r.left - gap - w;
    if (lx + w > s.left + 6 && lx < s.left + 6) lx = s.left - 14 - w;
    /** @type {Record<Side, { x: number, y: number, fits: boolean }>} */
    const at = {
      above: { x: cx, y: r.top - gap - h, fits: r.top - gap - h >= top },
      below: { x: cx, y: r.bottom + gap, fits: r.bottom + gap + h <= bottom },
      right: { x: rx, y: cy, fits: rx + w <= maxX },
      left: { x: lx, y: cy, fits: lx >= minX },
      over: { x: cx, y: r.bottom - h - 14, fits: r.height >= h + 28 && r.width >= w + 16 },
    };
    /** @type {Side[]} */
    const all = ['below', 'above', 'right', 'left'];
    const order = strict ? sides : [...sides, ...all.filter((x) => !sides.includes(x))];
    const side = order.find((x) => at[x].fits);
    if (!side) return { side: order[0], ...at[order[0]], fits: false };
    return { side, ...at[side] };
  }

  /** One box around everything a selector list matches. @param {string} sel @returns {DOMRect | null} */
  function box(sel) {
    if (!ctx) return null;
    const boxes = [...ctx.stage.querySelectorAll(sel)].map((t) => t.getBoundingClientRect());
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map((b) => b.left));
    const top = Math.min(...boxes.map((b) => b.top));
    return new DOMRect(left, top, Math.max(...boxes.map((b) => b.right)) - left, Math.max(...boxes.map((b) => b.bottom)) - top);
  }

  /** Sets a class on the layer only when it changes, since frame() runs 60 times a second. @param {string} name @param {boolean} on */
  function flag(name, on) {
    if (layer.classList.contains(name) !== on) layer.classList.toggle(name, on);
  }

  /** Puts the chip and line on the target. Runs every frame while a callout shows, and writes only on a change. */
  function frame() {
    if (!ctx || !shown || fading) return;
    if (ctx.tour.hidden) {
      flag('is-away', true);
      return;
    }
    const main = box(shown.at);
    // The tour's own animations (a card dealt, a drop poured, the lock rising or leaving) move things around: the
    // callout steps out of the way until they're done, then comes back where things settled.
    if (!main || ctx.busy()) {
      flag('is-away', true);
      return;
    }
    flag('is-away', false);
    const s = ctx.stage.getBoundingClientRect();
    const w = chip.offsetWidth;
    const h = chip.offsetHeight;
    const co = current();
    let r = main;
    let p = spot(r, s, w, h, co?.sides || ['below'], !!co?.alt);
    const altBox = co?.alt && !p.fits ? box(co.alt.at) : null;
    if (co?.alt && altBox) {
      r = altBox;
      p = spot(r, s, w, h, co.alt.sides);
    }
    // The arrow ends on `point`, or on the target itself when the chip moved to its alt.
    const pointRect = co?.point ? ctx.stage.querySelector(co.point)?.getBoundingClientRect() : altBox ? main : null;
    const key = [r.left, r.top, r.width, r.height, s.left, s.top, s.width, s.height, w, h, pointRect?.left ?? 0, pointRect?.top ?? 0].map(Math.round).join();
    if (key === placed) return comeIn();
    placed = key;
    // A shown note ignores its target creeping a few pixels (the pill's minutes changing width), so it never twitches.
    if (!revealing && held && held.at === shown.at && Math.abs(p.x - held.x) <= 12 && Math.abs(p.y - held.y) <= 12) {
      p.x = held.x;
      p.y = held.y;
    }
    held = { at: shown.at, x: p.x, y: p.y };
    chip.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
    chip.dataset.side = p.side;
    // The line: from the chip's near edge to just short of the part it points at, bowed a little.
    const pr = pointRect || r;
    const cxr = pr.left + pr.width / 2;
    const cyr = pr.top + pr.height / 2;
    const clampX = (/** @type {number} */ x) => Math.max(p.x + 16, Math.min(p.x + w - 16, x));
    /** @type {[number, number, number, number]} */
    const ends = p.side === 'above' || p.side === 'over' ? [clampX(cxr + 14), p.y + h + 4, cxr, pr.top - 4]
      : p.side === 'below' ? [clampX(cxr + 14), p.y - 4, cxr, pr.bottom + 4]
        : p.side === 'right' ? [p.x - 4, p.y + h / 2, pr.right + 4, cyr]
          : [p.x + w + 4, p.y + h / 2, pr.left - 4, cyr];
    const [fx, fy, tx, ty] = ends;
    const vertical = p.side !== 'right' && p.side !== 'left';
    const mx = (fx + tx) / 2 + (vertical ? 12 : 0);
    const my = (fy + ty) / 2 + (vertical ? 0 : 10);
    const ang = Math.atan2(ty - my, tx - mx);
    const head = (/** @type {number} */ turn) => `${tx - 7 * Math.cos(ang + turn)},${ty - 7 * Math.sin(ang + turn)}`;
    line.setAttribute('d', `M${fx},${fy} Q${mx},${my} ${tx},${ty}`);
    tip.setAttribute('d', `M${head(0.5)} L${tx},${ty} L${head(-0.5)}`);
    comeIn();
  }

  /** Shows a note frame() has just placed for the first time, drawing its line from the chip. */
  function comeIn() {
    if (!revealing) return;
    revealing = false;
    drawLine();
    layer.classList.add('is-on');
    announce(text.textContent || '');
  }

  /** Whether stop i shows its answer: its action was done, and the answer applies. @param {number} i */
  function showsThen(i) {
    const then = stops[i]?.then;
    return !!stops[i] && answered.has(stops[i]) && !!then && (!then.need || (!!ctx && then.need(ctx)));
  }

  /** A stop that can show now: whatever it, or its answer once done, points at is on the stage. @param {number} i */
  function open(i) {
    const stop = stops[i];
    if (!stop || !ctx) return false;
    if (showsThen(i)) return !!ctx.stage.querySelector(/** @type {Callout} */ (stop.then).at);
    return (!stop.ready || stop.ready(ctx)) && !!ctx.stage.querySelector(stop.at);
  }

  /** Next (1) or Back (-1) through the stops. @param {1 | -1} dir @returns {boolean} whether it moved */
  function go(dir) {
    if (!ctx) return false;
    let i = at + dir;
    while (i >= 0 && i < stops.length && !open(i)) i += dir;
    if (i < 0 || i >= stops.length) return false;
    at = i;
    waiting = false;
    // A stop already done shows its answer.
    thenShown = showsThen(i);
    render();
    return true;
  }

  /**
   * The one thing to press now: the button a waiting stop asks for, or the tour's Next.
   * @returns {Element | null}
   */
  function ringTarget() {
    if (!ctx || !shown || waiting) return null;
    const stop = stops[at];
    if (!stop) return null;
    if (stop.until && !thenShown) {
      const sel = stop.at === SEL.playIcon ? SEL.playButton : stop.at;
      const el = ctx.stage.querySelector(sel);
      if (el) return el;
    }
    const co = current();
    const button = co?.go ? ctx.stage.querySelector(co.go) : null;
    return button || document.getElementById('next');
  }

  /** Puts the ring on ringTarget() once it's time: at once on a step's last stop, after IDLE_MS on the others. */
  function ringFrame() {
    if (!ctx) return;
    const el = ringTarget();
    const early = at < stops.length - 1 && performance.now() - stopSince < IDLE_MS;
    const show = !!el && !fading && !ctx.busy() && !ctx.tour.hidden && layer.classList.contains('is-on') && !early;
    if (!show || !el) {
      if (ring.classList.contains('is-on')) ring.classList.remove('is-on');
      return;
    }
    const r = el.getBoundingClientRect();
    const radius = getComputedStyle(el).borderTopLeftRadius;
    const key = [r.left, r.top, r.width, r.height].map(Math.round).join() + radius;
    if (key !== ringPlaced) {
      ringPlaced = key;
      Object.assign(ring.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: radius });
    }
    if (!ring.classList.contains('is-on')) ring.classList.add('is-on');
  }

  function loop() {
    frame();
    ringFrame();
    requestAnimationFrame(loop);
  }

  /** @type {any} */ (globalThis).DripCoach = {
    /**
     * A step started. With `wait`, it says nothing until the next thing the visitor does lands (step 1's Reveal video,
     * whose card is dealt on arriving here).
     * With `fromEnd` (Back from the next step), it starts on the step's last stop that can show.
     * @param {string} id @param {Ctx} c @param {{ wait?: boolean, fromEnd?: boolean }} [opts]
     */
    start(id, c, opts = {}) {
      if (!ctx) {
        document.body.append(layer, ring, said);
        requestAnimationFrame(loop);
      }
      ctx = c;
      ctx.last = '';
      stepId = id;
      at = 0;
      thenShown = false;
      answered = kept[id] || new Set();
      waiting = !!opts.wait;
      stops = (STOPS[id] || []).filter((s) => !s.need || s.need(c));
      // A new step starts clean: whatever the last step showed goes, and this one's first callout comes in fresh.
      // The stage redraws at once, so the old callout goes at once too, with no fade over the new screen.
      layer.classList.add('is-instant');
      layer.classList.remove('is-on');
      layer.getBoundingClientRect();
      layer.classList.remove('is-instant');
      shown = null;
      fading = false;
      revealing = false;
      flag('is-away', false);
      if (!waiting) {
        if (opts.fromEnd) {
          at = stops.length - 1;
          while (at > 0 && !open(at)) at--;
        } else {
          while (at < stops.length - 1 && !open(at)) at++;
        }
        at = Math.max(0, at);
        thenShown = showsThen(at);
      }
      clearTimeout(swapTimer);
      clearTimeout(fadeTimer);
      chip.classList.remove('is-swapping');
      render();
    },

    /** The visitor did something on the stage. @param {string} action */
    did(action) {
      if (!ctx) return;
      ctx.last = action;
      waiting = false;
      if (action === 'lock' && stepId === 'lock') {
        // The lock came back up, with what it offers now (no +15m once the drops are gone). The note goes to the next
        // thing not tried yet, after what was just done, so unlocking goes on to Done rather than back to +15m.
        stops = (STOPS.lock || []).filter((s) => !s.need || s.need(/** @type {Ctx} */ (ctx)));
        const untried = (/** @type {number} */ n) => !answered.has(stops[n]) && open(n);
        let fresh = -1;
        for (let n = at + 1; n < stops.length && fresh < 0; n++) if (untried(n)) fresh = n;
        for (let n = 0; n < stops.length && fresh < 0; n++) if (untried(n)) fresh = n;
        at = fresh >= 0 ? fresh : stops.length - 1;
        thenShown = false;
      } else {
        // Doing what a stop asks shows its answer, wherever Next has got to, since that's where the visitor already is.
        const i = stops.findIndex((s) => s.until?.includes(action));
        const t = stops.findIndex((s) => s.touch?.includes(action));
        if (i < 0 && t >= 0) {
          at = t;
          thenShown = false;
        }
        if (i >= 0) {
          answered.add(stops[i]);
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

    /**
     * Next. True when it moved the callout to the step's next stop, so the tour stays on this step. Stops with nothing
     * to point at yet (the card before it's dealt) are skipped, and with none left Next leaves the step.
     */
    next() {
      return go(1);
    },

    /** Back. True when it went back a stop. */
    back() {
      return go(-1);
    },

    /**
     * The tour started over on a fresh sandbox (a new mode, after Change): what was done on steps 1 and 2 is gone, so
     * their notes forget it too.
     */
    reset() {
      for (const set of Object.values(kept)) set.clear();
      answered = new Set();
    },

    /** Whether the lock step has callouts left that need the lock up, so Next brings it back instead of leaving. */
    wantsLock() {
      if (stepId !== 'lock') return false;
      const all = (STOPS.lock || []).filter((s) => !s.need || !ctx || s.need(ctx));
      return all.some((s) => !answered.has(s));
    },
  };
})();
