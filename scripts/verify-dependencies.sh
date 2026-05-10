#!/usr/bin/env bash
# Local security / supply-chain checks (mirrors CI where possible).
# Optional installs:
#   python3 -m pip install pip-audit 'bandit[toml]>=1.7'
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAILED=0

run_npm_audit() {
  local name="$1" dir="$2"
  echo "==> ${name} (npm audit)"
  if [[ ! -f "$ROOT/$dir/package-lock.json" ]]; then
    echo "    (skip: no package-lock.json)"
    return 0
  fi
  if command -v npm >/dev/null 2>&1; then
    # --omit=dev: focus on packages that ship to users; build/test toolchains
    # (jest, jsdom, terser, eslint, etc.) are excluded. Mirrors CI.
    (cd "$ROOT/$dir" && npm audit --audit-level=moderate --omit=dev) || FAILED=1
  else
    echo "    (skip: npm not found)"
  fi
}

run_npm_audit "journal-frontend" "journal-frontend"
run_npm_audit "homepage" "homepage"
run_npm_audit "chart" "chart v 1.4/chart"
run_npm_audit "root" "."

echo "==> journal-backend (pip-audit)"
if python3 -m pip_audit --version >/dev/null 2>&1; then
  python3 -m pip_audit -r "$ROOT/journal-backend/requirements.txt" || FAILED=1
elif command -v pip-audit >/dev/null 2>&1; then
  pip-audit -r "$ROOT/journal-backend/requirements.txt" || FAILED=1
else
  echo "    (skip: python3 -m pip install pip-audit)"
fi

echo "==> Python (bandit)"
if python3 -m bandit --version >/dev/null 2>&1; then
  python3 -m bandit -c "$ROOT/bandit.yaml" -r "$ROOT/journal-backend" -ll -ii || FAILED=1
  python3 -m bandit -c "$ROOT/bandit.yaml" -r "$ROOT/chart v 1.4/chart" -ll -ii || FAILED=1
else
  echo "    (skip: python3 -m pip install 'bandit[toml]>=1.7')"
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo "verify-dependencies: completed with reported issues (see above)."
  exit 1
fi
echo "verify-dependencies: done."
