# Resource checks

What drip costs a Mac while YouTube plays: CPU, memory, and what's left behind after many page changes. air's Chrome window is hidden, so videos there never play and these numbers can't come from air. Run this on the MacBook, plugged in, with the Chrome window visible and nothing else heavy running. It takes about 30 minutes.

Results go in `~/drip-perf/` on the MacBook, then get copied to air, where a session reads them and writes them up in `AUDIT.md`.

## Before you start

1. Update drip to the branch with this checklist and `dev/perf-nav.js`: in drip's clone, `git fetch && git checkout test/reveal-failures && git pull`, then click reload on drip's card in `chrome://extensions`. Once PR 51 is merged, `git checkout main && git pull` instead.
2. Run `mkdir -p ~/drip-perf`.
3. In drip's Settings, turn on Developer mode. The dev panel shows at the bottom left of YouTube pages.
4. Write down your minutes, drops, and cards now. Checks 2 and 3 change them through the dev panel, and the last step puts them back.
5. Make sure drip has at least 30 minutes, so check 1's video doesn't lock. The dev panel's Minutes +15 adds them.
6. Open Chrome's Task Manager (Window menu, Task Manager). Right-click its column headers and turn on Memory footprint, CPU, and Process ID. Place it beside the Chrome window, not on top of it: a covered window counts as hidden, and Chrome slows hidden tabs.

## Check 1: Task Manager, drip on and off, 3 tabs and 20

Four rounds, in this order, so drip ends turned on. Each round:

- Tab 1 plays `https://www.youtube.com/watch?v=wvFT4MgEJFA` at YouTube's default quality, and stays the tab in front.
- After the tabs are open, wait 60 seconds.
- Take three screenshots of the Task Manager window, 10 seconds apart (Cmd+Shift+4, then Space, then click the Task Manager window). Name them as below and move them to `~/drip-perf/`.

| Round | drip | Tabs | Screenshots |
|---|---|---|---|
| A | on | The 3 tabs below | `A-1.png`, `A-2.png`, `A-3.png` |
| B | off | The same 3 tabs | `B-1.png` to `B-3.png` |
| C | off | 20: the same 3, plus 10 more of youtube.com and 7 more of the search page | `C-1.png` to `C-3.png` |
| D | on | The same 20 | `D-1.png` to `D-3.png` |

The 3 tabs, in this order:

1. `https://www.youtube.com/watch?v=wvFT4MgEJFA`, playing, the tab in front.
2. `https://www.youtube.com/`, drip's home page.
3. `https://www.youtube.com/results?search_query=lofi`, search results.

To turn drip off or on, flip its switch in `chrome://extensions`, then reload every YouTube tab: select them all (click the first, Shift-click the last) and press Cmd+R. A tab that isn't reloaded keeps the old copy of drip's scripts.

To open the 17 extra tabs for round C, run this in Terminal with Chrome's YouTube window in front:

```sh
for i in $(seq 10); do open -a "Google Chrome" "https://www.youtube.com/"; sleep 1; done
for i in $(seq 7); do open -a "Google Chrome" "https://www.youtube.com/results?search_query=lofi"; sleep 1; done
```

The extra tabs are home and search pages, not videos. Opened watch pages would each start playing.

With drip on, Task Manager also shows a row named "Extension: drip". That's drip's worker, and it only shows while it's awake. Chrome may put several YouTube tabs in one process, and then Task Manager shows them on one row. Both are fine; the screenshots show it either way.

## Check 2: one Performance recording, 60 seconds

This one records the lock screen and a reveal from Subscriptions, the two parts nobody has measured.

1. In drip's Settings, set Reveal from to Subscriptions.
2. In the dev panel, make sure you have at least 1 drop and 1 card (Watch tokens +1, Rec tokens +1), then press Minutes 0.
3. Open `https://www.youtube.com/watch?v=wvFT4MgEJFA`. The lock comes up.
4. Open DevTools (Cmd+Option+I). Undock it into its own window (the ⋮ menu, Dock side, the first icon), so the page keeps its full size. Go to the Performance panel. In its gear menu, leave CPU and network throttling off, and turn on Screenshots and Memory.
5. Click the record button (the circle), then go back to the YouTube window.
6. Leave the lock up for 20 seconds. Click Done for now. On the home page, wait 5 seconds, then click Reveal video. Wait for the card or the "Nothing new" message.
7. At about 60 seconds, stop the recording.
8. Click Save trace (the down arrow at the top of the panel) and save it as `~/drip-perf/check2-trace.json`. If Chrome adds `.gz`, keep it.
9. Close DevTools.

## Check 3: heap after 50 page changes

Two runs, drip on and then off, so drip's share can be told apart from YouTube's own. The script moves between the home page and five videos through YouTube's own in-page navigation, the way clicking links does, without reloading.

Each run:

1. Open a new tab at youtube.com, then open DevTools and undock it as in check 2.
2. In the Memory panel, choose Heap snapshot and click Take snapshot.
3. In the Console panel, paste the contents of `dev/perf-nav.js` from drip's clone (`pbcopy < dev/perf-nav.js` copies it). Chrome may ask you to type `allow pasting` first. Then run `await dripNav(50)`. It takes about two minutes, and prints a small table when it's done.
4. Screenshot the console's table and save it as `~/drip-perf/check3-on-table.png` (or `-off-`).
5. In the Memory panel, take a second snapshot.
6. Save both snapshots: right-click each one in the left column, Save, as `~/drip-perf/check3-on-1.heapsnapshot` and `check3-on-2.heapsnapshot` (or `-off-`). They're big, often 100 to 300 MB each.

For the off run, turn drip off in `chrome://extensions` and reload the tab first. Turn it back on when done.

## Afterwards

1. Turn drip back on if it's off, and reload YouTube tabs.
2. In the dev panel, set minutes, drops, and cards back to what you wrote down. Set Reveal from back to what it was.
3. Copy the results to air: `ssh air mkdir -p drip-perf && scp ~/drip-perf/* air:drip-perf/`.
4. Tell the session they're there.
