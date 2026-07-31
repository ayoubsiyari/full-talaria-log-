#!/usr/bin/env bash
# b116 hygiene verification, corrected.
#
# The ship script asserted 404 for a removed module and got 307. That was the assertion being
# wrong, not the removal: this stack answers an unresolvable /chart/modules/* path with a 307 to
# /login?next=..., so 404 never appears. Asserting "404" would have been a green that means
# nothing, and asserting "not 200" is nearly as weak, because the login page is a 200 after the
# redirect.
#
# So the check is made on the two things that cannot be faked by a redirect rule:
#   1. the file is absent from the image filesystem
#   2. the URL does not yield JavaScript, following redirects
# with chart-indicators-full.js run through the identical checks as a positive control.
set -uo pipefail
C=talaria-homepage-1
BASE=http://127.0.0.1:3000
DEAD="chart-indicators.js chart-indicators-readable.js chart-indicators-with-hma.js chart-indicators-working-backup-final.js"
LIVE=chart-indicators-full.js
fail=0

echo "=== 1. removed copies are absent from the image ==="
for f in $DEAD; do
  if docker exec "$C" test -e "/usr/share/nginx/html/chart/modules/$f"; then
    echo "  FAIL present in image: $f"; fail=1
  else
    echo "  ok   absent from image: $f"
  fi
done
docker exec "$C" test -e "/usr/share/nginx/html/chart/modules/$LIVE" \
  && echo "  ok   CONTROL present in image: $LIVE" \
  || { echo "  FAIL control missing: $LIVE"; fail=1; }

echo
echo "=== 2. no removed copy yields JavaScript over HTTP ==="
for f in $DEAD; do
  ct=$(curl -sL -o /tmp/probe.out -w '%{content_type}' "$BASE/chart/modules/$f")
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/chart/modules/$f")
  case "$ct" in
    *javascript*) echo "  FAIL still served as JS: $f ($ct)"; fail=1 ;;
    *)            printf '  ok   %-46s first=%s final_type=%s\n' "$f" "$code" "$ct" ;;
  esac
done

echo
echo "=== 3. CONTROL: the live implementation is still served as JavaScript ==="
ct=$(curl -sL -o /tmp/live.js -w '%{content_type}' "$BASE/chart/modules/$LIVE")
sz=$(wc -c < /tmp/live.js)
case "$ct" in
  *javascript*) echo "  ok   $LIVE type=$ct bytes=$sz" ;;
  *)            echo "  FAIL control not served as JS: $ct"; fail=1 ;;
esac
test "$sz" -gt 900000 || { echo "  FAIL control too small ($sz) — did we serve a login page?"; fail=1; }

echo
echo "=== 4. share card ==="
og=$(curl -s -o /tmp/og.jpg -w '%{http_code}' "$BASE/talaria-log.logo.jpg")
echo "  jpg HTTP=$og bytes=$(wc -c < /tmp/og.jpg)"
test "$og" = 200 || fail=1
head -c 2 /tmp/og.jpg | od -An -tx1 | tr -d ' \n' | grep -q 'ffd8' \
  && echo '  ok   JPEG magic present' || { echo '  FAIL not a JPEG'; fail=1; }
docker exec "$C" test -e /usr/share/nginx/html/talaria-log.logo.png \
  && { echo '  FAIL old 547 KB PNG still in image'; fail=1; } \
  || echo '  ok   old PNG gone from image'
n=$(curl -s -H 'Cache-Control: no-cache' "$BASE/" | grep -c 'talaria-log.logo.jpg' || true)
echo "  index.html og refs=$n"; test "$n" -gt 0 || fail=1
n=$(docker exec "$C" sh -c "grep -rlF talaria-log.logo.png /usr/share/nginx/html 2>/dev/null | wc -l")
echo "  pages still naming the old PNG=$n"; test "$n" -eq 0 || fail=1

echo
echo "=== 5. b115 payload still on the wire ==="
curl -sS -H 'Cache-Control: no-cache' "$BASE/chart/modules/chart-window-limit.js" -o /tmp/cwl.js
grep -q 'Prefer bounded controlFetch' /tmp/cwl.js && echo '  ok   P0 abortable release' || { echo '  FAIL P0 release'; fail=1; }
docker exec talaria-trading-chart-1 grep -qE '^def chart_window_claim\(' /app/api_server.py \
  && echo '  ok   P0 claim is sync def' || { echo '  FAIL P0 claim'; fail=1; }
curl -sS -H 'Cache-Control: no-cache' "$BASE/chart/modules/order-manager.js" -o /tmp/om.js
for t in __TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1 \
         __TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1 \
         __TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1 \
         __TALARIA_DISABLE_TRADE_EVICT_V1; do
  n=$(grep -c "$t" /tmp/om.js || true); printf '  om %-55s %s\n' "$t" "$n"; test "$n" -gt 0 || fail=1
done
n=$(grep -c '__TALARIA_DISABLE_INDICATOR_EVICT_V1' /tmp/live.js || true)
printf '  ind %-54s %s\n' '__TALARIA_DISABLE_INDICATOR_EVICT_V1' "$n"; test "$n" -gt 0 || fail=1

echo
echo "=== 6. served image size ==="
docker exec "$C" du -sh /usr/share/nginx/html

echo
if [ "$fail" = 0 ]; then echo B116_HYGIENE_OK; else echo B116_HYGIENE_FAIL; fi
exit "$fail"
