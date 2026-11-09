# Council state: drip store images

The `/council` run on drip's store images, started 2026-11-09. `/council continue` picks it up from here. The rounds before the council (0 to 13, two judges) are in `HILL-CLIMB.md`.

## Settings (Jesse, 2026-11-09)

- Seats: Anthropic (fresh `general-purpose` Agent), OpenAI (Codex, gpt-6.1-sol high), Meta (Muse, through `~/ai-context/bin/muse-exec`).
- Goal (Jesse, changed 2026-11-09 after round 18's level 2 stall): every seat picks this set to ship and names no blocking fix that two seats agree on. Scores are still reported. The first goal, design 9+ and AI look 2 or less from every seat, was not reached in rounds 14 to 18.
- A seat that fails or runs out: go on with the rest, say so, and leave it out until Jesse adds it back.
- Pace: ask Jesse before each round.
- Reviewed: `store/images-v2/screenshot-1.png` to `-5.png` and `tile-c2.png`. Tile c3 is no longer reviewed.
- Reports: `reviews/round-N-<seat>.md`; images: `rounds/round-N/`; briefs: `reviews/round-N-prompt.md`.

## Current

- Round: 20 next, Muse's ship verdict on the round-19 set with its fixes. Claude and Codex both said "Ship: yes, blocking fixes: none" in round 19, so the goal is met for two of three seats.
- Tactic: fix (ship check).
- Base: `frames-v2.html` with round 19's agreed optional fixes (this commit).
- Muse: out of quota until about 21:04 on 2026-11-09.
- Next step: at Muse's reset and with Jesse's go, round 20 with Muse alone (or all three): ship verdict and blocking fixes on the current set. If Muse says ship with no blocking fix two seats share, the goal is met: write the final council report.

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
| 15 | Claude | 8/3 | 8/3 | 7/3 | 8/3 | 8/3 | 7/3 |
| 15 | Codex | 8/2 | 8/2 | 9/1 | 8/1 | 9/1 | 9/1 |
| 15 | Muse | 7/5 | 6/5 | 7/3 | 8/2 | 7/3 | 6/4 |
| 16 | Claude | 8/3 | 7/4 | 7/3 | 8/2 | 7/3 | 7/4 |
| 16 | Codex | 9/1 | 8/2 | 8/1 | 8/1 | 9/1 | 9/1 |
| 16 | Muse | 7/4 | 6/5 | 8/3 | 6/3 | 7/3 | 7/3 |
| 18 | Claude (V, in comparison) | 7/4 | 8/3 | 7/4 | 8/3 | 6/5 | 6/5 |
| 18 | Codex (V, in comparison) | 8/2 | 8/3 | 7/3 | 7/3 | 8/2 | 8/2 |
| 19 | Claude (ship: yes) | 8/3 | 8/3 | 8/3 | 8/2 | 8/3 | 8/3 |
| 19 | Codex (ship: yes) | 9/2 | 8/2 | 8/2 | 8/1 | 9/1 | 9/1 |

Measured noise, Claude seat, identical images (round 13): one point on design, one on AI look, two on the tile.

## Decisions log

What the next brief's "Decisions so far" draws on. Newest first.

### Round 19: ship check, Claude and Codex

Both: "Ship: yes. Blocking fixes: none."

Applied, optional fixes both seats raised:
- 2: the subline no longer repeats the water note: "An optional daily limit, counted in drops." (Claude; Codex wanted the two lines to stop overlapping too.)
- 3: "Start strict, or just hide the feed." replaced, since Codex called it the weakest line and Claude a forced wrap: "Start with Full drip, or choose a lighter mode." (Codex's line.)
- 4: the subline states the first-day rule precisely: "After your first 24 hours: tighten now, loosen at reset." (Codex; Claude found "after day one" ambiguous). The leader's drop onto the chip is longer, so it reads as meant (both called the short jog a slip).
- 5: Saturday's sample has no unlock: an unlock on a day under its limit looked wrong (Claude; Muse in round 15).

Considered, not applied: Claude on 4's right margin (fourth round asking), 1's legend higher, a less listicle headline on 3, a less generic headline on 5, the tile's wave; Codex on shorter notes on 1, 3, and 5 and a larger tagline on the tile.

### Round 18: head-to-head, then triage on V

Picks per image (Claude / Codex): 1 V/V, 2 V/V, 3 A/V, 4 V/B, 5 A/V, tile B/V. Overall: V from both.

Applied on V, Agreed:
- 2: the subline says the limit is optional: "An optional daily limit. When it's used up, the video stops." (Codex for the third round running; Claude: "Set a daily limit" reads as mandatory).
- 3: the subline stops listing the modes the page already shows: "Start strict, or just hide the feed." (Codex: the subline repeats the page; Claude suggested this line).
- 4: one message. The Dry hours note is gone, and the remaining note points at the "4 drops until 4:00am · Undo" chip, dropping onto it from the gap above its row: "Raised to 5 drops. Today stays at 4 until 4:00am." (Codex: focus on the delayed increase; Claude: end the leader on the chip, cut Dry hours). A note can now name a target by selector plus text (`has`), skipping hidden copies: Settings repeats a section's chips in its folded header.

Considered, not applied (one seat, or the seats disagree):
- Claude: one drawn element crossing the seam on every frame; the legend at the top with leaders to the counter; one water surface across 2; a Quiet note on 3; a note on 5's dashed line; the tile's drop falling into the wave. "The next pick costs a card" holds only in Full drip (the frame shows Full drip, so it stays).
- Codex: a compact token key on 1; one note on 3 and no Customize leader; 5's subline as "down 15%"; a smaller wave on the tile.
- The tile: Codex wants the wave smaller, Claude wants it bigger with the drop falling in.

### Round 16 triage

Compared with round 15: Codex better on 1, 2, 4, 5, c2, worse on 3; Claude better on 4 and c2, slightly better on 1 and 3, same on 2 and 5; Muse better on 1 to 4 (its report stopped before 5's comparison and the tile).

Applied, Agreed:
- 1: the rain is clustered, a dense curtain on the left thinning in bursts, with varied starts and lengths (Claude: the even row reads as stock; Muse: redraw with specific detail).
- 2: the band's water resampled greener to match the strip at the seam (Claude, Codex). The note no longer says a vague "At zero": "At 0 minutes left, the video pauses under the water." (Claude; Muse asked for a line about the pictured state.)
- 3: headline "Three ways to use drip." (Codex and Claude both asked to replace "Choose your limits."; Codex suggested "Pick your YouTube mode.", but YouTube in a headline is what every round-13 report flagged, so the line follows Claude's "Three ways to use it.").
- 4: the second note leads with the behavior: "Dry hours start tonight: 11pm to 6am." (Codex; Claude asked for what dry hours do, not just times).
- 5: the note gives a fact the tiles don't: "Saturday: 30 minutes, exactly 2 drops." (Muse; Claude said the old note narrated the tile labels.)

Applied, Verified single:
- 4: the subline now carries the first-day exception: "Stricter settings apply now. Looser ones wait for the reset after day one." Screenshot 3's page says changes apply right away for the first 24 hours, so the old subline was wrong for day one (Codex).

Tried and reverted:
- 2: the drawn video under the lock moved to show its gold sky (Claude, Muse). At 120% and 85% 55% the navy patch got bigger, not smaller, so it went back to round 15's 130% and 55% 95%. Four positions tried in four rounds; the lock's real blur turns any of them into soft color fields.

Considered, not applied (one seat, or seats disagree):
- Bubbles on 2: Claude wants one clearly larger, Muse wants fewer. They pull opposite ways.
- Claude: 4's right margin (third round asking); a ripple under the tile's drop and a taller crest; a Quiet note on 3.
- Codex: 4's first note as "5 drops after reset. 4 until then."; 1's leader without the elbow.
- Muse: literal mode previews on 3 (drip's own UI, can't change here); the legend icons' shadow; a bigger chart on 5.

Rejected, with the reason:
- Muse, third time: 34m left next to 2 drops, and now 7 cards next to a 10-card default. Both are consistent: 34m is today's glass, 2 drops are saved, and 7 cards are left after 3 were used.
- Muse, again: 4's last row cut off. It's fully in frame.

### Round 15 triage

Compared with round 14: Codex better on all six; Claude better on 2, 4, 5, c2, same on 1, worse on 3; Muse better on 1, 2, 4, 5, c2, worse on 3. Muse reversed itself on 3's headline: in round 14 it called "Choose how strict." a fragment, and in round 15 it asked for it back.

Applied, Agreed:
- 1: "A drop is 15 minutes by default." with no comma (all three). The drawn thumbnail's near and middle hills are lighter and the trail brighter (Codex asked for that; Muse asked for a redraw with texture; the smaller change went in).
- 2: three bubbles instead of four, smaller, with softer rims (Codex, Muse). The drawn video under the lock moved again, so the navy patch at the top left is smaller and the green hill shows at the right (Claude called the patch a smudge; Muse wants the video recognizable).
- 3: headline "Choose your limits." A reversal of round 14's "Choose what drip does.", which Claude and Muse both called worse; Codex suggested "Choose your limits." in round 13.
- 4: second note "Dry hours: 11pm to 6am, starting tonight." (Codex; Claude asked for a shorter note).
- 5: the note's leader now runs to the Drops used tile, and the note covers all three tiles: "Each day shows its drops, cards, and unlocks." (Claude and Muse: the old note talked about the tiles but pointed at the date).
- c2: the water band is a lighter blue from the drop's family, so it reads as water and not a dark footer bar (Claude, Muse).

Considered, not applied (one seat):
- Codex: 2's subline says limits are optional (second round asking); 4's first note becomes "Raised to 5 a day. Starts at the next reset."
- Claude: 1's leader without the elbow; 4's right margin, about 25px; 2's subline and water note overlap.
- Muse: swap screenshots 3 and 5; drop 3's Customize leader; a flatter History week; the tile with a smaller drop, a bigger tagline, and "for YouTube"; 2's band and note as a normal note; 2's sample at 45m watched; 4 with Dry hours off.

Rejected, with the reason:
- Muse, again: 34m left next to 2 drops is a contradiction. It isn't (round 14).
- Muse: 4's "Finish video when time runs out" row is cut off. It's fully in frame, its toggle at y 728 of 800.
- Claude: the band in 2's caption panel doesn't match the strip's water at the seam. Sampled on round 16's test capture: band 28,58,64 against strip 34,63,66 at the top, 11,35,43 against 13,40,45 at the bottom.

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
