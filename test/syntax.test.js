// @ts-check

// Every script parses. Most content scripts have no test that loads them, so a broken one would pass the rest of the
// suite and fail only in Chrome (Codex caught one in search.js, 2026-11-03).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');

/** @param {string} dir @returns {string[]} */
function scripts(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return scripts(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

test('every script under src parses', () => {
  const files = scripts(SRC);
  assert.ok(files.length > 20);
  for (const file of files) {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }), path.relative(SRC, file));
  }
});
