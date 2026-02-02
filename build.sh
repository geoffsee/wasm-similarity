#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$ROOT_DIR/pkg"

rm -rf "$PKG_DIR"

echo "[build] Compiling wasm32-unknown-unknown (release)..."
cargo build --target wasm32-unknown-unknown --release

echo "[build] Running wasm-bindgen..."
wasm-bindgen "$ROOT_DIR/target/wasm32-unknown-unknown/release/wasm_similarity.wasm" \
  --out-dir "$PKG_DIR" \
  --target web \
  --typescript

# Optional: optimize with wasm-opt if available
if command -v wasm-opt >/dev/null 2>&1; then
  echo "[build] Optimizing with wasm-opt..."
  wasm-opt -O3 --enable-bulk-memory "$PKG_DIR/wasm_similarity_bg.wasm" -o "$PKG_DIR/wasm_similarity_bg.wasm"
else
  echo "[build] wasm-opt not found, skipping optimization"
fi

# Rename wasm-bindgen output and create auto-init wrapper for Node/Bun
mv "$PKG_DIR/wasm_similarity.js" "$PKG_DIR/wasm_similarity_core.js"

cat > "$PKG_DIR/wasm_similarity.js" <<'ENTRY'
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { initSync } from './wasm_similarity_core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmBytes = readFileSync(join(__dirname, 'wasm_similarity_bg.wasm'));
initSync({ module: wasmBytes });

export * from './wasm_similarity_core.js';
ENTRY

# Generate SimilarityContext convenience class
cat > "$PKG_DIR/similarity_context.js" <<'CTX'
import {
  alloc_f64,
  dealloc_f64,
  wasm_memory,
  cosine_similarity_raw,
  cosine_distance_raw,
  euclidean_distance_raw,
  squared_euclidean_distance_raw,
} from './wasm_similarity_core.js';

export class SimilarityContext {
  /** @param {number} dim Vector dimensionality */
  constructor(dim) {
    this._dim = dim;
    this._ptrA = alloc_f64(dim);
    this._ptrB = alloc_f64(dim);
    this._freed = false;
  }

  /** @param {Float64Array} v */
  setA(v) {
    const f64 = new Float64Array(wasm_memory().buffer, this._ptrA, this._dim);
    f64.set(v);
  }

  /** @param {Float64Array} v */
  setB(v) {
    const f64 = new Float64Array(wasm_memory().buffer, this._ptrB, this._dim);
    f64.set(v);
  }

  /** @returns {number} */
  cosineSimilarity() {
    return cosine_similarity_raw(this._ptrA, this._dim, this._ptrB, this._dim);
  }

  /** @returns {number} */
  cosineDistance() {
    return cosine_distance_raw(this._ptrA, this._dim, this._ptrB, this._dim);
  }

  /** @returns {number} */
  euclideanDistance() {
    return euclidean_distance_raw(this._ptrA, this._dim, this._ptrB, this._dim);
  }

  /** @returns {number} */
  squaredEuclideanDistance() {
    return squared_euclidean_distance_raw(this._ptrA, this._dim, this._ptrB, this._dim);
  }

  free() {
    if (this._freed) return;
    this._freed = true;
    dealloc_f64(this._ptrA, this._dim);
    dealloc_f64(this._ptrB, this._dim);
  }
}
CTX

cat > "$PKG_DIR/similarity_context.d.ts" <<'DTS'
export class SimilarityContext {
  constructor(dim: number);
  setA(v: Float64Array): void;
  setB(v: Float64Array): void;
  cosineSimilarity(): number;
  cosineDistance(): number;
  euclideanDistance(): number;
  squaredEuclideanDistance(): number;
  free(): void;
}
DTS

# Append re-export of SimilarityContext to entry point
echo "export { SimilarityContext } from './similarity_context.js';" >> "$PKG_DIR/wasm_similarity.js"

# Generate package.json from Cargo.toml metadata
CARGO_VERSION=$(sed -n 's/^version = "\(.*\)"/\1/p' "$ROOT_DIR/Cargo.toml" | head -1)
cat > "$PKG_DIR/package.json" <<EOF
{
  "name": "wasm-similarity",
  "version": "$CARGO_VERSION",
  "description": "WebAssembly-powered cosine similarity utilities for JavaScript/TypeScript",
  "type": "module",
  "main": "wasm_similarity.js",
  "types": "wasm_similarity.d.ts",
  "files": [
    "wasm_similarity.js",
    "wasm_similarity.d.ts",
    "wasm_similarity_core.js",
    "wasm_similarity_bg.wasm",
    "wasm_similarity_bg.wasm.d.ts",
    "similarity_context.js",
    "similarity_context.d.ts"
  ],
  "keywords": ["wasm", "webassembly", "similarity", "cosine", "vectors"],
  "author": "geoffsee",
  "license": "AGPL-3.0"
}
EOF

echo "[build] Done. Output in pkg/"
