// @ts-check
// Tour player, round 1. welcome.js on this branch calls DripScene.make(video, { under }) for each player and feeds the
// scene every tick. ?v= picks the variant:
//   A, Sinking boat: a small sea at dusk. The sea creeps up as the minutes drain, the boat lists, and at 0 it sinks
//      just before the lock's water rises.
//   B, Drops leave the glass: each minute watched falls out of the pill's glass and pools at the bottom of the player.
//   C, The video you picked: a short loop for the card watched in step 2, at 90× speed with a running timecode.
// Animations run only while playing, so a pause freezes the frame. A shows a quiet ×90 while it plays.

(() => {
  const params = new URLSearchParams(location.search);
  const v = params.get('v') || 'a';
  document.documentElement.dataset.variant = v;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The tour's sample thumbnails, for picking a video without going through step 2 (&video=tour-orbit).
  const THUMBS = /** @type {Record<string, string>} */ ({
    'tour-joinery': 'linear-gradient(135deg, #8a5a3c, #3d2618)',
    'tour-trail': 'linear-gradient(135deg, #3a7d5c, #173528)',
    'tour-bread': 'linear-gradient(135deg, #c08a3e, #5a3a12)',
    'tour-orbit': 'linear-gradient(135deg, #3c4f8a, #141c3d)',
    'tour-redstone': 'linear-gradient(135deg, #9a3a3a, #3a1414)',
  });

  // The samples' lengths, for the timecode when &video picks one.
  const LENGTHS = /** @type {Record<string, number>} */ ({
    'tour-joinery': 842, 'tour-trail': 1295, 'tour-bread': 548, 'tour-orbit': 767, 'tour-redstone': 1533,
  });

  // The last player's progress, so the paused player under the lock picks up where the playing one stopped.
  let lastAt = 0;

  /** @param {number} s */
  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  /** @param {string} html */
  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return /** @type {HTMLElement} */ (t.content.firstElementChild);
  }

  // A: the sea. One SVG, 320 by 180, cut to the player.
  function sea() {
    const wave = (/** @type {number} */ y, /** @type {number} */ amp) => {
      let d = `M0 ${y}`;
      for (let x = 0; x < 640; x += 80) d += ` q20 ${-amp} 40 0 t40 0`;
      return `${d} V240 H0 Z`;
    };
    return `
      <svg class="sa" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sa-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#27466b"/><stop offset=".55" stop-color="#c98a6c"/><stop offset="1" stop-color="#f3c99a"/>
          </linearGradient>
        </defs>
        <rect width="320" height="180" fill="url(#sa-sky)"/>
        <g class="sa-sun"><circle cx="226" cy="88" r="17" fill="#ffe0a3"/><circle cx="226" cy="88" r="30" fill="#ffe0a3" opacity=".18"/></g>
        <g class="sa-clouds" fill="#fff">
          <path class="sa-cloud" opacity=".55" d="M30 40a9 9 0 0 1 16-6 12 12 0 0 1 22 4 7 7 0 0 1 2 14H32a7 7 0 0 1-2-12Z"/>
          <path class="sa-cloud sa-cloud-2" opacity=".4" d="M170 26a7 7 0 0 1 13-4 9 9 0 0 1 17 3 6 6 0 0 1 1 11h-29a5 5 0 0 1-2-10Z"/>
          <path class="sa-cloud sa-cloud-3" opacity=".35" d="M260 54a6 6 0 0 1 11-3 8 8 0 0 1 14 3 5 5 0 0 1 1 9h-25a5 5 0 0 1-1-9Z"/>
        </g>
        <g class="sa-sea">
          <g class="sa-band sa-back"><path d="${wave(112, 3)}" fill="#3d7097"/></g>
          <g class="sa-boat-at"><g class="sa-boat">
            <path d="M-3 -40 L-3 -2" stroke="#3b2a20" stroke-width="2"/>
            <path d="M-1 -38 L24 -6 L-1 -6 Z" fill="#fbf3e4"/>
            <path d="M-5 -34 L-20 -7 L-5 -7 Z" fill="#e9dcc6"/>
            <path d="M-26 -3 H24 L18 8 H-20 Z" fill="#9c4a2e"/>
            <path d="M-26 -3 H24" stroke="#6b2f1c" stroke-width="2"/>
          </g></g>
          <g class="sa-band sa-mid"><path d="${wave(120, 4)}" fill="#2c5b80"/></g>
          <g class="sa-band sa-front"><path d="${wave(132, 5)}" fill="#1f4767"/></g>
        </g>
      </svg>`;
  }

  // C: one short loop per sample video.
  const LOOPS = /** @type {Record<string, string>} */ ({
    'tour-orbit': `
      <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
        <g fill="#fff">${Array.from({ length: 26 }, (_, i) => `<circle class="sc-star" style="--d:${(i % 7) * 0.4}s" cx="${(i * 71) % 320}" cy="${(i * 43) % 180}" r="${i % 3 ? 0.8 : 1.3}"/>`).join('')}</g>
        <circle cx="160" cy="90" r="22" fill="#2f6fb5"/>
        <path d="M146 80c6-4 12 0 10 6s-9 4-12 10c-3-6-3-12 2-16Zm22 2c5 0 8 4 6 9s-6 7-9 4 0-13 3-13Z" fill="#5aa368"/>
        <circle cx="160" cy="90" r="22" fill="none" stroke="#9cc6ff" stroke-opacity=".35" stroke-width="3"/>
        <ellipse cx="160" cy="90" rx="62" ry="62" fill="none" stroke="#fff" stroke-opacity=".12" stroke-dasharray="2 5"/>
        <g class="sc-orbit"><g transform="translate(222 90)">
          <circle r="9" fill="#d9d6cf"/>
          <path d="M-9 0a9 9 0 0 1 4-7.5v15A9 9 0 0 1-9 0Z" fill="#8e8a82"/>
          <circle cx="-2" cy="-3" r="1.6" fill="#b3aea4"/><circle cx="2" cy="3" r="1.2" fill="#b3aea4"/>
        </g></g>
      </svg>`,
    'tour-bread': `
      <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
        <rect y="128" width="320" height="52" fill="#3d2a14"/>
        <rect y="126" width="320" height="4" fill="#5e4220"/>
        <g class="sc-steam" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2.5" stroke-linecap="round">
          <path class="sc-wisp" d="M140 70c-6-8 6-14 0-22"/><path class="sc-wisp sc-wisp-2" d="M162 64c-6-8 6-14 0-22"/><path class="sc-wisp sc-wisp-3" d="M184 70c-6-8 6-14 0-22"/>
        </g>
        <g class="sc-loaf"><path d="M112 126c0-34 22-46 48-46s48 12 48 46Z" fill="#d79a4e"/>
          <path d="M134 98c8-6 14-6 22 0M156 92c8-6 14-6 22 0M176 100c6-4 10-4 16 0" stroke="#a96a2a" stroke-width="3" fill="none" stroke-linecap="round"/></g>
        <path d="M104 118h112l-8 14h-96Z" fill="#6f747a"/><path d="M104 118h112" stroke="#9aa0a6" stroke-width="2"/>
      </svg>`,
    'tour-redstone': `
      <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges">
        ${Array.from({ length: 40 }, (_, i) => `<rect x="${(i % 10) * 32}" y="${144 + Math.floor(i / 10) * 9}" width="32" height="9" fill="${['#6d6d6d', '#7b7b7b', '#616161'][(i * 7) % 3]}"/>`).join('')}
        <g fill="#ff2b2b">${Array.from({ length: 9 }, (_, i) => `<rect class="sc-dust" style="--d:${i * 0.12}s" x="${20 + i * 12}" y="138" width="8" height="4"/>`).join('')}</g>
        <rect x="128" y="50" width="64" height="64" fill="#c9a227"/><rect x="132" y="54" width="56" height="56" fill="#e3c23a"/>
        <rect x="138" y="60" width="44" height="44" fill="#4a3a14"/>
        <g class="sc-hand"><rect x="158" y="66" width="4" height="16" fill="#ff3b3b"/><rect x="158" y="80" width="4" height="4" fill="#ffd400"/></g>
        <rect x="152" y="96" width="16" height="4" fill="#7a5c1c"/>
      </svg>`,
    'tour-joinery': `
      <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
        <rect y="130" width="320" height="50" fill="#2a1a10"/>
        <g class="sc-left"><path d="M40 70h80v16l20-8v40l-20-8v18H40Z" fill="#c58a52"/>
          <path d="M48 82h60M48 96h66M48 110h58" stroke="#a46d3c" stroke-width="2"/></g>
        <g class="sc-right"><path d="M200 70h80v58h-80v-18l20 8V78l-20 8Z" fill="#b97c45"/>
          <path d="M224 84h48M220 100h54M226 116h46" stroke="#93602f" stroke-width="2"/></g>
      </svg>`,
    'tour-trail': `
      <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
        <rect width="320" height="180" fill="#4d6670"/>
        <path class="sc-storm" d="M40 40a16 16 0 0 1 30-8 20 20 0 0 1 38 6 12 12 0 0 1 2 24H44a11 11 0 0 1-4-22Z" fill="#2c3a40"/>
        <g class="sc-far"><path d="M0 110 L40 84 L80 100 L130 70 L180 98 L220 80 L270 104 L320 86 L360 110 L400 84 L440 100 L490 70 L540 98 L580 80 L630 104 L640 110V180H0Z" fill="#2f5545"/></g>
        <g class="sc-near"><path d="M0 132 Q40 120 80 128 T160 124 T240 130 T320 126 T400 128 T480 124 T560 130 T640 126 V180 H0Z" fill="#1d3b2c"/></g>
        <g class="sc-rider" transform="translate(110 122)"><g class="sc-bounce">
          <circle cx="-9" cy="0" r="6" fill="none" stroke="#e8eef0" stroke-width="2"/><circle cx="9" cy="0" r="6" fill="none" stroke="#e8eef0" stroke-width="2"/>
          <path d="M-9 0 L-2 -8 L9 0 M-2 -8 H6 M-2 -8 L-4 -14" stroke="#ffb340" stroke-width="2" fill="none"/>
          <circle cx="-3" cy="-19" r="3" fill="#ffb340"/>
        </g></g>
      </svg>`,
  });

  /** @param {any} video @param {{ under: boolean }} opts */
  function make(video, opts) {
    const id = params.get('video') && THUMBS[/** @type {string} */ (params.get('video'))] ? /** @type {string} */ (params.get('video')) : video.id;
    const root = el(`<div class="tp-scene tp-${v}" aria-hidden="true"></div>`);
    root.style.setProperty('--thumb', THUMBS[id] || THUMBS['tour-joinery']);
    if (opts.under) root.classList.add('is-under');
    if (opts.under && v === 'a') root.classList.add('is-sunk');

    if (v === 'a') {
      root.innerHTML = sea();
      root.append(el('<span class="tp-speed">×90</span>'));
    } else if (v === 'b') {
      root.innerHTML = '<span class="sb-pic"></span><span class="sb-glow sb-g1"></span><span class="sb-glow sb-g2"></span>'
        + '<span class="sb-pool"><svg viewBox="0 0 160 10" preserveAspectRatio="none"><path d="M0 5q10-5 20 0t20 0 20 0 20 0 20 0 20 0 20 0 20 0V10H0Z"/></svg></span>';
    } else {
      root.innerHTML = `<div class="sc-loop">${LOOPS[id] || LOOPS['tour-joinery']}</div><span class="sc-tag">90× speed</span><span class="sc-time"></span>`;
    }

    let lastMinute = Infinity;
    let played = false;
    /** @param {{ playing: boolean, unlocked: boolean, at: number, length: number, left: number, fraction: number, glass: SVGSVGElement | null, box: HTMLElement }} s */
    function update(s) {
      const at = opts.under ? lastAt : s.at;
      if (!opts.under) lastAt = s.at;
      const progress = Math.min(1, at / s.length);
      // Nothing has drained until this player has played: arriving with an empty glass isn't the end of a video.
      if (s.playing) played = true;
      // An unlocked video plays free, so the sea stays calm.
      const drained = opts.under ? 1 : s.unlocked || !played ? 0 : 1 - s.fraction;
      root.style.setProperty('--progress', progress.toFixed(4));
      root.style.setProperty('--drained', drained.toFixed(4));

      if (v === 'a' && !opts.under) root.classList.toggle('is-sinking', played && !s.unlocked && s.fraction <= 0);

      if (v === 'c') {
        const time = root.querySelector('.sc-time');
        const length = LENGTHS[id] || s.length;
        if (time) time.textContent = `${clock(Math.min(length, at))} / ${clock(length)}`;
      }

      // B: a drop leaves the glass for each whole minute watched.
      if (v === 'b' && !opts.under) {
        const minute = Math.ceil(s.left / 60);
        if (s.playing && minute < lastMinute && lastMinute !== Infinity && s.glass?.isConnected && !reduced()) fall(s.glass, s.box);
        lastMinute = minute;
      }
    }

    /** @param {SVGSVGElement} glass @param {HTMLElement} box */
    function fall(glass, box) {
      const P = /** @type {any} */ (globalThis).DripPour;
      const g = glass.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const pool = /** @type {HTMLElement | null} */ (root.querySelector('.sb-pool'));
      const top = pool ? pool.getBoundingClientRect().top + 3 : b.bottom - 4;
      const x = g.left + g.width / 2;
      const d = P.drop(9);
      P.play(d, [
        { transform: P.at(x, g.bottom, 'scale(0.4)') },
        { transform: P.at(x, g.bottom + 6, 'scale(1)'), offset: 0.18 },
        { transform: P.at(x, top - 4, 'scale(0.85, 1.3)') },
      ], { duration: 620, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)' }).then(() => {
        d.remove();
        P.ring(x, top, 40, 6, 520);
        P.splash(x, top - 2, 3, 12, 14, 360);
      });
    }

    return { el: root, update };
  }

  /** @type {any} */ (globalThis).DripScene = { make };
})();
