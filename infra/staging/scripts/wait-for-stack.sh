#!/usr/bin/env bash
set -Eeuo pipefail

stack_name="${1:-tickif}"
timeout_seconds="${2:-900}"
deadline=$((SECONDS + timeout_seconds))

while (( SECONDS < deadline )); do
  services="$(docker stack services "$stack_name" --format '{{.Name}} {{.Replicas}}' 2>/dev/null || true)"
  if [[ -n "$services" ]] && awk '{ split($2, r, "/"); if (r[1] != r[2]) bad=1 } END { exit bad }' <<<"$services"; then
    echo "stack $stack_name converged"
    exit 0
  fi
  sleep 5
done

docker stack services "$stack_name" >&2 || true
echo "stack $stack_name did not converge within ${timeout_seconds}s" >&2
exit 1
