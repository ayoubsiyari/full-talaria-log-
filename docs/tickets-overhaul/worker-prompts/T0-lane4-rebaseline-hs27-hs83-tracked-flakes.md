# Lane 4 — re-baseline H-S27 / H-S83 as tracked flakes (clears gate Criterion 5)

## Why
Worker 2 triage (`T8-hs27-hs83-triage-report.md`) confirmed on build `20260716b10`, isolated runs:
- **H-S27** (finer-self-owner play viewport follow): 5/10 isolated → **FLAKE** (synthetic replayFrame seek-loop timing; path in `panel-cmd-bridge.js`, disjoint from `ecaa8a9c`/`817a81a1`).
- **H-S83** (finest-TF cadence, D-016): 10/10 isolated, full-gate FAIL = **session-order cadence pollution** (~80 scenarios in; shares ts0 with H-S82). Switch-OFF A/B healthy this cycle (not the Phase-0 vacuous flake).

Neither is a combined-build regression. They should be tracked flakes so the gate exits clean **without an engine fix on b10/b11**.

## Task (honest, I15)
1. Re-add **H-S27** and **H-S83** to `knownFailing` with **updated, specific reasons** (not "flaky" — cite: H-S27 = synthetic seek-loop timing race, isolated 5/10; H-S83 = session-order cadence pollution, isolated 10/10, switch-OFF non-vacuous). Reference the triage report.
2. Confirm both are NOT attributable to `ecaa8a9c` (H-R03 dedupe) or `817a81a1` (I13 hygiene) — record that in the reason.
3. Re-run `gate:react` / manager gate and confirm it now **exits clean** with these two tracked (0 unexpected regressions). Do NOT mask any other row.
4. **Honesty guard (I15):** these stay flagged as tracked flakes, NOT counted as fixes; per the H-S27 honesty follow-up, H-S27 is a synthetic-harness RED and is not a trusted row until re-actuated production-faithfully (post-bless).

## Constraints
- Edit `known-failing.json` (+ mirror if applicable, I8). No product edits.
- This does NOT bless anything — it only restores a clean gate baseline so the eventual transport-fix bless can run without stale flake noise.

## Deliverable
`docs/tickets-overhaul/worker-reports/T0-lane4-rebaseline-hs27-hs83-report.md`: the two knownFailing entries with reasons, the clean gate run evidence file name, explicit note that neither is fix-counted.
