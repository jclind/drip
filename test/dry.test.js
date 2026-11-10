// @ts-check

// Dry hours (DRY-HOURS-PLAN.md Part B): a daily range of hours with no new drops. The DST nights need a real zone.
process.env.TZ = 'America/New_York';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/lib/state.js');
// The dev panel's actions, for its Apply pending test below.
require('../src/devpanel/actions.js');
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
  assert.deepEqual(D.cleanSettings({ dryHours: true, dryFrom: 30, dryTo: -1 }), { dryHours: true, dryFrom: 23, dryTo: 0 });
  assert.deepEqual(D.cleanSettings({ dryHours: 1 }), {}, 'only true or false');
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

test('Dry hours lock a paid video even with minutes left, and refuse a new drop', () => {
  const state = dry(23, 6);
  const now = time(5, 23, 30);
  state.watchSecondsLeft = 600;
  const before = structuredClone(state);
  assert.deepEqual(D.spendWatch(state, now), { ok: false, error: 'dry-hours', until: time(6, 6) });
  assert.deepEqual(state, before);
  assert.equal(D.watchStatus(state, 'abc', now).locked, true, 'the minutes stop (Jesse, 2026-11-04)');
  assert.equal(D.watchStatus(state, 'abc').locked, false, 'without a time, only minutes count');
  assert.equal(D.watchStatus(state, 'abc', time(5, 22)).locked, false, 'before 11pm');
  assert.equal(D.earlyLocked(structuredClone(state), now, 'abc'), true);
  assert.equal(D.earlyLocked(structuredClone(state), time(5, 22), 'abc'), false);
  assert.equal(D.spendWatch(state, time(5, 22)).ok, true, 'drops sell before the warning');
});

test('an unlocked video and an allowed channel play on in Dry hours', () => {
  const state = dry(23, 6);
  const now = time(5, 23, 30);
  D.needThis(state, 'a', 'A', 'Study', now);
  state.channels.allow.push({ ids: ['@ok'], name: 'OK' });
  state.allowedToday.push({ id: 'b', ids: ['@ok'] });
  assert.equal(D.watchStatus(state, 'a', now).locked, false);
  assert.equal(D.watchStatus(state, 'b', now).locked, false);
  assert.equal(D.earlyLocked(structuredClone(state), now, 'a'), false);
});

test('drySoon is the start of Dry hours in the 5 minutes before, and drops stop selling then', () => {
  const state = dry(23, 6);
  assert.equal(D.drySoon(state, time(5, 22, 54)), 0);
  assert.equal(D.drySoon(state, time(5, 22, 55)), time(5, 23));
  assert.equal(D.drySoon(state, time(5, 22, 59)), time(5, 23));
  assert.equal(D.drySoon(state, time(5, 23)), 0, 'in Dry hours, not before them');
  assert.equal(D.drySoon(dry(23, 23), time(5, 22, 58)), 0, 'no Dry hours');
  const before = structuredClone(state);
  assert.deepEqual(D.spendWatch(state, time(5, 22, 56)), { ok: false, error: 'dry-soon', at: time(5, 23) });
  state.watchSecondsLeft = 0;
  assert.deepEqual(D.buyIfOut(state, 'abc', time(5, 22, 56)), { ok: false, error: 'dry-soon', at: time(5, 23) });
  state.watchSecondsLeft = before.watchSecondsLeft;
  assert.deepEqual(state, before);
});

test('the start of Dry hours hands whole unspent drops back, once, and the rest is lost', () => {
  const state = dry(23, 6);
  const now = time(5, 23);
  D.spendWatch(state, time(5, 21));
  D.spendWatch(state, time(5, 21));
  D.spendWatch(state, time(5, 21));
  // 45 minutes bought, 5 watched: 40 left is 2 whole drops.
  D.charge(state, 5 * 60, 'abc');
  assert.equal(state.tokens.watch, 1);
  assert.equal(D.logDay(state).watchSpent, 3);
  assert.equal(D.enterDry(state, time(5, 22, 59)), false, 'not yet');
  assert.equal(D.enterDry(state, now), true);
  assert.equal(state.tokens.watch, 3);
  assert.equal(state.watchSecondsLeft, 0);
  assert.equal(state.watchSecondsBought, 0);
  assert.equal(D.logDay(state).watchSpent, 1, 'History counts only the drop used');
  assert.deepEqual(state.dryBack, { until: time(6, 6), watch: 2 });
  assert.equal(state.drySeen, time(6, 6));
  const after = structuredClone(state);
  assert.equal(D.enterDry(state, time(6, 1)), false, 'once per stretch');
  assert.deepEqual(state, after);
  assert.equal(D.hydrate(structuredClone(state), now).dryBack.watch, 2);
  D.dryBackSeen(state);
  assert.equal(state.dryBack, null);
});

