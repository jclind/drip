// Round 2: C's dealt card in B's opening page. Each variant page calls Dealt.run with where the card comes from
// ('counter', as in C, or 'button', the button you pressed) and how the buttons turn ('goo', 'split', or 'crisp').

(() => {
  const { app, animate, wait, REDUCED } = Mock;
  const EASE_OUT = 'cubic-bezier(0.2, 0.7, 0.2, 1)';

  function run({ source, style }) {
    let ctx = null;
    let current = null;
    let dealt = null;

    /** The count drops as the card leaves it, before the feed answers. */
    function spendShown(api) {
      api.recNum.textContent = String(api.state.rec - 1);
    }

    function fadeTexts(card) {
      animate(card.title, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 });
      animate(card.metaRow, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 });
    }

    /**
     * Builds the real card for `video` around the landed card, its text held, and flips it once the picture has
     * loaded and the space is open. The thumbnail starts loading at once, and the flip doesn't wait for the buttons
     * to finish turning (`formed`). After Reveal next the buttons wait dimmed; after the first reveal they just formed,
     * so they stay bright.
     */
    async function show(api, video, landing, dim, opened = Promise.resolve(), formed = Promise.resolve()) {
      const card = api.card(video);
      card.thumb.classList.add('c-stage');
      card.img.classList.add('is-loaded');
      const held = [card.title, card.metaRow];
      held.forEach((el) => el.classList.add('w-hold'));
      if (dim) for (const b of card.row.querySelectorAll('button')) b.disabled = true;
      ctx.wrap.style.pointerEvents = 'none';
      const loaded = api.loadThumb(card.img, video);
      const [placed] = await Promise.all([landing, opened]);
      placed.front.append(card.img);
      card.thumb.append(placed.el);
      Opening.placeBody(ctx, card);
      current = card;
      dealt = placed;
      const rowIn = formed.then(() => Opening.placeRow(ctx, card));
      await loaded;
      const flipped = Cards.flipUp(placed);
      held.forEach((el) => el.classList.remove('w-hold'));
      held.forEach((el, i) => animate(el, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 240 + i * 90, easing: EASE_OUT }));
      await Promise.all([flipped, rowIn]);
      for (const b of card.row.querySelectorAll('button')) b.disabled = false;
      ctx.wrap.style.pointerEvents = '';
    }

    app({
      async reveal(api) {
        ctx = Opening.open(api);
        spendShown(api);
        const landing = source === 'button'
          ? Cards.lift(api, ctx.shell.thumb, ctx.revRect, ctx.e.gold)
          : Cards.deal(api, ctx.shell.thumb);
        const formed = Opening.form(ctx, style);
        await show(api, await api.feed(), landing, false, ctx.opened, formed);
      },
      async next(api) {
        const from = current.next.getBoundingClientRect();
        const color = getComputedStyle(current.next).backgroundColor;
        current.next.querySelector('.drip-next-label').textContent = 'Revealing…';
        current.next.querySelector('.drip-price').remove();
        for (const b of current.row.querySelectorAll('button')) b.disabled = true;
        fadeTexts(current);
        const tossed = Cards.discard(dealt, 'aside');
        await wait(REDUCED ? 0 : 520);
        spendShown(api);
        const landing = source === 'button' ? Cards.lift(api, current.thumb, from, color) : Cards.deal(api, current.thumb);
        const video = await api.feed();
        await tossed;
        await show(api, video, landing, true);
      },
      async pass(api) {
        for (const b of current.row.querySelectorAll('button')) b.disabled = true;
        fadeTexts(current);
        await Cards.discard(dealt, 'down');
        await Opening.close(ctx, current, style);
        current = null;
        dealt = null;
      },
    });
  }

  globalThis.Dealt = { run };
})();
