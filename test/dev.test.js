// @ts-check
// The dev panel's state changes (devAction). Test tooling, so these check that each action does what its button says,
// and that "Run reset now" leads into the real rollover.

const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/lib/state.js');
const D = globalThis.Drip;

/** @param {number} day @param {number} [hour] */
const time = (day, hour = 12) => new Date(2026, 9, day, hour).getTime();
const fresh = () => D.initialState(time(7));

test('minute and token buttons set what they say, and never go below 0', () => {
  const state = fresh();
  D.devAction(state, 'minutes+15', time(7));
  D.devAction(state, 'minutes+5', time(7));
  assert.equal(state.watchSecondsLeft, 20 * 60);
  D.devAction(state, 'minutes-1', time(7));
  assert.equal(state.watchSecondsLeft, 60);
  D.devAction(state, 'minutes-0', time(7));
  assert.equal(state.watchSecondsLeft, 0);
  D.devAction(state, 'watch-0', time(7));
  D.devAction(state, 'watch+1', time(7));
  D.devAction(state, 'rec-0', time(7));
  assert.deepEqual(state.tokens, { watch: 1, rec: 0 });
});

test('Run reset now leaves the day for the real rollover, which refills tokens and applies pending changes', () => {
  const state = fresh();
  state.tokens.watch = 0;
  state.watchSecondsLeft = 300;
  state.unlocked = ['aaa'];
  D.updateSettings(state, { graceMode: true });
  assert.equal(state.settings.graceMode, false, 'turning grace on waits for the reset');
  D.devAction(state, 'reset-now', time(7));
  assert.equal(state.day, '2026-10-06');
  assert.equal(state.watchSecondsLeft, 300, 'nothing rolls over until the next message');
  assert.equal(D.rollDay(state, time(7)), true);
  assert.equal(state.day, '2026-10-07');
  assert.equal(state.settings.graceMode, true);
  assert.equal(state.pending, null);
  assert.equal(state.tokens.watch, 4);
  assert.equal(state.watchSecondsLeft, 0);
  assert.deepEqual(state.unlocked, []);
});

test('apply-pending and grace-toggle change settings now instead of at the reset', () => {
  const state = fresh();
  D.updateSettings(state, { recTokensPerDay: 20, graceMode: true });
  D.devAction(state, 'grace-toggle', time(7));
  assert.equal(state.settings.graceMode, true);
  assert.deepEqual(state.pending?.changes, { recTokensPerDay: 20 }, 'the toggle drops the pending grace change');
  D.devAction(state, 'apply-pending', time(7));
  assert.equal(state.settings.recTokensPerDay, 20);
  assert.equal(state.pending, null);
});

test('clear buttons empty what they name, and fresh starts over', () => {
  const state = fresh();
  D.addBacklog(state, { id: 'bbb', title: 'B' });
  D.reveal(state, [{ id: 'ccc', title: 'C' }]);
  D.needThis(state, 'ddd', 'D', 'a reason', time(7));
  D.devAction(state, 'clear-unlocks', time(7));
  assert.deepEqual(state.unlocked, []);
  D.devAction(state, 'clear-backlog', time(7));
  assert.deepEqual(state.backlog, []);
  D.devAction(state, 'clear-seen', time(7));
  assert.deepEqual(state.seen, []);
  assert.equal(state.current, null);
  D.devAction(state, 'clear-log', time(7));
  assert.equal(state.log[state.day], undefined);
  state.tokens.rec = 0;
  D.devAction(state, 'fresh', time(7));
  assert.deepEqual(state, fresh());
});

test('an unknown action changes nothing', () => {
  const state = fresh();
  const before = structuredClone(state);
  assert.deepEqual(D.devAction(state, 'nope', time(7)), { ok: false, error: 'unknown-dev-action' });
  assert.deepEqual(state, before);
});
