// @ts-check

// Channel allow and block lists (RELEASE-PLAN.md item 4, CHANNEL-LISTS-PLAN.md). Written from the plan before the code.

const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/lib/state.js');
const D = globalThis.Drip;

/** @param {number} day @param {number} [hour] */
const time = (day, hour = 12) => new Date(2026, 9, day, hour).getTime();
const NOW = time(5);
/** Installed on the 1st and looked at on the 5th, so Q6's waiting applies. */
function settled() {
  const state = D.initialState(time(1));
  state.day = D.dayKey(NOW, state.settings.resetHour);
  return state;
}
const VERI = { ids: ['@veritasium'], name: 'Veritasium' };
const BLUE = { ids: ['@3blue1brown'], name: '3Blue1Brown' };
/** @param {string} id @param {any} [extra] */
const video = (id, extra = {}) => ({ id, title: `Title ${id}`, channel: 'Veritasium', length: '14:02', ...extra });
/** The next day's first message, as the worker sends it. @param {any} state */
const nextDay = state => D.rollDay(state, time(6));

test('channel ids come from a handle, a channel URL, or a UC id, and anything else is refused', () => {
  assert.equal(D.channelId('@Veritasium'), '@veritasium');
  assert.equal(D.channelId('https://www.youtube.com/@Veritasium/videos'), '@veritasium');
  assert.equal(D.channelId('youtube.com/@veritasium'), '@veritasium');
  assert.equal(D.channelId('/@veritasium'), '@veritasium');
  assert.equal(D.channelId('https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA'), 'UCHnyfMqiRRG1u-2MsSQLbXA');
  assert.equal(D.channelId('UCHnyfMqiRRG1u-2MsSQLbXA'), 'UCHnyfMqiRRG1u-2MsSQLbXA');
  assert.equal(D.channelId('https://www.youtube.com/watch?v=abc'), '');
  assert.equal(D.channelId('veritasium'), '');
  assert.equal(D.channelId(''), '');
  assert.equal(D.channelId(42), '');
});

test('two sightings are one channel when they share an id, or by name when one has no ids', () => {
  assert.equal(D.sameChannel(VERI, { ids: ['@veritasium', 'UCHnyfMqiRRG1u-2MsSQLbXA'], name: 'x' }), true);
  assert.equal(D.sameChannel(VERI, { ids: [], name: 'Veritasium' }), true);
  assert.equal(D.sameChannel({ ids: [], name: 'Veritasium' }, VERI), true);
  assert.equal(D.sameChannel(VERI, { ids: ['@other'], name: 'Veritasium' }), false, 'two different handles are two channels');
  assert.equal(D.sameChannel(VERI, { ids: [], name: 'veritasium' }), false, 'names match exactly');
  assert.equal(D.sameChannel({ ids: ['@a'], name: '' }, { ids: [], name: '' }), false, 'no name matches nothing');
});

test('allowing waits for the reset, and removing applies at once', () => {
  const state = settled();
  const res = D.allowChannel(state, VERI, NOW);
  assert.deepEqual(res, { ok: true, waits: true });
  assert.equal(state.channels.allow.length, 0);
  assert.equal(state.channelsPending.allow.length, 1);
  nextDay(state);
  assert.deepEqual(state.channels.allow.map(c => c.ids), [['@veritasium']]);
  assert.equal(state.channelsPending, null);
  D.removeAllowed(state, VERI);
  assert.equal(state.channels.allow.length, 0);
});

test('removing a waiting allow cancels it', () => {
  const state = settled();
  D.allowChannel(state, VERI, NOW);
  D.removeAllowed(state, VERI);
  assert.equal(state.channelsPending, null);
  nextDay(state);
  assert.equal(state.channels.allow.length, 0);
});

test('blocking and unblocking both apply at once (unblocking since 2026-11-04)', () => {
  const state = settled();
  assert.deepEqual(D.blockChannel(state, BLUE), { ok: true });
  assert.equal(state.channels.block.length, 1);
  assert.deepEqual(D.unblockChannel(state, BLUE, NOW), { ok: true, waits: false });
  assert.equal(state.channels.block.length, 0);
  assert.equal(state.channelsPending, null);
});

