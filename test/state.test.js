// @ts-check

const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/lib/state.js');
const D = globalThis.Drip;

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
    'DEFAULT_SETTINGS', 'dayKey', 'addDays', 'daysBetween', 'initialState', 'hydrate',
    'rollDay', 'logDay', 'spendWatch', 'reveal', 'resolveCurrent', 'addBacklog',
    'removeBacklog', 'charge', 'chargeTick', 'watchStatus', 'needThis', 'cleanSettings',
    'isLoosening', 'updateSettings', 'cancelPending', 'formatMinutes', 'cleanVideo',
    'logDays', 'redirectTarget', 'earlyLocked', 'devAction',
  ].sort());
  assert.ok(Object.isFrozen(D.DEFAULT_SETTINGS));
  assert.deepEqual(D.DEFAULT_SETTINGS, {
    watchTokensPerDay: 4, minutesPerToken: 15, recTokensPerDay: 10,
    rolloverDays: 2, resetHour: 4, graceMode: false, needThisPerDay: 2, feedSource: 'home',
  });
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
    tokens: { watch: 4, rec: 10 }, watchSecondsLeft: 0,
    current: null, backlog: [], seen: [], unlocked: [], log: {},
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
});

test('logDay creates a zero entry only for the current day and reuses it', () => {
  const state = fresh();
  const entry = D.logDay(state);
  assert.deepEqual(entry, { watchedSec: 0, watchSpent: 0, recSpent: 0, saved: 0, passed: 0, needThis: [] });
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

test('seen retains the newest 2000 ids', () => {
  const state = fresh();
  state.seen = Array.from({ length: 2000 }, (_, i) => String(i));
  D.reveal(state, [video('new')]);
  assert.equal(state.seen.length, 2000);
  assert.equal(state.seen[0], '1');
  assert.equal(state.seen.at(-1), 'new');
});

for (const action of /** @type {const} */ (['watch', 'save', 'pass'])) {
  test(`resolveCurrent ${action} clears the card and logs the appropriate action`, () => {
    const state = fresh();
    const chosen = video('a');
    D.reveal(state, [chosen]);
    const tokens = { ...state.tokens };
    assert.deepEqual(D.resolveCurrent(state, action), { ok: true, video: chosen });
    assert.equal(state.current, null);
    assert.deepEqual(state.tokens, tokens);
    assert.deepEqual(state.backlog, action === 'save' ? [chosen] : []);
    assert.equal(D.logDay(state).saved, action === 'save' ? 1 : 0);
    assert.equal(D.logDay(state).passed, action === 'pass' ? 1 : 0);
  });
}

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

test('charge drains seconds, floors at zero, logs actual watched time, and reports lock status', () => {
  const state = fresh();
  assert.deepEqual(D.watchStatus(state, 'a'), { secondsLeft: 0, unlocked: false, locked: true });
  state.watchSecondsLeft = 10;
  assert.deepEqual(D.charge(state, 2.5, 'a'), { secondsLeft: 7.5, unlocked: false, locked: false });
  assert.deepEqual(D.charge(state, 20, 'a'), { secondsLeft: 0, unlocked: false, locked: true });
  assert.equal(D.logDay(state).watchedSec, 22.5);
});

test('unlocked videos still log watched seconds without draining the balance', () => {
  const state = fresh();
  D.needThis(state, 'a', 'Title', 'For work', time(5));
  state.watchSecondsLeft = 40;
  assert.deepEqual(D.charge(state, 60, 'a'), { secondsLeft: 40, unlocked: true, locked: false });
  assert.equal(D.logDay(state).watchedSec, 60);
  D.charge(state, 40, 'b');
  assert.deepEqual(D.watchStatus(state, 'a'), { secondsLeft: 0, unlocked: true, locked: false });
  assert.deepEqual(D.watchStatus(state, 'b'), { secondsLeft: 0, unlocked: false, locked: true });
  assert.equal(D.logDay(state).watchedSec, 100);
});

test('needThis validates a trimmed reason, logs its text and time, and enforces the daily limit', () => {
  const state = fresh();
  refusesUnchanged(state, () => D.needThis(state, 'a', 'A', '  ab ', time(5)), 'reason-required');
  assert.deepEqual(D.needThis(state, 'a', 'A', '  Work tutorial  ', time(5)), { ok: true });
  assert.deepEqual(D.logDay(state).needThis, [{ videoId: 'a', title: 'A', reason: 'Work tutorial', at: time(5) }]);
  assert.deepEqual(D.needThis(state, 'b', 'B', 'Homework', time(5)), { ok: true });
  refusesUnchanged(state, () => D.needThis(state, 'c', 'C', 'ab', time(5)), 'reason-required');
  refusesUnchanged(state, () => D.needThis(state, 'c', 'C', 'Homework', time(5)), 'need-this-limit');
  const before = structuredClone(state);
  assert.deepEqual(D.needThis(state, 'a', 'A', 'Different reason', time(5)), { ok: true });
  assert.deepEqual(state, before);
  refusesUnchanged(state, () => D.needThis(state, 'a', 'A', 'ab', time(5)), 'reason-required');
  D.rollDay(state, time(6));
  assert.deepEqual(D.needThis(state, 'c', 'C', 'Homework', time(6)), { ok: true });
  assert.equal(D.logDay(state).needThis.length, 1);
});

test('needThis allowance zero refuses without creating a log', () => {
  const state = fresh();
  state.settings.needThisPerDay = 0;
  refusesUnchanged(state, () => D.needThis(state, 'a', 'A', 'Study', time(5)), 'need-this-limit');
});

test('cleanSettings rounds and clamps every numeric range, drops unknown and invalid values', () => {
  assert.deepEqual(D.cleanSettings({ minutesPerToken: 0, recTokensPerDay: 500, watchTokensPerDay: 2.6, rolloverDays: 0, resetHour: 30, needThisPerDay: -1, unknown: 5, feedSource: 'bad', graceMode: 1 }), {
    minutesPerToken: 1, recTokensPerDay: 100, watchTokensPerDay: 3,
    rolloverDays: 1, resetHour: 23, needThisPerDay: 0, graceMode: true,
  });
  assert.deepEqual(D.cleanSettings({ minutesPerToken: 999, recTokensPerDay: -1, watchTokensPerDay: 99, rolloverDays: 99, resetHour: -1, needThisPerDay: 99, feedSource: 'subscriptions', graceMode: 0 }), {
    minutesPerToken: 120, recTokensPerDay: 0, watchTokensPerDay: 48,
    rolloverDays: 7, resetHour: 0, needThisPerDay: 10, feedSource: 'subscriptions', graceMode: false,
  });
  assert.deepEqual(D.cleanSettings({ recTokensPerDay: NaN, minutesPerToken: Infinity, resetHour: '5', watchTokensPerDay: null }), {});
  assert.deepEqual(D.cleanSettings(undefined), {});
});

test('isLoosening classifies numeric limits, reset hour, grace mode, and feed', () => {
  for (const key of /** @type {const} */ (['watchTokensPerDay', 'minutesPerToken', 'recTokensPerDay', 'rolloverDays', 'needThisPerDay'])) {
    assert.equal(D.isLoosening(key, 1, 2), true);
    assert.equal(D.isLoosening(key, 2, 1), false);
    assert.equal(D.isLoosening(key, 2, 2), false);
  }
  assert.equal(D.isLoosening('resetHour', 4, 0), true);
  assert.equal(D.isLoosening('resetHour', 4, 5), true);
  assert.equal(D.isLoosening('resetHour', 4, 4), false);
  assert.equal(D.isLoosening('graceMode', false, true), true);
  assert.equal(D.isLoosening('graceMode', true, false), false);
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
  assert.deepEqual(state.log['2026-10-04'], { watchedSec: 0, watchSpent: 0, recSpent: 0, saved: 1, passed: 0, needThis: [] });
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

test('formatMinutes displays zero, sub-minute time, and whole minutes rounded down', () => {
  assert.equal(D.formatMinutes(0), '0 min');
  assert.equal(D.formatMinutes(30), 'under 1 min');
  assert.equal(D.formatMinutes(60), '1 min');
  assert.equal(D.formatMinutes(2550), '42 min');
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
  assert.deepEqual(D.chargeTick(state, clock, time(5), 10, 'free'), { secondsLeft: 0, unlocked: true, locked: false });
  assert.equal(D.logDay(state).watchedSec, 10);
});

test('chargeTick charges a throttled 180-second tick in full', () => {
  const state = fresh();
  state.watchSecondsLeft = 900;
  const clock = { lastChargeEnd: 0 };
  assert.deepEqual(D.chargeTick(state, clock, time(5), 180, 'a'), { secondsLeft: 720, unlocked: false, locked: false });
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
  assert.deepEqual(D.chargeTick(state, clock, time(5) + 5000, 0, 'paused'), { secondsLeft: 90, unlocked: false, locked: false });
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
