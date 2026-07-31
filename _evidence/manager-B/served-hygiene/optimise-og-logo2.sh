#!/usr/bin/env bash
# pngquant posterised the gradient (visible banding), so palette reduction is the wrong
# tool for this asset. Try: (a) lossless PNG, (b) JPEG at a few qualities.
# Geometry stays 1200x631 in every arm — that is the Open Graph spec size.
set -euo pipefail
WORK=/tmp/logo-opt
cd "$WORK"

docker run --rm -v "$WORK:/w" -w /w alpine:3.20 sh -c '
  apk add --no-cache oxipng imagemagick libjpeg-turbo-utils >/dev/null 2>&1
  echo "--- lossless PNG (oxipng -o max) ---"
  oxipng -o max --strip safe --out /w/lossless.png /w/in.png >/dev/null 2>&1 || cp /w/in.png /w/lossless.png
  echo "--- JPEG arms ---"
  for q in 78 85 90; do
    magick /w/in.png -quality $q -sampling-factor 4:2:0 -strip /w/jpg$q.jpg 2>/dev/null \
      || convert /w/in.png -quality $q -sampling-factor 4:2:0 -strip /w/jpg$q.jpg
  done
  # 4:4:4 keeps chroma detail on the sharp blue mark edges
  magick /w/in.png -quality 88 -sampling-factor 4:4:4 -strip /w/jpg88_444.jpg 2>/dev/null \
    || convert /w/in.png -quality 88 -sampling-factor 4:4:4 -strip /w/jpg88_444.jpg
  ls -l /w
'

echo
echo "=== sizes ==="
for f in in.png lossless.png out.png jpg78.jpg jpg85.jpg jpg90.jpg jpg88_444.jpg; do
  [ -f "$f" ] && printf '  %-16s %8d bytes\n' "$f" "$(wc -c < "$f")"
done
