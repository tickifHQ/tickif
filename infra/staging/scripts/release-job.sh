#!/usr/bin/env bash
set -Eeuo pipefail
cd /app
pnpm --filter @repo/worker staging:prepare
