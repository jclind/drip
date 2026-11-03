// @ts-check

// The modes (Q29): Quiet, Curated, and Full drip, and the parts they switch.

const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/lib/state.js');
const D = globalThis.Drip;

/** @param {number} day @param {number} [hour] */
const time = (day, hour = 12) => new Date(2026, 9, day, hour).getTime();
/** @param {string} id */
const video = id => ({ id, title: `Title ${id}`, channel: 'Channel', length: '14:02' });
/** A state past its first day, so Q6's waiting applies. */
const settled = () => D.initialState(time(1));
/** @param {ReturnType<typeof settled>} state @param {Partial<typeof D.DEFAULT_SETTINGS>} parts */
const withParts = (state, parts) => { Object.assign(state.settings, parts); return state; };

/** @param {ReturnType<typeof settled>} state @param {() => unknown} call @param {string} error */
function refusesUnchanged(state, call, error) {
  const before = structuredClone(state);
  assert.deepEqual(call(), { ok: false, error });
  assert.deepEqual(state, before);
}

test('modeOf names each mode and returns null for a custom mix', () => {
  assert.deepEqual(D.MODES.quiet, { searchCap: false, cards: 'off', clock: false, stash: false });
  assert.deepEqual(D.MODES.curated, { searchCap: true, cards: 'unlimited', clock: false, stash: true });
  assert.deepEqual(D.MODES.full, { searchCap: true, cards: 'limited', clock: true, stash: true });
  for (const name of /** @type {const} */ (['quiet', 'curated', 'full'])) {
    assert.equal(D.modeOf({ ...D.DEFAULT_SETTINGS, ...D.MODES[name] }), name);
  }
  assert.equal(D.modeOf({ ...D.DEFAULT_SETTINGS, ...D.MODES.curated, stash: false }), null);
});

test('state saved before modes hydrates as Full drip', () => {
  const old = settled();
  const raw = structuredClone(old);
  for (const key of ['searchCap', 'cards', 'clock', 'stash']) delete /** @type {any} */ (raw.settings)[key];
  const state = D.hydrate(raw, time(1, 13));
  assert.equal(D.modeOf(state.settings), 'full');
});

test('cleanSettings keeps valid parts and drops anything else', () => {
  assert.deepEqual(D.cleanSettings({ searchCap: false, cards: 'unlimited', clock: false, stash: true }),
    { searchCap: false, cards: 'unlimited', clock: false, stash: true });
  assert.deepEqual(D.cleanSettings({ searchCap: 'no', cards: 'some', clock: 0, stash: null }), {});
});

test('the bell: hidden by default, not a mode part, and showing it waits for the reset', () => {
  assert.equal(D.DEFAULT_SETTINGS.hideBell, true);
  assert.equal(D.modeOf({ ...D.DEFAULT_SETTINGS, hideBell: false }), 'full');
  assert.deepEqual(D.cleanSettings({ hideBell: false }), { hideBell: false });
  assert.deepEqual(D.cleanSettings({ hideBell: 'no' }), {});
  assert.equal(D.isLoosening('hideBell', true, false), true);
  assert.equal(D.isLoosening('hideBell', false, true), false);
  const raw = structuredClone(settled());
  delete /** @type {any} */ (raw.settings).hideBell;
  assert.equal(D.hydrate(raw, time(1, 13)).settings.hideBell, true);
});

test('Hide Shorts: on by default, not a mode part, and turning it off waits for the reset (Q2)', () => {
  assert.equal(D.DEFAULT_SETTINGS.hideShorts, true);
  assert.equal(D.modeOf({ ...D.DEFAULT_SETTINGS, hideShorts: false }), 'full');
  assert.deepEqual(D.cleanSettings({ hideShorts: false }), { hideShorts: false });
  assert.deepEqual(D.cleanSettings({ hideShorts: 'no' }), {});
  assert.equal(D.isLoosening('hideShorts', true, false), true);
  assert.equal(D.isLoosening('hideShorts', false, true), false);
  const raw = structuredClone(settled());
  delete /** @type {any} */ (raw.settings).hideShorts;
  assert.equal(D.hydrate(raw, time(1, 13)).settings.hideShorts, true);
  // A Short still opens as a regular video, and the bare feed still goes to the token page, whatever the setting.
  assert.equal(D.redirectTarget('https://www.youtube.com/shorts/abc123'), 'https://www.youtube.com/watch?v=abc123');
  assert.notEqual(D.redirectTarget('https://www.youtube.com/shorts'), '');
});

