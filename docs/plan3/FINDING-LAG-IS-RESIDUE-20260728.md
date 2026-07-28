# FINDING — the indicator lag is session-history dependent, not speed dependent

**Source:** PO test, 2026-07-28 10:35 · **Build:** `20260726b75` · **`typeof window.IndicatorPerf` = `undefined`** (fallback path — see §5)

## 1. The observation that overturns the model

| Step | Configuration | Speed | Result | Memory |
|---|---|---|---|---|
| 1 | Single chart, 1m, 4 MAs (SMA/EMA/WMA/DEMA, period 20) | **5x** | **No lag. Smooth.** | 1.0 GB |
| 2 | Step 1 + two orders with SL/TP + trendline | 5x | No lag | elevated |
| 3 | Multichart: 1m panel + 1D panel | 5x | Slow historical render on 1D · indicators repainting slowly · **other panel's time axis moving during render** · **drawings on 1D shifting while panning** | **2.5 GB** |
| 4 | **Back to single chart — same as Step 1** | **1x** | **Lagging. Whole website lagging. Indicators behind candles.** Same at 3x and 5x. | 1.8 GB after ~1 min |

**Step 1 and Step 4 are the same configuration.** Step 1 at 5x was clean; Step 4 at 1x was not. The only intervening event was the multichart session, and **800 MB never returned.**

## 2. Conclusion

**Speed is not the variable. Prior multichart use is.** The lag correlates with resource residue, not with replay rate. The PO's own data refutes the speed hypothesis: 1x lagged, 5x did not.

**This resolves the recurrence illusion that has cost this project more than any other single thing.** "The lag came back" and "it worked last night, it's broken this morning" are both explained: a session-history-dependent defect gives different answers to the same test depending on what preceded it. Fixes were never un-fixed; verification was non-deterministic and nobody controlled for session history. Every prior lag verdict taken without a fresh window is now suspect.

## 3. Mechanism hypothesis, per BRIEF-02 — with refutation criteria

**Hypothesis:** multichart teardown leaves live work running, not merely retained bytes. Candidates: orphaned `setInterval`/`setTimeout`, un-cancelled `requestAnimationFrame` loops, undetached event listeners, live panel command-bridge or sync-bridge channels, retained worker handles.

**Why live work rather than dead memory:** the reported symptom is *the whole website lagging*, which is frame starvation, not allocation pressure. Orphaned per-frame work would consume the frame budget and starve the surviving chart's render loop — producing something that **looks like indicator lag but is frame starvation**, which is consistent with the earlier report that "the lag is uniform across the chart".

**This merges two rows.** The §A9 memory row (reopened) and the indicator-lag family are plausibly one defect, and the ~230 MB teardown residual we previously closed as "bounded multichart working set" was the visible edge of it. The residual was measured in bytes; nobody measured whether it was still *executing*.

**Decisive test — cheap, and it must come before any fix:** timer/listener/rAF/channel census immediately before opening multichart, immediately after teardown back to single chart, and again 60 seconds later. Refuted if counts return to baseline while the lag persists — in which case the next probe is retained data volume driving per-tick work rather than orphaned scheduling.

**Second prediction, free to check:** a fresh private window at 1x with identical indicators should be clean. If it lags in a fresh window, the residue model is wrong.

## 4. Separate defects captured in Step 3, not to be conflated

1. **1D historical bars render slowly**, indicators repainting progressively behind them. This is the original pan-back complaint from day one and is still live.
2. **The other panel's time axis moves while the 1D panel renders.** Cross-panel interference during render — one panel's work is mutating a sibling's axis.
3. **Drawings on the 1D panel shift position while panning.** Drawing coordinates are not pinned to price/time during pan. Matches prior tester reports and is its own row.

## 5. Provenance warning — every number here is a fallback-path measurement

`IndicatorPerf` is **undefined on the deployed build**, so the loader fix is **not on TEST** despite candidate builds existing at b79/b80. Per §A2 these figures are labelled *fallback-path baseline* and must be re-taken once a build with the module loaded is deployed. The structural finding in §2 is expected to survive — a leak does not depend on which indicator implementation runs — but the magnitudes will change.

**This test is itself the argument for §A2:** the PO nearly spent another cycle chasing speed because nobody had checked which world the measurement was taken in.

## 6. Immediate consequences

- **The 10x speed cap does not address this symptom.** It remains a PO product decision; it is not a mitigation and must not be recorded as one.
- **The lag family's disposition changes** from "bounded by product cap" to open, with residue as the leading hypothesis.
- **All lag verification from now on controls for session history**: fresh private window, stated prior actions, or the verdict is void.
