# drip 1.0 plan: functionally ready to publish

Written 2026-10-06 on air, against `main` at `9555307`. Draft for Jesse to approve. Not committed.

"1.0" here means a build Jesse could put on the Chrome Web Store, minus the visual design, which comes after with his input. DESIGN.md calls the core loop "v1" (Q23), so this plan says "1.0" to keep the two apart.

## Upload day, 2026-11-06

Jesse asked for these to be waiting for the session on upload day (2026-11-05). In order:

1. Merge PR 69 (the pre-publish bug hunt), so the zip has its fixes and the updated store docs.
2. In `manifest.json`, change `version` from `0.1.0` to `1.0.0` and commit it. `bin/build-release` refuses uncommitted changes.
3. Run `bin/build-release`. It runs `node --test` and writes `dist/drip-1.0.0.zip`.
4. Unzip it, load the folder unpacked in Chrome (not the checkout), and run `test/BROWSER.md` against it. On `chrome://extensions`, drip should have no Errors button. The worker's `importScripts('devpanel/clock.js')` fails in a store build and is caught, so an error there would be the first thing to check.
5. Put `store/PRIVACY.md` at a public URL and give it to the listing. It was rewritten in PR 69 for the channel lists and the channel-page lookup.
6. Upload the zip, fill the listing from `store/LISTING.md`, then tag the release as `bin/build-release` prints: `git tag v1.0.0 && git push origin v1.0.0`.

Still open from PR 69: whether a short Dry hours range just before the reset may turn leftover minutes into drops (Q11 against Q32). It doesn't block the upload.

## Status, 2026-10-06 evening

