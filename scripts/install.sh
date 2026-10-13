#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export UV_CACHE_DIR="${UV_CACHE_DIR:-${PWD}/.runtime/cache/uv}"
export npm_config_cache="${npm_config_cache:-${PWD}/.runtime/cache/npm}"
uv venv --allow-existing .venv
uv pip install --python .venv/bin/python --require-hashes -r backend/requirements.lock
(cd web && npm ci --no-audit --no-fund && npm run build)
