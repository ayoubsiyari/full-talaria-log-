#!/usr/bin/env bash
# Verify chart backtest trade persistence endpoints (GET/PATCH /api/sessions/:id/state).
# Trades are stored server-side only when PATCH returns success; otherwise refresh loses data.
#
# Usage:
#   ./scripts/verify-chart-session-state.sh
#   BASE_URL=http://localhost:8000 SESSION_ID=42 ./scripts/verify-chart-session-state.sh
#   BASE_URL=http://localhost:3000 SESSION_ID=42 COOKIE='chart_session_id=...' ./scripts/verify-chart-session-state.sh
#
# Checklist (browser — matches todo "verify-patch"):
#   1. Open DevTools → Network, place/save a trade.
#   2. Find PATCH .../api/sessions/<id>/state → Status 200, body {"success":true}.
#   3. If 401: sign in; open chart from backtest with ?sessionId=...
#   4. If 403: set TRUSTED_ORIGINS on the chart API to your page origin, or fix Host / X-Forwarded-*.
#   5. If (failed): same URL for HTML and /api (proxy), no mixed HTTP/HTTPS.

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
SESSION_ID="${SESSION_ID:-1}"
COOKIE="${COOKIE:-}"
# If STRICT=1, exit non-zero when API is unreachable (for CI with a running server).
STRICT="${STRICT:-0}"

echo "== Chart session state verification =="
echo "BASE_URL=$BASE_URL"
echo "SESSION_ID=$SESSION_ID"
echo

fail=0

code="$(curl -sS -o /tmp/chart_sess_state_body.txt -w '%{http_code}' "$BASE_URL/api/status" || true)"
if [[ "$code" != "200" ]]; then
  echo "WARN: GET /api/status → HTTP $code (expected 200). Start chart API or set BASE_URL."
  if [[ "$code" == "000" ]]; then
    if [[ "$STRICT" != "1" ]]; then
      echo "      (exiting 0 — set STRICT=1 to fail when API is unreachable)"
      echo
      echo "Browser checklist: after a trade, PATCH /api/sessions/<id>/state must be 200 with {\"success\":true}."
      exit 0
    fi
    fail=1
  else
    fail=1
  fi
else
  echo "OK:   GET /api/status → 200"
fi

code="$(curl -sS -o /tmp/chart_sess_state_body.txt -w '%{http_code}' \
  "$BASE_URL/api/sessions/${SESSION_ID}/state" || true)"
if [[ "$code" == "401" ]]; then
  echo "OK:   GET /api/sessions/${SESSION_ID}/state without cookie → 401 (auth required)"
elif [[ "$code" == "200" ]]; then
  echo "WARN: GET /api/sessions/${SESSION_ID}/state without cookie → 200 (AUTH_ENABLED may be off or session public)"
else
  echo "INFO: GET /api/sessions/${SESSION_ID}/state without cookie → HTTP $code"
fi

if [[ -n "$COOKIE" ]]; then
  code="$(curl -sS -o /tmp/chart_sess_state_body.txt -w '%{http_code}' \
    -H "Cookie: $COOKIE" \
    "$BASE_URL/api/sessions/${SESSION_ID}/state" || true)"
  if [[ "$code" == "200" ]]; then
    echo "OK:   GET /api/sessions/${SESSION_ID}/state with COOKIE → 200"
  else
    echo "FAIL: GET /api/sessions/${SESSION_ID}/state with COOKIE → HTTP $code"
    echo "       Body: $(head -c 200 /tmp/chart_sess_state_body.txt | tr '\n' ' ')"
    fail=1
  fi

  # PATCH with Origin (browser sends Origin on cross-site; same-site may omit — we still test CSRF path)
  ORIGIN="${ORIGIN:-$BASE_URL}"
  code="$(curl -sS -o /tmp/chart_sess_state_patch.txt -w '%{http_code}' \
    -X PATCH \
    -H "Content-Type: application/json" \
    -H "Origin: $ORIGIN" \
    -H "Cookie: $COOKIE" \
    -d '{"journal":[]}' \
    "$BASE_URL/api/sessions/${SESSION_ID}/state" || true)"
  if [[ "$code" == "200" ]]; then
    echo "OK:   PATCH /api/sessions/${SESSION_ID}/state (empty journal) with Origin+Cookie → 200"
  elif [[ "$code" == "403" ]]; then
    echo "FAIL: PATCH → 403 (CSRF / TRUSTED_ORIGINS). Set TRUSTED_ORIGINS or align proxy Host with page origin."
    fail=1
  elif [[ "$code" == "401" ]]; then
    echo "FAIL: PATCH → 401 (session cookie invalid or expired)"
    fail=1
  elif [[ "$code" == "404" ]]; then
    echo "INFO: PATCH → 404 (no trading_sessions row for id=$SESSION_ID for this DB user)"
  else
    echo "INFO: PATCH → HTTP $code"
    echo "       Body: $(head -c 200 /tmp/chart_sess_state_patch.txt | tr '\n' ' ')"
  fi
else
  echo "SKIP: Set COOKIE='chart_session_id=...' (from browser Application → Cookies) to test authenticated GET/PATCH."
fi

echo
echo "== Session id vs DB (todo: verify-sessionid) =="
echo "The chart reads session id from ?sessionId= or userStorage key active_trading_session_id."
echo "It must match a row in trading_sessions.id for your user (user_id on that row)."
echo "PostgreSQL (docker compose example):"
echo "  docker compose exec -T db psql -U \"\${POSTGRES_USER:-talaria}\" -d \"\${POSTGRES_DB:-talaria}\" -c \\"
echo "    \"SELECT id, user_id, name FROM trading_sessions ORDER BY id DESC LIMIT 10;\""

echo
echo "== Proxy / auth (todo: verify-auth-proxy) =="
echo "- Homepage nginx must proxy /api/ to trading-chart and forward Cookie (see homepage/nginx*.conf)."
echo "- Root docker-compose: pass TRUSTED_ORIGINS / CSRF_ENABLED into trading-chart if you see PATCH 403."
echo "- Avoid HTTPS page calling HTTP API (mixed content)."

exit "$fail"
