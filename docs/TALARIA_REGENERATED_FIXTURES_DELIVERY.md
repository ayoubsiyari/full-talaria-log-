# Talaria — Regenerated JSON Fixtures: Delivery & Validation

**Re:** `TALARIA_REQUEST_regenerated_fixtures.md`  
**From:** chart dev  
**To:** dashboard / analytics  
**Date:** 2026-07-01

---

## TL;DR

The three regenerated fixture files are **in the repo** (and bundled in a zip). They pass all six checks from your re-validation list. Pull from `docs/fixtures/` or use the zip below.

---

## Files delivered

| File | Trades | Size | MD5 |
|------|--------|------|-----|
| `docs/fixtures/trade_journal_qa_200.json` | 200 | 2,401,686 bytes | `64cd6167302a154c9a1ef0e210ce73d1` |
| `docs/fixtures/trade_journal_qa_50.json` | 50 | 581,547 bytes | `b1d6d143ceefa6171f5eeb357b16c1d3` |
| `docs/fixtures/trade_journal_2026-07-01.json` | 200 | 2,401,686 bytes | `64cd6167302a154c9a1ef0e210ce73d1` |

`trade_journal_2026-07-01.json` is a **byte-identical copy** of `trade_journal_qa_200.json`.

**Zip (all three):** [`docs/fixtures/talaria_regenerated_fixtures_2026-07-01.zip`](fixtures/talaria_regenerated_fixtures_2026-07-01.zip)

**Generator (if you want to reproduce):**

```bash
py "chart v 1.4/chart/scripts/generate_milestone4_json_export.py" 200
py "chart v 1.4/chart/scripts/generate_milestone4_json_export.py" 50
```

Post-fix commit should include these paths. Clone/pull the branch that contains `docs/fixtures/` to get the files.

---

## Your re-check list — our results (run on actual files)

We ran the same invariants on the **on-disk JSON**, not from the fix write-up alone.

### 1. SHORT invariant = 0 violations

`−bar_low_r[i] ≤ bar_close_r[i] ≤ bar_high_r[i]` for every SELL trade, in-trade **and** post-exit.

| File | SHORT violations |
|------|------------------|
| `qa_200` | **0 / 105** |
| `qa_50` | **0 / 24** |
| `2026-07-01` | **0 / 105** |

### 2. LONG invariant = 0 violations (regression)

| File | LONG violations |
|------|-----------------|
| `qa_200` | **0 / 95** |
| `qa_50` | **0 / 26** |
| `2026-07-01` | **0 / 95** |

### 3. Short winners sane

`mfe_r > 0`, `mae_r ≤ 0`, `0 ≤ capture_ratio ≤ 1` for winning shorts.

| File | Short winners failing |
|------|----------------------|
| `qa_200` | **0** (46 winners checked) |
| `qa_50` | **0** (8 winners checked) |

**Example short winner `22054` (200-file):** `rMultiple = +2.85`, `mfe_r = 3.25`, `mae_r = −0.31`, `capture_ratio = 0.82`.

### 4. Scalars derive from arrays

`max(bar_high_r) == mfe_r`, `max(bar_low_r) == |mae_r|`, both directions.

| File | Mismatches |
|------|------------|
| All three | **0** |

### 5. Derived fields reconcile

Where post-exit is complete: `total_mfe_r = max(in-trade MFE, post-exit MFE)`, `capture_ratio = rMultiple / total_mfe_r`.

| File | Derived mismatches |
|------|-------------------|
| `qa_200` | **0** (194 complete) |
| `qa_50` | **0** (44 complete) |

**Pending post-exit (last 6 trades per file):** empty `post_exit_bar_*` arrays; `capture_ratio`, `exit_timing_gap`, `would_have_won`, `exit_confirmed` are **null** (not zeroed).

### 6. Richer fields present

| File | `partialCloses[]` | `trail_sl_path[]` | Pending post-exit |
|------|-------------------|-------------------|-------------------|
| `qa_200` | 50 | 17 | 6 |
| `qa_50` | 11 | 5 | 6 |
| `2026-07-01` | 50 | 17 | 6 |

### Session profile (`qa_200`)

| Metric | Value |
|--------|-------|
| BUY / SELL | 95 / 105 |
| Wins / losses | 98 / 102 |
| `closeType` | TP 44, SL 41, Manual 32, BE 48, Trailing SL 17, STOP_OUT 18 |
| Instruments | EURUSD, GBPUSD, USDJPY, XAUUSD, NQ |

---

## What changed vs pre-fix fixtures

- **SHORT H/L convention fixed** in `generate_200_trades_full_csv.py` (shared bar-path logic).
- **Direction-agnostic validation** in `generate_milestone4_json_export.py` — pre-write check fails if shorts are swapped.
- **Trade IDs and outcomes shifted** because bar-path logic changed; do not diff against the old broken files by trade ID.

---

## Dashboard import reminder

**Do not swap `bar_high_r` ↔ `bar_low_r` for SELL on import.** These fixtures now match real chart semantics; swapping would break live `exportTradesToJSON` data.

---

## Gold standard (unchanged)

Synthetic fixtures are cleared for interim Page 5 QA. A real `exportTradesToJSON` from backtest replay still supersedes these when available — does not block you now.

---

## Related docs

| Doc | Purpose |
|-----|---------|
| [`TALARIA_ANALYTICS_HANDOFF_RESPONSE.md`](TALARIA_ANALYTICS_HANDOFF_RESPONSE.md) | Full Q1–Q4 + bug fix + ingest guide |
| [`fixtures/README.md`](fixtures/README.md) | Fixture semantics & regen commands |
| [`TALARIA_JSON_EXPORT_RESPONSE.md`](TALARIA_JSON_EXPORT_RESPONSE.md) | Real export how-to |

---

## One line

Pull `docs/fixtures/trade_journal_qa_200.json`, `trade_journal_qa_50.json`, and `trade_journal_2026-07-01.json` (or the zip) — all six of your checks pass on the actual files.
