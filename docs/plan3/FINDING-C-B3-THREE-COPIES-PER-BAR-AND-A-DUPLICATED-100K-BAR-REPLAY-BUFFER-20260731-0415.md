# FINDING C — B3: three copies per bar, and a duplicated 100,000-bar replay buffer

**2026-07-31 04:15** · Manager C · overnight battery B3 · tier=mid model=claude-opus-5-thinking-high
**Instrument:** `BAR-COPIES-CENSUS-V1` (GATE-01 PASS: clean 1x, planted 20x, planted 20x-aliased)
**Build read off the page:** `20260730b116` · **CONF-04:** all four realms `candle`, zero trades
**Artifact:** `_evidence\manager-C\B3-BAR-COPIES-CENSUS-20260731.json`

## Verdict, in the Director's own terms

The discriminator was: copies per bar of 1-2 kills the hypothesis, 20 finds something large. **The
answer is both, because there are two different terms and they point opposite ways.**

- **Accrual: 3 array slots per new bar, across 2 identity-distinct objects.** By the stated
  criterion this kills the accrual form of the PO's hypothesis. Bars arriving during replay are
  not duplicated twenty-fold.
- **Fixed: the playing panel holds 202,000 bar objects in its replay system while drawing 2,618.**
  Two identity-distinct copies of the same ~100,000-bar history, neither of which is the array the
  chart draws from. This is large, it is not accrual, and nobody had measured it.

## The measurement

Four panels, four symbols, four timeframes, 60x, zero trades, two indicators each. Sampled at 0,
5 and 15 minutes.

| | 0 min | 5 min | 15 min |
| --- | --- | --- | --- |
| bar-like slots, all realms | 236,493 | 251,822 | 275,724 |
| resident bars, all realms | 6,620 | 11,730 | 19,697 |
| **aggregate copies per resident bar** | 35.72 | 21.47 | **14.00** |
| identity-distinct bar objects | 147,873 | 158,092 | 174,027 |

**The aggregate ratio falls as the run proceeds, and that fall is the finding.** Slots grew 16.6%
while resident bars grew 198%. A ratio that decays under load is a fixed cost being amortised, not
a leak. Quoting the 35.72 alone would have been the misleading number of the night.

## Where the mass actually is, per array

Host panel (1-minute, the panel that advances), 0 min → 15 min:

| array | 0 min | 15 min | behaviour |
| --- | --- | --- | --- |
| `chart.replaySystem.fullRawData` | 102,000 | 102,000 | **fixed** |
| `chart.replaySystem.fullData` | 100,000 | 100,000 | **fixed** |
| `chart.data` | 2,618 | 15,695 | grows with playback |
| `chart.rawData` | 2,618 | 15,695 | grows with playback |
| `chart.dataPipeline._resampleCache.result` | 2,618 | 15,695 | grows with playback |
| `chart.displaySeries` | 111 | 111 | viewport only |

The three peers grew by **nothing at all** on every array — consistent with the correction I made
at 01:30, that peers are timestamp-seeked rather than index-advanced.

**Marginal copies per new bar = 39,231 slots / 13,077 bars = exactly 3.00.** Three arrays, each
holding one entry per resident bar, all extending in lockstep.

## Two distinct objects, not three, and I can prove which

Identity accounting on the host at 15 minutes: 151,501 distinct objects against 167,196 array
entries scanned. The difference is 15,695 — **exactly one resident-length array's worth**. So of
`data`, `rawData` and `_resampleCache.result`, two hold genuinely separate objects and one is an
alias of another. Three slots, two real copies.

The same accounting says the two large replay arrays are **not** aliases of each other: the first
60,000 entries of each were scanned and every one was a new object. `fullRawData` and `fullData`
are two real copies of the same history.

## Amplifier 2 moved rather than died

Resident bars **at first paint, before any playback, on a 1-minute chart with deep history: 2,011**
(`rawData` 2,011 as well). The chart does **not** hydrate its full history at load — that confirms
the viewport-windowed fetch I measured at 09:00 and settles amplifier 2 as stated.

But ~100,000 bars appear in the replay system **once replay is armed**. So the resident-load cost
is real and it attaches to *entering replay*, not to *opening a chart*. That distinction matters
for where a cut goes.

## Magnitude, stated conservatively

At the Director's 150 bytes per bar, 202,000 host bar objects is **~30 MB on the playing panel**,
of which the duplicate half (~100,000 bars, ~15 MB) is pure waste. Real, worth cutting, and still
two orders of magnitude short of 730 MB/h. Bar retention is **not** Monster 1 and this measurement
does not let anyone claim it is.

## `EVICT-03` target, now sharp

Two candidates for A, in order of confidence:

1. **`fullData` duplicates `fullRawData`** at ~100,000 bars on every panel that enters replay.
   Whether both are needed is a source question, not a measurement question, and it is cheap to
   answer. If one can be a view or an index range instead of a copy, that is ~15 MB per playing
   panel for no behaviour change.
2. **The 100,000-bar replay window is 38x the drawing window at play-start** and only falls to 13x
   after fifteen minutes of playback. `EVICT-03` says bars far behind the playhead and far outside
   the viewport are cold. Most of that 100,000 qualifies.

## Honest limits

- The census sees JS-visible arrays reachable from `window` within a 40,000-node budget per realm;
  the budget was **not** exhausted in any realm (2,191 nodes visited at most). It is still blind to
  closure-held, `WeakMap`-held and worker-held bars, so every ratio is a **lower bound**.
- Identity scanning is capped at 60,000 entries per array, so `distinctBarObjects` on the host is
  an undercount. It is enough to prove the two large arrays are not aliases; it is not a full
  identity map of them.
- **Amplifier 3 is unmeasured, not disproven.** The census found **zero** numeric series longer
  than 50 entries, which cannot be right with two indicators loaded per panel — indicator output
  is evidently not stored as plain numeric arrays reachable on that path. My instrument has a blind
  spot there and I am not reporting "derived structures cost nothing".
