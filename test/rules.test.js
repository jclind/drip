// @ts-check
// Rules that used to live inside content scripts, tested from DESIGN.md (Q2, Q3, Q7, Q16, Q21).

const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/lib/state.js');
const D = globalThis.Drip;

/** @param {number} day @param {number} [hour] */
const time = (day, hour = 12) => new Date(2026, 9, day, hour).getTime();
const HOME = 'https://www.youtube.com/';

test('Shorts open as ordinary watch pages (Q2)', () => {
  assert.equal(D.redirectTarget('https://www.youtube.com/shorts/abc123'), 'https://www.youtube.com/watch?v=abc123');
  assert.equal(D.redirectTarget('https://www.youtube.com/shorts/abc123/'), 'https://www.youtube.com/watch?v=abc123');
  // The Shorts feed itself, with no video, goes to the token page.
  assert.equal(D.redirectTarget('https://www.youtube.com/shorts'), HOME);
  assert.equal(D.redirectTarget('https://www.youtube.com/shorts/'), HOME);
});

test('live links open as ordinary watch pages', () => {
  assert.equal(D.redirectTarget('https://www.youtube.com/live/abc123'), 'https://www.youtube.com/watch?v=abc123');
});

test('live links accept a trailing slash', () => {
  assert.equal(D.redirectTarget('https://www.youtube.com/live/abc123/'), 'https://www.youtube.com/watch?v=abc123');
});

test('live links drop share parameters', () => {
  assert.equal(D.redirectTarget('https://www.youtube.com/live/abc123?si=abc'), 'https://www.youtube.com/watch?v=abc123');
  assert.equal(D.redirectTarget('https://www.youtube.com/live/abc123?feature=share'), 'https://www.youtube.com/watch?v=abc123');
});

test('live links keep a numeric start time', () => {
  assert.equal(D.redirectTarget('https://www.youtube.com/live/abc123?t=90'), 'https://www.youtube.com/watch?v=abc123&t=90s');
});

test('live links keep a start time in seconds', () => {
  assert.equal(D.redirectTarget('https://www.youtube.com/live/abc123?t=90s'), 'https://www.youtube.com/watch?v=abc123&t=90s');
});

test('the bare live feed still goes to the token page', () => {
  assert.equal(D.redirectTarget('https://www.youtube.com/live'), HOME);
  assert.equal(D.redirectTarget('https://www.youtube.com/live/'), HOME);
});

test('live links with an extra path part stay put', () => {
  assert.equal(D.redirectTarget('https://www.youtube.com/live/abc123/x'), '');
});

test('live links handle start parameters the same way as embeds', () => {
  assert.equal(D.redirectTarget('https://www.youtube.com/live/abc123/?start=30&si=abc'), 'https://www.youtube.com/watch?v=abc123&t=30s');
  assert.equal(D.redirectTarget('https://www.youtube.com/live/abc123?t=45s&start=30'), 'https://www.youtube.com/watch?v=abc123&t=45s');
  assert.equal(D.redirectTarget('https://www.youtube.com/live/abc123?start=junk'), 'https://www.youtube.com/watch?v=abc123');
});

test('live links encode the video id like Shorts', () => {
  assert.equal(D.redirectTarget('https://www.youtube.com/live/abc%2F123'), 'https://www.youtube.com/watch?v=abc%252F123');
});

test('live links on other hosts stay put', () => {
  assert.equal(D.redirectTarget('https://example.com/live/abc123'), '');
  assert.equal(D.redirectTarget('https://www.youtube-nocookie.com/live/abc123'), '');
  assert.equal(D.redirectTarget('https://music.youtube.com/live/abc123'), '');
});

test('subscriptions, Explore, and the topic pages go to the token page (Q16)', () => {
  for (const path of ['/feed/subscriptions', '/feed/explore', '/feed/trending', '/gaming', '/music', '/news', '/sports',
    '/podcasts', '/live', '/shopping', '/channel/UCkYQyvc_i9hXEo4xic9Hh2g', '/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ', '/tv', '/tv/x',
    '/hashtag/ludwig', '/hashtag/ludwig/', '/hashtag/ludwig/shorts']) {
    assert.equal(D.redirectTarget(`https://www.youtube.com${path}`), HOME, path);
  }
});

test('pages people go to on purpose stay put (Q16)', () => {
  for (const url of ['https://www.youtube.com/', 'https://www.youtube.com/watch?v=abc', 'https://www.youtube.com/results?search_query=x',
    'https://www.youtube.com/@somechannel', 'https://www.youtube.com/channel/UCsomeoneelse', 'https://www.youtube.com/feed/history',
    'https://www.youtube.com/playlist?list=PL1', 'https://www.youtube.com/feed/playlists', 'https://www.youtube.com/gaming/x']) {
    assert.equal(D.redirectTarget(url), '', url);
  }
});

test('the mobile site moves to the desktop site, keeping the path and asking for the desktop site', () => {
  assert.equal(D.redirectTarget('https://m.youtube.com/watch?v=abc&t=10'), 'https://www.youtube.com/watch?v=abc&t=10&app=desktop');
  assert.equal(D.redirectTarget('https://m.youtube.com/'), 'https://www.youtube.com/?app=desktop');
  // A mobile Short or feed goes to where the desktop one would, in one move.
  assert.equal(D.redirectTarget('https://m.youtube.com/shorts/abc123'), 'https://www.youtube.com/watch?v=abc123&app=desktop');
  assert.equal(D.redirectTarget('https://m.youtube.com/feed/subscriptions'), 'https://www.youtube.com/?app=desktop');
  // A link that asks for the mobile site doesn't keep asking.
  assert.equal(D.redirectTarget('https://m.youtube.com/watch?app=m&v=abc'), 'https://www.youtube.com/watch?app=desktop&v=abc');
});

