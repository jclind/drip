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
   * Whether drip is still loaded for this tab. After drip reloads or updates, its scripts in tabs that were already open
   * keep running, cut off from the extension, and most chrome.* calls throw "Extension context invalidated", which
   * Chrome lists under Errors on drip's card. chrome.runtime.id is gone in such a tab, and checking it never throws.
   */
  function alive() {
    return !!chrome.runtime?.id;
  }

  /**
   * Sends a message to the service worker. Reports an invalid extension context separately from other failures.
   * @param {object} msg
   * @returns {Promise<any>}
   */
  async function send(msg) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (err) {
      const disconnected = !alive() || /extension context invalidated/i.test(String(err));
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
  /** @param {HTMLElement} el @param {string} type @param {any} fn */
  function listen(el, type, fn) {
    const morph = /** @type {any} */ (globalThis).DripMorph;
    if (morph) morph.listen(el, type, fn);
    else el.addEventListener(type, fn);
  }

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      // Through DripMorph when it's loaded, so a node morph keeps takes the new view's handler (morph.js).
      if (key.startsWith('on')) listen(el, key.slice(2), value);
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

  /**
   * "today at 9:14pm", "tomorrow at 9:14pm", "Friday at 9:14pm", or "next Wednesday at 9:14pm" a week out. Short, for
   * the lock's footer: "today 9:14pm", "Fri 9:14pm", "next Wed 9:14pm".
   * @param {number} ms @param {number} now @param {boolean} [short]
   */
  function dayTimeLabel(ms, now, short = false) {
    const date = new Date(ms);
    const hour = date.getHours();
    const time = `${hour % 12 === 0 ? 12 : hour % 12}:${String(date.getMinutes()).padStart(2, '0')}${hour < 12 ? 'am' : 'pm'}`;
    const today = new Date(now);
    const days = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
      - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
    const weekday = date.toLocaleDateString('en-US', { weekday: short ? 'short' : 'long' });
    // A week out lands on today's weekday, where a bare "Wednesday" would read as today.
    const day = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : days >= 7 ? `next ${weekday}` : weekday;
    return short ? `${day} ${time}` : `${day} at ${time}`;
  }

  /**
   * The lock's footer (DESIGN.md "Lock screen", Jesse's pick B, 2026-11-07): a rule, then when the glass refills on the
   * left and when the next unlock returns on the right, each after its icon. One alone is centered.
   * @param {string} refill "4:00am", or '' to leave it out @param {string} back "Fri 9:14pm", or ''
   */
  function lockFoot(refill, back) {
    if (!refill && !back) return null;
    return h('div', { class: `drip-lock-foot${refill && back ? '' : ' is-one'}` },
      refill && h('span', { class: 'drip-lock-fact' }, icon('drop', 'drip-token-drop'), h('span', {}, `Refills ${refill}`)),
      back && h('span', { class: 'drip-lock-fact' }, icon('unlock'), h('span', {}, `Unlock back ${back}`)));
  }

  /** How often the spark runs around "Done for now" while nobody points at it. */
  const ORBIT_EVERY_MS = 3600;
  /** The first lap, once the lock's panel has surfaced (it rises 0.65s in and takes 0.46s). */
  const ORBIT_FIRST_MS = 1400;
  /** One lap, and the moment the ring leaves as the spark gets home. */
  const LAP_MS = 1300;
  const RING_AT_MS = 1150;

  /**
   * The point a fraction t of the way around a w × h pill with corner radius r, clockwise from the left end of the top
   * edge.
   * @param {number} t @param {number} w @param {number} h @param {number} r
   * @returns {[number, number]}
   */
  function pillPoint(t, w, h, r) {
    const flat = w - 2 * r;
    const side = h - 2 * r;
    const arc = (Math.PI / 2) * r;
    let d = (((t % 1) + 1) % 1) * (2 * flat + 2 * side + 4 * arc);
    /** @type {[number, number, number, number][]} corner centers and start angles */
    const corners = [[w - r, r, -90, 0], [w - r, h - r, 0, 0], [r, h - r, 90, 0], [r, r, 180, 0]];
    const edges = [[r, 0, 1, 0, flat], [w, r, 0, 1, side], [w - r, h, -1, 0, flat], [0, h - r, 0, -1, side]];
    for (let i = 0; i < 4; i++) {
      const [x, y, dx, dy, len] = edges[i];
      if (d <= len) return [x + dx * d, y + dy * d];
      d -= len;
      if (d <= arc) {
        const [cx, cy, start] = corners[i];
        const a = ((start + (d / arc) * 90) * Math.PI) / 180;
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      }
      d -= arc;
    }
    return [r, 0];
  }

  /** @param {string} color "rgb(…)" or "rgba(…)" @param {number} alpha */
  function withAlpha(color, alpha) {
    const [r = 0, g = 0, b = 0] = (color.match(/[\d.]+/g) || []).map(Number);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * One lap around "Done for now" (Jesse's pick Z2, 2026-11-07): a glowing blue spark runs once around the button's edge,
   * shedding small pale blue stars, and as it gets home one ring leaves the button. It's all drawn in the panel, so the
   * button's face never moves. Everything animates left, top, size, and color, never transform or opacity, to keep
   * animated layers from coming and going under the lock's blurred overlay. That was a guess at why the overlay
   * dropped for a frame (Jesse, 2026-11-07), and the drops went on after it.
   * @param {HTMLElement} button @param {(button: HTMLElement) => void} ring
   */
  function orbitLap(button, ring) {
    const panel = button.closest('.drip-lock-panel');
    if (!panel) return;
    const p = panel.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    const x0 = b.left - p.left;
    const y0 = b.top - p.top;
    const r = b.height / 2;
    const spark = h('span', { class: 'drip-orbit-spark', 'aria-hidden': 'true' });
    panel.append(spark);
    const core = getComputedStyle(spark).backgroundColor;
    const glow = '0 0 6px 2px rgba(66, 165, 246, A), 0 0 14px 4px rgba(66, 165, 246, B)';
    const look = (/** @type {number} */ a) => ({
      backgroundColor: withAlpha(core, a), boxShadow: glow.replace('A', String(0.9 * a)).replace('B', String(0.45 * a)),
    });
    // The lap's easing, applied to where the spark is, so left and top can be keyframed linearly.
    const ease = (/** @type {number} */ t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    const steps = 48;
    /** @type {Keyframe[]} */
    const frames = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const [x, y] = pillPoint(ease(t), b.width, b.height, r);
      const a = t < 0.1 ? t / 0.1 : t > 0.85 ? (1 - t) / 0.15 : 1;
      frames.push({ offset: t, left: `${x0 + x}px`, top: `${y0 + y}px`, ...look(a) });
    }
    const lap = spark.animate(frames, { duration: LAP_MS, fill: 'both' });
    lap.finished.then(() => spark.remove(), () => spark.remove());
    let shed = 0;
    const timer = setInterval(() => {
      if (++shed > 9 || !spark.isConnected) return clearInterval(timer);
      const left = parseFloat(getComputedStyle(spark).left);
      const top = parseFloat(getComputedStyle(spark).top);
      const size = 4 + Math.round(Math.random() * 3);
      const star = h('span', { class: 'drip-orbit-star', 'aria-hidden': 'true' });
      panel.append(star);
      const tint = getComputedStyle(star).backgroundColor;
      star.animate([
        { left: `${left}px`, top: `${top}px`, width: `${size}px`, height: `${size}px`, backgroundColor: withAlpha(tint, 0.9) },
        { left: `${left + Math.random() * 12 - 6}px`, top: `${top + Math.random() * 12 - 8}px`, width: '0px', height: '0px',
          backgroundColor: withAlpha(tint, 0) }],
      { duration: 600, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'both' }).finished.then(() => star.remove(), () => star.remove());
    }, 120);
    setTimeout(() => {
      if (button.isConnected && !button.matches(':hover, :focus-visible') && !button.classList.contains('is-leaving')) ring(button);
    }, RING_AT_MS);
  }

  /**
   * Runs orbitLap every ORBIT_EVERY_MS on whichever "Done for now" find returns, and stops once there's none. A lap is
   * skipped while the pointer or focus is on the button (the water pour has the stage), while it's leaving, while it or
   * the tab is hidden, and with reduced motion.
   * @param {() => HTMLElement | null} find @param {(button: HTMLElement) => void} ring
   * @returns {() => void} starts it, if it isn't running
   */
  function orbiter(find, ring) {
    /** @type {ReturnType<typeof setInterval> | undefined} */
    let timer;
    const tick = () => {
      const button = find();
      if (!button) {
        clearInterval(timer);
        timer = undefined;
        return;
      }
      if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches || !button.getClientRects().length
        || button.classList.contains('is-leaving') || button.matches(':hover, :focus-visible')) return;
      orbitLap(button, ring);
    };
    return () => {
      if (timer !== undefined) return;
      // A placeholder until the first lap, so a rebuild in the meantime doesn't start a second timer.
      timer = setTimeout(() => {
        tick();
        if (timer !== undefined) timer = setInterval(tick, ORBIT_EVERY_MS);
      }, ORBIT_FIRST_MS);
    };
  }

  /** @param {string} id */
  function watchUrl(id) {
    return `/watch?v=${encodeURIComponent(id)}`;
  }

  /**
   * A cartoon or lucide icon from src/icons, drawn as a CSS mask so it takes the color of the text around it. The mask
   * is a data: URL from icons.js, which says why.
   * @param {string} name
   * @param {string} [cls]
   */
  function icon(name, cls = '') {
    const el = h('span', { class: `drip-i drip-i-${name} ${cls}`.trim(), 'aria-hidden': 'true' });
    const icons = /** @type {any} */ (globalThis).DripIcons;
    // On YouTube, icons.js loads first (manifest.json), because a youtube.com page can't load drip's files. The
    // welcome page is drip's own page and can, so it and the Node tests load common.js without icons.js.
    if (icons) icons.paint(el, name);
    else el.style.setProperty('--drip-icon', `url("${chrome.runtime.getURL(`src/icons/${name}.svg`)}")`);
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
        class: 'drip-card-more', type: 'button', 'data-k': 'card-more', 'aria-label': 'More', title: 'More',
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
    el.querySelector('[data-k="card-more"]')?.setAttribute('aria-expanded', String(o.open));
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
          h('span', { class: 'drip-menu-say is-sure' }, h('span', {}, 'Click again to block'), h('small', {}, 'You can unblock it in Settings')))));
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
   * @param {{counted: boolean, disabled: boolean, onReveal: () => void, onClose: () => void}} o
   */
  function blockedCardView(video, thumb, o) {
    thumb.removeAttribute('href');
    if (!thumb.querySelector('.drip-blocked-chip')) {
      thumb.append(h('span', { class: 'drip-blocked-chip' }, icon('ban'), 'Blocked'));
    }
    return h('div', { class: 'drip-card is-blocked', 'data-k': `blocked-${video.id}` }, thumb,
      h('div', { class: 'drip-card-title', title: video.title }, video.title),
      h('div', { class: 'drip-card-meta-row' },
        h('span', { class: 'drip-meta' }, `${video.channel} is blocked. Unblock it in Settings.`)),
      h('div', { class: 'drip-card-actions' },
        h('button', {
          class: 'drip-b drip-b-gray drip-next', 'data-k': 'next', disabled: o.disabled, onclick: o.onReveal,
        }, icon('arrow'), h('span', { class: 'drip-next-label' }, 'Reveal next'), o.counted && price('card')),
        // × puts the card away, back to the empty page. The block already passed it, so nothing else changes (Jesse, 2026-11-04).
        h('button', {
          class: 'drip-b drip-b-gray drip-pass', 'data-k': 'close', 'aria-label': 'Close', title: 'Close', onclick: o.onClose,
        }, icon('x'))));
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
    // getManifest below throws in a tab whose drip was reloaded, and that tab's markup isn't drip's to judge any more.
    if (!alive() || brokenSeen.has(what)) return;
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

  /** The longest watchFor waits for a page to finish loading before it starts counting anyway. */
  const LOAD_WAIT_MS = 60000;

  /**
   * Reports a break when `selector` matches nothing for 10 seconds straight on a page where it should. The 10 seconds
   * start once the page has loaded: on slow 3G YouTube took longer than that to build the player, and the banner said
   * drip was broken (Jesse, 2026-11-09). Loaded means the window's load event on a full load, and YouTube's
   * navigate-finish after an in-page navigation, or LOAD_WAIT_MS if neither comes.
   * @param {keyof typeof BROKEN} what
   * @param {string} selector
   * @param {(pathname: string) => boolean} onPage
   * @param {() => void} [onBroken] Called each time the selector goes missing for 10 seconds again.
   */
  function watchFor(what, selector, onPage, onBroken) {
    /** When the selector went missing, by performance.now, or -1. */
    let missingSince = -1;
    // One callback per outage. The banner itself shows once per page load (reportBroken).
    let reported = false;
    /** When an in-page navigation started, by performance.now, until YouTube says it finished. -1 when none is pending. */
    let navSince = -1;
    const startedAt = performance.now();
    document.addEventListener('yt-navigate-start', () => {
      missingSince = -1;
      navSince = performance.now();
    });
    document.addEventListener('yt-navigate-finish', () => { navSince = -1; });
    const loading = () => {
      const now = performance.now();
      if (navSince >= 0) return now - navSince < LOAD_WAIT_MS;
      return document.readyState !== 'complete' && now - startedAt < LOAD_WAIT_MS;
    };
    const timer = setInterval(() => {
      if (!alive()) {
        clearInterval(timer);
        return;
      }
      if (!onPage(location.pathname) || document.querySelector(selector) || loading()) {
        missingSince = -1;
        reported = false;
        return;
      }
      // performance.now, so a clock change (or the dev clock jumping) doesn't read as 10 seconds gone (Codex, 2026-11-04).
      if (missingSince < 0) missingSince = performance.now();
      else if (performance.now() - missingSince >= 10000 && !reported) {
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

  // Once the lock's water is all the way up, its wave mask and clip-path cover nothing, so drip.css takes them off
  // (#drip-lock.is-full) until it drains. Chrome showed the page unmasked on a drain's last frames, so masked, clipped
  // and blurred together is a suspect for the other glitch too: now and then the whole overlay dropped for a frame
  // while the lock sat still, on YouTube and in the welcome tour (Jesse, 2026-11-07). Not proved; dev/mask-ab.js tests it.
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('animationend', (e) => {
      const lock = /** @type {HTMLElement | null} */ (e.target);
      if (lock && lock.id === 'drip-lock' && /water-rise$/.test(e.animationName)) lock.classList.add('is-full');
    });
  }

  /** @type {any} */ (globalThis).DripUI = { send, h, onState, hourLabel, dayTimeLabel, lockFoot, orbiter, watchUrl, icon, price, cardMenu, updateCardMenu, blockedCardView, KEPT_KEY, pausePlayer, reportBroken, watchFor, alive };
})();
