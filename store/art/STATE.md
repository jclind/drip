# Council state: drip store images

Two runs. The current one, `store-images-ref`, comes first; `/council continue` picks it up from its Current section. The first run (rounds 14 to 19) follows it and is closed. The rounds before the council (0 to 13, two judges) are in `HILL-CLIMB.md`.

# Run 2: store-images-ref (started 2026-11-09)

A fresh pass on the round-19 set, judged against 13 top Chrome Web Store extensions' images (`reference/ref-01.png` to `-13.png`, kept out of git through `.git/info/exclude`). It answers Jesse's three concerns about it: how much text, screenshot 2's water band at the seam, and tile c2's two-line tagline. The brief doesn't pass on the first run's decisions or tell seats about earlier rounds, only the hard limits and the water-partway problem as a technical fact.

## Settings (Jesse, 2026-11-09)

- Seats: Anthropic (fresh `general-purpose` Agent) and OpenAI (Codex, gpt-6.1-sol high). Muse is out of this run.
- Goal: both seats rate every drip image at or above the middle of the 13 references, and no blocking fix that both seats name is left.
- A seat that fails or runs out: stop and ask Jesse.
- Pace: up to 4 rounds without asking, then ask. Stop sooner at the goal or a stall.
- Reviewed: `store/images-v2/screenshot-1.png` to `-5.png` and `tile-c2.png`.
- Files: briefs `reviews/ref-N-prompt.md`, reports `reviews/ref-N-<seat>.md`, images `rounds/ref-N/`.

## Current

- Closed by Jesse on 2026-11-09 after round 5: "I think this is as good as we will get it with the current amount of effort we want to use." The set in `store/images-v2/` (screenshot 2 shot from `frames-v4.html?v=b`) is final; 4's crop stays. The cyclist question went to `/design-variants` (thumbnail ideas) instead of another round.
- Round: 5 done.
- Goal: not met, and within the seats' noise. Claude puts 3 and 4 below the middle; Codex puts only 1 below (the cyclist). Both say ship, no blocking fixes. Images that didn't change between rounds 4 and 5 moved a point either way (Claude 3 and 4 down, Codex 3 and the tile up), so one point is each seat's noise, and every image sits within it of the middle.
- Base: every frame on the 480px panel, with round 5's note cut on 4 (this commit).
- Recommendation: stop here and ship this set. The remaining asks split the seats (below), so another fix round would apply nothing new.

## Jesse's decisions (2026-11-09, after ref round 4)

- The tile's tagline stays without YouTube ("keep it out probably").
- One caption panel width for all five frames, "whatever is standard for chrome extensions". The store sets no such width, only the 1280x800 size; the references' text columns run about 35 to 45% of the frame. 480px (37.5%) went in, since 3 and 4 need it for their bigger captures. 1 and 5 grew 3 to 4%, the most their height allows; 2b's players stay 640 wide, centered.

## Score history

Design/AI look per image, and the seat's median for the references.

| Round | Seat | Refs median | 1 | 2 | 3 | 4 | 5 | c2 |
|---|---|---|---|---|---|---|---|---|
| 1 | Claude | 7/4 | 8/3 | 6/4 | 7/3 | 7/3 | 7/3 | 7/3 |
| 1 | Codex | 8/5 | 7/2 | 7/2 | 7/2 | 7/2 | 8/2 | 8/1 |

| 2 | Claude | 7 | 7/3 | 6/4 | 6/4 | 7/3 | 7/3 | 7/4 |
| 2 | Codex | 8 | 8/2 | 7/2 | 7/2 | 7/2 | 8/1 | 8/1 |
| 3 | Claude | 7 | 7/3 | 5/4 | 7/3 | 6/3 | 7/3 | 6/3 |
| 3 | Codex | 8 | 8/2 | 6/2 | 8/2 | 7/2 | 8/2 | 8/1 |
| 4 | Claude | 7 | 7/3 | 2b 7/3 (2 6/4, 2a 6/4) | 7/3 | 7/3 | 7/3 | 7/3 |
| 4 | Codex | 7 | 8/2 | 2b 7/2 (2 6/4, 2a 7/2) | 7/2 | 8/2 | 7/2 | 6/2 |
| 5 | Claude | 7 | 7/3 | 7/3 | 6/3 | 6/3 | 7/3 | 7/2 |
| 5 | Codex | 8 | 7/2 | 8/2 | 8/1 | 8/1 | 8/1 | 8/1 |

Below the references' middle in round 1: Codex 1, 2, 3, 4; Claude 2. Round 2: Codex 2, 3, 4; Claude 2, 3. Both seats: ship, no blocking fixes. Round 3: both seats 2 and 4 (Claude called the tile, at 6, at the middle for a tile); both ship, no blocking fixes.
Round 4, with 2b: Claude none; Codex the tile only. Both ship with 2b, no blocking fixes.
Round 5: Claude 3 and 4; Codex 1. Both ship, no blocking fixes.

