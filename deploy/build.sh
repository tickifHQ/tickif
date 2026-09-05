#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${REGISTRY:?Set registry path, e.g. example.azurecr.io/tickif}"
: "${STAGING_DOMAIN:?Set public staging hostname}"
revision=$(git rev-parse HEAD)
test -z "$(git status --porcelain)" || { echo 'Build from a clean committed release checkout' >&2; exit 1; }
for service in api worker web; do
  docker build --pull --file "apps/$service/Dockerfile" \
    --build-arg "NEXT_PUBLIC_API_URL=https://$STAGING_DOMAIN" \
    --build-arg "NEXT_PUBLIC_WEB_URL=https://$STAGING_DOMAIN" \
    --tag "$REGISTRY/$service:$revision" .
done
echo "Built $revision. Push these tags explicitly, then record registry digests in the release environment."
