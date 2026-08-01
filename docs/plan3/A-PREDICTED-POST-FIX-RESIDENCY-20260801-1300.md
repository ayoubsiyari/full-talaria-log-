# A: predicted post-fix residency — 552 MB at ten hours

The prediction the soak exists to test. Stated before the run, with the arithmetic exposed
so that round two is a subtraction rather than an argument.

**Headline: 552 MB at ten hours, against 1,502 MB measured and a 1,024 MB bar.**

The whole of that reduction is MEM-1a. MEM-1b predicts zero, MEM-1c predicts approximately
zero at ten hours, MEM-1d predicts about 1 MB. Those three are defended below rather than
quietly folded in.

## The baseline, restated

| quantity | value |
|---|---|
| measured residency | 23.98 MB per 1,000 resident bars |
| growth rate | 6,265 bars/hour |
| bars at ten hours | 62,650 |
| footprint at ten hours | 23.98 × 62.65 = **1,502 MB** |
| bar | 1,024 MB |
| required cut | 31.8% |

## What MEM-1a does to resident bars

This is traced from the shipped code, not assumed.

`chart.data` is not accumulated. Every tick it is rebuilt:

    sliceEnd  = currentIndex + 1
    slicedRaw = fullRawData.slice(0, sliceEnd)
    chart.rawData = slicedRaw
    chart.data    = chart.resampleData(slicedRaw, currentTimeframe)

So resident bars track the playhead directly, which is why they grow at the replay rate.
Everything downstream — the resample output, indicator series, the panel copies, the canvas
geometry — is rebuilt from `slicedRaw` and is therefore proportional to the prefix length.

Trimming the master shortens the prefix, and the prefix is the input to all of it.

With `EVICT_CONTEXT_BARS = 5000` and `EVICT_SLACK_BARS = 2048`:

- eviction first fires when the playhead passes **7,048** bars, which at 6,265 bars/hour is
  **1.13 hours** into the run
- each trim returns the playhead to 5,000
- resident bars then oscillate between **5,000 and 7,048**, mean **6,024**, forever

Against 62,650 at ten hours that is a ratio of **0.096**. Resident bars stop growing.

Reachability is checked: `_evictBehindPlayhead` is called from
`_advanceReplayPlayheadOneStep`, which is called from `animateTick` and `animateFastMode` —
the loops the soak drives.

## Why I do not simply multiply by 0.096

23.98 MB per thousand bars is **23.98 KB per bar**. A bar object is six doubles and a header,
on the order of 100–150 bytes in V8. The MEM-1d audit counted fourteen series copies; even
if every one were a distinct object rather than a shared reference, that is about 2.1 KB per
bar. **At least 90% of the measured per-bar cost is not bar payload.**

It is everything else that grows across the same wall-clock window and gets divided by a
counter that advances monotonically. Resident bars are a clock. Two instruments agreeing to
2.3% establishes that the measurement reproduces, not that bars cause the memory.

So the growth splits in two, and only one part responds to the cap:

**Prefix-proportional — falls with MEM-1a.** Everything rebuilt from `slicedRaw` each tick:
the resample output, indicator series over the prefix, `_panelFullRawData` and the per-panel
copies, canvas geometry. Genuinely O(prefix), and the cap is a hard bound on prefix.

**Time-proportional — does not fall.** The M20-Q6 scheduler registry, which I measured as
unbounded and quadratically scanned: at 7.87 events/s over 36,000 s that is ~283,000 entries,
order of 28 MB. Trade journal and order history: 20 closes/hour over ten hours is 200 trades,
under 5 MB. And the structural one — OS private footprint is a high-water mark, and V8 does
not readily return freed pages, so capping allocation stops growth without reclaiming what
has already been committed.

## The prediction

Taking the prefix-proportional share at **70%**:

| term | arithmetic | result |
|---|---|---|
| prefix-proportional | 1,502 × 0.70 × 0.096 | 101 MB |
| time-proportional | 1,502 × 0.30 | 451 MB |
| **total at ten hours** | | **552 MB** |

Expressed as a rate: 55 MB/hour averaged, settling to about **45 MB/hour** once eviction
engages at 1.13 hours, against 150 MB/hour measured.

## The single number the whole prediction rests on

Everything above reduces to one unmeasured fraction. Solving for where it fails:

    1502 × [f × 0.096 + (1 - f)] = 1024   →   f = 0.352

**The bar is met if and only if at least 35% of the measured growth is prefix-proportional.**

| prefix share | predicted 10h | verdict |
|---|---|---|
| 90% | 280 MB | passes easily |
| 70% (my estimate) | **552 MB** | passes with margin |
| 50% | 823 MB | passes |
| 35.2% | 1,024 MB | exactly at the bar |
| 30% | 1,095 MB | fails |

I chose 70% because the identified time-proportional structures total tens of megabytes, not
hundreds, while the prefix-proportional list is where the audited copies live. I did not
choose higher because the footprint high-water effect is real and I cannot size it, and
because "82% of resident bars are never displayed" says those bars are retained, not that
retention is the only thing growing.

If the honest answer to "can you predict this" is wanted plainly: **I can predict the
resident-bar collapse with confidence, and the MB figure only as far as that fraction is
right.** The fraction is what the soak measures. That is why I have written the prediction as
a break-even rather than a point estimate with false precision.

## The other three rows, credited honestly

**MEM-1b predicts 0 MB in this soak.** It bounds the per-timeframe execution series map,
which holds one or two entries unless a session repeatedly switches raw timeframes. The soak
does not. It is a pathological-case bound and a money-path correctness fix, not a
steady-state saving. It should not be credited with any part of the 552.

**MEM-1c predicts approximately 0 MB at ten hours.** Its trim runs once, at entry. MEM-1a's
5,000-bar cap is tighter and engages 1.13 hours in, so by the time the ten-hour number is
read, MEM-1c has been subsumed. Its real value is the boot moment C measured — the 4.0 MB in
two requests — and the first hour. Crediting it in the ten-hour figure would be
double-counting MEM-1a.

**MEM-1d predicts about 1 MB**, as already declared: it removes references to bars, not bars.

## Two operational consequences

**The instrument cannot measure the fix as currently built.** The soak computes its slope
from Δfootprint over Δbars between consecutive samples, and deliberately refuses to pool
across segment boundaries for exactly that reason. This fix drives Δbars to zero in steady
state. The slope will diverge or read undefined — not because memory is unbounded but
because the denominator is now bounded. **MB per hour must be reported alongside MB per
thousand bars**, or the run produces a meaningless headline number.

**There is a 75-minute falsifier before committing to ten hours.** Resident bars must plateau
between 5,000 and 7,048 within about 1.2 hours instead of climbing past 7,000. If they keep
climbing, eviction is not engaging in that configuration and every figure in this document is
void. That check costs 5% of the run and protects the other 95%.
