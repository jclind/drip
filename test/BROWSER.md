# Browser checklist

What `node --test` can't cover: YouTube's real pages. Run it before a release and after any YouTube markup fix, on a computer whose Chrome window is visible. air's window is hidden, so videos there never play and lazy pages load little.

Start from a reloaded extension and refreshed YouTube tabs. With Developer mode on in Settings, the dev panel (bottom left) sets minutes and tokens, and its Run reset now does what the daily reset does, so items 7, 14, and 25 don't need to wait for a real day. Each line is an action, then what should happen. Note any line that fails, with the date.

## Token page

1. Open youtube.com. The page fades in, there's no video grid or chip bar, and the token page shows minutes left, both balances, Reveal, Add 15 min, the Reveal from toggle, and the backlog.
2. Click Reveal. One card appears with a thumbnail, title, and channel, and rec tokens drop by 1.
3. Click Pass. The card goes and Reveal comes back. Click Reveal, then Save. The video is at the top of the backlog.
4. Switch Reveal from to Subscriptions and click Reveal. "Checking your subscriptions…" shows, then a card from a subscribed channel, or "Nothing new from your subscriptions" with no token spent.
5. Open a second YouTube tab and play a video in it. Back on the token page, hover a button and click it a few times. Every click works, and the button doesn't flicker.

## Watch page and clock

6. With 0 minutes left, open a watch page. The video never starts, not even for a moment, and the lock shows "Out of watch time".
7. Click Add 15 min on the lock. The video plays, and the pill says about 15 min left.
8. Let it play 2 minutes. The pill counts down, and the Settings log's minutes for today rise by 2.
9. Click Save to backlog on the pill while the video plays, five times in a row on five videos. Every click works.
10. The page opens in theater mode. There's no sidebar, and the end screen shows no suggestions.
11. Comments are hidden behind Show comments. Clicking it shows them for this video only. The next video hides them again.
12. In fullscreen, the player has no Comments button.
13. Let the minutes run out while a video plays, with grace mode off. It pauses within a second or two of 0 and the lock shows.
14. Turn grace mode on (it applies at the next reset). The next day, run out of minutes mid-video. That video finishes, and opening another video shows the lock.
15. With minutes left, play two videos in two tabs for a minute. The minutes go down by about one minute, not two.
16. On the lock, click I need this one, type a reason, and unlock. The video plays, the pill says unlocked, and the reason shows in the Settings log.

## Redirects and blocking

17. Open a `/shorts/` link. It opens as a normal watch page.
18. Open `/feed/subscriptions`, `/feed/explore`, and `/gaming`. Each lands on the token page.
19. Open `m.youtube.com`. It moves to `www.youtube.com`.
20. Open a YouTube embed on another site, such as a news article. It plays without drip.
21. Search for something. At most 10 results show, with no Shorts or "People also watched" shelves, each has a Save button, and More results shows the next 10.

## Pages

22. The popup shows minutes left and both balances, plus a Settings link.
23. In Settings, raise a limit and save. It's listed as waiting for the reset. Lower one, and it applies now.
24. The Settings log shows today and the 7 days before it.

## After a day boundary

25. Leave a token page open past the reset hour. Within a second of the reset, its balances update without a refresh.
