# Store images hill climb

Jesse's goal (2026-11-09): every store image scores at least 9 for design and at most 2 for "AI look" from both judges. Each round: change the frames, recapture, have both judges score, show Jesse the table and a short summary, and wait for his OK before the next round.

## The images

Six images are scored: `store/images/screenshot-1.png` to `-5.png` (1280x800) and `tile-c.png` (440x280). Jesse's picks: tile c, and the drawn ridge thumbnail on screenshot 1 (`store/art/thumbs/store-trail.svg`). Tiles a and b stay in the folder but aren't scored any more.

- `store/art/frames.html` draws each frame: `?shot=1` to `5`, `?tile=c`. The `SHOTS` table holds each caption, subline, harness URL, iframe size, offset, scale, CSS to inject, and an optional step.
- `store/art/capture.sh` serves the worktree on 127.0.0.1:8078, screenshots every frame with headless Chrome, checks sizes with `sips`, and fails if Chrome's network log shows any YouTube host.
- Harness additions: `dev/home.html?videos=store` (made-up videos from `store/art/videos.js`, local thumbnails) and `dev/page.html?sample=1` (two weeks of log, Dry hours on).
- `ART-PLAN.md` has the reasons behind the first set.

## Rules

- Only the frames change: `store/art/`, `store/images/`, and the harness files in `dev/`. Never `src/`, `test/`, or `DESIGN.md`. Another session has PRs 101 and 102 open in the worktrees `design-lock-lines` and `fade-failsafe`; don't touch them.
- No real YouTube thumbnails, channel names, or logos. capture.sh enforces the network part.
- Claims must match the product on `main`. Example: "the video stops" has to allow for the "Finish video when time runs out" setting and for limits being optional.
- Unslop rules apply to all captions.
- No uploading, publishing, or tagging. Those wait until PRs 101 and 102 are merged and Jesse says go.

## The judges

Both get the same prompt, `judge-prompt.md`, with `{ROUND_NOTES}` filled in (known drafts, for example). Neither sees earlier scores or the other judge's report, so they don't anchor on them.

- Codex, read-only, from a scratch folder:
  `codex exec --skip-git-repo-check -s read-only -o <dir>/report.md -i store/images/screenshot-1.png ... -i store/images/tile-c.png - < <dir>/prompt.md`
  Its model and effort come from `~/.codex/config.toml` (gpt-6.1-sol, high, as of 2026-11-09). Add a line to `~/codex-trial/log.md` per run.
- An independent Claude agent: a fresh `general-purpose` Agent, not a fork, given the filled prompt and the six image paths to Read. Tell it not to open anything under `store/art/` or `store/art/reviews/`, so it doesn't see earlier scores.
- Save both reports verbatim as `reviews/round-N-codex.md` and `reviews/round-N-claude.md`.
- Before acting on a fix, check it against the image and the code. Note any fix you reject and why in the round's row below.

## What to show Jesse each round

The table, then a summary of at most 5 lines: what changed, what moved, what the judges disagree on, and what's next. Then wait.

| Image | Codex design | Codex AI | Claude design | Claude AI |
|---|---|---|---|---|

## Rounds

### Round 0, 2026-11-09 (commit 1a08f6f)

Codex only; the Claude judge didn't run this round. Full report: `reviews/round-0-codex.md`. Its prompt also scored tiles a and b and named each caption.

| Image | Codex design | Codex AI |
|---|---|---|
| 1 Home | 7 | 3 |
| 2 Lock | 6 | 4 |
| 3 Modes | 7 | 3 |
| 4 Settings | 6 | 2 |
| 5 History | 6 | 3 |
| Tile a | 7 | 3 |
| Tile b | 7 | 2 |
| Tile c | 8 | 2 |

Codex's ranked fixes, which round 1 starts from:

1. Screenshot 2: say limits are optional ("Optional limits pause playback. A drop adds 15 minutes."), and recapture the lock after PR 101 merges. It says "0m watched today" now because the tour runs on a fresh state.
2. Screenshot 1: the card is about 400px wide in a 728px panel. Enlarge the home view, and cut the empty space above the counter.
3. Screenshots 4 and 5: end the crop on a complete section. 4 cuts at the Cards header, 5 at "WHY YOU NEEDED ONE". 5 sits flush with the panel's top.
4. Screenshot 5: the subline promises unlock reasons, but none is readable. Show one, or change the line.
5. Copy: the sublines on 1 and 4 run to three lines. "Pick how much drip does." is vague (Codex: "Choose how YouTube works."). "A search box alone" reads oddly.

