// @ts-check
// The dev panel's actions on drip's state, for testing in a checkout with developer mode on. The worker runs them
// (src/devpanel/worker.js) and refuses them anywhere else. Not a feature: nothing in DESIGN.md's rules applies.
// bin/build-release leaves src/devpanel out of the store build, so they live here and not in src/lib/state.js.
//
// A classic script that adds Drip.devAction, so src/lib/state.js has to load first. The worker and the Node tests
// load it.

(() => {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;

  /**
   * @param {State} state
   * @param {string} action
   * @param {number} now
   */
  function devAction(state, action, now) {
    /** @param {'watch' | 'rec'} kind @param {number} n */
    const setTokens = (kind, n) => { state.tokens[kind] = Math.max(0, n); };
    switch (action) {
      case 'minutes-0': state.watchSecondsLeft = 0; break;
      case 'seconds-10': state.watchSecondsLeft = 10; break;
      case 'minutes-1': state.watchSecondsLeft = 60; break;
      case 'minutes+5': state.watchSecondsLeft += 5 * 60; break;
      case 'minutes+15': state.watchSecondsLeft += 15 * 60; break;
      case 'watch+1': setTokens('watch', state.tokens.watch + 1); break;
      case 'watch-0': setTokens('watch', 0); break;
      case 'rec+1': setTokens('rec', state.tokens.rec + 1); break;
      case 'rec-0': setTokens('rec', 0); break;
      case 'reset-now':
        // Moves drip back a day without rolling it over, so the next message rolls it over the way a real reset
        // does, and an open token page notices on its own 1-second check. A pending change moves back with it.
        state.day = Drip.addDays(state.day, -1);
        if (state.pending) state.pending.effectiveDay = Drip.addDays(state.pending.effectiveDay, -1);
        if (state.channelsPending) state.channelsPending.effectiveDay = Drip.addDays(state.channelsPending.effectiveDay, -1);
        break;
      case 'apply-pending':
        if (state.pending) Object.assign(state.settings, state.pending.changes);
        state.pending = null;
        Drip.applyChannelsPending(state);
        break;
      case 'grace-toggle':
        state.settings.graceMode = !state.settings.graceMode;
        Drip.cancelPending(state, 'graceMode');
        break;
      case 'clear-unlocks': {
        state.unlocked = [];
        state.allowedToday = [];
        // The week's count comes from the log (Q20), so its uses go too, or the lock would still say 0 left.
        const counted = new Set(Drip.needThisUses(state, now).map((/** @type {{use: unknown}} */ u) => u.use));
        for (const entry of Object.values(state.log)) entry.needThis = entry.needThis.filter((use) => !counted.has(use));
        break;
      }
      case 'first-day-off': state.firstDayOff = true; break;
      case 'first-day-on': state.firstDayOff = false; break;
      case 'clear-backlog': state.backlog = []; break;
      case 'clear-seen': state.seen = []; state.current = null; break;
      case 'clear-log': delete state.log[state.day]; break;
      case 'fresh': Object.assign(state, Drip.initialState(now)); break;
      default: return { ok: false, error: 'unknown-dev-action' };
    }
    return { ok: true };
  }

  Drip.devAction = devAction;
})();
