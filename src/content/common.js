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

  // When YouTube changes its markup, drip fails open (Q25): nothing locks, and a banner says what broke.
  const BROKEN = {
    player: "drip can't find YouTube's video player, so it isn't counting minutes on this page.",
    home: "drip can't find YouTube's home page, so your tokens aren't showing.",
    grid: "drip can't read YouTube's recommendations, so Reveal can't pick a video. No token was spent.",
    search: "drip can't find the search results, so it isn't limiting them.",
  };
  /** @type {Set<string>} */
  const brokenSeen = new Set();

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
      h('div', { class: 'drip-row' }, copy, h('button', { class: 'drip-btn', onclick: () => banner.remove() }, 'Dismiss')));
    document.getElementById('drip-broken')?.remove();
    document.body.append(banner);
  }

  /**
   * Reports a break when `selector` matches nothing for 10 seconds straight on a page where it should.
   * @param {keyof typeof BROKEN} what
   * @param {string} selector
   * @param {(pathname: string) => boolean} onPage
   * @param {() => void} [onBroken] Called once when the break is reported.
   */
  function watchFor(what, selector, onPage, onBroken) {
    let missingSince = 0;
    document.addEventListener('yt-navigate-start', () => { missingSince = 0; });
    setInterval(() => {
      if (!onPage(location.pathname) || document.querySelector(selector)) {
        missingSince = 0;
        return;
      }
      if (!missingSince) missingSince = Date.now();
      else if (Date.now() - missingSince >= 10000 && !brokenSeen.has(what)) {
        reportBroken(what, selector);
        onBroken?.();
      }
    }, 1000);
  }

  /** @type {any} */ (globalThis).DripUI = { send, h, onState, hourLabel, watchUrl, pausePlayer, reportBroken, watchFor };
})();
