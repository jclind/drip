# What drip does when YouTube changes

Review of `src/content/`, `early.css`, `drip.css` and `bin/check-youtube`, 2026-11-05, at `main` `be8ab2b`. Review only: no code changed.

The question: for every selector, DOM assumption, URL pattern and YouTube internal that drip depends on, what happens when YouTube changes it? Each one ends in one of four outcomes:

- **Fails open**: free watching, or a hidden feed, shelf or sidebar comes back.
- **Fails closed**: the user is blocked, or something they need is hidden.
- **Banner**: drip's broken-page banner shows (Q25).
- **Silent**: something breaks, with no banner and no weekly check.

## How this was done

Three read-only reviewers split the code with no overlap: the watch page (watch.js, early.js, guard.js, comments.js, redirect.js, fade.js, the URL rules in state.js), the home page and feeds (home.js, reveal.js, channel.js, menu.js), and search, the CSS and the detection layer (search.js, stash.js, swap.js, counter.js, pour.js, early.css, drip.css, common.js, bin/check-youtube). I then read the code behind every finding myself and marked it:

- **Confirmed**: I read the code path, and it does what the finding says once the trigger happens. For most findings the trigger is "YouTube renames X". How likely that is is a guess, given as a guess.
- **Plausible**: the finding also depends on how YouTube behaves today, which I couldn't see, or on a code path I couldn't trace to the end.
- **Rejected**: wrong, already known, or already decided.

This environment's network policy blocks youtube.com, so nothing was checked against the live site. `redirectTarget` was run in Node against the URL forms named below.

Not repeated here, because the docs already cover them: AUDIT.md finding 8 (the fullscreen Comments button matched by its English label), the English-only past-stream and age detection (DESIGN.md "What a reveal may deal" and the reveal card notes), and IDEAS.md's known race.

## The short version

Three findings should block tomorrow's publish. Each fix is small.

1. A live stream opened from a `/live/ID` link gets paused every second, with no lock, no banner and no detection (C1). One minute on air settles whether YouTube keeps that path.
2. When YouTube breaks the player selector, drip shows its "isn't working" banner, then keeps pausing the video every second for anyone out of minutes. That's the reverse of Q25 (C2).
3. A logged-out user, or one with watch history paused, who presses Reveal gets "YouTube probably changed its page". A store reviewer testing in a fresh profile is the likeliest person to see it (C3).

Beyond those, drip's detection is thinner than Q25 suggests. Only three selectors have a runtime banner: the player, the home `ytd-browse`, and search's `#contents`. A fourth fires when a Reveal finds no grid items. The weekly check covers about 20 JS selectors and 2 of early.css's roughly 30 hide rules, logged out, in one experiment bucket. Most of what keeps YouTube's feeds hidden (the home grid, the end screen, search shelves, Shorts shelves) has no detection at all, and when it breaks it fails open without a sound.

## Confirmed findings

Most severe first. "Block" means fix before publishing tomorrow (2026-11-06).

### C1. A `/live/ID` link gets paused every second. Block, after a one-minute check

