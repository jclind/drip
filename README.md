# drip

A Chrome extension that takes away YouTube's home page grid. You get a daily allowance of tokens. A rec token reveals one recommended video. A watch token buys 15 minutes of watching. Videos you save go in a backlog you can open for free.

It's in early development. `DESIGN.md` has the decisions and `IDEAS.md` has what's not built yet.

## Install on the MacBook

1. `git clone git@github.com:jclind/drip.git ~/drip`
2. Open `chrome://extensions` and turn on Developer mode, top right.
3. Click "Load unpacked" and pick the `~/drip` folder.

## Update

1. `cd ~/drip && git pull`
2. Click the reload arrow on drip's card in `chrome://extensions`.
3. Refresh any open YouTube tabs.

Your tokens and backlog live in Chrome's storage for the extension, so updating keeps them. Removing the extension deletes them.

## Develop

- `node --test` runs the unit tests. There's nothing to install.
- Edit, reload the extension, refresh YouTube.
