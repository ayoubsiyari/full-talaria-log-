#!/usr/bin/env bash
# LIFE-4 review checks. Money-path row, so the questions are about what happens when things are
# ABSENT or WRONG, not whether the happy path works.
set -uo pipefail
cd "$(dirname "$0")"
R=/c/Users/user/Desktop/talaria1/manager-d-trade
cd "$R" 2>/dev/null || cd "C:/Users/user/Desktop/talaria1/manager-d-trade"

echo "=========== 1. can GET /state ever return WITHOUT the completeness metadata? ==========="
echo "-- every return in the /state GET route --"
python3 - <<'PY'
import re
p = "chart v 1.4/chart/api_server.py"
src = open(p, encoding="utf-8").read().splitlines()
# locate the GET /state route
start = None
for i, l in enumerate(src):
    if 'sessions/{session_id}/state' in l and '@app.get' in l:
        start = i
        break
if start is None:
    print("  could not locate @app.get for /state - reporting failure rather than silence")
    raise SystemExit(1)
# walk to the next top-level decorator
end = start + 1
while end < len(src) and not (src[end].startswith('@app.') and end > start + 2):
    end += 1
body = src[start:end]
print(f"  route spans source lines {start+1}..{end}")
applies = [i for i, l in enumerate(body) if 'apply_journal_page_to_state_for_response' in l]
returns = [i for i, l in enumerate(body) if re.match(r'\s+return\b', l)]
print(f"  calls to apply_journal_page_to_state_for_response: {len(applies)} at {[start+1+i for i in applies]}")
print(f"  return statements in the route: {len(returns)} at {[start+1+i for i in returns]}")
for i in returns:
    guarded = any(a < i for a in applies)
    print(f"    line {start+1+i}: {'AFTER a metadata apply' if guarded else 'BEFORE any metadata apply  <-- would omit journal_complete'}")
    print(f"      {body[i].strip()[:110]}")
PY

echo
echo "=========== 2. is 'locally-authored' ever assigned? ==========="
echo -n "  assignments to _journalProvenance = 'locally-authored': "
grep -c "_journalProvenance *= *'locally-authored'" "chart v 1.4/chart/modules/order-manager.js" || true
echo -n "  appearances in the durable allow-list check: "
grep -c "=== 'locally-authored'" "chart v 1.4/chart/modules/order-manager.js" || true
echo "  (an admit-list entry that nothing can ever set is dead today and a silent grant tomorrow)"

echo
echo "=========== 3. does the guard have a kill-switch? (roster says 'no switch; guard is the fix') ==========="
grep -n "__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1" "chart v 1.4/chart/modules/order-manager.js" | head -4 | sed 's/^/  /'

echo
echo "=========== 4. mirror identity, re-verified now (not at D's commit time) ==========="
for f in chart.js modules/order-manager.js; do
  a=$(git hash-object "chart v 1.4/chart/$f")
  b=$(git hash-object "homepage/public/chart/$f")
  if [ "$a" = "$b" ]; then echo "  AGREE    $f"; else echo "  DIVERGE  $f   chart=$a mirror=$b"; fi
done
echo "  (D has uncommitted LAG-1a edits in order-manager.js; a mirror proven at dd0dc4445 says"
echo "   nothing about the tree that would actually ship)"

echo
echo "=========== 5. do D's own tests actually fail if the guard is removed? ==========="
echo "  -- listing the invariant assertions rather than just running them green --"
grep -nE "assert|throw new Error" scripts/tests/m8-state-bound-invariant.test.mjs 2>/dev/null | head -12 | sed 's/^/  /'
