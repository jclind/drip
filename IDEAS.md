# Ideas

Things that came up while designing drip and didn't make v1. Nothing here is promised.

## Earning tokens

- Tasks that earn tokens. Honor system first ("did 20 pushups, +1 watch token"), defined in settings. Jesse pointed out the whole extension is already the honor system, so the question is how much friction a task claim needs.
- Tasks checked against something real, like a finished item in the Global Todo list or a logged night in sleep-phone-reset. This would need a small local endpoint on air the extension can ask.
- Different allowances per weekday, like more on weekends.
- Debt mode. Keep watching and tomorrow's allowance shrinks to pay for it. Ruled out for v1 because it's easy to talk yourself past at 1am.

## What you see

- Thumbnails in the backlog as a setting. Jesse noted they sometimes carry real information.
- Channel page grids, if they turn into a leak. Going to a channel is deliberate, so they're allowed for now.
- The notification bell.
- Charts and streaks built from the 90-day log.

## Watching

- Background audio at half rate when the tab isn't visible.
- A "listening" mark that stops a video from draining minutes. It would still take a reveal or a backlog slot to get to it.

## Friction

- A cooldown and a typed reason before you can pause the extension.
- Incognito and the iPhone app skip drip entirely. Chrome only runs it in incognito if you allow it, which is a bypass by itself.

## Publishing

- Chrome Web Store listing. Google's branding rules don't allow "YouTube" in the name.
- A Firefox build.
- Move to WXT for TypeScript, hot reload, a React settings page, and store zips. Do it when settings outgrow one page or publishing gets serious.

## Feed sources

- Explore as a third reveal source. On 2026-10-06, `/feed/explore` loaded in a frame came back titled "Home - YouTube" with the home grid, so there's no separate Explore feed to read. Topic pages like `/gaming` might work as sources, one at a time.
- Put the feed source back on the Settings page if the toggle on the token page isn't enough. Removed 2026-10-06.

## Playlists

- A setting to stop a playlist or mix after each video. For now a playlist moves on by itself, because you chose to start it and each video still goes through the watch clock. Swallowing the player's `ended` event in guard.js stopped nothing on a real playlist (tried 2026-10-06), so YouTube advances some other way. Find that first. Raised 2026-10-06.

## Motion and small touches

Claude's brainstorm, 2026-10-10, after Jesse asked where else subtle animation could help. Some overlap with "Ideas, not decided" in DESIGN.md, which already has the reveal ripple, the drop falling into the glass on +15m, and rolling counts. Starred ones are Claude's picks for the animation pass.

- ★ The last drop. When the pill hits 0, one drop falls out of the pill's glass and the lock's water rises from where it lands, so the pill and the lock feel like one moment instead of two.
- ★ Pouring in. Buying +15m on the home page or the lock pours a short stream into the glass, and the water settles with one small wobble. On the lock it plays as the water drains.
- ★ Kept drops land. After "Done for now", the home page's "Kept 3 drops." has the three drops fall into the drop counter one at a time, and the count ticks up with a small bounce. This is the payoff for leaving, so it can be the most satisfying motion in drip.
- ★ Save fills. The bookmark on the card and the pill fills from the bottom up in blue when saved, like the glass, and drains when unsaved.
- ★ A new day. The first time the home page opens after the reset, the glass fills from empty with the day's minutes.
- Pass sinks. The × sends the card down and out like it dropped into water, instead of vanishing. Reveal next could do the same before the new card rises.
- Removing a Saved row evaporates it (a short blur and fade upward), and Undo drips it back in.
- The pill's water surface gets a tiny ripple each time a minute ticks off, so a glance shows it's draining without reading the number.
- In the last minute, the pill's water wobbles a little on top of the low-time shimmer. Still no red.
- Out for the day on the home page gets the lock's calm sea instead of a gray line: still water, one slow fish, and "The glass refills at 4:00am." This is the redesign DESIGN.md asks for ("a good place to stop").
- "+2 saved from yesterday" at rollover trickles two drops into the counter.
- The popup's glass drifts gently while a video is playing in any tab and stays still otherwise, so the popup shows at a glance whether the clock is running.
- The toolbar icon draws the glass at its current level (`chrome.action.setIcon` from a canvas), so minutes left show without opening anything. Not an animation, but the same idea.
- On the lock, clicking the open water sends a small ripple out from the click. A calm fidget, but it rewards lingering on the lock, which may cut against "the satisfying moment is leaving". Worth a try before deciding.
- Fish that drift away from the pointer on the lock. Cute; maybe too much to watch.
- A soft water "plip" on "Done for now", off by default. drip has no sound anywhere yet, so it's a bigger decision than it looks.
- Grace mode: while a video finishes on grace, the pill shows an empty glass with a dotted outline and "Finishing this one".
