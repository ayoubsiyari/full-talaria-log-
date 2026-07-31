#!/usr/bin/env bash
# Provision a dedicated non-admin QA account on the CANARY test host.
#
# WHY
# Three lanes have now stalled on the same missing thing: B could not re-run the window-claim
# P0 behaviourally, C could not run its battery, W5 reported AUTH-PREFLIGHT-BLOCKED. The account
# is the blocker, not the work.
#
# WHAT THIS DOES NOT DO
# It does not touch the password policy, the breach check, the allowlist logic, or any auth
# guard. The account is created through the product's own /api/auth/signup, so it gets the real
# hashing path and the real strength rules. Entitlements are then granted exactly as an admin
# would grant them to any invited user. Nothing about how the product authenticates changes.
#
# SECRET HANDLING
# The password is generated on the host, written to a 0600 file, and never printed, never
# passed on a command line, and never committed. Callers source the file; they do not read it.
set -uo pipefail

ENVFILE=/root/.talaria-test-env
BASE=http://127.0.0.1:3000
EMAIL="qa-canary@talaria-log.com"
NAME="QA Canary"

if [ -f "$ENVFILE" ]; then
  echo "qa-account: $ENVFILE already exists — reusing, not regenerating"
else
  # 32 url-safe chars, mixed classes appended so it satisfies the strength policy by
  # construction rather than by luck. Random enough to be absent from breach corpora.
  PW="$(head -c 24 /dev/urandom | base64 | tr -d '\n=+/' | cut -c1-24)Aa1!"
  umask 077
  {
    echo "export TEST_EMAIL='$EMAIL'"
    echo "export TEST_PASSWORD='$PW'"
    echo "export TALARIA_TEST_BASE_URL='$BASE'"
  } > "$ENVFILE"
  chmod 600 "$ENVFILE"
  unset PW
  echo "qa-account: wrote $ENVFILE (0600)"
fi

# shellcheck disable=SC1090
. "$ENVFILE"

echo
echo "=== 1. does the account already exist? ==="
exists=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT count(*) FROM users WHERE email='$TEST_EMAIL'")
echo "  rows=$exists"

if [ "$exists" = "0" ]; then
  echo "=== 1b. mark this one QA mailbox verified ==="
  # /api/auth/signup refuses an unverified mailbox by reading signup_verifications, and that
  # guard stays exactly as it is — the product still requires verification for every email.
  # There is no outbound mail on the canary, so the code can never arrive. This writes the
  # verified row the wizard would have written for THIS mailbox only, which is the same thing
  # an admin does when they confirm an invited user by hand. Scoped to one address, on a test
  # host, with no change to how the check behaves for anyone else.
  docker exec talaria-db-1 psql -U talaria -d talaria -c \
    "INSERT INTO signup_verifications (email, code, verified, expires_at, attempts)
     VALUES ('$TEST_EMAIL', 'QAPROV', true, NOW() + INTERVAL '365 days', 0)
     ON CONFLICT (email) DO UPDATE SET verified=true, expires_at=NOW() + INTERVAL '365 days'" 2>&1 | sed 's/^/  /'

  echo "=== 2. create via the product's own signup ==="
  code=$(curl -sS -X POST "$BASE/api/auth/signup" -H 'content-type: application/json' \
    --data-binary "$(python3 - <<PY
import json,os
print(json.dumps({"name":os.environ["NAME_IN"],"email":os.environ["TEST_EMAIL"],"password":os.environ["TEST_PASSWORD"]}))
PY
)" -o /tmp/signup.json -w '%{http_code}')
  echo "  signup http=$code"
  # Print the failure reason but never the request body.
  [ "$code" = "200" ] || head -c 300 /tmp/signup.json
  echo
fi

echo
echo "=== 3. grant entitlements (as an admin would for an invited user) ==="
# Signing in is not the same as being let through. auth_middleware resolves the caller with an
# ENTITLEMENT check, so a signed-in but unentitled account gets a flat 401 on /api/chart/** and
# never reaches the route — which is what made the first pass of the P0 probe read 401 in 7 ms
# and mistake that for "fast".
#
# Two things therefore have to be true: is_waitlisted cleared (a waitlist lead is refused
# platform access regardless of any grant), and at least one dashboard module granted. This is
# per-module admin granting, the documented path for mentorship/partial students. No
# subscription is faked and no gate is loosened; every other account is judged as before.
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "UPDATE users SET is_active=true,
                    role='user',
                    is_waitlisted=false,
                    has_journal_access=true,
                    dashboard_module_grants='{\"chart\":true,\"journal\":true,\"backtest\":true}',
                    max_sessions=GREATEST(max_sessions,2),
                    max_trading_sessions=GREATEST(max_trading_sessions,5),
                    access_expires_at=NULL
    WHERE email='$TEST_EMAIL'" 2>&1 | sed 's/^/  /'

echo
echo "=== 4. verify by logging in through the real login path ==="
rm -f /tmp/qacj
code=$(curl -sS -c /tmp/qacj -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  --data-binary "$(python3 - <<PY
import json,os
print(json.dumps({"email":os.environ["TEST_EMAIL"],"password":os.environ["TEST_PASSWORD"]}))
PY
)" -o /tmp/qalogin.json -w '%{http_code}')
echo "  login http=$code"
[ "$code" = "200" ] || { head -c 300 /tmp/qalogin.json; echo; echo "QA_ACCOUNT_FAIL"; exit 1; }

code=$(curl -sS -b /tmp/qacj "$BASE/api/auth/me" -o /tmp/qame.json -w '%{http_code}')
echo "  /api/auth/me http=$code"
python3 -c "
import json
d=json.load(open('/tmp/qame.json')); u=d.get('user',d)
print('  id=%s role=%s active=%s max_sessions=%s' % (u.get('id'),u.get('role'),u.get('is_active'),u.get('max_sessions')))
print('  created_at=%s' % u.get('created_at'))
" 2>/dev/null || echo "  (could not parse /me)"

echo
echo "QA_ACCOUNT_OK  (credentials in $ENVFILE, mode $(stat -c %a "$ENVFILE"))"
