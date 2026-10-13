// @ts-check
// Settings (DESIGN.md, "Settings"): the allowance with the next-day rule, then History and the unlock reasons.

/** @type {any} */
// var, not const: these page scripts share one type-check program, and only var may be declared twice.
var Drip = /** @type {any} */ (globalThis).Drip;
/** @type {any} */
var DripPage = /** @type {any} */ (globalThis).DripPage;

/**
 * @typedef {Object} Field
 * @property {string} key
 * @property {string} label
 * @property {'stepper' | 'hour' | 'toggle' | 'choice'} kind
 * @property {string} [hint]
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step] Steps by this much above it, and by 1 below it.
 * @property {(n: number) => (Node | string)[]} [unit] What follows the number inside the stepper.
 * @property {(n: number) => string} [format] The number as shown, when it isn't the plain number.
 * @property {(n: number) => string} [say] The value in words, for the pending chip and screen readers.
 * @property {(n: number) => string} [spoken] The value for screen readers, when `say` is too short to read aloud.
 * @property {[string, string][]} [options]
 */

/** @param {number} n @param {string} one @param {string} many */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** @type {{title: string, fields: Field[]}[]} */
const SECTIONS = [
  {
    title: 'Your allowance',
    fields: [
      { key: 'watchTokensPerDay', label: 'Drops per day', kind: 'stepper', min: 0, max: 48,
        unit: () => [DripPage.icon('drop', 'drip-token-drop')], say: (n) => plural(n, 'drop', 'drops') },
      { key: 'minutesPerToken', label: 'Minutes per drop', kind: 'stepper', min: 1, max: 120, step: 5,
        format: (n) => `${n}m`, say: (n) => `${n}m`, spoken: (n) => plural(n, 'minute', 'minutes') },
      { key: 'recTokensPerDay', label: 'Cards per day', kind: 'stepper', min: 0, max: 100,
        unit: () => [DripPage.icon('card', 'drip-token-card')], say: (n) => plural(n, 'card', 'cards') },
      // Not in the mockups. Settings is where the feed source lives for now (Q5).
      { key: 'feedSource', label: 'Reveal from', kind: 'choice', options: [['home', 'Home feed'], ['subscriptions', 'Subscriptions']] },
      { key: 'rolloverDays', label: 'Save unspent for', kind: 'stepper', min: 1, max: 7,
        unit: (n) => [n === 1 ? 'day' : 'days'], say: (n) => plural(n, 'day', 'days'),
        hint: 'Unspent drops and cards carry over up to this many days.' },
      // Q28. Lowering it keeps every stashed video; a full stash asks which one to swap out.
      { key: 'stashMax', label: 'Stash holds', kind: 'stepper', min: 1, max: 50,
        unit: (n) => [n === 1 ? 'video' : 'videos'], say: (n) => plural(n, 'video', 'videos'),
        hint: 'A full stash asks which video to swap out.' },
    ],
  },
  {
    title: 'Your day',
    fields: [{ key: 'resetHour', label: 'New day starts at', kind: 'hour' }],
  },
  {
    title: 'When time runs out',
    fields: [
      { key: 'graceMode', label: 'Finish the current video', kind: 'toggle' },
      { key: 'needThisPerDay', label: '"I need this one" per day', kind: 'stepper', min: 0, max: 10,
        say: (n) => String(n), hint: 'Each one needs a typed reason.' },
    ],
  },
];
const FIELDS = SECTIONS.flatMap((s) => s.fields);

/** @type {any} */
let state = null;
/** Settings as the form shows them, saved or not. */
/** @type {Record<string, any>} */
let draft = {};
let justSaved = false;
/** How many weeks back History shows, and the day its block under the chart is about. */
let weeksBack = 0;
let selectedDay = '';
let historyShown = '';

/**
 * The sample profile shown in place of the real state (src/devpanel/profiles.js), or null. While one is up, Save and
 * Undo run the real rules on it here, and nothing reaches the worker.
 * @type {{id: string, name: string, build: (now: number) => any} | null}
 */
