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
 * Runs fn on the current state, saves it, and returns fn's result. Calls run one at a time.
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
    const result = fn(state, now);
    await chrome.storage.local.set({ [KEY]: state });
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
      return Drip.resolveCurrent(state, msg.action);
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  withState((state, now) => ({ result: handle(msg, state, now), state }))
    .then(({ result, state }) => sendResponse({ ...result, state }))
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true;
});
