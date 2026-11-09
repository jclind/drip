| Image | Design | AI look |
|---|---|---|
| 1 | 7 | 4 |
| 2 | 5 | 4 |
| 3 | 6 | 4 |
| 4 | 6 | 5 |
| 5 | 7 | 4 |
| 6 | 5 | 5 |

IMAGE 1: home page, one revealed video

Up: The caption "One video at a time." says the product's idea in five words, and the panel shows exactly that, one card on an empty page. The drawn thumbnail is moody and specific (storm light, a lone rider on a trail), so it doesn't read as stock art. The 34m / drop / card header introduces both tokens before any other image does.
Down: The sample data contradicts the rest of the set. The header shows 15 drops and 12 cards, but screenshot 4 sets 4 drops per day and screenshot 3 says 10 videos a day. A careful viewer will wonder why they have 15 drops and only 34 minutes. The panel has a lot of dead black around a fairly small card. Roughly 140px of empty panel sits left of the card and the same on the right. "Stashed" renders in a lighter pressed state, so it looks already selected, which pulls the eye away from Watch.
Works: The single centered card against black makes the restraint feel deliberate. The clean caption hierarchy. The token icons are small and legible.
Fix, by impact:
1. Header sample data: change 15 drops / 12 cards to numbers that fit a 4-drop, 10-card day, e.g. 2 drops and 7 cards with 34m left.
2. Panel scale: zoom the captured page about 110 to 115% so the card fills more of the panel and the header and buttons survive thumbnail size.
3. Sample state: show Stashed unpressed if the sample state allows it, so Watch is the one bright target.
4. Subline: "drip replaces the home feed with one video, and only when you ask for it." The comma before "and only" reads awkwardly. Try "drip swaps the home feed for one video, shown only when you ask."

IMAGE 2: lock screen

Up: The caption "Out of minutes? The lock comes up." is clear. The subline "or you call it a day" has some voice. The "3 left this week" and "1h watched today" lines agree with screenshots 3 and 4.
Down: The lock's text renders in what looks like Arial or Helvetica while every other panel is Roboto. It looks like a font fallback and makes this image feel like a different product. A clipped fragment of a word ("ch", probably a Search button) shows at the right edge around x=1240, y=260 behind the blur, and it reads as a rendering glitch. The rising water, the most characterful thing in drip, doesn't read as water. It's a soft blue glow band with no surface line, and the two hand-placed bubbles are gray dots in the corners, one cut off by the edge. A small bright blue sparkle sits on the top edge of "Done for now" and looks like a stray artifact. Both buttons carry blue rings, so it reads like a focus state was captured. The panel frame also differs from the others: its border is faint, and it seems to end above the image bottom instead of bleeding off.
Works: The modal is centered and simple. "Done for now" is the dominant button, which matches the tone.
Fix, by impact:
1. Font: if the capture lacks the font the real lock uses, load it for the capture. If the real lock really shows the system font on YouTube, keep it but say so to yourself and accept the mismatch.
2. Clipped "ch": crop or shift the sample page behind the lock so no partial words show at the panel edge.
3. Water: stop the animation at a higher level with a visible surface edge across the panel, and place the bubbles inside the water, not floating in dark space at the top corner.
4. Remove the blue sparkle on the "Done for now" border, and capture without focus rings if those are from focus and not the design.
5. Panel frame: match the border and bottom bleed of the other four frames.

IMAGE 3: welcome page mode choice

Up: Three options with small preview diagrams is a good way to show range. "Recommended" on Full drip helps a skimmer.
Down: The panel is dense. Body text is around 13 to 14px at 1280 wide and turns to gray lines at thumbnail size. The subline repeats what the three cards already say, almost word for word, so the left column adds nothing. The caption "Start with search only, or go further." is fine but a bit generic. The preview diagrams are tiny and hard to parse even at full size.
Works: The selected state with the blue border is clear. The panel fills its frame better than image 1.
Fix, by impact:
1. Subline: replace the restatement with something the panel doesn't say, e.g. "Pick one on install. Switch any time in Settings."
2. Crop and scale: crop to the three cards (drop the heading line and the Next button) and scale up about 115% so the option names and descriptions read in the carousel.
3. Caption: consider "Three levels. Pick how strict." or similar, shorter and more concrete.

IMAGE 4: Settings tab

