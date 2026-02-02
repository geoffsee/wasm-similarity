# wasm-similarity

High-performance vector similarity and distance metrics compiled to WebAssembly from Rust. Works in Node.js and the browser.

## Why

JavaScript is not great at crunching large floating-point arrays. This library moves the hot loop into WebAssembly compiled from Rust, so you get near-native throughput without leaving your JS/TS stack. It is a good fit anywhere you work with embedding vectors (search, recommendations, RAG pipelines, clustering) and need results fast — in the browser or on the server.

## Choosing a metric

| Metric | What it measures | When to reach for it |
|---|---|---|
| **Cosine similarity** | Directional alignment, ignoring magnitude | Comparing text/image embeddings from models like OpenAI, Cohere, or CLIP where vectors are normalized or you only care about orientation |
| **Cosine distance** | Complement of cosine similarity (`1 - sim`) | Same scenarios as above but you need a *distance* (lower = closer) for use in nearest-neighbor indexes or clustering algorithms like k-means |
| **Euclidean distance** | Straight-line (L2) distance in vector space | When magnitude matters — e.g. comparing sensor readings, physical coordinates, or unnormalized feature vectors where two points being "far apart" has real meaning |
| **Squared Euclidean distance** | L2 without the square root | Anywhere you would use Euclidean distance but want to skip the sqrt for speed — ranking order is preserved, so it works for nearest-neighbor searches and comparisons where you don't need the true distance value |
| **Hit rate** | Fraction of predictions within a tolerance | Evaluating regression or forecast models — "what percentage of my price predictions landed within $5 of the actual price?" |
| **Overshoot rate** | Fraction of predictions that exceed actuals beyond a tolerance | Risk-sensitive forecasting — e.g. capacity planning where overestimating demand leads to wasted resources, or latency budgets where overshooting an SLO matters more than undershooting |
| **Jaccard index** | Set overlap (intersection / union) | Comparing tag sets, user preference lists, or tokenized documents — "how much do these two users' liked-item sets overlap?" |
| **Dataspace ranking** | Batch cosine similarity sort against a query | Semantic search: given a user query embedding and a corpus of document embeddings, rank every document by relevance in a single WASM call |

## Install

```bash
npm install wasm-similarity
```

## Docs

Full API documentation with examples is published at:\
**<https://geoffsee.github.io/wasm-similarity/>**

## API

### Scalar functions

| Function | Description | Input | Output |
|---|---|---|---|
| `cosine_similarity(a, b)` | Cosine of the angle between two vectors | `a: Float64Array, b: Float64Array` | `number \| undefined` in `[-1, 1]` |
| `cosine_distance(a, b)` | `1 - cosine_similarity` | `a: Float64Array, b: Float64Array` | `number \| undefined` in `[0, 2]` |
| `euclidean_distance(a, b)` | L2 distance | `a: Float64Array, b: Float64Array` | `number \| undefined` in `[0, +inf)` |
| `squared_euclidean_distance(a, b)` | L2 distance without the sqrt | `a: Float64Array, b: Float64Array` | `number \| undefined` in `[0, +inf)` |
| `hit_rate(actual, predicted, tol)` | Fraction of predictions within tolerance | `actual: Float64Array, predicted: Float64Array, tolerance: number` | `number \| undefined` in `[0, 1]` |
| `overshoot_rate(actual, predicted, tol)` | Fraction of predictions that overshoot | `actual: Float64Array, predicted: Float64Array, tolerance: number` | `number \| undefined` in `[0, 1]` |
| `jaccard_index(a, b)` | Set intersection over union | `a: Int32Array, b: Int32Array` | `number` in `[0, 1]` |

### Dataspace functions (batch ranking via typed arrays)

All dataspace functions pass data directly through WASM linear memory — no JSON serialization. They return a `Float64Array` of interleaved `[score, index, score, index, ...]` pairs, sorted by score.

