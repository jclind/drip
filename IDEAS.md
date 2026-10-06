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
