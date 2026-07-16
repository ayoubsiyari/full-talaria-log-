# T0 (Lane 4) — D-021 conditions: freeze harness reference + close 8 artifact rows + promote H-S34/35/44

D-021 attached two measurement-integrity conditions and folded in registry duties. Execute all.

## 1. Freeze the hit-coord-fixed harness as the reference
- Record the frozen reference SHA256 of `react-parity-lib.mjs` (`D8FBDDD6…` per your report) in `MANAGER-FINDINGS.md` under a clear "FROZEN HARNESS REFERENCE" line (both trees).
- Add a short note in the harness (comment or `HARNESS-REFERENCE.md`) stating: **any future actuation change must re-run the Phase-1 A/B discriminator** (`react-run --only=H-R02,H-R03 --runs=10` ON vs `--phase1-off`) and prove H-R03 still flips 10/10 FAIL with the substrate off — before the changed harness's results are trusted. The A/B is now the harness's own regression test.

## 2. Close the 8 artifact rows as "measurement-artifact" (NOT fixed)
- In `PER-BUG-REGISTRY.csv`, the HR-PARITY rows corresponding to the 8 flipped-green surfaces (H-R01/02/03/04/05/08/13/14) close with disposition **`measurement-artifact`** — explicitly not `fixed`. Add a note: pre-fix actuation clicked off-viewport on panned charts; testers' live experience never disagreed. Do NOT inflate fix-rate stats by marking these fixed.
- Keep H-R06, H-R07 as **honest-RED / open** (the two real engine rows).

## 3. Baseline + promotions
- H-S34/35/44 promotion duties (per P5 scope) — confirm/queue; promote when H-R07 lands.
- Confirm the known-failing baseline reflects the 2-row react matrix (H-R06, H-R07) + the H-S27/H-S83 removals you already made (host 33→31). Re-run `npm run gate` + `gate:react` and record clean-exit evidence.

## 4. Wire the A/B switch-OFF hooks for the two remaining rows
- Ensure `--panel-keyboard-off` / `REACT_PARITY_PANEL_KEYBOARD_OFF` (H-R06, Lane 1) and the P5 peer-isolation switch-OFF hook (H-R07, Lane 2) exist in the frozen harness for the D-011 A/B proofs. You own `react-parity-lib.mjs` — coordinate so Lanes 1/2 don't edit it.

## Guardrails
- No product/engine edits. Registry + harness (`react-parity-lib.mjs`, `known-failing.json`) + findings only. Both trees I8 where mirrored. File-scoped commits.

## Report
`docs/tickets-overhaul/worker-reports/T0-lane4-D021-harness-freeze-artifact-closure-report.md` — frozen SHA logged, 8 rows closed as measurement-artifact (list them), baseline gate evidence, A/B hooks confirmed for H-R06/H-R07.
