# drip design

drip replaces YouTube's home page with a nearly empty page where you spend tokens. Rec tokens reveal one recommended video at a time. Watch tokens buy minutes of viewing. Saved videos go in a backlog. Tokens come from a daily allowance. The goal is to stop doom scrolling, so the extension never shows more than one new thumbnail at once.

These decisions came from a grill-me session with Jesse on 2026-10-05.

## Decisions

| # | Decision |
|---|---|
| Q1 | Personal for now, may publish later. Keep code clean enough to publish. |
| Q2 | Block home, watch-page sidebar, end screens, autoplay, Shorts. Search stays, minus the injected "discover" shelves. Playlists and mixes keep playing on their own (Jesse, 2026-10-06). |
| Q3 | Out of time means hard stop: pause and overlay. "Finish the current video" grace mode is a setting, off by default. |
| Q4 | Daily allowance only. Tasks are in IDEAS.md. The whole extension runs on the honor system. |
| Q5 | Feed source is a toggle on the token page: YouTube home feed (default) or subscriptions. It keeps the last choice. Explore was dropped because `/feed/explore` now serves the home feed (Jesse, 2026-10-06). |
| Q6 | A settings change that loosens a limit takes effect at the next day reset. Tightening is immediate. |
| Q7 | The clock runs on every youtube.com watch page while the video plays. Embeds elsewhere are free. |
| Q8 | Built on air as private `jclind/drip`, tested in air's Chrome, cloned on the MacBook and loaded unpacked. Data in `chrome.storage.local`. |
| Q9 | Plain JS, Manifest V3, no build step, `// @ts-check` with JSDoc. Move to WXT when settings outgrow one page or publishing gets serious. |
| Q10 | 1 watch token = 15 min, drained only while playing. 1 rec token = 1 reveal. Defaults: 4 watch tokens, 10 rec tokens per day. |
| Q11 | Tokens roll over up to 2 days' worth. Bought minutes expire at reset. |
| Q12 | Day resets at 4am, as a setting. |
| Q13 | The reveal card offers Watch, Save, Pass. Pass is free and final. Planned, not built: Save keeps the card up and the button turns into "Saved ✓". "Reveal next · -1 card" passes and reveals in one click. Pass is a round × button with a tooltip, free and still final. A video saved and then passed stays in the backlog (Jesse, 2026-10-07). |
| Q14 | Backlog videos cost no rec token. Save button on watch pages and search results. Backlog is a text list (title, channel, length), no thumbnails. |
| Q15 | Search: remove injected shelves, stop at 10 results, free "more" button. |
| Q16 | Replace subscriptions and Explore with the token page. Channel pages and the bell stay as they are. Watch page comments are hidden behind a "Show comments" button that lasts for that video (Jesse, 2026-10-06). |
| Q17 | Name: `drip` (tentative). |
| Q18 | Home layout: balances, Reveal and Add 15 min buttons, one card, collapsed backlog. Expect tweaks. Planned, not built: while a card is up, Watch is free if minutes are left. At 0 minutes it reads "Watch · -1 drop", and clicking it buys one watch token's minutes and starts the video. "+15 min" shows only when no card is up (Jesse, 2026-10-07). |
| Q19 | Background audio counts like any watching. `music.youtube.com` is out of scope. |
| Q20 | "I need this one" on the overlay: typed reason, unlocks that one video for the day without draining minutes, 2 per day, every use logged. |
| Q21 | Log per day: seconds watched, tokens spent, reveals saved or passed, "I need this" reasons. Keep 90 days. Show today plus the 7 days before it, 8 rows, so today sits next to the same weekday last week (Claude's pick, Jesse deferred, 2026-10-06). |
| Q22 | Popup shows balances and minutes left, plus a Settings link. No spend buttons. |
| Q23 | v1 is the core loop. The rest of the blocking is step 2. |
| Q24 | 1.0 is a build that works for a stranger installing it from the Chrome Web Store. Visual design comes after, with Jesse. `RELEASE-PLAN.md` has the steps (Jesse, 2026-10-06). |
| Q25 | When YouTube's markup changes and drip can't find the player or the home grid, it fails open: videos play without the clock. drip tells the user it's broken and offers to send a report, which the user sees and confirms first. A check on air finds the break on its own too (Jesse, 2026-10-06). |
| Q26 | Finishing a video that's in the backlog removes it from the backlog. Each new video opens in theater mode. Kept as they are for now (Jesse, 2026-10-06). |
| Q27 | Ads don't use watch minutes. Time the player spends on an ad isn't charged or logged (Jesse, 2026-10-07). |

## Visual design (in progress, nothing built)

Jesse is designing the look by hand, with Claude reviewing his mockups, started 2026-10-07. The goal is a little character without being distracting. Spending a token can feel satisfying, but restraint should feel good too, so the design doesn't reward spending everything.

Settled:

- A blue drop is the watch token and a gold card is the rec token. Jesse drew both, in a cartoon style with a shimmer cutout.
- Icons for actions and tokens (play, save, reveal, drop, card) use that cartoon fill with the shimmer. Icons that dismiss or collapse (×, the backlog arrow) are plain lucide lines, so they recede.
- Every button that spends shows its price on the button, like "Reveal video · -1 card".
- Watch is the primary button on the reveal card: white with black text in dark mode, black with white text in light mode. Reveal on the empty page is gold.
- Reveal card layout: thumbnail, then the title across the full width cut at 2 lines, then channel and length on the left with Watch on the right of the same line. Below that, one row: Save, "Reveal next · -1 card", and the round ×.
- Revealing a new video shouldn't shift the layout. Reserve a 16:9 box and 2 title lines before the thumbnail loads.
- Sentence case on all labels.
- The backlog is called "Saved" on screen, to match the Save button, and stays newest first. Its header shows the count and total length, like "Saved · 8 videos · 1 h 42 min". It's open on the empty page with the top 3 rows, and collapsed to the header while a card is up. Two controls: the chevron on the header opens and closes the list (right when closed, down when open), and a gray "Show 5 more" line under the third row shows the rest, then reads "Show less". The line names the hidden count, since the header already has the total. With 3 or fewer videos there's no line.
- Saved rows: title on one line cut with "…", channel and length under it in gray, and the blue cartoon play icon on the right with no circle behind it. The whole row plays the video. On hover the row gets a faint gray background and a plain lucide × appears left of the play icon. Removing a row collapses it to "Removed · Undo" for about 5 seconds. At 0 minutes the play icon shows "-1 drop", the same rule as Watch. The chevron points down when the list is open. An empty list says "Videos you save show up here." Jesse's mockup, 2026-10-07.
- Durations use drip's existing format: "1 h 42 min", "42 min".

Lock screen (started 2026-10-07). The satisfying moment here goes to leaving. Paying stays neutral and justifying stays a little effortful:

- Headline: "You've had your fill." when no watch tokens are left, "Time for a breather." when there are tokens to buy minutes. Jesse's lines.
- "Back to drip home" becomes "Done for now", the white primary button, with no icon. A slow shimmer sweeps across it every few seconds, the only idle animation in drip. Clicking it plays one ripple that settles flat, then goes to the home page.
- "+15 min · -1 drop" is the gray secondary button. "I need this one" is a text link, and its reason box gets no animation.
- Proposed, not confirmed: the paused frame blurred and tinted blue, as if underwater. A gray line with time watched next to the same weekday last week, like "1 h 15 min today · 50 min last Tuesday". "The glass refills at 4:00am." when everything is out. "Kept 3 drops." on the home page after leaving with drops unspent.

Ideas, not decided:

- The minutes tile as a glass of water that fills when you buy minutes and drains while you watch. The same glass, smaller, could be the pill on the watch page. Full means the minutes bought today.
- A ripple when a reveal lands, with the card rising out of it. It can play in the reserved box while the thumbnail loads.
- The reveal opens the page: the stats slide up and the buttons slide down to make the card's space, a drop falls into it, and the thumbnail surfaces from the ripple. Reveal video stays the same button and moves down to become Reveal next. +15 min shrinks to a bead and Save and × bud out of it, like droplets splitting (a "gooey" SVG filter). Jesse's idea, 2026-10-07.
- A drop falling into the glass on +15 min, and counts that roll when they change.
- A quiet note at rollover like "+2 saved from yesterday", to reward tokens not spent.
- The drop, in the same style, as the toolbar icon and store tile.

Jesse mocked the empty page, the reveal card, and the Saved list. He won't mock the rest. Claude drafts them from these rules when building starts, and Jesse reviews: the saved state on the card, loading, a failed reveal, out of cards, out of everything, the page inside YouTube's top bar, and light mode. The popup, Settings, welcome page, watch page pill, and lock screen haven't been designed yet.

## v1 and step 2 (both done)

v1 has the home page replacement, tokens, reveals, backlog, the watch clock with its overlay, settings with the next-day rule, and the popup.

Step 2 adds the sidebar, end screens, autoplay, Shorts, search shelves with the 10-result cap and Save buttons, replacing the subscriptions and Explore pages, and the subscriptions feed source.

## How it fits together

- When YouTube's markup changes, drip fails open (Q25). `watchFor` in common.js reports a break when a key selector matches nothing for 10 seconds on its page: the player (watch.js), the home page (home.js), and search results (search.js). A Reveal that finds no grid items at all reports the grid. The report is a banner with Copy details and Send report, which opens an email to `REPORT_EMAIL` (common.js), `apps@jesselind.com`, in the user's own mail app, so they see what's sent (Jesse, 2026-10-06). A missing player also drops the lock, since the lock would cover a page drip can't control. On air, `bin/check-youtube` runs weekly from launchd and posts to `#drip-alerts` on Discord: the failure when a selector stops matching, or one line when all is well, so a week with no post means the check stopped running.
- `src/content/early.js` guards the main player's first play at document start using stored time and unlocks; `watch.js` owns the overlay, clock, and grace.
- `src/lib/state.js` holds all the rules as pure functions over a plain state object. It's a classic script that sets `globalThis.Drip`, so the service worker (`importScripts`), extension pages (`<script>`), content scripts (manifest list), and Node tests (`require`) all load the same file.
- `src/background.js` is the only writer. Everything else sends it a message. It runs messages one at a time through a promise queue, so two tabs can't overwrite each other. It saves only when a message changed the state, because every save wakes the storage listeners in every YouTube tab. If a save fails, it puts the charge marker back, so the tab's resent time is charged.
- Every message starts with `rollDay(state, now)`, so the day resets lazily. A laptop asleep at 4am still resets correctly on the next read.
- `src/content/` replaces the home page and runs the watch clock. `comments.js` adds the "Show comments" button, and the CSS that hides comments is in `early.css`. `src/popup/` and `src/options/` are extension pages.

### Feed source

The toggle under Reveal writes `settings.feedSource` through `updateSettings`, which applies it at once because a feed change never loosens a limit. The Settings page has no control for it. With the feed source set to subscriptions, a reveal loads `/feed/subscriptions` in a hidden same-origin frame on the token page and reads its grid with the same selectors as the home grid. YouTube only fills a feed that's in view, so the frame sits on screen at opacity 0. Nothing new from the feed gives `pool-empty` and spends no token. The first version was tested on air only against the home feed, because air's account has no subscriptions.

### The clock with several tabs

Tabs measure playback with `performance.now()`. Zero ticks leave the charge marker alone; if the wall clock moves behind the marker, the worker clears the marker before charging the next paid tick.

Each tab measures how long its video played and sends it as `seconds`, every 5 seconds, or at once when it would use up the balance, when playback stops, or when the video changes. Time is kept per video, so a navigation never charges one video's time to the next. A tab that sends time after it stopped playing also sends `ago`, how many milliseconds earlier that playback ended, and the worker charges the interval ending then. Held-back time that ends before the marker is charged in full and leaves the marker alone. The worker keeps a plain `clock = { lastChargeEnd: 0 }` in memory and calls `chargeTick(state, clock, now, seconds, videoId)`. It clamps each tick to 0..3600 seconds. Unlocked videos log their full clamped watched time without reading or changing the clock. Paid videos charge only the part of `[now - seconds * 1000, now]` after `clock.lastChargeEnd`, then advance that end to `now`. Two paid tabs playing together still cost about one second per second, and a background tab whose timer Chrome throttled still pays for up to an hour. Unlocked playback never suppresses another tab's paid time. A restarted worker forgets the clock, which can overcharge one tick when two paid tabs play. That's acceptable.

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
- `resolveCurrent(state, action, videoId?)` with action `'watch'`, `'save'`, or `'pass'`. Save adds to the backlog and counts `saved`. Pass counts `passed`. All three clear `current` and return `{ ok: true, video }`. Errors, in order: `'no-current'`, `'bad-action'`, and `'stale-card'` when `videoId` is given and isn't the current card's, because another tab moved on. The new reveal card in Q13 will change this.
- `cleanVideo(raw)` returns a `Video` with string fields, or `null` when the id isn't 1 to 64 letters, digits, `_`, or `-`. `hydrate`, `reveal`, and `addBacklog` all pass videos through it.
- `addBacklog(state, video)` adds the video unless its id is already there (then still `ok`). Error `'bad-video'`. `removeBacklog(state, id)` removes it. Neither touches tokens.
- `charge(state, seconds, videoId)` adds `seconds` to the log's `watchedSec`. Unless `videoId` is unlocked, it subtracts from `watchSecondsLeft`, never below 0. Returns `watchStatus`.
- `chargeTick(state, clock, now, seconds, videoId, agoMs = 0)` moves `now` back by `agoMs` (clamped to an hour), then clamps seconds to 0..3600. Zero ticks return `watchStatus` without touching the clock. Unlocked videos log those seconds and return `watchStatus` without touching the clock. Paid ticks clear a marker later than `now`, advance `clock.lastChargeEnd` to `now`, and return `charge` for only the interval after the previous end.
- `watchStatus(state, videoId)` returns `{ secondsLeft, unlocked, locked }`, where `locked` means 0 seconds left and the video isn't unlocked.
- `needThis(state, videoId, title, reason, now)` unlocks the video for today and logs the reason. Errors, in order: `'reason-required'` if the trimmed reason is under 3 characters, `'need-this-limit'` if `unlocked.length >= needThisPerDay`. Unlocking a video that's already unlocked is `ok` and doesn't count again.
- `cleanSettings(changes)` returns only known keys with valid values. Integers get rounded and clamped to their range, `graceMode` becomes a boolean, `feedSource` must be one of the two values or is dropped.
- `isLoosening(key, from, to)`. The numeric keys loosen when they go up. `graceMode` loosens going from false to true. Any change to `resetHour` counts as loosening. `feedSource` never does.
- `updateSettings(state, changes)` cleans the changes, then for each key that differs from the current value it either applies it now (tightening or neutral) or puts it in `pending` with `effectiveDay = addDays(state.day, 1)`. Applying a key now removes any pending value for that key. Setting a key back to its current value removes its pending value too. An empty `pending.changes` becomes `null`. Balances above the new cap (`perDay * rolloverDays`) drop to it at once. Returns `{ ok: true, applied: {...}, pending: {...} }` listing just what this call did.
- `cancelPending(state, key)` drops one pending key.
- `formatMinutes(seconds)` returns `'42 min'`, or `'under 1 min'` for 1 to 59 seconds, or `'0 min'`.
- `logDays(day)` returns the 8 days the Settings log shows, `day` first (Q21).
- `redirectTarget(href)` returns where a top-level YouTube URL should go instead, or `''`. Shorts and embeds become watch pages, the feeds in Q16 and `/tv` go to the token page, and `m.youtube.com` moves to `www`. redirect.js applies it, but only in the top frame, so embeds on other sites stay free (Q7).
- `earlyLocked(raw, now, videoId)` decides, from raw storage, whether a loading watch page holds its video: no state, a day that has rolled over, or 0 seconds without an unlock today. Grace mode doesn't count, because nothing is playing yet. early.js also skips the video watch.js marks with `data-drip-grace` on `<html>`.
- `devAction(state, action, now)` is test tooling, not a feature. It backs the dev panel (`src/devpanel/`), a floating box on YouTube pages that shows state and has buttons for minutes, tokens, "Run reset now" (moves `day` and any pending `effectiveDay` back one day, so the next message rolls over as a real reset would), applying pending settings, toggling grace now, clearing lists, and starting fresh. The panel shows while Developer mode is on in Settings (storage key `dripDev`, written by the worker on `setDevMode`) or the checkout has `dev/ENABLED`, and the worker refuses `devAction` otherwise. `bin/build-release` leaves the panel out, and a build without it hides the toggle and refuses `setDevMode`. Error `'unknown-dev-action'`.

## Storage

One key, `drip`, in `chrome.storage.local`, holding the state object.
