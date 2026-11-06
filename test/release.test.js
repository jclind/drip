// @ts-check
// Exercise the release script's rewrite in memory. The full build requires a clean, committed checkout.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

test('the store rewrite removes the dev clock import and panel references from the copied worker', () => {
  const script = fs.readFileSync(path.join(ROOT, 'bin/build-release'), 'utf8');
  const rewrite = script.match(/<<'NODE'\n([\s\S]*?)\nNODE/);
  assert.ok(rewrite, 'the packaging rewrite exists');
  const source = fs.readFileSync(path.join(ROOT, 'src/background.js'), 'utf8');
  assert.match(source, /importScripts\('devpanel\/clock\.js'\)/, 'unpacked installs retain the dev clock');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const files = new Map([['release/src/background.js', source]]);
  vm.runInNewContext(rewrite[1], {
    process: { argv: ['node', '-', 'release'] },
    require: (/** @type {string} */ name) => {
      if (name === './manifest.json') return structuredClone(manifest);
      assert.equal(name, 'node:fs');
      return {
        readFileSync: (/** @type {string} */ file) => {
          assert.ok(files.has(file), `unexpected read: ${file}`);
          return files.get(file);
        },
        writeFileSync: (/** @type {string} */ file, /** @type {string} */ value) => {
          assert.ok(['release/manifest.json', 'release/src/background.js'].includes(file), `unexpected write: ${file}`);
          files.set(file, value);
        },
      };
    },
  });
  const built = files.get('release/src/background.js');
  assert.ok(built);
  assert.doesNotMatch(built, /devpanel/);
  assert.deepEqual([...built.matchAll(/importScripts\('([^']+)'\)/g)].map((m) => m[1]), ['lib/state.js', 'lib/glass.js']);
  assert.match(built, /^const shipsPanel = false;$/m);
  assert.doesNotThrow(() => new vm.Script(built));
  const builtManifest = files.get('release/manifest.json');
  assert.ok(builtManifest);
  const shippingManifest = JSON.parse(builtManifest);
  assert.equal(shippingManifest.externally_connectable, undefined);
  assert.doesNotMatch(JSON.stringify(shippingManifest), /devpanel|localhost/);
});
