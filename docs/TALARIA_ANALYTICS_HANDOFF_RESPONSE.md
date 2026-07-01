# Talaria — Detailed Analytics Handoff Response

**To:** dashboard / analytics team  
**From:** chart dev  
**Date:** 2026-07-01  
**Covers:**

- `TALARIA_FULL_EXPORT_QUESTIONS.md` — per-bar arrays, scalars, capture ratio (Q1–Q4)
- `TALARIA_DEV_REQUEST_json_export.md` — real session JSON for validation
- `TALARIA_FIXTURE_BUG_short_swap.md` — SHORT `bar_high_r` / `bar_low_r` swap in QA fixtures

---

## Executive summary

| Topic | Status |
|-------|--------|
| **Chart data model** | No changes needed on your side for field collection — adapt import to chart conventions |
| **Synthetic CSV (`200_trades_full.csv`)** | **Do not use** for path/scalar QA — generator bugs (running envelopes, wrong capture, later SHORT swap) |
| **JSON QA fixtures** | **Delivered** in `docs/fixtures/` — chart-shaped, invariant-validated, 50- and 200-trade sets |
| **SHORT excursion bug** | **Fixed** — all SHORT trades now reconcile; do **not** swap legs on import |
| **Real backtest export** | Still the long-term gold standard; fixtures are usable for Page 5 wiring now |

**Bottom line:** Use `docs/fixtures/trade_journal_qa_200.json` (or `_50`) as your validation fixture. Treat `bar_*_r` arrays as canonical; recompute running envelopes in-app for path-cloud visuals only.

---

## Part 1 — Answers to full export questions (Q1–Q4)

### Q1 — `bar_high_r` / `bar_low_r`: running envelopes or per-bar candle extremes?

**Production chart: per-bar candle extremes in R — not running envelopes.**

Each open bar appends that bar's own high, low, and close converted to R. Values **can decrease** bar-to-bar when price pulls back. The dashboard applies `runningMax()` **in-app for display only** (`priceBehaviorUtils.ts` → `buildExcursionSeries`).

**Source:** `chart v 1.4/chart/modules/order-manager.js` → `_calculateExcursionRValues`

**Base:** `array_base_price` (first fill)  
**Risk:** `|array_base_price − initial_sl|`

**LONG (`type: BUY`):**

```
bar_high_r[i]  = (high[i]  − array_base_price) / risk   // favorable extreme (positive)
bar_low_r[i]   = (array_base_price − low[i])   / risk   // adverse magnitude (positive)
bar_close_r[i] = (close[i] − array_base_price) / risk   // signed close
```

**SHORT (`type: SELL`):**

```
bar_high_r[i]  = (array_base_price − low[i])   / risk   // favorable extreme (positive)
bar_low_r[i]   = (high[i] − array_base_price) / risk   // adverse magnitude (positive)
bar_close_r[i] = (array_base_price − close[i]) / risk  // signed close (positive = price down)
```

**Post-exit arrays** use the same per-bar formula after close.

| Use case | Per-bar arrays sufficient? |
|----------|---------------------------|
| Page 5 — path cloud, MFE/MAE bands, post-exit views | **Yes** — compute running envelopes in-app |
| Page 10 — fixed TP/SL What-If | **Yes** — first bar favorable crosses TP vs adverse crosses SL |
| Page 10 — trailing stop / partial TP with intrabar order | **Partial** — need intrabar sequencing spec; `bar_open_r[]` not stored today |

**Why the original CSV looked monotonic:** `generate_200_trades_full_csv.py` initially emitted running maxima (`peak_fav = max(peak_fav, fav)`). That was a generator bug, not chart behavior.

---

### Q2 — Scalar `mfe_r` / `total_mfe_r` vs envelope arrays

| Field | Definition |
|-------|------------|
| `mfe_r` | `max(bar_high_r)` — **in-trade only**, ≥ 0 |
| `mae_r` | `-max(bar_low_r)` — in-trade, **≤ 0** (negative sign) |
| `total_mfe_r` | `max(max(bar_high_r), max(post_exit_bar_high_r))` after post-exit window |

