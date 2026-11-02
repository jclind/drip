// @ts-check
// The page drip opens once, when it's installed (DESIGN.md, "Welcome page"). It's two screens: the mode choice, then a
// tour of the mix picked. The tour runs working copies of drip's screens on a throwaway state, through the real rules in
// state.js and drip.css's styles. It never sends a change to the worker. The markup copies home.js's stats, actions,
// and card, and watch.js's lock and pill, so a change to those screens needs the same change here.

(() => {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;
  /** @type {any} */
  const DripGlass = /** @type {any} */ (globalThis).DripGlass;
  /** @type {any} */
  const DripStash = /** @type {any} */ (globalThis).DripStash;
  /** @type {any} */
  const { h, icon, price, hourLabel } = /** @type {any} */ (globalThis).DripUI;
  /** @type {any} */
  const DripReveal = /** @type {any} */ (globalThis).DripReveal;
  /** @type {any} */
  const DripPour = /** @type {any} */ (globalThis).DripPour;
  /** @type {any} */
  const DripCounter = /** @type {any} */ (globalThis).DripCounter;

  /** Tour callouts, round 2 (coach.js). Its calls do nothing unless the page was opened with ?v=d, e, or f. */
  /** @type {any} */
  const coach = /** @type {any} */ (globalThis).DripCoach || { start() {}, did() {}, next: () => false, back: () => false };

  /** @param {string} id */
  const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // drip.css keys dark mode off html[dark], the way YouTube sets it. Here it follows Chrome's theme.
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = () => document.documentElement.toggleAttribute('dark', darkQuery.matches);
  applyTheme();
  darkQuery.addEventListener('change', applyTheme);

  // Videos the tour's reveals draw from. Made up, with drawn thumbnails, so the page loads nothing from YouTube.
  const SAMPLES = [
    { id: 'tour-joinery', title: 'How Japanese joinery holds without nails', channel: 'Workshop Notes', length: '14:02', views: '214K views', age: '3d ago', thumb: 'linear-gradient(135deg, #8a5a3c, #3d2618)' },
    { id: 'tour-trail', title: 'Riding the ridge trail before the storm', channel: 'Trail Days', length: '21:35', views: '1.2M views', age: '1w ago', thumb: 'linear-gradient(135deg, #3a7d5c, #173528)' },
    { id: 'tour-bread', title: 'Sourdough with a schedule that fits a workday', channel: 'Kitchen Basics', length: '9:08', views: '48K views', age: '2mo ago', thumb: 'linear-gradient(135deg, #c08a3e, #5a3a12)' },
    { id: 'tour-orbit', title: 'Why the Moon always shows the same face', channel: 'Slow Science', length: '12:47', views: '3.4M views', age: '5d ago', thumb: 'linear-gradient(135deg, #3c4f8a, #141c3d)' },
    { id: 'tour-redstone', title: 'Building a working clock out of redstone', channel: 'Blockworks', length: '25:33', views: '612K views', age: '1y ago', thumb: 'linear-gradient(135deg, #9a3a3a, #3a1414)' },
  ];
  /** @param {string} id */
  const sample = (id) => SAMPLES.find((v) => v.id === id) || SAMPLES[0];

  /**
   * The numbers on the page and in the tour are the defaults, never the saved settings. The page opens on install, when
   * the two are the same, and a reopened tab after testing showed the test numbers (Jesse, 2026-10-12).
   */
  const settings = Drip.DEFAULT_SETTINGS;
  /** The tour's own state. Every button in the tour changes this and nothing else. */
  /**
   * The mode parts picked on this page (Q29). Full drip to start, as design J picked it; a saved mix replaces it once the
   * worker answers. The hero, the tour, and the tour's own state all follow it.
   * @type {{searchCap: boolean, cards: 'off' | 'unlimited' | 'limited', clock: boolean, stash: boolean}}
   */
  let parts = { ...Drip.MODES.full };
  /** Customize's bell switch (Q16). Not a mode part, so a mode pick leaves it alone. */
  let hideBell = settings.hideBell;
  const sand = freshState();

  function freshState() {
    const state = Drip.initialState(Date.now());
    Object.assign(state.settings, settings, parts);
    state.tokens = { watch: settings.watchTokensPerDay, rec: settings.recTokensPerDay };
    return state;
  }

  // The mode (Q29, DESIGN.md "Modes"), design J: a list lightest first, each row with a small picture of its home page.
  // Full drip is picked to start, with a "Recommended" tag, and its picture is the only one in color until another row is
  // picked. Customize on the picked row opens a switch per part, each named for what it does. A pick saves at once, and
  // the hero and the tour below follow it.

  const hourDaily = Drip.formatMinutes(settings.watchTokensPerDay * settings.minutesPerToken * 60);
  /** @type {{name: 'quiet' | 'curated' | 'full', label: string, what: string, mini: string}[]} */
  const MODE_ROWS = [
    { name: 'quiet', label: 'Quiet', what: "Hides YouTube's feeds. Search is all that's left.",
      mini: '<span class="m-search"></span>' },
    { name: 'curated', label: 'Curated', what: 'New videos come one at a time, as many as you want.',
      mini: '<span class="m-btns"><span class="m-btn gold"></span></span><span class="m-line"></span><span class="m-line"></span><span class="m-line"></span>' },
    { name: 'full', label: 'Full drip', what: `${hourDaily} of watching and ${settings.recTokensPerDay} new videos a day. The video stops when the time runs out.`,
      mini: '<span class="m-stats"><span class="m-glass"></span><span class="m-num"></span><span class="m-pip is-drop"></span><span class="m-pip is-card"></span></span><span class="m-btns"><span class="m-btn"></span><span class="m-btn gold"></span></span><span class="m-line"></span><span class="m-line"></span>' },
  ];
  /** @type {{key: 'feeds' | 'searchCap' | 'cards' | 'clock' | 'stash' | 'hideBell', label: string, how: () => string}[]} */
  const OPTS = [
    { key: 'feeds', label: "Hide YouTube's feeds", how: () => 'Home, Subscriptions, the sidebar, end screens, autoplay, and Shorts. Always on.' },
    { key: 'searchCap', label: 'Stop search at 10 results', how: () => 'A button loads 10 more.' },
    { key: 'cards', label: 'Reveal one video at a time', how: cardsHow },
    { key: 'clock', label: 'Limit watch time', how: () => `${hourDaily} a day, in ${Drip.formatMinutes(settings.minutesPerToken * 60)} drops. The video stops when it runs out.` },
    { key: 'stash', label: 'Stash videos for later', how: () => `Up to ${settings.stashMax}, from search and watch pages.` },
    { key: 'hideBell', label: 'Hide the notification bell', how: () => 'The same in every mode.' },
  ];
  /**
   * What the cards switch gives: the cards as saved, or with it off, what turning it on would give. A mix saved in
   * Settings can count cards without the clock, or not count them with it (Codex, 2026-10-15).
   */
  function cardsHow() {
    const counted = parts.cards === 'off' ? parts.clock : parts.cards === 'limited';
    if (!counted) return 'As many as you want.';
    return parts.clock ? `${settings.recTokensPerDay} a day, while watch time is limited.` : `${settings.recTokensPerDay} a day.`;
  }

  /** The row picked, which a switched part leaves picked with a "Changed" tag. */
  let modeBase = /** @type {'quiet' | 'curated' | 'full'} */ ('full');
  let customizing = false;

  /** @param {string} [focus] What keyboard focus goes back to after the redraw: a row's mode, a part, or 'customize'. */
  function drawLadder(focus) {
    const rows = MODE_ROWS.map((row) => {
      const picked = row.name === modeBase;
      const el = h('div', {
        class: 'rung', role: 'radio', tabindex: picked ? '0' : '-1', 'aria-checked': String(picked), 'data-mode': row.name,
        // A click in Customize's switches or their text isn't a pick, or it would put the preset back over the mix.
        onclick: (/** @type {MouseEvent} */ e) => { if (!/** @type {Element} */ (e.target).closest('button, .opts')) pickMode(row.name); },
        onkeydown: (/** @type {KeyboardEvent} */ e) => {
          if (e.target !== el) return;
          const i = MODE_ROWS.indexOf(row);
          const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
          if (step) {
            e.preventDefault();
            pickMode(MODE_ROWS[(i + step + MODE_ROWS.length) % MODE_ROWS.length].name, true);
          } else if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            pickMode(row.name, true);
          }
        },
      },
      h('span', { class: 'dot', 'aria-hidden': 'true' }),
      h('span', { class: 'rung-name' }, row.label,
        row.name === 'full' && h('span', { class: 'rec-tag' }, icon('drop', 'drip-token-drop'), 'Recommended'),
        picked && Drip.modeOf(parts) !== row.name && h('span', { class: 'custom-tag' }, 'Changed')),
      h('span', { class: 'rung-what' }, row.what));
      const mini = h('div', { class: 'mini', 'aria-hidden': 'true' });
      mini.innerHTML = row.mini;
      el.insertBefore(mini, el.children[2]);
      if (picked) {
        el.append(h('button', {
          type: 'button', class: 'linkish cz', 'data-k': 'customize', 'aria-expanded': String(customizing),
          onclick: () => { customizing = !customizing; drawLadder('customize'); },
        }, customizing ? 'Hide' : 'Customize'));
        if (customizing) {
          el.append(h('div', { class: 'opts' }, ...OPTS.map((o) => {
            const on = o.key === 'feeds' || (o.key === 'hideBell' ? hideBell : o.key === 'cards' ? parts.cards !== 'off' : parts[o.key]);
            return h('div', { class: 'opt' },
              h('div', { class: 'opt-text' }, o.label, h('div', { class: 'opt-sub' }, o.how())),
              h('button', {
                type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(on), 'aria-label': o.label, 'data-k': o.key,
                disabled: o.key === 'feeds', onclick: () => switchPart(o.key),
              }));
          })));
        }
      }
      return el;
    });
    $('ladder').replaceChildren(...rows);
    if (focus) /** @type {HTMLElement | null} */ ($('ladder').querySelector(`[data-k="${focus}"], [data-mode="${focus}"]`))?.focus();
  }

  /** @param {'quiet' | 'curated' | 'full'} name @param {boolean} [keyboard] */
  function pickMode(name, keyboard = false) {
    if (name === modeBase && Drip.modeOf(parts) === name) return;
    modeBase = name;
    parts = { ...Drip.MODES[name] };
    customizing = false;
    applyParts(keyboard ? name : undefined);
  }

  /**
   * Customize's switches. The one cards switch counts cards while watch time is limited and leaves them unlimited
   * otherwise, so it needs no count of its own (DESIGN.md "Modes").
   * @param {'feeds' | 'searchCap' | 'cards' | 'clock' | 'stash' | 'hideBell'} key
   */
  function switchPart(key) {
    if (key === 'feeds') return;
    if (key === 'hideBell') {
      hideBell = !hideBell;
      chrome.runtime.sendMessage({ type: 'updateSettings', changes: { hideBell } }).catch(() => {});
      drawLadder(key);
      retour();
      return;
    }
    if (key === 'cards') parts.cards = parts.cards === 'off' ? (parts.clock ? 'limited' : 'unlimited') : 'off';
    else {
      parts[key] = !parts[key];
      if (key === 'clock' && parts.cards !== 'off') parts.cards = parts.clock ? 'limited' : 'unlimited';
    }
    applyParts(key);
  }

  /** Saves the mix, then redraws the list, the hero, and the tour from its first step. @param {string} [focus] */
  function applyParts(focus) {
    chrome.runtime.sendMessage({ type: 'updateSettings', changes: { ...parts } }).catch(() => {});
    drawLadder(focus);
    retour();
  }

  /** The tour for the current mix, from step n. It starts over on its own fresh state. @param {number} [n] */
  function retour(n = 0) {
    Object.assign(sand, freshState());
    lastCardId = '';
    const mode = Drip.modeOf(parts);
    $('tourTitle').textContent = `How ${mode ? MODE_ROWS.find((r) => r.name === mode)?.label : 'your mix'} works`;
    STEPS = ALL_STEPS.filter((s) => s.needs());
    go(n);
  }

  // The two screens. The hash keeps the screen and the step across a reload: none on the choice, #tour-2 on the tour's
  // second step. Next pushes the tour onto the history, so the browser's Back goes to the choice too.

  /** The tour step in the hash, counted from 0, or -1 on the choice. */
  function hashStep() {
    const m = /^#tour(?:-(\d+))?$/.exec(location.hash);
    return m ? Math.max(0, Number(m[1] || 1) - 1) : -1;
  }

  /** Shows the screen the hash names. */
  function showScreen() {
    const n = hashStep();
    const touring = n >= 0;
    const switched = touring === $('tour').hidden;
    $('choose').hidden = touring;
    $('tour').hidden = !touring;
    if (touring && n !== step) go(n);
    if (!switched) return;
    window.scrollTo(0, 0);
    // Focus goes to the new screen, so a screen reader starts there.
    const to = touring ? $('tourTitle') : /** @type {HTMLElement | null} */ ($('ladder').querySelector('[aria-checked="true"]'));
    to?.focus({ preventScroll: true });
  }

  /** The tour's own history entry, which Next pushed, so going back pops it instead of leaving it as a Forward. */
  const PUSHED = 'drip-tour';

  function toChoice() {
    if (history.state === PUSHED) {
      history.back();
    } else {
      history.replaceState(null, '', location.pathname + location.search);
      showScreen();
    }
  }

  $('modesNext').append('Next', icon('arrow-right'));
  $('modesNext').addEventListener('click', () => {
    retour(0);
    // The whole path, since a bare hash resolves against a <base>, which dev/page.html sets.
    history.pushState(PUSHED, '', `${location.pathname}${location.search}#tour-1`);
    showScreen();
  });
  $('changeMode').addEventListener('click', toChoice);
  window.addEventListener('hashchange', showScreen);
  window.addEventListener('popstate', showScreen);

  $('brandDrop').replaceWith(icon('drop', 'drip-token-drop'));
  $('footYouTube').append('Open YouTube', icon('arrow-up-right'));
  $('footSettings').append(icon('settings'), 'Settings');
  $('footSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());

  // The tour. Each step is one sentence over one screen. A step's show() draws into the stage and returns a function
  // that stops its timers when the step changes.

  /** @typedef {{id: string, say: () => string, show: () => (() => void) | undefined, needs: () => boolean}} Step */
  /** @type {Step[]} Every step. The tour skips the ones whose part is off (Q29). */
  const ALL_STEPS = [
    // The first steps say the day's drops and cards, which had tiles of their own above the tour until 2026-10-15.
    {
      id: 'home', show: showHome, needs: () => parts.clock,
      say: () => `You get ${plural(settings.watchTokensPerDay, 'drop')} a day, and each one is ${dropTime} of watching. Try +${dropTime}.`,
    },
    {
      id: 'reveal', show: showReveal, needs: () => parts.cards !== 'off',
      say: () => `${parts.cards === 'limited' ? `You get ${plural(settings.recTokensPerDay, 'card')} a day, and each one reveals a video.` : 'Reveal video shows one video at a time.'} ${parts.stash ? 'Watch it, stash it, or pass.' : 'Watch it or pass.'}`,
    },
    { id: 'player', say: () => 'Minutes only drain while a video plays. Press play.', show: showPlayer, needs: () => parts.clock },
    { id: 'lock', say: () => 'When the glass runs dry, the lock comes up. Done for now takes you home.', show: showLock, needs: () => parts.clock },
    { id: 'changes', say: () => (STEPS.length > 1 ? 'What else changes on YouTube.' : 'What changes on YouTube.'), show: showChanges, needs: () => true },
  ];
  /** @type {Step[]} */
  let STEPS = ALL_STEPS.filter((s) => s.needs());
  const dropTime = Drip.formatMinutes(settings.minutesPerToken * 60);
  /** @param {number} n @param {string} word */
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  /** Where a step is in this tour, or the last step if the mode skips it. @param {string} id */
  const at = (id) => {
    const i = STEPS.findIndex((s) => s.id === id);
    return i < 0 ? STEPS.length - 1 : i;
  };
  const stepId = () => STEPS[step].id;

  let step = 0;
  /** @type {(() => void) | undefined} */
  let stopStep;
  /** Timers a step started. Cleared when the step changes, so nothing from an old step draws into a new one. */
  /** @type {Set<ReturnType<typeof setTimeout>>} */
  const timers = new Set();

  /** @param {() => void} fn @param {number} ms */
  function later(fn, ms) {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  }

  const stage = $('stage');

  let morphing = false;

  /**
   * Redraws the stage with fn and glides its height to the new screen's, so the controls under it move smoothly.
   * @param {() => void} fn
   */
  function morph(fn) {
    // A step's first draw happens inside go()'s morph, which measures the whole change once.
    if (morphing) return fn();
    morphing = true;
    const before = stage.getBoundingClientRect().height;
    try {
      fn();
    } finally {
      morphing = false;
    }
    const after = stage.getBoundingClientRect().height;
    if (!before || Math.abs(before - after) < 2 || reducedMotion()) return;
    stage.animate([{ height: `${before}px` }, { height: `${after}px` }], { duration: 260, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' });
  }

  /** Set by Back and the left arrow, so the step they go back to starts on its last callout. */
  let backing = false;

  /** @param {number} n */
  function go(n) {
    // A reveal animation still running belongs to the old step's screen, which is about to go.
    motion++;
    moving = false;
    stopStep?.();
    for (const t of timers) clearTimeout(t);
    timers.clear();
    step = Math.max(0, Math.min(STEPS.length - 1, n));
    if (!$('tour').hidden) history.replaceState(history.state, '', `${location.pathname}${location.search}#tour-${step + 1}`);
    $('say').textContent = STEPS[step].say();
    const dealing = revealOnArrive && stepId() === 'reveal';
    morph(() => {
      stage.style.minHeight = '';
      stage.replaceChildren();
      stopStep = STEPS[step].show();
    });
    renderControls();
    // Step 1's Reveal video deals on arriving at step 2, so step 2's callout waits for that card.
    coach.start(stepId(), coachCtx, { wait: dealing, fromEnd: backing });
    backing = false;
  }

  function renderControls() {
    const last = step === STEPS.length - 1;
    $('dots').hidden = STEPS.length < 2;
    $('dots').replaceChildren(...STEPS.map((_, i) => h('button', {
      type: 'button', 'aria-label': `Step ${i + 1} of ${STEPS.length}`, 'aria-current': i === step ? 'step' : undefined,
      onclick: () => go(i),
    })));
    // Back on the first step goes to the choice.
    $('skip').hidden = last;
    const next = $('next');
    next.replaceChildren(...(last ? ['Open YouTube', icon('arrow-up-right')] : ['Next', icon('arrow-right')]));
  }

  $('back').addEventListener('click', () => {
    if (coach.back()) return;
    if (step === 0) toChoice();
    else {
      backing = true;
      go(step - 1);
    }
  });
  $('skip').addEventListener('click', () => go(STEPS.length - 1));
  $('next').addEventListener('click', () => {
    if (coach.next()) return;
    if (step === STEPS.length - 1) location.href = 'https://www.youtube.com/';
    else go(step + 1);
  });
  $('tour').addEventListener('keydown', (e) => {
    if (/** @type {Element} */ (e.target).closest('textarea, input')) return;
    if (e.key === 'ArrowRight' && !coach.next() && step < STEPS.length - 1) go(step + 1);
    else if (e.key === 'ArrowLeft' && !coach.back() && step > 0) {
      backing = true;
      go(step - 1);
    }
  });

  // Steps 1 and 2: the home page, as home.js draws it.

  /** @type {SVGSVGElement | null} */
  let glassEl = null;
  const GLASS_PX = 34;
  let lastCardId = '';
  /** The card's Stash as last drawn, so a rebuild after stashing fills the bookmark from where it was (stash.js). */
  let stashDrawn = { id: '', stashed: false };
  /** The card Watch was clicked on, which the player then plays. */
  let watchedId = '';

  function glass() {
    const fraction = DripGlass.fraction(sand);
    if (!glassEl) glassEl = DripGlass.make(fraction, GLASS_PX);
    else if (!pouring) DripGlass.set(glassEl, fraction, GLASS_PX);
    return glassEl;
  }

  /** While +15m's drop is in the air, the glass is pour.js's and the minutes read what they were until it lands. */
  let pouring = false;
  /** @type {number | null} */
  let heldLeft = null;

  /** What coach.js reads to word its callouts. Functions, so each reads the tour's state when it's drawn. */
  const coachCtx = {
    stage: $('stage'),
    tour: $('tour'),
    busy: () => moving || pouring || lockMoving(),
    dropTime: () => Drip.formatMinutes(sand.settings.minutesPerToken * 60),
    drops: () => sand.tokens.watch,
    cards: () => sand.tokens.rec,
    counted: () => parts.cards === 'limited',
    clock: () => parts.clock,
    stash: () => parts.stash,
    needLeft: () => Math.max(0, sand.settings.needThisPerDay - sand.unlocked.length),
    resetLabel: () => hourLabel(sand.settings.resetHour),
    carries: () => sand.settings.rolloverDays > 1,
    nextStep: () => STEPS[step + 1]?.id || '',
  };

  /** The lock rising, draining, or leaving, or the stage changing height around it: callouts wait for it to settle. */
  function lockMoving() {
    if (stage.querySelector('#drip-lock.is-leaving, #drip-lock.is-draining')) return true;
    const panel = stage.querySelector('#drip-lock .drip-lock-panel');
    const running = (/** @type {Element} */ el) => el.getAnimations().some((a) => a.playState === 'running' || a.playState === 'pending');
    return (!!panel && running(panel)) || running(stage);
  }

  /** +15m, as on the home page: a drop leaves the counter and falls into the glass (pour.js). */
  function addTime() {
    if (pouring) return;
    const counter = stage.querySelector('.drip-stats .drip-token-drop');
    const pours = animates() && !!counter && !!glassEl?.isConnected;
    const from = DripGlass.fraction(sand);
    const left = sand.watchSecondsLeft;
    if (!Drip.spendWatch(sand).ok) return;
    if (pours) {
      pouring = true;
      heldLeft = left;
      // The tour may have moved on and come back by now. Steps 1 and 2 show the stats, so they redraw.
      const redraw = () => {
        if (stepId() === 'home' || stepId() === 'reveal') drawHome();
      };
      DripPour.pour({
        counter: /** @type {Element} */ (counter).getBoundingClientRect(), glass: glassEl, px: GLASS_PX, from, to: DripGlass.fraction(sand),
        onLand: () => {
          heldLeft = null;
          redraw();
        },
      }).then(() => {
        pouring = false;
        heldLeft = null;
        redraw();
        coach.did('add');
      });
    }
    drawHome();
    if (!pours) coach.did('add');
  }

  /** The home page's stats. `heldDrops` are drops still on their way into the counter, which it doesn't show yet. */
  function stats(heldDrops = 0) {
    // As home.js draws them: each only while its part is on (Q29).
    const counted = parts.cards === 'limited';
    if (!parts.clock && !counted) return null;
    const watch = Math.max(0, sand.tokens.watch - heldDrops);
    const { rec } = sand.tokens;
    const cap = Drip.caps(sand.settings);
    const room = String(Math.max(cap.watch, cap.rec, sand.tokens.watch, rec)).length;
    return h('div', { class: 'drip-stats' },
      parts.clock && h('div', { class: 'drip-glass-tile' }, glass()),
      parts.clock && h('div', { class: 'drip-time-block' },
        h('div', { class: 'drip-time' }, Drip.formatMinutes(heldLeft ?? sand.watchSecondsLeft)),
        h('div', { class: 'drip-sub' }, 'left today')),
      h('div', { class: 'drip-counts', style: `--drip-room: ${room}` },
        parts.clock && h('div', { class: `drip-count${watch ? '' : ' is-zero'}` }, icon('drop', 'drip-token-drop'), DripCounter.num(watch), h('span', { class: 'drip-sr' }, watch === 1 ? ' drop' : ' drops')),
        counted && h('div', { class: `drip-count${rec ? '' : ' is-zero'}` }, icon('card', 'drip-token-card'), DripCounter.num(rec), h('span', { class: 'drip-sr' }, rec === 1 ? ' card' : ' cards'))),
      // With cards off, +15m ends the stats line, as on YouTube (design F).
      parts.clock && parts.cards === 'off' && addButton());
  }

  function addButton() {
    return h('button', {
      class: 'drip-b drip-b-gray drip-add', disabled: sand.tokens.watch < 1, onclick: addTime,
    }, icon('clock'), h('span', {}, `+${Drip.formatMinutes(sand.settings.minutesPerToken * 60)}`), price('drop'));
  }

  /**
   * The home page's body as home.js lays it out. With cards off, YouTube's search box sits under the stats instead of
   * the buttons, drawn here as a picture of it (design F, Codex 2026-10-15).
   * @param {HTMLElement | null} top @param {HTMLElement | null} rest
   */
  function homePage(top, rest) {
    const search = parts.cards === 'off';
    return h('div', { class: `drip-page${sand.current ? ' is-open' : ''}${search ? ' is-search' : ''}` }, top, search ? searchPicture() : rest);
  }

  function searchPicture() {
    const mic = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [k, v] of Object.entries({ width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' })) mic.setAttribute(k, v);
    mic.innerHTML = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>';
    return h('div', { class: 'drip-search-slot tour-search', 'aria-hidden': 'true' },
      h('span', { class: 'tour-search-field' }, h('span', {}, 'Search'), h('span', { class: 'tour-search-go' }, icon('search'))),
      h('span', { class: 'tour-search-mic' }, mic));
  }

  function actions() {
    const counted = parts.cards === 'limited';
    if (parts.cards === 'off') return null;
    return h('div', { class: 'drip-actions' },
      parts.clock && addButton(),
      h('button', {
        class: 'drip-b drip-b-gold drip-reveal', disabled: counted && sand.tokens.rec < 1,
        onclick: () => {
          if (stepId() === 'reveal') reveal();
          else {
            revealOnArrive = true;
            go(at('reveal'));
          }
        },
      }, h('span', {}, 'Reveal video'), counted && price('card')));
  }

  /** @param {any} video */
  function card(video) {
    const saved = sand.backlog.some((/** @type {any} */ v) => v.id === video.id);
    const isNew = video.id !== lastCardId;
    lastCardId = video.id;
    const fills = stashDrawn.id === video.id && stashDrawn.stashed !== saved;
    stashDrawn = { id: video.id, stashed: saved };
    const stash = DripStash.parts(fills ? !saved : saved, { labelClass: 'drip-save-label' });
    if (fills) stash.to(saved);
    const thumb = h('div', { class: 'tour-thumb' }, icon('play-line'), h('span', { class: 'drip-length' }, video.length));
    thumb.style.setProperty('--thumb', sample(video.id).thumb);
    // The reveal animation deals the card itself, so the card doesn't also rise in.
    return h('div', { class: `drip-card${isNew && !deals() ? ' is-new' : ''}` },
      h('div', { class: 'drip-thumb is-dealt', 'aria-hidden': 'true' }, DripReveal.dealCard(thumb, true)),
      h('div', { class: 'drip-card-title', title: video.title }, video.title),
      h('div', { class: 'drip-card-meta-row' },
        h('span', { class: 'drip-meta drip-meta-split' }, h('span', { class: 'drip-meta-channel' }, video.channel), h('span', { class: 'drip-meta-rest' }, ` · ${video.views} · ${video.age}`), h('span', { class: 'drip-sr' }, `, length ${video.length}`)),
        h('button', { class: 'drip-b drip-b-primary drip-watch', onclick: () => { Drip.resolveCurrent(sand, 'watch', video.id); watchedId = video.id; go(at('player')); } },
          icon('play'), h('span', {}, 'Watch'), parts.clock && sand.watchSecondsLeft <= 0 && price('drop'))),
      h('div', { class: 'drip-card-actions' },
        parts.stash && h('button', {
          class: `drip-b drip-b-gray drip-card-save drip-stash${saved ? ' is-saved' : ''}`, 'aria-pressed': String(saved),
          onclick: () => { Drip.resolveCurrent(sand, saved ? 'unsave' : 'save', video.id); drawHome(); coach.did(saved ? 'unstash' : 'stash'); },
        }, ...stash.nodes),
        h('button', {
          class: 'drip-b drip-b-gray drip-next', disabled: parts.cards === 'limited' && sand.tokens.rec < 1,
          onclick: () => {
            const find = () => {
              if (!Drip.revealNext(sand, video.id, pool()).ok) refill();
              return sand.current && sand.current.id !== video.id ? sand.current : null;
            };
            if (deals()) animate(DripReveal.next, find, 'next', 'next');
            else {
              find();
              drawHome();
              coach.did('next');
            }
          },
        }, icon('arrow'), h('span', { class: 'drip-next-label' }, 'Reveal next'), parts.cards === 'limited' && price('card')),
        h('button', {
          class: 'drip-b drip-b-gray drip-pass', 'aria-label': 'Pass', title: "Pass. It's free, and this video won't come back.",
          onclick: () => {
            Drip.resolveCurrent(sand, 'pass', video.id);
            if (deals()) animate(DripReveal.pass, () => null, 'reveal', 'pass');
            else {
              drawHome();
              coach.did('pass');
            }
          },
        }, icon('x'))));
  }

  /** The loading card the reveal animation opens up, with the card's buttons under it (reveal.js). */
  function openingCard() {
    return h('div', { class: 'drip-card is-loading' },
      h('div', { class: 'drip-thumb' }),
      h('div', { class: 'drip-card-title' }, h('span', { class: 'drip-skel' }), h('span', { class: 'drip-skel drip-skel-short' })),
      h('div', { class: 'drip-card-meta-row' }, h('span', { class: 'drip-meta' }, 'Finding a video…')),
      h('div', { class: 'drip-card-actions' },
        h('button', { class: 'drip-b drip-b-gray drip-card-save drip-stash', tabindex: '-1' }, ...DripStash.parts(false, { labelClass: 'drip-save-label' }).nodes),
        h('button', { class: 'drip-b drip-b-gray drip-next', tabindex: '-1' }, icon('arrow'), h('span', { class: 'drip-next-label' }, 'Reveal next'), price('card')),
        h('button', { class: 'drip-b drip-b-gray drip-pass', tabindex: '-1', 'aria-label': 'Pass' }, icon('x'))));
  }

  const animates = () => !DripReveal.reduced();
  /** The reveal animations morph Full drip's +15m, card counter, and Stash, so other mixes change without them (Q29). */
  const deals = () => animates() && parts.clock && parts.cards === 'limited' && parts.stash;
  /** A reveal animation is running on the tour's home screen, which it draws until it's done. */
  let moving = false;
  /** Counts animations, so one left over from a step that's gone doesn't draw over the new one. */
  let motion = 0;

  /**
   * Runs one of reveal.js's animations on the tour's home screen, then draws it once. `find` changes the tour's state
   * and returns the video it revealed, or null.
   * @param {(o: any) => Promise<boolean | void>} run
   * @param {() => any} find
   * @param {string} focusKey The button keyboard focus goes to afterwards, if the tour had it: watch, next, or reveal.
   * @param {string} action What coach.js is told once it's done: reveal, next, or pass.
   */
  async function animate(run, find, focusKey, action) {
    const root = /** @type {HTMLElement | null} */ (stage.querySelector('#drip-home'));
    const page = root?.querySelector('.drip-page');
    if (!root || !page || moving) return;
    const id = ++motion;
    const focused = stage.contains(document.activeElement);
    moving = true;
    try {
      await run({
        // Reveal next finds 300ms in. A step change before then has already redrawn the screen, so it finds nothing.
        root, page, find: async () => (id === motion ? find() : null),
        counter: page.querySelector('.drip-stats .drip-token-card'),
        card: (/** @type {any} */ video) => (video ? card(video) : openingCard()),
        actions,
        ready: async () => {},
      });
    } finally {
      if (id === motion) {
        moving = false;
        drawHome();
        if (focused && !stage.contains(document.activeElement)) /** @type {HTMLElement | null} */ (stage.querySelector(`.drip-${focusKey}`))?.focus();
        coach.did(action);
      }
    }
  }

  /** Samples not revealed yet, starting over once the tour has shown them all. */
  function pool() {
    if (SAMPLES.every((v) => sand.seen.includes(v.id))) sand.seen = [];
    return SAMPLES;
  }

  /** Reveal next found nothing new: start the samples over and try once more. */
  function refill() {
    sand.seen = sand.current ? [sand.current.id] : [];
    if (sand.current) Drip.revealNext(sand, sand.current.id, SAMPLES);
  }

  function reveal() {
    const find = () => (!sand.current && Drip.reveal(sand, pool()).ok ? sand.current : null);
    if (deals() && !sand.current) animate(DripReveal.reveal, find, 'watch', 'reveal');
    else {
      find();
      drawHome();
      coach.did('reveal');
    }
  }

  function drawHome() {
    if (moving) return;
    const focused = document.activeElement && stage.contains(document.activeElement) ? [...stage.querySelectorAll('button')].indexOf(/** @type {any} */ (document.activeElement)) : -1;
    // With a card up, the page is open: the stats sit a little higher, as the reveal animation leaves them.
    morph(() => stage.replaceChildren(h('div', { id: 'drip-home', class: 'drip-ui' },
      homePage(stats(), sand.current ? card(sand.current) : actions()))));
    if (focused >= 0) /** @type {HTMLElement | undefined} */ (stage.querySelectorAll('button')[focused])?.focus();
  }

  function showHome() {
    drawHome();
    return undefined;
  }

  /**
   * The reveal step opens on the home page and waits for Reveal video, so the visitor deals the first card themselves
   * (Jesse, 2026-10-31: Curated's tour "just start[s] in the middle" when the step dealt one on arrival). Reveal video
   * pressed on step 1 deals on arriving here, since that press already asked for it.
   */
  function showReveal() {
    drawHome();
    if (revealOnArrive) {
      revealOnArrive = false;
      later(reveal, 250);
    }
    return undefined;
  }

  /** Set by step 1's Reveal video, which moves the tour here and then deals. */
  let revealOnArrive = false;

  // Step 3: a video playing, with the pill as watch.js draws it. The minutes drain 90 times faster than real ones.

  const SPEED = 90;
  /** @type {SVGSVGElement | null} */
  let pillGlass = null;
  const PILL_GLASS_PX = 20;

  /** The video the player and the lock are about: the card that was watched, or the first sample. */
  function playing() {
    return sample(watchedId || SAMPLES[0].id);
  }

  /**
   * The pill, built once per player and updated in place, so its Stash button stays the same element through the
   * player's ticks and keeps a click or keyboard focus (Codex, 2026-10-11).
   */
  function makePill() {
    const video = playing();
    const minutes = h('span', { class: 'drip-pill-minutes' });
    const leftToday = h('span', { class: 'drip-sr' }, ' left today');
    const pausedNote = h('span', { class: 'drip-pill-note' }, h('span', { class: 'drip-sep', 'aria-hidden': 'true' }, ' · '), 'paused');
    const time = h('span', { class: 'drip-pill-time' }, h('span', { class: 'drip-pill-label' }, minutes, leftToday, pausedNote));
    const save = h('button', { class: 'drip-pill-save drip-stash' });
    /** @type {any} */
    let stash = null;
    // Stash only with the stash on, as on the real pill (Q29, Codex 2026-10-15).
    const el = h('div', { id: 'drip-pill', class: 'drip-ui' }, time, parts.stash && save);
    let lastPlaying = false;
    let savedShown = '';

    /** @param {boolean} isPlaying */
    function update(isPlaying) {
      lastPlaying = isPlaying;
      const saved = sand.backlog.some((/** @type {any} */ v) => v.id === video.id);
      const unlocked = sand.unlocked.includes(video.id);
      const left = sand.watchSecondsLeft;
      const paused = !unlocked && !isPlaying && left > 0;
      const fraction = DripGlass.fraction(sand);
      if (!pillGlass) pillGlass = DripGlass.make(fraction, PILL_GLASS_PX);
      else DripGlass.set(pillGlass, fraction, PILL_GLASS_PX);
      if (unlocked) pillGlass.remove();
      else if (pillGlass.parentElement !== time) time.prepend(pillGlass);
      el.classList.toggle('is-low', !unlocked && isPlaying && left > 0 && left <= 120);
      time.classList.toggle('is-unlocked', unlocked);
      time.classList.toggle('is-paused', paused);
      minutes.textContent = unlocked ? 'Unlocked' : Drip.formatMinutes(left);
      leftToday.hidden = unlocked;
      pausedNote.hidden = !paused;
      // The button's insides are built once. After that, Stash fills or empties the bookmark (stash.js).
      if (savedShown !== String(saved)) {
        savedShown = String(saved);
        save.classList.toggle('is-saved', saved);
        save.setAttribute('aria-pressed', String(saved));
        if (stash) stash.to(saved);
        else {
          stash = DripStash.parts(saved, { outline: true });
          save.replaceChildren(...stash.nodes);
        }
      }
    }

    save.addEventListener('click', () => {
      if (sand.backlog.some((/** @type {any} */ v) => v.id === video.id)) Drip.removeBacklog(sand, video.id);
      else Drip.addBacklog(sand, video);
      update(lastPlaying);
    });
    update(false);
    return { el, update };
  }

  /**
   * The player with the pill. Returns the element and a stop function for its timer.
   * @param {{onEmpty?: () => void, autoplay?: boolean}} [opts]
   */
  function player(opts = {}) {
    const video = playing();
    let isPlaying = false;
    /** @type {ReturnType<typeof setInterval> | undefined} */
    let timer;
    const bar = h('span', {});
    const length = video.length.split(':').reduce((t, part) => t * 60 + Number(part), 0);
    let at = 0;
    const box = h('div', { class: 'tour-player' });
    const pill = makePill();
    let buttonShown = '';
    const draw = () => {
      bar.style.width = `${Math.min(100, (at / length) * 100)}%`;
      box.classList.toggle('is-playing', isPlaying);
      pill.update(isPlaying);
      if (buttonShown !== String(isPlaying)) {
        buttonShown = String(isPlaying);
        button.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
        button.replaceChildren(icon(isPlaying ? 'pause' : 'play-line'));
      }
    };
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
      isPlaying = false;
    };
    const tick = () => {
      const seconds = SPEED / 10;
      const unlocked = sand.unlocked.includes(video.id);
      Drip.charge(sand, unlocked ? seconds : Math.min(seconds, sand.watchSecondsLeft), video.id);
      at += seconds;
      if (!unlocked && sand.watchSecondsLeft <= 0) {
        stop();
        draw();
        opts.onEmpty?.();
        return;
      }
      draw();
    };
    const play = () => {
      // Watch at 0 minutes buys a drop's minutes first (Q18).
      Drip.buyIfOut(sand, video.id);
      if (sand.watchSecondsLeft <= 0 && !sand.unlocked.includes(video.id)) {
        opts.onEmpty?.();
        return;
      }
      isPlaying = true;
      timer = setInterval(tick, 100);
      draw();
    };
    const button = h('button', {
      type: 'button', class: 'tour-player-play',
      onclick: () => {
        if (isPlaying) {
          stop();
          draw();
          coach.did('pause');
        } else {
          play();
          if (isPlaying) coach.did('play');
        }
      },
    });
    box.append(button, h('div', { class: 'tour-player-bar', 'aria-hidden': 'true' }, bar), pill.el);
    draw();
    if (opts.autoplay) play();
    return { el: box, stop };
  }

  function showPlayer() {
    // Play pressed again in the pause before the lock buys more minutes, and then the lock doesn't come (Codex, 2026-10-11).
    const p = player({ onEmpty: () => lastDrop((x) => {
      dropX = x;
      go(at('lock'));
    }) });
    stage.append(p.el);
    return p.stop;
  }

  /** Where step 3's last drop landed, so step 4's lock rises from there. Read once. */
  /** @type {number | null} */
  let dropX = null;

  /**
   * At 0, the pill's last water falls to the bottom of the stage (pour.js), and then `raise` brings the lock up from
   * where it landed. Without motion it waits 700ms instead, and passes null. Play pressed in the meantime buys more
   * minutes, and then the lock doesn't come (Codex, 2026-10-11).
   * @param {(x: number | null) => void} raise
   */
  function lastDrop(raise) {
    const m = motion;
    const land = (/** @type {number | null} */ x) => {
      if (motion === m && sand.watchSecondsLeft <= 0) raise(x);
    };
    if (!animates() || !pillGlass?.isConnected) {
      later(() => land(null), 700);
      return;
    }
    DripPour.lastDrop(pillGlass, PILL_GLASS_PX, stage.getBoundingClientRect().bottom).then(land);
  }

  // Step 4: the lock, as watch.js draws it, inside the stage. Under it: the paused video, then whatever the way out
  // leads to.

  const BUBBLES = 8;

  function sea() {
    /** @param {number} min @param {number} max */
    const between = (min, max) => min + Math.random() * (max - min);
    const bubbles = Array.from({ length: BUBBLES }, () => {
      const bubble = h('span', { class: 'drip-bubble' }, h('span', {}));
      bubble.style.setProperty('--x', `${between(3, 97).toFixed(1)}%`);
      bubble.style.setProperty('--size', `${Math.round(between(4, 11))}px`);
      bubble.style.setProperty('--rise', `${between(8, 14).toFixed(1)}s`);
      bubble.style.setProperty('--delay', `${between(0.9, 8).toFixed(1)}s`);
      bubble.style.setProperty('--sway', `${between(2.4, 4.2).toFixed(1)}s`);
      return bubble;
    });
    return h('div', { class: 'drip-sea', 'aria-hidden': 'true' }, ...bubbles, h('span', { class: 'drip-fish drip-fish-a' }, h('span', {})));
  }

  /** @type {ReturnType<typeof setInterval> | undefined} */
  let ringTimer;

  /** @param {HTMLElement} button */
  function ring(button) {
    const panel = button.closest('.drip-lock-panel');
    if (!panel || !button.isConnected || button.classList.contains('is-leaving')) return stopRings();
    const p = panel.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    const r = h('span', { class: 'drip-done-ring', 'aria-hidden': 'true' });
    r.style.cssText = `left:${b.left - p.left}px;top:${b.top - p.top}px;width:${b.width}px;height:${b.height}px`;
    panel.append(r);
    r.addEventListener('animationend', () => r.remove());
  }

  /** @param {Event} e */
  function startRings(e) {
    const button = /** @type {HTMLElement} */ (e.currentTarget);
    if (ringTimer !== undefined || reducedMotion() || (e.type === 'focus' && !button.matches(':focus-visible'))) return;
    ring(button);
    ringTimer = setInterval(() => ring(button), 1400);
  }

  function stopRings() {
    clearInterval(ringTimer);
    ringTimer = undefined;
  }

  /** @param {HTMLElement} panel @param {HTMLElement} button @param {MouseEvent} e */
  function leaveRings(panel, button, e) {
    const p = panel.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    const x = (e.clientX || box.left + box.width / 2) - p.left;
    const y = (e.clientY || box.top + box.height / 2) - p.top;
    const far = Math.hypot(Math.max(x, p.width - x), Math.max(y, p.height - y)) * 2;
    /** @param {number} size @param {number} ms @param {number} delay @param {string} [cls] */
    const grow = (size, ms, delay, cls = 'drip-leave-ring') => {
      const r = h('span', { class: cls, 'aria-hidden': 'true' });
      r.style.cssText = `left:${x}px;top:${y}px`;
      panel.append(r);
      r.animate([{ width: '0px', height: '0px', opacity: 1 }, { width: `${size}px`, height: `${size}px`, opacity: 0 }],
        { duration: ms, delay, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)', fill: 'both' });
    };
    grow(110, 420, 0, 'drip-leave-ring is-splash');
    grow(far, 900, 0);
    grow(far, 900, 140);
  }

  /** "1h 15m watched today", plus last week's when the tour's log has it, which it never does. */
  function watchedLine() {
    const { today } = Drip.watchedSummary(sand);
    return `${Drip.formatMinutes(today)} watched today`;
  }

  function showLock() {
    // Arriving here by Next with minutes left, the minutes run out first, as they would have.
    sand.watchSecondsLeft = 0;
    let reasonOpen = false;
    let note = '';
    /** @type {{el: HTMLElement, stop: () => void} | null} */
    let under = null;

    /** @param {HTMLElement} el @param {{el: HTMLElement, stop: () => void} | null} [p] */
    const setUnder = (el, p = null) => {
      under?.stop();
      under = p;
      const old = stage.querySelector('.tour-under');
      const wrap = h('div', { class: 'tour-under' }, el);
      if (old) old.replaceWith(wrap);
      else stage.prepend(wrap);
    };

    const again = () => h('button', { type: 'button', class: 'tour-again', onclick: () => {
      sand.watchSecondsLeft = 0;
      sand.unlocked = [];
      raise();
      coach.did('lock');
    } }, 'Show the lock again');

    /**
     * The stage holds its height while the water moves, so nothing under it jumps mid-animation. Once the lock is gone,
     * this glides it back to its usual height if the reason form had made it taller (Jesse, 2026-10-12).
     * @param {HTMLElement} lock
     */
    const lift = (lock) => morph(() => {
      lock.remove();
      stage.style.minHeight = '';
    });

    /** Lifts the lock the way buying minutes or an unlock does, over a video that plays on. */
    const drain = () => {
      const lock = /** @type {HTMLElement} */ (stage.querySelector('#drip-lock'));
      stopRings();
      // The lock comes back on its own when the minutes run out, and its callouts start over with it.
      const p = player({ autoplay: true, onEmpty: () => lastDrop((x) => {
        raise(x);
        coach.did('lock');
      }) });
      setUnder(p.el, p);
      if (reducedMotion()) lift(lock);
      else {
        lock.classList.add('is-draining');
        later(() => lift(lock), 600);
      }
    };

    /** @param {MouseEvent} e */
    const done = (e) => {
      const lock = /** @type {HTMLElement} */ (stage.querySelector('#drip-lock'));
      const button = /** @type {HTMLElement} */ (e.currentTarget);
      const panel = /** @type {HTMLElement} */ (button.closest('.drip-lock-panel'));
      if (button.classList.contains('is-leaving')) return;
      button.classList.add('is-leaving');
      lock.classList.add('is-leaving');
      stopRings();
      stage.style.minHeight = `${stage.offsetHeight}px`;
      const kept = sand.tokens.watch;
      /** The kept drops land in the counter as on YouTube (counter.js), 250ms after the water starts falling. */
      const home = () => {
        const page = homePage(stats(kept), actions());
        setUnder(h('div', { id: 'drip-home', class: 'drip-ui' }, page));
        stage.append(again());
        const row = /** @type {HTMLElement} */ (page.querySelector('.drip-count'));
        const num = /** @type {HTMLElement} */ (row.querySelector('.drip-num'));
        let held = kept;
        const release = (/** @type {number} */ n, /** @type {any} */ roll = {}) => {
          held = Math.max(0, held - n);
          return DripCounter.to(num, Math.max(0, sand.tokens.watch - held), roll);
        };
        later(() => DripCounter.land({ kind: 'kept', drops: { row, icon: row.querySelector('.drip-i'), num, add: kept, release } }), reducedMotion() ? 0 : 250);
      };
      if (reducedMotion()) {
        home();
        lift(lock);
        coach.did('done');
        return;
      }
      leaveRings(panel, button, e);
      later(() => {
        home();
        coach.did('done');
        lock.classList.add('is-surfacing');
        later(() => lift(lock), 1000);
      }, 700);
    };

    const panel = () => {
      const s = sand.settings;
      const needLeft = Math.max(0, s.needThisPerDay - sand.unlocked.length);
      const canBuy = sand.tokens.watch > 0;
      /** @type {HTMLTextAreaElement} */
      const reason = /** @type {any} */ (h('textarea', { rows: 3, placeholder: 'Why do you need this one?', 'aria-label': 'Why do you need this one?' }));
      const unlock = () => {
        const res = Drip.needThis(sand, playing().id, playing().title, reason.value, Date.now());
        if (res.ok) {
          reasonOpen = false;
          note = '';
          drain();
          // An unlocked video never runs out, so the lock only comes back from here.
          stage.append(again());
          coach.did('unlock');
        } else {
          note = res.error === 'reason-required' ? 'Write a few words about why.' : "You've used all of today's unlocks.";
          redraw();
        }
      };
      const unlocks = needLeft > 0 && !reasonOpen
        ? h('button', { class: 'drip-lock-link', onclick: () => { reasonOpen = true; redraw(); stage.querySelector('textarea')?.focus(); } }, `I need this one · ${needLeft} left`)
        : needLeft > 0
          ? h('div', { class: 'drip-reason' }, reason,
            h('div', { class: 'drip-reason-row' },
              h('button', { class: 'drip-lock-link', onclick: () => { reasonOpen = false; note = ''; redraw(); } }, 'Cancel'),
              h('button', { class: 'drip-b drip-b-gray', onclick: unlock }, icon('unlock'), h('span', {}, 'Unlock this video'))))
          : h('div', { class: 'drip-lock-note' }, `The glass refills at ${hourLabel(s.resetHour)}.`);
      return h('div', { class: 'drip-lock-panel', role: 'group', 'aria-label': 'The lock' },
        h('h2', { class: 'drip-lock-title' }, canBuy ? 'Time for a breather.' : "You've had your fill."),
        h('div', { class: 'drip-lock-sub' }, watchedLine()),
        h('div', { class: `drip-lock-actions${canBuy ? '' : ' is-alone'}` },
          canBuy && h('button', {
            class: 'drip-b drip-b-gray drip-lock-add', onclick: (/** @type {Event} */ e) => addTime(/** @type {HTMLElement} */ (e.currentTarget)),
          }, icon('clock'), h('span', {}, `+${Drip.formatMinutes(s.minutesPerToken * 60)}`), price('drop')),
          h('button', {
            class: 'drip-b drip-b-primary drip-done', onclick: done,
            onpointerenter: startRings, onpointerleave: stopRings, onfocus: startRings, onblur: stopRings,
          }, h('span', {}, 'Done for now'))),
        note && h('div', { class: 'drip-lock-note', role: 'status' }, note),
        unlocks);
    };

    /**
     * The lock sits over the stage without adding to its height, so the stage grows to hold the panel, as when the
     * reason form opens, and the panel's buttons are never cut off (Codex, 2026-10-11).
     */
    const fitLock = () => {
      const lock = /** @type {HTMLElement | null} */ (stage.querySelector('#drip-lock'));
      const lockPanel = lock?.querySelector('.drip-lock-panel');
      if (!lock || !lockPanel) return;
      // The lock's own padding is 16px on each side.
      const need = Math.ceil(/** @type {HTMLElement} */ (lockPanel).offsetHeight + 32);
      morph(() => {
        stage.style.minHeight = `max(var(--tour-h), ${need}px)`;
        // The water travels the stage's height, so it rises and falls at the speed it does on YouTube.
        lock.style.setProperty('--tour-depth', `${stage.offsetHeight}px`);
      });
    };

    const redraw = () => {
      stage.querySelector('#drip-lock .drip-lock-panel')?.replaceWith(panel());
      fitLock();
    };

    let adding = false;
    /**
     * +15m on the lock, as on YouTube: the button's drop falls into the water, the water drains, and the pill's glass
     * bobs up (pour.js).
     * @param {HTMLElement} button
     */
    const addTime = (button) => {
      if (adding) return;
      Drip.spendWatch(sand);
      const lockPanel = button.closest('.drip-lock-panel');
      if (reducedMotion() || !lockPanel) {
        drain();
        coach.did('lockadd');
        return;
      }
      adding = true;
      const m = motion;
      const floor = Math.min(lockPanel.getBoundingClientRect().bottom + 36, stage.getBoundingClientRect().bottom - 12);
      DripPour.fallIn(button, floor).then(() => {
        adding = false;
        if (motion !== m) return;
        drain();
        if (pillGlass?.isConnected) DripPour.refill(pillGlass, PILL_GLASS_PX, DripGlass.fraction(sand), 180);
        coach.did('lockadd');
      });
    };

    /**
     * Raises the lock over the paused video, its water rising from where the pill's last drop landed when there was one.
     * @param {number | null} [x]
     */
    function raise(x = null) {
      morph(() => {
        stage.querySelector('.tour-again')?.remove();
        stage.querySelector('#drip-lock')?.remove();
        reasonOpen = false;
        note = '';
        const p = player();
        setUnder(p.el, p);
        const lockPanel = panel();
        lockPanel.classList.add('is-new');
        const lock = h('div', { id: 'drip-lock', class: 'drip-ui' }, sea(), lockPanel);
        stage.append(lock);
        fitLock();
        if (x !== null) DripPour.riseFrom(lock, x);
      });
    }

    raise(dropX);
    dropX = null;
    return () => {
      stopRings();
      under?.stop();
    };
  }

  // Step 5: what changes, as a table of YouTube's way against drip's. Jesse picked this layout from design variants on
  // 2026-10-12, over five sentences with an icon each. Each cell is one line at full width; the YouTube column truncates
  // rather than wraps, so keep its text short.

  /** The rows for the parts that are on (Q29). */
  function changes() {
    return [
      parts.cards === 'off'
        ? { icon: 'house', place: 'Home', youtube: 'A feed', drip: 'A search box', note: 'Subscriptions too.' }
        : { icon: 'house', place: 'Home', youtube: 'A feed', drip: 'Your drip page', note: 'Subscriptions too. Reveal from either.' },
      { icon: 'menu', place: 'Sidebar', youtube: 'Channels, Explore, more', drip: 'A short menu', note: hideBell ? 'Under the menu button. No bell.' : 'Under the menu button.' },
      { icon: 'play-line', place: 'Watch pages', youtube: 'Suggestions, autoplay', drip: 'Just the video', note: 'No end screen. Comments wait behind a button.' },
      { icon: 'smartphone', place: 'Shorts', youtube: 'The Shorts player', drip: 'Regular videos', note: parts.clock ? 'They use minutes like any other.' : 'No endless scroll.' },
      parts.searchCap && { icon: 'search', place: 'Search', youtube: 'One long list', drip: '10 results at a time', note: 'With a button for more.' },
    ].filter((c) => !!c);
  }

  function showChanges() {
    /** @param {string} name @param {string} text */
    const place = (name, text) => h('div', { class: 'tour-change-place' }, icon(name), h('span', {}, text));
    stage.append(h('div', { class: 'tour-changes' },
      h('div', { class: 'tour-change tour-changes-head', 'aria-hidden': 'true' }, h('span', {}), h('span', {}, 'YouTube'), h('span', {}, 'With drip')),
      h('ul', { class: 'tour-changes-list' }, ...changes().map((c) => h('li', { class: 'tour-change' },
        place(c.icon, c.place),
        // The column headings are hidden from screen readers, so each cell says which side it is.
        h('div', { class: 'tour-change-before', title: c.youtube }, h('span', { class: 'sr' }, 'On YouTube: '), c.youtube),
        h('div', { class: 'tour-change-after' }, h('span', { class: 'sr' }, 'With drip: '), c.drip, h('small', {}, c.note))))),
      h('div', { class: 'tour-change tour-changes-same' },
        place('check', 'The same'),
        h('p', {}, parts.clock ? "Your channels and playlists work as before. Ads and videos embedded on other sites don't use your minutes." : 'Your channels and playlists work as before.'))));
    return undefined;
  }

  drawLadder();
  retour(Math.max(0, hashStep()));
  showScreen();
  // A reopened page shows the mode that's saved. A new install has the defaults, which are Full drip.
  chrome.runtime.sendMessage({ type: 'get' }).then((/** @type {any} */ res) => {
    const saved = res && res.state && res.state.settings;
    if (!saved) return;
    const next = { searchCap: saved.searchCap, cards: saved.cards, clock: saved.clock, stash: saved.stash };
    const bell = saved.hideBell !== false;
    if (Drip.modeOf(next) === Drip.modeOf(parts) && Drip.modeOf(parts) && bell === hideBell) return;
    hideBell = bell;
    parts = next;
    modeBase = Drip.modeOf(next) || 'full';
    drawLadder();
    retour(Math.max(0, hashStep()));
  }, () => {});
})();
