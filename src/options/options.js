// @ts-check
// Settings with the next-day rule, plus the last 7 days of the log.

/** @type {any} */
// var, not const: these page scripts share one type-check program, and only var may be declared twice.
var Drip = /** @type {any} */ (globalThis).Drip;

/** @type {{ key: string, label: string, hint: string, type: 'number' | 'checkbox' | 'select', min?: number, max?: number, options?: [string, string][] }[]} */
const FIELDS = [
  { key: 'watchTokensPerDay', label: 'Watch tokens per day', hint: 'Each one buys a block of minutes.', type: 'number', min: 0, max: 48 },
  { key: 'minutesPerToken', label: 'Minutes per watch token', hint: 'Minutes only drain while a video plays.', type: 'number', min: 1, max: 120 },
  { key: 'recTokensPerDay', label: 'Rec tokens per day', hint: 'Each one reveals one recommended video.', type: 'number', min: 0, max: 100 },
  { key: 'rolloverDays', label: 'Rollover cap, in days', hint: 'Unspent tokens carry over up to this many days of allowance.', type: 'number', min: 1, max: 7 },
  { key: 'resetHour', label: 'Day resets at hour', hint: '0 to 23, local time. 4 means 4:00am.', type: 'number', min: 0, max: 23 },
  { key: 'feedSource', label: 'Reveal from', hint: 'Where Reveal picks the next video. Applies now.', type: 'select', options: [['home', 'Home feed'], ['subscriptions', 'Subscriptions']] },
  { key: 'needThisPerDay', label: '"I need this one" unlocks per day', hint: 'Each needs a typed reason and is logged.', type: 'number', min: 0, max: 10 },
  { key: 'graceMode', label: 'Finish the current video when time runs out', hint: 'Off means the video pauses at zero.', type: 'checkbox' },
];

/** @type {any} */
let state = null;
/** @type {Record<string, string | boolean>} */
const renderedValues = {};

/** @param {string} id */
function $(id) {
  return /** @type {HTMLElement} */ (document.getElementById(id));
}

/**
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...(Node | string | null | false | undefined)} children
 */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** "Tue Oct 6, 4:00am" for when a pending change applies. */
function effectiveLabel() {
  if (!state.pending) return '';
  const [y, m, d] = state.pending.effectiveDay.split('-').map(Number);
  const at = new Date(y, m - 1, d, state.settings.resetHour);
  return at.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** @param {string} key @param {any} value */
function valueLabel(key, value) {
  const field = FIELDS.find((f) => f.key === key);
  if (field && field.type === 'checkbox') return value ? 'on' : 'off';
  if (field && field.options) return (field.options.find(([v]) => v === value) || [value, value])[1];
  return String(value);
}

function renderForm() {
  const form = $('settings');
  form.replaceChildren(
    ...FIELDS.flatMap((f) => {
      const value = state.settings[f.key];
      /** @type {HTMLElement} */
      let input;
      if (f.type === 'checkbox') input = h('input', { type: 'checkbox', id: f.key, checked: value });
      else if (f.type === 'select')
        input = h('select', { id: f.key }, ...(f.options || []).map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
      else input = h('input', { type: 'number', id: f.key, min: f.min, max: f.max, step: 1, value });
      const control = /** @type {HTMLInputElement} */ (input);
      renderedValues[f.key] = f.type === 'checkbox' ? control.checked : control.value;
      return [h('label', { for: f.key }, f.label, h('span', { class: 'muted' }, f.hint)), input];
    }),
  );
}

function renderPending() {
  const box = $('pending');
  if (!state.pending) {
    box.replaceChildren();
    return;
  }
  box.replaceChildren(
    h('div', { class: 'note' }, `Waiting until ${effectiveLabel()}:`),
    h(
      'ul',
      {},
      ...Object.entries(state.pending.changes).map(([key, value]) =>
        h(
          'li',
          {},
          `${(FIELDS.find((f) => f.key === key) || { label: key }).label}: ${valueLabel(key, state.settings[key])} → ${valueLabel(key, value)} `,
          h('button', { class: 'link', type: 'button', onclick: () => cancel(key) }, 'cancel'),
        ),
      ),
    ),
  );
}

function renderLog() {
  /** @type {string[]} */
  const days = Drip.logDays(state.day);
  const rows = days.map((day) => {
    const d = state.log[day];
    const cells = d
      ? [Math.round(d.watchedSec / 60), d.watchSpent, d.recSpent, d.saved, d.passed, d.needThis.length]
      : ['', '', '', '', '', ''];
    return h('tr', {}, h('td', {}, day === state.day ? 'Today' : day), ...cells.map((c) => h('td', {}, String(c))));
  });
  const reasons = days.flatMap((day) => (state.log[day] ? state.log[day].needThis.map((/** @type {any} */ n) => ({ day, ...n })) : []));
  $('log').replaceChildren(
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, ...['Day', 'Minutes', 'Watch', 'Reveals', 'Saved', 'Passed', 'Unlocks'].map((t) => h('th', {}, t)))),
        h('tbody', {}, ...rows),
      ),
    ),
    ...(reasons.length > 0
      ? [h('ul', { class: 'reasons' }, ...reasons.map((r) => h('li', {}, `${r.day}: ${r.title || r.videoId}, "${r.reason}"`)))]
      : []),
  );
}

