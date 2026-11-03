// @ts-check
// Settings (DESIGN.md, "Settings"): the mode, then one section per part (Q29) with the next-day rule, then History and
// the unlock reasons.

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
 * @property {(d: Record<string, any>) => string} [idle] Why the setting does nothing in the form's mix, or ''.
 */

/** @param {number} n @param {string} one @param {string} many */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * @typedef {Object} Part
 * @property {string} id The section's anchor, like options.html#cards.
 * @property {string} title
 * @property {string} icon
 * @property {string} [iconClass]
 * @property {Field} [toggle] The mode part (Q29) its header switch turns on and off. Off folds the section.
 * @property {(d: Record<string, any>) => string} summary One line under the title, from the form's values.
 * @property {Field[]} fields
 */

// One section per part, its switch in the header (design A, Jesse, 2026-10-16). The mode picker above them sets the
// four switches at once. A part that's off folds its rows away, which replaced dimming them (2026-10-15).
/** @type {Part[]} */
const PARTS = [
  {
    id: 'watch', title: 'Watch time', icon: 'drop', iconClass: 'drip-token-drop',
    toggle: { key: 'clock', label: 'Watch time', kind: 'toggle' },
    summary: (d) => (d.clock ? `${plural(d.watchTokensPerDay, 'drop', 'drops')} a day, ${d.minutesPerToken}m each` : 'Off. Videos play with no clock.'),
    fields: [
      { key: 'watchTokensPerDay', label: 'Drops per day', kind: 'stepper', min: 0, max: 48,
        unit: () => [DripPage.icon('drop', 'drip-token-drop')], say: (n) => plural(n, 'drop', 'drops') },
      { key: 'minutesPerToken', label: 'Minutes per drop', kind: 'stepper', min: 1, max: 120, step: 5,
        format: (n) => `${n}m`, say: (n) => `${n}m`, spoken: (n) => plural(n, 'minute', 'minutes') },
      { key: 'graceMode', label: 'Finish the current video', kind: 'toggle', hint: 'When time runs out partway through.' },
      { key: 'needThisPerDay', label: '"I need this one" per day', kind: 'stepper', min: 0, max: 10,
        say: (n) => String(n), hint: 'Each one needs a typed reason.' },
    ],
  },
  {
    id: 'cards', title: 'Cards', icon: 'card', iconClass: 'drip-token-card',
    // The switch turns cards off, or back on as counted or unlimited, whichever the row below shows.
    toggle: { key: 'cards', label: 'Cards', kind: 'choice', options: [['limited', 'Counted'], ['unlimited', 'Unlimited'], ['off', 'Off']] },
    summary: (d) => (d.cards === 'off' ? 'Off. Home shows a search box.'
      : `${d.cards === 'unlimited' ? 'Unlimited cards' : `${plural(d.recTokensPerDay, 'card', 'cards')} a day`} from ${d.feedSource === 'home' ? 'your Home feed' : 'Subscriptions'}`),
    fields: [
      // The stepper hides while cards are unlimited, leaving the Counted or Unlimited picker beside it (cardsKind).
      { key: 'recTokensPerDay', label: 'Cards per day', kind: 'stepper', min: 0, max: 100,
        unit: () => [DripPage.icon('card', 'drip-token-card')], say: (n) => plural(n, 'card', 'cards') },
      // Settings is where the feed source lives for now (Q5).
      { key: 'feedSource', label: 'Reveal from', kind: 'choice', options: [['home', 'Home feed'], ['subscriptions', 'Subscriptions']] },
      // Q30. Upcoming and members-only videos are never dealt, so they have no switch.
      { key: 'streams', label: 'Reveal live streams', kind: 'toggle',
        hint: 'Live now and past streams. Upcoming and members-only videos never come up.' },
    ],
  },
  {
    id: 'stash', title: 'Stash', icon: 'save',
    toggle: { key: 'stash', label: 'Stash', kind: 'toggle' },
    summary: (d) => (d.stash ? `Holds ${plural(d.stashMax, 'video', 'videos')}` : 'Off. No Stash buttons.'),
    fields: [
      // Q28. Lowering it keeps every stashed video; a full stash asks which one to swap out.
      { key: 'stashMax', label: 'Stash holds', kind: 'stepper', min: 1, max: 50,
        unit: (n) => [n === 1 ? 'video' : 'videos'], say: (n) => plural(n, 'video', 'videos'),
        hint: 'A full stash asks which video to swap out.' },
    ],
  },
  {
    id: 'search', title: 'Search', icon: 'search',
    toggle: { key: 'searchCap', label: 'Search', kind: 'toggle' },
    summary: (d) => (d.searchCap ? 'Stops at 10 results' : 'Off. Search shows every result.'),
    fields: [],
  },
  {
    // Not mode parts: the same in every mode, so the picker leaves them alone.
    id: 'day', title: 'Every day', icon: 'clock',
    summary: (d) => `New day at ${DripPage.hourLabel(d.resetHour)}, unspent saved for ${plural(d.rolloverDays, 'day', 'days')}`,
    fields: [
      { key: 'resetHour', label: 'New day starts at', kind: 'hour' },
      { key: 'rolloverDays', label: 'Save unspent for', kind: 'stepper', min: 1, max: 7,
        idle: (d) => (!d.clock && d.cards !== 'limited' ? 'Not used without watch time or counted cards.' : ''),
        unit: (n) => [n === 1 ? 'day' : 'days'], say: (n) => plural(n, 'day', 'days'),
        hint: 'Unspent drops and cards carry over up to this many days.' },
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
  if (!state.pending || !(f.key in state.pending.changes)) return null;
  const { h } = DripPage;
  // "4:00am until 4:00am" says nothing, so a new reset hour names the end of today instead.
  const text = f.key === 'resetHour' ? `Today ends at ${resetLabel()}`
    : `${named ? `${f.label} ` : ''}${valueWords(f, state.settings[f.key])} until ${resetLabel()}`;
  return h('span', { class: 'chip', title: `Your change starts ${effectiveLabel()}` },
    h('span', {}, text),
    h('span', { 'aria-hidden': 'true' }, '·'),
    h('button', { type: 'button', class: 'chip-undo', 'aria-label': `Undo the waiting change to ${f.label}`, onclick: () => cancel(f.key) }, 'Undo'));
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
  $('firstDay').hidden = !until;
  $('firstDay').textContent = until ? `Changes apply right away until ${untilLabel(until)}, while you try drip out. After that, raising a limit waits for the reset.` : '';
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
  return h('div', { class: 'setting', 'data-field': f.key },
    h('div', { class: 'setting-text' },
      h('div', { class: 'setting-line' }, label, chip(f)),
      f.hint && h('div', { class: 'hint' }, f.hint),
      f.idle && h('div', { class: 'hint idle-note' })),
    f.key === 'recTokensPerDay' ? h('div', { class: 'controls' }, input, cardsKindPicker()) : input);
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
        h('div', { class: 'part-sum' }),
        // Shown only while the section is folded, so a waiting change inside it stays in view with its Undo.
        h('div', { class: 'setting-line folded-chips' }, ...p.fields.map((f) => chip(f, true)))),
      t && (t.key === 'cards' ? cardsSwitch() : control(t, ''))),
    p.fields.length > 0 && h('div', { class: 'rows' },
      h('div', { class: 'rows-inner' }, h('div', { class: 'rows-pad' }, ...p.fields.map(fieldRow)))));
}

