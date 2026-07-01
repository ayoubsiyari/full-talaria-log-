# Talaria — Response: SHORT excursion legs swapped in JSON QA fixtures

**Re:** `TALARIA_FIXTURE_BUG_short_swap.md`  
**Status:** **Fixed** — fixtures regenerated 2026-07-01

---

## Summary

You were right: the fixture generator applied the wrong H/L convention for `type: "SELL"`. This was a **generator bug** in `generate_200_trades_full_csv.py` (used by `generate_milestone4_json_export.py`), not a chart bug.

**Fix applied:** removed the broken SELL-specific branch; both directions now use chart semantics on a signed close path where positive = favorable:

```
bar_high_r[i]  = favorable extreme of bar i (positive)
bar_low_r[i]   = adverse magnitude of bar i (positive)
bar_close_r[i] = signed close of bar i

Invariant (both BUY and SELL):  −bar_low_r[i] ≤ bar_close_r[i] ≤ bar_high_r[i]
```

Pre-write validation in `generate_milestone4_json_export.py` now enforces that inequality for in-trade **and** post-exit arrays.

---

## Verification checklist (your spot-checks)

| Check | `qa_200` | `qa_50` |
|-------|----------|---------|
| SHORT invariant violations = 0 | **0 / 105** ✓ | **0 / 24** ✓ |
| LONG invariant violations = 0 | **0 / 95** ✓ | **0 / 26** ✓ |
| Short winners with `mfe_r ≈ 0` | **0** ✓ | **0** ✓ |
| `max(bar_high_r) == mfe_r` and `max(bar_low_r) == \|mae_r\|` | **0 mismatches** ✓ | **0 mismatches** ✓ |
| Pre-write invariant would fail old files | Yes (direction-agnostic check now catches swapped shorts) ✓ |

**Short winner example `22030` (200-file):** `rMultiple = +1.56`, `mfe_r = 2.48`, `mae_r = −0.23`, `capture_ratio = 0.63`, `max(bar_high_r) = 2.48`.

Note: trade IDs differ from the pre-fix file because bar-path logic changed (e.g. old `22077` was a +2.94R short winner with swapped legs; post-fix `22077` is a different trade). Invariant compliance is what matters for QA.

---

## Files updated

| Path | Action |
|------|--------|
| `chart v 1.4/chart/scripts/generate_200_trades_full_csv.py` | Fixed `_bar_path` / `_post_exit_bars` |
| `chart v 1.4/chart/scripts/generate_milestone4_json_export.py` | Direction-agnostic validation |
| `docs/fixtures/trade_journal_qa_200.json` | Regenerated |
| `docs/fixtures/trade_journal_qa_50.json` | Regenerated |
| `docs/fixtures/trade_journal_2026-07-01.json` | Regenerated |

---

## Dashboard import (unchanged)

We agree: **do not swap shorts on import.** Real chart exports already use the correct convention; only the synthetic fixtures were wrong. Importer should target chart semantics only.

---

## Regenerate

```bash
py "chart v 1.4/chart/scripts/generate_milestone4_json_export.py" 200
py "chart v 1.4/chart/scripts/generate_milestone4_json_export.py" 50
```

---

## Longer-term

A real `exportTradesToJSON` from backtest replay remains the gold standard. These fixtures are now internally consistent and chart-shaped for dashboard QA until that export exists.
