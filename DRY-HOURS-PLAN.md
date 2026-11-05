# Dry hours and weekly unlocks: build plan

RELEASE-PLAN.md item 3, plus a change to Q20 that Jesse made while answering its questions. Written 2026-11-04 on air, against `main` at `a5067a1`. 310 tests pass (`node --test`, Node v26.3.0). Draft for Jesse to approve. Codex reviewed the first draft (then called quiet hours) on 2026-11-04, and this draft on the same day. The calls below include the fixes from both, marked "(Codex N)" for the first review and "(Codex 2nd N)" for the second.

**Changed 2026-11-04, after the first build ran (Jesse):** B1 to B3 no longer hold. Carried-over minutes let anyone buy ahead and watch all night, so Dry hours now stop every paid video at the start, grace mode or not, and the minutes left stop. Each whole drop of them goes back to the counter, and what's under a drop is lost. In the 5 minutes before, the pill counts down and shimmers, the home page says when they start, and drops stop selling. DESIGN.md Q32 has the rule as built.

Two PRs, in this order: A, weekly unlocks, then B, Dry hours. B leans on A: "I need this one" works during Dry hours because a weekly count makes each one scarce.

## What's settled

From Jesse, 2026-11-02 (RELEASE-PLAN.md item 3):

- A daily time range with no spending drops, like 11pm to 6am.
- It only stops new drops. A video already playing when the range starts finishes, as "Finish the current video" does.
- Turning it off, shortening it, or moving it waits for the reset (Q6).
- Allowed channels' videos still play in the range (Q31), so the check goes through `Drip.isFree` like every other lock.

