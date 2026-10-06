// @ts-check

/**
 * @typedef {Object} State
 * @property {number} version
 * @property {Settings} settings
 * @property {{effectiveDay: string, changes: Partial<Settings>} | null} pending
 * @property {string} day
 * @property {{watch: number, rec: number}} tokens
 * @property {number} watchSecondsLeft
 * @property {Video | null} current
 * @property {Video[]} backlog
 * @property {string[]} seen
 * @property {string[]} unlocked
 * @property {Object<string, LogDay>} log
 */
/**
 * @typedef {Object} Settings
 * @property {number} watchTokensPerDay
 * @property {number} minutesPerToken
 * @property {number} recTokensPerDay
 * @property {number} rolloverDays
 * @property {number} resetHour
 * @property {boolean} graceMode
 * @property {number} needThisPerDay
 * @property {'home' | 'subscriptions'} feedSource
 */
/**
 * @typedef {Object} Video
 * @property {string} id
 * @property {string} title
 * @property {string} channel
 * @property {string} length
 */
/**
 * @typedef {Object} LogDay
 * @property {number} watchedSec
 * @property {number} watchSpent
 * @property {number} recSpent
 * @property {number} saved
 * @property {number} passed
 * @property {{videoId: string, title: string, reason: string, at: number}[]} needThis
 */

