# Generated mentor batches — T1 × 10 + T3 × 10

**Generated:** 2026-07-01  
**Script:** `scripts/generate_mentor_t1_t3_batches.py`  
**Seed:** `20260701`

## What was created

| Type | Count | Source kind | Output folder |
|------|-------|-------------|---------------|
| **T1** — Standard backtest | 10 | `backtest` | `mentor data/generated/t1/` |
| **T3** — Live personal journal | 10 | `live_personal` | `mentor data/generated/t3/` |

Each stem produces **two** files:

1. `{stem}_trading_journal_complete.xlsx` — **mentor input** (`Journal` sheet, 30 columns)
2. `{stem}-talaria-adapted.xlsx` — **full dashboard export** (140 columns, same as mentor adapter output)

All adapted trades include **per-bar** `bar_high_r` / `bar_low_r` / `bar_close_r`, post-exit arrays, `mfe_r` / `mae_r`, strategy variables, tags, and source metadata.

## Totals

| Bucket | Trades (approx.) |
|--------|------------------|
| T1 (10 files) | ~2,900 |
| T3 (10 files) | ~2,500 |
| **Combined** | **~5,400** |

See `mentor data/generated/manifest.json` for per-file counts.

## T1 files (standard backtest)

| File stem | Session name | Tickers |
|-----------|--------------|---------|
| `qa_gen_t1_eurusd_scalper` | QA Gen T1 · EURUSD Scalper BT | EURUSD |
| `qa_gen_t1_gbpusd_london` | QA Gen T1 · GBPUSD London BT | GBPUSD |
| `qa_gen_t1_xauusd_swing` | QA Gen T1 · XAUUSD Swing BT | XAUUSD |
| `qa_gen_t1_es_orb` | QA Gen T1 · ES Opening Range BT | ES |
| `qa_gen_t1_nq_vwap` | QA Gen T1 · NQ VWAP Reclaim BT | NQ |
| `qa_gen_t1_btc_liquidity` | QA Gen T1 · BTC Liquidity Sweep BT | BTCUSD |
| `qa_gen_t1_multipair_swing` | QA Gen T1 · Multi-Pair Swing BT | EURUSD, GBPUSD, USDJPY |
| `qa_gen_t1_usdjpy_fade` | QA Gen T1 · USDJPY Carry Fade BT | USDJPY |
| `qa_gen_t1_mixed_fx` | QA Gen T1 · Mixed FX Portfolio BT | EURUSD, GBPUSD, AUDUSD, USDCHF |
| `qa_gen_t1_nq_momentum` | QA Gen T1 · NQ 1m Momentum BT | NQ |

## T3 files (live personal journal)

| File stem | Session name | Tickers |
|-----------|--------------|---------|
| `qa_gen_t3_oanda_personal` | QA Gen T3 · OANDA Personal Live | EURUSD, GBPUSD |
| `qa_gen_t3_mt5_swing` | QA Gen T3 · MT5 Swing Live | EURUSD, USDJPY |
| `qa_gen_t3_gold_live` | QA Gen T3 · Gold Session Live | XAUUSD |
| `qa_gen_t3_es_daytrade` | QA Gen T3 · ES Day Journal Live | ES |
| `qa_gen_t3_nq_scalp` | QA Gen T3 · NQ Scalping Live | NQ |
| `qa_gen_t3_crypto_perps` | QA Gen T3 · Crypto Perps Live | BTCUSD |
| `qa_gen_t3_multi_broker` | QA Gen T3 · Multi-Broker Aggregate Live | EURUSD, GBPUSD, XAUUSD |
| `qa_gen_t3_eur_scalp` | QA Gen T3 · EUR Scalping Live | EURUSD |
| `qa_gen_t3_indices_journal` | QA Gen T3 · Indices Day Journal Live | ES, NQ |
| `qa_gen_t3_discipline_tracker` | QA Gen T3 · Discipline Tracker Live | EURUSD, GBPUSD, USDJPY |

T3 mentor rows include richer `variables_json` (plan review / session mood) so the live-journal discipline synthesizer runs on import.

## Upload to `data@talaria-log.com`

Use the **mentor input** xlsx files with the existing pipeline:

```bash
# T1 — one file example
py scripts/adapt_mentor_xlsx_to_talaria.py "mentor data/generated/t1/qa_gen_t1_eurusd_scalper_trading_journal_complete.xlsx" --upload --session-name "QA Gen T1 · EURUSD Scalper BT"

# Or batch via batch_adapt_mentor_data.py pattern — add stems to a manifest and process_file()
```

For T3 live journals, use `batch_adapt_mentor_data.py` with `source_kind=live_personal` (same as community imports).

**Pre-built adapted xlsx** can also be inspected offline or converted to JSON without re-running the adapter.

## Regenerate

```bash
py scripts/generate_mentor_t1_t3_batches.py
py scripts/generate_mentor_t1_t3_batches.py --seed 20260702 --out "mentor data/generated"
```

## Field parity with real mentor data

| Mentor input column | Populated |
|---------------------|-----------|
| `entry_price`, `exit_price`, `stop_loss`, `take_profit` | Yes |
| `high_price`, `low_price` | Yes (realistic in-trade excursion) |
| `entry_datetime`, `exit_datetime` | Yes |
| `pnl`, `rr`, `risk_amount` | Yes (consistent) |
| `variables_json` (`dol`, setup, plan review for T3) | Yes |
| `commission`, `slippage`, `notes` | Yes |

| Adapted output (140 cols) | Populated |
|---------------------------|-----------|
| `bar_*_r`, post-exit arrays | Yes |
| `mfe_r`, `mae_r`, `capture_ratio` | Yes |
| `strategy_variables`, `preTags`, `postTags` | Yes |
| `originSource`, `session_mode`, `planAdherence` | Yes |
| T3 discipline / demons | Yes (via adapter live synthesizer) |
