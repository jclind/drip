// @ts-check
// Settings, Channels, and History tabs (DESIGN.md, "Settings"). The form keeps its draft across tabs.

/** @type {any} */
// var, not const: these page scripts share one type-check program, and only var may be declared twice.
var Drip = /** @type {any} */ (globalThis).Drip;
/** @type {any} */
var DripPage = /** @type {any} */ (globalThis).DripPage;

/**
 * @typedef {Object} Field
 * @property {string} key
 * @property {string} label
 * @property {string} [chipLabel] Short name for named waiting chips and Undo.
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
 * @property {(d: Record<string, any>) => string} [idle] Why the setting does nothing in the form's mix, or ''.
 * @property {boolean} [inRow] A child row of Dry hours, sharing its waiting-change chip.
 */

/** @param {number} n @param {string} one @param {string} many */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "11pm" for 23. @param {number} hour */
const shortHour = (hour) => `${hour % 12 || 12}${hour < 12 ? 'am' : 'pm'}`;

/** "11pm to 6am", or "Off", for Dry hours (Q32). @param {Record<string, any>} d */
const dryWords = (d) => (d.dryHours && d.dryFrom !== d.dryTo ? `${shortHour(d.dryFrom)} to ${shortHour(d.dryTo)}` : 'Off');

/**
 * @typedef {Object} Part
 * @property {string} id The section's anchor, like options.html#cards.
 * @property {string} title
 * @property {string} icon
 * @property {string} [iconClass]
 * @property {Field} [toggle] The mode part (Q29) its header switch turns on and off. Off folds the section.
 * @property {(d: Record<string, any>) => string} [summary] One line under the title, from the form's values.
 * @property {Field[]} fields
 */

// One section per part, its switch in the header (design A, Jesse, 2026-10-16). The mode picker above them sets the
// four switches at once. A part that's off folds its rows away, which replaced dimming them (2026-10-15).
/** @type {Part[]} */
const PARTS = [
  {
    id: 'watch', title: 'Watch time', icon: 'drop', iconClass: 'drip-token-drop',
    toggle: { key: 'clock', label: 'Watch time', kind: 'toggle' },
    fields: [
      { key: 'watchTokensPerDay', label: 'Drops per day', kind: 'stepper', min: 0, max: 48,
        unit: () => [DripPage.icon('drop', 'drip-token-drop')], say: (n) => plural(n, 'drop', 'drops') },
      { key: 'minutesPerToken', label: 'Minutes per drop', kind: 'stepper', min: 1, max: 120, step: 5,
        format: (n) => `${n}m`, say: (n) => `${n}m`, spoken: (n) => plural(n, 'minute', 'minutes') },
      // Q32. The three keys wait for the reset as one range, so the row has one chip for all of them.
      { key: 'dryHours', label: 'Dry hours', kind: 'toggle', hint: 'Paid watching stops. Whole drops return.' },
      { key: 'dryFrom', label: 'Starts at', kind: 'hour', inRow: true },
      { key: 'dryTo', label: 'Ends at', kind: 'hour', inRow: true },
      { key: 'graceMode', label: 'Finish video when time runs out', kind: 'toggle' },
      { key: 'needThisPerWeek', label: '"I need this one" per rolling 7 days', chipLabel: 'Unlocks', kind: 'stepper', min: 0, max: 20,
        say: (n) => String(n), hint: 'Type a reason to unlock.' },
    ],
  },
  {
    id: 'cards', title: 'Cards', icon: 'card', iconClass: 'drip-token-card',
    // The switch turns cards off, or back on as counted or unlimited, whichever the row below shows.
    toggle: { key: 'cards', label: 'Cards', kind: 'choice', options: [['limited', 'Counted'], ['unlimited', 'Unlimited'], ['off', 'Off']] },
    fields: [
      // The stepper hides while cards are unlimited, leaving the Counted or Unlimited picker beside it (cardsKind).
      { key: 'recTokensPerDay', label: 'Cards per day', kind: 'stepper', min: 0, max: 100,
        unit: () => [DripPage.icon('card', 'drip-token-card')], say: (n) => plural(n, 'card', 'cards') },
      // Settings is where the feed source lives for now (Q5).
      { key: 'feedSource', label: 'Reveal from', kind: 'choice', options: [['home', 'Home feed'], ['subscriptions', 'Subscriptions']] },
      // Q30. Upcoming and members-only videos are never dealt, so they have no switch.
      { key: 'streams', label: 'Reveal live and past streams', kind: 'toggle',
        hint: 'Never upcoming or members-only.' },
    ],
  },
  {
    id: 'stash', title: 'Stash', icon: 'save',
    toggle: { key: 'stash', label: 'Stash', kind: 'toggle' },
    fields: [
      // Q28. Lowering it keeps every stashed video; a full stash asks which one to swap out.
      { key: 'stashMax', label: 'Stash limit', chipLabel: 'Stash holds', kind: 'stepper', min: 1, max: 50,
        unit: (n) => [n === 1 ? 'video' : 'videos'], say: (n) => plural(n, 'video', 'videos') },
    ],
  },
  {
    id: 'search', title: 'Search', icon: 'search',
    toggle: { key: 'searchCap', label: 'Search', kind: 'toggle' },
    summary: (d) => (d.searchCap ? 'Stops at 10 results' : ''),
    fields: [],
  },
  {
    // Not mode parts: the same in every mode, so the picker leaves them alone.
    id: 'day', title: 'Every day', icon: 'clock',
    fields: [
      { key: 'resetHour', label: 'New day starts at', kind: 'hour' },
      { key: 'rolloverDays', label: 'Balance cap', kind: 'stepper', min: 1, max: 7,
        idle: (d) => (!d.clock && d.cards !== 'limited' ? 'Not used without watch time or counted cards.' : ''),
        unit: (n) => [n === 1 ? 'day' : 'days'], say: (n) => plural(n, 'day', 'days') },
    ],
  },
  {
    id: 'youtube', title: 'YouTube', icon: 'square-play',
    fields: [
      // Q16.
      { key: 'hideBell', label: 'Hide the notification bell', kind: 'toggle' },
      // Q2. Off brings back the shelves only. A Short still opens as a regular video.
      { key: 'hideShorts', label: 'Hide Shorts', kind: 'toggle', hint: 'Shorts still open as regular videos.' },
    ],
  },
];
const FIELDS = PARTS.flatMap((p) => [...(p.toggle ? [p.toggle] : []), ...p.fields]);

/** @param {string} key @param {Record<string, any>} d */
const partOn = (key, d) => (key === 'cards' ? d.cards !== 'off' : !!d[key]);

/**
 * Counted or Unlimited, as last shown or picked beside Cards per day, so the switch turns cards back on the same way.
 * Null while cards have been off since the form was drawn: then the switch follows Customize, counted while the clock is
 * on in the form.
 * @type {string | null}
 */
let cardsKind = null;

/** What the cards switch turns cards on as. @param {Record<string, any>} d */
const cardsOnAs = (d) => cardsKind || (d.clock ? 'limited' : 'unlimited');

