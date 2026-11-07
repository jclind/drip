// @ts-check
// The only writer of drip's state. Pages and content scripts send messages here.

// The dev clock (src/devpanel/clock.js), which a store build doesn't have.
try {
  importScripts('devpanel/clock.js');
} catch {
  // Store build: real time.
}
importScripts('lib/state.js');
importScripts('lib/glass.js');

/** @type {any} */
// var, not const: these page scripts share one type-check program, and only var may be declared twice.
var Drip = /** @type {any} */ (globalThis).Drip;
/** @type {any} */
var DripGlass = /** @type {any} */ (globalThis).DripGlass;
const KEY = 'drip';

// The clock for watching in several tabs (DESIGN.md, "The clock with several tabs"). Chrome stops an idle worker and
// drops its variables, and a lost clock charges overlapping time twice, so it lives in session storage (Codex,
// 2026-10-13). Session storage clears when the browser restarts or drip reloads, when no old tick can arrive.
const CLOCK_KEY = 'dripClock';

/** @type {Promise<unknown>} */
let queue = Promise.resolve();

/** @type {string | null} */
let lastIconKey = null;
/** @type {{outline: Path2D, body: Path2D, surface: Path2D, wave: Path2D} | null} */
let iconPaths = null;
let toolbarIsDrop = false;
/** @type {Map<number, {at: number, playing: boolean}>} */
const toolbarTicks = new Map();
/** @type {ReturnType<typeof setTimeout> | null} */
let toolbarTimer = null;

/** @param {number} tabId @param {boolean | undefined} playing @param {number} now */
function noteToolbarTick(tabId, playing, now) {
  toolbarTicks.set(tabId, { at: now, playing: playing === true });
  for (const [id, tick] of toolbarTicks) {
    if (!Drip.toolbarPlaying(tick, now)) toolbarTicks.delete(id);
  }
  if (toolbarTimer !== null) clearTimeout(toolbarTimer);
  toolbarTimer = null;
  if (toolbarTicks.size) {
    const last = Math.max(...Array.from(toolbarTicks.values(), (tick) => tick.at));
    // Chrome normally keeps the worker alive for 30 seconds after a tick. A forced restart resets to the drop.
    toolbarTimer = setTimeout(refreshToolbar, Math.max(0, last + 12000 - Date.now()));
  }
}

/** @param {any} state */
async function updateToolbar(state) {
  try {
    // With the clock off there are no minutes to show, so the toolbar keeps the drop (Q29).
    const playing = (!state || state.settings.clock !== false) && Array.from(toolbarTicks.values()).some((tick) => Drip.toolbarPlaying(tick, Date.now()));
    if (!playing) {
      lastIconKey = null;
      if (!toolbarIsDrop) {
        // The manifest's paths are relative to the extension root, but setIcon resolves a relative path against this
        // worker's folder (src/), so they need a leading slash.
        const icons = /** @type {Record<string, string>} */ (chrome.runtime.getManifest().action.default_icon);
        await chrome.action.setIcon({ path: Object.fromEntries(Object.entries(icons).map(([size, file]) => [size, `/${file}`])) });
        toolbarIsDrop = true;
      }
      return;
    }
    const level = Drip.toolbarGlass(state, DripGlass);
    if (level.cacheKey === lastIconKey) return;
    if (!iconPaths) {
      iconPaths = {
        outline: new Path2D(DripGlass.paths.outline), body: new Path2D(DripGlass.paths.body),
        surface: new Path2D(DripGlass.paths.surface), wave: new Path2D(DripGlass.paths.wave),
      };
    }
    const paths = iconPaths;
    const view = DripGlass.viewBox;
    /** @param {number} size @param {number} y */
    const draw = (size, y) => {
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No toolbar canvas context');
      ctx.translate((size - size * view.width / view.height) / 2, 0);
      ctx.scale(size / view.height, size / view.height);
      ctx.fillStyle = '#909090';
      ctx.fill(paths.outline);
      ctx.save();
      ctx.translate(0, y);
      ctx.clip(paths.wave);
      ctx.translate(0, -y);
      ctx.fillStyle = DripGlass.blue;
      ctx.fill(paths.body);
      ctx.restore();
      if (level.surfaceOpacity > 0) {
        ctx.fillStyle = DripGlass.blue;
        ctx.globalAlpha = level.surfaceOpacity;
        ctx.fill(paths.surface);
      }
      return ctx.getImageData(0, 0, size, size);
    };
    await chrome.action.setIcon({ imageData: { 16: draw(16, level.water16), 32: draw(32, level.water32) } });
    lastIconKey = level.cacheKey;
    toolbarIsDrop = false;
  } catch {
    // Drawing and setIcon failures leave the old icon and never fail a state write. Retry on the next save/start.
  }
}

