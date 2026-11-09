// @ts-check
// Catches what happens around the lock when its overlay vanishes for a frame and the video shows through (Jesse,
// 2026-11-07). Chrome's compositor glitches can't be seen from JavaScript, so this records everything that touches the
// lock, and you mark the moment you see a flash.
//
// 1. Bring up the lock (or the welcome tour's lock step). Open DevTools (Cmd+Option+I), Console panel.
// 2. Paste this file (`pbcopy < dev/flash-log.js` in drip's clone copies it). Chrome may ask you to type
//    `allow pasting` first. It prints "flash-log: recording".
// 3. Close DevTools or leave it docked, and watch the lock. The moment you see a flash, press ` (backquote, the key
//    left of 1). The console logs "flash-log: mark 1" with what happened in the 3 seconds before.
// 4. After a few marks, run `copy(flashReport())` in the console and paste the result to Claude.
//
// To test a suspect, turn it off and watch for a few minutes: flashOff('orbit'), flashOff('sea'), flashOff('blur'),
// flashOff('mask'), flashOff('rings'). flashOn(name) brings it back. flashReport() includes which were off.

(() => {
  const g = /** @type {any} */ (globalThis);
  if (g.flashReport) return console.log('flash-log: already recording');

  /** @type {{t: number, kind: string, what: string}[]} */
  const events = [];
  /** @type {{n: number, t: number, off: string[], before: typeof events}[]} */
  const marks = [];
  const t0 = performance.now();
  const now = () => Math.round(performance.now() - t0);
  /** @param {string} kind @param {string} what */
  const log = (kind, what) => {
    events.push({ t: now(), kind, what });
    // Ten seconds is plenty to look back from a mark.
    while (events.length && events[0].t < now() - 10000) events.shift();
  };
  /** @param {Node | null} n */
  const name = (n) => {
    if (!n || n.nodeType !== 1) return n?.nodeName || '?';
    const el = /** @type {Element} */ (n);
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}`;
  };
  /** @param {EventTarget | null} t */
  const inLock = (t) => t instanceof Element && !!t.closest('#drip-lock, #drip-pill');

  // The overlay and the panel being added, removed, or replaced, and attribute changes on them.
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'attributes') {
        if (!inLock(m.target)) continue;
        const el = /** @type {Element} */ (m.target);
        log('attr', `${name(el)} ${m.attributeName}=${String(el.getAttribute(m.attributeName || '')).slice(0, 80)}`);
        continue;
      }
      const lockish = (/** @type {Node} */ n) => n.nodeType === 1 && (inLock(n) || /** @type {Element} */ (n).id === 'drip-lock');
      if (!inLock(m.target) && ![...m.addedNodes, ...m.removedNodes].some(lockish)) continue;
      for (const n of m.addedNodes) if (n.nodeType === 1) log('add', `${name(n)} in ${name(m.target)}`);
      for (const n of m.removedNodes) if (n.nodeType === 1) log('remove', `${name(n)} from ${name(m.target)}`);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'dark'] });

  // CSS animations and transitions inside the lock: the water, bubbles, fish, rings, and the Done button.
  for (const type of ['animationstart', 'animationiteration', 'animationend', 'animationcancel', 'transitionstart', 'transitionend', 'transitioncancel']) {
    document.addEventListener(type, (e) => {
      if (!inLock(e.target)) return;
      const a = /** @type {any} */ (e);
      log(type, `${a.animationName || a.propertyName}${a.pseudoElement ? a.pseudoElement : ''} on ${name(/** @type {Element} */ (e.target))}`);
    }, true);
  }

  // Script animations (the orbit, the leave rings) and long frames, checked every frame.
  let count = -1;
  let last = performance.now();
  const frame = () => {
    const t = performance.now();
    if (t - last > 40 && !document.hidden) log('long-frame', `${Math.round(t - last)}ms`);
    last = t;
    const n = document.getAnimations().length;
    if (n !== count) {
      log('animations', `${n} running`);
      count = n;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  for (const type of ['visibilitychange', 'fullscreenchange']) document.addEventListener(type, () => log(type, document.hidden ? 'hidden' : 'visible'));
  for (const type of ['focus', 'blur', 'resize']) window.addEventListener(type, () => log(type, `${innerWidth}x${innerHeight}`));
  for (const type of ['yt-navigate-start', 'yt-navigate-finish', 'yt-page-data-updated', 'yt-player-updated']) document.addEventListener(type, () => log('youtube', type));
  const video = document.querySelector('video');
  if (video) for (const type of ['play', 'pause', 'seeking', 'seeked', 'waiting', 'emptied', 'loadeddata']) video.addEventListener(type, () => log('video', type));

  // The mark key. Capture phase, so the lock or YouTube can't swallow it.
  window.addEventListener('keydown', (e) => {
    if (e.key !== '`') return;
    e.preventDefault();
    e.stopPropagation();
    const t = now();
    const mark = { n: marks.length + 1, t, off: [...off], before: events.filter((x) => x.t >= t - 3000) };
    marks.push(mark);
    console.log(`flash-log: mark ${mark.n} at ${t}ms, ${mark.before.length} events in the 3s before`);
    console.table(mark.before.map((x) => ({ ago: `${t - x.t}ms`, kind: x.kind, what: x.what })));
  }, true);

  // Suspects to turn off, one stylesheet each.
  /** @type {Record<string, string>} */
  const suspects = {
    orbit: '#drip-lock .drip-orbit-spark, #drip-lock .drip-orbit-star { display: none !important; }',
    sea: '#drip-lock .drip-sea { display: none !important; }',
    blur: '#drip-lock { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }',
    mask: '#drip-lock { -webkit-mask: none !important; mask: none !important; clip-path: none !important; }',
    rings: '#drip-lock .drip-done-ring { display: none !important; }',
  };
  /** @type {Set<string>} */
  const off = new Set();
  /** @type {Map<string, HTMLStyleElement>} */
  const sheets = new Map();
  g.flashOff = (/** @type {string} */ k) => {
    if (!suspects[k]) return `flash-log: one of ${Object.keys(suspects).join(', ')}`;
    const s = document.createElement('style');
    s.textContent = suspects[k];
    document.head.append(s);
    sheets.set(k, s);
    off.add(k);
    log('suspect', `${k} off`);
    return `flash-log: ${k} off`;
  };
  g.flashOn = (/** @type {string} */ k) => {
    sheets.get(k)?.remove();
    sheets.delete(k);
    off.delete(k);
    log('suspect', `${k} on`);
    return `flash-log: ${k} on`;
  };
  g.flashReport = () => JSON.stringify({
    page: location.pathname, chrome: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0], recordedMs: now(), off: [...off], marks,
  }, null, 1);
  console.log('flash-log: recording. Press ` the moment you see a flash, then run copy(flashReport()).');
})();