/** @type {any} */
let state = null;
/** Settings as the form shows them, saved or not. Saved, they're the planned ones, waiting changes included. */
/** @type {Record<string, any>} */
let draft = {};
/** What the save bar says for a moment after Save, or ''. */
let savedNote = '';
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
      : msg.type === 'importData' ? Drip.importData(state, msg.data, Date.now())
        : msg.type === 'resetData' ? Drip.resetData(state, Date.now())
          : msg.type === 'allowChannel' || msg.type === 'unblockChannel' ? Drip[msg.type](state, msg.channel, Date.now())
            : msg.type === 'removeAllowed' || msg.type === 'blockChannel' || msg.type === 'cancelChannelPending' ? Drip[msg.type](state, msg.channel)
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

/** "4:00am", today's reset, when every waiting change starts. */
const resetLabel = () => DripPage.hourLabel(state.settings.resetHour);

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

/** @param {string} key */
const fieldId = (key) => `field-${key}`;

/**
 * A gray picker.
 * @param {string} id @param {[string, string][]} options @param {string} value @param {(v: string) => void} onPick
 * @param {string} [labelId] For a picker with no <label> of its own.
 */
function picker(id, options, value, onPick, labelId) {
  const { h, icon } = DripPage;
  const select = /** @type {HTMLSelectElement} */ (h('select', { class: 'picker', id, 'aria-labelledby': labelId },
    ...options.map(([v, label]) => h('option', { value: v, selected: v === value }, label))));
  select.addEventListener('change', () => onPick(select.value));
  return h('div', { class: 'picker-wrap' }, select, icon('chevron-down'));
}

/** @param {Field} f @param {string} labelId */
function control(f, labelId) {
  const { h } = DripPage;
  if (f.kind === 'stepper') return stepper(f, labelId);
  if (f.kind === 'toggle') {
    const box = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', role: 'switch', class: 'toggle', id: fieldId(f.key), checked: draft[f.key] }));
    box.addEventListener('change', () => { draft[f.key] = box.checked; draftChanged(); syncModeRow(); });
    return box;
  }
  const options = f.kind === 'hour'
    ? Array.from({ length: 24 }, (_, hour) => /** @type {[string, string]} */ ([String(hour), DripPage.hourLabel(hour)]))
    : f.options || [];
  return picker(fieldId(f.key), options, String(draft[f.key]), (v) => {
    draft[f.key] = f.kind === 'hour' ? Number(v) : v;
    draftChanged();
    syncModeRow();
  });
}

/** The header switch for cards, which sets `cards` to off or back to Counted or Unlimited. */
function cardsSwitch() {
  const { h } = DripPage;
  const box = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', role: 'switch', class: 'toggle', id: fieldId('cards'), checked: draft.cards !== 'off' }));
  box.addEventListener('change', () => {
    draft.cards = box.checked ? cardsOnAs(draft) : 'off';
    const kind = /** @type {HTMLSelectElement | null} */ (document.getElementById('field-cardsKind'));
    if (kind && draft.cards !== 'off') kind.value = draft.cards;
    draftChanged();
    syncModeRow();
  });
  return box;
}

/** Counted or Unlimited, beside the Cards per day stepper. Its name is the row's, "Cards per day". */
function cardsKindPicker() {
  return picker('field-cardsKind', [['limited', 'Counted'], ['unlimited', 'Unlimited']], cardsOnAs(draft), (v) => {
    cardsKind = v;
    draft.cards = v;
    draftChanged();
    syncModeRow();
  }, 'label-recTokensPerDay');
}

/** After the form's values are replaced: the picker follows them, or Customize's rule while cards are off. */
function resetCardsKind() {
  cardsKind = draft.cards !== 'off' ? draft.cards : null;
}

/**
 * The gray chip beside a saved change that waits for the reset. The control shows the change, and the chip what holds
 * until then: "2 days until 4:00am · Undo" (Jesse, 2026-10-16). A folded section shows its rows' chips in its header,
 * named: "Stash holds 11 videos until 4:00am · Undo".
 * @param {Field} f @param {boolean} [named]
 */
function chip(f, named) {
  if (f.inRow || !state.pending || !(f.key in state.pending.changes)) return null;
  const { h } = DripPage;
  // "4:00am until 4:00am" says nothing, so a new reset hour names the end of today instead. Dry hours name the range.
  const now = f.key === 'dryHours' ? dryWords(state.settings) : valueWords(f, state.settings[f.key]);
  const text = f.key === 'resetHour' ? `Today ends at ${resetLabel()}`
    : `${named ? `${f.chipLabel || f.label} ` : ''}${now} until ${resetLabel()}`;
  return h('span', { class: 'chip', title: `Your change starts ${effectiveLabel()}` },
    h('span', {}, text),
    h('span', { 'aria-hidden': 'true' }, '·'),
    h('button', { type: 'button', class: 'chip-undo', 'aria-label': `Undo the waiting change to ${f.chipLabel || f.label}`, onclick: () => cancel(f.key) }, 'Undo'));
}

