// @ts-check
// The only writer of drip's state. Pages and content scripts send messages here.

importScripts('lib/state.js');

/** @type {any} */
// var, not const: these page scripts share one type-check program, and only var may be declared twice.
var Drip = /** @type {any} */ (globalThis).Drip;
const KEY = 'drip';

// The clock for watching in several tabs (DESIGN.md, "The clock with several tabs"). Chrome stops an idle worker and
// drops its variables, and a lost clock charges overlapping time twice, so it lives in session storage (Codex,
// 2026-10-13). Session storage clears when the browser restarts or drip reloads, when no old tick can arrive.
const CLOCK_KEY = 'dripClock';

/** @type {Promise<unknown>} */
let queue = Promise.resolve();

/**
 * JSON with object keys sorted. chrome.storage hands objects back with sorted keys, so plain JSON.stringify would
 * see a change in every read.
 * @param {unknown} value
 * @returns {string}
 */
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (value);
    return `{${Object.keys(obj).sort().filter((k) => obj[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Runs fn on the current state and clock, saves them if they changed, and returns fn's result. Calls run one at a
 * time. Every save wakes the storage listeners in every YouTube tab, so a call that changes nothing doesn't save.
 * @template T
 * @param {(state: any, now: number, clock: any) => T} fn
 * @returns {Promise<T>}
 */
function withState(fn) {
  const run = queue.then(async () => {
    const now = Date.now();
    const [stored, session] = await Promise.all([chrome.storage.local.get(KEY), chrome.storage.session.get(CLOCK_KEY)]);
    const state = Drip.hydrate(stored[KEY], now);
    Drip.rollDay(state, now);
    const before = stableJson(stored[KEY]);
    /** @type {any} */
    const saved = session[CLOCK_KEY];
    const clock = { lastChargeEnd: Number(saved?.lastChargeEnd) || 0, ticks: Array.isArray(saved?.ticks) ? saved.ticks : [] };
    const clockBefore = stableJson(clock);
    const result = fn(state, now, clock);
    // A failed state write throws before the clock is saved, so the tab's resent time is charged again.
    if (stableJson(state) !== before) await chrome.storage.local.set({ [KEY]: state });
    // Once the state is saved, the charge stuck, so a clock that fails to save mustn't fail the message: the tab
    // would resend time already charged (Codex, 2026-10-14). That loses only the clock, as a stopped worker used to.
    if (stableJson(clock) !== clockBefore) await chrome.storage.session.set({ [CLOCK_KEY]: clock }).catch(() => {});
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

/**
 * @param {any} msg
 * @param {any} state
 * @param {number} now
 * @param {any} clock
 */
function handle(msg, state, now, clock) {
  switch (msg.type) {
    case 'get':
      return { ok: true };
    case 'spendWatch':
      return Drip.spendWatch(state);
    case 'reveal':
      return Drip.reveal(state, Array.isArray(msg.candidates) ? msg.candidates : []);
    case 'resolve':
      return Drip.resolveCurrent(state, msg.action, typeof msg.videoId === 'string' ? msg.videoId : undefined, now);
    case 'revealNext':
      return Drip.revealNext(state, String(msg.videoId), Array.isArray(msg.candidates) ? msg.candidates : []);
    case 'buyIfOut':
      return Drip.buyIfOut(state, String(msg.videoId));
    case 'addBacklog':
      return Drip.addBacklog(state, msg.video, msg.index, now);
    case 'removeBacklog':
      return Drip.removeBacklog(state, msg.id);
    case 'swapBacklog':
      return Drip.swapBacklog(state, msg.video, String(msg.dropId), msg.index, now);
    case 'tick':
      // The tab sends where the player is with each tick, so a stashed video's bar keeps up (Q28).
      if (msg.position !== undefined) Drip.markProgress(state, String(msg.videoId), msg.position, msg.duration);
      return { ok: true, ...Drip.chargeTick(state, clock, now, msg.seconds, String(msg.videoId), msg.ago, msg.key) };
    case 'status':
      return { ok: true, ...Drip.watchStatus(state, msg.videoId) };
    case 'needThis':
      return Drip.needThis(state, msg.videoId, msg.title || '', msg.reason || '', now);
    case 'updateSettings':
      return Drip.updateSettings(state, msg.changes || {}, now);
    case 'cancelPending':
      return Drip.cancelPending(state, msg.key);
    case 'refillSeen':
      return Drip.refillSeen(state);
    default:
      return { ok: false, error: 'unknown-message' };
  }
}

// A new install opens the welcome page once. Updates don't.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') return;
  // Saves the state now, so the first day (Q6) starts at install, not at the first visit to YouTube (Codex).
  withState(() => ({ ok: true })).catch(() => {});
  chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/welcome.html') });
});

// Development only: dev/reload.html on localhost asks for a reload after a code change.
// Open YouTube tabs pause and ask for a refresh when this happens, so it can't be used to dodge the clock.
// It can also read state, change settings, and send ticks. A fake tick can hide real playback and a reload can drop
// an unsent tick, so the route only works in a checkout that has the gitignored file dev/ENABLED. Real installs don't.
const DEV_TYPES = ['get', 'updateSettings', 'tick'];
// A store build has no externally_connectable entry (bin/build-release removes it), so it doesn't look for the file.
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
  withState((state, now) => ({ result: Drip.devAction(state, String(msg.action), now), state }))
    .then(({ result, state }) => sendResponse({ ...result, state }))
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
}

// Developer mode, the Settings toggle for the dev panel. It's its own storage key, not part of drip's state. A store
// build has no panel (bin/build-release strips it), so there the toggle hides itself and the worker refuses it.
// The localhost route above stays tied to dev/ENABLED, since any localhost page can reach it.
const DEV_KEY = 'dripDev';
const shipsPanel = (chrome.runtime.getManifest().content_scripts || []).some((c) => (c.js || []).some((f) => f.startsWith('src/devpanel/')));

/** @returns {Promise<{toggle: boolean, file: boolean, enabled: boolean}>} */
async function devStatus() {
  if (!shipsPanel) return { toggle: false, file: false, enabled: false };
  const file = await devEnabled;
  const stored = await chrome.storage.local.get(DEV_KEY);
  return { toggle: true, file, enabled: file || stored[DEV_KEY] === true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // The dev panel and Settings ask whether developer mode is on. The panel's buttons only work while it is.
  if (msg && (msg.type === 'devStatus' || msg.type === 'devAction' || msg.type === 'setDevMode')) {
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
  if (!msg || typeof msg !== 'object') {
    sendResponse({ ok: false, error: 'unknown-message' });
    return;
  }
  if (msg.type === 'tick' && (!sender.tab || !sender.url?.startsWith('https://www.youtube.com/'))) {
    sendResponse({ ok: false, error: 'bad-sender' });
    return;
  }
  withState((state, now, clock) => ({ result: handle(msg, state, now, clock), state }))
    .then(({ result, state }) => sendResponse({ ...result, state }))
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true;
});
