# Talaria — Answers to Full Export Questions (`200_trades_full.csv`)

**Re:** `TALARIA_FULL_EXPORT_QUESTIONS.md`  
**Audience:** Analytics / Page 5 & Page 10 ingest team  
**Status:** Authoritative answers from chart `order-manager.js` + known test-data generator limitations

---

## Executive takeaway

**Q2–Q4 inconsistencies in `200_trades_full.csv` are mostly synthetic-test artifacts**, not production chart behavior. The test generator (`generate_200_trades_full_csv.py`) emits running envelopes and independent random paths; the live chart stores **per-bar** H/L/C in R.

**Treat `bar_*_r` arrays as canonical** and recompute scalars / running envelopes in-app.

| Question | Chart (production) | Synthetic `200_trades_full.csv` |
|----------|-------------------|--------------------------------|
| **Q1** Array semantics | Per-bar H/L/C in R | **Incorrect** — running envelopes (generator bug) |
| **Q2** Scalar vs array | Scalars derived from `max(bar arrays)`; arrays are source of truth | **Incorrect** — scalars generated independently |
| **Q3** Close vs adverse envelope | Must be consistent per bar (same OHLC) | **Incorrect** — independent random paths |
| **Q4** Capture ratio | `signed rMultiple / total_mfe_r` (fraction) | **Incorrect** — used `abs(r) / mfe_r` |

**Recommendation:** Treat **raw `bar_*_r` arrays as canonical**; recompute scalars and running envelopes in-app. For ground-truth chart data, use session journal JSON (`exportTradesToJSON`), not the synthetic CSV alone.

---

## Q1 — Are `bar_high_r` / `bar_low_r` running envelopes, or per-bar candle highs/lows?

### Production chart: **per-bar candle extremes in R**

Each bar while the trade is open appends **that bar's own** high, low, and close converted to R — not a cumulative running max.

**Source:** `chart v 1.4/chart/modules/order-manager.js` → `_calculateExcursionRValues` / `_appendExcursionSnapshot`

**Base price:** `array_base_price` (first fill; falls back to `openPrice`)

**Risk denominator:** `|array_base_price − initial_sl|` (frozen at entry via `initial_sl` / `initialStopLoss`)

**LONG (BUY):**

```
bar_high_r[i]  = (high[i]  − array_base_price) / plannedRiskPrice   // favorable extreme of bar i
bar_low_r[i]   = (array_base_price − low[i])   / plannedRiskPrice   // adverse magnitude of bar i (positive)
bar_close_r[i] = (close[i] − array_base_price) / plannedRiskPrice   // signed close of bar i
```

**SHORT (SELL):**

```
bar_high_r[i]  = (array_base_price − low[i])   / plannedRiskPrice   // favorable extreme of bar i
bar_low_r[i]   = (high[i] − array_base_price) / plannedRiskPrice   // adverse magnitude of bar i (positive)
bar_close_r[i] = (array_base_price − close[i]) / plannedRiskPrice  // signed close of bar i
```

**Post-exit arrays** (`post_exit_bar_high_r`, `post_exit_bar_low_r`, `post_exit_bar_close_r`) use the **same per-bar formula**, appended after the trade closes during the configured post-exit window (hours or N candles).

### Answers to sub-questions

1. **Intended meaning:** Per-bar H/L/C in R units — **not** cumulative running envelopes in the journal payload.
2. **Arrays are not monotonic by design** — values can decrease bar-to-bar when price pulls back.

### Why the test CSV looked monotonic

The file was produced by `chart v 1.4/chart/scripts/generate_200_trades_full_csv.py`, which **incorrectly** built running envelopes (`peak_fav = max(peak_fav, fav)`). That is a **generator bug**, not chart behavior.

### Dashboard display vs stored export

The analytics UI applies `runningMax()` when building path visuals:

**Source:** `homepage/src/app/dashboard/analytics/priceBehaviorUtils.ts` → `buildExcursionSeries`

```
stored journal export  →  per-bar H/L/C in R
dashboard path cloud   →  runningMax(per-bar arrays) computed in-app
```

### Page 5 vs Page 10 (What-If)

| Use case | Per-bar arrays sufficient? |
|----------|---------------------------|
| **Page 5** — excursion cards, path cloud, MFE/MAE bands, post-exit views | **Yes** — recompute running envelopes in-app |
| **Page 10** — fixed TP/SL replay | **Yes** — find first bar where favorable extreme crosses new TP vs adverse crosses new SL |
| **Page 10** — trailing stop / partial TP with intrabar sequencing | **Partial** — per-bar H/L gives bar extremes but not whether high or low came first within the bar |

**Not stored today:** `bar_open_r[]`. Can be added alongside existing arrays if full intrabar fidelity is needed later.

**Not blocking Page 5.** Page 10 fixed TP/SL can proceed on per-bar data; trailing needs additional spec beyond running envelopes alone.

