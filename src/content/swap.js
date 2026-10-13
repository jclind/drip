// @ts-check
// A full stash (Q28): the list that asks which video to swap out, the "Swapped out … · Undo" note after it, and a
// stashed video's progress (the thin bar and "6m left"). Shared by the home page's card (home.js), the watch page pill
// (watch.js), and search results (search.js). DESIGN.md, "The full stash as built", is the spec.
//
// A classic script that sets globalThis.DripSwap. It needs DripUI (common.js) and Drip (state.js).

(() => {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;
  /** @type {any} */
  const { h } = /** @type {any} */ (globalThis).DripUI;

  /**
   * Seconds in a length string like "8:31" or "1:02:03", or 0 when there's none.
   * @param {string} length
   */
  function lengthSec(length) {
    if (!/^\d+(:\d{1,2}){1,2}$/.test(length || '')) return 0;
    return length.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  }

  /** The video's length in seconds: the player's, or else the one read off the page. @param {any} video */
  function durationOf(video) {
    return video.durationSec || lengthSec(video.length);
  }

  /** How much is left to watch, in seconds. @param {any} video */
  function leftSec(video) {
    return Math.max(0, durationOf(video) - (video.resumeSec || 0));
  }

  /** How far in it got, 0 to 1, or 0 for a video not started or with no length. @param {any} video */
  function fraction(video) {
    const total = durationOf(video);
    return total && video.resumeSec ? Math.min(1, video.resumeSec / total) : 0;
  }

  /** The row's gray line: the channel, and the length, or what's left once it's started. @param {any} video */
  function meta(video) {
    const started = fraction(video) > 0;
    return [video.channel, started ? `${Drip.formatMinutes(leftSec(video))} left` : video.length].filter(Boolean).join(' · ');
  }

  /** The thin blue bar along a started video's row, or null. @param {any} video */
  function bar(video) {
    const at = fraction(video);
    return at > 0 ? h('span', { class: 'drip-stash-bar', style: `--drip-at: ${at.toFixed(3)}`, 'aria-hidden': 'true' }) : null;
  }

  /**
   * The full stash's list, oldest first: click one to swap it out for `video`. Escape, Cancel, or a click outside it
   * calls onClose. The caller puts it in the page and calls focusFirst() if it should take focus.
   * @param {{backlog: any[], onPick: (video: any) => void, onClose: () => void, now?: number}} o
   */
  function picker({ backlog, onPick, onClose, now = Date.now() }) {
    const title = `drip-swap-title-${++ids}`;
    const items = backlog.map((v) => h('li', {},
      h('button', {
        class: 'drip-swap-item', 'data-k': `swap-${v.id}`, title: `Swap out ${v.title || 'this video'}`,
        onclick: () => onPick(v),
      },
      h('span', { class: 'drip-swap-text' },
        h('span', { class: 'drip-swap-name' }, v.title || 'Untitled'),
        h('span', { class: 'drip-swap-meta' }, [Drip.stashedAgo(v.addedAt, now), meta(v)].filter(Boolean).join(' · '))),
      h('span', { class: 'drip-swap-go', 'aria-hidden': 'true' }, 'Swap out'),
      bar(v))));
    const el = h('div', {
      class: 'drip-swap drip-ui', role: 'dialog', 'aria-labelledby': title,
      onkeydown: (/** @type {KeyboardEvent} */ e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        onClose();
      },
    },
    h('div', { class: 'drip-swap-head' },
      h('div', { class: 'drip-swap-title', id: title }, 'Your stash is full'),
      h('div', { class: 'drip-swap-sub' }, 'Swap one out to stash this. Oldest first.')),
    h('ul', { class: 'drip-swap-list' }, ...items),
    h('div', { class: 'drip-swap-foot' },
      h('button', { class: 'drip-swap-cancel', 'data-k': 'swap-cancel', onclick: onClose }, 'Cancel')));
    open.add({ el, onClose });
    return Object.assign(el, {
      focusFirst: () => /** @type {HTMLElement | null} */ (el.querySelector('.drip-swap-item'))?.focus(),
    });
  }

  let ids = 0;
  /** Lists that are up, so a click anywhere else closes them. @type {Set<{el: HTMLElement, onClose: () => void}>} */
  const open = new Set();
  // A click on a Stash button (data-swap-anchor) is left to the button, which opens and closes its own list.
  document.addEventListener('pointerdown', (e) => {
    const target = /** @type {Element} */ (e.target);
    for (const entry of [...open]) {
      if (!entry.el.isConnected) {
        open.delete(entry);
        continue;
      }
      if (entry.el.contains(target) || target.closest?.('[data-swap-anchor]')) continue;
      open.delete(entry);
      entry.onClose();
    }
  }, true);

  /**
   * "Swapped out <title> · Undo", under the Stash button that swapped.
   * @param {any} video The one swapped out. @param {() => void} onUndo
   */
  function note(video, onUndo) {
    return h('div', { class: 'drip-swapped drip-ui', role: 'status' },
      h('span', {}, 'Swapped out'),
      h('span', { class: 'drip-swapped-name' }, video.title || 'a video'),
      h('span', { class: 'drip-sep', 'aria-hidden': 'true' }, '·'),
      h('button', { class: 'drip-undo', 'data-k': 'swap-undo', onclick: onUndo }, 'Undo'));
  }

  /** How long the note and its Undo stay, like a removed row's. */
  const UNDO_MS = 5000;

  /** @type {any} */ (globalThis).DripSwap = { picker, note, bar, meta, fraction, leftSec, lengthSec, UNDO_MS };
})();
