#!/usr/bin/env bash
# A test account that matches the users who actually hit this: max_sessions = 1.
#
# Every probe so far ran as the QA account, which has max_sessions = 2. "Reload the tab and open a
# second one" fits inside a limit of 2, so no eviction ever happened and the reported scenario was
# never actually reproduced — 33 claims, zero 409s. 21 of the 25 real accounts are on 1.
#
# Clones the QA account's credentials and entitlements so login and chart access behave the same,
# and changes only max_sessions. Leaves the QA account untouched so D's M20-J1 work is unaffected.
set -euo pipefail
Q() { docker exec talaria-db-1 psql -U talaria -d talaria -A -F' | ' -c "$1"; }

EMAIL=k4-probe@talaria-log.com

echo "=== columns we must carry over ==="
Q "SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
   FROM information_schema.columns
   WHERE table_name='users' AND is_nullable='NO' AND column_default IS NULL;"

echo
echo "=== create (or reset) the max_sessions=1 probe account, cloned from QA ==="
Q "DELETE FROM chart_window_presence WHERE user_id IN (SELECT id FROM users WHERE email='$EMAIL');"
Q "DELETE FROM users WHERE email='$EMAIL';"
# Copy every column except the identity and the two we are overriding, so entitlements match QA
# exactly without this script needing to know the schema.
Q "DO \$\$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
  FROM information_schema.columns
  WHERE table_name='users'
    AND column_name NOT IN ('id','email','max_sessions','name','public_id','stripe_customer_id');
  EXECUTE format(
    'INSERT INTO users (email, max_sessions, name, public_id, %s)
       SELECT %L, 1, %L, %L, %s FROM users WHERE id=128',
    cols, '$EMAIL', 'K4 Probe', 'TLR-K4PROBE01', cols);
END \$\$;"

echo
echo "=== confirm ==="
Q "SELECT id, email, role, max_sessions, is_active, has_journal_access, access_expires_at
   FROM users WHERE email='$EMAIL';"
echo
echo "=== QA account untouched ==="
Q "SELECT id, email, max_sessions FROM users WHERE id=128;"

echo
echo "=== the cloned credentials actually work ==="
# shellcheck disable=SC1091
. /root/.talaria-test-env
BODY=$(printf '{"email":"%s","password":"%s"}' "$EMAIL" "$TEST_PASSWORD")
curl -s -o /dev/null -w '  login as k4-probe: http %{http_code}\n' \
  -X POST -H 'Content-Type: application/json' -d "$BODY" http://127.0.0.1:3000/api/auth/login
