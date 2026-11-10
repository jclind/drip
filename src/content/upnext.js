// @ts-check
// Keeps YouTube's "next video" from opening YouTube's own pick. drip hides the sidebar, the end screen, and autoplay, so
// a card is the only way to a recommendation (Q2). Shift+N went around that: with minutes left it played the video
// YouTube had lined up, with no card spent (signed-in test, 2026-11-10). In a playlist or mix the next video is the
// list's, which plays on (Q2), so there Shift+N and the player's Next button keep working.
//
// This runs in the isolated world at document_start. Key and click events are shared with the page, and a listener on
// window in the capture phase, added before YouTube's scripts run, comes before all of YouTube's. Canceling the event
// here cancels it for them too. The rule is in state.js, which only the isolated world loads.

(function () {
  /** @type {any} */
  const Drip = /** @type {any} */ (globalThis).Drip;

  // YouTube selectors. These break when YouTube changes its markup.
  const SEL = {
    // The player's Next button. Its href is where Shift+N goes: the list's next video in a playlist, and YouTube's pick
    // on a plain watch page, where YouTube hides the button but keeps it (checked 2026-11-10).
    nextButton: '#movie_player .ytp-next-button',
    // Where a typed N is a letter, not a shortcut.
    typing: 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]',
  };

  function nextIsPick() {
    const next = document.querySelector(SEL.nextButton);
    return Drip.upNextIsPick(location.href, next?.getAttribute('href') || '');
  }

  /** @param {Event} e */
  function typing(e) {
    const target = e.composedPath()[0];
    return target instanceof Element && (target.closest(SEL.typing) !== null || /** @type {HTMLElement} */ (target).isContentEditable === true);
  }

  window.addEventListener('keydown', (e) => {
    if (location.pathname !== '/watch' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (e.key.toLowerCase() !== 'n' || typing(e) || !nextIsPick()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  window.addEventListener('click', (e) => {
    if (location.pathname !== '/watch' || !(e.target instanceof Element) || !e.target.closest(SEL.nextButton) || !nextIsPick()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
})();
