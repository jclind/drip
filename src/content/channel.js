// @ts-check
// The Allow button on a channel page (RELEASE-PLAN.md item 4, CHANNEL-LISTS-PLAN.md call 12). An allowed channel's
// videos cost no minutes. Allowing waits for the reset (Q6); pressing it again takes the channel off at once.

(function () {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;
  /** @type {any} */
  const { send, h, onState, hourLabel } = /** @type {any} */ (globalThis).DripUI;

  // YouTube selectors. These break when YouTube changes its markup. Checked on air, 2026-11-03.
  const SEL = {
    header: 'yt-page-header-view-model',
    name: 'yt-page-header-view-model h1',
    // The header writes the handle as text ("@veritasium"), on /@handle and /channel/UC... pages alike.
    handleText: 'yt-page-header-view-model yt-content-metadata-view-model span',
    // Subscribe and Join sit in this row. The button goes at its end.
    actions: 'yt-page-header-view-model yt-flexible-actions-view-model',
  };
  const BUTTON_ID = 'drip-allow';

  /** @type {any} */
  let state = null;
  let busy = false;
  let view = '';

  /** The channel this page is, or null off a channel page or before the header has drawn. */
  function pageChannel() {
    const path = location.pathname;
    const fromPath = Drip.channelId(path);
    if (!fromPath) return null;
    const header = document.querySelector(SEL.header);
    if (!header) return null;
    /** @type {string[]} */
    const ids = [fromPath];
    for (const span of document.querySelectorAll(SEL.handleText)) {
      const handle = Drip.channelId(span.textContent?.trim() || '');
      if (handle.startsWith('@')) {
        if (!ids.includes(handle)) ids.unshift(handle);
        break;
      }
    }
    // On a move from one channel to another the header can still be the last one's. Its handle must agree with a
    // /@handle URL. A /channel/UC... URL has no handle to check, so the header's name must match the tab's title, which
    // YouTube sets for the new page. Until both agree, it waits for the next draw (Codex, 2026-11-03).
    if (fromPath.startsWith('@') && ids[0] !== fromPath) return null;
    const name = document.querySelector(SEL.name)?.textContent?.trim() || '';
    if (!fromPath.startsWith('@') && (!name || document.title.replace(/ - YouTube$/, '').trim() !== name)) return null;
    return { ids, name };
  }

  /** @param {any} channel */
  function where(channel) {
    if (!state || !state.channels) return 'none';
    if (state.channels.allow.some((/** @type {any} */ c) => Drip.sameChannel(c, channel))) return 'allowed';
    const waiting = state.channelsPending && state.channelsPending.allow.some((/** @type {any} */ c) => Drip.sameChannel(c, channel));
    if (waiting) return 'waiting';
    const count = state.channels.allow.length + (state.channelsPending ? state.channelsPending.allow.length : 0);
    return count >= Drip.ALLOW_MAX ? 'full' : 'none';
  }

  /** @param {any} channel */
  async function onClick(channel) {
    if (busy) return;
    busy = true;
    try {
      const now = where(channel);
      const type = now === 'allowed' || now === 'waiting' ? 'removeAllowed' : now === 'full' ? 'openSettings' : 'allowChannel';
      const res = await send(type === 'openSettings' ? { type, section: 'channels' } : { type, channel });
      if (res && res.ok && res.state) state = res.state;
    } finally {
      busy = false;
      draw();
    }
  }

  function draw() {
    const old = document.getElementById(BUTTON_ID);
    const channel = pageChannel();
    const actions = document.querySelector(SEL.actions);
    if (!channel || !actions || !state) {
      old?.remove();
      view = '';
      return;
    }
    const at = where(channel);
    const label = {
      allowed: 'Allowed in drip',
      waiting: `Allowed from ${hourLabel(state.settings.resetHour)}`,
      full: 'Allow list full',
      none: 'Allow in drip',
    }[at];
    const title = {
      allowed: 'Videos from this channel cost no minutes. Click to take it off.',
      waiting: 'Starts at the next reset. Click to cancel.',
      full: `drip allows ${Drip.ALLOW_MAX} channels. Open Settings to make room.`,
      none: 'Videos from this channel would cost no minutes. Starts at the next reset.',
    }[at];
    const key = JSON.stringify([channel.ids, at, label]);
    // Redraw only on a change, so a click isn't lost to a rebuilt button.
    if (old && view === key && old.parentElement === actions) return;
    view = key;
    const button = h('button', {
      id: BUTTON_ID, type: 'button', class: `drip-ui drip-allow is-${at}`, title,
      'aria-pressed': at === 'allowed' || at === 'waiting' ? 'true' : 'false',
      onclick: () => onClick(channel),
    }, label);
    old?.remove();
    actions.append(button);
    tellSeen(channel);
  }

  /** A list entry added by handle learns the channel's name here, for matching home cards. @param {any} channel */
  function tellSeen(channel) {
    if (!state || !state.channels || !channel.name) return;
    const p = state.channelsPending;
    const entries = [...state.channels.allow, ...state.channels.block, ...(p ? [...p.allow, ...p.unblock] : [])];
    const stale = entries.some((/** @type {any} */ e) => Drip.sameChannel(e, channel) && (e.name !== channel.name || channel.ids.some((/** @type {string} */ id) => !e.ids.includes(id))));
    if (stale) send({ type: 'seenChannel', channel });
  }

  onState((/** @type {any} */ next) => {
    state = next;
    draw();
  });
  document.addEventListener('yt-navigate-finish', draw);
  setInterval(draw, 1000);
  send({ type: 'get' }).then((/** @type {any} */ res) => {
    if (res && res.ok && res.state) state = res.state;
    draw();
  });
})();
