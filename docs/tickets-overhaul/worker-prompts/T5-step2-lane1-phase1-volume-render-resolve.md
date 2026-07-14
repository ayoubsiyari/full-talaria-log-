# T5 step 2 (Lane 1) — RC-3 Phase 1: volume render() read-only (freeze-safe)

## Cold-start context (read first)
- Repo: `full-talaria-log--main`. Two mirrored trees (I8, byte-identical): `chart v 1.4/chart/**` (canonical) + `homepage/public/chart/**`.
- This implements **Phase 1** of the RC-3 plan in `docs/tickets-overhaul/worker-reports/T5-step1-anchoring-diagnostic-report.md` (read it first). The engine already has a dual-coordinate model: persistence = `timestampPoints[]`; runtime = fractional `points[].x` + `price` via `resolveDrawingPoints`/`pointsFromTimestamps`; screen = `dataIndexToPixel` + `yScale`.
- **Root:** volume tools in `chart v 1.4/chart/modules/drawing-tools-advanced-volume.js` treat the **rounded bar index** as the authority and mutate `points[].x` every render (anchored VWAP ~L525-534, fixed-range VP ~L1164-1178, anchored VP ~L2209-2212). That overwrites the correct timestamp-derived x from `_syncDrawingPointsFromTimestamps` on TF change → H-S40/H-S41/H-S42 RED.

## Deploy-freeze rules (CRITICAL — read)
There is an active integration freeze protecting a multichart deploy snapshot.
- **Edit ONLY `drawing-tools-advanced-volume.js`** (both trees) + use existing coordinate/resolve helpers **read-only**.
- **DO NOT edit any frozen file:** `MultichartGrid.jsx`, `TalariaV8bLive.jsx`, `drawing-tools-manager.js`, `keyboard-shortcuts.js`, `drawing-tools-ui.js`, `multichart-manager.js`, or `react-parity-*` harness files.
- If Phase 1 genuinely cannot be done without editing `drawing-tools-manager.js`, **STOP and report** — we'll sequence it after the deploy rather than break the freeze.
- **DO NOT edit `known-failing.json`** — Lane 4 owns it now. Report the row-deltas you green (H-S40/41/42) and let Lane 4 reconcile.

## Fix
Make the volume tools' `render()` **resolve** their x from `timestampPoints` (via the existing resolve path) instead of writing rounded bar index back into `points[].x`. Stop the per-render mutation. Behavior must be identical within a timeframe; the change is that switching TF (or prepend/refresh) no longer strands the anchor.

## Kill-switch (I3 + I13)
- `window.__TALARIA_RC3_VOLUME_RENDER_RESOLVE` — default ON (fix active). Switch OFF must restore the old mutate-points.x behavior (H-S40/41/42 RED again). Cover every line you touch.

## Proof
- Host harness scenarios **H-S40, H-S41, H-S42**: RED before → GREEN 10/10 after (`--runs=10`); switch-OFF → RED again.
- `npm run gate` (host) PASS, no new regressions.
- SHA256 for `drawing-tools-advanced-volume.js` in BOTH trees (I8, byte-identical).

## Report — WORKER-REPORT-STANDARD.md (8 sections)
Include: exact lines changed, switch coverage, RED→GREEN + switch-OFF RED logs, host gate result, SHA256 both trees, and the explicit statement that no frozen file was touched. List the greened rows (H-S40/41/42) for Lane 4 to reconcile into the baseline.
