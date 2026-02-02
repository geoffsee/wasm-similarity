#!/usr/bin/env bash
# Automate building and publishing the pkg/ to the npm registry.
# Defaults to using Bun if available, otherwise npm.
#
# Usage:
#   ./publish.sh [--bun|--npm] [--bump patch|minor|major] [--dry-run] [--rebuild] [--help]
#
# Examples:
#   ./publish.sh --bump patch         # bump version, build if needed, publish with bun or npm
#   ./publish.sh --npm --dry-run      # simulate publish with npm
#   ./publish.sh --rebuild            # force rebuild before publishing
#
# Notes:
# - Requires cargo, wasm-bindgen-cli, and wasm32-unknown-unknown target for a rebuild.
# - Version bump uses `npm version` without creating a git tag.
# - Ensure you are authenticated: `npm login` locally or set NPM_TOKEN in CI.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$ROOT_DIR/pkg"

command_exists() { command -v "$1" >/dev/null 2>&1; }

echo_err() { printf "[publish.sh] %s\n" "$*" 1>&2; }

die() { echo_err "Error: $*"; exit 1; }

usage() {
  cat <<EOF
Usage: ./publish.sh [--bun|--npm] [--bump patch|minor|major] [--dry-run] [--rebuild] [--help]

Automates building and publishing the package in pkg/ to the npm registry.

Options:
  --bun                 Use Bun to publish (default if bun is available)
  --npm                 Use npm to publish (fallback if bun is not available)
  --bump <type>         Bump version in pkg/package.json using npm version (patch|minor|major)
  --dry-run             Perform a dry-run publish (no changes on registry)
  --rebuild             Force a rebuild before publishing
  --help                Show this help

Environment:
  NPM_TOKEN             Token for npm registry (optional if already logged in)

Examples:
  ./publish.sh --bump patch
  ./publish.sh --npm --dry-run
  ./publish.sh --rebuild
EOF
}

PUBLISHER=""
BUMP=""
DRY_RUN="false"
REBUILD="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bun) PUBLISHER="bun"; shift ;;
    --npm) PUBLISHER="npm"; shift ;;
    --bump)
      [[ $# -ge 2 ]] || die "--bump requires an argument (patch|minor|major)"
      BUMP="$2"; shift 2 ;;
    --dry-run) DRY_RUN="true"; shift ;;
    --rebuild) REBUILD="true"; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown option: $1 (use --help)" ;;
  esac
done

[[ -d "$PKG_DIR" ]] || die "pkg directory not found at $PKG_DIR"

# Choose publisher if not explicitly set
if [[ -z "$PUBLISHER" ]]; then
  if command_exists bun; then
    PUBLISHER="bun"
  elif command_exists npm; then
    PUBLISHER="npm"
  else
    die "Neither bun nor npm is installed. Please install one."
  fi
fi

echo_err "Publisher: $PUBLISHER"

# Optionally bump the version using npm (no git tag)
if [[ -n "$BUMP" ]]; then
  command_exists npm || die "npm is required for version bumping"
  pushd "$PKG_DIR" >/dev/null
  echo_err "Bumping version: $BUMP"
  npm version "$BUMP" --no-git-tag-version
  popd >/dev/null
fi

# Build if needed or requested
WASM_OUT="$PKG_DIR/wasm_similarity_bg.wasm"
if [[ "$REBUILD" == "true" || ! -f "$WASM_OUT" ]]; then
  echo_err "Building WASM artifacts..."
  "$ROOT_DIR/build.sh"
else
  echo_err "WASM artifacts found; skipping rebuild (use --rebuild to force)"
fi

# Publish from pkg directory
pushd "$PKG_DIR" >/dev/null

if [[ "$PUBLISHER" == "bun" ]]; then
  cmd=(bun publish)
  if [[ "$DRY_RUN" == "true" ]]; then
    cmd+=(--dry-run)
  fi
else
  cmd=(npm publish --access public)
  if [[ "$DRY_RUN" == "true" ]]; then
    cmd+=(--dry-run)
  fi
fi

echo_err "Running: ${cmd[*]} (in pkg/)"
"${cmd[@]}"

popd >/dev/null

echo_err "Done."
