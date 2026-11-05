// @ts-check

// A dev clock for testing times without waiting for them, like Dry hours' 5-minute warning. It shifts Date.now() by
// an offset the worker keeps in storage, in drip's own contexts only: the worker and its content scripts (one
// isolated world, so YouTube's page and its player keep real time). Extension pages keep real time too. Only the
// worker writes the offset, from a dev action, and it clears it when developer mode goes off. bin/build-release
// removes src/devpanel, so a store build never has this file.
(() => {
  const KEY = 'dripDevClock';
  const realNow = Date.now.bind(Date);
  let offset = 0;
  /** @param {unknown} value */
  const apply = (value) => {
    const n = value && typeof value === 'object' ? Number(/** @type {any} */ (value).offset) : 0;
    offset = Number.isFinite(n) ? n : 0;
  };
  Date.now = () => realNow() + offset;
  /** @type {any} */ (globalThis).DripDevClock = { KEY, offset: () => offset, set: (/** @type {number} */ n) => apply({ offset: n }), realNow };
  // A change that lands before the first read finishes is newer, so the read doesn't undo it (Codex, 2026-11-04).
  let changed = false;
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[KEY]) {
        changed = true;
        apply(changes[KEY].newValue);
      }
    });
    chrome.storage.local.get(KEY).then((r) => { if (!changed) apply(r[KEY]); }, () => {});
  } catch {
    // No storage in this context: real time.
  }
})();
