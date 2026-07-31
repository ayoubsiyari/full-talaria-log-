#!/usr/bin/env bash
# Undo my own residue.
#
# run-freeze-arm.sh raises qa-canary's max_sessions to 12 so eviction cannot confound a freeze run,
# and it does NOT restore it — restoration lived in the traps of the two wrapper scripts. My
# fill-missing-cell.sh called run-freeze-arm.sh directly, so the cap has been sitting at 12 since.
# Product value is 2. That account is the one D uses for M20-J1, so leaving it at 12 changes
# behaviour under someone else's feet.
#
# This is the third time today the same shape has bitten me: cleanup attached to a caller rather
# than to the thing that made the mess. The fix belongs in run-freeze-arm.sh itself, but restoring
# state comes first.
set -uo pipefail
Q() { docker exec talaria-db-1 psql -U talaria -d talaria -At -c "$1"; }

echo "== before =="
Q "SELECT id||'  '||email||'  max_sessions='||max_sessions FROM users WHERE id IN (128,131);" | sed 's/^/  /'
Q "SELECT '  presence rows: '||count(*) FROM chart_window_presence;"
Q "SELECT '    user '||user_id||'  '||client_id||'  last_seen '||last_seen_at FROM chart_window_presence ORDER BY last_seen_at;"

echo
echo "== restoring qa-canary to its product value of 2 =="
Q "UPDATE users SET max_sessions=2 WHERE id=128 RETURNING 'now max_sessions='||max_sessions;" | sed 's/^/  /'

echo
echo "== clearing presence rows left by my probe accounts only =="
Q "DELETE FROM chart_window_presence WHERE user_id IN (128,131);" | sed 's/^/  deleted: /'

echo
echo "== after =="
Q "SELECT id||'  '||email||'  max_sessions='||max_sessions FROM users WHERE id IN (128,131);" | sed 's/^/  /'
Q "SELECT '  presence rows remaining: '||count(*) FROM chart_window_presence;"

echo
echo "== B-owned account that still exists, flagged rather than silently removed =="
Q "SELECT '  id '||id||'  '||email||'  active='||is_active||'  max_sessions='||max_sessions
   FROM users WHERE id=131;"
echo "  Created by seed-k4-account.sh to reproduce eviction on a max_sessions=1 account, which the"
echo "  QA account cannot do. Credentials cloned from qa-canary, so it introduces no new secret."
echo "  Not removed now because C may need a cap-1 account tonight. It must not survive the release."