Also from round 0:

- What raises the AI-look score: the dark gradient background, the rounded showcase panel, and the headline-left layout. Real UI detail and restrained copy lower it.
- Tile c: make the drop and wordmark group about 10% larger.
- Screenshot 2: make the water read as water, not a glow.
- Screenshot 3: the page's own "drip / Make every drop count." heading repeats the frame's mark. Consider cropping it off.
- Order: keep it if screenshot 2 says limits are optional, or else move the mode choice ahead of the lock.

### Round 1, 2026-11-09

PRs 101 and 102 merged, so main is merged into `store/art` and the lock is a real capture. Reports: `reviews/round-1-codex.md` and `reviews/round-1-claude.md`, prompt `reviews/round-1-prompt.md`.

| Image | Codex design | Codex AI | Claude design | Claude AI |
|---|---|---|---|---|
| 1 Home | 8 | 3 | 7 | 4 |
| 2 Lock | 7 | 2 | 5 | 4 |
| 3 Modes | 7 | 2 | 6 | 4 |
| 4 Settings | 7 | 2 | 6 | 5 |
| 5 History | 8 | 2 | 7 | 4 |
| Tile c | 8 | 1 | 5 | 5 |

What changed: flat navy background, and the panel runs off the right and bottom edges with no shadow. 1 at 1.25x with the space above the counter cut. 2 says limits are optional, shows "1h watched today", fills the panel with the tour's stage, and places the bubbles by hand. 3 drops the page's own heading and footer, with new caption copy. 4 ends after Watch time. 5 starts at the tabs, ends after the week's card, and its subline no longer promises unlock reasons. Tile c's group is 10% larger. capture.sh now shoots only tile c, and shot 2 with motion on.

Found while doing it:
- Headless Chrome doesn't advance animation time inside the iframe; every animation sits at 0ms. Shot 2 sets each one's time by hand.
- Stopping the water partway (currentTime on `tour-water-rise`) changed nothing visible. Not solved; both judges still say the water doesn't read as water.
- frames.html x and y are panel pixels, applied before the scale.

Fixes for round 2, checked against the images and code:
1. Lock font (Claude): real. The welcome page doesn't load Roboto, so the tour's lock falls back to Arial. On YouTube the lock is Roboto (`drip.css` line 15). Inject the Roboto stylesheet into the iframe for shot 2.
2. Shot 1 counters (Claude): 15 drops and 12 cards don't fit a 4-drop, 10-card day. Check the `saved` scenario in `dev/home.html` and pick numbers that do.
3. Shot 2 (both): the blue spark on "Done for now" (the orbit) and the clipped "ch" at the right edge. Hide the orbit, shift or crop the page under the lock. Make the water read as water: find why the rise's time had no effect. "a drop buys" becomes "a drop adds" (Codex: "buys" suggests payment).
4. Shot 4 (Codex): "Looser ones wait until tomorrow" ignores the first 24 hours that shot 3 shows. Qualify it. Both: "Set your own limits." is generic.
5. Shot 5 (both): orphan "went." and the card 13px from the bottom edge. Codex's "See your week." fixes both.
6. Shot 1 copy (Codex): name YouTube in the subline.
7. Content column: 4 starts at x=619, 5 at x=643. Use the same scale and x.

Rejected or deferred:
- Tile c (Claude): add a tagline or the card. Codex says the tile's simplicity is its strength, and Jesse picked it. Deferred to Jesse.
- Shot 1 "Stashed" pressed (Claude): that's the sample state of a saved video; changing it means a different scenario. Low impact, skip for now.
- Shot 3 crop to the three cards (Claude): Codex says keep all three with context. Kept.

### Round 2, 2026-11-09

Jesse: go with the judges' tile recommendations, and keep every demo for a look at the end. Each round's images are now in `rounds/round-N/` (round 0 pulled from `1a08f6f`). Tiles d (c with "One video at a time.") and e (c with the card) are new and scored; c is unchanged. Reports: `reviews/round-2-codex.md` and `reviews/round-2-claude.md`.