| Function | Description | Input | Output |
|---|---|---|---|
| `cosine_similarity_dataspace(flat, n, dim, query)` | Rank vectors by cosine similarity (desc) | `flat: Float64Array, n: number, dim: number, query: Float64Array` | `Float64Array` `[score, index, ...]` |
| `cosine_distance_dataspace(flat, n, dim, query)` | Rank vectors by cosine distance (asc) | `flat: Float64Array, n: number, dim: number, query: Float64Array` | `Float64Array` `[score, index, ...]` |
| `euclidean_distance_dataspace(flat, n, dim, query)` | Rank vectors by Euclidean distance (asc) | `flat: Float64Array, n: number, dim: number, query: Float64Array` | `Float64Array` `[score, index, ...]` |
| `squared_euclidean_distance_dataspace(flat, n, dim, query)` | Rank vectors by squared Euclidean distance (asc) | `flat: Float64Array, n: number, dim: number, query: Float64Array` | `Float64Array` `[score, index, ...]` |
| `jaccard_index_dataspace(setA, setsFlat, n, setSize)` | Rank sets by Jaccard index (desc) | `setA: Int32Array, setsFlat: Int32Array, n: number, setSize: number` | `Float64Array` `[score, index, ...]` |

## Usage

```typescript
import {
  cosine_similarity,
  cosine_distance,
  euclidean_distance,
  jaccard_index,
} from "wasm-similarity";

const a = new Float64Array([1, 0, 0]);
const b = new Float64Array([0, 1, 0]);

cosine_similarity(a, a); // 1.0
cosine_similarity(a, b); // 0.0
cosine_distance(a, b);   // 1.0
euclidean_distance(a, b); // 1.4142...

jaccard_index(new Int32Array([1, 2, 3]), new Int32Array([2, 3, 4])); // 0.5
```

### Batch ranking (vector dataspaces)

Rank a set of vectors against a query vector in a single call. Flatten your vectors into a row-major `Float64Array`:

```typescript
import { cosine_similarity_dataspace } from "wasm-similarity";

const vectors = [[1, 0], [0, 1], [1, 1]];
const dim = 2;
const flat = new Float64Array(vectors.flat());
const query = new Float64Array([1, 0]);

const result = cosine_similarity_dataspace(flat, vectors.length, dim, query);
// result: Float64Array [score0, index0, score1, index1, ...]

// Parse the interleaved results
for (let i = 0; i < result.length; i += 2) {
  console.log(`index=${result[i + 1]}, score=${result[i]}`);
}
```

The same pattern works for `cosine_distance_dataspace`, `euclidean_distance_dataspace`, and `squared_euclidean_distance_dataspace`.

### Batch ranking (set dataspace)

Rank multiple sets against a reference set by Jaccard index. Flatten all candidate sets into a single `Int32Array` (all sets must be the same size):

```typescript
import { jaccard_index_dataspace } from "wasm-similarity";

const setA = new Int32Array([1, 2, 3]);
const setsB = new Int32Array([2, 3, 4, 5, 6, 7]); // two sets of size 3, flattened

const result = jaccard_index_dataspace(setA, setsB, 2, 3);
// result: Float64Array [0.5, 0, 0.0, 1] — set 0 scores 0.5, set 1 scores 0.0
```

## Benchmarks

