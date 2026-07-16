# Lane 2 — TRIAGE (read-only): H-S30 unexpected manager-gate regression (flake vs real)

## Context
Lane 4 rebaseline (`T0-lane4-rebaseline-hs27-hs83-report.md`) got H-S27/H-S83 tracked, but the full manager gate on `20260716b10` now shows **`GATE H-S30 FAIL`** — unexpected (H-S30 was previously "already fixed by the step-spam guard, promote-only", so it's expected to PASS and is NOT in `knownFailing`). Worker 4 correctly did not mask it. Criterion 5 is blocked until H-S30 is classified.

## Constraints
- **READ-ONLY. No product edits, no knownFailing edits.** Classify only.
- Honest actuation (I15). Do NOT edit the harness lib / scenarios owned by Lane 4 during the bless; run existing scenarios.

## Task — same method as the H-S27/H-S83 triage
1. **Isolated ×10** on `20260716b10`: run H-S30 alone (fresh session per run). Record PASS rate.
2. **Switch A/B** on `__TALARIA_MC_DISABLE_STEP_SPAM_REFETCH_GUARD`: confirm the row is non-vacuous (switch-OFF changes the outcome), so it's a real assertion not a dead test.
3. **Full-suite position:** does it fail only deep in the ~24-min suite (session-order pollution, like H-S27/H-S83 at ~80 scenarios), or does it fail early/isolated too?
4. **Attribution:** is H-S30 attributable to any recent commit — `ecaa8a9c` (H-R03 dedupe), `817a81a1` (I13 hygiene), or the b11/b12 order-manager fixes (TDZ, SL/TP-drag)? H-S30's path is replay step-spam refetch (`panel-cmd-bridge`/replay) — confirm disjoint or not.

## Verdict (one of)
- **FLAKE (session-order):** isolated PASS, fails only deep in suite → recommend tracking in `knownFailing` with a specific reason (Lane 4 action), criterion 5 then clears. NOT fix-counted.
- **REAL REGRESSION:** fails isolated / attributable to a commit → identify the mechanism + owning lane + proposed gated fix. Bless stays blocked until fixed.

## Deliverable
`docs/tickets-overhaul/worker-reports/T8-hs30-triage-report.md`:
- Isolated ×10 result + switch A/B (non-vacuous?) + full-suite position.
- Attribution (disjoint from recent commits or not).
- Verdict FLAKE vs REAL, with the specific `knownFailing` reason (if flake) or mechanism + fix owner (if real).
- Evidence file names (not committed).
STOP after report.