| Image | Codex design | Codex AI | Claude design | Claude AI |
|---|---|---|---|---|
| 1 Home | 8 | 2 | 7 | 4 |
| 2 Lock | 7 | 2 | 5 | 4 |
| 3 Modes | 7 | 3 | 6 | 4 |
| 4 Settings | 7 | 2 | 6 | 3 |
| 5 History | 8 | 2 | 7 | 4 |
| Tile c | 8 | 1 | 6 | 4 |
| Tile d | 7 | 2 | 7 | 4 |
| Tile e | 7 | 2 | 5 | 5 |

What changed: 1 names YouTube and shows 2 drops and 7 cards (`dev/home.html`, videos=store). 2 loads Roboto into the tour, hides the orbit spark and the pill under the water, says "adds", not "buys". 3 to 5 have new captions and crops; 4 is at 1.2x through Dry hours, 5 at 0.96x with a bottom margin.

Found: the tour sets `--tour-depth` inside a view transition, and headless Chrome reads 0px there, so the water rose from 0 and was always full. With the depth set by hand, stopping the rise partway worked, but the tour's player above the line is a plain gray box, so the crest read as a header bar. Rejected; the water stays all the way up.

Fixes for round 3, checked against the images:
1. Shot 2 (both): the panel ends at y=772 instead of bleeding off the bottom, a light line at the right edge near y=635, and a bubble clipped at the right edge. Claude: put the ride illustration from shot 1 in the tour's player under the lock, so it covers a video. That also gives the water something to sit over. Subline: "With one on" makes readers backtrack.
2. Shot 3 (both): the caption skips Curated. Claude: the subline repeats the panel.
3. One capture scale (both): History's text is smallest; 1's card is narrow. Claude: same left inset for 1, 3, 4, 5, and the tabs at the same height in 4 and 5.
4. Shot 4 (both): "drops" and "dry hours" go unexplained. Explain them in the subline; Claude says drop the panel's "drip" title.
5. Shot 5 (both): the subline reads like a feature list.
6. Shot 1 (both): say what a card does. Codex: "One card reveals one video."
7. Claude: the panel edge is lost against the frame navy at thumbnail size, and sublines are too dim.

Disagreements:
- Tiles: Codex keeps c and would drop d and e. Claude picks d with a tagline about 1.6x larger and the drop back at c's size, and drops e. Next: d2 with Claude's changes, keeping c, d, and e.
- Order: Codex wants 1, 3, 2, 4, 5 (modes before the lock). Claude says 1 then 2 tells the story. HILL-CLIMB round 0 said to keep the order if 2 says limits are optional, which it does. Kept.

### Round 3, 2026-11-09

