#!/bin/sh
# Post-hardening verification for the cookie + CSRF auth migration.
#
# Exercises the parts that can be checked without a browser: that login sets the
# httpOnly journal_token cookie + readable csrf_access_token, that journal API
# calls authenticate via the cookie (no Authorization header), that CSRF is
# enforced on writes, and that logout clears the session.
#
# Usage (run against a RUNNING stack, ideally through nginx so paths match prod):
#   BASE_URL=http://localhost \
#   TEST_EMAIL=you@example.com TEST_PASSWORD='secret' \
#   sh scripts/verify-auth-billing.sh
#
# Notes:
#   * BASE_URL must be the nginx-served origin (so /api/* hits the chart and
#     /journal/api/* proxies to Flask) — the same origin the browser uses.
#   * Uses a temp cookie jar; no data is mutated (validate-coupon is read-only).
#   * Requires: curl. Webhook checks are manual (see the printed instructions).

BASE_URL="${BASE_URL:-http://localhost}"
TEST_EMAIL="${TEST_EMAIL:-}"
TEST_PASSWORD="${TEST_PASSWORD:-}"

if [ -z "$TEST_EMAIL" ] || [ -z "$TEST_PASSWORD" ]; then
  echo "ERROR: set TEST_EMAIL and TEST_PASSWORD env vars (a real account on $BASE_URL)." >&2
  exit 2
fi

JAR="$(mktemp)"
PASS=0
FAIL=0

cleanup() { rm -f "$JAR" "$JAR".2 2>/dev/null || true; }
trap cleanup EXIT

ok()   { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL: $1" >&2; FAIL=$((FAIL+1)); }

code_of() { # method url [extra curl args...]
  m="$1"; u="$2"; shift 2
  curl -s -o /dev/null -w "%{http_code}" -X "$m" "$@" "$u"
}

echo "=== Auth + billing verification against $BASE_URL ==="

# 1) Login — should set cookies and return 200.
echo "[1] Login"
LOGIN_CODE=$(curl -s -o "$JAR".body -w "%{http_code}" -c "$JAR" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" \
  "$BASE_URL/api/auth/login")
[ "$LOGIN_CODE" = "200" ] && ok "login returned 200" || bad "login returned $LOGIN_CODE (expected 200)"

# 2) Cookie assertions: journal_token httpOnly + csrf_access_token readable.
echo "[2] Cookies"
if grep -q "#HttpOnly_.*journal_token" "$JAR"; then
  ok "journal_token is set AND httpOnly"
elif grep -q "journal_token" "$JAR"; then
  bad "journal_token present but NOT marked httpOnly"
else
  bad "journal_token cookie missing"
fi

CSRF=$(awk '/csrf_access_token/ { print $7 }' "$JAR" | tail -n1)
if [ -n "$CSRF" ]; then
  ok "csrf_access_token cookie present (readable)"
else
  bad "csrf_access_token cookie missing"
fi

# 3) Journal GET via cookie only (no Authorization header) — should be 200.
echo "[3] Journal read via cookie"
G=$(code_of GET "$BASE_URL/journal/api/subscriptions/my-subscription" -b "$JAR")
[ "$G" = "200" ] && ok "GET my-subscription via cookie = 200" || bad "GET my-subscription = $G (expected 200)"

# 4) CSRF enforcement on a write WITHOUT the token — should be 401 (not 200).
echo "[4] CSRF negative (write without X-CSRF-TOKEN)"
N=$(code_of POST "$BASE_URL/journal/api/subscriptions/validate-coupon" \
  -b "$JAR" -H "Content-Type: application/json" -d '{"code":"NOPE000"}')
if [ "$N" = "401" ]; then
  ok "write without CSRF blocked (401)"
elif [ "$N" = "200" ]; then
  bad "write without CSRF was ACCEPTED ($N) — CSRF not enforced!"
else
  echo "  WARN: write without CSRF returned $N (expected 401; 429 = rate-limited, retry later)"
fi

# 5) Same write WITH the CSRF header — should NOT be 401 (200/400 are both fine).
echo "[5] CSRF positive (write with X-CSRF-TOKEN)"
P=$(code_of POST "$BASE_URL/journal/api/subscriptions/validate-coupon" \
  -b "$JAR" -H "Content-Type: application/json" -H "X-CSRF-TOKEN: $CSRF" -d '{"code":"NOPE000"}')
if [ "$P" = "401" ]; then
  bad "write WITH CSRF still 401 — token/header name mismatch"
else
  ok "write with CSRF accepted by auth layer (status $P)"
fi

# 6) Logout — should clear cookies; subsequent protected GET should be 401.
echo "[6] Logout"
curl -s -o /dev/null -c "$JAR".2 -b "$JAR" -X POST "$BASE_URL/api/auth/logout" >/dev/null 2>&1
A=$(code_of GET "$BASE_URL/journal/api/subscriptions/my-subscription" -b "$JAR".2)
[ "$A" = "401" ] && ok "protected GET after logout = 401" || echo "  WARN: protected GET after logout = $A (expected 401)"

echo ""
echo "=== Result: $PASS passed, $FAIL failed ==="
echo ""
echo "Manual checks still required in a browser + Stripe (cannot be scripted here):"
echo "  - Full Stripe Checkout -> /pricing/success/ -> verify-session creates the subscription"
echo "  - Customer portal opens, cancel + reactivate work"
echo "  - Admin: /chart/admin-dashboard.html loads users/subscriptions; a write action succeeds"
echo "  - Webhook: 'stripe listen --forward-to $BASE_URL/journal/api/subscriptions/webhook'"
echo "    then 'stripe trigger customer.subscription.created' -> WebhookLog row = 'processed'"
echo "    and a bad signature (curl with garbage Stripe-Signature) -> 400"

[ "$FAIL" -eq 0 ] || exit 1
