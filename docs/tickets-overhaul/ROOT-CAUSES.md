# Root Causes — Ticket History Overhaul

Each RC below is a *mechanism*, not a symptom. It is derived from two independent sources: (a) the cross-cutting symptom patterns in `TICKET-ANALYSIS.md` §3, and (b) read-only code scans of the engine (file:line evidence cited). Every fix task in the tracks must name which RC it discharges.

---

## RC-1 — No shared drawing-tool lifecycle (state machine per tool, duplicated and divergent)

**Evidence (tickets):** "first click does nothing" ×30 tools, "settings dialog remains after delete" ×7, "selection lost on Ctrl+drag" ×43, "quick menu stale/stacked" ×24 — identical symptoms across trendlines, fibs, channels, VWAP, notes, callouts, pins, patterns.
**Evidence (code):** each tool family implements its own create/select/hover/edit/delete handling; the Quick Menu, settings dialog, and price/time labels each track "current tool" independently rather than subscribing to one selection store.
**Mechanism:** selection state, menu state, label state, and canvas-hit state can disagree. Delete removes the tool but not the observers pointing at it (ghost labels/dialogs). First click mutates state without triggering the transition the second click performs.
**Root fix direction:** one shared tool-lifecycle controller (single source of truth for selected/hovered/editing tool + event emission), with Quick Menu / settings / labels / z-order as pure subscribers. Per-tool patches for these symptoms are **banned** once the controller lands.

## RC-2 — No render-invalidation contract (state changes without scheduleRender)

**Evidence (tickets):** "stuck until I click the screen" ×38 — tool placed but invisible until tap (TAL-00322), panel doesn't update until click (TAL-01484, TAL-01490), visibility restore doesn't repaint ×24.
**Evidence (code):** mutations happen in event handlers that rely on some *other* interaction to trigger the next paint; there is no rule that "every state mutation ends with a scheduleRender or explains why not."
**Mechanism:** the missing repaint is masked in the host (where replay/crosshair activity constantly repaints) and exposed in panels and idle charts.
**Root fix direction:** an invalidation contract + a debug assertion mode (`__TALARIA_ASSERT_INVALIDATION`) that flags a mutation-without-repaint; sweep all setters through it.

## RC-3 — Inconsistent anchoring / coordinate model across tools

**Evidence (tickets):** tool jumps to "middle of the previous candle" (TAL-00157), copy-paste displaces the copy (TAL-00253), tool moves when chart pans (TAL-00157), label sits where you clicked instead of on the line (TAL-00322), "tool should not be placeable after the last candle" (TAL-00322).
**Evidence (code):** primary model is timestamp+price (`drawing-tools-base.js:3331-3349`, survives TF switch), but anchored VWAP / volume tools store **bar indices** (`drawing-tools-advanced-volume.js:834-866`) which shift on history prepend/resample; magnet/snap behavior is applied inconsistently per tool.
**Mechanism:** three coordinate systems (timestamp, index, pixel) converted at different times by different tools; any data mutation (prepend, resample, replay tick) invalidates whichever tool converted earliest.
**Root fix direction:** one canonical anchor type (timestamp+price) with a single resolve function; migrate index-anchored tools; snap/magnet becomes a shared, opt-in resolve step.

## RC-4 — Multichart panels run a second-class interaction stack

**Evidence (tickets):** entire July-4 batch (TAL-01480…01502): Quick Menu absent on panels, Ctrl-select fails on second chart, drawings land on the wrong panel, indicator enable-state leaks across layouts, panel repaints only on click.
**Evidence (code):** panels are iframes with monkey-patched drawing sync (`sync-bridge.js:1544-1558`), settings forwarded to parent (`embed-bridge.js:186-249`), host-focused order rail (`order-manager.js:16626-16643`); the data/viewport overhaul (docs/multichart-overhaul) fixed data ownership but interaction ownership was never specified.
**Mechanism:** every interactive feature was built host-first; panel support is a per-feature afterthought bridged over postMessage, so each feature fails differently inside panels.
**Root fix direction:** an **interaction-parity contract** for panels (which surface owns: selection, quick menu, settings, keyboard, focus) analogous to the data-ownership contract that closed the multichart data work. RED-first harness scenarios per contract row; reuse the existing harness at `chart v 1.4/chart/multichart-prod/harness/`.

## RC-5 — Order-entry state model defects (multi-entry arithmetic and type mutation)

**Evidence (tickets):** TAL-00752's 22 messages: risk split 50/50 doesn't revert to 100 on entry delete, average stuck on deleted entry's price, limit order mutates to market when moved, PNL positive while price below long entry, SL/TP trailing-zero parsing zeroes the lot, TP/SL below 10 not rendered.
**Evidence (code):** order placement/preview math is sound (price-anchored to live scale, `order-manager.js:18332`, `38143`), but multi-entry aggregate state (weights, average, type) is mutated incrementally with no single recompute-from-entries function.
**Mechanism:** derived values (average entry, total risk, PNL) are updated by deltas instead of recomputed from the entry list, so any add/delete/move sequence not anticipated leaves stale aggregates.
**Root fix direction:** make all aggregates pure functions of the entry list (recompute on every mutation); property-based tests over add/move/delete sequences; separate rendering thresholds (the <10 SL/TP display bug) from math.

## RC-6 — Indicator settings/lifecycle share RC-1/RC-2 but through a different code path

**Evidence (tickets):** 74 tickets, 15 reopen loops — settings don't apply on first try, visibility toggles don't restore, indicator pane interactions displace the chart (TAL-00157), killzone/session tools misrender on TF change, replay × indicator staleness (TAL-00350, 00451).
**Evidence (code):** indicators recompute fully every replay frame (`chart-indicators-full.js:7814-7815`) — correctness holds but interaction latency spikes; settings UI is separate from the drawing-tools settings, duplicating the same stale-dialog class of bugs.
**Root fix direction:** subscribe indicator UI to the same lifecycle/invalidation contracts as RC-1/RC-2; incremental tail-recompute during replay is the perf follow-up, not the correctness fix.

## RC-7 — Process: no interactive regression harness, no closure protocol, symptom-routed dispatch

**Evidence:** `chart-regression-cases.js` cases array is empty; multichart harness covers viewport/data only; 96 tickets stranded in `user_replied`; 55 reopen loops; multi-bug threads marked resolved wholesale.
**Root fix direction:** (a) per-bug registry extracted from threads (one row per bug, not per ticket); (b) harness scenarios for interactive flows (place/select/edit/delete tool, order entry sequences, panel interaction) — RED-first before each fix; (c) closure = tester-confirmed on a named build, nothing else.
