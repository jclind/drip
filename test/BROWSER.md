# Browser checklist

What `node --test` can't cover: YouTube's real pages. Run it before a release and after any YouTube markup fix, on a computer whose Chrome window is visible. air's window is hidden, so videos there never play and lazy pages load little.

Start from a reloaded extension and refreshed YouTube tabs. With Developer mode on in Settings, the dev panel (bottom left) sets minutes and tokens, and its Run reset now does what the daily reset does, so items 11, 18, and 29 don't need to wait for a real day. Each line is an action, then what should happen. Note any line that fails, with the date.

## Token page

1. Open youtube.com. The page fades in, there's no video grid or chip bar, and the home page shows the glass, minutes left, the drop and card counts, +15m and Reveal video with their prices, and Stash open on 3 rows.
2. Click Reveal video. A gray placeholder holds the card's place, then one card appears with a thumbnail, title, channel, and length, and cards drop by 1. +15m and Reveal video go, and Stash collapses to its header.
3. Click Stash. The card stays up, the button says Stashed, and the Stash list's count goes up by 1. Click Stashed and it comes back out. Click Reveal next. A new card takes this one's place, cards drop by 1, and the first card is gone for good. Click ×. The card goes and the empty page comes back.
4. In Settings, set Reveal from to Subscriptions, then click Reveal video on the home page. "Checking your subscriptions…" shows, then a card from a subscribed channel, or "Nothing new from your subscriptions" with no card spent.
5. Open a second YouTube tab and play a video in it. Back on the home page, hover a button and click it a few times. Every click works, and the button doesn't flicker. Double-click +15m: it buys one drop, not two. Double-click × on a card: the card goes, with no error. With reduced motion on (System Settings, Accessibility, Display), Tab to +15m and hold Enter for two seconds: it buys one drop. Do the same on the lock screen's +15m.
6. With 0 minutes and a card up, Watch reads "Watch · -1" with a drop. Clicking it spends a drop and the video plays. Stash rows show "-1" and a drop by their play icon, and work the same way.
7. Hover a Stash row and click its ×. The row reads "Removed · Undo" for 5 seconds. Undo puts it back where it was.
8. With YouTube in light mode and in dark mode, the page reads well: the glass outline is visible, Watch is black in light and white in dark, and Reveal video stays gold.
9. Narrow the window until the column is under 380px. Nothing overflows, and Stash shrinks to its icon.

## Watch page and clock

10. With 0 minutes left, open a watch page. The video never starts, not even for a moment. The water rises and the lock says "Time for a breather." with drops left, or "You've had your fill." with none.
11. Click +15m on the lock. The water drains, the video plays, and the pill says about 15m left.
12. Let it play 2 minutes. The pill counts down, and Today's minutes in Settings' History rise by 2.
13. Click Stash on the pill while the video plays, five times in a row on five videos. Every click works.
14. The page opens in theater mode. There's no sidebar, and the end screen shows no suggestions. The title, channel row, and description sit centered under the video, in theater and default mode. There's no Join and no "Shop the ... store" shelf, and the buttons are Like, Share, Save, Download, and "...". Expand the description: the transcript is there, but no game card and no channel card. Open the transcript, and the column on the right comes back; close it, and the page centers again. A playlist's queue and a live stream's chat keep their column. A hashtag in the description opens the drip page.
15. Comments are hidden behind Show comments. Clicking it shows them for this video only. The next video hides them again.
16. In fullscreen, the player has no Comments button.
17. Let the minutes run out while a video plays, with grace mode off. It pauses within a second or two of 0 and the lock shows.
18. Turn grace mode on (it applies at the next reset). The next day, run out of minutes mid-video. That video finishes, and opening another video shows the lock.
19. With minutes left, play two videos in two tabs for a minute. The minutes go down by about one minute, not two.
20. On the lock, click I need this one, type a reason, and unlock. The video plays, the pill says Unlocked, and the reason shows under Why you needed one in Settings.
21. On the lock with drops left, hover Done for now: thin blue rings leave the button. Click it: rings cross the panel, the water falls away onto the home page with no blank page between, the kept drops fall into the drop counter one at a time as the count rolls up, and a gray "N kept" tag slides out beside it for 3 seconds. Do it twice in one tab; the second time home was already built, and the drops still land. Then Run reset now in the dev panel: the new drops fall in with an "N new" tag, and the cards spin up with their own. Refresh: nothing lands again.

