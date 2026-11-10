// @ts-check

// Export, import, and reset (RELEASE-PLAN.md, item 5).

const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/lib/state.js');
const D = globalThis.Drip;

/** @param {number} day @param {number} [hour] */
const time = (day, hour = 12) => new Date(2026, 9, day, hour).getTime();
/** @param {string} id */
const video = id => ({ id, title: `Title ${id}`, channel: 'Channel', length: '14:02' });
/** A state installed on the 1st and looked at on the 5th, past its first day, so Q6's waiting applies. */
function settled() {
  const state = D.initialState(time(1));
  state.day = D.dayKey(time(5), state.settings.resetHour);
  return state;
}
const NOW = time(5);

test('export carries the planned settings, the stash, and the log, and not the balances', () => {
  const state = settled();
  D.updateSettings(state, { watchTokensPerDay: 2, rolloverDays: 5 }, NOW);
  state.backlog.push(video('a'));
  state.log['2026-10-04'] = { ...D.logDay(state), watchedSec: 600 };
  const out = D.exportData(state, NOW);
  assert.equal(out.app, 'drip');
  assert.equal(out.format, 1);
  assert.equal(out.settings.watchTokensPerDay, 2);
  assert.equal(out.settings.rolloverDays, 5, 'a change waiting for the reset is exported as chosen');
  assert.deepEqual(out.backlog.map((/** @type {any} */ v) => v.id), ['a']);
  assert.equal(out.log['2026-10-04'].watchedSec, 600);
  for (const key of ['tokens', 'watchSecondsLeft', 'unlocked', 'seen']) assert.equal(key in out, false);
});

test('an export imports back into a fresh install', () => {
  const from = settled();
  D.updateSettings(from, { searchCap: false, hideShorts: false }, NOW);
  from.backlog.push(video('a'), video('b'));
  from.log['2026-10-03'] = { ...D.logDay(from), watchedSec: 900, needThis: [{ videoId: 'x', title: 'X', reason: 'class', at: 1 }] };
  const file = JSON.parse(JSON.stringify(D.exportData(from, NOW)));

  const to = settled();
  const tokens = { ...to.tokens };
  const res = D.importData(to, file, NOW);
  assert.equal(res.ok, true);
  // Both loosen, so they wait for the reset.
  assert.deepEqual(res.pending, { searchCap: false, hideShorts: false });
  assert.equal(to.settings.searchCap, true);
  assert.deepEqual(to.backlog.map((v) => v.id), ['a', 'b']);
  assert.equal(res.stashAdded, 2);
  assert.equal(to.log['2026-10-03'].watchedSec, 900);
  assert.equal(to.log['2026-10-03'].needThis[0].reason, 'class');
  assert.equal(res.daysAdded, 1);
  assert.deepEqual(to.tokens, tokens, "today's drops and cards stay");
});

test('import tightens at once, and never replaces a stashed video or a logged day', () => {
  const state = settled();
  state.backlog.push({ ...video('a'), title: 'Mine' });
  state.log['2026-10-03'] = { ...D.logDay(state), watchedSec: 60 };
  const res = D.importData(state, {
    app: 'drip', format: 1, settings: { watchTokensPerDay: 2 },
    backlog: [{ ...video('a'), title: 'Theirs' }, video('b'), { id: 'bad id!' }],
    log: { '2026-10-03': { watchedSec: 9999 }, '2026-10-02': { watchedSec: 120, watched: 'lots' }, nonsense: {} },
  }, NOW);
  assert.deepEqual(res.applied, { watchTokensPerDay: 2 });
  assert.deepEqual(state.backlog.map((v) => [v.id, v.title]), [['a', 'Mine'], ['b', 'Title b']]);
  assert.equal(state.log['2026-10-03'].watchedSec, 60);
  assert.equal(state.log['2026-10-02'].watchedSec, 120);
  assert.equal(state.log['2026-10-02'].watched, 0);
  assert.equal(state.log.nonsense, undefined);
});