---

## Q2 — Scalar `mfe_r` / `total_mfe_r` don't match the envelope arrays

### Chart semantics

| Field | Definition | When populated |
|-------|------------|----------------|
| `mfe_r` | `max(bar_high_r)` — **in-trade only** | At close; refreshed after post-exit without replacing in-trade scalar with post-exit values |
| `mae_r` | `-max(bar_low_r)` — in-trade, **negative sign** (adverse) | At close |
| `total_mfe_r` | `max(in-trade MFE R, post-exit MFE R)` | After post-exit tracking window completes |
| `mae_points` / `mfe_points` | Worst / best **price** during in-trade window | At close |

**Source of truth:** `bar_high_r` and `bar_low_r` arrays. Scalars are derived in `_finalizeExcursionScalars` (max of arrays, with price-extreme fallback only when arrays are empty/incomplete).

### Why 25/200 trades disagreed in the test CSV

The synthetic generator set `mfe_r` from independent price math while `bar_high_r` was built as a separate running envelope. **`max(bar_high_r) ≠ mfe_r` is not expected on real chart trades** after `_finalizeExcursionScalars`.

### Recommendation

- **Arrays win.** Recompute `mfe_r = max(bar_high_r)` in-app when scalar disagrees.
- `total_mfe_r` should use `max(max(bar_high_r), max(post_exit_bar_high_r))` after post-exit window.

---

## Q3 — The signed close dips below the adverse envelope

### Chart invariant (same bar, same OHLC candle)

For a **LONG** on bar `i`:

- `bar_low_r[i]` = adverse magnitude from the bar's **low** (positive scalar)
- `bar_close_r[i]` = signed close in R

Since `low ≤ close ≤ high` on the same candle:

```
bar_close_r[i]  ≥  −bar_low_r[i]
```

