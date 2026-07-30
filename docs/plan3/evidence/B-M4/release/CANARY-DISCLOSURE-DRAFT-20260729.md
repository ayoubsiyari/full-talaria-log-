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

Changing multichart layout (adding/removing panels, cycling layouts) still costs memory. Our best measurement is roughly **~12 MB per full layout cycle of JS heap in the host isolate**, and the retention has been attributed: **about two panel documents are kept alive per cycle**, at roughly 12 MB each, which accounts for essentially all of the per-cycle growth. Work to release them is in flight and under active measurement.

Two honest caveats on that number rather than one. It **includes** the chart panels' own JS heap, because the panels share the host's JavaScript isolate — so it is not a top-frame-only fraction. But it **excludes** background worker heaps and all non-JS memory (DOM, CSS, decoded images, GPU buffers), so the tab's total footprint is materially higher than this figure. And because it was read with developer tools open, which inflates, treat it as an **upper** bound on the per-cycle rate rather than a floor.

Please report if memory never settles after you return to a single chart, or if the tab's memory keeps climbing across layout changes.

**About Task Manager numbers:** Chrome's Task Manager reports **process footprint** — JS heap plus DOM, CSS, decoded images and GPU buffers. It is a *different quantity* from the JS-heap figure above, not an inflated version of it, so the two will not agree and neither is wrong. It is not our grading metric and is not comparable across vendors or tools, so please don't use it for comparisons — **but a footprint that looks extreme is worth reporting**, with the number and what you had open. An earlier draft of this note asked testers to disregard footprint readings; that was wrong, and a large footprint reading is in fact how the current investigation started.

### CPU at high replay speeds

At high replay speeds the chart will hit a CPU ceiling. A **single chart at 60×** already draws about **~111% CPU** with nothing else in flight targeting that path. Multichart makes that worse. Prefer lower speeds for long sessions; if the UI stutters or the host feels saturated, note the speed, panel count, and symbols.

### What we are not claiming

- We are **not** claiming parity with any third-party journaling product’s memory profile. Prior TradeZella-style memory comparisons are **withdrawn** and should not be used as a ship metric.
- We are **not** quoting absolute Task Manager footprint megabytes in this note, and the JS-heap figure above must not be read as the tab's total memory.
- We are **not** claiming the per-cycle growth has been halved or otherwise reduced. Two independent instruments now agree that the earlier batch of teardown cuts changed nothing measurable, so the reduction claim is withdrawn and the cuts are shipped switched off.
- We are **not** quoting any figure against a competitor's until both are read with the same gauge. Two legitimate gauges disagree by about 1.4× on the same page at the same instant, which is larger than most of the differences worth arguing about.

---

## Please still report

Wrong data, indicator mismatch across timeframes, trades disappearing from the journal, charts that freeze until click, replay that pauses/resumes on its own, and anything that looks like a regression versus the old site.

Thank you — your sessions are the instrument we cannot buy.
