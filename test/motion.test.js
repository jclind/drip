// @ts-check
// Reduced motion in drip.css. Every animation drip puts on YouTube, and every transition that moves something, needs a
// prefers-reduced-motion rule. Inside #drip-home, #drip-lock, and #drip-pill one rule stops them all, but it reaches
// only what's inside, so an element of its own, or one outside them, needs a rule by name. The Allow button's ring and
// the low pill's shimmer had none (release review, 2026-11-10).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'drip.css'), 'utf8');

/**
 * Every style rule with its selectors, its declarations, and whether it sits in a reduced-motion block. Skips
 * @keyframes and @property. drip.css has no nesting, so a block holds rules or declarations, not both.
 * @param {string} text
 * @returns {{selectors: string[], decls: Record<string, string>, reduced: boolean}[]}
 */
function rules(text) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '');
  /** @type {{selectors: string[], decls: Record<string, string>, reduced: boolean}[]} */
  const out = [];
  /** @type {string[]} */
  const stack = [];
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') {
      stack.push(src.slice(start, i).trim());
      start = i + 1;
    } else if (src[i] === '}') {
      const head = /** @type {string} */ (stack.pop());
      const body = src.slice(start, i);
      start = i + 1;
      if (head.startsWith('@') || stack.some((h) => /^@(keyframes|property)/.test(h))) continue;
      /** @type {Record<string, string>} */
      const decls = {};
      for (const d of body.split(';')) {
        const at = d.indexOf(':');
        if (at > 0) decls[d.slice(0, at).trim()] = d.slice(at + 1).trim();
      }
      const selectors = head.split(/,(?![^()]*\))/).map((s) => s.trim().replace(/\s+/g, ' '));
      out.push({ selectors, decls, reduced: stack.some((h) => /prefers-reduced-motion:\s*reduce/.test(h)) });
    }
  }
  return out;
}

const all = rules(css);
const reducedSelectors = new Set(all.filter((r) => r.reduced).flatMap((r) => r.selectors));
/**
 * Inside one of the three, where the wildcard rule stops everything: `#drip-lock .x` or `#drip-lock.is-draining .x`,
 * but not `#drip-lock` or `#drip-pill.is-low::after`, which are the element itself.
 * @param {string} sel
 */
const inside = (sel) => sel.startsWith(':is(#drip-home, #drip-lock, #drip-pill) ') || /^#drip-(home|lock|pill)(?![\w-])\S* \S/.test(sel);
/** Transitions of these change no position or size: color, a fade, a blur. */
const STILL = new Set(['opacity', 'color', 'background', 'background-color', 'backdrop-filter', 'outline-color', 'filter']);

test('one reduced-motion rule stops every animation and transition inside the home page, the lock, and the pill', () => {
  for (const root of ['*', '*::before', '*::after']) {
    assert.ok(reducedSelectors.has(`:is(#drip-home, #drip-lock, #drip-pill) ${root}`), root);
  }
});

test('every animation in drip.css has a reduced-motion rule (release review, 2026-11-10)', () => {
  /** @type {string[]} */
  const missing = [];
  for (const rule of all.filter((r) => !r.reduced)) {
    const name = rule.decls['animation-name'] ?? rule.decls.animation;
    if (!name || name === 'none') continue;
    for (const sel of rule.selectors) {
      if (sel.startsWith('::view-transition')) continue;
      if (!inside(sel) && !reducedSelectors.has(sel)) missing.push(sel);
    }
  }
  assert.deepEqual(missing, []);
});

test('every transition in drip.css that moves something has a reduced-motion rule', () => {
  /** @type {string[]} */
  const missing = [];
  for (const rule of all.filter((r) => !r.reduced)) {
    const value = rule.decls.transition;
    if (!value || value === 'none') continue;
    const props = value.split(/,(?![^()]*\))/).map((t) => t.trim().split(/\s+/)[0]);
    if (props.every((p) => STILL.has(p))) continue;
    for (const sel of rule.selectors) if (!inside(sel) && !reducedSelectors.has(sel)) missing.push(sel);
  }
  assert.deepEqual(missing, []);
});
