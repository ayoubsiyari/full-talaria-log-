# T5 step 1 (Lane 1) — anchoring unification diagnostic (RC-3) — READ-ONLY

## Cold-start context (read first)
- Repo: `full-talaria-log--main`. Two mirrored trees (I8): `chart v 1.4/chart/**` (canonical) + `homepage/public/chart/**`. Engine: `chart v 1.4/chart/chart.js`, `chart v 1.4/chart/modules/*`.
- **RC-3 = anchoring inconsistency:** drawings/tools/orders compute their on-screen position from several different, drifting anchor conventions (time↔x, price↔y, index-pin, viewport-relative, replay-anchored). Symptoms across the 812-ticket history: shapes jump on pan/zoom, snap to previous position, drift after replay advance, mis-place on layout resize, or anchor to the visible-window slice instead of the true candle.
- **This is a diagnostic ONLY.** There is an active **integration freeze** on shared engine/React files while another lane snapshots a deploy build. **Do NOT edit any product/engine/React/harness file.** Output is a markdown report + plan only.

## Deliverable
Write `docs/tickets-overhaul/worker-reports/T5-step1-anchoring-diagnostic-report.md` containing:
1. **Anchor inventory:** every distinct anchoring convention in the codebase, with file + function + line refs — how each maps (data → pixel) and back. Cover: drawing tools, order-entry preview/lines, indicators, crosshair, replay-time anchoring, multichart panels.
2. **Divergence map:** where two code paths that *should* agree use different anchor math (the RC-3 root). Tie each divergence to concrete tickets/registry rows where possible (`PER-BUG-REGISTRY.csv`, ticket history).
3. **Proposed unified anchor contract:** one canonical (data-coordinate → pixel) primitive all callers should use, invariants it must hold under pan/zoom/resize/replay, and a migration order (lowest-risk first) with a kill-switch strategy (I3/I13) for each migration step.
4. **RED-scenario candidates:** list the harness scenarios (host + real-iframe parity) that would prove each anchoring bug RED-first before any fix.
5. **Risk notes:** which migrations touch multichart/iframe paths (must obey I14) vs single-chart only.

## Guardrails
- READ-ONLY. No file edits, no build, no gate runs that modify baselines.
- Cite exact file:line refs so the follow-up implementation task is turnkey.

## Report
Use `WORKER-REPORT-STANDARD.md` structure where applicable; sections 2 (changes) and 3 (kill-switch) = "N/A — diagnostic". The substance is the anchor inventory + divergence map + unification plan.
