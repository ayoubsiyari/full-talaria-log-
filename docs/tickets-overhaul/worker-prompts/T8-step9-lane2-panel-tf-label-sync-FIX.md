# T8 step 9 (Lane 2) — panel TF-label sync on refresh FIX (PLAN2-FOUND#6, label-only)

## Authorization
From the step-8 diagnostic. **Label-only, low-risk** — the data restores correctly; only the parent topbar TF pills are stuck at `1m` while the focused panel is really 15m. Not a policy change → scoped bug fix. Track: T8 refresh-persistence. Freeze-exempt behavior-wise, but see I14/I13 below; ships **staging-only** while the D-012 deploy freeze holds.

## Root (from step 8 — do not re-diagnose)
On reload there are two TF states:
- **Iframe engine** restores 15m correctly (embed boot / `loadMultichartPanelFromHost`).
- **Parent React topbar pills** default to `1m`: `chartDataLoaded` / `timeframeChanged` in `TalariaV8bLive.jsx` (:12235–12237, :12605–12607) only listen to host `window.chart` and ignore iframe Panel B events. The intended iframe path is `multichartFocusChanged → dispatchFocusChanged` reading the manager cache (`MultichartGrid.jsx:3975–3988`), but on refresh that cache can still be `1m` from the early `addChart` seed (`effTf || "1m"`) while the engine is already 15m.
- Play "fixes" it only because host `chartDataLoaded`/`timeframeChanged` fire `setTf("15m")` — that's label resync, not data repair.

## Fix
Sync the parent TF control from the **applied/persisted panel TF** on hydration:
- Ensure the focus-mirror / `multichartFocusChanged` path carries the panel's **actual engine TF** (15m), and the parent sets the topbar pills from it on refresh/focus — so the label matches the engine without needing Play.
- **I14 (binding):** do this through the **postMessage/focus-mirror bridge only** — the parent must NOT read the iframe engine directly or via shared globals. If the manager cache is the source, ensure the panel publishes its real TF into the cache on boot (fix the stale `effTf || "1m"` seed to update once the engine settles), and the parent reads the cache/message.
- **No data-path change** — do not touch data fetch/reslice.

## Kill-switch (I13)
`window.__TALARIA_MC_PANEL_TF_LABEL_SYNC` (default = fix ON), covering every file touched **including the React files** (`TalariaV8bLive.jsx`, `MultichartGrid.jsx`). Switch OFF = current stuck-label behavior.

## RED FIRST — H-S80 (from step 8 spec)
After refresh with Panel B at 15m and focused: assert **iframe `currentTimeframe === '15m'` (GREEN today)** AND **parent active `[data-tf] === '15m'` (RED today)**. Fix makes the parent assert GREEN. RED before, GREEN after, RED again with the switch OFF.

## Acceptance
- H-S80 RED→GREEN + kill-switch A/B.
- Full gate green (no new regressions; fence stays green); coordinate any baseline delta with Lane 4 (owns `known-failing.json`).
- **PO staging live-confirm:** multichart, both panels 15m → refresh → focused panel's topbar TF reads **15m immediately, without pressing Play.**

## Guardrails
- **I14:** parent↔iframe via bridges only.
- **I13:** kill-switch covers React files.
- I8 both trees byte-identical; SHA256. I9 gate.
- **File-collision watch:** you edit `TalariaV8bLive.jsx` / `MultichartGrid.jsx` — flag the Manager so no other lane edits them concurrently. Do NOT touch `react-parity-lib.mjs`.

## Report — WORKER-REPORT-STANDARD.md (8 sections)
Diff + kill-switch coverage (React included), H-S80 RED→GREEN→RED(switch), confirmation no data-path change, gate result, both trees SHA256, staging build id for PO confirm.
