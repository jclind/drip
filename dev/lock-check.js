// @ts-check
// What's behind the lock on a YouTube watch page, and what moves there (Jesse, 2026-11-08: in incognito the page
// scrolls both ways under the lock, and the blurred background shifts every couple of seconds; not when signed in).
//
// 1. With the lock up on YouTube, open DevTools (Cmd+Option+I), Console. Paste this file (`pbcopy < dev/lock-check.js`
//    in drip's clone, in Terminal). Chrome may ask you to type `allow pasting` first.
// 2. Run `lockCheck()`, then close DevTools and don't touch the page for 20 seconds.
// 3. Open DevTools again. Once the console says "lock-check: done", run `copy(lockResult)` and paste the result to
//    Claude. Running it once signed in and once in incognito gives the comparison.

(() => {
  const g = /** @type {any} */ (globalThis);
  /** @param {Element | null} el */
  const name = (el) => {
    if (!el) return null;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`;
  };
  /** @param {Element | null} el */
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;
  };
  const inLock = (/** @type {Element} */ el) => !!el.closest('#drip-lock');

  /** Elements outside the lock that reach past the right edge of the window, widest first. */
  const tooWide = () => {
    const edge = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')]
      .filter((el) => !inLock(el))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.right > edge + 1)
      .sort((a, b) => b.r.right - a.r.right)
      .slice(0, 12)
      .map(({ el, r }) => ({ el: name(el), right: Math.round(r.right), width: Math.round(r.width), position: getComputedStyle(el).position }));
  };

  const snapshot = () => {
    const de = document.documentElement;
    const video = document.querySelector('#movie_player video.html5-main-video');
    return {
      url: location.pathname + location.search,
      signedIn: !!document.querySelector('ytd-topbar-menu-button-renderer #avatar-btn, #avatar-btn'),
      window: `${innerWidth}x${innerHeight}`,
      client: `${de.clientWidth}x${de.clientHeight}`,
      scroll: `${de.scrollWidth}x${de.scrollHeight}`,
      at: `${Math.round(scrollX)},${Math.round(scrollY)}`,
      htmlOverflow: getComputedStyle(de).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
      player: box(document.querySelector('#movie_player')),
      playerClasses: (document.querySelector('#movie_player')?.className || '').split(/\s+/).filter((c) => /ad|mode|cued|unstarted/.test(c)).join(' '),
      video: box(video),
      videoVisibility: video ? getComputedStyle(video).visibility : null,
      lock: name(document.querySelector('#drip-lock')),
      still: box(document.querySelector('#drip-lock .drip-frame')),
      stillVideo: /** @type {HTMLElement | null} */ (document.querySelector('#drip-lock .drip-frame'))?.dataset.video || null,
    };
  };

  g.lockCheck = (seconds = 20) => new Promise((resolve) => {
    const start = snapshot();
    const wide = tooWide();
    const t0 = performance.now();
    const at = () => Math.round(performance.now() - t0);
    /** @type {{ms: number, what: string}[]} */
    const changes = [];
    const note = (/** @type {string} */ what) => changes.length < 400 && changes.push({ ms: at(), what });

    // Positions and sizes, sampled four times a second.
    const watch = {
      at: () => `${Math.round(scrollX)},${Math.round(scrollY)}`,
      scrollSize: () => `${document.documentElement.scrollWidth}x${document.documentElement.scrollHeight}`,
      player: () => box(document.querySelector('#movie_player')),
      still: () => box(document.querySelector('#drip-lock .drip-frame')),
      video: () => box(document.querySelector('#movie_player video.html5-main-video')),
      primary: () => box(document.querySelector('#primary')),
      secondary: () => box(document.querySelector('#secondary')),
      playerClasses: () => (document.querySelector('#movie_player')?.className || '').split(/\s+/).filter((c) => /ad|mode|cued|unstarted/.test(c)).join(' '),
    };
    /** @type {Record<string, string | null>} */
    const last = {};
    for (const [k, f] of Object.entries(watch)) last[k] = f();
    const sample = setInterval(() => {
      for (const [k, f] of Object.entries(watch)) {
        const v = f();
        if (v !== last[k]) note(`${k}: ${last[k]} -> ${v}`);
        last[k] = v;
      }
    }, 250);

    // Media events from any video or audio, including ones YouTube swaps in.
    const media = ['emptied', 'loadstart', 'loadeddata', 'play', 'playing', 'pause', 'ended', 'resize'];
    const onMedia = (/** @type {Event} */ e) => note(`${e.type} on ${name(/** @type {Element} */ (e.target))}`);
    for (const t of media) document.addEventListener(t, onMedia, true);

    // Big things added or removed outside the lock: ads, banners, prompts.
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        for (const [verb, nodes] of /** @type {[string, NodeList][]} */ ([['added', m.addedNodes], ['removed', m.removedNodes]])) {
          for (const n of nodes) {
            if (n.nodeType !== 1) continue;
            const el = /** @type {Element} */ (n);
            if (inLock(el) || el.id === 'drip-lock') {
              if (el.classList?.contains('drip-frame')) note(`still ${verb}`);
              continue;
            }
            if (!el.isConnected && verb === 'added') continue;
            const r = el.isConnected ? el.getBoundingClientRect() : null;
            const big = r && r.width * r.height > 20000;
            if (big || /ad|promo|banner|companion|consent|sign/i.test(`${el.id} ${el.className} ${el.tagName}`)) note(`${verb} ${name(el)}${r ? ` ${box(el)}` : ''}`);
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', () => note(`scroll event, now ${Math.round(scrollX)},${Math.round(scrollY)}`), { passive: true, once: true });

    console.log(`lock-check: watching for ${seconds} seconds. Don't touch the page.`);
    setTimeout(() => {
      clearInterval(sample);
      mo.disconnect();
      for (const t of media) document.removeEventListener(t, onMedia, true);
      g.lockResult = JSON.stringify({ chrome: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0], start, wide, end: snapshot(), changes }, null, 1);
      console.log('lock-check: done. Run copy(lockResult) and paste it to Claude.');
      resolve('lock-check: done');
    }, seconds * 1000);
  });

  console.log('lock-check: loaded. Run lockCheck(), close DevTools, and leave the page alone for 20 seconds.');
})();
