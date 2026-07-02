# Dev Response — Multi-strategy T3 fixture

**From:** chart / data dev  
**Date:** 2026-07-04  
**Re:** `DEV_REQUEST_multistrategy_fixture.md`

---

## Delivered

**2 T3 live-personal multi-strategy journals** (mentor input + adapted export + manifest).

| Output | Path |
|--------|------|
| Fixture 1 mentor | `mentor data/generated/t3-multistrat/qa_gen_t3_multistrat_fx_indices_trading_journal_complete.xlsx` |
| Fixture 1 adapted | `mentor data/generated/t3-multistrat/qa_gen_t3_multistrat_fx_indices-talaria-adapted.xlsx` |
| Fixture 2 mentor | `mentor data/generated/t3-multistrat/qa_gen_t3_multistrat_gold_crypto_trading_journal_complete.xlsx` |
| Fixture 2 adapted | `mentor data/generated/t3-multistrat/qa_gen_t3_multistrat_gold_crypto-talaria-adapted.xlsx` |
| Manifest | `mentor data/generated/manifest-multistrat.json` |
| Generator | `scripts/generate_mentor_t3_multistrat_fixture.py` |

**Seed:** `20260704`

---

## Strategy grouping (verify against this)

### Fixture 1 — `QA Gen T3 · Multi-Strategy FX + Indices Live`

| strategy_id | strategyName | Trades | Pre variable keys |
|-------------|--------------|--------|-------------------|
| **58** | London Open Liquidity Scalp | 73 | `dol`, `setup_tag`, `session_mood` |
| **59** | VWAP Reclaim Intraday | 65 | `bias`, `entry_model`, `htf_confluence` |

Tickers: EURUSD/GBPUSD (London), NQ/ES (VWAP).

### Fixture 2 — `QA Gen T3 · Multi-Strategy Gold + Crypto Live`

| strategy_id | strategyName | Trades | Pre variable keys |
|-------------|--------------|--------|-------------------|
| **64** | Fibonacci Confluence Swing | 45 | `fib_zone`, `confluence_count`, `dol` |
| **62** | Liquidity Sweep + FVG | 49 | `sweep_type`, `fvg_quality`, `session_mood` |

Tickers: XAUUSD (Fib), BTCUSD (Liquidity).

---

## Requirements checklist

| Requirement | Status |
|-------------|--------|
| ≥2 strategies per source | Yes (2 each) |
| Distinct `strategy_id` per strategy | Yes — on every trade |
| Distinct `strategy_variables` schemas | Yes — different keys per strategy |
| Per-trade strategy resolvable | Yes — `strategy_id`, `strategyName`, `setup`, `tag` |
| ≥40 trades per strategy | Yes |
| `preTags`/`postTags` match own strategy | Yes — derived from that trade's `strategy_variables` |
| Bar arrays + scalar reconciliation | Yes — same v2 adapter (`_finalize_excursion_scalars_from_path`) |
| T3 live fields | Yes — `sourceType=journal`, `session_mode=live_journal`, `originSource=mentor_import_live`, discipline synthesizer |

---

## Pipeline changes (minimal)

1. **Per-row strategy in adapter** — `adapt_mentor_xlsx_to_talaria.py` reads `strategy_id` / `strategy_name` from mentor rows when present.
2. **Export columns** — added `strategy_id`, `strategyName` to adapted export (`142` columns total).
3. **Mentor input** — multistrat mentor sheets add `strategy_id`, `strategy_name`, `post_variables_schema`.

No special import path — same `batch_adapt_mentor_data.py` / `live_personal` flow.

---

## Regenerate

```bash
py scripts/generate_mentor_t3_multistrat_fixture.py --seed 20260704
```

---

## What to verify (your list)

- Strategy filter lists **58** and **59** (fixture 1) or **64** and **62** (fixture 2).
- Trade counts per strategy match manifest (~73/65 and ~45/49).
- Tag options scope to selected strategy's variable keys only.
- Cross-filter (strategy + namespaced tag) returns expected subset.
