// @ts-check
// Helpers for drip's own pages (popup, Settings). A classic script that sets globalThis.DripPage, like glass.js.

(() => {
  /**
   * Builds an element. Text goes in with textContent, never innerHTML, because video titles come from YouTube.
   * @param {string} tag
   * @param {Record<string, any>} [attrs]
   * @param {...(Node | string | null | false | undefined)} children
   * @returns {HTMLElement}
   */
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      // Through DripMorph when it's loaded, so a node morph keeps takes the new view's handler (morph.js).
      if (k.startsWith('on')) {
        const morph = /** @type {any} */ (globalThis).DripMorph;
        if (morph) morph.listen(el, k.slice(2), v);
        else el.addEventListener(k.slice(2), v);
      }
      else if (k === 'class') el.className = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
    return el;
  }

  /**
   * An icon from src/icons, drawn as a CSS mask so it takes the text color (pages.css, .drip-i).
   * @param {string} name
   * @param {string} [cls]
   */
  function icon(name, cls = '') {
    const el = h('span', { class: `drip-i drip-i-${name} ${cls}`.trim(), 'aria-hidden': 'true' });
    el.style.setProperty('--drip-icon', `url("${chrome.runtime.getURL(`src/icons/${name}.svg`)}")`);
    return el;
  }

  /** "4:00am" for 4. */
  function hourLabel(/** @type {number} */ hour) {
    return `${hour % 12 === 0 ? 12 : hour % 12}:00${hour < 12 ? 'am' : 'pm'}`;
  }

  /** @type {any} */ (globalThis).DripPage = { h, icon, hourLabel };
})();
