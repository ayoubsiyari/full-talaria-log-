#!/usr/bin/env bash
# Mirror of .github/workflows/security.yml for local runs (spec §3.6 / §6.4).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail=0

echo "== npm audit (production deps) =="
for dir in homepage "chart v 1.4/chart" .; do
  if [[ -f "$dir/package-lock.json" ]]; then
    echo "--- $dir ---"
    (cd "$dir" && npm ci --omit=dev 2>/dev/null || npm ci)
    if ! (cd "$dir" && npm audit --audit-level=critical --omit=dev); then
      echo "CRITICAL npm vulnerabilities in $dir"
      fail=1
    fi
  fi
done

echo "== pip-audit =="
if command -v pip-audit >/dev/null 2>&1; then
  pip-audit -r journal-backend/requirements.txt || fail=1
else
  python -m pip install pip-audit
  python -m pip_audit -r journal-backend/requirements.txt || fail=1
fi

echo "== bandit =="
if command -v bandit >/dev/null 2>&1; then
  bandit -c bandit.yaml -r journal-backend -ll -ii || fail=1
  bandit -c bandit.yaml -r "chart v 1.4/chart" -ll -ii || fail=1
else
  echo "bandit not installed — skip (install with: pip install 'bandit[toml]')"
fi

echo "== gitleaks =="
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --source . --no-banner --redact --verbose --exit-code 1 || fail=1
else
  echo "gitleaks not installed — skip"
fi

if [[ "$fail" -ne 0 ]]; then
  echo "Security verification FAILED"
  exit 1
fi

echo "Security verification passed"
