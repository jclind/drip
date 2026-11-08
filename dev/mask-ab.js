// @ts-check
// Tests whether the lock's resting mask and clip-path cause the overlay to drop for a frame (Jesse, 2026-11-07). Since
// 21a364a drip takes them off once the water is up (#drip-lock.is-full). This switches between that and the old resting
// state in blocks of visible time, without saying which block is which, and counts the flashes you mark in each.
//
// 1. Open drip's welcome page and go to the tour's lock step. Wait for the water to finish rising.
// 2. DevTools (Cmd+Option+I), Console. Paste this file (`pbcopy < dev/mask-ab.js` in drip's clone, in Terminal).
//    Chrome may ask you to type `allow pasting` first.
// 3. Run maskAB() for the two-way test, or maskAB({ split: true }) to also test mask only, clip only, and no blur.
//    maskAB({ minutes: 3 }) changes the block length (default 5).
// 4. Close DevTools. Use the computer as you did when the flashes happened, switching windows and monitors now and
//    then. Press ` (backquote, left of 1) the moment you see a flash. A small box in the bottom left shows the block and
//    the count. Time only counts while the tab is visible.
// 5. After several rounds (the box says when every condition has had two blocks), run copy(maskReport()) and paste it
//    to Claude. maskStop() ends the test and puts the lock back the way drip has it.

