#!/bin/sh
# FLAG-01/02 reachability sweep on the wire: which kill-switches climb realms, and
# does each switch's read happen in the realm where its gated code runs.
echo "realm-climb helper (_talariaDisableFlagTruthy) per served file:"
for f in /chart/multichart-prod/multichart-manager.js \
         /chart/multichart-prod/panel-cmd-bridge.js \
         /chart/modules/replay-system.js \
         /chart/modules/preferences-sync.js \
         /chart/modules/chart-window-limit.js; do
  body=$(curl -sS "http://127.0.0.1:3000$f")
  climb=$(printf '%s' "$body" | grep -c '_talariaDisableFlagTruthy')
  flags=$(printf '%s' "$body" | grep -oE '__TALARIA_DISABLE_[A-Z0-9_]+' | sort -u | tr '\n' ' ')
  printf '%s\n  climbHelper=%s\n  flags=%s\n' "$f" "$climb" "$flags"
done

echo "=== does the panel embed load panel-cmd-bridge (i.e. is it panel-realm code) ==="
curl -sS http://127.0.0.1:3000/chart/multichart-prod/chart-embed.html \
  | grep -c 'panel-cmd-bridge'

echo "=== does the panel embed load multichart-manager (i.e. is the manager panel-realm code) ==="
curl -sS http://127.0.0.1:3000/chart/multichart-prod/chart-embed.html \
  | grep -c 'multichart-manager'
