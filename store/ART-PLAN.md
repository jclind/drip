# Store listing review and image plan

Written 2026-11-09 in the `store/art` worktree, off `main` at 97fc18e. PRs 101 (lock footer, Done for now motion) and 102 (fade failsafe) are open and treated as not merged. Jesse OK'd the plan on 2026-11-09. Status is at the end.

## Part 1. LISTING.md and PRIVACY.md against main

How I checked: read both files, then the code they describe on main (`manifest.json`, `bin/build-release`, `src/background.js`, `src/lib/state.js`, `src/content/*.js`, `src/options/options.html`), and fetched the live policy at https://jesselind.com/projects/drip/privacy/ on 2026-11-09.

### LISTING.md

Accurate on main:

- Permissions. `manifest.json` asks for `storage` and the one host permission `https://www.youtube.com/*`. The m.youtube.com and youtube-nocookie.com script is `redirect.js` only. `bin/build-release` strips `externally_connectable` (localhost) and the dev panel, so the store build matches the justifications.
- The channel lookup. `background.js:328` fetches the channel page with `credentials: 'omit'`, as the host permission line says.
- Hide Shorts and the bell. Both are hidden by default with switches to bring them back, and a Short always opens as a regular video (Q2, Q16).
- Dry hours. "Optional Dry hours stop watching on paid minutes during a daily range" matches Q32.
- Comments behind Show comments (`comments.js`), the hidden miniplayer (`early.css:115`), theater mode, the centered watch page.

Out of date or worth fixing:

1. The header still reads "Draft, 2026-10-06. Visual assets (screenshots, promo tiles) come with the design work." Both halves are stale.
2. The listing has no store description written for a user. "What drip changes on YouTube" is a reviewer's list of changes. The store's Description field needs something a stranger reads in ten seconds, then the details. I'd write one, with the current list kept under it.
3. Settings isn't described at all. Since 2026-11-07 it has three tabs, Settings, Channels, and History (DESIGN.md Q21, Q31), plus Export and Import. A user picking an extension cares about History; the listing never mentions it.
4. The channel lists sentence sits inside the "With Stash on" bullet, so it reads as if channel lists need the stash. They don't: `channel.js` never checks the stash setting. Allowing a channel only matters with watch time on, and blocking only with reveal cards on. It needs its own bullet.
5. "I need this one" has no limit stated. It's 3 a week over the last 7 days (Q20). Worth one clause, since it's what keeps the lock honest.
6. The lock screen. The listing says only that running out "pauses the video behind a lock", which stays true with or without PR 101. PR 101's footer (refill time, next unlock) doesn't need listing text.
7. The name is still "drip (tentative, Q17)" with "Search the store for clashes before submitting." Nothing records that search as done.

### PRIVACY.md

Accurate on main, checked against code:

- Storage. `chrome.storage.local` holds the state; `chrome.storage.session` holds the multi-tab clock (`background.js:160,180`). YouTube's `sessionStorage` holds `drip-kept` with the Dry hours end (`watch.js:846`, read and removed at `home.js:1584-1587`). The dev panel's `localStorage` flag is in `src/devpanel/`, which the store build removes.
- Export writes settings, stash, log, and channel lists (`state.js:1355`), as the policy says.
- The hidden frame (`home.js:182`), the cookie-less channel lookup, and the two `mailto:` links (`common.js:242`, `options.html:67`) match.
- The live page matches PRIVACY.md's text, including Dry hours, channel lists, sessionStorage, and "Missing a setting?".

Gaps:

1. The live page shows "Last updated: [November 6, 2026]" with the square brackets on screen. That's in jesselind's `privacy.astro`, not here. PRIVACY.md says "updated 2026-11-05", so the two dates disagree by a day too.
2. Two stored fields aren't named: `unlocked` (ids of videos unlocked with "I need this one" today) and `allowedToday` (ids of today's videos from allowed channels). The policy's "settings and token balances" doesn't cover them. One bullet fixes it: "The ids of videos you unlocked today, and of today's videos from allowed channels." Small, but the store's reviewers read these against the code.

