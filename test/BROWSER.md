# Browser checklist

What `node --test` can't cover: YouTube's real pages. Run it before a release and after any YouTube markup fix, on a computer whose Chrome window is visible. air's window is hidden, so videos there never play and lazy pages load little.

Start from a reloaded extension and refreshed YouTube tabs. With Developer mode on in Settings, the dev panel (bottom left) sets minutes and tokens, and its Run reset now does what the daily reset does, so items 11, 18, and 29 don't need to wait for a real day. Each line is an action, then what should happen. Note any line that fails, with the date.

## Token page

1. Open youtube.com. The page fades in, there's no video grid or chip bar, and the home page shows the glass, minutes left, the drop and card counts, +15m and Reveal video with their prices, and Stash open on 3 rows.
2. Click Reveal video. A gray placeholder holds the card's place, then one card appears with a thumbnail, title, channel, and length, and cards drop by 1. +15m and Reveal video go, and Stash collapses to its header.
3. Click Stash. The card stays up, the button says Stashed, and the Stash list's count goes up by 1. Click Stashed and it comes back out. Click Reveal next. A new card takes this one's place, cards drop by 1, and the first card is gone for good. Click ×. The card goes and the empty page comes back.
4. In Settings, set Reveal from to Subscriptions, then click Reveal video on the home page. "Checking your subscriptions…" shows, then a card from a subscribed channel, or "Nothing new from your subscriptions" with no card spent.
5. Open a second YouTube tab and play a video in it. Back on the home page, hover a button and click it a few times. Every click works, and the button doesn't flicker.
6. With 0 minutes and a card up, Watch reads "Watch · -1" with a drop. Clicking it spends a drop and the video plays. Stash rows show "-1" and a drop by their play icon, and work the same way.
7. Hover a Stash row and click its ×. The row reads "Removed · Undo" for 5 seconds. Undo puts it back where it was.
8. With YouTube in light mode and in dark mode, the page reads well: the glass outline is visible, Watch is black in light and white in dark, and Reveal video stays gold.
9. Narrow the window until the column is under 380px. Nothing overflows, and Stash shrinks to its icon.

## Watch page and clock

10. With 0 minutes left, open a watch page. The video never starts, not even for a moment. The water rises and the lock says "Time for a breather." with drops left, or "You've had your fill." with none.
11. Click +15m on the lock. The water drains, the video plays, and the pill says about 15m left.
12. Let it play 2 minutes. The pill counts down, and Today's minutes in Settings' History rise by 2.
13. Click Stash on the pill while the video plays, five times in a row on five videos. Every click works.
14. The page opens in theater mode. There's no sidebar, and the end screen shows no suggestions.
15. Comments are hidden behind Show comments. Clicking it shows them for this video only. The next video hides them again.
16. In fullscreen, the player has no Comments button.
17. Let the minutes run out while a video plays, with grace mode off. It pauses within a second or two of 0 and the lock shows.
18. Turn grace mode on (it applies at the next reset). The next day, run out of minutes mid-video. That video finishes, and opening another video shows the lock.
19. With minutes left, play two videos in two tabs for a minute. The minutes go down by about one minute, not two.
20. On the lock, click I need this one, type a reason, and unlock. The video plays, the pill says Unlocked, and the reason shows under Why you needed one in Settings.
21. On the lock with drops left, hover Done for now: thin blue rings leave the button. Click it: rings cross the panel, the water falls away onto the home page with no blank page between, and "Kept N drops." rises in. Do it twice in one tab; the second time home was already built, and the message still shows.

## Redirects and blocking

22. Open a `/shorts/` link. It opens as a normal watch page.
23. Open `/feed/subscriptions`, `/feed/explore`, and `/gaming`. Each lands on the token page.
24. Open `m.youtube.com`. It moves to `www.youtube.com`.
25. Open a YouTube embed on another site, such as a news article. It plays without drip.
26. Search for something. At most 10 results show, with no Shorts or "People also watched" shelves, each has a Stash button, and More results shows the next 10.

## Pages

27. The popup shows the glass, minutes left, and both balances, in Chrome's light and dark theme. Settings opens Settings. With a YouTube tab open in another window, Open YouTube brings that tab forward; with none open, it opens youtube.com in a new tab.
28. In Settings, click + on Save unspent for and click Save. A gray "→ 3 days from 4:00am · Undo" chip appears by the label, and "1 waiting for the reset." by Save. Undo removes it. Lower Drops per day and save, and it applies at once with no chip.
29. Tab to a stepper's number and use the arrow keys, Home, and End. − dims at the minimum and + at the maximum.
30. History shows this week's bars with today's letter bold, the daily average, and last week's dashed line. ‹ steps back a week and the label and every number follow. Click a bar: the block below names that day and shows its drops, cards, and unlocks. Narrow the window to phone width: nothing overflows.

## After a day boundary

31. Leave a token page open past the reset hour. Within a second of the reset, its balances update without a refresh.
