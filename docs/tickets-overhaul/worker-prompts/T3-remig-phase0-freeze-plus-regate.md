# RE-MIGRATION Phase 0 FREEZE + re-gate (Lane 4)

Step 17 answered the 12-vs-10 (H-R07/H-R12 green on fallback-B → 10 honest REDs). Two things to close Phase 0 cleanly per D-018 #2, plus a re-gate after Lane 1's H-S18 fix.

## Task 1 — freeze the authoritative row→phase map
Produce the frozen Phase-0 artifact (append to `T3-REMIGRATION-PLAN.md` or a `T3-PHASE0-FROZEN-MATRIX.md`):
1. The **10 authoritative honest-RED rows** (ids + one-line symptom + honest actuation used).
2. **Row → phase** assignment (P1–P6) per the plan.
3. **Explicitly record H-R07 + H-R12 as GENUINELY-GREEN-ON-FALLBACK (dropped)** and **which phases shrink** as a result — in particular confirm whether **H-R12's chrome leg removes work from Phase 2** and whether any Phase 5 row drops. This is the binding scope Phase 1+ execute against.
4. Wire/confirm the per-phase `phase1Off` / master-switch A/B hook Lane 1 needs to prove Phase 1's switch-OFF RED restoration.

## Task 2 — re-gate after Lane 1's H-S18 fix (coordination)
The manager gate is currently poisoned by H-S18 (`Maximum call stack size` in `drawing-tools-manager.js`, ~40 cascade false regressions). **After Lane 1 commits its Step-0 H-S18 fix**, re-run the full manager gate and confirm:
- H-S18 no longer throws / poisons the session.
- The ~40 cascade regressions clear; H-S40/41/42 pass **in-session** (not just isolated).
- Report the clean baseline (expectedTests / knownFailing / regressions) so Phase 1's "0 regressions" claim is measurable against a trustworthy gate.

## Guardrails
- Lane 4 owns `known-failing.json` / scenario ids / `react-parity-lib.mjs` / gate baseline. No product engine/React edits.
- I8/I9 mirrored; report SHA256 + gate result.

## Report — WORKER-REPORT-STANDARD.md
Task 1: the frozen 10-row → phase map + the H-R07/H-R12 drop + phase-shrink note. Task 2: post-H-S18 gate result (or "awaiting Lane 1 commit" if not yet landed). State "Phase 1 cleared to prove against a clean gate."
