# drip privacy policy

Draft, 2026-10-06, updated 2026-11-05. Needs a public URL before the store listing goes up.

drip keeps everything it knows in your browser's extension storage (`chrome.storage.local`) and sends none of it to drip's developer or anyone else. There is no drip server, no account, no analytics, and no tracking.

What it stores, all on your computer:

- Your settings and token balances.
- The videos you've revealed (their ids, so the same video doesn't come up twice) and your stash (id, title, channel, length, views and age as the feed showed them, how far you got, and when you stashed it).
- Your allowed and blocked channels: each one's name, handle or channel id, and the address of its picture.
- A log of the last 90 days: minutes watched, tokens spent, videos saved, watched, or passed, and the reasons you typed for "I need this one", with each video's title.

What it reads: the YouTube pages you open, to replace the home page, run the watch clock, and read video titles and channels. It runs on www.youtube.com. On m.youtube.com and youtube-nocookie.com it only sends you to the matching www.youtube.com page.

What YouTube sees: drip talks only to YouTube, the site you're already on, and Google's image servers that YouTube uses.

- It loads video thumbnails from YouTube's image server, which tells YouTube the ids of the videos drip shows you.
- To reveal a video, drip may open a YouTube page in a hidden frame, signed in as you, to read the videos on it: your home page once you've revealed everything on screen, or your Subscriptions page if you set reveals to come from Subscriptions. To YouTube, that's the same as you opening the page.
- When you add a channel to the allow or block list by its handle, drip loads that channel's public page from youtube.com, without your cookies, to read its name and picture. Settings then shows the picture from YouTube's image servers (yt3.googleusercontent.com or yt3.ggpht.com), without sending which page asked for it.

If drip shows that it's broken, its banner can put a report together: the drip version, the page path, the part of YouTube it couldn't find, your browser version, and the time. Copy details puts that on your clipboard. Send report opens an email to apps@jesselind.com in your own mail app with that text filled in, and nothing is sent until you send that email yourself. Settings' "Missing a setting?" link opens an email the same way.

Settings' Export saves a file of your settings, stash, log, and channel lists wherever you choose to save it. Import reads a file you pick. Neither goes anywhere else.

Removing drip from Chrome deletes everything it stored. A file you exported stays where you saved it.

drip's use of this information complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements. drip doesn't sell it, transfer it, or use it for anything except limiting your YouTube use as described here.

Questions: apps@jesselind.com.
