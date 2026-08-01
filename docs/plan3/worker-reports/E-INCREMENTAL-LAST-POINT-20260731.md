# E incremental last-point split

**2026-07-31** · Manager E · packet `E-INCREMENTAL-LAST-POINT-V1`

## Verdict

Tick-mode indicator tips do not need whole-series recompute for the bounded indicator families.
The current host path in `replay-system.js` calls `scheduleIndicatorRecalc(reason, { force: true,
immediate: true })` on every tick frame, while panels call `scheduleIndicatorRecalc('live-tick')`
only every 18 ticks and without force/immediate. The correct endpoint is a forming-bar update whose
cost does not grow with total history.

## Incremental-Safe Families

These families can update the last/forming point from bounded trailing inputs or from a carried
recursive state. They are the same causal families already accepted by the tail-safe worker list,
plus the two existing exact continuation families:

| Family | Indicator types | Last-point update shape |
|---|---|---|
| Finite rolling / FIR | `sma`, `wma`, `bb`, `bollinger`, `envelope`, `smaenvelope`, `stoch`, `stochastic`, `roc`, `mom`, `momentum`, `willr`, `mfi`, `donchian`, `aroon`, `cmf`, `ao`, `uo`, `vortex`, `dpo`, `stddev`, `hma` | Recompute only the last value from the finite trailing window. Work is bounded by the largest relevant period, not total bars. |
| Convergent recursive / EMA-family | `ema`, `dema`, `tema`, `atr`, `adx`, `rsi`, `macd`, `ppo`, `keltner`, `trix`, `stochrsi`, `massindex`, `coppock`, `rvi`, `elderray` | Carry the prior confirmed recursive state and recompute the forming value from the live OHLC. Reset to full/tail recompute on params, prefix or timeframe change. |
| Existing exact continuations | `supertrend`, `adr` | Already documented in source as exact O(delta) continuations with state cached at the last confirmed bar. |
| O(1) pass-through | `volume`, display-only source values | Last value is the current bar's own value. |

Guardrails:

- `rsi` with `divergenceEnabled` is not safe for a single last-point update; divergence enrichment is
  index/full-history based.
- Centered or shifted presentations can keep their displayed last value null/unchanged until enough
  future/offset context exists; the underlying causal value can still be updated at its natural index.
- If the active set includes a non-incremental family, the host should use the cadence/coalesced path
  for that family rather than forcing whole-series recompute every tick.

## Not Incremental Without Anchors Or Checkpoints

These are not "harder windows." They need anchor/checkpoint state. Without that state, a last-point-only
update is not correct.

| Family | Why last point cannot be updated from bars alone | Required state |
|---|---|---|
| `obv` | OBV is cumulative signed volume from array index 0. Truncation shifts the level and MA by an unknown scalar. | Prior OBV baseline scalar and previous close. |
| `vwap` | VWAP accumulates `cumPV`, `cumP2V` and `cumVol` within the configured anchor period; starting inside an anchor loses the prior numerator/denominator. | Configured `anchorPeriod`, current anchor key, prior `cumPV`, `cumP2V`, `cumVol`. |
| `psar` | PSAR recurrence depends on trend direction, extreme point, acceleration factor and SAR value seeded from prior bars. | Trend direction, EP, AF, SAR value, and enough previous bar lows/highs for the clamp. |
| `seasonality` | Non-causal. Updating the newest return changes the keyed month/day sample mean and can change every bar sharing that key, not just the last point. No backward bar window fixes it. | Keyed historical sample store/baseline by day-of-year, plus fan-out to all displayed bars for that key. |

## K1 Green Target For A

E cannot author the `chart.js` / `replay-system.js` product fix in this packet because those paths are
A-owned and explicitly denied to E in `docs/plan3/TERRITORY.yml`. The E gate target remains:

- Pre-session K1: compute `requiredDisplayWarmupBars` from active indicators, then convert to source
  bars when the backtest path requests a 1m master: `ceil(requiredDisplayWarmupBars * displayTfMs /
  requestTfMs)`.
- Tick-mode L6: host and panels should converge on one cadence/coalescing model. For incremental-safe
  families, update only the forming last point. For anchored/checkpoint families, require the state
  above or route through a slower coalesced/full path.

## Ratio-Gap Cache Audit

`talaria-ratio-gap-indicator.js` and its homepage mirror only hold two module-level caches:
`_timeFmtCache` and `_dateFmtCache`. Both are keyed by timezone string and store `Intl.DateTimeFormat`
instances. They do not retain bars, symbols, file ids, sessions, chart instances or last computed
indicator outputs.

Verdict: formatter caches are safe. There is no single-slot bar cache in `talaria-ratio-gap-indicator.js`
to contaminate mixed-symbol panels.
