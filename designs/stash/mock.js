// The stash-cap round: drip's home page, card, watch page pill, and search results, rebuilt with drip's real CSS,
// glass.js, and stash.js, with a full stash of 10. Scenes (?scene=):
//   home    the empty home page, stash open: the header and the progress bars
//   card    a card up and Stash clicked with the stash full: the swap picker
//   pill    the watch page pill, Stash clicked, stash full
//   search  a search result's Stash clicked, stash full
// Each variant (body data-variant) supplies the header, a row's progress, and the picker. ?theme=light drops html[dark].

(() => {
  const params = new URLSearchParams(location.search);
  const SCENE = params.get('scene') || 'home';
  if (params.get('theme') !== 'light') document.documentElement.setAttribute('dark', '');
  document.documentElement.setAttribute('data-drip-shown', '');
  const V = document.body.dataset.variant;

  /** @param {string} tag @param {Record<string, any>} [attrs] @param {...any} children */
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else if (key === 'class') el.className = value;
      else el.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) el.append(child);
    return el;
  }

  function icon(name, cls = '') {
    const el = h('span', { class: `drip-i drip-i-${name} ${cls}`.trim(), 'aria-hidden': 'true' });
    el.style.setProperty('--drip-icon', `url("/src/icons/${name}.svg")`);
    return el;
  }

  function price(token) {
    return h('span', { class: 'drip-price' },
      h('span', { class: 'drip-sep', 'aria-hidden': 'true' }, '·'),
      h('span', { 'aria-hidden': 'true' }, '-1'),
      icon(token, `drip-token-${token}`),
      h('span', { class: 'drip-sr' }, `, costs 1 ${token}`));
  }

  /** "14:21" or "1:04:12" to seconds. */
  const secs = (len) => len.split(':').map(Number).reduce((a, n) => a * 60 + n, 0);
  /** Seconds to "12:40" or "1:04:12". */
  function clock(s) {
    const hrs = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return hrs ? `${hrs}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }
  /** Seconds to drip's compact "21m" or "1h 4m". */
  function compact(s) {
    const m = Math.round(s / 60);
    if (m < 1) return '<1m';
    return m >= 60 ? (m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`) : `${m}m`;
  }

  // The stash, oldest first, as dev/home.html's stashFull scenario builds it. `at` is the fraction watched.
  const STASH = [
    { id: 'LXb3EKWsInQ', title: 'COSTA RICA IN 4K 60fps HDR (ULTRA HD)', channel: 'Jacob + Katie Schwarz', length: '5:14', at: 0, added: '6 days ago' },
    { id: 'M7lc1UVf-VE', title: 'Why bread goes stale', channel: 'Adam Ragusea', length: '9:58', at: 0.42, added: '6 days ago' },
    { id: 'ScMzIvxBSi4', title: 'A short film about a lighthouse keeper', channel: 'Vimeo Staff Picks', length: '1:04:12', at: 0, added: '5 days ago' },
    { id: 'YbJOTdZBX1g', title: 'The quiet math behind every train timetable', channel: 'Practical Engineering', length: '17:05', at: 0.9, added: '4 days ago' },
    { id: 'kJQP7kiw5Fk', title: 'How Japanese Joinery Works', channel: 'Woodworkers Journal', length: '12:40', at: 0, added: '4 days ago' },
    { id: '9bZkp7q19f0', title: '☆☆☆☆☆☆☆', channel: 'mai', length: '33:53', at: 0.12, added: '3 days ago' },
    { id: 'jNQXAC9IVRw', title: 'PLAY ME! じゃんけん (2000s liquid dnb mix for gaming and studying late at night)', channel: 'Noumena', length: '59:02', at: 0, added: '2 days ago' },
    { id: 'dQw4w9WgXcQ', title: 'Frontier AI doesn\'t need your help', channel: 'Less Bitter', length: '8:31', at: 0, added: 'Yesterday' },
    { id: 'OPf0YbXqDm0', title: 'Mark Ronson - Uptown Funk', channel: 'Mark Ronson', length: '4:30', at: 0.66, added: 'Yesterday' },
    { id: 'fJ9rUzIMcZQ', title: 'How a 1950s diner makes 400 pancakes before 9am', channel: 'Eater', length: '14:21', at: 0, added: 'Today' },
  ].map((v) => ({ ...v, dur: secs(v.length), pos: Math.round(secs(v.length) * v.at) }));
  const MAX = 10;
  const NEW = { id: 'aqz-KE-bpKQ', title: 'I Spent 30 Days Building a Cabin in the Woods With Only Hand Tools (Full Build)', channel: 'Rogi', length: '5:05' };
  const totalLeft = () => STASH.reduce((sum, v) => sum + v.dur - v.pos, 0);

  // ---- The three variants. Each has: head(), progress(v) for a home row, and picker(ctx) for a full stash.

  /** The row's meta line: channel and length, or what's left for a started video. */
  const metaText = (v, left = true) => `${v.channel} · ${v.pos && left ? `${compact(v.dur - v.pos)} left` : v.length}`;

  const VARIANTS = {
    // A, "Swap list": a popover under the button with the whole stash, oldest first. A thin bar under each row.
    a: {
      head: () => h('span', {}, `Stash · ${STASH.length} of ${MAX} · ${compact(totalLeft())}`),
      row: (v) => ({
        meta: metaText(v),
        extra: v.pos ? h('span', { class: 'mock-a-bar', style: `--at: ${v.at}` }) : null,
      }),
      picker(ctx) {
        const list = STASH.map((v) => h('li', {},
          h('button', { class: 'mock-a-item', onclick: () => ctx.swap(v) },
            h('span', { class: 'mock-a-text' },
              h('span', { class: 'mock-a-title' }, v.title),
              h('span', { class: 'mock-a-meta' }, `${v.added} · ${metaText(v)}`)),
            h('span', { class: 'mock-a-swap' }, 'Swap out'),
            v.pos ? h('span', { class: 'mock-a-bar', style: `--at: ${v.at}` }) : null)));
        return h('div', { class: `mock-tok mock-pop mock-a ${ctx.where}`, role: 'dialog', 'aria-label': 'Stash is full' },
          h('div', { class: 'mock-pop-head' },
            h('div', { class: 'mock-pop-title' }, 'Your stash is full'),
            h('div', { class: 'mock-pop-sub' }, 'Swap one out to stash this. Oldest first.')),
          h('ul', { class: 'mock-a-list' }, list),
          h('div', { class: 'mock-pop-foot' }, h('button', { class: 'drip-b drip-b-gray', onclick: ctx.close }, 'Cancel')));
      },
    },

    // B, "Ten slots": the header is ten bookmarks, the play icon fills with what's watched, and a full stash opens
    // the stash itself to pick from, with the new video waiting on top.
    b: {
      head: () => h('span', { class: 'mock-b-head' }, 'Stash',
        h('span', { class: 'mock-b-slots', title: `${STASH.length} of ${MAX}` },
          Array.from({ length: MAX }, (_, i) => h('span', { class: `mock-b-slot${i < STASH.length ? ' is-on' : ''}` }))),
        h('span', { class: 'mock-b-count' }, `${STASH.length} of ${MAX}`)),
      row: (v) => ({ meta: v.pos ? `${v.channel} · stopped at ${clock(v.pos)} of ${v.length}` : metaText(v), play: v.at }),
      picker(ctx) {
        const items = (ctx.where === 'is-home' ? STASH : STASH.slice(0, 4)).map((v) => h('li', { class: 'mock-b-item' },
          h('span', { class: 'mock-b-text' },
            h('span', { class: 'mock-b-title' }, v.title),
            h('span', { class: 'mock-b-meta' }, `Stashed ${v.added.toLowerCase()} · ${v.pos ? `${compact(v.dur - v.pos)} left` : v.length}`)),
          h('button', { class: 'drip-b drip-b-gray mock-b-let', onclick: () => ctx.swap(v) }, 'Let go')));
        return h('div', { class: `mock-tok mock-b ${ctx.where}`, role: 'dialog', 'aria-label': 'Make room in your stash' },
          h('div', { class: 'mock-b-waiting' },
            h('span', { class: 'mock-b-new' }, 'Waiting to go in'),
            h('span', { class: 'mock-b-newtitle' }, ctx.video.title)),
          h('div', { class: 'mock-b-ask' }, 'All 10 slots are taken. Let one go to make room.'),
          h('ul', { class: 'mock-b-list' }, items),
          h('div', { class: 'mock-b-foot' },
            ctx.where === 'is-home' ? null : h('span', { class: 'mock-b-more' }, 'Show all 10'),
            h('button', { class: 'drip-b drip-b-gray', onclick: ctx.close }, 'Keep things as they are')));
      },
    },

    // C, "Oldest out": one tap swaps out the oldest, with the choice of another one step away. The header gets a
    // filling line, and each row a small "resume at" chip.
    c: {
      head: () => h('span', { class: 'mock-c-head' },
        h('span', {}, `Stash · ${STASH.length} videos · ${compact(totalLeft())}`),
        h('span', { class: 'mock-c-line', style: `--at: ${STASH.length / MAX}` })),
      row: (v) => ({
        meta: metaText(v, false),
        chip: v.pos ? h('span', { class: 'mock-c-chip' }, h('span', { class: 'mock-c-mini', style: `--at: ${v.at}` }), `Resume ${clock(v.pos)}`) : null,
      }),
      picker(ctx) {
        const oldest = STASH[0];
        const box = h('div', { class: `mock-tok mock-c ${ctx.where}`, role: 'dialog', 'aria-label': 'Stash is full' });
        const others = h('ul', { class: 'mock-c-list', hidden: true }, STASH.slice(1).map((v) => h('li', {},
          h('button', { class: 'mock-c-item', onclick: () => ctx.swap(v) },
            h('span', { class: 'mock-c-title' }, v.title),
            h('span', { class: 'mock-c-meta' }, `${v.added} · ${v.pos ? `${compact(v.dur - v.pos)} left` : v.length}`)))));
        const pick = h('button', { class: 'mock-c-link', 'aria-expanded': 'false', onclick: () => {
          others.hidden = !others.hidden;
          pick.setAttribute('aria-expanded', String(!others.hidden));
          pick.lastChild.textContent = others.hidden ? 'Pick another' : 'Hide';
        } }, icon('chevron-down', 'mock-c-chev'), h('span', {}, 'Pick another'));
        if (params.get('open') === '1') queueMicrotask(() => pick.click());
        box.append(
          h('div', { class: 'mock-c-text' },
            h('span', { class: 'mock-c-q' }, 'Stash is full. Swap out the oldest?'),
            h('span', { class: 'mock-c-oldest' }, oldest.title),
            h('span', { class: 'mock-c-meta' }, `${oldest.added} · ${oldest.length} · never started`)),
          h('div', { class: 'mock-c-buttons' },
            h('button', { class: 'drip-b drip-b-primary', onclick: () => ctx.swap(oldest) }, 'Swap it out'),
            pick,
            h('button', { class: 'mock-c-link', onclick: ctx.close }, 'Cancel')),
          others);
        return box;
      },
    },
  };
  const variant = VARIANTS[V];

  // ---- Pieces of the real pages.

  function glass(px) {
    const g = DripGlass.make(DripGlass.fraction({ watchSecondsLeft: 34 * 60, watchSecondsBought: 60 * 60 }), px);
    return g;
  }

  function stats() {
    return h('div', { class: 'drip-stats' },
      h('div', { class: 'drip-glass-tile' }, glass(34)),
      h('div', { class: 'drip-time-block' }, h('div', { class: 'drip-time' }, '34m'), h('div', { class: 'drip-sub' }, 'left today')),
      h('div', { class: 'drip-counts', style: '--drip-room: 2' },
        h('div', { class: 'drip-count' }, icon('drop', 'drip-token-drop'), h('span', { class: 'drip-num' }, h('span', { class: 'drip-digit' }, '15'))),
        h('div', { class: 'drip-count' }, icon('card', 'drip-token-card'), h('span', { class: 'drip-num' }, h('span', { class: 'drip-digit' }, '12')))));
  }

  /** The play icon, or B's version that fills with what's been watched. */
  function play(at) {
    if (!at) return h('span', { class: 'drip-saved-play', 'aria-hidden': 'true' }, icon('play'));
    return h('span', { class: 'drip-saved-play mock-b-play', 'aria-hidden': 'true', style: `--at: ${at}` },
      icon('play', 'mock-b-play-base'), icon('play', 'mock-b-play-fill'));
  }

  function savedRow(v) {
    const r = variant.row(v);
    return h('li', { class: `drip-saved-row${r.extra ? ' mock-has-bar' : ''}` },
      h('a', { class: 'drip-saved-link', href: '#' },
        h('span', { class: 'drip-saved-title' }, v.title),
        h('span', { class: 'drip-saved-meta' }, r.meta, r.chip || null)),
      h('button', { class: 'drip-saved-x', title: 'Remove from stash' }, icon('x')),
      play(V === 'b' ? r.play : undefined),
      r.extra || null);
  }

  function savedList(open, rows) {
    return h('section', { class: `drip-saved${open ? ' is-open' : ''}` },
      h('button', { class: 'drip-saved-head', 'aria-expanded': String(open) }, icon('chevron-down', 'drip-chevron'), variant.head()),
      open ? h('ul', { class: 'drip-saved-list' }, rows) : null);
  }

  /** The note after a swap, with Undo, like a removed row's "Removed · Undo". */
  function swappedNote(v, cls = '') {
    return h('div', { class: `mock-swapped ${cls}`.trim(), role: 'status' },
      h('span', {}, 'Swapped out'), h('span', { class: 'mock-swapped-title' }, v.title),
      h('span', { class: 'drip-sep', 'aria-hidden': 'true' }, '·'), h('button', { class: 'mock-undo', onclick: () => location.reload() }, 'Undo'));
  }

  function homeScene() {
    const rows = [...STASH].reverse().map(savedRow);
    return h('div', { id: 'drip-home', class: 'drip-ui' },
      h('div', { class: 'drip-page' },
        stats(),
        h('div', { class: 'drip-actions' },
          h('button', { class: 'drip-b drip-b-gray drip-add' }, icon('clock'), h('span', {}, '+15m'), price('drop')),
          h('button', { class: 'drip-b drip-b-gold drip-reveal' }, h('span', {}, 'Reveal video'), price('card'))),
        savedList(true, rows)));
  }

  function cardScene() {
    const stash = DripStash.parts(false, { labelClass: 'drip-save-label' });
    const save = h('button', { class: 'drip-b drip-b-gray drip-card-save drip-stash', 'aria-pressed': 'false' }, stash.nodes);
    const actions = h('div', { class: 'drip-card-actions mock-anchor' }, save,
      h('button', { class: 'drip-b drip-b-gray drip-next' }, icon('arrow'), h('span', { class: 'drip-next-label' }, 'Reveal next'), price('card')),
      h('button', { class: 'drip-b drip-b-gray drip-pass', 'aria-label': 'Pass' }, icon('x')));
    const card = h('div', { class: 'drip-card' },
      h('a', { class: 'drip-thumb is-dealt', href: '#' },
        h('div', { class: 'drip-deal is-up' },
          h('div', { class: 'drip-deal-face drip-deal-back' }, icon('card')),
          h('div', { class: 'drip-deal-face drip-deal-front' }, h('img', { alt: '', src: `https://i.ytimg.com/vi/${NEW.id}/hq720.jpg`, class: 'is-loaded' })))),
      h('div', { class: 'drip-card-title' }, NEW.title),
      h('div', { class: 'drip-card-meta-row' }, h('span', { class: 'drip-meta' }, `${NEW.channel} · ${NEW.length}`),
        h('button', { class: 'drip-b drip-b-primary drip-watch' }, icon('play'), h('span', {}, 'Watch'))),
      actions);
    const rows = [...STASH].reverse().map(savedRow);
    // B opens the stash list itself to pick from. The others float a picker under the button.
    const saved = savedList(false, rows);
    const page = h('div', { class: 'drip-page is-open' }, stats(), card, saved);
    const root = h('div', { id: 'drip-home', class: 'drip-ui' }, page);
    wire(save, stash, V === 'b' ? { where: 'is-home', mount: (el) => saved.replaceWith(el), unmount: (el) => el.replaceWith(saved) }
      : { where: 'is-card', mount: (el) => actions.append(el), unmount: (el) => el.remove() }, actions);
    return root;
  }

  function pillScene() {
    const stash = DripStash.parts(false, { outline: true });
    const save = h('button', { class: 'drip-pill-save drip-stash', 'aria-pressed': 'false' }, stash.nodes);
    const pill = h('div', { id: 'drip-pill', class: 'drip-ui' },
      h('span', { class: 'drip-pill-time' }, glass(20), h('span', { class: 'drip-pill-label' }, h('span', { class: 'drip-pill-minutes' }, '34m'))),
      save);
    const layer = h('div', { class: 'drip-ui mock-pill-layer' });
    const player = h('div', { class: 'mock-player' },
      h('img', { alt: '', src: `https://i.ytimg.com/vi/${NEW.id}/maxresdefault.jpg` }),
      h('div', { class: 'mock-player-bar' }, h('span', { style: 'width: 22%' })),
      pill, layer);
    wire(save, stash, { where: 'is-pill', mount: (el) => layer.append(el), unmount: (el) => el.remove() }, layer);
    return h('div', { class: 'mock-watch' }, player,
      h('h1', { class: 'mock-watch-title' }, NEW.title),
      h('div', { class: 'mock-watch-channel' }, NEW.channel));
  }

  function searchScene() {
    const results = [
      NEW,
      { id: 'ktvTqknDobU', title: 'Imagine Dragons - Radioactive', channel: 'ImagineDragonsVEVO', length: '3:09' },
    ];
    const rows = results.map((v, i) => {
      const button = h('button', { class: 'drip-btn drip-save' }, 'Stash');
      const slot = h('div', { class: 'drip-save-row drip-ui mock-anchor' }, button);
      const row = h('div', { class: 'mock-result' },
        h('div', { class: 'mock-result-thumb' }, h('img', { alt: '', src: `https://i.ytimg.com/vi/${v.id}/hq720.jpg` }), h('span', { class: 'mock-len' }, v.length)),
        h('div', { class: 'mock-result-meta' },
          h('div', { class: 'mock-result-title' }, v.title),
          h('div', { class: 'mock-result-sub' }, `${v.channel} · ${i ? '1.9B views · 13 years ago' : '2.1M views · 1 year ago'}`),
          slot));
      if (i === 0) wire(button, null, { where: 'is-search', mount: (el) => slot.append(el), unmount: (el) => el.remove() }, slot);
      return row;
    });
    return h('div', { class: 'mock-search' }, h('div', { class: 'mock-query' }, icon('search'), 'hand tool cabin build'), rows);
  }

  /**
   * Clicking Stash with a full stash opens the variant's picker. Picking a video swaps it out: the picker closes, the
   * button fills as Stashed, and a note offers Undo.
   */
  function wire(button, stash, place, noteHost) {
    let open = null;
    const ctx = {
      where: place.where,
      video: NEW,
      close: () => { if (open) place.unmount(open); open = null; button.focus(); },
      swap: (v) => {
        ctx.close();
        if (stash) stash.to(true);
        else { button.textContent = 'Stashed'; button.disabled = true; }
        button.classList.add('is-saved');
        button.setAttribute('aria-pressed', 'true');
        noteHost.append(swappedNote(v, place.where));
      },
    };
    button.addEventListener('click', () => {
      if (open) return ctx.close();
      open = variant.picker(ctx);
      place.mount(open);
    });
    if (params.get('closed') !== '1') queueMicrotask(() => button.click());
  }

  const scenes = { home: homeScene, card: cardScene, pill: pillScene, search: searchScene };
  document.body.append(h('div', { class: `mock-frame mock-scene-${SCENE}` }, h('div', { class: 'mock-masthead' }), (scenes[SCENE] || homeScene)()));
})();