function renderForm() {
  renderFirstDay();
  $('settings').replaceChildren(modeRow(), ...PARTS.map(partSection));
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
    const sum = section.querySelector('.part-sum');
    if (sum) sum.textContent = p.summary(draft);
  }
  const counted = document.querySelector('[data-field="recTokensPerDay"]');
  counted?.classList.toggle('is-unlimited', draft.cards === 'unlimited');
  const stepper = counted?.querySelector('.stepper');
  if (stepper) /** @type {HTMLElement} */ (stepper).hidden = draft.cards === 'unlimited';
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
  if (res && res.state) state = res.state;
  return res;
}

/** Save and Undo all hide the button pressed, so focus goes to the mode picker, the top of the form, not the page's. */
const focusForm = () => /** @type {HTMLElement | null} */ (document.querySelector('.segmented [tabindex="0"]'))?.focus();

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
  const hadFocus = $('savebar').contains(document.activeElement);
  draft = Drip.planned(state);
  resetCardsKind();
  savedNote = savedLine(Object.keys(res.pending || {}));
  renderForm();
  renderHistory();
  if (hadFocus) focusForm();
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    savedNote = '';
    renderBar();
  }, 2500);
}

/** Undo all: the form goes back to the saved settings, waiting changes included. */
function undoAll() {
  const hadFocus = $('savebar').contains(document.activeElement);
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

// Your data (RELEASE-PLAN.md, item 5): export, import, and reset. Import and reset go through the worker's rules, so a
// change that loosens a limit waits for the reset, and neither touches today's drops or cards.

/** @param {number} n @param {string} one @param {string} many */
const counted = (n, one, many) => (n ? [plural(n, one, many)] : []);

/** A list as words: "a", "a and b", "a, b, and c". @param {string[]} parts */
function words(parts) {
  if (parts.length < 3) return parts.join(' and ');
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/** @param {string} text */
function dataSays(text) {
  $('dataResult').textContent = text;
}

/** "2 changes start at 4:00am.", or '' when nothing waits. @param {Record<string, any> | undefined} pending */
function waitsLine(pending) {
  const n = Object.keys(pending || {}).length;
  return n ? ` ${plural(n, 'change starts', 'changes start')} at ${resetLabel()}.` : '';
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
  dataSays('Exported your settings, stash, and history.');
}

/** The largest file Import reads. An export with years of history is well under this. */
const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

async function importFile() {
  const input = /** @type {HTMLInputElement} */ ($('importFile'));
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (file.size > IMPORT_MAX_BYTES) return dataSays("That file is too big to be a drip export.");
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return dataSays("That file isn't a drip export.");
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
    const why = res && res.error === 'bad-format' ? 'That export is from a newer drip. Update drip and try again.'
      : res && res.error === 'not-drip' ? "That file isn't a drip export." : "Couldn't import. Try again.";
    return dataSays(why);
  }
  afterData(res, kept);
  const added = [...counted(res.stashAdded, 'stashed video', 'stashed videos'), ...counted(res.daysAdded, 'day of history', 'days of history')];
  const full = res.stashSkipped ? ` ${plural(res.stashSkipped, "video didn't", "videos didn't")} fit in the stash.` : '';
  dataSays(`Imported.${added.length ? ` Added ${words(added)}.` : ''}${full}${waitsLine(res.pending)}`);
}

/** @param {boolean} open */
function showResetConfirm(open) {
  $('resetConfirm').hidden = !open;
  $('dataButtons').hidden = open;
  if (open) {
    $('resetWhen').textContent = resetLabel();
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
  const cleared = res.stashCleared ? ` Emptied the stash of ${plural(res.stashCleared, 'video', 'videos')}.` : '';
  dataSays(`Settings are back to how drip started.${cleared}${waitsLine(res.pending)}`);
}

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
  if (area !== 'local' || !changes.drip || !state || sample) return;
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
  draft = Drip.planned(state);
  resetCardsKind();
  renderForm();
  renderHistory();
  renderReasons();
  // The sections didn't exist when Chrome looked for the #fragment, so options.html#cards goes there now.
  if (location.hash) arrive(decodeURIComponent(location.hash.slice(1)), false);
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
  if (msg && msg.type === 'settingsGoto' && typeof msg.section === 'string') arrive(msg.section, true);
});
window.addEventListener('hashchange', () => arrive(decodeURIComponent(location.hash.slice(1)), true));
