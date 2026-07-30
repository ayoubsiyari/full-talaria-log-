#!/bin/sh
# Can the canary support a cross-realm heap instrument?
#  - performance.measureUserAgentSpecificMemory() needs crossOriginIsolated,
#    which needs COOP: same-origin + COEP: require-corp on the document.
#  - performance.memory is main-frame/isolate scoped and needs nothing.
echo "=== COOP/COEP/CORP headers on the chart shell and the panel embed ==="
for p in /chart/dist-v9/index.html /chart/multichart-prod/chart-embed.html /chart/; do
  echo "--- $p"
  curl -sSI "http://127.0.0.1:3000$p" \
    | grep -iE 'HTTP/|cross-origin-opener|cross-origin-embedder|cross-origin-resource|content-type'
done

echo "=== how many panel realms does a multichart page create (static count) ==="
grep -c 'iframe' /dev/null 2>/dev/null
docker exec talaria-homepage-1 sh -c "grep -oE 'iframe' /usr/share/nginx/html/chart/multichart-prod/multichart-manager.js | wc -l" 2>/dev/null

echo "=== is the panel embed same-origin with the shell (so per-frame reads are legal) ==="
docker exec talaria-homepage-1 sh -c "grep -oE \"src *= *[\\\"'][^\\\"']*chart-embed[^\\\"']*\" /usr/share/nginx/html/chart/multichart-prod/multichart-manager.js | head -3" 2>/dev/null
