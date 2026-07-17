# Lane 2 — S2 finest-TF cadence FAIL when coarse panel is main (H-S83 re-open)

Status: READ-ONLY DIAGNOSTIC. No product edits. Build under test: `20260717b16` (blessed).

## PO A/B result (this is the acceptance test for H-S83 / D-016)
Multichart, mixed TF: **main/focused panel A = 4h**, other panel(s) = 1m / 5m.
Press PLAY. Observed: **every panel advances at 4h cadence** (one coarse step at a time);
the 1m/5m panels do NOT tick at their own finer cadence. Expected per D-016 finest-TF
unified clock: the replay clock runs at the **finest TF present across all panels**, so the
1m panel advances smoothly and the 4h panel mirrors on its boundaries.

This is the exact S2.4 scenario and it FAILS. H-S83 is therefore NOT accepted; it is back
to STAGED / re-fix. Do not fix yet — diagnose only.

## Questions to answer (evidence, not opinion)
1. Where does the replay clock choose its tick interval? Confirm whether it scans **all**
   active panels for the minimum TF, or whether it keys off the **focused/main** panel's TF.
   Cite the exact function + lines (replay-system.js / panel-cmd-bridge / multichart-manager).
2. Is `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` ON (fix active) in b16? Run the A/B:
   - Switch ON (guard active) vs OFF. Report tick interval chosen for main=4h + peer=1m in both.
   - If ON already behaves like OFF for this layout, the finest-TF scan has a gap for the
     "coarse panel is focused/main" case.
3. Does the finest-TF selection use only peers of the focused panel, only mirror-linked cells,
   or the true global min across the grid? Pinpoint why a coarse **main** suppresses the finer peers.
4. Distinguish this from the separate open H-S25 follow-desync (axis moves / candles frozen
   until reset-scale button). Confirm the 4h-speed symptom is cadence-interval selection, NOT
   viewport-follow. They are two different bugs — keep them separate in the report.

## Deliverable
`docs/tickets-overhaul/worker-reports/S2-coarse-main-cadence-diagnostic-report.md`:
- Root mechanism + exact file/lines.
- A/B evidence table (switch ON/OFF, chosen interval, per-panel tick behavior).
- Proposed one-knob fix scope (freeze-safe, own kill-switch) + a RED scenario that pins it
  (H-S83 variant: main=coarse, peer=fine → assert peer ticks at fine cadence).
- Explicit statement of whether this is a gap in the D-016 finest-TF fix or a regression on b16.

## Addendum — Step-forward parity (same engine)
PO also reports: multichart, mixed TF + different tickers, pressing **STEP-FORWARD** (single-step)
does **not** advance like the PLAY button. Answer:
6. Does step-forward route through the same finest-TF unified clock as PLAY, or a separate
   per-panel step path? Pinpoint the divergence (which panels advance on a single step vs PLAY).
7. Report whether step-forward advances only the focused/main panel, advances all at the coarse
   interval, or no-ops for finer peers — with exact file/lines. Include it in the same report
   under a clearly labeled "Step-forward parity" section.

## Guardrails
I15 honest actuation. No edits to chart.js / replay-system.js in this task. Read-only.