let sample = null;

/** Messages that change settings go through here, so a sample profile never touches the real state. @param {any} msg */
async function send(msg) {
  if (!sample) return chrome.runtime.sendMessage(msg);
  const result = msg.type === 'updateSettings' ? Drip.updateSettings(state, msg.changes, Date.now())
    : msg.type === 'cancelPending' ? Drip.cancelPending(state, msg.key)
      : { ok: false, error: 'sample' };
  return { ...result, state };
}

/** @param {string} id */
function $(id) {
  return /** @type {HTMLElement} */ (document.getElementById(id));
}

/** @param {Field} f @param {any} value */
function valueWords(f, value) {
  if (f.kind === 'toggle') return value ? 'On' : 'Off';
  if (f.kind === 'hour') return DripPage.hourLabel(value);
  if (f.kind === 'choice') return (f.options?.find(([v]) => v === value) || [value, value])[1];
  return f.say ? f.say(value) : String(value);
}

/** "Tue, Oct 12, 4:00 AM", for the chip's tooltip. */
function effectiveLabel() {
  if (!state.pending) return '';
  const [y, m, d] = state.pending.effectiveDay.split('-').map(Number);
  return new Date(y, m - 1, d, state.settings.resetHour).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The next value up or down. Minutes step by 5 past 5, so 15 to 30 is three clicks, not fifteen. */
function stepValue(/** @type {Field} */ f, /** @type {number} */ v, /** @type {1 | -1} */ dir) {
  const min = f.min ?? 0;
  const max = f.max ?? 100;
  const big = f.step && (dir > 0 ? v >= f.step : v > f.step);
  const step = big && f.step ? f.step : 1;
  const next = dir > 0 ? Math.floor(v / step) * step + step : Math.ceil(v / step) * step - step;
  return Math.min(max, Math.max(min, next));
}

/** @param {Field} f @param {string} labelId */
function stepper(f, labelId) {
  const { h, icon } = DripPage;
  const min = f.min ?? 0;
  const max = f.max ?? 100;
  const value = h('span', {
    class: 'stepper-value', role: 'spinbutton', tabindex: '0', 'aria-labelledby': labelId,
    'aria-valuemin': min, 'aria-valuemax': max,
  });
  const minus = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'stepper-btn', tabindex: '-1', 'aria-label': 'Less' }, icon('minus')));
  const plus = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'stepper-btn', tabindex: '-1', 'aria-label': 'More' }, icon('plus')));
  const update = () => {
    const v = draft[f.key];
    value.replaceChildren(h('span', {}, f.format ? f.format(v) : String(v)), ...(f.unit ? f.unit(v) : []).map((u) => (typeof u === 'string' ? h('span', {}, u) : u)));
    value.setAttribute('aria-valuenow', String(v));
    value.setAttribute('aria-valuetext', f.spoken ? f.spoken(v) : valueWords(f, v));
    minus.disabled = v <= min;
    plus.disabled = v >= max;
  };
  /** @param {number} n */
  const set = (n) => {
    if (n === draft[f.key]) return;
    draft[f.key] = n;
    update();
    draftChanged();
  };
  minus.addEventListener('click', () => set(stepValue(f, draft[f.key], -1)));
  plus.addEventListener('click', () => set(stepValue(f, draft[f.key], 1)));
  value.addEventListener('keydown', (e) => {
    /** @type {Record<string, () => number>} */
    const keys = {
      ArrowUp: () => stepValue(f, draft[f.key], 1), ArrowRight: () => stepValue(f, draft[f.key], 1),
      ArrowDown: () => stepValue(f, draft[f.key], -1), ArrowLeft: () => stepValue(f, draft[f.key], -1),
      Home: () => min, End: () => max,
    };
    if (!keys[e.key]) return;
    e.preventDefault();
    set(keys[e.key]());
  });
  update();
  return h('div', { class: 'stepper' }, minus, value, plus);
}