test('an unblock saved waiting before 2026-11-04 still applies at the reset, and unblocking again applies it now', () => {
  const state = settled();
  D.blockChannel(state, BLUE);
  D.blockChannel(state, VERI);
  state.channelsPending = { effectiveDay: D.addDays(state.day, 1), allow: [], unblock: [{ ...BLUE }, { ...VERI }] };
  D.unblockChannel(state, VERI, NOW);
  assert.deepEqual(state.channels.block.map(c => c.name), ['3Blue1Brown']);
  assert.deepEqual(state.channelsPending.unblock.map(c => c.name), ['3Blue1Brown']);
  nextDay(state);
  assert.equal(state.channels.block.length, 0);
});

test('blocking a channel whose unblock is waiting cancels the unblock', () => {
  const state = settled();
  D.blockChannel(state, BLUE);
  D.unblockChannel(state, BLUE, NOW);
  D.blockChannel(state, BLUE);
  assert.equal(state.channelsPending, null);
  nextDay(state);
  assert.equal(state.channels.block.length, 1);
});

test('cancelChannelPending drops a waiting allow or unblock', () => {
  const state = settled();
  D.allowChannel(state, VERI, NOW);
  D.blockChannel(state, BLUE);
  D.unblockChannel(state, BLUE, NOW);
  D.cancelChannelPending(state, VERI);
  D.cancelChannelPending(state, BLUE);
  assert.equal(state.channelsPending, null);
});

test('in the first day after install allowing and unblocking apply at once (Q6)', () => {
  const state = D.initialState(NOW);
  assert.deepEqual(D.allowChannel(state, VERI, NOW + 1000), { ok: true, waits: false });
  assert.equal(state.channels.allow.length, 1);
  D.blockChannel(state, BLUE);
  assert.deepEqual(D.unblockChannel(state, BLUE, NOW + 1000), { ok: true, waits: false });
  assert.equal(state.channels.block.length, 0);
});

test('the allow list holds 5, counting waiting ones, and a repeat is not a new one', () => {
  const state = settled();
  for (let i = 0; i < 3; i++) state.channels.allow.push({ ids: [`@c${i}`], name: `C${i}` });
  assert.equal(D.allowChannel(state, { ids: ['@c3'], name: 'C3' }, NOW).ok, true);
  assert.equal(D.allowChannel(state, { ids: ['@c4'], name: 'C4' }, NOW).ok, true);
  assert.deepEqual(D.allowChannel(state, { ids: ['@c5'], name: 'C5' }, NOW), { ok: false, error: 'allow-full' });
  assert.equal(D.allowChannel(state, { ids: ['@c0'], name: 'C0' }, NOW).ok, true, 'already allowed');
  assert.equal(D.allowChannel(state, { ids: ['@c4'], name: 'C4' }, NOW).ok, true, 'already waiting');
  assert.equal(state.channels.allow.length + state.channelsPending.allow.length, 5);
});

test('a channel needs an id to be allowed, and an id or a name to be blocked', () => {
  const state = settled();
  assert.deepEqual(D.allowChannel(state, { ids: [], name: 'Veritasium' }, NOW), { ok: false, error: 'bad-channel' });
  assert.deepEqual(D.blockChannel(state, { ids: [], name: '' }), { ok: false, error: 'bad-channel' });
  assert.equal(D.blockChannel(state, { ids: [], name: 'Veritasium' }).ok, true);
});

test('the block list holds 100', () => {
  const state = settled();
  for (let i = 0; i < 100; i++) assert.equal(D.blockChannel(state, { ids: [`@b${i}`], name: '' }).ok, true);
  assert.deepEqual(D.blockChannel(state, { ids: ['@b100'], name: '' }), { ok: false, error: 'block-full' });
});

test('a sighting with ids and a name fills in an entry that lacked one', () => {
  const state = settled();
  D.blockChannel(state, { ids: ['@veritasium'], name: '' });
  D.blockChannel(state, { ids: [], name: '3Blue1Brown' });
  D.seenChannel(state, { ids: ['@veritasium'], name: 'Veritasium' });
  D.seenChannel(state, { ids: ['@3blue1brown'], name: '3Blue1Brown' });
  assert.deepEqual(state.channels.block, [
    { ids: ['@veritasium'], name: 'Veritasium' },
    { ids: ['@3blue1brown'], name: '3Blue1Brown' },
  ]);
  D.seenChannel(state, { ids: ['@veritasium', 'UCHnyfMqiRRG1u-2MsSQLbXA'], name: 'Veritasium' });
  assert.deepEqual(state.channels.block[0].ids, ['@veritasium', 'UCHnyfMqiRRG1u-2MsSQLbXA']);
});

