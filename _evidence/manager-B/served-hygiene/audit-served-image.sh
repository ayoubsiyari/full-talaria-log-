#!/usr/bin/env bash
# Inventory of dead indicator copies and oversized brand assets in the SERVED image.
# BusyBox-safe: no find -printf.
set -uo pipefail
C=talaria-homepage-1
ROOT=/usr/share/nginx/html

echo "=== A. indicator-named files in the served image (bytes, path) ==="
docker exec "$C" sh -c "find $ROOT -iname '*indicator*' -type f -exec ls -l {} + | awk '{printf \"%10d  %s\n\", \$5, \$NF}' | sort -rn"

echo
echo "=== B. duplicate content among them (sha256) ==="
docker exec "$C" sh -c "find $ROOT -iname '*indicator*' -type f -exec sha256sum {} + | sort" | awk '{h[$1]=h[$1]" "$2; c[$1]++} END {for (k in h) if (c[k]>1) printf "DUPLICATE %s%s\n", substr(k,1,12), h[k]}'

echo
echo "=== C. reference count for each indicator filename (excluding itself) ==="
docker exec "$C" sh -c "find $ROOT -iname '*indicator*' -type f" | while read -r p; do
  f=$(basename "$p")
  n=$(docker exec "$C" sh -c "grep -R -l -F '$f' $ROOT --include='*.html' --include='*.js' --include='*.mjs' --include='*.json' --include='*.css' 2>/dev/null | grep -v -x '$p' | wc -l")
  printf '  refs=%-4s %s\n' "$n" "$f"
done

echo
echo "=== D. images over 100 KB (logo / brand / icon first) ==="
docker exec "$C" sh -c "find $ROOT -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.svg' -o -iname '*.gif' \) -size +100k -exec ls -l {} + | awk '{printf \"%10d  %s\n\", \$5, \$NF}' | sort -rn"

echo
echo "=== E. directory weights ==="
docker exec "$C" sh -c "du -sh $ROOT; du -sh $ROOT/chart/modules $ROOT/chart/dist-v9 2>/dev/null; du -sh $ROOT/* 2>/dev/null | sort -rh | head -12"
