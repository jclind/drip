// @ts-check
// The store build, made from a copy of the working tree with the code bin/build-release runs (bin/release-tree). The
// real build needs a clean, committed checkout, and runs these tests first.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const release = require('../bin/release-tree');

/** What bin/build-release archives (manifest.json, src, icons), copied to a new folder. Dotfiles stay behind. */
function copyTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drip-release-'));
  for (const p of ['manifest.json', 'src', 'icons']) {
    fs.cpSync(path.join(ROOT, p), path.join(dir, p), { recursive: true, filter: (from) => !path.basename(from).startsWith('.') });
  }
  return dir;
}

/** The store build of the working tree. */
function storeBuild() {
  const dir = copyTree();
  release.strip(dir);
  return dir;
}

/** @param {string} dir @param {string} file */
const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');

test('the store build passes its own checks', () => {
  const dir = storeBuild();
  try {
    assert.deepEqual(release.check(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the store build has none of the dev tools', () => {
  const dir = storeBuild();
  try {
    const files = release.files(dir);
    assert.ok(!files.some((f) => f.startsWith('src/devpanel/')), 'src/devpanel is left out');
    const worker = read(dir, 'src/background.js');
    assert.deepEqual([...worker.matchAll(/importScripts\('([^']+)'\)/g)].map((m) => m[1]), ['lib/state.js', 'lib/glass.js']);
    for (const name of ['onMessageExternal', 'handleDev', 'runDevAction', 'runClock', 'devStatus', 'devAction', 'setDevMode', 'devpanel', 'localhost']) {
      assert.ok(!worker.includes(name), `the worker has ${name}`);
      assert.ok(!read(dir, 'src/lib/state.js').includes(name), `state.js has ${name}`);
    }
    for (const f of files.filter((f) => /\.(js|json|html|css)$/.test(f))) {
      for (const name of ['onMessageExternal', 'handleDev', 'runDevAction', 'runClock', 'DripDevClock']) {
        assert.ok(!read(dir, f).includes(name), `${f} has ${name}`);
      }
    }
    const manifest = JSON.parse(read(dir, 'manifest.json'));
    assert.equal(manifest.externally_connectable, undefined);
    assert.doesNotMatch(JSON.stringify(manifest), /devpanel|localhost/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the store build leaves out the icon art, which nothing references, and keeps the PNGs the manifest names', () => {
  const dir = storeBuild();
  try {
    const files = release.files(dir);
    assert.ok(fs.readdirSync(path.join(ROOT, 'icons/source')).some((f) => f.endsWith('.svg')), 'the checkout keeps the art');
    assert.deepEqual(files.filter((f) => f.startsWith('icons/')), ['icons/128.png', 'icons/16.png', 'icons/32.png', 'icons/48.png']);
    for (const f of files.filter((f) => /\.(js|json|html|css)$/.test(f))) {
      assert.ok(!read(dir, f).includes('icons/source'), `${f} names icons/source`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('YouTube pages load no file from the package, so the manifest exposes none to them', () => {
  // icons.js paints icons as data: URLs from SVG text the worker sends (test/icons.test.js), and the two getURL
  // fallbacks run only where icons.js isn't loaded, on the welcome page and in Node.
  const manifest = JSON.parse(read(ROOT, 'manifest.json'));
  assert.equal(manifest.web_accessible_resources, undefined);
  for (const entry of manifest.content_scripts) {
    for (const file of entry.css || []) {
      for (const url of release.cssUrls(read(ROOT, file))) assert.match(url, /^(data:|#)/, `${file}: url(${url.slice(0, 60)})`);
    }
    for (const file of [...(entry.js || []), ...(entry.css || [])]) {
      const code = read(ROOT, file).split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n');
      assert.ok(!code.includes('chrome-extension://') && !code.includes('@@extension_id'), `${file} names an extension URL`);
    }
  }
});

// Three entries list state.js, but a youtube.com tab runs it twice, once per run_at. Chrome runs a file once per run_at
// in a frame even when two entries list it. In Chrome 157 (2026-11-10) state.js ran once at document_start, though
// early.js's and redirect.js's entries both list it. So the second copy costs nothing. Dropping early.js's copy would
// work only with the two entries swapped, and redirect.js needs its own on m.youtube.com and youtube-nocookie.com.
test('every content script that uses Drip gets state.js first, and the idle entry keeps its own copy', () => {
  const manifest = JSON.parse(read(ROOT, 'manifest.json'));
  const entries = manifest.content_scripts.filter((/** @type {any} */ c) => c.js);
  // Chrome runs the entries for one run_at in manifest order, in one isolated world per frame. These keys would
  // change which frames and pages an entry reaches, and the check below doesn't follow them.
  for (const c of entries) {
    for (const key of ['all_frames', 'match_about_blank', 'match_origin_as_fallback', 'exclude_matches', 'include_globs', 'exclude_globs']) {
      assert.equal(c[key], undefined, `${c.js.join(', ')} has ${key}`);
    }
  }
  const isolated = (/** @type {any} */ c) => (c.world || 'ISOLATED') === 'ISOLATED';
  entries.forEach((/** @type {any} */ entry, /** @type {number} */ i) => {
    if (!isolated(entry)) return;
    const own = entry.js.indexOf('src/lib/state.js');
    entry.js.forEach((/** @type {string} */ file, /** @type {number} */ j) => {
      if (file === 'src/lib/state.js' || !/\bDrip\b/.test(read(ROOT, file).replace(/^\s*(\/\/|\*).*$/gm, ''))) return;
      if (own >= 0 && own < j) return;
      // Or an earlier entry with the same run_at, in the same world, on every page this one runs on, has loaded it.
      // Chrome injects those together, in manifest order. One with an earlier run_at doesn't count. In a tab that was
      // loading when drip was installed or updated, Chrome runs only the document_idle entries, so an idle entry
      // leaning on a document_start copy would find no Drip there.
      const runAt = entry.run_at || 'document_idle';
      const before = entries.slice(0, i).some((/** @type {any} */ c) => isolated(c) && (c.run_at || 'document_idle') === runAt
        && c.js.includes('src/lib/state.js') && entry.matches.every((/** @type {string} */ m) => c.matches.includes(m)));
      assert.ok(before, `${file} uses Drip before state.js loads at ${runAt}`);
    });
  });
  const idle = entries.find((/** @type {any} */ c) => c.js.includes('src/content/home.js'));
  assert.equal(idle.run_at, 'document_idle');
  assert.equal(idle.js[0], 'src/lib/state.js');
});

test('the unpacked tree keeps the dev tools, so the build has something to take out', () => {
  const worker = read(ROOT, 'src/background.js');
  assert.deepEqual([...worker.matchAll(/importScripts\('([^']+)'\)/g)].map((m) => m[1]),
    ['lib/state.js', 'lib/glass.js', 'devpanel/clock.js', 'devpanel/actions.js', 'devpanel/worker.js']);
  const manifest = JSON.parse(read(ROOT, 'manifest.json'));
  assert.ok(manifest.externally_connectable);
  assert.ok(manifest.content_scripts.some((/** @type {any} */ c) => (c.js || []).includes('src/devpanel/panel.js')));
});

test('the checks catch a build that is missing a file, has a script that does not parse, or still has dev code', () => {
  const dir = storeBuild();
  try {
    fs.rmSync(path.join(dir, 'src/popup/popup.js'));
    fs.rmSync(path.join(dir, 'icons/48.png'));
    fs.rmSync(path.join(dir, 'src/content/early.css'));
    fs.rmSync(path.join(dir, 'src/icons/arrow-up-right.svg'));
    fs.writeFileSync(path.join(dir, 'src/content/fade.js'), 'function (');
    fs.appendFileSync(path.join(dir, 'src/background.js'), "\nimportScripts('devpanel/worker.js');\nfunction runClock() {}\n");
    fs.appendFileSync(path.join(dir, 'src/welcome/welcome.js'), "\nchrome.runtime.getURL('src/nope.html');\n");
    fs.mkdirSync(path.join(dir, 'src/devpanel'));
    fs.writeFileSync(path.join(dir, 'src/devpanel/panel.js'), '');
    fs.mkdirSync(path.join(dir, 'icons/source'));
    fs.writeFileSync(path.join(dir, 'icons/source/icon-16.svg'), '<svg/>');
    const problems = release.check(dir).join('\n');
    for (const want of [
      'src/popup/popup.html names popup.js', 'manifest.json names icons/48.png', 'manifest.json names src/content/early.css',
      'src/options/options.html names /src/icons/arrow-up-right.svg', "src/content/fade.js doesn't parse",
      'src/background.js names devpanel/worker.js', 'src/background.js still has runClock', 'src/background.js still has devpanel',
      'src/welcome/welcome.js names src/nope.html', 'src/devpanel is in the build', 'icons/source is in the build',
    ]) assert.ok(problems.includes(want), `missing: ${want}\n${problems}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the build stops when it cannot find the dev imports to take out', () => {
  const dir = copyTree();
  try {
    const worker = path.join(dir, 'src/background.js');
    fs.writeFileSync(worker, read(dir, 'src/background.js').replace(/^importScripts\('devpanel\/[^']+'\);\n/gm, ''));
    assert.throws(() => release.strip(dir), /expected one block of devpanel imports/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
