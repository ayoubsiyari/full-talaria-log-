# A — The knee does NOT move with the caps. It is a third mechanism, and I found it by scaling, not by reading source.

**2026-07-31 20:50** · Manager A · queue items 1, 2 and 3 of the 20:37 ruling
Harness `scripts/sr04/timeframe-knee-sweep.mjs` · raw `docs/plan3/evidence/A-SR04-PIPELINE-TIMING-20260731/knee-sweep.json`

---

## 1. THE SWEEP — answer: it scales with RESIDENT bars, not visible bars

Real `buildDisplaySeries`, B's measured geometry (plotWidth 1478, spacing 7.0 px, pixelLod false),
geometry held fixed, four timeframes × nine resident-bar points. Per-TF caps read from the extracted
`_getMaxBarsOnScreen` and confirmed as documented: **1m 4320, 15m 2400, 1h 1800, 1d 1200, 1w 900.**

| tf | resident | resampled | **display out** | full resamples/event | median ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1m | 500 | 500 | **260** | 1.0 | 0.46 |
| 1m | 8,000 | 8,000 | **260** | 1.0 | 1.61 |
| 1m | 25,583 | 25,583 | **260** | 1.0 | 3.03 |
| 1m | 60,000 | 60,000 | **260** | 1.0 | 12.22 |
| 1w | 8,000 | 2 | **2** | 1.0 | 0.35 |
| 1w | 25,583 | 4 | **4** | 1.0 | 1.67 |
| 1w | 60,000 | 7 | **7** | 1.0 | 4.00 |

**The knee does not move with the caps, because the display output never goes anywhere near them.** It is
pinned at **260** — the viewport bound `ceil(plotWidth/spacing) + VIEWPORT_BUFFER_BARS` = 211 + 48 — at every
resident-bar count and every timeframe. It never approaches 4320, 1200 or 900.

**The decisive row is 1w at 60,000 resident bars: it emits SEVEN display bars and still costs 4.00 ms.** 1m at
the same resident count emits 260 and costs 12.22 ms. Cost tracks **resident** bars in both cases and barely
notices that one arm is doing 37× less output work.

Per your framing: the knee sits at the same place regardless of timeframe, so **it scales with something else
entirely — this is the third mechanism, not visible-bar scaling.** That forecloses the short list you described.

### What the scaling identified

**A full resample over every resident bar fires on EVERY event — 1.0 per event at all 45 sweep points.**
Counted by wrapping `_resampleDataFull` and counting real calls, not inferred.

This also reconciles my own two measurements, which looked contradictory:

* At 19:10 I reported the fall-through **never** fires — true, because that harness appended a bar every tick,
  so `sourceLen === source.length - 1` held and the incremental branch caught every event.
* Here it fires **every** time — because `dataVersion` bumps while the length does **not** grow by exactly one.

Both cache branches require the length to move in lockstep with the version. **Any event that bumps
`dataVersion` without appending exactly one bar takes a full resample of the entire resident series.** During
replay there are more paints than new bars, so the common case is the expensive one. That is a mechanism with
the right scaling shape, and it is the first candidate today that has it.

### Bounds — I am not calling this the 82 ms

Node, not Chromium; 3–12 ms/event here, not 82. I am **not** claiming this closes the gap, and I am not naming
it a monster on the strength of a shape match. What I am claiming is narrower and measured: **the cost scales
with resident bars and is nearly timeframe-independent**, which is the discriminator you asked for, and it is
consistent with C's superlinear per-bar concern in a way that my two dead candidates were not. C's bucketed
trace should say whether the category is scripting; if it is not, this is wrong too and I will drop it.

---

## 2. TO B — your 739 confirmation used a formula from a branch you were not in, and I have the measurement

**B should decide whether to withdraw; this is B's number. But the evidence is now empirical rather than my
source reading, so it is worth having before deciding.**

I swept spacing at fixed resident bars (1m, 25,583) and recorded the display output directly:

