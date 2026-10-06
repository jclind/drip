# drip

A Chrome extension that replaces YouTube's home grid with a token page. Read `DESIGN.md` before changing behavior. Its decisions table came from Jesse, so don't change a decision without asking him.

## Rules

- Plain JavaScript, Manifest V3, no build step, no npm dependencies. Every JS file starts with `// @ts-check` and uses JSDoc for types.
- All rules live in `src/lib/state.js` as pure functions. It's a classic script that sets `globalThis.Drip`, with no `import` or `export`, because the service worker, pages, content scripts, and Node tests all load it.
- `src/background.js` is the only writer of state. Content scripts and pages send it messages.
- YouTube selectors break every few months. Keep them in one place per file, at the top, so a fix is one edit.
- New ideas go in `IDEAS.md`, not in the code.

## Test

- `node --test` runs `test/*.test.js`.
- In the browser: load the folder unpacked in Chrome, then click reload on `chrome://extensions` after each change and refresh YouTube.
