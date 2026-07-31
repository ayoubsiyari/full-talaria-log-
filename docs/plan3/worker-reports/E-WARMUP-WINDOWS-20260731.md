# E warm-up window table — indicator families

**2026-07-31** · Manager E · packet `E-WARMUP-WINDOWS-V1`

## Ruling for A

Unbounded pre-session loading is unnecessary for the worker-tail indicator families below.
The bounded warm-up rule verified here is:

`warmupBars = min(5000, max(120, 4 * maxIndicatorParam + 64))`

For the representative max-param set below this resolves to **264 bars**. Each bounded row was
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
| VWAP | VWAP bands/cells | Anchor, not history | n/a | n/a | Load from configured VWAP anchor. Default is session; product also names week, month, quarter, year, decade, century, earnings, dividends, splits. |
| OBV | OBV + optional smoothing/BB | Anchor scalar, not history | n/a | n/a | Load from first bar of the replay/session/day window plus carried OBV baseline; default baseline `0` when no prior anchor is supplied. |
| PSAR / seasonality | PSAR, seasonality | Special checkpoint | n/a | n/a | Not charged to all indicators. PSAR needs trend/extreme/acceleration checkpoint; seasonality needs keyed historical samples by day-of-year. |

## Longer-window exceptions

None in this evidence run. The script attempted the estimator window first and would have tried
2x, 4x, and 5000-bar windows if a family drifted beyond epsilon. Every bounded family passed at
the estimator window.

## Status of E’s earlier queue

- Opening Range owner bisect: live `b114` BASE `127`, `FULL_OFF` `0`, `RG_OFF` `127`; owner is `chart-indicators-full.js`.
- Opening Range fix: committed as `eb1cb76ae`; local probe GREEN (`30` bars vs max `32`).
- Overlay rows: `TAL-01914`, `TAL-01921`, `TAL-01935` GREEN; `TAL-01938` RED until OR fix is on wire; `TAL-01913` BLOCKED on one-day session/no daily-open positive control.