(Close cannot be more adverse than the bar's low on the same OHLC bar.)

Mirror the logic for **SHORT**.

### Why 43/200 trades violated this in the test CSV

The synthetic generator built `bar_close_r` and `bar_low_r` from **independent random paths**, not one coherent OHLC series per bar. **This is a generator artifact.**

### Real chart caveats (rare edge cases)

- **Entry bar excluded** — excursion snapshots skip the fill candle (`currentCandle.t !== position.openTime`).
- **Background / off-chart positions** — bar snapshots were historically missing for non-active-chart legs; fixed in recent `order-manager` updates.
- **Post-exit arrays** are separate from in-trade arrays — do not index them as one continuous series without concatenation logic.

On clean in-trade chart data, Q3 violations should not occur.

---

## Q4 — `capture_ratio` scale and definition

### Chart formula (after post-exit window completes)

```
capture_ratio = rMultiple / total_mfe_r
```

| Component | Meaning |
|-----------|---------|
| `rMultiple` | **Signed** realized R = `netPnL / originalRiskAmount` |
| `total_mfe_r` | Max favorable R across in-trade + post-exit window |
| Scale | **Fraction** (0.65 = 65%), **not** percent 0–100 |

**Source:** `order-manager.js` → `updateMfeMaeTracking` (M4-3 derived metrics block)

### Related derived fields

| Field | Formula |
|-------|---------|
| `management_gap` | `max(bar_high_r) − rMultiple` (in-trade MFE minus realized R) |
| `exit_timing_gap` | `max(post_exit_bar_high_r)` — favorable R available after exit |
| `would_have_won` | `rMultiple ≤ 0` AND post-exit favorable R > 0 |
| `exit_confirmed` | post-exit adverse R > post-exit favorable R |

### Interpretation by trade outcome

| Outcome | Typical `capture_ratio` |
|---------|-------------------------|
| Winner | `0 … 1` (captured R vs total available favorable R) |
| Loser | **Negative** (negative R ÷ positive `total_mfe_r`) |
| Breakeven | ~0 |

**Not bounded to [0, 1]** when signed R is negative. Values **> 1 on losers** in the test CSV came from the generator using `abs(rMultiple) / mfe_r`, which is incorrect.

### UI recommendation

- Display as fraction; optionally multiply by 100 for "%" labels.
- For losers: show ≤ 0 or exclude from "efficiency" leaderboards — do not treat as >100% capture.
- **Recompute from arrays in-app** rather than trusting stored `capture_ratio` on legacy or synthetic rows.

---

## Summary for ingest team

| Q | Decision |
|---|----------|
| **Q1** | Production = **per-bar OHLC in R**. CSV monotonicity = generator bug. Fixed TP/SL What-If is fine on per-bar data; trailing needs more spec. |
| **Q2** | **Arrays win.** Scalars = `max(bar arrays)`. |
| **Q3** | Close vs envelope must agree on real data. CSV violations = generator artifact. |
| **Q4** | `signed rMultiple / total_mfe_r`, fraction scale. Recompute in-app. |

---

## Field collection reference — what the chart actually saves

### Collected at close (typical single trade)

`tradeId`, `ticker`, `direction` (BUY/SELL), `setup`, `entryPrice`, `exitPrice`, `stopLoss`, `takeProfit`, `initial_sl`, `quantity`, `riskAmount`, `originalRiskAmount`, `netPnL`, `rMultiple`, `rewardToRiskRatio` (magnitude), `closeType`, `status`, `mfe`, `mae`, `mfe_r`, `mae_r`, `mae_points`, `mfe_points`, `highestPrice`, `lowestPrice`, `bar_high_r[]`, `bar_low_r[]`, `bar_close_r[]`, `spread_pips_at_entry`, `commission_at_entry`, `pip_value_at_entry`, `holdingTimeMs`, `holdingTimeHours`, `dayOfWeek`, `hourOfEntry`, `hourOfExit`, `month`, `year`, `array_base_price`, `balance_at_creation`, `balance_at_exit`, `trading_session_id`, `rulesFollowed` (if post-trade modal filled), `hasPartialCloses`, `hasMultipleTakeProfits` (when applicable)

### Filled after post-exit window (async)

`post_exit_bar_high_r[]`, `post_exit_bar_low_r[]`, `post_exit_bar_close_r[]`, `total_mfe_r`, `capture_ratio`, `management_gap`, `exit_timing_gap`, `would_have_won`, `exit_confirmed`, `post_checkpoints[]`

### Alias / derived (dashboard CSV names ≠ journal keys)

| CSV / dashboard column | Chart journal field |
|------------------------|---------------------|
| `plannedRR` | `plannedRRAtEntry` |
| `durationMinutes` | derived from `holdingTimeMs` |
| `direction` LONG/SHORT | `type` BUY/SELL |
| `closeTime` ISO | `closeTime` / `exitTime` (ms in journal) |

### Dashboard-only (not from chart journal)

| Column | Source |
|--------|--------|
| `sourceSessionName` | Dashboard session metadata when merging trades |

### Rich journal fields not in 62-column test CSV

`strategy_variables`, `post_strategy_variables`, `preTradeNotes`, `postTradeNotes`, `tags`, `entryScreenshot`, `exitScreenshot`, `railScreenshots`, `partialCloses[]`, `sl_modifications[]`, `trail_sl_path[]`, `mfeTime`, `maeTime`, `savedAt`, `instrument_settings`, split/scaled aggregate blocks, etc.

See also: `docs/trade-input-data-catalog.md`

---

## Conventions (post excursion fix, 2026)

| Field | Convention |
|-------|------------|
| `mfe_r` | ≥ 0 (favorable R magnitude) |
| `mae_r` | ≤ 0 (adverse R — **negative sign**) |
| `mae_points` | Worst price during in-trade window |
| `mfe_points` | Best price during in-trade window |
| `rMultiple` | Signed: `netPnL / originalRiskAmount` |
| `rewardToRiskRatio` | Magnitude only: `|netPnL| / risk` |
| `bar_high_r` / `bar_low_r` | Per-bar extremes (positive magnitudes for H/L legs) |
| `bar_close_r` | Signed close path |

Analytics import normalizes legacy positive `mae_r` to negative in `normalization.py`.

---

## Recommendations for analytics ingest

1. **Page 5 path cards:** Load `bar_high_r`, `bar_low_r`, `bar_close_r` (+ post-exit arrays). Apply `runningMax()` in-app for envelope visuals.
2. **Scalars:** Recompute `mfe_r`, `mae_r`, `capture_ratio` from arrays when stored scalars disagree.
3. **Test data:** Regenerate `200_trades_full.csv` with per-bar OHLC-consistent paths before using for path-invariant QA.
4. **Production data:** Prefer session journal JSON export (`buildMilestone4ExportSnapshot` / `exportTradesToJSON`) over flat CSV for bar-array fidelity.
5. **What-If (later):** Per-bar H/L is available; document that trailing-stop simulation needs intrabar ordering spec beyond stored fields.

---

## Files referenced

| Topic | Path |
|-------|------|
| Bar R calculation | `chart v 1.4/chart/modules/order-manager.js` |
| Excursion scalar finalization | `_finalizeExcursionScalars`, `_deriveExcursionRFromPriceExtremes` |
| Post-exit derived metrics | `updateMfeMaeTracking` |
| Path cloud running envelopes | `homepage/src/app/dashboard/analytics/priceBehaviorUtils.ts` |
| Analytics normalization | `homepage/src/app/dashboard/analytics/backend/analytics_core/normalization.py` |
| Synthetic test generator (known bugs) | `chart v 1.4/chart/scripts/generate_200_trades_full_csv.py` |
| Trade field catalog | `docs/trade-input-data-catalog.md` |

---

## Changelog

| Date | Note |
|------|------|
| 2026-07-01 | Initial answers document — Q1–Q4 aligned with chart semantics vs synthetic CSV limitations |