Measured on Node.js with `Float64Array` inputs on both sides for a fair comparison. All vectors are dim=3072 (OpenAI embedding size). See [issue #3](https://github.com/geoffsee/wasm-similarity/issues/3) for full methodology and analysis.

### vs pure TypeScript

| Operation (dim=3072) | TypeScript | wasm-similarity | Winner |
|---|---|---|---|
| cosine_similarity | 509.3K ops/s | 659.8K ops/s | **WASM 1.30x** |
| cosine_distance | 508.6K ops/s | 672.5K ops/s | **WASM 1.32x** |
| euclidean_distance | 548.5K ops/s | 1.02M ops/s | **WASM 1.85x** |
| jaccard_index (size=3072) | 4.1K ops/s | 8.5K ops/s | **WASM 2.10x** |
| cosine_similarity_dataspace (200 vectors) | 2.5K ops/s | 3.6K ops/s | **WASM 1.45x** |

#### vs pure TypeScript across dimensions

| dim | cosine_similarity | cosine_distance | euclidean_distance |
|---|---|---|---|
| 256 | TS 1.12x | TS 1.52x | ~parity |
| 768 | **WASM 1.16x** | **WASM 1.15x** | **WASM 1.50x** |
| 1024 | **WASM 1.27x** | **WASM 1.24x** | **WASM 1.61x** |
| 2048 | **WASM 1.36x** | **WASM 1.32x** | **WASM 1.87x** |
| 3072 | **WASM 1.30x** | **WASM 1.32x** | **WASM 1.85x** |

WASM advantage grows with vector dimensionality, with euclidean distance showing the largest gains.

### vs ml-distance

| Operation (dim=3072) | ml-distance | wasm-similarity | Winner |
|---|---|---|---|
| cosine_similarity | 483.7K ops/s | 953.0K ops/s¹ | **WASM 1.97x** |
| euclidean_distance | 531.4K ops/s | 1.01M ops/s | **WASM 1.91x** |
| squared_euclidean | 522.7K ops/s | 1.02M ops/s | **WASM 1.94x** |
| cosine_similarity_dataspace (200 vectors) | 2.5K ops/s | 3.7K ops/s | **WASM 1.48x** |

¹ Using `SimilarityContext` zero-copy path.

All vectors are dim=3072 (OpenAI embedding size). WASM wins across the board at realistic embedding dimensions.

### vs ml-distance across dimensions

| dim | cosine_similarity¹ | euclidean_distance | squared_euclidean |
|---|---|---|---|
| 256 | **WASM 1.96x** | WASM 1.10x | ml-dist 1.16x |
| 768 | **WASM 1.89x** | **WASM 1.63x** | **WASM 1.50x** |
| 1024 | **WASM 1.93x** | **WASM 1.68x** | **WASM 1.58x** |
| 2048 | **WASM 1.88x** | **WASM 1.82x** | **WASM 1.85x** |
| 3072 | **WASM 1.89x** | **WASM 1.82x** | **WASM 1.83x** |

¹ Using `SimilarityContext` zero-copy path.

The zero-copy cosine path holds a consistent ~1.9x advantage at all dimensions. Euclidean and squared-euclidean cross over to a clear WASM win at dim≥768, where the compute cost dominates the JS↔WASM boundary overhead.

## Cost savings at scale

Consider an e-commerce platform serving personalized product recommendations. Each page load compares a user's embedding against a candidate set using cosine similarity (dim=3072). The table below projects compute costs on AWS Lambda (arm64, 1 GB, us-east-1 at $0.0000133/GB-s) for a pure-JS stack vs wasm-similarity, based on the benchmarks above.

| Traffic | Daily comparisons | Monthly JS compute cost | Monthly WASM compute cost | Monthly savings |
|---|---|---|---|---|
| 1 M pages/day | 200 M | ~$132 | ~$91 | **$41 (~31%)** |
| 10 M pages/day | 2 B | ~$1,320 | ~$910 | **$410 (~31%)** |
| 50 M pages/day | 10 B | ~$6,600 | ~$4,550 | **$2,050 (~31%)** |

Assumptions: 200 candidate vectors ranked per page load via `cosine_similarity_dataspace`. JS baseline uses pure TypeScript at 2.5K ops/s; wasm-similarity runs at 3.6K ops/s (1.45x, from benchmarks above). Costs reflect only similarity compute time per invocation.

Over a year, a mid-size platform at 10 M daily page views saves roughly **$4,900** — and a high-traffic site at 50 M saves roughly **$24,600** — from a one-line import change with no native dependencies and no infrastructure changes.

## Build from source

Requires `wasm-bindgen-cli` and the `wasm32-unknown-unknown` target:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli
./build.sh
```

## Run tests

```bash
cd example && npm install && npm test
```

## License

MIT OR Apache-2.0
