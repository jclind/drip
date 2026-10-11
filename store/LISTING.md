# Chrome Web Store listing answers

Draft, 2026-10-06. Visual assets (screenshots, promo tiles) come with the design work.

## Name

drip (tentative, Q17). Google's branding rules don't allow "YouTube" in the name. Search the store for clashes before submitting.

## Single purpose

drip limits how much YouTube you watch: it replaces the home feed with a daily allowance of tokens that buy watch time and reveal one recommendation at a time.

## Permission justifications

- `storage`: keeps your settings, token balances, backlog, and 90-day log in the browser. Nothing leaves it.
- Content scripts on `https://www.youtube.com/*`: replace the home page, hide recommendations and Shorts, run the watch clock, and add Stash buttons.
- Content script on `https://m.youtube.com/*` and `https://www.youtube-nocookie.com/*`: sends the mobile site and directly opened embeds to the desktop watch page, so the clock applies.

No host permissions, no remote code, no data collection. Data-use answers: collects nothing.

## Short description (132 characters max)

One recommendation at a time, paid for with tokens. A daily allowance for YouTube instead of an endless feed.

## Before submitting

1. Bump `version` in `manifest.json` to 1.0.0.
2. `bin/build-release`, then load `dist/drip-1.0.0.zip` unzipped in Chrome and run `test/BROWSER.md`.
3. Put `PRIVACY.md` at a public URL. The contact email is `apps@jesselind.com` (forwards to Jesse's Gmail through ImprovMX), and the developer account should use it too.
