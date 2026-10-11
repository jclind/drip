// @ts-check

/**
 * @typedef {Object} State
 * @property {number} version
 * @property {Settings} settings
 * @property {{effectiveDay: string, changes: Partial<Settings>} | null} pending
 * @property {string} day
 * @property {{watch: number, rec: number}} tokens
 * @property {number} watchSecondsLeft
 * @property {number} watchSecondsBought Minutes bought today, in seconds. The glass is full at this.
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
 * @property {number} watched
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
      watchSecondsLeft: 0, watchSecondsBought: 0, current: null, backlog: [], seen: [], unlocked: [], log: {},
    };
  }

  /** @returns {LogDay} */
  function emptyLog() {
    return { watchedSec: 0, watchSpent: 0, recSpent: 0, saved: 0, passed: 0, watched: 0, needThis: [] };
  }

  /**
   * A video record with string fields, or null when there's no usable id. Messages and storage both pass through this.
   * @param {unknown} raw
   * @returns {Video | null}
   */
  function cleanVideo(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const v = /** @type {Record<string, unknown>} */ (raw);
    if (typeof v.id !== 'string' || !/^[\w-]{1,64}$/.test(v.id)) return null;
    /** @param {unknown} x */
    const str = (x) => (typeof x === 'string' ? x : '');
    return { id: v.id, title: str(v.title), channel: str(v.channel), length: str(v.length) };
  }

  /** @param {unknown} n @param {number} fallback */
  function count(n, fallback) {
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  /** @param {unknown} raw @param {number} now @returns {State} */
  function hydrate(raw, now) {
    const state = initialState(now);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state;
    const stored = /** @type {Partial<State>} */ (raw);
    state.settings = { ...DEFAULT_SETTINGS, ...cleanSettings(stored.settings) };
    state.day = typeof stored.day === 'string' ? stored.day : dayKey(now, state.settings.resetHour);
    state.tokens = {
      watch: count(stored.tokens?.watch, state.settings.watchTokensPerDay),
      rec: count(stored.tokens?.rec, state.settings.recTokensPerDay),
    };
    state.watchSecondsLeft = count(stored.watchSecondsLeft, 0);
    // State saved before this field existed counts what's left as bought, so the glass shows full, not empty.
    state.watchSecondsBought = count(stored.watchSecondsBought, state.watchSecondsLeft);
    state.current = cleanVideo(stored.current);
    state.backlog = Array.isArray(stored.backlog) ? /** @type {Video[]} */ (stored.backlog.map(cleanVideo).filter(Boolean)) : [];
    state.seen = Array.isArray(stored.seen) ? stored.seen.filter(id => typeof id === 'string').slice(-2000) : [];
    state.unlocked = Array.isArray(stored.unlocked) ? stored.unlocked.filter(id => typeof id === 'string') : [];
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
    state.watchSecondsBought = 0;
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
    state.watchSecondsBought += state.settings.minutesPerToken * 60;
    logDay(state).watchSpent++;
    return { ok: true };
  }

  /** @param {State} state @param {unknown[]} candidates */
  function reveal(state, candidates) {
    if (state.current) return { ok: false, error: 'resolve-current' };
    if (state.tokens.rec <= 0) return { ok: false, error: 'no-rec-tokens' };
    const seen = new Set(state.seen);
    const saved = new Set(state.backlog.map(video => video.id));
    const video = candidates.map(cleanVideo).find(candidate => !!candidate && !seen.has(candidate.id) && !saved.has(candidate.id));
    if (!video) return { ok: false, error: 'pool-empty' };
    state.tokens.rec--;
    state.current = video;
    state.seen.push(video.id);
    if (state.seen.length > 2000) state.seen.splice(0, state.seen.length - 2000);
    logDay(state).recSpent++;
    return { ok: true, video };
  }

  /**
   * Buys one drop's minutes when none are left, so Watch can start the video (Q18). With no drops left it buys
   * nothing, and the watch page's lock takes over. An unlocked video needs no minutes.
   * @param {State} state
   * @param {string} videoId
   */
  function buyIfOut(state, videoId) {
    const bought = state.watchSecondsLeft <= 0 && !state.unlocked.includes(videoId) && spendWatch(state).ok;
    return { ok: true, bought };
  }

  /** @param {State} state */
  function currentIsSaved(state) {
    return !!state.current && state.backlog.some(video => video.id === state.current?.id);
  }

  /**
   * Ends the card. Each card counts once in the log by how it ended: Watch counts `watched`. Pass counts `passed`,
   * unless the card was saved first, since the video stays in Saved, and then it stays counted as `saved`.
   * @param {State} state
   * @param {'watch' | 'pass'} action
   */
  function endCard(state, action) {
    const day = logDay(state);
    const saved = currentIsSaved(state);
    if (action === 'watch') {
      if (saved) day.saved = Math.max(0, day.saved - 1);
      day.watched++;
    } else if (!saved) {
      day.passed++;
    }
    state.current = null;
  }

  /**
   * The reveal card's buttons (Q13). Save and unsave keep the card up. Watch and pass end it. Watch at 0 minutes buys
   * a drop's minutes first (Q18).
   * @param {State} state
   * @param {'watch' | 'save' | 'unsave' | 'pass'} action
   * @param {string} [videoId] The card the action was shown for. Another tab may have moved on since.
   */
  function resolveCurrent(state, action, videoId) {
    if (!state.current) return { ok: false, error: 'no-current' };
    if (!['watch', 'save', 'unsave', 'pass'].includes(action)) return { ok: false, error: 'bad-action' };
    if (videoId !== undefined && videoId !== state.current.id) return { ok: false, error: 'stale-card' };
    const video = state.current;
    // addBacklog and removeBacklog keep the card's saved count, whichever button moved it.
    if (action === 'save') {
      addBacklog(state, video);
      return { ok: true, video };
    }
    if (action === 'unsave') {
      removeBacklog(state, video.id);
      return { ok: true, video };
    }
    const bought = action === 'watch' && buyIfOut(state, video.id).bought;
    endCard(state, action);
    return action === 'watch' ? { ok: true, video, bought } : { ok: true, video };
  }

  /**
   * "Reveal next · -1 card": passes the card and reveals another in one step (Q13). Nothing changes on an error,
   * so a failed reveal leaves the card up.
   * @param {State} state
   * @param {string} videoId The card the button was on.
   * @param {unknown[]} candidates
   */
  function revealNext(state, videoId, candidates) {
    if (!state.current) return { ok: false, error: 'no-current' };
    if (videoId !== state.current.id) return { ok: false, error: 'stale-card' };
    if (state.tokens.rec <= 0) return { ok: false, error: 'no-rec-tokens' };
    const seen = new Set(state.seen);
    const saved = new Set(state.backlog.map(video => video.id));
    if (!candidates.map(cleanVideo).some(c => !!c && !seen.has(c.id) && !saved.has(c.id))) return { ok: false, error: 'pool-empty' };
    endCard(state, 'pass');
    return reveal(state, candidates);
  }

  /**
   * @param {State} state
   * @param {unknown} raw
   * @param {number} [index] Where to put it, for undoing a removal. New videos go at the end, the newest place.
   */
  function addBacklog(state, raw, index) {
    const video = cleanVideo(raw);
    if (!video) return { ok: false, error: 'bad-video' };
    if (state.backlog.some(saved => saved.id === video.id)) return { ok: true };
    const at = typeof index === 'number' && Number.isInteger(index) ? Math.min(Math.max(index, 0), state.backlog.length) : state.backlog.length;
    state.backlog.splice(at, 0, video);
    // The card showing now counts as saved while it's in the backlog, however it got there (Codex, 2026-10-10).
    if (state.current && state.current.id === video.id) logDay(state).saved++;
    return { ok: true };
  }

  /** @param {State} state @param {string} id */
  function removeBacklog(state, id) {
    if (state.current && state.current.id === id && currentIsSaved(state)) {
      const day = logDay(state);
      day.saved = Math.max(0, day.saved - 1);
    }
    state.backlog = state.backlog.filter(video => video.id !== id);
    return { ok: true };
  }

  /** @param {State} state @param {number} seconds @param {string} videoId */
  function charge(state, seconds, videoId) {
    logDay(state).watchedSec += seconds;
    if (!state.unlocked.includes(videoId)) state.watchSecondsLeft = Math.max(0, state.watchSecondsLeft - seconds);
    return watchStatus(state, videoId);
  }

  /**
   * Charges only paid playback not already covered by another tab.
   * @param {State} state
   * @param {{lastChargeEnd: number}} clock
   * @param {number} now
   * @param {number} seconds
   * @param {string} videoId
   * @param {number} [agoMs] How long before now the playback ended. A tab sends time it held back, for a video it
   *   already left, after newer playback, so the intervals mustn't be assumed to end now.
   */
  function chargeTick(state, clock, now, seconds, videoId, agoMs = 0) {
    const ago = Math.min(Math.max(Number(agoMs) || 0, 0), 3600000);
    now -= ago;
    seconds = Math.min(Math.max(Number(seconds) || 0, 0), 3600);
    if (seconds === 0) return watchStatus(state, videoId);
    if (state.unlocked.includes(videoId)) {
      logDay(state).watchedSec += seconds;
      return watchStatus(state, videoId);
    }
    // Held-back time that ended before the marker arrived late, after newer time. Charge it in full and leave the
    // marker where it is.
    if (ago > 0 && clock.lastChargeEnd > now) return charge(state, seconds, videoId);
    if (clock.lastChargeEnd > now) clock.lastChargeEnd = 0;
    const start = Math.max(clock.lastChargeEnd, now - seconds * 1000);
    clock.lastChargeEnd = Math.max(clock.lastChargeEnd, now);
    return charge(state, Math.max(0, (now - start) / 1000), videoId);
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
    // A lowered cap is a hard limit now, not at the next reset (Q6, Q11).
    const { watchTokensPerDay, recTokensPerDay, rolloverDays } = state.settings;
    state.tokens.watch = Math.min(state.tokens.watch, watchTokensPerDay * rolloverDays);
    state.tokens.rec = Math.min(state.tokens.rec, recTokensPerDay * rolloverDays);
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

  /**
   * Compact time like Screen Time: "1h 42m", "34m", "2h", "<1m", "0m" (Jesse, 2026-10-09).
   * @param {number} seconds
   */
  function formatMinutes(seconds) {
    if (!(seconds > 0)) return '0m';
    if (seconds < 60) return '<1m';
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (!hours) return `${minutes}m`;
    return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  }

  /**
   * Days the Settings log shows: today and the 7 before it, newest first (Q21).
   * @param {string} day
   */
  function logDays(day) {
    return Array.from({ length: 8 }, (_, i) => addDays(day, -i));
  }

  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /**
   * The lock screen's watched line: seconds watched today, and on the same weekday last week. `lastWeek` is null when
   * the log has no entry for that day, so the line can drop its second half.
   * @param {any} state
   * @returns {{today: number, lastWeek: number | null, weekday: string}}
   */
  function watchedSummary(state) {
    const today = state.log[state.day];
    const before = state.log[addDays(state.day, -7)];
    return {
      today: today ? today.watchedSec : 0,
      lastWeek: before ? before.watchedSec : null,
      weekday: WEEKDAYS[new Date(`${state.day}T00:00:00Z`).getUTCDay()],
    };
  }

  // Subscriptions, Explore, and its topic pages (Q16). The two channel ids are Shopping and Music, which YouTube links
  // as channels (checked on the MacBook 2026-10-06). Other channel pages stay.
  const FEEDS = /^\/(?:channel\/(?:UCkYQyvc_i9hXEo4xic9Hh2g|UC-9-kyTW8ZkZNDHQJ6FgpwQ)|feed\/(?:subscriptions|explore|trending|storefront|courses_destination|news_destination|music_destination)|gaming|shopping|podcasts|playables|hype|courses|learning|fashion|news|sports|music|live)\/?$/;

  /**
   * Where a top-level YouTube URL should go instead, or '' to leave it. Shorts and embeds become watch pages, so the
   * clock applies (Q2, Q7). Feeds go to the token page (Q16). The mobile site moves to the desktop site.
   * @param {string} href
   */
  function redirectTarget(href) {
    const url = new URL(href);
    if (url.hostname === 'm.youtube.com') {
      url.hostname = 'www.youtube.com';
      return url.href;
    }
    const embed = /^\/embed\/([^/]+)\/?$/.exec(url.pathname);
    if (embed && (url.hostname === 'www.youtube.com' || url.hostname === 'www.youtube-nocookie.com')) {
      const target = new URL('https://www.youtube.com/watch');
      target.searchParams.set('v', embed[1]);
      const start = (url.searchParams.get('t') || url.searchParams.get('start') || '').replace(/s$/, '');
      if (/^\d+$/.test(start)) target.searchParams.set('t', `${start}s`);
      return target.href;
    }
    if (url.hostname !== 'www.youtube.com') return '';
    if (/^\/tv(?:\/|$)/.test(url.pathname)) return 'https://www.youtube.com/';
    const short = /^\/shorts\/([^/]+)\/?$/.exec(url.pathname);
    if (short) return `https://www.youtube.com/watch?v=${encodeURIComponent(short[1])}`;
    if (FEEDS.test(url.pathname)) return 'https://www.youtube.com/';
    return '';
  }

  /**
   * Whether a watch page that's still loading must hold its video, read from raw storage before the worker answers.
   * Nothing is playing yet, so grace mode doesn't apply (Q3). A day that has rolled over counts as 0 minutes and no unlocks.
   * @param {unknown} raw
   * @param {number} now
   * @param {string} videoId
   */
  function earlyLocked(raw, now, videoId) {
    const stored = /** @type {Partial<State> | undefined} */ (raw && typeof raw === 'object' ? raw : undefined);
    if (!stored) return true;
    const resetHour = cleanSettings(stored.settings).resetHour ?? DEFAULT_SETTINGS.resetHour;
    if (typeof stored.day !== 'string' || stored.day < dayKey(now, resetHour)) return true;
    if (Array.isArray(stored.unlocked) && stored.unlocked.includes(videoId)) return false;
    return count(stored.watchSecondsLeft, 0) <= 0;
  }

  /**
   * The dev panel's actions, for testing in a checkout with dev/ENABLED. The worker refuses them anywhere else, and
   * bin/build-release leaves the panel out of the store build. Not a feature: nothing in DESIGN.md's rules applies.
   * @param {State} state
   * @param {string} action
   * @param {number} now
   */
  function devAction(state, action, now) {
    /** @param {'watch' | 'rec'} kind @param {number} n */
    const setTokens = (kind, n) => { state.tokens[kind] = Math.max(0, n); };
    switch (action) {
      case 'minutes-0': state.watchSecondsLeft = 0; break;
      case 'seconds-10': state.watchSecondsLeft = 10; break;
      case 'minutes-1': state.watchSecondsLeft = 60; break;
      case 'minutes+5': state.watchSecondsLeft += 5 * 60; break;
      case 'minutes+15': state.watchSecondsLeft += 15 * 60; break;
      case 'watch+1': setTokens('watch', state.tokens.watch + 1); break;
      case 'watch-0': setTokens('watch', 0); break;
      case 'rec+1': setTokens('rec', state.tokens.rec + 1); break;
      case 'rec-0': setTokens('rec', 0); break;
      case 'reset-now':
        // Moves drip back a day without rolling it over, so the next message rolls it over the way a real reset
        // does, and an open token page notices on its own 1-second check. A pending change moves back with it.
        state.day = addDays(state.day, -1);
        if (state.pending) state.pending.effectiveDay = addDays(state.pending.effectiveDay, -1);
        break;
      case 'apply-pending':
        if (state.pending) Object.assign(state.settings, state.pending.changes);
        state.pending = null;
        break;
      case 'grace-toggle':
        state.settings.graceMode = !state.settings.graceMode;
        cancelPending(state, 'graceMode');
        break;
      case 'clear-unlocks': state.unlocked = []; break;
      case 'clear-backlog': state.backlog = []; break;
      case 'clear-seen': state.seen = []; state.current = null; break;
      case 'clear-log': delete state.log[state.day]; break;
      case 'fresh': Object.assign(state, initialState(now)); break;
      default: return { ok: false, error: 'unknown-dev-action' };
    }
    return { ok: true };
  }

  /** @type {any} */ (globalThis).Drip = {
    DEFAULT_SETTINGS, dayKey, addDays, daysBetween, initialState, hydrate,
    rollDay, logDay, spendWatch, reveal, resolveCurrent, revealNext, buyIfOut, addBacklog,
    removeBacklog, charge, chargeTick, watchStatus, needThis, cleanSettings,
    isLoosening, updateSettings, cancelPending, formatMinutes, cleanVideo,
    logDays, watchedSummary, redirectTarget, earlyLocked, devAction,
  };
})();