**Source of truth: arrays.** Scalars are derived in `_finalizeExcursionScalars`. On real chart trades, `max(bar_high_r) ≠ mfe_r` should not persist after finalization.

**Your action:** If stored scalars disagree with arrays, recompute in-app:

```
mfe_r  = max(bar_high_r)
mae_r  = -max(bar_low_r)
total_mfe_r = max(max(bar_high_r), max(post_exit_bar_high_r))
```

---

### Q3 — Signed close vs adverse envelope

**Chart invariant (same OHLC bar, both directions after correct H/L assignment):**

```
−bar_low_r[i]  ≤  bar_close_r[i]  ≤  bar_high_r[i]
```

Close cannot be more adverse than the bar's low (LONG) or more favorable than the bar's high leg allows. Mirror logic holds for SHORT once `bar_high_r` = favorable and `bar_low_r` = adverse.

Violations in the **original** synthetic CSV came from independent random paths for close vs H/L. **Fixed** in current generator and JSON fixtures.

**Real-chart caveats (rare):**

- Entry/fill candle excluded from excursion snapshots
- Post-exit arrays are separate — concatenate explicitly, don't index as one series

---

### Q4 — `capture_ratio` scale and definition

```
capture_ratio = rMultiple / total_mfe_r
```

| Component | Meaning |
|-----------|---------|
| `rMultiple` | **Signed** realized R = `netPnL / originalRiskAmount` |
| `total_mfe_r` | Max favorable R across in-trade + post-exit window |
| Scale | **Fraction** (0.65 = 65%), not 0–100 |

**Related derived fields (post-exit window complete):**

| Field | Formula |
|-------|---------|
| `management_gap` | `max(bar_high_r) − rMultiple` |
| `exit_timing_gap` | `max(post_exit_bar_high_r)` |
| `would_have_won` | `rMultiple ≤ 0` AND post-exit favorable R > 0 |
| `exit_confirmed` | post-exit adverse R > post-exit favorable R |

| Outcome | Typical `capture_ratio` |
|---------|-------------------------|
| Winner | `0 … 1` |
| Loser | **Negative** (negative R ÷ positive `total_mfe_r`) |
| Breakeven | ~0 |

**Not bounded to [0, 1]** when signed R is negative. Original CSV used `abs(rMultiple) / mfe_r` on losers — wrong.

**UI:** Show as fraction; for losers show ≤ 0 or exclude from efficiency leaderboards.

---

## Part 2 — JSON export request: what we delivered

You asked for one real `exportTradesToJSON` session with 50+ closed trades. A live backtest export is still the gold standard; **in the meantime we delivered chart-shaped JSON fixtures** that match `buildMilestone4ExportSnapshot()` and pass the same invariants real data should satisfy.

### Files (repo)

| File | Trades | Size (approx.) | Purpose |
|------|--------|----------------|---------|
| [`docs/fixtures/trade_journal_qa_200.json`](fixtures/trade_journal_qa_200.json) | 200 | ~2.4 MB | Primary validation — distributions, path cards |
| [`docs/fixtures/trade_journal_qa_50.json`](fixtures/trade_journal_qa_50.json) | 50 | ~600 KB | Smoke-test import |
| [`docs/fixtures/trade_journal_2026-07-01.json`](fixtures/trade_journal_2026-07-01.json) | 200 | ~2.4 MB | Dated copy of 200-trade set |

### Top-level shape (matches chart export)

```json
{
  "session_summary": { "session_id", "start_balance", "current_balance", ... },
  "instruments": { "EURUSD": { "spread_pips", "commission_per_lot_per_side", ... }, ... },
  "per_instrument_stats": { "EURUSD": { "trade_count", "win_rate", "net_pnl", ... }, ... },
  "journal_by_ticker": { "EURUSD": [ /* same trade objects */ ], ... },
  "trades": [ /* full journal rows */ ]
}
```

### 200-trade fixture profile (current, post-fix)

| Metric | Value |
|--------|-------|
| Total trades | 200 |
| BUY / SELL | 95 / 105 |
| Wins / losses | 98 / 102 |
| `closeType` mix | TP 44, SL 41, Manual 32, BE 48, Trailing SL 17, STOP_OUT 18 |
| Post-exit complete | 194 |
| Pending post-exit (last 6 trades) | 6 — empty `post_exit_bar_*`, null derived fields |
| `partialCloses[]` | 50 trades |
| `trail_sl_path[]` | 17 trades |
| Instruments | EURUSD, GBPUSD, USDJPY, XAUUSD, NQ |

