# T6 step 8 (Lane 3) — RC-6 M4 replay indicator UI sync IMPLEMENT

M4's gate has cleared: D-017 snap-back committed (`9462cef3`), finest-TF cadence committed (`d6d9822f`), no in-flight `replay-system.js` edits. Implement M4 per your diagnostic (`T6-step6-M4-replay-recalc-diagnostic-report.md`). **This closes RC-6/T6.**

## Scope — CHART-SIDE SLICE ONLY (primary fix)
Per the diagnostic's "parallel work allowed before unblock" path — implement the legend/value sync **without** reordering `replay-system.js`:
- `chart-indicators-full.js` — post-recalc legend/value sync contract on the replay path; ensure replay tick refresh of `indicators.data` → visible legend tokens at the playhead bar.
- `indicator-ui.js` — ensure the replay tick always hits lightweight `talariaSyncOhlcIndicatorLegendValues` with the correct `hoverIndex` (playhead bar), not a full rebuild gated on `childElementCount===0`.
- New `indicator-replay-ui-sync.mjs` (Lane 3 module pattern) — pure sync helpers + switch predicate. Both trees I8.

## Switch (I3/I13)
`window.__TALARIA_RC6_INDICATOR_REPLAY_UI_SYNC_V2` (enable-style, default ON — consistent with M1–M5). OFF restores current behavior (stale legend until chart/replay-icon click).

## HARD constraint — do NOT edit replay-system.js
The `replay-system.js` call-order change is the diagnostic's SECONDARY option and a HIGH-collision zone (T8/D-017). **Do not edit it in this slice.** If the chart-side slice genuinely cannot fix the desync without a replay-system.js reorder, STOP and report it as a Manager-coordination item (do not create a merge hazard) — land the chart-side slice as NEEDS-LIVE and flag the residual.

## Proof (I15)
- RED spec `RC6-M4-replay-legend-sync` (Lane 4 registers): real replay **play** ≥5 bars → legend indicator value at playhead === `indicators.data[id]` at playhead bar, **no chart click required**. Switch OFF → stale until click.
- Property/dev-loop: mock `chart.data` growth + `hoverIndex` at last bar → format tokens match `indicators.data[id][barIdx]` after sync helper; switch OFF skips helper.
- Real actuation + parsed legend numeric token end-state — NOT call-counts/DOM-row-count.
- Targets **TAL-00350#2** (label doesn't update until replay-icon click) + **TAL-00350#7** (value doesn't update on hover without click).

## Guardrails
- Indicator files + new module only. NO `replay-system.js`, NO chart.js replay regions, NO multichart-parent, NO order-entry, NO `known-failing.json` (Lane 4 registers RED).
- File-scoped commit, both trees I8, SHA256 in report.

## Report — WORKER-REPORT-STANDARD.md
Deliverable: `docs/tickets-overhaul/worker-reports/T6-step8-M4-replay-ui-sync-IMPL-report.md` — RED→GREEN + switch A/B, whether the chart-side slice fully fixed the desync or a replay-system.js residual remains (flagged, not edited), commit hash + SHA256, NEEDS-LIVE PO steps. State whether **RC-6/T6 is now complete** (M1–M5 + M4) modulo live-confirm.