(() => {
  const g = /** @type {any} */ (globalThis);
  if (g.maskAB) return console.log('mask-ab: already loaded. Run maskAB() to start.');

  /** @type {Record<string, (lock: HTMLElement) => void>} */
  const CONDITIONS = {
    // The old resting state: mask and clip stay on over the blur.
    original: (l) => {
      l.classList.remove('is-full');
    },
    // What drip does now: both off.
    fixed: (l) => {
      l.style.setProperty('-webkit-mask', 'none');
      l.style.setProperty('mask', 'none');
      l.style.setProperty('clip-path', 'none');
    },
    'mask only': (l) => {
      l.classList.remove('is-full');
      l.style.setProperty('clip-path', 'none');
    },
    'clip only': (l) => {
      l.classList.remove('is-full');
      l.style.setProperty('-webkit-mask', 'none');
      l.style.setProperty('mask', 'none');
    },
    'no blur': (l) => {
      l.classList.remove('is-full');
      l.style.setProperty('-webkit-backdrop-filter', 'none');
      l.style.setProperty('backdrop-filter', 'none');
    },
  };
  const PROPS = ['-webkit-mask', 'mask', 'clip-path', '-webkit-backdrop-filter', 'backdrop-filter'];

  /** @type {{condition: string, visibleS: number, flashes: number[], switches: number}[]} */
  let blocks = [];
  /** @type {string[]} */
  let order = [];
  let blockS = 300;
  let tick = 0;
  /** @type {MutationObserver | null} */
  let watcher = null;
  /** @type {HTMLElement | null} */
  let box = null;

  const current = () => blocks[blocks.length - 1];
  const lock = () => /** @type {HTMLElement | null} */ (document.querySelector('#drip-lock'));
  const resting = (/** @type {HTMLElement} */ l) => !l.classList.contains('is-draining') && !l.classList.contains('is-surfacing');

  /**
   * Puts the current block's condition on the lock, and clears it while the lock drains or surfaces. It works out the
   * end state first and changes only what differs, so it doesn't restyle the lock when nothing needs it.
   */
  const apply = () => {
    const l = lock();
    if (!l || !blocks.length) return;
    watcher?.disconnect();
    // A rise that hasn't finished keeps its animation; is-full comes from common.js when it ends.
    const risen = l.getAnimations().every((a) => !/water-rise$/.test(/** @type {any} */ (a).animationName || ''));
    const scratch = document.createElement('div');
    scratch.className = l.className;
    if (resting(l) && risen) CONDITIONS[current().condition](scratch);
    if (scratch.className !== l.className) l.className = scratch.className;
    for (const p of PROPS) {
      const want = scratch.style.getPropertyValue(p);
      if (l.style.getPropertyValue(p) === want) continue;
      if (want) l.style.setProperty(p, want);
      else l.style.removeProperty(p);
    }
    watcher?.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  };
  /** Only the lock itself coming, going, or changing class matters, not the orbit's sparks inside it. */
  const touchesLock = (/** @type {MutationRecord[]} */ list) => list.some((m) => (m.type === 'attributes'
    ? /** @type {Element} */ (m.target).id === 'drip-lock'
    : [...m.addedNodes].some((n) => /** @type {Element} */ (n).id === 'drip-lock')));

  const show = () => {
    if (!box) return;
    const b = current();
    const left = Math.max(0, blockS - b.visibleS);
    const done = order.every((c) => blocks.filter((x) => x.condition === c && x.visibleS >= blockS).length >= 2);
    box.textContent = `Block ${blocks.length}, ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left, `
      + `${b.flashes.length} marked here${document.hidden ? ', paused (tab hidden)' : ''}`
      + (done ? '. Every condition has had 2 blocks: run copy(maskReport())' : '');
  };

  const next = () => {
    // Cycles the conditions, starting from a random one, so the order says nothing.
    const i = blocks.length ? (order.indexOf(current().condition) + 1) % order.length : Math.floor(Math.random() * order.length);
    blocks.push({ condition: order[i], visibleS: 0, flashes: [], switches: 0 });
    apply();
    show();
  };

  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.key !== '`' || !blocks.length) return;
    e.preventDefault();
    e.stopPropagation();
    current().flashes.push(current().visibleS);
    show();
  };
  const onFocus = () => {
    if (blocks.length) current().switches++;
  };

  /** @param {{split?: boolean, minutes?: number}} [opts] */
  g.maskAB = (opts = {}) => {
    g.maskStop?.(true);
    order = opts.split ? Object.keys(CONDITIONS) : ['original', 'fixed'];
    blockS = Math.round((opts.minutes || 5) * 60);
    blocks = [];
    watcher = new MutationObserver((list) => {
      if (touchesLock(list)) apply();
    });
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;padding:4px 8px;border-radius:4px;'
      + 'background:#222;color:#eee;font:12px/1.4 system-ui;pointer-events:none';
    document.body.append(box);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('focus', onFocus);
    tick = setInterval(() => {
      if (!document.hidden) current().visibleS++;
      if (current().visibleS >= blockS) next();
      else show();
    }, 1000);
    next();
    return `mask-ab: ${order.length} conditions, ${blockS / 60} minute blocks. Press \` on a flash.`;
  };

  g.maskStop = (/** @type {boolean} */ quiet) => {
    clearInterval(tick);
    watcher?.disconnect();
    watcher = null;
    box?.remove();
    box = null;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('focus', onFocus);
    const l = lock();
    if (l) {
      for (const p of PROPS) l.style.removeProperty(p);
      if (resting(l)) l.classList.add('is-full');
    }
    if (!quiet) return 'mask-ab: stopped. The lock is back to how drip has it.';
  };

  g.maskReport = () => {
    const rows = order.map((c) => {
      const mine = blocks.filter((b) => b.condition === c);
      const minutes = mine.reduce((n, b) => n + b.visibleS, 0) / 60;
      const flashes = mine.reduce((n, b) => n + b.flashes.length, 0);
      return { condition: c, blocks: mine.length, visibleMin: +minutes.toFixed(1), flashes, perTenMin: minutes ? +((flashes / minutes) * 10).toFixed(2) : 0, windowSwitches: mine.reduce((n, b) => n + b.switches, 0) };
    });
    console.table(rows);
    return JSON.stringify({ page: location.pathname, chrome: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0], dpr: devicePixelRatio, screen: `${screen.width}x${screen.height}`, blockMin: blockS / 60, rows, blocks }, null, 1);
  };

  console.log('mask-ab: loaded. Run maskAB() or maskAB({ split: true }).');
})();
