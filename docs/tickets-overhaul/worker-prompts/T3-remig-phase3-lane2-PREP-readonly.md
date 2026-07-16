# RE-MIGRATION Phase 3 PREP (Lane 2) — settings transport design (READ-ONLY)

Phase 3 (Group C: settings transport) is Lane 2's after Phase 2. This is **read-only design prep** while Phase 1 (Lane 1) and Phase 2 are still ahead — you implement Phase 3 only after Phase 2 lands GREEN.

## Context
Per `T3-REMIGRATION-PLAN.md` Phase 3 (settings transport) + `T3-PHASE0-FROZEN-MATRIX.md` (Lane 4 is producing it). Covers the reactParity rows Phase 0 assigns to P3 — the drawing-tool / quick-bar **settings panel open + apply** transport across parent↔iframe (the H-R08/H-R09-class rows in the frozen 10-row set; confirm exact ids against Lane 4's frozen map).

## Tasks (design only — no product/React edits)
1. Map the **settings-open + settings-apply** transport: which iframe events must reach the parent React settings surface and back (postMessage bridge only — I14, no parent globals/shared closures).
2. Design the **Phase 3 master slice switch** (own knob, D-018 #2) covering every file incl. React (I13). Do NOT extend Phase 1/2 switches.
3. Name the honest RED→GREEN targets from the frozen matrix + how the harness actuates/measures them (real gear-click + real apply, measure applied end-state — not a proxy; I15). Coordinate scenario needs with Lane 4.
4. Line-region map for `MultichartGrid.jsx` / `TalariaV8bLive.jsx` / `panel-cmd-bridge.js` + any `chart.js` settings hook — confirm it stays clear of the Phase-4 keyboard window (D-018 #3) and your replay/TF regions.
5. Note the dependency on Phase 2 chrome-routing (settings transport likely rides the same selection-ownership plumbing).

## Guardrails
- READ-ONLY this step. No product/harness/`known-failing.json`/`scenarios.mjs` edits.
- Do NOT touch chart.js Phase-1 zones (Lane 1) or order-entry.

## Report — WORKER-REPORT-STANDARD.md
Deliverable: `docs/tickets-overhaul/worker-reports/T3-remig-phase3-lane2-PREP-report.md` — transport map, master-slice-switch design, honest RED→GREEN spec (matrix ids confirmed), line-regions, Phase-2 dependency. State "ready to implement Phase 3 on Phase-2-GREEN go."