- Steps 1 to 6 are done in stacked PRs #10 (audit) → #11 (state rules) → #12 (watch clock) → #13 (welcome, live pages, release build) → #14 (broken-page banner, store drafts). Merge them in that order. Each one had a Codex review, and every finding was fixed. 86 tests pass.
- All of it merged to `main` on 2026-10-06 (#10, then #15 for the rest of the stack).
- Reports go by email (Jesse, 2026-10-06), and `bin/check-youtube` runs weekly on air. Still open: the report address and the Discord webhook for the weekly check, and step 7. air's Chrome can play video when its window is brought forward (registry page `claude-in-chrome`), so most of step 7 can run on air.
- Left as is, by judgment: finding 8 (the fullscreen Comments button in other languages; the comments themselves stay hidden), and findings 2 and 3 (timers and search layout work), which only a DevTools trace on the MacBook can measure.
- Dropped from the feature list: "Reset all data", because it hands back a full day's tokens in one click, against Q6.

## Added 2026-10-16: Settings, three features, and the tour

Jesse's picks from a review of the Settings page. In this order, because the three features need a place in the new layout:

1. **Settings grouped by part.** One section each for Watch time (drops, minutes per drop, finish the current video, "I need this one"), Cards (per day, reveal from, live streams), Stash (holds), and Search, with the part's switch in the section header. A section folds to one line while its part is off, instead of showing dimmed rows. The mode picker stays on top. The reset hour and carry-over go in a small section for every day. Jesse said yes; the look comes from a `/design-variants` round, with room for the three new settings. The sticky unsaved-changes banner (IDEAS.md, "Settings page") ships with it. Jesse picked design A, Folds, on 2026-10-16; built the same day with the save bar.
2. **Links into Settings from where the question comes up.** The lock, a reveal card, and the popup each link to the matching section (`options.html#cards`), which flashes on arrival. Jesse saw the mockups on 2026-10-16 and wants them built into the real app in their own PR, to judge how they look in practice. The section anchors are already in Settings. Built 2026-11-02 in the popup only, after Jesse tried the lock and card links in PR 57 and a round of (i) notes (DESIGN.md, "Links into Settings").
3. **Dry hours** (named quiet hours until 2026-11-04, Q32). Built on `feat/dry-hours`, DRY-HOURS-PLAN.md Part B. A time range with no spending drops, like 11pm to 6am. Jesse, 2026-11-02: it only stops new drops. A video already playing when quiet hours start finishes, as "Finish the current video" does. Turning quiet hours off, shortening them, or moving them waits for the reset (Q6). Allowed channels' videos still play during quiet hours (item 4), so the quiet-hours check goes through `Drip.isFree` like every other lock.
4. **Channel allow and block lists.** Allowed channels cost nothing; blocked channels never come up in a reveal. Jesse, 2026-11-02: an allowed channel's videos cost no minutes, and they play when drops are out and during quiet hours, with no lock. Skipping only cards would do nothing, since a channel's own page already lists its videos. The guards: adding a channel waits for the reset (Q6), and the list holds at most 5 channels (Claude's number, which Jesse took). The channel page gets an Allow button, and Settings lists both. Blocking is on the reveal card and in Settings; the reveal card has no Allow, so allowing takes a trip to the channel or Settings. Built 2026-11-03 from `CHANNEL-LISTS-PLAN.md`, after a Codex review of the plan (DESIGN.md Q31).
5. **Export, import, and reset.** A JSON file of settings, stash, and log, and a way back to defaults. Reset was dropped on 2026-10-06 because it handed back a day's tokens (Status, above). So none of the three may touch today's balances, and imported or reset settings go through `updateSettings`, so loosening still waits for the reset. Jesse, 2026-11-02: that's enough. Reset puts back the settings and empties the stash, and keeps the log. Built 2026-11-03 (PR 62).
6. **Tour callouts.** See "Welcome tour" in IDEAS.md. Its own `/design-variants` round. Built 2026-11-02 from three rounds: Jesse picked H (DESIGN.md, "Tour callouts as built").

7. **A Shorts switch.** Jesse, 2026-11-02: blocking Shorts gets its own setting, on by default, that a user can turn off. Today Q2 blocks Shorts with no switch: `/shorts/ID` opens as a regular watch page (redirect.js), bare `/shorts` goes to the token page, and early.css hides the Shorts shelves and sidebar links. It would sit with the bell in Every day, since it's the same in every mode, and turning it off loosens a limit, so it waits for the reset (Q6) the way the bell does. Jesse picked on 2026-11-02: "Hide Shorts", on by default. Off brings back the Shorts shelves in search and on channel pages and the sidebar link, but a Short still opens as a regular video, one at a time, and bare `/shorts` still goes to the token page. YouTube's Shorts player never comes back, in any mode, since with the clock off it would be free endless swiping. Built 2026-11-02 as `hideShorts`, modeled on the bell.

Each feature starts with Jesse's answers to its open questions, then gets its own PR. Items 3 to 5 were answered on 2026-11-02, and they get built in the order 5, 4, 3 (Jesse moved 4 ahead of 3 on 2026-11-03). The rest of what came up is under "After 1.0" in IDEAS.md.

## Where things stood at the start

- 3,313 lines in total. `src/lib/state.js` (324 lines) holds the rules. The content scripts hold everything YouTube-specific (watch.js 417, home.js 331, search.js 144, redirect.js 62, early.js 102, comments.js 45, fade.js 52, guard.js 27).
- `node --test` runs 44 tests, all passing (Node v26.3.0). Every one tests `state.js`. Nothing tests `background.js`, the content scripts, the options page, or the popup.
- Every file starts with `// @ts-check`, but nothing runs the checker. `tsc` isn't installed on air and the repo has no `jsconfig.json`, so the types are only checked if an editor happens to do it.
- Codex has reviewed each feature diff (`~/codex-trial/log.md` lines 111 to 120), and a red-team pass ran on 2026-10-05 (`~/codex-trial/runs/2026-10-05/drip-redteam.md`). Nobody has reviewed the whole codebase at once, and nobody has measured performance.

## Findings from reading the code

Each finding names the code it comes from. "Read" means I saw it in the code. "Expected" means it follows from the code but hasn't been seen in a browser yet. Step 2 below confirms or drops each one.

### Efficiency

1. **A storage write every second while a video plays.** Read. `watch.js:413` ticks every 1000 ms, and each tick with seconds > 0 sends `tick` (`watch.js:247`). `background.js:22-31` reads the whole state, hydrates it, and writes all of it back on every message, including `get` and `status`, which change nothing. Each write fires `chrome.storage.onChanged` in every YouTube tab, and each tab has four listeners that react (early.js:84, and `onState` in home.js, watch.js, search.js), three of them calling `Drip.hydrate`, which copies the backlog, `seen` (up to 2,000 ids), and the 90-day log. Fix: skip the write when the state didn't change, and send ticks less often (every 5 s, or on pause, end, and navigation) while the tab keeps its own countdown for the lock. Judgment: the lock may land up to one tick late. `chargeTick` already accepts long ticks.
2. **Four timers poll on every YouTube page, forever.** Read. home.js:329 (500 ms), search.js:142 (500 ms), comments.js:43 (500 ms), watch.js:413-414 (1 s and 30 s). Each returns early off its own page, but watch.js's tick still calls `attach()` and `autoplayOff()`, two `querySelector` calls, every second on every page. Cheap one by one. Worth measuring before changing anything.
3. **Search re-measures every row on every DOM change.** Read. `search.js:28` calls `getComputedStyle` and `offsetHeight` on each result row, and the MutationObserver at `search.js:114` runs `apply()` on every child-list change under `ytd-search`. That forces layout on each mutation while results stream in. Measure first.

### Bugs

4. **Buttons drop clicks while a video plays.** Expected. `renderPill()` (`watch.js:395`) replaces the pill's children every tick, so "Save to backlog" is a new button each second. home.js's `onState` (`home.js:324-327`) rebuilds the whole token page on every storage write, and with finding 1 that's every second while any tab plays a video. A press whose mousedown lands on the old button and mouseup on the new one doesn't count as a click. With a ~100 ms press against a 1 s rebuild, roughly 1 click in 10 is lost. Keyboard focus is also lost each second. Fix: rebuild only when what's shown changed, the way `showLock` already does with `lockView` (`watch.js:328-329`).
5. **Grace mode turns off the early guard for every video.** Read. `early.js:58` sets `locked` to false whenever `graceMode` is on. Grace is meant for the one video playing when time runs out (Q3), but with it on, any new video opened at 0 minutes plays until watch.js loads at document_idle and pauses it, a second or more. Fix: early.js should hold at zero regardless of grace. watch.js already grants grace only from a tick response (`watch.js:251`).
6. **early.js works out the day its own way.** Read. `early.js:52-53` subtracts `resetHour` hours from the clock instead of calling `Drip.dayKey`. On a DST change day, those two disagree for an hour. Fix: load `state.js` before early.js at document_start (manifest change) and call `dayKey`.
7. **The worker trusts message payloads.** Read. `addBacklog` with a missing `video` pushes `undefined` into the backlog when it's empty (`state.js:195`). The worker's own next `.some(v => v.id ...)` throws until the state is saved and reloaded, and then `hydrate` turns the entry into `{}`, an empty row in the backlog (Codex's correction, see AUDIT.md). `resolve` with an unknown action clears the card without logging (`state.js:180-190`). `hydrate` takes `tokens` and `watchSecondsLeft` as stored without checking they're numbers (`state.js:105-109`). Only drip's own scripts send these messages, so this is about one bad release corrupting state forever, not about attacks. Fix: validate in `state.js` and test it.
8. **The comments quick-action button is matched by English text.** Read. `early.css:35` uses `aria-label="Comments"`, so in another language the fullscreen Comments button stays visible. Fine for Jesse, a leak for a public user.

### Behavior that isn't in DESIGN.md

9. Finishing a backlog video removes it from the backlog (`watch.js:171`). Theater mode is forced on for each new video (`watch.js:49-83`). Pages fade in (fade.js). All three are reasonable, and none is a decision in the table. Tests written "from the spec" need these written down first, so Jesse should confirm each one.
10. Q21 says the log shows "today plus 7 days". The Settings page shows 7 rows, today included (`options.js:105`). One of them is wrong.

### Fails open when YouTube changes

11. If `#movie_player video.html5-main-video` stops matching (watch.js:12, early.js:7), the clock never starts and watching is free with no warning. If the home grid selectors stop matching, Reveal says "YouTube hasn't loaded anything new" forever and the user can't tell drip is broken. The registry gotcha says YouTube changes its markup every few months, so for a public build this will happen. Nothing detects it today.

## What 1.0 is missing (functional only)

Judgment calls, ranked by how much a stranger installing it would need them.

1. **A first-run page.** A new user's first video opens straight onto "Out of watch time", because `watchSecondsLeft` starts at 0 (`state.js:89`) and nothing explains tokens. Open a short welcome page from `chrome.runtime.onInstalled` that explains the two token kinds and the 4am reset. The visual design can come later. The content and the trigger are functional.
2. **A "drip can't read this page" state.** For finding 11. When the watch page has no main video element after N seconds, or the home grid gives zero items after its wait, show a plain message that drip needs an update, instead of failing silently. Judgment: whether a broken watch clock should lock (fail closed) or allow (fail open) is Jesse's call.
3. **A release build.** A script (shell, no npm) that zips the extension without `dev/`, `test/`, the markdown files, and the `externally_connectable` localhost entry, and checks the version was bumped. Today the localhost dev route ships in the manifest. It's gated by `dev/ENABLED`, but a store reviewer will see the permission.
4. **`minimum_chrome_version`.** drip uses `world: "MAIN"` content scripts (Chrome 111) and CSS `:has()` (Chrome 105). Without the field, older Chrome installs and breaks. Raised to 121 on 2026-10-14, for `tabs.Tab.lastAccessed` (121) and `text-wrap: balance` (114), from Codex's audit.
5. **Store paperwork.** A privacy policy (drip stores everything in `chrome.storage.local` and sends nothing anywhere; worth stating), the single-purpose statement, and a justification for the `storage` permission and the youtube.com content scripts. The name can't contain "YouTube" (IDEAS.md). Q17 says "drip" is tentative, so check the store for a clash.
6. **Reset all data**, on the Settings page. Uninstalling wipes data, but a user testing settings has no way back to defaults. Small.
7. **Live updates on the popup and Settings page.** Both read state once (`popup.js:16`, `options.js:174`). A Settings tab left open past 4am shows yesterday. Small.

Left out on purpose: everything in IDEAS.md (tasks, charts, playlist stopping, thumbnails). None is needed for a working 1.0.

## Tests: written from the spec, not from the code

The goal is tests that say what drip should do, so a failing test means a bug, not a test to update.

- **Write each test from DESIGN.md and the decisions table, before looking at what the code does.** Where code and spec disagree, the test stays red until Jesse picks which is right (findings 9 and 10).
- **Pull the pure logic out of the content scripts into `state.js`,** where Node can test it with no DOM and no dependencies. The CLAUDE.md rule already says all rules belong there. Candidates: the redirect rules (`redirect.js:9`, `:21-29`, `:37-42`), early.js's lock decision (`early.js:51-58`), the search paging count, the grace decision in `tick()`, and the length parsing in `search.js:51`.
- **Test `background.js` in Node** by loading it with a fake `chrome` and `importScripts`. No dependencies needed. Covers the message queue, the `bad-sender` check on `tick`, unknown messages, and "no write when nothing changed".
- **The DOM parts get a browser checklist,** `test/BROWSER.md`, that a session on air runs through the Chrome extension tools and the dev route, with the expected result for each line. Judgment: I'd skip Playwright or jsdom. Both are npm dependencies, which CLAUDE.md rules out, and an automated test against live YouTube breaks whenever YouTube changes. That's Jesse's call, though.

## Steps

Each step ends with `node --test` passing, a Codex review (`/codex-review`), and a PR. Merging waits for Jesse.

1. **Baseline audit.** No code changes.
   - Run the type checker once without adding a dependency: `npx -y -p typescript tsc --noEmit --allowJs --checkJs --target es2022 --lib es2022,dom src/**/*.js`. Record the errors.
   - Measure on air's Chrome with the dev route: storage writes per minute while a video plays (wrap `chrome.storage.local.set` in a counting shim through the dev page, or count `onChanged` events in a YouTube tab), long tasks over 50 ms via `PerformanceObserver('longtask')` on home, watch, and search, and the CPU time of `apply()` in search.js. Write the numbers in `AUDIT.md`.
   - Run every `SEL` entry against live home, watch, and search pages and list any that match nothing.
   - Codex whole-repo audit at high: correctness and efficiency, told about the accepted risks in the red-team report so it doesn't repeat them.
   - Output: `AUDIT.md` with the numbers, the confirmed findings from this plan, and any new ones.
2. **Spec questions for Jesse.** Findings 9 and 10, the fail-open-or-closed call in missing feature 2, and the Playwright call. Each goes in DESIGN.md as a decision once he answers.
3. **Spec tests.** Add the tests above, red where the code is wrong. Add `jsconfig.json` so editors check types the same way the step 1 command does.
4. **Fix the bugs**, grouped by the code they touch: 7, 14, 16, 17 in `state.js` and the worker; 5 and 6 in early.js; 4, 12, 13, 15 in watch.js and home.js, together with finding 1; then 8. Findings 12 to 17 came from the Codex audit (AUDIT.md).
5. **Efficiency fixes** that the step 1 numbers justify. At least finding 1. Re-measure and put before and after in `AUDIT.md`.
6. **The missing features**, 1 through 7 above, one PR each.
7. **Release check.** Build the zip, load it unpacked on air from the zip (not the checkout), run `test/BROWSER.md` against it, and confirm the dev route is gone. Then the visuals phase starts with Jesse.

## How another model can check this plan

- Every "Read" finding cites a file and line at `9555307`. Open the line and confirm it says what the finding claims.
- Finding 1: count the `chrome.storage.onChanged` listeners in `src/content/` and confirm `withState` in `background.js` writes on every message.
- Finding 4: confirm `renderPill` calls `replaceChildren` unconditionally and that `tick()` calls `renderPill` on every run.
- Finding 5: confirm `early.js:58` is false whenever `graceMode` is truthy.
- Finding 7: in Node, `require('./src/lib/state.js'); const s = Drip.initialState(Date.now()); Drip.addBacklog(s, undefined); s.backlog` gives `[undefined]` (checked 2026-10-06).
- The tests: `node --test` should report 44 passing at `9555307`.
