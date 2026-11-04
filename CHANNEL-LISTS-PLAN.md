# Channel allow and block lists: build plan

RELEASE-PLAN.md item 4. Written 2026-11-03 on air, against `main` at `51e35a1`. 242 tests pass (`node --test`, Node v26.3.0). Jesse approved it on 2026-11-03, with a Codex review first.

## What's settled (Jesse, 2026-11-02, RELEASE-PLAN.md item 4)

- An allowed channel's videos cost no minutes. They play when drops are out and during quiet hours, with no lock.
- A blocked channel never comes up in a reveal.
- Adding a channel to the allow list waits for the reset (Q6).
- The allow list holds at most 5 channels.
- The channel page gets an Allow button. The reveal card gets Block, and no Allow. Settings lists both.

## What the code does today

Each line was read in the code on 2026-11-03.

- A video carries only the channel's display name. `Video.channel` is a string (`src/lib/state.js` typedef), read from `ytd-watch-metadata ytd-channel-name a` on the watch page (`src/content/watch.js` `SEL.channel`, used at line 901) and from the lockup's metadata text on the home grid (`src/content/home.js` `SEL.channel`). Names aren't unique, so they can't be the key.
- "Free to watch today" already exists as `state.unlocked`, the ids "I need this one" unlocked. `charge`, `chargeTick`, `watchStatus`, `buyIfOut`, and `earlyLocked` all skip a video in it, and `rollDay` clears it. But `needThis` caps it at `needThisPerDay`, and the pill says "Unlocked" for it (watch.js line 1107).
- Waiting settings live in `state.pending.changes`, one value per key, replaced whole (`updateSettings`, `cancelPending`). A list kept there would lose edits: add A (waits), then remove B (applies now), and at the reset the waiting list puts B back.
- `mayReveal(candidate, settings)` and `canDeal(state, candidate)` decide what a reveal may deal. `buyIfOut` buys a drop when Watch is pressed at 0 minutes.
- `early.js` holds a watch page's player before the worker answers, using `earlyLocked(raw, now, videoId)` on raw storage. It knows only the URL's video id.
- Settings has sections per part, then Every day, History, Why you needed one, and Your data (`src/options/options.html`).

## Claude's calls (judgment, for Jesse to accept or change)

Revised 2026-11-03 after a Codex review (18 items, every one checked against the code). The changes are marked "(Codex N)".