(() => {
  /** @type {Readonly<Settings>} */
  const DEFAULT_SETTINGS = Object.freeze({
    watchTokensPerDay: 4,
    minutesPerToken: 15,
    recTokensPerDay: 10,
    rolloverDays: 2,
    resetHour: 4,
    graceMode: false,
    needThisPerDay: 2,
    feedSource: 'home',
  });
  /** @type {Object<string, [number, number]>} */
  const ranges = {
    watchTokensPerDay: [0, 48], minutesPerToken: [1, 120],
    recTokensPerDay: [0, 100], rolloverDays: [1, 7],
    resetHour: [0, 23], needThisPerDay: [0, 10],
  };

  /** @param {number} now @param {number} resetHour */
  function dayKey(now, resetHour) {
    const date = new Date(now);
    if (date.getHours() < resetHour) date.setDate(date.getDate() - 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  /** @param {string} day @param {number} n */
  function addDays(day, n) {
    const date = new Date(`${day}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + n);
    return date.toISOString().slice(0, 10);
  }

  /** @param {string} a @param {string} b */
  function daysBetween(a, b) {
    return (Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / 86400000;
  }

  /** @param {number} now @returns {State} */
  function initialState(now) {
    return {
      version: 1, settings: { ...DEFAULT_SETTINGS }, pending: null,
      day: dayKey(now, DEFAULT_SETTINGS.resetHour),
      tokens: { watch: DEFAULT_SETTINGS.watchTokensPerDay, rec: DEFAULT_SETTINGS.recTokensPerDay },
      watchSecondsLeft: 0, current: null, backlog: [], seen: [], unlocked: [], log: {},
    };
  }

  /** @returns {LogDay} */
  function emptyLog() {
    return { watchedSec: 0, watchSpent: 0, recSpent: 0, saved: 0, passed: 0, needThis: [] };
  }

  /** @param {unknown} raw @param {number} now @returns {State} */
  function hydrate(raw, now) {
    const state = initialState(now);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state;
    const stored = /** @type {Partial<State>} */ (raw);
    state.settings = { ...DEFAULT_SETTINGS, ...cleanSettings(stored.settings) };
    state.day = typeof stored.day === 'string' ? stored.day : dayKey(now, state.settings.resetHour);
    state.tokens = {
      watch: stored.tokens?.watch ?? state.settings.watchTokensPerDay,
      rec: stored.tokens?.rec ?? state.settings.recTokensPerDay,
    };
    state.watchSecondsLeft = stored.watchSecondsLeft ?? 0;
    state.current = stored.current ?? null;
    state.backlog = Array.isArray(stored.backlog) ? stored.backlog.map(video => ({ ...video })) : [];
    state.seen = Array.isArray(stored.seen) ? stored.seen.slice(-2000) : [];
    state.unlocked = Array.isArray(stored.unlocked) ? [...stored.unlocked] : [];
    if (state.current) state.current = { ...state.current };
    if (stored.pending && typeof stored.pending.effectiveDay === 'string') {
      const changes = cleanSettings(stored.pending.changes);
      if (Object.keys(changes).length) state.pending = { effectiveDay: stored.pending.effectiveDay, changes };
    }
    if (stored.log && typeof stored.log === 'object') {
      for (const [day, entry] of Object.entries(stored.log)) {
        state.log[day] = { ...emptyLog(), ...entry, needThis: Array.isArray(entry?.needThis) ? entry.needThis.map(use => ({ ...use })) : [] };
      }
    }
    return state;
  }

  /** @param {State} state @param {number} now */
  function rollDay(state, now) {
    const nextDay = dayKey(now, state.settings.resetHour);
    if (nextDay <= state.day) return false;
    const elapsed = daysBetween(state.day, nextDay);
    if (state.pending && state.pending.effectiveDay <= nextDay) {
      Object.assign(state.settings, state.pending.changes);
      state.pending = null;
    }
    const settings = state.settings;
    state.tokens.watch = Math.min(state.tokens.watch + settings.watchTokensPerDay * elapsed, settings.watchTokensPerDay * settings.rolloverDays);
    state.tokens.rec = Math.min(state.tokens.rec + settings.recTokensPerDay * elapsed, settings.recTokensPerDay * settings.rolloverDays);
    state.watchSecondsLeft = 0;
    state.unlocked = [];
    state.day = nextDay;
    const oldest = addDays(nextDay, -89);
    for (const day of Object.keys(state.log)) {
      if (day < oldest) delete state.log[day];
    }
    return true;
  }

  /** @param {State} state @returns {LogDay} */
  function logDay(state) {
    return state.log[state.day] ?? (state.log[state.day] = emptyLog());
  }

  /** @param {State} state */
  function spendWatch(state) {
    if (state.tokens.watch <= 0) return { ok: false, error: 'no-watch-tokens' };
    state.tokens.watch--;
    state.watchSecondsLeft += state.settings.minutesPerToken * 60;
    logDay(state).watchSpent++;
    return { ok: true };
  }

  /** @param {State} state @param {Video[]} candidates */
  function reveal(state, candidates) {
    if (state.current) return { ok: false, error: 'resolve-current' };
    if (state.tokens.rec <= 0) return { ok: false, error: 'no-rec-tokens' };
    const seen = new Set(state.seen);
    const saved = new Set(state.backlog.map(video => video.id));
    const video = candidates.find(candidate => !seen.has(candidate.id) && !saved.has(candidate.id));
    if (!video) return { ok: false, error: 'pool-empty' };
    state.tokens.rec--;
    state.current = video;
    state.seen.push(video.id);
    if (state.seen.length > 2000) state.seen.splice(0, state.seen.length - 2000);
    logDay(state).recSpent++;
    return { ok: true, video };
  }

  /** @param {State} state @param {'watch' | 'save' | 'pass'} action */
  function resolveCurrent(state, action) {
    if (!state.current) return { ok: false, error: 'no-current' };
    const video = state.current;
    if (action === 'save') {
      addBacklog(state, video);
      logDay(state).saved++;
    } else if (action === 'pass') {
      logDay(state).passed++;
    }
    state.current = null;
    return { ok: true, video };
  }

  /** @param {State} state @param {Video} video */
  function addBacklog(state, video) {
    if (!state.backlog.some(saved => saved.id === video.id)) state.backlog.push(video);
    return { ok: true };
  }

  /** @param {State} state @param {string} id */
  function removeBacklog(state, id) {
    state.backlog = state.backlog.filter(video => video.id !== id);
    return { ok: true };
  }

  /** @param {State} state @param {number} seconds @param {string} videoId */
  function charge(state, seconds, videoId) {
    logDay(state).watchedSec += seconds;
    if (!state.unlocked.includes(videoId)) state.watchSecondsLeft = Math.max(0, state.watchSecondsLeft - seconds);
    return watchStatus(state, videoId);
  }

  /** @param {State} state @param {string} videoId */
  function watchStatus(state, videoId) {
    const unlocked = state.unlocked.includes(videoId);
    return { secondsLeft: state.watchSecondsLeft, unlocked, locked: state.watchSecondsLeft === 0 && !unlocked };
  }

  /** @param {State} state @param {string} videoId @param {string} title @param {string} reason @param {number} now */
  function needThis(state, videoId, title, reason, now) {
    const trimmed = reason.trim();
    if (trimmed.length < 3) return { ok: false, error: 'reason-required' };
    if (state.unlocked.includes(videoId)) return { ok: true };
    if (state.unlocked.length >= state.settings.needThisPerDay) return { ok: false, error: 'need-this-limit' };
    state.unlocked.push(videoId);
    logDay(state).needThis.push({ videoId, title, reason: trimmed, at: now });
    return { ok: true };
  }

  /** @param {unknown} changes @returns {Partial<Settings>} */
  function cleanSettings(changes) {
    /** @type {Partial<Settings>} */
    const cleaned = {};
    if (!changes || typeof changes !== 'object') return cleaned;
    for (const [key, value] of Object.entries(changes)) {
      if (Object.prototype.hasOwnProperty.call(ranges, key)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        const [min, max] = ranges[key];
        Object.assign(cleaned, { [key]: Math.min(max, Math.max(min, Math.round(value))) });
      } else if (key === 'graceMode') {
        cleaned.graceMode = Boolean(value);
      } else if (key === 'feedSource' && (value === 'home' || value === 'subscriptions')) {
        cleaned.feedSource = value;
      }
    }
    return cleaned;
  }

  /** @param {keyof Settings} key @param {Settings[keyof Settings]} from @param {Settings[keyof Settings]} to */
  function isLoosening(key, from, to) {
    if (key === 'resetHour') return from !== to;
    if (key === 'feedSource') return false;
    if (key === 'graceMode') return from === false && to === true;
    return typeof from === 'number' && typeof to === 'number' && to > from;
  }

  /** @param {State} state @param {unknown} changes */
  function updateSettings(state, changes) {
    /** @type {Partial<Settings>} */
    const applied = {};
    /** @type {Partial<Settings>} */
    const pending = {};
    const cleaned = cleanSettings(changes);
    for (const key of /** @type {(keyof Settings)[]} */ (Object.keys(cleaned))) {
      const value = cleaned[key];
      if (value === state.settings[key]) {
        cancelPending(state, key);
      } else if (isLoosening(key, state.settings[key], /** @type {Settings[keyof Settings]} */ (value))) {
        if (!state.pending) state.pending = { effectiveDay: addDays(state.day, 1), changes: {} };
        state.pending.effectiveDay = addDays(state.day, 1);
        Object.assign(state.pending.changes, { [key]: value });
        Object.assign(pending, { [key]: value });
      } else {
        Object.assign(state.settings, { [key]: value });
        Object.assign(applied, { [key]: value });
        cancelPending(state, key);
      }
    }
    return { ok: true, applied, pending };
  }

  /** @param {State} state @param {string} key */
  function cancelPending(state, key) {
    if (state.pending) {
      delete state.pending.changes[/** @type {keyof Settings} */ (key)];
      if (!Object.keys(state.pending.changes).length) state.pending = null;
    }
    return { ok: true };
  }

  /** @param {number} seconds */
  function formatMinutes(seconds) {
    if (seconds <= 0) return '0 min';
    if (seconds < 60) return 'under 1 min';
    return `${Math.floor(seconds / 60)} min`;
  }

  globalThis.Drip = {
    DEFAULT_SETTINGS, dayKey, addDays, daysBetween, initialState, hydrate,
    rollDay, logDay, spendWatch, reveal, resolveCurrent, addBacklog,
    removeBacklog, charge, watchStatus, needThis, cleanSettings,
    isLoosening, updateSettings, cancelPending, formatMinutes,
  };
})();
