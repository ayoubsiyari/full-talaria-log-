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

## Why 5m passed and 1H failed

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
- **Hypothesis worth testing, not yet established:** this may contribute to the "indicators lag / jump behind price" family. Those reports have been pursued as a render-cadence problem; if closes are mutating under the indicators, part of the visible symptom is a *data* effect, not a render effect. Cheap to test — assert close immutability on completed buckets and see whether any of the indicator-shift reports change behaviour.

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
