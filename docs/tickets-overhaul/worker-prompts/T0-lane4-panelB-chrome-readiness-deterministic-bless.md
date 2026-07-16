# T0 (Lane 4) — panel-B parent-chrome readiness barriers → deterministic gate:react bless

Session isolation (`REACT_PARITY_ISOLATE_SESSION=1`, fresh browser/scenario) removed most rotation — good, keep it. Residual rotating flakes narrowed to **H-R01 / H-R04 / H-R05 / H-R12** (all panel-B parent-chrome timing rows). Still NOT 3/3 consecutive clean → NOT blessed (correct, I15). This pass makes the panel-B chrome waits **deterministic** rather than timeout-based.

## STEP 1 — Strict isolation confirm (distinguishes harness-timing vs real race)
Run each ×10 **fully isolated** (`--only=H-R01 --runs=10`, etc. for H-R04/H-R05/H-R12) with `REACT_PARITY_ISOLATE_SESSION=1`.
- **All 10/10 PASS isolated** → residual is suite-timing → STEP 2 (harness readiness barriers).
- **Any flakes even isolated** → the readiness race is real, not suite-only → STOP STEP 2, report which rows + evidence; Lane 1 read-only diagnostic is running in parallel to name the product race. Do not force it with longer sleeps.

## STEP 2 — Replace timeouts with a real readiness signal
The retry ladders (`awaitParentChromeAfterPanelSelect`, longer timeouts) are still time-based. Make the panel-B chrome waits **event/state-driven**:
- Wait on an actual "parent chrome ready for panel B" condition (V9 toolbar/gear DOM present AND bound AND the selection round-trip acknowledged) — poll the real ready-state, not a fixed delay.
- Apply uniformly to H-R01 (chrome-on-select), H-R04 (settings dbl-click), H-R05 (Esc close), H-R12 (gear route).
- Keep frozen actuation fidelity (D-021/D-023) — this is *waiting for ready*, not changing how the click acts. Both trees (I8), file-scoped.

## STEP 3 — Deterministic bless (no retry-until-green)
- Run `gate:react` **3 consecutive times** — must be 3/3 clean on consecutive runs (record all 3, no cherry-pick). If not 3/3, STOP and report — do NOT bless.
- Re-confirm manager `npm run gate` 0 regressions + the 4 discriminators still flip (H-R03 dedupe-off, H-R02 actuation-miss, H-R06 kb-off, H-R07 phase5-off).
- Bless `20260716b10`; reconcile stale manifest §4/§5 lines; report blessed BUILD_ID for PO.

## Guardrails
Lane 4 harness/known-failing/build only. No engine edits. If STEP 1 finds a real race → hand to Lane 1 (parallel diagnostic), don't fix engine here. WORKER-REPORT-STANDARD.md.

## Report
`docs/tickets-overhaul/worker-reports/T0-lane4-panelB-chrome-readiness-report.md` — STEP 1 isolation rates (4 rows), STEP 2 readiness-signal implemented, STEP 3 three-consecutive-run evidence + bless id OR BLOCKED with the isolation verdict.
