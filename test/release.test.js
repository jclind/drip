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
    const problems = release.check(dir).join('\n');
    for (const want of [
      'src/popup/popup.html names popup.js', 'manifest.json names icons/48.png', 'manifest.json names src/content/early.css',
      'src/options/options.html names /src/icons/arrow-up-right.svg', "src/content/fade.js doesn't parse",
      'src/background.js names devpanel/worker.js', 'src/background.js still has runClock', 'src/background.js still has devpanel',
      'src/welcome/welcome.js names src/nope.html', 'src/devpanel is in the build',
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
