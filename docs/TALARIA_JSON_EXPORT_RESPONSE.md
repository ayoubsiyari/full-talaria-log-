# Talaria — Chart Dev Response: Real Session JSON Export

**Re:** `TALARIA_DEV_REQUEST_json_export.md`  
**From:** chart dev  
**To:** dashboard / analytics  
**Status:** Acknowledged — no collection changes needed; awaiting one real session export

---

## TL;DR

**Agreed.** Your request is correct: the `200_trades_full.csv` from `generate_200_trades_full_csv.py` is **not** valid for path/scalar reconciliation QA (running envelopes, independent close paths, wrong `capture_ratio`). Use a genuine **`exportTradesToJSON`** payload from an actual chart session instead.

**Nothing changes on our side for data collection.** Export already exists. We need to run one backtest session with 50+ closed trades, let post-exit windows finish where possible, and send you the downloaded JSON file.

---

## What we'll send

One file produced by the chart UI:

```
trade_journal_YYYY-MM-DD.json
```

Built by `buildMilestone4ExportSnapshot()` → `exportTradesToJSON()` in `chart v 1.4/chart/modules/order-manager.js`.

### Ideal session profile

| Criterion | Target |
|-----------|--------|
| Closed trades | **50+** (more is fine) |
| Outcomes | Mix of winners and losers |
| `closeType` | Mix of TP, SL, Manual, BE, Trailing SL |
| Post-exit fields | Most trades with completed post-exit window (`total_mfe_r`, `capture_ratio`, `would_have_won`, etc.) |
| Pending post-exit | A few still pending is OK — we want to see both states |
| Bonus | Some trades with `trail_sl_path[]` and/or `partialCloses[]` for future What-If ground truth |

---

## How to produce it (chart dev steps)

### 1. Start a backtest session

1. Open the chart (`/chart/` — V9 live build).
2. Start a **multi-instrument backtest** session (or single-instrument with enough activity).
3. Use a timeframe where trades can open and close at reasonable speed (e.g. 5m–1H).
4. Run replay until **50+ trades are closed** in the journal.

### 2. Let post-exit tracking complete

Post-exit arrays and derived metrics (`total_mfe_r`, `capture_ratio`, `would_have_won`, `exit_confirmed`, etc.) are filled **asynchronously** after each trade closes, during the configured post-exit window (N candles or hours).

- **Keep replay running** for a while after the last close so post-exit bars accumulate.
- Trades closed near the end of the replay may still have **empty or partial** post-exit arrays — that's fine; include a mix.

### 3. Export JSON

1. Open the **All Trades** table (journal modal).
2. Click **Export to JSON** (`exportJSONBtn`).
3. Save the downloaded `trade_journal_YYYY-MM-DD.json`.
4. Share that file with analytics (attach to repo under `docs/fixtures/` or send directly).

**Do not** use:

- `generate_200_trades_full_csv.py` output
- Analytics CSV export buttons (different shape; may omit full journal fields)
- Hand-edited or merged files

---

## JSON payload structure

Top-level object from `buildMilestone4ExportSnapshot()`:

```json
{
  "session_summary": { ... },
  "instruments": { ... },
  "per_instrument_stats": { ... },
  "journal_by_ticker": { ... },
  "trades": [ ... ]
}
```

### `session_summary`

| Field | Description |
|-------|-------------|
| `session_id` | Backtest session id |
| `account_currency` | e.g. `USD` |
| `leverage`, `margin_call_level`, `stop_out_level` | Account settings |
| `max_risk_per_trade_pct` | Session risk cap |
| `start_balance`, `current_balance` | Replay balances |

### `instruments`

Per-ticker instrument config (spread, commission, pip value, asset class, etc.) keyed by normalized ticker (`EURUSD`, `GBPUSD`, …).

### `per_instrument_stats`

Aggregates per ticker: trade count, win rate, net P&L, avg RR, avg MAE/MFE in R.

### `journal_by_ticker`

Same trade objects as `trades`, grouped by ticker — convenience for replay UI; **not a second source of truth**.

### `trades[]` — what analytics needs per trade

Each element is a full journal row (same object stored in `tradeJournal`).

#### Path arrays (canonical for Page 5)

| Field | Semantics |
|-------|-----------|
| `bar_high_r[]` | **Per-bar** favorable extreme in R (not running envelope) |
| `bar_low_r[]` | **Per-bar** adverse magnitude in R (positive scalar per bar) |
| `bar_close_r[]` | **Per-bar** signed close in R |
| `post_exit_bar_high_r[]` | Same formula, post-exit window |
| `post_exit_bar_low_r[]` | Same formula, post-exit window |
| `post_exit_bar_close_r[]` | Same formula, post-exit window |

**Base:** `array_base_price` (first fill)  
**Risk denominator:** `|array_base_price − initial_sl|`  
**Direction:** `type` = `BUY` | `SELL` (dashboard maps to LONG/SHORT)

#### Scalars & derived (reconcile against arrays)

| Field | Definition |
|-------|------------|
| `mfe_r` | `max(bar_high_r)` — in-trade only, ≥ 0 |
| `mae_r` | `-max(bar_low_r)` — in-trade, ≤ 0 (negative sign) |
| `total_mfe_r` | `max(max(bar_high_r), max(post_exit_bar_high_r))` after post-exit window |
| `capture_ratio` | `rMultiple / total_mfe_r` — **fraction**, signed (losers negative) |
| `management_gap` | `max(bar_high_r) − rMultiple` |
| `exit_timing_gap` | `max(post_exit_bar_high_r)` |
| `would_have_won` | `rMultiple ≤ 0` AND post-exit favorable R > 0 |
| `exit_confirmed` | post-exit adverse R > post-exit favorable R |

