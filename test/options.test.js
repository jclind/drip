// @ts-check
// Settings against a small DOM and the real page helpers and state rules. No browser or packages needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SRC = path.join(__dirname, '..', 'src');

function page() {
  /** @type {any} */
  let activeElement = null;
  class El {
    /** @param {string} tag */
    constructor(tag) {
      this.tag = tag;
      /** @type {Record<string, string>} */
      this.attrs = {};
      /** @type {any[]} */
      this.children = [];
      /** @type {any} */
      this.parent = null;
      /** @type {Record<string, Function[]>} */
      this.events = {};
      this.value = '';
      this.checked = false;
      this.disabled = false;
      this.style = { setProperty() {} };
      this.classList = {
        contains: (/** @type {string} */ name) => this.className.split(' ').includes(name),
        toggle: (/** @type {string} */ name, /** @type {boolean} */ on) => {
          const names = new Set(this.className.split(' ').filter(Boolean));
          if (on) names.add(name); else names.delete(name);
          this.className = [...names].join(' ');
        },
        add: (/** @type {string} */ name) => this.classList.toggle(name, true),
        remove: (/** @type {string[]} */ ...names) => names.forEach((name) => this.classList.toggle(name, false)),
      };
    }
    get className() { return this.attrs.class || ''; }
    set className(value) { this.attrs.class = value; }
    get hidden() { return 'hidden' in this.attrs; }
    set hidden(value) { this.toggleAttribute('hidden', value); }
    get textContent() { return this.children.map((c) => typeof c === 'string' ? c : c.textContent).join(''); }
    set textContent(value) { this.replaceChildren(value); }
    get dataset() { return Object.fromEntries(Object.entries(this.attrs).filter(([k]) => k.startsWith('data-')).map(([k, v]) => [k.slice(5), v])); }
    /** @param {string} k @param {string} v */
    setAttribute(k, v) { this.attrs[k] = String(v); }
    /** @param {string} k */
    getAttribute(k) { return this.attrs[k] ?? null; }
    /** @param {string} k @param {boolean} on */
    toggleAttribute(k, on) { if (on) this.attrs[k] = ''; else delete this.attrs[k]; }
    /** @param {any[]} kids */
    append(...kids) { for (const kid of kids) { this.children.push(kid instanceof El ? kid : String(kid)); if (kid instanceof El) kid.parent = this; } }
    /** @param {any[]} kids */
    replaceChildren(...kids) { this.children = []; this.append(...kids); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
    /** @param {string} selector @returns {El | null} */
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
    /** @param {El} node */
    replaceWith(node) { this.before(node); this.remove(); }
    /** @param {El} node */
    before(node) { const at = this.parent.children.indexOf(this); this.parent.children.splice(at, 0, node); node.parent = this.parent; }
    /** @param {string} selector */
    matches(selector) {
      const attrs = [...selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
      if (attrs.some(([, k, v]) => !(k in this.attrs) || (v !== undefined && this.attrs[k] !== v))) return false;
      const simple = selector.replace(/\[[^\]]*\]/g, '');
      const tag = /^\w+/.exec(simple)?.[0];
      return (!tag || tag === this.tag) && [...simple.matchAll(/\.([\w-]+)/g)].every(([, cls]) => this.classList.contains(cls));
    }
    /** @param {string} selector @returns {El[]} */
    querySelectorAll(selector) {
      return this.children.filter((c) => typeof c !== 'string').flatMap((c) => [...(c.matches(selector) ? [c] : []), ...c.querySelectorAll(selector)]);
    }
    /** @param {string} selector */
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    /** @param {string} event @param {Function} fn */
    addEventListener(event, fn) { (this.events[event] ||= []).push(fn); }
    /** @param {string} event @param {any} [detail] */
    async fire(event, detail = {}) { for (const fn of this.events[event] || []) await fn(detail); }
    click() { return this.fire('click'); }
    focus() { activeElement = this; }
    scrollIntoView() {}
  }
  const body = new El('body');
  // Only the static IDs are needed. Dynamic form rows are built by the real page code.
  const html = fs.readFileSync(path.join(SRC, 'options/options.html'), 'utf8');
  for (const [, tag, attrs] of html.matchAll(/<(\w+)\b([^>]*\bid="[^"]*"[^>]*)>/g)) {
    const el = new El(tag);
    for (const [, k, v] of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) el.setAttribute(k, v ?? '');
    body.append(el);
  }
  const document = {
    body,
    createElement: (/** @type {string} */ tag) => new El(tag),
    getElementById: (/** @type {string} */ id) => body.querySelector(`[id="${id}"]`),
    querySelector: (/** @type {string} */ selector) => body.querySelector(selector),
    get activeElement() { return activeElement; },
  };
  const ctx = vm.createContext({
    document, Blob, structuredClone, URL: { createObjectURL: () => 'blob:export', revokeObjectURL() {} },
    setTimeout() {}, clearTimeout() {}, setInterval() {}, matchMedia: () => ({ matches: true }),
    location: { search: '', hash: '' }, window: { addEventListener() {} },
    chrome: {
      runtime: { getURL: (/** @type {string} */ p) => p, sendMessage: () => new Promise(() => {}), onMessage: { addListener() {} } },
      storage: { onChanged: { addListener() {} } },
    },
  });
  for (const file of ['lib/state.js', 'pages.js', 'options/options.js']) vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), ctx);
  vm.runInContext(`
    Date.now = () => new Date(2026, 10, 6, 12).getTime();
    state = Drip.initialState(Date.now());
    state.installedAt -= 3 * 86400e3;
    draft = Drip.planned(state);
    sample = { id: 'test' };
    renderHistory = () => {};
    renderReasons = () => {};
  `, ctx);
  /** @param {string} code */
  const run = (code) => vm.runInContext(code, ctx);
  /** @param {string} id */
  const get = (id) => document.getElementById(id);
  /** @param {any} data */
  const importData = async (data) => {
    ctx.fileData = data;
    await run(`$('importFile').files = [{ name: 'drip-test.json', size: 100, text: async () => JSON.stringify(fileData) }]; importFile()`);
  };
  return { run, get, document, importData };
}

