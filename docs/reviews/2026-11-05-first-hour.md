# First-hour review, 2026-11-05

A stranger installs drip from the Chrome Web Store and spends an hour with it: install, the welcome page and tour, the first video, running out, the lock, reveal cards, the stash, the popup, and Settings. This review reads the strings they'd see in the code and notes every term used before it's explained, every place they'd get stuck or surprised, and every block of text longer than it needs to be.

Review only. No code, config, or tests changed. Reviewed at `be8ab2b` (main, after PR 68). `node --test` passes 366 of 366.

## How it was done

Three read-only reviewers split the extension into areas that don't overlap:

1. Install and the welcome page: manifest, store drafts, `background.js`'s install handler, `src/welcome/`.
2. drip's pages on YouTube other than the watch page: `home.js`, `reveal.js`, `counter.js`, `stash.js`, `swap.js`, `search.js`, `channel.js`, `menu.js`, `common.js`, `redirect.js`.
3. The watch page and lock, the popup, and Settings: `watch.js`, `early.js`, `src/popup/`, `src/options/`.

Each was told what DESIGN.md, AUDIT.md, IDEAS.md, and RELEASE-PLAN.md already cover, so known issues don't come back. Claude then read the code behind each finding and marked it confirmed, plausible, or rejected. Confirmed means the code does what the finding says. Whether it matters is judged in Severity. Plausible means the code allows it but proving it needs a browser or a state the code alone can't show. Nothing here was run in a browser.

Line numbers are at `be8ab2b`.

## Should block tomorrow's publish

Five findings. Each one has a fix in strings or store paperwork, not in logic.

| # | What | Why it blocks |
|---|---|---|
| C1 | A stranger's first video locks at once under "Time for a breather." and "0m watched today" | It's the first thing drip does on YouTube, and it reads as a punishment for something they haven't done. Needs Jesse's OK, since the lock's lines are his (O1) |
| C2 | An empty home feed (watch history off, or signed out) shows "drip needs an update" with Send report | Reveal never works for these users, and drip tells them it's broken and asks them to email Jesse |
| C3 | YouTube tabs that were already open don't change until they're refreshed, and nothing says so | A stranger goes back to their open YouTube tab, sees the full feed, and decides drip doesn't work |
| C4 | The store summary says "paid for with tokens", a word drip never uses on screen | It's the first line every stranger reads, and changing it later means another upload and another review |
| C5 | LISTING.md says "No host permissions", but the manifest has one, and PRIVACY.md doesn't cover the channel page fetch | A false answer on the store form |

## Confirmed findings

Most severe first. "Block" says whether it should hold tomorrow's publish.

### C1. The first video of every day locks before it plays, and the lock doesn't say why

- Where: `src/content/watch.js:956` `hasDrops ? 'Time for a breather.' : "You've had your fill."`, the line under it from `watch.js:891` `` `${Drip.formatMinutes(today)} watched today` ``, and the link at `watch.js:944` `` `I need this one · ${needLeft} left this week` ``. Minutes start at 0 at install (`state.js` `initialState`) and after every reset (`rollDay`).
- Trigger: Full drip, just installed, 4 drops, 0 minutes. The stranger skips the tour or goes straight to search, then opens any video.
- Impact: The water rises over a video that never played. The headline says "Time for a breather." over "0m watched today", which isn't true on day one. Nothing on the panel says it's drip (see C19), or that minutes have to be bought first. The bright, shimmering button is Done for now. "I need this one · 3 left this week" looks as clickable as +15m, so a stranger may spend one of the week's three unlocks getting past what is really a "buy your first 15 minutes" screen. RELEASE-PLAN.md's first missing feature was this exact moment, and the welcome page was the answer. It only works for people who finish the tour.
- Fix: When nothing has been bought today (`watchSecondsBought === 0`) and drops are left, change the line under the headline to something like "Each drop is 15m of watching." Consider "Start today's glass." as the headline in that state. +15m stays the gray button. This changes Jesse's lock lines, so it waits on O1.
- Block: yes, if Jesse agrees to a wording.

### C2. An empty home feed reads as drip being broken

