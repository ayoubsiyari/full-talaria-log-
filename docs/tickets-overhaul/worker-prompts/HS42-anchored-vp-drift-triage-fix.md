# H-S42 — anchored-VP anchor drift on 1m→5m TF switch: triage + fix (bless blocker)

**Context:** Combined build `20260717b11` passed the D-026 proof bar + 3× react gate, but the manager gate FAILED on **H-S42** (anchored volume profile anchor drift on 1m→5m TF switch). H-S42 was promoted GREEN at T0 step 16; regressed on b11. It is NOT quarantine-eligible without triage (D-027 entry bar). This is the sole bless blocker.

**Established:** b11 already contains Worker 5's VP freeze fix (recursion cure + bin cache, in the `2d35869f9` bundle). H-S42 is therefore a **separate** anchor-drift correctness defect, not the freeze. Likely RC-3 anchoring interaction (`ce3b28d2`) with the anchored-VP anchor resolution.

## Worker 4 — STEP 1 (isolate, fast)
Run H-S42 isolated on b11: `--only=H-S42 --runs=10`. Report 10/10 fail (deterministic regression) vs intermittent (flake). Capture the drift measurement (expected vs actual anchor position after the TF switch). Do NOT quarantine without this triage.

## CONFIRMED ROOT (Worker 4 isolation, 0/10 PASS — deterministic)
`d027-hs42-isolate-x10-b11.txt`: **p0 (left anchor) stable** across 1m→5m; **p1 (right anchor) drifts** `1784278320000 → 1784278200000` (120s / 2× 1m bucket) after TF switch. `timestampSource=barOpenFallback` on p1 instead of the captured `timestampPoints`. The "captured 1m timestamp+price anchor" setup sub-check also fails on p1. **Fix = right-edge anchor must resolve from captured `timestampPoints`, not `barOpenFallback`, on TF switch — mirror what p0 already does correctly (kill the left/right asymmetry).** Not quarantine material.

## Worker 5 — STEP 2 (root + fix, concurrent read-only start)
You own the anchored-VP anchor-resolution code you just fixed. Diagnose why the anchor **drifts** (moves to the wrong bar/price) on 1m→5m TF switch:
- Trace anchor persistence across TF change: `pointsFromTimestamps` / `resolveAnchoredVolumeProfileRange` / `timestampPoints` re-resolution after interval change.
- Compare to the passing behavior pre-`ce3b28d2` (bisect) and to H-S42-CORE (which passed) — what does the full harness row assert that CORE didn't?
- If deterministic regression: causal, gated fix (own switch, or extend the existing VP anchor switch), freeze-safe (drawing modules only — NOT `chart.js`). Switch-OFF → honest RED (drift returns).

## Then
- Worker 5 lands fix (fresh monotonic build id — NOT another b11/b12 collision; use `20260717b15`+). Both I8 trees, rebuild dist.
- Worker 4 re-assembles/re-cuts the combined build on the fix, re-runs the manager gate (H-S42 must PASS as promoted, not quarantined) + confirms react gate still green → **BLESS**.

## Commit hygiene note (Manager, non-blocking)
`2d35869f9 "orders"` squashed the VP fix + b11 assembly + quarantine + all docs into one commit — a D-022 breach. Not unwinding it now (bless first), but future lands stay file/hunk-scoped per D-022.

## Deliverable
`docs/tickets-overhaul/worker-reports/HS42-anchored-vp-drift-report.md`: isolation verdict, drift root (file:line), the fix + switch + RED/GREEN discriminator, build id, re-gate result.
