#!/bin/sh
echo "=== ledger module served? ==="
curl -sS -o /dev/null -w 'ledger_http=%{http_code}\n' \
  http://127.0.0.1:3000/chart/modules/server-write-failure-ledger.js

echo "=== load order in the dist-v9 shell (ledger must precede preferences-sync) ==="
curl -sS http://127.0.0.1:3000/chart/dist-v9/index.html \
  | grep -nE 'server-write-failure-ledger|preferences-sync' | head -4

echo "=== and in the panel embed ==="
curl -sS http://127.0.0.1:3000/chart/multichart-prod/chart-embed.html \
  | grep -nE 'server-write-failure-ledger|preferences-sync' | head -4

echo "=== realm climb inside the ledger itself ==="
curl -sS http://127.0.0.1:3000/chart/modules/server-write-failure-ledger.js \
  | grep -c 'flagTruthy'
