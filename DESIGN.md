# drip design

drip replaces YouTube's home page with a nearly empty page where you spend tokens. Rec tokens reveal one recommended video at a time. Watch tokens buy minutes of viewing. Saved videos go in a backlog. Tokens come from a daily allowance. The goal is to stop doom scrolling, so the extension never shows more than one new thumbnail at once.

These decisions came from a grill-me session with Jesse on 2026-10-05.

## Decisions

| # | Decision |
|---|---|
| Q1 | Personal for now, may publish later. Keep code clean enough to publish. |
| Q2 | Block home, watch-page sidebar, end screens, autoplay, Shorts. Search stays, minus the injected "discover" shelves. |
| Q3 | Out of time means hard stop: pause and overlay. "Finish the current video" grace mode is a setting, off by default. |
| Q4 | Daily allowance only. Tasks are in IDEAS.md. The whole extension runs on the honor system. |
| Q5 | Feed source setting: YouTube home feed (default) or subscriptions. |
| Q6 | A settings change that loosens a limit takes effect at the next day reset. Tightening is immediate. |
| Q7 | The clock runs on every youtube.com watch page while the video plays. Embeds elsewhere are free. |
| Q8 | Built on air as private `jclind/drip`, tested in air's Chrome, cloned on the MacBook and loaded unpacked. Data in `chrome.storage.local`. |
| Q9 | Plain JS, Manifest V3, no build step, `// @ts-check` with JSDoc. Move to WXT when settings outgrow one page or publishing gets serious. |
| Q10 | 1 watch token = 15 min, drained only while playing. 1 rec token = 1 reveal. Defaults: 4 watch tokens, 10 rec tokens per day. |
| Q11 | Tokens roll over up to 2 days' worth. Bought minutes expire at reset. |
| Q12 | Day resets at 4am, as a setting. |
| Q13 | The reveal card offers Watch, Save, Pass. Pass is free and final. |
| Q14 | Backlog videos cost no rec token. Save button on watch pages and search results. Backlog is a text list (title, channel, length), no thumbnails. |
| Q15 | Search: remove injected shelves, stop at 10 results, free "more" button. |
| Q16 | Replace subscriptions and Explore with the token page. Channel pages, comments, and the bell stay as they are. |
| Q17 | Name: `drip` (tentative). |
| Q18 | Home layout: balances, Reveal and Add 15 min buttons, one card, collapsed backlog. Expect tweaks. |
| Q19 | Background audio counts like any watching. `music.youtube.com` is out of scope. |
| Q20 | "I need this one" on the overlay: typed reason, unlocks that one video for the day without draining minutes, 2 per day, every use logged. |
| Q21 | Log per day: seconds watched, tokens spent, reveals saved or passed, "I need this" reasons. Keep 90 days. Show today plus 7 days. |
| Q22 | Popup shows balances and minutes left, plus a Settings link. No spend buttons. |
| Q23 | v1 is the core loop. The rest of the blocking is step 2. |

## v1 and step 2

v1 has the home page replacement, tokens, reveals, backlog, the watch clock with its overlay, settings with the next-day rule, and the popup.

Step 2 adds the sidebar, end screens, autoplay, Shorts, search shelves with the 10-result cap and Save buttons, replacing the subscriptions and Explore pages, and the subscriptions feed source.

## How it fits together

- `src/lib/state.js` holds all the rules as pure functions over a plain state object. It's a classic script that sets `globalThis.Drip`, so the service worker (`importScripts`), extension pages (`<script>`), content scripts (manifest list), and Node tests (`require`) all load the same file.
- `src/background.js` is the only writer. Everything else sends it a message. It runs messages one at a time through a promise queue, so two tabs can't overwrite each other.
- Every message starts with `rollDay(state, now)`, so the day resets lazily. A laptop asleep at 4am still resets correctly on the next read.
- `src/content/` replaces the home page and runs the watch clock. `src/popup/` and `src/options/` are extension pages.

### The clock with several tabs

Tabs measure playback with `performance.now()`. Zero ticks leave the charge marker alone; if the wall clock moves behind the marker, the worker clears the marker before charging the next paid tick.

Each tab measures how long its video played since its last tick and sends that as `seconds`. The worker keeps a plain `clock = { lastChargeEnd: 0 }` in memory and calls `chargeTick(state, clock, now, seconds, videoId)`. It clamps each tick to 0..3600 seconds. Unlocked videos log their full clamped watched time without reading or changing the clock. Paid videos charge only the part of `[now - seconds * 1000, now]` after `clock.lastChargeEnd`, then advance that end to `now`. Two paid tabs playing together still cost about one second per second, and a background tab whose timer Chrome throttled still pays for up to an hour. Unlocked playback never suppresses another tab's paid time. A restarted worker forgets the clock, which can overcharge one tick when two paid tabs play. That's acceptable.

## State API

`state.js` sets `globalThis.Drip` to an object with the functions below. Functions that change state mutate the object passed in and return a result `{ ok: true, ... }` or `{ ok: false, error: '<code>' }`. `now` is always epoch milliseconds. Days are local-time `YYYY-MM-DD` strings.

### State shape