test('part summaries disappear on and off, while Search and Channels keep their text', () => {
  const p = page();
  p.run('renderForm()');
  for (const id of ['watch', 'cards', 'stash', 'day']) assert.equal(p.get(id).querySelector('.part-sum'), null, id);
  assert.equal(p.get('search').querySelector('.part-sum').textContent, 'Stops at 10 results');
  assert.equal(p.get('channels').querySelector('.part-sum').textContent, 'Allowed channels are free to watch. Blocked ones never come up in reveals.');
  p.run(`Object.assign(draft, Drip.MODES.quiet); syncParts()`);
  for (const id of ['watch', 'cards', 'stash', 'day', 'search']) assert.equal(p.get(id).querySelector('.part-sum'), null, id);
  p.run('draft.searchCap = true; syncParts()');
  assert.equal(p.get('search').querySelector('.part-sum').textContent, 'Stops at 10 results');
});

test('folded chips keep phrase labels, today values, and Undo names', () => {
  const p = page();
  p.run(`state.pending = { effectiveDay: Drip.addDays(state.day, 1), changes: { clock: false, stash: false, stashMax: 20, needThisPerWeek: 5, rolloverDays: 3 } };
    draft = Drip.planned(state); renderForm()`);
  assert.match(p.get('stash').querySelector('.folded-chips').textContent, /Stash holds 10 videos until 4:00am/);
  assert.match(p.get('watch').querySelector('.folded-chips').textContent, /Unlocks 3 until 4:00am/);
  assert.equal(p.run(`chip(FIELDS.find(f => f.key === 'needThisPerWeek'), true).querySelector('button').getAttribute('aria-label')`), 'Undo the waiting change to Unlocks');
  assert.equal(p.run(`chip(FIELDS.find(f => f.key === 'rolloverDays'), true).querySelector('button').getAttribute('aria-label')`), 'Undo the waiting change to Balance cap');
  assert.equal(p.run(`chip(FIELDS.find(f => f.key === 'stashMax'), true).querySelector('button').getAttribute('aria-label')`), 'Undo the waiting change to Stash holds');
});

