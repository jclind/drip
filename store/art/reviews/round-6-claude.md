| Image | Design | AI look |
|---|---|---|
| 1 | 7 | 3 |
| 2 | 6 | 4 |
| 3 | 7 | 3 |
| 4 | 7 | 3 |
| 5 | 7 | 3 |
| 6 | 6 | 4 |
| 7 | 5 | 4 |

Image 1, screenshot-1 (home, one revealed video)

To reach 9 and 2: fix the broken second leader, show a neutral first-run state instead of "Stashed", and give the frame one element that belongs to drip and not to a SaaS template. The cartoon drop and card are the product's character, and right now they only show up at icon size.

Up: the drawn ridge-trail thumbnail is good. It has a mood, it doesn't pretend to be a real YouTube thumbnail, and it gives the carousel its only picture. The headline is short and matches the product. The token counts in the header (34m, 2 drops, 7 cards) are visible on the very first image.
Down: the second leader ("One card reveals the next video.") bends where it crosses into the dark strip. It runs flat from the text, then angles down a few pixels to a dot at about y 666, which sits in the empty gap above the "Reveal next" button. It points at nothing. The "Stashed" button is in its active blue state, so a first-time viewer reads it as something they already did. The subline ends "one recommendation at a time" right under a headline that ends "at a time".

What works: the strip crop has even 80px margins left and right. The thumbnail and its title read clearly at full size. "Revealed from your own home feed." is the best leader in the set because it answers the question a skeptic would ask.

Fixes, by impact:
1. Second leader: make it one straight line and land the dot just left of the "Reveal next" pill, at about y 705, the way the other dots sit about 10px outside their targets.
2. Sample data: show the button in its unstashed default state.
3. Subline: drop the repeat of "at a time". For example: "drip swaps YouTube's home feed for one pick from it."
4. Leader 1: the dot sits in the black margin 12px left of the thumbnail. That's consistent with the other frames, so leave it, but check it doesn't read as a stray dot at carousel size.

Image 2, screenshot-2 (lock)

To reach 9 and 2: the subline promises "rising water", and the image never shows water. With the water all the way up, the strip is a navy blur with four bubbles, and that looks like a stock dark gradient. Stop the frame with a visible waterline across the strip, around 55 to 65 percent height, with the lighter blurred video above it and the blue water below. Then the image shows the idea instead of claiming it. Also fix the blur edges.

Down: on the left edge of the strip, x 560 to 600, there's a darker vertical band. CSS blur fades to transparent or black at the layer edge, and it looks like a rendering mistake. On the right edge at about y 300 to 380 there's a light gray smudge, probably the blurred cloud, cut off by the frame edge, and it reads as an artifact. The lock card is pushed up (top 203, bottom 591) with an empty band of bubbles below it, so it looks unbalanced. The bubbles are evenly sized and placed like a screensaver.
Up: the two leaders are the clearest in the set. "A spare drop buys 15 more minutes." and "Type a reason to unlock. Up to 3 a week." each tell the viewer a real rule in one line. "Limits are optional." is an honest, useful thing to put on the scariest image.

What works: the card's hierarchy, with the title, "1h watched today", and two clear choices. The leader dots land right on the two controls.

Fixes, by impact:
1. Water level: stop at a visible waterline, not full, so "rising water" is shown and the blurred ridge-trail video is recognizable above the line. That also ties images 1 and 2 together.
2. Blur edges: scale the blurred layer about 40px beyond the strip on every side, or clip after blurring, to remove the left band and the right-edge smudge.
3. Vertical balance: center the lock card in the strip, or put the waterline below the card so the empty lower third has a reason to exist.
4. Bubbles: vary the sizes (2 to 3 sizes) and cluster them near the waterline instead of scattering them evenly.

Image 3, screenshot-3 (mode choice)

To reach 9 and 2: cut the leader that repeats the card's own text, tighten the strip's top margin, and make the three mode thumbnails readable or crop so they're bigger.