test('isLoosening: a part turned off, or cards going from a count to unlimited, waits', () => {
  for (const key of /** @type {const} */ (['searchCap', 'clock', 'stash'])) {
    assert.equal(D.isLoosening(key, true, false), true);
    assert.equal(D.isLoosening(key, false, true), false);
  }
  assert.equal(D.isLoosening('cards', 'limited', 'unlimited'), true);
  assert.equal(D.isLoosening('cards', 'limited', 'off'), true);
  assert.equal(D.isLoosening('cards', 'unlimited', 'off'), true);
  assert.equal(D.isLoosening('cards', 'off', 'unlimited'), false);
  assert.equal(D.isLoosening('cards', 'off', 'limited'), false);
  assert.equal(D.isLoosening('cards', 'unlimited', 'limited'), false);
});

test('Full drip to Quiet waits for the reset, then applies', () => {
  const state = settled();
  const now = time(5);
  D.rollDay(state, now);
  const res = D.updateSettings(state, D.MODES.quiet, now);
  assert.deepEqual(res.applied, {});
  assert.deepEqual(res.pending, D.MODES.quiet);
  assert.equal(D.modeOf(state.settings), 'full');
  D.rollDay(state, time(6, 5));
  assert.equal(D.modeOf(state.settings), 'quiet');
  assert.equal(state.pending, null);
});

test('saving Curated after a waiting Quiet replaces all of Quiet at the reset (Codex, 2026-10-15)', () => {
  const state = settled();
  const now = time(5);
  D.rollDay(state, now);
  D.updateSettings(state, D.MODES.quiet, now);
  const keys = Object.keys(D.DEFAULT_SETTINGS);
  // The form shows Quiet, the planned mode. Curated sends every part Quiet changed except the clock, off in both.
  assert.equal(D.modeOf(D.planned(state)), 'quiet');
  const changes = D.settingsToSave(state, { ...D.planned(state), ...D.MODES.curated }, keys);
  assert.deepEqual(changes, { searchCap: true, cards: 'unlimited', stash: true });
  D.updateSettings(state, changes, now);
  D.rollDay(state, time(6, 5));
  assert.equal(D.modeOf(state.settings), 'curated');
  assert.equal(state.pending, null);
});

test('settingsToSave sends what differs from the planned settings', () => {
  const state = settled();
  const now = time(5);
  D.rollDay(state, now);
  D.updateSettings(state, { stash: false, watchTokensPerDay: 6 }, now);
  const keys = Object.keys(D.DEFAULT_SETTINGS);
  const plan = D.planned(state);
  assert.equal(plan.stash, false);
  assert.equal(plan.watchTokensPerDay, 6);
  assert.equal(state.settings.stash, true);
  // Nothing edited: nothing to send, and both waiting changes stay.
  assert.deepEqual(D.settingsToSave(state, { ...plan }, keys), {});
  // Full drip picked again: its stash, back at today's value, cancels the waiting one. The drops stay waiting.
  const changes = D.settingsToSave(state, { ...plan, ...D.MODES.full }, keys);
  assert.deepEqual(changes, { stash: true });
  D.updateSettings(state, changes, now);
  assert.deepEqual(state.pending && state.pending.changes, { watchTokensPerDay: 6 });
});

test('Quiet to Full drip applies at once', () => {
  const state = withParts(settled(), D.MODES.quiet);
  const res = D.updateSettings(state, D.MODES.full, time(5));
  assert.deepEqual(res.applied, D.MODES.full);
  assert.deepEqual(res.pending, {});
  assert.equal(D.modeOf(state.settings), 'full');
});

test('a change that tightens one part and loosens another splits', () => {
  const state = withParts(settled(), D.MODES.curated);
  const res = D.updateSettings(state, { clock: true, cards: 'limited', stash: false }, time(5));
  assert.deepEqual(res.applied, { clock: true, cards: 'limited' });
  assert.deepEqual(res.pending, { stash: false });
});

