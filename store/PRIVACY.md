# drip privacy policy

Draft, 2026-10-06, updated 2026-10-14. Needs a public URL before the store listing goes up.

drip keeps everything it knows in your browser's extension storage (`chrome.storage.local`) and sends none of it to drip's developer or anyone else. There is no drip server, no account, no analytics, and no tracking.

What it stores, all on your computer:

- Your settings and token balances.
- The videos you've revealed (their ids, so the same video doesn't come up twice) and your saved backlog (id, title, channel, length).
- A log of the last 90 days: minutes watched, tokens spent, videos saved or passed, and the reasons you typed for "I need this one".

What it reads: the YouTube pages you open, to replace the home page, run the watch clock, and read video titles. It runs on youtube.com only.

What YouTube sees: drip talks only to YouTube, the site you're already on. It loads video thumbnails from YouTube's image server, which tells YouTube the ids of the videos drip shows you. If you set reveals to come from Subscriptions, drip opens your Subscriptions page from YouTube in a hidden frame, signed in as you, to read the videos on it. To YouTube, that's the same as you opening the page.

If drip shows that it's broken, its banner can put a report together: the drip version, the page path, the part of YouTube it couldn't find, your browser version, and the time. Copy details puts that on your clipboard. Send report opens an email to apps@jesselind.com in your own mail app with that text filled in, and nothing is sent until you send that email yourself.

Removing drip from Chrome deletes everything it stored.

drip's use of this information complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements. drip doesn't sell it, transfer it, or use it for anything except limiting your YouTube use as described here.

Questions: apps@jesselind.com.
