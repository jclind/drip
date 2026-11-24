// @ts-check

/**
 * @typedef {Object} State
 * @property {number} version
 * @property {number} rev Goes up by one on every save (background.js withState), so a page can tell an older reply from
 *   the state it already has (isOlder).
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
 * @property {Refill | null} refill What the last reset added, until a home page has shown it.
 * @property {number} drySeen The end of the Dry hours whose start enterDry handled, so it hands drops back once (Q32).
 * @property {number} boughtAt When the last drop's minutes were bought, so a Dry hours start no message saw still
 * hands them back. A change to Dry hours or Watch time that applies at once moves it to then, since hours before it
 * weren't dry under the new settings.
 * @property {number} dropsBought Drops whose minutes are in watchSecondsBought, so Dry hours hand the minutes back at
 * the price they were bought at, after minutes per drop changed (pre-publish bug hunt, 2026-11-05).
 * @property {{until: number, watch: number} | null} dryBack Drops handed back when Dry hours began, until a home page
 * has shown them.
 * @property {number} installedAt When drip was installed, in ms. Every settings change applies at once for a day after
 * (Q6). 0 for state saved before this was kept, which counts as installed long ago.
 * @property {{allow: Channel[], block: Channel[]}} channels The channel lists (RELEASE-PLAN.md item 4). Kept outside
 *   Settings, since a waiting change there replaces a whole value and would undo a list edit made after it.
 * @property {ChannelsPending | null} channelsPending List changes that loosen, waiting for the reset (Q6).
 * @property {boolean} firstDayOff Developer mode's "loosening waits, even in the first day": firstDayUntil reports no
 *   first day, so every loosening waits for the reset (Jesse, 2026-11-03). Test tooling, off by default.
 * @property {boolean} firstDayEnded The worker has seen the first 24 hours end. Clock rollback cannot reopen them (Q6).
 * @property {{id: string, ids: string[]}[]} allowedToday Videos a watch page showed are from an allowed channel, with
 *   that channel's ids. Free only while the channel is still allowed, and cleared at the reset.
 * @property {[string, number][]} ticksIn The last few tick keys, each with the seconds sent under it. A tab hears the
 *   saved state before the tick's reply, and this tells it which of its unsent seconds the balance already counts.
 */
/**
 * A YouTube channel as drip saw it. `ids` are its `@handle` in lowercase and, when a page showed one, its `UC...` id.
 * A home card shows only the name, so an entry may have no ids, and then it matches by name (CHANNEL-LISTS-PLAN.md).
 * @typedef {Object} Channel
 * @property {string[]} ids
 * @property {string} name
 * @property {string} [avatar] The picture a channel page showed, for Settings' lists. Only YouTube's image hosts.
 */
/**
 * @typedef {Object} ChannelsPending
 * @property {string} effectiveDay
 * @property {Channel[]} allow Channels to add to the allow list at the reset.
 * @property {Channel[]} unblock Channels to take off the block list at the reset.
 */
/**
 * @typedef {Object} Refill
 * @property {string} day The day the reset started.
 * @property {number} watch Drops it added.
 * @property {number} rec Cards it added.
 */
/**
 * @typedef {Object} Settings
 * @property {number} watchTokensPerDay
 * @property {number} minutesPerToken
 * @property {number} recTokensPerDay
 * @property {number} rolloverDays
 * @property {number} resetHour
 * @property {boolean} graceMode
 * @property {boolean} dryHours No watching on minutes from dryFrom up to dryTo, and drops stop selling (Q32).
 * @property {number} dryFrom The first dry hour, 0 to 23, local time.
 * @property {number} dryTo The first hour that isn't dry again.
 * @property {number} needThisPerWeek "I need this one" uses in any 7 × 24 hours (Q20).
 * @property {'home' | 'subscriptions'} feedSource
 * @property {number} stashMax The most videos the stash holds (Q28).
 * @property {boolean} searchCap Search stops at 10 results (Q15). A mode part (Q29).
 * @property {'off' | 'unlimited' | 'limited'} cards Reveal cards (Q13): none, free, or spending rec tokens. A mode part (Q29).
 * @property {boolean} clock The watch clock: drops, minutes, the pill, and the lock (Q3, Q10). A mode part (Q29).
 * @property {boolean} stash The stash and its buttons (Q14, Q28). A mode part (Q29).
 * @property {boolean} hideBell YouTube's notification bell is hidden. The same in every mode, so not a part (Q16).
 * @property {boolean} hideShorts The Shorts shelves and sidebar link are hidden. A Short opens as a regular video either
 *   way (Q2). The same in every mode, so not a part.
 * @property {boolean} streams A reveal may deal live streams and past streams (Q30). Not a mode part.
 */
