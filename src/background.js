// @ts-check
// The only writer of drip's state. Pages and content scripts send messages here.

importScripts('lib/state.js');

/** @type {any} */
const Drip = /** @type {any} */ (globalThis).Drip;
const KEY = 'drip';

/** End of the last stretch of watching we charged for, in ms. See DESIGN.md, "The clock with several tabs". */
const clock = { lastChargeEnd: 0 };

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
 * Runs fn on the current state, saves it if it changed, and returns fn's result. Calls run one at a time.
 * Every save wakes the storage listeners in every YouTube tab, so a call that changes nothing doesn't save.
 * @template T
 * @param {(state: any, now: number) => T} fn
 * @returns {Promise<T>}
 */
function withState(fn) {
  const run = queue.then(async () => {
    const now = Date.now();
    const stored = await chrome.storage.local.get(KEY);
    const state = Drip.hydrate(stored[KEY], now);
    Drip.rollDay(state, now);
    const before = stableJson(stored[KEY]);
    const chargedUntil = clock.lastChargeEnd;
    const result = fn(state, now);
    if (stableJson(state) !== before) {
      try {
        await chrome.storage.local.set({ [KEY]: state });
      } catch (err) {
        // The charge didn't stick, so the tab's resent time must be charged again.
        clock.lastChargeEnd = chargedUntil;
        throw err;
      }
    }
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

/**
 * @param {any} msg
 * @param {any} state
 * @param {number} now
 */
function handle(msg, state, now) {
  switch (msg.type) {
    case 'get':
      return { ok: true };
    case 'spendWatch':
      return Drip.spendWatch(state);
    case 'reveal':
      return Drip.reveal(state, Array.isArray(msg.candidates) ? msg.candidates : []);
    case 'resolve':
      return Drip.resolveCurrent(state, msg.action, typeof msg.videoId === 'string' ? msg.videoId : undefined);
    case 'addBacklog':
      return Drip.addBacklog(state, msg.video);
    case 'removeBacklog':
      return Drip.removeBacklog(state, msg.id);
    case 'tick':
      return { ok: true, ...Drip.chargeTick(state, clock, now, msg.seconds, msg.videoId) };
    case 'status':
      return { ok: true, ...Drip.watchStatus(state, msg.videoId) };
    case 'needThis':
      return Drip.needThis(state, msg.videoId, msg.title || '', msg.reason || '', now);
    case 'updateSettings':
      return Drip.updateSettings(state, msg.changes || {});
    case 'cancelPending':
      return Drip.cancelPending(state, msg.key);
    default:
      return { ok: false, error: 'unknown-message' };
  }
}

// Development only: dev/reload.html on localhost asks for a reload after a code change.
// Open YouTube tabs pause and ask for a refresh when this happens, so it can't be used to dodge the clock.
// It can also read state, change settings, and send ticks. A fake tick can hide real playback and a reload can drop
// an unsent tick, so the route only works in a checkout that has the gitignored file dev/ENABLED. Real installs don't.
const DEV_TYPES = ['get', 'updateSettings', 'tick'];
const devEnabled = fetch(chrome.runtime.getURL('dev/ENABLED')).then((r) => r.ok).catch(() => false);
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
  } else if (DEV_TYPES.includes(msg.type)) {
    withState((state, now) => ({ result: handle(msg, state, now), state }))
      .then(({ result, state }) => sendResponse({ ...result, state }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
  } else {
    sendResponse({ ok: false, error: 'unknown-message' });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'tick' && (!sender.tab || !sender.url?.startsWith('https://www.youtube.com/'))) {
    sendResponse({ ok: false, error: 'bad-sender' });
    return;
  }
  withState((state, now) => ({ result: handle(msg, state, now), state }))
    .then(({ result, state }) => sendResponse({ ...result, state }))
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true;
});