test('cap totals follow all three draft steppers and both part controls without saving', async () => {
  const p = page();
  p.run('renderForm()');
  const cap = () => p.get('day').querySelector('.cap-results');
  assert.equal(cap().querySelector('.sr').textContent, '8 drops, 20 cards at most');
  for (const [key, expected] of [['watchTokensPerDay', '10 drops, 20 cards at most'], ['recTokensPerDay', '10 drops, 22 cards at most'], ['rolloverDays', '15 drops, 33 cards at most']]) {
    const row = p.document.querySelector(`[data-field="${key}"]`);
    await row.querySelector('[aria-label="More"]').click();
    assert.equal(cap().querySelector('.sr').textContent, expected);
  }
  assert.equal(p.run('state.settings.rolloverDays'), 2, 'the draft has not been saved');
  p.get('field-clock').checked = false;
  await p.get('field-clock').fire('change');
  assert.equal(cap().querySelector('.sr').textContent, '33 cards at most');
  assert.doesNotMatch(cap().textContent, /false|null/);
  p.get('field-cardsKind').value = 'unlimited';
  await p.get('field-cardsKind').fire('change');
  assert.equal(cap().hidden, true);
  assert.equal(cap().textContent, '');
  const row = p.document.querySelector('[data-field="rolloverDays"]');
  assert.equal(row.classList.contains('is-idle'), true);
  assert.equal(row.querySelector('.idle-note').textContent, 'Not used without watch time or counted cards.');
  p.run('Object.assign(draft, { clock: true, cards: "off", watchTokensPerDay: 1, rolloverDays: 1 }); renderForm()');
  assert.equal(cap().querySelector('.sr').textContent, '1 drop at most');
  assert.equal(p.document.querySelector('[data-field="rolloverDays"]').querySelector('.stepper-value').getAttribute('aria-valuetext'), '1 day');
  assert.equal(cap().querySelector('.drip-i').getAttribute('aria-hidden'), 'true');
});

test('help toggles independently, and Reset hides only its link and keeps focus behavior', async () => {
  const p = page();
  assert.equal(p.get('dataAbout').hidden, true);
  assert.equal(p.get('dataInfo').getAttribute('aria-controls'), 'dataAbout');
  assert.equal(p.get('dataInfo').getAttribute('aria-label'), 'About Export and Import');
  await p.get('dataInfo').click();
  assert.equal(p.get('dataAbout').hidden, false);
  assert.equal(p.get('dataInfo').getAttribute('aria-expanded'), 'true');
  await p.get('dataInfo').click();
  assert.equal(p.get('dataAbout').hidden, true);
  assert.equal(p.get('dataInfo').getAttribute('aria-expanded'), 'false');
  await p.get('resetData').click();
  assert.equal(p.get('resetConfirm').hidden, false);
  assert.equal(p.get('resetData').hidden, true);
  assert.equal(p.get('dataButtons').hidden, false);
  assert.equal(p.document.activeElement, p.get('resetNo'));
  await p.get('resetNo').click();
  assert.equal(p.get('resetConfirm').hidden, true);
  assert.equal(p.get('resetData').hidden, false);
  assert.equal(p.document.activeElement, p.get('resetData'));
});

test('import results use nonzero pills, a channel clock tag, overflow and settings waits', async () => {
  const p = page();
  p.run('state.settings.stashMax = 1; draft = Drip.planned(state)');
  await p.importData({
    app: 'drip', format: 1, settings: { watchTokensPerDay: 8, recTokensPerDay: 20 },
    backlog: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], log: { '2026-11-05': { watchedSec: 60 } },
    channels: { allow: [{ ids: ['@example'], name: 'Example' }] },
  });
  const result = p.get('dataResult');
  assert.equal(result.getAttribute('role'), 'status');
  assert.equal(result.querySelector('strong').textContent, 'Imported');
  assert.deepEqual(result.querySelectorAll('.data-chip').map((c) => c.children[0]), ['+1 in stash', '+1 day of history', '+1 channel']);
  assert.equal(result.querySelector('.channel-when').getAttribute('title'), 'Starts at 4:00am');
  assert.match(result.textContent, /1 video didn't fit in the stash\./);
  assert.match(result.textContent, /2 changes start at 4:00am\./);
  assert.doesNotMatch(result.textContent, /Settings now match|Added |allowed channel starts/);
  await p.importData({ app: 'drip', format: 1 });
  assert.equal(result.textContent, 'Imported');
  assert.equal(result.querySelector('.data-chip'), null);
});

