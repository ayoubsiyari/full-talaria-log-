# T3 step 4 (Lane 2) — panel-B interaction common-root diagnostic (+ pre-authorized consolidated fix)

**Cold-start:** read `INVARIANTS.md` (esp. **I14** postMessage-bridge-only; **I8** mirrors), `WORKER-REPORT-STANDARD.md`, `D-011` in `DIRECTOR-DECISIONS.md`, the T0-step9 report (`worker-reports/T0-step9-parity-clickrow-fidelity-report.md`) and the real-iframe harness (T0 step 8b). Acceptance surface is the **built product** real-iframe harness — dev:live does NOT count (D-010).

## Context
On the real-iframe harness, panel-B interaction is RED across 7 rows: **H-R01** (single-click → no parent V9 quick bar), **H-R04** (dbl-click→settings), **H-R05** (Esc leaves chrome selected), **H-R06** (delete doesn't remove), **H-R07** (peer isolation), **H-R08** (marquee), **H-R09** (click chain). Hypothesis: **H-R01 is the root** — panel-B selection never drives the parent V9 chrome over the bridge, and settings/Esc/delete/chain cascade from it.

## STEP 0 — MANDATORY (D-011): fallback-posture A/B FIRST
b26 runs the **fallback-B posture** (panels default to pre-T1 legacy behavior). **Before** hunting a root, re-run the failing HR-PARITY rows with the **retained T1 migration switches turned ON in the panel**. For each row record: fails-with-migration-ON (real root candidate) vs **passes-with-migration-ON (= our own intentional rollback state → NOT a defect now; tag for future re-migration scope, do not fix)**. Report this table before any root analysis. Do not spend a single cycle "fixing" a symptom that is just our revert.

## STEP 1 — Confirm the common root
For the rows that still fail with migration ON, test the hypothesis: does driving **panel-B selection → parent V9 chrome over the postMessage bridge** (I14) collapse **H-R01/H-R04/H-R05/H-R06/H-R09** together? Prove it (one mechanism vs several). Explicitly determine whether **H-R07 (peer isolation)** and **H-R08 (marquee)** collapse with the root or are independent — per D-011 they **stay on their own tracks unless proven to collapse**.

## STEP 2 — Consolidated fix (PRE-AUTHORIZED by D-011 if root confirms; no re-escalation)
Scope fence (binding): **selection→parent-chrome routing only.**
- **T3/Lane 2 owns** the parent-side: parent V9 chrome subscribes to panel-B selection over the bridge (I14 — no parent globals/shared closures in the panel path).
- **Lane 1 provides the engine-side emit** (panel emits selection over the bridge) as a **separate gated commit** — file-ownership rule intact; coordinate, don't edit engine drawing files yourself.
- One kill-switch for the routing fix (I13, all touched files, both trees). NOT a wholesale fallback reversal.

## Acceptance (D-010 / D-011)
HR-PARITY rows that map to the root flip **RED→GREEN on the real-iframe harness** (built dist-v9, build id inside panel B), 10× deterministic; **+ parity checklist on the built product**. Manager gate green (I9). H-R07/H-R08 excluded unless the diagnostic folded them in with evidence.

## DELIVER
`worker-reports/T3-step4-panelB-interaction-root-report.md` per WORKER-REPORT-STANDARD: the step-0 fallback-posture table (which reds are our own rollback), the root proof (which rows collapse to one mechanism), the fix diff + the Lane-1 engine-emit commit reference, harness RED→GREEN, gate result, SHA256 both trees.
