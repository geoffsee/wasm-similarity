import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkPackage } from '../scripts/check-package.mjs';

function fixture(t, wasm64) {
  const directory = mkdtempSync(join(tmpdir(), 'wasm-similarity-package-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const pkg = {
    name: 'wasm-similarity',
    version: wasm64 ? '1.0.14-wasm64' : '1.0.14',
    wasmTarget: wasm64 ? 'wasm64-unknown-unknown' : 'wasm32-unknown-unknown',
    publishConfig: { tag: wasm64 ? 'wasm64' : 'latest' },
    files: ['wasm_similarity_bg.wasm'],
  };
  const save = () => writeFileSync(join(directory, 'package.json'), JSON.stringify(pkg));
  save();
  // Valid minimal module defining one memory with an initial size of one page.
  writeFileSync(join(directory, 'wasm_similarity_bg.wasm'),
    new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 5, 3, 1, wasm64 ? 4 : 0, 1]));
  return { directory, pkg, save };
}

for (const wasm64 of [false, true]) {
  test(`accepts matching ${wasm64 ? 'wasm64' : 'wasm32'} metadata and memory`, t => {
    const { directory, pkg } = fixture(t, wasm64);
    assert.equal(checkPackage(directory, pkg.wasmTarget).version, pkg.version);
  });
}

test('rejects a wasm32 binary relabeled as wasm64', t => {
  const { directory, pkg, save } = fixture(t, false);
  pkg.version = '1.0.14-wasm64';
  pkg.wasmTarget = 'wasm64-unknown-unknown';
  pkg.publishConfig.tag = 'wasm64';
  save();
  assert.throws(() => checkPackage(directory, pkg.wasmTarget), /memory type/);
});

test('rejects wasm64 publication under latest', t => {
  const { directory, pkg, save } = fixture(t, true);
  pkg.publishConfig.tag = 'latest';
  save();
  assert.throws(() => checkPackage(directory, pkg.wasmTarget));
});

test('rejects the ambiguous dot-suffixed npm version', t => {
  const { directory, pkg, save } = fixture(t, true);
  pkg.version = '1.0.14.wasm64';
  save();
  assert.throws(() => checkPackage(directory, pkg.wasmTarget));
});

test('rejects publishing a package for the other target', t => {
  const { directory } = fixture(t, true);
  assert.throws(() => checkPackage(directory, 'wasm32-unknown-unknown'), /target mismatch/);
});
