Step 1: references

AI look scores describe appearance, not authorship.

| Ref | Design | AI look |
|---|---|---|
| 01 | 7 | 5 |
| 02 | 7 | 6 |
| 03 | 8 | 7 |
| 04 | 7 | 5 |
| 05 | 7 | 5 |
| 06 | 8 | 4 |
| 07 | 6 | 6 |
| 08 | 9 | 1 |
| 09 | 8 | 1 |
| 10 | 8 | 2 |
| 11 | 9 | 1 |
| 12 | 8 | 1 |
| 13 | 9 | 1 |

The strongest references give one feature a large, recognizable visual demonstration. In 08–10, the photography does much of the explaining. In 11–13, selective crops keep the relevant interface readable.

The weaker references divide attention among badges, decorative objects, small interface text, and several demonstrations. Reference 07 is particularly dependent on inspecting its small examples.

Typical editorial text: roughly 4–10 headline words, 0–16 subline words, and 0–20 words of labels or callouts. About 15–40 words overall, excluding incidental interface text. The denser Monica images carry considerably more. Text quantity alone does not distinguish the good ones.

Step 2: drip

The reference median is 8.

| Image | Design | AI look |
|---|---|---|
| 1 | 8 | 2 |
| 2 | 6 | 2 |
| 3 | 8 | 2 |
| 4 | 7 | 2 |
| 5 | 8 | 2 |
| Tile | 8 | 1 |

1. At the middle. The single video immediately demonstrates the product. The thumbnail illustration occupies enough space, but its cyclist is barely a subject at carousel size. That makes it read more as landscape artwork than a cycling video. Enlarging the cyclist would strengthen it.

2. Below the middle. The dialog is readable, but the surrounding blue and green field explains little. The bubbles are too slight to establish water. The caption supplies the video context almost entirely. A different composition pairing the exhausted counter with the lock would bring it up. Neither proposed scale adjustment addresses the central problem.

3. At the middle. The bigger capture makes the three choices useful evidence. The empty cream area is acceptable because the choices need the space on the right. The missing subline does not leave an explanation gap. The changing panel width is not a real problem by itself.

4. Below the middle. The caption explains delayed loosening, while much of the capture shows Dry hours and scheduling. Those are competing subjects. Crop the capture around the tabs, Mode, Watch time, Drops per day, and Minutes per drop. Enlarge that region and keep the leader attached to “4 drops until 4:00am.” End the crop before Dry hours.

5. At the middle. The bars, daily average, and selected-day totals form a clear demonstration. “Sample week” supplies the necessary qualification. The lower cards support the chart without another explanatory note.

Tile. At the middle in execution, judged for its separate job. The name and drop remain recognizable when reduced. The weakness is category recognition: “One video at a time” does not identify YouTube. A heavier tagline is not the main need.

Ship: yes.

Blocking fixes: none visible. Screenshot 2 is weak as a demonstration, but its caption explains the behavior accurately. I see no broken presentation or unsupported outcome claim that warrants holding the set.

Step 3: a different screenshot 2

Use a full cream canvas with two separate captures: the exhausted counter leading to the lock. Remove the vertical cream/dark split for this frame.

At 1280×800:

- Put the small drip logo at about x64, y40.
- Put “When time runs out.” at x64, y95, approximately 56px.
- Under it, use: “An optional daily limit. The video pauses when it runs out.” Approximately 24px.
- On the left, reserve roughly x64–365, y280–490 for a capture of the real counter at 0m, including its actual empty-glass state. Capture the token counts from the same sample state.
- Above that capture, label it “Daily limit reached.”
- On the right, place a roughly 790×510 crop of the real lock scene at x430, y220. Include the whole dialog, some surrounding water color, and any bubbles that fit. Keep every dialog control intact.
- Above that capture, label it “Video paused.”
- Draw one short blue editorial arrow from the counter area toward the lock capture. Keep it outside both captures.
- Put “Sample state.” in small type at the bottom left.

The two captures must remain visibly separate. Do not place the counter inside the lock scene as though that were its real location.

This gives the buyer a visible cause and consequence: zero minutes, then a pause. The current frame mainly shows the consequence. It also makes the blue glass carry some of the water identity that the blurred background cannot establish.

The risk is that this becomes an explanatory diagram with less atmosphere. It still will not demonstrate water rising. That is an acceptable limit of the available static capture. I would not reverse the earlier decision to remove the drawn water band.

Step 4: comparison and text

Comparison with the previous versions:

- 1: Same. No visible change.
- 2: Same. The blurred background and dialog have the same strengths and weaknesses.
- 3: Better. The larger cards make their descriptions easier to read. Removing the subline avoids repeating the choices.
- 4: Same. The capture still gives substantial space to controls outside the caption’s main point.
- 5: Same. The sample label and chart remain sufficient.
- Tile: Same. The brand reads clearly; the product category remains implicit.

Text, frame by frame:

1. Keep “Sample video.” where it is. A leader to the channel row would add clutter without improving the qualification. Keep both token explanations, but they can be shorter:

“15 minutes per drop, by default.”
“One card reveals one new video.”

Nothing needs restoring from the earlier cuts.

2. “An optional daily limit.” and “When it's used up, the video pauses.” are needed because the picture does not establish either fact. “Or spend a drop for 15 more minutes.” also adds useful meaning beyond the button’s token notation. Nothing is currently redundant enough to cut.

3. “Or set your own mix.” explains why Customize matters. Keep it. The removed “Start with Full drip, or choose a lighter mode.” is unnecessary. The Recommended badge and cards already communicate that.

4. “After your first 24 hours: tighten now, loosen at the daily reset.” carries essential information. Keep it. “Raised to 5 drops. Today stays at 4 until 4:00am.” translates a subtle interface state into plain language. Keep it too. The problem is the capture’s scope, not excess caption text.

5. “Sample week: 41 minutes a day, down from 48.” is enough. The removed Saturday note would repeat the selected-day display. Nothing is missing.

Tile. “One video at a time.” is useful but underspecific when the tile appears alone. Replace it with two lines:

“One YouTube”
“video at a time.”

Keep the serif treatment. Adjust its size enough to fit the existing text area. Adding weight alone would not resolve the ambiguity.

I do not recommend increasing every caption’s type size. The headlines already read strongly. Some interface detail benefits more from selective cropping.

Step 5: ranked fixes

These are improvements, not shipping blockers.

1. Screenshot 2, composition: replace the split frame with the separate 0m counter and lock captures described above. Give the pause a visible cause.
2. Screenshot 4, capture: crop out Dry hours and enlarge the upper settings region. Make the pending daily change the clear subject.
3. Tile, tagline: name YouTube in the existing two-line tagline so the tile explains its category when seen alone.
4. Screenshot 1, thumbnail: enlarge the cyclist roughly twofold while retaining the ridge and storm. Make the video’s subject recognizable at reduced size.
5. Screenshot 1, token legend: use the two shorter lines above. Preserve “by default” and the distinction between watching time and revealing videos.

Checked all attached current images, their previous versions, and the references visually. I did not inspect code, run the extension, or test an actual store carousel.