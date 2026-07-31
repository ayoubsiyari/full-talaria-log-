#!/usr/bin/env bash
# Build a b118 image carrying only the K4 gate fix, and run it beside the unfixed one.
# Same base image, one file different, so a difference between the two instances is the fix
# and not the build.
set -euo pipefail

BASE=talaria-trading-chart:canary-20260731b118
TAG=talaria-trading-chart:k4fix
SRC=/root/b-k4/api_server.py.patched
NAME=k4-fixed-api
PORT=3102

echo "=== locate api_server.py inside the image ==="
APP_PATH=$(docker run --rm --entrypoint sh "$BASE" -c 'ls /app/api_server.py 2>/dev/null || find / -maxdepth 4 -name api_server.py -not -path "*/node_modules/*" 2>/dev/null | head -1')
echo "  $APP_PATH"
[ -n "$APP_PATH" ] || { echo "ABORT: cannot find api_server.py"; exit 2; }

echo "=== diff against the shipped file (should be the gate change only) ==="
docker run --rm --entrypoint sh "$BASE" -c "cat $APP_PATH" > /root/b-k4/api_server.py.shipped
diff -u /root/b-k4/api_server.py.shipped "$SRC" | head -80 || true
echo "  changed lines: $(diff /root/b-k4/api_server.py.shipped "$SRC" | grep -c '^[<>]' || true)"

echo "=== build ==="
cd /root/b-k4
cat > Dockerfile.k4 <<EOF
FROM $BASE
COPY api_server.py.patched $APP_PATH
RUN python -c "import ast;ast.parse(open('$APP_PATH',encoding='utf-8').read());print('SYNTAX OK')"
EOF
docker build -f Dockerfile.k4 -t "$TAG" . | tail -5

echo "=== markers in the built image ==="
docker run --rm --entrypoint sh "$TAG" -c "grep -c 'K4-P0-WINDOW-GATE-THREADPOOL-V1' $APP_PATH && grep -c 'await _require_active_chart_window_async' $APP_PATH"

echo "=== run on :$PORT ==="
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" \
  --network talaria_default \
  --env-file /root/b-k4/.scratch.env \
  -p "127.0.0.1:${PORT}:8000" \
  "$TAG" \
  sh -c 'exec gunicorn api_server:app -w ${WEB_CONCURRENCY:-2} -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --timeout 1800 --keep-alive 5' \
  >/dev/null

echo -n "waiting "
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || echo 000)
  if [ "$code" != "000" ]; then echo " up (${i}s, http $code)"; break; fi
  echo -n .; sleep 1
done
docker logs "$NAME" 2>&1 | tail -5
