# drip audit, 2026-10-06

Baseline for the 1.0 work in `RELEASE-PLAN.md`, taken at `9555307` on air. Finding numbers match the plan.

## Measured in air's Chrome

air's Chrome window is hidden, so a YouTube video there never really plays (`currentTime` stayed at 0 after a click on Play), timers are throttled, and no long tasks get recorded. To get around that, the playback numbers below come from 20 one-second `tick` messages sent through the dev route, one per second. They take the same path through the worker as a real tick: `withState`, a full storage write, and `onChanged` in every tab.

| What | Result |
|---|---|
| Worker round trip for a `tick` | 9.4 ms average, 66.4 ms worst of 20 |
| Token page rebuilds in a home tab during 20 ticks | 20, one per storage write |
| Pill rebuilds in a watch tab during the same ~30 s | 55 |
| Pill rebuilds in a watch tab with the video paused, no ticks, 10 s | 9, one per second |
| Long tasks over 50 ms | none recorded (hidden window, so not meaningful) |
| State size on air | 1,020 bytes (7 seen ids, 2 backlog videos, 2 log days) |

What this confirms:

- Finding 1. Every tick is a full storage write, and every write rebuilds the token page in other tabs.
- Finding 4, and it's worse than the plan said. `tick()` calls `renderPill()` every second on any watch page, playing or paused (`watch.js:260`), so the "Save to backlog" button is a new element every second all the time, not only during playback.

State size will grow on a real install. `seen` holds up to 2,000 ids at about 14 bytes each, so a long-time user writes roughly 30 KB per tick.

### After the fixes (branch `watch-clock`)

Same method, same day: ticks through the dev route, with a home tab and a paused watch tab open.

