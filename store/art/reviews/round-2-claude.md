| Image | Design | AI look |
|---|---|---|
| 1 | 7 | 4 |
| 2 | 5 | 4 |
| 3 | 6 | 4 |
| 4 | 6 | 3 |
| 5 | 7 | 4 |
| 6 | 6 | 4 |
| 7 | 7 | 4 |
| 8 | 5 | 5 |

1. screenshot-1 (home, one revealed video)

Up: the headline "One video at a time." is the whole pitch in five words, and it sits big and alone. The panel shows the real loop in one glance: the minutes left, the drop and card counts, one video, Watch, Reveal next with its -1 card cost. The drawn thumbnail is calm and has a point of view, a rider ahead of a storm, which fits the "restraint" tone better than a fake real thumbnail would.
Down: the panel (#111-ish) and the frame navy are two near-black tones that barely separate, so the panel edge almost disappears at thumbnail size. The panel content is a narrow centered column (about 500px wide in a 740px panel), which leaves dead dark space on both sides and makes the UI look small. There's a big gap between the title and the "Trail Days · 1.2M views" row, so the card reads as two loose pieces. "Stashed" is already in its active state, which a first-time viewer can't parse.
Works: headline, the status cluster at top, the cost shown right on the Reveal next button.
Fix, by impact:
1. Scale the captured page up about 115 to 120% so the video card fills more of the panel width. The UI is the product, so give it the space.
2. Raise the panel's contrast against the frame: a 1px lighter border or a slightly lighter frame navy, so the panel reads as a window at thumbnail size.
3. Sample data: show "Stash" in its default state, not "Stashed", so the row reads as three plain actions.
4. Subline: "drip swaps YouTube's home feed for one video, shown only when you ask" is fine, but "shown only when you ask" undersells the card cost. Try "drip swaps YouTube's home feed for one video at a time. Each new one costs a card."

2. screenshot-2 (lock)

Up: the caption is the best in the set. "Out of minutes? The lock comes up." is a question and an answer, and it sounds like a person. "Time for a breather." on the card is warm without being cute.
Down: the "blue water rising" doesn't read as water. It's a soft blue glow band across the middle with two stray bubbles, one floating alone at top right and one cut in half at the right edge of the image. They look like dust specks or render glitches, not bubbles. There's no video behind the lock, so nothing tells the viewer this sits on top of a video they were watching; it reads as a modal on a dark page. The panel stops short of the bottom (its left edge ends around y=772) while panels 1, 3, 4, 5 bleed off the bottom, and there's a thin light horizontal line at the right edge around y=635. Those small inconsistencies make this frame look less finished than the rest. The card also sits right of the panel's center.
Works: caption, the two-choice button row with the drop cost inline, "I need this one · 3 left this week" as a quiet escape hatch.
Fix, by impact:
1. Illustration: put a dimmed, blurred frame of the ride illustration from screenshot 1 behind the lock, so it's obvious the lock covers a video. This also ties images 1 and 2 together as one story.
2. Water: give the water a visible top edge (a surface line or slight wave) in the lower third, so it reads as water rising and not as a glow. Place the bubbles inside or just above the water, three or four of them, none clipped by the image edge.
3. Crop: make the panel bleed off the bottom like the others and remove the stray line at the right edge.
4. Center the lock card in the panel.
5. Subline: "Limits are optional. With one on, a drop adds 15 more minutes, or you call it a day." The "With one on" clause makes the reader backtrack. Try "Spend a drop for 15 more minutes, or call it a day. Limits are optional."

3. screenshot-3 (welcome mode choice)

Up: three clear choices with Recommended on the full mode, and the panel is full, with no dead space. The selected blue border gives the eye one place to land.
Down: the caption "Search only, or add limits." describes two of the three options. Curated, the middle one, is neither, so the headline and the panel disagree. The subline "Pick now, switch later in Settings." repeats the panel's own subtitle almost word for word, so the frame spends its subline on nothing. The mini preview pictures on the right of each option are too small to read even at full size; at thumbnail size they're gray smudges. The panel content runs to x=1233, close to the image edge, and starts at x=589, a different left inset from screenshot 1.
Works: the selected state, the Recommended pill with the drop, "Full drip" as a mode name.
Fix, by impact:
1. Caption: match the three modes. Something like "Three levels. Pick how strict." or "Hide the feed, or add limits." if you want to keep two beats.
2. Subline: say something the panel doesn't. E.g. "Quiet hides the feeds. Full drip adds a daily time budget."
3. Crop: crop in on the three option cards and drop the "Next" button, then scale up so the option text is larger. The Next button adds nothing to the store image.
4. Match the panel's left inset to screenshots 4 and 5 (see set notes).

4. screenshot-4 (Settings)

Up: it looks like real settings from a real product, with numbers people can picture (4 drops, 15m, 11:00pm to 6:00am). "Choose your drops and dry hours." has some voice. This frame looks least templated because it's dense, specific, and a little odd.
Down: "dry hours" means nothing to someone who hasn't used drip, and neither line of the caption explains it. The subline is a rule about when changes apply ("After day one, stricter settings apply at once. Looser ones wait until tomorrow."). It's real and it's the most interesting design decision in the product, but in this spot it reads like fine print, and it competes with explaining what you're choosing. The "drip" header inside the panel repeats the mark in the corner. The setting rows at the bottom ("Starts at", "Ends at") are gray and low priority, and they take a fifth of the panel.
Works: the stepper with the drop icon in "4", the toggles, real times in the sample data.
Fix, by impact:
1. Subline: explain the nouns first. E.g. "A drop is 15 minutes of watching. Dry hours turn YouTube off overnight." Move the stricter/looser rule to screenshot 3's subline or drop it.
2. Crop: crop off the panel's "drip" header and start at the tab row, the way screenshot 5 does, and scale up a little so the Watch time block fills the height.
3. If the crop needs more room, cut at the "Dry hours" row and show only Starts at, or leave both time rows and lose the header. One of the two has to go.

5. screenshot-5 (History)

Up: a chart with a clear story. Bars, a dashed line for last week's 48m, "41m" daily average, and "15% from the week before" with a down arrow. The numbers agree with each other and with screenshot 1 (7 cards). "Of 7 cards, 1 saved, 2 watched, and 4 passed." is a nice, specific line. The caption "See your week." is short and right.
Down: the chart and stat tiles inside a second rounded card inside the panel make two nested boxes on top of a frame, which feels like a dashboard template. The panel content column (x=653 to 1164) is narrower than in 3 and 4 and wider than nothing, so the five frames each use a different inset. The tab row starts at y=115 here and y=217 in screenshot 4, so the same page sits at two heights in neighboring images. The "S" underline under Saturday is too subtle to read as "selected day".
Works: the chart, the reduction stat, the three token tiles with their icons, real-looking dates.
Fix, by impact:
1. Scale: scale the capture up about 110% so the card fills the panel width, matching screenshot 4's column.
2. Subline: "Daily watch time against the week before, and the drops and cards you used." is accurate but reads like a feature list. Try "Watch time by day, against last week. Most people see it drop." only if that's true; otherwise "Watch time by day, and what each drop and card went to."
3. Sample data: make the selected Saturday bar visibly highlighted (a brighter bar or a label above it), so the link between the bar and "Saturday, Nov 7 · 27m" below is obvious.

6. tile-c (drop + wordmark)

Up: clean, readable at any size, strong shape, good contrast. The drop's highlight stroke gives it a little character.
Down: it says nothing about what drip does. In a search list next to other extensions, "drip" and a water drop could be a hydration reminder, a weather app, or a drip-feed email tool. The drop is a generic water-drop shape, so the tile reads as a logo lockup, which is what an AI or a template produces by default.
Works: it'll stay legible at 220x140.
Fix: the tile needs a hint of YouTube-feed-limiting. Tile d does this best.

7. tile-d (with "One video at a time.")

Up: the only tile that tells you what the product is. The line is the same as screenshot 1's headline, so the tile and the first screenshot reinforce each other. Left-aligned under the wordmark, it looks deliberate.
Down: the line is about 14px tall at 440x280. Shown small in search results it'll be about 7px and unreadable, so at small size this tile degrades to tile c. The drop got bigger than in tile c and now sits lower than the wordmark's x-height center, so the lockup feels slightly bottom-heavy on the left.
Fix, by impact:
1. Make the tagline about 1.6x bigger (around 22 to 24px) and brighter, and shrink the wordmark a bit to make room. The tagline is the selling line; it should survive at half size.
2. Bring the drop back to tile c's size and align its vertical center with the wordmark plus tagline block.

8. tile-e (drop + gold card + wordmark)

Up: the gold adds color, and it introduces the second token.
Down: the card doesn't read as a card at this size. It's a tilted gold rounded rectangle with a darker edge, and it looks like a sticky note, a butter pat, or a sponge. It's jammed against the drop with no space, so the two shapes merge into one blob at small size. Without knowing the token system, the viewer gets no meaning from it. This tile looks more like a sticker sheet than a logo.
Fix: drop this direction. If you want the card in the tile, it has to read as "reveal a video" (for example, a card with a play triangle) and needs space around it, which pushes it toward a mini illustration and away from a logo tile.

The set

Order and story: yes, mostly. Image 1 says what replaces the feed, image 2 says what happens when time runs out. Together they cover the product. The weak spot is image 2's lock, which doesn't visibly sit on a video, so the "lock comes up over the video" point gets lost. Fix that and the first two images carry the listing.

Consistency:
- Panel content inset varies: 1 is a centered column at about x=664 to 1164; 3 and 4 run from x=589 to about 1230; 5 is x=653 to 1164; 2 is a centered card. Pick one left inset and width for the four UI frames (1, 3, 4, 5).
- Panel bottom: 1, 3, 4, 5 bleed off the bottom; 2 stops at about y=772 and has a stray line at its right edge.
- Vertical position of the page: Settings' tabs at y=217, History's at y=115. Crop both to start at the tab row at the same y.
- Caption length: headlines are consistent at one or two lines; sublines run one to two lines. Screenshot 3's one-line subline is the outlier and it's the empty one.
- Empty space: the left caption column is the same in all five, good. The bottom-left "drip" mark sits in the same spot each time, good. Screenshot 1 has the most dead panel space.
- Panel contrast against the frame is low in all five. One shared fix covers it.

Legibility at thumbnail size: headlines all survive. Sublines go gray and soft at the current #9aa-ish color; brighten them a step. Inside the panels, 1 (video card and Watch button) and 5 (blue bars) read; 3's option previews and 4's rows turn to texture; 2's lock card reads but the water doesn't. Tile c and e survive small; tile d's tagline doesn't yet.

Copy that reads generic or machine-made:
- Screenshot 5 subline "Daily watch time against the week before, and the drops and cards you used." is a feature list in sentence form.
- Screenshot 3 subline "Pick now, switch later in Settings." is filler and repeats the panel.
- Screenshot 2 subline's "With one on," clause is awkward but sounds human.
- Screenshot 4's "dry hours" is your own term used before it's explained. That's not AI-sounding, but it's jargon.
The headlines themselves are good and don't read as AI.

Rejection or misleading risk:
- "YouTube" appears only in text describing what drip works on, with no logo, which is fine. The screenshot 1 card copies YouTube's layout (three-dot menu, "views · 1w ago", duration badge) but nothing uses YouTube's logo, red, or name as branding. Keep it that way, and don't add a play button in YouTube red.
- Screenshot 3's caption "Search only, or add limits." describes two modes while the image shows three. Not a policy problem, but a small mismatch between claim and screen.
- Sample data looks plausible and internally consistent (7 cards, 4 drops of 15m = 1h, 48m dashed line matches its height on the chart). No claim looks inflated.
- Screenshot 2's clipped bubble and stray edge line look like render bugs; reviewers won't reject for that, but users will notice.

Top 5 fixes across the set:
1. Screenshot 2: put a dimmed video frame behind the lock and give the water a visible surface with bubbles in it; remove the clipped bubble and the stray line, and make the panel bleed off the bottom like the others.
2. All UI frames: set one panel content inset and scale (fill the panel width, about 589 to 1230), and crop Settings and History to start at the tab row at the same height. Screenshot 1 needs the biggest scale-up.
3. Screenshot 3: rewrite the caption to match three modes and replace the subline that repeats the panel; crop off the Next button and scale up the option cards.
4. Use tile d with a tagline about 1.6x larger and the drop resized to tile c's scale; drop tile e.
5. Screenshot 4: replace the subline with one that explains drops and dry hours, and crop off the in-panel "drip" header. Raise panel-versus-frame contrast and brighten subline color across all five.
