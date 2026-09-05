#!/usr/bin/env bash
set -Eeuo pipefail
cd /app
pnpm --filter @repo/worker exec tsx src/staging-prepare.ts