function refreshToolbar() {
  // Share the state queue so an expired timer cannot overwrite an icon drawn for a later tick. Read only: the day
  // still resets lazily when a message comes in, even if this runs after 4am.
  const run = queue.then(async () => {
    if (!Array.from(toolbarTicks.values()).some((tick) => Drip.toolbarPlaying(tick, Date.now()))) {
      await updateToolbar(null);
      return;
    }
    const stored = await chrome.storage.local.get(KEY);
    await updateToolbar(Drip.hydrate(stored[KEY], Date.now()));
  });
  queue = run.catch(() => {});
}

function resetToolbar() {
  const run = queue.then(async () => {
    toolbarTicks.clear();
    if (toolbarTimer !== null) clearTimeout(toolbarTimer);
    toolbarTimer = null;
    await updateToolbar(null);
  });
  queue = run.catch(() => {});
}

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
 * @param {{tabId: number, playing?: boolean}} [toolbarTick]
 * @returns {Promise<T>}
 */
function withState(fn, toolbarTick) {
  const run = queue.then(async () => {
    const now = Date.now();
    const [stored, session] = await Promise.all([chrome.storage.local.get(KEY), chrome.storage.session.get(CLOCK_KEY)]);
    const state = Drip.hydrate(stored[KEY], now);
    // Dry hours starting take the minutes back as drops, once (Q32), and before the reset clears them. A tick goes
    // first, so the seconds played before the start are charged before the drops are counted (Codex, 2026-11-04),
    // unless the reset is due, which would clear the minutes first.
    if (!toolbarTick || Drip.dayKey(now, state.settings.resetHour) > state.day) Drip.enterDry(state, now);
    Drip.rollDay(state, now);
    const before = stableJson(stored[KEY]);
    /** @type {any} */
    const saved = session[CLOCK_KEY];
    const clock = { lastChargeEnd: Number(saved?.lastChargeEnd) || 0, ticks: Array.isArray(saved?.ticks) ? saved.ticks : [] };
    const clockBefore = stableJson(clock);
    const result = fn(state, now, clock);
    // And after, so the change that turns Dry hours on over the current hour takes the minutes back at once.
    Drip.enterDry(state, now);
    // A failed state write throws before the clock is saved, so the tab's resent time is charged again.
    const stateChanged = stableJson(state) !== before;
    if (stateChanged) await chrome.storage.local.set({ [KEY]: state });
    // Once the state is saved, the charge stuck, so a clock that fails to save mustn't fail the message: the tab
    // would resend time already charged (Codex, 2026-10-14). That loses only the clock, as a stopped worker used to.
    if (stableJson(clock) !== clockBefore) await chrome.storage.session.set({ [CLOCK_KEY]: clock }).catch(() => {});
    if (toolbarTick) noteToolbarTick(toolbarTick.tabId, toolbarTick.playing, now);
    // Persist the clock before waiting on the icon, so drawing doesn't delay recording time already charged.
    if (stateChanged || toolbarTick) await updateToolbar(state);
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
      return Drip.spendWatch(state, now);
    case 'reveal':
      return Drip.reveal(state, Array.isArray(msg.candidates) ? msg.candidates : []);
    case 'resolve':
      return Drip.resolveCurrent(state, msg.action, typeof msg.videoId === 'string' ? msg.videoId : undefined, now);
    case 'revealNext':
      return Drip.revealNext(state, String(msg.videoId), Array.isArray(msg.candidates) ? msg.candidates : []);
    case 'buyIfOut':
      return Drip.buyIfOut(state, String(msg.videoId), now);
    case 'addBacklog':
      return Drip.addBacklog(state, msg.video, msg.index, now);
    case 'removeBacklog':
      return Drip.removeBacklog(state, msg.id);
    case 'swapBacklog':
      return Drip.swapBacklog(state, msg.video, String(msg.dropId), msg.index, now);
    case 'tick':
      // The tab sends where the player is with each tick, so a stashed video's bar keeps up (Q28).
      if (msg.position !== undefined) Drip.markProgress(state, String(msg.videoId), msg.position, msg.duration);
      // The status counts Dry hours, which the minutes left don't show yet: the worker takes them back only after this
      // tick is charged, and a reply saying "not locked" would drop the page's lock for a moment (Jesse saw it jolt).
      return { ok: true, ...Drip.chargeTick(state, clock, now, msg.seconds, String(msg.videoId), msg.ago, msg.key), locked: Drip.watchStatus(state, String(msg.videoId), now).locked };
    case 'status':
      return { ok: true, ...Drip.watchStatus(state, msg.videoId, now) };
    case 'needThis':
      return Drip.needThis(state, msg.videoId, msg.title || '', msg.reason || '', now);
    case 'updateSettings':
      return Drip.updateSettings(state, msg.changes || {}, now);
    case 'cancelPending':
      return Drip.cancelPending(state, msg.key);
    case 'refillSeen':
      return Drip.refillSeen(state);
    case 'dryBackSeen':
      return Drip.dryBackSeen(state);
    case 'importData':
      return Drip.importData(state, msg.data, now);
    case 'resetData':
      return Drip.resetData(state, now);
    // Channel lists (RELEASE-PLAN.md item 4). Each takes a channel as { ids, name }.
    case 'allowChannel':
      return Drip.allowChannel(state, msg.channel, now);
    case 'removeAllowed':
      return Drip.removeAllowed(state, msg.channel);
    case 'blockChannel':
      return Drip.blockChannel(state, msg.channel);
    case 'unblockChannel':
      return Drip.unblockChannel(state, msg.channel, now);
    case 'cancelChannelPending':
      return Drip.cancelChannelPending(state, msg.channel);
    case 'allowedVideo':
      return { ...Drip.allowedVideo(state, msg.videoId, msg.channel), ...Drip.watchStatus(state, String(msg.videoId), now) };
    case 'seenChannel':
      return Drip.seenChannel(state, msg.channel);
    default:
      return { ok: false, error: 'unknown-message' };
  }
}

// A new install opens the welcome page once. Updates don't.
chrome.runtime.onInstalled.addListener((details) => {
  resetToolbar();
  if (details.reason !== 'install') return;
  // Saves the state now, so the first day (Q6) starts at install, not at the first visit to YouTube (Codex).
  withState(() => ({ ok: true })).catch(() => {});
  chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/welcome.html') });
});
chrome.runtime.onStartup.addListener(resetToolbar);

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
  if (String(msg.action).startsWith('clock')) return runClock(String(msg.action), sendResponse);
  withState((state, now) => ({ result: Drip.devAction(state, String(msg.action), now), state }))
    .then(({ result, state }) => sendResponse({ ...result, state }))
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
}

