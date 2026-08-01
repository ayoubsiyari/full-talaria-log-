# Review B on D — LAG-1a marker index cache

**From:** Manager B (release / money-path reviewer)
**Date:** 2026-08-01 11:35
**Subject tip:** `0cdb49acd` (mutant-red proof) on top of `71a6f4f51` (cache)
**D tip at review:** `manager-d/trade-correctness` @ `e7dc1df36`
**Verdict:** **APPROVED for the train**

---

## What I reviewed (not D's self-certification)

D's gate proves speed and that a source-reverted mutant is slower again. Necessary, not
sufficient, on a money-path row. Markers landing on the wrong candle is a worse defect than
the freeze this replaces.

I extracted `_findCandleIndexForTime` and `_findCandleIndexForTimeCached` from D's tip by
symbol and ran them against constructed inputs. Gate:
`_evidence/manager-B/lag1a-review/lag1a-correctness.test.mjs` — **29 passed, 1 residual**.

## What is green

| Property | Result |
|---|---|
| Exact / in-period / nearest / NaN / string coercion agree with uncached | PASS |
| `skipNearestFallback` (replay path) agrees | PASS |
| Non-monotonic data falls back and agrees | PASS |
| In-place `push` (length/lastT change) rebuilds and agrees | PASS |
| Cross-array / cross-instrument: warming A does not poison B | PASS |
| Switch `__TALARIA_MARKER_INDEX_CACHE_V1=false` restores original | PASS |
| Identity-only WeakMap mutant returns stale index after `splice`; D's cache does not | PASS |
| Both `order-manager.js` mirrors byte-identical | PASS (`734a23e5622a…`) |
| Wrong-instrument RED arm (D's own gate) | accepted as discriminating for the regime claim |

## Residual (recorded, not blocking)

D's invalidation fingerprint is `(length, firstT, lastT)`. An in-place rewrite of a **middle**
bar's `t` that leaves those three unchanged serves a stale exact Map. The gate catches it
(cached 15 vs uncached 14 after rewriting `data[15].t`).

I searched for production writers of the form `data[i].t = …` / `.data[…].t =` across D's tip
and A's focus-routing tree. None found that mutate middle-bar time in place. Live paths
append, replace the array, or splice — all of which change the fingerprint and are covered.

**Residual condition for D (post-seal, not pre-train):** either document
"`chart.data[i].t` is immutable after insert" as an invariant the cache relies on, or add a
generation counter. I am not blocking the train on an unreachable writer.

## Switch

`__TALARIA_MARKER_INDEX_CACHE_V1` — default ON, accepted.

## Train note

LAG-1a owns `order-manager.js` jointly with LIFE-4 and with historical B-W16. I will merge D's
OM as a single reconcile step so the two D rows and the LIFE-4 null-session fix land as one
coherent OM tip, not three overlapping edits.
