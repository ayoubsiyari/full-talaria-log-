# E CONF-05 indicator selection

**2026-07-31** · Manager E · packet `E-CONF05-INDICATOR-SELECTION-V1`

Machine-readable artifact for C:

- `docs/plan3/worker-reports/E-CONF05-INDICATOR-SELECTION-20260731.json`

## Selection

Apply the same two indicators to each of the four CONF-05 charts:

| Slot | Role | Indicator | Params |
|---:|---|---|---|
| 1 | Incremental last-point family | `ema` | `{ "period": 20, "source": "close" }` |
| 2 | Anchored family | `vwap` | `{ "source": "hlc3", "anchorPeriod": "session", "bandsCalcMode": "standard_deviation", "band1Enabled": true, "band1Mult": 1, "band2Enabled": false, "band3Enabled": false }` |

This yields two indicators per chart and eight total indicator instances. Both soak arms must use the exact
same indicator definitions so the only variable between arms is trades.

## Why These Two

`ema(20)` represents the incremental-safe recursive family: its forming last point can update from carried
state without whole-series recompute.

`vwap` with `anchorPeriod=session` represents the anchored family: it is not a bounded-window case and depends
on anchor-period accumulators when starting inside an anchor.

Do not use `seasonality` for tonight's CONF-05 selection. It remains a load-bearing exception, but it is
non-causal and can require updating every visible bar sharing a day-of-year key; it is not the clean anchored
representative for a paired soak that must isolate trades.
