# drip

A Chrome extension that takes away YouTube's home page grid. You get a daily allowance of cards and drops. A card reveals one recommended video. A drop buys 15 minutes of watching. Videos you save go in the Stash, which you can open for free.

It comes in three modes, Quiet, Curated, and Full drip, picked on the welcome page and changed in Settings. The cards, the drops, and the clock belong to Full drip.

drip 1.0.0 is on the [Chrome Web Store](https://chromewebstore.google.com/detail/drip-youtube-without-the/kfmmpkmfaoppoibioohgkfgfljfahdfj). `DESIGN.md` has the decisions and `IDEAS.md` has ideas that aren't built.

## Install

1. Open [drip on the Chrome Web Store](https://chromewebstore.google.com/detail/drip-youtube-without-the/kfmmpkmfaoppoibioohgkfgfljfahdfj) and click "Add to Chrome".
2. On drip's Details page in `chrome://extensions`, turn on "Allow in Incognito", because otherwise an Incognito window skips drip.

Chrome updates drip on its own. Your tokens and backlog live in Chrome's storage for the extension, so an update keeps them. Removing the extension deletes them.

## Develop

Run drip from a clone:

1. `git clone git@github.com:jclind/drip.git ~/drip`
2. Open `chrome://extensions` and turn on Developer mode, top right.
3. If the store copy is installed, turn it off. Two copies both run on every YouTube page, and each keeps its own tokens and backlog.
4. Click "Load unpacked" and pick the `~/drip` folder.

To update the clone, run `cd ~/drip && git pull`, click the reload arrow on drip's card in `chrome://extensions`, and refresh any open YouTube tabs.

- `node --test` runs the unit tests. There's nothing to install.
- Edit, reload the extension, refresh YouTube.
- Developer mode, at the bottom of Settings, shows the dev panel: a box at the bottom left of YouTube pages for setting minutes and tokens, running the daily reset now, and clearing state. It undoes every limit while it's on. `touch dev/ENABLED` also turns the panel on, and turns on the localhost route in `dev/reload.html`. Don't create that file on a copy you use for real. The store build has neither the panel nor the toggle.
- `test/BROWSER.md` is the checklist for what Node can't test. Run it on a computer whose Chrome window is visible, since a hidden window doesn't play video.
- Editors check types through `jsconfig.json`. To check from the command line without adding a dependency to the repo, install the checker in a scratch folder: `npm i --prefix /tmp/drip-tsc typescript@5 @types/chrome @types/node`, then `/tmp/drip-tsc/node_modules/.bin/tsc -p jsconfig.json --typeRoots /tmp/drip-tsc/node_modules/@types`. It should print nothing.

### Release

`bin/build-release` runs `node --test`, then writes `dist/drip-<version>.zip` for the store: `manifest.json`, `src/`, and `icons/`, with the dev panel and the localhost route left out. It refuses uncommitted changes and a version that already has a tag. `RELEASE-PLAN.md` has the upload steps, and `store/` has the listing text, the privacy policy, and the images.

### Screenshots

`bin/capture-screens` saves 1280x800 PNGs of the dev harness screens to `dist/screens` using headless Chrome (`CHROME` overrides its path).
Run `bin/capture-screens /tmp/drip-screens` for another folder, or append names to capture a subset: `bin/capture-screens /tmp/drip-screens home-card-dark options-light`.
