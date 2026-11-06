// @ts-check

// icons.js hands the content scripts' CSS masks data: URLs, never chrome-extension:// ones, which Chrome logs as
// "Unsafe attempt to load URL" on drip's card (Jesse, 2026-11-05).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (/** @type {string} */ p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/**
 * Loads icons.js with a fake chrome and a fetch that serves src/icons, or fails for the names in `broken`. With
 * `prerendering`, the page starts hidden and `show()` activates it.
 */
function load(broken = new Set(), prerendering = false) {
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
    chrome: { runtime: { getURL: (/** @type {string} */ p) => `chrome-extension://abc/${p}` } },
    fetch: async (/** @type {string} */ url) => {
      fetched.push(url);
      const file = url.replace('chrome-extension://abc/', '');
      const name = path.basename(file, '.svg');
      if (broken.has(name)) return { ok: false, status: 404, text: async () => '' };
      return { ok: true, status: 200, text: async () => read(file) };
    },
  });
  context.globalThis = context;
  vm.runInContext(read('src/content/icons.js'), context);
  const show = () => { document.prerendering = false; activate.splice(0).forEach((fn) => fn()); };
  return { icons: context.DripIcons, fetched, show };
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

test('every icon is fetched once at load, and paint gives a data: URL of that file', async () => {
  const { icons, fetched } = load();
  await settle();
  assert.equal(fetched.length, icons.NAMES.length);
  const span = el();
  icons.paint(span, 'clock');
  const value = span.props['--drip-icon'];
  assert.match(value, /^url\("data:image\/svg\+xml;charset=utf-8,/);
  assert.ok(!value.includes('chrome-extension://'));
  const svg = decodeURIComponent(value.slice('url("data:image/svg+xml;charset=utf-8,'.length, -2));
  assert.equal(svg, read('src/icons/clock.svg'));
  assert.ok(!value.slice(5, -2).includes('"'), 'no quote inside url("...")');
  icons.paint(el(), 'clock');
  assert.equal(fetched.length, icons.NAMES.length, 'no second fetch');
});

test('an icon drawn before it has loaded is blank, then filled in, and never points at chrome-extension://', async () => {
  const { icons } = load();
  const span = el();
  icons.paint(span, 'drop');
  assert.equal(span.props['--drip-icon'], undefined);
  await settle();
  assert.match(span.props['--drip-icon'], /^url\("data:/);
});

test('an icon that failed to load is fetched again on the next paint', async () => {
  const broken = new Set(['x']);
  const { icons, fetched } = load(broken);
  await settle();
  const span = el();
  icons.paint(span, 'x');
  await settle();
  assert.equal(span.props['--drip-icon'], undefined);
  broken.clear();
  icons.paint(span, 'x');
  await settle();
  assert.match(span.props['--drip-icon'], /^url\("data:/);
  assert.equal(fetched.filter((u) => u.endsWith('/x.svg')).length, 3);
});

test('the manifest loads icons.js before menu.js and before common.js', () => {
  const manifest = JSON.parse(read('manifest.json'));
  for (const script of ['src/content/menu.js', 'src/content/common.js']) {
    const entry = manifest.content_scripts.find((/** @type {any} */ c) => c.js?.includes(script));
    assert.ok(entry, script);
    assert.ok(entry.js.indexOf('src/content/icons.js') >= 0 && entry.js.indexOf('src/content/icons.js') < entry.js.indexOf(script), script);
  }
});

test('no content script sets a chrome-extension:// URL as a mask any more', () => {
  for (const file of ['src/content/menu.js', 'src/content/common.js']) {
    const src = read(file);
    for (const line of src.split('\n').filter((l) => l.includes("'--drip-icon'") && l.includes('getURL'))) {
      // common.js keeps one, behind `if (icons)`, for the Node tests that load it without icons.js.
      assert.ok(file.endsWith('common.js') && /else el\.style/.test(line), `${file}: ${line.trim()}`);
    }
  }
});

test('a prerendered page loads no icon until it is shown, then loads them all and fills in what was drawn', async () => {
  const { icons, fetched, show } = load(new Set(), true);
  const span = el();
  icons.paint(span, 'clock');
  await settle();
  assert.equal(fetched.length, 0, 'nothing fetched while prerendering');
  assert.equal(span.props['--drip-icon'], undefined);
  show();
  await settle();
  assert.equal(fetched.length, icons.NAMES.length);
  assert.match(span.props['--drip-icon'], /^url\("data:/);
});
