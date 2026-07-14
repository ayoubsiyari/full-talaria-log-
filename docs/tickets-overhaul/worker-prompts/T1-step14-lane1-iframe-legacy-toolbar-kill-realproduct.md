# T1 step 14 (Lane 1) — DELETE legacy toolbar in iframe panels + gear works, VERIFIED ON REAL PRODUCT

**Cold-start:** read `INVARIANTS.md`, `WORKER-REPORT-STANDARD.md`, `MULTICHART-PARITY-CHECKLIST.md`, and steps 12/13 reports. Engine mirrored across `chart v 1.4/chart/...` and `homepage/public/chart/...` (byte-identical, SHA256 both).

## CONFIRMED LIVE SYMPTOM (not stale — build id verified)
- `window.__TALARIA_CHART_BUILD_ID` = **`20260712b11`** on host AND panel B (PO confirmed both frames, cache cleared).
- Multichart 2-panel: select a shape → **panel A (host) shows the current V9 bar; panel B (iframe) shows the OLD engine `#drawing-toolbar`.** Evidence: `evidence/multichart-panelB-old-toolbar.png`.
- **Steps 11/12/13 all passed the dev:live fast loop and all failed the real iframe panel.** The fast loop is NOT a faithful repro of the server iframe panel. **Do not accept this fix on dev:live evidence.**

## LIKELY MECHANISM (verify, don't assume)
Step 13's legacy-toolbar suppression (`_shouldSuppressLegacyToolbarShow()` / `v9ShouldSkipLegacyDrawingToolbarShow()`) keys off **parent-only signals** (`window.__multichartGrid`, parent V9 chrome). Inside the **real** panel-B iframe those parent globals are NOT visible (separate window), so suppression never fires on the server even though it does in dev:live where the mount shares context. You need a signal that is reliably true **inside the iframe** that it is an embedded multichart panel.

## REQUIRED FIX
1. **Reliable in-iframe signal:** the parent already talks to panels via `panel-cmd-bridge.js` — have the parent post an explicit "you are a V9 multichart panel; V9 owns drawing UI" flag to each panel iframe on init, and store it in the iframe (e.g. `window.__talariaV9PanelEmbed = true`). Legacy-toolbar suppression in the iframe keys off THAT, not parent globals.
2. **Delete the legacy toolbar completely** in panel iframes — `#drawing-toolbar` must never render/paint when `__talariaV9PanelEmbed` is set. A blunt, decisive removal is acceptable and preferred (PO: "delete the old one completely").
3. **Current V9 bar gear opens settings exactly like the old gear did** (open + stay per step 10; Esc closes), on the panel the drawing belongs to.
4. Same switch `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` (I13, all touched files incl. `panel-cmd-bridge.js`/`TalariaV8bLive.jsx`); OFF reverts. Single chart + host tile unchanged (I5).

## VERIFY — REAL PRODUCT, MANDATORY (dev:live fast loop is NOT acceptance this time)
1. `npm run build:live` (talaria-design) → serve the **real built** multichart with actual iframe panels (the surface the PO uses), OR coordinate with Lane 4's T0-step8 React-parity harness which drives the real `MultichartGrid`.
2. Confirm build id inside **panel B's iframe** = the new build.
3. Select a shape in panel B → **exactly one** toolbar (V9), **no** legacy `#drawing-toolbar` anywhere → its gear opens settings + stays → Esc closes. Repeat 10×.
4. Capture a screenshot of both panels showing one V9 bar each. Include it in the report.
5. Switch OFF → legacy behavior returns. Single chart unchanged.

## DELIVER (`worker-reports/T1-step14-iframe-legacy-toolbar-kill-report.md`, per WORKER-REPORT-STANDARD)
Why steps 12/13 passed fast-loop but failed the real iframe (the parent-global-not-visible-in-iframe mechanism), the fix diff + the in-iframe signal wiring, **real-product** 10× proof + screenshot, single-chart-unchanged evidence, SHA256 both trees, gate result. Explicitly state the verification was on the built product, not dev:live.
