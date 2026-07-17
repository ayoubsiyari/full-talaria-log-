# Lane 4 — A6-4 ship-gate: full gate + D-026 proof-row re-run (D-030 item 4)

Build under test: `20260717b37` (A6-4 host-canonical order store, dev-only). Baseline: `20260717b16`.

This is the **last open ship-gate item** for A6-4 (D-030 proof bar #4). No product edits — gate + proof only.

## Run
1. **Full manager gate** on b37 (host + gate:react). Report exit code, expected/known-failing counts,
   and any NEW regressions vs the b16 baseline (0 regressions required).
2. **Re-run the D-026 interaction proof rows** (H-R04 settings-open + H-R05 Esc) against b37,
   compared to their green state on b16. A6-4 touched `MultichartGrid.jsx` + `panel-cmd-bridge.js`,
   so prove these did NOT regress: acceptance = H-R04/H-R05 10/10 ON, 10/10 FAIL with their switch OFF.
3. Confirm the A6-4 master + per-step switches are honestly wired (spot A/B: master OFF → legacy
   clone model; one per-step OFF → its isolated behavior returns) so bisection works if PO finds a regression.

## Gate outcome
- **If GREEN (0 regressions + H-R04/H-R05 hold):** ship-gate item 4 is satisfied. Report GREEN and
  clear b37 for **PO live-confirm** (the checklist in the A6-4 impl report). Do NOT deploy/bless yet —
  PO live-confirm (incl. panel-B lockout leg) is still required before close.
- **If RED (any regression or H-R04/H-R05 break):** STOP, do not clear for PO. Report the exact failing
  rows + which A6-4 switch isolates them, and hand back to Lane 3.

## Guardrails
I15 honest actuation. No masking, no retry-until-green. Read-only w.r.t. product. Deliverable:
`docs/tickets-overhaul/worker-reports/A6-4-shipgate-fullgate-D026-rerun-report.md`.