/** "3:10pm tomorrow", for the end of the first day after install. @param {number} until */
function untilLabel(until) {
  const d = new Date(until);
  const time = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}${d.getHours() < 12 ? 'am' : 'pm'}`;
  return `${time} ${d.toDateString() === new Date().toDateString() ? 'today' : 'tomorrow'}`;
}

/**
 * The first day after install, every change applies at once (Q6), so trying settings out doesn't wait a day. Runs
 * every minute too, so a page left open turns "tomorrow" into "today" at midnight and drops the line when it ends.
 */
function renderFirstDay() {
  if (!state) return;
  const until = Drip.firstDayUntil(state, Date.now());
  const el = $('firstDay');
  el.hidden = !until;
  // A small tinted note with a clock, so it doesn't read as one more line of settings text (Jesse, 2026-11-04).
  const text = until ? `First day: changes apply right away until ${untilLabel(until)}. After that, raising a limit waits for the reset.` : '';
  if (el.textContent === text) return;
  el.replaceChildren(...(until ? [DripPage.icon('clock-line', 'first-day-icon'), DripPage.h('span', {}, text)] : []));
}
setInterval(renderFirstDay, 60000);

/** The three modes (Q29), named in Settings as on the welcome page. */
const MODE_NAMES = /** @type {const} */ ([['quiet', 'Quiet'], ['curated', 'Curated'], ['full', 'Full drip']]);
/** The four mode parts. */
const MODE_KEYS = Object.keys(Drip.MODES.full);

/** "Quiet", or "Your own mix" for a mix that matches no mode. @param {string | null} mode */
const modeName = (mode) => (MODE_NAMES.find(([name]) => name === mode) || [null, 'Your own mix'])[1];

/**
 * "Quiet from 4:00am. Until then, Full drip.", while a saved mix waits for the reset and the form's parts still show it.
 * Otherwise ''.
 */
function modeWaitingLine() {
  const plan = Drip.planned(state);
  if (MODE_KEYS.every((k) => plan[k] === state.settings[k]) || MODE_KEYS.some((k) => draft[k] !== plan[k])) return '';
  const today = Drip.modeOf(state.settings);
  return `${modeName(Drip.modeOf(plan))} from ${resetLabel()}. Until then, ${today ? modeName(today) : 'your own mix'}.`;
}

/**
 * Quiet, Curated, and Full drip, as one row of three. Picking one sets the four parts in the form, still waiting for
 * Save like any other edit. A mix that matches none of them picks none.
 */
function modeRow() {
  const { h } = DripPage;
  const now = Drip.modeOf(draft);
  return h('div', { class: 'setting mode-row' },
    h('div', { class: 'setting-text' },
      h('div', { class: 'setting-line' }, h('span', { class: 'setting-label', id: 'label-mode' }, 'Mode')),
      h('div', { class: 'hint' }, modeWaitingLine() || (now ? 'Switch a part below to make your own mix.' : 'Your own mix.'))),
    // One Tab stop, with the arrow keys moving the pick, like the welcome page's list (Codex, 2026-10-15).
    h('div', {
      class: 'segmented', role: 'radiogroup', 'aria-labelledby': 'label-mode',
      onkeydown: (/** @type {KeyboardEvent} */ e) => {
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const at = MODE_NAMES.findIndex(([name]) => name === (now || 'full'));
        pickMode(MODE_NAMES[(at + step + MODE_NAMES.length) % MODE_NAMES.length][0]);
      },
    },
      ...MODE_NAMES.map(([name, label]) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(now === name), 'data-mode': name,
        tabindex: now === name || (!now && name === 'full') ? '0' : '-1',
        onclick: () => pickMode(name),
      }, label))));
}

/** @param {string} name */
function pickMode(name) {
  Object.assign(draft, Drip.MODES[name]);
  if (draft.cards !== 'off') cardsKind = draft.cards;
  renderForm();
  draftChanged();
  /** @type {HTMLElement | null} */ (document.querySelector(`.segmented [data-mode="${name}"]`))?.focus();
}

/** One setting's row: label, waiting chip, hint, and control. @param {Field} f */
function fieldRow(f) {
  const { h } = DripPage;
  const labelId = `label-${f.key}`;
  const label = f.kind === 'stepper'
    ? h('span', { class: 'setting-label', id: labelId }, f.label)
    : h('label', { class: 'setting-label', id: labelId, for: fieldId(f.key) }, f.label);
  const input = control(f, labelId);
  if (f.key === 'dryHours') input.setAttribute('aria-controls', 'dry-detail');
  return h('div', { class: 'setting', 'data-field': f.key },
    h('div', { class: 'setting-text' },
      h('div', { class: 'setting-line' }, label, chip(f)),
      f.hint && h('div', { class: 'hint' }, f.hint),
      f.idle && h('div', { class: 'hint idle-note' })),
    f.key === 'recTokensPerDay' ? h('div', { class: 'controls' }, input, cardsKindPicker())
      : f.key === 'rolloverDays' ? h('div', { class: 'cap-right' }, h('div', { class: 'cap-results', 'aria-live': 'polite' }), input) : input);
}

/** A part's section: a header with its icon, name, summary, and switch, then its rows. @param {Part} p */
function partSection(p) {
  const { h, icon } = DripPage;
  const t = p.toggle;
  return h('section', { class: 'part', id: p.id, 'data-part': t && t.key },
    h('div', { class: 'part-head' },
      h('span', { class: 'part-icon' }, icon(p.icon, p.iconClass)),
      h('div', { class: 'part-text' },
        h('div', { class: 'setting-line' },
          h('h2', { class: 'part-name' }, t ? h('label', { for: fieldId(t.key) }, p.title) : p.title), t && chip(t)),
        p.summary && p.summary(draft) && h('div', { class: 'part-sum' }, p.summary(draft)),
        // Shown only while the section is folded, so a waiting change inside it stays in view with its Undo.
        h('div', { class: 'setting-line folded-chips' }, ...p.fields.map((f) => chip(f, true)))),
      t && (t.key === 'cards' ? cardsSwitch() : control(t, ''))),
    p.fields.length > 0 && h('div', { class: 'rows' },
      h('div', { class: 'rows-inner' }, h('div', { class: 'rows-pad' }, ...p.fields.filter((f) => !f.inRow).map((f) =>
        f.key === 'dryHours' ? h('div', { class: 'dry-family' }, fieldRow(f),
          h('div', { class: 'rows dry-rows', id: 'dry-detail' },
            h('div', { class: 'rows-inner' }, h('div', { class: 'dry-times' }, ...p.fields.filter((child) => child.inRow).map(fieldRow)))))
          : fieldRow(f))))));
}

function renderForm() {
  renderFirstDay();
  $('settings').replaceChildren(modeRow(), ...PARTS.map(partSection));
  // Channels keep their own mounted section and apply changes without Save.
  if (!channelsEl) $('panel-channels').append(channelsSection());
  else renderChannels();
  syncParts();
  syncIdle();
  renderBar();
}

/**
 * Folds the sections of parts that are off, keeps each summary current, and hides the cards stepper while cards are
 * unlimited. Runs on every edit. A folded section's rows are inert, so Tab skips them.
 */
function syncParts() {
  for (const p of PARTS) {
    const section = $(p.id);
    if (!section) continue;
    const off = !!p.toggle && !partOn(p.toggle.key, draft);
    section.classList.toggle('is-off', off);
    section.querySelector('.rows')?.toggleAttribute('inert', off);
    const summary = p.summary ? p.summary(draft) : '';
    const sum = section.querySelector('.part-sum');
    if (!summary) sum?.remove();
    else if (sum) sum.textContent = summary;
    else section.querySelector('.folded-chips')?.before(DripPage.h('div', { class: 'part-sum' }, summary));
  }
  syncBalanceCap();
  const range = document.getElementById('dry-detail');
  range?.classList.toggle('is-off', !draft.dryHours);
  range?.toggleAttribute('inert', !draft.dryHours);
  const counted = document.querySelector('[data-field="recTokensPerDay"]');
  counted?.classList.toggle('is-unlimited', draft.cards === 'unlimited');
  const stepper = counted?.querySelector('.stepper');
  if (stepper) /** @type {HTMLElement} */ (stepper).hidden = draft.cards === 'unlimited';
}

/** The cap follows the draft, including allowances and parts changed without saving. */
function syncBalanceCap() {
  const caps = /** @type {HTMLElement | null} */ (document.querySelector('.cap-results'));
  if (!caps) return;
  const { h, icon } = DripPage;
  const drops = draft.watchTokensPerDay * draft.rolloverDays;
  const cards = draft.recTokensPerDay * draft.rolloverDays;
  const spoken = [draft.clock && plural(drops, 'drop', 'drops'), draft.cards === 'limited' && plural(cards, 'card', 'cards')].filter(Boolean);
  caps.hidden = !spoken.length;
  caps.replaceChildren(...[
    draft.clock && h('span', { class: 'cap-token', 'aria-hidden': 'true' }, icon('drop', 'drip-token-drop'), String(drops)),
    draft.cards === 'limited' && h('span', { class: 'cap-token', 'aria-hidden': 'true' }, icon('card', 'drip-token-card'), String(cards)),
    spoken.length ? h('span', { class: 'sr' }, `${spoken.join(', ')} at most`) : null,
  ].filter(Boolean));
}

/** Dims a setting that does nothing in the form's mix, and says why. Runs on every edit. */
function syncIdle() {
  for (const f of FIELDS) {
    if (!f.idle) continue;
    const row = document.querySelector(`.setting[data-field="${f.key}"]`);
    const why = f.idle(draft);
    row?.classList.toggle('is-idle', !!why);
    const note = row?.querySelector('.idle-note');
    if (note) note.textContent = why;
  }
}

/** A part switched by hand may make the mix match a mode, or stop matching one. */
function syncModeRow() {
  const row = document.querySelector('.segmented')?.closest('.setting');
  if (row) row.replaceWith(modeRow());
}

/** What Save would send. */
const toSave = () => Drip.settingsToSave(state, draft, FIELDS.map((f) => f.key));

function dirty() {
  return Object.keys(toSave()).length > 0;
}

/**
 * The fields the user changed and hasn't saved: draft values that differ from the planned settings the form was drawn
 * from. Only these carry over when the settings change underneath, so Save never sends a stale copy of another field.
 */
function edits() {
  const base = Drip.planned(state);
  return Object.fromEntries(FIELDS.filter((f) => draft[f.key] !== base[f.key]).map((f) => [f.key, draft[f.key]]));
}

/**
 * The save bar at the bottom of the window: "2 changes not saved" with Undo all and Save while there are edits, then
 * what the save did for a moment after it (IDEAS.md, "Settings page").
 */
function renderBar() {
  const n = Object.keys(toSave()).length;
  const text = n ? `${plural(n, 'change', 'changes')} not saved` : savedNote;
  $('savebar').hidden = !text;
  $('savebar').classList.toggle('is-saved', !n);
  $('result').textContent = text;
  $('status').textContent = text;
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let savedTimer;

function draftChanged() {
  savedNote = '';
  syncParts();
  syncIdle();
  renderBar();
}

/** @param {any} res */
function absorb(res) {
  if (res && res.state) state = Drip.newer(state, res.state);
  return res;
}

/**
 * Save and Undo all hide the button pressed, so focus goes to the mode picker in Settings or the current page tab.
 * Only after a key press: a mouse click leaves focus alone, since moving it scrolls the page to the top (air, 2026-11-05).
 */
const keyedSavebar = () => $('savebar').contains(document.activeElement) && !!document.activeElement?.matches(':focus-visible');
const focusForm = () => {
  const activeTab = PAGE_TABS.find((name) => !$(`panel-${name}`).hidden) || 'settings';
  if (activeTab === 'settings') /** @type {HTMLElement | null} */ (document.querySelector('.segmented [tabindex="0"]'))?.focus();
  else $(`tab-${activeTab}`).focus();
};

/**
 * "Saved.", then when this save's waiting changes start: "Quiet starts at 4:00am." for a mode, else "2 changes start
 * at 4:00am.". The form already shows them, so the bar says when.
 * @param {string[]} waiting The keys this save left waiting.
 */
function savedLine(waiting) {
  if (!waiting.length) return 'Saved.';
  const mode = Drip.modeOf(Drip.planned(state));
  if (mode && waiting.some((k) => MODE_KEYS.includes(k)) && mode !== Drip.modeOf(state.settings)) {
    return `Saved. ${modeName(mode)} starts at ${resetLabel()}.`;
  }
  return `Saved. ${plural(waiting.length, 'change starts', 'changes start')} at ${resetLabel()}.`;
}

async function save() {
  const changes = toSave();
  if (!Object.keys(changes).length) return;
  // The form stays open while the worker answers. An edit made meanwhile is kept, not replaced by the saved plan.
  const sent = { ...draft };
  /** @type {any} */
  let res = null;
  try {
    res = await send({ type: 'updateSettings', changes });
  } catch {
    // The worker didn't answer. Handled below like a refusal.
  }
  // A failed save keeps every edit, and the bar says so until the next edit.
  if (!res || !res.ok || !res.state) {
    $('result').textContent = "Couldn't save. Try again.";
    $('status').textContent = "Couldn't save. Try again.";
    return;
  }
  absorb(res);
  const hadFocus = keyedSavebar();
  draft = { ...Drip.planned(state), ...Drip.editsSince(sent, draft) };
  resetCardsKind();
  savedNote = savedLine(Object.keys(res.pending || {}));
  renderForm();
  renderHistory();
  renderReasons();
  if (hadFocus) focusForm();
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    savedNote = '';
    renderBar();
  }, 2500);
}

/** Undo all: the form goes back to the saved settings, waiting changes included. */
function undoAll() {
  const hadFocus = keyedSavebar();
  draft = Drip.planned(state);
  resetCardsKind();
  savedNote = '';
  renderForm();
  if (hadFocus) focusForm();
}

/** @param {string} key */
async function cancel(key) {
  // Undo puts back today's value and keeps any other edit in progress.
  const kept = edits();
  delete kept[key];
  absorb(await send({ type: 'cancelPending', key }));
  savedNote = '';
  draft = { ...Drip.planned(state), ...kept };
  resetCardsKind();
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
    Math.floor((w.lastAverage ?? -60) / 60), weeksBack, selectedDay, state.day,
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
    'data-k': `day-${d.day}`,
    'aria-label': `${dayText(d.day, { weekday: 'long' })}, ${d.counted ? Drip.formatMinutes(d.watchedSec) : 'no data'}`,
    onclick: () => { selectedDay = d.day; renderHistory(); },
  },
  h('span', { class: 'bar-area' }, d.counted && h('span', { class: 'bar', style: `height: ${pct(d.watchedSec)}` })),
  h('span', { class: 'letter', 'aria-hidden': 'true' }, LETTERS[i])));

  const dayTitle = selectedDay === state.day ? 'Today' : dayText(selectedDay, { weekday: 'long', month: 'short', day: 'numeric' });
  const line = Drip.cardsLine(entry);

  // A button pressed from the keyboard is rebuilt here, so focus goes to its new copy, or to the other arrow once the
  // pressed one turns off at the end of the history (Codex, 2026-11-05).
  const focusKey = /** @type {HTMLElement | null} */ (document.activeElement)?.closest?.('#history [data-k]')?.getAttribute('data-k') || '';
  $('history').replaceChildren(...[
    h('div', { class: 'week-nav' },
      h('button', { type: 'button', class: 'nav-btn', 'data-k': 'earlier', 'aria-label': 'Earlier week', disabled: !w.hasEarlier, onclick: () => { weeksBack++; renderHistory(); } }, icon('chevron-left')),
      h('div', { class: 'week-label', 'aria-live': 'polite' }, weekLabel(w)),
      h('button', { type: 'button', class: 'nav-btn', 'data-k': 'later', 'aria-label': 'Later week', disabled: !w.hasLater, onclick: () => { weeksBack = Math.max(0, weeksBack - 1); renderHistory(); } }, icon('chevron-right'))),
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
        // A day has no unlock limit since Q20 went weekly, so no "/ N".
        tile('unlock', 'tile-lock', entry ? entry.needThis.length : 0, 'Unlocks used')),
      line && h('p', { class: 'cards-line' }, line)),
  ].filter(Boolean));
  if (focusKey) {
    const other = { earlier: 'later', later: 'earlier' }[focusKey];
    const pick = (/** @type {string} */ k) => /** @type {HTMLButtonElement | null} */ ($('history').querySelector(`[data-k="${k}"]:not([disabled])`));
    (pick(focusKey) || (other && pick(other)) || pick(`day-${selectedDay}`))?.focus();
  }
}

/** The reasons shown at first, and how many more each "Show more" adds. A heavy user has hundreds (Jesse, 2026-11-03). */
const REASONS_FIRST = 5;
const REASONS_STEP = 20;
let reasonsShown = REASONS_FIRST;
/** What the list last drew, so a storage write that changed none of it leaves the buttons and focus alone. */
let reasonsKey = '';

/** @param {'more' | 'fewer'} which */
function focusReasonsButton(which) {
  const buttons = /** @type {HTMLElement[]} */ ([...$('reasons-more').querySelectorAll('button')]);
  (buttons.find((b) => b.dataset.k === which) || buttons[0])?.focus({ preventScroll: true });
}

/** One date tile per reset day, with that day's links beside it. @param {{day: string, use: any}[]} entries */
function reasonDays(entries) {
  const { h, icon } = DripPage;
  /** @type {Map<string, any[]>} */
  const days = new Map();
  for (const { day, use } of entries) {
    if (!days.has(day)) days.set(day, []);
    days.get(day)?.push(use);
  }
  return [...days].map(([day, uses]) => h('li', { class: 'reason-day' },
    h('div', { class: 'date', 'aria-hidden': 'true' },
      h('span', { class: 'date-month' }, dayText(day, { month: 'short' })),
      h('span', { class: 'date-day' }, dayText(day, { day: 'numeric' }))),
    h('ul', { class: 'reason-rows', 'aria-label': dayText(day, { month: 'long', day: 'numeric' }) },
      ...uses.map((use) => h('li', {},
        h('a', { class: 'reason-link', href: `https://www.youtube.com/watch?v=${encodeURIComponent(use.videoId)}`,
          target: '_blank', rel: 'noopener', title: use.title || use.videoId },
        h('span', { class: 'reason-text' }, use.reason),
        h('span', { class: 'reason-title' }, h('span', { class: 'reason-title-text' }, use.title || use.videoId), icon('arrow-up-right'))))))));
}