/** @param {Field} f @param {string} labelId */
function control(f, labelId) {
  const { h, icon } = DripPage;
  if (f.kind === 'stepper') return stepper(f, labelId);
  if (f.kind === 'toggle') {
    const box = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', role: 'switch', class: 'toggle', id: f.key, checked: draft[f.key] }));
    box.addEventListener('change', () => { draft[f.key] = box.checked; draftChanged(); });
    return box;
  }
  const options = f.kind === 'hour'
    ? Array.from({ length: 24 }, (_, hour) => [String(hour), DripPage.hourLabel(hour)])
    : f.options || [];
  const select = /** @type {HTMLSelectElement} */ (h('select', { class: 'picker', id: f.key },
    ...options.map(([v, label]) => h('option', { value: v, selected: v === String(draft[f.key]) }, label))));
  select.addEventListener('change', () => {
    draft[f.key] = f.kind === 'hour' ? Number(select.value) : select.value;
    draftChanged();
  });
  return h('div', { class: 'picker-wrap' }, select, icon('chevron-down'));
}

/** The gray chip for a loosening change that waits for the reset: "→ 3 days from 4:00am · Undo". */
function chip(/** @type {Field} */ f) {
  if (!state.pending || !(f.key in state.pending.changes)) return null;
  const { h } = DripPage;
  return h('span', { class: 'chip', title: `Starts ${effectiveLabel()}` },
    h('span', {}, `→ ${valueWords(f, state.pending.changes[f.key])} from ${DripPage.hourLabel(state.settings.resetHour)}`),
    h('span', { 'aria-hidden': 'true' }, '·'),
    h('button', { type: 'button', class: 'chip-undo', 'aria-label': `Undo the waiting change to ${f.label}`, onclick: () => cancel(f.key) }, 'Undo'));
}

