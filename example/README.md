# WASM Similarity Example & Tests

This package demonstrates and tests the `wasm-similarity` WebAssembly module for computing vector similarity and distance metrics.

## Installation

This package uses a local file dependency to the WASM module:

```bash
npm install
```

## API

### Scalar functions

All scalar functions accept `Float64Array` (or plain arrays) unless noted otherwise.

| Function | Returns | Description |
|---|---|---|
| `cosine_similarity(a, b)` | `number` in [-1, 1] | Cosine similarity between two vectors |
| `cosine_distance(a, b)` | `number` in [0, 2] | Cosine distance (1 - similarity) |
| `euclidean_distance(a, b)` | `number` ≥ 0 | Euclidean (L2) distance |
| `squared_euclidean_distance(a, b)` | `number` ≥ 0 | Squared Euclidean distance |
| `jaccard_index(a, b)` | `number` in [0, 1] | Jaccard index (accepts `Int32Array`) |
| `hit_rate(actual, predicted, tolerance)` | `number` in [0, 1] | Fraction of elements within tolerance |
| `overshoot_rate(actual, predicted, tolerance)` | `number` in [0, 1] | Fraction of elements overshooting by more than tolerance |

### Dataspace (batch) functions

Rank a set of vectors against a query vector in a single call. All return a `Float64Array` of interleaved `[score, index, score, index, ...]` pairs, sorted by score.

| Function | Sort order |
|---|---|
| `cosine_similarity_dataspace(flat, numVectors, dim, query)` | Descending (most similar first) |
| `cosine_distance_dataspace(flat, numVectors, dim, query)` | Ascending (nearest first) |
| `euclidean_distance_dataspace(flat, numVectors, dim, query)` | Ascending |
| `squared_euclidean_distance_dataspace(flat, numVectors, dim, query)` | Ascending |
| `jaccard_index_dataspace(setA, setsBFlat, numSets, setSize)` | Descending |

`flat` is a `Float64Array` of all vectors concatenated (`numVectors * dim` elements).

### Zero-copy functions

For hot loops, you can allocate buffers directly in WASM linear memory to avoid copying:

```typescript
import { alloc_f64, dealloc_f64, cosine_similarity_raw, wasm_memory } from 'wasm-similarity';

const ptr = alloc_f64(dim);
const mem = new Float64Array(wasm_memory().buffer);
mem.set(vector, ptr / 8);
// ... use cosine_similarity_raw(ptrA, dimA, ptrB, dimB) ...
dealloc_f64(ptr, dim);
```

## Usage

```typescript
import { cosine_similarity, cosine_similarity_dataspace } from 'wasm-similarity';

// Scalar similarity
const sim = cosine_similarity(
  new Float64Array([1, 2, 3]),
  new Float64Array([4, 5, 6]),
);
// ~0.975

// Batch ranking
const numVectors = 3;
const dim = 3;
const flat = new Float64Array([
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
]);
const query = new Float64Array([1, 0, 0]);
const ranked = cosine_similarity_dataspace(flat, numVectors, dim, query);
// ranked = [1.0, 0, 0.0, 1, 0.0, 2]  (score, index pairs)
```

## Running tests

```bash
npm test
```

## Running benchmarks

```bash
node --experimental-strip-types benchmarks/benchmark.ts
node --experimental-strip-types benchmarks/benchmark-ml-distance.ts
```

## Requirements

- Node.js with ES modules support
- The compiled WASM artifacts in the `../pkg` directory (run `../build.sh` to build)
