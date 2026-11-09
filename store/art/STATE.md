# Council state: drip store images

The `/council` run on drip's store images, started 2026-11-09. `/council continue` picks it up from here. The rounds before the council (0 to 13, two judges) are in `HILL-CLIMB.md`.

## Settings (Jesse, 2026-11-09)

- Seats: Anthropic (fresh `general-purpose` Agent), OpenAI (Codex, gpt-6.1-sol high), Meta (Muse, through `~/ai-context/bin/muse-exec`).
- Goal: every seat scores every screenshot and tile c2 at design 9 or more and AI look 2 or less.
- A seat that fails or runs out: go on with the rest, say so, and leave it out until Jesse adds it back.
- Pace: ask Jesse before each round.
- Reviewed: `store/images-v2/screenshot-1.png` to `-5.png` and `tile-c2.png`. Tile c3 is no longer reviewed.
- Reports: `reviews/round-N-<seat>.md`; images: `rounds/round-N/`; briefs: `reviews/round-N-prompt.md`.

## Current

- Round: 15 next (council round 2), waiting on Jesse's go.
- Tactic: fix. No stall yet: round 14 is the first round with three seats.
- Base: `frames-v2.html` with round 14's triage applied (this commit).
- Next step: copy `reviews/round-14-prompt.md` to `round-15-prompt.md`, replace Decisions so far with round 14's, add round 14's images for the comparison, stage, run the three seats.

## Score history

Design/AI look per image. Rounds 12 and 13 are from the two-judge loop, for reference.

| Round | Seat | 1 | 2 | 3 | 4 | 5 | c2 |
|---|---|---|---|---|---|---|---|
| 12 | Codex | 8/2 | 8/2 | 8/1 | 7/1 | 8/1 | 9/1 |
| 12 | Claude | 8/3 | 7/3 | 7/3 | 8/3 | 8/3 | 7/3 |
| 13 | Codex | 8/2 | 9/2 | 8/2 | 8/1 | 8/1 | 9/1 |
| 13 | Claude (3 runs) | 8/3 x3 | 7/4, 7/3, 7/3 | 8/3 x3 | 7/3 x3 | 7/3, 8/3, 8/3 | 6/4, 8/2, 8/3 |
| 14 | Claude | 8/3 | 7/3 | 8/3 | 8/3 | 7/3 | 7/4 |
| 14 | Codex | 9/2 | 8/2 | 8/2 | 8/2 | 8/2 | 9/1 |
| 14 | Muse | 6/5 | 6/5 | 7/3 | 5/4 | 7/3 | 7/3 |

Measured noise, Claude seat, identical images (round 13): one point on design, one on AI look, two on the tile.

## Decisions log

What the next brief's "Decisions so far" draws on. Newest first.

### Round 14 triage

Muse's first round: 17% of its 5-hour window, 5% of its week. It scores two to three points harsher than Codex.

Applied, Agreed (two or more seats):
- 1: the captured page scaled from 1.5 to 1.55, so the video card is wider (Claude, Muse).
- 2: the water note no longer repeats "runs out": "At zero, the water rises over the paused video." (Claude, Muse). The drawn video under the lock is positioned so its sky's color shows above the panel (Claude, Muse both called it gray murk).
- 3: headline "Choose what drip does." (Codex; Muse called "Choose how strict" a fragment). The first leader has no dot beside the radio (Claude, Muse).
- 4: the page scaled from 1.22 to 1.26 and moved down, so the first note clears the subline and the leaders run level (Codex and Muse asked for a tighter, larger crop; Claude for more room under the subline). A crop to the Watch time section alone was tried: the strip's width caps the scale near 1.26, and the notes then sat below the subline on bent leaders. Note 1 says what the chip doesn't: "Raised to 5 drops. The 5th waits for the reset." (Claude, Muse).
- 5: "Sample week:" back in the subline, and the small "Sample data." line gone (Codex, Muse; a reversal of round 12, which two seats asked for). The note names what its target shows: "Each day shows drops and cards used." (Codex; Muse said the old note didn't match its target).
- c2: a deeper paper and the lock's water along the bottom edge, so the tile holds on the store's white page (Claude, Muse).

Applied, Verified single:
- 1: "A drop is 15 minutes, by default." Minutes per drop is a setting (screenshot 4 shows it), so "15 minutes" alone was wrong (Codex).

Considered, not applied (one seat):
- Codex: 2's subline says the limit is optional; 3's "Or set your own mix." becomes "Set your own limits."; 4's second note becomes "Set dry hours to stop watching tonight."
- Claude: 1's leader ends beside the Reveal next pill instead of on its edge; 2's leader dot touches the +15m pill; 5's subline says what the page does instead of numbers.
- Muse: redraw 1's thumbnail and the tile's drop with less gloss; two fewer bubbles on 2; 5's Saturday back to 0 unlocks; swap screenshots 4 and 5; "for YouTube" on the tile; vary the History sample's bar heights.

Rejected, with the reason:
- Muse: "34m left next to 2 drops" contradicts the legend. It doesn't: 34m is what's left of today's glass, and the 2 drops are saved for later.
- Muse: label screenshot 1's invented channel and view count, as fabricated social proof. One seat; the thumbnail is visibly drawn and the other two seats see low risk. Kept in the list for Jesse.

### Pre-flight before round 14 (`64113cd`)

Changed, because every round-13 report agreed:
- Screenshot 1's headline is "One video at a time." and YouTube moved to the subline: "A Chrome extension for YouTube that replaces the home feed with one pick."
- Screenshot 4 says the 4-to-5 change once, in its note ("Raised to 5 drops. Still 4 until 4:00am."); the subline states the rule ("Looser ones wait for the daily reset.").
- Screenshot 3's first leader ends between the card's border and the radio.
- Screenshot 5's Unlocks note is gone.
- A two-line note's leader starts past its longest line.
- Tile c2 is the tile (three of four round-13 reports picked it).

Kept on purpose, with the reason:
- The lock's water stays all the way up. Tried partway in rounds 1, 6, and 10: the paused player sits behind the lock's panel, so a crest high enough to clear the panel has only gray above it. The band in the caption panel carries the rising water.
- The lock's blur stays. It's drip's real blur over the paused video; the image shows the real lock.
- No History headline that states the drop as a result ("Down 7 minutes a day."): it reads like a promised outcome.
- Screenshot 1's legend stays where round 13 put it. Round 12 asked to move it down, round 13 asked for it back up; only one seat asked each time.
- drip's own interface text and layout can't change in these images, only the frame, captions, crop, illustration, and sample data.
