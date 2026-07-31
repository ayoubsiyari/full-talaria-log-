# FINDING — A's resample-cache defect is real and I confirmed it in the product, but it accounts for about 1–4% of the measured cost. The plateau is not the viewport, not the raw cap, and not the resample.

**2026-07-31 19:05 · Manager B · b120, live product, session 936, replay 10x**

Filed because A is about to aim a fix at `MONSTER-2` and the ruling asks A to explain my plateau.
**Three candidate explanations are now eliminated by measurement, including my own.** If A ships the
cache fix expecting blocked main thread to fall, it will not, and that is the failure class the
Director has named five times today.

## A's mechanism is confirmed behaviourally, not just in source

`dataVersion` increments **7.25 times per second** while bars advance **~7.2 per second**, sampled over
56 seconds of replay. **One cache invalidation per bar**, against a single-slot cache that requires an
exact version match. Exactly as A described.

## But the invalidation costs ~1 ms, and the per-event cost is ~90 ms

Timed in the running product: one source array, timeframe the only variable, 6,242 bars,
`getResampledSeries` forced to miss with a fresh `dataVersion` on every call, median of 25 iterations.

| timeframe | buckets produced | forced-miss cost | at 7 bars/s | share of the 320 ms/s measured |
|---|---:|---:|---:|---:|
| 1m | 6,242 | **1.8 ms** | 12.6 ms/s | **~3.9%** |
| 5m | 1,249 | 1.1 ms | 7.7 ms/s | ~2.4% |
| 15m | 417 | 1.0 ms | 7.0 ms/s | ~2.2% |
| 1h | 105 | 0.9 ms | 6.3 ms/s | ~2.0% |
| 4h | 28 | 1.0 ms | 7.0 ms/s | ~2.2% |
| 1d | 6 | 0.9 ms | 6.3 ms/s | ~2.0% |

A forced **hit** costs 0 ms. So the entire benefit available from fixing the cache key is the
difference — **at most ~12.6 ms/s of a measured ~320 ms/s, and less on every timeframe above 1m.**

Against that, the measured per-event cost is **~86 ms** (8.6 long tasks/s carrying ~36 ms of blocking
each beyond the 50 ms threshold). **The resample is roughly 1% of one event.**

> **Corrected 20:25.** Recomputed from the raw rows over the whole plateau regime: **8.11 long tasks/s,
> 37.3 ms mean blocking above threshold, 87.3 ms mean task duration.** And "per event" was an inference,
> not a measurement — there are **1.12 long tasks per replay event**, so a replay event carries about
> **98 ms** of long-task time. The conclusion of this document is unaffected: 0.9–1.8 ms against 87–98 ms
> is still roughly one percent. Full definition, and why C's trace will total more than twice my
> headline without disagreeing with it, in
> `docs/plan3/B-DEFINITION-OF-THE-87MS-BEFORE-C-TRACES-IT-20260731-2025.md`.

**This does not refute A's source analysis. It refutes the cost attribution.** A cache that can never
hit during the one activity that needs it is a genuine defect and worth fixing on its own merits — it
pays bookkeeping for no benefit. It is simply not what makes replay slow, so it should not be the
`MONSTER-2` gate, and `MONSTER-2` should not be reported green on it.

## Three candidate bounds for the plateau, all eliminated

The ruling asks A to explain why cost plateaus rather than climbing, since a resample linear in source
length would keep climbing. **The premise turns out not to hold — the resample is not linear in source
length in any measurable way** (1.8 ms at 6,242 bars, and flat), so the plateau needs no boundedness
argument about the resample at all.

**1. Not the viewport — this was my own hypothesis and it is dead.** I predicted the plateau would
track candles *visible*. Alternating zoom so bar growth could not alias with zoom order:

| segment | spacing | visible candles | display series | bars loaded | blocked ms/s |
|---|---:|---:|---:|---:|---:|
| zoomed-IN | 15.1 px | 98 | 175 | 4,390 | 393.6 |
| zoomed-OUT | 7.0 px | 211 | 308 | 4,513 | 325.8 |
| zoomed-IN | 15.1 px | 98 | 194 | 4,644 | 317.0 |
| zoomed-OUT | 7.0 px | 211 | 308 | 4,780 | 321.0 |
| zoomed-IN | 15.1 px | 98 | 194 | 4,906 | 339.2 |
| zoomed-OUT | 7.0 px | 211 | 308 | 5,039 | 309.3 |

Visible candles more than doubled and the display series nearly doubled; blocking did not rise.
Zoomed-in mean 349.9, zoomed-out mean 318.7 — and dropping the first segment as settling, 328.1
against 318.7. **Indifferent to the viewport.**

**2. Not `REPLAY_RAW_CAP`.** The constant is 5,000 and the trim never fires: `chart.data` and
`chart.rawData` grew straight through it — 5,121 → 5,539 → 6,242 — with `currentIndex` tracking length
and `fullRawData` constant at 28,859. Blocking at 5,039 bars was 309.3 ms/s, still on the plateau.

**3. Not `REPLAY_CONTEXT_BARS`.** The 500-bar context trim would have bounded the source, which was my
second guess after the viewport. It is not active either — the source length is unbounded and growing.

## So where do the ~90 ms go? Narrowed, not answered

Eliminated: the resample call, the viewport/display-series size, both replay trim caps. Remaining, and
A's to own: whatever runs per data event that is **independent of source length, of bucket count and of
visible candle count** — a full canvas redraw at fixed resolution, indicator recomputation, overlay or
order-marker work, or the replay engine's own per-event bookkeeping. The fact that it is flat across a
**3.2× range of loaded bars** (1,930 → 6,242) says whatever it is, its cost does not depend on how much
data is loaded.

That also reframes my own headline honestly. The rise from 55 ms/s at 579 bars to ~320 beyond 1,100 is
**not** a per-event cost growing with bars in the range where it plateaus. Per-event cost is flat there;
what changed between 579 and ~1,100 bars is that events crossed the 50 ms long-task threshold. The
degradation is real and user-visible, but "cost grows with bars" is only true below ~1,100.

## Limits, stated

- **`getDisplaySeries()` measured 0 ms and I do not trust that as a cold-path number.** My loop called
  it repeatedly without bumping `dataVersion` between calls, so it served its own display cache after
  the first call. **I have not measured a cold full per-event path** — only the resample within it. A
  should measure the cold path before concluding where the 90 ms sits.
- **The resample timings are warm-JIT, in-page, median of 25.** Fine for an order-of-magnitude claim
  (1 ms against 90 ms) and not fine for a 20% comparison.
- **`CONF-03`:** taken outside `CONF-01` and `CONF-05`. Hypothesis-forming, and must not be used to
  choose what to optimise.
- One session, one dataset, single realm, 10x. The bucket counts confirm the resample is really doing
  its work at each timeframe (6,242 → 6 buckets), so the timeframe sweep is not a no-op.

## What I would gate on

Not "the cache hits" — that gate passes on a fix that removes 1% of the cost. **Gate `MONSTER-2` on
cost per data event measured against bars loaded, as the ruling already specifies**, and require the
per-event figure to move. A fix that takes ~86 ms/event to ~85 ms/event should read as red.

## Evidence

- `_evidence/manager-B/k4-window-claim/time-resample-by-timeframe.mjs` — the timeframe table
- `_evidence/manager-B/k4-window-claim/time-the-resample.mjs` — forced miss vs hit against bar count
- `_evidence/manager-B/k4-window-claim/zoom-vs-blocking.mjs` — the alternating zoom experiment
- `_evidence/manager-B/k4-window-claim/what-is-the-resample-source.mjs` — array lengths and constants
