# T8 step 5b (Lane 2) — honest disposition of the step-5 gate regressions (I9)

## Why
The step-5 report listed gate regressions on **H-S6, H-S20, H-S25, H-S28, H-S30, H-S32, H-S33** as "mostly pre-existing flakes / drawing tests." **"Mostly" is not an acceptance** (I9: the gate stays green; I15: no hand-wave). Each row must be classified with evidence before step 5 is accepted beyond the freeze feel-check. This is the exact discipline that caught the D-012 false-greens — do not repeat it.

## Task (read-only + isolated re-runs; no product edits unless a true regression is found)
For **each** of the 7 rows:
1. **Isolated re-run** (2–3×) to separate deterministic failure from flake. Record pass/fail counts.
2. **Baseline diff:** run the same scenario on the **pre-step-5 tree** (or the last known-good build) and compare. A row that fails identically before step 5 = pre-existing; a row that only fails after = **step-5 regression**.
3. **Classify** each: `PRE-EXISTING-FLAKE` / `PRE-EXISTING-KNOWN-FAILING` (e.g. H-S32/H-S33 are the D-012-retracted interaction rows — confirm they're in `known-failing.json` and not counted as new) / `DRAWING-UNRELATED` / **`STEP-5-REGRESSION`**.
4. **Coordinate the baseline with Lane 4** (owner of `known-failing.json`) — confirm the gate ran against the correct known-failing set so "regression" is measured honestly, not against baseline drift.
5. **If any row is a true STEP-5-REGRESSION:** fix it (gated under the same `__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE`), re-run, prove green. If it can't be cleanly fixed, STOP and report — do not ship past staging.

## H-S25 note
The report already admits H-S25 (same-TF eased follow) is intermittently flaky at bar seams on the **unchanged** mirror-success path. Confirm that's true (fails pre-step-5 too) — if so, classify PRE-EXISTING-FLAKE and log it to the flake watch; if it only started with step 5, it's a regression.

## Deliver
A 7-row disposition table (row → isolated pass rate → pre/post-step-5 → classification → evidence), Lane 4 baseline-coordination note, and confirmation the **fence family (H-S17/H-S19/H-S19b) is deterministically green**. Report per WORKER-REPORT-STANDARD.md.

## Guardrails
- I8 both trees; I9 gate; do NOT touch `react-parity-lib.mjs`.
- Freeze-exempt path; staging-only.
