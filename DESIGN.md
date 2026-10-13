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
| Q5 | Feed source: YouTube home feed (default) or subscriptions. It keeps the last choice. Explore was dropped because `/feed/explore` now serves the home feed (Jesse, 2026-10-06). It's a Settings field for now, not a toggle on the home page; its design comes later (Jesse, 2026-10-10). |
| Q6 | A settings change that loosens a limit takes effect at the next day reset. Tightening is immediate. |
| Q7 | The clock runs on every youtube.com watch page while the video plays. Embeds elsewhere are free. |
| Q8 | Built on air as private `jclind/drip`, tested in air's Chrome, cloned on the MacBook and loaded unpacked. Data in `chrome.storage.local`. |
| Q9 | Plain JS, Manifest V3, no build step, `// @ts-check` with JSDoc. Move to WXT when settings outgrow one page or publishing gets serious. |
| Q10 | 1 watch token = 15 min, drained only while playing. 1 rec token = 1 reveal. Defaults: 4 watch tokens, 10 rec tokens per day. |
| Q11 | Tokens roll over up to 2 days' worth. Bought minutes expire at reset. |
| Q12 | Day resets at 4am, as a setting. |
| Q13 | The reveal card offers Watch, Save, Pass. Pass is free and final. Save keeps the card up and the button turns into "Saved". "Reveal next · -1 card" passes and reveals in one click. Pass is a round × button with a tooltip, free and still final. A video saved and then passed stays in the backlog (Jesse, 2026-10-07; built 2026-10-10). On screen, Save is "Stash" and "Stashed", and the Saved list is "Stash", so drip's button doesn't look like YouTube's own Save (Jesse, 2026-10-11). |
| Q14 | Backlog videos cost no rec token. Save button on watch pages and search results. Backlog is a text list (title, channel, length), no thumbnails. |
| Q15 | Search: remove injected shelves, stop at 10 results, free "more" button. |
| Q16 | Replace subscriptions and Explore with the token page. Channel pages and the bell stay as they are. Watch page comments are hidden behind a "Show comments" button that lasts for that video (Jesse, 2026-10-06). |
| Q17 | Name: `drip` (tentative). |
| Q18 | Home layout: balances, Reveal and Add 15 min buttons, one card, collapsed backlog. Expect tweaks. While a card is up, Watch is free if minutes are left. At 0 minutes it reads "Watch · -1 drop", and clicking it buys one watch token's minutes and starts the video. "+15 min" shows only when no card is up (Jesse, 2026-10-07; built 2026-10-10). |
| Q19 | Background audio counts like any watching. `music.youtube.com` is out of scope. |
| Q20 | "I need this one" on the overlay: typed reason, unlocks that one video for the day without draining minutes, 2 per day, every use logged. |
| Q21 | Log per day: seconds watched, tokens spent, reveals saved or passed, "I need this" reasons. Keep 90 days. Show today plus the 7 days before it, 8 rows, so today sits next to the same weekday last week (Claude's pick, Jesse deferred, 2026-10-06). Jesse's Settings mockups replaced the 8 rows with the History card, a week at a time (2026-10-09, built 2026-10-11). |
| Q22 | Popup shows balances and minutes left, plus a Settings link. No spend buttons. |
| Q23 | v1 is the core loop. The rest of the blocking is step 2. |
| Q24 | 1.0 is a build that works for a stranger installing it from the Chrome Web Store. Visual design comes after, with Jesse. `RELEASE-PLAN.md` has the steps (Jesse, 2026-10-06). |
| Q25 | When YouTube's markup changes and drip can't find the player or the home grid, it fails open: videos play without the clock. drip tells the user it's broken and offers to send a report, which the user sees and confirms first. A check on air finds the break on its own too (Jesse, 2026-10-06). |
| Q26 | Finishing a video that's in the backlog removes it from the backlog. Each new video opens in theater mode. Kept as they are for now (Jesse, 2026-10-06). |
| Q27 | Ads don't use watch minutes. Time the player spends on an ad isn't charged or logged (Jesse, 2026-10-07). |

## Visual design (in progress, home page, lock screen, popup, and Settings built)

Jesse is designing the look by hand, with Claude reviewing his mockups, started 2026-10-07. The goal is a little character without being distracting. Spending a token can feel satisfying, but restraint should feel good too, so the design doesn't reward spending everything.

Settled:

- A blue drop is the watch token and a gold card is the rec token. Jesse drew both, in a cartoon style with a shimmer cutout.
- Icons for actions and tokens (play, save, reveal, drop, card) use that cartoon fill with the shimmer. Icons that dismiss or collapse (×, the backlog arrow) are plain lucide lines, so they recede.
- Every button that spends shows its price on the button, like "Reveal video · -1 card".
- Watch is the primary button on the reveal card: white with black text in dark mode, black with white text in light mode. Reveal on the empty page is gold.
- Reveal card layout: thumbnail, then the title across the full width cut at 2 lines, then channel and length on the left with Watch on the right of the same line. Below that, one row: Save, "Reveal next · -1 card", and the round ×.
- Revealing a new video shouldn't shift the layout. Reserve a 16:9 box and 2 title lines before the thumbnail loads.
- Sentence case on all labels.
- The backlog is called "Stash" on screen, to match the Stash button, and stays newest first. Its header shows the count and total length, like "Stash · 8 videos · 1 h 42 min". It's open on the empty page with the top 3 rows, and collapsed to the header while a card is up. Two controls: the chevron on the header opens and closes the list (right when closed, down when open), and a gray "Show 5 more" line under the third row shows the rest, then reads "Show less". The line names the hidden count, since the header already has the total. With 3 or fewer videos there's no line.
- Saved rows: title on one line cut with "…", channel and length under it in gray, and the blue cartoon play icon on the right with no circle behind it. The whole row plays the video. On hover the row gets a faint gray background and a plain lucide × appears left of the play icon. Removing a row collapses it to "Removed · Undo" for about 5 seconds. At 0 minutes the play icon shows "-1 drop", the same rule as Watch. The chevron points down when the list is open. An empty list says "Videos you stash show up here." Jesse's mockup, 2026-10-07.
- Durations everywhere use the compact format, like Apple's Screen Time: "1h 42m", "34m", "1h 5m" (no leading zero), "<1m" under a minute. That includes "34m left today", "+15m", and the stepper's "15m". Older examples in this file that say "1 h 42 min" or "15 min" follow this rule now. `formatMinutes` changes to match (Jesse, 2026-10-09).

Lock screen (started 2026-10-07). The satisfying moment here goes to leaving. Paying stays neutral and justifying stays a little effortful:

- Headline: "You've had your fill." when no watch tokens are left, "Time for a breather." when there are tokens to buy minutes. Jesse's lines.
- "Back to drip home" becomes "Done for now", the white primary button, with no icon. A slow shimmer sweeps across it every few seconds. The pill's low-time shimmer is the only other one. Clicking it sends rings through the panel, and the water falls away onto the home page.
- "+15 min · -1 drop" is the gray secondary button, with white text. "I need this one · 2 left" is a gray text link, and its reason box gets no animation.
- Layout, top to bottom: headline, a gray line "1 h 15 min watched today · 50 min last Tuesday" (only the first half when last week has no data), the two buttons with Done for now on the right, then the link. No token counts on this screen; the headline already says whether minutes can be bought. Jesse's mockup, 2026-10-07.
- "+15 min" keeps its clock icon here and on the home page, so it looks the same everywhere.
- The paused frame behind the panel is blurred and tinted blue, as if underwater.
- "You've had your fill." drops the gray button and leaves Done for now alone in the middle. When the unlocks are gone too, "The glass refills at 4:00am." (the reset hour) takes the link's place.
- Leaving the lock screen with drops unspent says so on the home page. It was the gray line "Kept 3 drops." until 2026-10-13, when Jesse's pick replaced it: the drops fall into the drop counter and a gray "3 kept" tag slides out beside it (see "The counter's motion as built").
- Jesse confirmed these on 2026-10-07.

Minutes and the watch page pill (2026-10-07):

- Minutes show as a glass of water: the tile on the home page and a small one in the pill. It fills when you buy minutes and drains while you watch. Full means the minutes bought today, which needs a new state field, since drip doesn't track that yet (Jesse).
- Jesse drew the glass in `cup-icons/` (2026-10-08): a gray glass with the shimmer cutout and blue water with a wavy surface, showing the top of the water when full. Build it as one SVG with the water height set from the fraction, so the level moves smoothly and the fill animation can rise. Near 0 the water thins to a sliver like Jesse's low cup, and while any minutes remain it stays at least 2 screen pixels tall, so the 20px pill can tell low from empty. At 0 the glass is empty. The glass outline uses `currentColor`: `#D9D9D9` on dark, about `#909090` on light, where the original gray is nearly invisible.
- The pill: the glass, "34 min", and a cartoon bookmark for Stash that fills in when stashed. Labels "Stash" and "Stashed".
- The pill never offers to buy minutes. That stays on the lock screen (Jesse).
- Proposed, not confirmed: "Unlocked" in gray with no glass on an unlocked video. A small "ad, not counted" while an ad plays. The glass down to its last drop in the last minute, with no red. The pill fading to low opacity a few seconds into playback and coming back when the mouse moves.

Popup (2026-10-08, Jesse's mockup, redrawn 2026-10-11): the glass tile and the time with "left today" side by side, centered, then the drop and card counts in a row centered under them. Below, two gray links spread edge to edge: "⚙ Settings" on the left and "Open YouTube ↗" on the right, with lucide's arrow-up-right after the text. Open YouTube switches to an open YouTube tab if there is one. The page fills Chrome's popup window edge to edge with no outer card, and it follows Chrome's light or dark theme, not YouTube's. It has no fixed width: the links, kept at least 32px apart, set it at 275px, and every time up to "12h 59m" fits within that, so it doesn't change size while open. Still read-only (Q22). Jesse tried the counts on the right, spread and centered, and the counts under the time alone before this (2026-10-11).

Settings (2026-10-08, Jesse's mockups):

- On screen, watch tokens are "drops" and rec tokens are "cards", in Settings, the welcome page, and everywhere else a user reads them. Code and state keep their names.
- Three sections with small gray caps headers: "Your allowance" (drops per day, minutes per drop, cards per day, save unspent for), "Your day" (new day starts at), and "When time runs out" (finish the current video, "I need this one" per day). Labels sit flush left under their headers.
- Numbers use steppers with plain lucide minus and plus, with one thin outline around the whole stepper. The unit or icon sits after the number inside the stepper: "4 💧", "15m", "10 🃏", "2 days". The value boxes are all as wide as the widest value. − dims at the minimum and + at the maximum. The reset hour is a time picker showing "4:00am", filled gray like the steppers. Grace mode is a blue toggle. Minutes and the hour use drip's compact format, not the mockup's "15 min" and "4:00 am" (Jesse asked, Claude's pick, 2026-10-11).
- Gray hints only where needed: "Unspent drops and cards carry over up to this many days." under Save unspent for, and "Each one needs a typed reason." under the unlocks.
- A loosening change that waits for the reset shows as a gray chip to the right of its label, like "→ 3 days from 4:00am · Undo", and wraps under the label when the row is too narrow. The row doesn't grow, so nothing moves. The old notice at the top and the separate pending list go away.
- The white Save button stays, with "1 waiting for the reset." next to it.
- This week and Today (2026-10-09, Jesse's mockups, colors are placeholders to tune at build time). One dark card under a small gray caps "This week" header.
  - Top of the card: "Daily average" in gray, the average big and white ("1h 05min"), and on the right a gray down or up arrow with "17% from last week".
  - Chart: 7 blue bars, S M T W T F S, today's letter bold, future days empty. A right gutter has "2h" at the top and "0" at the bottom, centered on the top of the scale and the bar baseline. The scale max rounds up past the tallest bar. A dashed line runs across the bars at last week's daily average and ends at the plot edge. Its label is a key under the chart, "- - Last week's average · 1h 18m", so the gutter holds only "2h" and "0" and nothing can collide or overflow at any value (Jesse, 2026-10-09).
  - Today block: "Today" in gray, the minutes big and white ("23min"), then three equal tiles with the lighter fill: drops used (blue drop), cards used (gold card), unlocks used (gray lock, "0 / 2" with the "/ 2" small and dim). Each tile has the icon and a big number on top and a gray sentence-case label under it. Zero is dimmed, and the unlocks tile needs an active look at 1 or 2 that isn't mocked.
  - Under the tiles, a left-aligned small gray line: "Of 5 cards, 2 saved and 3 passed." It describes the whole row, not one tile; the versions that hung it under the cards tile or put it inside a tile didn't work. Hide it at 0 cards, say "Of 1 card, 1 saved" in the singular, and drop zero parts. If a reveal can end as Watch, add "1 watched" so the parts add up. The code has to say which outcomes get logged. Checked 2026-10-09: `resolveCurrent` counts `saved` and `passed` but logs nothing for Watch, so "watched" needs a new log field. Save no longer ends the card (Q13), so each card counts once: Save counts `saved` at once and taking it back uncounts it, Watch counts `watched` (moving a saved card from `saved`), and Pass counts `passed` unless the card was saved, since the video stays in Saved. Built 2026-10-10 with a `watched` log field. `recSpent` also includes a card still showing, so the parts can be one short of the total.
  - Build notes: `logDays` returns 8 days (Q21), which is too few for last week's average, so the chart needs the log's earlier days (90 are kept). The week starts on Sunday for now (Jesse, 2026-10-09). The section header above the card is "History", since the card can show any week. The ‹ This week › control sits at the top of the card, because it changes everything in it. The block under the chart is named after the selected day: "Today", or "Sunday, Sep 21" on another day or week. ‹ › arrows on either side of the "This week" label step back through earlier weeks ("Last week", then dates like "Sep 21 – 27") as far as the log goes, and everything in the card follows the week shown. › is dimmed on the current week. The daily average counts only the days so far, so on Tuesday it divides by 3. This replaces the earlier proposal of 8 bars with the same weekday last week marked. The "I need this one" reasons stay as a list under it. Developer mode stays at the bottom, unchanged.

Welcome page (2026-10-09, Jesse's first mockup and this plan):

- Hero: the drop and "drip", the tagline "Make every drop count." (Jesse's), then three cards: Drops "1 drop = 15m of watching", Cards "1 card = 1 video revealed", Stash "Watch later, costs no card". Under them: "You get 4 drops and 10 cards a day. You can change these in Settings." The numbers are the defaults, which are the settings on install. They were read from the saved settings until 2026-10-12, when a reopened tab showed Jesse his test numbers; he asked for "whatever a default account starts with".
- Then one interactive tour panel in 5 steps, each one sentence over a working miniature of the real screen: the stats block where "+15m" fills the glass, a reveal with the parting animation and Save, a fake player with the pill draining fast, the lock panel where Done for now ripples, and the five "what changes" bullets. Step dots, Back, Next, and Skip. The last step ends on the white Open YouTube button.
- The tour is a sandbox and never touches real state. It reuses the real components, so it has no screenshots or separate art, and it's built last, after those components exist.
- Footer: gray "Open YouTube ↗" and "⚙ Settings" for people who skip, and "Everything drip knows stays in this browser."
- The "What changes on YouTube" bullets: Home and Subscriptions open your drip page instead of a feed, and you can reveal from either. Watch pages have no suggestions sidebar, no end screen, and no autoplay, and comments wait behind a button. Shorts open as regular videos and use minutes like any other. Search shows 10 results at a time, with a button for more. Your channels and playlists work as before, and ads and videos embedded on other sites don't use your minutes. Lucide icons: house, play, smartphone, search, check.
- The old loosen-later paragraph leaves this page, since the Settings chip teaches it.

Welcome page as built (2026-10-11, step 5). Jesse's draft (a Figma frame shared in chat, not saved to the repo) set the layout: the tiles in a row, the sentence over a dotted blue stage, dots on the left and Skip and Next on the right. He asked for it to be held loosely, especially the walkthrough. Claude's calls, open to his review:

- The tour's screens are working copies run on a throwaway state through the real rules in state.js, drawn with drip.css, glass.js, and common.js's `icon()` and `price()`. Nothing reaches the worker. The markup is copied from home.js and watch.js, because their views live inside those files' closures. A change to the home card, the lock, or the pill needs the same change in `welcome.js`.
- The steps: (1) the home page, where +15m fills the glass and Reveal video moves on to step 2; (2) a revealed card with Watch, Stash, Reveal next, and ×; (3) a player with the pill, where Play drains the minutes 90 times faster than real ones, and at 0 the tour moves on to (4) the lock rising over the paused video, where +15m drains it and plays on, I need this one takes a typed reason and unlocks, and Done for now plays its rings and falls away onto the home page, where the kept drops land in the counter with a "N kept" tag; (5) "What changes", as a table of YouTube's way against drip's. On the last step Next becomes the white Open YouTube button. Back, Skip (to the last step), the dots, and the arrow keys move between steps.
- Step 2 deals its first card as it opens, with the reveal animation below, and its Reveal next and Pass animate the same way the home page's do (2026-10-12).
- Step 1's +15m, step 3's last drop, and step 4's +15m move the water the way the home page and the watch page do (see "The glass's motion as built"). Step 3's drop lands at the bottom of the stage, and step 4's lock rises from there (2026-10-12).
- The videos are made up, with drawn gradient thumbnails, so the page loads nothing from YouTube.
- The stage is one height, 500px, on every step, so Next, Back, and the screens' own buttons never move under the cursor. Jesse asked for it on 2026-10-12: "The worst thing as a user is when you go to click a button and it shifts a little bit and you have to move and click it again." 500px holds the tallest screen, the revealed card. It grows past that only when the lock's reason form needs more room, and while the lock's water moves it holds its height and glides back only once the lock is gone. Below 600px wide the sentence above the stage keeps room for two lines, since two of them wrap there.
- The tiles say "Stash", not the draft's "Saved", since Save was renamed Stash. Each caption fits one line so the three tiles line up. Stash's first text, "Keep videos for later. Opening one costs no card.", wrapped to three lines (Jesse: "they look very awkward right now because the text doesn't line up", 2026-10-11). The draft's "Watch later, for free" became "Watch later, costs no card", because a stashed video still uses minutes.
- The stage grows to hold the lock's panel, so the reason form's buttons are never cut off. The pill is built once per player and updated in place, so its Stash button keeps clicks and focus while the video plays. Play pressed again just after the minutes run out cancels the move to the lock (Codex's three findings, 2026-10-11).
- Done for now flashed the whole lock back for about half a second before it went away (Jesse, 2026-10-12: "the transition is glitchy"). Chrome paints the overlay unmasked once the crest is within a few px of the bottom edge, and the tour's water drained 480px through a stage about 300px tall, so it sat past that edge for the last 0.4 seconds. `#drip-lock` now also clips at the waterline, which fixes the same last-frame flash on YouTube, and the tour's water travels the stage's own height (`--tour-depth`).
- Step 5 is a table: one row per place (Home, Watch pages, Shorts, Search), YouTube's way struck through, drip's way in bold with a short note, and a last row for what stays the same. Every row shares one grid, so the columns line up, and each cell is one line at full width. Below 600px wide the place and YouTube's way share a line and drip's way goes under. The five sentences it replaced were "hard to digest it all a little bit and seems a little off" (Jesse, 2026-10-12). Jesse picked it in two rounds of design variants: round 1 was A (this table), B (one change at a time behind tabs), and C and D (written by Codex: a drawn watch page, and one big statement with grouped notes); round 2 was A tightened (E, picked), arrows (F), and two tinted panels (G). The copy says the same facts as the five sentences. Only "Suggestions, end screen, autoplay" became "Suggestions, autoplay", with "No end screen" moved to the note.
- The page follows Chrome's light or dark theme and sets YouTube's theme variables itself, so drip.css draws the same colors it does on YouTube.

Home page as built (2026-10-10). Built from the mockups in `drip-page-demos/`. Where they were silent Claude made the call below, and every one is open to Jesse's review:

- Colors and sizes are CSS custom properties at the top of the home block in `drip.css`, so tuning is mostly editing those. Dark or light comes from YouTube's `html[dark]`.
- Icons live in `src/icons/` and draw as CSS masks filled with the text color, so one SVG serves every background. That's why the manifest lists them as web accessible to youtube.com. The clock, chevron, and × are new files in the same folder. The glass is `src/lib/glass.js`, one SVG built from `cup-icons/` with the water level set from minutes left over minutes bought today. It glides between levels.
- The feed source (Q5) isn't on the home page. It's "Reveal from" in Settings for now (Jesse, 2026-10-10).
- Stashed on the card is a slightly lighter gray button with the label "Stashed". Clicking it again takes the video back out of the stash.
- When something runs out, a gray line under the buttons says what and when it comes back: "No cards left. More at 4:00am.", "No drops left. …", or "You're out for today. Drops and cards refill at 4:00am." The spent buttons go gray. This is a placeholder. Jesse wants running out to feel like a good place to stop, not a sad dead end, so it needs its own design, like the lock screen's "Done for now" (2026-10-10).
- Loading: a reveal from the empty page shows the card's shape right away with title bars, and "Finding a video…" or "Checking your subscriptions…", while the dealt card waits in the box (see "Reveal animation as built"). After 5 seconds it reads "Still looking…", or "Still checking. Subscriptions can take 15 seconds." (Jesse found the wait silent, 2026-10-12). Reveal next dims the buttons and reads "Revealing…" until the new card is up. With reduced motion, the box shimmers instead, Reveal next dims the old card, and a new card rises in over 260ms. Rebuilds for Save and the like don't replay any of it.
- Watch at 0 minutes with no drops left still goes to the video, so the lock screen's "I need this one" stays in reach.
- The thumbnail is `hq720.jpg`, falling back to `hqdefault.jpg` when YouTube has none. Clicking it is Watch.
- Durations of a whole number of hours read "2h", not "2h 0m".
- The column is 400px. Below about 450px of room the gaps and button padding shrink, and below about 370px Save shows only its icon. Container queries measure the column, not the window, so YouTube's open guide counts too.
- `dev/home.html` runs the real home page outside YouTube, with the real worker on fake storage and a fake grid, in any of a dozen states, light or dark. `dev/home-sizes.html` shows it at several widths at once. See the comment at the top of each.
- Not built yet: the "+2 saved from yesterday" note. The reveal animation came in a later pass (2026-10-12, below).

Reveal animation as built (2026-10-12). Jesse picked it in two rounds of design variants. Round 1 was A (a drop falls into the card's box, rings while it loads, the picture opens from the center), B (his idea from 2026-10-07 in "Ideas"), and C (a face-down card dealt from the counter that flips over). C won "because it really shows a card being used", and he liked B's buttons. Round 2 combined them: D (C's card in B's opening page, with B's goo), E (the gold Reveal button itself becomes the card), and F (D without the goo). D won. The code is `src/content/reveal.js`, shared by the home page and the welcome tour.

- Reveal video: the page opens to make the card's room. The stats lift 16px and the buttons ride down as the space grows. A face-down card leaves the card counter, turns from portrait to landscape, and is dealt into the box, and the count drops by one as it goes. On the way down, +15m shrinks to a bead against Reveal video and Stash grows back out of it, Reveal video turns gray as Reveal next, and × pinches off its end, through an SVG goo filter. Stash folds as the space opens.
- The card waits face down with a gold sheen until the video is found and its thumbnail loads (8 seconds at most, then it turns over onto the gray front). Then it flips, and the title and meta row fade in. The sheen runs on the page's clock, so moving the card into the real card's box doesn't restart it, and it fades out as the card turns rather than stopping mid-sweep (Jesse saw it "reset" a few times, 2026-10-12).
- Reveal next: the old card turns face down and is tossed aside, and the next is dealt 300ms in, while the old one is still going. About 1.5 seconds to working buttons, down from 2.1 when the deal waited for the toss.
- Pass: the card turns face down and drops away, then the opening runs backwards: the space closes, the buttons merge back into +15m and the gold Reveal video, and Stash opens in step. The space's 16px of padding closes with its height, or the buttons jumped 16px at the end (Jesse, 2026-10-12).
- A reveal that finds nothing spent nothing, so the card flies back to the counter, the count goes back up, and the page closes as for Pass, with the usual message.
- On a fast Home feed, the buttons work about 1.2 seconds after the click. The buttons can't be clicked while they're moving, so a fast double click can't spend a second card.
- Keyboard focus that was on drip's page goes to Watch after a reveal, stays on Reveal next, and returns to Reveal video after Pass, since the button that had it is gone.
- The page doesn't redraw while the animation runs, and redraws once at the end. Its last frame looks the same as that redraw: the thumbnail's box (and the card in it) is kept across redraws, and with a card up the page keeps the stats lifted (`.drip-page.is-open`).
- With reduced motion, none of it runs, and the page swaps as before.
- The two gray title bars while loading were 9px taller than a two-line title, so the card shrank when the real one arrived. They're held to two lines now.

The glass's motion as built (2026-10-12). Jesse picked B, "Drop", from one round of design variants: "all around B is the best option". The others were A, "Pour" (a stream into the glass, and a trickle down the window at 0), and C, "Slosh" (nothing flies, the glass dips and the water sloshes, and the lock comes in as a sloped wave). Water moves one drop at a time and lands with a ring. The code is `src/content/pour.js`, shared by the home page, the watch page, and the welcome tour.

- +15m on the home page: a drop leaves the drop counter, arcs over the glass, and falls in. A ring spreads on the water, two droplets splash, and the water bobs up past its new level and settles. The drop count goes down as the drop leaves, and the minutes change as it lands, about 0.6 seconds in. The water bobs over 0.7 seconds after that.
- When +15m fills the glass to full, which the day's first drop always does, the water rises to the rim without a jump. glass.js puts a full glass's waterline well above where just under full sits. The surface you see through the rim fades in as the water arrives.
- When the pill hits 0 with its glass in view: the last of the water gathers under the glass as a drop, hangs, falls to the bottom of the window, and splashes with two rings. The lock's water rises from that spot. It pools there and spreads as it climbs, instead of rising evenly. The video is paused through the 0.8 seconds the drop takes. Arriving on a watch page with no minutes left, a hidden tab, fullscreen, or a pill hidden with YouTube's controls skips the drop, and the lock rises as before.
- +15m on the lock: the drop in the button's price falls out, past the panel, into the water with a ring. The water drains once it lands, and the pill's glass bobs up from empty as the water clears it.
- With reduced motion, none of it runs. The level glides as before.
- "A new day" (IDEAS.md) was dropped from this round: the reset sets minutes to 0 (`rollDay`), so the glass has nothing to fill. The day's new drops and cards land in the counters instead (see "The counter's motion as built").

The counter's motion as built (2026-10-13). Jesse picked it in three rounds of design variants. Counter round 1 was A, "Rain" (drops fall from the top of the window, odometer counts), B, "Left behind" (beads the lock's water leaves run into the counter), and C, "Thrown in" (drops arc out of the message line, slot-machine counts). Before picking, he wanted a better "Kept 3 drops." than the gray line, "Like a temporary thing". Of three kept visuals, A (a tag beside the counter) won, then D of its versions, a gray tag, without its small point: "Yeah I like D without the point." Counter round 2 rebuilt round 1 around that tag: D (rain, then the tag), E (beads, then the tag), and F (the tag hands its drops over). D won: "I like D for pretty much everything", with C's spinning count for the new day's cards. The code is `src/content/counter.js`, shared by the home page, the reveal animation, and the welcome tour.

- A count that changes by one rolls like an odometer: up when it grows, down when something is spent. +15m's drop count rolls down as the drop leaves, and Reveal's card count as the card is dealt. A count that jumps spins through the numbers between, 10 at most and evenly spaced, so 600 to 700 takes as long as 8 to 18 (about 0.65 seconds).
- After Done for now, the counter shows the drops without the kept ones until the lock's water starts falling. 250ms later they fall from the top of the window into the drop counter one at a time, 320ms apart, each with a ring and a splash, and the count rolls up as each lands. Then a gray tag slides out beside the counter, "3 kept", stays 3 seconds, and slides back in. The count of kept drops still rides in `sessionStorage` (`drip-kept`).
- The first home page after the reset does the same with what the reset added, "4 new", 240ms apart. The cards follow, spinning up to their new count, with a "10 new" tag of their own, and both tags go together. The reset records what it added in `state.refill`, and the page that shows it sends `refillSeen`, so it plays once, in one tab. A count already at the cap gets nothing and no tag. Nothing at all lands when neither count changed.
- At most 5 drops fall. With more to add, each carries its share and the count spins up by it, so 336 kept drops take as long as 5.
- The tag is drip's gray chip with the counter's own icon, the only color in it, and normal text. It sits outside the stats' layout, so it moves nothing. Screen readers hear "Kept 3 drops." or "4 new drops."
- The stats are centered as a group, so anything that changed their width moved everything (Jesse saw it on 8 to 18 cards, 2026-10-13). The counts keep room for as many digits as the settings' largest count allows (per day times days kept), so they never change width. Minutes that get wider, like "49m" to "1h 4m", still move the group, so it glides there over 0.4 seconds instead of jumping. Reserving the minutes' room would have left a gap beside the time most of the day.
- Checked in the mockups and `dev/home.html` (scenarios `kept`, `refill`, `refillMax`, `refillCapped`, and `reduced=1`) at every edge the settings allow (0 kept, 1, 336, a capped day, 99 to 100, spending to 0) at 1000px and 388px wide. In a column under 452px the tag sits closer and pads less, so "336 kept" fits beside three-digit counts.
- With reduced motion, the counts change at once, and the tags appear for 3 seconds and go, without sliding.

Lock screen and pill as built (2026-10-10, step 3). Built from the lock mockups and the rules above. Claude's calls, open to Jesse's review:

- The lock and the pill share the home page's color tokens and button styles (`drip.css`, the block on `#drip-home, #drip-lock, #drip-pill`), and `icon()` and `price()` moved to `common.js`.
- The blur and blue tint cover the whole window, not only the frame: `backdrop-filter` on the overlay. Dark mode is a deep blue at 60%, light mode a pale blue at 45%.
- "Done for now" shimmers every 5 seconds. On the white button in dark mode the sweep is pale blue, since white on white wouldn't show.
- Hovering or keyboard focus on "Done for now" sends a thin blue ring out around the button every 1.4 seconds. Each one keeps the pill shape and fades 8px out.
- Clicking it sends a splash and two rings out through the panel from where it was pressed. Meanwhile YouTube goes home inside the page, the way its logo does, so the lock stays up. The paused video behind the water fades out over 0.4 seconds instead of vanishing. While YouTube is still fetching its home page, a slower, fainter ring goes out every 0.8 seconds (Jesse found faster ones jarring, 2026-10-11). On air that fetch took 1.2 to 1.4 seconds (2026-10-11), so click to home takes about 2.5 seconds. After at least 0.7 seconds, once drip's home page is there, the water falls away top first over 1 second, the way it rose, while the panel lifts and fades. The kept drops land in the counter under it. If home isn't there after 4 seconds, the water falls anyway. If YouTube's logo is missing or its navigation hasn't started within 1.5 seconds, drip loads the home page the old way. Back to the watch page before the water is gone cancels it, and the lock comes back. Reduced motion skips the rings and the fall.
- Jesse picked this from design round 2 on 2026-10-11, as D: the shimmer as built, the hover rings of round 1's A kept closer and slower, and the click of round 1's C. It replaced a hover tide, a small ripple, and a full page load after 520ms, which together felt "a little like patchwork of animations".
- The kept count rides from the lock to the home page in `sessionStorage` (`drip-kept`), read once, so it needs no state field. The drops land in the counter as the water falls (see "The counter's motion as built").
- "I need this one" opens a plain textarea with Cancel and a gray "Unlock this video" button with the lock icon. No animation, as the spec says.
- The watched line reads "0m watched today" on a day with nothing watched yet. `watchedSummary(state)` in state.js supplies it.
- The pill shows the glass at 20px, the compact minutes, and Stash with a lucide outline bookmark that becomes the filled cartoon one once stashed (`src/icons/save-outline.svg` is new). Stashed can be clicked to take the video back out, like the home card. The proposals "Unlocked" (gray, no glass) and "Ad, not counted" are built as written, pending Jesse.
- The pill sits inside the player's top right and hides along with YouTube's controls, so it shows in fullscreen too. Jesse picked it from three drafts (2026-10-10); the others were a corner of the window and a bottom center bar that faded. In theater mode it sits in the dark band beside the video. Clicks on it don't reach the player.
- Paused, the pill reads "14m · paused" in gray, so it's clear the minutes aren't draining (Jesse's idea, 2026-10-10).
- In the last 2 minutes the pill stays up while YouTube's controls hide, and a slow blue shimmer crosses it every 4 seconds while the video plays. No red (Jesse's idea, 2026-10-10).
- Running out no longer cuts straight to the panel. Blue water rises up the window over 1.1 seconds with a wavy crest, blurring the frame as it climbs, and the panel surfaces once it's most of the way up. Buying minutes or an unlock drains the water back down in 0.6 seconds. The water is a mask on `#drip-lock` itself, because its `view-transition-name` keeps a child's `backdrop-filter` from seeing the page (Jesse asked for a smoother way into the lock, 2026-10-10).

- Under the lock's water, faint bubbles drift up at random sizes and speeds, and two small fish cross now and then, one every minute or so, at different depths and directions. The overlay's mask covers them, so they only show where the water has risen. Reduced motion hides them (Jesse asked for something underwater, 2026-10-10).
- More motion ideas are in IDEAS.md, "Motion and small touches".

Popup and Settings as built (2026-10-11, step 4). Built from `popup.png`, `settings.png`, and the rules above. Claude's calls, open to Jesse's review:

- The popup, Settings, and the welcome page share `src/pages.css`, whose color tokens match drip.css's and follow Chrome's light or dark theme. `src/pages.js` has `h()`, `icon()`, and `hourLabel()` for these pages.
- "Open YouTube" brings forward an open YouTube tab, this window's first, then the most recently used, or opens a new one. drip can't read tab URLs without a host permission, and the store listing says it has none, so the popup asks every tab and only YouTube tabs with drip running answer (`drip-ping` in common.js). Adding `host_permissions` would make it a plain query, at the cost of that claim.
- "Reveal from" (Home feed or Subscriptions) sits in Your allowance, right under Cards per day, since the mockup has no place for it.
- The steppers are ARIA spinbuttons: arrow keys step, Home and End jump to the ends, and Tab skips the − and + buttons. Minutes per drop steps by 1 up to 5, then by 5, so 15 to 30 is three clicks.
- Edits wait for Save. Until then the line beside Save reads "Not saved yet."; after it, "Saved." and the waiting count. The chip's Undo applies at once and keeps other unsaved edits. The chip's tooltip has the full date the change starts.
- A change from another tab, or the day reset, redraws the form without losing an edit in progress.
- History is under a "Watch time" title, as in the mockup. The chart's scale steps through 30m, 1h, 2h, 3h, 4h, 6h, 8h, 12h, 16h, and 24h, taking the first at or above the tallest bar and last week's average. A day with nothing watched shows a 2px sliver. Days before the log's oldest entry don't count toward an average and can't be picked, so the first week after install isn't dragged down by days drip wasn't there. Clicking a bar picks that day for the block below it, marked by an underlined letter and a soft column; a past week starts on its Saturday. On weeks before this one, the comparison reads "from the week before".
- The unlocks tile's active look at 1 or more is the lock and number in full text color instead of dimmed.
- "Why you needed one" lists every reason in the 90-day log, newest first. Each title opens the video in a new tab.
- Sample data, for testing (Jesse asked, 2026-10-11): while developer mode is on, Settings' Developer mode section has "Show Settings with", a picker of profiles from `src/devpanel/profiles.js`. A profile replaces the real state on that page only. Save and Undo run the real rules on it there and never reach the worker, and a banner says nothing is saved. The choice is in the URL (`?sample=heavy`), so a reload keeps it. The profiles: a typical month, just installed, heavy use with settings at their maximums, strict settings with every change waiting, and gaps and exact edges (a mid-week install, an empty week, averages that tie). The store build leaves the file out with the rest of `src/devpanel`.

Ideas, not decided:
- The reveal opens the page: the stats slide up and the buttons slide down to make the card's space, a drop falls into it, and the thumbnail surfaces from the ripple. Reveal video stays the same button and moves down to become Reveal next. +15 min shrinks to a bead and Save and × bud out of it, like droplets splitting (a "gooey" SVG filter). Jesse's idea, 2026-10-07. Built in part, with a dealt card instead of the drop and ripple (see "Reveal animation as built").
- A quiet note at rollover like "+2 saved from yesterday", to reward tokens not spent.
- The drop, in the same style, as the toolbar icon and store tile.

Jesse's mockups are in `drip-page-demos/` (2026-10-10): `home-no-thumbnail.png` (the empty page with Saved open), `home-open-thumbnail.png` (a reveal card up, Saved collapsed), `lock-screen-with-time.png` ("Time for a breather." with +15 min), `lock-screen-no-time.png` ("You've had your fill."), `popup.png`, and `settings.png` (Settings with History and the unlock reasons). They set the pattern, not a pixel spec. Screens and states they don't show follow the same look with common sense. Where a mockup and this file disagree, this file wins: the mockups still say "34 min" and "1 h 15 min", and the compact format replaces those.

Not mocked, so Claude drafts them from these rules when building starts, and Jesse reviews: the watch page pill, the welcome page, the saved state on the card, loading, a failed reveal, out of cards, out of everything, the page inside YouTube's top bar, and light mode.

## v1 and step 2 (both done)

v1 has the home page replacement, tokens, reveals, backlog, the watch clock with its overlay, settings with the next-day rule, and the popup.

Step 2 adds the sidebar, end screens, autoplay, Shorts, search shelves with the 10-result cap and Save buttons, replacing the subscriptions and Explore pages, and the subscriptions feed source.

## How it fits together

- When YouTube's markup changes, drip fails open (Q25). `watchFor` in common.js reports a break when a key selector matches nothing for 10 seconds on its page: the player (watch.js), the home page (home.js), and search results (search.js). A Reveal that finds no grid items at all reports the grid. The report is a banner with Copy details and Send report, which opens an email to `REPORT_EMAIL` (common.js), `apps@jesselind.com`, in the user's own mail app, so they see what's sent (Jesse, 2026-10-06). A missing player also drops the lock, since the lock would cover a page drip can't control. On air, `bin/check-youtube` runs weekly from launchd and posts to `#drip-alerts` on Discord: the failure when a selector stops matching, or one line when all is well, so a week with no post means the check stopped running.
- `src/content/early.js` guards the main player's first play at document start using stored time and unlocks; `watch.js` owns the overlay, clock, and grace.
- `src/lib/state.js` holds all the rules as pure functions over a plain state object. It's a classic script that sets `globalThis.Drip`, so the service worker (`importScripts`), extension pages (`<script>`), content scripts (manifest list), and Node tests (`require`) all load the same file.
- `src/background.js` is the only writer. Everything else sends it a message. It runs messages one at a time through a promise queue, so two tabs can't overwrite each other. It saves only when a message changed the state, because every save wakes the storage listeners in every YouTube tab. If a save fails, it puts the charge marker back, so the tab's resent time is charged.
- Every message starts with `rollDay(state, now)`, so the day resets lazily. A laptop asleep at 4am still resets correctly on the next read.
- `src/content/` replaces the home page and runs the watch clock. `src/lib/glass.js` draws the glass for the home page, the pill, and the popup. `comments.js` adds the "Show comments" button, and the CSS that hides comments is in `early.css`. `src/popup/` and `src/options/` are extension pages.

### Feed source

The "Reveal from" field in Settings writes `settings.feedSource` through `updateSettings`, which applies it at once because a feed change never loosens a limit. The home page has no control for it (Jesse, 2026-10-10). With the feed source set to subscriptions, a reveal loads `/feed/subscriptions` in a hidden same-origin frame on the token page and reads its grid with the same selectors as the home grid. YouTube only fills a feed that's in view, so the frame sits on screen at opacity 0. Nothing new from the feed gives `pool-empty` and spends no token. The first version was tested on air only against the home feed, because air's account has no subscriptions.

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
  watchSecondsBought: 0,    // minutes bought today, in seconds. The glass is full at this.
  current: null | Video,    // revealed and not yet resolved
  backlog: Video[],         // newest last
  seen: string[],           // video ids ever revealed, oldest first, max 2000
  unlocked: string[],       // video ids unlocked by "I need this" today
  log: { [day]: LogDay },
  refill: null | { day, watch, rec },  // what the last reset added, until a home page shows it
}
Video  = { id, title, channel, length }   // length is a display string like "14:02", may be ''
LogDay = { watchedSec, watchSpent, recSpent, saved, passed, watched, needThis: [{ videoId, title, reason, at }] }
```

### Functions

- `DEFAULT_SETTINGS`, frozen.
- `dayKey(now, resetHour)` returns the logical day. Times before `resetHour` belong to the previous date. 03:59 on 2026-10-05 with resetHour 4 is `'2026-10-04'`.
- `addDays(day, n)` and `daysBetween(a, b)` do date math on `YYYY-MM-DD` strings in UTC, so DST can't shift them.
- `initialState(now)` returns a fresh state with default settings, full daily tokens, 0 seconds, and empty lists.
- `hydrate(raw, now)` takes whatever came out of storage (possibly `undefined` or missing keys) and returns a complete state. Missing settings get defaults. `undefined` gives `initialState(now)`. A missing `watchSecondsBought` becomes `watchSecondsLeft`, so state from before the glass shows full. A `refill` without a day string becomes `null`.
- `rollDay(state, now)`. If `dayKey(now, settings.resetHour)` is later than `state.day`, it applies `pending` if its `effectiveDay` is on or before the new day, then adds `perDay * elapsedDays` to each balance capped at `perDay * rolloverDays`, sets `watchSecondsLeft` and `watchSecondsBought` to 0, clears `unlocked`, sets `day`, records what it added in `refill` (`null` when it added nothing), and removes log days older than 89 days before the new day. If the new day isn't later, it does nothing. It never moves `day` backwards. Returns `true` if it rolled.
- `logDay(state)` returns `state.log[state.day]`, creating it with zeros.
- `spendWatch(state)` takes one watch token and adds `minutesPerToken * 60` seconds to both `watchSecondsLeft` and `watchSecondsBought`. Error `'no-watch-tokens'`.
- `buyIfOut(state, videoId)` calls `spendWatch` when no minutes are left and the video isn't unlocked. Returns `{ ok: true, bought }`, and `bought` is false when there were minutes, or no tokens to buy them with.
- `reveal(state, candidates)` takes the first candidate whose id isn't in `seen` or the backlog, takes one rec token, sets `current`, and pushes the id to `seen` (dropping the oldest past 2000). Errors, checked in order: `'resolve-current'` if `current` is set, `'no-rec-tokens'`, `'pool-empty'` if no candidate qualifies. An error spends nothing. Returns `{ ok: true, video }`.
- `resolveCurrent(state, action, videoId?)` with action `'watch'`, `'save'`, `'unsave'`, or `'pass'` (Q13). Save adds the card to the backlog and counts `saved` once. Unsave takes it back out and uncounts it. Both keep the card up. Watch calls `buyIfOut` first (Q18), counts `watched` (taking a saved card out of `saved`), and returns `{ ok: true, video, bought }`. Pass counts `passed`, unless the card was saved. Watch and pass clear `current`. The others return `{ ok: true, video }`. Errors, in order: `'no-current'`, `'bad-action'`, and `'stale-card'` when `videoId` is given and isn't the current card's, because another tab moved on.
- `revealNext(state, videoId, candidates)` passes the card the way `resolveCurrent` does and reveals the next, as one step. It checks first and changes nothing on an error, so the card stays up. Errors, in order: `'no-current'`, `'stale-card'`, `'no-rec-tokens'`, `'pool-empty'`. Returns what `reveal` returns.
- `cleanVideo(raw)` returns a `Video` with string fields, or `null` when the id isn't 1 to 64 letters, digits, `_`, or `-`. `hydrate`, `reveal`, and `addBacklog` all pass videos through it.
- `addBacklog(state, video, index?)` adds the video unless its id is already there (then still `ok`). It goes at the end, the newest place, or at `index` (clamped), which is how Undo puts a removed row back. Error `'bad-video'`. `removeBacklog(state, id)` removes it. Neither touches tokens. When the video is the card showing now, adding it counts `saved` and removing it uncounts it, so the card's Save button and the Saved list can't count it twice.
- `charge(state, seconds, videoId)` adds `seconds` to the log's `watchedSec`. Unless `videoId` is unlocked, it subtracts from `watchSecondsLeft`, never below 0. Returns `watchStatus`.
- `chargeTick(state, clock, now, seconds, videoId, agoMs = 0)` moves `now` back by `agoMs` (clamped to an hour), then clamps seconds to 0..3600. Zero ticks return `watchStatus` without touching the clock. Unlocked videos log those seconds and return `watchStatus` without touching the clock. Paid ticks clear a marker later than `now`, advance `clock.lastChargeEnd` to `now`, and return `charge` for only the interval after the previous end.
- `watchStatus(state, videoId)` returns `{ secondsLeft, unlocked, locked }`, where `locked` means 0 seconds left and the video isn't unlocked.
- `needThis(state, videoId, title, reason, now)` unlocks the video for today and logs the reason. Errors, in order: `'reason-required'` if the trimmed reason is under 3 characters, `'need-this-limit'` if `unlocked.length >= needThisPerDay`. Unlocking a video that's already unlocked is `ok` and doesn't count again.
- `cleanSettings(changes)` returns only known keys with valid values. Integers get rounded and clamped to their range, `graceMode` becomes a boolean, `feedSource` must be one of the two values or is dropped.
- `isLoosening(key, from, to)`. The numeric keys loosen when they go up. `graceMode` loosens going from false to true. Any change to `resetHour` counts as loosening. `feedSource` never does.
- `updateSettings(state, changes)` cleans the changes, then for each key that differs from the current value it either applies it now (tightening or neutral) or puts it in `pending` with `effectiveDay = addDays(state.day, 1)`. Applying a key now removes any pending value for that key. Setting a key back to its current value removes its pending value too. An empty `pending.changes` becomes `null`. Balances above the new cap (`perDay * rolloverDays`) drop to it at once. Returns `{ ok: true, applied: {...}, pending: {...} }` listing just what this call did.
- `cancelPending(state, key)` drops one pending key.
- `refillSeen(state)` clears `refill` once a home page has shown it, so no other tab shows it again.
- `formatMinutes(seconds)` returns compact time: `'1h 42m'`, `'42m'`, `'2h'`, `'<1m'` for 1 to 59 seconds, or `'0m'`.
- `weekView(state, back = 0)` returns one week for Settings' History card, `back` weeks before this one: `{ start, end, days, average, lastAverage, hasEarlier, hasLater }`. Weeks start on Sunday. Each day is `{ day, watchedSec, today, future, counted }`, and only counted days (on or after the log's oldest day, and not after today) go into `average`. `lastAverage` is the week before's, or `null` when it has no counted days. `hasEarlier` stops at the week holding the log's oldest day.
- `cardsLine(logDay)` returns the line under History's tiles, like `'Of 5 cards, 2 saved and 3 passed.'`, dropping zero parts, or `''` with no cards.
- `watchedSummary(state)` returns `{ today, lastWeek, weekday }` for the lock screen: seconds watched today, seconds on the same weekday a week back (`null` when the log has no entry for it), and today's weekday name.
- `redirectTarget(href)` returns where a top-level YouTube URL should go instead, or `''`. Shorts and embeds become watch pages, the feeds in Q16 and `/tv` go to the token page, and `m.youtube.com` moves to `www`. redirect.js applies it, but only in the top frame, so embeds on other sites stay free (Q7).
- `earlyLocked(raw, now, videoId)` decides, from raw storage, whether a loading watch page holds its video: no state, a day that has rolled over, or 0 seconds without an unlock today. Grace mode doesn't count, because nothing is playing yet. early.js also skips the video watch.js marks with `data-drip-grace` on `<html>`.
- `devAction(state, action, now)` is test tooling, not a feature. It backs the dev panel (`src/devpanel/`), a floating box on YouTube pages that shows state and has buttons for minutes, tokens, "Run reset now" (moves `day` and any pending `effectiveDay` back one day, so the next message rolls over as a real reset would), applying pending settings, toggling grace now, clearing lists, and starting fresh. The panel shows while Developer mode is on in Settings (storage key `dripDev`, written by the worker on `setDevMode`) or the checkout has `dev/ENABLED`, and the worker refuses `devAction` otherwise. `bin/build-release` leaves the panel out, and a build without it hides the toggle and refuses `setDevMode`. Error `'unknown-dev-action'`.

## Storage

One key, `drip`, in `chrome.storage.local`, holding the state object.