test('every mode change applies at once in the first day', () => {
  const now = time(5);
  const state = D.initialState(now);
  const res = D.updateSettings(state, D.MODES.quiet, now + 3600 * 1000);
  assert.deepEqual(res.applied, D.MODES.quiet);
  assert.equal(D.modeOf(state.settings), 'quiet');
});

test('with cards off there are no reveals', () => {
  const state = withParts(settled(), { cards: 'off' });
  refusesUnchanged(state, () => D.reveal(state, [video('a')]), 'cards-off');
  state.settings.cards = 'limited';
  D.reveal(state, [video('a')]);
  state.settings.cards = 'off';
  refusesUnchanged(state, () => D.revealNext(state, 'a', [video('b')]), 'cards-off');
});

test('unlimited cards reveal without spending, even with none left, and still count', () => {
  const state = withParts(settled(), { cards: 'unlimited' });
  state.tokens.rec = 0;
  assert.equal(D.reveal(state, [video('a')]).ok, true);
  assert.equal(D.revealNext(state, 'a', [video('b')]).ok, true);
  assert.equal(state.tokens.rec, 0);
  assert.equal(state.current?.id, 'b');
  assert.equal(D.logDay(state).recSpent, 2);
});

test('limited cards still spend a card each', () => {
  const state = settled();
  state.tokens.rec = 1;
  D.reveal(state, [video('a')]);
  assert.equal(state.tokens.rec, 0);
  refusesUnchanged(state, () => D.revealNext(state, 'a', [video('b')]), 'no-rec-tokens');
});

test('with the stash off nothing new goes in, but Undo can still put a row back', () => {
  const state = withParts(settled(), { stash: false });
  refusesUnchanged(state, () => D.addBacklog(state, video('a')), 'stash-off');
  refusesUnchanged(state, () => D.swapBacklog(state, video('a'), 'b'), 'stash-off');
  state.settings.cards = 'limited';
  D.reveal(state, [video('c')]);
  refusesUnchanged(state, () => D.resolveCurrent(state, 'save', 'c'), 'stash-off');
  assert.deepEqual(D.addBacklog(state, video('d'), 0), { ok: true });
  assert.deepEqual(state.backlog.map(v => v.id), ['d']);
});

test('turning the stash off keeps what is in it', () => {
  const state = settled();
  D.addBacklog(state, video('a'), undefined, time(1));
  D.updateSettings(state, { stash: false }, time(5));
  D.rollDay(state, time(6, 5));
  assert.equal(state.settings.stash, false);
  assert.deepEqual(state.backlog.map(v => v.id), ['a']);
});

test('with the clock off watching is logged and costs nothing', () => {
  const state = withParts(settled(), { clock: false });
  const clock = { lastChargeEnd: 0, ticks: [] };
  const status = D.chargeTick(state, clock, time(1, 13), 30, 'v', 0, 'k1');
  assert.deepEqual(status, { secondsLeft: 0, unlocked: false, locked: false });
  assert.equal(D.logDay(state).watchedSec, 30);
  assert.equal(clock.lastChargeEnd, 0);
  assert.deepEqual(D.watchStatus(state, 'v'), { secondsLeft: 0, unlocked: false, locked: false });
  refusesUnchanged(state, () => D.spendWatch(state), 'clock-off');
  assert.deepEqual(D.buyIfOut(state, 'v'), { ok: true, bought: false });
  assert.equal(state.tokens.watch, 4);
});

test('earlyLocked never holds a video with the clock off, including one whose day has come', () => {
  const now = time(5, 13);
  const today = D.dayKey(now, 4);
  const base = { day: today, watchSecondsLeft: 0, unlocked: [], settings: { ...D.DEFAULT_SETTINGS } };
  assert.equal(D.earlyLocked(base, now, 'v'), true);
  assert.equal(D.earlyLocked({ ...base, settings: { ...base.settings, clock: false } }, now, 'v'), false);
  const waiting = { ...base, day: D.addDays(today, -1), pending: { effectiveDay: today, changes: { clock: false } } };
  assert.equal(D.earlyLocked(waiting, now, 'v'), false);
  const later = { ...base, pending: { effectiveDay: D.addDays(today, 1), changes: { clock: false } } };
  assert.equal(D.earlyLocked(later, now, 'v'), true);
});
