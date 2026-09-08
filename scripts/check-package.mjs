import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Inspect the memory section itself: a filename or manifest cannot prove that
// the compiler produced memory64. Bit 2 of a memory's limits flags is memory64.
function usesMemory64(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [0, 97, 115, 109, 1, 0, 0, 0]);
  let offset = 8;
  function leb() {
    let value = 0;
    let shift = 0;
    let byte;
    do {
      assert.ok(offset < bytes.length && shift < 53, 'Invalid Wasm integer');
      byte = bytes[offset++];
      value += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    return value;
  }
  while (offset < bytes.length) {
    const section = bytes[offset++];
    const size = leb();
    const end = offset + size;
    assert.ok(end <= bytes.length, 'Truncated Wasm section');
    if (section === 5) {
      assert.equal(leb(), 1, 'Expected one defined linear memory');
      return Boolean(leb() & 4);
    }
    offset = end;
  }
  throw new Error('Package has no defined linear memory');
}

export function checkPackage(directory, target) {
  assert.ok(['wasm32-unknown-unknown', 'wasm64-unknown-unknown'].includes(target));
  const pkg = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'wasm-similarity');
  assert.equal(pkg.wasmTarget, target, 'Package target mismatch; rebuild first');
  const wasm64 = target === 'wasm64-unknown-unknown';
  if (wasm64) {
    assert.match(pkg.version, /^\d+\.\d+\.\d+-(?:[0-9A-Za-z-]+\.)*wasm64$/);
    assert.equal(pkg.publishConfig.tag, 'wasm64');
  } else {
    assert.doesNotMatch(pkg.version, /[-.]wasm64$/);
    assert.equal(pkg.publishConfig.tag, 'latest');
  }
  for (const file of pkg.files) readFileSync(resolve(directory, file));
  const bytes = readFileSync(resolve(directory, 'wasm_similarity_bg.wasm'));
  assert.equal(usesMemory64(bytes), wasm64, 'Compiled Wasm memory type does not match package target');
  return pkg;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , directory, target] = process.argv;
  const pkg = checkPackage(directory, target);
  console.log(`Validated ${pkg.name}@${pkg.version} (${target}, tag ${pkg.publishConfig.tag})`);
}
