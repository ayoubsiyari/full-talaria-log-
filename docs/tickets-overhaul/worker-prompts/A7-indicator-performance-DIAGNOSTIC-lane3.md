# Lane 3 — A7 indicator-performance DIAGNOSTIC (read-only, freeze-safe, timeboxed)

## Why now
Intake 2026-07-16 evening elevated indicator performance from perf-backlog to a dispatchable defect: **6 tickets in 2 days**, including a **~1-minute full site freeze** when adding VWAP (P1 severity). This is freeze-safe (indicator modules, no chart.js/replay engine edits) and does NOT touch the bless path — Lane 4 owns the bless in parallel.

Tickets in scope (evidence):
- TAL-01632 — adding VWAP freezes the site ~1 minute
- TAL-01659 — anchored VWAP heavy
- TAL-01640 — VWAP + replay lag (single + multichart)
- TAL-01635 — opening-range + replay freeze
- TAL-01645 — indicator resize lag
- TAL-01620 — VWAP + replay large lag (from 07-15)

## Constraints
- **READ-ONLY. No code edits, no kill-switch, no fix.** Diagnostic only.
- Do NOT edit chart.js, replay-system.js, re-migration engine, or the harness lib Lane 4 is using for the bless.
- Honest measurement (I15): measure the REAL add-VWAP / replay-tick path, not a synthetic stub. Use real timings (performance.now / frame cost), not guesses.

## Known lead (confirm or refute)
The T5 anchoring diagnostic named `chart-indicators-full.js:7814` as a full-series recompute-per-frame hotspot, and anchored VWAP as the prime offender (recomputes the whole series every frame instead of an incremental tail). Confirm whether the ~1-min freeze is (a) add-time synchronous full recompute, (b) per-frame replay recompute, (c) resize-triggered recompute, or a combination.

## Questions to answer
1. **Add-VWAP freeze (TAL-01632):** what runs synchronously on add? Measure wall-time. Is it a full-history recompute on the main thread with no chunking/yield? Name the call site(s).
2. **Anchored VWAP (TAL-01659):** cost per recompute vs. non-anchored; why anchored is heavier (anchor resolve + full re-integrate?).
3. **Replay lag (TAL-01640/01620):** is the indicator recomputed from scratch each replay frame? Quantify cost per frame at speed 60. Identify where a tail-incremental update could replace full recompute.
4. **Opening-range + replay freeze (TAL-01635):** same recompute path or a different loop?
5. **Resize lag (TAL-01645):** does resize trigger a full indicator recompute (vs. reflow only)?
6. **Multichart flavor:** does each panel recompute independently (N× cost)?

## Deliverable report
`docs/tickets-overhaul/worker-reports/A7-indicator-performance-diagnostic-report.md`:
- Per-ticket measured cost (numbers, not adjectives) with exact file:line recompute sites.
- Root classification: add-time vs per-frame vs resize, shared vs per-indicator.
- A ranked, gated fix menu (each freeze-safe, own kill-switch, cost estimate):
  - e.g. chunk/defer add-time compute; incremental tail recompute during replay; memoize on resize; coalesce multichart recompute.
- Which fixes are safe to land during the deploy freeze vs. which need a Director scope call.
- Proposed RED/perf-budget scenario ids (e.g. add VWAP → assert main-thread block < budget; replay 100 frames → assert per-frame cost < budget).

STOP after the report. No implementation.