1. **A channel is a set of ids, not a name.** `Channel = { ids: string[], name: string }`. An id is `@handle` in lowercase, from an `href` like `/@veritasium`, or a `UC...` channel id from `/channel/UC...`. One channel can show up under either, so an entry keeps every id seen for it and matches on any of them. A sighting that shares an id with an entry adds its other ids to that entry (Codex 11). `name` is only for display, and a later sighting fills it in. Handles can change, which drops a channel off a list until it's added again. That's rare.
2. **A candidate or card with no ids matches by exact name,** against entries that have a name. Blocking a card with no ids stores a name-only entry. A false match only hides a video, the safe direction (Codex 10).
3. **Removing a channel from the block list waits for the reset.** It loosens. Removing one from the allow list applies at once, since it tightens. Blocking applies at once. In the first 24 hours after install every change is immediate, as Q6 says.
4. **The lists live outside `Settings`,** in `state.channels = { allow: Channel[], block: Channel[] }`, with their own waiting part, `state.channelsPending = { effectiveDay, allow: Channel[], unblock: Channel[] }`, applied by `rollDay` and by the dev panel's `apply-pending` (Codex 15). Any immediate change to a channel cancels a waiting change for it: removing a waiting allow cancels it, and blocking a channel whose unblock is waiting cancels the unblock. Reset cancels every waiting allow (Codex 12). The 5-channel cap counts allowed plus waiting.
5. **The block list holds at most 100.** For storage. Nobody should hit it.
6. **Free videos go through one check, `isFree(state, videoId)`.** It's true for an id in `unlocked`, or for an id in `state.allowedToday`, a list of `{ id, ids }` pairs cleared at the reset, whose channel ids are still on the allow list. Checking the list at use means Remove and Reset take effect on a video already playing (Codex 7). Every place that reads `unlocked` to decide cost or lock calls `isFree` instead: `charge`, `chargeTick`, `watchStatus` (which gains `allowed`), `buyIfOut`, `earlyLocked`, home.js `costsDrop`, and watch.js's tick checks (Codex 2, 15). `unlocked.length` still counts only "I need this one".
7. **A watch page proves its channel to the worker.** watch.js reads the owner link after `yt-navigate-finish` for the URL's video, checks `ytd-watch-flexy`'s `video-id` matches the URL, and sends `allowedVideo(videoId, ids)`. The worker adds the pair only if an id is on the allow list. drip runs on the honor system (Q4), so the worker takes the page's word. Step 1 checks on air whether the owner row can still be the old video's when `yt-navigate-finish` fires (Codex 13). If it can, watch.js waits for the owner link to change too.
8. **No lock flash for an allowed video, and it starts on its own.** At 0 minutes, watch.js waits up to 2 seconds for the channel read before raising the lock. early.js holds the player in that time, so nothing plays for free. When the worker adds the video, early.js sees it in storage and plays a video it paused for that id (Codex 14). A video from any other channel sees its lock up to 2 seconds later than now. If the channel can't be read, the lock rises as usual.
9. **The pill says "Allowed channel"** where it says "Unlocked" today, with the same look: no glass, no minutes. The time is still logged for History, the way an unlocked video's is. The welcome tour never plays an allowed video, so its pill and player stay as they are.
10. **Watch on a card or a stash row from an allowed channel buys no drop.** A reveal still costs a card. Video records keep `channelIds` from every place that makes one: home.js candidates, watch.js's Stash button, and search.js's (Codex 5, 9). `buyIfOut` looks up the video in `current` and the stash. The home page's prices use `isFree` the same way. A stash row saved before this has no ids, so it buys a drop as now, and the watch page then makes that video free for the rest of the day.
11. **Block on the reveal card asks once, in the card** (replaced 2026-11-04: Block is in a ⋯ menu beside the title and takes two clicks, Jesse's picks B and K): "Block <name>? drip won't deal their videos again. Unblocking waits for the reset." with Block and Cancel. Block adds the channel and ends the card through `endCard('pass')`, so it counts the way Pass does, and a stashed card stays counted as saved (Codex 17). No card back: that would make Block a free re-deal. The card is built in home.js (Codex 8), and welcome.js's copy of the card gets the button too.
12. **The channel page's button sits next to Subscribe.** It reads "Allow in drip". Once pressed: "Allowed from 4am" (the reset hour, from `hourLabel`) while waiting, then "Allowed in drip". Pressing either one again removes the channel, at once. At 5 channels it reads "Allow list full" and links to Settings' Channels section. A new content script, `src/content/channel.js`, with its own `SEL` at the top, in the big content-script group in `manifest.json`.
13. **Settings gets a "Channels" section after the part sections and before Every day,** always open, since it isn't a mode part. Two lists, "Allowed (2 of 5)" and "Blocked", each row the name, the ids in gray, and Remove. A waiting row shows when it starts and Cancel. Each list has an add field that takes `@handle`, a channel URL, or a `/channel/UC...` URL. Edits apply when pressed, not through the Save bar, like Your data. The lists redraw only when they changed (the focus bug from PRs 57 and 63). `channels` joins the worker's section whitelist and the arrival check (Codex 16).
14. **Export, import, and reset include the lists.** Export writes the planned lists. Import adds through the same rules: allow entries wait, block entries apply now, nothing is removed. The file format stays 1, with `channels` optional, so older exports still import. Reset empties the allow list and its waiting entries at once, and empties the block list from the next reset.
15. **Blocking only affects reveals.** Search results, channel pages, and stashed videos from a blocked channel stay as they are, as item 4 says.

## What step 1 found (air, 2026-11-03, logged out)

- **Watch page:** `ytd-watch-metadata ytd-channel-name a` has `href="/@handle"`. No `UC` id anywhere fresh: the head's `meta[itemprop=identifier]` and canonical link keep the first page load's values after an in-page move.
- **In-page move between videos:** at `yt-navigate-finish` both `ytd-watch-flexy[video-id]` and the owner link are still the old video's. About 300 ms later both change. A frame-by-frame watch over three moves between three channels never saw one change without the other. So watch.js waits until `video-id` matches the URL, then reads the owner.
- **Search results:** `ytd-video-renderer ytd-channel-name a` has `href="/@handle"`.
- **Lockups** (`yt-lockup-view-model`, the late-2026 home and related grid): only `/watch` links. The avatar has no href. A home candidate has the channel's name and nothing else, so call 2's name match is the main path for blocking from a card, not a fallback. The subscriptions feed couldn't be checked logged out; it uses the same lockups.
- **Channel page:** the URL is `/@handle` or `/channel/UC...`. The header, `yt-page-header-view-model`, shows the handle as text (`@veritasium`) either way, and its `h1` is the name. Subscribe is `yt-subscribe-button-view-model` inside `yt-flexible-actions-view-model`. The Allow button goes after it.

What changes in the calls: a channel's ids are in practice its handle, with the `UC` id kept only when a `/channel/UC...` URL is all there is. An entry matches by id where the page has one (watch, search, channel page) and by name where it doesn't (home cards, stash rows from the home page). A sighting with both fills in the other. A block added in Settings by handle only matches home cards once drip has seen the channel's name on a watch, search, or channel page. Settings says so on that row: "Name not seen yet".

## Steps

One branch, `feat/channel-lists`, one PR, a commit per step. I check each step before the next.

1. **Read the markup on air.** In air's Chrome (window brought forward first, registry page `claude-in-chrome`), confirm and write down: the owner link on a watch page, `ytd-watch-flexy[video-id]`, and whether the owner link has changed by the time `yt-navigate-finish` fires on an in-page move between two channels' videos; the channel link inside a subscriptions-feed or channel-page lockup (logged out, the home grid is empty; channel pages use the same grid markup); the channel link in a search result; the Subscribe button's container on a channel page, and where the `UC...` id sits there. The selectors go at the top of each file.
2. **Tests from this plan, before the code.** New `test/channels.test.js`: id parsing from each URL shape; merging ids into one entry; allow add waits and remove applies now; block add applies now and unblock waits; each conflict in call 4; first-day immediacy; the cap of 5 counting waiting entries; `rollDay` and `apply-pending` applying `channelsPending` and `rollDay` clearing `allowedToday`; `allowedVideo` refusing ids not on the list; `isFree` turning false after Remove and after Reset; `charge`, `chargeTick`, `watchStatus`, `buyIfOut`, and `earlyLocked` for an allowed video; `buyIfOut` from a card and a stash row with ids; `canDeal` refusing a blocked id and, without ids, a blocked name; Block on the card with no refund and the saved count kept; export, import, and reset with lists, and an old export without them.
3. **State rules** in `src/lib/state.js`, and messages in `src/background.js`. The step-2 tests pass.
4. **Watch page and early hold:** watch.js reads ids, sends `allowedVideo`, waits before the lock, shows the pill label, and adds ids to its Stash record. early.js plays a video it paused once that video turns free. home.js and search.js read ids into their records, and home.js prices use `isFree`.
5. **Channel page button,** `src/content/channel.js`, and its manifest entry.
6. **Reveal card Block** in home.js, with the in-card confirm, and the same button in welcome.js's card.
7. **Settings Channels section,** in `options.html` and `options.js`, and `channels` in the worker's section whitelist.
8. **Docs:** DESIGN.md gets a Q31 row with Jesse's 2026-11-02 rules and these calls marked as Claude's, and the State API section the new functions. RELEASE-PLAN.md item 4 gets "Built" with the PR number, item 5 gets "Built 2026-11-03 (PR 62)", and the order line changes from 5, 3, 4 to 5, 4, 3. A note for item 3 (quiet hours): allowed videos must play then, through `isFree`.
9. **Check in the browser,** then a Codex review (`/codex-review`), fix what's real, and open the PR with `/ship`.

## How another model can check this plan

- The claims under "What the code does today" can be checked with `grep -n` against `51e35a1`: `SEL.channel` in watch.js and home.js, `unlocked` in state.js, `updateSettings` and `cancelPending`, `mayReveal`, `canDeal`, `buyIfOut`, `earlyLocked`.
- Check the lost-edit claim: with lists kept in `pending.changes`, does add-then-remove bring the removed entry back at `rollDay`? (`Object.assign(state.settings, state.pending.changes)` in `rollDay`.)
- Check call 6's trust: the worker accepts the content script's word for the channel. drip runs on the honor system (Q4), so that's within the design, but say so if you think otherwise.
- Check call 7 for a free-play gap: can a video play during the 2-second wait? It shouldn't, because `earlyLocked` holds it until watch.js decides.
- Check call 10 against Q13 ("Pass is free and final").

## Browser checks for step 9

On air, with the stand-in harness from the handoff for Settings and the real extension on YouTube:

1. Allow a channel on its page. The button reads "Allowed from 4am". `devAction` `apply-pending` (from localhost, `dev/reload.html`), and it reads "Allowed in drip".
2. Set minutes and drops to 0. Open that channel's video: it plays, the pill reads "Allowed channel", no lock, and `watchSecondsLeft` stays 0. Open another channel's video: the lock rises within about 2 seconds.
3. Click from the allowed video to another channel's video in the same tab (a YouTube page change, not a reload). The lock rises for the new one.
4. Block a channel from a reveal card. The card passes, `recSpent` stays as it was, and that channel's videos aren't dealt again.
5. In Settings, the lists show both channels. Remove the block: it waits. Add a sixth allowed channel: refused, with the reason.
6. Export, reset, and import, and the lists come back under the same rules.