function renderReasons() {
  if (!state) return;
  const { h } = DripPage;
  const now = Date.now();
  const uses = Object.keys(state.log).sort().reverse().flatMap((day) =>
    state.log[day].needThis.slice().reverse().map((/** @type {any} */ use) => ({ day, use })));
  const recent = new Set(Drip.needThisUses(state, now).map((/** @type {any} */ entry) => entry.use));
  const week = uses.filter(({ use }) => recent.has(use));
  const older = uses.filter(({ use }) => !recent.has(use));
  const shown = older.slice(0, reasonsShown);
  // Ticks save the state every few seconds while a video plays, and rebuilt buttons lose focus and clicks (Codex,
  // 2026-11-03), so redraw only when the list or its count would change.
  const allowance = state.settings.needThisPerWeek;
  const key = JSON.stringify([reasonsShown, allowance, older.length, week, shown]);
  if (key === reasonsKey) return;
  reasonsKey = key;
  $('reasons-section').hidden = uses.length === 0;
  const count = Drip.needThisUsed(state, now);
  $('reasons-used').textContent = allowance ? `${count} of ${allowance}` : String(count);
  $('reasons-week').replaceChildren(...reasonDays(week));
  $('reasons-none').hidden = week.length > 0;
  $('reasons-earlier').hidden = older.length === 0;
  $('reasons-total').textContent = `${older.length} in all`;
  const left = Math.max(0, older.length - reasonsShown);
  $('reasons-more').replaceChildren(...[
    left > 0 && h('button', { type: 'button', 'data-k': 'more', onclick: () => {
      const firstNew = reasonsShown;
      reasonsShown += REASONS_STEP;
      renderReasons();
      /** @type {HTMLElement | undefined} */ ([...$('reasons').querySelectorAll('a')][firstNew])?.focus();
    } }, `Show ${Math.min(left, REASONS_STEP)} more`),
    left > 0 && h('span', { class: 'muted' }, `${left} not shown`),
    reasonsShown > REASONS_FIRST && h('button', { type: 'button', class: 'link', 'data-k': 'fewer', onclick: () => {
      reasonsShown = REASONS_FIRST;
      renderReasons();
      $('reasons-section').scrollIntoView({ block: 'start' });
      focusReasonsButton('more');
    } }, 'Show fewer'),
  ].filter(Boolean));
  $('reasons').replaceChildren(...reasonDays(shown));
}
// A use leaving the 7 days changes nothing stored, so the count rechecks every minute (Codex, 2026-11-04).
setInterval(renderReasons, 60000);

