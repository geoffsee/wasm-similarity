SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

ROOT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
PKG_DIR  := $(ROOT_DIR)/pkg
WASM_OUT := $(ROOT_DIR)/target/wasm32-unknown-unknown/release/wasm_similarity.wasm
TEMPLATES := $(ROOT_DIR)/templates
WASM_BINDGEN_VERSION := $(shell sed -n 's/^wasm-bindgen = "=\(.*\)"/\1/p' "$(ROOT_DIR)/Cargo.toml")

# publish options (override on the command line):
#   make publish PUBLISHER=npm BUMP=patch DRY_RUN=1 REBUILD=1
PUBLISHER ?=
BUMP      ?=
DRY_RUN   ?=
REBUILD   ?=

.PHONY: all build test publish clean help

all: build

help:
	@echo "Targets:"
	@echo "  make build              Build WASM package into pkg/"
	@echo "  make test               Run native and wasm-bindgen tests"
	@echo "  make publish            Publish pkg/ to npm (see options below)"
	@echo "  make clean              Remove pkg/ and cargo target artifacts"
	@echo ""
	@echo "Publish options:"
	@echo "  PUBLISHER=bun|npm       Publisher (default: bun if available, else npm)"
	@echo "  BUMP=patch|minor|major  Bump version in pkg/package.json (no git tag)"
	@echo "  DRY_RUN=1               Dry-run publish"
	@echo "  REBUILD=1               Force rebuild before publishing"
	@echo ""
	@echo "Examples:"
	@echo "  make publish BUMP=patch"
	@echo "  make publish PUBLISHER=npm DRY_RUN=1"
	@echo "  make publish REBUILD=1"

build:
	@rm -rf "$(PKG_DIR)"
	@if [ -z "$(WASM_BINDGEN_VERSION)" ]; then \
		echo "[build] error: could not parse wasm-bindgen version from Cargo.toml"; \
		exit 1; \
	fi
	@echo "[build] Ensuring wasm-bindgen-cli $(WASM_BINDGEN_VERSION)..."
	@cargo install wasm-bindgen-cli --version "$(WASM_BINDGEN_VERSION)" --locked --force
	@echo "[build] Compiling wasm32-unknown-unknown (release)..."
	cargo build --target wasm32-unknown-unknown --release
	@echo "[build] Running wasm-bindgen..."
	wasm-bindgen "$(WASM_OUT)" \
		--out-dir "$(PKG_DIR)" \
		--target web \
		--typescript
	@if command -v wasm-opt >/dev/null 2>&1; then \
		echo "[build] Optimizing with wasm-opt..."; \
		wasm-opt -O3 --enable-bulk-memory "$(PKG_DIR)/wasm_similarity_bg.wasm" \
			-o "$(PKG_DIR)/wasm_similarity_bg.wasm"; \
	else \
		echo "[build] wasm-opt not found, skipping optimization"; \
	fi
	@mv "$(PKG_DIR)/wasm_similarity.js" "$(PKG_DIR)/wasm_similarity_core.js"
	@cp "$(TEMPLATES)/wasm_similarity.js" "$(PKG_DIR)/wasm_similarity.js"
	@cp "$(TEMPLATES)/similarity_context.js" "$(PKG_DIR)/similarity_context.js"
	@cp "$(TEMPLATES)/similarity_context.d.ts" "$(PKG_DIR)/similarity_context.d.ts"
	@CARGO_VERSION=$$(sed -n 's/^version = "\(.*\)"/\1/p' "$(ROOT_DIR)/Cargo.toml" | head -1); \
	printf '%s\n' \
		'{' \
		'  "name": "wasm-similarity",' \
		"  \"version\": \"$$CARGO_VERSION\"," \
		'  "description": "WebAssembly-powered cosine similarity utilities for JavaScript/TypeScript",' \
		'  "type": "module",' \
		'  "main": "wasm_similarity.js",' \
		'  "types": "wasm_similarity.d.ts",' \
		'  "files": [' \
		'    "wasm_similarity.js",' \
		'    "wasm_similarity.d.ts",' \
		'    "wasm_similarity_core.js",' \
		'    "wasm_similarity_bg.wasm",' \
		'    "wasm_similarity_bg.wasm.d.ts",' \
		'    "similarity_context.js",' \
		'    "similarity_context.d.ts",' \
		'    "README.md"' \
		'  ],' \
		'  "keywords": ["wasm", "webassembly", "similarity", "cosine", "vectors"],' \
		'  "author": "geoffsee",' \
		'  "license": "AGPL-3.0",' \
		'  "repository": {' \
		'    "type": "git",' \
		'    "url": "https://github.com/geoffsee/wasm-similarity"' \
		'  }' \
		'}' > "$(PKG_DIR)/package.json"
	@cp "$(ROOT_DIR)/README.md" "$(PKG_DIR)/README.md"
	@echo "[build] Done. Output in pkg/"

test:
	@echo "[test] Running native tests..."
	cargo test
	@echo "[test] Running wasm-bindgen browser tests..."
	WASM_BINDGEN_TEST_TIMEOUT=60 cargo test --target wasm32-unknown-unknown

publish:
	@if [[ ! -d "$(PKG_DIR)" ]]; then \
		echo "[publish] Error: pkg directory not found at $(PKG_DIR)" >&2; \
		exit 1; \
	fi
	@publisher="$(PUBLISHER)"; \
	if [[ -z "$$publisher" ]]; then \
		if command -v bun >/dev/null 2>&1; then publisher=bun; \
		elif command -v npm >/dev/null 2>&1; then publisher=npm; \
		else echo "[publish] Error: Neither bun nor npm is installed." >&2; exit 1; \
		fi; \
	fi; \
	echo "[publish] Publisher: $$publisher" >&2; \
	if [[ -n "$(BUMP)" ]]; then \
		if ! command -v npm >/dev/null 2>&1; then \
			echo "[publish] Error: npm is required for version bumping" >&2; \
			exit 1; \
		fi; \
		echo "[publish] Bumping version: $(BUMP)" >&2; \
		(cd "$(PKG_DIR)" && npm version "$(BUMP)" --no-git-tag-version); \
	fi; \
	if [[ "$(REBUILD)" == "1" || ! -f "$(PKG_DIR)/wasm_similarity_bg.wasm" ]]; then \
		echo "[publish] Building WASM artifacts..." >&2; \
		$(MAKE) build; \
	else \
		echo "[publish] WASM artifacts found; skipping rebuild (use REBUILD=1 to force)" >&2; \
	fi; \
	if [[ "$$publisher" == "bun" ]]; then \
		cmd=(bun publish); \
		[[ "$(DRY_RUN)" == "1" ]] && cmd+=(--dry-run); \
	else \
		cmd=(npm publish --access public); \
		[[ "$(DRY_RUN)" == "1" ]] && cmd+=(--dry-run); \
	fi; \
	echo "[publish] Running: $${cmd[*]} (in pkg/)" >&2; \
	(cd "$(PKG_DIR)" && "$${cmd[@]}"); \
	echo "[publish] Done." >&2

clean:
	rm -rf "$(PKG_DIR)"
	cargo clean
