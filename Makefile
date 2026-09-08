SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

ROOT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
WASM_TARGET ?= wasm32-unknown-unknown
WASM64_TOOLCHAIN ?= nightly
CARGO_VERSION := $(shell sed -n 's/^version = "\(.*\)"/\1/p' "$(ROOT_DIR)/Cargo.toml" | head -1)
ifeq ($(WASM_TARGET),wasm32-unknown-unknown)
PKG_DIR := $(ROOT_DIR)/pkg
CARGO_BUILD := cargo build
NPM_VERSION := $(CARGO_VERSION)
NPM_TAG := latest
NPM_ENGINES :=
WASM_BINDGEN_ENV :=
WASM_OPT_FLAGS :=
else ifeq ($(WASM_TARGET),wasm64-unknown-unknown)
PKG_DIR := $(ROOT_DIR)/pkg-wasm64
CARGO_BUILD := cargo +$(WASM64_TOOLCHAIN) build -Z build-std=std,panic_abort
# Keep wasm64 opt-in: prerelease versions never replace the default latest tag.
NPM_VERSION := $(CARGO_VERSION)$(if $(findstring -,$(CARGO_VERSION)),.,-)wasm64
NPM_TAG := wasm64
NPM_ENGINES := "engines": { "node": ">=24" },
# wasm-bindgen's legacy return-pointer glue passes a number to an i64
# parameter on wasm64. Multivalue returns avoid that ABI mismatch for Vecs.
WASM_BINDGEN_ENV := WASM_BINDGEN_MULTI_VALUE=1
WASM_OPT_FLAGS := --enable-memory64 --enable-multivalue
else
$(error Unsupported WASM_TARGET: $(WASM_TARGET))
endif
WASM_OUT := $(ROOT_DIR)/target/$(WASM_TARGET)/release/wasm_similarity.wasm
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
	@echo "  make build WASM_TARGET=wasm64-unknown-unknown  Build into pkg-wasm64/"
	@echo "  make test               Run native and wasm-bindgen tests"
	@echo "  make publish            Publish pkg/ to npm (see options below)"
	@echo "  make clean              Remove pkg/ and cargo target artifacts"
	@echo ""
	@echo "Publish options:"
	@echo "  PUBLISHER=bun|npm       Publisher (default: bun if available, else npm)"
	@echo "  BUMP=patch|minor|major  Bump wasm32 version in pkg/package.json (no git tag)"
	@echo "  DRY_RUN=1               Dry-run publish"
	@echo "  REBUILD=1               Force rebuild before publishing"
	@echo "  WASM_TARGET=wasm64-unknown-unknown  Publish the opt-in wasm64 package"
	@echo "  WASM64_TOOLCHAIN=nightly  Rust toolchain with rust-src for wasm64 builds"
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
	@if ! command -v wasm-bindgen >/dev/null 2>&1 || \
		[[ "$$(wasm-bindgen --version)" != "wasm-bindgen $(WASM_BINDGEN_VERSION)" ]]; then \
		cargo install wasm-bindgen-cli --version "$(WASM_BINDGEN_VERSION)" --locked --force; \
	fi
	@echo "[build] Compiling $(WASM_TARGET) (release)..."
	$(CARGO_BUILD) --target $(WASM_TARGET) --release --locked
	@echo "[build] Running wasm-bindgen..."
	$(WASM_BINDGEN_ENV) wasm-bindgen "$(WASM_OUT)" \
		--out-dir "$(PKG_DIR)" \
		--target web \
		--typescript
	@if command -v wasm-opt >/dev/null 2>&1; then \
		echo "[build] Optimizing with wasm-opt..."; \
		wasm-opt -O3 --enable-bulk-memory $(WASM_OPT_FLAGS) "$(PKG_DIR)/wasm_similarity_bg.wasm" \
			-o "$(PKG_DIR)/wasm_similarity_bg.wasm"; \
	else \
		echo "[build] wasm-opt not found, skipping optimization"; \
	fi
	@mv "$(PKG_DIR)/wasm_similarity.js" "$(PKG_DIR)/wasm_similarity_core.js"
	@cp "$(TEMPLATES)/wasm_similarity.js" "$(PKG_DIR)/wasm_similarity.js"
	@cp "$(TEMPLATES)/similarity_context.js" "$(PKG_DIR)/similarity_context.js"
	@cp "$(TEMPLATES)/similarity_context.d.ts" "$(PKG_DIR)/similarity_context.d.ts"
	@echo "export { SimilarityContext } from './similarity_context.js';" >> "$(PKG_DIR)/wasm_similarity.d.ts"
	@printf '%s\n' \
		'{' \
		'  "name": "wasm-similarity",' \
		'  "version": "$(NPM_VERSION)",' \
		'  "wasmTarget": "$(WASM_TARGET)",' \
		'  "publishConfig": { "access": "public", "tag": "$(NPM_TAG)" },' \
		'  $(NPM_ENGINES)' \
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
	@echo "[build] Done. Output in $(PKG_DIR)"

test:
	@echo "[test] Running native tests..."
	cargo test
	@echo "[test] Running wasm-bindgen browser tests..."
	WASM_BINDGEN_TEST_TIMEOUT=60 cargo test --target wasm32-unknown-unknown

publish:
	@if [[ "$(WASM_TARGET)" == "wasm64-unknown-unknown" && -n "$(BUMP)" ]]; then \
		echo "[publish] Error: bump Cargo.toml before building wasm64 so its version matches the wasm32 release" >&2; \
		exit 1; \
	fi
	@if [[ "$(REBUILD)" == "1" || ! -f "$(PKG_DIR)/wasm_similarity_bg.wasm" ]]; then \
		$(MAKE) build; \
	fi
	@node "$(ROOT_DIR)/scripts/check-package.mjs" "$(PKG_DIR)" "$(WASM_TARGET)"
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
	publish_tag=$$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).publishConfig.tag' "$(PKG_DIR)/package.json"); \
	if [[ "$$publisher" == "bun" ]]; then \
		cmd=(bun publish --tag "$$publish_tag"); \
		[[ "$(DRY_RUN)" == "1" ]] && cmd+=(--dry-run); \
	else \
		cmd=(npm publish --access public --tag "$$publish_tag"); \
		[[ "$(DRY_RUN)" == "1" ]] && cmd+=(--dry-run); \
	fi; \
	echo "[publish] Running: $${cmd[*]} (in $(PKG_DIR))" >&2; \
	(cd "$(PKG_DIR)" && "$${cmd[@]}"); \
	echo "[publish] Done." >&2

clean:
	rm -rf "$(ROOT_DIR)/pkg" "$(ROOT_DIR)/pkg-wasm64"
	cargo clean