### Per-trade fields included

**Path (canonical):** `bar_high_r[]`, `bar_low_r[]`, `bar_close_r[]`, `post_exit_bar_*[]`  
**Scalars:** `mfe_r`, `mae_r`, `total_mfe_r`, `mae_points`, `mfe_points`  
**Derived:** `capture_ratio`, `management_gap`, `exit_timing_gap`, `would_have_won`, `exit_confirmed`  
**Core:** `type` (BUY/SELL), `openPrice`, `closePrice`, `stopLoss`, `initial_sl`, `array_base_price`, `rMultiple`, `netPnL`, `originalRiskAmount`, `closeType`, `openTime`, `closeTime` (ms), `plannedRRAtEntry`, etc.

### How to produce a real export later (chart UI)

1. Run backtest until 50+ closes; keep replay running so post-exit windows finish.
2. Open **All Trades** journal modal → **Export to JSON**.
3. Output: `trade_journal_YYYY-MM-DD.json` via `exportTradesToJSON()` / `buildMilestone4ExportSnapshot()`.

**Do not use:** `generate_200_trades_full_csv.py` CSV output, analytics CSV buttons, or hand-merged files as path QA ground truth.

### Regenerate fixtures

```bash
py "chart v 1.4/chart/scripts/generate_milestone4_json_export.py" 200
py "chart v 1.4/chart/scripts/generate_milestone4_json_export.py" 50
```

Script runs invariant validation before write; fails if scalars or close-within-envelope checks break.

---

## Part 3 — SHORT excursion bug: report, fix, verification

### What you reported

Every `type: "SELL"` trade in the **first** JSON fixture drop had `bar_high_r` and `bar_low_r` **swapped**:

- Favorable move landed in `bar_low_r` (~large on winners)
- `bar_high_r` stayed ~0 on short winners
- `bar_close_r` was correct (positive on winning shorts)
- Close sat **outside** `[−bar_low_r, bar_high_r]`
- Downstream: `mfe_r ≈ 0`, large negative `mae_r`, wrong `capture_ratio` on ~24/55 short winners

Example from pre-fix file — short winner `22077`, `rMultiple = +2.94`:

```
bar_high_r : [0, 0, 0, ...]              ← should carry favorable move
bar_low_r  : [0.63, 1.34, 1.63, ...]     ← favorable move was here (wrong)
bar_close_r: [0.49, 1.13, 1.28, ...]     ← correct signed path
```

You confirmed swapping H/L on all SELL trades fixed 104/104 shorts in `qa_200`.

### Root cause

**Fixture generator only** — `generate_200_trades_full_csv.py` → `_bar_path()` had a separate SELL branch that inverted favorable vs adverse legs. The live chart (`order-manager.js`) was always correct.

### Fix applied

1. **Removed broken SELL branch.** Both directions now build bars on a signed close path where positive = favorable (up for BUY, down for SELL):

   ```
   bar_high_r = favorable extreme (positive)
   bar_low_r  = adverse magnitude (positive)
   bar_close_r = signed close
   ```

2. **Direction-agnostic validation** in `generate_milestone4_json_export.py`:

   ```
   −bar_low_r[i] ≤ bar_close_r[i] ≤ bar_high_r[i]
   ```

   Applied to in-trade **and** `post_exit_bar_*` arrays. Old validation used a broken SELL-only check that let 100% of shorts pass.

3. **Regenerated** all three fixture files.

### Verification (post-fix, 2026-07-01)

| Check | `qa_200` | `qa_50` |
|-------|----------|---------|
| LONG bar invariant violations | **0 / 95** | **0 / 26** |
| SHORT bar invariant violations | **0 / 105** | **0 / 24** |
| Scalar vs array mismatches | **0** | **0** |
| Short winners with `mfe_r ≈ 0` | **0 / 46** | **0 / 8** |
| `max(bar_high_r) == mfe_r` | ✓ all trades | ✓ all trades |
| `max(bar_low_r) == \|mae_r\|` | ✓ all trades | ✓ all trades |