- **Where:** `src/content/watch.js:446`, `src/lib/state.js:1047` and `:1054-1074`, `src/content/watch.js:153-156`, `src/content/early.js:42`, `src/content/watch.js:1345`.
- **Trigger:** opening `https://www.youtube.com/live/ID` (the link YouTube's Share button gives for live streams and past streams), or `/clip/ID`. In Node, `redirectTarget` returns `''` for both. `FEEDS` matches only a bare `/live`.
- **What happens:** if YouTube renders the watch page while keeping `/live/ID` in the address bar, `videoId()` is `''`, so there's no clock, pill or lock. But `attach()` still finds `#movie_player video`, and `tick()` runs `if (location.pathname !== '/watch' && video) pausePlayer(video)` every second. That line was written for the miniplayer. The user presses play and it pauses within a second. watchFor only runs on `/watch`, so no banner shows.
- **Outcome:** fails closed, silent. check-youtube loads only `/watch?v=`.
- **Unverified:** whether YouTube keeps the `/live/` path. I think it does for share links, but I couldn't load it here.
- **Suggested fix:** in `redirectTarget`, send `/live/ID` (an 11-character id, not the bare feed) to `/watch?v=ID` the way Shorts go, keeping `t`. Add a test next to the Shorts one. `/clip/` is an open question below.

### C2. A broken player still pauses the video every second. Block

- **Where:** `src/content/common.js:12-19` (`pausePlayer`), `src/content/watch.js:63-67` (`setPlayerBroken`), `src/content/watch.js:463`, `src/content/early.js:17-25` and `:77`.
- **Trigger:** YouTube drops or renames the `html5-main-video` class but keeps `#movie_player`. Of all the ways the player could break, this one seems likeliest.
- **What happens:** after 10 seconds, watchFor calls `setPlayerBroken(true)`. That hides the lock (`showLock` also checks `playerBroken`, `watch.js:911`) and sets `data-drip-broken`, so guard.js lets `play()` through. But `locked` stays true, since only `applyStatus` (`watch.js:398`) sets it. Each second `tick()` then calls `pausePlayer(null)`, which clicks `.ytp-play-button` whenever `#movie_player` has `playing-mode`. early.js's copy does the same on navigation and storage changes, and it never checks `data-drip-broken`. The user reads "drip isn't working on this page" and still can't watch.
- **Outcome:** banner, then fails closed. check-youtube catches the selector break but not this.
- **Why block:** this only hurts once YouTube changes the player, but then it hurts every user who's out of minutes, until a store update gets through review. That can take days. A fail-safe that doesn't hold has to be fixed in the build that ships.
- **Suggested fix:** make `pausePlayer` in common.js and early.js return early while `<html>` has `data-drip-broken`, or have `setPlayerBroken(true)` set `locked = false` and stop the tick's pause. A watch.test.js case: no `video.html5-main-video`, `#movie_player.playing-mode` present, 0 minutes, 11 seconds of ticks, and the play button never clicked.

### C3. A false "YouTube changed its page" banner on an empty home feed. Block

- **Where:** `src/content/home.js:325-330`. The weekly check's own header says it: `bin/check-youtube:4` ("logged out: the home page has no videos then").
- **Trigger:** no YouTube change needed. A logged-out user, or a signed-in one with watch history paused, opens YouTube and presses Reveal video. YouTube's home has no grid items for them.
- **What happens:** the pool is empty and no `ytd-rich-item-renderer` exists, so `reportBroken('grid')` shows "drip can't read YouTube's recommendations… YouTube probably changed its page, and drip needs an update" with Send report. No card is spent. Reveal can never work for these people on the home feed, and nothing tells them Subscriptions or search would.
- **Outcome:** a banner that fires when nothing is broken.
- **Why block:** a store reviewer installing drip in a clean profile is logged out, and the first button the page offers is Reveal. It reads as a broken extension. It would also send Jesse false reports from launch day on.
- **Suggested fix:** before reporting, check for YouTube's own empty-home message, or for the logged-out Sign in button (`a[href*="ServiceLogin"]`, which early.css:138 already relies on). Then show a plain message instead of the banner. The copy is Jesse's call (open questions).

### C4. Grid items that stop parsing fail silently. High, fix soon after launch

- **Where:** `src/content/home.js:127-135`, `:326`.
- **Trigger:** items still match `ytd-rich-item-renderer`, but the `/watch?v=` link or the title moves. YouTube has been replacing these innards with `yt-lockup-view-model`.
- **What happens:** every item is skipped and the pool is empty. But `:is(item)` still matches, so the banner check at `:326` passes, and so does the hidden home frame's 15-second search. The page says "YouTube hasn't loaded anything new" forever.
- **Outcome:** silent. check-youtube runs logged out, so it checks no item keys.
- **Suggested fix:** report `grid` whenever items exist but none of them parses. Count parse failures in `readPool` and report when it's every item.

### C5. Subscriptions has no break detection. High

- **Where:** `src/content/home.js:200`, `:325` (the `homeFeed` guard).
- **Trigger:** any break in `subsBrowse`, `item`, `link` or `title` on `/feed/subscriptions`, or the frame being blocked.
- **What happens:** "Nothing new from your subscriptions" every time, after up to 30 seconds. No banner.
- **Outcome:** silent, for everyone with Reveal from set to Subscriptions.
- **Suggested fix:** let the C4 rule cover the frame too. When the frame's `ytd-browse` loaded but none of its items parsed, report `grid`.

### C6. The home feed is hidden by one CSS rule with no detection. High, fails open

- **Where:** `src/content/early.css:4-15`.
- **Trigger:** YouTube renames `ytd-rich-grid-renderer` (it's moved its lockups to view-models already) but keeps `ytd-browse[page-subtype="home"]`.
- **What happens:** the whole home feed renders under drip's page. Reveal keeps working, because items still match. No banner shows, since `homeBrowse` still matches.
- **Outcome:** fails open, silent. check-youtube checks `homeBrowse` and `mount`, not the grid.
- **Suggested fix:** add a runtime check on `/` that the element holding the grid items is hidden (`getComputedStyle(...).visibility === 'hidden'`), and report `home` when it's visible. Add the grid renderer to check-youtube's home page (present even logged out, I think, though possibly empty: check on air).

### C7. End screens and in-video cards have no detection. High, fails open

- **Where:** `src/content/early.css:26-28` (`.ytp-endscreen-content`, `.ytp-fullscreen-grid`, `.ytp-ce-element`).
- **Trigger:** YouTube renames them again. It already added `.ytp-fullscreen-grid` once (seen 2026-10-07).
- **What happens:** a grid of recommendations at the end of every video and behind "More videos (v)". With autoplay off, that end screen is the pull Q2 removes.
- **Outcome:** fails open, silent.
- **Suggested fix:** add `.ytp-endscreen-content` and `.ytp-fullscreen-grid` to check-youtube's watch page. I think the player builds them at load, but that needs checking on air. `.ytp-ce-element` needs a video with cards, so pick a stable one.

### C8. The broken-page banner never clears. Medium

- **Where:** `src/content/common.js:212-234`, `:249-262`.
- **Trigger:** any 10 seconds without the selector that later ends: a slow first load before `ytd-browse` or `ytd-search` is stamped, a dropped connection, or YouTube's error shell.
- **What happens:** watchFor resets `reported` when the selector comes back, but `#drip-broken` stays on `<body>`, and it outlives in-page navigation to every other page. Even when the player comes back and `setPlayerBroken(false)` runs (`watch.js:381-384`), the banner stays.
- **Outcome:** a false banner, with Send report, until Dismiss or a reload.
- **Suggested fix:** remove `#drip-broken` for that kind when watchFor sees the selector again, and clear `brokenSeen` for it.

### C9. Ad detection rests on one class. Medium

- **Where:** `src/content/watch.js:25`, `:305-313`.
- **Trigger:** `ad-showing` and `ad-interrupting` are renamed or move off `#movie_player`.
- **What happens:** ad time is charged as watching, against Q27, and saved as stash progress.
- **Outcome:** silent. check-youtube skips ads on purpose.
- **Suggested fix:** nothing cheap in the content script. A test account on air that gets ads could watch for the class during the weekly run.

### C10. Autoplay-off rests on one selector. Medium

- **Where:** `src/content/watch.js:24`, `:143-146`.
- **Trigger:** the toggle's class or `aria-checked` changes, or it moves into the settings menu.
- **What happens:** nothing gets clicked, and the next video autoplays. Still metered, so no free time, but it's the "one more video" Q2 is meant to stop.
- **Outcome:** silent.
- **Suggested fix:** a fresh profile has autoplay on, so check-youtube can look for `SEL.autoplayToggle` on its watch page.

### C11. Hiding `#secondary` unless one of four attributes is set. Medium, fails closed

- **Where:** `src/content/early.css:45-50`.
- **Trigger:** YouTube renames `playlist`, `should-stamp-chat`, `panel-expanded` or `engagement-panel-expanded`.
- **What happens:** the column stays hidden when it shouldn't, so the playlist queue, live chat, or an open transcript or chapters panel disappears.
- **Outcome:** fails closed, silent. These states never come up on check-youtube's single video.
- **Suggested fix:** flip it to a show rule: hide `#secondary` only while its own children are the recommendations, with `:has(> #related)` and no panel, so a rename shows the column instead of hiding it. Check on air with a playlist and a live stream.

### C12. The buttons under the video are hidden unless allowed. Medium, fails closed

- **Where:** `src/content/early.css:61`.
- **Trigger:** Download becomes a view-model, the English `aria-label="Save to playlist"` changes, YouTube moves Share or Like into `#flexible-item-buttons`, or the user's YouTube isn't in English.
- **What happens:** those buttons vanish, and at full width there's no "..." menu to find them in. In another language, Save is already hidden (the comment at early.css:56-58 says so).
- **Outcome:** fails closed, silent.
- **Suggested fix:** hide the named buttons (Clip, Thanks, Ask) instead of everything but two. Or accept it and note it with AUDIT finding 8.

### C13. Logged out, the masthead rule can hide Sign in. Medium, fails closed

- **Where:** `src/content/early.css:138`.
- **Trigger:** Google changes the Sign in link away from `ServiceLogin`, or the avatar or bell becomes a `ytd-button-renderer`.
- **What happens:** logged-out users have no Sign in button, and design C hides the sidebar, which might offer one.
- **Outcome:** fails closed, silent.
- **Suggested fix:** hide Create by what it is (its icon or its link to upload) instead of everything that isn't Sign in. Add Sign in to check-youtube's home page, which runs logged out anyway.

### C14. The channel page's Allow button has no detection. Medium

- **Where:** `src/content/channel.js:13-20`, `:31-56`. channel.js has no `watchFor`, and `bin/check-youtube` never loads a channel page.
- **Trigger:** `yt-page-header-view-model`, its `h1`, or its actions row is renamed, or the `h1` text stops matching `document.title`.
- **What happens:** no Allow button. Settings can still add a channel by handle.
- **Outcome:** silent.
- **Suggested fix:** add a channel page (`/@YouTube`) to check-youtube with `header`, `name` and `actions`.

### C15. The weekly check is narrower than its header says. Medium

- **Where:** `bin/check-youtube:5-6`, `:55`, `:74`, `:145`.
- **What's missing:** it says it "can't drift from the code", which holds for the SEL objects, but its two early.css entries are typed-in copies. It reads 2 of about 30 hide rules. It runs logged out in a throwaway profile, so it sees one experiment bucket, no grid items, no bell and no Create. A key passes with one match anywhere on the page.
- **Outcome:** a green week can mean users are broken.
- **Suggested fix:** the per-finding additions above (grid renderer, end screen, autoplay toggle, channel page, Sign in). Longer term, a signed-in test account on air (open questions).

### C16. Smaller confirmed ones. Low

- `src/lib/state.js:1060-1066`: `/embed/videoseries?list=PL…` opened directly becomes `/watch?v=videoseries`, a broken page. Checked in Node. Only for someone who opens an embed URL in its own tab. Suggested fix: skip `videoseries` and keep `list`.
- `src/content/menu.js:134`: the search box's placeholder is set to English "Search" in every language. Design F chose the word, so it's a localization gap, not a break.
- `src/content/fade.js:42-50`: if `yt-page-data-updated` is renamed, every non-watch page stays blank for 6 seconds (`FAILSAFE_MS`), then shows. Silent, but it recovers.

## Plausible findings

Each needs a look at live YouTube, or depends on markup I couldn't see.

| # | Where | Trigger | Outcome | Severity |
|---|---|---|---|---|
| P1 | `early.css:153-159`, `search.js:35-38` | YouTube adds a search shelf that isn't on the hide list. Possibly already there: `ytd-universal-watch-card-renderer`, mix rows (`ytd-radio-renderer`), `ytd-clarify-box-renderer` | Fails open: the shelf shows and counts as one of the 10 | Medium |
| P2 | `search.js:189-190` | Results get wrapped in a container inside `#contents`. The cap counts direct children only | Fails open: the cap stops working, with no banner | Medium |
| P3 | `home.js:47-48` | The live and members-only badges use kebab-case classes in some buckets (`length` and `channel` list both spellings, these two don't), or get renamed | Silent: live and members-only videos get dealt, against Q30. A members-only card wastes a card | Medium |
| P4 | `home.js:31`, `:137`, `state.js:1445-1447` | Collab cards ("A and B") or an extra metadata row make the first metadata text something other than the channel. Blocks on home cards match by name alone | Silent: wrong channel on the card, and a blocked channel gets dealt | Medium |
| P5 | early.css rules scoped to `ytd-watch-flexy` (`:24-25`, `:35`, `:45`, `:60`) | A watch-page layout experiment with a different root element | Fails open: the sidebar, comments and merch come back. The player still matches, so no banner | Medium |
| P6 | `drip.css:9-14`, `html[dark]` rules | Both theme variable families are renamed, or `html[dark]` stops being set | Fails closed: dark text on a dark page on drip's home | Medium-low |
| P7 | `common.js:249-262` | A "Video unavailable", private, age-gated or bot-check watch page has no `video.html5-main-video` | A false player banner | Medium-low |
| P8 | `channel.js:39-46`, `state.js:1643` | On a `/channel/UC…` page the handle can't be read, so the entry is `[UC…]` only, while watch pages send `@handle` | Silent: the allowed channel's videos keep costing minutes | Low |
| P9 | `home.js:1324-1336` | `ytd-masthead #center` still matches but no longer holds the search box | Fails closed in Quiet: the home page has no search | Low |
| P10 | `menu.js:108-120` | YouTube opens the guide on something other than a click on `#guide-button` | Fails closed: drip's menu is dead, and the hidden drawer's backdrop may cover the page | Low |
| P11 | `guard.js:13`, the `#movie_player` scoping | Search hover previews and channel trailers play outside `#movie_player` | Fails open: muted previews and a trailer aren't metered. Happens today, small | Low |
| P12 | `watch.js:370`, `early.js:74` | YouTube keeps a second `video.html5-main-video` and plays the other one | Fails open: no `playing` events, so the clock never runs | Low |
| P13 | `yt-navigate-start` and `yt-navigate-finish` listeners in every file | The events are renamed | Mostly heals itself. Going from a locked video to a free one can leave the lock up for up to 30 seconds. A Short reached without a click isn't redirected | Low |
| P14 | `watch.js:22-23`, `:122-135` | The `theater` attribute is renamed, or the player moves out of `ytd-watch-flexy` | Silent: theater mode toggles about 7 times, then the page waits out fade.js's 6 seconds | Low |
| P15 | `early.js:62-66` | YouTube's player calls `play()` before storage answers. The refused call fires no `play` event, so nothing resumes | One extra click to start a video | Low |

## Rejected

- **Watching on music.youtube.com is free.** Q19 puts it out of scope.
- **Past streams and "Scheduled for" are read in English only, so other languages get past streams dealt.** True, and already written down in DESIGN.md "What a reveal may deal" and in the reveal card notes. What it means for store users is an open question below, not a new finding.
- **The fullscreen Comments button matched by an English label.** AUDIT.md finding 8, accepted.
- **An ad ending with an `ended` event takes the video out of the stash.** No evidence that YouTube fires `ended` on the main element when an ad ends, and I couldn't check it here.
- **The banner can fire on consent.youtube.com.** It can't. The manifest doesn't match that host.
- **A wrong report address.** `REPORT_EMAIL` matches store/LISTING.md and PRIVACY.md.
- **Search's `#primary` renamed leaves the user stuck at 10 results.** True, but check-youtube checks `primary`, so a rename shows up within a week. Low, and it's in the inventory below.

## Inventory

Every YouTube dependency in `src/content/`, with what happens when it breaks. "Weekly" means bin/check-youtube checks it. "Runtime" means a watchFor or reportBroken banner.

### Watch page

| Dependency | Where | If it breaks | Detection |
|---|---|---|---|
| `#movie_player video.html5-main-video` | watch.js:20, early.js:10 | Banner, then fails closed at 0 minutes (C2) | Runtime, weekly |
| `#movie_player` id | watch.js:26, early.js:11, common.js:7, guard.js:13 | Banner, fails open | Runtime (through `video`), weekly |
| `.ytp-play-button`, `playing-mode` | common.js:8, early.js:12 | The pause falls back to `video.pause()` | None |
| `/watch` + `v` param as the video id | watch.js:153, early.js:42, comments.js:19 | Other paths get paused (C1) | None |
| `ad-showing`, `ad-interrupting` | watch.js:25 | Ads charged (C9) | None |
| `.ytp-autonav-toggle-button[aria-checked="true"]` | watch.js:24 | Autoplay comes back (C10) | None |
| `ytd-watch-flexy`, `theater`, `.ytp-size-button` | watch.js:21-23 | Theater flicker (P14) | Weekly (flexy, button) |
| `ytd-app[miniplayer-is-active]` | watch.js:29-30 | Covered: any play off `/watch` is paused | None |
| `#movie_player.ytp-autohide` | watch.js:28 | The pill never idles. Cosmetic | None |
| Title, channel link, `video-id` | watch.js:31-35 | Title falls back to the tab title. The allow list stops recognizing channels | Weekly (title, channel) |
| `ytd-topbar-logo-renderer a#logo` | watch.js:37 | Done for now loads home the plain way | None |
| `ytd-comments#comments` under `#below` | comments.js | No Show comments button | Weekly |
| `yt-navigate-*`, `yt-page-data-updated` | all files, fade.js | P13, C16 | None |
| `HTMLMediaElement.prototype.play`, `startViewTransition` | guard.js | Falls back to early.js's pause | None |
| `/shorts/ID`, `/embed/ID`, `m.`, nocookie, feed paths | state.js:1047-1074 | `/live/ID`, `/clip/ID` and `videoseries` unhandled (C1, C16) | None |

### Home and feeds

| Dependency | Where | If it breaks | Detection |
|---|---|---|---|
| `ytd-browse[page-subtype="home"]` | home.js:24, early.css:4 | Banner, and the grid shows. Q25 as written | Runtime, weekly |
| `ytd-two-column-browse-results-renderer #primary` | home.js:26 | Mounts on the browse element. Cosmetic | Weekly |
| `ytd-rich-grid-renderer` (hide rule) | early.css:4 | Feed shows (C6) | None |
| `ytd-rich-item-renderer`, `ytd-grid-video-renderer` | home.js:27 | Banner on Reveal, home feed only | Runtime, partial |
| Link, title, `v` and `list` params | home.js:28-29, :129-135 | Pool empty forever (C4) | None |
| Channel, channel link, metadata parts | home.js:31-38 | Wrong channel, name-only blocks (P4) | None |
| Length badge | home.js:35 | Cosmetic, plus the upcoming test | None |
| Watched, ad markers | home.js:39-40 | Watched or promoted videos get dealt | None |
| `notify`, `upcoming`, `live`, `members` | home.js:45-48 | Q30 kinds get dealt (P3) | None |
| `ago`, `views`, `Streamed`, `Scheduled for` text | home.js:52-57 | English only, known | None |
| `ytd-browse[page-subtype="subscriptions"]`, frames | home.js:25, :168-208 | Silent (C5) | None |
| `ytd-masthead #center` | home.js:50, menu.js:14 | Quiet draws its own box. A decoy match is P9 | Weekly |
| `i.ytimg.com` hq720 and hqdefault | home.js:872-902 | Gray card front after 8 seconds | None |
| `ytd-masthead #guide-button` | menu.js:12 | YouTube's sidebar comes back. Fails open | Weekly |
| `search_query` input, menu URLs | menu.js:15, :19-31 | Placeholder, dead menu item. Low | None |
| Channel header, name, handle, actions, avatar | channel.js:13-20 | No Allow button (C14) | None |

### Search and CSS

| Dependency | Where | If it breaks | Detection |
|---|---|---|---|
| `ytd-search ytd-item-section-renderer #contents` | search.js:18 | Banner, no cap. Fails open | Runtime, weekly |
| Direct children of `#contents` as results | search.js:189-190 | P2 | None |
| `ytd-video-renderer` and its link, title, channel, length, slot | search.js:21-28 | No Stash buttons. The cap still works | Weekly |
| `#primary`, continuation, hint | search.js:19-20, :30 | Stuck at 10, early loading, no empty note | Weekly (primary only) |
| Search shelves, ads | early.css:153-159 | P1 | None |
| Watch sidebar | early.css:24-25 | Sidebar returns, with `#secondary` as backup | Weekly (`#related`) |
| `#secondary` attribute rule | early.css:45-50 | Fails closed (C11) | None |
| Comments, comments panel | early.css:35-36 | Comments show | Weekly (comments only) |
| End screen, cards | early.css:26-28 | C7 | None |
| Join, merch, Clip/Thanks/Ask, game and channel cards | early.css:59-63 | Mostly fails open, low. Deny-by-default buttons fail closed (C12) | None |
| Miniplayer | early.css:68-69 | Shows while browsing, still paused by watch.js:446 | None |
| Skeletons | early.css:75-77 | Placeholder grid flashes | None |
| Shorts shelves and guide links | early.css:84-88 | Shelves show, clicks still redirect | None |
| Guide drawer, mini guide, Explore section | early.css:93-103 | Sidebar returns | Weekly (drawer) |
| Masthead buttons, Ask chip, bell | early.css:138-145 | C13, the rest fails open, low | None |
| Fade-in | early.css:168-190 | 7-second CSS failsafe | None |
| Theme variables, `html[dark]` | drip.css:9-14 and others | P6 | None |
| swap.js `TOP_BAR = 56`, pill `top: 68px` | swap.js:84, drip.css (`#drip-pill.is-floating`) | Cosmetic offsets | None |
| stash.js, counter.js, pour.js, reveal.js | | No YouTube dependencies | |

### No detection at all, ranked by likelihood times harm

1. Home grid hide rule (C6)
2. End screen (C7)
3. Item fields on the home grid (C4)
4. Subscriptions (C5)
5. `/live/ID` and `/clip/` paths (C1)
6. Search shelves (P1)
7. Live and members-only badges (P3)
8. Ads (C9)
9. Autoplay toggle (C10)
10. `#secondary` and the deny-by-default button rules (C11, C12, C13)
11. Channel page (C14)
12. Everything in the plausible table

## Open questions for Jesse

1. **`/live/ID` links.** On air, open a `/live/ID` share link with drip off. Does the address bar keep `/live/ID`? If yes, C1 is real and blocks. If YouTube rewrites it to `/watch?v=`, C1 drops to low.
2. **`/clip/ID`.** A clip loops a 5 to 60 second piece of a video. Should it open as the full video on the clock, as Shorts do, or go to the token page? Q7 says the clock runs on every youtube.com watch page, so Claude would send it through the clock.
3. **What a logged-out or history-paused user sees on Reveal (C3).** A suggestion: "YouTube's home feed is empty while you're signed out (or watch history is paused). Search, or switch Reveal from to Subscriptions in Settings." Your words, or this?
4. **Non-English users.** Past streams get dealt in other languages, the age is missing from cards, Save under the video is hidden, and the placeholder reads "Search". Should the store listing say drip is built for YouTube in English, or should 1.0 ship to English-language regions only?
5. **A signed-in test account for bin/check-youtube.** Most silent breaks above (grid items, kinds, ads, Subscriptions) only show up signed in. A throwaway Google account on air would cover them. Worth setting up?
6. **Outside this review's topic, but for tomorrow:** `manifest.json` now has `host_permissions` for `https://www.youtube.com/*` (for `channelFromPage`), while store/LISTING.md still says "No host permissions" and DESIGN.md's popup notes say the same. The listing's permission answers need updating before submitting.