test("import skips today's and later log days, and stops at the stash's size", () => {
  const state = settled();
  state.settings.stashMax = 2;
  state.backlog.push(video('a'));
  const res = D.importData(state, {
    app: 'drip', format: 1,
    backlog: [video('b'), video('c'), video('d')],
    log: { [state.day]: { watchedSec: 1 }, '2099-01-01': { watchedSec: 1 } },
  }, NOW);
  assert.deepEqual(state.backlog.map((v) => v.id), ['a', 'b']);
  assert.equal(res.stashAdded, 1);
  assert.equal(res.stashSkipped, 2);
  assert.equal(res.daysAdded, 0);
  assert.equal(state.log['2099-01-01'], undefined);
});

test('import refuses a file that is not a drip export, and changes nothing', () => {
  for (const [raw, error] of /** @type {[unknown, string][]} */ ([
    [null, 'not-drip'], [[], 'not-drip'], [{ settings: {} }, 'not-drip'], [{ app: 'drip', format: 2 }, 'bad-format'],
  ])) {
    const state = settled();
    const before = structuredClone(state);
    assert.deepEqual(D.importData(state, raw, NOW), { ok: false, error });
    assert.deepEqual(state, before);
  }
});

test('reset puts back the defaults through the reset rule, empties the stash, and keeps the log and balances', () => {
  const state = settled();
  Object.assign(state.settings, { watchTokensPerDay: 8, searchCap: false, hideBell: false });
  state.pending = { effectiveDay: D.addDays(state.day, 1), changes: { stashMax: 20 } };
  state.backlog.push(video('a'), video('b'));
  state.log['2026-10-03'] = { ...D.logDay(state), watchedSec: 60 };
  state.tokens = { watch: 3, rec: 7 };
  const res = D.resetData(state, NOW);
  assert.equal(res.ok, true);
  assert.equal(res.stashCleared, 2);
  assert.deepEqual(state.backlog, []);
  // Back to defaults is tighter for all three, so it applies now, and the waiting change is dropped.
  assert.equal(state.settings.watchTokensPerDay, 4);
  assert.equal(state.settings.searchCap, true);
  assert.equal(state.settings.hideBell, true);
  assert.equal(state.pending, null);
  assert.deepEqual(state.tokens, { watch: 3, rec: 7 });
  assert.equal(state.log['2026-10-03'].watchedSec, 60);
});

test('reset waits for the reset when a default loosens', () => {
  const state = settled();
  state.settings.watchTokensPerDay = 2;
  const res = D.resetData(state, NOW);
  assert.deepEqual(res.pending, { watchTokensPerDay: 4 });
  assert.equal(state.settings.watchTokensPerDay, 2);
});

test('import and reset leave today\'s balances alone, over a lowered cap and on the first day (Codex)', () => {
  const state = settled();
  Object.assign(state.settings, { watchTokensPerDay: 10 });
  state.tokens = { watch: 15, rec: 20 };
  D.resetData(state, NOW);
  assert.equal(state.settings.watchTokensPerDay, 4);
  assert.deepEqual(state.tokens, { watch: 15, rec: 20 });
  D.importData(state, { app: 'drip', format: 1, settings: { watchTokensPerDay: 1 } }, NOW);
  assert.deepEqual(state.tokens, { watch: 15, rec: 20 });

  const fresh = D.initialState(NOW);
  D.updateSettings(fresh, { watchTokensPerDay: 0 }, NOW);
  assert.equal(fresh.tokens.watch, 0);
  D.resetData(fresh, NOW);
  assert.equal(fresh.settings.watchTokensPerDay, 4, 'the first day applies everything at once');
  assert.equal(fresh.tokens.watch, 0, 'but hands back no drops');
});

test('the card showing counts as saved when import stashes it, and stops when reset empties the stash (Codex)', () => {
  const imported = settled();
  D.reveal(imported, [video('a')]);
  D.importData(imported, { app: 'drip', format: 1, backlog: [video('a')] }, NOW);
  assert.equal(D.logDay(imported).saved, 1);

  const reset = settled();
  D.reveal(reset, [video('a')]);
  D.resolveCurrent(reset, 'save', 'a', NOW);
  assert.equal(D.logDay(reset).saved, 1);
  D.resetData(reset, NOW);
  assert.equal(D.logDay(reset).saved, 0);
  D.resolveCurrent(reset, 'pass', 'a', NOW);
  assert.equal(D.cardsLine(D.logDay(reset)), 'Of 1 card, 1 passed.');
});

