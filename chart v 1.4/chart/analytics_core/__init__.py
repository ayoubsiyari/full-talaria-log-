from .types import NormalizedTrade
from .normalization import normalize_trades, filter_by_instrument
from .simulation import simulate_trade, simulate_equity_curve
from .heatmap import build_expectancy_heatmap, build_histogram
from .heatmap_surface import heatmap_to_matrices, render_expectancy_heatmap_surface_png
from .stats import (
    compute_stats,
    compute_playbook_breakdown,
    compute_per_instrument_summary,
    compute_recent_trades,
    compute_equity_summary,
)
from .session_series import (
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
    "heatmap_to_matrices",
    "render_expectancy_heatmap_surface_png",
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