/** "3:10pm tomorrow", for the end of the first day after install. @param {number} until */
function untilLabel(until) {
  const d = new Date(until);
  const time = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}${d.getHours() < 12 ? 'am' : 'pm'}`;
  return `${time} ${d.toDateString() === new Date().toDateString() ? 'today' : 'tomorrow'}`;
}

function renderForm() {
  const { h } = DripPage;
  // The first day after install, every change applies at once (Q6), so trying settings out doesn't wait a day.
  const until = Drip.firstDayUntil(state, Date.now());
  $('firstDay').hidden = !until;
  $('firstDay').textContent = until ? `Changes apply right away until ${untilLabel(until)}, while you try drip out. After that, raising a limit waits for the reset.` : '';
  $('settings').replaceChildren(...SECTIONS.map((section) => h('section', { class: 'group' },
    h('h2', { class: 'caps' }, section.title),
    ...section.fields.map((f) => {
      const labelId = `label-${f.key}`;
      const label = f.kind === 'stepper'
        ? h('span', { class: 'setting-label', id: labelId }, f.label)
        : h('label', { class: 'setting-label', id: labelId, for: f.key }, f.label);
      return h('div', { class: 'setting' },
        h('div', { class: 'setting-text' },
          h('div', { class: 'setting-line' }, label, chip(f)),
          f.hint && h('div', { class: 'hint' }, f.hint)),
        control(f, labelId));
    }))));
  renderStatus();
}

function dirty() {
  return FIELDS.some((f) => draft[f.key] !== state.settings[f.key]);
}

/**
 * The fields the user changed and hasn't saved: draft values that differ from `base`, the settings the form was drawn
 * from. Only these carry over when the settings change underneath, so Save never sends a stale copy of another field.
 * @param {Record<string, any>} base
 */
function edits(base) {
  return Object.fromEntries(FIELDS.filter((f) => draft[f.key] !== base[f.key]).map((f) => [f.key, draft[f.key]]));
}

function renderStatus() {
  const waiting = state.pending ? Object.keys(state.pending.changes).length : 0;
  const waitingText = waiting ? `${waiting} waiting for the reset.` : '';
  $('result').textContent = dirty() ? 'Not saved yet.' : [justSaved && 'Saved.', waitingText].filter(Boolean).join(' ');
}

function draftChanged() {
  justSaved = false;
  renderStatus();
}

/** @param {any} res */
function absorb(res) {
  if (res && res.state) state = res.state;
  return res;
}

async function save() {
  /** @type {Record<string, any>} */
  const changes = {};
  for (const f of FIELDS) if (draft[f.key] !== state.settings[f.key]) changes[f.key] = draft[f.key];
  if (!Object.keys(changes).length) {
    $('result').textContent = 'Nothing changed.';
    return;
  }
  absorb(await send({ type: 'updateSettings', changes }));
  draft = { ...state.settings };
  justSaved = true;
  renderForm();
  renderHistory();
}

/** @param {string} key */
async function cancel(key) {
  // Undo keeps any other edit in progress.
  const kept = edits(state.settings);
  delete kept[key];
  absorb(await send({ type: 'cancelPending', key }));
  justSaved = false;
  draft = { ...state.settings, ...kept };
  renderForm();
}

// History (DESIGN.md, "This week and Today").

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
// The chart's top line, the first of these at or past the tallest bar.
const SCALE = [30, 60, 120, 180, 240, 360, 480, 720, 960, 1440].map((m) => m * 60);

/** @param {string} day @param {Intl.DateTimeFormatOptions} opts */
function dayText(day, opts) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}

/** "This week", "Last week", then "Sep 21 – 27" or "Sep 28 – Oct 4". */
function weekLabel(/** @type {any} */ w) {
  if (weeksBack === 0) return 'This week';
  if (weeksBack === 1) return 'Last week';
  const sameMonth = w.start.slice(0, 7) === w.end.slice(0, 7);
  return `${dayText(w.start, { month: 'short', day: 'numeric' })} – ${dayText(w.end, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;
}

/** @param {any} w */
function changeLine(w) {
  const { h, icon } = DripPage;
  if (w.average === null || !(w.lastAverage > 0)) return null;
  const than = weeksBack === 0 ? 'last week' : 'the week before';
  const pct = Math.round((Math.abs(w.average - w.lastAverage) / w.lastAverage) * 100);
  if (pct === 0) return h('div', { class: 'change' }, `Same as ${than}`);
  const down = w.average < w.lastAverage;
  return h('div', { class: 'change' }, icon(down ? 'circle-arrow-down' : 'circle-arrow-up'),
    h('span', { class: 'sr' }, down ? 'Down ' : 'Up '), `${pct}% from ${than}`);
}

/** @param {string} name @param {string} cls @param {number} n @param {string} label @param {number} [limit] */
function tile(name, cls, n, label, limit) {
  const { h, icon } = DripPage;
  return h('div', { class: `tile${n ? '' : ' is-zero'}` },
    h('div', { class: 'tile-top' }, icon(name, cls), h('span', { class: 'tile-num' }, String(n)),
      limit !== undefined && h('span', { class: 'tile-of' }, `/ ${limit}`)),
    h('div', { class: 'tile-label' }, label));
}

function renderHistory() {
  const { h, icon } = DripPage;
  const w = Drip.weekView(state, weeksBack);
  if (!w.days.some((/** @type {any} */ d) => d.day === selectedDay && d.counted)) {
    selectedDay = weeksBack === 0 ? state.day : w.end;
  }
  const entry = state.log[selectedDay];
  // Rebuild only when something on screen changed. Ticks save the state every few seconds while a video plays, and a
  // bar rebuilt mid-click loses the click.
  const shown = JSON.stringify([w.days.map((/** @type {any} */ d) => [d.day, Math.floor(d.watchedSec / 60), d.counted]),
    Math.floor((w.lastAverage ?? -60) / 60), weeksBack, selectedDay, state.day, state.settings.needThisPerDay,
    entry && [Math.floor(entry.watchedSec / 60), entry.watchSpent, entry.recSpent, entry.saved, entry.passed, entry.watched, entry.needThis.length]]);
  if (shown === historyShown) return;
  historyShown = shown;

  const max = SCALE.find((s) => s >= Math.max(...w.days.map((/** @type {any} */ d) => d.watchedSec), w.lastAverage ?? 0)) ?? SCALE[SCALE.length - 1];
  /** @param {number} sec */
  const pct = (sec) => `${Math.min(100, (sec / max) * 100)}%`;
  const than = weeksBack === 0 ? "Last week's average" : "The week before's average";

  const columns = w.days.map((/** @type {any} */ d, /** @type {number} */ i) => h('button', {
    type: 'button',
    class: `col${d.day === selectedDay ? ' is-selected' : ''}${d.today ? ' is-today' : ''}`,
    disabled: !d.counted,
    'aria-pressed': String(d.day === selectedDay),
    'aria-label': `${dayText(d.day, { weekday: 'long' })}, ${d.counted ? Drip.formatMinutes(d.watchedSec) : 'no data'}`,
    onclick: () => { selectedDay = d.day; renderHistory(); },
  },
  h('span', { class: 'bar-area' }, d.counted && h('span', { class: 'bar', style: `height: ${pct(d.watchedSec)}` })),
  h('span', { class: 'letter', 'aria-hidden': 'true' }, LETTERS[i])));

  const dayTitle = selectedDay === state.day ? 'Today' : dayText(selectedDay, { weekday: 'long', month: 'short', day: 'numeric' });
  const line = Drip.cardsLine(entry);

  $('history').replaceChildren(...[
    h('div', { class: 'week-nav' },
      h('button', { type: 'button', class: 'nav-btn', 'aria-label': 'Earlier week', disabled: !w.hasEarlier, onclick: () => { weeksBack++; renderHistory(); } }, icon('chevron-left')),
      h('div', { class: 'week-label', 'aria-live': 'polite' }, weekLabel(w)),
      h('button', { type: 'button', class: 'nav-btn', 'aria-label': 'Later week', disabled: !w.hasLater, onclick: () => { weeksBack = Math.max(0, weeksBack - 1); renderHistory(); } }, icon('chevron-right'))),
    h('div', { class: 'avg-row' },
      h('div', {}, h('div', { class: 'label' }, 'Daily average'), h('div', { class: 'big' }, Drip.formatMinutes(w.average ?? 0))),
      changeLine(w)),
    h('div', { class: 'chart' },
      h('div', { class: 'plot' }, ...columns,
        w.lastAverage !== null && h('div', { class: 'avg-line', style: `--at: ${Math.min(1, w.lastAverage / max)}`, 'aria-hidden': 'true' })),
      h('div', { class: 'gutter', 'aria-hidden': 'true' }, h('span', { class: 'gutter-top' }, Drip.formatMinutes(max)), h('span', { class: 'gutter-zero' }, '0'))),
    w.lastAverage !== null && h('div', { class: 'key' }, h('span', { class: 'key-dash', 'aria-hidden': 'true' }), `${than} · ${Drip.formatMinutes(w.lastAverage)}`),
    h('div', { class: 'day' },
      h('div', { class: 'label' }, dayTitle),
      h('div', { class: 'big' }, Drip.formatMinutes(entry ? entry.watchedSec : 0)),
      h('div', { class: 'tiles' },
        tile('drop', 'drip-token-drop', entry ? entry.watchSpent : 0, 'Drops used'),
        tile('card', 'drip-token-card', entry ? entry.recSpent : 0, 'Cards used'),
        tile('unlock', 'tile-lock', entry ? entry.needThis.length : 0, 'Unlocks used', state.settings.needThisPerDay)),
      line && h('p', { class: 'cards-line' }, line)),
  ].filter(Boolean));
}

function renderReasons() {
  const { h } = DripPage;
  const uses = Object.keys(state.log).sort().reverse().flatMap((day) =>
    state.log[day].needThis.slice().reverse().map((/** @type {any} */ use) => ({ day, ...use })));
  $('reasons-section').hidden = uses.length === 0;
  $('reasons').replaceChildren(...uses.map((use) => h('li', { class: 'reason' },
    h('div', { class: 'date', 'aria-label': dayText(use.day, { month: 'long', day: 'numeric' }) },
      h('span', { class: 'date-month', 'aria-hidden': 'true' }, dayText(use.day, { month: 'short' })),
      h('span', { class: 'date-day', 'aria-hidden': 'true' }, dayText(use.day, { day: 'numeric' }))),
    h('div', { class: 'reason-text' },
      h('a', { href: `https://www.youtube.com/watch?v=${encodeURIComponent(use.videoId)}`, target: '_blank', rel: 'noopener' }, use.title || use.videoId),
      h('div', { class: 'muted' }, `"${use.reason}"`)))));
}

$('save').addEventListener('click', save);

// Another tab or the day reset changed the state. Keep everything current without wiping an edit in progress.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.drip || !state || sample) return;
  const before = JSON.stringify([state.settings, state.pending]);
  const kept = edits(state.settings);
  const today = state.day;
  state = Drip.hydrate(changes.drip.newValue, Date.now());
  if (selectedDay === today) selectedDay = state.day;
  if (JSON.stringify([state.settings, state.pending]) !== before) {
    // Fields being edited keep their values. Every other field follows the new settings (Codex, 2026-10-11).
    draft = { ...state.settings, ...kept };
    renderForm();
  }
  renderHistory();
  renderReasons();
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

/**
 * The sample profiles, loaded only when asked for, since the store build doesn't have the file.
 * @returns {Promise<any>}
 */
function loadProfiles() {
  const loaded = /** @type {any} */ (globalThis).DripProfiles;
  if (loaded) return Promise.resolve(loaded);
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = '../devpanel/profiles.js';
    script.onload = () => resolve(/** @type {any} */ (globalThis).DripProfiles || null);
    script.onerror = () => resolve(null);
    document.head.append(script);
  });
}

