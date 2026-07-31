#!/usr/bin/env bash
# Which indicator files are actually reachable from a shell that boots?
# BusyBox grep has no --include, which silently returned refs=0 for everything
# on the first pass. This version greps the whole served tree and prints the
# referencing paths so the count can be audited rather than trusted.
set -uo pipefail
C=talaria-homepage-1
ROOT=/usr/share/nginx/html

docker exec "$C" sh -c "find $ROOT -iname '*indicator*' -type f" | sort | while read -r p; do
  f=$(basename "$p")
  refs=$(docker exec "$C" sh -c "grep -rlF -- '$f' $ROOT 2>/dev/null" | grep -vxF "$p" | sort -u)
  n=$(printf '%s\n' "$refs" | grep -c . || true)
  printf '\n=== %s  (refs=%s) ===\n' "$f" "$n"
  if [ "$n" -gt 0 ]; then
    printf '%s\n' "$refs" | sed "s|$ROOT|  ...|" | head -12
  else
    echo '  (no referencing file anywhere in the served tree)'
  fi
done
