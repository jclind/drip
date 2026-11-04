// @ts-check
// Helpers shared by home.js and watch.js. Content scripts share one global scope, so this sets globalThis.DripUI.

(function () {
  // YouTube selectors. These break when YouTube changes its markup.
  const SEL = {
    player: '#movie_player',
    playButton: '#movie_player .ytp-play-button',
  };

  /** @param {HTMLVideoElement | null} video */
  function pausePlayer(video) {
    const player = document.querySelector(SEL.player);
    if (player?.classList.contains('playing-mode')) {
      const button = /** @type {HTMLElement | null} */ (document.querySelector(SEL.playButton));
      button?.click();
    }
    if (video && !video.paused) video.pause();
  }

  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;

  /**
   * Sends a message to the service worker. Reports an invalid extension context separately from other failures.
   * @param {object} msg
   * @returns {Promise<any>}
   */
  async function send(msg) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (err) {
      const disconnected = !chrome.runtime?.id || /extension context invalidated/i.test(String(err));
      return { ok: false, error: disconnected ? 'disconnected' : 'send-failed' };
    }
  }

  /**
   * Builds an element. Text goes in with textContent, never innerHTML, because titles come from the page.
   * @param {string} tag
   * @param {Record<string, any>} [attrs]
   * @param {...(Node | string | null | undefined | false)} children
   * @returns {HTMLElement}
   */
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else if (key === 'class') el.className = value;
      else el.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child);
    }
    return el;
  }

  /**
   * Calls cb with the new state whenever the worker saves it.
   * @param {(state: any) => void} cb
   */
  function onState(cb) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.drip) cb(Drip.hydrate(changes.drip.newValue, Date.now()));
    });
  }

  /**
   * "4:00am" for resetHour 4.
   * @param {number} hour
   */
  function hourLabel(hour) {
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12}:00${hour < 12 ? 'am' : 'pm'}`;
  }

  /** @param {string} id */
  function watchUrl(id) {
    return `/watch?v=${encodeURIComponent(id)}`;
  }

  /**
   * A cartoon or lucide icon from src/icons, drawn as a CSS mask so it takes the color of the text around it.
   * @param {string} name
   * @param {string} [cls]
   */
  function icon(name, cls = '') {
    const el = h('span', { class: `drip-i drip-i-${name} ${cls}`.trim(), 'aria-hidden': 'true' });
    el.style.setProperty('--drip-icon', `url("${chrome.runtime.getURL(`src/icons/${name}.svg`)}")`);
    return el;
  }

  /**
   * A price on a button: "-1" and the token's icon. Screen readers get "costs 1 drop".
   * @param {'drop' | 'card'} token
   */
  function price(token) {
    return h('span', { class: 'drip-price' },
      h('span', { class: 'drip-sep', 'aria-hidden': 'true' }, '·'),
      h('span', { 'aria-hidden': 'true' }, '-1'),
      icon(token, `drip-token-${token}`),
      h('span', { class: 'drip-sr' }, `, costs 1 ${token}`));
  }

  /**
   * The ⋯ beside a reveal card's title and its one-item menu: Block the channel, clicked twice (Jesse's picks, B and K,
   * 2026-11-04). The first click turns the item red, "Click again to block". Both wordings sit in one grid cell, so the
   * menu keeps its width when the words change. home.js and the welcome tour keep the open and armed state.
   * @param {{channel: string, open: boolean, armed: boolean, disabled?: boolean, onToggle: () => void, onPick: () => void}} o
   */
  function cardMenu(o) {
    const el = h('div', { class: 'drip-card-menu' },
      h('button', {
        class: 'drip-card-more', type: 'button', 'data-k': 'more', 'aria-label': 'More', title: 'More',
        'aria-haspopup': 'menu', 'aria-expanded': String(o.open), disabled: o.disabled, onclick: o.onToggle,
      }, icon('ellipsis-vertical')));
    updateCardMenu(el, o);
    return el;
  }

  /**
   * Updates the menu without replacing the card or replaying the menu animation when Block arms or disarms.
   * @param {Element | null} el
   * @param {{open: boolean, channel?: string, armed?: boolean, onPick?: () => void}} o
   */
  function updateCardMenu(el, o) {
    if (!el) return;
    el.querySelector('[data-k="more"]')?.setAttribute('aria-expanded', String(o.open));
    if (!o.open) {
      el.querySelector('.drip-menu')?.remove();
      return;
    }
    let item = el.querySelector('[data-k="block"]');
    if (!item) {
      const menu = h('div', { class: 'drip-menu', role: 'menu' },
        h('button', {
          class: 'drip-menu-item', type: 'button', role: 'menuitem', 'data-k': 'block', onclick: o.onPick,
        },
        icon('ban'),
        h('span', { class: 'drip-menu-words', 'aria-hidden': 'true' },
          h('span', { class: 'drip-menu-say is-ask' }, h('span', {}, `Block ${o.channel}`), h('small', {}, 'Reveals never deal this channel again')),
          h('span', { class: 'drip-menu-say is-sure' }, h('span', {}, 'Click again to block'), h('small', {}, 'Unblocking waits for the reset')))));
      el.append(menu);
      item = menu.querySelector('[data-k="block"]');
    }
    item?.classList.toggle('is-armed', !!o.armed);
    item?.setAttribute('aria-label', o.armed ? `Click again to block ${o.channel}` : `Block ${o.channel}`);
  }

  /**
   * The video left on screen after a successful block, shared by home and the welcome tour.
   * @param {{title: string, channel: string}} video
   * @param {HTMLElement} thumb
   * @param {{counted: boolean, disabled: boolean, onReveal: () => void}} o
   */
  function blockedCardView(video, thumb, o) {
    thumb.removeAttribute('href');
    if (!thumb.querySelector('.drip-blocked-chip')) {
      thumb.append(h('span', { class: 'drip-blocked-chip' }, icon('ban'), 'Blocked'));
    }
    return h('div', { class: 'drip-card is-blocked' }, thumb,
      h('div', { class: 'drip-card-title', title: video.title }, video.title),
      h('div', { class: 'drip-card-meta-row' },
        h('span', { class: 'drip-meta' }, `${video.channel} is blocked. Unblock it in Settings.`)),
      h('div', { class: 'drip-card-actions' },
        h('button', {
          class: 'drip-b drip-b-gray drip-next', 'data-k': 'next', disabled: o.disabled, onclick: o.onReveal,
        }, icon('arrow'), h('span', { class: 'drip-next-label' }, 'Reveal next'), o.counted && price('card'))));
  }

  // When YouTube changes its markup, drip fails open (Q25): nothing locks, and a banner says what broke. Each line has
  // to hold in every mode, so it names what drip can't reach, not a part that may be off (Codex, 2026-10-15).
  const BROKEN = {
    player: "drip can't find YouTube's video player, so it isn't working on this page.",
    home: "drip can't find YouTube's home page, so it can't show its own here.",
    grid: "drip can't read YouTube's recommendations, so Reveal can't pick a video. No card spent.",
    search: "drip can't find the search results, so it isn't changing them.",
  };
  /** @type {Set<string>} */
  const brokenSeen = new Set();
  // Where "Send report" emails go (Q25). Empty hides the button. Keep it the same as the store listing's contact.
  const REPORT_EMAIL = 'apps@jesselind.com';

  /**
   * Shows the "drip is broken here" banner, once per kind of break per page load.
   * @param {keyof typeof BROKEN} what
   * @param {string} selector The selector that matched nothing, for the report.
   */
  function reportBroken(what, selector) {
    if (brokenSeen.has(what)) return;
    brokenSeen.add(what);
    const details = [
      `drip ${chrome.runtime.getManifest().version}`,
      `broken: ${what}`,
      `selector: ${selector}`,
      `page: ${location.pathname}`,
      `browser: ${navigator.userAgent}`,
      `when: ${new Date().toISOString()}`,
    ].join('\n');
    const copy = h('button', { class: 'drip-btn', onclick: () => {
      navigator.clipboard.writeText(details).then(() => { copy.textContent = 'Copied'; }, () => { copy.textContent = 'Copy failed'; });
    } }, 'Copy details');
    const banner = h('div', { id: 'drip-broken', class: 'drip-ui', role: 'status' },
      h('div', {}, BROKEN[what], ' YouTube probably changed its page, and drip needs an update.'),
      h('div', { class: 'drip-row' },
        // The user's own mail app opens with everything filled in, so they see exactly what gets sent.
        REPORT_EMAIL && h('a', { class: 'drip-btn drip-primary', href: `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(`drip is broken: ${what}`)}&body=${encodeURIComponent(details)}` }, 'Send report'),
        copy, h('button', { class: 'drip-btn', onclick: () => banner.remove() }, 'Dismiss')));
    document.getElementById('drip-broken')?.remove();
    document.body.append(banner);
  }

  /**
   * Reports a break when `selector` matches nothing for 10 seconds straight on a page where it should.
   * @param {keyof typeof BROKEN} what
   * @param {string} selector
   * @param {(pathname: string) => boolean} onPage
   * @param {() => void} [onBroken] Called each time the selector goes missing for 10 seconds again.
   */
  function watchFor(what, selector, onPage, onBroken) {
    let missingSince = 0;
    // One callback per outage. The banner itself shows once per page load (reportBroken).
    let reported = false;
    document.addEventListener('yt-navigate-start', () => { missingSince = 0; });
    setInterval(() => {
      if (!onPage(location.pathname) || document.querySelector(selector)) {
        missingSince = 0;
        reported = false;
        return;
      }
      if (!missingSince) missingSince = Date.now();
      else if (Date.now() - missingSince >= 10000 && !reported) {
        reported = true;
        reportBroken(what, selector);
        onBroken?.();
      }
    }, 1000);
  }

  // The popup's "Open YouTube" asks every tab this, since drip has no permission to read tab URLs (store/LISTING.md).
  // Only a YouTube tab with drip running answers.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'drip-ping') sendResponse({ ok: true });
  });

  // sessionStorage key for the drops left unspent when the lock screen's "Done for now" goes home (watch.js, home.js).
  const KEPT_KEY = 'drip-kept';

  /** @type {any} */ (globalThis).DripUI = { send, h, onState, hourLabel, watchUrl, icon, price, cardMenu, updateCardMenu, blockedCardView, KEPT_KEY, pausePlayer, reportBroken, watchFor };
})();
