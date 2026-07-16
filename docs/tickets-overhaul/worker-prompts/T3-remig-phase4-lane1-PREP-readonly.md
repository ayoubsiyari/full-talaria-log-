# RE-MIGRATION Phase 4 PREP (Lane 1) — keyboard bridge design (READ-ONLY)

Phase 1 engine is landed; its honest green is blocked on Lane 4's harness hit-coord fix (not on you). While that clears — and while Phases 2/3 (Lane 2) run — do **read-only design prep** for Phase 4 (your next phase). No implementation.

## Context
Per `T3-REMIGRATION-PLAN.md` Phase 4 (keyboard bridge) + D-018 ruling: Phase 4 gets its **own NEW switch `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1`** — do NOT extend the quickbar-settings switch. Covers the frozen-matrix rows assigned to P4 (panel-B keyboard: Esc deselect, Delete drawing, and any keyboard-pan rows — confirm exact ids against Lane 4's re-validated matrix).

## Tasks (design only — no product/React edits)
1. Map the **panel keyboard command path**: how key events in the iframe panel reach the drawing/selection engine — postMessage bridge only (I14, no parent globals). Which `panel-cmd-bridge.js` keyboard cmd cases (Esc/Delete/pan) and which `chart.js` keydown handlers are involved.
2. Design the **new switch** `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1` (one-knob revert, D-018 #2) covering every file it touches incl. React (I13).
3. Honest RED→GREEN targets from the re-validated matrix + how the harness actuates real key events / measures end-state (I15). Coordinate scenario needs with Lane 4.
4. **T8 collision window (D-018 #3):** Phase 4 touches discrete `panel-cmd-bridge.js` keyboard cmd cases — map the exact line regions so the Manager can schedule the narrow window where T8 pauses its `panel-cmd-bridge` edits. Confirm your regions are minimal + discrete.
5. Note dependency on Phase 2/3 (keyboard likely rides the same routing plumbing).

## Guardrails
- READ-ONLY this step. No product/harness/`known-failing.json` edits.
- Do NOT touch the Phase 1 engine files further, order-entry, or replay-system.

## Report — WORKER-REPORT-STANDARD.md
Deliverable: `docs/tickets-overhaul/worker-reports/T3-remig-phase4-lane1-PREP-report.md` — keyboard path map, new-switch design, honest RED→GREEN spec (matrix ids confirmed), the discrete `panel-cmd-bridge.js` line-region window for T8 scheduling, Phase 2/3 dependency. State "ready to implement Phase 4 on Phase-3-GREEN go + T8 window."