**Short winner spot-check `22030`:** `rMultiple = +1.56`, `mfe_r = 2.48`, `mae_r = −0.23`, `capture_ratio = 0.63`, `max(bar_high_r) = 2.48`.

**Best short in 200-file `22054`:** `rMultiple = +2.85`, `mfe_r = 3.25`, `capture = 0.82`.

**Note:** Trade IDs and outcomes differ from the pre-fix file because bar-path logic changed. Invariant compliance is what matters for QA, not matching old trade IDs.

### Critical: do NOT compensate on import

The **real chart** stores shorts correctly. If you swap `bar_high_r` ↔ `bar_low_r` for SELL on import:

- Fixed fixtures → correct
- Real `exportTradesToJSON` → **broken** (double swap)

Importer should implement **chart semantics only**, not generator-artifact workarounds.

---

## Part 4 — Dashboard field mapping

| Chart JSON | Dashboard / CSV |
|------------|-----------------|
| `type` `BUY` / `SELL` | `direction` LONG / SHORT |
| `plannedRRAtEntry` | `plannedRR` |
| `holdingTimeMs` | `durationMinutes` (÷ 60000) |
| `openTime` / `closeTime` (ms) | ISO timestamps if needed |
| `mae_r` (negative) | Normalize legacy positive rows in `normalization.py` |

No renames needed on the chart side.

---

## Part 5 — Recommended ingest behavior

1. **Load path arrays:** `bar_high_r`, `bar_low_r`, `bar_close_r` + post-exit arrays.
2. **Path cloud / bands:** `runningMax(per-bar arrays)` in-app — never assume stored arrays are already cumulative.
3. **Scalars:** Prefer recomputing from arrays when stored values disagree.
4. **`capture_ratio`:** Recompute as `rMultiple / total_mfe_r` when missing or suspect; handle losers as ≤ 0.
5. **Pending post-exit:** Last 6 trades in fixtures have empty post-exit arrays — test both complete and pending states.
6. **Validation on import (optional but useful):**

   ```python
   for i, c in enumerate(bar_close_r):
       assert -bar_low_r[i] <= c <= bar_high_r[i]
   assert abs(mfe_r - max(bar_high_r)) < 1e-4
   assert abs(abs(mae_r) - max(bar_low_r)) < 1e-4
   ```

---

## Part 6 — What is still outstanding

| Item | Owner | Notes |
|------|-------|-------|
| Real `exportTradesToJSON` from backtest replay | Chart dev | Gold standard; bypasses all synthetic generator risk |
| Page 10 What-If (trailing / partial) | Both | Per-bar H/L sufficient for fixed TP/SL; intrabar order spec TBD |
| `bar_open_r[]` | Chart (future) | Only if full intrabar fidelity required |

---

## Part 7 — Source references

| Topic | Path |
|-------|------|
| Bar R calculation | `chart v 1.4/chart/modules/order-manager.js` → `_calculateExcursionRValues` |
| Scalar finalization | `_finalizeExcursionScalars` |
| Post-exit derived metrics | `updateMfeMaeTracking` |
| JSON export | `buildMilestone4ExportSnapshot`, `exportTradesToJSON` |
| Path cloud running envelopes | `homepage/src/app/dashboard/analytics/priceBehaviorUtils.ts` |
| Fixture generator | `chart v 1.4/chart/scripts/generate_milestone4_json_export.py` |
| Shared bar-path logic | `chart v 1.4/chart/scripts/generate_200_trades_full_csv.py` |
| Field catalog | `docs/trade-input-data-catalog.md` |
| Q1–Q4 detail | `docs/TALARIA_FULL_EXPORT_ANSWERS.md` |
| JSON export detail | `docs/TALARIA_JSON_EXPORT_RESPONSE.md` |
| Fixture README | `docs/fixtures/README.md` |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-01 | Initial CSV generator bugs documented (Q1–Q4 answers) |
| 2026-07-01 | JSON fixtures delivered (`qa_50`, `qa_200`) |
| 2026-07-01 | SHORT H/L swap fixed; fixtures regenerated; validation hardened |