From Jesse, 2026-11-04 (this plan's questions):

- It's called **Dry hours**, since "Quiet" is already a mode (Q29).
- Minutes bought before Dry hours keep working in them, for new videos too. He may revisit this later.
- "I need this one" counts per week, not per day: 3 a week, counted over the last 7 days. It still works during Dry hours.

## What the code does today

Each line was read in the code at `a5067a1`.

- A drop is spent only in `spendWatch` (`tokens.watch--`, state.js line 298), reached directly or through `buyIfOut` (line 359). `spendWatch` is the lock's and the home page's +15m (`background.js` line 188; `watch.js` line 671; `home.js` line 465). `buyIfOut` is Watch on a card or stash row at 0 minutes (`home.js` line 568), and card Watch reaches it through the `resolve` message and `resolveCurrent` (line 416). It already skips a video `freeToStart` says is free.
- The lock rises from `watchStatus(state, videoId)` (line 576): `locked` is clock on, 0 seconds left, and not unlocked or allowed. Minutes left keep a video playing.
- Grace ("Finish the current video") is `settings.graceMode`, off by default (Q3). watch.js grants it with `setGrace(id)` when `graceMode` is on and a playing video turns locked, from a tick reply (watch.js line 500) or a storage change from another tab (line 1254).
- "I need this one" is `needThis(...)` (line 584). It refuses once `state.unlocked.length >= needThisPerDay` (line 590), pushes the id into `state.unlocked`, and logs `{ videoId, title, reason, at }` in today's `log[day].needThis` (line 592). `rollDay` empties `unlocked` (line 280). So one list is both the day's count and the free list `isFree` reads. The log keeps 90 days (line 282).
- `needThisPerDay` (default 2, range 0 to 10, lines 108 and 135) is read in: the lock (`watch.js` line 890), the tour (`welcome.js` lines 453 and 1161), Settings' Watch time stepper (`options.js` line 56), History's "Unlocks used N / 2" tile (`options.js` lines 644 and 687), the dev panel (`panel.js` line 114), dev profiles (`profiles.js` lines 113, 132, 138), and tests in `test/state.test.js` and `test/devpanel.test.js`. The words "today's unlocks" are in watch.js line 862 and welcome.js line 1175. History's "N in the last 7 days" counts the last 7 reset days, not 168 hours (`renderReasons`, options.js line 716).
- `early.js` holds a loading watch page with `earlyLocked(raw, now, videoId)` (line 847), which locks at 0 seconds left unless the id is unlocked or allowed.
- Settings are flat values. `updateSettings` (line 650) judges each key alone with `isLoosening(key, from, to)` (line 620), and a waiting change replaces that key's whole value in `state.pending.changes`. `cleanSettings` (line 597) drops any key it doesn't know, in stored state, waiting changes, and imports. Settings' Undo sends one key to `cancelPending` (`cancel` in options.js).
- The lock screen (`showLock`, watch.js line 887) shows +15m when `tokens.watch > 0`, "Done for now", and "I need this one · N left" or "The glass refills at 4:00am". It redraws when its view key changes, and a locked page refreshes status every 30 seconds (watch.js line 1282). A failed +15m says "No drops left" (line 686) and a failed unlock "You've used all of today's unlocks" (line 862).
- The home page is "out for the day" when the clock is on, no card is up, and there are no drops or minutes (`outForDay`, home.js line 935). Then it shows `outSea` (line 965, "You're out for today."), and otherwise `outNote`'s gray line. The blocked card's Reveal has its own no-drops check (line 1114). `mount()` runs every 500 ms (line 1607), but on a page it already built it only checks for a new day and returns without redrawing (line 1533). The render key is at line 1358.
- History's reasons list already counts "22 in the last 7 days" (DESIGN.md, History).

## Part A: weekly unlocks (PR 1, `feat/weekly-unlocks`)

### Claude's calls

A1. **A new setting, `needThisPerWeek`, default 3, range 0 to 20,** replacing `needThisPerDay`. Since `cleanSettings` drops unknown keys, a stored `needThisPerDay`, a waiting change to it, and one in an old export all drop away, and everyone starts at 3. Before 1.0 that's Jesse's install and nobody else's, so no conversion from the old number.
A2. **The count is rolling: uses whose `at` is within the last 7 × 24 hours,** read from the log. A fixed weekday would hand a full week back at once. `needThisUsed(state, now)` counts them and `needThisLeft(state, now)` is the limit minus that, at least 0. `needThisBack(state, now)` says when the next one comes back, or 0 while some are left or the limit is 0. With `used` uses in the window and a limit of `n`, one comes back when the oldest `used - n + 1` have aged out, so it's that use's `at` plus 7 days. Lowering the limit, or an import, can leave more uses than the limit, and this still gives the right time (Codex 2nd 9). A use with `at` 0 or missing (old imports, `cleanLogDay`) never counts. A use with `at` in the future, after the computer's clock went back, counts as now (Codex 2nd 12).
A3. **`unlocked` stays the day's free list,** cleared at the reset, as now. An unlock still makes one video free for the day. Unlocking the same video twice in a day costs nothing the second time, as now (line 589).
A4. **`needThis` refuses on `needThisLeft(state, now) < 1`** with `need-this-limit`, as now. Raising the count loosens, so it waits for the reset (Q6) through the numeric rule in `isLoosening`; lowering applies at once.
A5. **Words.** The lock: "I need this one · 2 left this week". With none left, the note under it says "Next unlock back Thursday at 9:14pm." (weekday and time from `needThisBack`), and the glass line stays where it is. A failed unlock says "You've used this week's unlocks." Settings: '"I need this one" per week', hint "Each one needs a typed reason. Counted over the last 7 days." A failed unlock in the tour says the same (welcome.js line 1175). History's tile shows the day's count with no "/ N", since a day has no limit now. History's reasons line ("22 in the last 7 days") switches to `needThisUsed`, so it matches the lock, and its redraw key gains that count (Codex 2nd 5, 11). The dev panel line reads "Unlocks 1 used this week, 2 left".
A6. **Imported log days count.** `importData` adds log days the install doesn't have, before today and within the 90 kept (line 1068), so recent uses in an imported file count against the week. That's the honest reading of the log.
A7. **The tour uses the same function** on its sandbox (`welcome.js` lines 453 and 1161), whose log starts empty, so the tour still shows all 3.

### Steps

1. **Tests first** (Codex 2nd 7). In `test/state.test.js`: `needThisUsed` and `needThisLeft` with uses 6 days ago, exactly 7 days ago, 7 days and 1 minute ago, and across a reset; `at` 0 and `at` in the future; `needThisBack` at the limit, over it after lowering 3 to 1, and at a limit of 0; `needThis` refusing at the limit and allowing again after the oldest use ages out; the free list clearing at the reset, so the same video costs a second unlock the next day; a stored, waiting, or imported `needThisPerDay` dropping away; raising the count waiting, lowering applying, the first day applying both; export and reset keeping the log's uses, and import's added days counting. In the tour and History tests where the fake DOMs reach: the tour's count and its failure line, and History's tile with no limit. Update the tests that use `needThisPerDay`.
2. **State rules** in state.js, then every reader and line listed under "What the code does today": watch.js (lines 862 and 890), welcome.js (453, 1161, 1175), options.js (56, 644, 687, and `renderReasons`), panel.js, profiles.js.
3. **Docs:** DESIGN.md's Q20 row changes from "2 per day" to "3 a week, over the last 7 days (Jesse, 2026-11-04)", and the lock section's "· 2 left" line.
4. **Check in the browser,** a Codex review, and the PR with `/ship`.

## Part B: Dry hours (PR 2, `feat/dry-hours`)

### Claude's calls

B1. **Minutes already bought keep running.** Dry hours refuse a new drop and nothing else. A video can start or keep playing on minutes left, and a video from an allowed channel or one unlocked plays as usual (Jesse, 2026-11-04).
B2. **The video playing when Dry hours start always finishes** (Codex 3). Jesse's "finishes, as Finish the current video does" means grace for that video even with `graceMode` off: at 11pm with 1 minute left on a 20-minute video, B1 alone would lock it at 11:01, and no drop could be bought. A pure `dryGrace(state, now, playingSince)` is true when Dry hours are on now and the video has played on this page since before they started. watch.js keeps `playingSince` (wall time the current video first played on this page) and asks one `graceAllowed()`, `graceMode || dryGrace(...)`, in all three places that read `graceMode` for grace: the grants at lines 500 and 1254, and `applyStatus`'s clear at line 388, which would otherwise take dry grace away on the next status (Codex 2nd 8). early.js pauses a locked video on a storage change unless `graceMode` is on (early.js line 77), to leave watch.js time to grant grace. It does the same while `dryUntil` on the raw state is nonzero, and watch.js then grants grace or pauses (line 449). A video started after 11pm gets grace only if `graceMode` is on, as now.
B3. **"I need this one" works during Dry hours** (Jesse, 2026-11-04). The weekly count from Part A is the limit on it.
B4. **Three settings: `dryHours` (on or off, off by default), `dryFrom` (23), and `dryTo` (6).** Whole hours, like `resetHour`, in the computer's local time with `Date.getHours()`, as `dayKey` does. `from === to` while on means no Dry hours (the hour pickers can't show a 24-hour range anyway). A range may cross midnight: 23 to 6 is 11pm up to 6am. The end hour is the first hour that isn't dry.
B5. **The three keys are judged as one range for Q6.** Per-key judging can't tell shortening from lengthening: moving the start from 23 to 1 shortens 23-to-6, but moving it from 1 to 23 lengthens it. So `updateSettings` takes the dry keys out of a change, builds the proposed range from today's settings, then the waiting dry keys, then the change, and compares hour sets. If the proposed set holds every hour today's does (turning on, lengthening), all three keys apply at once and any waiting dry keys are cancelled. Otherwise (off, shorter, moved) all three proposed keys go into `pending` together. A later change starts from settings plus pending again, so an edit never undoes another (the lost-edit problem from CHANNEL-LISTS-PLAN.md). `cancelPending` on any dry key cancels all three, so Settings' Undo, which sends one key, puts back the whole range (Codex 4). The first day still applies everything at once (Q6).
B6. **One rule function, `dryUntil(state, now)`.** It returns when the current Dry hours end, in ms, or 0 when it isn't dry now or the clock is off. It walks forward one local hour at a time from now, using the settings in force at each hour: today's until the next reset, then today's plus a waiting change. So 11pm to 6am with "off" waiting for 4am ends at 4am, not 6am (Codex 11). Each step builds the next hour with `new Date(y, m, d, h + 1)`, so a skipped hour in spring and a repeated hour in fall each count by the hour the clock shows (Codex 12). At most 24 steps. `spendWatch` and `buyIfOut` return `{ ok: false, error: 'dry-hours', until }` when it's nonzero. `buyIfOut` keeps its `freeToStart` check first, so an allowed channel's card never asks for a drop. Card Watch reaches `buyIfOut` through `resolveCurrent` (Codex 2), which keeps returning `ok` with `bought: false` on a refusal, as it does with no drops today (state.js line 416). So Watch still opens the video, and the watch page's lock says "Dry until 6:00am" (Codex 2nd 10). `isFree` doesn't change.
B7. **Dry hours do nothing with the clock off** (Quiet and Curated modes, Q29). Nothing locks there, so nothing needs a drop. The row folds away with the rest of Watch time.
B8. **The lock says when Dry hours end.** During Dry hours `showLock` leaves out +15m, and the line under the title reads "Dry until 6:00am", from `dryUntil`. "I need this one" stays (B3). The title stays as it is, and "Done for now" stays the one primary button. A drop bought in another tab before 11pm lifts the lock the usual way. The view key gains the dry end, so the 30-second status refresh brings +15m back when it passes. A +15m click that reaches the worker just after 11pm gets `dry-hours` back, and the lock redraws in its dry form instead of saying "No drops left" (Codex 10).
B9. **The home page counts Dry hours as out of drops** (Codex 6). Each place that asks "no drops?" asks `dryUntil` too: `outForDay`, `outNote`, the blocked card's Reveal, and `costsDrop`. While dry, the out page reads "Dry hours." over "Drops work again at 6:00am." instead of "You're out for today", and `outNote` says "Dry until 6:00am." where it would say "No drops left". +15m is disabled with that line as its title, and a `dry-hours` reply to it gets the same line (the error switch at line 227). A card from an allowed channel still plays, since `costsDrop` asks `freeToStart` first. The render key gains the dry end, and `mount()`'s existing-page branch calls `render()` when the dry end it last drew differs from now's, the way it checks for a new day. So an idle home tab changes at 11pm and back at 6am.
B10. **Settings: one row in Watch time,** after "Finish the current video": a "Dry hours" toggle, and while it's on, "From" and "To" hour pickers on the same row. The summary line adds ", dry 11pm to 6am" when on. A waiting change shows the existing pending chip. Hint: "No new drops in these hours." The look is open for a `/design-variants` round if Jesse wants one; this plan builds the plain row.
B11. **Export, import, and reset need no new code.** The three keys are settings, so they go through `updateSettings` and its group rule (Codex 8). A test checks it.
B12. **No dev panel action.** A browser check turns Dry hours on around the current hour, which tightens and applies at once. `apply-pending` already applies every waiting key (Codex 13).
B13. **The welcome tour is left alone.** Its sandbox starts from the defaults plus the mode parts (welcome.js lines 52 and 66), so Dry hours are always off there (Codex 14).