/** Goes to a sample profile, or back to the real data with ''. The choice lives in the URL, so a reload keeps it. */
function showSample(/** @type {string} */ id) {
  location.search = id ? `?sample=${encodeURIComponent(id)}` : '';
}

/** The sample data picker under Developer mode, while developer mode is on. @param {any} dev */
async function renderSamples(dev) {
  const on = !!(dev && dev.ok && dev.enabled);
  const profiles = on ? await loadProfiles() : null;
  $('sampleRow').hidden = !profiles;
  if (!profiles) return;
  const { h } = DripPage;
  const select = /** @type {HTMLSelectElement} */ ($('sample'));
  if (!select.nextElementSibling) select.after(DripPage.icon('chevron-down'));
  select.replaceChildren(h('option', { value: '' }, 'Your data'),
    ...profiles.list.map((/** @type {any} */ p) => h('option', { value: p.id, selected: !!sample && sample.id === p.id }, p.name)));
}

$('sample').addEventListener('change', () => showSample(/** @type {HTMLSelectElement} */ ($('sample')).value));
$('sampleBack').addEventListener('click', () => showSample(''));

$('devMode').addEventListener('change', async () => {
  const box = /** @type {HTMLInputElement} */ ($('devMode'));
  const dev = await chrome.runtime.sendMessage({ type: 'setDevMode', on: box.checked });
  renderDev(dev);
  if (sample && !(dev && dev.enabled)) showSample('');
  else renderSamples(dev);
});

Promise.all([chrome.runtime.sendMessage({ type: 'devStatus' }), chrome.runtime.sendMessage({ type: 'get' })]).then(async ([dev, res]) => {
  renderDev(dev);
  const want = new URLSearchParams(location.search).get('sample');
  // A sample only shows while developer mode is on, so a stale link can't hide the real settings.
  const profiles = want && dev && dev.ok && dev.enabled ? await loadProfiles() : null;
  sample = profiles ? profiles.find(want) : null;
  if (sample) {
    state = Drip.hydrate(sample.build(Date.now()), Date.now());
    $('sampleName').textContent = sample.name;
    $('sampleNote').hidden = false;
  } else {
    absorb(res);
  }
  renderSamples(dev);
  if (!state) return;
  draft = { ...state.settings };
  renderForm();
  renderHistory();
  renderReasons();
});
