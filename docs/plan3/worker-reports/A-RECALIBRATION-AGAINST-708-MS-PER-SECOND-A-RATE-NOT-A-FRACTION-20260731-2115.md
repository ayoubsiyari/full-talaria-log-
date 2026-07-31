# A — Recalibrated against 708 ms/s. My "0.2%" was a fraction of ONE EVENT; against an occupancy RATE the resample mechanism is large.

**2026-07-31 21:15** · Manager A · queue item 3 of the 20:49 ruling

## The unit changed, and it changes my conclusion

Everything I published today was **per-event**. The corrected quantity is an **occupancy rate**. Those are not
comparable without an event rate, and I did not have one attached to my numbers.

**cost per second = cost per event × events per second.**

My percentages survive exactly as you said — as fractions of a task. What does **not** survive is the impression
they left, including on me, that the pipeline is negligible in absolute terms.

## Converting the mechanism I measured at 20:50

The sweep found a full resample of the entire resident series firing **1.0× per event at all 45 points**. Event
rate from my earlier PAINT-01 work: **1 paint per canvas per candle**, and 60× replay on 1m runs at **62.5
candles/s**, so ~62.5 events/s per realm.

| resident bars | measured ms/event | × 62.5 events/s | share of 708 ms/s |
| ---: | ---: | ---: | ---: |
| 8,000 | 1.61 | 101 ms/s | 14% |
| 25,583 | 3.03 | 189 ms/s | **27%** |
| 36,104 | 3.41 | 213 ms/s | 30% |
| 60,000 | 12.22 | 764 ms/s | **exceeds 708 on its own** |

**At C's measured span this single mechanism converts to a quarter to a third of the total occupancy, and at
60,000 bars the arithmetic overshoots the entire budget.** An overshoot means an input is wrong — most likely
the event rate is below 62.5/s in B's configuration, or node is overstating the 60,000-bar point (that row was
0.44 ms/event slower in one run than another, the noisiest point in the sweep). **I am flagging the overshoot
rather than trimming it to fit**, because a model that overshoots is telling you something and a model tuned to
land at 100% is telling you nothing.

## What this does and does not change

**Does change:** the two candidates I killed today were killed on the right arithmetic for the wrong unit. The
cache key at 2–4% of a task and the slice at 0.2–0.3% of a task are still small *within a task*, but I framed
them as small in absolute terms and that framing was unsupported. The slice specifically: at 0.078 ms × 62.5/s
it is ~4.9 ms/s, genuinely negligible — that one holds up. **The cache key does not obviously hold up** at
2–4% of a task and should be re-examined by B in rate terms before it stays retracted.

**Does not change:** the scaling result, which is the load-bearing finding and is unit-independent. Display
output is pinned at 260 bars regardless of timeframe; cost tracks **resident** bars; 1w at 60,000 bars emits
seven display bars and still costs 4.00 ms. The knee does not move with the caps either way you measure it.

## Bounds, stated before anyone builds on this

* **The event rate is inherited, not re-measured here.** 62.5/s is 60× on 1m from my earlier paint work. Other
  speeds and timeframes differ, and the whole table scales linearly with whatever the real rate is. **If B or C
  can supply a measured events/s for the configuration behind 708 ms/s, every row above should be recomputed
  against it before it is used.**
* **Node, not Chromium.** The per-event millisecond figures are node's.
* **Still not an attribution.** This is a converted estimate, not a measurement of the product's occupancy. C's
  bucketed trace remains the thing that says whether the category is even scripting. If it is not, this is
  wrong regardless of how well the arithmetic lands.
* **Not the memory term.** Unchanged: allocation churn here is collected, not retained.

## Recommendation

The cheapest next measurement is **events/s in the 708 ms/s configuration**, because it is the one input that
converts every per-event number anyone has produced today into the corrected unit — mine, B's, and any future
candidate's. Without it we are all publishing fractions of a task against a target expressed as a rate, which is
how a 0.2% and a 27% ended up describing the same mechanism.