### Steps

1. **Tests first** (Codex 9). New `test/dry.test.js`:
   - `dryUntil`: a same-day range, a range over midnight, the end hour itself, `from === to`, off, clock off, a waiting "off" or shorter range ending it at the reset, and a DST spring-forward and fall-back night (with `TZ=America/New_York` set for the test).
   - `dryGrace`: true for a video playing since before the start, false for one started after, false outside Dry hours. In `test/watch.test.js`: with `graceMode` off, a status update doesn't clear dry grace. early.js doesn't pause a locked video on a storage change during Dry hours.
   - Refusals: `spendWatch` and `buyIfOut` at 0 minutes refused in Dry hours and allowed outside; `resolveCurrent(..., 'watch', ...)` returning `ok` with `bought: false` and no drop spent; `needThis` allowed in Dry hours, and refused there at the weekly limit; `buyIfOut` and `resolveCurrent` free for an allowed channel's card; `watchStatus` and `earlyLocked` unchanged for a video with minutes left.
   - The Q6 group rule: on applies now, lengthen applies now, shorten waits, move waits, off waits, shorten then lengthen back cancels the wait, `cancelPending('dryFrom')` cancels all three, a save of an unrelated setting keeps a waiting dry change, a dry change saved with a `resetHour` change, and the first day applying everything.
   - `rollDay` and `apply-pending` applying waiting dry keys; export, import, and reset carrying them; `cleanSettings` clamping the hours.
   - In `test/home.test.js` and `test/watch.test.js`, where their fake DOMs reach: the out page's dry copy, +15m disabled, the lock without +15m and with "I need this one", a `dry-hours` reply redrawing the lock, and the home page redrawing when the dry end changes.
