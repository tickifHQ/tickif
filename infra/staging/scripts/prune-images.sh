#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
load_staging_env "${1:-$DEFAULT_ENV_FILE}"
acquire_release_lock
assert_single_manager
python3 "$SCRIPT_DIR/storage.py" prune \
  "$API_IMAGE" "$WEB_IMAGE" "$WORKER_IMAGE" "$OPERATIONS_IMAGE"
