// @ts-check
// The page drip opens once, when it's installed. Fills in the real numbers from the current settings.

// var, not const: these page scripts share one type-check program, and only var may be declared twice.
var Drip = /** @type {any} */ (globalThis).Drip;

/** @param {string} id @param {string} text */
function fill(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/** "4:00am" for 4. */
function hourLabel(/** @type {number} */ hour) {
  return `${hour % 12 === 0 ? 12 : hour % 12}:00${hour < 12 ? 'am' : 'pm'}`;
}

/** @type {HTMLElement} */ (document.getElementById('settings')).addEventListener('click', () => chrome.runtime.openOptionsPage());

chrome.runtime.sendMessage({ type: 'get' }).then((res) => {
  if (!res || !res.state) return;
  const s = res.state.settings;
  fill('minutes', String(s.minutesPerToken));
  for (const el of document.querySelectorAll('.minutes')) el.textContent = String(s.minutesPerToken);
  fill('watch', String(s.watchTokensPerDay));
  fill('rec', String(s.recTokensPerDay));
  fill('rollover', String(s.rolloverDays));
  fill('reset', hourLabel(s.resetHour));
});
