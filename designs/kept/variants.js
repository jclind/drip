// The kept round's variants: what the home page shows for the drops "Done for now" left unspent, in place of today's
// gray "Kept 3 drops." under the buttons. Each one comes in as the lock's water falls away, stays a few seconds, and
// goes, leaving the page as it always is. base.js calls land() once the water starts falling.

(() => {
  const { api } = globalThis.Mock;
  const { h, wait, animate } = api;

  function squash(icon) {
    return animate(icon, [
      { transform: 'none' },
      { transform: 'translateY(2px) scale(1.25, 0.78)', offset: 0.3 },
      { transform: 'translateY(-2px) scale(0.92, 1.1)', offset: 0.62 },
      { transform: 'none' },
    ], { duration: 420, easing: 'ease-out', fill: 'none' });
  }

  const drop = (cls) => h('img', { class: cls, src: 'icons/drop.svg', alt: '' });

  /**
   * A tag slides out of the drop counter, sits beside it, and slides back in. `cls` styles it, `withDrop` puts a drop in
   * front of the words.
   */
  async function slideTag(ctx, cls, withDrop, words = '3 kept') {
    const tag = h('span', { class: `mock-tag ${cls}`, role: 'status' }, withDrop && drop('mock-tag-drop'), h('span', {}, words), h('span', { class: 'drip-sr' }, '. Kept 3 drops.'));
    ctx.drop.count.classList.add('mock-has-tag');
    ctx.drop.count.append(tag);
    await wait(450);
    await animate(tag, [
      { clipPath: 'inset(0 100% 0 0 round 12px)', transform: 'translate(-10px, -50%)', opacity: 0 },
      { clipPath: 'inset(-2px -2px -2px -10px round 12px)', transform: 'translate(0, -50%)', opacity: 1 },
    ], { duration: 420, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' });
    squash(ctx.drop.icon);
    await wait(3500);
    await animate(tag, [
      { clipPath: 'inset(-2px -2px -2px -10px round 12px)', transform: 'translate(0, -50%)', opacity: 1 },
      { clipPath: 'inset(0 100% 0 0 round 12px)', transform: 'translate(-14px, -50%)', opacity: 0 },
    ], { duration: 360, easing: 'cubic-bezier(0.5, 0, 0.75, 0.3)' });
    tag.remove();
    squash(ctx.drop.icon);
  }

  // D, Gray tag: A's tag in drip's gray chip with ordinary text, so the drop is the only blue, and a small point toward
  // the counter it belongs to.
  const D = { instant: true, land: (_, ctx) => slideTag(ctx, 'is-gray', true) };

  // E, Just the word: no tag at all. "kept" slides out from behind the counter's own number, in gray, so the counter
  // reads "3 kept" for a few seconds.
  const E = { instant: true, land: (_, ctx) => slideTag(ctx, 'is-word', false, 'kept') };

  // F, Badge: a solid blue badge with dark text and no drop, like a notification count, "+3 kept".
  const F = { instant: true, land: (_, ctx) => slideTag(ctx, 'is-badge', false, '3 kept') };

  // A, Tag: a small blue tag slides out of the drop counter, "3 kept", sits beside it, and slides back in.
  const A = {
    instant: true,
    async land(_, ctx) {
      const tag = h('span', { class: 'mock-tag', role: 'status' }, drop('mock-tag-drop'), h('span', {}, '3 kept'), h('span', { class: 'drip-sr' }, '. Kept 3 drops.'));
      ctx.drop.count.classList.add('mock-has-tag');
      ctx.drop.count.append(tag);
      await wait(450);
      await animate(tag, [
        { clipPath: 'inset(0 100% 0 0 round 12px)', transform: 'translate(-10px, -50%)', opacity: 0 },
        { clipPath: 'inset(0 0 0 0 round 12px)', transform: 'translate(0, -50%)', opacity: 1 },
      ], { duration: 420, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' });
      squash(ctx.drop.icon);
      await wait(3500);
      await animate(tag, [
        { clipPath: 'inset(0 0 0 0 round 12px)', transform: 'translate(0, -50%)', opacity: 1 },
        { clipPath: 'inset(0 100% 0 0 round 12px)', transform: 'translate(-14px, -50%)', opacity: 0 },
      ], { duration: 360, easing: 'cubic-bezier(0.5, 0, 0.75, 0.3)' });
      tag.remove();
      squash(ctx.drop.icon);
    },
  };

  // B, Note above: two lines float up over the stats as the water leaves, with a short wave drawn under them, the
  // lock's crest left behind. They lift away after a few seconds.
  const B = {
    instant: true,
    async land(_, ctx) {
      const wave = h('span', { class: 'mock-note-wave' });
      wave.innerHTML = '<svg viewBox="0 0 72 8" width="72" height="8" aria-hidden="true"><path d="M1 4C7 1 13 1 19 4S31 7 37 4 49 1 55 4 67 7 71 4" fill="none" stroke="#42a5f6" stroke-width="1.6" stroke-linecap="round" pathLength="1"/></svg>';
      const note = h('div', { class: 'mock-note', role: 'status' },
        h('div', { class: 'mock-note-title' }, drop('mock-note-drop'), 'Kept 3 drops.'),
        h('div', { class: 'mock-note-sub' }, 'Unspent drops carry over to tomorrow.'),
        wave);
      ctx.page.querySelector('.drip-stats').append(note);
      await wait(250);
      const path = wave.querySelector('path');
      animate(path, [{ strokeDasharray: '1', strokeDashoffset: '1' }, { strokeDasharray: '1', strokeDashoffset: '0' }], { duration: 800, delay: 250, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' });
      await animate(note, [
        { transform: 'translate(-50%, 10px)', opacity: 0 },
        { transform: 'translate(-50%, 0)', opacity: 1 },
      ], { duration: 560, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' });
      await wait(4000);
      await animate(note, [
        { transform: 'translate(-50%, 0)', opacity: 1 },
        { transform: 'translate(-50%, -8px)', opacity: 0 },
      ], { duration: 420, easing: 'ease-in' });
      note.remove();
    },
  };

  // C, Big count: the stats step back and a large "3, drops kept" takes their place for a moment. Then the 3 shrinks
  // into the drop counter's number and the stats come back.
  const C = {
    instant: true,
    async land(_, ctx) {
      const stats = ctx.page.querySelector('.drip-stats');
      const parts = [...stats.children];
      const big = h('span', { class: 'mock-big-num' }, '3');
      const card = h('div', { class: 'mock-big', role: 'status' },
        h('div', { class: 'mock-big-row' }, drop('mock-big-drop'), big),
        h('div', { class: 'mock-big-sub' }, 'drops kept'));
      stats.append(card);
      const dim = (from, to, ms) => Promise.all(parts.map((p) => animate(p, [{ opacity: from }, { opacity: to }], { duration: ms, easing: 'ease-out' })));
      await wait(200);
      dim(1, 0.1, 360);
      await animate(card, [
        { transform: 'translate(-50%, -50%) scale(0.8)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.04)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      ], { duration: 460, easing: 'ease-out' });
      await wait(2200);
      // The big 3 flies into the counter's 3; the rest of the card fades.
      const from = big.getBoundingClientRect();
      const to = ctx.drop.num.getBoundingClientRect();
      const ghost = h('span', { class: 'mock-big-num mock-big-ghost' }, '3');
      api.fx.append(ghost);
      Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
      big.style.visibility = 'hidden';
      animate(card, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in' });
      dim(0.1, 1, 520);
      const s = to.height / from.height;
      await animate(ghost, [
        { transform: 'none', opacity: 1 },
        { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${s})`, opacity: 1 },
      ], { duration: 520, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' });
      ghost.remove();
      card.remove();
      parts.forEach((p) => p.getAnimations().forEach((a) => a.cancel()));
      squash(ctx.drop.icon);
    },
  };

  // As built: the gray line under the buttons rises in and stays.
  const now = {
    instant: true,
    async land(_, ctx) {
      ctx.showMessage('Kept 3 drops.');
    },
  };

  globalThis.Variants = { a: A, b: B, c: C, d: D, e: E, f: F, now };
})();