// Channels (RELEASE-PLAN.md item 4, CHANNEL-LISTS-PLAN.md call 13). Each button goes to the worker when pressed, not
// through Save, like Your data. Adding to the allow list waits for the reset (Q6). Unblocking is at once (Jesse,
// 2026-11-04), and its tile shows "Unblocked · Undo" for a few seconds, like a stash row taken out on the home page.

/** @type {HTMLElement | null} */
let channelsEl = null;
let channelsKey = '';
/** A line under each list after an add, or ''. */
const channelsNote = { allow: '', block: '' };
/** Which list the Channels tabs show (Jesse's pick, P, 2026-11-04). @type {'allow' | 'block'} */
let channelTab = 'allow';
/** The channel just unblocked, shown in its place with Undo until UNBLOCK_UNDO_MS pass. @type {{c: any, i: number} | null} */
let justUnblocked = null;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let unblockTimer;
/** As long as a stash row's Undo on the home page (swap.js UNDO_MS). */
const UNBLOCK_UNDO_MS = 5000;

/** Unblocks a channel at once, and leaves "Unblocked · Undo" where its tile was. @param {any} c @param {number} i */
async function unblockWithUndo(c, i) {
  const res = await channelSend({ type: 'unblockChannel', channel: c }, 'block');
  if (!res || !res.ok) return;
  clearTimeout(unblockTimer);
  justUnblocked = { c, i };
  unblockTimer = setTimeout(() => {
    justUnblocked = null;
    renderChannels();
  }, UNBLOCK_UNDO_MS);
  renderChannels();
  /** @type {HTMLElement | null} */ (channelsEl?.querySelector('[data-k="block-undo"]'))?.focus();
}

/** Blocks the channel again, at once, as blocking always is. */
async function undoUnblock() {
  if (!justUnblocked) return;
  const { c } = justUnblocked;
  clearTimeout(unblockTimer);
  justUnblocked = null;
  await channelSend({ type: 'blockChannel', channel: c }, 'block');
  // Blocking adds it at the end of the list, so its old place may now be another channel's. Focus finds it by identity,
  // or a second Enter would unblock that one (Codex, 2026-11-04).
  const at = state ? state.channels.block.findIndex((/** @type {any} */ e) => Drip.sameChannel(e, c)) : -1;
  /** @type {HTMLElement | null} */ (channelsEl?.querySelector(`[data-k="block-${at}"]`) || channelsEl?.querySelector('[data-k="block-input"]'))?.focus();
}

function channelsSection() {
  if (!channelsEl) {
    const { h, icon } = DripPage;
    channelsEl = h('section', { class: 'part channels', id: 'channels' },
      h('div', { class: 'part-head' },
        h('span', { class: 'part-icon' }, icon('users')),
        h('div', { class: 'part-text' },
          h('div', { class: 'setting-line' }, h('h2', { class: 'part-name' }, 'Channels')),
          h('div', { class: 'part-sum' }, 'Allowed channels are free to watch. Blocked ones never come up in reveals.'))),
      h('div', { class: 'rows' }, h('div', { class: 'rows-inner' }, h('div', { class: 'rows-pad channel-lists' }))));
  }
  renderChannels(true);
  return channelsEl;
}

