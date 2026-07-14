# WORKER PROMPT — T1 step 12 (Lane 1): quick-bar gear in IFRAME panels (panel B/C/D) must open settings

> Hand to the Lane 1 worker ONLY if the PO confirms both panels are on build `20260713b6` and panel B's gear still fails (i.e. not a stale iframe). Reproduce in the fast loop first (T0 step 6 now mounts real iframe panels).

## COLD-START (read first — you may be a NEW agent taking this over)
You are picking up a task that a previous agent started; the state below is where they got to — **do not restart from scratch, continue from here.** Before touching anything, read: `docs/tickets-overhaul/INVARIANTS.md`, `docs/tickets-overhaul/WORKER-REPORT-STANDARD.md` (your report MUST follow all 8 sections), and `docs/tickets-overhaul/MULTICHART-PARITY-CHECKLIST.md`. The chart engine is **mirrored** across `chart v 1.4/chart/...` and `homepage/public/chart/...` — every engine edit goes into **both** trees, byte-identical (SHA256 both). Kill-switch discipline (I3/I13): the fix stays behind `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2`; switch OFF must fully revert in every file you touch.

### STATE FROM THE PRIOR AGENT (2026-07-14) — continue from here
- Confirmed real gap: on live `b6`, host-tile A gear opens settings, **iframe panel B gear does nothing** (double-click on B works, so the iframe→parent transport is fine; only the gear button doesn't use it).
- Prior agent found the **patched path CAN recover the iframe toolbar and the gear becomes visible** — the mechanism is on the right track.
- **Open problem (do not paper over):** their click-proof "sampled too early" in the rescue/re-render timing and only passed when they waited longer before clicking `#tb-settings`. **A green that needs an artificial fixed `sleep()` = RED (a masked race), not a fix.** Your job is to make it deterministic.

### ACCEPTANCE BAR (hard requirements for this handoff)
1. Gear is present **and** clickable on **real user-interaction timing** (select → click gear immediately, no artificial delay).
2. **Determinism: run the proof ~10× and report the pass count (must be 10/10).** Any flaky miss = still RED.
3. If a wait is genuinely needed, gate the gear's exposure on the **rescue/re-render completing** (a render/settle signal or callback) — **not** a fixed sleep tuned until it passes. State which signal you gated on.

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T1 step 12**, Lane 1. RC-1.

## SYMPTOM (PO live, `20260713b6`, 2-panel multichart)
- **Panel A (host tile):** quick-bar **gear opens settings** — works.
- **Panel B (iframe):** quick-bar **gear does NOT open settings**.
- On panel B, **double-click** DOES open settings (step 10 route works). So the iframe→parent settings transport is fine; only the **iframe gear button** doesn't use it.

## KEY DISTINCTION (host tile vs iframe panel)
Panel A is the host chart in the same window → step-11's V9 quick-bar (`TalariaV8bLive.jsx`) route works. Panel B is a **chart-embed iframe** running the engine → its quick-bar is the **engine floating toolbar** (`#tb-settings` in `drawing-tools-manager.js`), which must post the gear click **up to the parent** (same as `editDrawing()` → `requestMultichartParentDrawingSettings()` → `multichart-open-drawing-settings`). Step 11 claimed to patch `#tb-settings` for iframe context, but panel B still fails live — find why the iframe gear does not reach the parent open route that double-click uses.

## PART 1 — REPRODUCE IN THE FAST LOOP (T0 step 6)
```
cd "chart v 1.4/chart/multichart-prod/harness"; $env:PORT='8791'; node serve.mjs
cd "chart v 1.4/talaria-design"; $env:USE_LOCAL_CHART='1'; $env:CHART_BACKEND='http://127.0.0.1:8791'; npm run dev:live -- --host 127.0.0.1 --port 5174
# open ?devMultichart=2v ; DEV LAYOUT -> 2 ; in the IFRAME panel B place a trendline, select it, click the engine quick-bar gear
```
Confirm the failure reproduces on the **iframe** panel gear (not the host tile). If it does NOT reproduce in the fast loop but fails live, report that (points to a build/embed difference, not logic) and stop.

## PART 2 — FIX
- Make the **engine floating-toolbar gear** (`#tb-settings` and any per-tool settings buttons) in **iframe/panel context** route through the same iframe→parent open path double-click uses (`editDrawing()` → `requestMultichartParentDrawingSettings()`), so the parent opens (and keeps open, per step 10) the settings for the source panel.
- Single chart and host tile A behavior unchanged.
- Reuse `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` (or a clearly-named sibling); default ON; I13 (switch covers every touched file, both engine trees).

## VERIFY (fast loop — mandatory)
In the iframe panel B: select a drawing, click the gear → settings opens in the parent and stays open; Esc closes. Host tile A still works. Switch OFF → gear inert again. Provide the observed evidence.

## BINDING CONSTRAINTS
- RC-1 only. I11 no mirror-frame. L2 production trees. Both engine trees byte-identical; SHA256 both.
- Do NOT re-break: double-click settings (step 10), settings-stays-open, marquee (step 9), Ctrl-select (H-S43), host-tile gear (step 11), single chart.
- Do NOT bump build id — Manager coordinates.
- Gate green (tracked reds unchanged).

## DELIVER (report `.md`: `worker-reports/T1-step12-panelB-iframe-gear-route-report.md`)
1. Part 1 repro result (fast loop) + why step 11 didn't cover the iframe gear (file:line).
2. Fix diff + switch + fast-loop RED/GREEN/RED (iframe panel B).
3. Host-tile-A + single-chart unchanged evidence; gate result; SHA256 both trees; `node --check` clean; build-id diff for Manager.
