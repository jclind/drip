// @ts-check
// Hides watch page comments behind a "Show comments" button. Showing them lasts for the current video only.
// The hiding is CSS in early.css, keyed on an attribute this file sets on <html>.

(function () {
  /** @type {any} */
  const { h } = /** @type {any} */ (globalThis).DripUI;

  // YouTube selectors. These break when YouTube changes its markup. The CSS half is in early.css.
  const SEL = {
    comments: 'ytd-watch-flexy #below ytd-comments#comments',
  };
  const SHOWN_ATTR = 'data-drip-comments-shown';

  /** The video whose comments were shown, or '' when they're hidden. */
  let shownFor = '';

  function videoId() {
    return location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') || '' : '';
  }

  function apply() {
    const id = videoId();
    if (shownFor && shownFor !== id) shownFor = '';
    const shown = !!shownFor;
    if (document.documentElement.hasAttribute(SHOWN_ATTR) !== shown) document.documentElement.toggleAttribute(SHOWN_ATTR, shown);

    const comments = document.querySelector(SEL.comments);
    const button = document.getElementById('drip-show-comments');
    if (!id || shown || !comments) {
      button?.remove();
      return;
    }
    if (button && button.nextElementSibling === comments) return;
    button?.remove();
    comments.before(
      h('div', { id: 'drip-show-comments', class: 'drip-ui' },
        h('button', { class: 'drip-btn', onclick: () => { shownFor = videoId(); apply(); } }, 'Show comments')),
    );
  }

  document.addEventListener('yt-navigate-finish', apply);
  setInterval(apply, 500);
  apply();
})();