test('drops handed back stop at the cap, and nothing happens outside Dry hours or with the clock off', () => {
  const state = dry(23, 6);
  state.tokens.watch = 7;
  state.watchSecondsLeft = 45 * 60;
  D.enterDry(state, time(5, 23, 30));
  assert.equal(state.tokens.watch, 8, 'the cap is 4 a day for 2 days');
  assert.deepEqual(state.dryBack, { until: time(6, 6), watch: 1 });
  const none = dry(23, 6);
  none.watchSecondsLeft = 10 * 60;
  D.enterDry(none, time(5, 23, 30));
  assert.equal(none.watchSecondsLeft, 0, 'under a drop is lost');
  assert.equal(none.dryBack, null);
  const outside = dry(23, 6);
  outside.watchSecondsLeft = 600;
  assert.equal(D.enterDry(outside, time(5, 22)), false);
  const clockOff = dry(23, 6);
  clockOff.settings.clock = false;
  clockOff.watchSecondsLeft = 600;
  assert.equal(D.enterDry(clockOff, time(5, 23, 30)), false);
  assert.equal(clockOff.watchSecondsLeft, 600);
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

test('a waiting range joined onto today\'s is followed to its real end, past 25 hours (Codex, 2026-11-04)', () => {
  const now = time(5, 23);
  const state = dry(23, 6, now);
  // 3am to 2am waits for 4am: dry from 11pm through 2am the day after tomorrow, 27 hours.
  state.pending = { effectiveDay: D.addDays(state.day, 1), changes: { dryHours: true, dryFrom: 3, dryTo: 2 } };
  assert.equal(D.dryUntil(state, now), time(7, 2));
});

test('Watch time turning off at the reset ends Dry hours there (Codex, 2026-11-04)', () => {
  const now = time(5, 23);
  const state = dry(23, 6, now);
  state.pending = { effectiveDay: D.addDays(state.day, 1), changes: { clock: false } };
  assert.equal(D.dryUntil(state, now), time(6, 4));
});

test('Dry hours turned off and on again in one night take the new minutes back too', () => {
  const state = dry(23, 6);
  state.watchSecondsLeft = 30 * 60;
  state.tokens.watch = 0;
  D.enterDry(state, time(5, 23, 10));
  assert.equal(state.tokens.watch, 2);
  state.settings.dryHours = false;
  assert.equal(D.enterDry(state, time(5, 23, 20)), true, 'the mark clears');
  assert.equal(state.drySeen, 0);
  state.watchSecondsLeft = 15 * 60;
  state.settings.dryHours = true;
  D.enterDry(state, time(5, 23, 30));
  assert.equal(state.tokens.watch, 3);
  assert.equal(state.watchSecondsLeft, 0);
});

test('Dry hours that came and went with every tab closed still hand the minutes back (Codex, 2026-11-04)', () => {
  const state = dry(13, 14);
  state.tokens.watch = 2;
  D.spendWatch(state, time(5, 12, 30));
  D.spendWatch(state, time(5, 12, 30));
  assert.equal(state.boughtAt, time(5, 12, 30));
  assert.equal(D.enterDry(state, time(5, 15)), true);
  assert.equal(state.watchSecondsLeft, 0);
  assert.equal(state.tokens.watch, 2);
  assert.deepEqual(state.dryBack, { until: time(5, 14), watch: 2 });
  assert.equal(D.enterDry(state, time(5, 15, 1)), true, 'the mark then clears');
  assert.equal(D.enterDry(state, time(5, 15, 2)), false);
});

test('overnight, the missed start hands the minutes back before the reset clears them', () => {
  const state = dry(23, 6, time(5, 22));
  state.tokens.watch = 1;
  D.spendWatch(state, time(5, 22, 30));
  // The next message is at 8am: enterDry runs first, then the reset.
  D.enterDry(state, time(6, 8));
  assert.equal(state.tokens.watch, 1);
  D.rollDay(state, time(6, 8));
  assert.equal(state.tokens.watch, 5, 'the drop back, then the day\'s 4');
});

test('minutes from a dev button, with no purchase time, are left to the current Dry hours', () => {
  const state = dry(13, 14);
  state.watchSecondsLeft = 900;
  assert.equal(D.enterDry(state, time(5, 15)), false);
  assert.equal(state.watchSecondsLeft, 900);
});

// Pre-publish bug hunt, 2026-11-05. Q32: at the start, "each whole drop of them goes back to the counter". A drop is
// what was paid for it, so the minutes come back at the price they were bought at, and never as more drops than were
// bought.

test('drops come back at the price they were bought at, after minutes per drop was lowered', () => {
  const state = dry(23, 6, time(5, 22));
  state.tokens.watch = 1;
  assert.equal(D.spendWatch(state, time(5, 22, 40)).ok, true);
  // Lowering minutes per drop tightens, so it applies at once (Q6).
  D.updateSettings(state, { minutesPerToken: 1 }, time(5, 22, 41));
  assert.equal(state.settings.minutesPerToken, 1);
  D.enterDry(state, time(5, 23, 1));
  assert.equal(state.tokens.watch, 1, 'one drop paid, one drop back, not 15 one-minute drops');
  assert.deepEqual(state.dryBack, { until: time(6, 6), watch: 1 });
  assert.equal(state.watchSecondsLeft, 0);
});

test('minutes under a drop at the price paid are lost, however small minutes per drop is now', () => {
  const state = dry(23, 6, time(5, 22));
  state.tokens.watch = 2;
  D.spendWatch(state, time(5, 21));
  D.spendWatch(state, time(5, 21));
  // 20 of the 30 minutes watched leaves 10, under one 15-minute drop.
  D.charge(state, 20 * 60, 'abc');
  D.updateSettings(state, { minutesPerToken: 1 }, time(5, 22));
  D.enterDry(state, time(5, 23, 1));
  assert.equal(state.tokens.watch, 0);
  assert.equal(state.dryBack, null);
});

test('drops bought at two prices come back at what they cost', () => {
  // The first day, when raising minutes per drop applies at once too (Q6).
  const state = D.initialState(time(5, 20));
  Object.assign(state.settings, { dryHours: true, dryFrom: 23, dryTo: 6 });
  D.spendWatch(state, time(5, 21));
  D.updateSettings(state, { minutesPerToken: 30 }, time(5, 21, 1));
  D.spendWatch(state, time(5, 21, 2));
  // 15 + 30 minutes bought for 2 drops, none watched: both come back.
  D.enterDry(state, time(5, 23, 1));
  assert.equal(state.tokens.watch, 4);
});

/** One worker message, in background.js's order. @param {any} state @param {number} now @param {(s: any, n: number) => any} [fn] */
function message(state, now, fn = () => ({ ok: true })) {
  D.enterDry(state, now);
  D.rollDay(state, now);
  const result = fn(state, now);
  D.enterDry(state, now);
  return result;
}

test('Dry hours moved over an hour already past take nothing: those hours were not dry then', () => {
  const state = dry(4, 5, time(5, 8));
  state.tokens.watch = 1;
  message(state, time(5, 8, 30), (s, n) => D.spendWatch(s, n));
  // 4am to 10am holds every hour 4am to 5am does, so it applies at once (Q6), at 3pm, outside the range.
  const res = message(state, time(5, 15), (s, n) => D.updateSettings(s, { dryTo: 10 }, n));
  assert.deepEqual(res.applied, { dryTo: 10 });
  assert.equal(state.watchSecondsLeft, 15 * 60, 'the minutes bought at 8:30 still play');
  assert.equal(state.tokens.watch, 0);
  assert.equal(state.dryBack, null);
});

test('Dry hours turned on for an hour already past take nothing either', () => {
  const state = settled(time(5, 8));
  state.tokens.watch = 1;
  message(state, time(5, 8, 30), (s, n) => D.spendWatch(s, n));
  message(state, time(5, 15), (s, n) => D.updateSettings(s, { dryHours: true, dryFrom: 9, dryTo: 10 }, n));
  assert.equal(state.settings.dryHours, true);
  assert.equal(state.watchSecondsLeft, 15 * 60);
  assert.equal(state.tokens.watch, 0);
});

test('on the first day, Watch time off and on again after a dry hour takes nothing for it', () => {
  // Off waits after the first day, so only the first day can turn the clock off and on in one day (Q6).
  const state = D.initialState(time(5, 8));
  Object.assign(state.settings, { dryHours: true, dryFrom: 9, dryTo: 10 });
  message(state, time(5, 8, 30), (s, n) => D.spendWatch(s, n));
  message(state, time(5, 8, 40), (s, n) => D.updateSettings(s, { clock: false }, n));
  message(state, time(5, 11), (s, n) => D.updateSettings(s, { clock: true }, n));
  assert.equal(state.watchSecondsLeft, 15 * 60);
  assert.equal(state.tokens.watch, 3);
});

test('turning Dry hours on over the current hour still takes the minutes back at once', () => {
  const state = settled(time(5, 15));
  state.tokens.watch = 1;
  message(state, time(5, 14), (s, n) => D.spendWatch(s, n));
  message(state, time(5, 15), (s, n) => D.updateSettings(s, { dryHours: true, dryFrom: 15, dryTo: 16 }, n));
  assert.equal(state.watchSecondsLeft, 0);
  assert.equal(state.tokens.watch, 1);
});

test('drops bought before the update that added dropsBought still all come back with one bought after (Codex, PR 69)', () => {
  const state = dry(23, 6);
  D.spendWatch(state, time(5, 21));
  D.spendWatch(state, time(5, 21));
  // Saved by the version before dropsBought: two drops' minutes, no count.
  const stored = structuredClone(state);
  delete stored.dropsBought;
  const upgraded = D.hydrate(stored, time(5, 21, 30));
  assert.equal(upgraded.dropsBought, 2, 'counted from the minutes bought, at today\'s price');
  D.spendWatch(upgraded, time(5, 22));
  assert.equal(upgraded.tokens.watch, 1);
  assert.equal(D.enterDry(upgraded, time(5, 23)), true);
  assert.equal(upgraded.tokens.watch, 4, 'all three back');
});
