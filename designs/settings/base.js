// Shared behavior for the Settings mockups: steppers, part switches that fold their section, the mode picker, the
// unsaved-changes bar, and the flash when a link from the lock, a card, or the popup lands on a section.
// Not drip's code. The numbers are drip's defaults (DEFAULT_SETTINGS in src/lib/state.js).

(() => {
  if (new URLSearchParams(location.search).get('theme') === 'light') document.documentElement.dataset.theme = 'light';
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Every control, so the variant pages only say where each one goes: <span data-ctl="key"></span>.
  const hours = (pick) => Array.from({ length: 24 }, (_, h) =>
    `<option value="${h}"${h === pick ? ' selected' : ''}>${h % 12 === 0 ? 12 : h % 12}:00${h < 12 ? 'am' : 'pm'}</option>`).join('');
  const stepper = (key, value, min, max, inner, extra = '') =>
    `<div class="stepper" data-key="${key}" data-value="${value}" data-min="${min}" data-max="${max}" ${extra}>` +
    `<button type="button" data-dir="-1" tabindex="-1" aria-label="Less"><span class="i i-minus"></span></button>` +
    `<output tabindex="0" role="spinbutton"><span class="n">${value}</span>${inner}</output>` +
    `<button type="button" data-dir="1" tabindex="-1" aria-label="More"><span class="i i-plus"></span></button></div>`;
  const select = (key, opts) =>
    `<span class="picker-wrap"><select class="picker" data-key="${key}">${opts}</select><span class="i i-down"></span></span>`;
  const toggle = (key, on, label) =>
    `<input type="checkbox" role="switch" class="toggle" data-key="${key}"${on ? ' checked' : ''} aria-label="${label}">`;
  const CTL = {
    watchTokensPerDay: stepper('watchTokensPerDay', 4, 0, 48, '<span class="i i-drop"></span>'),
    minutesPerToken: stepper('minutesPerToken', 15, 1, 120, '', 'data-big="5" data-fmt="m"'),
    recTokensPerDay: stepper('recTokensPerDay', 10, 0, 100, '<span class="i i-card"></span>'),
    rolloverDays: stepper('rolloverDays', 2, 1, 7, '<span class="u">days</span>', 'data-one="day" data-many="days"'),
    stashMax: stepper('stashMax', 10, 1, 50, '<span class="u">videos</span>', 'data-one="video" data-many="videos"'),
    needThisPerDay: stepper('needThisPerDay', 2, 0, 10, ''),
    resetHour: select('resetHour', hours(4)),
    quietFrom: select('quietFrom', hours(23)),
    quietTo: select('quietTo', hours(6)),
    feedSource: select('feedSource', '<option value="home" selected>Home feed</option><option value="subscriptions">Subscriptions</option>'),
    cardsKind: select('cardsKind', '<option value="limited" selected>Counted</option><option value="unlimited">Unlimited</option>'),
    streams: toggle('streams', false, 'Reveal live streams'),
    graceMode: toggle('graceMode', false, 'Finish the current video'),
    hideBell: toggle('hideBell', true, 'Hide the notification bell'),
    quietOn: toggle('quietOn', false, 'Quiet hours'),
    clock: toggle('clock', true, 'Limit watch time'),
    cards: toggle('cards', true, 'Reveal one video at a time'),
    searchCap: toggle('searchCap', true, 'Stop search at 10 results'),
    stash: toggle('stash', true, 'Stash videos for later'),
  };
  for (const el of $$('[data-ctl]')) el.outerHTML = CTL[el.dataset.ctl];

  const MODES = {
    quiet: { clock: false, cards: false, cardsKind: 'limited', searchCap: false, stash: false },
    curated: { clock: false, cards: true, cardsKind: 'unlimited', searchCap: true, stash: true },
    full: { clock: true, cards: true, cardsKind: 'limited', searchCap: true, stash: true },
  };
  const PARTS = ['clock', 'cards', 'searchCap', 'stash'];

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const hour = (h) => `${h % 12 === 0 ? 12 : h % 12}:00${h < 12 ? 'am' : 'pm'}`;

  /** Current value of every keyed control, as one flat object. */
  function values() {
    const v = {};
    for (const el of $$('[data-key]')) {
      const k = el.dataset.key;
      if (el.matches('input[type=checkbox]')) v[k] = el.checked;
      else if (el.matches('select')) v[k] = el.value;
      else if (el.matches('.stepper')) v[k] = Number(el.dataset.value);
    }
    return v;
  }

  const SUMMARY = {
    clock: (v) => v.clock ? `${plural(v.watchTokensPerDay, 'drop', 'drops')} a day, ${v.minutesPerToken}m each` : 'Off. Videos play with no clock.',
    cards: (v) => !v.cards ? 'Off. Home shows a search box.'
      : `${v.cardsKind === 'unlimited' ? 'Unlimited cards' : plural(v.recTokensPerDay, 'card', 'cards') + ' a day'} from ${v.feedSource === 'home' ? 'your Home feed' : 'Subscriptions'}`,
    stash: (v) => v.stash ? `Holds ${plural(v.stashMax, 'video', 'videos')}` : 'Off. No Stash buttons.',
    searchCap: (v) => v.searchCap ? 'Stops at 10 results' : 'Off. Search shows every result.',
    general: (v) => `New day at ${hour(Number(v.resetHour))}, carry over ${plural(v.rolloverDays, 'day', 'days')}`,
    channels: () => 'None yet',
    data: () => 'Export, import, or reset',
    short_clock: (v) => v.clock ? `${v.watchTokensPerDay} a day` : 'Off',
    short_cards: (v) => !v.cards ? 'Off' : v.cardsKind === 'unlimited' ? 'Unlimited' : `${v.recTokensPerDay} a day`,
    short_stash: (v) => v.stash ? `${v.stashMax} max` : 'Off',
    short_searchCap: (v) => v.searchCap ? 'On' : 'Off',
  };

  function modeOf(v) {
    return Object.keys(MODES).find((m) => Object.entries(MODES[m]).every(([k, want]) =>
      k === 'cardsKind' ? !v.cards || v.cardsKind === want : v[k] === want)) || null;
  }

  let saved = values();

  function render() {
    const v = values();
    for (const part of PARTS) {
      for (const el of $$(`[data-part="${part}"]`)) el.classList.toggle('is-off', !v[part]);
    }
    for (const el of $$('[data-cards-kind]')) el.classList.toggle('is-unlimited', v.cardsKind === 'unlimited');
    for (const el of $$('[data-dep]')) el.classList.toggle('is-dim', !v[el.dataset.dep]);
    for (const el of $$('[data-summary]')) el.textContent = SUMMARY[el.dataset.summary](v);
    const mode = modeOf(v);
    for (const b of $$('[data-mode]')) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
    for (const el of $$('[data-mode-hint]')) el.textContent = mode ? 'Switch a part below to make your own mix.' : 'Your own mix.';
    const changed = Object.keys(v).filter((k) => v[k] !== saved[k]).length;
    for (const bar of $$('[data-savebar]')) {
      bar.hidden = changed === 0 && !bar.dataset.justSaved;
      const count = bar.querySelector('.count');
      if (count) count.textContent = changed ? `${plural(changed, 'change', 'changes')} not saved` : 'Saved.';
      bar.classList.toggle('is-saved', changed === 0);
    }
  }

  function setStepper(el, n) {
    const min = Number(el.dataset.min);
    const max = Number(el.dataset.max);
    n = Math.min(max, Math.max(min, n));
    el.dataset.value = String(n);
    const out = el.querySelector('.n');
    if (out) out.textContent = el.dataset.fmt === 'm' ? `${n}m` : String(n);
    const unit = el.querySelector('.u');
    if (unit && el.dataset.one) unit.textContent = n === 1 ? el.dataset.one : el.dataset.many;
  }

  function step(el, dir) {
    const v = Number(el.dataset.value);
    const big = Number(el.dataset.big || 0);
    const s = big && (dir > 0 ? v >= big : v > big) ? big : 1;
    setStepper(el, dir > 0 ? Math.floor(v / s) * s + s : Math.ceil(v / s) * s - s);
  }

  document.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!t) return;
    if (t.dataset.dir) { step(t.closest('.stepper'), Number(t.dataset.dir)); render(); }
    if (t.dataset.mode) {
      const m = MODES[t.dataset.mode];
      for (const [k, want] of Object.entries(m)) {
        const el = document.querySelector(`[data-key="${k}"]`);
        if (!el) continue;
        if (el.matches('input')) el.checked = want; else el.value = want;
      }
      render();
    }
    if (t.matches('[data-save]')) {
      saved = values();
      const bar = t.closest('[data-savebar]');
      bar.dataset.justSaved = '1';
      render();
      setTimeout(() => { delete bar.dataset.justSaved; render(); }, 1600);
    }
    if (t.matches('[data-undo]')) {
      for (const el of $$('[data-key]')) {
        const k = el.dataset.key;
        if (el.matches('input[type=checkbox]')) el.checked = saved[k];
        else if (el.matches('select')) el.value = saved[k];
        else setStepper(el, saved[k]);
      }
      render();
    }
  });
  document.addEventListener('change', render);
  document.addEventListener('keydown', (e) => {
    const out = /** @type {HTMLElement} */ (e.target).closest?.('.stepper output');
    if (!out) return;
    const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    step(out.closest('.stepper'), dir);
    render();
  });

  // Leaving with unsaved changes asks first (IDEAS.md, "Settings page").
  window.addEventListener('beforeunload', (e) => {
    const v = values();
    if (Object.keys(v).some((k) => v[k] !== saved[k])) e.preventDefault();
  });

  /** A link from elsewhere in drip, like options.html#cards: open that section and flash it once. */
  function arrive() {
    const id = location.hash.slice(1);
    const el = id && document.getElementById(id);
    if (!el) return;
    document.dispatchEvent(new CustomEvent('drip-goto', { detail: id }));
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      const target = el.querySelector('[data-flash]') || el;
      target.classList.remove('arrived');
      void target.offsetWidth;
      target.classList.add('arrived');
    });
  }
  window.addEventListener('hashchange', arrive);

  for (const el of $$('.stepper')) setStepper(el, Number(el.dataset.value));
  saved = values();
  render();
  window.addEventListener('load', arrive);
  window.DripMock = { render, values };
})();
