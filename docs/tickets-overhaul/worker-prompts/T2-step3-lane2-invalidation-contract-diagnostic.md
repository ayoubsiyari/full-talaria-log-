# T2 step 3 (Lane 2) — invalidation-contract sweep diagnostic (RC-2) — READ-ONLY

## Cold-start context (read first)
- Repo: `full-talaria-log--main`. Two mirrored trees (I8): `chart v 1.4/chart/**` (canonical) + `homepage/public/chart/**`. Engine: `chart v 1.4/chart/chart.js`, `chart v 1.4/chart/modules/*`; React: `chart v 1.4/talaria-design/src/*`.
- **RC-2 = invalidation/repaint contract violations:** state changes (style commit, selection, drawing add/remove, indicator update, symbol/timeframe change, replay tick) don't reliably trigger the correct repaint/recompute — so the canvas shows stale pixels, ghosts, or requires a nudge (pan/click) to refresh. Symptoms across the ticket history: style change not applied until interaction, ghost drawings after delete, indicator not redrawn on param change, stale chrome after selection changes.
- **This is a diagnostic ONLY.** There is an active **integration freeze** on shared engine/React files while another lane snapshots a deploy build. **Do NOT edit any product/engine/React/harness file.** Output is a markdown report + plan only.

## Deliverable
Write `docs/tickets-overhaul/worker-reports/T2-step3-invalidation-diagnostic-report.md` containing:
1. **Invalidation call-site inventory:** every place that mutates render-affecting state, and whether it correctly requests repaint/recompute (name the repaint entry points, e.g. requestRender/redraw/scheduleDraw, and which callers skip them). File + function + line refs.
2. **Contract gaps:** the mutations that do NOT invalidate (or invalidate the wrong scope), mapped to concrete tickets/registry rows where possible.
3. **Proposed invalidation contract:** the single rule set ("any mutation of X must call Y before returning"), grouped by subsystem (drawings, indicators, order-entry, selection chrome, symbol/timeframe, replay). Include a kill-switch strategy (I3/I13) per fix group.
4. **RED-scenario candidates:** host + real-iframe parity scenarios that would prove each stale-repaint bug RED-first.
5. **Overlap notes:** flag any gaps already addressed by T1/T3/T4 fixes (settings-flash, routing, aggregates) so we don't double-fix; and which remaining gaps touch multichart/iframe paths (I14).

## Guardrails
- READ-ONLY. No file edits, no build, no baseline changes. (You are NOT editing `known-failing.json` — Lane 4 owns it now.)
- Cite exact file:line refs so the follow-up implementation is turnkey.

## Report
Use `WORKER-REPORT-STANDARD.md` structure; sections 2 (changes) and 3 (kill-switch) = "N/A — diagnostic". Substance = call-site inventory + contract-gap map + proposed contract.
