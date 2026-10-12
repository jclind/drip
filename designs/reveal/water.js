// The water in the card's box, shared by A and B: a drop falling in, rings while the video loads, the picture opening
// out from the center, and closing back to a point when it goes.

(() => {
  const { h, animate, wait, REDUCED } = Mock;
  const EASE_OUT = 'cubic-bezier(0.2, 0.7, 0.2, 1)';

  /** A ring from the center of the box, `to` px wide when it fades out. */
  function ring(fx, to, ms, opacity = 0.85) {
    if (REDUCED) return;
    const r = h('span', { class: 'w-ring' });
    fx.append(r);
    animate(r, [{ width: '0px', opacity }, { width: `${to}px`, opacity: 0 }], { duration: ms, easing: EASE_OUT }).then(() => r.remove());
  }

  /** A ring that closes in on the center, for a picture going under. */
  function closingRing(fx, from, ms) {
    if (REDUCED) return;
    const r = h('span', { class: 'w-ring' });
    fx.append(r);
    animate(r, [{ width: `${from}px`, opacity: 0 }, { opacity: 0.7, offset: 0.4 }, { width: '0px', opacity: 0 }], { duration: ms, easing: 'ease-in' }).then(() => r.remove());
  }

  /** The water layer for a box. It moves with the picture when the card is rebuilt. */
  function layer(thumb) {
    const fx = thumb.querySelector('.w-fx') || h('div', { class: 'w-fx' });
    thumb.append(fx);
    thumb.classList.add('w-pool');
    return fx;
  }

  /**
   * Starts the rings once `landed` resolves. They keep coming, one every 0.9s, until stop().
   * @param {HTMLElement} fx
   * @param {Promise<unknown>} landed
   */
  function rings(fx, landed) {
    let going = !REDUCED;
    landed.then(async () => {
      if (!going) return;
      ring(fx, 120, 1200);
      await wait(180);
      if (going) ring(fx, 70, 900, 0.6);
      while (going) {
        await wait(900);
        if (going) ring(fx, 180, 1500, 0.55);
      }
    });
    return { landed, stop() { going = false; } };
  }

  /** A drop falls `fall` px into the middle of the box, then the rings start. */
  function dropIn(fx, fall = 140) {
    if (REDUCED) return rings(fx, Promise.resolve());
    const drop = h('span', { class: 'w-drop' });
    fx.append(drop);
    const landed = animate(drop, [
      { transform: `translateY(${-fall}px) scaleY(1.15)`, opacity: 0 },
      { opacity: 1, offset: 0.2 },
      { transform: 'translateY(0) scaleY(1.15)', opacity: 1, offset: 0.92 },
      { transform: 'translateY(2px) scale(0.2, 0.1)', opacity: 0 },
    ], { duration: 420, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)' }).then(() => drop.remove());
    return rings(fx, landed);
  }

  /** The loaded picture opens out from the center as one last wide ring goes. */
  async function open(thumb, img) {
    const fx = layer(thumb);
    img.classList.add('w-img', 'is-loaded');
    ring(fx, 520, 900, 0.9);
    await animate(img, [
      { clipPath: 'circle(0% at 50% 50%)', transform: 'scale(1.08)', filter: 'brightness(0.55)' },
      { clipPath: 'circle(75% at 50% 50%)', transform: 'scale(1)', filter: 'brightness(1)' },
    ], { duration: 700, easing: EASE_OUT });
    // Hand the image back to drip.css, so its hover zoom works again.
    img.getAnimations().forEach((a) => a.cancel());
    thumb.classList.remove('w-pool');
  }

  /** The picture closes to a point: the video goes under. Returns the water layer, for the next drop. */
  async function sink(thumb, img) {
    const fx = layer(thumb);
    closingRing(fx, 300, 520);
    await animate(img, [
      { clipPath: 'circle(75% at 50% 50%)', filter: 'brightness(1)' },
      { clipPath: 'circle(0% at 50% 50%)', filter: 'brightness(0.55)' },
    ], { duration: 460, easing: 'cubic-bezier(0.5, 0, 0.8, 0.4)' });
    return fx;
  }

  /** Fades elements in with a small rise, one after another. */
  function textIn(els, delay = 260) {
    els.forEach((el, i) => animate(el, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: delay + i * 90, easing: EASE_OUT }));
  }

  function fadeOut(els, ms = 220) {
    return Promise.all(els.map((el) => animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: ms })));
  }

  globalThis.Water = { ring, rings, layer, dropIn, open, sink, textIn, fadeOut, EASE_OUT };
})();