```js
{
  version: 1,
  settings: {
    watchTokensPerDay: 4,   // int 0..48
    minutesPerToken: 15,    // int 1..120
    recTokensPerDay: 10,    // int 0..100
    rolloverDays: 2,        // int 1..7, balance cap is perDay * rolloverDays
    resetHour: 4,           // int 0..23, local hour the day turns over
    graceMode: false,       // finish the current video when time runs out
    needThisPerDay: 2,      // int 0..10
    feedSource: 'home',     // 'home' | 'subscriptions'
  },
  pending: null | { effectiveDay: 'YYYY-MM-DD', changes: { [key]: value } },
  day: 'YYYY-MM-DD',        // current logical day
  tokens: { watch: 4, rec: 10 },
  watchSecondsLeft: 0,
  current: null | Video,    // revealed and not yet resolved
  backlog: Video[],         // newest last
  seen: string[],           // video ids ever revealed, oldest first, max 2000
  unlocked: string[],       // video ids unlocked by "I need this" today
  log: { [day]: LogDay },
}
Video  = { id, title, channel, length }   // length is a display string like "14:02", may be ''
LogDay = { watchedSec, watchSpent, recSpent, saved, passed, needThis: [{ videoId, title, reason, at }] }
```

### Functions

- `DEFAULT_SETTINGS`, frozen.
- `dayKey(now, resetHour)` returns the logical day. Times before `resetHour` belong to the previous date. 03:59 on 2026-10-05 with resetHour 4 is `'2026-10-04'`.
- `addDays(day, n)` and `daysBetween(a, b)` do date math on `YYYY-MM-DD` strings in UTC, so DST can't shift them.
- `initialState(now)` returns a fresh state with default settings, full daily tokens, 0 seconds, and empty lists.
- `hydrate(raw, now)` takes whatever came out of storage (possibly `undefined` or missing keys) and returns a complete state. Missing settings get defaults. `undefined` gives `initialState(now)`.
- `rollDay(state, now)`. If `dayKey(now, settings.resetHour)` is later than `state.day`, it applies `pending` if its `effectiveDay` is on or before the new day, then adds `perDay * elapsedDays` to each balance capped at `perDay * rolloverDays`, sets `watchSecondsLeft` to 0, clears `unlocked`, sets `day`, and removes log days older than 89 days before the new day. If the new day isn't later, it does nothing. It never moves `day` backwards. Returns `true` if it rolled.
- `logDay(state)` returns `state.log[state.day]`, creating it with zeros.
- `spendWatch(state)` takes one watch token and adds `minutesPerToken * 60` seconds. Error `'no-watch-tokens'`.
- `reveal(state, candidates)` takes the first candidate whose id isn't in `seen` or the backlog, takes one rec token, sets `current`, and pushes the id to `seen` (dropping the oldest past 2000). Errors, checked in order: `'resolve-current'` if `current` is set, `'no-rec-tokens'`, `'pool-empty'` if no candidate qualifies. An error spends nothing. Returns `{ ok: true, video }`.
- `resolveCurrent(state, action)` with action `'watch'`, `'save'`, or `'pass'`. Save adds to the backlog and counts `saved`. Pass counts `passed`. All three clear `current` and return `{ ok: true, video }`. Error `'no-current'`.
- `addBacklog(state, video)` adds the video unless its id is already there (then still `ok`). `removeBacklog(state, id)` removes it. Neither touches tokens.
- `charge(state, seconds, videoId)` adds `seconds` to the log's `watchedSec`. Unless `videoId` is unlocked, it subtracts from `watchSecondsLeft`, never below 0. Returns `watchStatus`.
- `chargeTick(state, clock, now, seconds, videoId)` clamps seconds to 0..3600. Zero ticks return `watchStatus` without touching the clock. Unlocked videos log those seconds and return `watchStatus` without touching the clock. Paid ticks clear a marker later than `now`, advance `clock.lastChargeEnd` to `now`, and return `charge` for only the interval after the previous end.
- `watchStatus(state, videoId)` returns `{ secondsLeft, unlocked, locked }`, where `locked` means 0 seconds left and the video isn't unlocked.
- `needThis(state, videoId, title, reason, now)` unlocks the video for today and logs the reason. Errors, in order: `'reason-required'` if the trimmed reason is under 3 characters, `'need-this-limit'` if `unlocked.length >= needThisPerDay`. Unlocking a video that's already unlocked is `ok` and doesn't count again.
- `cleanSettings(changes)` returns only known keys with valid values. Integers get rounded and clamped to their range, `graceMode` becomes a boolean, `feedSource` must be one of the two values or is dropped.
- `isLoosening(key, from, to)`. The numeric keys loosen when they go up. `graceMode` loosens going from false to true. Any change to `resetHour` counts as loosening. `feedSource` never does.
- `updateSettings(state, changes)` cleans the changes, then for each key that differs from the current value it either applies it now (tightening or neutral) or puts it in `pending` with `effectiveDay = addDays(state.day, 1)`. Applying a key now removes any pending value for that key. Setting a key back to its current value removes its pending value too. An empty `pending.changes` becomes `null`. Returns `{ ok: true, applied: {...}, pending: {...} }` listing just what this call did.
- `cancelPending(state, key)` drops one pending key.
- `formatMinutes(seconds)` returns `'42 min'`, or `'under 1 min'` for 1 to 59 seconds, or `'0 min'`.

## Storage

One key, `drip`, in `chrome.storage.local`, holding the state object.
