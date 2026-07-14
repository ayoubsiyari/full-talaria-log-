# T1 step 13 (Lane 1) — duplicate toolbar + wrong gear opens settings (step-12 regression)

**Cold-start (read first if you are new to this repo):** you are fixing a regression the step-12 fix introduced; continue from step 12's mechanism, do not restart the whole feature. Read `docs/tickets-overhaul/INVARIANTS.md`, `docs/tickets-overhaul/WORKER-REPORT-STANDARD.md`, `docs/tickets-overhaul/MULTICHART-PARITY-CHECKLIST.md`, and the step-12 report `worker-reports/T1-step12-panelB-iframe-gear-route-report.md`. Engine is mirrored across `chart v 1.4/chart/...` and `homepage/public/chart/...` (byte-identical, SHA256 both).

## SYMPTOM (live on b7 — see evidence `docs/tickets-overhaul/evidence/b7-double-toolbar-gear.png`)
- **Two toolbars now render at once** on a selected drawing: a **top (old engine floating) toolbar** and the **bottom (current V9 quick-bar)** — the intended one.
- Clicking the gear on the **top/old** toolbar **opens** settings. Clicking the gear on the **bottom/current** toolbar **does nothing**.
- Step 12's `_invokeIframeToolbarOrigShow` / `v9PreserveIframeEngineToolbarOnHide` surfaced the **old engine toolbar** (whose `#tb-settings` works) instead of wiring the **current V9 quick-bar** gear to the parent settings route. Net effect: a duplicate toolbar + the wrong gear works.

## REQUIRED FIX
1. **Exactly one toolbar** per selected drawing in every context (single chart, host tile, iframe panel) — the **current V9 quick-bar**. The old engine floating toolbar must **not** be surfaced as a second bar by the step-12 path.
2. The **current V9 quick-bar gear** opens the parent drawing settings (and stays open per step 10); Esc closes. Route it through the same settings-open path double-click uses (`editDrawing()` → `requestMultichartParentDrawingSettings()` → parent open) — **without** rendering the old engine toolbar.
3. Reuse the **same switch** `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` (I13 — cover every file touched, both engine trees + `TalariaV8bLive.jsx`). Switch OFF → back to prior behavior.
4. **First establish the build id (L1)** with the PO: confirm this was b7 with the step-12 fix, and whether it reproduces on **single chart**, **host tile**, and/or **iframe panel** — the fix must not leak into single chart (I5).

## VERIFY (fast loop first — mandatory, deterministic like step 12)
- dev:live (`?devMultichart=2v`) iframe panel **and** single chart: select a drawing → exactly one toolbar (the V9 quick-bar) → click its gear → parent settings opens + stays → Esc closes. No second/old toolbar appears.
- Run the proof **10×**, report the pass count (must be 10/10); gate any wait on a settle signal, not a fixed sleep.
- Switch OFF → prior behavior; single chart unchanged.

## CONSTRAINTS
- RC-1. Do NOT re-break: double-click settings (step 10), settings-stays-open, marquee (step 9), Ctrl-select, host-tile behavior, single chart.
- Both engine trees byte-identical (SHA256). `node --check` clean. Do NOT bump build id (Manager coordinates). Gate green (tracked reds unchanged).

## DELIVER (`worker-reports/T1-step13-duplicate-toolbar-gear-fix-report.md`, per WORKER-REPORT-STANDARD)
Root cause of the duplicate toolbar (why step-12's origShow surfaced the old bar), the fix diff + switch coverage, fast-loop RED/GREEN/RED with 10× determinism (single chart AND iframe panel), single-chart-unchanged evidence, SHA256 both trees, gate result.
