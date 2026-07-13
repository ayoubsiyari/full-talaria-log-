# WORKER PROMPT — T1 step 11 (Lane 1): quick-bar gear button must open settings in multichart panels

> Hand to the Lane 1 worker. Small, targeted routing fix. Everything else in multichart is now good on `20260713b5` (settings-stays-open, Ctrl, marquee all confirmed live).

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T1 step 11**, Lane 1. RC-1.

## SYMPTOM (PO live, `20260713b5`, multichart panel)
In a multichart panel, the **gear (settings) button on the quick/floating toolbar does nothing** — settings do not open. **Double-click** on the drawing DOES open settings (works, per step 10). Single chart: quick-bar gear works. So only the panel quick-bar gear is unwired.

## LIKELY MECHANISM (verify, don't assume)
Double-click routes through `editDrawing()` → `requestMultichartParentDrawingSettings()` → parent `openDrawingSettingsForPanel()` (now working after step 10). The quick-bar gear's click handler likely calls a **local/legacy** settings-open path (or the pre-fallback path) that is inactive in panels, instead of the same iframe→parent route double-click uses. Find the quick-bar gear click handler and confirm which path it calls in panel/iframe context.

## TASK
Wire the quick-bar gear button, **in multichart-iframe/panel context**, to the same panel settings-open route double-click uses (`editDrawing()` / `requestMultichartParentDrawingSettings()` → `openDrawingSettingsForPanel()`), so it opens (and, per step 10, stays open). Single-chart quick-bar gear behavior must be unchanged.

## GATING
- Gate behind an existing relevant switch if one fits (`__TALARIA_DISABLE_MULTICHART_SETTINGS_FLASH_FIX_V2` or the tool-lifecycle panel path); otherwise a small new `window.__TALARIA_*` switch, default ON. I13: switch covers every file touched.

## VERIFY
- Preferred: fast loop **once Lane 4's T0 step 6 mounts the React grid** — open a panel, select a drawing, click the quick-bar gear → settings opens and stays open; Esc closes.
- If the grid isn't mountable yet, state that and provide the harness/code evidence + a PO server-test script (double-click works vs gear works, panel + single chart).

## BINDING CONSTRAINTS
- RC-1 only. I11 no mirror-frame. L2 production trees. Both engine trees byte-identical + `MultichartGrid.jsx` consistent; SHA256 all touched files.
- Do NOT re-break: double-click settings (step 10), settings-stays-open, Ctrl-select (H-S43), marquee (step 9), single chart.
- Do NOT bump build id — Manager coordinates.
- Keep gate green (tracked reds unchanged).

## DELIVER (report `.md`: `worker-reports/T1-step11-quickbar-settings-button-report.md`)
1. Mechanism (file:line): what the quick-bar gear called vs what double-click calls in panel context.
2. Fix diff + switch; how single chart stays unchanged.
3. Verification (fast-loop if available, else harness evidence + PO server-test script).
4. Gate result; SHA256 all trees; `node --check` clean; build-id diff for Manager.