test("a phone browser doesn't loop between the two sites (Jesse, 2026-11-16)", () => {
  // To a phone's user agent, www.youtube.com answers 302 to m.youtube.com unless the link says app=desktop.
  /** @param {string} href */
  const youtube = (href) => {
    const url = new URL(href);
    if (url.hostname === 'www.youtube.com' && url.searchParams.get('app') !== 'desktop') url.hostname = 'm.youtube.com';
    return url.href;
  };
  for (const start of ['https://www.youtube.com/', 'https://m.youtube.com/watch?v=abc', 'https://www.youtube.com/shorts/abc', 'https://m.youtube.com/feed/subscriptions']) {
    let href = start;
    let hops = 0;
    for (; hops < 10; hops++) {
      const next = D.redirectTarget(youtube(href)) || youtube(href);
      if (next === href) break;
      href = next;
    }
    assert.ok(hops < 10, `${start} never settles`);
    assert.equal(new URL(href).hostname, 'www.youtube.com', start);
  }
  // If YouTube ever sends app=desktop back to the mobile site, drip leaves that page alone.
  assert.equal(D.redirectTarget('https://m.youtube.com/watch?v=abc&app=desktop'), '');
});

test('an embed opened as its own page becomes a watch page with its start time (Q7)', () => {
  assert.equal(D.redirectTarget('https://www.youtube.com/embed/abc'), 'https://www.youtube.com/watch?v=abc');
  assert.equal(D.redirectTarget('https://www.youtube.com/embed/abc?start=30'), 'https://www.youtube.com/watch?v=abc&t=30s');
  assert.equal(D.redirectTarget('https://www.youtube-nocookie.com/embed/abc?t=45s'), 'https://www.youtube.com/watch?v=abc&t=45s');
  assert.equal(D.redirectTarget('https://www.youtube.com/embed/abc?start=junk'), 'https://www.youtube.com/watch?v=abc');
});

test('other sites are never redirected', () => {
  assert.equal(D.redirectTarget('https://example.com/shorts/abc'), '');
  assert.equal(D.redirectTarget('https://music.youtube.com/feed/explore'), '');
});

test('early lock: no stored state means no minutes, so a video waits', () => {
  assert.equal(D.earlyLocked(undefined, time(6), 'abc'), true);
});

test('early lock: minutes left or an unlock today lets the video start', () => {
  const state = D.initialState(time(6));
  state.watchSecondsLeft = 60;
  assert.equal(D.earlyLocked(state, time(6), 'abc'), false);
  state.watchSecondsLeft = 0;
  state.unlocked = ['abc'];
  assert.equal(D.earlyLocked(state, time(6), 'abc'), false);
  assert.equal(D.earlyLocked(state, time(6), 'other'), true);
});

// Finding 5 in RELEASE-PLAN.md. Grace is for the video already playing when time runs out (Q3). A page that's just
// loading has nothing playing yet.
test('early lock: grace mode does not let a new video start at zero', () => {
  const state = D.initialState(time(6));
  state.settings.graceMode = true;
  assert.equal(D.earlyLocked(state, time(6), 'abc'), true);
});

test("early lock: yesterday's minutes and unlocks don't count after the reset", () => {
  const state = D.initialState(time(6));
  state.watchSecondsLeft = 600;
  state.unlocked = ['abc'];
  assert.equal(D.earlyLocked(state, time(6, 23), 'abc'), false);
  assert.equal(D.earlyLocked(state, time(7, 5), 'abc'), true);
});

// Finding 6: the day boundary must match dayKey, even on a DST change day.
test('early lock uses the same day boundary as dayKey', () => {
  const state = D.initialState(time(6));
  state.watchSecondsLeft = 600;
  state.day = D.dayKey(time(6, 3), 4);
  assert.equal(D.earlyLocked(state, time(6, 3), 'abc'), false);
  assert.equal(D.earlyLocked(state, time(6, 4), 'abc'), true);
});

test("YouTube's next video is its own pick outside a playlist, and the list's inside one (Q2)", () => {
  const plain = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
  const list = 'https://www.youtube.com/watch?v=2Hww7aqAs5o&list=PLKozl91Vtbkxs0R597UzSlLtsaQJLh-lu';
  // The Next button's hrefs as YouTube wrote them on 2026-11-10.
  assert.equal(D.upNextIsPick(plain, 'https://www.youtube.com/watch?v=RD_Jwka9NaY'), true);
  assert.equal(D.upNextIsPick(list, 'https://www.youtube.com/watch?list=PLKozl91Vtbkxs0R597UzSlLtsaQJLh-lu&v=cPKkbFbfiTU'), false);
  // A mix is a list too.
  assert.equal(D.upNextIsPick('https://www.youtube.com/watch?v=abc&list=RDabc', '/watch?v=def&list=RDabc'), false);
  // At a playlist's end the Next button can point past the list, to YouTube's pick.
  assert.equal(D.upNextIsPick(list, 'https://www.youtube.com/watch?v=RD_Jwka9NaY'), true);
  // No Next button: the page's own list decides.
  assert.equal(D.upNextIsPick(plain, ''), true);
  assert.equal(D.upNextIsPick(list, ''), false);
  assert.equal(D.upNextIsPick('https://www.youtube.com/watch?v=abc&list=', ''), true);
});