test('allowedVideo makes a video free only for a channel on the allow list, by id', () => {
  const state = settled();
  state.channels.allow.push({ ...VERI });
  assert.deepEqual(D.allowedVideo(state, 'vid1', BLUE), { ok: true, allowed: false });
  assert.deepEqual(D.allowedVideo(state, 'vid1', { ids: [], name: 'Veritasium' }), { ok: true, allowed: false }, 'a name is not proof');
  assert.deepEqual(D.allowedVideo(state, 'vid1', VERI), { ok: true, allowed: true });
  assert.equal(D.isFree(state, 'vid1'), true);
  assert.equal(D.isFree(state, 'vid2'), false);
  assert.deepEqual(D.allowedVideo(state, 'bad id!', VERI), { ok: false, error: 'bad-video' });
});

test('a waiting allow does not make videos free yet', () => {
  const state = settled();
  D.allowChannel(state, VERI, NOW);
  assert.equal(D.allowedVideo(state, 'vid1', VERI).allowed, false);
  assert.equal(D.isFree(state, 'vid1'), false);
});

test('removing a channel ends a free video at once (Codex 7)', () => {
  const state = settled();
  state.channels.allow.push({ ...VERI });
  D.allowedVideo(state, 'vid1', VERI);
  D.removeAllowed(state, VERI);
  assert.equal(D.isFree(state, 'vid1'), false);
  state.watchSecondsLeft = 0;
  assert.equal(D.watchStatus(state, 'vid1').locked, true);
});

test('an allowed video costs no minutes, never locks, and the reset clears it', () => {
  const state = settled();
  state.channels.allow.push({ ...VERI });
  D.allowedVideo(state, 'vid1', VERI);
  state.watchSecondsLeft = 60;
  D.charge(state, 30, 'vid1');
  assert.equal(state.watchSecondsLeft, 60);
  assert.equal(D.logDay(state).watchedSec, 30, 'still logged for History');
  const clock = { lastChargeEnd: 0 };
  D.chargeTick(state, clock, NOW, 20, 'vid1');
  assert.equal(state.watchSecondsLeft, 60);
  state.watchSecondsLeft = 0;
  assert.deepEqual(D.watchStatus(state, 'vid1'), { secondsLeft: 0, unlocked: false, allowed: true, locked: false });
  assert.deepEqual(D.buyIfOut(state, 'vid1'), { ok: true, bought: false });
  assert.equal(state.unlocked.length, 0, 'it does not use up "I need this one"');
  nextDay(state);
  assert.deepEqual(state.allowedToday, []);
});

test('earlyLocked lets an allowed video through, and not after its channel is removed', () => {
  const state = settled();
  state.channels.allow.push({ ...VERI });
  D.allowedVideo(state, 'vid1', VERI);
  state.watchSecondsLeft = 0;
  const raw = JSON.parse(JSON.stringify(state));
  assert.equal(D.earlyLocked(raw, NOW, 'vid1'), false);
  assert.equal(D.earlyLocked(raw, NOW, 'vid2'), true);
  raw.channels.allow = [];
  assert.equal(D.earlyLocked(raw, NOW, 'vid1'), true);
});

test('Watch at 0 minutes on a card or stash row from an allowed channel buys no drop', () => {
  const state = settled();
  state.channels.allow.push({ ...VERI });
  state.tokens.watch = 3;
  state.watchSecondsLeft = 0;
  state.current = D.cleanVideo(video('card', { channelIds: ['@veritasium'] }));
  assert.deepEqual(D.buyIfOut(state, 'card'), { ok: true, bought: false });
  state.backlog.push(/** @type {any} */ (D.cleanVideo(video('row', { channel: 'Veritasium' }))));
  assert.deepEqual(D.buyIfOut(state, 'row'), { ok: true, bought: false }, 'a home-page row matches by name');
  state.backlog.push(/** @type {any} */ (D.cleanVideo(video('other', { channel: '3Blue1Brown' }))));
  assert.deepEqual(D.buyIfOut(state, 'other'), { ok: true, bought: true });
  assert.equal(state.tokens.watch, 2);
});

