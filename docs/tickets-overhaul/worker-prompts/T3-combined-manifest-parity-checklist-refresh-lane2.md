# T3 — Combined-build manifest + PO parity-checklist refresh (Lane 2, doc-only)

Anti-idle while Lane 1 lands the H-R03 iframe ctrl-select dedupe fix. **Doc-only — no code, no build, no harness edits.** This gets the assembly artifacts ready so Lane 4 can cut the fresh combined build the moment Lane 1's fix lands.

## Tasks
1. **Update the combined-build manifest** (the existing manifest doc from your prior combined-build work) to add:
   - Lane 1 H-R03 fix commit (pending — leave hash as `TBD`) + switch `__TALARIA_DISABLE_IFRAME_CTRL_SELECT_DEDUPE_V1`.
   - Lane 2 I13 hygiene commit `817a81a1` (focus useEffect P5-gate + manager guards).
   - Mark combined build `b6` as **superseded** (H-R03 regression); next id is Lane 1's fresh cut (leave as `TBD`).
2. **Update the PO parity-checklist** (`MULTICHART-PARITY-CHECKLIST.md` if present, else the parity rows in the manifest):
   - Confirm the H-R03 row's PO step: 2v layout → panel B → place 2 trendlines → select #1 → Ctrl+click #2 → **both** show resize handles, ×5.
   - Ensure the kill-switch map lists the new H-R03 switch alongside P1/P4/P5.
3. **Cross-check the 6 PENDING-DEPLOY tickets** (TAL-01609/10/11/12/00/03bc) are in the manifest's retest-on-combined-build checklist.

## Constraints
- Read-only w.r.t. code. Only edit docs under `docs/tickets-overhaul/`. File-scoped commit of the doc(s) only.
- Do NOT touch `drawing-tools-manager.js`, `MultichartGrid.jsx`, harness, or `known-failing.json`.

## Report
`docs/tickets-overhaul/worker-reports/T3-combined-manifest-refresh-report.md` — what was updated, the TBD placeholders awaiting Lane 1's commit/build id, commit hash.
