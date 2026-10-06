// @ts-check
// Balances and minutes left. Spending happens on YouTube, not here.

/** @type {any} */
// var, not const: these page scripts share one type-check program, and only var may be declared twice.
var Drip = /** @type {any} */ (globalThis).Drip;

/** @param {any} state */
function show(state) {
  /** @type {HTMLElement} */ (document.getElementById('time')).textContent = `${Drip.formatMinutes(state.watchSecondsLeft)} left`;
  /** @type {HTMLElement} */ (document.getElementById('tokens')).textContent =
    `watch tokens ${state.tokens.watch} · rec tokens ${state.tokens.rec}`;
}

/** @type {HTMLElement} */ (document.getElementById('settings')).addEventListener('click', () => chrome.runtime.openOptionsPage());

chrome.runtime.sendMessage({ type: 'get' }).then((res) => {
  if (res && res.state) show(res.state);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.drip) show(Drip.hydrate(changes.drip.newValue, Date.now()));
});
