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
      this.scrolls = [];
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
    get tabIndex() { return Number(this.attrs.tabindex ?? -1); }
    set tabIndex(value) { this.attrs.tabindex = String(value); }
    /** @param {string} k @param {string} v */
    setAttribute(k, v) { this.attrs[k] = String(v); }
    /** @param {string} k */
    getAttribute(k) { return this.attrs[k] ?? null; }
    /** @param {string} k @param {boolean} on */
    toggleAttribute(k, on) { if (on) this.attrs[k] = ''; else delete this.attrs[k]; }
    /** @param {any[]} kids */
    append(...kids) { for (const kid of kids) { if (kid instanceof El) kid.remove(); this.children.push(kid instanceof El ? kid : String(kid)); if (kid instanceof El) kid.parent = this; } }
    /** @param {any[]} kids */
    replaceChildren(...kids) { this.children = []; this.append(...kids); }
    /** @param {El | null} node @returns {boolean} */
    contains(node) { return node === this || this.children.some((c) => c instanceof El && c.contains(node)); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
    /** @param {string} selector @returns {El | null} */
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
    /** @param {El} node */
    replaceWith(node) { this.before(node); this.remove(); }
    /** @param {El} node */
    before(node) { const at = this.parent.children.indexOf(this); this.parent.children.splice(at, 0, node); node.parent = this.parent; }
    /** @param {string} selector */
    matches(selector) {
      const parts = selector.match(/(?:\[[^\]]*\]|[^\s])+/g) || [];
      if (parts.length > 1) return this.matches(parts.at(-1)) && !!this.parent?.closest(parts.slice(0, -1).join(' '));
      // :not(...) as in Chrome, so `[data-k="x"]:not([disabled])` skips a disabled control.
      const nots = [...selector.matchAll(/:not\(([^)]*)\)/g)];
      if (nots.some(([, inner]) => this.matches(inner))) return false;
      selector = selector.replace(/:not\([^)]*\)/g, '');
      const attrs = [...selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
      if (attrs.some(([, k, v]) => !(k in this.attrs) || (v !== undefined && this.attrs[k] !== v))) return false;
      const simple = selector.replace(/\[[^\]]*\]/g, '');
      const id = /#([\w-]+)/.exec(simple)?.[1];
      if (id && this.attrs.id !== id) return false;
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
    scrollIntoView(options) { this.scrolls.push(options); }
  }
  const body = new El('body');
  // Keep static nesting too, so panel tests catch misplaced form, data, and save controls.
  const html = fs.readFileSync(path.join(SRC, 'options/options.html'), 'utf8');
  const stack = [body];
  for (const [token] of html.split('<body')[1].split('</body>')[0].replace(/^[^>]*>/, '').matchAll(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g)) {
    if (token.startsWith('<!--')) continue;
    if (token.startsWith('</')) { stack.pop(); continue; }
    if (!token.startsWith('<')) { stack.at(-1).append(token); continue; }
    const [, tag, attrs] = /^<(\w+)\b([^>]*)>/.exec(token);
    const el = new El(tag);
    for (const [, k, v] of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) el.setAttribute(k, v ?? '');
    stack.at(-1).append(el);
    if (!['input', 'br', 'hr', 'img', 'meta', 'link'].includes(tag)) stack.push(el);
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
    history: { replaceState: (_state, _title, hash) => { ctx.location.hash = hash; } },
    location: { search: '', hash: '' }, window: { addEventListener: (event, fn) => body.addEventListener(`window-${event}`, fn) },
    chrome: {
      runtime: { getURL: (/** @type {string} */ p) => p, sendMessage: () => new Promise(() => {}), onMessage: { addListener: (fn) => body.addEventListener('message', fn) } },
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
  // Channels past a list's size get the same line as the stash. One allow waits from the first import, so 4 more fit.
  await p.importData({ app: 'drip', format: 1, channels: {
    allow: Array.from({ length: 6 }, (_, n) => ({ ids: [`@allow${n}`], name: `Allow ${n}` })),
    block: Array.from({ length: 103 }, (_, n) => ({ ids: [`@block${n}`], name: `Block ${n}` })),
  } });
  const lines = result.querySelectorAll('.muted').map((c) => c.textContent);
  assert.deepEqual(lines.filter((line) => /didn't fit/.test(line)), [
    "2 channels didn't fit in the allow list.", "3 channels didn't fit in the block list.",
  ]);
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
    state.log['2026-11-05'] = { watchedSec: 60, needThis: [] };
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

test('Saved. and Reset count Dry hours once, as their one chip does', async () => {
  const p = page();
  p.run('state.settings.dryHours = true; draft = Drip.planned(state); renderForm()');
  // Ends at an hour sooner: one edit, and Dry hours wait as a range of three keys.
  p.run('draft.dryTo = 5; draftChanged()');
  assert.equal(p.get('result').textContent, '1 change not saved');
  await p.run('save()');
  assert.equal(p.run('Object.keys(state.pending.changes).sort().join()'), 'dryFrom,dryHours,dryTo', 'state still keeps all three');
  assert.equal(p.get('result').textContent, 'Saved. 1 change starts at 4:00am.');
  assert.equal(p.document.body.querySelectorAll('.rows .chip').length, 1);
  // A second save names only what it left waiting, though Dry hours still wait too.
  p.run('draft.minutesPerToken = 20; draftChanged()');
  await p.run('save()');
  assert.equal(p.get('result').textContent, 'Saved. 1 change starts at 4:00am.');
  assert.equal(p.document.body.querySelectorAll('.rows .chip').length, 2);
  p.run('state.pending = null; state.settings.watchTokensPerDay = 2; draft = Drip.planned(state); renderForm()');
  await p.get('resetYes').click();
  assert.equal(p.run('Object.keys(state.pending.changes).sort().join()'), 'dryFrom,dryHours,dryTo,watchTokensPerDay');
  assert.match(p.get('dataResult').textContent, /2 changes start at 4:00am\./);
  assert.equal(p.document.body.querySelectorAll('.rows .chip').length, 2);
  assert.equal(p.run('Drip.waitingCount([])'), 0);
  assert.equal(p.run('Drip.waitingCount(["dryHours", "dryFrom", "dryTo", "stashMax"])'), 2);
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

test("an import the worker couldn't save says the file didn't fit and nothing changed", async () => {
  const p = page();
  p.run(`send = async () => ({ ok: false, error: 'storage-full' })`);
  await p.importData({ app: 'drip', format: 1, backlog: [{ id: 'a', title: 'A' }] });
  const result = p.get('dataResult');
  assert.equal(result.classList.contains('is-failed'), true);
  assert.deepEqual(result.querySelectorAll('li').map((c) => c.textContent), ['"drip-test.json" didn\'t fit in drip\'s storage.', 'Nothing changed.']);
  // No answer at all still says so.
  p.run('send = async () => undefined');
  await p.importData({ app: 'drip', format: 1 });
  assert.deepEqual(result.querySelectorAll('li').map((c) => c.textContent), ["drip didn't answer.", 'Try again in a moment.']);
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

test('the 5th allowed channel moves focus from the full field and button to the Allowed tab', async () => {
  for (const from of ['allow-input', 'allow-add']) {
    const p = page();
    p.run(`state.channels.allow = ['@one', '@two', '@three'].map((id) => ({ ids: [id], name: '' })); renderForm()`);
    const at = (/** @type {string} */ k) => p.document.querySelector(`[data-k="${k}"]`);
    /** @param {string} handle */
    const add = async (handle) => {
      at('allow-input').value = handle;
      at(from).focus();
      if (from === 'allow-input') await p.run("addChannel('allow')");
      else await at('allow-add').click();
    };
    await add('@four');
    assert.equal(p.document.activeElement, at(from), `${from}: room left keeps focus where it was`);
    await add('@five');
    assert.equal(p.run('Drip.allowCount(state)'), 5);
    assert.equal(at('allow-input').getAttribute('disabled'), '');
    assert.equal(at('allow-add').getAttribute('disabled'), '');
    // Focus fell to the page before, since the only fallback was the disabled field.
    assert.equal(p.document.activeElement, at('tab-allow'), from);
    assert.match(p.document.activeElement.textContent, /Allowed5\/5/);
  }
});

test('page panels keep the form mounted, preserve drafts, and save from Channels and History', async () => {
  const p = page();
  p.run('renderForm()');
  const form = p.get('settings');
  const clock = p.get('field-clock');
  const channels = p.get('channels');
  const ids = p.document.body.querySelectorAll('[id]').map((el) => el.getAttribute('id'));
  assert.equal(new Set(ids).size, ids.length, 'static and generated IDs are unique');
  assert.ok(p.get('panel-settings').contains(form));
  for (const id of ['firstDay', 'data', 'dev']) assert.ok(p.get('panel-settings').contains(p.get(id)), id);
  assert.ok(p.get('panel-channels').contains(channels));
  assert.equal(form.contains(channels), false);
  assert.ok(p.get('panel-history').contains(p.get('history')));
  assert.ok(p.get('panel-history').contains(p.get('reasons-section')));
  assert.equal(p.get('panel-settings').contains(p.get('savebar')), false);
  for (const tab of ['channels', 'history']) {
    p.run('draft.watchTokensPerDay = state.settings.watchTokensPerDay - 1; draftChanged()');
    await p.get(`tab-${tab}`).click();
    assert.equal(p.run('location.hash'), `#${tab}`);
    assert.equal(p.get(`panel-${tab}`).hidden, false);
    assert.equal(p.get('settings'), form);
    assert.equal(p.get('savebar').hidden, false);
    if (tab === 'channels') assert.equal(p.get('field-clock'), clock);
    p.get('save').focus();
    await p.get('save').click();
    assert.equal(p.run('state.settings.watchTokensPerDay'), tab === 'channels' ? 3 : 2);
    assert.equal(p.get(`panel-${tab}`).hidden, false);
    assert.equal(p.document.activeElement, p.get(`tab-${tab}`));
    assert.equal(p.get('channels'), channels, 'saving does not replace Channels');
  }
});

test('page tabs have one tab stop, arrow wrapping, Home, and End', async () => {
  const p = page();
  let prevented = 0;
  const press = (tab, key) => p.get(`tab-${tab}`).fire('keydown', { key, preventDefault: () => prevented++ });
  await press('settings', 'ArrowLeft');
  assert.equal(p.document.activeElement, p.get('tab-history'));
  await press('history', 'Home');
  assert.equal(p.document.activeElement, p.get('tab-settings'));
  await press('settings', 'End');
  assert.equal(p.document.activeElement, p.get('tab-history'));
  await press('history', 'ArrowRight');
  assert.equal(p.document.activeElement, p.get('tab-settings'));
  await press('settings', 'ArrowRight');
  assert.equal(p.document.activeElement, p.get('tab-channels'));
  assert.equal(prevented, 5);
  for (const tab of ['settings', 'channels', 'history']) {
    const selected = tab === 'channels';
    assert.equal(p.get(`tab-${tab}`).tabIndex, selected ? 0 : -1);
    assert.equal(p.get(`tab-${tab}`).getAttribute('aria-selected'), String(selected));
    assert.equal(p.get(`tab-${tab}`).getAttribute('aria-controls'), `panel-${tab}`);
    assert.equal(p.get(`panel-${tab}`).hidden, !selected);
  }
});

test('hashes and worker messages select the same panels and flash form sections', async () => {
  const p = page();
  p.run('renderForm()');
  for (const tab of ['settings', 'channels', 'history']) {
    p.run(`location.hash = '#${tab}'`);
    await p.document.body.fire('window-hashchange');
    assert.equal(p.get(`panel-${tab}`).hidden, false);
  }
  for (const section of ['watch', 'cards', 'stash', 'search', 'day', 'youtube']) {
    await p.document.body.fire('message', { type: 'settingsGoto', section });
    assert.equal(p.get('panel-settings').hidden, false);
    assert.equal(p.run('location.hash'), `#${section}`);
    assert.equal(p.get(section).scrolls.length, 1);
    assert.ok(p.get(section).querySelector('.part-head').classList.contains('is-arriving'));
    p.run(`gotoSection('history', false); location.hash = '#${section}'`);
    await p.document.body.fire('window-hashchange');
    assert.equal(p.get('panel-settings').hidden, false);
    assert.equal(p.get(section).scrolls.length, 2);
  }
  p.run("gotoSection('history', false); location.hash = ''");
  await p.document.body.fire('window-hashchange');
  assert.equal(p.get('panel-settings').hidden, false);
  p.run("location.hash = '#%invalid'");
  await p.document.body.fire('window-hashchange');
  assert.equal(p.get('panel-settings').hidden, false);
});

test('Dry hours folds inert child rows and retains one range chip, and YouTube has its own group', async () => {
  const p = page();
  p.run(`state.pending = { effectiveDay: Drip.addDays(state.day, 1), changes: { dryHours: true, dryFrom: 22, dryTo: 7 } };
    draft = Drip.planned(state); renderForm()`);
  assert.deepEqual(p.get('watch').querySelectorAll('[data-field]').map((el) => el.dataset.field),
    ['watchTokensPerDay', 'minutesPerToken', 'dryHours', 'dryFrom', 'dryTo', 'graceMode', 'needThisPerWeek']);
  assert.deepEqual(p.get('day').querySelectorAll('[data-field]').map((el) => el.dataset.field), ['resetHour', 'rolloverDays']);
  assert.deepEqual(p.get('youtube').querySelectorAll('[data-field]').map((el) => el.dataset.field), ['hideBell', 'hideShorts']);
  assert.equal(p.get('youtube').querySelector('.toggle').getAttribute('id'), 'field-hideBell');
  assert.ok(p.get('youtube').querySelector('.drip-i-square-play-fill'));
  const family = p.document.querySelector('.dry-family');
  assert.equal(family.querySelectorAll('.chip').length, 1);
  assert.match(family.querySelector('.chip').textContent, /Off until 4:00am/);
  assert.equal(p.get('label-dryFrom').textContent, 'Starts at');
  assert.equal(p.get('label-dryTo').textContent, 'Ends at');
  assert.equal(p.get('label-dryFrom').getAttribute('for'), 'field-dryFrom');
  const range = p.get('dry-detail');
  assert.equal(range.getAttribute('inert'), null);
  p.get('field-dryHours').checked = false;
  await p.get('field-dryHours').fire('change');
  assert.equal(range.classList.contains('is-off'), true);
  assert.equal(range.getAttribute('inert'), '');
  p.get('field-dryHours').checked = true;
  await p.get('field-dryHours').fire('change');
  assert.equal(range.classList.contains('is-off'), false);
  assert.equal(range.getAttribute('inert'), null);
  assert.equal(p.get('field-dryFrom').getAttribute('id'), 'field-dryFrom');
});

test('reasons show the rolling window, group reset dates, and use complete linked reasons', () => {
  const p = page();
  p.run(`
    const now = Date.now(), week = 7 * 86400e3;
    state.log = {
      '2026-10-30': { needThis: [
        { videoId: 'out', title: 'Outside', reason: 'Outside reason', at: now - week },
        { videoId: 'in', title: 'Inside', reason: 'Inside reason', at: now - week + 1 }
      ] },
      '2026-11-06': { needThis: [
        { videoId: 'older', title: '', reason: 'A long reason without quotes', at: now - 2 },
        { videoId: 'newer', title: 'Newer title', reason: 'Newest reason', at: now - 1 }
      ] }
    };
    renderReasons();
  `);
  assert.equal(p.get('reasons-used').textContent, '3 of 3');
  assert.equal(p.get('reasons-total').textContent, '1 in all');
  assert.equal(p.get('reasons-week').querySelectorAll('.date').length, 2);
  assert.equal(p.get('reasons-week').querySelectorAll('.reason-rows')[0].getAttribute('aria-label'), 'November 6');
  assert.deepEqual(p.get('reasons-week').querySelectorAll('.date').map((el) => el.getAttribute('aria-hidden')), ['true', 'true']);
  const links = p.get('reasons-week').querySelectorAll('a');
  assert.equal(links[0].getAttribute('href'), 'https://www.youtube.com/watch?v=newer');
  assert.equal(links[0].getAttribute('title'), 'Newer title');
  assert.equal(links[0].getAttribute('target'), '_blank');
  assert.equal(links[0].getAttribute('rel'), 'noopener');
  assert.equal(links[1].querySelector('.reason-text').textContent, 'A long reason without quotes');
  assert.equal(links[1].querySelector('.reason-title-text').textContent, 'older');
  assert.equal(links[0].querySelector('.drip-i-arrow-up-right').getAttribute('aria-hidden'), 'true');
  links[0].focus();
  p.run('renderReasons()');
  assert.equal(p.get('reasons-week').querySelector('a'), links[0], 'ticks preserve the links and focus');
  assert.equal(p.document.activeElement, links[0]);
  p.run(`state.log['2026-11-06'].needThis[1].reason = 'Edited reason'; renderReasons()`);
  assert.equal(p.get('reasons-week').querySelector('.reason-text').textContent, 'Edited reason');
  p.run('state.settings.needThisPerWeek = 0; renderReasons()');
  assert.equal(p.get('reasons-used').textContent, '3');
  p.run('Date.now = () => new Date(2026, 11, 6, 12).getTime(); renderReasons()');
  assert.equal(p.get('reasons-used').textContent, '0');
  assert.equal(p.get('reasons-none').hidden, false);
  assert.equal(p.get('reasons-total').textContent, '4 in all');
  p.run('state.log = {}; renderReasons()');
  assert.equal(p.get('reasons-section').hidden, true);
});

test('Earlier paginates separately, focuses the first new link, and Show fewer restores five', async () => {
  const p = page();
  p.run(`state.log = {
    '2026-11-06': { needThis: Array.from({ length: 8 }, (_, i) => ({ videoId: 'recent' + i, title: 'Recent', reason: 'Recent reason', at: Date.now() - i })) },
    '2026-10-01': { needThis: Array.from({ length: 30 }, (_, i) => ({ videoId: 'old' + i, title: 'Old', reason: 'Old reason', at: Date.now() - 8 * 86400e3 - i })) }
  }; renderReasons()`);
  assert.equal(p.get('reasons-week').querySelectorAll('a').length, 8);
  assert.equal(p.get('reasons').querySelectorAll('a').length, 5);
  assert.match(p.get('reasons-more').textContent, /Show 20 more25 not shown/);
  await p.get('reasons-more').querySelector('[data-k="more"]').click();
  assert.equal(p.get('reasons').querySelectorAll('a').length, 25);
  assert.equal(p.document.activeElement, p.get('reasons').querySelectorAll('a')[5]);
  await p.get('reasons-more').querySelector('[data-k="more"]').click();
  assert.equal(p.get('reasons').querySelectorAll('a').length, 30);
  assert.equal(p.document.activeElement, p.get('reasons').querySelectorAll('a')[25]);
  assert.equal(p.get('reasons-more').querySelector('[data-k="more"]'), null);
  await p.get('reasons-more').querySelector('[data-k="fewer"]').click();
  assert.equal(p.get('reasons').querySelectorAll('a').length, 5);
  assert.equal(p.document.activeElement, p.get('reasons-more').querySelector('[data-k="more"]'));
  p.run(`delete state.log['2026-10-01']; renderReasons()`);
  assert.equal(p.get('reasons-earlier').hidden, true);
  assert.equal(p.get('reasons-section').hidden, false);
});

test('dev/options.html shows the same page as Settings, so the localhost copy never goes stale', () => {
  const body = (/** @type {string} */ file) => {
    const html = fs.readFileSync(file, 'utf8');
    return html.slice(html.indexOf('<body'));
  };
  assert.equal(body(path.join(__dirname, '..', 'dev', 'options.html')), body(path.join(SRC, 'options', 'options.html')),
    'copy the <body> of src/options/options.html into dev/options.html');
});
