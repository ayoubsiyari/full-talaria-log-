# E warm-up window table — indicator families

**2026-07-31** · Manager E · packet `E-WARMUP-WINDOWS-V1`

## Citable Contract

Reference this contract by packet id **`E-WARMUP-WINDOWS-V1`** and commit
**`77e7bbfff`**. Do not resolve it by subject line; B is pulling E commits by SHA.

This contract is intentionally global only for the verified bounded families. If a later
family needs a longer warm-up window, that family gets a named row and justification; it does
not raise the global `warmupBars` rule for every indicator.

**Important correction:** `264` is the non-empty indicator floor produced by the formula, not
the contract value. Period-like parameters in the UI have `min` but no `max`, so the formula
must be evaluated from the active indicator parameters every time. Reachable examples:

| Configuration | `maxIndicatorParam` | Required warm-up |
|---|---:|---:|
| Default/floor mix, including MACD 12/26/9 and StochRSI 14/14 | 50 | 264 bars |
| SMA / EMA / WMA / DEMA / TEMA / HMA period 200 | 200 | 864 bars |
| MACD slow 200, signal 9 | 209 | 900 bars |
| StochRSI 50/50 | 100 | 464 bars |
| Any family with `maxIndicatorParam >= 1234` | >=1234 | 5000 bars (cap) |

## Ruling for A

Unbounded pre-session loading is unnecessary for the worker-tail indicator families below.
The bounded warm-up rule verified here is:

`warmupBars = min(5000, max(120, 4 * maxIndicatorParam + 64))`

For the representative default/floor max-param set below this resolves to **264 bars**. Each bounded row was
verified by recomputing a tail slice, merging from the replay append seam, and comparing the
merged endpoint against a full-pass worker result. Evidence:

- `docs/plan3/evidence/E-WARMUP-WINDOWS-20260731/warmup-window-evidence.json`
- `node --test --test-concurrency=1 "chart v 1.4/chart/modules/m19-i-indicator-tail.test.mjs"` → 22/22 GREEN

## Warm-up table

| Family | Representatives verified | Bound / anchor | Epsilon | Max observed drift | Decision |
|---|---:|---:|---:|---:|---|
| FIR / finite rolling | SMA, Bollinger, HMA, Donchian, Stoch, StdDev, AO | 264 bars | `1e-9` | `0` | Re-seed from bounded lookback |
| EMA | EMA(50) | 264 bars | `5e-4` | `2.80e-8` rel | Re-seed from bounded lookback |
| DEMA / TEMA | DEMA(20), TEMA(20) | 264 bars | `5e-4` | `1.55e-12` rel | Re-seed from bounded lookback |
| RSI / RMA oscillator | RSI(14) | 264 bars | `1e-6` | `6.56e-9` rel | Re-seed from bounded lookback |
| ATR / true-range RMA | ATR(14) | 264 bars | `1e-6` | `1.31e-9` rel | Re-seed from bounded lookback |
| MACD / PPO | MACD(12,26,9), PPO(12,26,9) | 264 bars | `1e-5` | `2.21e-8` rel | Re-seed from bounded lookback |
| ADX / Wilder recursive | ADX(14,14) | 264 bars | `1e-5` | `5.93e-8` rel | Re-seed from bounded lookback |
| Keltner / EMA+ATR | Keltner(20,10) | 264 bars | `5e-4` | `6.73e-15` rel | Re-seed from bounded lookback |
| TRIX / triple EMA | TRIX(18) | 264 bars | `5e-4` | `0` | Re-seed from bounded lookback |
| StochRSI | RSI(14) + Stoch(14,3,3) | 264 bars | `1e-5` | `4.93e-8` rel | Re-seed from bounded lookback |
| Mass Index | EMA(9) ratio + Sum(25) | 264 bars | `5e-4` | `0` | Re-seed from bounded lookback |
| RVI / Elder Ray | RVI(10), Elder Ray(13) | 264 bars | `5e-4` | `0` | Re-seed from bounded lookback |
| Vortex / DPO / Coppock | Vortex(14), DPO(20), Coppock(10,14,11) | 264 bars | `1e-5` | `0` | Re-seed from bounded lookback |
| VWAP | VWAP bands/cells | Anchor, not history | n/a | n/a | Load from configured `anchorPeriod`; default `session`. Product anchors are session, week, month, quarter, year, decade, century, earnings, dividends, splits. The first fetched bar must be at an anchor boundary or carry the prior anchor accumulators (`cumPV`, `cumP2V`, `cumVol`). |
| OBV | OBV + optional smoothing/BB | Anchor scalar, not history | n/a | n/a | Load from first bar of the replay/session/day window plus carried OBV baseline scalar. Default baseline `0` is valid only when the window begins at the chosen OBV anchor. Assert on `obv` and `ma` levels; BB width is offset-invariant and can pass vacuously. |
| PSAR | PSAR | State checkpoint, not bars | n/a | n/a | Needs prior trend direction, extreme point, acceleration factor and SAR value at the window edge, or a full recompute from a trusted PSAR anchor/checkpoint. |
| Seasonality | Seasonality | Keyed samples, not backward window | n/a | n/a | Non-causal by design: values depend on keyed historical samples by day-of-year. Needs a sample store/keyed baseline; no backward window of bars makes it correct. |

## Longer-window exceptions

None in this evidence run. The script attempted the estimator window first and would have tried
2x, 4x, and 5000-bar windows if a family drifted beyond epsilon. Every bounded family passed at
the estimator window.

## Pre-session Fetch Gate

Gate: `docs/plan3/evidence/E-WARMUP-WINDOWS-20260731/pre-session-warmup-buckets.red.mjs`

Current source is **RED**. The backtest initial fetch buckets are fixed counts and do not apply
the indicator contract. The 1m-master backtest path is worse: it computes the `<=1h` bucket in
master minutes, then displays the result at coarser timeframes.

| Mode | Example | Effective display warm-up | Deficit vs 264 floor | Deficit vs SMA-200 / 864 |
|---|---:|---:|---:|---:|
| Direct weekly+ bucket | 1w | 26 bars | 238 | 838 |
| Direct daily bucket | 1d | 45 bars | 219 | 819 |
| Direct 1h<tf<1d bucket | 4h | 80 bars | 184 | 784 |
| Direct <=1h bucket | 1h | 320 bars | 0 | 544 |
| Backtest 1m master | 1m display | 320 bars | 0 | 544 |
| Backtest 1m master | 5m display | 64 bars | 200 | 800 |
| Backtest 1m master | 15m display | 21.33 bars | 242.67 | 842.67 |
| Backtest 1m master | 1h display | 5.33 bars | 258.67 | 858.67 |
| Backtest 1m master | 4h display | 1.33 bars | 262.67 | 862.67 |

## Status of E’s earlier queue

- Opening Range owner bisect: live `b114` BASE `127`, `FULL_OFF` `0`, `RG_OFF` `127`; owner is `chart-indicators-full.js`.
- Opening Range fix: committed as `eb1cb76ae`; local probe GREEN (`30` bars vs max `32`).
- Overlay rows: `TAL-01913`, `TAL-01914`, `TAL-01921`, `TAL-01935` GREEN; `TAL-01938` RED until OR fix is on wire. `TAL-01913` was re-run on QA 123 / session `870` with three days and retained 2 daily-open anchors after five paused steps.