/** What a channel row says when its change waits, or ''. @param {'allow' | 'block'} list @param {boolean} waits */
function channelWaitText(list, waits) {
  if (!waits) return '';
  return list === 'allow' ? `Starts at ${resetLabel()}` : `Unblocked at ${resetLabel()}`;
}

/** @param {any} res */
function channelError(res) {
  switch (res && res.error) {
    case 'allow-full': return `drip allows ${Drip.ALLOW_MAX} channels. Remove one first.`;
    case 'block-full': return 'The block list is full. Remove a channel first.';
    case 'bad-channel': return "That isn't a channel handle or link, like @veritasium.";
    case 'uc-id': return "Use the channel's @handle, shown under its name on the channel page. Watch pages only show the handle, so a UC... id wouldn't match them.";
    case 'channel-blocked': return 'That channel is blocked. Unblock it first.';
    case 'sample': return 'Sample data: nothing here is saved.';
    default: return 'Something went wrong. Refresh and try again.';
  }
}

/** @param {any} msg @param {'allow' | 'block'} list @param {string} [done] */
async function channelSend(msg, list, done = '') {
  const res = await send(msg);
  absorb(res);
  channelsNote[list] = res && res.ok ? done : channelError(res);
  renderChannels();
  return res;
}

/** @param {'allow' | 'block'} list */
async function addChannel(list) {
  const input = /** @type {HTMLInputElement | null} */ (channelsEl?.querySelector(`[data-k="${list}-input"]`));
  const id = Drip.channelId(input?.value || '');
  // A UC id never meets a watch page's @handle, so it would never match (code review, 2026-11-03).
  if (!id || !id.startsWith('@')) {
    channelsNote[list] = channelError({ error: id ? 'uc-id' : 'bad-channel' });
    renderChannels();
    return;
  }
  const res = await send({ type: list === 'allow' ? 'allowChannel' : 'blockChannel', channel: { ids: [id], name: '' } });
  absorb(res);
  if (res && res.ok) {
    // The storage event may have redrawn the list while the worker answered, so clear the field that's there now.
    const live = /** @type {HTMLInputElement | null} */ (channelsEl?.querySelector(`[data-k="${list}-input"]`));
    if (live) live.value = '';
    channelsNote[list] = '';
  } else channelsNote[list] = channelError(res);
  renderChannels();
}

/** The channel's page on YouTube, or '' for an entry known only by name. @param {any} c */
function channelUrl(c) {
  const id = c.ids.find((/** @type {string} */ i) => i.startsWith('@')) || c.ids[0] || '';
  if (!id) return '';
  return id.startsWith('@') ? `https://www.youtube.com/${id}` : `https://www.youtube.com/channel/${id}`;
}

/**
 * The two lists, as tabs of one-line tiles (Jesse's picks M and P, 2026-11-04): a tile is the channel's picture, name,
 * and handle, and links to the channel. A change that waits for the reset gets a gray clock tag with the time, and an
 * empty list is a dashed placeholder tile. Ticks save the state every few seconds, and a rebuilt button loses focus and
 * clicks (PRs 57 and 63), so it redraws only when something it shows changed, and keeps focus and typed text.
 * @param {boolean} [force]
 */
function renderChannels(force = false) {
  if (!channelsEl || !state) return;
  const { h, icon } = DripPage;
  const firstDay = Drip.firstDayUntil(state, Date.now()) > 0;
  const key = JSON.stringify([state.channels, state.channelsPending, state.settings.resetHour, firstDay, channelsNote, channelTab, justUnblocked]);
  if (!force && key === channelsKey) return;
  channelsKey = key;
  const p = state.channelsPending;
  const allowed = [...state.channels.allow.map((c) => ({ c, waits: false })), ...(p ? p.allow.map((c) => ({ c, waits: true })) : [])];
  const blocked = state.channels.block.map((c) => ({ c, waits: !!p && p.unblock.some((u) => Drip.sameChannel(u, c)) }));
  const focused = /** @type {HTMLElement | null} */ (document.activeElement)?.closest?.('.channel-lists [data-k]')?.getAttribute('data-k');
  /** @type {Record<string, string>} */
  const typed = {};
  for (const input of channelsEl.querySelectorAll('input')) typed[input.dataset.k || ''] = /** @type {HTMLInputElement} */ (input).value;

  /** @param {any} c */
  const picture = (c) => {
    const letter = h('span', { class: 'channel-ava is-letter', 'aria-hidden': 'true' }, (c.name || c.ids[0] || '?').replace(/^@/, '').slice(0, 1).toUpperCase());
    if (!c.avatar) return letter;
    // A creator who changes their picture retires the old address. The letter stands in until drip sees the new one.
    const img = h('img', { class: 'channel-ava', src: c.avatar, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' });
    img.addEventListener('error', () => img.replaceWith(letter), { once: true });
    return img;
  };

  /**
   * @param {'allow' | 'block'} list @param {{c: any, waits: boolean}} item @param {number} i
   */
  const tile = (list, { c, waits }, i) => {
    const handle = c.ids.find((/** @type {string} */ id) => id.startsWith('@')) || c.ids[0] || '';
    const name = c.name || handle;
    const extra = c.name && handle ? handle : '';
    const action = list === 'allow' ? { type: 'removeAllowed', label: waits ? 'Cancel' : 'Remove' }
      : waits ? { type: 'cancelChannelPending', label: 'Cancel' } : { type: 'unblockChannel', label: 'Unblock' };
    const url = channelUrl(c);
    const when = waits ? h('span', { class: 'channel-when', title: channelWaitText(list, waits) }, icon('clock-line'), resetLabel()) : null;
    const body = [picture(c), h('span', { class: 'channel-who' }, h('span', { class: 'channel-name' }, name), extra && h('span', { class: 'channel-id' }, extra)), when];
    return h('li', { class: `channel-tile${waits ? ' is-waiting' : ''}` },
      url ? h('a', { class: 'channel-link', href: url, target: '_blank', rel: 'noopener', 'data-k': `${list}-open-${i}`,
        title: !c.name && list === 'block' ? 'drip learns its name when you open the channel. Until then, home cards from it still come up.' : undefined }, ...body)
        : h('div', { class: 'channel-link' }, ...body),
      h('button', { type: 'button', class: 'channel-x', 'data-k': `${list}-${i}`, 'aria-label': `${action.label} ${name}`, title: action.label,
        // The next tile takes this one's place, and with it this button's data-k. Focus goes to the add field instead,
        // so a second Enter can't remove the next channel (code review, 2026-11-03).
        onclick: async () => {
          if (action.type === 'unblockChannel') return unblockWithUndo(c, i);
          await channelSend({ type: action.type, channel: c }, list);
          /** @type {HTMLElement | null} */ (channelsEl?.querySelector(`[data-k="${list}-input"]`))?.focus();
        } }, icon('x')));
  };

  /** @param {'allow' | 'block'} list @param {boolean} full */
  const adder = (list, full) => {
    const input = h('input', {
      type: 'text', class: 'channel-input', 'data-k': `${list}-input`,
      placeholder: full ? 'Full. Remove one to add another.' : '@handle or channel link', disabled: full,
      'aria-label': list === 'allow' ? 'Channel to allow' : 'Channel to block', autocomplete: 'off', spellcheck: 'false',
    });
    /** @type {HTMLInputElement} */ (input).value = full ? '' : typed[`${list}-input`] || '';
    // In the settings form, Enter would submit it.
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addChannel(list); }
    });
    return h('div', { class: 'channel-add' }, input,
      h('button', { type: 'button', 'data-k': `${list}-add`, disabled: full, onclick: () => addChannel(list) }, list === 'allow' ? 'Allow' : 'Block'));
  };

  /** "Unblocked <name> · Undo", in the tile's place. */
  const undoTile = () => {
    const c = /** @type {{c: any, i: number}} */ (justUnblocked).c;
    return h('li', { class: 'channel-tile is-undo', role: 'status' },
      h('span', { class: 'channel-undo-text' }, `Unblocked ${c.name || c.ids[0] || 'the channel'}`),
      h('span', { class: 'channel-undo-sep', 'aria-hidden': 'true' }, '·'),
      h('button', { type: 'button', class: 'channel-undo', 'data-k': 'block-undo', onclick: undoUnblock }, 'Undo'));
  };

  /** @param {'allow' | 'block'} list @param {{c: any, waits: boolean}[]} items */
  const pane = (list, items) => {
    const tiles = items.map((item, i) => tile(list, item, i));
    if (list === 'block' && justUnblocked) tiles.splice(Math.min(justUnblocked.i, tiles.length), 0, undoTile());
    return paneOf(list, tiles);
  };
  /** @param {'allow' | 'block'} list @param {HTMLElement[]} tiles */
  const paneOf = (list, tiles) => h('div', { class: 'channel-pane', role: 'tabpanel', id: `channels-${list}`, 'aria-labelledby': `channels-tab-${list}`, hidden: channelTab !== list },
    tiles.length ? h('ul', { class: 'channel-tiles' }, ...tiles)
      : h('div', { class: 'channel-empty' }, h('span', { class: 'channel-ava' }), h('span', {}, list === 'allow' ? 'No channels allowed yet.' : 'No channels blocked yet.')),
    adder(list, list === 'allow' && Drip.allowCount(state) >= Drip.ALLOW_MAX),
    channelsNote[list] && h('p', { class: 'muted channel-said', role: 'status' }, channelsNote[list]));

  /** @param {'allow' | 'block'} list @param {string} label @param {string} count */
  const tabButton = (list, label, count) => h('button', {
    type: 'button', role: 'tab', id: `channels-tab-${list}`, 'data-k': `tab-${list}`, 'aria-controls': `channels-${list}`,
    'aria-selected': String(channelTab === list), tabindex: channelTab === list ? '0' : '-1',
    onclick: () => { channelTab = list; renderChannels(); /** @type {HTMLElement | null} */ (channelsEl?.querySelector(`[data-k="tab-${list}"]`))?.focus(); },
    onkeydown: (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      channelTab = channelTab === 'allow' ? 'block' : 'allow';
      renderChannels();
      /** @type {HTMLElement | null} */ (channelsEl?.querySelector(`[data-k="tab-${channelTab}"]`))?.focus();
    },
  }, label, h('span', { class: 'channel-count' }, count));

  const pad = /** @type {HTMLElement} */ (channelsEl.querySelector('.channel-lists'));
  pad.replaceChildren(
    h('div', { class: 'channel-tabs', role: 'tablist', 'aria-label': 'Channel lists' },
      tabButton('allow', 'Allowed', `${allowed.length}/${Drip.ALLOW_MAX}`),
      tabButton('block', 'Blocked', String(blocked.length))),
    pane('allow', allowed),
    pane('block', blocked));
  if (focused) /** @type {HTMLElement | null} */ (pad.querySelector(`[data-k="${focused}"]:not([disabled])`) || pad.querySelector(`[data-k="${focused.split('-')[0]}-input"]:not([disabled])`))?.focus();
}

