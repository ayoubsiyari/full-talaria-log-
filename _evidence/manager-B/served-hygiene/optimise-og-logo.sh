#!/usr/bin/env bash
# Recompress the OG/twitter share image WITHOUT changing its pixel dimensions.
# 1200x630 is the Open Graph spec size; shrinking it would degrade every share card.
# The defect is bytes (547 KB flat graphic), not geometry.
set -euo pipefail
SRC=/opt/talaria/homepage/public/talaria-log.logo.png
WORK=/tmp/logo-opt
rm -rf "$WORK"; mkdir -p "$WORK"
cp "$SRC" "$WORK/in.png"

before=$(wc -c < "$WORK/in.png")
echo "before_bytes=$before"

docker run --rm -v "$WORK:/w" -w /w alpine:3.20 sh -c '
  apk add --no-cache pngquant oxipng >/dev/null 2>&1 || apk add --no-cache pngquant >/dev/null 2>&1
  pngquant --quality=70-92 --speed 1 --strip --force --output /w/q.png /w/in.png || cp /w/in.png /w/q.png
  if command -v oxipng >/dev/null 2>&1; then
    oxipng -o 4 --strip safe --out /w/out.png /w/q.png >/dev/null 2>&1 || cp /w/q.png /w/out.png
  else
    cp /w/q.png /w/out.png
  fi
  ls -l /w
'

after=$(wc -c < "$WORK/out.png")
echo "after_bytes=$after"

# Geometry must be unchanged, or the share card breaks.
dim_in=$(od -An -tu1 -j16 -N8 "$WORK/in.png"  | tr -s ' ')
dim_out=$(od -An -tu1 -j16 -N8 "$WORK/out.png" | tr -s ' ')
echo "ihdr_in= [$dim_in]"
echo "ihdr_out=[$dim_out]"
[ "$dim_in" = "$dim_out" ] || { echo "ABORT: dimensions changed"; exit 2; }

# Must still be a valid PNG.
head -c 8 "$WORK/out.png" | od -An -tx1 | tr -d ' \n' | grep -q '89504e470d0a1a0a' \
  || { echo 'ABORT: not a PNG'; exit 2; }

pct=$(( 100 - (after * 100 / before) ))
echo "saved_pct=$pct"
echo "OPTIMISE_OK $WORK/out.png"
