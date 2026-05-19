"""
Compatibility facade for analytics engine.

This module keeps existing imports stable:
    from analytics_engine import ...

Internally, implementation lives in `dashboard/analytics/backend/analytics_core/`.
"""

from analytics_core import (
    NormalizedTrade,
    normalize_trades,
    filter_by_instrument,
    simulate_trade,
    simulate_equity_curve,
    build_expectancy_heatmap,
    build_histogram,
    compute_stats,
    compute_playbook_breakdown,
    compute_per_instrument_summary,
    compute_recent_trades,
    compute_equity_summary,
    compute_balance_equity_metrics,
    compute_monthly_net_pnl,
    compute_session_dashboard_extras,
    compute_sharpe_sortino,
    compute_weekday_win_rate,
)

__all__ = [
    "NormalizedTrade",
    "normalize_trades",
    "filter_by_instrument",
    "simulate_trade",
    "simulate_equity_curve",
    "build_expectancy_heatmap",
    "build_histogram",
    "compute_stats",
    "compute_playbook_breakdown",
    "compute_per_instrument_summary",
    "compute_recent_trades",
    "compute_equity_summary",
    "compute_sharpe_sortino",
    "compute_monthly_net_pnl",
    "compute_weekday_win_rate",
    "compute_balance_equity_metrics",
    "compute_session_dashboard_extras",
]

