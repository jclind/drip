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
