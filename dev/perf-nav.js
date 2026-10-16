// @ts-check
// Paste into the DevTools console on a YouTube tab, then run `await dripNav(50)`. It moves between the home page and
// five watch pages through YouTube's own in-page navigation, one move every 1.5 seconds, so nothing reloads and a
// heap snapshot after it shows what the moves left behind. It prints the JS heap and the page's element count at the
// start, halfway, and the end. Checked on air's Chrome, 2026-10-16. Used by test/PERF.md, check 3.

/** @param {string} url @returns {Promise<boolean>} Whether YouTube finished the move within 10 seconds. */
function dripGo(url) {
  return new Promise((resolve) => {
    const done = () => resolve(true);
    document.addEventListener('yt-navigate-finish', done, { once: true });
    const watch = url.startsWith('/watch');
    const id = watch ? new URL(url, location.origin).searchParams.get('v') : null;
    // The same event a click on one of YouTube's own links sends.
    document.querySelector('ytd-app')?.dispatchEvent(new CustomEvent('yt-navigate', {
      bubbles: true,
      detail: {
        endpoint: {
          commandMetadata: { webCommandMetadata: { url, webPageType: watch ? 'WEB_PAGE_TYPE_WATCH' : 'WEB_PAGE_TYPE_BROWSE', rootVe: watch ? 3832 : 3854 } },
          ...(watch ? { watchEndpoint: { videoId: id } } : { browseEndpoint: { browseId: 'FEwhat_to_watch' } }),
        },
      },
    }));
    // A move that times out takes its listener with it, so its late finish can't end the next move early.
    setTimeout(() => {
      document.removeEventListener('yt-navigate-finish', done);
      resolve(false);
    }, 10000);
  });
}

/** @param {number} n How many moves, alternating a watch page and home. An even n ends on home. */
async function dripNav(n) {
  const ids = ['wvFT4MgEJFA', 'lAVvhpGkovk', 'dQw4w9WgXcQ', 'jNQXAC9IVRw', '9bZkp7q19f0'];
  // performance.memory is Chrome only, and rounded unless Chrome runs with --enable-precise-memory-info.
  const snap = () => ({
    heapMB: Math.round(/** @type {any} */ (performance).memory.usedJSHeapSize / 1e5) / 10,
    elements: document.getElementsByTagName('*').length,
  });
  const out = { start: snap(), mid: snap(), end: snap(), missed: 0 };
  for (let i = 0; i < n; i++) {
    const url = i % 2 === 0 ? `/watch?v=${ids[(i / 2) % ids.length]}` : '/';
    if (!(await dripGo(url))) out.missed++;
    await new Promise((r) => setTimeout(r, 1500));
    if (i === Math.floor(n / 2) - 1) out.mid = snap();
  }
  out.end = snap();
  console.table({ start: out.start, mid: out.mid, end: out.end });
  console.log(`missed moves: ${out.missed}`);
  return out;
}
