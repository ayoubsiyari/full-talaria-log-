# I ran my own falsifier. Saturation is refuted — and so is my bar-scaling finding. LAG-ZT is a flat floor, not a slope.

**From:** Manager B
**Date:** 2026-08-01 02:15
**Harness:** `_evidence/manager-B/k4-window-claim/saturation-falsifier.mjs`
**Withdraws:** `FINDING-LAG-SCALES-WITH-BARS-LOADED-20260731-1720.md`, and the saturation mechanism I
proposed at 22:45.

---

## The test

Eight 25-second windows, four bar counts each visited **twice**, in an order deliberately not monotonic
in bars (600, 8000, 1500, 4000, 4000, 1500, 8000, 600). Zero-trade session 936, nominal 10x, b120.

Interleaving was the point. Bars only grow with elapsed time under ordinary replay, so a straight sweep
confounds bar count with everything that drifts — host load above all. `goToReplayTimestamp` sets the
position in both directions, so each bar count could be revisited at a different time and a different
load. Host loadavg is recorded per window, which turns "load didn't matter" into arithmetic instead of an
assertion.

| bars | events/s | occupancy ms/s | ms/event | blocked ms/s | loadavg |
|---:|---:|---:|---:|---:|---:|
| 625 | 7.97 | 780.5 | 97.9 | 330.3 | 0.72 |
| 625 | 8.25 | 769.0 | 93.2 | 316.8 | 6.62 |
| 1,501 | 7.63 | 652.8 | 85.6 | 285.3 | 6.75 |
| 1,501 | 8.07 | 649.5 | 80.5 | 264.0 | 11.09 |
| 4,041 | 7.39 | 759.7 | 102.8 | 318.9 | 11.14 |
| 4,041 | 7.48 | 690.7 | 92.3 | 296.8 | 11.49 |
| 6,900 | 7.20 | 689.9 | 95.8 | 294.4 | 4.20 |
| 6,900 | 7.50 | 720.3 | 96.1 | 319.6 | 10.46 |

## Result: my hypothesis is dead

| prediction | saturation says | measured |
|---|---|---|
| events/s ratio low/high bars | ~11.04x (rate ∝ 1/bars) | **1.10x** |
| occupancy ratio high/low | ~1.0x | 0.91x |
| ms/event ratio high/low | ~11.04x | **1.00x** |

**Across an 11x bar range, nothing moves.** The event rate does not fall, so saturation is refuted. But
the alternative I offered as the disproof — events/s flat *while occupancy climbs* — did not happen
either. Occupancy is flat too. The thread is not running out of seconds; it is doing the same amount of
work per event at 625 bars as at 6,900.

My 22:45 explanation of the plateau was wrong. I owed a mechanism, produced one that fit three datasets,
and it failed the first direct test. I would rather have found this than have it in the PO report.

**Host load is controlled out, and this is the part I would keep.** The same bar count measured at
loadavg 0.72 and again at 6.62 gives 780.5 and 769.0 ms/s; 1,501 bars at 6.75 and 11.09 gives 652.8 and
649.5. **Load varied 16x and moved nothing.** That also settles a question hanging over everything I
measured tonight — none of it was host-load artefact.

## The bigger casualty: my own bar-scaling finding

`FINDING-LAG-SCALES-WITH-BARS-LOADED-20260731-1720.md` reported 55 ms/s blocked at 579 bars rising to
302–343 ms/s past 1,100 — a 6.2x degradation on one unchanging build, which was called the first direct
measurement of MONSTER-2 and the per-bar lag rate UNIT-01 wanted.

**At 625 bars I now measure 330.3 and 316.8 ms/s blocked, twice, at two different host loads.** Not 55.
There is no 6.2x. The slope does not exist in 625–6,900 bars; the low reading that anchored it does not
reproduce.

I do not know yet what the 55 ms/s window was measuring — most likely a window that opened before replay
was actually driving, so it captured an idle chart and I read it as a low-bar-count data point. What I am
sure of is that it should not have become a finding on one reading, and that **the shape I described —
climbs steeply then plateaus — was two unlike measurements joined by a line I drew.** The plateau I then
spent hours trying to explain was an artefact of the anchor point, which is why viewport, raw cap and
context bars all came back negative: there was nothing there to find.

This is the third correction in this lineage. The pattern is not bad luck. I publish after the run that
answers the question and before the run that says whether the answer is real, and the fix is a rule
rather than more care: **no finding on n=1, and any claimed slope needs its low end re-measured last.**

## What this does to LAG-ZT — it strengthens it

Nothing here weakens the zero-trade row. It sharpens it, and makes it worse:

- **A zero-trade session with 625 bars already blocks 330 ms of every second**, with 780 ms/s of
  occupancy. The lag does not need a long replay or an accumulated dataset to appear.
- It is **flat**, not a slope. Between 625 and 6,900 bars the cost per event is constant at ~93 ms.
- So **LAG-ZT is a floor, not a ramp**: a large, constant, bar-independent and trade-independent cost
  that is present from the first few hundred bars. The PO seeing lag on a zero-trade run two days ago
  needs no accumulation to explain it.

That reframes the hunt in a way I think is more useful than my slope was. The question is no longer "what
grows with bars" but **"what costs ~700 ms of main thread per second regardless of how much data or how
many trades are on screen"**. From my instrumented run, `render` accounts for 200.6 ms/s and the resample
for 62 ms/s of it. **Roughly 450 ms/s is unattributed**, and it is bar-independent, which rules out most
of the candidates anyone has proposed today.

## What this does not touch

- **A's and C's bar-scaling of the resample itself stands.** A measured per-event resample cost rising
  with resident bars, C has a cost curve to 36,104 bars. Those measure the resample; I measure total
  occupancy, in which the resample is 8–14%. A term at that share can grow substantially without moving
  the total inside an 11x range — and my range stops at 6,900 while C's runs to 36,104. **I am not
  contradicting C's curve, and nobody should read this as doing so.**
- **The achieved event rate correction stands**, and is reinforced: 7.2–8.25 events/s at every bar count
  against a nominal 10x. It simply is not bar-dependent in this range, so the mechanism I attached to it
  was wrong while the number was right.

## Confidence

- [measured] the eight-window table, n=2 per bar count, with load recorded per window.
- [verified] saturation refuted: the predicted 11x fall in events/s is measured at 1.10x.
- [verified] host load 0.72→11.49 does not move blocked or occupancy, from repeat visits.
- [measured] 330.3 and 316.8 ms/s blocked at 625 bars, which contradicts my own published 55 ms/s at 579.
- [unverified] *why* the original 55 ms/s reading was low. My idle-window explanation is a hypothesis I
  have not tested, and I am not going to assert it to tidy up my own error. The reading is withdrawn on
  the strength of two contradicting measurements, not on the strength of my story about it.
- [inferred] the ~450 ms/s unattributed floor, arithmetic from one instrumented run — a lead for the
  LAG-ZT mechanism hunt, not a finding.
