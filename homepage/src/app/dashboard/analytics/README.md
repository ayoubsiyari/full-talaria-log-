# Dashboard analytics (session metrics)

One folder for the **Dashboard** tab (`/dashboard/`): UI + Python calculations.

```
analytics/
  README.md
  SessionAnalyticsPanel.tsx    # main panel, API calls, metric cards
  BacktestAnalyticsPage.tsx    # compare / single session wrapper
  BacktestOsDashboardLayout.tsx
  BacktestOsCharts.tsx
  backtestOsCompute.ts
  backtestOsTypes.ts
  …
  backend/
    analytics_core/            # stats, heatmap, simulation, session_series
    backtest_whatif.py         # POST /api/analytics/backtest/whatif
    analytics_engine.py
    tests/
```

## Frontend

Edit cards, charts, filters in `*.tsx` / `*.ts` here.  
Route entry: `../page.tsx` → `BacktestAnalyticsPage`.

## Backend

| Module | Role |
|--------|------|
| `backend/analytics_core/stats.py` | Win rate, profit factor, playbooks |
| `backend/analytics_core/session_series.py` | Sharpe, monthly PnL, equity, drawdown |
| `backend/analytics_core/simulation.py` | What-if equity curve |
| `backend/analytics_core/heatmap.py` | Expectancy heatmap |
| `backend/analytics_core/csv_journal.py` | CSV import parsing |
| `backend/backtest_whatif.py` | What-if payload orchestration |

Chart API loads `backend/` via `chart v 1.4/chart/_analytics_bootstrap.py`  
(local dev: this path; Docker: copied to `/app/analytics_backend`).

## Tests

```bash
cd "chart v 1.4/chart"
python -m pytest ../../homepage/src/app/dashboard/analytics/backend/tests -q
```