/**
 * A channel added in Settings by its handle has no name or picture until drip sees its channel page. This fetches that
 * page and fills them in, so the list shows the picture and home cards, which show only a name, match it at once
 * (Jesse, 2026-11-04). No cookies go with it. A failure leaves the entry as it was, to be filled in on a visit.
 * @param {any} raw
 */
async function lookUpChannel(raw) {
  const channel = Drip.cleanChannel(raw);
  const handle = channel && channel.ids.find((/** @type {string} */ id) => id.startsWith('@'));
  if (!handle || (channel.name && channel.avatar)) return;
  try {
    const res = await fetch(`https://www.youtube.com/${encodeURIComponent(handle).replace(/^%40/, '@')}`, { credentials: 'omit' });
    if (!res.ok) return;
    const found = Drip.channelFromPage(await res.text(), handle);
    if (found) await withState((state) => Drip.seenChannel(state, found));
  } catch {
    // Offline, or YouTube said no. The channel page fills it in on the next visit.
  }
}

// Developer mode, the Settings toggle for the dev panel. It's its own storage key, not part of drip's state. A store
// build has no panel (bin/build-release strips it), so there the toggle hides itself and the worker refuses it.
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

// The Settings sections the popup's counts may open (RELEASE-PLAN.md, item 2).
const SETTINGS_SECTIONS = ['watch', 'cards', 'stash', 'search', 'channels', 'day', 'youtube', 'settings', 'history'];