### RELEASE-PLAN.md, "Upload day"

Its step 1 (merge PR 69) is done, merged 2026-11-06. `manifest.json` is still `0.1.0`, so step 2 onward hasn't run. No change needed from this worktree. Upload waits for 101 and 102 anyway.

## Part 2. Store images

What the store takes: up to 5 screenshots at 1280x800, a small promo tile at 440x280 (required), and an optional marquee at 1400x560. The 128px icon in `icons/` is already there.

### Rules for every image

- No YouTube anything. No YouTube logo, no YouTube top bar, no real video thumbnails, no real channel names.
- The home harness (`dev/home.html`) can't be used as it is. Its `VIDEOS` list uses real YouTube ids, so thumbnails load from `i.ytimg.com`, and the channels are real (Wiz Khalifa, ImagineDragonsVEVO, Adam Ragusea, Practical Engineering). The welcome tour already has five made-up videos (`welcome.js:39-43`: "How Japanese joinery holds without nails", Workshop Notes, and so on). I'd reuse those titles and channels.
- Dark theme for all five, so they read as one set in the store's carousel (judgment).
- Real drip pages only, rendered by the harness from the real code. No mockups.

### Screens, in order

| # | Screen | Caption (draft) | Source |
|---|---|---|---|
| 1 | Home, Full drip, one revealed card with the glass, drop and card counts, and a short stash | One video at a time, instead of a feed. | `dev/home.html?scenario=saved&theme=dark&reduced=1` with the store video set |
| 2 | The lock: water up, "Time for a breather.", +15m, I need this one, Done for now | When your minutes run out, the video stops. | The welcome tour's lock step (see below). Waits for PR 101 |
| 3 | The mode choice: Quiet, Curated, Full drip with their pictures | Pick how much of drip you want. | `dev/page.html?page=welcome` |
| 4 | Settings tab: Watch time, Cards, Dry hours rows | Set your own drops, cards, and Dry hours. | `dev/page.html?page=options&settled=1` |
| 5 | History tab: today's tiles and the week's chart | See where your time went. | `dev/page.html?page=options#history`, with a seeded week of log |

Order logic: 1 shows what drip is, 2 shows the limit working, 3 to 5 show you're in control of it. Store visitors see the first one or two at most, so the core idea goes first.

Alternates if one of those looks weak: Quiet's home (a search box alone), the Channels tab, or the popup set into screen 1's corner.

### The lock, screen 2

No harness renders the real watch page's lock outside YouTube; `watch.js` needs YouTube's player. Two ways:

- **The tour's lock step (recommended).** `welcome.js` builds the lock from the same markup and `drip.css`, over a stand-in player. The capture hides the coach notes and the ring with a style rule in the capture page and crops to the stage. Cheap, and it already avoids YouTube.
- A new lock harness. PR 101 adds `dev/lock-check.js`, which may already do most of this. I won't look at or touch PR 101's worktree. After it merges, I'd check whether it can render a full-window lock and use it if so.

Either way, screen 2 waits for PR 101, because 101 changes the lock's footer and `welcome.js`.

### Thumbnails

The tour's thumbnails are flat gradients. On screen 1 the card's picture is the biggest thing in the image, and a brown gradient there looks unfinished. Options:

- **Jesse's own photos (recommended).** From his photography site. Real pictures, no one else's rights, and they suit made-up titles like "Riding the ridge trail before the storm". Needs Jesse's pick of five and his OK to use them.
- Drawn SVG scenes, made here. No rights question, but they'd look like clip art.
- Keep the gradients.

### Frame layout

Each screenshot is a 1280x800 page: drip's dark navy background, a one-line caption at the top in drip's type, and the captured page under it at real size in a rounded panel with no browser chrome. Captioned frames are what most store listings use, and they read at the store's thumbnail size where a raw page doesn't (judgment). The alternative is a raw full-window capture with no caption.

