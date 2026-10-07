// @ts-check
// Dev panel: a floating box on YouTube pages for testing, with drip's state and buttons that change it.
// It shows while developer mode is on in Settings, or always in a checkout with dev/ENABLED (the worker decides).
// bin/build-release leaves it out of the store build.

(function () {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;
  /** @type {any} */
  const { send, h, onState, hourLabel } = /** @type {any} */ (globalThis).DripUI;

  const COLLAPSED_KEY = 'drip-dev-collapsed';
  /** @type {any} */
  let state = null;
  let message = '';
  let confirmFresh = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let confirmTimer;
  /** @type {HTMLElement | null} */
  let panel = null;

  function readCollapsed() {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  }
  let collapsed = readCollapsed();

  /** @param {string} action @param {string} label */
  async function run(action, label) {
    const res = await send({ type: 'devAction', action });
    if (res && res.state) state = res.state;
    message = res && res.ok ? `Done: ${label}` : `Failed: ${(res && res.error) || 'no answer'}`;
    update();
  }

  /** @param {string} action @param {string} label @param {string} [text] */
  function button(action, label, text = label) {
    return h('button', { class: 'drip-btn', type: 'button', onclick: () => run(action, label) }, text);
  }

  /** @param {string} title @param {...HTMLElement} buttons */
  function row(title, ...buttons) {
    return h('div', { class: 'drip-dev-row' }, h('span', { class: 'drip-dev-label' }, title), ...buttons);
  }

  // Built once. State updates arrive every few seconds while a video plays, so they change text only: replacing the
  // buttons would drop a click that lands mid-update, and keyboard focus with it.
  const toggle = h('button', {
    class: 'drip-dev-toggle',
    type: 'button',
    onclick: () => {
      collapsed = !collapsed;
      try {
        localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
      } catch {}
      update();
    },
  });
  const status = h('div', { class: 'drip-dev-status' });
  const graceButton = h('button', {
    class: 'drip-btn',
    type: 'button',
    onclick: () => run('grace-toggle', graceButton.textContent || 'grace'),
  });
  const freshButton = h('button', {
    class: 'drip-btn',
    type: 'button',
    onclick: () => {
      if (!confirmFresh) {
        confirmFresh = true;
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => { confirmFresh = false; update(); }, 3000);
        update();
        return;
      }
      confirmFresh = false;
      clearTimeout(confirmTimer);
      run('fresh', 'start fresh');
    },
  });
  const messageLine = h('div', { class: 'drip-dev-message' });
  const body = h('div', {},
    status,
    row('Minutes', button('minutes-0', 'minutes to 0', '0'), button('minutes-1', 'minutes to 1', '1 min'),
      button('minutes+5', 'add 5 min', '+5'), button('minutes+15', 'add 15 min', '+15')),
    row('Watch tokens', button('watch+1', 'watch token +1', '+1'), button('watch-0', 'watch tokens to 0', '0')),
    row('Rec tokens', button('rec+1', 'rec token +1', '+1'), button('rec-0', 'rec tokens to 0', '0')),
    row('Day', button('reset-now', 'reset', 'Run reset now')),
    row('Settings', button('apply-pending', 'apply pending', 'Apply pending'), graceButton),
    row('Clear', button('clear-unlocks', 'clear unlocks', 'Unlocks'), button('clear-backlog', 'clear backlog', 'Backlog'),
      button('clear-seen', 'clear reveal history', 'Reveal history'), button('clear-log', "clear today's log", "Today's log")),
    h('div', { class: 'drip-dev-row' }, freshButton),
    messageLine,
  );

  function statusLines() {
    if (!state) return ['Loading…'];
    const s = state.settings;
    const pending = state.pending
      ? Object.entries(state.pending.changes).map(([k, v]) => `${k} → ${v}`).join(', ') + ` (from ${state.pending.effectiveDay})`
      : 'none';
    return [
      `Day ${state.day}, resets at ${hourLabel(s.resetHour)}`,
      `${Drip.formatMinutes(state.watchSecondsLeft)} left (${Math.round(state.watchSecondsLeft)}s)`,
      `Watch tokens ${state.tokens.watch} · rec tokens ${state.tokens.rec}`,
      `Unlocks ${state.unlocked.length} of ${s.needThisPerDay} · grace ${s.graceMode ? 'on' : 'off'}`,
      `Pending: ${pending}`,
    ];
  }

  /** @param {HTMLElement} el @param {string} text */
  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  function update() {
    if (!panel) {
      panel = h('div', { id: 'drip-dev', class: 'drip-ui' }, toggle, body);
      document.documentElement.append(panel);
    }
    setText(toggle, collapsed ? 'drip dev ▸' : 'drip dev ▾');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    body.hidden = collapsed;
    const lines = statusLines();
    if (status.childElementCount !== lines.length) status.replaceChildren(...lines.map(() => h('div')));
    lines.forEach((line, i) => setText(/** @type {HTMLElement} */ (status.children[i]), line));
    setText(graceButton, state && state.settings.graceMode ? 'Grace off now' : 'Grace on now');
    setText(freshButton, confirmFresh ? 'Click again to wipe everything' : 'Start fresh');
    // Always there, so the first message doesn't make the panel grow and move its buttons.
    setText(messageLine, message || 'Ready');
  }

  let enabled = false;
  onState((/** @type {any} */ next) => {
    state = next;
    if (enabled) update();
  });

  /** Shows or removes the panel to match developer mode. */
  async function refresh() {
    const res = await send({ type: 'devStatus' });
    enabled = !!(res && res.enabled);
    if (!enabled) {
      panel?.remove();
      panel = null;
      return;
    }
    const got = await send({ type: 'get' });
    if (got && got.state) state = got.state;
    update();
  }

  // The Settings toggle (dripDev) shows and hides the panel on open tabs, no refresh needed.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.dripDev) refresh();
  });
  refresh();
})();
