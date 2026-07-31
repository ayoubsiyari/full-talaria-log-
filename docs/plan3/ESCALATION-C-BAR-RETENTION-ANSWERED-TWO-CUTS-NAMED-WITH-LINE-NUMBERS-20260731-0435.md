# ESCALATION C → Director + A — bar retention answered, two cuts named with line numbers

**2026-07-31 04:35** · Manager C · overnight battery B3 + B4 · builds read off the page: `20260730b116`

## One line

**The PO's retention hypothesis is half right, and the half that is right is not the accrual half.**
Bars arriving during replay cost 3 array slots and 2 distinct objects each — inside the Director's
"1-2 kills it" band. But the playing panel holds **202,000 bar objects** while drawing 2,618, and
**nothing is ever released** — 0 releases in 4 realms over 26 samples of hard forward play.

## The numbers, both scenarios

| question | answer |
| --- | --- |
| copies per bar, marginal (bars added during play) | **3 slots / 2 identity-distinct objects** |
| resident bars at first paint, 1m chart, deep history | **2,011** — no full-history hydration |
| bar objects held by the playing panel's replay system | **202,000** (`fullRawData` 102,000 + `fullData` 100,000) |
| does anything ever release a bar | **No.** 0 releases, all 4 realms, all 3 gauges |
| resident growth rate on the playing panel | **873 bars/min = 52,359 bars/h** |
| bar accrual in MB/h | **~15-26 MB/h**, unbounded |
| share of the 730 MB/h duration slope | **2-4%** |

**Bar retention is real, genuinely unbounded, and is not Monster 1.** I am not letting it be quoted
as the leak, and I am not letting it be dismissed either.

## Cut 1 — the replay entry fetch limit is 50x the first-paint limit

**Measured:** first paint holds 2,011 bars. After replay is armed the same panel's replay system
holds 102,000 and 100,000.

**Read in source** (`b-reconcile-c\chart v 1.4\chart\chart.js`):

```
7975:  const maxSmartLimit = highLimitAllowed ? 100000 : 2000;
```

A normal fetch is capped at **2,000** bars, which matches the 2,011 measured at first paint. Any
caller passing `allowHighLimit: true` gets **100,000**, which matches the measured replay buffers.
The high-limit callers are bulk-history backfills bounded by what they ask for
(`chart.js:4200`, `limit = max(100, min(smartCap, olderBars + 40))`), with `smartCap` defaulting to
100,000 at `chart.js:4199`.

**The question for A, which I cannot answer from a measurement:** in a plain CONF-01 boot with zero
user scrolling, which caller asks for ~102,000 older bars, and is that bound derived from anything
the user can see? If it is derived from a session date range rather than from the viewport, then
`EVICT-03` is satisfied by bounding it to viewport-plus-margin and re-requesting on scroll-back —
which is exactly the mechanism the PO described, and the 2,000-bar path proves it already exists.

## Cut 2 — the replay system keeps two spread copies of that history

`b-reconcile-c\chart v 1.4\chart\modules\replay-system.js`, at **two** sites:

```
2607:  this.fullRawData = [...this.chart.rawData];
2608:  this.fullData = [...this.chart.data];
```

```
3333:  this.fullRawData = [...this.chart.rawData];
3334:  this.fullData = [...this.chart.data];
```

Identity accounting says these two arrays are **not** aliases of each other: the first 60,000
entries of each were scanned and every entry was a distinct object. So raw history and display
history are two separate sets of ~100,000 bar objects, ~15 MB of which is the duplicate.

The spreads themselves are shallow and cheap. **The cost is the length, not the copy** — so the fix
is cut 1, and cut 2 only matters if raw and display can share objects at the same timeframe. On a
1-minute chart displaying 1-minute bars they arguably should.

## What A should NOT do on my numbers

- Do not treat this as the fix for the duration slope. It is 2-4% of it.
- Do not cut the growing resident triple (`data`, `rawData`, `_resampleCache.result`) before cut 1.
  Their growth is 3 slots per bar, which is the *bounded* part of this finding.

## Instrument defects I found in my own work tonight, both corrected

1. **B4's realm key** was the last 52 characters of the frame URL, which the three peers share. All
   three merged into one series and the hops between 1,596 / 1,911 / 495 scored as **"26 releases"** —
   producing the answer "something releases", which is wrong in the interesting direction. Re-keyed
   on frame ordinal plus timeframe; the artifact carries both grades; corrected answer is unanimous.
2. **B2's recalc cadence** divided by advanced candles without a floor, and reported **41.87
   recalcs/candle** from 55 zero-denominator and 13 **negative**-denominator windows out of 84. Voided,
   guarded, and given a rate-based fallback that survives a frozen bar axis.

Both cost a re-parse and no re-runs. `NIGHT-01` held: six scenarios, serial, zero deaths, zero
relaunches.

## Also from tonight, for the record

- **B1 same-build A/B closed the cross-build caveat.** On b116: two indicators +2.812 CI[2.508,
  3.116], zero indicators +1.036 CI[0.942, 1.131], non-overlapping. Indicators carry **63.2%** of the
  decay against 63.9% measured cross-build at 01:50. Both of A's cuts are still needed.
- **"60x" is ~873 bars/minute on a 1-minute chart**, i.e. ~870x real time. The duration gate's own
  advance probe independently reads `1m:15.806/s vs 1/s x15.81`. The speed selector does not mean
  what its label says, in the opposite direction from the tick complaint.
- **Tick mode runs four independent animation loops** (`getPlaybackLoopKind()` returns `tick` in all
  four realms, where candle returns `null` for the three peers), and in 16 minutes fired **14,709
  indicator recalcs to buy 7 candles of progress** at a flat 0.687 ms per recalc.
