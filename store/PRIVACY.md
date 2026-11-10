# drip privacy policy

Draft, 2026-10-06, updated 2026-11-09. Published at https://jesselind.com/projects/drip/privacy, from jesselind's `src/pages/projects/drip/privacy.astro`. Change both together.

In short:

- drip has no server. Nothing it reads is sent to its developer, sold, or shared, and it has no analytics or tracking.
- Everything it keeps stays in your browser: your settings, your stash, your channel lists, and a 90-day log of your watch time, including the reasons you type for "I need this one".
- It only talks to YouTube. It loads thumbnails and channel pictures, and may open your YouTube home or Subscriptions page in a hidden frame to pick the next video.
- Nothing leaves your computer unless you send it yourself, like a bug report email or an exported file.
- Removing drip from Chrome deletes what it stored.

The details:

drip processes browsing activity and YouTube page content locally in your browser. It sends none of that information to drip's developer or anyone else. There is no drip server, no account, no analytics, and no tracking. The YouTube requests and reports you can choose to send are described below.

What it stores in your browser's extension storage (`chrome.storage.local`), all on your computer:

- Your settings and token balances.
- The ids of videos you unlocked today with "I need this one", and of today's videos from allowed channels with that channel's ids. Both clear at the day's reset.
- The videos you've revealed (their ids, so the same video doesn't come up twice) and your stash (id, title, channel, length, views and age as the feed showed them, how far you got, and when you stashed it).
- Your allowed and blocked channels: each one's name, handle or channel id, and the address of its picture.
- A log of the last 90 days: minutes watched, tokens spent, videos saved, watched, or passed, and the reasons you typed for "I need this one", with each video's title.

Temporary storage, also on your computer:

- Extension session storage (`chrome.storage.session`) keeps the clock used to avoid charging twice when videos play in several tabs: the last charged timestamp, recent tick keys, and the seconds charged for each. It clears when Chrome restarts or the extension reloads.
- YouTube tab session storage (`sessionStorage` on www.youtube.com) briefly keeps the number of unspent drops and a Dry hours end timestamp when you choose Done for now. drip reads and removes them on its home page to show the counter animation. They can remain until the tab closes if you do not return there.

In an unpacked developer copy, `chrome.storage.local` also keeps the Developer mode switch and any test clock offset. The developer panel uses YouTube's `localStorage` to remember whether it is collapsed. The store build has no developer panel.

What it reads: the YouTube pages you open, to replace the home page, run the watch clock, and read video titles and channels. It runs on www.youtube.com. On m.youtube.com and youtube-nocookie.com it only sends you to the matching www.youtube.com page.

What YouTube sees: drip talks only to YouTube, the site you're already on, and Google's image servers that YouTube uses.

- It loads video thumbnails from YouTube's image server, which tells YouTube the ids of the videos drip shows you.
- To reveal a video, drip may open a YouTube page in a hidden frame, signed in as you, to read the videos on it: your home page once you've revealed everything on screen, or your Subscriptions page if you set reveals to come from Subscriptions. To YouTube, that's the same as you opening the page.
- When you add a channel to the allow or block list by its handle, drip loads that channel's public page from youtube.com, without your cookies, to read its name and picture. Settings then shows the picture from YouTube's image servers (yt3.googleusercontent.com or yt3.ggpht.com), without sending which page asked for it.

If drip shows that it's broken, its banner can put a report together: the drip version, the kind of break, the exact page selector that matched nothing, the page path (without query parameters), the full user-agent string Chrome makes available (including browser and operating system or platform information), and the date and time in UTC. Copy details puts that on your clipboard. Send report opens an email to apps@jesselind.com in your own mail app with that text filled in, and nothing is sent until you send that email yourself. Settings' "Missing a setting?" link opens an email the same way.

Settings' Export saves a file of your settings, stash, log, and channel lists wherever you choose to save it. Import reads a file you pick. Neither goes anywhere else.

Removing drip from Chrome deletes its extension storage. Temporary YouTube tab session storage can remain until the tab closes. A developer copy's collapsed-panel flag stays until you clear YouTube's site data. A file you exported stays where you saved it.

drip's use of this information complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements. drip doesn't sell it, transfer it, or use it for anything except reducing distractions and providing the optional YouTube limits described here.

Questions: apps@jesselind.com.
