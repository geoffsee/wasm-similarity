import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkPackage } from '../scripts/check-package.mjs';

const target = process.env.WASM_TARGET ?? 'wasm32-unknown-unknown';
const directory = resolve(process.env.PKG_DIR ?? (target === 'wasm64-unknown-unknown' ? 'pkg-wasm64' : 'pkg'));

test('package metadata and compiled memory match the selected target', () => {
  checkPackage(directory, target);
});

const api = await import(pathToFileURL(resolve(directory, 'wasm_similarity.js')).href);

test('scalar and batch APIs accept the same typed arrays and numeric sizes', () => {
  const a = new Float64Array([1, 0]);
  const b = new Float64Array([0, 1]);
  assert.equal(api.cosine_similarity(a, a), 1);
  assert.equal(api.cosine_distance(a, b), 1);
  assert.equal(api.squared_euclidean_distance(a, b), 2);
  assert.deepEqual(
    api.cosine_similarity_dataspace(new Float64Array([0, 1, 1, 0]), 2, 2, a),
    new Float64Array([1, 1]),
  );
  assert.equal(api.jaccard_index(new Int32Array([1, 2]), new Int32Array([2, 3])), 1 / 3);
});

test('raw pointers remain numeric byte offsets usable by typed arrays', () => {
  const pointer = api.alloc_f64(2);
  try {
    assert.equal(typeof pointer, 'number');
    assert.ok(Number.isSafeInteger(pointer) && pointer > 0);
    new Float64Array(api.wasm_memory().buffer, pointer, 2).set([3, 4]);
    assert.equal(api.euclidean_distance_raw(pointer, 2, pointer, 2), 0);
  } finally {
    api.dealloc_f64(pointer, 2);
  }
});

test('SimilarityContext supports all metrics, buffer reuse, and freeing', () => {
  const context = new api.SimilarityContext(2);
  try {
    context.setA(new Float64Array([1, 0]));
    context.setB(new Float64Array([0, 1]));
    assert.equal(context.cosineSimilarity(), 0);
    assert.equal(context.cosineDistance(), 1);
    assert.equal(context.euclideanDistance(), Math.sqrt(2));
    assert.equal(context.squaredEuclideanDistance(), 2);
    context.setB(new Float64Array([1, 0]));
    assert.equal(context.cosineSimilarity(), 1);
  } finally {
    context.free();
    context.free();
  }
});