## Redirects and blocking

22. Open a `/shorts/` link. It opens as a normal watch page.
23. Open `/feed/subscriptions`, `/feed/explore`, and `/gaming`. Each lands on the token page.
24. Open `m.youtube.com`. It moves to `www.youtube.com`.
25. Open a YouTube embed on another site, such as a news article. It plays without drip.
26. Search for something. At most 10 results show, with no Shorts or "People also watched" shelves, each has a Stash button, and More results shows the next 10.

## Pages

27. The popup shows the glass, minutes left, and both balances, in Chrome's light and dark theme. Settings opens Settings. With a YouTube tab open in another window, Open YouTube brings that tab forward; with none open, it opens youtube.com in a new tab.
28. In Settings, click + on Save unspent for and click Save. The stepper stays at 3 days, a gray "2 days until 4:00am · Undo" chip appears by the label, and the save bar says "Saved. 1 change starts at 4:00am." for a moment. Undo removes the chip and puts the stepper back at 2. Lower Drops per day and save, and it applies at once with no chip.
29. Tab to a stepper's number and use the arrow keys, Home, and End. − dims at the minimum and + at the maximum.
30. Turn Developer mode on, then pick each profile under "Show Settings with". Each shows the sample banner, and nothing overflows. Back on Your data, your real settings are unchanged.
31. History shows this week's bars with today's letter bold, the daily average, and last week's dashed line. ‹ steps back a week and the label and every number follow. Click a bar: the block below names that day and shows its drops, cards, and unlocks. Narrow the window to phone width: nothing overflows.

## Welcome page

32. Open `chrome-extension://<drip's id>/src/welcome/welcome.html`. It opens on the mode choice alone, with Full drip picked. Next opens "How Full drip works", whose first two sentences show the defaults: 4 drops a day at 15m each, and 10 cards a day. Change and Back on the first step go to the choice, and so does the browser's Back. A reload keeps the step (`#tour-3`). Go through all five steps: +15m fills the glass, Reveal video shows a card, Watch opens the player, Play drains the pill until the lock rises, and Done for now falls away to the home page, where the kept drops land with an "N kept" tag. The stage stays the same height on every step, so Next never moves. Step 5's table lines up in columns, and at a narrow window it stacks with nothing cut off. Then Open YouTube on the last step goes to youtube.com. The popup shows the same drops and minutes as before the tour.

## After a day boundary

33. Leave a token page open past the reset hour. Within a second of the reset, its balances update without a refresh.

## Top bar and menu

34. On any YouTube page, at any window width, there's no sidebar and no icon strip down the left, and the page uses the full width. The top bar has no Create, no Ask YouTube, and no bell, and the search box says "Search". Logged out, Sign in still shows.
35. Click the menu button at the top left. drip's menu drops under it: Home; You, History, Playlists, Watch later, Liked videos, Your videos, Downloads; Channels. Each link opens its page, and Channels opens the list of your subscriptions. A click outside, Escape, or a page change closes the menu. Tab to the button and press Enter: the menu opens with Home focused, and Escape puts focus back on the button.
36. In Settings, turn off Hide the notification bell and save. It waits for the reset with a gray chip; after Run reset now, the bell is back. Turning it on again hides the bell at once.
37. In Settings, turn off Watch time. Its rows fold away under the header, which reads "Off. Videos play with no clock.", and Tab skips them. A bar at the bottom says "1 change not saved" with Undo all and Save. Scroll the page: the bar stays in view. Try to close the tab, and Chrome asks first. Click Undo all: the rows come back and the bar goes.
38. In Settings at a phone width (DevTools, 390px), Cards per day with Counted puts its two controls on a line under the label, and nothing runs off the right edge. With Unlimited, the picker sits beside the label.
39. A week after install, in Settings on Full drip, pick Quiet and save. The four switches stay off and their sections stay folded, each header has "On until 4:00am · Undo" (Cards: "Counted until 4:00am"), the mode row says "Quiet from 4:00am. Until then, Full drip.", and the save bar says "Saved. Quiet starts at 4:00am." YouTube still runs Full drip until the reset. Undo on Watch time turns its switch back on and the mode row reads "Your own mix from 4:00am". Pick Curated and save: Search and Stash come back on at once, and the line reads "Curated from 4:00am."
