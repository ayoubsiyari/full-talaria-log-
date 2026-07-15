# T0 step 15 (Lane 4) — gate baseline reconcile (restore a truly-green gate)

## Why
The T8 step-5b reconcile confirmed H-S20 was a real regression (now fixed). The remaining gate red — **H-S6, H-S25, H-S28, H-S32, H-S33** — is **baseline drift**: all are in `expectedTests` but failing, and only H-S34–H-S50 are in `knownFailing`. A gate that's "green except for 5 we agree to ignore" quietly erodes the honest-gate discipline (the whole D-012 lesson). As harness owner (sole editor of `known-failing.json`), reconcile it.

## Task
For each of **H-S6, H-S25, H-S28, H-S32, H-S33**:
1. **Isolated re-run** (2–3×): deterministic-fail vs flake.
2. **Classify + act:**
   - **Genuine known-broken defect** (e.g. H-S32/H-S33 = the D-012-retracted interaction rows) → move to `knownFailing` **with a registry row + one-line reason** so it's tracked, not hidden.
   - **Flaky** (e.g. H-S25 same-TF eased follow at bar seams — confirm it fails pre-step-5 too) → flake-watch entry + stabilize the assertion if cheap; otherwise document the seam tolerance.
   - **Real pre-existing defect worth fixing** → registry row + RC tag, queue as a targeted task (do NOT silently bury in knownFailing without a reason).
3. **Confirm the fence** (H-S17/H-S19/H-S19b) and the fixed H-S20 are deterministically green in the reconciled gate.
4. **Fold in the pending promotion:** add H-S59–H-S78 to `expectedTests`/`knownFailing` per the T8 step-1 handoff (coverage scenarios encode current behavior).
5. Run the full gate once reconciled; report the true green/known-failing counts.

## Deliver
A disposition table (row → isolated pass rate → classification → action → registry ref), the reconciled `known-failing.json` diff, and the final gate summary. Report per WORKER-REPORT-STANDARD.md.

## Guardrails
- You are the ONLY editor of `known-failing.json`.
- I8 both trees; do not edit product code (registry/harness/baseline only).
- No `react-parity-lib.mjs` conflict (that's your rebuild — keep it separate).
