// @ts-check
// Helpers shared by home.js and watch.js. Content scripts share one global scope, so this sets globalThis.DripUI.

(function () {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;

  /**
   * Sends a message to the service worker. Resolves to null if the extension was reloaded under this page.
   * @param {object} msg
   * @returns {Promise<any>}
   */
  async function send(msg) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch {
      return null;
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

  /** @type {any} */ (globalThis).DripUI = { send, h, onState, hourLabel, watchUrl };
})();
