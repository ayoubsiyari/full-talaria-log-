# Canary known-limits note — DRAFT for testers

**Status:** draft for Director/PO edit before send  
**Audience:** Plan 3 canary cohort on `31.97.192.82`  
**Build floor:** `20260729b85` (PURGE-1/2 + host-realm bar-store correctness + first kill-all shot LEAK-C; not claimed as the fix for the ~50 MB per-cycle main-frame JS heap growth)  
**Owner:** Manager B (draft) · PO owns final wording

---

## What this canary is

You are on the Plan 3 canary build. Please report anything that looks wrong — wrong prices, stuck UI, lost drawings, or odd performance. Use the ticket form’s Area field when it matches.

This note is only the limits we already know. It is not a request to ignore other bugs.

---

## Known limits

### Multichart memory

Changing multichart layout (adding/removing panels, cycling layouts) still costs memory. Our measurement says roughly **~50 MB per full layout cycle of main-frame JS heap**, and that figure is a **lower bound, not the total cost**: it is read in the top frame, so it does not account for the memory held by the chart panels themselves or by background workers. Total memory for the tab is materially higher and a corrected cross-realm figure is being measured now. Treat the number as a floor under active bisect, not a ceiling.

Please report if memory never settles after you return to a single chart, or if the tab's memory keeps climbing across layout changes.

**About Task Manager numbers:** Chrome's Task Manager reports **process footprint** — JS heap plus DOM, CSS, decoded images and GPU buffers. It is a *different quantity* from the JS-heap figure above, not an inflated version of it, so the two will not agree and neither is wrong. It is not our grading metric and is not comparable across vendors or tools, so please don't use it for comparisons — **but a footprint that looks extreme is worth reporting**, with the number and what you had open. An earlier draft of this note asked testers to disregard footprint readings; that was wrong, and a large footprint reading is in fact how the current investigation started.

### CPU at high replay speeds

At high replay speeds the chart will hit a CPU ceiling. A **single chart at 60×** already draws about **~111% CPU** with nothing else in flight targeting that path. Multichart makes that worse. Prefer lower speeds for long sessions; if the UI stutters or the host feels saturated, note the speed, panel count, and symbols.

### What we are not claiming

- We are **not** claiming parity with any third-party journaling product’s memory profile. Prior TradeZella-style memory comparisons are **withdrawn** and should not be used as a ship metric.
- We are **not** quoting absolute Task Manager footprint megabytes in this note, and the JS-heap figure above must not be read as the tab's total memory.
- We are **not** claiming the per-cycle growth has been halved or otherwise reduced. An earlier internal reading suggested that; it was taken on the main-frame instrument, which cannot see the panel realms where the retention lives, so it does not support the claim and has been withdrawn.

---

## Please still report

Wrong data, indicator mismatch across timeframes, trades disappearing from the journal, charts that freeze until click, replay that pauses/resumes on its own, and anything that looks like a regression versus the old site.

Thank you — your sessions are the instrument we cannot buy.