## Decisions log

### Ref round 5

Used: the Claude seat 88,350 tokens; Codex 53,553 tokens (25 images each).

Compared with round 4 (after its fixes): both called 1, 2, and 5 better; 3, 4, and the tile the same (unchanged). Claude: the single panel width stops the logo and headline jumping between frames.

Applied, Agreed (both seats):
- 4: the note is "Raised to 5 drops." The chip it points at says "4 drops until 4:00am".

Not applied, the seats split:
- 1's cyclist about twice as tall, with more contrast (Codex, fifth round asking; the only reason it puts 1 below the middle). Claude: the thumbnail's job is "this is a video", and it does that.
- 4's capture: Claude puts 4 below the middle because the toggles sit about 20px from the right edge and 160px of black sits above the tabs; it asks for 80px side gutters like 1 and 2 and the tabs at y 128 like 3's question. Codex: the vertical position is balanced. Fitting 80px gutters means a scale of about 1.2, smaller than before round 3's crop.
- 1's and 5's top and bottom margins, about 20px since the 480px move (Claude: take back half the bump; Codex called both better).
- 1's subline without "A Chrome extension for" (Claude: filler on the store; Codex: keep, it gives context).

Considered, not applied (one seat):
- Claude: 3 without the Next button, its cards scaled up into the room.
- Codex: 2's arrow wider and heavier; 5's subline "Sample week. Minutes, drops, and cards by day."; "A card reveals one video." (optional, it said).

### Ref round 4

Used: the Claude seat 95,237 tokens; Codex 56,709 tokens (27 images each).

Compared with round 3: both called 4 better and 2b better than 2; the rest the same.

Applied, Agreed (both seats):
- 2: 2b ships as screenshot 2 (both picked it over 2 and 2a). `capture.sh v2` now shoots screenshot 2 from `frames-v4.html?v=b`; frames-v2.html's shot 2 is kept, marked not shipped. Both asked for a cue that the two players are a sequence: a small blue down arrow in the gap (Claude's; Codex asked for "Before" and "When time runs out." labels, which add text and repeat the headline).
- 5: the subline says what the page records, not the chart's numbers: "Sample week. Each day's minutes, / drops, and cards used." (Claude's wording, shortened; Codex asked for "Sample history: watch time, drops, and cards used.").

Not applied, the seats split:
- One panel width for all five: Claude asked for 480px everywhere (the seam jumps twice in the carousel); Codex said keep the mixed widths. For Jesse.
- The tile's tagline: Codex puts the tile below the middle because "One video at a time." doesn't say YouTube, and asks for "YouTube, one video at a time."; Claude says the store prints the name and summary beside the tile, so no. For Jesse.

Considered, not applied (one seat):
- Codex: 1's cyclist about 50% bigger (fourth round asking); "A card reveals one video." without "new".
- Claude: 4's note cut to "Raised to 5 drops."; 4's capture moved up so its tabs start near y 115, level with 3's content.

### Ref round 3

Used: the Claude seat 93,965 tokens; Codex 53,363 tokens (25 images each).

Compared with round 2: both called 3 better and everything else the same.

Applied, Agreed (both seats):
- 4: cropped to the tabs through Dry hours' line ("Paid watching stops. Whole drops return."), so Starts at, Ends at, and Finish video are out, and the capture is 13% bigger (scale 1.42, `h2` 488 cuts it). Codex asked for this in rounds 2 and 3; Claude agreed in round 3. Codex would also cut the Dry hours row; Claude keeps it, and the smaller cut went in. At 1.25x, as both asked, the rows (532 page px) don't fit the 720px strip, so 4 takes 3's 480px panel.

Divergent, built for round 4 (`frames-v4.html`, `capture.sh v4`):
- 2a, Codex's: no split. "When time runs out." on one line, drip's real counter at 0m (`home.html?scenario=zero`, labeled "Daily limit reached."), a short blue arrow, the real lock in a 750x454 box (labeled "Video paused."), "Sample state." at the bottom. No note.
- 2b, Claude's: the paper column as now, and on the dark strip two 16:9 players: the tour's player step with the ride playing sharp and drip's real pill at 1m, and below it the real lock over the same ride. "Sample video." under the subline; the drop note with its leader to "+15m".
- Building 2a: the counter's capture waits on `.drip-counts`, since the box clips the thumbnail and its lazy image never loads.

Considered, not applied (one seat):
- Codex: the tile's tagline naming YouTube ("One YouTube / video at a time."); 1's cyclist about twice as big (third round asking); shorter legend lines on 1 (third round; Claude disagreed again).
- Claude: every frame on the 480px panel, each capture about 11% bigger, so the seam doesn't jump between frames (a reversal of keeping 560px on 1, 2, and 5; Codex said a changing width isn't a problem in itself). 5's subline "Sample week. Each day's drops, cards, and unlocks." The tile's tagline heavier and about 10% bigger (third round asking; Codex said not needed).

