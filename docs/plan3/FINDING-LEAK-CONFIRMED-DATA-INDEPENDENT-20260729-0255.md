# FINDING — The leak is **real, confirmed on heap, and monotonic in all three runs at ~50 MB per multichart cycle.** Decisively, **it is independent of data volume and symbol count**: a 3-year session and a 3-month session with baselines differing 4.4× leaked the same amount. **So the leaked object is not candle data.** That kills my symbol/timeframe dataset hypothesis and explains M26's null result exactly — **M26 frees the payload, and the payload is not what leaks.**

**2026-07-29 02:55. The PO ran the cycle test three times, on heap, with forced collection. This is the first trustworthy memory data the project has produced.**

---

## 1. The three runs

| run | session | baseline | R1 | R2 | R3 | **growth** |
|---|---|---|---|---|---|---|
| 1 | 12 symbols, **3 years** | 542 | 598 | 608 | 693 | **+151 MB** |
| 2 | 12 symbols, **3 months** | 124 | 188 | 218 | 288 | **+164 MB** |
| 3 | 4 symbols, unknown span | 306 | 348 | 422 | 472 | **+166 MB** |

**Monotonic in every run. Roughly 50-55 MB per cycle. This is a leak, and it is no longer arguable — it is heap, after forced collection, reproduced three times.**

## 2. The controlled comparison, which is the real finding

**Runs 1 and 2 are the same session configuration, same twelve symbols, same procedure. The only difference is data span: three years against three months.**

**Baselines differ by 4.4× — 542 against 124 — so the data volume difference is real and large and visible.**

**Growth is 151 MB against 164 MB. Effectively identical.**

**And run 3, at four symbols instead of twelve, grew 166 MB — the same again.**

**Therefore the leaked quantity scales with neither data volume nor symbol count. It is a fixed cost per panel per cycle, roughly 17 MB for each of the three iframe panels.**

## 3. What this kills, and it is mine

**The symbol/timeframe dataset hypothesis is dead.** I built it at 01:45 on the 67 MB versus 367 MB differential and called it the sharpest result of the night. **It was measured in footprint, and footprint tracks the allocator's high-water mark, which naturally rises with transient allocation — and distinct datasets allocate more transiently. The differential is fully explained without any dataset being retained.**

**That is the third hypothesis of mine to fall tonight**, after the retaining-`Map`-that-was-a-`WeakMap` and the panel-id purge. **All three failed the same way: I reasoned from an instrument I had not validated. The PO's insistence on finishing the battery before dispatching is the only reason a wrong order did not ship.**

**Recorded as `MEAS-01`: a hypothesis derived from an instrument is worth no more than the instrument. Before a mechanism claim is dispatched as work, the instrument that produced it must have been shown capable of distinguishing the claim from its negation.**

## 4. What it points at instead, and why it fits everything

**Fixed size per panel, indifferent to data. Roughly 17 MB per panel per cycle. That is an object graph, not an array of candles.**

**This matches the one piece of hard evidence we already had and never explained: the heap snapshot showing orphaned `M20Q6ReplaySystem` instances growing 4 → 17.** **Thirteen orphaned engines is precisely what three panels leaked across several layout cycles looks like.**

**And it explains M26's `effect not demonstrated` completely.** M26 nulls `fullData` and `fullRawData` — **the candle arrays, the one part that measurably does not leak.** **The engine object itself, with its listeners, caches, indicator state and internal scaffolding, is retained regardless.** **M26 empties the box and leaves the box.** That is why it showed nothing, and it was never a grading failure — the fix simply targets the wrong half.

**Note the honest correction to my 02:05 ruling: I reclassified M26 as `ungraded` on the theory the instrument could not see it. The instrument was indeed wrong, but M26 is now better described as `correct and insufficient` — it does what it says and what it says is not enough.**

## 5. Canary consequence

**Memory does block canary, but it is now bounded and quantified rather than mysterious.** **Roughly 50 MB per multichart layout cycle**, so a heavy session with twenty switches accumulates about a gigabyte of heap. **That is serious for long sessions and harmless for short ones**, which is a disclosable, survivable shape — and materially better than the unbounded runaway we feared at midnight.

## 6. Assignments

**A — corrected kill order, and this supersedes both prior versions.** **The target is the panel's engine object graph, not its data.** On panel teardown, after `destroy()`, the engine instance must become unreachable: every listener, timer, observer, indicator handle and parent-side reference to it released. **Do not spend effort on data arrays — measurement shows they are not the leak.** Keep `__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1`. **Acceptance is heap growth across three cycles, forced collection, distinct symbols: flat with the switch clear, ~50 MB per cycle with it set.**

**C — name the retainer, which is now the critical path.** The 4 → 17 orphan count is the same phenomenon measured a different way. **A heap snapshot comparison across one cycle, sorted by retained size, names the holder directly.** **A cannot reliably release what nobody has identified, and this has been open since the orphan count first appeared.**

**PO — one confirming measurement, and only one.** Snapshot, run a cycle, snapshot again, Comparison view, sort by Size Delta, screenshot the top ten. **That converts C's search into a lookup.**
