# Chart JSON export fixtures

Milestone-4 shaped exports matching `buildMilestone4ExportSnapshot()` / `exportTradesToJSON`.

| File | Trades | Use |
|------|--------|-----|
| `trade_journal_qa_200.json` | 200 | Primary validation fixture (distributions, path cards) |
| `trade_journal_qa_50.json` | 50 | Smaller smoke-test import |
| `trade_journal_2026-07-01.json` | 200 | Dated copy of the 200-trade export |

## Semantics

- **Per-bar** `bar_high_r` / `bar_low_r` / `bar_close_r` (not running envelopes)
- Scalars derived from arrays: `mfe_r = max(bar_high_r)`, `mae_r = -max(bar_low_r)`
- `capture_ratio = rMultiple / total_mfe_r` (signed fraction)
- Last **6 trades** have **pending post-exit** (empty `post_exit_bar_*` arrays)
- Some trades include `partialCloses[]` and `trail_sl_path[]`

## Regenerate

```bash
py "chart v 1.4/chart/scripts/generate_milestone4_json_export.py" 200
py "chart v 1.4/chart/scripts/generate_milestone4_json_export.py" 50
```

## Changelog

| Date | Note |
|------|------|
| 2026-07-01 | Fixed SHORT `bar_high_r`/`bar_low_r` swap in generator (`generate_200_trades_full_csv.py`); direction-agnostic invariant check |
| 2026-07-01 | Initial fixtures |
