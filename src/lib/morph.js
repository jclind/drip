// @ts-check
// Brings a drawn part of a page up to date in place, instead of replacing it. A button replaced mid-click loses the
// click, an open menu replaced restarts its animation, and a focused one loses focus (Codex's flicker audit,
// 2026-11-05). Pages still build their whole view with h(), and morph(live, next) changes only what differs.
//
// Matching: two elements are the same node when they have the same tag and the same data-k, or, without a data-k,
// the same tag in the same order among their unkeyed siblings. So anything whose identity matters (a card, a stash row)
// carries a data-k. A node the view reuses by identity (the glass, a cached thumbnail) is moved in as it is.
// An element with data-morph-keep keeps its live children: something other than the view fills it (YouTube's
// search box in its slot). One with data-morph-new is code that animates the node it just built (the stash bookmark
// filling): it's never matched either way, so it goes in fresh, and goes when the next view doesn't bring it back.
//
// Handlers: h() adds them through listen(), which keeps them on the element, so a kept node takes the new view's
// handlers along with its attributes. A handler added with addEventListener directly stays as it was.
//
// A classic script that sets globalThis.DripMorph, so content scripts, extension pages, and Node tests share it.

(() => {
  /**
   * Calls the element's current handler for this event type.
   * @this {any} @param {Event} e
   */
  function dispatch(e) {
    const fn = this.__dripOn && this.__dripOn[e.type];
    if (fn) return fn.call(this, e);
  }

  /**
   * Adds a handler that morph moves to the node it keeps.
   * @param {any} el @param {string} type @param {(e: any) => any} fn
   */
  function listen(el, type, fn) {
    const on = (el.__dripOn ||= {});
    if (!on[type]) el.addEventListener(type, dispatch);
    on[type] = fn;
  }

  /** @param {any} node */
  const keyOf = (node) => (node.nodeType === 1 ? node.getAttribute('data-k') || '' : '');
  /** @param {any} node */
  const fresh = (node) => node.nodeType === 1 && node.hasAttribute('data-morph-new');

  /** @param {any} a @param {any} b */
  function sameKind(a, b) {
    if (a.nodeType !== b.nodeType) return false;
    if (a.nodeType !== 1) return true;
    return a.localName === b.localName && keyOf(a) === keyOf(b);
  }

  /**
   * Makes `live` match `next`: its attributes, handlers, and children. They must be the same kind of node.
   * @param {any} live @param {any} next
   */
  function morph(live, next) {
    if (live === next) return;
    if (live.nodeType !== 1) {
      if (live.data !== next.data) live.data = next.data;
      return;
    }
    for (const { name } of [...live.attributes]) if (!next.hasAttribute(name)) live.removeAttribute(name);
    for (const { name, value } of [...next.attributes]) if (live.getAttribute(name) !== value) live.setAttribute(name, value);
    if (next.__dripOn) {
      const on = (live.__dripOn ||= {});
      for (const type of Object.keys(next.__dripOn)) if (!on[type]) live.addEventListener(type, dispatch);
      live.__dripOn = { ...next.__dripOn };
    } else if (live.__dripOn) live.__dripOn = {};
    if (next.hasAttribute('data-morph-keep')) return;
    morphChildren(live, next);
  }

  /**
   * Makes `live`'s children match `next`'s, keeping every live child that has a match.
   * @param {any} live @param {any} next
   */
  function morphChildren(live, next) {
    const pool = [...live.childNodes];
    /** @type {Map<string, any>} */
    const keyed = new Map();
    for (const node of pool) if (keyOf(node) && !fresh(node)) keyed.set(`${node.localName}#${keyOf(node)}`, node);
    const used = new Set();
    let cursor = 0;
    /** The next unkeyed live node of the same kind, in order. @param {any} want */
    const nextSpot = (want) => {
      for (let i = cursor; i < pool.length; i++) {
        const node = pool[i];
        if (used.has(node) || keyOf(node) || !sameKind(node, want)) continue;
        cursor = i + 1;
        return node;
      }
      return null;
    };
    const result = [...next.childNodes].map((want) => {
      /** @type {any} */
      let match = null;
      if (keyOf(want) && !fresh(want)) {
        const found = keyed.get(`${want.localName}#${keyOf(want)}`);
        if (found && !used.has(found)) match = found;
      } else {
        // A fresh node, new or live, holds its spot so the siblings after it line up, but is never patched: the new
        // one goes in, or the plain node built for a live one's spot replaces it.
        const spot = keyOf(want) ? null : nextSpot(want);
        if (spot && !fresh(spot) && !fresh(want)) match = spot;
      }
      if (!match) return want;
      used.add(match);
      morph(match, want);
      return match;
    });
    for (const node of pool) if (!used.has(node)) node.remove();
    result.forEach((node, i) => {
      const at = live.childNodes[i];
      if (at !== node) live.insertBefore(node, at || null);
    });
  }

  /** @type {any} */ (globalThis).DripMorph = { morph, morphChildren, listen };
})();