/**
 * Opens Settings at a section, which flashes on arrival. A Settings tab that's already open comes forward and goes
 * there itself, without a reload, so changes it hasn't saved stay. Otherwise a new tab opens.
 * @param {unknown} section
 */
async function openSettings(section) {
  const page = chrome.runtime.getURL('src/options/options.html');
  const id = typeof section === 'string' && SETTINGS_SECTIONS.includes(section) ? section : '';
  const open = (await chrome.runtime.getContexts({ contextTypes: ['TAB'] }))
    .find((c) => c.tabId >= 0 && c.documentUrl?.split('#')[0] === page);
  if (!open) {
    await chrome.tabs.create({ url: id ? `${page}#${id}` : page });
    return;
  }
  await chrome.tabs.update(open.tabId, { active: true });
  await chrome.windows.update(open.windowId, { focused: true });
  // Only extension pages hear this. The popup ignores it, and options.js scrolls and flashes.
  await chrome.runtime.sendMessage({ type: 'settingsGoto', section: id || 'settings' }).catch(() => {});
}

/** @type {Map<string, string>} */
const iconText = new Map();

/**
 * The SVG text of drip's icons, for content scripts (src/content/icons.js). A youtube.com page that loads a
 * chrome-extension:// file directly, by fetch or as a CSS mask, gets it, but Chrome lists "Unsafe attempt to load
 * URL ... Domains, protocols and ports must match." under Errors on drip's card each time (Jesse, 2026-11-05). The
 * worker reads its own files with no such check.
 * @param {unknown} names
 * @returns {Promise<Record<string, string>>}
 */
async function iconsFor(names) {
  const list = Array.isArray(names) ? names.filter((n) => typeof n === 'string' && /^[a-z0-9-]{1,40}$/.test(n)).slice(0, 100) : [];
  /** @type {Record<string, string>} */
  const out = {};
  await Promise.all(list.map(async (name) => {
    if (!iconText.has(name)) {
      try {
        const res = await fetch(chrome.runtime.getURL(`src/icons/${name}.svg`));
        if (res.ok) iconText.set(name, await res.text());
      } catch {
        // Not a file drip has. Left out of the answer.
      }
    }
    const svg = iconText.get(name);
    if (svg !== undefined) out[name] = svg;
  }));
  return out;
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
  if (msg.type === 'icons') {
    iconsFor(msg.names).then((icons) => sendResponse({ ok: true, icons }), (err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg.type === 'openSettings') {
    openSettings(msg.section).then(() => sendResponse({ ok: true }), (err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg.type === 'tick' && (!sender.tab || !sender.url?.startsWith('https://www.youtube.com/'))) {
    sendResponse({ ok: false, error: 'bad-sender' });
    return;
  }
  withState((state, now, clock) => ({ result: handle(msg, state, now, clock), state }),
    msg.type === 'tick' ? { tabId: /** @type {chrome.tabs.Tab} */ (sender.tab).id, playing: msg.playing } : undefined)
    .then(({ result, state }) => {
      sendResponse({ ...result, state });
      if ((msg.type === 'allowChannel' || msg.type === 'blockChannel') && result && result.ok) lookUpChannel(msg.channel);
    })
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true;
});

// A suspended service worker runs this again when Chrome starts it for any event.
resetToolbar();