test('import skips log days that are not real dates or older than the 90 days kept (Codex)', () => {
  const state = settled();
  const old = D.addDays(state.day, -90);
  const kept = D.addDays(state.day, -89);
  const res = D.importData(state, {
    app: 'drip', format: 1,
    log: { '2026-00-01': { watchedSec: 1 }, '2026-02-30': { watchedSec: 1 }, [old]: { watchedSec: 1 }, [kept]: { watchedSec: 1 } },
  }, NOW);
  assert.deepEqual(Object.keys(state.log), [kept]);
  assert.equal(res.daysAdded, 1);
  assert.doesNotThrow(() => D.weekView(state, 0));
});

test('imported "I need this one" uses from the last 7 days count against the week (DRY-HOURS-PLAN.md A6)', () => {
  const from = settled();
  from.log['2026-10-03'] = { ...D.logDay(from), needThis: [{ videoId: 'x', title: 'X', reason: 'class', at: time(3) }, { videoId: 'y', title: 'Y', reason: 'class', at: time(3, 13) }] };
  const file = JSON.parse(JSON.stringify(D.exportData(from, NOW)));
  assert.equal(file.log['2026-10-03'].needThis.length, 2, 'export keeps the uses');
  const to = settled();
  D.importData(to, file, NOW);
  assert.equal(D.needThisUsed(to, NOW), 2);
  assert.equal(D.needThisLeft(to, NOW), 1);
});

test('import caps the text and the number of uses it brings in, like a click would (B2)', () => {
  const long = 'q'.repeat(1e6);
  const day = D.addDays(settled().day, -2);
  const uses = Array.from({ length: 30 }, (_, n) => ({ videoId: `v${n}`, title: long, reason: long, at: time(3) + n }));
  uses.push({ videoId: 'x'.repeat(1e6), title: 'X', reason: 'Class', at: time(3, 13) });
  const state = settled();
  const res = D.importData(state, {
    app: 'drip', format: 1, backlog: [{ ...video('a'), title: long, channel: long, views: long }],
    log: { [day]: { watchedSec: 60, needThis: uses } },
    channels: { block: [{ ids: ['@long'], name: long }] },
  }, NOW);
  assert.equal(res.stashAdded, 1);
  assert.deepEqual([state.backlog[0].title.length, state.backlog[0].channel.length, state.backlog[0].views?.length], [200, 200, 200]);
  const kept = state.log[day].needThis;
  assert.equal(kept.length, 20, 'at most 20 uses a day, the latest, and none with a made-up video id');
  assert.equal(kept[0].videoId, 'v10');
  assert.ok(kept.every((use) => use.title.length === 200 && use.reason.length === 300));
  assert.equal(state.channels.block[0].name.length, 200);
});

/**
 * The bytes chrome.storage.local counts for a value. Chrome writes `<` as `<`, six bytes for one character
 * (checked in Chrome 157), so text of `<` is the worst case a file can bring.
 * @param {unknown} value
 */
const storedBytes = (value) => Buffer.byteLength(JSON.stringify(value).replace(/</g, '\\u003C'));

test('no file Import accepts fills more than a fifth of storage once cleaned, even after two imports', () => {
  const worst = '<'.repeat(400);
  const handles = (/** @type {string} */ tag) => [1, 2, 3, 4].map((n) => `@${tag}${n}${'é'.repeat(95)}`);
  const channel = (/** @type {string} */ tag) => ({ ids: handles(tag), name: worst, avatar: `https://yt3.ggpht.com/${'a'.repeat(390)}` });
  /** @param {number} from @param {number} to Which of the 89 days before today the file holds. */
  const file = (from, to) => ({
    app: 'drip', format: 1, settings: { stashMax: 50 },
    backlog: Array.from({ length: 60 }, (_, n) => ({ id: `v${from}x${n}`, title: worst, channel: worst, length: worst, views: worst, age: worst, channelIds: handles(`v${n}`) })),
    log: Object.fromEntries(Array.from({ length: 89 }, (_, n) => [D.addDays(D.dayKey(NOW, 4), -1 - n), {
      watchedSec: 60, needThis: Array.from({ length: 30 }, (_, k) => ({ videoId: `u${n}x${k}${'-'.repeat(50)}`, title: worst, reason: worst, at: time(3) })),
    }]).slice(from, to)),
    channels: { allow: Array.from({ length: 10 }, (_, n) => channel(`a${n}`)), block: Array.from({ length: 150 }, (_, n) => channel(`b${n}`)) },
  });
  const files = [JSON.stringify(file(0, 45)), JSON.stringify(file(45, 89))];
  for (const text of files) assert.ok(text.length < 5 * 1024 * 1024, 'under the 5 MB Import reads');
  // A fresh install, so the file's stash size of 50 applies at once.
  const state = D.initialState(NOW);
  for (const text of files) D.importData(state, JSON.parse(text), NOW);
  assert.equal(state.backlog.length, 50);
  assert.equal(Object.keys(state.log).length, 89);
  assert.ok(storedBytes(state) < 2 * 1024 * 1024, `${storedBytes(state)} bytes`);
});

