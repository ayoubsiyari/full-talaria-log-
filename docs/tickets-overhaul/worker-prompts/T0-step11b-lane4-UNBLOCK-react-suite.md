# T0 step 11b (Lane 4) — UNBLOCK: react suite hangs / stuck

You reported the full react-parity suite is stuck. Do NOT keep waiting on a raw all-rows sweep — that is not what the integration build needs. Work through this in order.

## First: reframe the goal
Every multichart fix is already individually proven (H-R13, H-R14, H-R05/06, H-R01/04, H-R07 each 10/10 by their authoring lane). Your job is only to confirm they **co-exist in one build with no NEW regression** + reconcile the baseline. Use the **baseline-aware gate** (`npm run gate:react`), NOT a full `--runs=N` sweep of every row.

## Unblock checklist (run top to bottom)
1. **Kill stale servers/browsers** — a leftover `serve.mjs` on the harness port (e.g. 8791) or a zombie Chrome is the #1 cause of "stuck". Kill any running node/chrome from prior runs, then retry. (Windows: `Get-Process node,chrome | Stop-Process -Force` in a scratch shell — do NOT kill your editor.)
2. **Confirm the build actually finished** — `dist-v9` must exist and its build id must be current on BOTH host and inside a panel iframe. If build id never matches inside the iframe, the boot wait loops forever (looks stuck). Rebuild `npm run build:live` if unsure.
3. **Isolate the hanging row** — run one row at a time with a single run and a hard timeout:
   - `node react-run.mjs --only=H-R01 --runs=1`
   - then H-R04, H-R05, H-R06, H-R07, H-R13, H-R14 individually.
   - Whichever one never returns is the culprit. A scenario that waits on a selector/build-id that never appears will hang unless a per-scenario timeout is set.
4. **Make hangs fail fast** — ensure each scenario has a bounded timeout so a stuck wait becomes a FAIL (not an infinite hang). If a row hangs only in batch but passes solo, it's a teardown/leak between scenarios (stale iframe/settings root not cleared) — add the teardown the step-15/16 rows already use.
5. **Run the gate, not the sweep** — once no single row hangs: `npm run gate:react`. It only needs to PASS with 0 regressions against the reconciled baseline.

## If the suite is still flaky after the above (fallback — do not stay blocked)
- Confirm each required row passes **solo** (`--only=<row> --runs=3`) and record the result. Solo-green for all required rows + `gate:react` PASS is sufficient to green-light the deploy.
- If exactly one row is genuinely flaky/hanging and you cannot stabilize it quickly, **report which row + the last ~15 console lines** and proceed with the rest — do not hold the whole deploy on one flaky harness row. I (Manager) will decide whether to track it.

## Still required regardless
- Confirm the tree contains step 17 + step 5 (`MultichartGrid.jsx`), routing V3, A3, order-entry family 1 (see T0 step 11 checklist). Report the single canonical build id.
- Reconcile `known-failing.json` to the actual failing set (you own it now).

## Report
Update your T0 step 11 report (or a short addendum) with: what was hanging + the fix, the per-row solo results, `gate:react` PASS log, canonical build id, reconciled `knownFailing` array + SHA256 both trees.