Scored: screenshots 1 to 5, tiles c and d2 (d with a bigger, brighter line and the drop back at c's size). Tiles d and e stay in `store/images/` and `rounds/round-2/` but aren't scored any more; both judges said to drop e. Reports: `reviews/round-3-codex.md` and `reviews/round-3-claude.md`.

| Image | Codex design | Codex AI | Claude design | Claude AI |
|---|---|---|---|---|
| 1 Home | 8 | 3 | 8 | 3 |
| 2 Lock | 8 | 2 | 6 | 4 |
| 3 Modes | 7 | 3 | 7 | 3 |
| 4 Settings | 6 | 3 | 6 | 4 |
| 5 History | 8 | 2 | 7 | 4 |
| Tile c | 8 | 1 | 5 | 5 |
| Tile d2 | 7 | 2 | 6 | 4 |

What changed: lighter panel border and sublines. 1 at 1.4x, and the subline says what a card does. 2 has screenshot 1's ride in the paused player under the lock, bubbles kept inside the crop, and a reworded subline. 3 has a caption that covers all three modes. 4 and 5 share a scale (1.08x) and column; 5 shows the week's card alone. Copy on 4 explains drops and Dry hours.

Found: capture.sh shared one Chrome profile across shots, and that cut 23px off the bottom of shot 2's panel. Each shot now gets its own profile.

Fixes for round 4, checked against the images:
1. Shot 4 (both): "paid watching" reads as a paid tier. "drops and dry hours" is jargon in a headline. Crop tighter on Watch time and scale up; let "I need this one" fall off.
2. Shot 5 (both): the dashed line is last week's average, so "compare each day with the week before" is wrong. Claude: the card in a panel reads as a second template; scale up so it fills the panel.
3. Shot 1 (both): the button row sits about 30px off the bottom edge. Give it 50 to 60px.
4. Shot 2: Claude says the water and the video under it still don't read, and the bubbles in the top third look like dust. Codex wants a plainer headline and "a spare drop" (4 used, yet +15m is offered).
5. Shot 3 (Claude): "How strict should it be?" repeats the panel's "How much should drip do?".

Still split: tiles. Codex keeps c (8/1); Claude prefers d2 with the line 15 to 20% larger (c 5/5, d2 6/4).

### Round 4, 2026-11-09

Scored: screenshots 1 to 5, tiles c and d3 (larger wordmark and line than d2). Reports: `reviews/round-4-codex.md` and `reviews/round-4-claude.md`.

| Image | Codex design | Codex AI | Claude design | Claude AI |
|---|---|---|---|---|
| 1 Home | 8 | 3 | 7 | 4 |
| 2 Lock | 8 | 2 | 6 | 4 |
| 3 Modes | 7 | 3 | 7 | 4 |
| 4 Settings | 7 | 2 | 6 | 4 |
| 5 History | 8 | 2 | 7 | 4 |
| Tile c | 8 | 1 | 6 | 4 |
| Tile d3 | 7 | 2 | 7 | 4 |

What changed: copy on every frame (no "paid", plain headline on 4, 5's comparison), 1 at 1.35x with room under the buttons, the ride under the lock brightened, bubbles kept low, 4 at 1.25x from the tabs with the page title hidden, 5's card at 1.12x. Rejected: Claude's round 3 ask to raise History's minutes toward 1h30, since the default day is 4 drops of 15 minutes and screenshots 3 and 4 say so.

Plateau: the Claude judge has given AI look 3 to 5 on every screenshot for four rounds, and 4 on all seven images this round, whatever changed. Codex is at 1 to 3. Both name the same structure as the template signal: a headline on the left, the page in a panel on the right, one dark frame for all five. Crops and copy aren't moving that score.

Errors of mine the judges caught: 5's subline said "last week's average", but the chart shows last week against the week before's average. 3's "Switch any time" overclaims, since after day one a looser mode waits for the reset.

Open fixes if the frame stays: 3's headline, 4's "Each drop is 15 minutes" (the setting can change it), 5's subline, 1 "Spend a card to reveal the next video", the right-edge seam on 2, the gap under d3's wordmark. Claude also wants the drawn thumbnail reworked (uneven rain, a warmer light, a clearer rider) and "Stash" unpressed.

### Round 5, 2026-11-09: a new layout (v2)

Jesse, after round 4: free rein, the goal is both judges' numbers meeting the target, keep track along the way. So rounds now run back to back without waiting for an OK, each one logged here.

The frame in rounds 0 to 4 (`frames.html`, `store/images/`) stays as it is. Round 5 starts a second layout, `frames-v2.html`, captured with `capture.sh v2` into `store/images-v2/`: a paper background, a serif headline (Newsreader) at the top left, the real page as a full-height strip on the right with no rounded card, and one or two notes with leader lines to real elements. The judge prompt's description of the frame changes with it (`{FRAME}` in `judge-prompt.md`). Tiles: c (drop, wordmark, serif line) and p (drop and wordmark), both on paper. Reports: `reviews/round-5-codex.md`, `reviews/round-5-claude.md`.

| Image | Codex design | Codex AI | Claude design | Claude AI |
|---|---|---|---|---|
| 1 Home | 8 | 3 | 7 | 4 |
| 2 Lock | 8 | 2 | 6 | 4 |
| 3 Modes | 7 | 2 | 6 | 5 |
| 4 Settings | 6 | 2 | 7 | 4 |
| 5 History | 8 | 2 | 7 | 4 |
| Tile c | 8 | 1 | 6 | 5 |
| Tile p | 7 | 1 | 5 | 6 |

Codex's AI look dropped to 2 or less on everything but 1. Claude's didn't move. Real catches: 1's note line crossed the Stashed pill; "a single video you chose to see" is wrong (you choose to reveal); the notes on 3 and 5 repeated text already on screen; Saturday in the History sample had an unlock with only 2 of 4 drops spent, which the lock can't produce.

Round 6 changes: the judge prompt now asks, for any image below 9 or above 2, what would get it there. The Saturday unlock moves to Friday, a full day, in `dev/page.html`'s sample. Notes rewritten so they add what the page doesn't say. Tried again to stop the water partway: the paused player sits behind the lock's panel, so a crest high enough to clear the panel has only gray above it. Full water it is.

### Round 6, 2026-11-09 (v2)

Reports: `reviews/round-6-codex.md`, `reviews/round-6-claude.md`. The prompt now asks each judge what would get an image to 9 and 2.

| Image | Codex design | Codex AI | Claude design | Claude AI |
|---|---|---|---|---|
| 1 Home | 8 | 2 | 7 | 3 |
| 2 Lock | 8 | 2 | 6 | 4 |
| 3 Modes | 8 | 2 | 7 | 3 |
| 4 Settings | 7 | 2 | 7 | 3 |
| 5 History | 8 | 2 | 7 | 3 |
| Tile c | 9 | 1 | 6 | 4 |
| Tile p | 8 | 1 | 5 | 4 |

Codex: AI look met on every image, tile c meets both targets. Claude: AI look moved from 4 to 3 on four screenshots, the first movement in six rounds.

Round 7 changes, from both reports: the drawn thumbnail redrawn (a lumpy storm instead of ovals, uneven rain, the rider on the crest against a break of light; Codex said the rider vanished and the ovals read as stock); the channel "Trail Days" (a real festival, Claude) is now "Wet Gravel Club"; screenshot 1 shows Stash unpressed (the `card` scenario); notes at 20px; no payment words ("buys", "cost"); the lock's paused player enlarged under the water so the strip has no dark band at its edge; a fixed subline line; crops centered. Each round's images go to `rounds/round-N/` from the judges' copies, which are exactly what was scored.

### Round 7, 2026-11-09 (v2)

Reports: `reviews/round-7-codex.md`, `reviews/round-7-claude.md`.

| Image | Codex design | Codex AI | Claude design | Claude AI |
|---|---|---|---|---|
| 1 Home | 8 | 2 | 7 | 4 |
| 2 Lock | 8 | 2 | 7 | 3 |
| 3 Modes | 8 | 2 | 7 | 4 |
| 4 Settings | 7 | 2 | 6 | 4 |
| 5 History | 8 | 2 | 6 | 4 |
| Tile c | 8 | 1 | 6 | 4 |
| Tile p | 9 | 1 | 4 | 5 |

Noise: the Claude judge gave 3 on four screenshots in round 6 and 4 on the same frames, barely changed, in round 7. One run per round is noisy by about a point, so a single round's dip or gain doesn't mean much on its own.

Round 8 changes: every leader runs level from the middle of its note; notes are placed top to bottom by target; the drip mark moves to the top so notes can sit by low targets; the tour's coach ring and Done's rings are hidden, and focus is cleared so no control looks pressed; bigger bubbles plus a note explaining the water; 4 shows all of Watch time under "Easy to tighten. Slow to loosen."; 5's card fills the strip edge to edge; tile c2 (larger, tagline on two lines). v2 now captures at 2x and scales down with `sips`, since Codex found the lock's text soft; `has-notes.py` retries a 2x capture whose page wasn't ready in time (it happened about one shot in four).

### Round 8, 2026-11-09 (v2)

Reports: `reviews/round-8-codex.md`, `reviews/round-8-claude.md`.

| Image | Codex design | Codex AI | Claude design | Claude AI |
|---|---|---|---|---|
| 1 Home | 8 | 2 | 7 | 3 |
| 2 Lock | 8 | 2 | 7 | 3 |
| 3 Modes | 8 | 1 | 6 | 3 |
| 4 Settings | 7 | 1 | 7 | 3 |
| 5 History | 8 | 1 | 7 | 3 |
| Tile c | 8 | 1 | 6 | 4 |
| Tile c2 | 9 | 1 | 7 | 3 |

Tile c2 meets the target with Codex. Claude: 3 on every screenshot. Its reason this time: the cream, serif, and blue-leader look is now a common "tasteful default", and nothing in the frame is drip's own except the strip.

Round 9 changes, aimed at that: a legend on screenshot 1 with drip's real drop and card icons ("A drop is 15 minutes of watching. A card reveals one new video."); screenshot 4's sample raises drops from 4 to 5 after day one (`dev/page.html` `&pending=1`), so the page shows its own "4 drops until 4:00am · Undo" chip under "Easy to tighten. Slow to loosen."; Saturday's sample uses 5 cards, not 7, so it doesn't mirror screenshot 1's counter; History ends above its summary line, with the strip in the card's gray; the lock keeps two notes; new headlines on 3 ("Choose how strict.") and 5 ("Where your hour went.").

### Round 9, 2026-11-09 (v2)

Reports: `reviews/round-9-codex.md`, `reviews/round-9-claude.md`.

| Image | Codex design | Codex AI | Claude design | Claude AI |
|---|---|---|---|---|
| 1 Home | 8 | 2 | 8 | 3 |
| 2 Lock | 8 | 2 | 7 | 4 |
| 3 Modes | 8 | 1 | 7 | 3 |
| 4 Settings | 7 | 1 | 8 | 3 |
| 5 History | 8 | 1 | 7 | 3 |
| Tile c | 8 | 1 | 6 | 4 |
| Tile c2 | 9 | 1 | 7 | 4 |

Claude's design reached 8 on 1 and 4. Its suggestion for AI look: one detail of drip's own breaking the template, such as the lock's water carried into the caption panel, or the card tucked behind the drop on the tile.

Round 10 changes: on 2 the water spills across the paper as a band with drip's own crest (the path `drip.css` masks the lock with), and "Limits are optional." becomes "if you set one"; 1's note points at Reveal next ("Not this one? The next pick costs a card."), the legend sits lower, and the sample shows 84K views instead of 1.2M; 3 matches 4's margins, with notes on the first-24-hours rule and on the Customize link itself; 4 shows all of Watch time, with notes as plain sentences; 5 is labeled a sample week ("41 minutes a day, down from 48") and scaled so the card's corners fall outside the strip; tile c3 tucks the gold card behind the drop. Codex's order change (modes second) still isn't taken: Claude keeps saying 1 then 2 tells the story.

### Round 10, 2026-11-09 (v2)

Reports: `reviews/round-10-codex.md`, `reviews/round-10-claude.md`.

| Image | Codex design | Codex AI | Claude design | Claude AI |
|---|---|---|---|---|
| 1 Home | 8 | 2 | 8 | 3 |
| 2 Lock | 8 | 2 | 7 | 3 |
| 3 Modes | 8 | 1 | 7 | 3 |
| 4 Settings | 7 | 1 | 7 | 3 |
| 5 History | 8 | 1 | 8 | 2 |
| Tile c2 | 9 | 1 | 7 | 3 |
| Tile c3 | 8 | 1 | 6 | 4 |

First image to meet the AI-look target from both judges: screenshot 5. Both judges prefer tile c2 over c3.

Round 11 changes: two new kinds of note in `frames-v2.html`. A note with `at` has no leader, for a line about the whole page (3's 24-hour note, 2's water note sitting in the water band). One with `under` sits below its target and reaches up with a right-angled leader, so 1's card note lands on Reveal next without crossing Stash. 4 crops to Dry hours' end; its second note is about tightening ("Turn dry hours on and they start tonight", which applies at once per DESIGN.md Q32); one time wording ("the 4am reset"). 5's sample keeps the 41-minute average but Friday runs to 80, so the bars use the chart. Rejected: Codex's ask to point 4's first note at the pending chip, since a level line to the chip runs through the "Drops per day" label.

### Round 11, 2026-11-09 (v2)

Reports: `reviews/round-11-codex.md`, `reviews/round-11-claude.md`.

| Image | Codex design | Codex AI | Claude design | Claude AI |
|---|---|---|---|---|
| 1 Home | 8 | 2 | 8 | 3 |
| 2 Lock | 9 | 2 | 7 | 3 |
| 3 Modes | 9 | 1 | 7 | 3 |
| 4 Settings | 8 | 1 | 8 | 2 |
| 5 History | 8 | 1 | 7 | 3 |
| Tile c2 | 9 | 1 | 7 | 4 |
| Tile c3 | 8 | 1 | 7 | 3 |

Met by both judges on AI look: screenshot 4 this round (5 last round; the Claude judge swings about a point between runs). Codex meets every target on 2, 3, and tile c2. The tiles are split: Codex picks c2, Claude picks c3 once its card clears the tagline.

Fixes for round 12, from both reports (applied in round 12):
1. Screenshot 1 (both): the subline repeats "at a time"; Codex wants "YouTube" in the headline. Claude: raise the note to a 58px bottom margin with the dot touching Reveal next's bottom edge, and shift the capture down about 25px.
2. Screenshot 2 (Claude): the paper's water band doesn't match the strip's water at the seam; sample the strip's water near the bottom, lighten 15 to 20%, and flatten the crest's last 80px. Fewer, bluer bubbles. Subline: "Set a daily limit. When it's used up, the video pauses."
3. Screenshot 3 (Claude): cut the leaderless 24-hour note; point a note at Full drip's description instead; "Or set your own mix." on Customize (no second "Choose").
4. Screenshot 4 (both): "Raised from 4 to 5. Still 4 until the 4am reset." Claude: "Dry hours block watching overnight. Turn them on and they start tonight."
5. Screenshot 5 (both): cut "The dashed line is the week before."; Claude would point a note at the Unlocks tile instead. Subline without "A sample week:" up front (Claude would move it to a small footnote; Codex wants it kept explicit). About 40px under the tiles.
6. Tile c3 (Claude): move the card off the tagline, tilt 10 to 12 degrees, taller than wide; tagline 15% larger.

### Round 12, 2026-11-09 (v2)

Reports: `reviews/round-12-codex.md`, `reviews/round-12-claude.md`.

| Image | Codex design | Codex AI | Claude design | Claude AI |
|---|---|---|---|---|
| 1 Home | 8 | 2 | 8 | 3 |
| 2 Lock | 8 | 2 | 7 | 3 |
| 3 Modes | 8 | 1 | 7 | 3 |
| 4 Settings | 7 | 1 | 8 | 3 |
| 5 History | 8 | 1 | 8 | 3 |
| Tile c2 | 9 | 1 | 7 | 3 |
| Tile c3 | 8 | 1 | 8 | 3 |

Round 12 changes: all six round-11 fixes. 1 has "YouTube, one / video at a time." with a subline that doesn't repeat it, the capture 25px lower, and a new `above` note whose leader runs level through the gap over Reveal next and drops onto its top edge. 2's band takes the strip's own water color with a crest that runs flat into the seam, its note is in paper ink, four bluer bubbles at set sizes, and the drawn video is cropped so the rider's dark shape sits above the panel (the lock's real 20px blur keeps it a shape). The bubbles are now placed with a fixed transform and their animation off: a paused rise came out about 4 seconds later in one capture than in another. 3 drops the 24-hour note for one on the Full drip radio, and "Or set your own mix." 4's notes are "Still 4 until the 4am reset." and the Dry hours rule with its hours. 5 drops the dashed-line note for one on the Unlocks tile, "Sample data." moves to a footnote, the capture scales to 1.36 for a 40px bottom margin, and the page behind the card takes the card's gray. Tiles: taglines 34px; c3's card peeks out up and to the left at -11 degrees.

Scores are where round 10 left them. Codex lost a point on 2, 3, and 4; the Claude judge gained one on 4, 5, and c3 and put AI look at 3 on everything. The two now pull opposite ways on several items: Codex wants fewer notes (cut 3's Customize note, 4's Dry hours note, 5's Unlocks note) and the sample label back in 5's subline, which the Claude judge asked to move out in round 11. The Claude judge's AI-look reasons are the same each round: the cream-panel-plus-app layout and the vector look of the drawn thumbnail.

Fixes for round 13, where the judges agree or one asks and the other doesn't object (applied in round 13):
1. Screenshot 1 (both): move the legend down so the left column has no 280px gap; the subline says it's a Chrome extension (Codex). One detail in the thumbnail drawn for drip, such as the rider's jacket in drip's blue (Claude).
2. Screenshot 2: "stops" instead of "pauses", the product's own word (Claude); the action note gives stopping equal weight, "Stop here, or spend a drop for 15 more minutes." (Codex); the water note shortened (Codex). Band color matched to the strip at the seam, not lightened (Claude, which reverses its round-11 ask).
3. Screenshot 3 (both): note 1 says something the card doesn't, "The default: 4 drops and 10 cards a day."; the capture centered vertically.
4. Screenshot 4 (both): the 4-to-5 fact in one place, a general subline, a tighter crop with less dead black at the top.
5. Screenshot 5: "Sample data." right under the subline, next to the numbers (Codex's concern, Claude's footnote form); Saturday's sample gets 1 unlock so the Unlocks note points at a nonzero (Claude).
6. Tile c3: show the card's full top edge and one corner (Claude), smaller than the drop (Codex).

Rejected: lowering the lock's water (Claude; tried in rounds 1, 6, and 10, see Don't redo in the handoff); a History headline with the drop in it, "Down 7 minutes a day." (Claude), since Codex flags the decline as reading like a promised result.

### Round 13, 2026-11-09 (v2)

Reports: `reviews/round-13-codex.md`, `reviews/round-13-claude.md`, plus two reruns of the Claude judge on the same images, `round-13-claude-rerun-a.md` and `-rerun-b.md`.

| Image | Codex design | Codex AI | Claude design (3 runs) | Claude AI (3 runs) |
|---|---|---|---|---|
| 1 Home | 8 | 2 | 8, 8, 8 | 3, 3, 3 |
| 2 Lock | 9 | 2 | 7, 7, 7 | 4, 3, 3 |
| 3 Modes | 8 | 2 | 8, 8, 8 | 3, 3, 3 |
| 4 Settings | 8 | 1 | 7, 7, 7 | 3, 3, 3 |
| 5 History | 8 | 1 | 7, 8, 8 | 3, 3, 3 |
| Tile c2 | 9 | 1 | 6, 8, 8 | 4, 2, 3 |
| Tile c3 | 8 | 1 | 7, 7, 7 | 4, 3, 3 |

Round 13 changes: all six listed fixes. 1's legend moves down to y 430, the subline names the Chrome extension, and the rider wears drip's blue. 2 says "stops", "Stop here, or spend a drop", and the band matches the strip's water exactly. 3 is centered with "The default: 4 drops and 10 cards a day." 4 has a general subline, a 60px higher crop that reaches "Finish video when time runs out", "Set to 5 drops. Stays at 4 until 4am." and "Add dry hours and they start tonight." 5's "Sample data." sits under the subline, and the sample's Saturday runs out at 30 minutes and takes an unlock (Friday drops to 77, so the week still averages 41). c3's card is smaller and turned -15 degrees.

Codex now meets both targets on 2 and c2. The reruns answer whether the Claude judge's 3s are noise: on the screenshots they aren't. All three runs give AI look 3 to every screenshot, and design moves by at most a point. Only the tiles swing (c2 from 6/4 to 8/2). Rerun B names the cause: "every frame is the same beige-left, dark-right split with a serif headline, gray subline, and thin blue leader lines ending in dots, a common Figma launch-template idiom." That's the v2 layout itself, so copy and crop changes inside it won't take the Claude judge's AI look to 2.

The Claude judge also reversed two of its round-12 asks: the legend (moved down at its request, now all three runs want it back under the subline) and "YouTube" in 1's headline (now a branding risk in all three runs; Codex this round agrees and suggests "One video at a time." with "for YouTube" in the subline).

Agreed by every report this round, for a round 14 if there is one: take "YouTube" out of 1's headline; say the 4-to-5 change once on 4; note 3's dot sits on the card border next to the radio; 5's Unlocks leader skims the tile tops. A frame bug two runs caught: a two-line note's leader starts after its first line, so when the second line is longer the leader runs between the lines.

## How to run a round (v2)

1. Edit `store/art/frames-v2.html` (and `dev/page.html` or `store/art/videos.js` for sample data).
2. `store/art/capture.sh v2` writes `store/images-v2/`. It renders at 2x and scales down with `sips`, and retries a screenshot up to four times when `has-notes.py` finds no notes (the page wasn't ready; about one shot in four needs a retry). Look at every image before judging.
3. Copy the last round's prompt to `reviews/round-N-prompt.md`, changing only the image list and round notes. Stage the prompt and the seven images in a scratch folder, `judgeN/`.
4. Codex, from that folder: `codex exec --skip-git-repo-check -s read-only -o report.md -i screenshot-1.png ... -i tile-c3.png - < prompt.md > codex.log 2>&1`, in the background. Add a line to `~/codex-trial/log.md`.
5. Claude: a fresh `general-purpose` Agent told to read only the staged prompt and images.
6. Save both reports verbatim as `reviews/round-N-codex.md` and `round-N-claude.md`, copy the staged images to `rounds/round-N/`, add the round here, commit.

## Open questions for Jesse (from 2026-11-09, not answered yet)

1. Reword two strings in drip's own UI? "Paid watching stops" (Dry hours, in Settings) can read as a paid service, and "I need this one" doesn't tell a newcomer it's an unlock. These touch `src/`, so they'd be a separate PR after 101 and 102.
2. Push `store/art` and open its drip PR (listing and policy fixes plus the images)?

## Other state

- jesselind PR 32 (privacy page brackets and new bullet) is merged into `development`. PR 33 promotes it to `release`; Jesse merges it.
- Local commits on `store/art`, not pushed yet: `be8a2fe` (LISTING.md, PRIVACY.md), `1a08f6f` (frames and first images), the picks and plan commits, the merge of main (PRs 101 and 102, merged 2026-11-09), and round 1.
