# RE-MIGRATION Phase 6 PREP (Lane 1) — marquee (rubber-band multi-select) design (READ-ONLY)

Phase 4 keyboard prep is accepted; its impl is gated on P2/P3 green + Lane 4's hit-coord fix. While that clears, do **read-only design prep** for Phase 6 (marquee) — your final re-migration phase. No implementation.

## Context
Per `T3-REMIGRATION-PLAN.md` Phase 6 + the frozen matrix (`T3-PHASE0-FROZEN-MATRIX.md`, 2026-07-16). Phase 6 gets its **own NEW switch** (one-knob revert, D-018 #2) — do NOT extend Phase 1/2/4 switches. Covers the frozen-matrix marquee row(s) — confirm exact ids against the frozen matrix.

## Tasks (design only — no product/React/harness edits)
1. **Confirm the frozen-matrix marquee row id(s)** and their honest actuation + end-state (I15): real `page.mouse` drag rectangle over ≥2 drawings on panel B → assert both ids in `selectedDrawings` store, no orphan handles.
2. **Map the marquee path** in iframe multichart: where drag-rectangle selection is computed, how it reaches the selection engine, and why it currently fails cross-frame (parent↔iframe, postMessage only — I14). Identify the `chart.js` / `drawing-tools-manager.js` marquee regions + any `panel-cmd-bridge.js` involvement (map exact line regions; check for T8 overlap so the Manager can schedule if needed).
3. **Design the new switch** (name it, e.g. `__TALARIA_DISABLE_MC_REMIGRATION_PHASE6_MARQUEE`), covering every file it touches incl. React (I13).
4. **Dependencies:** marquee rides P1 engine (store selection) + P2 routing/focus. State the ordering (P6 is last, after P5 peer-isolation).
5. Note the **same hit-coord caveat** — marquee drag coords on panned charts depend on Lane 4's fix; flag if the honest proof needs it.

## Guardrails
- READ-ONLY this step. No product/harness/`known-failing.json` edits.
- Do NOT touch Phase 1 engine files further, order-entry, or replay-system.

## Report — WORKER-REPORT-STANDARD.md
Deliverable: `docs/tickets-overhaul/worker-reports/T3-remig-phase6-lane1-PREP-report.md` — marquee path map, new-switch design, honest RED→GREEN spec (matrix id confirmed), line regions + any T8 overlap, P1/P2/P5 dependency + ordering. State "ready to implement Phase 6 on P5-GREEN go."
