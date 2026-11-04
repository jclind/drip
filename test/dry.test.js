// @ts-check

// Dry hours (DRY-HOURS-PLAN.md Part B): a daily range of hours with no new drops. The DST nights need a real zone.
process.env.TZ = 'America/New_York';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/lib/state.js');
const D = /** @type {any} */ (globalThis).Drip;

/** @param {number} day @param {number} [hour] @param {number} [minute] */
const time = (day, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
/** @param {string} id */
const video = (id) => ({ id, title: `Title ${id}`, channel: 'Channel', length: '14:02' });

/** Installed on the 1st and looked at on the 5th, past its first day, so Q6's waiting applies. */
function settled(now = time(5)) {
  const state = D.initialState(time(1));
  state.day = D.dayKey(now, state.settings.resetHour);
  return state;
}
/** A settled state with Dry hours on from `from` to `to`. @param {number} from @param {number} to @param {number} [now] */
function dry(from, to, now = time(5)) {
  const state = settled(now);
  Object.assign(state.settings, { dryHours: true, dryFrom: from, dryTo: to });
  return state;
}

test('the three settings default to off, 11pm to 6am, and clean like the rest', () => {
  assert.equal(D.DEFAULT_SETTINGS.dryHours, false);
  assert.equal(D.DEFAULT_SETTINGS.dryFrom, 23);
  assert.equal(D.DEFAULT_SETTINGS.dryTo, 6);
  assert.deepEqual(D.cleanSettings({ dryHours: 1, dryFrom: 30, dryTo: -1 }), { dryHours: true, dryFrom: 23, dryTo: 0 });
  assert.deepEqual(D.cleanSettings({ dryFrom: 2.6, dryTo: '5' }), { dryFrom: 3 });
});

test('dryUntil: a range within one day ends at its end hour, which is not dry', () => {
  const state = dry(13, 15);
  assert.equal(D.dryUntil(state, time(5, 12, 59)), 0);
  assert.equal(D.dryUntil(state, time(5, 13)), time(5, 15));
  assert.equal(D.dryUntil(state, time(5, 14, 59)), time(5, 15));
  assert.equal(D.dryUntil(state, time(5, 15)), 0, 'the end hour itself');
});

test('dryUntil: a range over midnight ends the next morning', () => {
  const state = dry(23, 6);
  assert.equal(D.dryUntil(state, time(5, 22, 59)), 0);
  assert.equal(D.dryUntil(state, time(5, 23, 30)), time(6, 6));
  assert.equal(D.dryUntil(state, time(6, 2)), time(6, 6));
  assert.equal(D.dryUntil(state, time(6, 6)), 0);
});

test('dryUntil is 0 when off, when start and end are the same hour, and with the clock off', () => {
  const off = dry(23, 6);
  off.settings.dryHours = false;
  assert.equal(D.dryUntil(off, time(5, 23, 30)), 0);
  assert.equal(D.dryUntil(dry(5, 5), time(5, 5, 30)), 0);
  const clockOff = dry(23, 6);
  clockOff.settings.clock = false;
  assert.equal(D.dryUntil(clockOff, time(5, 23, 30)), 0);
});

test('dryUntil uses a waiting change from the reset on, so "off" waiting for 4am ends Dry hours at 4am', () => {
  const state = dry(23, 6, time(5, 23, 30));
  D.updateSettings(state, { dryHours: false }, time(5, 23, 30));
  assert.ok(state.pending, 'turning off waits');
  assert.equal(D.dryUntil(state, time(5, 23, 30)), time(6, 4));
  assert.equal(D.dryUntil(state, time(6, 2)), time(6, 4), 'after midnight, before the reset');
  const shorter = dry(23, 6, time(5, 23, 30));
  D.updateSettings(shorter, { dryTo: 5 }, time(5, 23, 30));
  assert.equal(D.dryUntil(shorter, time(5, 23, 30)), time(6, 5), '23 to 5 is in force from 4am, and 4am is still dry');
});

test('dryUntil counts by the hour the clock shows across DST changes', () => {
  // Spring forward on 2026-03-08: 2:00am doesn't exist.
  const spring = D.initialState(new Date(2026, 2, 1).getTime());
  spring.day = D.dayKey(new Date(2026, 2, 8, 1, 30).getTime(), 4);
  Object.assign(spring.settings, { dryHours: true, dryFrom: 1, dryTo: 3 });
  assert.equal(D.dryUntil(spring, new Date(2026, 2, 8, 1, 30).getTime()), new Date(2026, 2, 8, 3).getTime());
  assert.equal(new Date(2026, 2, 8, 3).getTime() - new Date(2026, 2, 8, 1, 30).getTime(), 30 * 60e3, 'half an hour of real time');
  // Fall back on 2026-11-01: 1:00am happens twice. 0 to 2 ends at the 2:00am that follows both.
  const fall = D.initialState(new Date(2026, 9, 20).getTime());
  fall.day = D.dayKey(new Date(2026, 10, 1, 0, 30).getTime(), 4);
  Object.assign(fall.settings, { dryHours: true, dryFrom: 0, dryTo: 2 });
  const firstOneThirty = new Date(2026, 10, 1, 0, 30).getTime() + 3600e3;
  assert.equal(new Date(firstOneThirty).getHours(), 1);
  assert.equal(D.dryUntil(fall, firstOneThirty), new Date(2026, 10, 1, 2).getTime());
  assert.equal(D.dryUntil(fall, firstOneThirty + 3600e3), new Date(2026, 10, 1, 2).getTime(), 'the second 1:30am');
});

test('dryGrace is for a video that played before Dry hours, and only during them', () => {
  const state = dry(23, 6);
  assert.equal(D.dryGrace(state, time(5, 23, 5), true), true);
  assert.equal(D.dryGrace(state, time(5, 23, 5), false), false, 'started after they began');
  assert.equal(D.dryGrace(state, time(5, 22, 55), true), false, 'not in Dry hours');
});

test('Dry hours refuse a new drop and nothing else', () => {
  const state = dry(23, 6);
  const now = time(5, 23, 30);
  const before = structuredClone(state);
  assert.deepEqual(D.spendWatch(state, now), { ok: false, error: 'dry-hours', until: time(6, 6) });
  assert.deepEqual(D.buyIfOut(state, 'abc', now), { ok: false, error: 'dry-hours', until: time(6, 6) });
  assert.deepEqual(state, before);
  assert.equal(D.spendWatch(state, time(5, 22)).ok, true, 'before 11pm');
  // Minutes bought before keep working, for new videos too (Jesse, 2026-11-04).
  assert.deepEqual(D.buyIfOut(state, 'abc', now), { ok: true, bought: false });
  assert.equal(D.watchStatus(state, 'abc').locked, false);
  assert.equal(D.earlyLocked(structuredClone(state), now, 'abc'), false);
});

test('card Watch in Dry hours still opens the video, with no drop spent', () => {
  const state = dry(23, 6);
  const now = time(5, 23, 30);
  D.reveal(state, [video('abc')]);
  const tokens = state.tokens.watch;
  const res = D.resolveCurrent(state, 'watch', 'abc', now);
  assert.equal(res.ok, true);
  assert.equal(res.bought, false);
  assert.equal(state.tokens.watch, tokens);
  assert.equal(state.current, null);
  assert.equal(D.logDay(state).watched, 1);
});

test("an allowed channel's card never asks for a drop, so Dry hours don't refuse it", () => {
  const state = dry(23, 6);
  const now = time(5, 23, 30);
  state.channels.allow.push({ ids: ['@ok'], name: 'OK' });
  D.reveal(state, [{ ...video('abc'), channelIds: ['@ok'] }]);
  assert.equal(D.freeToStart(state, 'abc'), true);
  assert.deepEqual(D.buyIfOut(state, 'abc', now), { ok: true, bought: false });
  assert.equal(D.resolveCurrent(state, 'watch', 'abc', now).bought, false);
});

test('"I need this one" works in Dry hours, up to the weekly limit', () => {
  const state = dry(23, 6);
  const now = time(5, 23, 30);
  assert.deepEqual(D.needThis(state, 'a', 'A', 'Study', now), { ok: true });
  D.needThis(state, 'b', 'B', 'Study', now);
  D.needThis(state, 'c', 'C', 'Study', now);
  assert.deepEqual(D.needThis(state, 'd', 'D', 'Study', now), { ok: false, error: 'need-this-limit' });
});

test('Q6 for Dry hours: on and longer apply now; off, shorter, and moved wait', () => {
  const now = time(5, 15);
  const on = settled(now);
  assert.deepEqual(D.updateSettings(on, { dryHours: true }, now).applied, { dryHours: true });
  assert.equal(on.pending, null);
  const longer = dry(23, 6, now);
  assert.deepEqual(D.updateSettings(longer, { dryFrom: 22 }, now).applied, { dryFrom: 22 });
  assert.equal(longer.settings.dryFrom, 22);
  for (const [name, change] of /** @type {const} */ ([['off', { dryHours: false }], ['shorter', { dryTo: 5 }], ['moved', { dryFrom: 0, dryTo: 7 }]])) {
    const state = dry(23, 6, now);
    const res = D.updateSettings(state, change, now);
    assert.deepEqual(res.applied, {}, name);
    assert.deepEqual(res.pending, { dryHours: true, dryFrom: 23, dryTo: 6, ...change }, `${name} waits as one range`);
    assert.deepEqual(state.pending.changes, res.pending);
    assert.deepEqual([state.settings.dryHours, state.settings.dryFrom, state.settings.dryTo], [true, 23, 6]);
  }
});

test('per-key judging would get dryFrom wrong both ways; the range rule gets it right', () => {
  const now = time(5, 15);
  // 23 to 6, start moved to 1: shorter, though 23 to 1 is a smaller number.
  const later = dry(23, 6, now);
  assert.deepEqual(D.updateSettings(later, { dryFrom: 1 }, now).applied, {});
  // 1 to 6, start moved to 23: longer, though the number went up.
  const earlier = dry(1, 6, now);
  assert.deepEqual(D.updateSettings(earlier, { dryFrom: 23 }, now).applied, { dryFrom: 23 });
});

test('a waiting dry change is never lost to a later edit, an unrelated save, or undone by half', () => {
  const now = time(5, 15);
  const state = dry(23, 6, now);
  D.updateSettings(state, { dryTo: 5 }, now);
  // A later edit starts from today's range plus the waiting one.
  D.updateSettings(state, { dryFrom: 22 }, now);
  assert.deepEqual(state.pending.changes, { dryHours: true, dryFrom: 22, dryTo: 5 });
  D.updateSettings(state, { watchTokensPerDay: 3 }, now);
  assert.deepEqual(state.pending.changes, { dryHours: true, dryFrom: 22, dryTo: 5 }, 'an unrelated save keeps it');
  // Back to a range holding all of today's hours: it applies, and the wait is gone.
  D.updateSettings(state, { dryFrom: 23, dryTo: 6 }, now);
  assert.equal(state.pending, null);
  assert.deepEqual([state.settings.dryFrom, state.settings.dryTo], [23, 6]);
  // Undo on any one key cancels all three.
  D.updateSettings(state, { dryTo: 4 }, now);
  D.cancelPending(state, 'dryFrom');
  assert.equal(state.pending, null);
});

test('a dry change saved with a reset hour change waits beside it, and the first day applies both', () => {
  const now = time(5, 15);
  const state = dry(23, 6, now);
  const res = D.updateSettings(state, { dryTo: 5, resetHour: 5 }, now);
  assert.deepEqual(res.pending, { dryHours: true, dryFrom: 23, dryTo: 5, resetHour: 5 });
  const first = D.initialState(time(5, 9));
  Object.assign(first.settings, { dryHours: true, dryFrom: 23, dryTo: 6 });
  assert.deepEqual(D.updateSettings(first, { dryHours: false }, time(5, 10)).applied, { dryHours: false });
  assert.equal(first.pending, null);
});

test('the reset and apply-pending put a waiting range in force', () => {
  const now = time(5, 15);
  const state = dry(23, 6, now);
  D.updateSettings(state, { dryTo: 5 }, now);
  const dev = structuredClone(state);
  D.rollDay(state, time(6, 5));
  assert.equal(state.settings.dryTo, 5);
  assert.equal(state.pending, null);
  D.devAction(dev, 'apply-pending', now);
  assert.equal(dev.settings.dryTo, 5);
});

test('export, import, and reset carry Dry hours through the range rule', () => {
  const now = time(5, 15);
  const from = dry(22, 7, now);
  const file = JSON.parse(JSON.stringify(D.exportData(from, now)));
  assert.deepEqual([file.settings.dryHours, file.settings.dryFrom, file.settings.dryTo], [true, 22, 7]);
  const to = settled(now);
  D.importData(to, file, now);
  assert.deepEqual([to.settings.dryHours, to.settings.dryFrom, to.settings.dryTo], [true, 22, 7], 'turning on applies at once');
  // Reset puts the defaults back, which turns Dry hours off, so it waits.
  const res = D.resetData(to, now);
  assert.equal(to.settings.dryHours, true);
  assert.deepEqual(res.pending.dryHours, false);
  assert.equal(D.hydrate(structuredClone(to), now).settings.dryFrom, 22);
});