### Promo tile, 440x280

Not a screenshot; Google's guidance asks for little text and no UI captures in tiles. The blue drop and the gold card, drawn large in Jesse's cartoon style from `src/icons/`, over the dark background, with the "drip" wordmark. No tagline, or at most "One video at a time." I'd make two or three variants on one page for Jesse to pick from.

The marquee (1400x560) is optional and only shows if the store features drip. Skip it unless Jesse wants it.

### How to capture

- New folder `store/art/`:
  - `frames.html`: one page that draws any frame by query, `?shot=1` to `?shot=5`, `?tile=a`. It loads the harness page in a same-origin iframe sized to the panel, so the harness runs the real code.
  - `videos.js`: the five store videos (the tour's titles and channels) with local thumbnail files.
  - `thumbs/`: the five pictures.
  - `capture.sh`: serves the repo on 127.0.0.1:8077 with `python3 -m http.server`, then runs headless Chrome from `/Applications/Google Chrome.app` on air for each frame: `--headless --screenshot=<out> --window-size=1280,800 --hide-scrollbars --force-prefers-reduced-motion --virtual-time-budget=4000`. Output goes to `store/images/`, PNGs at exactly 1280x800 and 440x280. `sips -g pixelWidth -g pixelHeight` checks each size.
- One edit outside `store/`: `dev/home.html` gets a `videos=store` param that loads `store/art/videos.js` in place of its `VIDEOS`. PRs 101 and 102 don't touch `dev/home.html`. Nothing in `src/`, `test/`, or `DESIGN.md` changes.
- Reduced motion settles the reveal flip and the water at once, so a screenshot never catches a frame halfway. I haven't run headless Chrome against the harness yet; if virtual time fights the page's animations, the fallback is air's Chrome through claude-in-chrome at a 1280x800 window.
- Check: open each PNG, confirm no `i.ytimg.com`, `yt3.` or YouTube logo request in the capture (`grep` the served-request log from `http.server` and Chrome's `--enable-logging` network lines), and confirm the sizes.

### Order of work after the OK

1. Fix LISTING.md items 1 to 5 and PRIVACY.md gap 2, plus a user-facing description. One PR.
2. Build `store/art/`, capture screens 1, 3, 4, 5 and the tile variants. Show Jesse.
3. After PR 101 merges, capture screen 2 and redo any screen 101 changed.
4. Nothing is uploaded, published, or tagged until 101 and 102 are merged and Jesse says go.

## Status, 2026-11-09

- Part 1 is done in this branch: LISTING.md and PRIVACY.md. The privacy page's bracket fix and the new bullet are jesselind PR 32, into `development`.
- `store/art/capture.sh` writes all eight images into `store/images/`: `screenshot-1.png` to `-5.png` at 1280x800 and `tile-a.png` to `-c.png` at 440x280. It checks each size with `sips`, and checks Chrome's network log for any YouTube host. A run of the plain harness, which loads real thumbnails, trips that check on `i.ytimg.com`, so it works.
- `dev/page.html` takes `&sample=1` (two weeks of log, Dry hours on), and `dev/home.html` takes `videos=store`.
- Screenshot 5 shows last week, because this week starts on Sunday and is mostly empty early in the week. The frame clicks the History tab's earlier-week arrow.
- Screenshot 2 is a draft. It's the tour's lock, which says "0m watched today" because the tour runs on a fresh state. Recapture after PR 101 merges, since 101 changes the lock and welcome.js.
- Screenshot 1's thumbnail is a drawn placeholder (`store/art/thumbs/store-trail.svg`) until Jesse picks a picture.
- Jesse's picks, 2026-11-09: screenshot 1 keeps the drawn ridge thumbnail, and the promo tile is `tile-c.png` (the drop beside "drip").
