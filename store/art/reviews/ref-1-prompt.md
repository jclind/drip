You are one reviewer on a two-reviewer panel judging a set of Chrome Web Store listing images. Do not edit or create any files. Report only. Judge only what you see in the attached images.

## The product

drip is a Chrome extension that replaces YouTube's endless home feed with a search box or one recommended video at a time, with optional daily watch-time limits. Its tokens are a blue cartoon "drop" (15 minutes of watching by default) and a gold cartoon "card" (reveals one new video). When the minutes run out, a lock comes up over the paused video with blue water rising. The tone it aims for: a little character without being distracting. It's a small one-person project, not a company.

## The images, attached in this order

First, 13 reference images: ref-01.png to ref-13.png, all 1280x800. They are screenshots from top Chrome Web Store extensions, from several companies. They are the bar.

Then drip's set, the images under review:
1. screenshot-1.png (1280x800): the home page with one revealed video. The video thumbnail is a drawn illustration, since real YouTube thumbnails can't be used.
2. screenshot-2.png (1280x800): the lock screen that covers a video when the day's minutes run out.
3. screenshot-3.png (1280x800): the welcome page's mode choice.
4. screenshot-4.png (1280x800): the Settings tab.
5. screenshot-5.png (1280x800): the History tab, with a sample week.
6. tile-c2.png (440x280): the small promo tile, shown small in store search and category lists. None of the references is a tile, so judge it against what a tile has to do at that size.

Each drip screenshot is a frame: a cream caption panel on the left with a headline, a subline, and one or two notes (most with a leader line pointing at a real element), and on the right a full-height strip of the real extension page, rendered from drip's real code.

## Hard limits

These can't change, so don't ask for them:
- Only drip's real interface, captured from its code. No mock UI, and drip's own interface text and layout stay as they are.
- Claims must match the product. Nothing that promises an outcome.
- No YouTube logo. Sample data must be labeled or obviously sample.

Anything else can change: the frame, the caption copy (or having less of it), the crop and scale of the captured page, the illustration, the sample data, the layout of the frame.

A technical fact about screenshot 2: the lock in the strip is drawn with its water all the way up. Showing the water partway doesn't work: the paused video sits behind the lock's panel, and a water surface high enough to clear the panel leaves only blurred gray above it. The lock's blur is drip's real 20px blur, so anything drawn under it turns into soft color fields.

## What to report

Plain text. Be direct and critical. Don't pad with praise. If you think one of the questions below names a problem that isn't real, say so.

### Step 1: the references first

Before you look closely at drip's set, score the 13 references in one table:

| Ref | Design | AI look |
|---|---|---|
| 01 | n | n |
...

- Design: 1 to 10, where 10 is a top-tier store listing image.
- AI look: 1 to 10, where 1 looks made by a human designer with intent and 10 looks obviously AI-generated or templated.

Then, in a few lines: what the best references do that the weaker ones don't. Count roughly how much text a typical reference carries (headline, subline, labels, callouts).

### Step 2: drip's set on the same scale

Scores for drip's six, on the same scale as the references:

| Image | Design | AI look |
|---|---|---|
| 1 | n | n |
...

For each of drip's six, say where it sits against the references: above the middle of them, at the middle, or below. For any image below the middle, say specifically what would bring it up, concrete enough to act on (name the element and the change).

Then your verdict for the set:
- Ship: yes or no.
- Blocking fixes: changes that must happen before you'd ship it. Only real problems: wrong claims, things that look broken, things that would confuse a buyer. Not polish.

### Step 3: three questions from the owner

1. Text. Compared with how much text the references carry, is every caption, subline, note, and legend line on each drip frame needed? Go frame by frame and list exactly what you would cut or shorten, and what you would keep. If cutting a note would lose something a buyer needs, say what.
2. Screenshot 2. In the cream panel, a drawn water band ends at the seam between the panel and the strip with a wave crest, while the real lock to its right has no matching water surface at that height. Does that read as deliberate? If not, what should the band do instead (for example: end flat, be removed, continue as a drawn surface over the strip at the same height, something else)?
3. Tile c2. Does the two-line serif tagline "One video / at a time." under the wordmark read well at the tile's size? Would you change it, and how?

### Step 4: fixes

A ranked top-5 list of fixes across the whole set, most impact first, each naming the image, the element, and the change.