test('import plural counts have no clock when channels apply at once', async () => {
  const p = page();
  await p.importData({ app: 'drip', format: 1, log: { '2026-11-04': {}, '2026-11-05': {} },
    channels: { block: [{ ids: ['@one'], name: 'One' }, { ids: ['@two'], name: 'Two' }] } });
  assert.deepEqual(p.get('dataResult').querySelectorAll('.data-chip').map((c) => c.textContent), ['+2 days of history', '+2 channels']);
  assert.equal(p.get('dataResult').querySelector('.channel-when'), null);
});

test('reset results show removed counts, keep balances and history, and omit zero pills', async () => {
  const p = page();
  p.run(`state.settings.watchTokensPerDay = 2;
    state.backlog.push({ id: 'a', title: 'A' });
    state.channels.allow.push({ ids: ['@allowed'], name: 'Allowed' });
    state.channels.block.push({ ids: ['@blocked'], name: 'Blocked' });
    state.log['2026-11-05'] = { watchedSec: 60 };
    state.tokens = { watch: 1, rec: 2 };
    draft = { ...Drip.planned(state), stashMax: 30 }`);
  await p.get('resetYes').click();
  assert.deepEqual(p.get('dataResult').querySelectorAll('.data-chip').map((c) => c.textContent), ['Stash emptied', '−1 allowed', '−1 blocked']);
  assert.match(p.get('dataResult').textContent, /1 change starts at 4:00am\./);
  assert.doesNotMatch(p.get('dataResult').textContent, /unchanged|unblocked at|already empty/);
  assert.equal(p.run('draft.stashMax'), 10, 'reset discards edits');
  assert.equal(p.run('state.log["2026-11-05"].watchedSec'), 60);
  assert.equal(p.run('JSON.stringify(state.tokens)'), '{"watch":1,"rec":2}');
  assert.equal(p.document.activeElement, p.get('resetData'));
  p.run('state.settings.watchTokensPerDay = 4');
  await p.get('resetYes').click();
  assert.equal(p.get('dataResult').textContent, 'Reset');
});

test('export is only the check and title; import errors keep the existing explanation panel', async () => {
  const p = page();
  await p.get('exportData').click();
  assert.equal(p.get('dataResult').textContent, 'Exported');
  assert.ok(p.get('dataResult').querySelector('.drip-i-check'));
  await p.importData({ app: 'drip', format: 2 });
  const result = p.get('dataResult');
  assert.equal(result.classList.contains('is-failed'), true);
  assert.equal(result.classList.contains('is-success'), false);
  assert.deepEqual(result.querySelectorAll('li').map((c) => c.textContent), ['"drip-test.json" is from a newer version of drip.', 'Update drip, then import it again.', 'Nothing changed.']);
  assert.ok(result.querySelector('.drip-i-x'));
});

test('successful channel adds clear stale notes; invalid handles keep error notes', async () => {
  const p = page();
  p.run('renderForm()');
  for (const list of ['allow', 'block']) {
    p.run(`channelsNote.${list} = 'stale'`);
    p.document.querySelector(`[data-k="${list}-input"]`).value = `@${list}example`;
    await p.run(`addChannel('${list}')`);
    assert.equal(p.run(`channelsNote.${list}`), '');
    assert.equal(p.document.querySelector(`[data-k="${list}-input"]`).value, '');
  }
  p.document.querySelector('[data-k="allow-input"]').value = 'invalid';
  await p.run("addChannel('allow')");
  assert.match(p.run('channelsNote.allow'), /isn't a channel handle or link/);
});
