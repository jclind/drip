# Chrome Web Store listing answers

Draft, 2026-10-06. Visual assets (screenshots, promo tiles) come with the design work.

## Name

drip (tentative, Q17). Google's branding rules don't allow "YouTube" in the name. Search the store for clashes before submitting.

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
- With watch time on, playing videos use minutes bought with drops, and running out pauses the video behind a lock. Background audio counts, ads do not. Optional Dry hours stop watching on paid minutes during a daily range. Allowed channels and "I need this one" unlocks play without using minutes. Embeds on other websites and music.youtube.com are outside drip's scope.
- With Stash on, you can keep videos for later from reveal cards, search, and watch pages. Channel lists let you allow free watching or block channels from reveals.

## Short description (132 characters max)

Replaces YouTube's endless home feed with a search box or one recommendation at a time, with optional watch time limits.

## Before submitting

1. Bump `version` in `manifest.json` to 1.0.0.
2. `bin/build-release`, then load `dist/drip-1.0.0.zip` unzipped in Chrome and run `test/BROWSER.md`.
3. Check that https://jesselind.com/projects/drip/privacy is live and matches `PRIVACY.md`. The contact email is `apps@jesselind.com` (forwards to Jesse's Gmail through ImprovMX), and the developer account should use it too.