test('cleanVideo keeps valid channel ids and drops the rest', () => {
  const v = D.cleanVideo(video('a', { channelIds: ['@veritasium', 'nope', 7, 'UCHnyfMqiRRG1u-2MsSQLbXA'] }));
  assert.deepEqual(v?.channelIds, ['@veritasium', 'UCHnyfMqiRRG1u-2MsSQLbXA']);
  assert.equal('channelIds' in /** @type {any} */ (D.cleanVideo(video('b'))), false);
});

test('a reveal never deals a blocked channel, by id or by name', () => {
  const state = settled();
  D.blockChannel(state, BLUE);
  assert.equal(D.canDeal(state, { id: 'a', title: 'A', channel: 'Other', channelIds: ['@3blue1brown'] }), false);
  assert.equal(D.canDeal(state, { id: 'b', title: 'B', channel: '3Blue1Brown' }), false);
  assert.equal(D.canDeal(state, { id: 'c', title: 'C', channel: 'Veritasium' }), true);
  const res = D.reveal(state, [{ id: 'b', title: 'B', channel: '3Blue1Brown' }, { id: 'c', title: 'C', channel: 'Veritasium' }]);
  assert.equal(res.video.id, 'c');
});

test("a channel name keeps 200 characters on one line, and a card's name matches a block entry the same way", () => {
  assert.deepEqual(D.cleanChannel({ ids: ['@long'], name: `  Long\n  name ${'n'.repeat(1e6)}` }), { ids: ['@long'], name: `Long name ${'n'.repeat(190)}` });
  const state = settled();
  D.blockChannel(state, { ids: [], name: 'Two  Spaces' });
  assert.deepEqual(state.channels.block, [{ ids: [], name: 'Two Spaces' }]);
  assert.equal(D.canDeal(state, { id: 'a', title: 'A', channel: 'Two  Spaces' }), false, "the card's name is cleaned the same way");
});

test('Block on the card blocks its channel and passes it, with no card back', () => {
  const state = settled();
  D.reveal(state, [{ id: 'b', title: 'B', channel: '3Blue1Brown' }]);
  const rec = state.tokens.rec;
  const res = D.resolveCurrent(state, 'block', 'b', NOW);
  assert.equal(res.ok, true);
  assert.equal(state.current, null);
  assert.equal(state.tokens.rec, rec);
  assert.equal(D.logDay(state).passed, 1);
  assert.deepEqual(state.channels.block, [{ ids: [], name: '3Blue1Brown' }]);
});

test('Block on a stashed card keeps it counted as saved', () => {
  const state = settled();
  D.reveal(state, [{ id: 'b', title: 'B', channel: '3Blue1Brown' }]);
  D.resolveCurrent(state, 'save', 'b', NOW);
  D.resolveCurrent(state, 'block', 'b', NOW);
  assert.equal(D.logDay(state).saved, 1);
  assert.equal(D.logDay(state).passed, 0);
});

test('Block on a card with no channel name is refused and leaves the card up', () => {
  const state = settled();
  D.reveal(state, [{ id: 'b', title: 'B', channel: '' }]);
  assert.deepEqual(D.resolveCurrent(state, 'block', 'b', NOW), { ok: false, error: 'bad-channel' });
  assert.equal(state.current?.id, 'b');
});

test('the dev panel applies and moves waiting channel changes too', () => {
  const state = settled();
  D.allowChannel(state, VERI, NOW);
  D.devAction(state, 'apply-pending', NOW);
  assert.equal(state.channels.allow.length, 1);
  assert.equal(state.channelsPending, null);
  D.allowChannel(state, BLUE, NOW);
  const today = state.day;
  D.devAction(state, 'reset-now', NOW);
  assert.equal(state.channelsPending.effectiveDay, today, 'moves back a day with the day');
  assert.equal(D.rollDay(state, NOW), true);
  assert.equal(state.channels.allow.length, 2);
});