// Your data (RELEASE-PLAN.md, item 5): export, import, and reset. Import and reset go through the worker's rules, so a
// change that loosens a limit waits for the reset, and neither touches today's drops or cards.

/** A line under the buttons, for an export or a refusal. @param {string} text */
function dataSays(text) {
  $('dataResult').classList.remove('is-done', 'is-failed', 'is-success');
  $('dataResult').replaceChildren(text);
}

/** A result pill, with the Channels clock tag when imported allowed channels wait.
 * @param {string} text @param {boolean} [waits]
 */
function dataChip(text, waits = false) {
  const { h, icon } = DripPage;
  return h('span', { class: 'data-chip' }, text,
    waits && h('span', { class: 'channel-when', title: `Starts at ${resetLabel()}` },
      h('span', { class: 'sr' }, 'Starts at '), icon('clock-line'), resetLabel()));
}

/**
 * Success is one line of chips and any extra detail. Refusals keep their explanation panel.
 * @param {string} title @param {string[]} [lines] @param {boolean} [failed]
 * @param {HTMLElement[]} [chips]
 */
function dataDone(title, lines = [], failed = false, chips = []) {
  const { h, icon } = DripPage;
  const box = $('dataResult');
  box.classList.add('is-done');
  box.classList.toggle('is-failed', failed);
  box.classList.toggle('is-success', !failed);
  box.replaceChildren(...(failed ? [
    h('div', { class: 'done-title' }, icon('x'), title),
    h('ul', {}, ...lines.map((line) => h('li', {}, line))),
  ] : [
    h('span', { class: 'done-title' }, icon('check'), h('strong', {}, title)),
    ...chips,
    ...lines.map((line) => h('span', { class: 'muted' }, line)),
  ]));
  box.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/** "2 changes start at 4:00am.", or '' when nothing waits. @param {Record<string, any> | undefined} pending */
function waitsLine(pending) {
  const n = Object.keys(pending || {}).length;
  return n ? `${plural(n, 'change starts', 'changes start')} at ${resetLabel()}.` : '';
}

/**
 * After an import or reset: the form follows the new settings and keeps an edit in progress, as it does when another
 * tab saves. The storage event would see no change, since the reply already brought the new state.
 * @param {any} res @param {Record<string, any>} kept
 */
function afterData(res, kept) {
  absorb(res);
  draft = { ...Drip.planned(state), ...kept };
  resetCardsKind();
  renderForm();
  renderHistory();
  renderReasons();
}

function exportData() {
  const data = JSON.stringify(Drip.exportData(state, Date.now()), null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = DripPage.h('a', { href: url, download: `drip-${state.day}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  dataDone('Exported');
}

/** The largest file Import reads. An export with years of history is well under this. */
const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

async function importFile() {
  const input = /** @type {HTMLInputElement} */ ($('importFile'));
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  // A file that isn't an export says which file, what's wrong, and what drip wants instead (Jesse, 2026-11-03).
  const which = `"${file.name}"`;
  const wanted = "Use a file from Export above. Its name starts with drip- and ends with .json.";
  /** @param {string[]} lines */
  const refuse = (lines) => dataDone("Couldn't import", lines, true);
  if (file.size > IMPORT_MAX_BYTES) return refuse([`${which} is too big to be a drip export.`, wanted, 'Nothing changed.']);
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return refuse([`${which} isn't a drip export.`, wanted, 'Nothing changed.']);
  }
  const kept = edits();
  /** @type {any} */
  let res = null;
  try {
    res = await send({ type: 'importData', data });
  } catch {
    // The worker didn't answer. Handled below.
  }
  if (!res || !res.ok || !res.state) {
    if (res && res.error === 'bad-format') return refuse([`${which} is from a newer version of drip.`, 'Update drip, then import it again.', 'Nothing changed.']);
    if (res && res.error === 'not-drip') return refuse([`${which} isn't a drip export.`, wanted, 'Nothing changed.']);
    return refuse(["drip didn't answer.", 'Try again in a moment.']);
  }
  afterData(res, kept);
  dataDone('Imported', [
    ...(res.stashSkipped ? [`${plural(res.stashSkipped, "video didn't", "videos didn't")} fit in the stash.`] : []),
    ...(waitsLine(res.pending) ? [waitsLine(res.pending)] : []),
  ], false, [
    ...(res.stashAdded ? [dataChip(`+${res.stashAdded} in stash`)] : []),
    ...(res.daysAdded ? [dataChip(`+${plural(res.daysAdded, 'day of history', 'days of history')}`)] : []),
    ...(res.channelsAdded ? [dataChip(`+${plural(res.channelsAdded, 'channel', 'channels')}`, !!res.channelsWaiting)] : []),
  ]);
}

/** @param {boolean} open */
function showResetConfirm(open) {
  if (open) dataSays('');
  $('resetConfirm').hidden = !open;
  $('resetData').hidden = open;
  if (open) {
    $('resetNo').focus();
  } else {
    $('resetData').focus();
  }
}

async function resetData() {
  /** @type {any} */
  let res = null;
  try {
    res = await send({ type: 'resetData' });
  } catch {
    // Handled below.
  }
  showResetConfirm(false);
  if (!res || !res.ok || !res.state) return dataSays("Couldn't reset. Try again.");
  // A reset drops edits in progress too, since they were changes to the settings it just put back.
  afterData(res, {});
  dataDone('Reset', [
    ...(waitsLine(res.pending) ? [waitsLine(res.pending)] : []),
  ], false, [
    ...(res.stashCleared ? [dataChip('Stash emptied')] : []),
    ...(res.allowCleared ? [dataChip(`−${res.allowCleared} allowed`)] : []),
    ...(res.unblocked ? [dataChip(`−${res.unblocked} blocked`)] : []),
  ]);
}

$('dataInfo').addEventListener('click', () => {
  const open = $('dataAbout').hidden;
  $('dataAbout').hidden = !open;
  $('dataInfo').setAttribute('aria-expanded', String(open));
});

$('exportData').addEventListener('click', exportData);
$('importData').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', importFile);
$('resetData').addEventListener('click', () => showResetConfirm(true));
$('resetNo').addEventListener('click', () => showResetConfirm(false));
$('resetYes').addEventListener('click', resetData);

$('save').addEventListener('click', save);
$('undoAll').addEventListener('click', undoAll);

// Leaving with edits not saved asks first (IDEAS.md, "Settings page").
window.addEventListener('beforeunload', (e) => {
  if (state && dirty()) e.preventDefault();
});

// Another tab or the day reset changed the state. Keep everything current without wiping an edit in progress.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.drip || !state || sample || Drip.isOlder(changes.drip.newValue, state)) return;
  const before = JSON.stringify([state.settings, state.pending]);
  const kept = edits();
  const today = state.day;
  state = Drip.hydrate(changes.drip.newValue, Date.now());
  if (selectedDay === today) selectedDay = state.day;
  if (JSON.stringify([state.settings, state.pending]) !== before) {
    // Fields being edited keep their values. Every other field follows the new settings (Codex, 2026-10-11).
    draft = { ...Drip.planned(state), ...kept };
    if (draft.cards !== 'off') cardsKind = draft.cards;
    renderForm();
  }
  renderHistory();
  renderReasons();
  renderChannels();
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
  renderFirstDayOff(dev);
}

/**
 * Developer mode's switch for Q6's first day: on, raising a limit waits for the reset even in the 24 hours after
 * install, so that path can be tried on a new install (Jesse, 2026-11-03). It's in drip's state, so every rule sees it.
 * @param {any} dev
 */
function renderFirstDayOff(dev) {
  const on = !!(dev && dev.ok && dev.enabled) && !sample;
  $('firstDayOffRow').hidden = !on;
  if (on && state) /** @type {HTMLInputElement} */ ($('firstDayOff')).checked = state.firstDayOff === true;
}

$('firstDayOff').addEventListener('change', async () => {
  const box = /** @type {HTMLInputElement} */ ($('firstDayOff'));
  const res = await chrome.runtime.sendMessage({ type: 'devAction', action: box.checked ? 'first-day-off' : 'first-day-on' });
  if (!res || !res.ok) {
    box.checked = !box.checked;
    return;
  }
  absorb(res);
  renderFirstDay();
  renderChannels(true);
});

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
  if (!(dev && dev.enabled)) $('firstDayOffRow').hidden = true;
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
  renderFirstDayOff(dev);
  draft = Drip.planned(state);
  resetCardsKind();
  renderForm();
  renderHistory();
  renderReasons();
  // The sections didn't exist when Chrome looked for the #fragment. Select the panel before scrolling there.
  gotoSection(hashSection(), false);
});

