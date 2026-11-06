// @ts-check

const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/lib/state.js');
require('../src/lib/glass.js');
const D = globalThis.Drip;
const G = globalThis.DripGlass;

/** @param {number} day @param {number} [hour] @param {number} [minute] */
const time = (day, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
/** @param {string} id */
const video = id => ({ id, title: `Title ${id}`, channel: 'Channel', length: '14:02' });
const fresh = () => D.initialState(time(5));

/** @param {ReturnType<typeof fresh>} state @param {() => unknown} call @param {string} error */
function refusesUnchanged(state, call, error) {
  const before = structuredClone(state);
  assert.deepEqual(call(), { ok: false, error });
  assert.deepEqual(state, before);
}

test('API contains every contract name, and defaults are frozen', () => {
  assert.deepEqual(Object.keys(D).sort(), [
    'DEFAULT_SETTINGS', 'MODES', 'modeOf', 'planned', 'settingsToSave', 'dayKey', 'addDays', 'daysBetween', 'initialState', 'hydrate',
    'rollDay', 'logDay', 'spendWatch', 'reveal', 'resolveCurrent', 'revealNext', 'buyIfOut', 'addBacklog',
    'firstDayUntil', 'removeBacklog', 'swapBacklog', 'swapFollow', 'editsSince', 'markProgress', 'charge', 'chargeTick', 'watchStatus', 'needThis', 'needThisUsed', 'needThisLeft', 'needThisBack', 'dryUntil', 'drySoon', 'enterDry', 'dryBackSeen', 'cleanSettings',
    'isLoosening', 'mayReveal', 'canDeal', 'updateSettings', 'cancelPending', 'refillSeen', 'caps', 'formatMinutes', 'stashedAgo', 'cleanVideo',
    'watchedSummary', 'weekView', 'cardsLine', 'redirectTarget', 'earlyLocked', 'devAction', 'toolbarGlass', 'toolbarPlaying',
    'exportData', 'importData', 'resetData',
    'ALLOW_MAX', 'channelId', 'cleanChannel', 'sameChannel', 'allowChannel', 'removeAllowed', 'blockChannel', 'unblockChannel',
    'cancelChannelPending', 'seenChannel', 'channelFromPage', 'allowedVideo', 'isFree', 'freeToStart', 'plannedChannels', 'allowCount', 'isAllowedOrWaiting',
  ].sort());
  assert.ok(Object.isFrozen(D.DEFAULT_SETTINGS));
  assert.deepEqual(D.DEFAULT_SETTINGS, {
    watchTokensPerDay: 4, minutesPerToken: 15, recTokensPerDay: 10,
    rolloverDays: 2, resetHour: 4, graceMode: false, dryHours: false, dryFrom: 23, dryTo: 6, needThisPerWeek: 3, feedSource: 'home', stashMax: 10,
    searchCap: true, cards: 'limited', clock: true, stash: true, hideBell: true, hideShorts: true, streams: false,
  });
  assert.ok(Object.isFrozen(D.MODES));
  assert.equal(D.modeOf(D.DEFAULT_SETTINGS), 'full');
});

test('toolbar playing rule needs a fresh ongoing tick and expires at 12 seconds', () => {
  const tick = { at: time(5), playing: true };
  const before = structuredClone(tick);
  assert.equal(D.toolbarPlaying(null, tick.at), false);
  assert.equal(D.toolbarPlaying(tick, tick.at), true);
  assert.equal(D.toolbarPlaying(tick, tick.at + 11999), true);
  assert.equal(D.toolbarPlaying(tick, tick.at + 12000), false);
  assert.equal(D.toolbarPlaying(tick, tick.at + 20000), false);
  assert.equal(D.toolbarPlaying({ ...tick, playing: false }, tick.at), false);
  assert.equal(D.toolbarPlaying({ at: tick.at }, tick.at), false);
  const delayed = { ...tick, ago: 5000 };
  assert.equal(D.toolbarPlaying(delayed, tick.at), true);
  assert.deepEqual(tick, before);
});

test('toolbar glass shows full, half, a sliver, and exactly empty without changing state', () => {
  for (const [left, fraction] of [[900, 1], [450, .5], [.001, .001 / 900], [0, 0]]) {
    const state = { ...fresh(), watchSecondsLeft: left, watchSecondsBought: 900, unlocked: ['abc'] };
    const before = structuredClone(state);
    const level = D.toolbarGlass(state, G);
    assert.equal(level.fraction, fraction);
    assert.equal(level.fraction, G.fraction(state));
    assert.deepEqual(state, before);
    if (fraction === 1) {
      assert.equal(level.water16, 0);
      assert.equal(level.water32, 0);
      assert.ok(Math.abs(level.surfaceOpacity - 1) < 1e-12);
    } else {
      assert.equal(level.surfaceOpacity, 0);
      assert.equal(level.water16, G.waterline(fraction, 16));
      assert.equal(level.water32, G.waterline(fraction, 32));
    }
    if (left > 0 && left < 1) {
      assert.ok((675 - level.water16) * 16 / G.viewBox.height >= 2);
      assert.ok((675 - level.water32) * 32 / G.viewBox.height >= 2);
      assert.notEqual(level.cacheKey, D.toolbarGlass({ watchSecondsLeft: 0, watchSecondsBought: 900 }, G).cacheKey);
    }
    if (left === 0) {
      assert.ok(level.water16 > 675);
      assert.equal(level.cacheKey, 'empty');
    }
  }
});

test('toolbar glass cache skips invisible changes and the minimum sliver, but tracks visible changes', () => {
  const level = (left) => D.toolbarGlass({ watchSecondsLeft: left, watchSecondsBought: 900 }, G);
  assert.equal(level(450).cacheKey, level(449.999).cacheKey);
  assert.notEqual(level(450).cacheKey, level(400).cacheKey);
  assert.equal(level(.001).cacheKey, level(1).cacheKey);
  assert.notEqual(level(.001).cacheKey, level(0).cacheKey);
  assert.equal(D.toolbarGlass({ watchSecondsLeft: 60, watchSecondsBought: 0 }, G).fraction, 1);
  assert.equal(level(1000).fraction, 1);
});

test('toolbar glass follows the mockup at nearly full, including the fading surface', () => {
  const state = { watchSecondsLeft: 975, watchSecondsBought: 1000 };
  const level = D.toolbarGlass(state, G);
  assert.ok(Math.abs(level.water32 - G.waterline(.95, 32) / 2) < 1e-10);
  assert.ok(Math.abs(level.water16 - G.waterline(.95, 16) / 2) < 1e-10);
  assert.ok(Math.abs(level.surfaceOpacity - .5) < 1e-10);
  assert.notEqual(level.cacheKey, D.toolbarGlass({ ...state, watchSecondsLeft: 1000 }, G).cacheKey);
});

test('dayKey turns over at the local reset hour', () => {
  assert.equal(D.dayKey(time(5, 3, 59), 4), '2026-10-04');
  assert.equal(D.dayKey(time(5, 4), 4), '2026-10-05');
  assert.equal(D.dayKey(time(5, 3, 59), 0), '2026-10-05');
  assert.equal(D.dayKey(time(5, 4), 0), '2026-10-05');
  assert.equal(D.dayKey(time(5, 0), 0), '2026-10-05');
  assert.equal(D.dayKey(new Date(2026, 0, 1, 3, 59).getTime(), 4), '2025-12-31');
});

test('UTC date math crosses months, leap days, years, and DST dates', () => {
  assert.equal(D.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(D.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(D.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(D.daysBetween('2026-10-05', '2026-10-05'), 0);
  assert.equal(D.daysBetween('2026-10-05', '2026-10-06'), 1);
  assert.equal(D.daysBetween('2026-10-05', '2026-11-04'), 30);
  assert.equal(D.daysBetween('2026-03-07', '2026-03-09'), 2);
  assert.equal(D.daysBetween('2026-10-31', '2026-11-02'), 2);
});

test('initialState has the specified shape and independent mutable values', () => {
  const state = fresh();
  assert.deepEqual(state, {
    version: 1, settings: { ...D.DEFAULT_SETTINGS }, pending: null, day: '2026-10-05',
    tokens: { watch: 4, rec: 10 }, watchSecondsLeft: 0, watchSecondsBought: 0,
    current: null, backlog: [], seen: [], unlocked: [], log: {}, refill: null, drySeen: 0, boughtAt: 0, dropsBought: 0, dryBack: null, installedAt: time(5),
    channels: { allow: [], block: [] }, channelsPending: null, allowedToday: [], firstDayOff: false, firstDayEnded: false, ticksIn: [],
  });
  state.settings.recTokensPerDay = 1;
  state.backlog.push(video('a'));
  state.tokens.watch = 0;
  assert.deepEqual(fresh().settings, D.DEFAULT_SETTINGS);
  assert.deepEqual(fresh().backlog, []);
  assert.equal(fresh().tokens.watch, 4);
});

test('rollDay leaves same and earlier days unchanged', () => {
  const state = fresh();
  state.watchSecondsLeft = 30;
  state.unlocked.push('a');
  const before = structuredClone(state);
  assert.equal(D.rollDay(state, time(5, 23)), false);
  assert.equal(D.rollDay(state, time(5, 3, 59)), false);
  assert.equal(D.rollDay(state, time(1)), false);
  assert.deepEqual(state, before);
});

test('next day grants tokens, expires minutes and unlocks, and preserves the reveal and backlog', () => {
  const state = fresh();
  D.reveal(state, [video('a')]);
  D.spendWatch(state);
  D.addBacklog(state, video('b'));
  state.unlocked = ['c'];
  assert.equal(D.rollDay(state, time(6, 3, 59)), false);
  assert.equal(D.rollDay(state, time(6, 4)), true);
  assert.equal(state.day, '2026-10-06');
  assert.deepEqual(state.tokens, { watch: 7, rec: 19 });
  assert.equal(state.watchSecondsLeft, 0);
  assert.deepEqual(state.unlocked, []);
  assert.deepEqual(state.current, video('a'));
  assert.deepEqual(state.backlog, [video('b')]);
  assert.deepEqual(state.seen, ['a']);
});

test('skipping five days caps balances at two days of allowance', () => {
  const state = fresh();
  state.tokens = { watch: 0, rec: 0 };
  assert.equal(D.rollDay(state, time(10)), true);
  assert.deepEqual(state.tokens, { watch: 8, rec: 20 });
  assert.deepEqual(state.refill, { day: '2026-10-10', watch: 8, rec: 20 });
});

test('the reset records what it added until refillSeen, and nothing when it added nothing', () => {
  const state = fresh();
  state.tokens = { watch: 3, rec: 20 };
  D.rollDay(state, time(6, 4));
  assert.deepEqual(state.refill, { day: '2026-10-06', watch: 4, rec: 0 }, 'cards were already at the cap');
  assert.deepEqual(D.refillSeen(state), { ok: true });
  assert.equal(state.refill, null);
  state.tokens = { watch: 8, rec: 20 };
  D.rollDay(state, time(7, 4));
  assert.equal(state.refill, null, 'both at the cap');
});

test('caps are a day of each token times the days kept', () => {
  assert.deepEqual(D.caps(D.DEFAULT_SETTINGS), { watch: 8, rec: 20 });
  assert.deepEqual(D.caps({ ...D.DEFAULT_SETTINGS, watchTokensPerDay: 48, recTokensPerDay: 100, rolloverDays: 7 }), { watch: 336, rec: 700 });
});

test('hydrate keeps a stored refill and drops a malformed one', () => {
  const stored = { ...fresh(), refill: { day: '2026-10-05', watch: 4, rec: 10 } };
  assert.deepEqual(D.hydrate(stored, time(5, 12)).refill, { day: '2026-10-05', watch: 4, rec: 10 });
  assert.deepEqual(D.hydrate({ ...stored, refill: { day: '2026-10-05', watch: -1, rec: 'x' } }, time(5, 12)).refill, { day: '2026-10-05', watch: 0, rec: 0 });
  assert.equal(D.hydrate({ ...stored, refill: { watch: 4 } }, time(5, 12)).refill, null);
  assert.equal(D.hydrate({ ...stored, refill: undefined }, time(5, 12)).refill, null);
});

test('logDay creates a zero entry only for the current day and reuses it', () => {
  const state = fresh();
  const entry = D.logDay(state);
  assert.deepEqual(entry, { watchedSec: 0, watchSpent: 0, recSpent: 0, saved: 0, passed: 0, watched: 0, needThis: [] });
  assert.strictEqual(D.logDay(state), entry);
  D.rollDay(state, time(6));
  const next = D.logDay(state);
  assert.notStrictEqual(next, entry);
  assert.notStrictEqual(next.needThis, entry.needThis);
});

test('spendWatch adds 900 seconds and logs one token; exhaustion is atomic', () => {
  const state = fresh();
  assert.deepEqual(D.spendWatch(state), { ok: true });
  assert.equal(state.tokens.watch, 3);
  assert.equal(state.watchSecondsLeft, 900);
  assert.equal(D.logDay(state).watchSpent, 1);
  D.spendWatch(state);
  assert.equal(state.watchSecondsLeft, 1800);
  state.tokens.watch = 0;
  refusesUnchanged(state, () => D.spendWatch(state), 'no-watch-tokens');
});

test('spendWatch uses configured minutes per token', () => {
  const state = fresh();
  state.settings.minutesPerToken = 2;
  D.spendWatch(state);
  assert.equal(state.watchSecondsLeft, 120);
});

test('reveal errors have the specified priority and never mutate state', () => {
  const state = fresh();
  state.current = video('a');
  state.tokens.rec = 0;
  refusesUnchanged(state, () => D.reveal(state, []), 'resolve-current');
  state.current = null;
  refusesUnchanged(state, () => D.reveal(state, []), 'no-rec-tokens');
  state.tokens.rec = 1;
  refusesUnchanged(state, () => D.reveal(state, []), 'pool-empty');
});

test('reveal skips seen and backlog ids and selects the first qualifying video', () => {
  const state = fresh();
  state.seen = ['seen'];
  state.backlog = [video('saved')];
  const chosen = video('new');
  assert.deepEqual(D.reveal(state, [video('seen'), video('saved'), chosen, video('later')]), { ok: true, video: chosen });
  assert.deepEqual(state.current, chosen);
  assert.equal(state.tokens.rec, 9);
  assert.equal(D.logDay(state).recSpent, 1);
  assert.deepEqual(state.seen, ['seen', 'new']);
  D.resolveCurrent(state, 'pass');
  refusesUnchanged(state, () => D.reveal(state, [video('seen'), video('saved'), chosen]), 'pool-empty');
});

test('a reveal never deals an upcoming or members-only video, and deals streams only when Settings allows them', () => {
  /** @param {string} id @param {string} kind */
  const as = (id, kind) => ({ ...video(id), kind });
  assert.equal(D.mayReveal(as('a', 'video'), D.DEFAULT_SETTINGS), true);
  assert.equal(D.mayReveal(video('a'), D.DEFAULT_SETTINGS), true, 'no kind is a normal video');
  for (const kind of ['upcoming', 'members']) {
    assert.equal(D.mayReveal(as('a', kind), D.DEFAULT_SETTINGS), false, kind);
    assert.equal(D.mayReveal(as('a', kind), { ...D.DEFAULT_SETTINGS, streams: true }), false, `${kind} with streams on`);
  }
  for (const kind of ['live', 'streamed']) {
    assert.equal(D.mayReveal(as('a', kind), D.DEFAULT_SETTINGS), false, kind);
    assert.equal(D.mayReveal(as('a', kind), { ...D.DEFAULT_SETTINGS, streams: true }), true, `${kind} with streams on`);
  }

  const { streams, ...old } = D.DEFAULT_SETTINGS;
  assert.equal(D.mayReveal(as('a', 'live'), old), false, 'settings from before streams existed');

  const state = fresh();
  const pool = [as('soon', 'upcoming'), as('paid', 'members'), as('now', 'live'), as('vod', 'streamed'), as('plain', 'video')];
  assert.deepEqual(D.reveal(state, pool), { ok: true, video: video('plain') }, 'the kind is not kept on the card');
  assert.deepEqual(state.seen, ['plain'], 'skipped videos are not marked seen, so a later setting can still deal them');
  D.resolveCurrent(state, 'pass');
  refusesUnchanged(state, () => D.reveal(state, pool.slice(0, 4)), 'pool-empty');
  state.settings.streams = true;
  assert.equal(D.reveal(state, pool).video.id, 'now');

  assert.equal(D.canDeal(state, as('vod', 'streamed')), true);
  assert.equal(D.canDeal(state, video('plain')), false, 'seen');
  assert.equal(D.canDeal(state, { id: 'bad id!' }), false, 'not a video');

  const next = fresh();
  D.reveal(next, [video('a')]);
  refusesUnchanged(next, () => D.revealNext(next, 'a', [as('soon', 'upcoming'), as('now', 'live')]), 'pool-empty');
  assert.equal(D.revealNext(next, 'a', [as('soon', 'upcoming'), video('b')]).video.id, 'b');
});

test('seen retains the newest 2000 ids', () => {
  const state = fresh();
  state.seen = Array.from({ length: 2000 }, (_, i) => String(i));
  D.reveal(state, [video('new')]);
  assert.equal(state.seen.length, 2000);
  assert.equal(state.seen[0], '1');
  assert.equal(state.seen.at(-1), 'new');
});

for (const action of /** @type {const} */ (['watch', 'pass'])) {
  test(`resolveCurrent ${action} clears the card and logs it once`, () => {
    const state = fresh();
    state.watchSecondsLeft = 60;
    const chosen = video('a');
    D.reveal(state, [chosen]);
    const tokens = { ...state.tokens };
    const res = D.resolveCurrent(state, action);
    assert.deepEqual(res, action === 'watch' ? { ok: true, video: chosen, bought: false } : { ok: true, video: chosen });
    assert.equal(state.current, null);
    assert.deepEqual(state.tokens, tokens);
    assert.deepEqual(state.backlog, []);
    assert.equal(D.logDay(state).watched, action === 'watch' ? 1 : 0);
    assert.equal(D.logDay(state).passed, action === 'pass' ? 1 : 0);
  });
}

test('save keeps the card up, counts once, and unsave takes it back (Q13)', () => {
  const state = fresh();
  const chosen = video('a');
  D.reveal(state, [chosen]);
  assert.deepEqual(D.resolveCurrent(state, 'save', 'a'), { ok: true, video: chosen });
  assert.deepEqual(state.current, chosen);
  assert.deepEqual(state.backlog, [chosen]);
  D.resolveCurrent(state, 'save', 'a');
  assert.equal(state.backlog.length, 1);
  assert.equal(D.logDay(state).saved, 1);
  assert.deepEqual(D.resolveCurrent(state, 'unsave', 'a'), { ok: true, video: chosen });
  assert.deepEqual(state.current, chosen);
  assert.deepEqual(state.backlog, []);
  assert.equal(D.logDay(state).saved, 0);
});

test('the card counts as saved once, whether Save or the Saved list moves it (Codex)', () => {
  const state = fresh();
  D.reveal(state, [video('a')]);
  D.resolveCurrent(state, 'save');
  D.removeBacklog(state, 'a');
  assert.equal(D.logDay(state).saved, 0);
  D.addBacklog(state, video('a'), 0);
  assert.equal(D.logDay(state).saved, 1);
  D.resolveCurrent(state, 'save');
  assert.equal(D.logDay(state).saved, 1);
  D.removeBacklog(state, 'a');
  D.resolveCurrent(state, 'pass');
  assert.deepEqual([D.logDay(state).saved, D.logDay(state).passed], [0, 1]);
  D.addBacklog(state, video('b'));
  D.removeBacklog(state, 'b');
  assert.equal(D.logDay(state).saved, 0);
});

test('a saved card that is passed stays saved and counts as saved, not passed', () => {
  const state = fresh();
  D.reveal(state, [video('a')]);
  D.resolveCurrent(state, 'save');
  D.resolveCurrent(state, 'pass');
  assert.equal(state.current, null);
  assert.deepEqual(state.backlog, [video('a')]);
  assert.deepEqual([D.logDay(state).saved, D.logDay(state).passed, D.logDay(state).watched], [1, 0, 0]);
});

test('a saved card that is watched counts as watched, by its last outcome', () => {
  const state = fresh();
  state.watchSecondsLeft = 60;
  D.reveal(state, [video('a')]);
  D.resolveCurrent(state, 'save');
  D.resolveCurrent(state, 'watch');
  assert.deepEqual(state.backlog, [video('a')]);
  assert.deepEqual([D.logDay(state).saved, D.logDay(state).passed, D.logDay(state).watched], [0, 0, 1]);
});

test('watch at 0 minutes buys one drop of minutes (Q18)', () => {
  const state = fresh();
  D.reveal(state, [video('a')]);
  assert.deepEqual(D.resolveCurrent(state, 'watch'), { ok: true, video: video('a'), bought: true });
  assert.equal(state.tokens.watch, 3);
  assert.equal(state.watchSecondsLeft, 15 * 60);
  assert.equal(state.watchSecondsBought, 15 * 60);
  assert.equal(D.logDay(state).watchSpent, 1);
});

test('watch at 0 minutes and 0 drops still ends the card and buys nothing', () => {
  const state = fresh();
  state.tokens.watch = 0;
  D.reveal(state, [video('a')]);
  assert.deepEqual(D.resolveCurrent(state, 'watch'), { ok: true, video: video('a'), bought: false });
  assert.equal(state.current, null);
  assert.equal(state.watchSecondsLeft, 0);
});

test('buyIfOut buys only at 0 minutes, and never for an unlocked video', () => {
  const state = fresh();
  state.unlocked = ['u'];
  assert.deepEqual(D.buyIfOut(state, 'u'), { ok: true, bought: false });
  assert.deepEqual(D.buyIfOut(state, 'a'), { ok: true, bought: true });
  assert.deepEqual(D.buyIfOut(state, 'a'), { ok: true, bought: false });
  assert.equal(state.tokens.watch, 3);
});

test('revealNext passes the card and reveals the next in one step (Q13)', () => {
  const state = fresh();
  D.reveal(state, [video('a')]);
  assert.deepEqual(D.revealNext(state, 'a', [video('a'), video('b')]), { ok: true, video: video('b') });
  assert.deepEqual(state.current, video('b'));
  assert.equal(state.tokens.rec, 8);
  assert.equal(D.logDay(state).passed, 1);
  assert.equal(D.logDay(state).recSpent, 2);
});

test('revealNext changes nothing on an error, so the card stays up', () => {
  const state = fresh();
  D.reveal(state, [video('a')]);
  refusesUnchanged(state, () => D.revealNext(state, 'a', [video('a')]), 'pool-empty');
  refusesUnchanged(state, () => D.revealNext(state, 'old', [video('b')]), 'stale-card');
  state.tokens.rec = 0;
  refusesUnchanged(state, () => D.revealNext(state, 'a', [video('b')]), 'no-rec-tokens');
  state.current = null;
  refusesUnchanged(state, () => D.revealNext(state, 'a', [video('b')]), 'no-current');
});

test('addBacklog puts an undone removal back where it was', () => {
  const state = fresh();
  for (const id of ['a', 'b', 'c']) D.addBacklog(state, video(id));
  D.removeBacklog(state, 'b');
  D.addBacklog(state, video('b'), 1);
  assert.deepEqual(state.backlog.map((v) => v.id), ['a', 'b', 'c']);
  D.addBacklog(state, video('d'), 99);
  D.addBacklog(state, video('e'), -3);
  assert.deepEqual(state.backlog.map((v) => v.id), ['e', 'a', 'b', 'c', 'd']);
});

test('the glass: buying fills watchSecondsBought, the reset empties it, and old state counts as full', () => {
  const state = fresh();
  D.spendWatch(state);
  D.spendWatch(state);
  assert.equal(state.watchSecondsBought, 30 * 60);
  D.rollDay(state, time(6));
  assert.equal(state.watchSecondsBought, 0);
  const old = /** @type {any} */ (fresh());
  delete old.watchSecondsBought;
  old.watchSecondsLeft = 600;
  assert.equal(D.hydrate(old, time(5)).watchSecondsBought, 600);
});

test('resolveCurrent without a reveal is atomic', () => {
  const state = fresh();
  refusesUnchanged(state, () => D.resolveCurrent(state, 'save'), 'no-current');
});

test('backlog operations preserve order, do not duplicate, and cost nothing', () => {
  const state = fresh();
  const tokens = { ...state.tokens };
  assert.deepEqual(D.addBacklog(state, video('a')), { ok: true });
  D.addBacklog(state, video('b'));
  assert.deepEqual(D.addBacklog(state, { ...video('a'), title: 'Duplicate' }), { ok: true });
  assert.deepEqual(state.backlog, [video('a'), video('b')]);
  assert.deepEqual(D.removeBacklog(state, 'a'), { ok: true });
  assert.deepEqual(state.backlog, [video('b')]);
  assert.deepEqual(D.removeBacklog(state, 'missing'), { ok: true });
  assert.deepEqual(state.tokens, tokens);
  assert.deepEqual(state.log, {});
});

test('a full stash refuses a new video, and Undo still puts a row back (Q28)', () => {
  const state = fresh();
  state.settings.stashMax = 2;
  D.addBacklog(state, video('a'));
  D.addBacklog(state, video('b'));
  refusesUnchanged(state, () => D.addBacklog(state, video('c')), 'stash-full');
  assert.deepEqual(D.addBacklog(state, video('a')), { ok: true });
  D.removeBacklog(state, 'a');
  D.addBacklog(state, video('c'));
  assert.deepEqual(D.addBacklog(state, video('a'), 0), { ok: true });
  assert.deepEqual(state.backlog.map(v => v.id), ['a', 'b', 'c']);
});

test('Stash on a card in a full stash refuses, keeps the card up, and counts nothing', () => {
  const state = fresh();
  state.settings.stashMax = 1;
  D.addBacklog(state, video('a'));
  D.reveal(state, [video('b')]);
  refusesUnchanged(state, () => D.resolveCurrent(state, 'save', 'b'), 'stash-full');
  assert.equal(state.current?.id, 'b');
});

test('a lowered cap keeps every stashed video and blocks new ones until under it', () => {
  const state = fresh();
  for (const id of ['a', 'b', 'c']) D.addBacklog(state, video(id));
  assert.deepEqual(D.updateSettings(state, { stashMax: 2 }).applied, { stashMax: 2 });
  assert.equal(state.backlog.length, 3);
  refusesUnchanged(state, () => D.addBacklog(state, video('d')), 'stash-full');
  D.removeBacklog(state, 'a');
  refusesUnchanged(state, () => D.addBacklog(state, video('d')), 'stash-full');
  D.removeBacklog(state, 'b');
  assert.deepEqual(D.addBacklog(state, video('d')), { ok: true });
  assert.deepEqual(D.updateSettings(state, { stashMax: 20 }).pending, { stashMax: 20 });
});

test('swapBacklog drops one video and stashes the new one as the newest', () => {
  const state = fresh();
  state.settings.stashMax = 2;
  D.addBacklog(state, video('a'));
  D.addBacklog(state, video('b'));
  assert.deepEqual(D.swapBacklog(state, video('c'), 'a'), { ok: true, dropped: video('a') });
  assert.deepEqual(state.backlog.map(v => v.id), ['b', 'c']);
  // Already stashed, as by another tab while the list was open: nothing swapped, so no Undo (Codex).
  assert.deepEqual(D.swapBacklog(state, video('c'), 'b'), { ok: true });
  assert.deepEqual(state.backlog.map(v => v.id), ['b', 'c']);
  refusesUnchanged(state, () => D.swapBacklog(state, video('d'), 'missing'), 'not-stashed');
  refusesUnchanged(state, () => D.swapBacklog(state, { id: 'bad id' }, 'b'), 'bad-video');
  state.settings.stashMax = 1;
  assert.deepEqual(D.swapBacklog(state, video('d'), 'b'), { ok: true, dropped: video('b') });
  assert.deepEqual(state.backlog.map(v => v.id), ['c', 'd']);
});

test('swapping the card into the stash counts it as saved once', () => {
  const state = fresh();
  state.settings.stashMax = 1;
  D.addBacklog(state, video('a'));
  D.reveal(state, [video('b')]);
  D.swapBacklog(state, video('b'), 'a');
  assert.equal(D.logDay(state).saved, 1);
  D.removeBacklog(state, 'b');
  assert.equal(D.logDay(state).saved, 0);
});

test('stashing keeps when, and Undo and swaps keep the time a video came with', () => {
  const state = fresh();
  D.addBacklog(state, video('a'), undefined, time(5, 9));
  assert.equal(state.backlog[0].addedAt, time(5, 9));
  D.addBacklog(state, { ...video('b'), addedAt: time(1) }, 0, time(5));
  assert.equal(state.backlog[0].addedAt, time(1));
  D.reveal(state, [video('c')]);
  state.settings.stashMax = 3;
  D.resolveCurrent(state, 'save', 'c', time(5, 10));
  assert.equal(state.backlog[2].addedAt, time(5, 10));
  D.swapBacklog(state, video('d'), 'a', undefined, time(5, 11));
  assert.deepEqual(state.backlog.map(v => [v.id, v.addedAt]), [['b', time(1)], ['c', time(5, 10)], ['d', time(5, 11)]]);
});

test('Undo of a swap puts the swapped-out video back where it was', () => {
  const state = fresh();
  state.settings.stashMax = 3;
  for (const id of ['a', 'b', 'c']) D.addBacklog(state, video(id));
  D.swapBacklog(state, video('d'), 'b');
  assert.deepEqual(state.backlog.map(v => v.id), ['a', 'c', 'd']);
  D.swapBacklog(state, video('b'), 'd', 1, time(6));
  assert.deepEqual(state.backlog.map(v => v.id), ['a', 'b', 'c']);
  assert.equal(state.backlog[1].addedAt, undefined);
  D.addBacklog(state, video('e'), 0, time(6));
  assert.equal(state.backlog[0].addedAt, undefined);
});

test('Undo of a swap restores the video even when the new one already left the stash (Codex)', () => {
  const state = fresh();
  state.settings.stashMax = 2;
  D.addBacklog(state, video('a'));
  D.addBacklog(state, video('b'));
  D.swapBacklog(state, video('c'), 'a');
  D.removeBacklog(state, 'c');
  assert.deepEqual(D.swapBacklog(state, video('a'), 'c', 0), { ok: true, dropped: null });
  assert.deepEqual(state.backlog.map(v => v.id), ['a', 'b']);
});

test('Undo of a swap takes the new video out even when the old one is already back (Codex)', () => {
  const state = fresh();
  state.settings.stashMax = 2;
  D.addBacklog(state, video('a'));
  D.addBacklog(state, video('b'));
  D.swapBacklog(state, video('c'), 'a');
  D.removeBacklog(state, 'b');
  D.addBacklog(state, video('a'));
  assert.equal(D.swapBacklog(state, video('a'), 'c', 0).ok, true);
  assert.deepEqual(state.backlog.map(v => v.id), ['a']);
});

test('a swap returns the video it took out with its latest progress, for Undo (Codex)', () => {
  const state = fresh();
  state.settings.stashMax = 1;
  D.addBacklog(state, video('a'));
  D.markProgress(state, 'a', 450, 900);
  const res = D.swapBacklog(state, video('b'), 'a');
  assert.equal(res.dropped.resumeSec, 450);
  D.swapBacklog(state, res.dropped, 'b', 0);
  assert.equal(state.backlog[0].resumeSec, 450);
});

test('stashedAgo counts calendar days', () => {
  assert.equal(D.stashedAgo(undefined, time(10)), '');
  assert.equal(D.stashedAgo(time(10, 0, 5), time(10, 23)), 'Today');
  assert.equal(D.stashedAgo(time(9, 23), time(10, 0, 30)), 'Yesterday');
  assert.equal(D.stashedAgo(time(4), time(10)), '6 days ago');
  assert.equal(D.stashedAgo(new Date(2026, 8, 19).getTime(), time(10)), '3 weeks ago');
  assert.equal(D.stashedAgo(new Date(2026, 6, 1).getTime(), time(10)), '3 months ago');
  assert.equal(D.stashedAgo(time(12), time(10)), 'Today');
});

test('markProgress keeps how far a stashed video got, and nothing for other videos', () => {
  const state = fresh();
  D.addBacklog(state, video('a'));
  D.markProgress(state, 'a', 61.6, 842.2);
  assert.deepEqual(state.backlog[0], { ...video('a'), resumeSec: 62, durationSec: 842 });
  D.markProgress(state, 'a', 900, undefined);
  assert.equal(state.backlog[0].resumeSec, 842);
  D.markProgress(state, 'a', NaN, 842);
  assert.equal(state.backlog[0].resumeSec, 842);
  const before = structuredClone(state);
  assert.deepEqual(D.markProgress(state, 'zzz', 30, 100), { ok: true });
  assert.deepEqual(state, before);
});

test('cleanVideo keeps valid optional fields and drops bad ones', () => {
  assert.deepEqual(D.cleanVideo({ ...video('a'), resumeSec: 30.4, durationSec: 20 }), { ...video('a'), resumeSec: 20, durationSec: 20 });
  assert.deepEqual(D.cleanVideo({ ...video('a'), resumeSec: -5, durationSec: 'long' }), video('a'));
  const feed = { views: '394K views', age: '3d ago' };
  assert.deepEqual(D.cleanVideo({ ...video('a'), ...feed }), { ...video('a'), ...feed });
  assert.deepEqual(D.cleanVideo({ ...video('a'), views: '', age: '' }), video('a'));
  assert.deepEqual(D.cleanVideo({ ...video('a'), views: 394000, age: 3 }), video('a'));
  const state = D.hydrate({ backlog: [{ ...video('a'), resumeSec: 12 }] }, time(5));
  assert.equal(state.backlog[0].resumeSec, 12);
});

test('charge drains seconds, floors at zero, logs actual watched time, and reports lock status', () => {
  const state = fresh();
  assert.deepEqual(D.watchStatus(state, 'a'), { secondsLeft: 0, unlocked: false, allowed: false, locked: true });
  state.watchSecondsLeft = 10;
  assert.deepEqual(D.charge(state, 2.5, 'a'), { secondsLeft: 7.5, unlocked: false, allowed: false, locked: false });
  assert.deepEqual(D.charge(state, 20, 'a'), { secondsLeft: 0, unlocked: false, allowed: false, locked: true });
  assert.equal(D.logDay(state).watchedSec, 22.5);
});

test('unlocked videos still log watched seconds without draining the balance', () => {
  const state = fresh();
  D.needThis(state, 'a', 'Title', 'For work', time(5));
  state.watchSecondsLeft = 40;
  assert.deepEqual(D.charge(state, 60, 'a'), { secondsLeft: 40, unlocked: true, allowed: false, locked: false });
  assert.equal(D.logDay(state).watchedSec, 60);
  D.charge(state, 40, 'b');
  assert.deepEqual(D.watchStatus(state, 'a'), { secondsLeft: 0, unlocked: true, allowed: false, locked: false });
  assert.deepEqual(D.watchStatus(state, 'b'), { secondsLeft: 0, unlocked: false, allowed: false, locked: true });
  assert.equal(D.logDay(state).watchedSec, 100);
});

const DAY_MS = 24 * 3600 * 1000;
const WEEK_MS = 7 * DAY_MS;
/** Adds a logged "I need this one" use, as needThis would have on that day. @param {ReturnType<typeof fresh>} state @param {string} day @param {number} at */
function logUse(state, day, at, videoId = `v${at}`) {
  if (!state.log[day]) state.log[day] = structuredClone(D.logDay(state));
  state.log[day].needThis.push({ videoId, title: '', reason: 'Old reason', at });
}

test('needThis validates a trimmed reason, logs its text and time, and enforces the weekly limit', () => {
  const state = fresh();
  refusesUnchanged(state, () => D.needThis(state, 'a', 'A', '  ab ', time(5)), 'reason-required');
  assert.deepEqual(D.needThis(state, 'a', 'A', '  Work tutorial  ', time(5)), { ok: true });
  assert.deepEqual(D.logDay(state).needThis, [{ videoId: 'a', title: 'A', reason: 'Work tutorial', at: time(5) }]);
  assert.deepEqual(D.needThis(state, 'b', 'B', 'Homework', time(5)), { ok: true });
  assert.deepEqual(D.needThis(state, 'c', 'C', 'Homework', time(5)), { ok: true });
  refusesUnchanged(state, () => D.needThis(state, 'd', 'D', 'ab', time(5)), 'reason-required');
  refusesUnchanged(state, () => D.needThis(state, 'd', 'D', 'Homework', time(5)), 'need-this-limit');
  const before = structuredClone(state);
  assert.deepEqual(D.needThis(state, 'a', 'A', 'Different reason', time(5)), { ok: true }, 'the same video twice in a day costs nothing');
  assert.deepEqual(state, before);
  refusesUnchanged(state, () => D.needThis(state, 'a', 'A', 'ab', time(5)), 'reason-required');
  // The reset empties the free list but not the week's count.
  D.rollDay(state, time(6));
  assert.deepEqual(state.unlocked, []);
  refusesUnchanged(state, () => D.needThis(state, 'd', 'D', 'Homework', time(6)), 'need-this-limit');
  refusesUnchanged(state, () => D.needThis(state, 'a', 'A', 'Homework', time(6)), 'need-this-limit');
});

test('needThis allows again once the oldest use in the week ages out', () => {
  const state = fresh();
  D.needThis(state, 'a', 'A', 'Study', time(5, 12));
  D.needThis(state, 'b', 'B', 'Study', time(5, 13));
  D.needThis(state, 'c', 'C', 'Study', time(5, 14));
  D.rollDay(state, time(12, 11));
  assert.equal(D.needThisBack(state, time(12, 11)), time(5, 12) + WEEK_MS);
  refusesUnchanged(state, () => D.needThis(state, 'a', 'A', 'Study again', time(12, 11, 59)), 'need-this-limit');
  assert.deepEqual(D.needThis(state, 'a', 'A', 'Study again', time(5, 12) + WEEK_MS), { ok: true }, "a video unlocked last week costs a new one today");
  assert.equal(D.needThisLeft(state, time(5, 12) + WEEK_MS), 0);
  assert.equal(D.needThisBack(state, time(5, 12) + WEEK_MS), time(5, 13) + WEEK_MS);
});

test('needThis allowance zero refuses without creating a log', () => {
  const state = fresh();
  state.settings.needThisPerWeek = 0;
  refusesUnchanged(state, () => D.needThis(state, 'a', 'A', 'Study', time(5)), 'need-this-limit');
});

test('the week counts uses within the last 7 × 24 hours, across resets', () => {
  const now = time(12, 12);
  const state = D.initialState(now);
  assert.equal(D.needThisUsed(state, now), 0);
  assert.equal(D.needThisLeft(state, now), 3);
  logUse(state, '2026-10-06', now - 6 * DAY_MS);
  assert.equal(D.needThisUsed(state, now), 1, '6 days ago counts');
  logUse(state, '2026-10-05', now - WEEK_MS);
  assert.equal(D.needThisUsed(state, now), 1, 'exactly 7 days ago has aged out');
  logUse(state, '2026-10-05', now - WEEK_MS - 60000);
  assert.equal(D.needThisUsed(state, now), 1, '7 days and a minute ago has aged out');
  logUse(state, '2026-10-11', now - DAY_MS);
  assert.equal(D.needThisUsed(state, now), 2, 'yesterday, before the reset, counts');
  assert.equal(D.needThisLeft(state, now), 1);
});

test('a use with no time never counts, and one in the future counts as now', () => {
  const now = time(12, 12);
  const state = D.initialState(now);
  logUse(state, '2026-10-11', 0);
  state.log['2026-10-11'].needThis.push(/** @type {any} */ ({ videoId: 'x', title: '', reason: 'No time' }));
  state.log['2026-10-11'].needThis.push(/** @type {any} */ ({ videoId: 'y', title: '', reason: 'Bad time', at: 'soon' }));
  assert.equal(D.needThisUsed(state, now), 0);
  logUse(state, '2026-10-12', now + 3 * DAY_MS);
  assert.equal(D.needThisUsed(state, now), 1, 'after the clock went back');
  assert.equal(D.needThisUsed(state, now + 6 * DAY_MS), 1, 'and it still counts as used no later than now');
});

test('needThisLeft never goes below zero, and needThisBack says when one comes back', () => {
  const now = time(12, 12);
  const state = D.initialState(now);
  assert.equal(D.needThisBack(state, now), 0, 'nothing to wait for while some are left');
  logUse(state, '2026-10-06', now - 6 * DAY_MS);
  logUse(state, '2026-10-08', now - 4 * DAY_MS);
  logUse(state, '2026-10-10', now - 2 * DAY_MS);
  assert.equal(D.needThisLeft(state, now), 0);
  assert.equal(D.needThisBack(state, now), now + DAY_MS, 'the oldest use plus 7 days');
  // Lowered from 3 to 1: all three have to age out before one is free.
  state.settings.needThisPerWeek = 1;
  assert.equal(D.needThisLeft(state, now), 0);
  assert.equal(D.needThisBack(state, now), now + 5 * DAY_MS);
  state.settings.needThisPerWeek = 2;
  assert.equal(D.needThisBack(state, now), now + 3 * DAY_MS, 'at 2, the two oldest');
  state.settings.needThisPerWeek = 0;
  assert.equal(D.needThisBack(state, now), 0, 'none ever come back at a limit of 0');
  state.settings.needThisPerWeek = 5;
  assert.equal(D.needThisLeft(state, now), 2);
  assert.equal(D.needThisBack(state, now), 0);
});

test('raising the weekly count waits for the reset, lowering applies, and the first day applies both', () => {
  const state = fresh();
  assert.deepEqual(D.updateSettings(state, { needThisPerWeek: 5 }).pending, { needThisPerWeek: 5 });
  assert.equal(state.settings.needThisPerWeek, 3);
  assert.deepEqual(D.updateSettings(state, { needThisPerWeek: 1 }).applied, { needThisPerWeek: 1 });
  assert.equal(state.pending, null);
  const firstDay = fresh();
  assert.deepEqual(D.updateSettings(firstDay, { needThisPerWeek: 5 }, time(5, 13)).applied, { needThisPerWeek: 5 });
  assert.deepEqual(D.updateSettings(firstDay, { needThisPerWeek: 2 }, time(5, 13)).applied, { needThisPerWeek: 2 });
});

test('the old daily setting drops away from stored state, waiting changes, and imports', () => {
  const stored = fresh();
  const raw = /** @type {any} */ (structuredClone(stored));
  raw.settings.needThisPerDay = 7;
  delete raw.settings.needThisPerWeek;
  raw.pending = { effectiveDay: '2026-10-06', changes: { needThisPerDay: 9 } };
  const state = D.hydrate(raw, time(5));
  assert.equal('needThisPerDay' in state.settings, false);
  assert.equal(state.settings.needThisPerWeek, 3);
  assert.equal(state.pending, null);
  const file = JSON.parse(JSON.stringify(D.exportData(fresh(), time(5))));
  file.settings.needThisPerDay = 7;
  delete file.settings.needThisPerWeek;
  const into = fresh();
  D.importData(into, file, time(5));
  assert.equal('needThisPerDay' in into.settings, false);
  assert.equal(into.settings.needThisPerWeek, 3);
});

test('cleanSettings rounds and clamps every numeric range, drops unknown and invalid values', () => {
  assert.deepEqual(D.cleanSettings({ minutesPerToken: 0, recTokensPerDay: 500, watchTokensPerDay: 2.6, rolloverDays: 0, resetHour: 30, needThisPerWeek: -1, stashMax: 0, unknown: 5, feedSource: 'bad', graceMode: 1 }), {
    minutesPerToken: 1, recTokensPerDay: 100, watchTokensPerDay: 3,
    rolloverDays: 1, resetHour: 23, needThisPerWeek: 0, stashMax: 1, graceMode: true,
  });
  assert.deepEqual(D.cleanSettings({ minutesPerToken: 999, recTokensPerDay: -1, watchTokensPerDay: 99, rolloverDays: 99, resetHour: -1, needThisPerWeek: 99, stashMax: 99, feedSource: 'subscriptions', graceMode: 0 }), {
    minutesPerToken: 120, recTokensPerDay: 0, watchTokensPerDay: 48,
    rolloverDays: 7, resetHour: 0, needThisPerWeek: 20, stashMax: 50, feedSource: 'subscriptions', graceMode: false,
  });
  assert.deepEqual(D.cleanSettings({ recTokensPerDay: NaN, minutesPerToken: Infinity, resetHour: '5', watchTokensPerDay: null }), {});
  assert.deepEqual(D.cleanSettings({ streams: true }), { streams: true });
  assert.deepEqual(D.cleanSettings({ streams: 'yes' }), {});
  assert.deepEqual(D.cleanSettings(undefined), {});
});

test('isLoosening classifies numeric limits, reset hour, grace mode, and feed', () => {
  for (const key of /** @type {const} */ (['watchTokensPerDay', 'minutesPerToken', 'recTokensPerDay', 'rolloverDays', 'needThisPerWeek', 'stashMax'])) {
    assert.equal(D.isLoosening(key, 1, 2), true);
    assert.equal(D.isLoosening(key, 2, 1), false);
    assert.equal(D.isLoosening(key, 2, 2), false);
  }
  assert.equal(D.isLoosening('resetHour', 4, 0), true);
  assert.equal(D.isLoosening('resetHour', 4, 5), true);
  assert.equal(D.isLoosening('resetHour', 4, 4), false);
  assert.equal(D.isLoosening('graceMode', false, true), true);
  assert.equal(D.isLoosening('graceMode', true, false), false);
  assert.equal(D.isLoosening('streams', false, true), true);
  assert.equal(D.isLoosening('streams', true, false), false);
  assert.equal(D.isLoosening('feedSource', 'home', 'subscriptions'), false);
});

test('updateSettings stages raises, applies decreases, and cancels pending keys', () => {
  const state = fresh();
  assert.deepEqual(D.updateSettings(state, { recTokensPerDay: 20 }), { ok: true, applied: {}, pending: { recTokensPerDay: 20 } });
  assert.equal(state.settings.recTokensPerDay, 10);
  assert.deepEqual(state.pending, { effectiveDay: '2026-10-06', changes: { recTokensPerDay: 20 } });
  assert.deepEqual(D.updateSettings(state, { recTokensPerDay: 5 }), { ok: true, applied: { recTokensPerDay: 5 }, pending: {} });
  assert.equal(state.settings.recTokensPerDay, 5);
  assert.equal(state.pending, null);
  D.updateSettings(state, { recTokensPerDay: 20 });
  assert.deepEqual(D.updateSettings(state, { recTokensPerDay: 5 }), { ok: true, applied: {}, pending: {} });
  assert.equal(state.pending, null);
});

test('the first day after install applies every change at once, and moves today\'s balance with the allowance (Q6)', () => {
  const state = fresh();
  assert.equal(state.installedAt, time(5));
  assert.equal(D.firstDayUntil(state, time(5, 13)), time(6));
  const res = D.updateSettings(state, { watchTokensPerDay: 6, stashMax: 20, graceMode: true }, time(5, 13));
  assert.deepEqual(res, { ok: true, applied: { watchTokensPerDay: 6, stashMax: 20, graceMode: true }, pending: {} });
  assert.equal(state.pending, null);
  assert.equal(state.tokens.watch, 6);
  state.tokens.watch = 1;
  D.updateSettings(state, { watchTokensPerDay: 4, recTokensPerDay: 3 }, time(5, 14));
  assert.deepEqual(state.tokens, { watch: 0, rec: 3 });
});

test('a day after install, and for state from before installedAt, raises wait for the reset again (Q6)', () => {
  const state = fresh();
  assert.equal(D.firstDayUntil(state, time(6)), 0);
  assert.deepEqual(D.updateSettings(state, { stashMax: 20 }, time(6)).pending, { stashMax: 20 });
  assert.deepEqual(D.updateSettings(fresh(), { stashMax: 20 }).pending, { stashMax: 20 });
  const old = D.hydrate({ ...fresh(), installedAt: undefined }, time(5, 13));
  assert.equal(old.installedAt, 0);
  assert.equal(D.firstDayUntil(old, time(5, 13)), 0);
  assert.deepEqual(D.updateSettings(old, { stashMax: 20 }, time(5, 13)).pending, { stashMax: 20 });
  assert.equal(D.hydrate(fresh(), time(5, 13)).installedAt, time(5));
});

test('a clock before installation cannot reopen first-day settings (Q6, A20)', () => {
  const state = fresh();
  const beforeInstall = state.installedAt - 1;
  assert.equal(D.firstDayUntil(state, beforeInstall), 0);
  const result = D.updateSettings(state, { clock: false }, beforeInstall);
  assert.deepEqual(result.applied, {});
  assert.deepEqual(result.pending, { clock: false });
  assert.equal(state.settings.clock, true);
  assert.equal(D.firstDayUntil(state, state.installedAt), state.installedAt + DAY_MS, 'installation starts the window');
});

test('first-day expiry stays ended after clock rollback and storage reload (Q6, A20)', () => {
  const state = fresh();
  const until = state.installedAt + DAY_MS;
  D.rollDay(state, until - 1);
  assert.equal(D.firstDayUntil(state, until - 1), until);
  // The regular worker path must record expiry even when there is no new day to roll.
  assert.equal(D.rollDay(state, until), false);
  const reloaded = D.hydrate(JSON.parse(JSON.stringify(state)), time(5, 13));
  D.rollDay(reloaded, time(5, 13));
  assert.equal(D.firstDayUntil(reloaded, time(5, 13)), 0);
  const result = D.updateSettings(reloaded, { clock: false }, time(5, 13));
  assert.deepEqual(result.applied, {});
  assert.deepEqual(result.pending, { clock: false });
  assert.equal(reloaded.settings.clock, true);
  assert.equal(D.allowChannel(reloaded, { ids: ['@late'], name: 'Late' }, time(5, 13)).waits, true);
  D.devAction(reloaded, 'first-day-on', time(5, 13));
  assert.equal(D.firstDayUntil(reloaded, time(5, 13)), 0, 'the developer toggle cannot clear permanent expiry');
});

test('state saved before firstDayEnded defaults to an active first day only within its window (Q6, A20)', () => {
  const { firstDayEnded, ...stored } = fresh();
  const state = D.hydrate(stored, time(5, 13));
  assert.equal(state.firstDayEnded, false);
  assert.equal(D.firstDayUntil(state, time(5, 13)), time(6));
  D.rollDay(state, time(6));
  assert.equal(state.firstDayEnded, true);
  assert.equal(D.firstDayUntil(state, time(5, 13)), 0);
});

test('an earlier reset hour on the first day ends today at the new hour, without a refill', () => {
  const state = D.initialState(time(5, 2));
  assert.equal(state.day, '2026-10-04');
  state.tokens.watch = 1;
  state.watchSecondsLeft = 600;
  D.updateSettings(state, { resetHour: 0 }, time(5, 2, 30));
  assert.equal(state.day, '2026-10-05');
  assert.equal(D.rollDay(state, time(5, 3)), false);
  assert.equal(state.tokens.watch, 1);
  assert.equal(state.watchSecondsLeft, 600);
  D.updateSettings(state, { resetHour: 6 }, time(5, 3));
  assert.equal(state.day, '2026-10-05');
  assert.equal(D.rollDay(state, time(5, 7)), false);
});

// Q12, Jesse, 2026-11-05: after the reset hour changes, the next reset is the first one at the new hour at least 12
// hours after the last. Before, 11pm to midnight refilled at 11pm and again at midnight.

test('a reset hour moved from 11pm to midnight skips the midnight an hour later', () => {
  const state = fresh();
  state.settings.resetHour = 23;
  state.day = D.dayKey(time(5, 12), 23);
  D.updateSettings(state, { resetHour: 0 });
  assert.deepEqual(state.pending?.changes, { resetHour: 0 });
  state.tokens.watch = 0;
  assert.equal(D.rollDay(state, time(5, 23, 1)), true, 'the change applies at the 11pm reset');
  assert.equal(state.settings.resetHour, 0);
  assert.equal(state.tokens.watch, 4);
  state.tokens.watch = 0;
  assert.equal(D.rollDay(state, time(6, 0, 1)), false, 'midnight is an hour after the last reset');
  assert.equal(D.rollDay(state, time(6, 23, 59)), false);
  assert.equal(state.tokens.watch, 0);
  assert.equal(D.rollDay(state, time(7, 0, 1)), true, 'the next midnight, 25 hours after');
  assert.equal(state.tokens.watch, 4);
});

test('on the first day, 11pm to midnight at 11:30pm does not refill at midnight either', () => {
  const state = D.initialState(time(5, 23, 10));
  state.settings.resetHour = 23;
  state.day = D.dayKey(time(5, 23, 10), 23);
  state.tokens.watch = 0;
  assert.deepEqual(D.updateSettings(state, { resetHour: 0 }, time(5, 23, 30)).applied, { resetHour: 0 });
  assert.equal(D.rollDay(state, time(6, 0, 30)), false);
  assert.equal(state.tokens.watch, 0);
  assert.equal(D.rollDay(state, time(7, 0, 30)), true);
});

test('an earlier reset hour 12 hours or more away keeps its first reset, and a later one makes a long day', () => {
  const earlier = fresh();
  D.updateSettings(earlier, { resetHour: 3 });
  assert.equal(D.rollDay(earlier, time(6, 4)), true);
  assert.equal(D.rollDay(earlier, time(7, 3, 1)), true, '4am to 3am the next day is 23 hours');
  // A day is named for the date it starts at its reset hour, so 8pm on the 6th starts the 6th, the day that began at
  // 4am. The day runs to 8pm on the 7th, 40 hours. Longer than 24, so it hands nothing back.
  const later = fresh();
  D.updateSettings(later, { resetHour: 20 });
  assert.equal(D.rollDay(later, time(6, 4)), true);
  assert.equal(D.rollDay(later, time(6, 20, 1)), false);
  assert.equal(D.rollDay(later, time(7, 20, 1)), true);
});

test('settings result lists only this call, preserves other pending keys, and feeds apply now', () => {
  const state = fresh();
  D.updateSettings(state, { recTokensPerDay: 20 });
  assert.deepEqual(D.updateSettings(state, { watchTokensPerDay: 6, feedSource: 'subscriptions', minutesPerToken: 2 }), {
    ok: true, applied: { feedSource: 'subscriptions', minutesPerToken: 2 }, pending: { watchTokensPerDay: 6 },
  });
  assert.deepEqual(state.pending, { effectiveDay: '2026-10-06', changes: { recTokensPerDay: 20, watchTokensPerDay: 6 } });
  assert.equal(state.settings.feedSource, 'subscriptions');
  assert.equal(state.settings.minutesPerToken, 2);
  assert.deepEqual(D.updateSettings(state, { feedSource: 'bad', unknown: 2 }), { ok: true, applied: {}, pending: {} });
});

test('resetHour changes in both directions wait until tomorrow', () => {
  for (const hour of [0, 8]) {
    const state = fresh();
    assert.deepEqual(D.updateSettings(state, { resetHour: hour }), { ok: true, applied: {}, pending: { resetHour: hour } });
    assert.equal(state.settings.resetHour, 4);
    assert.deepEqual(state.pending, { effectiveDay: '2026-10-06', changes: { resetHour: hour } });
  }
});

test('graceMode true waits and false applies immediately or cancels its pending raise', () => {
  const state = fresh();
  D.updateSettings(state, { graceMode: true });
  assert.equal(state.settings.graceMode, false);
  assert.deepEqual(state.pending?.changes, { graceMode: true });
  D.updateSettings(state, { graceMode: false });
  assert.equal(state.pending, null);
  state.settings.graceMode = true;
  assert.deepEqual(D.updateSettings(state, { graceMode: false }), { ok: true, applied: { graceMode: false }, pending: {} });
  assert.equal(state.settings.graceMode, false);
});

test('rollDay applies pending on its effective day before granting the new allowance', () => {
  const state = fresh();
  state.tokens = { watch: 0, rec: 0 };
  D.updateSettings(state, { watchTokensPerDay: 6, recTokensPerDay: 20, rolloverDays: 3 });
  assert.equal(D.rollDay(state, time(6, 3, 59)), false);
  assert.equal(state.settings.recTokensPerDay, 10);
  assert.equal(D.rollDay(state, time(6, 4)), true);
  assert.equal(state.pending, null);
  assert.equal(state.settings.recTokensPerDay, 20);
  assert.deepEqual(state.tokens, { watch: 6, rec: 20 });
});

test('rollDay retains future pending and applies overdue pending across skipped days', () => {
  const state = fresh();
  state.tokens = { watch: 0, rec: 0 };
  state.pending = { effectiveDay: '2026-10-07', changes: { recTokensPerDay: 20 } };
  D.rollDay(state, time(6));
  assert.equal(state.settings.recTokensPerDay, 10);
  assert.ok(state.pending);
  D.rollDay(state, time(10));
  assert.equal(state.settings.recTokensPerDay, 20);
  assert.equal(state.tokens.rec, 40);
  assert.equal(state.pending, null);
});

test('pending resetHour uses the old boundary to trigger rollover', () => {
  const state = fresh();
  D.updateSettings(state, { resetHour: 8 });
  assert.equal(D.rollDay(state, time(6, 4)), true);
  assert.equal(state.settings.resetHour, 8);
  assert.equal(state.day, '2026-10-06');
  assert.equal(D.rollDay(state, time(6, 5)), false);
  assert.equal(state.day, '2026-10-06');
});

test('cancelPending drops one key, preserves others, and nulls an empty pending', () => {
  const state = fresh();
  D.updateSettings(state, { recTokensPerDay: 20, watchTokensPerDay: 6 });
  assert.deepEqual(D.cancelPending(state, 'recTokensPerDay'), { ok: true });
  assert.deepEqual(state.pending?.changes, { watchTokensPerDay: 6 });
  D.cancelPending(state, 'missing');
  assert.deepEqual(state.pending?.changes, { watchTokensPerDay: 6 });
  D.cancelPending(state, 'watchTokensPerDay');
  assert.equal(state.pending, null);
  assert.deepEqual(D.cancelPending(state, 'watchTokensPerDay'), { ok: true });
});

test('hydrate undefined equals initialState; partial storage gets settings and nested defaults', () => {
  assert.deepEqual(D.hydrate(undefined, time(5)), fresh());
  const state = D.hydrate({ settings: { resetHour: 0, recTokensPerDay: 5 }, tokens: { rec: 2 }, log: { '2026-10-04': { saved: 1 } } }, time(5, 3));
  assert.equal(state.day, '2026-10-05');
  assert.deepEqual(state.settings, { ...D.DEFAULT_SETTINGS, resetHour: 0, recTokensPerDay: 5 });
  assert.deepEqual(state.tokens, { watch: 4, rec: 2 });
  assert.deepEqual(state.log['2026-10-04'], { watchedSec: 0, watchSpent: 0, recSpent: 0, saved: 1, passed: 0, watched: 0, needThis: [] });
  assert.deepEqual(state.backlog, []);
  assert.equal(state.pending, null);
});

test('hydrate preserves saved balances, history, pending changes, and does not roll the day', () => {
  const raw = fresh();
  D.reveal(raw, [video('a')]);
  D.addBacklog(raw, video('b'));
  D.spendWatch(raw);
  D.needThis(raw, 'c', 'C', 'Study', time(5));
  D.updateSettings(raw, { recTokensPerDay: 20 });
  const hydrated = D.hydrate(raw, time(8));
  assert.deepEqual(hydrated, raw);
  const before = structuredClone(raw);
  D.resolveCurrent(hydrated, 'save');
  D.cancelPending(hydrated, 'recTokensPerDay');
  hydrated.log[hydrated.day].needThis[0].reason = 'Changed';
  assert.deepEqual(raw, before);
});

test('log pruning retains 89 days back and removes 90 days back', () => {
  const state = fresh();
  const nextDay = '2026-10-06';
  const keep = D.addDays(nextDay, -89);
  const drop = D.addDays(nextDay, -90);
  const entry = structuredClone(D.logDay(state));
  state.log[keep] = structuredClone(entry);
  state.log[drop] = structuredClone(entry);
  state.log['2025-01-01'] = structuredClone(entry);
  D.rollDay(state, time(6));
  assert.deepEqual(Object.keys(state.log).sort(), [keep, '2026-10-05'].sort());
});

test('formatMinutes is compact: 0m, <1m, minutes rounded down, hours with no leading zero', () => {
  assert.equal(D.formatMinutes(0), '0m');
  assert.equal(D.formatMinutes(-5), '0m');
  assert.equal(D.formatMinutes(30), '<1m');
  assert.equal(D.formatMinutes(60), '1m');
  assert.equal(D.formatMinutes(2550), '42m');
  assert.equal(D.formatMinutes(3600), '1h');
  assert.equal(D.formatMinutes(3900), '1h 5m');
  assert.equal(D.formatMinutes(6120), '1h 42m');
});


test('chargeTick keeps the last 8 tick keys in the saved state, for the pages, and hydrate keeps them', () => {
  const state = fresh();
  state.watchSecondsLeft = 600;
  const clock = { lastChargeEnd: 0 };
  for (let i = 1; i <= 10; i++) D.chargeTick(state, clock, time(5) + i * 5000, 5, 'a', 0, `k${i}`);
  assert.deepEqual(state.ticksIn.map((t) => t[0]), ['k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10']);
  // A resend under the same key keeps the larger count, once.
  D.chargeTick(state, clock, time(5) + 51000, 7, 'a', 0, 'k10');
  assert.deepEqual(state.ticksIn.at(-1), ['k10', 7]);
  assert.equal(state.ticksIn.length, 8);
  // No key, nothing kept.
  D.chargeTick(state, clock, time(5) + 60000, 5, 'a');
  assert.equal(state.ticksIn.length, 8);
  const back = D.hydrate(JSON.parse(JSON.stringify(state)), time(5));
  assert.deepEqual(back.ticksIn, state.ticksIn);
  assert.deepEqual(D.hydrate({ ...state, ticksIn: [['ok', 3], ['bad', -1], [5, 2], 'x', ['', 1], ['nan', NaN]] }, time(5)).ticksIn, [['ok', 3]]);
});

test('swapFollow closes an open full-stash list once there is room or the video is stashed, and redraws it when the videos change', () => {
  const state = fresh();
  state.settings.stashMax = 2;
  state.backlog = [video('a'), video('b')];
  assert.equal(D.swapFollow(['a', 'b'], state, 'x'), 'keep');
  assert.equal(D.swapFollow(['b', 'a'], state, 'x'), 'redraw', 'same videos, new order');
  assert.equal(D.swapFollow(['a', 'c'], state, 'x'), 'redraw');
  state.backlog = [video('a')];
  assert.equal(D.swapFollow(['a', 'b'], state, 'x'), 'close', 'room now');
  state.backlog = [video('a'), video('x')];
  assert.equal(D.swapFollow(['a', 'b'], state, 'x'), 'close', 'stashed in another tab');
  state.backlog = [video('a'), video('b')];
  state.settings.stash = false;
  assert.equal(D.swapFollow(['a', 'b'], state, 'x'), 'close', 'stash turned off');
});

test('editsSince gives the draft keys changed after a snapshot, and nothing when none did', () => {
  const sent = { stashMax: 10, clock: true, dryFrom: 23 };
  assert.deepEqual(D.editsSince(sent, { ...sent }), {});
  assert.deepEqual(D.editsSince(sent, { ...sent, stashMax: 9, dryFrom: 22 }), { stashMax: 9, dryFrom: 22 });
  assert.deepEqual(D.editsSince(sent, { ...sent, clock: false }), { clock: false });
});

test('chargeTick merges paid tabs ticking half a second apart', () => {
  const state = fresh();
  state.watchSecondsLeft = 100;
  const clock = { lastChargeEnd: time(5) };
  for (let i = 1; i <= 10; i++) {
    D.chargeTick(state, clock, time(5) + i * 1000, 1, 'a');
    D.chargeTick(state, clock, time(5) + i * 1000 + 500, 1, 'b');
  }
  assert.equal(state.watchSecondsLeft, 89.5);
  assert.equal(D.logDay(state).watchedSec, 10.5);
  assert.equal(clock.lastChargeEnd, time(5) + 10500);
});

for (const order of [['free', 'paid'], ['paid', 'free']]) {
  test(`chargeTick charges paid playback in full with order ${order.join(' then ')}`, () => {
    const state = fresh();
    state.unlocked.push('free');
    state.watchSecondsLeft = 100;
    const clock = { lastChargeEnd: time(5) - 10000 };
    for (const id of order) D.chargeTick(state, clock, time(5), 10, id);
    assert.equal(state.watchSecondsLeft, 90);
    assert.equal(D.logDay(state).watchedSec, 20);
    assert.equal(clock.lastChargeEnd, time(5));
  });
}

test('chargeTick never reads or changes the clock for unlocked videos', () => {
  const state = fresh();
  state.unlocked.push('free');
  const clock = {
    get lastChargeEnd() { throw new Error('Clock was read'); },
    set lastChargeEnd(value) { throw new Error('Clock was written'); },
  };
  assert.deepEqual(D.chargeTick(state, clock, time(5), 10, 'free'), { secondsLeft: 0, unlocked: true, allowed: false, locked: false });
  assert.equal(D.logDay(state).watchedSec, 10);
});

test('chargeTick charges a throttled 180-second tick in full', () => {
  const state = fresh();
  state.watchSecondsLeft = 900;
  const clock = { lastChargeEnd: 0 };
  assert.deepEqual(D.chargeTick(state, clock, time(5), 180, 'a'), { secondsLeft: 720, unlocked: false, allowed: false, locked: false });
  assert.equal(D.logDay(state).watchedSec, 180);
});

test('chargeTick clamps to 3600 seconds and ignores negative seconds', () => {
  for (const id of ['paid', 'free']) {
    const state = fresh();
    state.unlocked.push('free');
    state.watchSecondsLeft = 5000;
    const clock = { lastChargeEnd: 0 };
    D.chargeTick(state, clock, time(5), 7200, id);
    assert.equal(state.watchSecondsLeft, id === 'paid' ? 1400 : 5000);
    assert.equal(D.logDay(state).watchedSec, 3600);
    D.chargeTick(state, clock, time(5) + 1000, -10, id);
    assert.equal(D.logDay(state).watchedSec, 3600);
  }
});

test('chargeTick charges in full after the wall clock moves backwards', () => {
  const state = fresh();
  state.watchSecondsLeft = 100;
  const clock = { lastChargeEnd: time(5) + 3600000 };
  D.chargeTick(state, clock, time(5), 10, 'paid');
  assert.equal(clock.lastChargeEnd, time(5));
  assert.equal(state.watchSecondsLeft, 90);
  assert.equal(D.logDay(state).watchedSec, 10);
});

test('chargeTick zero tick between paid ticks does not suppress playback', () => {
  const state = fresh();
  state.watchSecondsLeft = 100;
  const clock = { lastChargeEnd: 0 };
  D.chargeTick(state, clock, time(5), 10, 'paid');
  assert.deepEqual(D.chargeTick(state, clock, time(5) + 5000, 0, 'paused'), { secondsLeft: 90, unlocked: false, allowed: false, locked: false });
  assert.equal(clock.lastChargeEnd, time(5));
  D.chargeTick(state, clock, time(5) + 10000, 10, 'paid');
  assert.equal(clock.lastChargeEnd, time(5) + 10000);
  assert.equal(state.watchSecondsLeft, 80);
  assert.equal(D.logDay(state).watchedSec, 20);
});

// Finding 14 in AUDIT.md: a tightened cap is a hard limit at once (Q6, Q11).
test('tightening the rollover cap or a daily allowance clamps balances now', () => {
  const state = fresh();
  state.tokens = { watch: 8, rec: 20 };
  D.updateSettings(state, { rolloverDays: 1 });
  assert.deepEqual(state.tokens, { watch: 4, rec: 10 });
  D.updateSettings(state, { watchTokensPerDay: 3, recTokensPerDay: 2 });
  assert.deepEqual(state.tokens, { watch: 3, rec: 2 });
});

test('loosening a cap leaves balances alone until the reset', () => {
  const state = fresh();
  state.tokens = { watch: 1, rec: 1 };
  D.updateSettings(state, { rolloverDays: 5, watchTokensPerDay: 10 });
  assert.deepEqual(state.tokens, { watch: 1, rec: 1 });
});

// Finding 16: a card action names the video it was shown for.
test('resolveCurrent refuses an action for a card that is no longer current', () => {
  const state = fresh();
  D.reveal(state, [video('a')]);
  refusesUnchanged(state, () => D.resolveCurrent(state, 'save', 'old'), 'stale-card');
  assert.equal(D.resolveCurrent(state, 'save', 'a').ok, true);
  assert.deepEqual(state.backlog.map(v => v.id), ['a']);
});

test('resolveCurrent refuses an unknown action and keeps the card', () => {
  const state = fresh();
  D.reveal(state, [video('a')]);
  refusesUnchanged(state, () => D.resolveCurrent(state, /** @type {any} */ ('eat')), 'bad-action');
});

test('hydrate drops malformed backlog entries and bad numbers from storage', () => {
  const now = time(5);
  const state = D.hydrate({ day: '2026-10-05', backlog: [undefined, {}, { id: 'ok' }], current: {}, tokens: { watch: 'x', rec: -1 }, watchSecondsLeft: NaN, seen: [1, 'a'], unlocked: [null, 'b'] }, now);
  assert.deepEqual(state.backlog, [{ id: 'ok', title: '', channel: '', length: '' }]);
  assert.equal(state.current, null);
  assert.deepEqual(state.tokens, { watch: 4, rec: 10 });
  assert.equal(state.watchSecondsLeft, 0);
  assert.deepEqual(state.seen, ['a']);
  assert.deepEqual(state.unlocked, ['b']);
});

test('chargeTick places held-back time where it was played, so it does not overlap newer time', () => {
  const state = fresh();
  state.watchSecondsLeft = 100;
  const clock = { lastChargeEnd: 0 };
  const now = time(5, 12);
  D.chargeTick(state, clock, now, 3, 'b', 0);
  D.chargeTick(state, clock, now, 3, 'a', 3000);
  assert.equal(state.watchSecondsLeft, 94);
  assert.equal(clock.lastChargeEnd, now);
});

test('watchedSummary gives today, the same weekday last week, and null when last week has no log', () => {
  const s = fresh();
  assert.equal(s.day, '2026-10-05');
  assert.deepEqual(D.watchedSummary(s), { today: 0, lastWeek: null, weekday: 'Monday' });
  D.logDay(s).watchedSec = 4500;
  s.log['2026-09-28'] = { ...structuredClone(s.log[s.day]), watchedSec: 3000 };
  assert.deepEqual(D.watchedSummary(s), { today: 4500, lastWeek: 3000, weekday: 'Monday' });
  s.log['2026-09-28'].watchedSec = 0;
  assert.equal(D.watchedSummary(s).lastWeek, 0);
});

test('weekView starts on Sunday and averages only the days drip was there for', () => {
  const s = fresh();
  let w = D.weekView(s);
  assert.equal(w.start, '2026-10-04');
  assert.equal(w.end, '2026-10-10');
  assert.deepEqual(w.days.map(d => [d.today, d.future, d.counted]), [
    [false, false, false], [true, false, true], [false, true, false], [false, true, false],
    [false, true, false], [false, true, false], [false, true, false],
  ]);
  assert.equal(w.average, 0);
  assert.equal(w.lastAverage, null);
  assert.equal(w.hasEarlier, false);
  assert.equal(w.hasLater, false);

  const entry = (/** @type {number} */ watchedSec) => ({ ...structuredClone(D.logDay(s)), watchedSec });
  D.logDay(s).watchedSec = 1800;
  s.log['2026-10-04'] = entry(1200);
  s.log['2026-09-29'] = entry(600);
  w = D.weekView(s);
  assert.deepEqual(w.days.map(d => d.watchedSec), [1200, 1800, 0, 0, 0, 0, 0]);
  assert.equal(w.average, 1500);
  // Last week counts Tuesday, the log's oldest day, through Saturday.
  assert.equal(w.lastAverage, 120);
  assert.equal(w.hasEarlier, true);

  w = D.weekView(s, 1);
  assert.equal(w.start, '2026-09-27');
  assert.equal(w.average, 120);
  assert.equal(w.lastAverage, null);
  assert.equal(w.hasEarlier, false);
  assert.equal(w.hasLater, true);
});

test('cardsLine says how the day\'s cards ended and drops the zero parts', () => {
  const day = (/** @type {Partial<import('../src/lib/state.js').LogDay>} */ e) => ({ watchedSec: 0, watchSpent: 0, recSpent: 0, saved: 0, passed: 0, watched: 0, needThis: [], ...e });
  assert.equal(D.cardsLine(undefined), '');
  assert.equal(D.cardsLine(day({})), '');
  assert.equal(D.cardsLine(day({ recSpent: 5, saved: 2, passed: 3 })), 'Of 5 cards, 2 saved and 3 passed.');
  assert.equal(D.cardsLine(day({ recSpent: 1, saved: 1 })), 'Of 1 card, 1 saved.');
  assert.equal(D.cardsLine(day({ recSpent: 6, saved: 2, watched: 1, passed: 3 })), 'Of 6 cards, 2 saved, 1 watched, and 3 passed.');
  assert.equal(D.cardsLine(day({ recSpent: 1 })), '1 card revealed.');
});

test('state saved by the first version (2026-10-05) loads with what it had, and the new fields at their defaults', () => {
  // initialState and its first changes as b0ca083 wrote them: no watchSecondsBought, refill, installedAt, channels,
  // or Dry hours, and the old needThisPerDay setting. Pre-publish bug hunt, 2026-11-05.
  const raw = {
    version: 1,
    settings: { watchTokensPerDay: 4, minutesPerToken: 15, recTokensPerDay: 10, rolloverDays: 2, resetHour: 4, graceMode: false, needThisPerDay: 2, feedSource: 'home' },
    pending: { effectiveDay: '2026-10-06', changes: { recTokensPerDay: 20, needThisPerDay: 3 } },
    day: '2026-10-05', tokens: { watch: 3, rec: 9 }, watchSecondsLeft: 600,
    current: { id: 'aaaaaaaaaaa', title: 'A', channel: 'C', length: '1:00' },
    backlog: [{ id: 'bbbbbbbbbbb', title: 'B', channel: 'C', length: '2:00' }], seen: ['aaaaaaaaaaa'], unlocked: ['ccccccccccc'],
    log: { '2026-10-05': { watchedSec: 300, watchSpent: 1, recSpent: 1, saved: 0, passed: 0, needThis: [{ videoId: 'ccccccccccc', title: 'C', reason: 'Study', at: time(5, 11) }] } },
  };
  const state = D.hydrate(structuredClone(raw), time(5, 13));
  assert.equal(D.rollDay(state, time(5, 13)), false);
  assert.deepEqual(state.tokens, { watch: 3, rec: 9 });
  assert.equal(state.watchSecondsLeft, 600);
  assert.equal(state.watchSecondsBought, 600, 'old state counts what is left as bought');
  assert.equal(state.current?.id, 'aaaaaaaaaaa');
  assert.deepEqual(state.backlog.map((v) => v.id), ['bbbbbbbbbbb']);
  assert.deepEqual(state.pending, { effectiveDay: '2026-10-06', changes: { recTokensPerDay: 20 } });
  assert.equal('needThisPerDay' in state.settings, false);
  assert.equal(state.settings.dryHours, false);
  assert.equal(state.installedAt, 0);
  assert.equal(D.firstDayUntil(state, time(5, 13)), 0, 'no first day for an old install, so loosening waits');
  assert.equal(D.needThisUsed(state, time(5, 13)), 1);
  assert.equal(D.watchStatus(state, 'ccccccccccc', time(5, 13)).locked, false);
  assert.equal(state.log['2026-10-05'].watched, 0);
  assert.deepEqual(state.channels, { allow: [], block: [] });
  assert.equal(state.dropsBought, 0);
  // Its first reset applies the waiting change and refills as usual.
  assert.equal(D.rollDay(state, time(6, 5)), true);
  assert.equal(state.settings.recTokensPerDay, 20);
  assert.deepEqual(state.tokens, { watch: 7, rec: 29 });
});

test('a reset hour moved from 11pm to midnight keeps the refill under the day it renames, so home shows it (Codex, PR 69)', () => {
  const state = fresh();
  state.settings.resetHour = 23;
  state.day = D.dayKey(time(5, 12), 23);
  D.updateSettings(state, { resetHour: 0 });
  state.tokens.watch = 0;
  assert.equal(D.rollDay(state, time(5, 23, 1)), true);
  assert.ok(state.refill);
  assert.equal(state.refill.day, state.day);
});
