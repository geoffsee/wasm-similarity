#!/usr/bin/env bash
set -euo pipefail

echo "[test] Running native tests..."
cargo test

echo "[test] Running wasm-bindgen browser tests..."
WASM_BINDGEN_TEST_TIMEOUT=60 \
  cargo test --target wasm32-unknown-unknown
