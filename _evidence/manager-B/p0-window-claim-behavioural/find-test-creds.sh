#!/usr/bin/env bash
# Locate a usable non-admin test account WITHOUT printing any secret value.
# Reports presence and shape only.
set -uo pipefail

echo "=== env files that might carry TEST_EMAIL (names only, never values) ==="
for f in /root/.talaria-test-env /opt/talaria/.env /opt/talaria/.env.test /root/talaria-restore/test-env.sh /root/.bashrc; do
  if [ -f "$f" ]; then
    n=$(grep -cE '^\s*(export\s+)?TEST_(EMAIL|PASSWORD)=' "$f" 2>/dev/null || echo 0)
    printf '  %-40s exists, TEST_* lines=%s\n' "$f" "$n"
  else
    printf '  %-40s absent\n' "$f"
  fi
done

echo
echo "=== prior probe cookie jars left on the host ==="
ls -l /tmp/cj /tmp/cj2 2>/dev/null || echo "  none"

echo
echo "=== candidate non-admin users in the db (id + role only, no PII beyond domain) ==="
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT id || ' role=' || role || ' active=' || is_active || ' email_domain=' || split_part(email,'@',2)
     FROM users ORDER BY id LIMIT 15" 2>&1 | sed 's/^/  /'
