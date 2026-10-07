# drip

A Chrome extension that takes away YouTube's home page grid. You get a daily allowance of tokens. A rec token reveals one recommended video. A watch token buys 15 minutes of watching. Videos you save go in a backlog you can open for free.

It's in early development. `DESIGN.md` has the decisions and `IDEAS.md` has what's not built yet.

## Install on the MacBook

1. `git clone git@github.com:jclind/drip.git ~/drip`
2. Open `chrome://extensions` and turn on Developer mode, top right.
3. Click "Load unpacked" and pick the `~/drip` folder.
4. On drip's Details page, turn on "Allow in Incognito", because otherwise an Incognito window skips drip.

## Update

1. `cd ~/drip && git pull`
2. Click the reload arrow on drip's card in `chrome://extensions`.
3. Refresh any open YouTube tabs.

Your tokens and backlog live in Chrome's storage for the extension, so updating keeps them. Removing the extension deletes them.

## Develop

- `node --test` runs the unit tests. There's nothing to install.
- Edit, reload the extension, refresh YouTube.
- `touch dev/ENABLED` turns on the dev panel, a box at the bottom left of YouTube pages for setting minutes and tokens, running the daily reset now, and clearing state. It also turns on the localhost route in `dev/reload.html`. Delete the file to turn both off. Don't create it on a copy you use for real, since the panel undoes every limit. The store build never has either.
- `test/BROWSER.md` is the checklist for what Node can't test. Run it on a computer whose Chrome window is visible, since a hidden window doesn't play video.
- Editors check types through `jsconfig.json`. To check from the command line without adding a dependency to the repo, install the checker in a scratch folder: `npm i --prefix /tmp/drip-tsc typescript@5 @types/chrome @types/node`, then `/tmp/drip-tsc/node_modules/.bin/tsc -p jsconfig.json --typeRoots /tmp/drip-tsc/node_modules/@types`. It should print nothing.
