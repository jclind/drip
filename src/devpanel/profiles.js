// @ts-check
// Sample data for Settings: whole states with regular and edge-case history, to check the form and the History card
// against. options.js loads this only while developer mode is on and shows a profile in place of the real state,
// without saving it. bin/build-release leaves it out of the store build with the rest of src/devpanel.

(() => {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;

  const TITLES = [
    'How Japanese Joinery Works',
    'Turning a Log into a $1500 Chess Board',
    'The Physics of Bike Suspension, Explained Slowly',
    'I Built a Workbench Using Only Hand Tools (and It Took Six Months, Here Is Everything That Went Wrong Along the Way)',
    'Lecture 14: Dynamic Programming',
    'Sourdough for Beginners',
  ];
  const REASONS = [
    'Research for the bench build',
    'Class tomorrow, need this lecture',
    'Promised Sam I would watch it',
    'Recipe for tonight',
    'A tutorial I need to follow along with step by step while I do it, so I need the whole thing',
  ];

  /** A small seeded random, so a profile looks the same every time. @param {number} seed */
  function random(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * A log day. Drops follow the minutes unless given.
   * @param {number} minutes
   * @param {Record<string, any>} [extra]
   */
  function entry(minutes, extra = {}) {
    return { watchedSec: Math.round(minutes * 60), watchSpent: Math.ceil(minutes / 15), recSpent: 0, saved: 0, passed: 0, watched: 0, needThis: [], ...extra };
  }

  /** @param {string} day @param {number} i */
  function use(day, i) {
    return { videoId: `sample${i}`, title: TITLES[i % TITLES.length], reason: REASONS[i % REASONS.length], at: Date.parse(`${day}T20:00:00`) + i * 60000 };
  }

  /**
   * Cards for a day that add up: saved, watched, and passed out of n.
   * @param {() => number} rand
   * @param {number} n
   */
  function cards(rand, n) {
    const saved = Math.floor(rand() * (n + 1));
    const watched = Math.floor(rand() * (n - saved + 1));
    return { recSpent: n, saved, watched, passed: n - saved - watched };
  }

  /** @param {number} now @param {Record<string, any>} [settings] */
  function start(now, settings = {}) {
    const state = Drip.initialState(now);
    // Installed long ago, so a loosening change waits for the reset. "Just installed" moves this up.
    state.installedAt = now - 90 * 86400000;
    Object.assign(state.settings, settings);
    state.tokens = { watch: state.settings.watchTokensPerDay, rec: state.settings.recTokensPerDay };
    return state;
  }

  /** @param {string} today */
  function weekday(today) {
    return new Date(`${today}T00:00:00Z`).getUTCDay();
  }

  const list = [
    {
      id: 'typical',
      name: 'Typical month',
      /** @param {number} now */
      build(now) {
        const state = start(now);
        const rand = random(1);
        for (let i = 30; i >= 0; i--) {
          const day = Drip.addDays(state.day, -i);
          const weekend = [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
          const minutes = i === 0 ? 23 : (weekend ? 50 : 15) + rand() * 60;
          state.log[day] = entry(minutes, { ...cards(rand, 2 + Math.floor(rand() * 6)), needThis: i % 6 === 2 ? [use(day, i)] : [] });
        }
        state.pending = { effectiveDay: Drip.addDays(state.day, 1), changes: { rolloverDays: 3 } };
        state.watchSecondsLeft = 22 * 60;
        state.watchSecondsBought = 45 * 60;
        return state;
      },
    },
    {
      id: 'new',
      name: 'Just installed',
      /** @param {number} now */
      build(now) {
        const state = start(now);
        state.installedAt = now - 2 * 3600000;
        // One card revealed and still showing, so nothing has ended: "1 card revealed."
        state.log[state.day] = entry(4, { watchSpent: 1, recSpent: 1 });
        return state;
      },
    },
    {
      id: 'heavy',
      name: 'Heavy, settings at max',
      /** @param {number} now */
      build(now) {
        const state = start(now, { watchTokensPerDay: 48, minutesPerToken: 120, recTokensPerDay: 100, rolloverDays: 7, needThisPerDay: 10, graceMode: true });
        const rand = random(2);
        for (let i = 89; i >= 0; i--) {
          const day = Drip.addDays(state.day, -i);
          // One 16-hour day this week stretches the scale to its top step.
          const minutes = i === 1 ? 16 * 60 : 180 + rand() * 480;
          state.log[day] = entry(minutes, { ...cards(rand, 100), needThis: [use(day, i), use(day, i + 1)] });
        }
        state.log[state.day].needThis = Array.from({ length: 10 }, (_, i) => use(state.day, i));
        // A change waits even at the top: a new reset hour always waits.
        state.pending = { effectiveDay: Drip.addDays(state.day, 1), changes: { resetHour: 6 } };
        return state;
      },
    },
    {
      id: 'strict',
      name: 'Strict, all changes waiting',
      /** @param {number} now */
      build(now) {
        const state = start(now, { watchTokensPerDay: 0, minutesPerToken: 1, recTokensPerDay: 0, rolloverDays: 1, needThisPerDay: 0, graceMode: false });
        // Nothing watched for days, then under a minute today.
        for (let i = 9; i >= 1; i--) state.log[Drip.addDays(state.day, -i)] = entry(0, { watchSpent: 0 });
        state.log[state.day] = entry(0.5, { watchSpent: 0 });
        state.pending = {
          effectiveDay: Drip.addDays(state.day, 1),
          changes: { watchTokensPerDay: 48, minutesPerToken: 120, recTokensPerDay: 100, rolloverDays: 7, resetHour: 23, graceMode: true, needThisPerDay: 10 },
        };
        return state;
      },
    },
    {
      id: 'edges',
      name: 'Gaps and edges',
      /** @param {number} now */
      build(now) {
        const state = start(now);
        const thisSunday = Drip.addDays(state.day, -weekday(state.day));
        // Installed on a Wednesday three weeks back: that week averages only Wednesday to Saturday, and ‹ stops there.
        for (let i = 3; i <= 6; i++) state.log[Drip.addDays(thisSunday, -21 + i)] = entry(30 * (i - 2), { recSpent: 1, passed: 1 });
        // Two weeks back: nothing at all, so last week compares against 0 and shows no change line.
        // Last week: exactly 1 hour every day.
        for (let i = 0; i < 7; i++) state.log[Drip.addDays(thisSunday, -7 + i)] = entry(60);
        // This week so far: exactly 1 hour a day too, so "Same as last week", and the bars touch a 1h scale.
        for (let day = thisSunday; day <= state.day; day = Drip.addDays(day, 1)) state.log[day] = entry(60);
        // Today: one card, saved, and one of two unlocks used.
        state.log[state.day] = entry(60, { recSpent: 1, saved: 1, needThis: [use(state.day, 3)] });
        return state;
      },
    },
  ];

  /** @param {string} id */
  function find(id) {
    return list.find((p) => p.id === id) || null;
  }

  /** @type {any} */ (globalThis).DripProfiles = { list, find };
})();