test('hydrate keeps clean lists and drops junk, and old state gets empty lists', () => {
  const old = D.hydrate({ day: '2026-10-05' }, NOW);
  assert.deepEqual(old.channels, { allow: [], block: [] });
  assert.equal(old.channelsPending, null);
  assert.deepEqual(old.allowedToday, []);
  const raw = {
    day: '2026-10-05',
    channels: { allow: [VERI, { ids: ['bad'], name: 'x' }, 'junk'], block: [{ ids: [], name: 'Named' }] },
    channelsPending: { effectiveDay: '2026-10-06', allow: [BLUE], unblock: [] },
    allowedToday: [{ id: 'vid1', ids: ['@veritasium'] }, { id: 'bad id', ids: [] }],
  };
  const state = D.hydrate(raw, NOW);
  assert.deepEqual(state.channels.allow, [VERI]);
  assert.deepEqual(state.channels.block, [{ ids: [], name: 'Named' }]);
  assert.deepEqual(state.channelsPending?.allow, [BLUE]);
  assert.deepEqual(state.allowedToday, [{ id: 'vid1', ids: ['@veritasium'] }]);
});

test('export carries the lists as they will be after the reset', () => {
  const state = settled();
  state.channels.allow.push({ ...VERI });
  D.allowChannel(state, BLUE, NOW);
  D.blockChannel(state, { ids: ['@spam'], name: 'Spam' });
  D.blockChannel(state, { ids: ['@gone'], name: 'Gone' });
  D.unblockChannel(state, { ids: ['@gone'], name: 'Gone' }, NOW);
  const out = D.exportData(state, NOW);
  assert.deepEqual(out.channels.allow.map(c => c.name), ['Veritasium', '3Blue1Brown']);
  assert.deepEqual(out.channels.block.map(c => c.name), ['Spam']);
});

test('import adds the lists under the same rules, and an old file without them still imports', () => {
  const state = settled();
  const file = { app: 'drip', format: 1, settings: {}, channels: { allow: [VERI], block: [BLUE] } };
  const res = D.importData(state, file, NOW);
  assert.equal(res.ok, true);
  assert.equal(state.channels.allow.length, 0, 'an allow waits');
  assert.equal(state.channelsPending.allow.length, 1);
  assert.equal(state.channels.block.length, 1, 'a block applies now');
  assert.equal(res.channelsAdded, 2);
  const old = D.importData(settled(), { app: 'drip', format: 1, settings: {} }, NOW);
  assert.equal(old.ok, true);
  assert.equal(old.channelsAdded, 0);
});

test('reset empties the allow list and the block list at once', () => {
  const state = settled();
  state.channels.allow.push({ ...VERI });
  D.allowChannel(state, BLUE, NOW);
  D.allowedVideo(state, 'vid1', VERI);
  D.blockChannel(state, { ids: ['@spam'], name: 'Spam' });
  D.resetData(state, NOW);
  assert.equal(state.channels.allow.length, 0);
  assert.equal(D.isFree(state, 'vid1'), false);
  assert.equal(state.channelsPending?.allow.length ?? 0, 0, 'a waiting allow is cancelled');
  assert.equal(state.channels.block.length, 0);
});

test('a handle in another script works, and a broken % escape is refused without throwing (Codex)', () => {
  assert.equal(D.channelId('@料理'), '@料理');
  assert.equal(D.channelId(`https://www.youtube.com/@${encodeURIComponent('料理')}/videos`), '@料理');
  assert.equal(D.channelId('/@bad%'), '');
  assert.deepEqual(D.cleanChannel({ ids: ['@料理'], name: 'x' })?.ids, ['@料理']);
});

test('a channel is never on both lists: blocking takes it off the allow list, and a blocked one can\'t be allowed (code review)', () => {
  const state = settled();
  state.channels.allow.push({ ...VERI });
  D.allowedVideo(state, 'vid1', VERI);
  D.allowChannel(state, BLUE, NOW);
  D.blockChannel(state, VERI);
  D.blockChannel(state, BLUE);
  assert.equal(state.channels.allow.length, 0);
  assert.equal(state.channelsPending, null, 'the waiting allow goes too');
  assert.equal(D.isFree(state, 'vid1'), false);
  assert.deepEqual(D.allowChannel(state, VERI, NOW), { ok: false, error: 'channel-blocked' });
});