test('import keeps at most the uses the weekly allowance could log in the 90 days, newest first', () => {
  const state = settled();
  const use = (/** @type {number} */ n) => ({ videoId: `u${n}`, title: 'T', reason: 'Class', at: time(3) });
  state.log[D.addDays(state.day, -1)] = { ...D.logDay(state), needThis: [use(0), use(1)] };
  const days = Array.from({ length: 30 }, (_, n) => D.addDays(state.day, -2 - n));
  D.importData(state, { app: 'drip', format: 1, log: Object.fromEntries(days.map((day) => [day, { watchedSec: 60, needThis: Array.from({ length: 10 }, (_, k) => use(k)) }])) }, NOW);
  const counts = days.map((day) => state.log[day].needThis.length);
  // 13 weeks of the highest allowance, 20, is 260. Two were there, so 258 come in: 25 full days and 8 of the 26th.
  assert.deepEqual(counts, [...Array(25).fill(10), 8, 0, 0, 0, 0]);
  assert.ok(days.every((day) => state.log[day].watchedSec === 60), 'a day past the limit still keeps its numbers');
});

test('an imported "no" or "false" turns neither Dry hours nor grace mode on', () => {
  const state = D.initialState(NOW);
  const res = D.importData(state, { app: 'drip', format: 1, settings: { dryHours: 'no', graceMode: 'false', hideBell: 0 } }, NOW);
  assert.deepEqual([res.applied, res.pending], [{}, {}]);
  assert.deepEqual([state.settings.dryHours, state.settings.graceMode, state.settings.hideBell], [false, false, true]);
});

test('import holds each log number to what one day can hold', () => {
  const state = settled();
  const day = D.addDays(state.day, -1);
  const huge = { watchedSec: 1e308, watchSpent: 1e300, recSpent: 1e300, saved: 1e300, passed: 1e300, watched: 1e300 };
  D.importData(state, { app: 'drip', format: 1, log: {
    [day]: { ...huge, needThis: [{ videoId: 'x', title: 'X', reason: 'Class', at: 1e300 }] },
    [D.addDays(state.day, -2)]: { watchedSec: 3600, watchSpent: 4, recSpent: 10, saved: 2, passed: 7, watched: 1 },
  } }, NOW);
  // The longest day is 47 hours (Q12). The most drops a day can spend is the most a balance holds: 48 a day, kept 7
  // days. Cards in Curated cost nothing, so their counts get one a second for the longest day.
  const longest = 47 * 3600;
  assert.deepEqual({ ...state.log[day], needThis: undefined }, { watchedSec: longest, watchSpent: 336, recSpent: longest, saved: longest, passed: longest, watched: longest, needThis: undefined });
  assert.equal(D.formatMinutes(state.log[day].watchedSec), '47h');
  assert.equal(state.log[day].needThis[0].at, NOW, 'a use from the future counts as made at the import');
  assert.deepEqual(state.log[D.addDays(state.day, -2)], { watchedSec: 3600, watchSpent: 4, recSpent: 10, saved: 2, passed: 7, watched: 1, needThis: [] });
  // A future time counted as now for as long as the day stayed in the log. Now it counts for a week.
  assert.equal(D.needThisUsed(state, NOW + 7 * 86400e3), 0);
});

test('reset keeps the week of "I need this one" uses', () => {
  const state = settled();
  D.needThis(state, 'a', 'A', 'Study', NOW);
  D.resetData(state, NOW);
  assert.equal(D.needThisUsed(state, NOW), 1);
});
