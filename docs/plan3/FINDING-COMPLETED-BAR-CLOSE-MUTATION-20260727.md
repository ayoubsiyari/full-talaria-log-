# Finding — a completed coarse-timeframe bar's close mutates after the bar has finished

**Date:** 2026-07-27 (evening) · **Found by:** PO check D2 · **Surface verified on:** host, backtest mode, session 877, EURUSD, b75
**Ticket:** TAL-01918 (previous candle close mutates at next open) — **REPRODUCED**
**Class:** data integrity (values-level) · **Timeframe-dependent** · **Rows:** cluster I

## Observation

Procedure: replay at low speed; hover a candle immediately after it completed and read `C` from the header; let replay advance several candles; hover the *same* candle and read `C` again.

| Display TF | `C` just after completion | `C` several candles later | Delta |
|---|---|---|---|
| 5m | 1.30508 | 1.30508 | 0 — stable |
| 1H | 1.30532 | **1.30662** | **+0.00130 (13 pips)** |

A finished candle's close changed by 13 pips. On 5m the same procedure was stable.

Direction suggests the **first** reading was the wrong one: the just-completed bucket appears to hold a partial/interpolated close, which is later replaced by the true close when something forces a clean rebuild.

## COMPLETE DATA SET (PO, 2026-07-28 00:11) — the resampled series lags the raw series, and the error scales with bucket duration

### D3 — cross-timeframe read at one frozen playhead

| TF | last-bar `C` |
|---|---|
| **1m** | **1.41500** |
| 5m | 1.41477 |
| 15m | 1.41477 |
| 1H | 1.41477 |
| 4H | 1.41477 |
| 1D | 1.41477 |
| 1W | 1.41477 |

**1m is the outlier; every resampled timeframe agrees with every other to the last digit.** Gap = 0.00023 (**2.3 pips**).

1m is the native raw granularity — no resampling. Every other timeframe is resampled from it. So this is not per-timeframe drift and not a bucketing error: it is **one lag point on the resample path**, identical for all consumers of it. The resampled display series' last bar carries a stale close while the native series carries the live one.

Note this contradicts the earlier reading of D2's 5m result as "clean": 5m is stale here by the same 2.3 pips as 1W. 5m was never correct — the mutation was simply below observation threshold.

### D2 — completed-bar mutation, by timeframe

| TF | `C` at completion | `C` later | Delta |
|---|---|---|---|
| 5m | 1.30508 | 1.30508 | 0 (below threshold) |
| 15m | 1.41279 | 1.41273 | **−0.6 pips** |
| 1H | 1.30532 | 1.30662 | **+13 pips** |
| 4H | 1.42074 | 1.42796 | **+72 pips** |

**Monotonic in timeframe duration across four cells.** Magnitudes are not strictly comparable (different playheads, different price activity), but the trend is unambiguous and the mechanism it implies is not.

### Unified mechanism (supersedes the separate D2/D3 framings)

The resampled display series' **last bar holds a close taken at the static playhead rather than at the live tick**, so it trails the raw series by an amount proportional to how much of the bucket is not yet included. When that bucket finalises, the trailing value can be retained instead of being rebuilt from raw — and only corrects when something later forces a clean full resample.

This single mechanism accounts for both observations and for the timeframe scaling: a coarser bucket leaves more un-included time, so both the live lag (D3) and the baked-in error (D2) grow with bucket duration. 4H at 72 pips is the same defect as 15m at 0.6 pips.

**Severity restated:** 72 pips wrong on a 4H close, then silently corrected, is not a threshold-of-perception defect. This is a hard canary blocker.

## Why 5m passed and 1H failed (superseded — see complete data set above)

5m passing does **not** establish that 5m is correct. The magnitude of this class of error is bounded by how far price travelled between the wrong close and the true close, so a short bucket can hide it below observation threshold. Treat 5m as "not observed," not "correct" — the oracle must assert on both.

The timeframe split does, however, line up with explicit coarse-TF carve-outs in the code, which is what makes it diagnosable.

## Named suspects (in priority order — the manager must confirm, not assume)

**S1 — trim-to-static-playhead on coarse timeframes, baked in at bucket finalization.**
`chart.js` `_trimLastDataBarToReplayPlayhead()` replaces `this.data[lastIdx]` with a trimmed bar so the forming wick matches the playhead. `this.data` **is** `ChartDataPipeline._resampleCache.result`, so this writes into the cached array's element slot. The code's own comments flag the consequence, verbatim: *"the finalized bucket would keep stale trimmed OHLC instead of being rebuilt from the raw master."* Two comments explicitly scope the hazard to coarse timeframes — *"trim collapses the partial bar on coarse TFs (15m+) back to the static playhead"* and *"Skip playhead trim while a forming tick is active"*. 1H is coarse; 5m is not. **This is the closest match to the observation.**

**S2 — the M20-Q9 correction's coverage on the path actually exercised.**
The documented correction is to drop the consumer's resample cache on every fix-ON install, restoring a full resample. `_installPlayheadPrefix()` does call `_m20Q9DropConsumerResampleCache(consumerChart)`, and with the kill-switch OFF the slice is a fresh array so `cache.sourceRef` misses anyway — so on paper both switch states avoid the incremental branch here. Therefore **either the exercised path is not one of those two, or the trim runs after the rebuild and its result survives.** Determine which; do not assume the correction covers the path the PO hit.

