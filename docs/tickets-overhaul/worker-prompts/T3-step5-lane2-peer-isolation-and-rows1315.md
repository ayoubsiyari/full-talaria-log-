# T3 step 5 (Lane 2) — panel peer-isolation (H-R07) + finish contract rows 13–15

## Cold-start context (read first)
- Repo: `full-talaria-log--main`. Two mirrored trees (I8): `chart v 1.4/chart/**` + `homepage/public/chart/**`. React lives in `chart v 1.4/talaria-design/src/` (`MultichartGrid.jsx`, `TalariaV8bLive.jsx`); build with `cd "chart v 1.4/talaria-design" && npm run build:live`.
- **I14:** parent↔iframe only via postMessage bridges. **D-010:** acceptance is the built real-iframe harness (`chart v 1.4/chart/multichart-prod/harness/`, `npm run gate:react`), NOT dev:live.
- You (Lane 2) just delivered T3 step 4: confirmed H-R01 as the panel-B routing root and landed the consolidated routing fix (`__TALARIA_DISABLE_MULTICHART_PANEL_SELECTION_CHROME_ROUTING_V3`). Your report flagged **H-R07 peer-isolation** as an independent track not folded into routing V3.

## Scope (two parts)
### Part A — H-R07 peer isolation (the independent red you scoped out)
Selecting a drawing in one panel must **deselect it in the other panels** (cross-panel peer deselect). Your step-4 report identified the mechanism: `multichart-clear-drawing-ui` from the engine fires **before** `multichart-drawing-selected`, and the selection guard still blocks some cleanup paths. Fix the ordering/guard so peer panels reliably clear when another panel takes selection — over the bridge only (I14). Gate behind its own switch (e.g. `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1`, default ON), covering every file touched (I13).

### Part B — finish contract rows 13–15 (D-008)
Per D-008, land the RED-first scenarios and implementation for contract rows 13–15:
- **Row 13** — persist to the **existing `chart_panel_state` blob** with defensive hydration (D-008 ruling), NOT a new storage key.
- **Row 15** — convergence source = **focused panel** (D-008), with the constraints noted in the contract.
- Row 14 per the contract.
Add each as a real-iframe harness scenario, RED-first, then GREEN.

## Proof (mandatory, built product)
- H-R07 + rows 13–15 harness rows: RED on pre-fix build → GREEN 10/10 on built dist-v9, build id asserted inside panel B.
- Switch-OFF restores RED for H-R07 (and any row-13–15 switch).
- `npm run gate:react` PASS, `npm run gate` PASS.
- SHA256 for every changed file in BOTH trees.

## Guardrails
- I14 (bridge only), I13 (full switch coverage incl. React), I8 (mirror), I5 (host tile A unchanged).
- Do NOT edit `chart.js` / `drawing-tools-manager.js` (Lane 1 engine ownership) — coordinate via bridge messages the engine already emits; if a new engine emit is truly required, STOP and escalate rather than editing Lane 1 files.
- Do not weaken any gate.

## Report — WORKER-REPORT-STANDARD.md (8 sections)
Include RED→GREEN on built dist-v9 (build id in panel B), switch-OFF RED proof, gate logs, SHA256 both trees, and confirmation Row 13 used the existing `chart_panel_state` blob.