Down: "Default: an hour and 10 reveals a day." says the same thing as the Full drip card's own line, "1h of watching and 10 new videos a day". The colon-label form and "reveals" as a noun read awkwardly. The other frames call them cards, so this is a third word for the same token. The strip content starts at y 155 and ends at 733, so there's a 140px empty black band at the top and a 67px one at the bottom. The mini preview thumbnails in each card are tiny and gray, and at carousel size they're noise. The subline "Change it later" duplicates the page's "You can change this in Settings".
Up: "No clock, and no cost per video." is good copy. It says what Curated leaves out, which the card itself doesn't. The selected Full drip card with the "Recommended" chip gives the strip a clear focal point.

Fixes, by impact:
1. Leader 2: replace it with something the card doesn't say, such as what a card or drop is ("A drop is 15 minutes. A card shows one more video."). That also teaches the tokens before images 4 and 5 rely on them.
2. Crop: move the content up so the top and bottom margins match (about 100px each), or scale it up about 8 percent to fill the strip.
3. Subline: drop "Change it later." The page says it. Use the space to name the three modes the way the cards do: "Quiet, Curated, or Full drip."
4. Headline sits on one line, so this subline starts at y 179 while the others start at 235. Either accept it or set the subline at 235 on every frame for a fixed rhythm.

Image 4, screenshot-4 (Settings)

To reach 9 and 2: this frame is solid but generic. "Set a daily limit." describes every screen-time app. Give the headline drip's own vocabulary and fix the strip inset so it matches the others.

Down: the strip runs edge to edge with 28px margins, tighter than any other frame. The tabs touch the top area with no page header, so it reads as a crop from somewhere rather than a framed page. The bottom 90px of the strip is empty. Leader 2, "Drops can't be spent from 11pm to 6am.", restates the visible "Starts at 11:00pm / Ends at 6:00am" rows.
Up: the subline "Stricter settings apply now. Looser ones wait until tomorrow." is the best subline in the set. It's specific, and it tells you something about how drip works that no competitor screenshot would say. "Four drops of 15 minutes is an hour a day." explains the math right where the controls are.

Fixes, by impact:
1. Headline: something only drip would say, for example "Four drops a day." or "Pick your hour." It pairs with leader 1.
2. Leader 2: say why dry hours exist instead of reading the times back, e.g. "No watching after 11pm. Unspent drops come back."
3. Crop and scale: match the horizontal inset used in the other frames (pick one value, see the set notes) and center the content vertically. Right now it starts at 150 and ends at 706.

Image 5, screenshot-5 (History)

