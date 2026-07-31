#!/usr/bin/env bash
# Bring up an isolated copy of the LIVE b118 image for K4 reproduction.
#
# Why a second instance rather than the canary: this defect blocks a gunicorn worker's event loop,
# so reproducing it on the canary means deliberately freezing the release for every user on it.
# RELEASE-01 makes the canary the product. Same image, same database, same network — only the
# process is separate, so the blast radius of a reproduced freeze is this container.
#
# Schedulers are off so the scratch instance cannot do background writes against shared data.
# Bound to 127.0.0.1 so it is not publicly reachable.
set -euo pipefail

SRC=talaria-trading-chart-1
NAME=k4-scratch-api
PORT=3101
ENVF=/root/b-k4/.scratch.env      # real secrets; root-only; never printed

docker rm -f "$NAME" >/dev/null 2>&1 || true

umask 077
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$SRC" \
  | grep -vE '^(PATH|LANG|GPG_KEY|PYTHON_VERSION|PYTHON_SHA256)=' \
  | grep -vE '^(FIrstrate_SCHEDULE_ENABLED|WEB_CONCURRENCY|APP_ROLE)=' \
  > "$ENVF"
{
  echo 'FIrstrate_SCHEDULE_ENABLED=false'
  echo 'APP_ROLE=api'
  echo "WEB_CONCURRENCY=${WEB_CONCURRENCY:-2}"
  echo 'SKIP_BINARY_BACKFILL_ON_STARTUP=true'
} >> "$ENVF"
chmod 600 "$ENVF"

IMAGE="${IMAGE:-$(docker inspect --format '{{.Config.Image}}' "$SRC")}"
echo "scratch image : $IMAGE"
echo "workers       : ${WEB_CONCURRENCY:-2}"

docker run -d --name "$NAME" \
  --network talaria_default \
  --env-file "$ENVF" \
  -p "127.0.0.1:${PORT}:8000" \
  "$IMAGE" \
  sh -c "exec gunicorn api_server:app -w \${WEB_CONCURRENCY:-2} -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --timeout 1800 --keep-alive 5" \
  >/dev/null

echo -n "waiting for health on 127.0.0.1:${PORT} "
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then echo " up (${i}s)"; break; fi
  echo -n .; sleep 1
done
echo
curl -s -o /dev/null -w 'health http %{http_code} in %{time_total}s\n' "http://127.0.0.1:${PORT}/api/health"
echo "live canary untouched:"
curl -s -o /dev/null -w '  canary 3000 http %{http_code} in %{time_total}s\n' "http://127.0.0.1:3000/api/health"
