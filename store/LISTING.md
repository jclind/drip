# Chrome Web Store listing answers

Draft, 2026-10-06, checked against `main` on 2026-11-09 (97fc18e). The images are planned in `ART-PLAN.md`. The final set to upload is `store/images-v2/` (`screenshot-1.png` to `-5.png`, and `tile-c2.png` as the small promo tile).

## Name

drip (tentative, Q17). Google's branding rules don't allow "YouTube" in the name. Search the store for clashes before submitting; nobody has recorded that search yet.

## Category

Lifestyle > Well-being (Jesse, 2026-11-06). Feed-hiding extensions like UnDistracted sit there, and it's far smaller than Productivity > Workflow & Planning.

## Privacy policy URL

https://jesselind.com/projects/drip/privacy (jesselind PR 30). The page's text is `PRIVACY.md`. Change both together.

## Single purpose

drip reduces distractions on YouTube by replacing its endless home feed with a search box or one recommendation at a time. Optional daily allowances limit recommendations and watch time.

## Permission justifications

- `storage`: keeps your settings, token balances, stash, channel lists, and 90-day log in the browser. Nothing leaves it.
- Host permission `https://www.youtube.com/*`: when a channel goes on the allow or block list without its name or picture, as one added by handle in Settings does, the service worker loads that channel's public page, without cookies, to read its name and picture (`lookUpChannel` in `src/background.js`). Added 2026-11-04 with the channel lists.
- Content scripts on `https://www.youtube.com/*`: replace the home page, hide recommendations and distractions, and provide the optional watch clock, Stash, and channel lists described below.
- Content script on `https://m.youtube.com/*` and `https://www.youtube-nocookie.com/*`: sends the mobile site and directly opened embeds to the desktop watch page, so the clock applies.

One host permission (www.youtube.com, above), no remote code. For the store's data-use answers, disclose browsing activity and website content: drip processes both locally and sends none of it off the device. Local processing still needs disclosure under the [Chrome Web Store User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq). The privacy policy describes YouTube requests and reports you can choose to send through your own mail app.

## What drip changes on YouTube

Installing drip opens a welcome page with a mode picker and a tour.

- Home, Subscriptions, Explore, bare Shorts feeds, and hashtag feeds lead to drip's home page. Quiet shows a search box. Curated reveals one recommendation at a time for free. Full drip adds daily allowances for recommendations and watch time. You can customize these parts in Settings.
- Watch-page recommendations, end screens, and in-video recommendation cards are hidden. Autoplay is turned off, and each new video opens in theater mode. Playlists and mixes can keep playing.
- Comments stay behind a Show comments button for each video. The miniplayer is hidden, and playback pauses when you leave the watch page.
- YouTube's sidebar becomes a short menu. Create and Ask YouTube are hidden. The notification bell and Shorts shelves and links are hidden by default, with switches to show them again. Shorts always open as regular videos.
- Search ads, injected recommendation shelves, and "people also" rows are hidden. With the search cap on, 10 results show at a time, followed by a free More results button.
- Watch pages are centered when there is no playlist queue, live chat, or open panel beside them. Join, merchandise, Clip, Thanks, Ask, and game and channel cards in the description are hidden.
- With watch time on, playing videos use minutes bought with drops, and running out pauses the video behind a lock. Background audio counts, ads do not. Optional Dry hours stop watching on drops during a daily range. Allowed channels and "I need this one" unlocks play without using minutes. Embeds on other websites and music.youtube.com are outside drip's scope.
- "I need this one" on the lock unlocks one video for the day, with a typed reason, 3 times a week.
- With Stash on, you can keep videos for later from reveal cards, search, and watch pages.
- Channel lists: an allowed channel's videos play without using minutes, and a blocked channel never comes up in a reveal. Allow from the channel's page or Settings, block from a reveal card's menu or Settings.
- Settings has three tabs: Settings (modes, each part's limits, Dry hours, the YouTube switches, Export and Import), Channels (the allow and block lists), and History (today's use and a week's chart, with the reasons typed for each unlock).

## Description

The store's Description field is plain text. Paste this, then the "What drip changes on YouTube" list above, reworded as plain lines.

> YouTube's home page is built to keep you scrolling. drip takes it away.
>
> In its place you get a search box, or one recommended video at a time. No grid, no recommendations beside the video, no autoplay, no end screens. Search still works, minus the shelves YouTube slips into it.
>
> Pick how much you want when you install:
>
> Quiet: a search box where the home feed was. Nothing else.
> Curated: reveal one recommendation at a time, and stash the ones worth watching later.
> Full drip: a daily allowance. Drops buy 15 minutes of watching, cards reveal videos. When the glass is empty, the video stops.
>
> Loosening a limit waits for the next day, so a late-night "just one more" can't raise it. Tightening one is immediate.
>
> drip has no server, no account, and no tracking. Everything stays in your browser.

## Short description (132 characters max)

Replaces YouTube's endless home feed with a search box or one recommendation at a time, with optional watch time limits.

## Before submitting

1. Bump `version` in `manifest.json` to 1.0.0.
2. `bin/build-release`, then load `dist/drip-1.0.0.zip` unzipped in Chrome and run `test/BROWSER.md`.
3. Check that https://jesselind.com/projects/drip/privacy is live and matches `PRIVACY.md`. The contact email is `apps@jesselind.com` (forwards to Jesse's Gmail through ImprovMX), and the developer account should use it too.