To reach 9 and 2: the same comparison shows up three times (subline, leader 1, and the chart's own legend). The strip also uses a different treatment, a floating rounded card on black, that no other frame uses.

Down: the subline "against the week before", leader 1 "Dashed line: 48m a day the week before.", and the legend "The week before's average · 48m" all say the same thing. "Tap a day" is phone language for a desktop extension. "Last week, day by day, against the week before." has a three-beat cadence that reads machine-written. The panel is a lighter #2a card with about 55px of black on each side, so it looks like a modal and not like the full-height page strip the other frames show.
Up: the sample data holds together. Bars average about 41m, 48m to 41m is the 15 percent drop shown, Nov 7 2026 is a Saturday, 2 drops covers 27m, and 1 + 2 + 4 = 7 cards. The blue bars are the strongest color moment in the set and help the thumbnail stand out.

Fixes, by impact:
1. Leader 1: point it at the "15% from the week before" figure instead, with copy that adds meaning, e.g. "Down 7 minutes a day from the week before." Let the chart legend explain the dashed line.
2. Leader 2: "Click a day to see its drops and cards."
3. Subline: one plain sentence, e.g. "Your week, one bar per day."
4. Crop: either show the page at the same inset as the other strips, or, if the card is drip's real layout, scale it so its margins match image 2's lock card. Then two frames use the card treatment on purpose and not just one.

Image 6, tile-c (drop, wordmark, line)

To reach 9 and 2: the drop is a generic clip-art teardrop with a white highlight stroke, the most "stock icon" element in the set. The tagline in serif is wider than the wordmark above it, so the lockup ends in a ragged right edge.

Down: the drop's highlight curve and plain gradient-free blue look like an emoji or a default icon pack. The serif tagline at about 22px will be roughly 11px tall in search results and gets thin. Sans wordmark plus serif tagline matches the screenshots, which is good, but the tagline overhangs "drip" by about 115px.
Up: it says what the product does, and the name alone doesn't. The beige ties it to the screenshots.

Fixes, by impact:
1. Illustration: draw the drop with the character the product describes (a slight lean, a face, or the drop mid-fall above a small splash), so the tile carries the "little character" tone.
2. Lockup: size the tagline so its width matches the wordmark, or set it on two lines ("One video / at a time."), and bump the weight one step so it survives at small size.
3. Pick this tile over tile-p.

Image 7, tile-p (drop and wordmark alone)

To reach 9 and 2: as is, it's a centered logo on a flat background, which is the most template-looking layout there is. Store search already prints the name next to the tile, so this tile adds no information.

Down: nothing says YouTube, video, or limits. Same clip-art drop as tile-c.
Up: very legible at any size. Clean spacing.

Fixes: use tile-c. If tile-p is kept, it needs the redrawn drop and some cue of what it does, e.g. a small gold card beside the drop.

The set

Story in the first two: mostly. Image 1 says "one video at a time" and image 2 says "a lock when time runs out", so the two ideas land. The gap is that image 1 shows drops and cards in its header without saying what a drop is, and drops aren't explained until image 2's leader and image 4. Image 3's leader is the cheapest place to fix that, but image 3 comes too late for anyone who only looks at two. Consider making image 1's first leader about the header ("34 minutes and 7 cards left today.") and keeping the thumbnail leader second.

Consistency: the left half is consistent. Same headline position, same logo position, leaders in the same style. The right strip isn't. Horizontal insets are about 80 (1), 36 (2, card), 37 (3), 28 (4), and 55 (5, card). Top of content is 67, 203, 155, 150, and 39. Pick one inset (about 40px) and one vertical rule (centered), and apply it to all five. Sublines start at 235 on four frames and 179 on image 3. Every frame leaves a dead zone between the subline and the first leader, and between the last leader and the logo. That's fine as breathing room, but with the leaders at different heights each time, it reads as accidental. Caption lengths are even (two short lines each), which is good.

Thumbnail legibility: at carousel thumbnail size, the serif headlines survive and nothing else does. Images 3 and 4 shrink to near-identical dark gray rectangles. Image 2 shrinks to a dark navy block. Image 1's illustration and image 5's blue bars are the only right halves you can tell apart. Showing the waterline in image 2 would add a third. The leader text at 15px is unreadable at thumbnail size, which is expected. Just don't put anything important only in leaders.

Copy that reads as AI-written or generic:
- "Last week, day by day, against the week before." (three-beat cadence)
- "See where the time went." and "Set a daily limit." (stock screen-time-app lines)
- "Default: an hour and 10 reveals a day." and "Dashed line: 48m a day the week before." (colon-label form)
- "Tap a day..." (wrong verb for desktop)
- Image 1's subline repeating "at a time"
The lines that read human and specific are "Revealed from your own home feed.", "No clock, and no cost per video.", "Stricter settings apply now. Looser ones wait until tomorrow.", and "Type a reason to unlock. Up to 3 a week." Write the weak ones to that standard.

Rejection and misleading risks: no YouTube logo or real thumbnails, and "YouTube's" appears only as plain descriptive text, which is acceptable. The drawn thumbnail with a "21:35" badge and "1.2M views" metadata imitates YouTube's card layout, but it's clearly drip's own UI, so the risk is low. "Trail Days" is the name of a real festival, and a made-up channel name with no real-world match would be safer. Image 2's subline promises rising water the image doesn't show. That's a mismatch more than a policy problem, but reviewers and users notice claims the image doesn't back up. Image 1's "Stashed" state implies an action the viewer didn't take. Sizes are correct (1280x800, 440x280).

Top 5 fixes across the set:
1. Image 2: stop the water at a visible waterline, and fix the blur edge band on the left and the smudge on the right.
2. Unify the right strip's horizontal inset and vertical centering across all five frames.
3. Image 1: straighten the second leader and land it on "Reveal next". Show "Stash" unpressed.
4. Remove repeated leaders and reuse that space to teach the tokens: image 3's leader 2 (explain drop and card), image 5's leader 1 (point at the 15 percent change), image 4's leader 2 (why dry hours exist).
5. Redraw the drop mark with some character, and use it in tile-c with a tagline sized to the wordmark. Drop tile-p.
