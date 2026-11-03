// @ts-check
// Minutes left and the two balances. Spending happens on YouTube, not here (Q22). Each shows only when its mode part
// is on (Q29); without the clock, the popup names the mode instead, with counted cards on a line under it.

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
  // Each count opens its part of Settings: drops at Watch time, cards at Cards (RELEASE-PLAN.md, item 2).
  /** @param {number} n @param {'drop' | 'card'} token */
  const count = (n, token) => h('button', {
    type: 'button', class: `count${n ? '' : ' is-zero'}`, title: token === 'drop' ? 'Watch time settings' : 'Cards settings',
    onclick: () => openSettings(token === 'drop' ? 'watch' : 'cards'),
  }, icon(token, `drip-token-${token}`), h('span', {}, String(n)), h('span', { class: 'sr' }, n === 1 ? ` ${token}` : ` ${token}s`));
  const clock = state.settings.clock !== false;
  const cards = state.settings.cards === 'limited';
  const stats = /** @type {HTMLElement} */ (document.getElementById('stats'));
  // Without the clock the popup names the mix. Counted cards are a line under it, not a lone number (Jesse, 2026-10-15).
  if (!clock) {
    const name = { quiet: 'Quiet', curated: 'Curated', full: 'Full drip' }[/** @type {string} */ (Drip.modeOf(state.settings))] || 'Custom';
    stats.replaceChildren(h('div', { class: 'top' }, h('div', { class: 'time-block' },
      h('div', { class: 'time' }, name),
      cards
        ? h('button', { type: 'button', class: `sub sub-count${rec ? '' : ' is-zero'}`, title: 'Cards settings', onclick: () => openSettings('cards') },
          icon('card', 'drip-token-card'), `${rec} ${rec === 1 ? 'card' : 'cards'} left today`)
        : h('div', { class: 'sub' }, "YouTube's feeds are hidden."))));
    return;
  }
  stats.replaceChildren(...[
    clock && h('div', { class: 'top' },
      h('div', { class: 'tile' }, glassEl),
      h('div', { class: 'time-block' },
        h('div', { class: 'time' }, Drip.formatMinutes(state.watchSecondsLeft)),
        h('div', { class: 'sub' }, 'left today'))),
    h('div', { class: 'counts' }, clock && count(watch, 'drop'), cards && count(rec, 'card')),
  ].filter(Boolean));
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

/**
 * Opens Settings at a section, or at the top for ''. The worker does it, so an open Settings tab is reused and keeps
 * what it hasn't saved. The popup waits for it before closing, or Chrome can drop the message.
 * @param {string} section
 */
async function openSettings(section) {
  const res = await chrome.runtime.sendMessage({ type: 'openSettings', section }).catch(() => null);
  if (!res || !res.ok) chrome.runtime.openOptionsPage();
  window.close();
}

const settingsButton = /** @type {HTMLElement} */ (document.getElementById('settings'));
settingsButton.append(DripPage.icon('settings'), 'Settings');
settingsButton.addEventListener('click', () => openSettings(''));
const youtubeButton = /** @type {HTMLElement} */ (document.getElementById('youtube'));
youtubeButton.append('Open YouTube', DripPage.icon('arrow-up-right'));
youtubeButton.addEventListener('click', openYouTube);

chrome.runtime.sendMessage({ type: 'get' }).then((res) => {
  if (res && res.state) show(res.state);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.drip) show(Drip.hydrate(changes.drip.newValue, Date.now()));
});
