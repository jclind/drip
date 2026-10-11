// @ts-check
// Minutes left and the two balances. Spending happens on YouTube, not here (Q22).

/** @type {any} */
// var, not const: these page scripts share one type-check program, and only var may be declared twice.
var Drip = /** @type {any} */ (globalThis).Drip;
/** @type {any} */
var DripGlass = /** @type {any} */ (globalThis).DripGlass;
/** @type {any} */
var DripPage = /** @type {any} */ (globalThis).DripPage;

const GLASS_PX = 34;
/** @type {SVGSVGElement | null} */
let glassEl = null;

/** @param {any} state */
function show(state) {
  const fraction = DripGlass.fraction(state);
  if (!glassEl) glassEl = DripGlass.make(fraction, GLASS_PX);
  else DripGlass.set(glassEl, fraction, GLASS_PX);
  const { h, icon } = DripPage;
  const { watch, rec } = state.tokens;
  /** @param {number} n @param {'drop' | 'card'} token */
  const count = (n, token) => h('div', { class: `count${n ? '' : ' is-zero'}` },
    icon(token, `drip-token-${token}`), h('span', {}, String(n)), h('span', { class: 'sr' }, n === 1 ? ` ${token}` : ` ${token}s`));
  /** @type {HTMLElement} */ (document.getElementById('stats')).replaceChildren(
    h('div', { class: 'tile' }, glassEl),
    h('div', { class: 'time-block' },
      h('div', { class: 'time' }, Drip.formatMinutes(state.watchSecondsLeft)),
      h('div', { class: 'sub' }, 'left today')),
    h('div', { class: 'counts' }, count(watch, 'drop'), count(rec, 'card')));
}

/**
 * Brings an open YouTube tab forward, this window's first, then the most recent, or opens one. drip can't read tab
 * URLs without a host permission, which the store listing says it doesn't have, so it asks each tab instead. Only
 * YouTube tabs run drip's content scripts, and they answer the ping (common.js).
 */
async function openYouTube() {
  const win = await chrome.windows.getCurrent();
  const all = await chrome.tabs.query({});
  const answers = await Promise.all(all.map((t) => (t.id === undefined
    ? false
    : chrome.tabs.sendMessage(t.id, { type: 'drip-ping' }).then((res) => !!(res && res.ok), () => false))));
  const tabs = all.filter((_, i) => answers[i])
    .sort((a, b) => Number(b.windowId === win.id) - Number(a.windowId === win.id) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  const tab = tabs[0];
  if (tab && tab.id !== undefined) {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId !== win.id) await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: 'https://www.youtube.com/' });
  }
  window.close();
}

const settingsButton = /** @type {HTMLElement} */ (document.getElementById('settings'));
settingsButton.append(DripPage.icon('settings'), 'Settings');
settingsButton.addEventListener('click', () => chrome.runtime.openOptionsPage());
const youtubeButton = /** @type {HTMLElement} */ (document.getElementById('youtube'));
youtubeButton.append('Open YouTube', DripPage.icon('arrow-up-right'));
youtubeButton.addEventListener('click', openYouTube);

chrome.runtime.sendMessage({ type: 'get' }).then((res) => {
  if (res && res.state) show(res.state);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.drip) show(Drip.hydrate(changes.drip.newValue, Date.now()));
});