2. **State rules** in state.js: the three settings in `DEFAULT_SETTINGS` and `cleanSettings`, `dryUntil`, `dryGrace`, the group rule in `updateSettings` and `cancelPending`, and the refusals.
3. **Watch page** in watch.js: the lock (B8) and grace (B2).
4. **Home page** in home.js (B9).
5. **Settings row** in options.js (B10).
6. **Docs:** DESIGN.md gets a Q32 row with Jesse's rules from both dates and these calls marked as Claude's, and the State API section gets `dryUntil` and `dryGrace`. RELEASE-PLAN.md item 3 gets the name Dry hours and "Built" with the PR number.
7. **Check in the browser,** then a Codex review (`/codex-review`), fix what's real, and open the PR with `/ship`.

## How another model can check this plan

- Check each line under "What the code does today" with `grep -n` against `a5067a1`.
- Check that `spendWatch` is the only place a drop is spent: `grep -rn "tokens.watch--" src`.
- Check A1: does `cleanSettings` drop an unknown key everywhere a stored, waiting, or imported setting enters (`hydrate`, `importData`, `earlyLocked`)?
- Check A2 and A3: does anything other than `needThis` read `unlocked.length` as a count? (`grep -rn "unlocked.length" src`.)
- Check B5: with per-key `isLoosening`, find a pair of `dryFrom` changes the old rule would judge wrong, and confirm the group rule judges them right. Check that a waiting dry change can't be lost to a later edit, an Undo, or an unrelated save.
- Check B1 and B2 against Jesse's words in RELEASE-PLAN.md item 3.
- Check B9: can any home page path still spend a drop in Dry hours without going through `spendWatch`?
- Check the reset hour inside Dry hours (4am inside 11pm to 6am): the refill arrives, and the drops can't be spent until 6am.

