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
- Charts and streaks built from the 90-day log.
- Search results have their own "Ask YouTube" chip in the filter row, which design C left alone (2026-10-15).
- "Your videos" in drip's menu could open Studio's videos list instead of its dashboard, if the channel id can be read from the page.
- The lock's "Next unlock back Friday at 9:14pm." sits right under "The glass refills at 4:00am." and reads as cluttered (Jesse, 2026-11-04). Give the two lines more room or a different weight, or fold them into one sentence. Polish, not urgent; the welcome tour's lock has the same pair.

## Welcome tour

- Arrows with a short label in the tour, pointing at what to watch. In the watching step, one could point at the glass's water draining while the "video" plays, so the step shows something happening instead of a still frame through the whole countdown. Jesse, 2026-10-12.
- Planned for 1.0 (RELEASE-PLAN.md, 2026-10-16). Jesse wants arrows or text that show what to look for, like the time counting down while the video plays, and more feeling that a video is playing. Three to mock up, which can mix: callouts that appear when the thing they point at moves and then go ("Your time drains while a video plays" at the pill), one or two per step; a player that looks like it's playing, with a moving progress bar, a running timecode, a picture with some motion, and a "90× speed" tag so the fast drain reads as on purpose; and a spotlight that dims the rest of the stage. Claude's guess is the first two together.

- A small animation in the tour's player while its video plays, so it feels like something is playing (Jesse, 2026-11-02, after the callouts round). Round 1's B of the tour callouts built one: the picture pans, soft lights drift, and a "90× speed" tag shows. The mockups are deleted; its CSS is the `.lv-` rules in `git show cdf07e5:designs/tour-callouts/variants.css`, and the markup is in `variants.js` at the same commit.

## Watching

- Background audio at half rate when the tab isn't visible.
- A "listening" mark that stops a video from draining minutes. It would still take a reveal or a backlog slot to get to it.

## Lighter modes

Decided 2026-10-14 as Quiet and Curated, beside Full drip. See "Modes" in DESIGN.md (Q29).

- A clock with YouTube's feeds left visible, for people who only want a time limit. Customize leaves it out of the first build, because the grid is what pulls you in.

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

- ★ The last drop. When the pill hits 0, one drop falls out of the pill's glass and the lock's water rises from where it lands, so the pill and the lock feel like one moment instead of two. Built on 2026-10-12 (DESIGN.md, "The glass's motion as built").
- ★ Pouring in. Buying +15m on the home page or the lock pours a short stream into the glass, and the water settles with one small wobble. On the lock it plays as the water drains. Built another way on 2026-10-12: one drop falls in and the water bobs (DESIGN.md, "The glass's motion as built").
- ★ Kept drops land. After "Done for now", the home page's "Kept 3 drops." has the three drops fall into the drop counter one at a time, and the count ticks up with a small bounce. This is the payoff for leaving, so it can be the most satisfying motion in drip. Built on 2026-10-13, with a gray "3 kept" tag in place of the line (DESIGN.md, "The counter's motion as built").
- ★ Save fills. The bookmark on the card and the pill fills from the bottom up in blue when saved, like the glass, and drains when unsaved. Built on 2026-10-13 (DESIGN.md, "The stash fill as built").
- ★ A new day. The first time the home page opens after the reset, the glass fills from empty with the day's minutes. As written it can't happen: the reset sets minutes to 0. The day's new drops landing in the counter fits with "Kept drops land" instead (2026-10-12). Built that way on 2026-10-13, with "4 new" and "10 new" tags (DESIGN.md, "The counter's motion as built").
- Pass sinks. The × sends the card down and out like it dropped into water, instead of vanishing. Reveal next could do the same before the new card rises. Built another way on 2026-10-12: the card turns face down and drops (DESIGN.md, "Reveal animation as built").
- Removing a Saved row evaporates it (a short blur and fade upward). Built on 2026-10-14, with Undo condensing it back instead of dripping it in (DESIGN.md, "Stash rows as built").
- The pill's water surface gets a tiny ripple each time a minute ticks off, so a glance shows it's draining without reading the number.
- In the last minute, the pill's water wobbles a little on top of the low-time shimmer. Still no red.
- Out for the day on the home page gets the lock's calm sea instead of a gray line: still water, one slow fish, and "The glass refills at 4:00am." Built on 2026-10-14, smaller and with no wave line (DESIGN.md, "Out for the day as built").
- "+2 saved from yesterday" at rollover trickles two drops into the counter.
- The popup's glass drifts gently while a video is playing in any tab and stays still otherwise, so the popup shows at a glance whether the clock is running.
- The toolbar icon shows the drop when idle and draws the glass at its current level while a YouTube video plays (`chrome.action.setIcon` from a canvas), including unlocked playback. Jesse chose the idle drop because it is more recognizable for now (2026-10-14). Built 2026-10-14; see [Toolbar glass as built](DESIGN.md) near "Popup and Settings as built".
- On the lock, clicking the open water sends a small ripple out from the click. A calm fidget, but it rewards lingering on the lock, which may cut against "the satisfying moment is leaving". Worth a try before deciding.
- Fish that drift away from the pointer on the lock. Cute; maybe too much to watch.
- A soft water "plip" on "Done for now", off by default. drip has no sound anywhere yet, so it's a bigger decision than it looks.
- Grace mode: while a video finishes on grace, the pill shows an empty glass with a faded outline at 35% opacity and "Finishing this one". Built on 2026-10-14 with the faded outline instead of a dotted one (DESIGN.md, "Grace on the pill as built").