Up: The subline "Stricter settings apply now. Looser ones wait until tomorrow." is the most specific, human copy in the set. It tells you something about the design you wouldn't guess. The sample values (4 drops, 15m, 11pm to 6am, 3 per week) are coherent with images 2 and 3.
Down: "Set your own limits." is the caption every screen-time app uses. It's the most templated line in the set. The panel is a long settings form with small text, so at thumbnail size it is a column of toggles. A divider and empty band sit at the bottom. The content column starts at x=619 while image 5's starts at x=643, so the two Settings-family frames don't line up.
Works: The toggles and steppers read clearly at full size, and the drop icon in the stepper ties the token in.
Fix, by impact:
1. Caption: make it specific to drip, e.g. "Pick your drops." or "Your day, in drops."
2. Crop: show fewer rows (Mode through Dry hours) at a larger scale so they fill the panel and stay legible.
3. Alignment: match the content's left edge and tab baseline to image 5.

IMAGE 5: History tab

Up: A real chart with coherent data. The bars match the 2h scale, Saturday's bar matches 27m, 41m against 48m is about 15% down, and 2 drops covers 27m. The three token tiles at the bottom are the clearest view of drops and cards in the set.
Down: The caption breaks as "See where the time" / "went.", leaving a one-word orphan. The card runs to within about 14px of the image bottom, which feels cramped next to the generous top. Body text is small again.
Works: The blue bars on dark gray are the best-looking panel content in the set. The dashed comparison line is easy to read.
Fix, by impact:
1. Caption orphan: rebreak or reword so line 2 carries more than one word, e.g. "See where your time went." with the break after "where", or a shorter line like "Where the time went."
2. Crop: shift the capture up or scale down slightly so the card's bottom has breathing room, or crop off the footnote line "Of 7 cards...".
3. Alignment: match image 4's content left edge.

IMAGE 6: promo tile c

Up: Clean, high contrast, legible at any size. The drop is friendly without being cute.
Down: It's a logo on a flat background and nothing else. In a search list next to other extensions it says nothing about YouTube, feeds, or limits, so it relies on the title alone. The wordmark is a stock bold sans with no adjustment. The highlight stroke inside the drop sits low and left and can read as a smile or a scratch at small size. A drop plus wordmark on navy is very close to the default output of any logo generator, so it scores middling on AI look.
Works: The color is consistent with the frames' drip mark and accent. Simple and confident.
Fix, by impact:
1. Add one hint of function, such as the gold card token beside the drop, or a short line under the wordmark like "One video at a time."
2. Move the highlight stroke to the upper left of the drop, where light would hit, so it reads as a shine.
3. Tighten the letter spacing on the wordmark or adjust one letterform so it looks drawn for drip.

THE SET

Story in the first one or two images: Yes, mostly. Image 1 says what drip does and image 2 shows the consequence. Image 2 is the weakest-executed frame, though, and it's in the second slot, the one most people see after the first. Fixing its glitches matters more than any other image's polish.

Consistency: The frame is consistent. Caption at x=72, vertical centering, drip mark bottom left, panel starting at about x=537, y=65. The panel content is not. Image 1 floats a small card in black, image 3 runs to the right edge, images 4 and 5 sit in different columns (619 vs 643), and image 2's panel border and bottom edge differ. Caption length varies from one line (1, 4) to two (2, 3, 5), which is fine, but image 5's orphan breaks the rhythm. The left column's lower half is empty in every frame. That's fine as breathing room, but combined with sparse panels in 1 and 2 the set feels underfilled.

Legibility at thumbnail size: Captions hold up. Panel text doesn't in 3, 4, and 5, where body copy is 12 to 14px at full size. Image 1 and image 5's chart survive best. Scaling the captured pages up and cropping to the important part is the biggest legibility gain.

Copy flags: "Set your own limits." is generic screen-time copy. "Start with search only, or go further." leans generic. Image 3's subline restates the panel. "See where the time went." is a stock phrase but acceptable. The strongest lines are image 4's subline and "or you call it a day."

Rejection or misleading risk: No YouTube logo or red play mark is visible, which is good. "YouTube" in image 3's UI text is nominative use and should be fine. The fake video card copies YouTube's card layout (title, kebab menu, channel, views, age, duration badge). That's acceptable since it's the real extension running on YouTube, but keep the illustration clearly drawn so nobody mistakes it for a real video. The sample data mismatch in image 1 (15 drops, 12 cards vs 4 a day and 10 a day elsewhere) could read as misleading about how many minutes you get. Image 2's glitches won't get a rejection but look like a broken capture.

Top 5 fixes across the set:
1. Image 2: fix the font fallback, remove the clipped "ch" fragment and the blue sparkle, and make the water read as water with a visible surface.
2. Image 1: change the header sample data to fit a 4-drop, 10-card day.
3. Images 3, 4, 5: crop to the key part of each page and scale up so body text survives thumbnails, and align images 4 and 5 to the same content column.
4. Captions: replace "Set your own limits." with drip-specific copy, fix the "went." orphan in image 5, and rewrite image 3's subline so it doesn't repeat the panel.
5. Tile: add one cue to what drip does (the card token or a short line), and move the drop's highlight to the upper left.
