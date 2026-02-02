#!/usr/bin/env -S node --experimental-strip-types
import {
  cosine_similarity,
  cosine_distance,
  euclidean_distance,
  jaccard_index,
  cosine_similarity_dataspace,
} from "wasm-similarity";

// ── Pure TypeScript implementations (using Float64Array for fair comparison) ──

function tsCosine(a: Float64Array, b: Float64Array): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function tsCosineDistance(a: Float64Array, b: Float64Array): number {
  return 1 - tsCosine(a, b);
}

function tsEuclidean(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function tsJaccard(a: Int32Array, b: Int32Array): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const v of setA) if (setB.has(v)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function tsCosineDataspace(query: Float64Array, vectors: Float64Array[], dim: number): { score: number; index: number }[] {
  return vectors
    .map((v, i) => ({ score: tsCosine(query, v), index: i }))
    .sort((a, b) => b.score - a.score);
}

// ── Helpers ──────────────────────────────────────────────────────────

function randomVec(dim: number): Float64Array {
  const v = new Float64Array(dim);
  for (let i = 0; i < dim; i++) v[i] = Math.random() * 2 - 1;
  return v;
}

function randomIntVec(size: number, offset = 0): Int32Array {
  const v = new Int32Array(size);
  for (let i = 0; i < size; i++) v[i] = i + offset;
  return v;
}

function bench(name: string, fn: () => void, iterations: number): number {
  // warmup
  for (let i = 0; i < Math.min(100, iterations); i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  const opsPerSec = (iterations / elapsed) * 1000;
  return opsPerSec;
}

function report(label: string, tsOps: number, wasmOps: number) {
  const ratio = wasmOps / tsOps;
  console.log(
    `  ${label.padEnd(40)} TS: ${fmt(tsOps)} ops/s | WASM: ${fmt(wasmOps)} ops/s | ${ratio > 1 ? "WASM" : "TS"} ${ratio > 1 ? ratio.toFixed(2) : (1 / ratio).toFixed(2)}x faster`
  );
}

function fmt(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(0);
}

// ── Warm up WASM module (exclude init overhead from benchmarks) ──────

cosine_similarity(new Float64Array([1, 2, 3]), new Float64Array([4, 5, 6]));

// ── Benchmarks ───────────────────────────────────────────────────────

console.log("\n=== wasm-similarity vs pure TypeScript benchmark ===\n");

// --- Scalar across dimensions ---
for (const dim of [256, 768, 1024, 2048, 3072]) {
  const a = randomVec(dim);
  const b = randomVec(dim);
  const iters = 10_000;

  console.log(`Scalar operations (dim=${dim}, ${iters.toLocaleString()} iterations):`);

  const tsCos = bench("ts-cosine", () => tsCosine(a, b), iters);
  const wasmCos = bench("wasm-cosine", () => cosine_similarity(a, b), iters);
  report("cosine_similarity", tsCos, wasmCos);

  const tsCosD = bench("ts-cosine-dist", () => tsCosineDistance(a, b), iters);
  const wasmCosD = bench("wasm-cosine-dist", () => cosine_distance(a, b), iters);
  report("cosine_distance", tsCosD, wasmCosD);

  const tsEuc = bench("ts-euclidean", () => tsEuclidean(a, b), iters);
  const wasmEuc = bench("wasm-euclidean", () => euclidean_distance(a, b), iters);
  report("euclidean_distance", tsEuc, wasmEuc);

  console.log("");
}

// --- Jaccard (set size=3072) ---
{
  const ia = randomIntVec(3072, 0);
  const ib = randomIntVec(3072, 1536);
  const iters = 5_000;

  console.log(`\nJaccard index (set size=3072, ${iters.toLocaleString()} iterations):`);

  const tsJ = bench("ts-jaccard", () => tsJaccard(ia, ib), iters);
  const wasmJ = bench("wasm-jaccard", () => jaccard_index(ia, ib), iters);
  report("jaccard_index", tsJ, wasmJ);
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

  console.log(`\nDataspace ranking (dim=${dim}, ${numVectors} vectors, ${iters} iterations):`);

  const tsDs = bench("ts-dataspace", () => tsCosineDataspace(query, vectors, dim), iters);
  const wasmDs = bench("wasm-dataspace", () => cosine_similarity_dataspace(flat, numVectors, dim, query), iters);
  report("cosine_similarity_dataspace", tsDs, wasmDs);
}

console.log("");