## Settings page

- Unsaved changes get a banner that stays in view while you scroll, instead of only the "Not saved yet." line by Save. Leaving the page with changes unsaved asks first (Jesse, 2026-10-16). Built with the Settings regroup on 2026-10-16: a save bar at the bottom of the window.

## After 1.0

From the Settings review on 2026-10-16. Jesse liked these but put them past 1.0. Quiet hours, the channel lists, and export/import/reset went into 1.0 instead (RELEASE-PLAN.md).

- A different allowance on weekends. Same as "Different allowances per weekday" under Earning tokens.
- Switches for what drip hides: comments, Shorts, the sidebar menu, the end screen. Unhook is built on these. Each one is a leak someone can turn on at 1am, so maybe only "always show comments".
- Comments open when the video ends (Jesse, 2026-11-02: "I often find myself with such a bad attention span that I end up scrolling the comments while I am watching the video. I'm already on youtube, I should be able to give my full attention to a video."). Today's "Show comments" button would wait, in gray, saying "Comments open when the video ends", with no countdown. Claude's suggestions, not decided: it opens at the video's end or after about 90% watched, so credits don't hold it back; seeking to the end opens it too, a deliberate skip; a video already finished once opens at once; live streams are left alone. A switch, on by default, in every mode: on applies at once, and off waits for the reset (Q6), like the bell.
- A cooldown and a typed reason before pausing drip (under Friction).
- A "Reduce motion" switch that overrides the system setting.
- A page Chrome opens on uninstall (`chrome.runtime.setUninstallURL`) with one question, "Why are you leaving?". It needs a small hosted page (Claude's suggestion, 2026-10-16, with the Settings feedback link).
- Not worth it yet: syncing across devices, and notifications like "5 minutes left".

## Known races

- An older worker reply can overwrite newer saved state on a page (Codex, 2026-11-04). Tab A's status request is answered from a snapshot with 0 minutes, tab B buys minutes, A hears B's storage change and drops its lock, then A's older reply lands and `state = res.state` puts the 0-minute snapshot back, so the lock rises again. Every `state = res.state` in watch.js has it, and it predates Dry hours. The fix is a revision number the worker bumps on each save, and pages keep whichever state is newest.

## Efficiency

- An efficiency pass over the whole extension, which Jesse wants later, not now (2026-10-13). One known lead: the lock's water rise hitches every so often on the MacBook while the motion keeps its timing. On air it runs at 60fps (80 frames, the slowest 29ms, no long tasks). The rise animates `--drip-water`, a registered property, which moves `#drip-lock`'s mask and clip every frame. That repaints a full-window `backdrop-filter: blur(20px)` on the main thread, so any of YouTube's scripts can delay a frame. Running out mid-video also grows an ellipse clip (pour.js `riseFrom`), which costs more than the flat edge. Compare a watch page opened at 0 minutes, which rises flat, with minutes running out: if only the second hitches, the ellipse is the cause. Otherwise move the rise onto the compositor, with the water sliding up as a transform instead of being repainted.
