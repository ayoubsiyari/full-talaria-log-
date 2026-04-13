#!/usr/bin/env bash
# Optional supply-chain checks. Install tools: pip install pip-audit
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAILED=0

echo "==> journal-frontend (npm audit)"
if command -v npm >/dev/null 2>&1; then
  (cd "$ROOT/journal-frontend" && npm audit --audit-level=moderate) || FAILED=1
else
  echo "    (skip: npm not found)"
fi

echo "==> journal-backend (pip-audit)"
if python3 -m pip_audit --version >/dev/null 2>&1; then
  python3 -m pip_audit -r "$ROOT/journal-backend/requirements.txt" || FAILED=1
elif command -v pip-audit >/dev/null 2>&1; then
  pip-audit -r "$ROOT/journal-backend/requirements.txt" || FAILED=1
else
  echo "    (skip: install with: python3 -m pip install pip-audit)"
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo "verify-dependencies: completed with reported issues (see above)."
  exit 1
fi
echo "verify-dependencies: done."
