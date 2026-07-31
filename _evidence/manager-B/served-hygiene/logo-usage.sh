#!/usr/bin/env bash
set -uo pipefail
C=talaria-homepage-1
R=/usr/share/nginx/html

echo '=== every context talaria-log.logo.png appears in (index.html) ==='
docker exec "$C" sh -c "grep -oE '.{0,200}talaria-log[.]logo[.]png.{0,120}' $R/index.html"

echo
echo '=== is it ever an <img> / background, or only meta? ==='
docker exec "$C" sh -c "grep -oE '<(img|meta|link)[^>]*talaria-log[.]logo[.]png[^>]*>' $R/index.html $R/login/index.html $R/pricing/index.html 2>/dev/null" | head -20

echo
echo '=== count of pages referencing it ==='
docker exec "$C" sh -c "grep -rlF talaria-log.logo.png $R 2>/dev/null | wc -l"

echo
echo '=== other big images and their pixel dims (IHDR) ==='
for f in talaria-log.logo.png "talaria chart.png" logo-04.png logo-05.png LOGO-07.png logo-08.png; do
  dims=$(docker exec "$C" sh -c "od -An -tu1 -j16 -N8 '$R/$f' 2>/dev/null")
  sz=$(docker exec "$C" sh -c "wc -c < '$R/$f' 2>/dev/null")
  echo "  $f  bytes=$sz  ihdr=[$dims]"
done

echo
echo '=== which visible logo does the nav actually use? ==='
docker exec "$C" sh -c "grep -oE '<img[^>]{0,200}(logo|LOGO)[^>]{0,200}>' $R/index.html" | head -10
