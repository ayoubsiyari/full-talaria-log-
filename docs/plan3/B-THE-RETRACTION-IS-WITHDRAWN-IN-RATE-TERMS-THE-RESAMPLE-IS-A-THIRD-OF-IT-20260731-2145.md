# The retraction is withdrawn: in rate terms the resample is a third of the blocked main thread

**From:** Manager B
**Date:** 2026-07-31 21:45
**Supersedes:** `FINDING-THE-RESAMPLE-CACHE-IS-REAL-BUT-IT-IS-NOT-THE-COST-20260731-1905.md` — that title is
wrong and the document is withdrawn.
**Status of the mechanism:** A's cost claim is restored. A's *named mechanism* is not the operative one.

---

## What I got wrong, and why

At 19:05 I wrote that A's resample cache "is real but it is not the cost", putting it at 1–4% of the
main-thread cost. A challenged that the retraction does not follow in rate terms. A is right and the
retraction is withdrawn.

The error was arithmetic in kind, not judgement. I compared a **per-call cost** against a **per-task
duration** and called the quotient a share:

> 1.8 ms per forced miss ÷ 87.3 ms mean task = ~2%

That quotient is not a share of anything. A cost per call becomes a cost per second only when
multiplied by calls per second, and I never measured the call rate — I assumed one call per data event
from reading the code. Both factors were wrong, and they multiplied:

| factor | what I assumed | what I measured | error |
|---|---|---|---|
| cost per call | 1.8 ms (synthetic forced miss) | 6.873 ms (real calls, in situ) | 3.8x |
| calls per second | 7.25/s (one per data event) | 15.81/s (two per data event) | 2.2x |
| **cost per second** | **13.05 ms/s** | **108.7 ms/s** | **8.3x** |

Worth naming as its own error: I took the 1.8 ms in one run and the 87.3 ms in a different run. That is
the bar-count confound again in a new costume — two numbers from two runs presented as one ratio. This
measurement collects the cost and the blocking in the **same 30-second window** so the share is internal
to one run.

## The measurement [measured]

Wrapped the real functions on the live pipeline during real replay on b120, session 936, 10x, 1600x950,
6,242 → 6,481 bars, 30.3 s. Instrument overhead (0.36 µs per `performance.now()`) is subtracted per call.
Raw: `_evidence/manager-B/k4-window-claim/resample-in-rate-terms.mjs`, result JSON on host.

```
window 30.3 s     data events 7.86/s     long tasks 8.78/s
blocked (TBT convention)  329.8 ms/s
occupancy (>=)            768.8 ms/s

function                calls/s   ms/call   ms/s     max ms   hits(<0.05ms)
getResampledSeries        15.81     6.873   108.7     476.6   0.4%
buildDisplaySeries        16.41     2.335    38.3      98.1   47%
getDisplaySeries          32.81     1.170    38.4      98.1   72%
chart.render              16.41    12.247   200.9     178.5   —
_tryIncrementalResample    0.00         —     0.0         —   never called
```

**`getResampledSeries` costs 108.7 ms/s. That is 33.0% of the blocked main thread and 14.1% of the
≥768.8 ms/s occupancy.** Not 1–4%.

Two readings that matter beyond the headline:

- **The worst single resample call blocked the main thread for 476.6 ms.** Under the longest-freeze rule
  now standing for every BUDGET-01 row, that one call exceeds any single-freeze budget we have discussed
  on its own.
- `chart.render` at 200.9 ms/s **contains** most of the resample time. The two rows cannot be added. The
  non-overlapping claim is the 108.7 ms/s.

## Why fixing the key will produce a null result [verified]

A named the mechanism as: the cache key contains `dataVersion`, which bumps every replay event, so the
cache never hits. The first half is true. The conclusion does not survive contact with the guard.

The source has two fast paths, and **the incremental branch does not test `dataVersion` at all**:

```
cache.sourceRef === source && cache.tf === tf
  && cache.sourceLen === source.length - 1 && Array.isArray(cache.result) && cache.result.length > 0
```

A deliberately left the version out of it. So version churn cannot be what kills the incremental path —
yet the path fired **0 times in 298 real calls**. Something else is failing. I instrumented each clause
per call (`which-guard-clause-fails.mjs`, 298 calls, 20 s):

| clause | true in |
|---|---|
| `cache.tf === tf` | 100.0% |
| `cache.sourceLen === source.length` | 50.3% |
| `cache.result` non-empty | 50.3% |
| `cache.dataVersion === dv` — **A's mechanism** | 50.3% |
| `cache.sourceRef === source` | **0.7%** |
| `cache.sourceLen === source.length - 1` | **0.0%** |
| → would hit | 0.7% |
| → would take incremental branch | **0.0%** |

Calls arrive in a strict alternating pair per data event, 150 of each in 298:

```
call A   sourceRef ✗   dataVersion ✓   cacheLen -1     srcLen 6426   source is NOT chart.data
call B   sourceRef ✗   dataVersion ✗   cacheLen 6426   srcLen 6426   source IS chart.data
```

Three independent defects, and A named the weakest:

1. **Two different source arrays alternate through a one-slot cache.** Call A passes an array that is not
   `chart.data`; call B passes `chart.data`. Each stores itself and evicts the other, so `sourceRef`
   identity fails on both — 0.7% true overall.
2. **Something invalidates the cache every cycle.** On every call A, `cache.sourceLen` is `-1`, the reset
   value written at pipeline lines 47–49. The cache is being explicitly cleared once per event.
3. **`dataVersion` bumps.** True, and it is false only on call B.

Now the load-bearing point. On call B, `sourceLen` matches, `tf` matches, and the result is present — the
only false clauses are `sourceRef` **and** `dataVersion`. **Remove `dataVersion` from the key and call B
still misses on `sourceRef`.** Call A still misses on both `sourceRef` and the `-1`. The measured
consequence of A's proposed fix is zero calls converted, on both branches.

The incremental branch is worse than dead: its `sourceLen === length - 1` condition is true in 0.0% of
calls because the observed length delta is only ever **0** (call B) or **the entire array** (call A, from
the `-1` reset). The `+1` state it waits for never occurs in this call pattern.

## What to hand A

- **Cost, restored:** the resample is 108.7 ms/s, 33% of blocked, worst single call 476.6 ms. My 19:05
  dismissal was wrong by 8.3x and should not be used.
- **Fix, redirected:** the target is not the key. In order of measured leverage — stop the per-event
  invalidation that writes `sourceLen = -1`; give the two callers either a stable array identity or a
  cache with more than one slot; only then does the version term matter.
- **Falsifier for whoever fixes it:** rerun `which-guard-clause-fails.mjs` and require
  `would take INCREMENTAL branch` above 90%, then rerun `resample-in-rate-terms.mjs` and require
  `getResampledSeries` ms/s to fall. Gate on the ms/s, not on a hit-rate counter — the product's own
  `incrementalResamples` counter reads 0 and would read 0 after a fix that only touched the key.

## Confidence

- [measured] 108.7 ms/s, 33.0% of blocked, 14.1% of occupancy, 476.6 ms worst call — one run, n=479 calls.
- [measured] clause-by-clause truth rates, n=298 calls, and the alternating two-array pattern.
- [verified] the incremental branch does not test `dataVersion` — read from the deployed source on b120.
- [inferred] that a key-only fix converts zero calls. It follows from the clause table rather than from
  a build with the fix in it; A can falsify it in one run with the harness above.
- [unverified] which caller passes the non-`chart.data` array, and what performs the per-event
  invalidation. Both are one grep in A's tree and I did not want to guess at authorship.
