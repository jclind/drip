// @ts-check
// The Allow button on a channel page (RELEASE-PLAN.md item 4, CHANNEL-LISTS-PLAN.md call 12). An allowed channel's
// videos cost no minutes. Allowing waits for the reset (Q6); pressing it again takes the channel off at once.

(function () {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;
  /** @type {any} */
  const { send, h, onState, hourLabel, icon } = /** @type {any} */ (globalThis).DripUI;

  // YouTube selectors. These break when YouTube changes its markup. Checked on air, 2026-11-03.
  const SEL = {
    header: 'yt-page-header-view-model',
    name: 'yt-page-header-view-model h1',
    // The header writes the handle as text ("@veritasium"), on /@handle and /channel/UC... pages alike.
    handleText: 'yt-page-header-view-model yt-content-metadata-view-model span',
    // Subscribe and Join sit in this row. The button goes at its end.
    actions: 'yt-page-header-view-model yt-flexible-actions-view-model',
    // The channel's picture, a yt3.googleusercontent.com image (checked on air, 2026-11-04). Settings shows it.
    avatar: 'yt-page-header-view-model yt-avatar-shape img',
  };
  const BUTTON_ID = 'drip-allow';

  /** @type {any} */
  let state = null;
  let busy = false;
  let view = '';
  /** Set by a click, so the redraw that follows plays the change once (Jesse, 2026-11-03). */
  let changed = false;

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
    // The name must match the tab's title too, on either kind of URL, so a header whose handle isn't found can't lend
    // the last channel's name. YouTube puts "(3) " before the title for unread notifications (code review, 2026-11-03).
    if (fromPath.startsWith('@') && ids[0] !== fromPath) return null;
    const name = document.querySelector(SEL.name)?.textContent?.trim() || '';
    const title = document.title.replace(/^\(\d+\+?\)\s*/, '').replace(/ - YouTube$/, '').trim();
    if (!name || title !== name) return null;
    const avatar = [...document.querySelectorAll(SEL.avatar)].map((img) => /** @type {HTMLImageElement} */ (img).src).find((src) => /^https:\/\/yt3\./.test(src));
    return avatar ? { ids, name, avatar } : { ids, name };
  }

  /** @param {any} channel */
  function where(channel) {
    if (!state || !state.channels) return 'none';
    if (state.channels.allow.some((/** @type {any} */ c) => Drip.sameChannel(c, channel))) return 'allowed';
    if (Drip.isAllowedOrWaiting(state, channel)) return 'waiting';
    if (state.channels.block.some((/** @type {any} */ c) => Drip.sameChannel(c, channel))) return 'blocked';
    return Drip.allowCount(state) >= Drip.ALLOW_MAX ? 'full' : 'none';
  }

  /** @param {any} channel */
  async function onClick(channel) {
    if (busy) return;
    busy = true;
    try {
      const now = where(channel);
      const type = now === 'allowed' || now === 'waiting' ? 'removeAllowed' : now === 'full' || now === 'blocked' ? 'openSettings' : 'allowChannel';
      // Set first: the storage event may redraw the button before this reply comes back.
      changed = type !== 'openSettings';
      const res = await send(type === 'openSettings' ? { type, section: 'channels' } : { type, channel });
      if (res && res.ok && res.state) state = Drip.newer(state, res.state);
      else changed = false;
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
    const firstDay = Drip.firstDayUntil(state, Date.now()) > 0;
    const label = {
      allowed: 'Allowed in drip',
      waiting: `Allowed from ${hourLabel(state.settings.resetHour)}`,
      full: 'Allow list full',
      blocked: 'Blocked in drip',
      none: 'Allow in drip',
    }[at];
    const title = {
      allowed: 'Videos from this channel cost no minutes. Click to take it off.',
      waiting: 'Starts at the next reset. Click to cancel.',
      full: `drip allows ${Drip.ALLOW_MAX} channels. Open Settings to make room.`,
      blocked: 'Reveals never deal this channel. Open Settings to unblock it before allowing it.',
      none: `Videos from this channel would cost no minutes. ${firstDay ? 'Starts at once in your first day.' : 'Starts at the next reset.'}`,
    }[at];
    // Before the early return below: the header's picture can load after the button is drawn (Codex, 2026-11-04).
    tellSeen(channel);
    const key = JSON.stringify([channel.ids, at, label, title]);
    // Redraw only on a change, so a click isn't lost to a rebuilt button.
    if (old && view === key && old.parentElement === actions) return;
    view = key;
    // A drop to allow, a clock while it waits for the reset, and a check once it's allowed.
    const glyph = { allowed: 'check', waiting: 'clock-line', full: 'drop', blocked: 'drop', none: 'drop' }[at];
    // On hover or focus a pressed button says what a click does (Jesse, 2026-11-04). Both labels sit in one grid cell,
    // so the button keeps the wider one's width and doesn't move under the pointer.
    const undo = { allowed: 'Remove', waiting: 'Undo' }[/** @type {'allowed' | 'waiting'} */ (at)] || '';
    const button = h('button', {
      id: BUTTON_ID, type: 'button', class: `drip-ui drip-allow is-${at}${changed ? ' is-changed is-fresh' : ''}`, title,
      'aria-pressed': at === 'allowed' || at === 'waiting' ? 'true' : 'false',
      onclick: () => onClick(channel),
    }, icon(glyph, 'drip-allow-icon'), undo && icon('x', 'drip-allow-icon drip-allow-undo-icon'),
    h('span', { class: 'drip-allow-text' },
      h('span', { class: 'drip-allow-label' }, label),
      undo && h('span', { class: 'drip-allow-undo', 'aria-hidden': 'true' }, undo)));
    // Right after a click the pointer is still on the button. It shows the new state until the pointer leaves, so the
    // undo label doesn't hide what just happened.
    if (changed) {
      button.addEventListener('mouseleave', () => button.classList.remove('is-fresh'), { once: true });
      button.addEventListener('blur', () => button.classList.remove('is-fresh'), { once: true });
    }
    changed = false;
    const hadFocus = !!old && old.contains(document.activeElement);
    old?.remove();
    actions.append(button);
    if (hadFocus) button.focus();
  }

  /**
   * A list entry added by handle learns the channel's name here, for matching home cards. The entries hold what
   * cleanChannel kept, so the page's sighting is compared cleaned the same way. Raw, a name with a no-break space or
   * U+3000, common in Japanese names, never matched and went to the worker every second (release review, 2026-11-10).
   * @param {any} channel
   */
  function tellSeen(channel) {
    if (!state || !state.channels || !channel.name) return;
    const seen = Drip.cleanChannel(channel);
    if (!seen) return;
    const p = state.channelsPending;
    const entries = [...state.channels.allow, ...state.channels.block, ...(p ? [...p.allow, ...p.unblock] : [])];
    const stale = entries.some((/** @type {any} */ e) => Drip.sameChannel(e, seen) && (e.name !== seen.name
      || (!!seen.avatar && e.avatar !== seen.avatar) || seen.ids.some((/** @type {string} */ id) => !e.ids.includes(id))));
    if (stale) send({ type: 'seenChannel', channel });
  }

  onState((/** @type {any} */ next) => {
    if (Drip.isOlder(next, state)) return;
    state = next;
    draw();
  });
  document.addEventListener('yt-navigate-finish', draw);
  setInterval(draw, 1000);
  send({ type: 'get' }).then((/** @type {any} */ res) => {
    if (res && res.ok && res.state) state = Drip.newer(state, res.state);
    draw();
  });
})();
