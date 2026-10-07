// @ts-check
// Dev panel: a floating box on YouTube pages for testing, with drip's state and buttons that change it.
// It shows only in a checkout with dev/ENABLED (the worker checks), and bin/build-release leaves it out of the store build.

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
    render();
  }

  /** @param {string} action @param {string} label @param {string} [text] */
  function button(action, label, text = label) {
    return h('button', { class: 'drip-btn', type: 'button', onclick: () => run(action, label) }, text);
  }

  /** @param {string} title @param {...HTMLElement} buttons */
  function row(title, ...buttons) {
    return h('div', { class: 'drip-dev-row' }, h('span', { class: 'drip-dev-label' }, title), ...buttons);
  }

  function freshButton() {
    return h('button', {
      class: 'drip-btn',
      type: 'button',
      onclick: () => {
        if (!confirmFresh) {
          confirmFresh = true;
          clearTimeout(confirmTimer);
          confirmTimer = setTimeout(() => { confirmFresh = false; render(); }, 3000);
          render();
          return;
        }
        confirmFresh = false;
        clearTimeout(confirmTimer);
        run('fresh', 'start fresh');
      },
    }, confirmFresh ? 'Click again to wipe everything' : 'Start fresh');
  }

  function statusLines() {
    if (!state) return [h('div', {}, 'Loading…')];
    const s = state.settings;
    const pending = state.pending
      ? Object.entries(state.pending.changes).map(([k, v]) => `${k} → ${v}`).join(', ') + ` (from ${state.pending.effectiveDay})`
      : 'none';
    return [
      h('div', {}, `Day ${state.day}, resets at ${hourLabel(s.resetHour)}`),
      h('div', {}, `${Drip.formatMinutes(state.watchSecondsLeft)} left (${Math.round(state.watchSecondsLeft)}s)`),
      h('div', {}, `Watch tokens ${state.tokens.watch} · rec tokens ${state.tokens.rec}`),
      h('div', {}, `Unlocks ${state.unlocked.length} of ${s.needThisPerDay} · grace ${s.graceMode ? 'on' : 'off'}`),
      h('div', {}, `Pending: ${pending}`),
    ];
  }

  function render() {
    if (!panel) {
      panel = h('div', { id: 'drip-dev', class: 'drip-ui' });
      document.documentElement.append(panel);
    }
    const toggle = h('button', {
      class: 'drip-dev-toggle',
      type: 'button',
      'aria-expanded': String(!collapsed),
      onclick: () => {
        collapsed = !collapsed;
        try {
          localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
        } catch {}
        render();
      },
    }, collapsed ? 'drip dev ▸' : 'drip dev ▾');
    if (collapsed) {
      panel.replaceChildren(toggle);
      return;
    }
    const graceLabel = state && state.settings.graceMode ? 'Grace off now' : 'Grace on now';
    panel.replaceChildren(
      toggle,
      h('div', { class: 'drip-dev-status' }, ...statusLines()),
      row('Minutes', button('minutes-0', 'minutes to 0', '0'), button('minutes-1', 'minutes to 1', '1 min'),
        button('minutes+5', 'add 5 min', '+5'), button('minutes+15', 'add 15 min', '+15')),
      row('Watch tokens', button('watch+1', 'watch token +1', '+1'), button('watch-0', 'watch tokens to 0', '0')),
      row('Rec tokens', button('rec+1', 'rec token +1', '+1'), button('rec-0', 'rec tokens to 0', '0')),
      row('Day', button('reset-now', 'reset', 'Run reset now')),
      row('Settings', button('apply-pending', 'apply pending', 'Apply pending'), button('grace-toggle', graceLabel, graceLabel)),
      row('Clear', button('clear-unlocks', 'clear unlocks', 'Unlocks'), button('clear-backlog', 'clear backlog', 'Backlog'),
        button('clear-seen', 'clear reveal history', 'Reveal history'), button('clear-log', "clear today's log", "Today's log")),
      h('div', { class: 'drip-dev-row' }, freshButton()),
      // Always there, so the first message doesn't make the panel grow and move its buttons.
      h('div', { class: 'drip-dev-message' }, message || 'Ready'),
    );
  }

  send({ type: 'devStatus' }).then((/** @type {any} */ res) => {
    if (!res || !res.enabled) return;
    onState((/** @type {any} */ next) => {
      state = next;
      render();
    });
    send({ type: 'get' }).then((/** @type {any} */ got) => {
      if (got && got.state) state = got.state;
      render();
    });
  });
})();
