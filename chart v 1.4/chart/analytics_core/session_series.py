from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from .types import NormalizedTrade

_WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _ts_to_seconds(ts: float) -> float | None:
    """Normalize journal timestamps to seconds since epoch (UTC)."""
    if not math.isfinite(ts) or ts <= 0:
        return None
    if ts > 1e12:
        return ts / 1000.0
    return ts


def trade_duration_hours(trade: NormalizedTrade) -> float | None:
    """Holding period in hours when open/close timestamps are usable."""
    os_ = _ts_to_seconds(float(trade.open_ts))
    cs = _ts_to_seconds(float(trade.close_ts))
    if os_ is None or cs is None or cs < os_:
        return None
    return (cs - os_) / 3600.0


def compute_yearly_summary_from_monthly(
    monthly: list[dict[str, Any]],
    start_balance: float | None,
) -> dict[str, Any]:
    """Best/worst calendar year by summed monthly net PnL vs start balance."""
    if not monthly or start_balance is None or not math.isfinite(float(start_balance)) or float(start_balance) <= 0:
        return {"best_year": None, "worst_year": None}
    sb = float(start_balance)
    by_year: dict[int, float] = {}
    for row in monthly:
        x = str(row.get("x", ""))
        if len(x) < 4:
            continue
        try:
            y = int(x[:4])
        except ValueError:
            continue
        by_year[y] = by_year.get(y, 0.0) + float(row.get("y", 0.0))
    if not by_year:
        return {"best_year": None, "worst_year": None}
    best_y, best_net = max(by_year.items(), key=lambda kv: kv[1])
    worst_y, worst_net = min(by_year.items(), key=lambda kv: kv[1])
    return {
        "best_year": {
            "year": best_y,
            "net_pnl": best_net,
            "return_pct": (best_net / sb) * 100.0,
        },
        "worst_year": {
            "year": worst_y,
            "net_pnl": worst_net,
            "return_pct": (worst_net / sb) * 100.0,
        },
    }


def compute_holding_duration_stats(trades: list[NormalizedTrade]) -> dict[str, Any]:
    hours_all: list[float] = []
    hours_win: list[float] = []
    hours_loss: list[float] = []
    for t in trades:
        h = trade_duration_hours(t)
        if h is None:
            continue
        hours_all.append(h)
        if float(t.pnl_net) > 0:
            hours_win.append(h)
        elif float(t.pnl_net) < 0:
            hours_loss.append(h)
    def _avg(xs: list[float]) -> float | None:
        return (sum(xs) / len(xs)) if xs else None

    return {
        "trades_with_duration": len(hours_all),
        "avg_hours": _avg(hours_all),
        "avg_win_hours": _avg(hours_win),
        "avg_loss_hours": _avg(hours_loss),
    }


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
    monthly = compute_monthly_net_pnl(trades)
    sb_f: float | None = None
    if start_balance is not None and math.isfinite(float(start_balance)) and float(start_balance) > 0:
        sb_f = float(start_balance)
    return {
        "sharpe_sortino": compute_sharpe_sortino(pnls),
        "monthly_pnl": monthly,
        "weekday_winrate": compute_weekday_win_rate(trades),
        "balance": compute_balance_equity_metrics(trades, start_balance),
        "yearly_summary": compute_yearly_summary_from_monthly(monthly, sb_f),
        "holding_duration": compute_holding_duration_stats(trades),
    }
