Proposal: "one number per image"

The idea
Each image is a poster built around one big number that the buyer can also find in the capture: 1 video, 1h, 3 modes, 5 drops, 41m a day. The number is the headline. The real interface comes in from the top-right corner as a cropped slab laid over the paper, and a blue ring marks where that same number appears in it. There's no caption panel and no divider. The text is a short phrase that finishes the number's sentence, so it won't read as the "caption column plus screen strip" template. The image says one thing and shows where it comes from.

Canvas
- Flat warm paper, #EFE8DC, with no texture, waves, or gradients. Ink is #1D1B18, secondary text #6E665B, and the accent is drip's own blue #3EA6FF.
- There's one drawn element. A hand-made SVG drop, the same shape as the logo drop with the white highlight stroke, sits on the numeral's baseline as its full stop, so "1" reads as "1." with a blue drop for the period. It's 0.14 × the numeral's font-size tall, with a 14px gap after the last glyph. Every image and the tile has it.
- The capture slab bleeds off the top and right edges. Only its bottom-left corner shows, at 28px radius, with a shadow of 0 30px 60px rgba(40,30,20,.18). Its bottom edge sits at y 540 to 560, so the paper wraps around it in an L. It never runs full height.

Type
- Numeral: Fraunces (Google Fonts), weight 560, opsz 144, SOFT 50, WONK 0, font-size 520px, line-height 0.75. Left edge x 56, baseline y 760, so the digits fill roughly y 390 to 760. A unit letter (h, m) is Fraunces italic at 160px on the same baseline.
- Phrase: Fraunces 46px/1.05, weight 450, ink, at most two lines. It starts 36px after the drop and sits so its last line shares the numeral's baseline.
- Note: Inter 19px/1.4, #6E665B, at most two lines, 14px above the phrase.
- Wordmark: drop plus "drip" in Inter 600 at 24px, top-left at x 56, y 56. It's the only thing in the top-left zone.
- Total text per image is about 6 words of phrase plus 10 to 14 words of note.

Captures
- Show one fragment per image, never the whole page. Scale is 1.0 to 1.15 of the page's CSS pixels, so UI text ends up larger than in the current set. Recapture at 2x DPR so 1.15 stays sharp.
- The slab's left edge sits between x 400 and x 620, chosen per image so it never covers the left half of any digit. Where it crosses a numeral, the slab sits on top, and it may cover at most the top-right fifth of a glyph.

What replaces the notes and leader lines
The numeral itself. A 3px #3EA6FF rounded-rect ring, 10px outset, goes around the one place in the capture that holds the same number or the action the phrase names. No lines connect anything. If the UI already highlights the element (the selected mode card), skip the ring.

1. Home. The numeral is "1" plus the drop. Note: "Not this one? The next pick costs a card." Phrase: "video at a time." The capture is the home page at 1.15, slab from x 430. It shows the lower part of the drawn thumbnail (top cropped by the canvas edge, rider still visible), the title, "Wet Gravel Club" line with Watch, and the Stash / Reveal next · -1 card / X row, which ends at y 520. The 34m header is cropped out. The ring goes around "Reveal next · -1 card".

2. Lock. The numeral is "1h" with an italic h, plus the drop. Note: "With Full drip's default limit. Limits are optional." Phrase: "then the water comes up." The capture is the lock screen at 1.0, slab from x 400. It includes the blurred blue-green water backdrop and bubbles, so this slab is water-colored, not black, which breaks up the set. The dialog sits at about x 500 to 1146, y 120 to 510. The ring goes around "1h watched today".

3. Welcome. The numeral is "3" plus the drop. Note: "Search only, one pick at a time, or daily limits." Phrase: "ways to use drip." The capture runs at 1.0, slab from x 480. It shows "How much should drip do?" through the bottom of the Full drip card, with the subline kept (it holds the first-24-hours claim). Next is cropped off. There's no ring, because the Full drip card's own blue outline does that job.

4. Settings. The numeral is "5" plus the drop, which echoes the "5 [drop]" in the stepper. Note: "After day one, a looser limit waits for the 4:00am reset. A tighter one applies now." Phrase: "drops, from the next reset." The capture runs at 1.15, slab from x 440. It shows the Mode row (tabs bleed off the top), Watch time with its toggle, Drops per day with the chip and stepper, and Minutes per drop. Dry hours is cropped out. The ring goes around "4 drops until 4:00am · Undo".

5. History. The numeral is "41" with an italic "m", plus the drop, spanning about x 56 to 760. Note: "Sample week. Down 15% from the week before." Phrase: "a day, last week." It starts at about x 800 and fits in 424px. The capture runs at 1.0, slab from x 620. It shows "Last week" (bleeding off the top), Daily average 41m, the bar chart, and the dashed-average legend line. The Saturday detail is cropped out. The ring goes around "Daily average 41m".

Tile (440x280)
Same system at tile scale. Paper background. "1" plus the drop in Fraunces at 260px, x 20, baseline 268. The slab comes in from the top-right at x 170 to 440, y 0 to 150. It holds the home header pill (glass icon, 34m left today, 2 drops, 7 cards) at 0.85 scale, so both tokens appear. To the right of the "1", "drip" in Inter 600 at 20px, then "video at a time." in Fraunces 26px with its baseline near y 250. No ring.

Hardest to get right
- Numeral widths vary ("1" against "41m"), so the slab's left edge and the phrase position need per-image tuning. The system only holds if every image keeps the same baseline, size, and drop. Don't shrink a numeral to make room.
- Keeping "1" from reading as "l" when the slab gets near a numeral's top. Keep the slab clear of every flag and top serif.
- Fraunces at 520px can look heavy or cute. Try weights 480 to 600 and SOFT 0 to 50 side by side, and pick the one that looks printed, not playful.
- The 1.15 crops have to stay legible at the store's 640x400 thumbnail and still show enough of each page that a buyer recognizes it. Settings and Home are the tightest.
- Fitting the lock and settings claims into two short lines without dropping "optional", "after day one", or "sample".
