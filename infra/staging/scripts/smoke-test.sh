#!/usr/bin/env bash
set -Eeuo pipefail

origin="${1:?usage: smoke-test.sh https://staging.example.com}"

probe() {
  local path="$1"
  local expected="$2"
  local status
  status="$(curl --silent --show-error --location --retry 12 --retry-all-errors --retry-delay 5 \
    --output /dev/null --write-out '%{http_code}' "$origin$path")"
  if [[ "$status" != "$expected" ]]; then
    echo "smoke test failed: $path returned $status, expected $expected" >&2
    return 1
  fi
  echo "smoke test passed: $path -> $status"
}

probe /livez 200
probe /readyz 200
probe /openapi.json 200
probe /health 200
probe / 200