| What | Before | After |
|---|---|---|
| Token page rebuilds during the ticks | 20 for 20 ticks | 0 for 5 ticks |
| Pill rebuilds in a paused watch tab | about 1 per second | 0 |
| Ticks a playing tab sends | 1 per second | 1 per 5 seconds, sooner near zero (from `test/watch.test.js`, since air can't play video) |
| Storage writes for `get`, `status`, and zero ticks | 1 each | 0 (from `test/background.test.js`) |

## Selectors on live YouTube

Every selector in `src/content/` and `early.css` matched at least one element on home, a watch page, and search results. Two things to recheck on the MacBook, where the window is visible:

- The home grid had only 3 items, and search showed 2 rows. A hidden tab lazy-loads very little, so this is expected on air.
- The watch page didn't have the `theater` attribute, though the theater button was there. It may be the hidden window, or the theater default may be broken.

## Type check

`tsc` 5.9.3 with `--allowJs --checkJs` and `@types/chrome`, run once from a scratch folder (no dependency added). 6 errors:

- 5 come from checking all files as one program: `Drip` declared in three page scripts, `importScripts` missing from the DOM lib, and `globalThis.Drip` not declared. Not bugs.
- `watch.js:347` calls `.focus()` on the result of `querySelector`, typed as `Element`. It's a `<textarea>` at runtime, so this works, but it needs a cast.

## Codex whole-repo audit

`codex exec` at `gpt-6.1-sol` high, read-only, on a worktree of `9555307`. Full output in `~/codex-trial/runs/2026-10-06/drip-audit.md`. It ran simulations in memory, not a browser.

It confirmed or partly confirmed all 11 plan findings, with one correction. For finding 7, `hydrate` copies a stored `undefined` backlog entry into `{}`, so a bad Save leaves an empty entry in the backlog instead of breaking every page for good. Still a bug, less severe than the plan said.

New findings, each checked against the code by Claude. Numbering continues from the plan.

12. **Navigation charges the old video's last second to the new one.** `tick()` sends the time played since the last tick with the current URL's video id (`watch.js:241-247`), and `yt-navigate-finish` (`watch.js:405`) doesn't flush first. If one video is paid and the other unlocked, up to a second moves between them. Sending ticks less often (finding 1) would make this bigger, so both get fixed together.
13. **Grace fails for a second tab.** With grace on and two videos playing, the tab whose tick hits zero gets grace (`watch.js:251`), and the other tab locks as soon as the storage update arrives (`watch.js:402`), though it was playing too.
14. **Tightening doesn't clamp balances.** Lowering `rolloverDays` or a daily allowance applies at once (Q6) but leaves balances above the new cap (`state.js:294`) until the next reset clamps them (`state.js:137`). Q11 makes the cap a hard limit.
15. **A home tab left open past the reset goes stale.** Once mounted, home.js never asks for state again (`home.js:314`). With no other tab sending messages, yesterday's balances and disabled buttons stay up after 4am.
16. **A stale card resolves the wrong video.** Watch, Save, and Pass send only the action (`home.js:200`). If another tab already moved to a new card, Save saves that one.
17. **A failed storage write loses its charge.** `chargeTick` moves `clock.lastChargeEnd` (`state.js:229`) before `withState` writes (`background.js:29`). If the write throws, that interval is never charged. Rare, since drip's state is far below the storage quota.

Codex didn't measure anything in a browser, so it couldn't see that the pill rebuilds every second on a paused video too.

## Reveals that fail partway, 2026-10-13

From `~/ai-context/actions.md`: what happens on the page when a reveal or a purchase fails between the click and the card. Traced through `home.js`, `reveal.js`, `common.js` `send`, and the worker, then double-clicks tried with real clicks in `dev/home.html`.

The worker spends and sets the card in one write (`Drip.reveal`), and the page can't spend any other way, so a failure can't leave a spent card that never shows. The card is `state.current` and shows on the next draw of any tab.

| Failure | What happens |
|---|---|
| The home grid is empty or its markup changed | No card spent. "YouTube hasn't loaded anything new" and a broken-markup report (Q25). |
| The Subscriptions frame never loads or is redirected away | Up to 30 seconds of "Checking your subscriptions…", then "Nothing new", no card spent. |
| The message to the worker fails (`send-failed`) | `send` never throws. The animation backs out and says "Something went wrong". If the worker had already written, the card shows on the next draw. Nothing is lost. |
| The extension is reloaded under the page | `disconnected`, and the page asks for a refresh. Nothing is spent. |
| The thumbnail never loads after the card was spent | Both sizes are tried, and after 8 seconds the card turns over onto its gray front. |
| The tab closes or navigates mid-reveal | Before the send, nothing is spent. After, the card waits on the home page. |
| Reveal in a tab whose page is behind another tab's card | Refused (`resolve-current`). It said "Something went wrong". Fixed: it now says "That card changed in another tab." Same for `no-current`. |
| Double-click on +15m with reduced motion (or a hidden tab) | It bought two drops. The drop's fall is what held the second click, and without it nothing did. Fixed: drip's home page ignores the second click of a double-click, and so does the lock's +15m. |
| Double-click on × with reduced motion | The second click passed a card that was already gone and said "Something went wrong". Fixed by the same guard. |
| Double-click on Reveal video or Reveal next | Already safe: `busy` holds the second click. |

Not covered: the lock's +15m guard wasn't tried on real YouTube with reduced motion. No Node tests, because home.js has no fake-page harness like `test/watch.test.js`. The checks are browser checklist item 5.

### Second pass, 2026-10-16

Claude traced the same paths again, and Codex audited them separately from a brief, without Claude's notes. Every Codex finding was checked against the code. The review file stays out of git (`.second-opinion/`).

Two rows above need a correction:

- The thumbnail row: hqdefault is tried only after hq720 loads or errors. A request that hangs waits out the 8 seconds instead.
- The navigation row: an in-page navigation (drip's menu, YouTube's own links) doesn't stop a read that's under way. If it finds a video, the card is spent and waits on the home page. That's the reveal the user asked for, so it stays.

| New finding | What happens | Now |
|---|---|---|
| The feed read throws (a grid link that can't be parsed, or `reportBroken` in a tab whose drip was reloaded) | Nothing spent, but no message, an unhandled rejection, and in Reveal next the half-dealt card could stay on the old thumbnail | Fixed: `findWith` catches it and says "Something went wrong" |
| The card's picture during Reveal next with reduced motion | Its buttons are disabled, but the picture still linked to Watch, which could buy a drop and end the old card | Fixed: `onResolve` ignores clicks while a reveal is in flight |
| Enter held on a button | Chrome repeats the click, and keyboard clicks get past the double-click guard. +15m bought a drop per repeat when the drop didn't fall, and a held Enter could carry from Reveal into Watch | Fixed: drip's home page ignores repeated Enter keydowns. Browser checklist item 5 |
| Watch whose navigation the user cancels (Esc) | Redraws stay held, so the page shows the old card | Left: the next click on it gets `no-current`, which lets redraws back |
| Play from Stash at 0 minutes when the purchase fails | It goes to the watch page anyway | Left: the lock there offers +15m (Q18) |
| The loading text says Subscriptions "can take 15 seconds" | The worst case is about 30 (15 to load, 15 to poll) | Left for Jesse to decide |
| An animation in a tab hidden mid-reveal | Unknown whether Web Animations' `finished` waits until the tab shows again. If it does, the reveal finishes on return | Not tested: air's driven tab wouldn't go hidden |

`test/home.test.js` now runs home.js against a fake page, fake timers, and a fake worker with the real rules, in both the animated and the reduced-motion paths. It covers every row above that can be reached without a real browser.

## Measured on the MacBook, 2026-10-16

Jesse ran `test/PERF.md` on the MacBook (Chrome 154, plugged in, window visible). Claude summarized the captures with throwaway scripts, and Codex reviewed the scripts and conclusions from the numbers alone, without the raw captures, which come from Jesse's signed-in YouTube. The captures stay in `~/drip-perf/` on air, out of git.

| What | drip on | drip off | So |
|---|---|---|---|
| Playing tab's renderer CPU, 3 tabs | 22.4, 20.7, 21.9% | 17.3, 6.0, 18.4% | About 8 points more with drip on, in both pairs. Three readings each, so a lead rather than a figure |
| The same, 20 tabs | 20.6, 19.3, 24.5% | 17.1, 8.7, 9.1% | |
| Memory, 3 tabs (video, search, home) | 287, 260, 162 MB | 263, 306, 202 MB | Less with drip on overall. The playing tab is about 24 MB more |
| Memory, all 20 tabs | 4.56 GB | 4.78 GB | Background tabs never painted their grids, so this undercounts what a hidden grid saves |
| Heap growth over 50 in-page navigations | 472 to 657 MB, 95k to 153k detached nodes | 468 to 696 MB, 95k to 170k detached | No sign of a drip leak. drip's own detached elements went from 89 to 98. Without retainers this isn't proof |

Background search tabs spiked to 21 to 69% CPU now and then with drip on and off alike, so that's YouTube's search page. Task Manager's Tabs & extensions view never showed drip's worker, so its memory wasn't measured. The drip-off heap run still had drip's elements in it, likely from a tab that ran drip before it was turned off and wasn't reloaded. drip's scripts can't reach the worker once it's off, so they had little to do.

The Performance trace (lock screen, Done for now, a Subscriptions reveal):

- drip's own scripts: about 54 ms of main-thread CPU in 67 seconds. That isn't all drip causes: style, paint, and the hidden frame's work show up under other names.
- The lock screen: the main thread was busy 4% of the time, and the GPU process's main thread 7.6% against 1.0% afterwards. That's elapsed task time on shared threads, not an isolated cost.
- A Subscriptions reveal: about 1.4 seconds of main-thread work in 2.2 seconds, mostly YouTube's own app starting up in the hidden frame, with long tasks of 353 and 457 ms while the reveal animation runs.

### The pill's blur, measured on air

air's Chrome plays video once its window is in front. With drip on, a video playing, and the pill toggled by hand from the console, eight samples of 3 seconds each per setting:

| Pill | GPU process CPU | Tab renderer CPU |
|---|---|---|
| `backdrop-filter: blur(8px)`, as built | 25.8, 21.9, 22.1, 17.5% | 14.3, 14.6, 14.3, 14.8% |
| No blur, or no pill | 15.8, 16.3, 15.9, 16.3, 15.7% | 13.6, 12.7, 12.6, 13.3, 14.5% |

The blur (`drip.css`, `#drip-pill`) costs the GPU process about 6 points for as long as a video plays, even while the pill is faded to opacity 0 with YouTube's controls. It adds about 1 point to the tab's renderer, so it doesn't explain the 8 points above. That gap needs a Performance recording of a playing video, drip on and off. Leads from Codex's review: the 1-second tick sets the pill glass's style every time (`watch.js`, `DripGlass.set` before the unchanged-view check), and player class changes call `pillLook()`.