- Where: `src/content/home.js:324-327` reports the grid broken whenever the home feed has no items at all. The banner, `src/content/common.js:199` and `:227`: "drip can't read YouTube's recommendations, so Reveal can't pick a video. No card spent. YouTube probably changed its page, and drip needs an update." with Send report. The gray line at `home.js:247`: "YouTube hasn't loaded anything new to show. No card spent. Try again after a refresh."
- Trigger: Full drip or Curated with Reveal from left on Home feed. The stranger has YouTube watch history paused, or isn't signed in. YouTube has shown those people an empty home feed with a prompt since 2023. They press Reveal video.
- Impact: About 20 to 35 seconds of "Finding a video…" and "Still looking…" (6 seconds in `waitForPool`, `home.js:147`, then up to 15 to load and 15 to scroll the hidden frame, `home.js:168`). Then drip says it's broken, asks for a report, and tells them to refresh, which won't help. Someone who paused their history to escape recommendations is exactly who installs drip. Every such install can also send Jesse a false report.
- Fix: Before calling the grid broken, look for YouTube's empty-feed prompt and give its own message, like "YouTube shows no recommendations while your watch history is off. Reveal from Subscriptions in drip's Settings instead." If the prompt's markup can't be checked before tomorrow, at least drop the banner when `ytd-browse` is there but holds no items, and use that message for every empty feed.
- Block: yes. The selector for YouTube's prompt needs a look in a browser with history paused.

### C3. YouTube tabs open at install keep the full feed until refreshed

- Where: `src/background.js:259-265` opens the welcome page on install and does nothing else. The manifest has no `scripting` permission, and Chrome doesn't run declared content scripts in tabs that were open before the install. Neither `welcome.html` nor `welcome.js` mentions refreshing.
- Trigger: Install from the store with a YouTube tab open, close or skip the tour, go back to that tab.
- Impact: The grid, Shorts, autoplay, and no clock. drip looks like it did nothing. Only the tour's last Open YouTube button (`welcome.js:407`) loads a fresh page.
- Fix: One line in the welcome footer, beside "Everything drip knows stays in this browser.": "Already have YouTube open? Refresh it." No permission change needed.
- Block: yes, since it's one line of copy.

### C4. The store summary and the short description say "tokens"

- Where: `manifest.json:5` `"One recommendation at a time, paid for with tokens."` and `store/LISTING.md:23` `One recommendation at a time, paid for with tokens. A daily allowance for YouTube instead of an endless feed.`
- Trigger: Anyone who finds drip in the store, in search results, or on `chrome://extensions`.
- Impact: As far as Claude knows, the store's summary line comes from the manifest's `description`, so LISTING's 132-character short description may never show (check in the dashboard). Either way, "tokens" is a word the product never uses, since everything on screen says drops and cards. It also describes only Full drip: Quiet has no recommendations, and watch time, the main limit, isn't mentioned.
- Fix: Use one sentence in both places, in drip's words or with no currency at all, like "A daily allowance for YouTube: a few minutes at a time, one recommendation at a time, no endless feed." Keep it under 132 characters.
- Block: yes. Changing the summary later takes another upload and review.

### C5. The store form draft and the privacy policy miss the host permission and the channel fetch

- Where: `store/LISTING.md:19` `No host permissions, no remote code, no data collection.` against `manifest.json:8` `"host_permissions": ["https://www.youtube.com/*"]`. The permission lets `background.js:328` fetch a channel's page, without cookies, when a channel is added by handle in Settings (DESIGN.md:475). `store/PRIVACY.md` lists what drip stores and what YouTube sees, but not the channel lists, their pictures, or this fetch.
- Trigger: Filling in the store form from LISTING.md tomorrow.
- Impact: The permissions answer is false, and the host permission has no justification line, which the form asks for.
- Fix: Drop "No host permissions" and add: "`https://www.youtube.com/*`: when you add a channel to the allow or block list by its @handle in Settings, drip loads that channel's public page, without cookies, to read its name and picture." Add the channel lists to PRIVACY.md's "What it stores", and the fetch to "What YouTube sees".
- Block: yes. Docs only.

### C6. Once the welcome tab closes, there's no way back to the tour, and nothing says where drip lives

