#!/bin/bash
# Is there an inline source map in anything we serve? An inlined map is a base64 string sitting inside
# the script source, and script source is retained for the life of the page whether or not devtools ever
# opens it. On a 2 MB bundle that can be tens of megabytes of retained string for zero product benefit.
#
# Checks the CONTAINER FILESYSTEM for a complete picture, then re-checks the WIRE for the biggest hits,
# because what is served is the only thing that matters and a build step could strip on the way out.
set -u
CHART=talaria-trading-chart-1
BASE=http://127.0.0.1:3000

echo "=== every served .js/.css, by size, with source-map status ==="
docker exec "$CHART" sh -c '
  find /app -type f \( -name "*.js" -o -name "*.css" \) ! -path "*/node_modules/*" -printf "%s %p\n" 2>/dev/null \
  | sort -rn | head -40 | while read -r sz path; do
      if grep -qs "sourceMappingURL=data:" "$path"; then
        # measure just the inlined payload
        maplen=$(grep -os "sourceMappingURL=data:[^\"'"'"' ]*" "$path" | wc -c)
        printf "%12d  INLINE-MAP %10d bytes of map  %s\n" "$sz" "$maplen" "$path"
      elif grep -qs "sourceMappingURL=" "$path"; then
        ref=$(grep -os "sourceMappingURL=[^\"'"'"' ]*" "$path" | head -1)
        printf "%12d  external   %s  %s\n" "$sz" "$ref" "$path"
      else
        printf "%12d  none                    %s\n" "$sz" "$path"
      fi
    done'

echo
echo "=== totals across everything served ==="
docker exec "$CHART" sh -c '
  tot=0; inl=0; n=0; ninl=0
  for f in $(find /app -type f \( -name "*.js" -o -name "*.css" \) ! -path "*/node_modules/*" 2>/dev/null); do
    s=$(stat -c %s "$f"); tot=$((tot+s)); n=$((n+1))
    if grep -qs "sourceMappingURL=data:" "$f"; then
      m=$(grep -os "sourceMappingURL=data:[^\"'"'"' ]*" "$f" | wc -c)
      inl=$((inl+m)); ninl=$((ninl+1))
    fi
  done
  echo "files: $n   total bytes: $tot"
  echo "files with an INLINE map: $ninl   inlined map bytes: $inl"'

echo
echo "=== are there standalone .map files being shipped? ==="
docker exec "$CHART" sh -c 'find /app -name "*.map" ! -path "*/node_modules/*" -printf "%10s  %p\n" 2>/dev/null | sort -rn | head -20' || true
docker exec "$CHART" sh -c 'find /app -name "*.map" ! -path "*/node_modules/*" 2>/dev/null | wc -l | sed "s/^/count: /"'

echo
echo "=== the wire, not the disk: what does the browser actually receive? ==="
for u in /chart/dist-v9/chart.js /chart/dist-v9/modules/chart-data-pipeline.js /chart/dist-v9/modules/replay-system.js; do
  code=$(curl -s -o /tmp/w.js -w '%{http_code}' "$BASE$u")
  if [ "$code" = "200" ]; then
    sz=$(stat -c %s /tmp/w.js)
    if grep -qs "sourceMappingURL=data:" /tmp/w.js; then
      m=$(grep -os "sourceMappingURL=data:[^\"' ]*" /tmp/w.js | wc -c)
      echo "  $u  $sz bytes  INLINE MAP: $m bytes"
    elif grep -qs "sourceMappingURL=" /tmp/w.js; then
      echo "  $u  $sz bytes  external map ref: $(grep -os 'sourceMappingURL=[^"'"'"' ]*' /tmp/w.js | head -1)"
    else
      echo "  $u  $sz bytes  no source map"
    fi
  else
    echo "  $u  HTTP $code"
  fi
done
rm -f /tmp/w.js
