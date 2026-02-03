#!/usr/bin/env -S node --experimental-strip-types
import {
  cosine_similarity,
  cosine_distance,
  euclidean_distance,
  squared_euclidean_distance,
  cosine_similarity_dataspace,
  alloc_f64,
  dealloc_f64,
  cosine_similarity_raw,
  wasm_memory,
} from "wasm-similarity";
import { similarity, distance } from "ml-distance";

// ── Helpers ──────────────────────────────────────────────────────────

function randomVec(dim: number): Float64Array {
  const v = new Float64Array(dim);
  for (let i = 0; i < dim; i++) v[i] = Math.random() * 2 - 1;
  return v;
}

function bench(name: string, fn: () => void, iterations: number): number {
  for (let i = 0; i < Math.min(100, iterations); i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  return (iterations / elapsed) * 1000;
}

function fmt(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(0);
}

function report(label: string, mlOps: number, wasmOps: number) {
  const ratio = wasmOps / mlOps;
  console.log(
    `  ${label.padEnd(40)} ml-distance: ${fmt(mlOps).padStart(8)} ops/s | WASM: ${fmt(wasmOps).padStart(8)} ops/s | ${ratio > 1 ? "WASM" : "ml-dist"} ${ratio > 1 ? ratio.toFixed(2) : (1 / ratio).toFixed(2)}x faster`
  );
}

// ── Warm up WASM module ──────────────────────────────────────────────

cosine_similarity(new Float64Array([1, 2, 3]), new Float64Array([4, 5, 6]));

// ── Benchmarks ───────────────────────────────────────────────────────

console.log("\n=== wasm-similarity vs ml-distance benchmark ===\n");

// Both libraries receive the same Float64Array inputs
for (const dim of [256, 768, 1024, 2048, 3072]) {
  const a = randomVec(dim);
  const b = randomVec(dim);
  const iters = dim === 128 ? 50_000 : 10_000;

  console.log(`Scalar operations (dim=${dim}, ${iters.toLocaleString()} iterations):`);

  const mlCos = bench("ml-cosine", () => similarity.cosine(a, b), iters);
  const wasmCos = bench("wasm-cosine", () => cosine_similarity(a, b), iters);
  report("cosine_similarity", mlCos, wasmCos);

  // Zero-copy path: pre-allocate WASM buffers, write once, call many times
  {
    const ptrA = alloc_f64(dim);
    const ptrB = alloc_f64(dim);
    const mem = new Float64Array((wasm_memory() as WebAssembly.Memory).buffer);
    mem.set(a, ptrA / 8);
    mem.set(b, ptrB / 8);
    const wasmRaw = bench("wasm-raw", () => cosine_similarity_raw(ptrA, dim, ptrB, dim), iters);
    report("cosine_similarity (zero-copy)", mlCos, wasmRaw);
    dealloc_f64(ptrA, dim);
    dealloc_f64(ptrB, dim);
  }

  const mlEuc = bench("ml-euclidean", () => distance.euclidean(a, b), iters);
  const wasmEuc = bench("wasm-euclidean", () => euclidean_distance(a, b), iters);
  report("euclidean_distance", mlEuc, wasmEuc);

  const mlSqEuc = bench("ml-sq-euclidean", () => distance.squaredEuclidean(a, b), iters);
  const wasmSqEuc = bench("wasm-sq-euclidean", () => squared_euclidean_distance(a, b), iters);
  report("squared_euclidean_distance", mlSqEuc, wasmSqEuc);

  console.log("");
}

// --- Dataspace: batch ranking (dim=3072) ---
{
  const dim = 3072;
  const numVectors = 200;
  const query = randomVec(dim);
  const vectors = Array.from({ length: numVectors }, () => randomVec(dim));
  const iters = 200;

  const flat = new Float64Array(numVectors * dim);
  for (let i = 0; i < numVectors; i++) {
    flat.set(vectors[i], i * dim);
  }

  console.log(`Dataspace cosine ranking (dim=${dim}, ${numVectors} vectors, ${iters} iterations):`);

  const mlDs = bench("ml-dataspace", () => {
    vectors
      .map((v, i) => ({ score: similarity.cosine(query, v), index: i }))
      .sort((a, b) => b.score - a.score);
  }, iters);
  const wasmDs = bench("wasm-dataspace", () => cosine_similarity_dataspace(flat, numVectors, dim, query), iters);
  report("cosine_similarity_dataspace", mlDs, wasmDs);
}

console.log("");