#### Core trade fields

| Field | Notes |
|-------|-------|
| `tradeId` / `id` | Trade identifier |
| `ticker` / `symbol` | Instrument |
| `type` | `BUY` or `SELL` |
| `openPrice`, `openTime` | Entry |
| `closePrice`, `closeTime` / `exitTime` | Exit |
| `stopLoss`, `takeProfit`, `initial_sl` | SL/TP; `initial_sl` frozen at entry |
| `array_base_price` | R-array base |
| `netPnL`, `rMultiple` | Signed P&L and R |
| `originalRiskAmount`, `riskAmount` | Risk sizing |
| `closeType` | TP, SL, Manual, BE, Trailing SL, etc. |
| `mae_points`, `mfe_points` | Worst / best price during in-trade window |
| `highestPrice`, `lowestPrice` | Price extremes |

#### Optional but valuable for What-If later

| Field | Use |
|-------|-----|
| `partialCloses[]` | Partial TP legs — price, time, bar index |
| `trail_sl_path[]` | Per-bar trailing stop history |
| `sl_modifications[]` | SL change audit log |
| `hasPartialCloses`, `hasMultipleTakeProfits` | Flags |
| `post_checkpoints[]` | Post-exit checkpoint snapshots |
| `plannedRRAtEntry` | Dashboard alias: `plannedRR` |

Full field catalog: `docs/trade-input-data-catalog.md`

---

## Invariants analytics should pass on real data

On a valid chart export, these should hold for **in-trade** bars (same OHLC candle):

**LONG (`type === 'BUY'`):**

```
bar_close_r[i] ≥ −bar_low_r[i]
```

**SHORT (`type === 'SELL'`):** mirrored.

**Scalars vs arrays:**

```
mfe_r ≈ max(bar_high_r)
|mae_r| ≈ max(bar_low_r)
total_mfe_r ≈ max(max(bar_high_r), max(post_exit_bar_high_r))   // when post-exit complete
capture_ratio ≈ rMultiple / total_mfe_r                         // when total_mfe_r > 0
```

**Arrays are not monotonic** — per-bar values can decrease when price pulls back. The dashboard computes `runningMax()` in-app for envelope visuals only (`priceBehaviorUtils.ts` → `buildExcursionSeries`).

If any of the above fail on the JSON export, that indicates a chart bug — not expected on production journal data.

---

## Dashboard field mapping (your side — no chart changes)

| JSON (chart) | Dashboard / CSV |
|--------------|-----------------|
| `type` `BUY`/`SELL` | `direction` LONG/SHORT |
| `plannedRRAtEntry` | `plannedRR` |
| `holdingTimeMs` | `durationMinutes` (÷ 60000) |
| `closeTime` / `exitTime` (ms) | ISO `closeTime` |
| `mae_r` (negative) | normalize legacy positive rows in `normalization.py` |

We do not need you to rename fields in the chart journal.

---

## What we are NOT doing (per your request)

- No changes to how data is collected or stored
- No new fields (per-bar `open` deferred until What-If needs it)
- No more synthetic CSV as a validation fixture

---

## Known bad fixture (do not use)

| Artifact | Problem |
|----------|---------|
| `docs/200_trades_full.csv` / `generate_200_trades_full_csv.py` | Running envelopes in `bar_high_r`/`bar_low_r`; independent `bar_close_r`; `capture_ratio = abs(r)/mfe_r` |

See: `docs/TALARIA_FULL_EXPORT_QUESTIONS_ANSWERED.md`

---

## Delivery checklist (chart dev before handoff)

- [ ] JSON from **Export to JSON** button (not CSV generator)
- [ ] `trades.length` ≥ 50
- [ ] Mix of wins/losses and close types
- [ ] Spot-check 3 trades: `max(bar_high_r) === mfe_r`, close within adverse envelope
- [ ] Majority of trades have non-empty `post_exit_bar_*` arrays
- [ ] At least 1–2 trades with `partialCloses` or `trail_sl_path` if available
- [ ] File placed in repo or shared with analytics team

### Interim QA fixtures (repo)

Until a live backtest export is available, chart-shaped fixtures with **correct per-bar semantics** live in `docs/fixtures/`:

| File | Trades |
|------|--------|
| `trade_journal_qa_200.json` | 200 |
| `trade_journal_qa_50.json` | 50 |

Generated by `chart v 1.4/chart/scripts/generate_milestone4_json_export.py` — same `buildMilestone4ExportSnapshot` shape, validated invariants. Not a substitute for a real replay session long-term, but usable for dashboard import QA now.

---

## One line

Run a backtest to 50+ closes, let post-exit windows run, click **Export to JSON** in the All Trades modal, send us the file — we'll take it from there.

---

## Source references

| Topic | Path |
|-------|------|
| Export snapshot | `chart v 1.4/chart/modules/order-manager.js` → `buildMilestone4ExportSnapshot`, `exportTradesToJSON` |
| Per-bar R math | `_calculateExcursionRValues`, `_appendExcursionSnapshot` |
| Scalar finalization | `_finalizeExcursionScalars` |
| Post-exit derived metrics | `updateMfeMaeTracking` |
| Field catalog | `docs/trade-input-data-catalog.md` |
| Export Q&A | `docs/TALARIA_FULL_EXPORT_QUESTIONS_ANSWERED.md` |

---

## Changelog

| Date | Note |
|------|------|
| 2026-07-01 | Initial response — acknowledges analytics request, documents export path and schema |
