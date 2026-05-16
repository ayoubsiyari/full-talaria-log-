#!/bin/sh
# Run on the VPS from repo root: sh scripts/check-journal-backend.sh
set -e
echo "=== docker compose ps (journal-backend) ==="
docker compose ps journal-backend homepage db 2>/dev/null || docker-compose ps journal-backend homepage db

echo ""
echo "=== journal-backend logs (last 40 lines) ==="
docker compose logs journal-backend --tail 40 2>/dev/null || docker-compose logs journal-backend --tail 40

echo ""
echo "=== health from inside journal container ==="
docker compose exec -T journal-backend python -c \
  "import urllib.request; r=urllib.request.urlopen('http://127.0.0.1:5000/api/health', timeout=10); print(r.read().decode())" \
  2>/dev/null || echo "FAILED: journal-backend not responding on :5000"

echo ""
echo "=== health from homepage nginx container ==="
docker compose exec -T homepage wget -qO- http://journal-backend:5000/api/health 2>/dev/null \
  || docker compose exec -T homepage sh -c "wget -qO- http://journal-backend:5000/api/health" 2>/dev/null \
  || echo "FAILED: homepage cannot reach journal-backend:5000 (this causes 502 on /journal/api/*)"
