# RE-MIGRATION Phase 5 PREP (Lane 2) — peer isolation design (READ-ONLY)

Your Phase 3 prep is accepted. While Phase 1 green is gated on Lane 4's hit-coord fix, do **read-only design prep** for Phase 5 (peer isolation) — your last un-prepped re-migration phase. No implementation.

## Context
Per `T3-REMIGRATION-PLAN.md` Phase 5 + `T3-PHASE0-FROZEN-MATRIX.md` (frozen 2026-07-16). D-018 #2: Phase 5 gets its **own NEW master switch** — do NOT extend P1/P2/P3 masters. Note from Phase 0: **H-R07 was dropped** (genuinely green on fallback-B) — confirm the exact frozen-matrix rows Phase 5 still owns (peer-clear / cross-panel isolation; check H-S34/H-S35/H-S44 or the current authoritative ids).

## Tasks (design only — no product/React/harness edits)
1. Confirm the frozen-matrix Phase-5 row id(s) + honest actuation (I15) + end-state measures (real cross-panel gesture; assert source-panel selection/UI survives; peer panels don't leak or clear).
2. Map the **peer-isolation path**: `clearDrawingUiOnOtherPanels` / peer-clear / cross-panel selection broadcast — where a gesture on panel B currently bleeds into peers, via postMessage/CustomEvent only (I14, no parent globals).
3. Design the **new master switch** (e.g. `__TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION`), one-knob revert, covering every file incl. React (I13).
4. **Dependency:** how Phase 5 rides P1 (store), P2 (focus/routing), and interacts with P3 selection guards (`__v9DrawingSelectionGuardUntil`) — peer-clear must not race select/open. Note ordering (P5 after P4, before P6).
5. **Collision map:** line regions in `MultichartGrid.jsx` (peer-clear ~5074–5213 flash guard is P3-adjacent) + any `panel-cmd-bridge.js` involvement; flag T8 cadence bands to avoid and any P3-shared zones to serialize.

## Guardrails
- READ-ONLY. No product/harness/`known-failing.json`/registry edits.
- Do not touch Phase-1 engine files, order-entry, or replay-system.

## Report — WORKER-REPORT-STANDARD.md
Deliverable: `docs/tickets-overhaul/worker-reports/T3-remig-phase5-lane2-PREP-report.md` — peer-isolation path map, new-switch design, confirmed matrix ids + honest RED→GREEN spec, P1/P2/P3 dependency + ordering, collision/serialize map. State "ready to implement Phase 5 on P4-GREEN go."
