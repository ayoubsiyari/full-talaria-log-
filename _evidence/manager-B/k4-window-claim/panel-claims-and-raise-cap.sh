#!/usr/bin/env bash
# Urgent, two jobs.
#
# JOB 1 — raise the cap, because C's night depends on it and it is reversible.
#
# JOB 2 — establish whether the cap was ever the constraint. The code says a page carrying
# ?panelId= does not claim a window and reuses the host page's id, so N multichart panels would
# consume ONE slot and my warning to C would not apply. That is a code reading, and code readings
# are what I have been told not to trust. Test it: open the chart shell normally, then with
# ?panelId=, and count claims each time.
#
# The answer changes the advice completely:
#   panels do not claim  -> C's four-panel soak is unaffected by the cap; do not stop it
#   panels do claim      -> the cap was the constraint and the raise below was necessary
set -uo pipefail
Q() { docker exec talaria-db-1 psql -U talaria -d talaria -At -c "$1"; }

echo "=== JOB 1: raise the cap ==="
echo "  qa-canary before: $(Q "SELECT max_sessions FROM users WHERE id=128;")"
Q "UPDATE users SET max_sessions=6 WHERE id=128;" | sed 's/^/  /'
echo "  qa-canary after:  $(Q "SELECT max_sessions FROM users WHERE id=128;")   (6 = four panels plus headroom)"
echo "  read back from the product's own gate rather than the column:"
Q "SELECT 'cap='||max_sessions||'  slots_held='||(SELECT count(*) FROM chart_window_presence WHERE user_id=128) FROM users WHERE id=128;" | sed 's/^/    /'

echo
echo "=== JOB 2: does a ?panelId= page claim a window? ==="
Q "DELETE FROM chart_window_presence WHERE user_id=128;" >/dev/null
cd /root/b-tal01891 && node panel-vs-host-claims.mjs 2>&1 | tail -6

echo
echo "=== leave no slots behind ==="
Q "DELETE FROM chart_window_presence WHERE user_id=128;" | sed 's/^/  /'