Note for Jesse: 3 and 4 are on a 480px panel now and 1, 2, and 5 on 560px.

### Ref round 2

Used: the Claude seat 90,003 tokens; Codex 43,253 tokens (25 images each).

Compared with round 1: both seats called 1, 2, 3, and 5 better (Claude: 4 the same, Codex: 4 slightly better); the tile the same.

Applied, Agreed (both seats):
- 3: no subline (it repeated the Recommended badge), and the caption panel is 480px wide instead of 560, with the capture 11% bigger (scale 1.278), so the cards' descriptions read at carousel size. `frames-v2.html` takes a per-shot `panel` for this.

Not applied, the seats split:
- 2's capture scale: Claude asked about 10% up, Codex about 10% down. Both tried (variants 2b at 1.87 and 2c at 1.6, not kept): at 1.87 the lock's panel reaches the seam and the right edge; below about 1.66 the tour stage's edge shows at the right and bottom. Neither fits, and 2 stays below the middle for both seats, so round 3 asks each seat for one approach far from the current one.

Considered, not applied (one seat):
- Codex: 4 cropped tighter around Watch time, without Dry hours (second round asking); 1's legend as "Drop: 15 minutes by default." and "Card: reveal one new video." (Claude disagreed); a larger cyclist and more detail in 1's thumbnail (second round); 5's subline "A sample week of watch time."
- Claude: drip's real header counter at zero in 2's cream panel; captions bigger (sublines 19 to 22px, headlines 15% up) and the subline gray darker; 1's "Sample video." as a note with a leader to the channel row, worded "Sample video and channel."; the tile's tagline in semibold (second round asking; Codex said not needed).

### Ref round 1

Used: the Claude seat 87,217 tokens; Codex 51,054 tokens (19 images each).

Both seats on Jesse's questions:
- Text: too much. Both called the notes the problem, not the headlines. Both counted 20 to 40 words in a typical reference and none with leader lines.
- Screenshot 2's band: not deliberate. Both said remove it, and both rejected a drawn surface over the strip (fake UI over the real capture, and it would contradict the lock's full water).
- Tile c2's tagline: reads well; keep the copy and the two lines.

Applied, Agreed (both seats):
- 1: the "Not this one? The next pick costs a card." note is gone (the card legend line and the button's "-1" say it).
- 2: the water band and its note "At 0 minutes left, the video pauses under the water." are gone; the pause moved into the subline: "An optional daily limit. / When it's used up, the video pauses." (Claude's wording; Codex asked for "An optional daily limit that pauses playback."). The other note is shorter, "Or spend a drop / for 15 more minutes." (Claude asked for this; Codex asked to cut it, so the smaller change went in.)
- 3: the "The default: 4 drops and 10 cards a day." note is gone (the card's own "1h of watching and 10 new videos" says it plainer).
- 4: the subline names the reset: "After your first 24 hours: tighten now, / loosen at the daily reset." (both called the bare "reset" undefined; Codex's wording, since Claude's "until tomorrow" isn't accurate with a 4:00am reset).
- 5: the "Saturday: 30 minutes, exactly 2 drops." note is gone, and the subline is shorter: "Sample week: 41 minutes a day, / down from 48." `capture.sh` skips the notes check for screenshot 5, which has none now.

Applied, Verified single:
- 1: "Sample video." under the subline (Codex's only blocker). The channel name, views, and age look real, and the brief's own limit says sample data is labeled or obviously sample.
- Claude's blocker (2's "0 minutes left" next to a drop on offer) is gone with the note. Drops carry over from earlier days, so a spare drop after a full day is real.

Considered, not applied (one seat):
- Codex: shorter legend lines on 1 ("One drop = 15 minutes by default."); cut 2's drop note; cut 3's "Or set your own mix." note; narrow the panel and enlarge 3's capture; a tighter crop on 4's drop rows; a larger cyclist on 1; 6px more between the tile's wordmark and tagline; 1's subline as "A Chrome extension that replaces YouTube's home feed with one pick."
- Claude: cut 3's subline; 4's subline as "Lower limits apply now. Higher ones wait until tomorrow."; move 4's text down so the panel isn't top-heavy; 5's subline as "A sample week."; 1's subline without "Chrome extension"; a smaller scale on 2's strip so more water shows around the lock; Friday's bar trimmed to about 60m; the tile's tagline in semibold, 10 to 15% larger, and a thicker wave or none.

Watch next round: 3's remaining note starts with "Or" right after a subline that ends "or choose a lighter mode."

# Run 1: rounds 14 to 19 (closed 2026-11-09)

Closed by Jesse on 2026-11-09: Muse's round-20 ship check was skipped, and Claude and Codex's "ship" in round 19 counts as the result.

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