test('import says how many allowed channels wait for the reset (code review)', () => {
  const state = settled();
  const res = D.importData(state, { app: 'drip', format: 1, settings: {}, channels: { allow: [VERI, BLUE], block: [] } }, NOW);
  assert.equal(res.channelsAdded, 2);
  assert.equal(res.channelsWaiting, 2);
  assert.equal(D.allowCount(state), 2);
});

test('Developer mode can end the first day early, so loosening waits, and turn it back (Jesse, 2026-11-03)', () => {
  const state = D.initialState(NOW);
  assert.ok(D.firstDayUntil(state, NOW + 1000) > 0);
  D.devAction(state, 'first-day-off', NOW);
  assert.equal(D.firstDayUntil(state, NOW + 1000), 0);
  assert.deepEqual(D.allowChannel(state, VERI, NOW + 1000), { ok: true, waits: true });
  assert.deepEqual(Object.keys(D.updateSettings(state, { watchTokensPerDay: 8 }, NOW + 1000).pending), ['watchTokensPerDay']);
  assert.equal(D.hydrate(JSON.parse(JSON.stringify(state)), NOW).firstDayOff, true, 'it survives storage');
  D.devAction(state, 'first-day-on', NOW);
  assert.ok(D.firstDayUntil(state, NOW + 1000) > 0);
});

test('a channel keeps a picture only from YouTube\'s image hosts, and a channel page updates it', () => {
  const pic = 'https://yt3.googleusercontent.com/7vCbvtCqtjQ3YLgs-A=s160-c-k-c0x00ffffff-no-rj';
  assert.deepEqual(D.cleanChannel({ ...VERI, avatar: pic }), { ...VERI, avatar: pic });
  for (const bad of ['http://yt3.googleusercontent.com/x', 'https://evil.example/x.png', 'javascript:alert(1)', 'https://yt3.googleusercontent.com/a b', 42]) {
    assert.deepEqual(D.cleanChannel({ ...VERI, avatar: bad }), VERI, String(bad));
  }
  const state = settled();
  D.blockChannel(state, VERI);
  assert.equal(state.channels.block[0].avatar, undefined);
  assert.equal(D.seenChannel(state, { ...VERI, avatar: pic }).changed, true);
  assert.equal(state.channels.block[0].avatar, pic);
  assert.equal(D.seenChannel(state, { ...VERI, avatar: pic }).changed, false, 'the same picture changes nothing');
  assert.equal(D.seenChannel(state, { ids: [], name: 'Veritasium', avatar: pic.replace('A=', 'B=') }).changed, false, 'a name-only sighting never sets a picture');
  assert.equal(D.hydrate(JSON.parse(JSON.stringify(state)), NOW).channels.block[0].avatar, pic, 'it survives storage');
});

test('a channel page\'s og tags give its name, UC id, and a 160px picture', () => {
  const html = '<head><meta property="og:title" content="Tom &amp; Jerry&#39;s"><meta property="og:url" content="https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA">'
    + '<meta property="og:image" content="https://yt3.googleusercontent.com/7vCbvtCq-1GoA=s900-c-k-c0x00ffffff-no-rj"></head>';
  assert.deepEqual(D.channelFromPage(html, '@Veritasium'), {
    ids: ['@veritasium', 'UCHnyfMqiRRG1u-2MsSQLbXA'], name: "Tom & Jerry's",
    avatar: 'https://yt3.googleusercontent.com/7vCbvtCq-1GoA=s160-c-k-c0x00ffffff-no-rj',
  });
  assert.equal(D.channelFromPage('<html>no tags</html>', '@veritasium'), null, 'no title, nothing to fill in');
  assert.equal(D.channelFromPage(html, 'not a handle'), null);
  const bad = html.replace('https://yt3.googleusercontent.com', 'https://evil.example');
  assert.equal(D.channelFromPage(bad, '@veritasium').avatar, undefined, 'a picture from anywhere else is dropped');
  const state = settled();
  D.blockChannel(state, { ids: ['@veritasium'], name: '' });
  D.seenChannel(state, D.channelFromPage(html, '@veritasium'));
  assert.equal(state.channels.block[0].name, "Tom & Jerry's", 'a block added by handle learns its name');
});
