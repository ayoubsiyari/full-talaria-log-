# Lane 4 — track H-S30 as flake (clear criterion 5) + register peer-B backfill follow-up

## Context
Worker 2 triage (`T8-hs30-triage-report.md`) verdict = **FLAKE**:
- Host step-spam assertion HEALTHY: switch A/B non-vacuous (OFF 3/3 FAIL fetches=1, ON phase2=0). Guard works.
- Flaky part = secondary **peer-B independent 1h backfill during phase-2**, ~60% isolated fail. Index 27/83 (early-mid, not deep-suite-only).
- NOT attributable to `ecaa8a9c`, `817a81a1`, or order-manager b11/b12 — it's chart.js/replay-system replay step-spam path.

## Task
1. Re-add **H-S30** to `knownFailing` (BOTH I8 trees) with a **specific reason** — cite: guard healthy (host phase2=0, non-vacuous A/B); flake is peer-B independent 1h backfill during phase-2 (~60% isolated); NOT attributable to recent commits; NOT fix-counted.
2. Re-run the manager gate → confirm **criterion 5 now exits clean** (H-S27/H-S83/H-S30 all `PASS (known-failing)`, 0 unexpected regressions). Do NOT mask anything else.
3. **Honesty follow-up (I15):** record that the peer-B ~60%-fail assertion is a **post-bless T8 candidate** — a 60% rate is high for pure harness noise; if peer-B is doing a real unnecessary phase-2 backfill, it is a real (minor) behavior to re-actuate production-faithfully post-bless. Not fix-counted, not silently closed.

## Constraints
- `known-failing.json` both trees only. No product edits. Does NOT bless.
- `gate:react` will still show H-R04/H-R05 (transport fix in flight, Lane 1) — out of scope, do not mask.

## Deliverable
`docs/tickets-overhaul/worker-reports/T0-lane4-track-hs30-report.md`: the knownFailing entry, clean manager-gate evidence (criterion 5 exits clean), the peer-B post-bless follow-up note. Confirm H-S30 not fix-counted.
