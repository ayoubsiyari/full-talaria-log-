# Canary known-limits note — DRAFT for testers

**Status:** draft for Director/PO edit before send  
**Audience:** Plan 3 canary cohort on `31.97.192.82`  
**Build floor:** `20260729b85` (PURGE-1/2 + host-realm bar-store correctness + first kill-all shot LEAK-C; not claimed as the ~50 MB leak fix)  
**Owner:** Manager B (draft) · PO owns final wording

---

## What this canary is

You are on the Plan 3 canary build. Please report anything that looks wrong — wrong prices, stuck UI, lost drawings, or odd performance. Use the ticket form’s Area field when it matches.

This note is only the limits we already know. It is not a request to ignore other bugs.

---

## Known limits

### Multichart memory

Changing multichart layout (adding/removing panels, cycling layouts) still costs memory. Expect roughly **~50 MB of retained cost per full layout cycle** on today’s instrument until the remaining panel-retention work lands. That is a known ceiling under active bisect (kill-switches per suspect; not a single claimed fix). Prefer reporting if a layout change feels much worse than that, or if memory never settles after you return to a single chart.

**Do not** compare Task Manager “Memory” / footprint numbers across tools or vendors in reports — that instrument over-reads live JS heap and is not our grading metric.

### CPU at high replay speeds

At high replay speeds the chart will hit a CPU ceiling. A **single chart at 60×** already draws about **~111% CPU** with nothing else in flight targeting that path. Multichart makes that worse. Prefer lower speeds for long sessions; if the UI stutters or the host feels saturated, note the speed, panel count, and symbols.

### What we are not claiming

- We are **not** claiming parity with any third-party journaling product’s memory profile. Prior TradeZella-style memory comparisons are **withdrawn** and should not be used as a ship metric.
- We are **not** quoting absolute Task Manager footprint megabytes in this note.

---

## Please still report

Wrong data, indicator mismatch across timeframes, trades disappearing from the journal, charts that freeze until click, replay that pauses/resumes on its own, and anything that looks like a regression versus the old site.

Thank you — your sessions are the instrument we cannot buy.