const PAGE_TABS = ['settings', 'channels', 'history'];
const FORM_SECTIONS = PARTS.map((p) => p.id);

/** Hashes and worker messages use the same route, keeping the mounted form and its edits. */
function gotoSection(/** @type {string} */ id, /** @type {boolean} */ smooth, updateHash = false) {
  const tab = PAGE_TABS.includes(id) ? id : 'settings';
  for (const name of PAGE_TABS) {
    const on = name === tab;
    const button = $(`tab-${name}`);
    button.setAttribute('aria-selected', String(on));
    button.tabIndex = on ? 0 : -1;
    $(`panel-${name}`).hidden = !on;
  }
  if (updateHash) history.replaceState(null, '', `#${PAGE_TABS.includes(id) || FORM_SECTIONS.includes(id) ? id : 'settings'}`);
  if (FORM_SECTIONS.includes(id)) arrive(id, smooth);
}

function hashSection() {
  try { return decodeURIComponent(location.hash.slice(1)); }
  catch { return ''; }
}

PAGE_TABS.forEach((name, index) => {
  const button = $(`tab-${name}`);
  button.addEventListener('click', () => gotoSection(name, false, true));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? PAGE_TABS.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + PAGE_TABS.length) % PAGE_TABS.length;
    $(`tab-${PAGE_TABS[next]}`).focus();
    gotoSection(PAGE_TABS[next], false, true);
  });
});

/**
 * A count in the popup (RELEASE-PLAN.md, item 2): scroll to its section and flash the header once, so it's clear
 * which part the link meant.
 * @param {string} id @param {boolean} smooth
 */
function arrive(id, smooth) {
  const section = document.getElementById(id);
  if (!section || !section.classList.contains('part')) return;
  if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
  section.scrollIntoView({ block: 'start', behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
  const head = section.querySelector('.part-head');
  if (!head) return;
  head.classList.remove('is-arriving');
  void (/** @type {HTMLElement} */ (head)).offsetWidth;
  head.classList.add('is-arriving');
  head.addEventListener('animationend', () => head.classList.remove('is-arriving'), { once: true });
}

// A popup count used while Settings is already open: the worker brought this tab forward, and this page goes there itself,
// so a change not yet saved stays.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'settingsGoto' && typeof msg.section === 'string') gotoSection(msg.section, true, true);
});
window.addEventListener('hashchange', () => gotoSection(hashSection(), true));
