#!/usr/bin/env bash
# Run the support account-facts tests against the modified api_server, inside the chart image
# (which already carries fastapi/sqlalchemy). The repo tree is mounted over /app.
set -uo pipefail
IMG="${IMG:-talaria-trading-chart:canary-20260730b116}"
STAGE=/tmp/b117-stage
CHART="/opt/talaria/chart v 1.4/chart"

echo "=== stage into the build context ==="
cp "$STAGE/api_server.py"                  "$CHART/api_server.py"
cp "$STAGE/test_support_account_facts.py"  "$CHART/tests/test_support_account_facts.py"
cp "$STAGE/admin-dashboard.html"           "$CHART/admin-dashboard.html"

# Mount only the changed files. Mounting the whole chart dir over /app hides the sibling
# analytics_backend that tests/conftest.py bootstraps, and the run dies in conftest import.
MOUNTS=(
  -v "$CHART/api_server.py:/app/api_server.py:ro"
  -v "$CHART/tests/test_support_account_facts.py:/app/tests/test_support_account_facts.py:ro"
)

echo "=== syntax ==="
docker run --rm "${MOUNTS[@]}" -w /app "$IMG" \
  python -c "import ast;ast.parse(open('api_server.py',encoding='utf-8').read());print('  api_server AST OK')"

echo "=== pytest ==="
docker run --rm "${MOUNTS[@]}" -w /app "$IMG" sh -c \
  'python -m pytest tests/test_support_account_facts.py -q 2>&1 | tail -30'