## Browser checks

On air, with the stand-in harness from the handoff for Settings and the real extension on YouTube.

Part A:

1. Use an unlock on the lock: it reads "2 left this week". Use all 3: the note gives the weekday and time the next one comes back.
2. The dev panel's `reset-now`: the unlocked video locks again, and the count stays at 0 left.
3. Settings shows '"I need this one" per week' at 3. Raising it waits; lowering applies.

Part B:

1. In Settings, turn Dry hours on with a range around the current hour. It applies at once. Shorten it: it waits, with the pending chip. Undo puts back the whole range.
2. With 0 minutes, open a video: the lock says "Dry until ...", with no +15m and with "I need this one". With this week's unlocks used, the note gives when the next one comes back.
3. With minutes left, a video plays and the clock runs down as usual.
4. An allowed channel's video plays with no lock.
5. On the home page, the out page says "Dry hours.", +15m is disabled, and Watch on a card at 0 minutes goes to the lock.
6. Move the range so the current hour is outside it (the dev panel's `apply-pending`), and within 30 seconds the lock shows +15m again.
7. With grace off and 1 minute left, play a long video, then set Dry hours to start at the current hour. When the minute runs out the video keeps playing, and the pill says "Finishing this one".
8. Leave a home tab open, untouched, across a dry start and end (a range starting and ending within the next two hours, with the window brought forward). The page changes to the dry form and back without a reload.