function render() {
  renderForm();
  renderPending();
  renderLog();
}

/** @param {any} res */
function absorb(res) {
  if (res && res.state) state = res.state;
  return res;
}

async function save() {
  /** @type {Record<string, any>} */
  const changes = {};
  for (const f of FIELDS) {
    const el = /** @type {HTMLInputElement} */ ($(f.key));
    const value = f.type === 'checkbox' ? el.checked : el.value;
    if (value === renderedValues[f.key]) continue;
    if (f.type === 'checkbox') changes[f.key] = el.checked;
    else if (f.type === 'select') changes[f.key] = el.value;
    else if (el.value !== '') changes[f.key] = Number(el.value);
  }
  if (Object.keys(changes).length === 0) {
    $('result').textContent = 'Nothing changed.';
    return;
  }
  const res = absorb(await chrome.runtime.sendMessage({ type: 'updateSettings', changes }));
  const applied = res && res.applied ? Object.keys(res.applied).length : 0;
  const pending = res && res.pending ? Object.keys(res.pending).length : 0;
  $('result').textContent =
    applied + pending === 0 ? 'Nothing changed.' : [applied && `${applied} applied now`, pending && `${pending} waiting for the reset`].filter(Boolean).join(', ') + '.';
  render();
}

/** @param {string} key */
async function cancel(key) {
  absorb(await chrome.runtime.sendMessage({ type: 'cancelPending', key }));
  render();
}

/** Whether the form still shows what was last rendered, so a live update won't wipe an edit in progress. */
function formUntouched() {
  return FIELDS.every((f) => {
    const el = /** @type {HTMLInputElement} */ ($(f.key));
    return (f.type === 'checkbox' ? el.checked : el.value) === renderedValues[f.key];
  });
}

$('save').addEventListener('click', save);

// Another tab or the day reset changed the state. Keep the log and pending list current.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.drip || !state) return;
  const before = JSON.stringify([state.settings, state.pending]);
  state = Drip.hydrate(changes.drip.newValue, Date.now());
  // Rebuild the form and the pending list, which have buttons, only when they changed. A button replaced mid-click
  // loses the click.
  if (JSON.stringify([state.settings, state.pending]) !== before) {
    if (formUntouched()) renderForm();
    renderPending();
  }
  renderLog();
});

// Developer mode: the dev panel's toggle. The worker says whether this build has the panel at all.
/** @param {any} dev */
function renderDev(dev) {
  if (!dev || !dev.ok || !dev.toggle) return;
  const box = /** @type {HTMLInputElement} */ ($('devMode'));
  box.checked = dev.enabled;
  box.disabled = dev.file;
  if (dev.file) $('devHint').textContent = 'On because this checkout has dev/ENABLED. Delete that file to turn it off.';
  $('dev').hidden = false;
}

$('devMode').addEventListener('change', async () => {
  const box = /** @type {HTMLInputElement} */ ($('devMode'));
  renderDev(await chrome.runtime.sendMessage({ type: 'setDevMode', on: box.checked }));
});
chrome.runtime.sendMessage({ type: 'devStatus' }).then(renderDev);

chrome.runtime.sendMessage({ type: 'get' }).then((res) => {
  absorb(res);
  if (state) render();
});
