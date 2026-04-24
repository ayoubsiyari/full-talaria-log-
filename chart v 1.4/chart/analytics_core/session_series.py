from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from .types import NormalizedTrade

_WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _trade_close_datetime(trade: NormalizedTrade) -> datetime | None:
    ts = float(trade.close_ts)
    if not math.isfinite(ts) or ts <= 0:
        return None
    if ts > 1e12:
        ts /= 1000.0
    # Reject tiny values (unit tests / relative timestamps without calendar meaning).
    if ts < 946684800.0:
        return None
    try:
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    except (OSError, ValueError, OverflowError):
        return None


def compute_sharpe_sortino(pnls: list[float]) -> dict[str, float | None]:
    clean = [float(p) for p in pnls if isinstance(p, (int, float)) and math.isfinite(float(p))]
    n = len(clean)
    if n < 2:
        return {"sharpe": None, "sortino": None}
    mean = sum(clean) / n
    var = sum((p - mean) ** 2 for p in clean) / (n - 1)
    sd = math.sqrt(var) if var >= 0 else 0.0
    sharpe = (mean / sd) if sd > 0 else None
    downside = [min(0.0, p) for p in clean]
    dvar = sum(d**2 for d in downside) / (n - 1)
    dsd = math.sqrt(dvar) if dvar >= 0 else 0.0
    sortino = (mean / dsd) if dsd > 0 else None
    return {"sharpe": float(sharpe) if sharpe is not None else None, "sortino": float(sortino) if sortino is not None else None}


def compute_monthly_net_pnl(trades: list[NormalizedTrade]) -> list[dict[str, Any]]:
    monthly: dict[str, float] = {}
    for t in trades:
        dt = _trade_close_datetime(t)
        if not dt:
            continue
        key = f"{dt.year:04d}-{dt.month:02d}"
        monthly[key] = monthly.get(key, 0.0) + float(t.pnl_net)
    return [{"x": k, "y": monthly[k]} for k in sorted(monthly.keys())]


def compute_weekday_win_rate(trades: list[NormalizedTrade]) -> list[dict[str, Any]]:
    weekday: dict[str, dict[str, int]] = {
        k: {"w": 0, "n": 0} for k in _WEEKDAY_ORDER
    }
    for t in trades:
        dt = _trade_close_datetime(t)
        if not dt:
            continue
        wd = dt.strftime("%a")
        if wd not in weekday:
            continue
        weekday[wd]["n"] += 1
        if float(t.pnl_net) > 0:
            weekday[wd]["w"] += 1
    return [
        {
            "x": k,
            "y": (weekday[k]["w"] / weekday[k]["n"] * 100.0) if weekday[k]["n"] else 0.0,
            "n": weekday[k]["n"],
        }
        for k in _WEEKDAY_ORDER
    ]


def compute_balance_equity_metrics(
    trades: list[NormalizedTrade],
    start_balance: float | None,
) -> dict[str, Any]:
    ordered = sorted(trades, key=lambda t: t.close_ts)
    net_pnl = sum(float(t.pnl_net) for t in ordered)
    out: dict[str, Any] = {
        "start_balance": float(start_balance) if start_balance is not None and math.isfinite(float(start_balance)) else None,
        "net_pnl": net_pnl,
        "equity": [],
        "drawdown_pct": [],
        "max_drawdown": None,
        "max_drawdown_pct": None,
        "recovery_factor": None,
    }
    if start_balance is None or not math.isfinite(float(start_balance)):
        return out
    eq0 = float(start_balance)
    eq = eq0
    peak = eq0
    max_dd = 0.0
    max_dd_pct = 0.0
    equity_rows: list[dict[str, Any]] = []
    dd_rows: list[dict[str, Any]] = []
    for i, t in enumerate(ordered):
        eq += float(t.pnl_net)
        peak = max(peak, eq)
        dd = peak - eq
        dd_pct = (dd / peak) if peak > 0 else 0.0
        max_dd = max(max_dd, dd)
        max_dd_pct = max(max_dd_pct, dd_pct)
        dt = _trade_close_datetime(t)
        label = dt.isoformat() if dt else str(i + 1)
        equity_rows.append({"x": label, "y": eq})
        dd_rows.append({"x": label, "y": -dd_pct * 100.0})
    out["equity"] = equity_rows
    out["drawdown_pct"] = dd_rows
    out["max_drawdown"] = max_dd if ordered else None
    out["max_drawdown_pct"] = max_dd_pct if ordered else None
    if max_dd and max_dd > 0 and math.isfinite(net_pnl):
        out["recovery_factor"] = net_pnl / max_dd
    return out


def compute_session_dashboard_extras(
    trades: list[NormalizedTrade],
    start_balance: float | None,
) -> dict[str, Any]:
    pnls = [float(t.pnl_net) for t in trades]
    return {
        "sharpe_sortino": compute_sharpe_sortino(pnls),
        "monthly_pnl": compute_monthly_net_pnl(trades),
        "weekday_winrate": compute_weekday_win_rate(trades),
        "balance": compute_balance_equity_metrics(trades, start_balance),
    }
