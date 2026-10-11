// @ts-check

const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/lib/state.js');
require('../src/devpanel/profiles.js');
const D = /** @type {any} */ (globalThis).Drip;
const P = /** @type {any} */ (globalThis).DripProfiles;

test('every sample profile is a state the rules would have made', () => {
  const now = new Date(2026, 9, 11, 12).getTime();
  assert.ok(P.list.length >= 5);
  for (const profile of P.list) {
    const state = profile.build(now);
    // Hydrating changes nothing, so every field has a valid type and range.
    assert.deepEqual(D.hydrate(structuredClone(state), now), state, profile.id);
    assert.equal(D.rollDay(structuredClone(state), now), false, `${profile.id} is on today`);
    for (const [key, value] of Object.entries(state.pending ? state.pending.changes : {})) {
      assert.ok(D.isLoosening(key, state.settings[key], value), `${profile.id}: ${key} would apply now, not wait`);
    }
    for (const day of Object.keys(state.log)) assert.ok(day <= state.day && day >= D.addDays(state.day, -89), `${profile.id}: ${day}`);
    assert.ok(D.weekView(state).average !== null, profile.id);
  }
  assert.equal(P.find('nope'), null);
});
