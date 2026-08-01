#!/bin/sh
# Real user traffic on the preferences route since the repair, by method and status.
# Last night: 31 GET / all 500, and ZERO POSTs — the client only POSTs from a queue
# a successful GET merge fills, so the read failure suppressed the write path.
echo "=== since the repair (2026-07-30T00:00:00Z) ==="
docker logs talaria-journal-backend-1 --since 2026-07-30T00:00:00Z 2>&1 \
  | grep -oE '"(GET|POST) /api/chart/preferences HTTP/1\.[01]" [0-9]{3}' \
  | sed -E 's/"([A-Z]+) .*" ([0-9]{3})/\1 \2/' \
  | sort | uniq -c | sort -rn
echo "=== distinct users who saved successfully (POST 200) ==="
docker logs talaria-journal-backend-1 --since 2026-07-30T00:00:00Z 2>&1 \
  | grep -E '"POST /api/chart/preferences HTTP/1\.[01]" 200' | wc -l
echo "=== for contrast, the three hours before the repair ==="
docker logs talaria-journal-backend-1 --since 2026-07-29T21:00:00Z --until 2026-07-29T23:59:00Z 2>&1 \
  | grep -oE '"(GET|POST) /api/chart/preferences HTTP/1\.[01]" [0-9]{3}' \
  | sed -E 's/"([A-Z]+) .*" ([0-9]{3})/\1 \2/' \
  | sort | uniq -c | sort -rn