/**
 * @typedef {Object} Video
 * @property {string} id
 * @property {string} title
 * @property {string} channel
 * @property {string} length
 * @property {string} [views] The view count, as the feed wrote it when it was read ("394K views"). It isn't updated after.
 * @property {string} [age] How old the video is, as the feed wrote it when it was read ("3d ago"). It isn't updated after.
 * @property {number} [resumeSec] How far in the video got, for the stash's progress bar and resuming there.
 * @property {number} [durationSec] The player's length in seconds, for the same bar.
 * @property {number} [addedAt] When it went into the stash, in ms, for the full stash's "6 days ago".
 * @property {string[]} [channelIds] The channel's ids, where the page that made the record had a channel link. Home
 *   cards don't (CHANNEL-LISTS-PLAN.md, step 1).
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
/**
 * The worker's clock for watching in several tabs. It lives outside State, in chrome.storage.session.
 * @typedef {Object} Clock
 * @property {number} lastChargeEnd End of the last stretch of watching charged, in ms.
 * @property {[string, number][]} [ticks] Recent tick keys and the seconds charged under each.
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
    dryHours: false,
    dryFrom: 23,
    dryTo: 6,
    needThisPerWeek: 3,
    feedSource: 'home',
    stashMax: 10,
    searchCap: true,
    cards: 'limited',
    clock: true,
    stash: true,
    hideBell: true,
    hideShorts: true,
    streams: false,
  });
  /**
   * The three modes (Q29). Each is a set of parts, and a mix that matches none of them is a custom mode. The defaults
   * are Full drip, so installs from before modes keep what they had.
   * @type {Readonly<Record<'quiet' | 'curated' | 'full', Readonly<Pick<Settings, 'searchCap' | 'cards' | 'clock' | 'stash'>>>>}
   */
  const MODES = Object.freeze({
    quiet: Object.freeze({ searchCap: false, cards: /** @type {const} */ ('off'), clock: false, stash: false }),
    curated: Object.freeze({ searchCap: true, cards: /** @type {const} */ ('unlimited'), clock: false, stash: true }),
    full: Object.freeze({ searchCap: true, cards: /** @type {const} */ ('limited'), clock: true, stash: true }),
  });
  /** How much drip each cards setting is, for Q6: lower is looser. */
  const CARDS_RANK = { off: 0, unlimited: 1, limited: 2 };
  /** @type {Object<string, [number, number]>} */
  const ranges = {
    watchTokensPerDay: [0, 48], minutesPerToken: [1, 120],
    recTokensPerDay: [0, 100], rolloverDays: [1, 7],
    resetHour: [0, 23], needThisPerWeek: [0, 20], stashMax: [1, 50], dryFrom: [0, 23], dryTo: [0, 23],
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
      version: 1, rev: 0, settings: { ...DEFAULT_SETTINGS }, pending: null,
      day: dayKey(now, DEFAULT_SETTINGS.resetHour),
      tokens: { watch: DEFAULT_SETTINGS.watchTokensPerDay, rec: DEFAULT_SETTINGS.recTokensPerDay },
      watchSecondsLeft: 0, watchSecondsBought: 0, current: null, backlog: [], seen: [], unlocked: [], log: {},
      refill: null, drySeen: 0, boughtAt: 0, dropsBought: 0, dryBack: null, installedAt: now, channels: { allow: [], block: [] }, channelsPending: null, allowedToday: [],
      firstDayOff: false, firstDayEnded: false, ticksIn: [],
    };
  }

  /** @returns {LogDay} */
  function emptyLog() {
    return { watchedSec: 0, watchSpent: 0, recSpent: 0, saved: 0, passed: 0, watched: 0, needThis: [] };
  }

  // Text from a page or a person goes into state, which every save and every state message carries whole, and
  // chrome.storage.local holds 10 MB. So each piece has a cap, and the rules apply it where the text comes in.

  /**
   * The longest a title, channel name, or feed label may be. YouTube stops titles at 100 characters, so 200 cuts only
   * what didn't come from YouTube. Channel lists use the same cap.
   */
  const TEXT_MAX = 200;
  /**
   * The longest an "I need this one" reason may be: a few sentences, which the Settings list shows in full. The lock's
   * textarea has this as its maxlength, so the person sees the limit and nothing typed is cut.
   */
  const REASON_MAX = 300;
  /** The most "I need this one" uses one log day keeps: the highest weekly allowance Settings offers. */
  const USES_MAX = ranges.needThisPerWeek[1];
  /**
   * The most uses an import leaves in the whole log: the highest weekly allowance for each of the 13 weeks in the 90
   * days the log keeps. Chrome counts some characters as six bytes, so 20 uses on each of 89 days could fill half of
   * storage from a file of 1 MB.
   */
  const LOG_USES_MAX = USES_MAX * 13;

  /**
   * Text on one line, at most `max` characters: runs of whitespace become one space, and the ends are trimmed. A cut
   * never splits a character in two, like an emoji. '' for anything that isn't a string.
   * @param {unknown} x @param {number} max
   */
  function line(x, max) {
    if (typeof x !== 'string') return '';
    let text = x.replace(/\s+/g, ' ').trim();
    if (text.length > max) text = text.slice(0, /[\uD800-\uDBFF]/.test(text[max - 1]) ? max - 1 : max).trimEnd();
    return text;
  }

  /**
   * A copy of a stored "I need this one" use with its video id, title, and reason cut to their caps. Other fields stay.
   * @param {any} use
   */
  function capUse(use) {
    if (!use || typeof use !== 'object') return use;
    const out = { ...use };
    if (typeof out.videoId === 'string') out.videoId = out.videoId.slice(0, 64);
    if (typeof out.title === 'string') out.title = line(out.title, TEXT_MAX);
    if (typeof out.reason === 'string') out.reason = line(out.reason, REASON_MAX);
    return out;
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
    const str = (x) => line(x, TEXT_MAX);
    const length = str(v.length);
    // A length written as a time has to be one: an imported "9:99:99" added 10 hours to the stash's total. Text like
    // "LIVE" stays.
    /** @type {Video} */
    const video = { id: v.id, title: str(v.title), channel: str(v.channel), length: /^[\d:]+$/.test(length) && !/^\d+(:[0-5]\d){1,2}$/.test(length) ? '' : length };
    if (str(v.views)) video.views = str(v.views);
    if (str(v.age)) video.age = str(v.age);
    const duration = videoSec(v.durationSec);
    const resume = videoSec(v.resumeSec);
    if (duration) video.durationSec = duration;
    if (resume) video.resumeSec = duration ? Math.min(resume, duration) : resume;
    if (seconds(v.addedAt) && seconds(v.addedAt) <= TIME_MAX) video.addedAt = seconds(v.addedAt);
    const ids = cleanIds(v.channelIds);
    if (ids.length) video.channelIds = ids;
    return video;
  }

  /** Whole seconds, or 0 for anything that isn't a positive finite number. @param {unknown} n */
  function seconds(n) {
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }

  /**
   * The longest a stashed video's length or position may be, in seconds. YouTube keeps at most 12 hours of a video or
   * a stream, so a week cuts only made-up numbers, like the 1e16 a tester's import put in the stash.
   */
  const VIDEO_SEC_MAX = 7 * 24 * 3600;
  /** The latest time a Date can hold, in ms. A later stash time printed "NaN months ago". */
  const TIME_MAX = 8.64e15;
  /** The longest a day can be, in seconds: a later reset hour can make one 47 hours long (Q12). */
  const DAY_SEC_MAX = 47 * 3600;

  /** Whole seconds a video can have, or 0. @param {unknown} n */
  function videoSec(n) {
    return seconds(n) <= VIDEO_SEC_MAX ? seconds(n) : 0;
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
    state.rev = count(stored.rev, 0);
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
    const refill = /** @type {Partial<Refill> | null | undefined} */ (stored.refill);
    if (refill && typeof refill.day === 'string') state.refill = { day: refill.day, watch: count(refill.watch, 0), rec: count(refill.rec, 0) };
    state.drySeen = count(stored.drySeen, 0);
    state.boughtAt = count(stored.boughtAt, 0);
    // State from before this field counts its bought minutes as whole drops at today's price (never more than paid for),
    // so a drop bought after the update doesn't make them all one drop (Codex, PR 69).
    state.dropsBought = stored.dropsBought === undefined
      ? Math.floor(state.watchSecondsBought / Math.max(1, state.settings.minutesPerToken * 60))
      : count(stored.dropsBought, 0);
    const back = /** @type {any} */ (stored.dryBack);
    if (back && count(back.until, 0) > 0 && count(back.watch, 0) > 0) state.dryBack = { until: back.until, watch: back.watch };
    state.installedAt = count(stored.installedAt, 0);
    state.firstDayOff = stored.firstDayOff === true;
    state.firstDayEnded = stored.firstDayEnded === true;
    state.ticksIn = cleanTicks(stored.ticksIn).slice(-TICKS_IN);
    const lists = /** @type {any} */ (stored.channels);
    state.channels = { allow: cleanChannels(lists?.allow).filter((c) => c.ids.length), block: cleanChannels(lists?.block) };
    const waiting = /** @type {any} */ (stored.channelsPending);
    if (waiting && typeof waiting.effectiveDay === 'string') {
      const pending = { effectiveDay: waiting.effectiveDay, allow: cleanChannels(waiting.allow).filter((c) => c.ids.length), unblock: cleanChannels(waiting.unblock) };
      if (pending.allow.length || pending.unblock.length) state.channelsPending = pending;
    }
    state.allowedToday = Array.isArray(stored.allowedToday) ? stored.allowedToday
      .filter((e) => e && typeof e.id === 'string' && VIDEO_ID.test(e.id))
      .map((e) => ({ id: e.id, ids: cleanIds(e.ids) })).filter((e) => e.ids.length).slice(-ALLOWED_TODAY_MAX) : [];
    if (stored.log && typeof stored.log === 'object') {
      for (const [day, entry] of Object.entries(stored.log)) {
        // Old uses keep their shape, but a reason or title stored before the caps is cut down to them here, and the
        // next save stores it that way.
        state.log[day] = { ...emptyLog(), ...entry, needThis: Array.isArray(entry?.needThis) ? entry.needThis.map(capUse).slice(-USES_MAX) : [] };
      }
    }
    return state;
  }

  /**
   * The most drops and cards a balance can hold: a day's worth times the days unspent ones are kept.
   * @param {Settings} settings @returns {{watch: number, rec: number}}
   */
  function caps(settings) {
    return { watch: settings.watchTokensPerDay * settings.rolloverDays, rec: settings.recTokensPerDay * settings.rolloverDays };
  }

  /** The local time a day's hour starts. @param {string} day @param {number} hour */
  function atHour(day, hour) {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d, hour).getTime();
  }

  const RESET_GAP_MS = 12 * 3600 * 1000;

  /**
   * After the reset hour changes from `oldHour`, the next reset is the first one at the new hour at least 12 hours
   * after the last (Q12, Jesse, 2026-11-05). Before, 11pm to midnight refilled at 11pm and again at midnight. A later
   * hour can make one long day instead, since a day is named for the date it starts and the name never goes back.
   * `state.day` is the day that began at `oldHour`.
   * @param {State} state @param {number} oldHour
   */
  function settleResetHour(state, oldHour) {
    const hour = state.settings.resetHour;
    if (hour === oldHour) return;
    const start = atHour(state.day, oldHour);
    let next = atHour(state.day, hour);
    if (next <= start) next = atHour(addDays(state.day, 1), hour);
    // A reset on the same date as this day starts this day's name again, so it isn't a reset.
    if (dayKey(next, hour) <= state.day) next = atHour(addDays(state.day, 1), hour);
    if (next - start < RESET_GAP_MS) state.day = dayKey(next, hour);
  }

  /** @param {State} state @param {number} now */
  function rollDay(state, now) {
    // Every worker message runs this, even when the day stays the same. Persist expiry before a clock rollback (Q6).
    if (state.installedAt > 0 && now >= state.installedAt + FIRST_DAY_MS) state.firstDayEnded = true;
    const oldHour = state.settings.resetHour;
    const nextDay = dayKey(now, oldHour);
    if (nextDay <= state.day) return false;
    const elapsed = daysBetween(state.day, nextDay);
    if (state.pending && state.pending.effectiveDay <= nextDay) {
      Object.assign(state.settings, state.pending.changes);
      state.pending = null;
    }
    if (state.channelsPending && state.channelsPending.effectiveDay <= nextDay) applyChannelsPending(state);
    const settings = state.settings;
    const before = { ...state.tokens };
    const cap = caps(settings);
    state.tokens.watch = Math.min(state.tokens.watch + settings.watchTokensPerDay * elapsed, cap.watch);
    state.tokens.rec = Math.min(state.tokens.rec + settings.recTokensPerDay * elapsed, cap.rec);
    // The home page shows what came in once, as drops falling into the counter (home.js), then sends refillSeen.
    const added = { watch: Math.max(0, state.tokens.watch - before.watch), rec: Math.max(0, state.tokens.rec - before.rec) };
    state.refill = added.watch || added.rec ? { day: nextDay, ...added } : null;
    state.watchSecondsLeft = 0;
    state.watchSecondsBought = 0;
    state.dropsBought = 0;
    state.unlocked = [];
    state.allowedToday = [];
    state.day = nextDay;
    settleResetHour(state, oldHour);
    // A moved reset hour can rename the day; the home page shows a refill only under the day's own name (Codex, PR 69).
    if (state.refill) state.refill.day = state.day;
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

  /**
   * Buys a drop's minutes. In Dry hours there are no new drops (Q32), and `until` says when they end. In the 5 minutes
   * before, there are none either, since the minutes would stop at the start: `at` says when that is.
   * @param {State} state @param {number} [now] Without it, Dry hours don't count.
   * @returns {{ok: true} | {ok: false, error: string, until?: number, at?: number}}
   */
  function spendWatch(state, now) {
    if (!state.settings.clock) return { ok: false, error: 'clock-off' };
    const until = now === undefined ? 0 : dryUntil(state, now);
    if (until) return { ok: false, error: 'dry-hours', until };
    const at = now === undefined ? 0 : drySoon(state, now);
    if (at) return { ok: false, error: 'dry-soon', at };
    if (state.tokens.watch <= 0) return { ok: false, error: 'no-watch-tokens' };
    if (now !== undefined) state.boughtAt = now;
    state.tokens.watch--;
    state.watchSecondsLeft += state.settings.minutesPerToken * 60;
    state.watchSecondsBought += state.settings.minutesPerToken * 60;
    state.dropsBought++;
    logDay(state).watchSpent++;
    return { ok: true };
  }

  /**
   * Reveals one video (Q13). It costs a card only with `cards: 'limited'`, and with cards off there are no reveals (Q29).
   * It skips what mayReveal rules out (Q30).
   * @param {State} state @param {unknown[]} candidates
   */
  function reveal(state, candidates) {
    if (state.current) return { ok: false, error: 'resolve-current' };
    if (state.settings.cards === 'off') return { ok: false, error: 'cards-off' };
    const paid = state.settings.cards === 'limited';
    if (paid && state.tokens.rec <= 0) return { ok: false, error: 'no-rec-tokens' };
    const pick = candidates.find(candidate => canDeal(state, candidate));
    const video = pick ? cleanVideo(pick) : null;
    if (!video) return { ok: false, error: 'pool-empty' };
    if (paid) state.tokens.rec--;
    state.current = video;
    state.seen.push(video.id);
    if (state.seen.length > 2000) state.seen.splice(0, state.seen.length - 2000);
    // With unlimited cards nothing is spent, but the reveal still counts, so History's cards line adds up.
    logDay(state).recSpent++;
    return { ok: true, video };
  }

  /**
   * Whether a reveal may deal a video of this kind (Q30). An upcoming video can't be watched yet and a members-only one
   * needs a paid membership, so neither ever is. Live and past streams are dealt only with the "streams" setting on. A
   * video with no kind is a normal one.
   * @param {unknown} candidate As home.js read it from the grid, with `kind`.
   * @param {Settings} settings
   */
  function mayReveal(candidate, settings) {
    const kind = candidate && typeof candidate === 'object' ? /** @type {{kind?: unknown}} */ (candidate).kind : undefined;
    if (kind === 'upcoming' || kind === 'members') return false;
    if (kind === 'live' || kind === 'streamed') return settings.streams === true;
    return true;
  }

  /**
   * Whether a reveal could deal this candidate now. It has to be a video, a kind mayReveal allows, not revealed before,
   * and not in the stash. The home page asks the same thing to know when to stop looking.
   * @param {State} state @param {unknown} candidate
   */
  function canDeal(state, candidate) {
    const video = cleanVideo(candidate);
    return !!video && mayReveal(candidate, state.settings) && !state.seen.includes(video.id)
      && !state.backlog.some(saved => saved.id === video.id) && !isBlocked(state, video);
  }

  /**
   * Buys one drop's minutes when none are left, so Watch can start the video (Q18). With no drops left it buys
   * nothing, and the watch page's lock takes over. An unlocked video needs no minutes, and neither does a card or stash
   * row from an allowed channel (CHANNEL-LISTS-PLAN.md, call 10). In Dry hours, and the 5 minutes before, it passes on
   * spendWatch's refusal (Q32).
   * @param {State} state
   * @param {string} videoId
   * @param {number} [now]
   */
  function buyIfOut(state, videoId, now) {
    if (!state.settings.clock || state.watchSecondsLeft > 0 || freeToStart(state, videoId)) return { ok: true, bought: false };
    const spent = spendWatch(state, now);
    if (!spent.ok && (spent.error === 'dry-hours' || spent.error === 'dry-soon')) return spent;
    return { ok: true, bought: spent.ok };
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
   * @param {'watch' | 'save' | 'unsave' | 'pass' | 'block'} action
   * @param {string} [videoId] The card the action was shown for. Another tab may have moved on since.
   * @param {number} [now] When, for a save's addedAt.
   */
  function resolveCurrent(state, action, videoId, now) {
    if (!state.current) return { ok: false, error: 'no-current' };
    if (!['watch', 'save', 'unsave', 'pass', 'block'].includes(action)) return { ok: false, error: 'bad-action' };
    if (videoId !== undefined && videoId !== state.current.id) return { ok: false, error: 'stale-card' };
    const video = state.current;
    // addBacklog and removeBacklog keep the card's saved count, whichever button moved it.
    if (action === 'save') {
      const added = addBacklog(state, video, undefined, now);
      return added.ok ? { ok: true, video } : added;
    }
    if (action === 'unsave') {
      removeBacklog(state, video.id);
      return { ok: true, video };
    }
    // Block ends the card as Pass does, with no card back, or it would be a free re-deal (CHANNEL-LISTS-PLAN.md, call 11).
    if (action === 'block') {
      const blocked = blockChannel(state, { ids: video.channelIds || [], name: video.channel });
      if (!blocked.ok) return blocked;
      endCard(state, 'pass');
      return { ok: true, video };
    }
    // A refusal in Dry hours still opens the video, and its lock says when they end (DRY-HOURS-PLAN.md B6).
    const bought = action === 'watch' && buyIfOut(state, video.id, now).bought === true;
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
    if (state.settings.cards === 'off') return { ok: false, error: 'cards-off' };
    if (state.settings.cards === 'limited' && state.tokens.rec <= 0) return { ok: false, error: 'no-rec-tokens' };
    if (!candidates.some(candidate => canDeal(state, candidate))) return { ok: false, error: 'pool-empty' };
    endCard(state, 'pass');
    return reveal(state, candidates);
  }

  /**
   * A full stash refuses a new video with 'stash-full' (Q28). Undo, which passes an index, always puts the row back,
   * even when a lowered cap leaves the stash over it.
   * @param {State} state
   * @param {unknown} raw
   * @param {number} [index] Where to put it, for undoing a removal. New videos go at the end, the newest place.
   * @param {number} [now] When, kept as addedAt. A video put back by Undo keeps the addedAt it came with.
   */
  function addBacklog(state, raw, index, now) {
    const video = cleanVideo(raw);
    if (!video) return { ok: false, error: 'bad-video' };
    if (state.backlog.some(saved => saved.id === video.id)) return { ok: true };
    const undo = typeof index === 'number' && Number.isInteger(index);
    if (!undo && !state.settings.stash) return { ok: false, error: 'stash-off' };
    if (!undo && state.backlog.length >= state.settings.stashMax) return { ok: false, error: 'stash-full' };
    // Undo can go over the cap, but not past the highest cap Settings allows, so a made-up index can't grow the
    // stash forever (Codex, 2026-10-13).
    if (undo && state.backlog.length >= ranges.stashMax[1]) return { ok: false, error: 'stash-full' };
    // Undo puts back the video as it was, so one stashed before addedAt existed stays undated.
    if (!undo && !video.addedAt && seconds(now)) video.addedAt = seconds(now);
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

  /**
   * The edits made to a draft since a snapshot of it, so a save's reply can keep what changed while it was out (Codex,
   * 2026-11-05).
   * @param {Record<string, unknown>} before @param {Record<string, unknown>} now
   * @returns {Record<string, unknown>}
   */
  function editsSince(before, now) {
    return Object.fromEntries(Object.keys(now).filter((k) => now[k] !== before[k]).map((k) => [k, now[k]]));
  }

  /**
   * What an open full-stash list does when the stash changes under it, say in another tab: 'close' when the video it
   * was for got stashed, the stash has room now, or the stash is off; 'redraw' when its videos changed; else 'keep'
   * (Codex, 2026-11-05).
   * @param {string[]} shownIds The stashed videos the list shows, in order.
   * @param {State} state
   * @param {string} videoId The video the list is for.
   * @returns {'close' | 'redraw' | 'keep'}
   */
  function swapFollow(shownIds, state, videoId) {
    if (state.settings.stash === false || state.backlog.some((v) => v.id === videoId)) return 'close';
    if (state.backlog.length < state.settings.stashMax) return 'close';
    return shownIds.join('\n') === state.backlog.map((v) => v.id).join('\n') ? 'keep' : 'redraw';
  }

  /**
   * Swaps a stashed video out for a new one in one step, for a full stash (Q28). The new one goes at the end, the
   * newest place, or at `index`, which is how Undo puts the swapped-out one back. A swap never grows the stash, so it
   * works over a lowered cap too. Undo still puts the video back when `dropId` has already left the stash, finished or
   * taken out within Undo's few seconds, so the swapped-out video is never lost, and still takes `dropId` out when the
   * video is already back, stashed again in another tab (Codex, 2026-10-13). Returns the video it took out as
   * `dropped`, as it was then, so Undo puts back the latest progress, not a copy from when the list opened. A swap
   * whose new video another tab already stashed takes nothing out and returns no `dropped`, so pages offer Undo
   * only when there's a `dropped`.
   * @param {State} state
   * @param {unknown} raw
   * @param {string} dropId
   * @param {number} [index]
   * @param {number} [now]
   */
  function swapBacklog(state, raw, dropId, index, now) {
    const video = cleanVideo(raw);
    if (!video) return { ok: false, error: 'bad-video' };
    const undo = typeof index === 'number' && Number.isInteger(index);
    if (!undo && !state.settings.stash) return { ok: false, error: 'stash-off' };
    const drop = state.backlog.findIndex(saved => saved.id === dropId);
    const dropped = drop >= 0 ? { ...state.backlog[drop] } : null;
    if (state.backlog.some(saved => saved.id === video.id)) {
      // Already stashed in another tab, so nothing was swapped and there's nothing for Undo to put back.
      if (!undo) return { ok: true };
      if (drop >= 0) removeBacklog(state, dropId);
      return { ok: true, dropped };
    }
    if (drop < 0 && !undo) return { ok: false, error: 'not-stashed' };
    if (drop >= 0) removeBacklog(state, dropId);
    if (!undo && !video.addedAt && seconds(now)) video.addedAt = seconds(now);
    const added = addBacklog(state, video, undo ? index : state.backlog.length);
    return added.ok ? { ...added, dropped } : added;
  }

  /**
   * Records how far into a stashed video playback got, for the stash's bar and for resuming there. Videos that
   * aren't stashed keep nothing.
   * @param {State} state
   * @param {string} videoId
   * @param {unknown} position
   * @param {unknown} duration
   */
  function markProgress(state, videoId, position, duration) {
    const video = state.backlog.find(saved => saved.id === videoId);
    if (!video || !seconds(position)) return { ok: true };
    if (seconds(duration)) video.durationSec = seconds(duration);
    video.resumeSec = video.durationSec ? Math.min(seconds(position), video.durationSec) : seconds(position);
    return { ok: true };
  }

  /** @param {State} state @param {number} seconds @param {string} videoId */
  function charge(state, seconds, videoId) {
    logDay(state).watchedSec += seconds;
    if (!isFree(state, videoId)) state.watchSecondsLeft = Math.max(0, state.watchSecondsLeft - seconds);
    return watchStatus(state, videoId);
  }

  /** How many recent tick keys the clock remembers, to spot a resent tick. */
  const TICK_KEYS = 20;
  /** How many tick keys the saved state keeps for the pages. Each tab has at most a couple of ticks out at once. */
  const TICKS_IN = 8;

  /** Well-formed [key, seconds] pairs. @param {unknown} raw @returns {[string, number][]} */
  function cleanTicks(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter((t) => Array.isArray(t) && typeof t[0] === 'string' && t[0] && typeof t[1] === 'number' && Number.isFinite(t[1]) && t[1] >= 0)
      .map((t) => /** @type {[string, number]} */ ([t[0], t[1]]));
  }

  /**
   * Charges only paid playback not already covered by another tab.
   * @param {State} state
   * @param {Clock} clock
   * @param {number} now
   * @param {number} seconds
   * @param {string} videoId
   * @param {number} [agoMs] How long before now the playback ended. A tab sends time it held back, for a video it
   *   already left, after newer playback, so the intervals mustn't be assumed to end now.
   * @param {unknown} [key] The tab's name for this stretch of time, the same on a resend.
   */
  function chargeTick(state, clock, now, seconds, videoId, agoMs = 0, key = '') {
    const ago = Math.min(Math.max(Number(agoMs) || 0, 0), 3600000);
    now -= ago;
    seconds = Math.min(Math.max(Number(seconds) || 0, 0), 3600);
    // A tab resends time the worker didn't confirm. When the worker did charge it and only the reply got lost, the
    // resend charges just what played since (Codex, 2026-10-13).
    if (typeof key === 'string' && key) {
      const ticks = (Array.isArray(clock.ticks) ? clock.ticks : []).filter((t) => Array.isArray(t));
      const charged = ticks.find((t) => t[0] === key);
      const before = charged ? Number(charged[1]) || 0 : 0;
      clock.ticks = [...ticks.filter((t) => t !== charged), /** @type {[string, number]} */ ([key, Math.max(before, seconds)])].slice(-TICK_KEYS);
      // The same for the pages, in the state the tab hears before this tick's reply.
      const seen = state.ticksIn.find((t) => t[0] === key);
      state.ticksIn = [...state.ticksIn.filter((t) => t !== seen), /** @type {[string, number]} */ ([key, Math.max(seen ? seen[1] : 0, seconds)])].slice(-TICKS_IN);
      seconds = Math.max(0, seconds - before);
    }
    if (seconds === 0) return watchStatus(state, videoId);
    // With the clock off, watching is logged for History and costs nothing, the same as an unlocked video (Q29).
    if (!state.settings.clock || isFree(state, videoId)) {
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

  /**
   * Whether this video may play. Dry hours lock it even with minutes left, so a page whose state predates their start
   * locks on time (Q32); the worker has already taken the minutes back by then.
   * @param {State} state @param {string} videoId @param {number} [now] Without it, Dry hours don't count.
   */
  function watchStatus(state, videoId, now) {
    const unlocked = state.unlocked.includes(videoId);
    const allowed = !unlocked && allowedNow(state.channels.allow, state.allowedToday, videoId);
    const out = state.watchSecondsLeft === 0 || (now !== undefined && dryUntil(state, now) > 0);
    // With the clock off nothing locks (Q29).
    return { secondsLeft: state.watchSecondsLeft, unlocked, allowed, locked: state.settings.clock && out && !unlocked && !allowed };
  }

  /** @param {State} state @param {string} videoId @param {string} title @param {string} reason @param {number} now */
  function needThis(state, videoId, title, reason, now) {
    if (typeof videoId !== 'string' || !/^[\w-]{1,64}$/.test(videoId)) return { ok: false, error: 'bad-video' };
    const trimmed = line(String(reason), REASON_MAX);
    title = line(String(title), TEXT_MAX);
    if (trimmed.length < 3) return { ok: false, error: 'reason-required' };
    if (state.unlocked.includes(videoId)) return { ok: true };
    if (needThisLeft(state, now) < 1) return { ok: false, error: 'need-this-limit' };
    state.unlocked.push(videoId);
    logDay(state).needThis.push({ videoId, title, reason: trimmed, at: now });
    return { ok: true };
  }

  const WEEK_MS = 7 * 24 * 3600 * 1000;

  // Dry hours (Q32, DRY-HOURS-PLAN.md Part B). No new drops in a daily range of whole local hours.

  const DRY_KEYS = /** @type {const} */ (['dryHours', 'dryFrom', 'dryTo']);

  /** The dry hours of a range, 0 to 23. Off, or start and end the same hour, has none. @param {Pick<Settings, 'dryHours' | 'dryFrom' | 'dryTo'>} s */
  function dryHourSet(s) {
    /** @type {Set<number>} */
    const hours = new Set();
    if (!s.dryHours || s.dryFrom === s.dryTo) return hours;
    for (let h = s.dryFrom; h !== s.dryTo; h = (h + 1) % 24) hours.add(h);
    return hours;
  }

  /**
   * When the Dry hours going on now end, in ms, or 0 when it isn't dry now or the clock is off. It walks forward an
   * hour at a time with the settings in force at each hour, so a change waiting for the reset counts from the reset,
 * Watch time turning off included.
   * Each step is the next hour on the clock, so DST's skipped and repeated hours count as the clock shows them.
   * @param {State} state @param {number} now
   */
  function dryUntil(state, now) {
    const settings = state && state.settings;
    if (!settings || settings.clock === false || typeof now !== 'number') return 0;
    const pending = state.pending;
    /** @param {number} t */
    const dryAt = (t) => {
      const waiting = pending && dayKey(t, settings.resetHour) >= pending.effectiveDay;
      const s = waiting ? { ...settings, ...pending.changes } : settings;
      // Watch time turning off at the reset ends Dry hours there too (Codex, 2026-11-04).
      return s.clock !== false && dryHourSet(s).has(new Date(t).getHours());
    };
    if (!dryAt(now)) return 0;
    let t = now;
    // Up to a day of today's settings, then at most 23 dry hours of a waiting range joined on (Codex, 2026-11-04).
    for (let i = 0; i < 49; i++) {
      const d = new Date(t);
      t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
      if (!dryAt(t)) break;
    }
    return t;
  }

  /** How long before Dry hours the warning shows and drops stop selling (Jesse, 2026-11-04). */
  const DRY_WARN_MS = 5 * 60 * 1000;

  /**
   * When Dry hours start, in ms, if that's within the next 5 minutes, or 0. They always start on the hour.
   * @param {State} state @param {number} now
   */
  function drySoon(state, now) {
    if (typeof now !== 'number' || dryUntil(state, now)) return 0;
    const d = new Date(now);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
    return next - now <= DRY_WARN_MS && dryUntil(state, next) ? next : 0;
  }

  /**
   * The start of Dry hours (Jesse, 2026-11-04): the minutes left stop, and each whole drop of them goes back to the
   * counter, so buying ahead gains nothing. What's under a drop is lost. Runs before every message, like rollDay, and
   * acts once per stretch of Dry hours.
   * @param {State} state @param {number} now @returns {boolean} Whether it changed anything.
   */
  function enterDry(state, now) {
    const until = dryUntil(state, now);
    if (!until) {
      // Dry hours that started and ended with no message, every tab closed, still take back what was bought before.
      const missed = state.watchSecondsLeft > 0 ? missedDry(state, now) : 0;
      if (missed && state.drySeen !== missed) return giveBack(state, missed);
      // Out of Dry hours the mark clears, so turning them off and on again in one night counts as a new start.
      if (!state.drySeen) return false;
      state.drySeen = 0;
      return true;
    }
    if (state.drySeen === until) return false;
    return giveBack(state, until);
  }

  /**
   * The end of the first Dry hours that started after the last purchase and before now, or 0. Looks 2 days back at most.
   * @param {State} state @param {number} now
   */
  function missedDry(state, now) {
    if (!state.boughtAt || state.boughtAt >= now) return 0;
    let t = Math.max(state.boughtAt, now - 48 * 3600 * 1000);
    for (let i = 0; i < 49; i++) {
      const d = new Date(t);
      t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
      if (t > now) return 0;
      const end = dryUntil(state, t);
      if (end) return end;
    }
    return 0;
  }

  /**
   * Zeroes the minutes and puts each whole drop of them back, for the Dry hours ending `until`. A drop comes back at
   * what it cost, the minutes bought over the drops bought, and never as more drops than were bought, so lowering
   * minutes per drop before the start can't turn one drop into many (pre-publish bug hunt, 2026-11-05). Minutes with
   * no purchase behind them, from a dev button or state saved before dropsBought, go at today's price.
   * @param {State} state @param {number} until
   */
  function giveBack(state, until) {
    state.drySeen = until;
    const drops = state.dropsBought;
    const per = drops > 0 ? state.watchSecondsBought / drops : state.settings.minutesPerToken * 60;
    const whole = per > 0 ? Math.floor(state.watchSecondsLeft / per + 1e-9) : 0;
    const back = drops > 0 ? Math.min(whole, drops) : whole;
    const before = state.tokens.watch;
    // Back up to the cap, but a lowered cap never takes drops away here.
    state.tokens.watch = Math.max(before, Math.min(before + back, caps(state.settings).watch));
    const added = state.tokens.watch - before;
    state.watchSecondsLeft = 0;
    state.watchSecondsBought = 0;
    state.dropsBought = 0;
    // Drops handed back weren't used, so History doesn't count them.
    const day = logDay(state);
    day.watchSpent = Math.max(0, day.watchSpent - added);
    if (added > 0) state.dryBack = { until, watch: added };
    return true;
  }

  /** A home page has shown the drops handed back. @param {State} state */
  function dryBackSeen(state) {
    state.dryBack = null;
    return { ok: true };
  }

  /**
   * Q6 for the three dry keys, judged as one range: today's, then any waiting change, then this one. A range holding
   * every hour today's does applies at once, and any wait is cancelled. Anything else waits, all three keys together,
   * so a later edit or Undo never leaves half a range. Takes the dry keys out of `cleaned`.
   * @param {State} state @param {Partial<Settings>} cleaned @param {boolean} firstDay
   */
  function updateDry(state, cleaned, firstDay) {
    /** @type {Partial<Settings>} */
    const applied = {};
    /** @type {Partial<Settings>} */
    const pending = {};
    const change = DRY_KEYS.filter((key) => key in cleaned);
    if (!change.length) return { applied, pending };
    const today = { dryHours: state.settings.dryHours, dryFrom: state.settings.dryFrom, dryTo: state.settings.dryTo };
    const proposed = { ...today };
    for (const key of DRY_KEYS) if (state.pending && key in state.pending.changes) Object.assign(proposed, { [key]: state.pending.changes[key] });
    for (const key of change) Object.assign(proposed, { [key]: cleaned[key] });
    for (const key of DRY_KEYS) delete cleaned[key];
    const now = dryHourSet(today);
    const next = dryHourSet(proposed);
    if (firstDay || [...now].every((h) => next.has(h))) {
      for (const key of DRY_KEYS) {
        if (proposed[key] !== today[key]) Object.assign(applied, { [key]: proposed[key] });
      }
      Object.assign(state.settings, proposed);
      cancelPending(state, 'dryHours');
    } else {
      if (!state.pending) state.pending = { effectiveDay: addDays(state.day, 1), changes: {} };
      state.pending.effectiveDay = addDays(state.day, 1);
      Object.assign(state.pending.changes, proposed);
      Object.assign(pending, proposed);
    }
    return { applied, pending };
  }

  /**
   * When each "I need this one" in the last 7 × 24 hours was used, oldest first (Q20, DRY-HOURS-PLAN.md A2). A use with
   * no time never counts. One from the future, after the computer's clock went back, counts as now.
   * @param {State} state @param {number} now @returns {number[]}
   */
  function weekUses(state, now) {
    return needThisUses(state, now).map(({ use }) => Math.min(use.at, now)).sort((a, b) => a - b);
  }

  /**
   * The uses counted by the rolling allowance, with their reset-day keys. Keeps the log's uses unchanged.
   * Missing times never count; a future use counts as now, as weekUses does.
   * @param {State} state @param {number} now
   * @returns {{day: string, use: LogDay['needThis'][number]}[]}
   */
  function needThisUses(state, now) {
    /** @type {{day: string, use: LogDay['needThis'][number]}[]} */
    const uses = [];
    for (const [day, entry] of Object.entries(state.log || {})) {
      for (const use of Array.isArray(entry?.needThis) ? entry.needThis : []) {
        const at = use?.at;
        if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) continue;
        const when = Math.min(at, now);
        if (now - when < WEEK_MS) uses.push({ day, use });
      }
    }
    return uses;
  }

  /** "I need this one" uses in the last 7 × 24 hours. @param {State} state @param {number} now */
  function needThisUsed(state, now) {
    return needThisUses(state, now).length;
  }

  /** @param {State} state @param {number} now */
  function needThisLeft(state, now) {
    return Math.max(0, state.settings.needThisPerWeek - needThisUsed(state, now));
  }

  /**
   * When the next "I need this one" comes back, in ms, or 0 while some are left or the limit is 0. With more uses than
   * the limit, after it was lowered, enough of the oldest have to age out first.
   * @param {State} state @param {number} now
   */
  function needThisBack(state, now) {
    const limit = state.settings.needThisPerWeek;
    const times = weekUses(state, now);
    if (limit <= 0 || times.length < limit) return 0;
    return times[times.length - limit] + WEEK_MS;
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
      } else if (key === 'feedSource' && (value === 'home' || value === 'subscriptions')) {
        cleaned.feedSource = value;
      } else if ((key === 'graceMode' || key === 'dryHours' || key === 'searchCap' || key === 'clock' || key === 'stash' || key === 'hideBell' || key === 'hideShorts' || key === 'streams') && typeof value === 'boolean') {
        cleaned[key] = value;
      } else if (key === 'cards' && (value === 'off' || value === 'unlimited' || value === 'limited')) {
        cleaned.cards = value;
      }
    }
    return cleaned;
  }

  /** @param {keyof Settings} key @param {Settings[keyof Settings]} from @param {Settings[keyof Settings]} to */
  function isLoosening(key, from, to) {
    if (key === 'resetHour') return from !== to;
    if (key === 'feedSource') return false;
    if (key === 'graceMode' || key === 'streams') return from === false && to === true;
    // Turning a mode part off, or cards from a count to unlimited, gives less drip, so it waits (Q29).
    // Showing the bell or the Shorts shelves again waits too.
    if (key === 'searchCap' || key === 'clock' || key === 'stash' || key === 'hideBell' || key === 'hideShorts') return from === true && to === false;
    if (key === 'cards') return CARDS_RANK[/** @type {Settings['cards']} */ (to)] < CARDS_RANK[/** @type {Settings['cards']} */ (from)];
    return typeof from === 'number' && typeof to === 'number' && to > from;
  }

  /** How long after install every settings change applies at once (Q6). */
  const FIRST_DAY_MS = 24 * 3600 * 1000;

  /**
   * When the first day's "every change at once" ends, in ms, or 0 once it's over or for state from before installedAt.
   * @param {State} state @param {number} [now]
   */
  function firstDayUntil(state, now) {
    if (state.firstDayOff || state.firstDayEnded) return 0;
    const until = state.installedAt ? state.installedAt + FIRST_DAY_MS : 0;
    return now !== undefined && now >= state.installedAt && now < until ? until : 0;
  }

  /**
   * Tightening applies at once and loosening waits for the reset (Q6), except in the first day after install, when
   * everything applies at once. There a new daily allowance moves today's balance by the same amount, so trying 6 drops
   * a day shows 6 today, and going back to 4 takes them away again. A new reset hour never starts a new day by itself.
   * @param {State} state @param {unknown} changes @param {number} [now] Without it, the first day doesn't count.
   */
  function updateSettings(state, changes, now) {
    /** @type {Partial<Settings>} */
    const applied = {};
    /** @type {Partial<Settings>} */
    const pending = {};
    const firstDay = firstDayUntil(state, now) > 0;
    const cleaned = cleanSettings(changes);
    const dry = updateDry(state, cleaned, firstDay);
    Object.assign(applied, dry.applied);
    Object.assign(pending, dry.pending);
    for (const key of /** @type {(keyof Settings)[]} */ (Object.keys(cleaned))) {
      const value = cleaned[key];
      if (value === state.settings[key]) {
        cancelPending(state, key);
      } else if (firstDay) {
        const before = state.settings[key];
        if (key === 'watchTokensPerDay') state.tokens.watch = Math.max(0, state.tokens.watch + Number(value) - state.settings.watchTokensPerDay);
        if (key === 'recTokensPerDay') state.tokens.rec = Math.max(0, state.tokens.rec + Number(value) - state.settings.recTokensPerDay);
        Object.assign(state.settings, { [key]: value });
        Object.assign(applied, { [key]: value });
        cancelPending(state, key);
        // An earlier hour would make the next message see a new day and refill. Today just ends at the new hour.
        if (key === 'resetHour' && now) {
          settleResetHour(state, Number(before));
          const day = dayKey(now, state.settings.resetHour);
          if (day > state.day) state.day = day;
        }
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
    // Dry hours or Watch time that changed now judge the hours from now on. Without this, a range moved over an hour
    // already past, since the minutes were bought, would hand them back for Dry hours that never were (pre-publish bug
    // hunt, 2026-11-05). A range over the current hour still takes them back at once, from enterDry.
    const dryChanged = [...DRY_KEYS, 'clock'].some((key) => key in applied);
    if (dryChanged && now && state.watchSecondsLeft > 0) state.boughtAt = Math.max(state.boughtAt, now);
    // A lowered cap is a hard limit now, not at the next reset (Q6, Q11).
    const cap = caps(state.settings);
    state.tokens.watch = Math.min(state.tokens.watch, cap.watch);
    state.tokens.rec = Math.min(state.tokens.rec, cap.rec);
    return { ok: true, applied, pending };
  }

  /**
   * How many changes wait, counted the way Settings shows them, one chip each. The three dry keys wait as one range
   * (Q32), so they count once, and "Saved." never says 3 changes for a moved end hour.
   * @param {string[]} keys The waiting keys, as updateSettings's `pending` names them.
   */
  function waitingCount(keys) {
    const dry = /** @type {readonly string[]} */ (DRY_KEYS);
    return keys.filter((key) => !dry.includes(key)).length + (keys.some((key) => dry.includes(key)) ? 1 : 0);
  }

  /** @param {State} state @param {string} key */
  function cancelPending(state, key) {
    if (state.pending) {
      // The dry keys wait as one range, so Undo on any of them puts back the whole range (DRY-HOURS-PLAN.md B5).
      const keys = /** @type {readonly string[]} */ (DRY_KEYS).includes(key) ? DRY_KEYS : [key];
      for (const k of keys) delete state.pending.changes[/** @type {keyof Settings} */ (k)];
      if (!Object.keys(state.pending.changes).length) state.pending = null;
    }
    return { ok: true };
  }

  /** A home page has shown what the reset added, so no other one shows it again. @param {State} state */
  function refillSeen(state) {
    state.refill = null;
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
   * How long ago a video went into the stash, for the full stash's list: "Today", "Yesterday", "6 days ago",
   * "3 weeks ago". Calendar days on this computer's clock, not drip's reset hour. '' when it's not known.
   * @param {number | undefined} addedAt
   * @param {number} now
   */
  function stashedAgo(addedAt, now) {
    if (!seconds(addedAt)) return '';
    /** @param {number} t */
    const midnight = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const days = Math.max(0, Math.round((midnight(now) - midnight(/** @type {number} */ (addedAt))) / 86400000));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 14) return `${days} days ago`;
    if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
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

  /** @param {string} day */
  function weekdayOf(day) {
    return new Date(`${day}T00:00:00Z`).getUTCDay();
  }

  /**
   * One week of Settings' History card, Sunday first (Jesse, 2026-10-09). `back` is how many weeks before this one.
   * Days before the log's oldest entry, and days after today, don't count toward an average, so the first week after
   * install and the current week average only the days drip was there for. `lastAverage` is the week before's, or
   * null when the log has nothing that far back. `hasEarlier` is false at the week holding the log's oldest day.
   * @param {State} state
   * @param {number} [back]
   */
  function weekView(state, back = 0) {
    const first = Object.keys(state.log).reduce((oldest, day) => (day < oldest ? day : oldest), state.day);
    const start = addDays(state.day, -weekdayOf(state.day) - 7 * Math.max(0, Math.floor(back)));
    /** @param {string} from */
    const week = from => Array.from({ length: 7 }, (_, i) => {
      const day = addDays(from, i);
      const entry = state.log[day];
      return { day, watchedSec: entry ? entry.watchedSec : 0, today: day === state.day, future: day > state.day, counted: day >= first && day <= state.day };
    });
    /** @param {{watchedSec: number, counted: boolean}[]} days */
    const average = days => {
      const counted = days.filter(d => d.counted);
      return counted.length ? counted.reduce((sum, d) => sum + d.watchedSec, 0) / counted.length : null;
    };
    const days = week(start);
    return {
      start, end: addDays(start, 6), days,
      average: average(days),
      lastAverage: average(week(addDays(start, -7))),
      hasEarlier: start > addDays(first, -weekdayOf(first)),
      hasLater: start < addDays(state.day, -weekdayOf(state.day)),
    };
  }

  /**
   * The line under a day's tiles in History: "Of 5 cards, 2 saved and 3 passed." Zero parts drop out, and a day with no
   * cards gives ''. recSpent counts a card that's still showing, so the parts can add up to one less.
   * @param {LogDay | undefined} entry
   */
  function cardsLine(entry) {
    const total = entry ? entry.recSpent : 0;
    if (!entry || !(total > 0)) return '';
    const noun = total === 1 ? 'card' : 'cards';
    const parts = /** @type {[number, string][]} */ ([[entry.saved, 'saved'], [entry.watched, 'watched'], [entry.passed, 'passed']])
      .filter(([n]) => n > 0).map(([n, word]) => `${n} ${word}`);
    if (!parts.length) return `${total} ${noun} revealed.`;
    const list = parts.length < 3 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
    return `Of ${total} ${noun}, ${list}.`;
  }

  // Subscriptions, Explore, and its topic pages (Q16). The two channel ids are Shopping and Music, which YouTube links
  // as channels (checked on the MacBook 2026-10-06). Other channel pages stay. Bare /shorts is the Shorts feed, with no
  // video to open as a watch page (Jesse, 2026-10-15). A hashtag page, linked from descriptions and titles, is a feed
  // of videos and Shorts from anyone (2026-10-15).
  const FEEDS = /^\/(?:channel\/(?:UCkYQyvc_i9hXEo4xic9Hh2g|UC-9-kyTW8ZkZNDHQJ6FgpwQ)|feed\/(?:subscriptions|explore|trending|storefront|courses_destination|news_destination|music_destination)|gaming|shopping|podcasts|playables|hype|courses|learning|fashion|news|sports|music|live|shorts|hashtag\/[^/]+(?:\/shorts)?)\/?$/;

  /**
   * Where a top-level YouTube URL should go instead, or '' to leave it. Shorts, live links, and embeds become watch
   * pages, so the clock applies (Q2, Q7). Feeds go to the token page (Q16). The mobile site moves to the desktop site,
   * with app=desktop: to a phone browser, www.youtube.com without it answers with a redirect back to the mobile site,
   * and the two redirects looped (Jesse in Chrome's phone view, 2026-11-16; checked with curl the same day).
   * @param {string} href
   */
  function redirectTarget(href) {
    const url = new URL(href);
    if (url.hostname === 'm.youtube.com') {
      // A mobile page that already says app=desktop stays, so nothing loops if YouTube stops honouring it.
      if (url.searchParams.get('app') === 'desktop') return '';
      url.hostname = 'www.youtube.com';
      // A mobile Short or feed goes to its desktop target in one move.
      const target = new URL(redirectTarget(url.href) || url.href);
      target.searchParams.set('app', 'desktop');
      return target.href;
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
    const live = /^\/live\/([^/]+)\/?$/.exec(url.pathname);
    if (live) {
      const target = `https://www.youtube.com/watch?v=${encodeURIComponent(live[1])}`;
      const start = (url.searchParams.get('t') || url.searchParams.get('start') || '').replace(/s$/, '');
      return /^\d+$/.test(start) ? `${target}&t=${start}s` : target;
    }
    if (FEEDS.test(url.pathname)) return 'https://www.youtube.com/';
    return '';
  }

  /**
   * Whether YouTube's next video, from Shift+N or the player's Next button, is YouTube's own pick and not a playlist's
   * next video. Playlists and mixes play on (Q2), so a next video with a list is allowed. The Next button's link says
   * where it goes. Without one, a page with a list counts as a playlist.
   * @param {string} pageUrl
   * @param {string} nextHref The player's Next button's href, or '' when there's none.
   */
  function upNextIsPick(pageUrl, nextHref) {
    /** @param {string} href */
    const hasList = (href) => {
      try {
        return !!new URL(href, 'https://www.youtube.com/').searchParams.get('list');
      } catch {
        return false;
      }
    };
    return nextHref ? !hasList(nextHref) : !hasList(pageUrl);
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
    const settings = cleanSettings(stored.settings);
    const resetHour = settings.resetHour ?? DEFAULT_SETTINGS.resetHour;
    const today = dayKey(now, resetHour);
    // A clock turned off waits in pending until its day, which may have come without the worker rolling over yet.
    const pending = stored.pending && typeof stored.pending.effectiveDay === 'string' && stored.pending.effectiveDay <= today
      ? cleanSettings(stored.pending.changes) : {};
    if ((pending.clock ?? settings.clock) === false) return false;
    if (typeof stored.day !== 'string' || stored.day < today) return true;
    if (Array.isArray(stored.unlocked) && stored.unlocked.includes(videoId)) return false;
    const lists = /** @type {any} */ (stored.channels);
    const allowed = Array.isArray(stored.allowedToday) ? stored.allowedToday.map((e) => ({ id: e?.id, ids: cleanIds(e?.ids) })) : [];
    if (allowedNow(cleanChannels(lists?.allow), allowed, videoId)) return false;
    // Dry hours lock it even with minutes left (Q32).
    const waiting = stored.pending && typeof stored.pending.effectiveDay === 'string'
      ? { effectiveDay: stored.pending.effectiveDay, changes: cleanSettings(stored.pending.changes) } : null;
    if (dryUntil(/** @type {State} */ (/** @type {unknown} */ ({ settings: { ...DEFAULT_SETTINGS, ...settings }, pending: waiting })), now)) return true;
    return count(stored.watchSecondsLeft, 0) <= 0;
  }

  /**
   * The tick's explicit playing flag says whether playback is ongoing.
   * The toolbar forgets playback after 12 seconds without a fresh tick, including when a tab closes.
   * @param {{at: number, playing?: boolean} | null} tick
   * @param {number} now
   */
  function toolbarPlaying(tick, now) {
    return tick !== null && tick.playing === true && now - tick.at < 12000;
  }

  /**
   * The toolbar uses the popup's fraction and the mockup's smooth top 5%. The glass API is passed in so this stays
   * pure and state.js can still load on pages that don't draw glasses. Unlocks don't affect minutes left.
   * @param {Pick<State, 'watchSecondsLeft' | 'watchSecondsBought'>} state
   * @param {{fraction: (state: Pick<State, 'watchSecondsLeft' | 'watchSecondsBought'>) => number,
   *   waterline: (fraction: number, height: number) => number, viewBox: {height: number}}} glass
   */
  function toolbarGlass(state, glass) {
    const fraction = glass.fraction(state);
    /** @param {number} size */
    const waterY = (size) => fraction >= 1 ? 0 : fraction > .95
      ? glass.waterline(.95, size) * (1 - fraction) / .05 : glass.waterline(fraction, size);
    const water16 = waterY(16);
    const water32 = waterY(32);
    const surfaceOpacity = Math.max(0, Math.min(1, (fraction - .95) / .05));
    // Cache the visible height at 32px, including the surface fade. Empty has its own key, so even the smallest
    // positive balance draws the minimum sliver. Below that minimum, different fractions share the same key.
    const cacheKey = fraction <= 0 ? 'empty'
      : `${Math.round(water32 * 32 / glass.viewBox.height)}:${Math.round(surfaceOpacity * 32)}`;
    return { fraction, water16, water32, surfaceOpacity, cacheKey };
  }

  /**
   * Which mode a set of settings is, or null for a custom mix (Q29).
   * @param {Pick<Settings, 'searchCap' | 'cards' | 'clock' | 'stash'>} settings
   * @returns {'quiet' | 'curated' | 'full' | null}
   */
  function modeOf(settings) {
    const names = /** @type {('quiet' | 'curated' | 'full')[]} */ (Object.keys(MODES));
    return names.find(name => Object.entries(MODES[name]).every(([key, value]) => settings[/** @type {keyof typeof settings} */ (key)] === value)) ?? null;
  }

  /**
   * The settings as they'll be after the next reset: today's, with every waiting change applied. Settings shows these,
   * so a saved change that waits stays in the form (Jesse, 2026-10-16).
   * @param {State} state
   * @returns {Settings}
   */
  function planned(state) {
    return { ...state.settings, ...(state.pending ? state.pending.changes : {}) };
  }

  /**
   * What Settings' Save sends: each setting the form changed from `planned`. Sent today's value, updateSettings cancels
   * the waiting change, so Quiet saved and then Curated replaces all of Quiet at the reset (Codex, 2026-10-15).
   * @param {State} state
   * @param {Record<string, any>} draft The form's values.
   * @param {string[]} keys The settings the form has.
   * @returns {Partial<Settings>}
   */
  function settingsToSave(state, draft, keys) {
    const base = /** @type {Record<string, any>} */ (planned(state));
    /** @type {Record<string, any>} */
    const changes = {};
    for (const key of keys) {
      if (draft[key] !== base[key]) changes[key] = draft[key];
    }
    return changes;
  }

  // Export, import, and reset (RELEASE-PLAN.md, item 5). None of them touch today's drops or cards, and settings go
  // through updateSettings, so anything that loosens a limit waits for the reset (Q6).

  /** The format tag an export carries, so import can refuse any other JSON file. */
  const EXPORT_FORMAT = 1;

  /**
   * What Settings' Export saves: the settings as planned (a change waiting for the reset included), the stash, and the
   * log. Balances, seen videos, and unlocks stay out, since importing them would hand back a day.
   * @param {State} state @param {number} now
   */
  function exportData(state, now) {
    return {
      app: 'drip', format: EXPORT_FORMAT, exportedAt: new Date(now).toISOString(),
      settings: planned(state), backlog: state.backlog.map((v) => ({ ...v })), log: structuredClone(state.log),
      channels: plannedChannels(state),
    };
  }

  /** Whether a log key is a real date written as YYYY-MM-DD. @param {string} day */
  function realDay(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const date = new Date(`${day}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day;
  }

  /**
   * The most each number in one log day can be. Watched time fits in the longest day. Drops spent fit in the most a
   * balance holds, since a day refills once and drops handed back come off the count. Cards in Curated cost nothing,
   * so their counts get one a second for the longest day.
   */
  const LOG_MAX = {
    watchedSec: DAY_SEC_MAX, watchSpent: ranges.watchTokensPerDay[1] * ranges.rolloverDays[1],
    recSpent: DAY_SEC_MAX, saved: DAY_SEC_MAX, passed: DAY_SEC_MAX, watched: DAY_SEC_MAX,
  };

  /**
   * One day of an imported log, with only the fields drip keeps and only numbers a day can hold. A use's time is never
   * after `now`, since a future one would count against the week for as long as its day stays in the log.
   * @param {unknown} raw @param {number} now @returns {LogDay | null}
   */
  function cleanLogDay(raw, now) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const d = /** @type {Record<string, any>} */ (raw);
    const day = emptyLog();
    for (const key of /** @type {const} */ (['watchedSec', 'watchSpent', 'recSpent', 'saved', 'passed', 'watched'])) day[key] = Math.min(count(d[key], 0), LOG_MAX[key]);
    if (Array.isArray(d.needThis)) {
      for (const use of d.needThis) {
        if (use && typeof use.videoId === 'string' && VIDEO_ID.test(use.videoId) && typeof use.reason === 'string') {
          day.needThis.push({ videoId: use.videoId, title: line(use.title, TEXT_MAX), reason: line(use.reason, REASON_MAX), at: Math.min(count(use.at, 0), now) });
        }
      }
    }
    day.needThis = day.needThis.slice(-USES_MAX);
    return day;
  }

  /**
   * updateSettings, but today's drops and cards stay as they were. Settings' Save caps them at a lowered limit and moves
   * them on the first day, but import and reset promise not to touch them (Codex, 2026-11-02). The next reset caps them.
   * @param {State} state @param {unknown} changes @param {number} now
   */
  function settingsKeepingBalances(state, changes, now) {
    const tokens = { ...state.tokens };
    const result = updateSettings(state, changes, now);
    state.tokens = tokens;
    return result;
  }

  /**
   * Import: saves the file's settings through updateSettings, adds its stash videos that aren't already stashed (up to
   * the stash's size), and adds its log days that this install doesn't have, before today only. Nothing here replaces or
   * removes what's already there.
   * @param {State} state @param {unknown} raw @param {number} now
   */
  function importData(state, raw, now) {
    const file = /** @type {Record<string, any>} */ (raw);
    if (!file || typeof file !== 'object' || file.app !== 'drip') return { ok: false, error: 'not-drip' };
    if (file.format !== EXPORT_FORMAT) return { ok: false, error: 'bad-format' };
    const settings = settingsKeepingBalances(state, file.settings, now);
    let added = 0;
    let skipped = 0;
    const have = new Set(state.backlog.map((v) => v.id));
    for (const item of Array.isArray(file.backlog) ? file.backlog : []) {
      const video = cleanVideo(item);
      if (!video || have.has(video.id)) continue;
      if (state.backlog.length >= state.settings.stashMax) { skipped++; continue; }
      state.backlog.push(video);
      have.add(video.id);
      // The card showing now counts as saved once it's stashed, as addBacklog does (Codex, 2026-11-02).
      if (state.current && state.current.id === video.id) logDay(state).saved++;
      added++;
    }
    let days = 0;
    if (file.log && typeof file.log === 'object' && !Array.isArray(file.log)) {
      let room = LOG_USES_MAX - Object.values(state.log).reduce((n, entry) => n + (Array.isArray(entry?.needThis) ? entry.needThis.length : 0), 0);
      // Newest first, so the uses that stay are the ones the weekly allowance counts.
      for (const [day, entry] of Object.entries(file.log).sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))) {
        // A real calendar date, since History's week math throws on one like 2026-00-01, and within the 90 days the
        // log keeps, as rollDay would prune it (Codex, 2026-11-03).
        if (!realDay(day) || day >= state.day || day < addDays(state.day, -89) || state.log[day]) continue;
        const cleaned = cleanLogDay(entry, now);
        if (!cleaned) continue;
        cleaned.needThis = room > 0 ? cleaned.needThis.slice(-room) : [];
        room -= cleaned.needThis.length;
        state.log[day] = cleaned;
        days++;
      }
    }
    // The lists go through the same rules as a click: an allow waits, a block applies now, and nothing is removed.
    let channelsAdded = 0;
    let channelsWaiting = 0;
    // Channels a full list turned away, so Import can say so, as it does for the stash.
    let allowSkipped = 0;
    let blockSkipped = 0;
    const lists = file.channels && typeof file.channels === 'object' ? file.channels : {};
    for (const raw of Array.isArray(lists.allow) ? lists.allow : []) {
      const channel = cleanChannel(raw);
      if (!channel || isAllowedOrWaiting(state, channel)) continue;
      const allowed = allowChannel(state, channel, now);
      if (allowed.ok) channelsAdded++;
      if (allowed.ok && allowed.waits) channelsWaiting++;
      if (allowed.error === 'allow-full') allowSkipped++;
    }
    for (const raw of Array.isArray(lists.block) ? lists.block : []) {
      const channel = cleanChannel(raw);
      if (!channel || findChannel(state.channels.block, channel)) continue;
      const blocked = blockChannel(state, channel);
      if (blocked.ok) channelsAdded++;
      if (blocked.error === 'block-full') blockSkipped++;
    }
    return {
      ok: true, applied: settings.applied, pending: settings.pending, stashAdded: added, stashSkipped: skipped, daysAdded: days,
      channelsAdded, channelsWaiting, allowSkipped, blockSkipped,
    };
  }

  /**
   * Reset: the default settings through updateSettings, so a default that loosens waits for the reset, and an empty
   * stash. The log and today's balances stay.
   * @param {State} state @param {number} now
   */
  function resetData(state, now) {
    const settings = settingsKeepingBalances(state, { ...DEFAULT_SETTINGS }, now);
    const cleared = state.backlog.length;
    // One at a time through removeBacklog, so a saved card still showing stops counting as saved (Codex, 2026-11-02).
    for (const video of [...state.backlog]) removeBacklog(state, video.id);
    // Both lists empty at once, and waiting allows go too. Unblocking applies at once since 2026-11-04 (Jesse).
    const allowing = [...state.channels.allow, ...(state.channelsPending ? state.channelsPending.allow : [])];
    for (const channel of allowing) removeAllowed(state, channel);
    let unblocked = 0;
    let unblocking = 0;
    for (const channel of [...state.channels.block]) {
      if (unblockChannel(state, channel, now).waits) unblocking++;
      else unblocked++;
    }
    return {
      ok: true, applied: settings.applied, pending: settings.pending, stashCleared: cleared,
      allowCleared: allowing.length, unblocked, unblocking,
    };
  }


  // Channel allow and block lists (RELEASE-PLAN.md item 4, CHANNEL-LISTS-PLAN.md). Allowing loosens, so it waits for the
  // reset (Q6). Removing an allowed channel, blocking, and unblocking apply at once (unblocking since 2026-11-04).

  /** The most channels the allow list holds, waiting ones included (Jesse, 2026-11-02). */
  const ALLOW_MAX = 5;
  /** The most the block list holds, for storage. */
  const BLOCK_MAX = 100;
  /** The most ids one channel keeps: its handle, its UC id, and room for a handle it changed to. */
  const IDS_MAX = 4;
  const ALLOWED_TODAY_MAX = 500;
  const VIDEO_ID = /^[\w-]{1,64}$/;
  // YouTube handles can be in any script, like @料理 (Codex, 2026-11-03).
  const HANDLE = /^@[\p{L}\p{M}\p{N}_.\-·]{1,100}$/u;
  const UC_ID = /^UC[\w-]{22}$/;
  /** A channel's picture, as a channel page's header shows it (checked on air, 2026-11-04). */
  const AVATAR = /^https:\/\/yt3\.(googleusercontent|ggpht)\.com\/[\w\-./=~%]{1,400}$/;

  /**
   * A channel's id from what a person or a page gives: `@handle`, `UC...`, or a URL or path with either. Handles are
   * lowercased, since YouTube treats them without case. '' for anything else.
   * @param {unknown} input
   */
  function channelId(input) {
    if (typeof input !== 'string') return '';
    const text = input.trim();
    if (HANDLE.test(text)) return text.toLowerCase();
    if (UC_ID.test(text)) return text;
    const path = text.replace(/^(https?:\/\/)?((www|m)\.)?youtube\.com/i, '').split(/[?#]/)[0];
    const handle = /^\/(@[^/]+)/.exec(path);
    if (handle) {
      let decoded = '';
      try {
        decoded = decodeURIComponent(handle[1]);
      } catch {
        // A broken % escape isn't a handle.
      }
      if (HANDLE.test(decoded)) return decoded.toLowerCase();
    }
    const uc = /^\/channel\/([^/]+)/.exec(path);
    if (uc && UC_ID.test(uc[1])) return uc[1];
    return '';
  }

  /** @param {unknown} raw @returns {string[]} */
  function cleanIds(raw) {
    if (!Array.isArray(raw)) return [];
    /** @type {string[]} */
    const ids = [];
    for (const item of raw) {
      const id = typeof item === 'string' && (HANDLE.test(item) || UC_ID.test(item)) ? (item.startsWith('@') ? item.toLowerCase() : item) : '';
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids.slice(0, IDS_MAX);
  }

  /** A channel with clean ids and a trimmed name, or null with neither. @param {unknown} raw @returns {Channel | null} */
  function cleanChannel(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const c = /** @type {Record<string, unknown>} */ (raw);
    const ids = cleanIds(c.ids);
    const name = line(c.name, TEXT_MAX);
    if (!ids.length && !name) return null;
    return typeof c.avatar === 'string' && AVATAR.test(c.avatar) ? { ids, name, avatar: c.avatar } : { ids, name };
  }

  /** @param {unknown} raw @returns {Channel[]} */
  function cleanChannels(raw) {
    return Array.isArray(raw) ? /** @type {Channel[]} */ (raw.map(cleanChannel).filter(Boolean)) : [];
  }

  /** @param {string[]} a @param {string[]} b */
  function shareId(a, b) {
    return a.some((id) => b.includes(id));
  }

  /**
   * Two sightings are one channel when they share an id. When either has no ids, an exact name decides, since a home
   * card shows only the name. A wrong name match only hides a video or skips buying a drop the watch page then asks for.
   * @param {Channel} a @param {Channel} b
   */
  function sameChannel(a, b) {
    if (a.ids.length && b.ids.length) return shareId(a.ids, b.ids);
    return !!a.name && a.name === b.name;
  }

  /** @param {Channel[]} list @param {Channel} channel */
  function findChannel(list, channel) {
    return list.find((entry) => sameChannel(entry, channel));
  }

  /** Adds what a sighting knows to an entry: ids it lacks, and the name. @param {Channel} entry @param {Channel} seen */
  function mergeChannel(entry, seen) {
    let changed = false;
    for (const id of seen.ids) {
      if (!entry.ids.includes(id) && entry.ids.length < IDS_MAX) { entry.ids.push(id); changed = true; }
    }
    // A name from a page with ids is current. A name-only sighting never renames an entry it matched by name.
    if (seen.name && seen.ids.length && entry.name !== seen.name) { entry.name = seen.name; changed = true; }
    if (seen.avatar && seen.ids.length && entry.avatar !== seen.avatar) { entry.avatar = seen.avatar; changed = true; }
    return changed;
  }

  /** @param {State} state */
  function channelsPendingFor(state) {
    const day = addDays(state.day, 1);
    if (!state.channelsPending) state.channelsPending = { effectiveDay: day, allow: [], unblock: [] };
    state.channelsPending.effectiveDay = day;
    return state.channelsPending;
  }

  /** @param {State} state */
  function tidyChannelsPending(state) {
    const p = state.channelsPending;
    if (p && !p.allow.length && !p.unblock.length) state.channelsPending = null;
  }

  /** Puts the channel changes waiting for the reset into the lists. rollDay does it at the reset. @param {State} state */
  function applyChannelsPending(state) {
    const p = state.channelsPending;
    if (!p) return;
    for (const channel of p.allow) {
      const have = findChannel(state.channels.allow, channel);
      if (have) mergeChannel(have, channel);
      else if (state.channels.allow.length < ALLOW_MAX) state.channels.allow.push(channel);
    }
    state.channels.block = state.channels.block.filter((entry) => !findChannel(p.unblock, entry));
    state.channelsPending = null;
  }

  /** Allowed and waiting channels, which the cap of 5 counts. @param {State} state */
  function allowCount(state) {
    return state.channels.allow.length + (state.channelsPending ? state.channelsPending.allow.length : 0);
  }

  /** @param {State} state @param {unknown} raw */
  function isAllowedOrWaiting(state, raw) {
    const channel = cleanChannel(raw);
    if (!channel) return false;
    return !!findChannel(state.channels.allow, channel) || !!(state.channelsPending && findChannel(state.channelsPending.allow, channel));
  }

  /**
   * Adds a channel to the allow list: at once on the first day, otherwise at the reset (Q6). It needs an id, since a
   * watch page proves its channel by id. Allowed and waiting ones count toward the 5.
   * @param {State} state @param {unknown} raw @param {number} [now]
   */
  function allowChannel(state, raw, now) {
    const channel = cleanChannel(raw);
    if (!channel || !channel.ids.length) return { ok: false, error: 'bad-channel' };
    // One channel is never on both lists: a blocked one has to be unblocked first (code review, 2026-11-03).
    if (findChannel(state.channels.block, channel)) return { ok: false, error: 'channel-blocked' };
    const have = findChannel(state.channels.allow, channel);
    if (have) { mergeChannel(have, channel); return { ok: true, waits: false }; }
    const waiting = state.channelsPending && findChannel(state.channelsPending.allow, channel);
    if (waiting) { mergeChannel(waiting, channel); return { ok: true, waits: true }; }
    if (allowCount(state) >= ALLOW_MAX) return { ok: false, error: 'allow-full' };
    if (firstDayUntil(state, now) > 0) {
      state.channels.allow.push(channel);
      return { ok: true, waits: false };
    }
    channelsPendingFor(state).allow.push(channel);
    return { ok: true, waits: true };
  }

  /** Takes a channel off the allow list, or cancels its waiting allow, at once. @param {State} state @param {unknown} raw */
  function removeAllowed(state, raw) {
    const channel = cleanChannel(raw);
    if (!channel) return { ok: false, error: 'bad-channel' };
    state.channels.allow = state.channels.allow.filter((entry) => !sameChannel(entry, channel));
    if (state.channelsPending) state.channelsPending.allow = state.channelsPending.allow.filter((entry) => !sameChannel(entry, channel));
    tidyChannelsPending(state);
    return { ok: true };
  }

  /**
   * Blocks a channel at once, and cancels an unblock waiting for it. A home card gives only a name, which is enough.
   * @param {State} state @param {unknown} raw
   */
  function blockChannel(state, raw) {
    const channel = cleanChannel(raw);
    if (!channel) return { ok: false, error: 'bad-channel' };
    if (state.channelsPending) state.channelsPending.unblock = state.channelsPending.unblock.filter((entry) => !sameChannel(entry, channel));
    tidyChannelsPending(state);
    const have = findChannel(state.channels.block, channel);
    if (have) { mergeChannel(have, channel); return { ok: true }; }
    if (state.channels.block.length >= BLOCK_MAX) return { ok: false, error: 'block-full' };
    // Blocking an allowed channel takes it off the allow list, at once, since that tightens.
    removeAllowed(state, channel);
    state.channels.block.push(channel);
    return { ok: true };
  }

  /**
   * Takes a channel off the block list: at once on the first day, otherwise at the reset (Q6).
   * @param {State} state @param {unknown} raw @param {number} [now]
   */
  function unblockChannel(state, raw, now) {
    const channel = cleanChannel(raw);
    if (!channel) return { ok: false, error: 'bad-channel' };
    const have = findChannel(state.channels.block, channel);
    if (!have) return { ok: true, waits: false };
    // At once: a blocked channel only changes which videos a reveal deals, and every reveal still costs a card, so
    // unblocking gives no more watching (Jesse, 2026-11-04). An unblock saved waiting before this still applies at the reset.
    state.channels.block = state.channels.block.filter((entry) => entry !== have);
    if (state.channelsPending) {
      state.channelsPending.unblock = state.channelsPending.unblock.filter((entry) => !sameChannel(entry, have));
      tidyChannelsPending(state);
    }
    return { ok: true, waits: false };
  }

  /** Drops a waiting allow or unblock for a channel. @param {State} state @param {unknown} raw */
  function cancelChannelPending(state, raw) {
    const channel = cleanChannel(raw);
    if (!channel || !state.channelsPending) return { ok: true };
    state.channelsPending.allow = state.channelsPending.allow.filter((entry) => !sameChannel(entry, channel));
    state.channelsPending.unblock = state.channelsPending.unblock.filter((entry) => !sameChannel(entry, channel));
    tidyChannelsPending(state);
    return { ok: true };
  }

  /**
   * A page saw a channel with its ids and name: fill them into any list entry it matches, so a block added by handle
   * learns the name a home card shows. Returns whether anything changed.
   * @param {State} state @param {unknown} raw
   */
  function seenChannel(state, raw) {
    const channel = cleanChannel(raw);
    if (!channel || !channel.ids.length) return { ok: true, changed: false };
    let changed = false;
    const p = state.channelsPending;
    for (const list of [state.channels.allow, state.channels.block, ...(p ? [p.allow, p.unblock] : [])]) {
      for (const entry of list) {
        if (sameChannel(entry, channel) && mergeChannel(entry, channel)) changed = true;
      }
    }
    return { ok: true, changed };
  }

  /**
   * A channel from its channel page's HTML, which the worker fetches for an entry added in Settings by handle, so the
   * list shows its picture and home cards (which show only a name) match it at once (Jesse, 2026-11-04). It reads the
   * page's og:title, og:image, and og:url tags (checked 2026-11-04). The picture is asked for at 160px, as the header
   * shows it. Null when the page doesn't have them.
   * @param {unknown} html @param {string} handle @returns {Channel | null}
   */
  function channelFromPage(html, handle) {
    if (typeof html !== 'string' || !HANDLE.test(handle)) return null;
    /** @param {string} prop */
    const meta = (prop) => {
      const m = new RegExp(`<meta property="og:${prop}" content="([^"]*)"`).exec(html);
      return m ? m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : '';
    };
    const name = meta('title');
    if (!name) return null;
    const uc = /\/channel\/(UC[\w-]{22})$/.exec(meta('url'));
    const avatar = meta('image').replace(/=s\d+-/, '=s160-');
    return cleanChannel({ ids: [handle.toLowerCase(), ...(uc ? [uc[1]] : [])], name, avatar });
  }

  /**
   * Whether a video a watch page showed is free through the allow list now. Checked at use, so removing the channel
   * ends it at once (Codex 7). Only an id counts here: a name isn't proof.
   * @param {Channel[]} allow @param {{id: unknown, ids: string[]}[]} today @param {string} videoId
   */
  function allowedNow(allow, today, videoId) {
    return today.some((e) => e.id === videoId && allow.some((c) => shareId(c.ids, e.ids)));
  }

  /**
   * A watch page read its channel. When the channel is allowed, by id, the video is free for the rest of the day.
   * @param {State} state @param {unknown} videoId @param {unknown} raw
   */
  function allowedVideo(state, videoId, raw) {
    if (typeof videoId !== 'string' || !VIDEO_ID.test(videoId)) return { ok: false, error: 'bad-video' };
    const channel = cleanChannel(raw);
    if (!channel || !channel.ids.length) return { ok: true, allowed: false };
    seenChannel(state, channel);
    if (!state.channels.allow.some((c) => shareId(c.ids, channel.ids))) return { ok: true, allowed: false };
    state.allowedToday = [...state.allowedToday.filter((e) => e.id !== videoId), { id: videoId, ids: channel.ids }].slice(-ALLOWED_TODAY_MAX);
    return { ok: true, allowed: true };
  }

  /**
   * Whether watching this video costs nothing today: "I need this one" unlocked it, or a watch page showed it's from an
   * allowed channel. Every cost and lock check goes through here.
   * @param {State} state @param {string} videoId
   */
  function isFree(state, videoId) {
    return state.unlocked.includes(videoId) || allowedNow(state.channels.allow, state.allowedToday, videoId);
  }

  /** @param {State} state @param {Video} video */
  function fromAllowed(state, video) {
    const channel = { ids: video.channelIds || [], name: video.channel };
    return !!findChannel(state.channels.allow, channel);
  }

  /**
   * isFree, or a card or stash row from an allowed channel, before its watch page has said so. The home page's prices
   * and buyIfOut use this.
   * @param {State} state @param {string} videoId
   */
  function freeToStart(state, videoId) {
    if (isFree(state, videoId)) return true;
    const video = state.current && state.current.id === videoId ? state.current : state.backlog.find((v) => v.id === videoId);
    return !!video && fromAllowed(state, video);
  }

  /** Whether a reveal must skip this video's channel. @param {State} state @param {Video} video */
  function isBlocked(state, video) {
    if (!state.channels.block.length) return false;
    return !!findChannel(state.channels.block, { ids: video.channelIds || [], name: video.channel });
  }

  /** The lists as they'll be after the reset, for Export. @param {State} state */
  function plannedChannels(state) {
    const p = state.channelsPending;
    const copy = (/** @type {Channel} */ c) => ({ ids: [...c.ids], name: c.name });
    return {
      allow: [...state.channels.allow, ...(p ? p.allow : [])].map(copy),
      block: state.channels.block.filter((c) => !(p && findChannel(p.unblock, c))).map(copy),
    };
  }

  /**
   * Whether `next` is an older save than `current`. Messages and storage events reach a page in any order, so a reply
   * answered from an earlier snapshot can land after a newer save from another tab. Taking it would put back the old
   * state, and a lock the other tab's +15m had lifted rose again (IDEAS.md "Known races", Codex, 2026-11-04).
   * @param {any} next @param {any} current
   */
  function isOlder(next, current) {
    return !!next && !!current && typeof next.rev === 'number' && typeof current.rev === 'number' && next.rev < current.rev;
  }

  /** The newer of the state a page has and one that just arrived. @param {any} current @param {any} next */
  function newer(current, next) {
    return isOlder(next, current) ? current : next;
  }

  /** @type {any} */ (globalThis).Drip = {
    isOlder, newer,
    DEFAULT_SETTINGS, MODES, modeOf, planned, settingsToSave, dayKey, addDays, daysBetween, initialState, hydrate,
    rollDay, logDay, spendWatch, reveal, resolveCurrent, revealNext, buyIfOut, addBacklog,
    firstDayUntil, removeBacklog, swapBacklog, swapFollow, editsSince, markProgress, charge, chargeTick, watchStatus, needThis, needThisUses, needThisUsed, needThisLeft, needThisBack, dryUntil, drySoon, enterDry, dryBackSeen, cleanSettings,
    isLoosening, mayReveal, canDeal, updateSettings, waitingCount, cancelPending, refillSeen, caps, formatMinutes, stashedAgo, cleanVideo,
    watchedSummary, weekView, cardsLine, redirectTarget, upNextIsPick, earlyLocked, toolbarGlass, toolbarPlaying,
    exportData, importData, resetData, REASON_MAX,
    ALLOW_MAX, channelId, cleanChannel, sameChannel, allowChannel, removeAllowed, blockChannel, unblockChannel,
    cancelChannelPending, applyChannelsPending, seenChannel, channelFromPage, allowedVideo, isFree, freeToStart, plannedChannels, allowCount,
    isAllowedOrWaiting,
  };
})();