| spacing | pixelLod | branch taken | **display out** | median ms |
| ---: | :--- | :--- | ---: | ---: |
| 0.5 | active | pixelAggregate | **740** | 2.44 |
| 1.0 | active | pixelAggregate | **740** | 2.19 |
| 2.0 | — | pixelAggregate | **741** | 2.21 |
| 3.0 | — | pixelAggregate | 494 | 2.43 |
| **7.0 (B's regime)** | **false** | **direct** | **260** | 2.36 |
| 12.0 | false | direct | 172 | 2.27 |

**`plotWidth / ZOOMED_OUT_SLOT_PX` = 739 is reproduced exactly — 740 measured — but only where `pixelLod` is
active.** In the regime B actually measured (7.0 px, `pixelLodActiveNow: false`) the display bound is **260**,
which is nowhere near B's 579–798 bracket.

So the 739 match is **coincidence**: it is the right arithmetic for a branch that was not executing. I checked
whether the same constant might be reached by another route in B's regime — via `visSpan > maxBudget` falling
into `_pixelSlotAggregateFromRange`, whose output is slot-quantised — and it is **not**: at spacing 7.0 the
aggregate never fires at all, in any of the 45 sweep points or the probe.

One further correction for B: at `pixelLod` false, `maxBudget` is **not** `ceil(plotWidth/2)`. It is
`RENDER_BAR_BUDGET` = **500** in backtest mode, or `min(1000, 900)` = **900** live (`chart-data-pipeline.js`
:385-389). Neither is 739, and neither lands in 579–798 either.

**Also note the cost column is flat — 2.19 to 2.44 ms — while display output varies 740 → 172.** Whatever the
knee is, it does not track display length. That is the same conclusion the timeframe sweep reached from the
other direction, and it is why I think B's bracket is measuring the third mechanism rather than the display
bound.

---

## 3. A-L3 PANEL-SHELL STRIPPING — measured, and it closes GATE-PHASE4 negatively

The panel realm loads **55 modules injected from a JS array** in `chart-embed.html` (not static `<script>`
tags — a tag scan returns 3 and misses the payload entirely). All 55 resolved, none missing.

**Per realm: 9.905 MB UTF-8 / 19.81 MB UTF-16 in heap.** Corroborates my earlier census (10.476 MB) and C's
(10.469 MB) within ~5%.

| family | files | MB UTF-8 | MB UTF-16 | share of shell |
| --- | ---: | ---: | ---: | ---: |
| drawing-tools | 16 | 3.196 | 6.392 | 32.3% |
| orders | 3 | 2.422 | 4.843 | 24.4% |
| engine core (`chart.js`) | 1 | 1.920 | 3.839 | 19.4% |
| indicators | 12 | 1.414 | 2.828 | 14.3% |
| shell/misc | 21 | 0.519 | 1.037 | 5.2% |
| replay | 2 | 0.435 | 0.869 | 4.4% |

**Against the ~166 MB fixed cost per extra realm, the entire script source is 19.81 MB — 11.9%.** The largest
single strippable family, drawing-tools, is **6.39 MB = 3.9% of 166 MB.**

**So panel-shell stripping cannot materially reduce the per-realm fixed cost, and GATE-PHASE4's memory case
does not rest on script bytes.** With C's finding that the host holds 97.7% of resident bars — so collapsing
realms saves essentially no bar memory — Phase 4 would be buying a fixed cost whose largest addressable
component is under 4%. **On this measurement I do not think Phase 4 clears its own gate**, and that is a
recommendation against work I have been building toward, so I want it read with that bias declared.

Bounds: this is script **source** bytes. Compiled bytecode scales roughly with it, so a strip drops that too,
but the remaining ~146 MB per realm is documents, DOM, listeners and GPU — none of which stripping modules
touches. Reachability is **not** verified: I have not proven a panel can run without drawing-tools, and
`panel-cmd-bridge.js` installs drawing routing into every iframe, so the 32.3% may not be strippable at all.
That would make the case worse, not better.

---

## 4. Resolver implementation — not started, `chart.js` writer lane not yet free

The signature is published and reserved, E is wiring to it, and nothing about the contract has moved. I did not
begin the implementation because the routing lane still holds `chart.js` and a second writer would be worse
than the wait — the serialization call you endorsed. It is first in my queue when the lane releases.
