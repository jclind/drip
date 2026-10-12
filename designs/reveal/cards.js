// The dealt card from C, shared by D, E, and F: a face-down card that flies into the card's box, waits with a sheen,
// flips to show the video, and gets flipped back and tossed when it goes.

(() => {
  const { h, icon, animate } = Mock;

  function makeCard() {
    const front = h('div', { class: 'c-face c-front' });
    const back = h('div', { class: 'c-face c-back' }, icon('card'));
    const el = h('div', { class: 'c-card', 'aria-hidden': 'true' }, back, front);
    return { el, back, front };
  }

  /** Puts the card in the page's own layer over `thumb`'s box, so nothing clips it in flight. */
  function fly(api, card, thumb) {
    const root = api.root.getBoundingClientRect();
    const box = thumb.getBoundingClientRect();
    card.el.classList.add('is-flying');
    Object.assign(card.el.style, {
      left: `${box.left - root.left}px`, top: `${box.top - root.top}px`, width: `${box.width}px`, height: `${box.height}px`,
    });
    api.root.append(card.el);
    return { root, box };
  }

  /** The card arrives: it moves into the box itself and waits, face down, for the video. */
  function land(card, thumb) {
    card.el.getAnimations().forEach((a) => a.cancel());
    card.back.getAnimations().forEach((a) => a.cancel());
    card.back.querySelector('.drip-i').getAnimations().forEach((a) => a.cancel());
    card.el.classList.remove('is-flying');
    card.el.removeAttribute('style');
    thumb.append(card.el);
    thumb.classList.remove('c-empty');
    card.el.classList.add('is-waiting');
    return card;
  }

  /** Deals a face-down card from the counter's card icon into `thumb`. Resolves with the card when it lands. */
  async function deal(api, thumb) {
    const card = makeCard();
    const { box } = fly(api, card, thumb);
    const from = api.recIcon.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (box.left + box.width / 2);
    const dy = from.top + from.height / 2 - (box.top + box.height / 2);
    // Turned a quarter, a landscape box reads as the portrait card icon, so it starts at the icon's size.
    const k = from.height / box.width;
    // Fades go on the faces, never the card: opacity on the card flattens its 3D, and then the back shows through.
    animate(card.back, [{ opacity: 0 }, { opacity: 1 }], { duration: 60 });
    await animate(card.el, [
      { transform: `translate(${dx}px, ${dy}px) rotate(-78deg) scale(${k})` },
      { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 26}px) rotate(-24deg) scale(0.62)`, offset: 0.55 },
      { transform: 'translate(0, -3px) rotate(0.6deg) scale(1.02)', offset: 0.85 },
      { transform: 'none' },
    ], { duration: 640, easing: 'cubic-bezier(0.3, 0.6, 0.3, 1)' });
    return land(card, thumb);
  }

  /**
   * The button you pressed becomes the card: it lifts out of the row at `from` (a rect) in the button's color, and
   * grows into the face-down card in `thumb`'s box.
   */
  async function lift(api, thumb, from, color) {
    const card = makeCard();
    const { root, box } = fly(api, card, thumb);
    const backColor = getComputedStyle(card.back).backgroundColor;
    const backLine = getComputedStyle(card.back).boxShadow;
    const rect = (r, dy = 0) => ({ left: `${r.left - root.left}px`, top: `${r.top - root.top + dy}px`, width: `${r.width}px`, height: `${r.height}px` });
    const mark = card.back.querySelector('.drip-i');
    animate(mark, [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 0, offset: 0.45 }, { opacity: 1, transform: 'none' }], { duration: 640, easing: 'cubic-bezier(0.3, 0.6, 0.3, 1)' });
    animate(card.back, [
      { borderRadius: `${from.height / 2}px`, backgroundColor: color, boxShadow: 'inset 0 0 0 1.5px transparent' },
      { borderRadius: '12px', backgroundColor: backColor, boxShadow: backLine, offset: 0.7 },
      { borderRadius: '12px', backgroundColor: backColor, boxShadow: backLine },
    ], { duration: 640, easing: 'ease-out' });
    await animate(card.el, [
      rect(from),
      { ...rect(from, -10), offset: 0.18 },
      { ...rect(box, -4), offset: 0.8 },
      rect(box),
    ], { duration: 640, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
    return land(card, thumb);
  }

  /** Flips the card face up. */
  function flipUp(card) {
    card.el.classList.remove('is-waiting');
    return animate(card.el, [
      { transform: 'rotateY(0deg)' },
      { transform: 'rotateY(90deg) scale(1.05) translateY(-4px)', offset: 0.5 },
      { transform: 'rotateY(180deg)' },
    ], { duration: 560, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }).then(() => card.el.classList.add('is-up'));
  }

  /** Flips a face-up card face down, then tosses it: aside for Reveal next, straight down for Pass. */
  async function discard(card, toward) {
    card.el.classList.remove('is-up');
    await animate(card.el, [
      { transform: 'rotateY(180deg)' },
      { transform: 'rotateY(270deg) scale(1.03)', offset: 0.5 },
      { transform: 'rotateY(360deg)' },
    ], { duration: 420, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
    const out = toward === 'aside' ? 'translate(-44px, 14px) rotate(-7deg) scale(0.94)' : 'translateY(36px) scale(0.96)';
    animate(card.back, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-in' });
    await animate(card.el, [{ transform: 'rotateY(360deg)' }, { transform: `${out} rotateY(360deg)` }], { duration: 300, easing: 'ease-in' });
    card.el.remove();
  }

  globalThis.Cards = { deal, lift, flipUp, discard };
})();