**S3 — the animating/forming candle pushed into the raw slice.**
`replay-system.js` appends a synthetic `animatedCandle` with interpolated OHLC onto the sliced raw array before resampling. If a coarse bucket finalizes while its last constituent raw bar is still the synthetic partial, the completed bucket keeps an **interpolated** close rather than the real one — and would later correct on a clean resample. This matches the observed direction of the change.

**S4 — in-place last-bar patching on the mirror path.**
`replay-system.js` patches `last.h / last.l / last.c / last.v` directly on `chart.data`'s last element before the full-resample branch. That mutates the pipeline's cached result element. Lower priority for this report (PO was on a single chart), but it is the same hazard shape and should be checked while in the area.

## Diagnostic that settles it

At a 1H bucket boundary during replay, capture both:
1. the finalized bucket's OHLC as it sits in `chart.data`, and
2. a clean full resample of `rawData` up to the same playhead, computed independently.

If (1) ≠ (2), the finalization path is retaining a trimmed or interpolated value and the diff localises which. Run with the M20-Q9 kill-switch both ON and OFF — if the defect survives both states, S1/S3 are implicated over S2.

## Severity and knock-on hypothesis

A completed candle's close must be immutable. Beyond the direct integrity problem:

- Any indicator consuming closes on a coarse timeframe is computed from a wrong close and then **recomputed when the close corrects** — producing a visible shift of indicator values on already-painted bars.
- **PROMOTED to leading hypothesis for the indicator-lag family (2026-07-28 00:11).** The D3 data changes the standing of this considerably. On every resampled timeframe the last bar's close trails the live price. Any indicator computed from closes therefore trails price by construction — which is *precisely* the reported symptom, "indicators lagging behind price." It predicts three things we can check against what we already know:
  1. The lag should be **absent on 1m** (native granularity, no resample) and **present on every timeframe above it**. This would explain why some single-chart tests on fine timeframes looked clean while others did not.
  2. The lag should be **worse on coarser timeframes**, matching the D2 scaling.
  3. It would be **independent of render cadence**, which is why two days of cadence work moved the symptom without eliminating it.

  **Decisive test, cheap:** reproduce the indicator lag on 1m versus 5m/1H/4H at the same speed. If it is absent on 1m and scales with coarseness above it, the dominant cause is data staleness, not render cadence, and the render work should stop until the data path is fixed.

  This does not retire the render-cadence findings — the M-c coalesce chain and the loader gap were real. It reframes the residual symptom that survived them.

## Gates

- **§A7 differential oracle applies**, extended with an immutability assertion: once a bucket is finalised, its OHLC must never change for the remainder of the replay. Assert across 5m, 15m, 1H and 4H — not only the timeframe where it was observed.
- Kill-switch gated; correctness class per §A4c.
- Closure record must state the surface and the timeframe set verified (§A8.3).

## Open

- Re-run D2 on 15m and 4H to establish where the threshold sits.
- Confirm whether the 5m case is genuinely clean or merely below observation threshold, by asserting on values rather than eyeballing.

## Manager disposition and estimate — 2026-07-27

**Queue:** canary blocker, immediately behind `FINDING-SESSION-CALENDAR-20260727.md`. No implementation or new live diagnostic starts tonight. Research and fixture design may proceed read-only; product correction may not run in parallel with the session-calendar implementation because both own shared `chart.js`, replay, resample-boundary and mirror paths.

**Risk tier:** Tier 3 — completed OHLC mutation is values-level data integrity and the likely correction touches shared replay/resampling code.

**Estimate:** optimistic **6 engineering days**, likely **9 engineering days**, worst case **15 engineering days**.

| Work item | Estimate |
|---|---:|
| Settling 1H boundary diagnostic, Q9 ON/OFF | 0.5–1 day |
| Attributed product correction | 1–4 days |
| Permanent 5m/15m/1H/4H completed-bucket immutability oracle | 1.5–2.5 days |
| Switch-OFF negative control and A5 four-state proof | 0.5–1 day |
| Close-driven rolling + recursive indicator knock-on probe | 0.5–1 day |
| Canonical/homepage parity and mixed-2 multichart coverage | 0.5–1 day |
| Independent review, integration and CI | 1–2 days |
| TEST deploy, PO pre-verification, reporter re-verification and evidence | 1–2 days |

The work items overlap; they must not be summed mechanically.

**Likely correction range by suspect:** S1 1–2 days; S2 0.5–1.5 days; S3 1.5–3 days; S4 1–2 days. If S1 and S3 interact, budget 3–5 correction days.

**Dependency on session calendar:** the immutability oracle must consume the settled shared session-boundary helper so “finalized” has one meaning across daily/weekly and intraday paths. Merge/freeze that helper contract first, then rebase this row. Do not duplicate boundary calculations in the TAL-01918 correction.

**Logged hypothesis, not yet established:** completed-close mutation can force indicators to recompute and visibly move on already-painted bars. Test this only after the completed-bucket immutability oracle exists; do not fold the current indicator-lag/render-cadence rows into this finding without causal evidence.
