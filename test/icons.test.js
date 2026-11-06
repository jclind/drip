// @ts-check

// YouTube's pages never load a chrome-extension:// icon themselves, which Chrome lists as "Unsafe attempt to load URL"
// under Errors on drip's card (Jesse, 2026-11-05). icons.js gets the SVG text from the worker and makes data: URLs.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (/** @type {string} */ p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/**
 * Loads icons.js with a fake worker that answers { type: 'icons' } from src/icons, or fails while `fail.on`. With
 * `prerendering`, the page starts hidden and `show()` activates it. Any fetch is recorded, to prove there are none.
 */
function load({ fail = { on: false }, prerendering = false } = {}) {
  /** @type {any[]} */
  const asked = [];
  /** @type {string[]} */
  const fetched = [];
  /** @type {(() => void)[]} */
  const activate = [];
  const document = {
    prerendering,
    addEventListener: (/** @type {string} */ type, /** @type {() => void} */ fn) => { if (type === 'prerenderingchange') activate.push(fn); },
  };
  const context = vm.createContext({
    document,
    fetch: async (/** @type {string} */ url) => { fetched.push(url); throw new Error('no fetch'); },
    chrome: { runtime: {
      getURL: (/** @type {string} */ p) => `chrome-extension://abc/${p}`,
      sendMessage: async (/** @type {any} */ msg) => {
        asked.push(msg);
        if (fail.on) throw new Error('Could not establish connection');
        /** @type {Record<string, string>} */
        const icons = {};
        for (const name of msg.names) icons[name] = read(`src/icons/${name}.svg`);
        return { ok: true, icons };
      },
    } },
  });
  context.globalThis = context;
  vm.runInContext(read('src/content/icons.js'), context);
  const show = () => { document.prerendering = false; activate.splice(0).forEach((fn) => fn()); };
  return { icons: context.DripIcons, asked, fetched, show };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

/** A fake element with a style that records custom properties. */
function el() {
  /** @type {Record<string, string>} */
  const props = {};
  return { props, style: { setProperty: (/** @type {string} */ k, /** @type {string} */ v) => { props[k] = v; } } };
}

test('icons.js lists every file in src/icons, and nothing else', () => {
  const files = fs.readdirSync(path.join(ROOT, 'src/icons')).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();
  const { icons } = load();
  assert.deepEqual([...icons.NAMES].sort(), files);
});

test('the icons come from one message to the worker, with no fetch, and paint gives a data: URL of the file', async () => {
  const { icons, asked, fetched } = load();
  await settle();
  assert.equal(asked.length, 1);
  assert.equal(asked[0].type, 'icons');
  assert.deepEqual(fetched, []);
  const span = el();
  icons.paint(span, 'clock');
  const value = span.props['--drip-icon'];
  assert.match(value, /^url\("data:image\/svg\+xml;charset=utf-8,/);
  assert.ok(!value.includes('chrome-extension://'));
  const svg = decodeURIComponent(value.slice('url("data:image/svg+xml;charset=utf-8,'.length, -2));
  assert.equal(svg, read('src/icons/clock.svg'));
  assert.ok(!value.slice(5, -2).includes('"'), 'no quote inside url("...")');
  icons.paint(el(), 'x');
  await settle();
  assert.equal(asked.length, 1, 'no second message');
});

test('an icon drawn before the answer is blank, then filled in', async () => {
  const { icons } = load();
  const span = el();
  icons.paint(span, 'drop');
  assert.equal(span.props['--drip-icon'], undefined);
  await settle();
  assert.match(span.props['--drip-icon'], /^url\("data:/);
});

test('a worker that did not answer is asked again on the next paint', async () => {
  const fail = { on: true };
  const { icons, asked } = load({ fail });
  await settle();
  const span = el();
  icons.paint(span, 'x');
  await settle();
  assert.equal(span.props['--drip-icon'], undefined);
  fail.on = false;
  icons.paint(span, 'x');
  await settle();
  assert.match(span.props['--drip-icon'], /^url\("data:/);
  assert.equal(asked.length, 3);
});

test('a prerendered page asks for nothing until it is shown, then fills in what was drawn', async () => {
  const { icons, asked, show } = load({ prerendering: true });
  const span = el();
  icons.paint(span, 'clock');
  await settle();
  assert.equal(asked.length, 0);
  assert.equal(span.props['--drip-icon'], undefined);
  show();
  await settle();
  assert.equal(asked.length, 1);
  assert.match(span.props['--drip-icon'], /^url\("data:/);
});

test('the manifest loads icons.js before menu.js and before common.js', () => {
  const manifest = JSON.parse(read('manifest.json'));
  for (const script of ['src/content/menu.js', 'src/content/common.js']) {
    const entry = manifest.content_scripts.find((/** @type {any} */ c) => c.js?.includes(script));
    assert.ok(entry, script);
    assert.ok(entry.js.indexOf('src/content/icons.js') >= 0 && entry.js.indexOf('src/content/icons.js') < entry.js.indexOf(script), script);
  }
});

test('no content script loads a chrome-extension:// file on YouTube', () => {
  for (const file of fs.readdirSync(path.join(ROOT, 'src/content')).filter((f) => f.endsWith('.js'))) {
    const lines = read(`src/content/${file}`).split('\n').filter((l) => l.includes('getURL(') && !l.trim().startsWith('//'));
    for (const line of lines) {
      // common.js and pour.js keep one each, for drip's own pages (and Node tests), where icons.js isn't loaded.
      const allowed = (file === 'common.js' && /else el\.style/.test(line)) || (file === 'pour.js' && /icons \?/.test(line));
      assert.ok(allowed, `${file}: ${line.trim()}`);
    }
  }
});
