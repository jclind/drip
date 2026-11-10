// @ts-check
// The dev tools' half of the worker: the localhost route, the dev panel's buttons, the dev clock's jumps, and
// developer mode. background.js imports it in a checkout. bin/build-release leaves src/devpanel and that import out of
// the store build, so none of this ships.
//
// A classic script in the worker's global scope, so it uses background.js's withState and handle. It sets
// globalThis.DripDevWorker, which background.js's message listener asks first.

(() => {
  // Development only: dev/reload.html on localhost asks for a reload after a code change.
  // Open YouTube tabs pause and ask for a refresh when this happens, so it can't be used to dodge the clock.
  // It can also read state, change settings, and send ticks. A fake tick can hide real playback and a reload can drop
  // an unsent tick, so the route only works in a checkout that has the gitignored file dev/ENABLED. Real installs don't.
  const DEV_TYPES = ['get', 'updateSettings', 'tick'];
  // Only a manifest with externally_connectable, a checkout's, looks for the file.
  const devEnabled = chrome.runtime.getManifest().externally_connectable
    ? fetch(chrome.runtime.getURL('dev/ENABLED')).then((r) => r.ok).catch(() => false)
    : Promise.resolve(false);
  chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
    if (!msg || !sender.origin || new URL(sender.origin).hostname !== 'localhost') return;
    devEnabled.then((on) => {
      if (on) handleDev(msg, sendResponse);
      else sendResponse({ ok: false, error: 'dev-off' });
    });
    return true;
  });

  /**
   * @param {any} msg
   * @param {(res: any) => void} sendResponse
   */
  function handleDev(msg, sendResponse) {
    if (msg.type === 'devReload') {
      sendResponse({ ok: true });
      setTimeout(() => chrome.runtime.reload(), 100);
    } else if (msg.type === 'devAction') {
      runDevAction(msg, sendResponse);
    } else if (DEV_TYPES.includes(msg.type)) {
      withState((state, now, clock) => ({ result: handle(msg, state, now, clock), state }))
        .then(({ result, state }) => sendResponse({ ...result, state }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
    } else {
      sendResponse({ ok: false, error: 'unknown-message' });
    }
  }

  /**
   * The dev panel's buttons (src/devpanel/panel.js) and the localhost route both end up here.
   * @param {any} msg
   * @param {(res: any) => void} sendResponse
   */
  function runDevAction(msg, sendResponse) {
    if (String(msg.action).startsWith('clock')) return runClock(String(msg.action), sendResponse);
    withState((state, now) => ({ result: Drip.devAction(state, String(msg.action), now), state }))
      .then(({ result, state }) => sendResponse({ ...result, state }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
  }

  // Developer mode, the Settings toggle for the dev panel. It's its own storage key, not part of drip's state. With no
  // panel in the manifest's content scripts, the toggle hides itself and the worker refuses it.
  // The localhost route above stays tied to dev/ENABLED, since any localhost page can reach it.
  const DEV_KEY = 'dripDev';

  /** The first hour Dry hours start after `now`, within 2 days, or 0. @param {any} state @param {number} now */
  function nextDryStart(state, now) {
    let t = now;
    for (let i = 0; i < 48; i++) {
      const d = new Date(t);
      t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
      if (Drip.dryUntil(state, t) && !Drip.dryUntil(state, t - 1)) return t;
    }
    return 0;
  }

  /**
   * The dev clock's buttons: jump drip's time forward, to just before Dry hours start or end, or back to real time.
   * Jumping past the reset rolls the day, and going back to real time doesn't undo that.
   * @param {string} action @param {(res: any) => void} sendResponse
   */
  function runClock(action, sendResponse) {
    const C = /** @type {any} */ (globalThis).DripDevClock;
    if (!C) return sendResponse({ ok: false, error: 'no-dev-clock' });
    withState((state, now, clock) => {
      const step = /^clock\+(\d+)(m|h)$/.exec(action);
      let target = 0;
      if (action === 'clock-real') target = C.realNow();
      else if (step) target = now + Number(step[1]) * (step[2] === 'h' ? 3600e3 : 60e3);
      else if (action === 'clock-dry-6m') target = nextDryStart(state, now) - 6 * 60e3;
      else if (action === 'clock-dry-end-1m') target = (Drip.dryUntil(state, now) || Drip.dryUntil(state, nextDryStart(state, now))) - 60e3;
      else return { result: { ok: false, error: 'unknown-dev-action' }, state };
      if (target <= 0) return { result: { ok: false, error: 'no-dry-hours' }, state };
      // Charges count from the last one, so a jump back would make playback free until real time caught up.
      clock.lastChargeEnd = 0;
      clock.ticks = [];
      // Real is exactly 0: working it out from the two clocks can leave a millisecond, which keeps the clock shifted.
      C.set(action === 'clock-real' ? 0 : C.offset() + target - now);
      return { result: { ok: true, offset: C.offset() }, state };
    })
      .then(async ({ result, state }) => {
        if (result.ok) await (C.offset() ? chrome.storage.local.set({ [C.KEY]: { offset: C.offset() } }) : chrome.storage.local.remove(C.KEY));
        sendResponse({ ...result, state });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
  }

  /** Developer mode off puts drip back on real time. */
  async function clearDevClockIfOff() {
    const C = /** @type {any} */ (globalThis).DripDevClock;
    if (!C || (await devStatus()).enabled) return;
    C.set(0);
    if ((await chrome.storage.local.get(C.KEY))[C.KEY]) await chrome.storage.local.remove(C.KEY);
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[DEV_KEY]) clearDevClockIfOff().catch(() => {});
  });
  clearDevClockIfOff().catch(() => {});
  const shipsPanel = (chrome.runtime.getManifest().content_scripts || []).some((c) => (c.js || []).some((f) => f.startsWith('src/devpanel/')));

  /** @returns {Promise<{toggle: boolean, file: boolean, enabled: boolean}>} */
  async function devStatus() {
    if (!shipsPanel) return { toggle: false, file: false, enabled: false };
    const file = await devEnabled;
    const stored = await chrome.storage.local.get(DEV_KEY);
    return { toggle: true, file, enabled: file || stored[DEV_KEY] === true };
  }

  /**
   * The dev panel and Settings ask whether developer mode is on. The panel's buttons only work while it is. Returns
   * true for a message it answers, which background.js's listener then leaves alone.
   * @param {any} msg @param {(res: any) => void} sendResponse
   */
  function answer(msg, sendResponse) {
    if (!(msg && (msg.type === 'devStatus' || msg.type === 'devAction' || msg.type === 'setDevMode'))) return false;
    devStatus().then(async (dev) => {
      if (msg.type === 'devStatus') sendResponse({ ok: true, ...dev });
      else if (msg.type === 'setDevMode') {
        if (!dev.toggle) return sendResponse({ ok: false, error: 'dev-off' });
        await chrome.storage.local.set({ [DEV_KEY]: msg.on === true });
        sendResponse({ ok: true, ...(await devStatus()) });
      } else if (dev.enabled) runDevAction(msg, sendResponse);
      else sendResponse({ ok: false, error: 'dev-off' });
    }).catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  /** @type {any} */ (globalThis).DripDevWorker = { answer };
})();