- Where: `src/background.js:258` `// A new install opens the welcome page once. Updates don't.` The popup, Settings, and the content scripts have no link to `welcome.html`. The welcome page never mentions the toolbar icon or pinning it.
- Trigger: Any mode. The stranger closes the welcome tab on the choice screen, or presses Skip or the footer's Open YouTube.
- Impact: drops, cards, the glass, Stash, and the lock never get explained (see the terms table below). Chrome hides a new extension's icon under the puzzle piece, and the popup is the only way to Settings that the design offers from YouTube (the lock and the card deliberately have no links). So after that one tab closes, a stranger has no visible way to see their balance or open Settings.
- Fix: Add "Take the tour again" at the bottom of Settings (and maybe in the popup's footer), opening `welcome.html#tour-1`. On the tour's last step or in its footer, add one line: "Pin drip from the puzzle piece to see your time and open Settings."
- Block: no, but worth doing first after the five.

### C7. The rule that loosening waits is explained only on day one, and then in words Settings doesn't use

- Where: `src/options/options.js:348` `` `First day: changes apply right away until ${untilLabel(until)}. After that, raising a limit waits for the reset.` `` The note hides once the first day ends (`:345`).
- Trigger: Day 2. The stranger turns on Finish the current video, or picks Curated, and Saves.
- Impact: The one sentence that explains the rule goes away just when it starts to apply. After that a waiting change shows only "On until 4:00am · Undo" and "Saved. 1 change starts at 4:00am.", which say when, not why. "Raising a limit" undersells it: grace on, Shorts or the bell shown again, a lighter mode, Watch time off, and any new reset hour wait too. "The reset" isn't a term Settings shows anywhere else, since the row is "New day starts at".
- Fix: Keep a permanent one-line rule near the save bar or under the mode picker, like "Anything that loosens a limit starts at the next new day, 4:00am." Use "loosens", and pick one name for the reset across Settings, the channel page (C21), and the welcome page (C22).
- Block: no.

### C8. Reset turns a Quiet or Curated user into Full drip, with the clock on at once

- Where: `src/options/options.html:50` `Put every setting back to how drip started, and empty your stash and channel lists?` and `options.js:1153` `'Settings are back to how drip started.'` `resetData` sends `DEFAULT_SETTINGS` (`state.js:122-125`, Full drip) through `updateSettings`.
- Trigger: A user who picked Quiet presses Reset in Settings, then confirms.
- Impact: For them every part going on is a tightening, so the clock, counted cards, the search cap, and the stash all switch on immediately. Their next video locks at 0 minutes. To someone who picked Quiet on the welcome page, "how drip started" means Quiet. Neither the confirmation nor the result names the mode.
- Fix: Name it in both places ("Mode goes back to Full drip, with watch time on now."), or have Reset keep the current mode. Which one is O6.
- Block: no. Reset is rare in the first hour.

### C9. The drop and card counts are an icon and a number, with no word anywhere on screen

- Where: `src/content/home.js:936`, the count row, whose only text is a screen-reader span. The popup's counts, `src/popup/popup.js:62-66`, and its `left today`.
- Trigger: First visit in Full drip: an empty glass, "0m left today", a drop with 4, a card with 10. The popup shows the same.
- Impact: Outside the tour, the word "drop" shows on YouTube only in +15m's tooltip, "Add 15 minutes for 1 drop", and in the out-of lines. "0m left today" in the popup reads as "you can't watch today". Nothing ties a drop to 15 minutes.
- Fix: Give each count a `title` ("4 drops. Each buys 15m of watching.", "10 cards. Each reveals one video."). In the popup at 0 minutes with drops left, put "4 drops to spend" or "+15m per drop" under the 0m.
- Block: no.

### C10. The lock's "The glass refills at 4:00am." shows next to +15m, and in Dry hours it gives the wrong time

- Where: `src/content/watch.js:950-952`. The note shows whenever no unlocks are left, whether or not drops are.
- Trigger: The week's unlocks used, or "I need this one" per week set to 0, with drops left. Or Dry hours on (11pm to 6am), unlocks used, locked at 1am.
- Impact: DESIGN.md:133 puts the note under "You've had your fill.", when drops and unlocks are both gone. Beside a working +15m it reads as "wait until morning". In Dry hours it sits under "Dry until 6:00am." and points to 4am, when nothing can play until 6.
- Fix: Show the note only when `!hasDrops`, and in Dry hours show the dry end instead, or nothing.
- Block: no.

### C11. The Dry hours hint says the opposite of what happens

- Where: `src/options/options.js:66` `'Videos on minutes stop. Whole unspent drops come back.'`
- Trigger: Anyone reading Dry hours in Settings.
- Impact: Unspent drops aren't touched. What comes back is the minutes left, as whole drops (Q32). "Videos on minutes" is internal phrasing. The hint also leaves out that drops stop selling 5 minutes before, and that allowed channels and "I need this one" still play.
- Fix: "No watching from 11pm to 6am. Minutes you have left go back as drops. Allowed channels still play."
- Block: no. Dry hours are off by default.

### C12. "Save unspent for 1 day" saves nothing

- Where: `src/options/options.js:113-116` `'Save unspent for'` with the hint `'Unspent drops and cards carry over up to this many days.'`, and the summary at `:107`, `unspent saved for 2 days`.
- Trigger: Settings, Every day, Save unspent for stepped down to 1.
- Impact: The setting caps the balance at a day's worth times N (`caps`), so at 1 nothing carries over. The label and hint say unspent drops carry over for up to a day. The Every day summary also says "unspent saved for 2 days" in Quiet, where the row itself is dimmed as unused.
- Fix: At 1, change the hint to "Unspent drops and cards don't carry over." Leave the clause out of the summary while the row is idle.
- Block: no.

### C13. The tour's player buys a drop at 0 minutes, but a real watch page locks

- Where: `src/welcome/welcome.js:929-931`, `// Watch at 0 minutes buys a drop's minutes first (Q18).` then `Drip.buyIfOut(sand, video.id);` on Play. The step says `Minutes only drain while a video plays. Press play.` (`:286`).
- Trigger: Full drip. On steps 1 and 2 the stranger presses Next without +15m or Watch, then Play on step 3.
- Impact: Play quietly spends a drop and plays. On YouTube, a video opened at 0 minutes from search, a link, or a notification locks as it loads (`earlyLocked`). The tour teaches a path the real watch page doesn't have, and never shows the real first video, which is C1.
- Fix: At 0 minutes, have the tour's Play raise the lock, with +15m as the way on, instead of buying.
- Block: no.

### C14. The tour never says where stashed videos go, or that the stash fills up

- Where: `src/welcome/coach.js:88` `'stash it for later'`. `src/welcome/welcome.js:94`, Customize's gray line, `` `Up to ${settings.stashMax}, from search and watch pages.` `` The "What changes" table, `welcome.js:1289-1298`, has no Stash row.
- Trigger: Full drip or Curated. The stranger stashes an 11th video and gets "Your stash is full" with nobody having warned them.
- Impact: The cap shows up only in Customize, which is folded by default. Its line also leaves out the card's own Stash button, the one the tour just had them press.
- Fix: Make the Stash answer stop say "Stashed. It waits under your drip page, up to 10." Change Customize's line to "Up to 10, from cards, search, and watch pages."
- Block: no.

### C15. "Reveal from either" suggests a choice the tour never offers

- Where: `src/welcome/welcome.js:1293` `note: 'Subscriptions too. Reveal from either.'`
- Trigger: Full drip or Curated, the "What changes" step.
- Impact: It means both pages open the drip page. A stranger reads it as "reveals come from Home or Subscriptions". Reveals come from one feed, set by Reveal from in Settings, and nothing in the tour mentions that setting. People who live in Subscriptions don't learn they can use it.
- Fix: "Subscriptions too. Reveals come from Home, or Subscriptions in Settings."
- Block: no.

### C16. The × tooltip says a stashed card "won't come back"

- Where: `src/content/home.js:1226` `title: "Pass. It's free, and this video won't come back."`
- Trigger: Reveal, press Stash, hover ×.
- Impact: A stashed card that's passed stays in the stash (Q13), so the tooltip is wrong right after the stranger saved it, and may make them afraid to close the card.
- Fix: When the card is stashed, use "Close. It stays in your stash."
- Block: no.

### C17. Block doesn't say the video goes with it, and points to a Settings the stranger can't find

- Where: `src/content/common.js:160` `'Reveals never deal this channel again'`, `:161` `'You can unblock it in Settings'`, `:183` `` `${video.channel} is blocked. Unblock it in Settings.` `` The tour uses the same view (`welcome.js:636`).
- Trigger: A card is up. ⋯, Block, Click again to block. Or the same in the tour.
- Impact: Block also passes the card with no card back (Q31). Neither line says so. "Deal" is drip's internal word. "Settings" has no path from YouTube (C6). In the tour, the block is only in the sandbox, so following "Unblock it in Settings" finds nothing.
- Fix: "Block: this video goes too, and reveals skip this channel." Under it: "Undo in drip's Settings, from the toolbar icon." In the tour, say "Blocked in the tour only."
- Block: no.

### C18. Channel allow shows in modes where it does nothing

- Where: `src/content/channel.js:103` `none: 'Allow in drip'`, with the tooltip `` `Videos from this channel would cost no minutes. ...` `` (`:110`). `channel.js` never checks `settings.clock`. Settings' Channels header, `src/options/options.js:831` `'Allowed channels are free to watch. Blocked ones never come up in reveals.'`, shows in every mode.
- Trigger: A stranger who picked Quiet or Curated opens any channel page, or Settings.
- Impact: With the clock off nothing costs minutes, so Allow changes nothing, and its tooltip describes a cost the mode doesn't have. In Quiet, Block does nothing either, since there are no reveals.
- Fix: Don't draw the channel-page button while the clock is off. In Settings, dim the list whose part is off, with an idle note the way Save unspent for has one. Whether to hide it is O5.
- Block: no.

### C19. The lock doesn't say it's drip

- Where: `src/content/watch.js:953-966`, the lock panel: headline, line, buttons, link. No name or mark.
- Trigger: Any lock, especially on a video opened from outside YouTube days after install.
- Impact: A full-window blue overlay pauses the video, and nothing names the extension that did it. The lock has no Settings link by design, so the name is the only way to know where to look.
- Fix: A small drop and "drip" at the top of the panel, not a link.
- Block: no. It does make C1 worse.

### C20. Screen readers don't hear a stash row's price

- Where: `src/content/home.js:1280` `h('span', { class: 'drip-saved-play', 'aria-hidden': 'true' }, costsDrop(video.id) && h('span', { class: 'drip-saved-price' }, '-1', ...`
- Trigger: Full drip, 0 minutes, drops left. Open Stash and activate a row with a screen reader.
- Impact: It spends a drop with nothing said. Every other price goes through `price()` (`common.js:116-121`), which adds ", costs 1 drop".
- Fix: Add a `drip-sr` ", costs 1 drop" inside the row's link while `costsDrop` is true.
- Block: no.

### C21. "Allowed from 4:00am" doesn't say which day, and its tooltip uses "reset"

- Where: `src/content/channel.js:100` `` `Allowed from ${hourLabel(state.settings.resetHour)}` ``, `:107` `'Starts at the next reset. Click to cancel.'`, `:110` `'Starts at the next reset.'`
- Trigger: Full drip, past the first day. Allow in drip on a channel page at 5am.
- Impact: 4:00am is 23 hours off and reads as an hour ago. The reason for the wait is in a tooltip, which touch and keyboard users never see, and it uses "reset", a word the stranger hasn't met.
- Fix: "Allowed from tomorrow 4:00am", with `dayTimeLabel`. Tooltip: "Allowing waits until 4:00am, so it can't be used to watch more today."
- Block: no.

### C22. The welcome page's "first 24 hours" line stops halfway, and doesn't say picks save at once

- Where: `src/welcome/welcome.html:24` `You can change this in Settings. For your first 24 hours, changes apply right away.`
- Trigger: Any mode, the choice screen.
- Impact: It hints that something else happens after 24 hours but never says what. Each pick saves as it's made, but the Next button makes the choice look unconfirmed until it's pressed.
- Fix: "Saved as you pick. For your first 24 hours, changes in Settings apply right away. After that, loosening a limit waits until 4:00am."
- Block: no.

### C23. Turning watch time off in Full drip's Customize gives Curated, but the row says "Full drip · Changed"

- Where: `src/welcome/welcome.js:196` sets cards to unlimited when the clock goes off, `:136` tags the picked row `'Changed'`, and `:214` titles the tour by `modeOf`.
- Trigger: Choice screen. Full drip, Customize, Limit watch time off, Next.
- Impact: The row still promises "1h of watching and 10 new videos a day", tagged Changed, and the tour is titled "How Curated works".
- Fix: When a switch makes the mix equal another mode, move the pick to that row.
- Block: no.

### C24. Customize's wording

- Where, all in `src/welcome/welcome.js`:
  - `:145` `customizing ? 'Hide' : 'Customize'`. "Hide" closes the list, right above three switches whose labels start with "Hide".
  - `:95` `how: () => 'The same in every mode.'` for the bell. Every other line says what its switch does.
  - `:105` `` `${settings.recTokensPerDay} a day, while watch time is limited.` `` hints at a link between cards and watch time that a stranger can't guess.
  - `:81` `"Hides YouTube's feeds. Search is all that's left."` for Quiet overstates it. The menu keeps History, Playlists, Watch later, and Channels, and Quiet's own table says `Your channels and playlists work as before.`
- Trigger: Choice screen, Customize open.
- Fix: "Done"; "YouTube's bell, in the top bar."; "10 a day. Unlimited when watch time is off."; "Hides YouTube's feeds. Home becomes a search box."
- Block: no.

### C25. Carry-over is taught only if the stranger still has drops at Done for now

- Where: `src/welcome/coach.js:163` `'Or stop here. Unspent drops carry over to tomorrow.'` and `:167`. Both only when `c.drops() && c.carries()`.
- Trigger: Full drip. Spend every tour drop before the lock step.
- Impact: The tour never mentions carry-over, or its 2-day cap.
- Fix: Put it in step 1's drops stop: "Your drops. New ones come at 4:00am, and unspent ones keep for 2 days."
- Block: no.

### C26. A reopened welcome page shows today's mode, not one waiting

- Where: `src/welcome/welcome.js:1322` `const saved = res && res.state && res.state.settings;`
- Trigger: Day 2 or later. Reopen `welcome.html` from history, pick Quiet, reload.
- Impact: The pick saves and waits for 4:00am, as it should, but the page doesn't say so, and a reload shows the old mode again.
- Fix: Read `Drip.planned(state)` and show "Quiet from 4:00am", as Settings does.
- Block: no.

### C27. "Add 1 minutes", and the same length written two ways

- Where: `src/content/home.js:1057` and `src/content/watch.js:959` `` `Add ${s.minutesPerToken} minutes for 1 drop` ``. `src/options/options.js:57` `` `${d.minutesPerToken}m each` `` and `:63` `` `${n}m` ``.
- Trigger: Minutes per drop set to 1, or to 60 or 90.
- Impact: "Add 1 minutes". At 60, Settings shows "60m each" while the buttons show "+1h".
- Fix: Make "minute" plural only when the number isn't 1, and use `Drip.formatMinutes` in Settings.
- Block: no.

### C28. "No card spent" in Curated, and two messages for one empty feed

- Where: `src/content/home.js:247` and `src/content/common.js:199`.
- Trigger: Curated, Reveal video on an empty or broken grid.
- Impact: Curated's cards are unlimited and never spent, so "No card spent" means nothing. With a broken grid, the banner and the gray line both appear, and one blames drip while the other blames YouTube.
- Fix: Say "No card spent" only when cards are counted. Leave out the gray line while the banner shows. Part of C2's fix.
- Block: no.

### C29. With a card up, the home page never mentions Dry hours

- Where: `src/content/home.js:1012` `` if (shownCard()) return noCards ? `No cards left. More at ${reset}.` : ''; `` returns before the Dry hours lines at `:1015-1016`.
- Trigger: Dry hours on. A card revealed at 10:50pm is still up at 10:56pm, or after 11pm.
- Impact: Watch shows no price and no warning. Pressing it ends the card and lands on the lock.
- Fix: Check `dryEnd()` and `drySoonAt()` before the card's early return.
- Block: no.

### C30. In Dry hours the lock doesn't say the minutes went back as drops

- Where: `src/content/watch.js:923-926` and `:956`.
- Trigger: Dry hours on, watching at 10:59pm with 30m left.
- Impact: The video stops under "Time for a breather." and "Dry until 6:00am." with no +15m. The minutes are gone and the "2 back" tag shows only later on the home page, so it looks like the minutes were lost. The headline is Q32's call. The missing line isn't.
- Fix: Add "Your 30m went back as 2 drops." on the lock the first time it rises for Dry hours.
- Block: no.

### C31. Reveal next doesn't say it passes the card

- Where: `src/content/home.js:1221-1223`, no `title`, while × right beside it has one.
- Trigger: Any card up.
- Fix: `title: 'Pass this one and reveal another'`.
- Block: no.

### C32. The thumbnail spends a drop with no price showing

- Where: `src/content/home.js:886`, the thumbnail's click is `onResolve('watch', id)`. DESIGN.md:213 makes the thumbnail Watch, which stays.
- Trigger: Full drip, 0 minutes, drops left. Click the card's picture.
- Impact: A drop goes, and only the Watch button showed the price.
- Fix: Show "-1 drop" on the thumbnail on hover while `costsDrop` is true.
- Block: no.

### C33. The screen-reader text for "2 back" reads backwards

- Where: `src/content/counter.js:295` `` `${plural(n, 'drop', 'drops')} back for Dry hours.` ``
- Impact: It sounds like drops set aside for Dry hours.
- Fix: "Dry hours started. 2 drops back."
- Block: no.

### C34. Search's Stash fails silently for everything but a full stash

- Where: `src/content/search.js:98-104`.
- Trigger: drip updated while a search tab is open, then Stash.
- Impact: Nothing happens, with no "Refresh this page".
- Fix: On other errors, show the home page's refresh line under the button.
- Block: no.

### C35. Errors fall back to the wrong reason

- Where: `src/content/home.js:249` `'Something went wrong. Refresh and try again.'` covers `cards-off` and `stash-off`. `src/content/watch.js:885` shows `"You've used this week's unlocks."` and `:707` `'No drops left.'` for every failure except a known one, `send-failed` included.
- Trigger: The mode changes in another tab while a card is up, or the worker doesn't answer when an unlock or +15m is pressed.
- Impact: A user with 3 unlocks or 4 drops can be told they have none.
- Fix: Map `cards-off` and `stash-off` to "That changed in another tab.", and use "Couldn't reach drip. Try again." for anything other than `need-this-limit` and `no-watch-tokens`.
- Block: no.

### C36. The Stash header's time isn't labeled, and "12 of 10" isn't explained

- Where: `src/content/home.js:1240-1241`.
- Trigger: Any stash. Or lower Stash holds below the count.
- Fix: "Stash · 8 of 10 · 1h 42m to watch", and "full" when the count reaches the cap.
- Block: no.

### C37. Redirected pages give no notice

- Where: `src/content/redirect.js:10-12` and `:18-20`. Q16 sends Subscriptions, Explore, `/shorts`, and hashtag pages to the token page, and that stays.
- Trigger: A Subscriptions bookmark, or a link in a YouTube email.
- Impact: It looks like a broken link. In Quiet it lands on a lone search box.
- Fix: A URL flag the home page reads once, to say "drip sends Subscriptions here."
- Block: no.

### C38. +15m just before the reset buys minutes that end within the hour

- Where: `src/content/home.js:978` `'left today'` and the +15m tooltip at `:1057`. Bought minutes expire at the reset (Q11), which stays.
- Trigger: +15m at 3:50am with the reset at 4.
- Fix: In the last 30 minutes before the reset, have the tooltip say "Minutes end at 4:00am."
- Block: no.

### C39. "Blocked in drip" and "Allow list full" open Settings, but look like labels

- Where: `src/content/channel.js:75` and the labels at `:101-102`.
- Fix: Add the arrow-up-right icon, or "· Settings".
- Block: no.

### C40. Settings names the modes but never says what they do

- Where: `src/options/options.js:383` `'Switch a part below to make your own mix.'`. The welcome page's one-line descriptions (`welcome.js:81-85`) aren't in Settings.
- Trigger: A stranger who skipped the welcome page opens Settings from the popup.
- Fix: Show the picked mode's sentence from the welcome page as the row's hint.
- Block: no.

### C41. "Custom" in the popup, "Your own mix" in Settings

- Where: `src/popup/popup.js:51` `'Custom'` against `src/options/options.js:383` `'Your own mix.'`
- Fix: One name in both.
- Block: no.

### C42. History and Reset talk about drops and cards in modes that have none

- Where: `src/options/options.js:716-718` `'Drops used'`, `'Cards used'`, `'Unlocks used'`. `:1158` `"Your history and today's drops and cards are unchanged."`
- Trigger: Quiet or Curated, scrolling to History or using Reset.
- Fix: Leave out tiles and words for parts that are off.
- Block: no.

### C43. "34m Ad, not counted" has no separator

- Where: `src/content/watch.js:1276` `' Ad, not counted'`. "paused" one line up gets the `drip-sep` " · ".
- Fix: Use the same separator.
- Block: no.

### C44. A waiting unlock count reads "3 until 4:00am"

- Where: `src/options/options.js:70` `say: (n) => String(n)` feeding the chip at `:324`.
- Trigger: Day 2. Raise "I need this one" per week and Save.
- Fix: `say: (n) => \`${n} a week\``.
- Block: no.

### C45. The save line names the mode and hides the other waiting changes

- Where: `src/options/options.js:566` `` `Saved. ${modeName(mode)} starts at ${resetLabel()}.` ``
- Trigger: Day 2. Pick Quiet and turn off Hide Shorts, then Save.
- Fix: Add " and 1 more change" when other keys wait.
- Block: no.

### C46. Search's switch is named "Search"

- Where: `src/options/options.js:103` `toggle: { key: 'searchCap', label: 'Search', kind: 'toggle' }`.
- Impact: To a screen reader, or at a glance, turning it off sounds like turning search off.
- Fix: "Stop at 10 results", as on the welcome page.
- Block: no.

### C47. Import doesn't say which allowed channels it skipped

- Where: `src/lib/state.js:1325-1329`, which counts only the channels added. The result is shown at `src/options/options.js:1119-1125`.
- Trigger: Import a file with 5 allowed channels into an install that already has some.
- Fix: Return a skipped count and say "2 allowed channels didn't fit." The stash already does this.
- Block: no.

### C48. The UC id error explains internals

- Where: `src/options/options.js:850` `"Use the channel's @handle, shown under its name on the channel page. Watch pages only show the handle, so a UC... id wouldn't match them."`
- Fix: "Paste the channel's @handle, shown under its name on its page."
- Block: no.

## Plausible

The code allows these. Confirming them needs a browser or a state the code can't show.

- P1. `src/welcome/coach.js:103` `'What you can watch today. Nothing until you spend a drop.'` has no condition. Returning to step 1 after +15m may show it over a glass with 15m in it. It depends on whether the sandbox keeps the minutes when step 1 redraws.
- P2. `src/content/search.js:185-187`: until the worker answers, search acts like Full drip (`// Until the worker answers, the cap and the buttons are on`). In Quiet, a fresh `/results` load may flash 10 results, More results, and Stash buttons, and a Stash click then is refused (`stash-off`) without a word. How long the flash lasts needs a browser.
- P3. `src/options/options.js:35` and `:66-68`: with From and To set to the same hour, Dry hours stay on and nothing is dry. The summary drops ", dry …", and nothing else says why. The pickers weren't checked for a guard.
- P4. `src/content/home.js:1583-1585`: `land()` returns before `dryBackSeen` when `counts.rec` doesn't exist, which may be a custom mix with the clock on and cards uncounted. `state.dryBack` would then never clear, and the landing would try again on every load. Not first-hour, but worth a test.
- P5. A broken player (Q25) shows "drip can't find YouTube's video player, so it isn't working on this page." The video stays paused once guard.js lets go, and the banner doesn't say to press play. Needs a real markup break.
- P6. `.tour-say` holds two lines at 42px min-height (`welcome.css:438`), against 15px × 1.45 = 43.5px. Steps that wrap may move the stage about 1.5px, which is what DESIGN.md:186 is meant to rule out.
- P7. Old `/c/Name` and `/user/Name` links get `"That isn't a channel handle or link, like @veritasium."` (`options.js:849`), though they are channel links.

## Rejected

- R1. "The sea's 'The glass refills at 4:00am.' is false, since the reset leaves minutes at 0" (`home.js:1035`). DESIGN.md:223 and :133 specify this line. It's a metaphor for the drops coming back, so it isn't a bug. Whether it sets the wrong expectation for the next morning's first video is O2.
- R2. "`home.js:1013` is unreachable." True, and so is `:1015`, since `outForDay()` covers both cases first. No user ever sees either line, so it's dead code, not a first-hour problem.
- R3. "'This week' on the lock means a calendar week, but the count is a rolling 7 days" (`watch.js:944`, `:885`). DESIGN.md:129 and :133 specify these strings. O3 has the naming question.
- R4. "Developer mode shows in the store build." `bin/build-release` removes `src/devpanel` and its manifest entries, and Settings hides the toggle without them.
- R5. "`manifest.json` is still at version 0.1.0." Already step 1 of LISTING.md's "Before submitting".

## Terms: first seen and first explained

For a stranger who finishes the Full drip tour, and for one who doesn't.

| Term | First seen | First explained, with the tour | Without the tour |
|---|---|---|---|
| drop | Tagline "Make every drop count." (`welcome.html:17`) | Step 1, `welcome.js:280` | Never. Only the +15m tooltip "Add 15 minutes for 1 drop" |
| card | Step 1's last stop, "Next: the cards" (`coach.js`) | Step 2, `welcome.js:284` | Never |
| the glass | "15m in your glass." after +15m | Same stop | Never. First seen as a word in "The glass refills at 4:00am." |
| minutes start at 0 each day | Coach stop, `coach.js:103` | Same stop | Never. The first video locks (C1) |
| the reset, 4:00am | `coach.js:104` "New ones come at 4:00am." | Same | Settings: "New day starts at", but "the reset" in the first-day note and on the channel page |
| Stash | Step 2, "stash it" | Never where it lives or that it fills (C14) | Never |
| Reveal next | The card's button | `coach.js:89` "reveal the next one" | Never says it passes the card (C31) |
| × and Pass | The card's button | "pass with ×", "Passing is free." | Tooltip, wrong when stashed (C16) |
| Done for now | Step 4 sentence | Same | Never, it just goes home |
| I need this one, unlocks | The lock's link | `coach.js:158` | Settings hint only |
| carry over | `coach.js:163`, only with drops left (C25) | Same | Settings hint, wrong at 1 (C12) |
| loosening waits | Choice screen, halfway (C22) | Settings' first-day note (C7) | Same |
| Block, "deal" | The card's ⋯ menu | Never (C17) | Never |
| Allow | Channel page button | Never | Tooltip only (C21) |
| Dry hours, grace | Settings, off by default | Never | Settings hints, one wrong (C11) |

## Open questions for Jesse

- O1. C1: can the lock say something different when nothing has been bought today? For example, keep "Time for a breather." as the headline and change the line under it to "Each drop is 15m of watching.", or use "Start today's glass." as the headline then. The lock's lines are yours (DESIGN.md:127), so nothing changes without your OK.
- O2. "The glass refills at 4:00am." appears on the sea and the lock, but the glass starts each day empty and the first video locks. Keep the metaphor, or say "New drops at 4:00am."?
- O3. One feature has three names: "I need this one" on the lock, "Unlocks used" in History, and "Why you needed one" over the reasons, plus "this week" for a rolling 7 days. Pick one noun, and keep "this week"?
- O4. C2: for an empty home feed, is "Reveal from Subscriptions in drip's Settings instead" the right way out, or should Reveal switch to Subscriptions by itself when Home has nothing?
- O5. C18: hide the channel page's Allow button while the clock is off, or keep it so the list is ready if they turn the clock on?
- O6. C8: should Reset keep the current mode, or go back to Full drip and say so?
