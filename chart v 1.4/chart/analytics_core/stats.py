from __future__ import annotations

from typing import Any

from .types import NormalizedTrade


def compute_stats(trades: list[NormalizedTrade]) -> dict[str, Any]:
    total = len(trades)
    wins = sum(1 for t in trades if t.pnl_net > 0)
    losses = sum(1 for t in trades if t.pnl_net < 0)
    net = sum(t.pnl_net for t in trades)
    gross_profit = sum(t.pnl_net for t in trades if t.pnl_net > 0)
    gross_loss_abs = abs(sum(t.pnl_net for t in trades if t.pnl_net < 0))
    win_rate = (wins / total * 100.0) if total else 0.0
    avg_rr = (sum(t.rr_actual for t in trades) / total) if total else 0.0
    avg_win = (gross_profit / wins) if wins else 0.0
    avg_loss = (gross_loss_abs / losses) if losses else 0.0
    profit_factor = (gross_profit / gross_loss_abs) if gross_loss_abs > 0 else (gross_profit if gross_profit > 0 else 0.0)
    expectancy = (net / total) if total else 0.0

    best = max(trades, key=lambda t: t.pnl_net, default=None)
    worst = min(trades, key=lambda t: t.pnl_net, default=None)
    long_pnl = sum(t.pnl_net for t in trades if t.side in {"BUY", "LONG"})
    short_pnl = sum(t.pnl_net for t in trades if t.side in {"SELL", "SHORT"})
    return {
        "total": total,
        "wins": wins,
        "losses": losses,
        "net": net,
        "win_rate": win_rate,
        "avg_rr": avg_rr,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
        "profit_factor": profit_factor,
        "expectancy": expectancy,
        "best": {"ticker": best.ticker, "pnl": best.pnl_net} if best else {"ticker": "-", "pnl": 0.0},
        "worst": {"ticker": worst.ticker, "pnl": worst.pnl_net} if worst else {"ticker": "-", "pnl": 0.0},
        "long_pnl": long_pnl,
        "short_pnl": short_pnl,
    }


def compute_playbook_breakdown(trades: list[NormalizedTrade]) -> list[dict[str, Any]]:
    grouped: dict[str, list[NormalizedTrade]] = {}
    for t in trades:
        grouped.setdefault(t.setup or "General", []).append(t)
    rows: list[dict[str, Any]] = []
    for setup, bucket in grouped.items():
        n = len(bucket)
        wins = sum(1 for t in bucket if t.pnl_net > 0)
        pnl = sum(t.pnl_net for t in bucket)
        avg_rr = (sum(t.rr_actual for t in bucket) / n) if n else 0.0
        rows.append({"setup": setup, "trades": n, "win_rate": (wins / n * 100.0) if n else 0.0, "net_pnl": pnl, "avg_rr": avg_rr})
    rows.sort(key=lambda r: r["net_pnl"], reverse=True)
    return rows


def compute_per_instrument_summary(trades: list[NormalizedTrade]) -> list[dict[str, Any]]:
    grouped: dict[str, list[NormalizedTrade]] = {}
    for t in trades:
        grouped.setdefault(t.ticker, []).append(t)
    rows: list[dict[str, Any]] = []
    for ticker, bucket in grouped.items():
        total = len(bucket)
        wins = sum(1 for t in bucket if t.pnl_net > 0)
        pnl = sum(t.pnl_net for t in bucket)
        rr = sum(t.rr_actual for t in bucket)
        mae_avg = sum(t.mae_r for t in bucket) / total if total else 0.0
        mfe_avg = sum(t.mfe_r for t in bucket) / total if total else 0.0
        spread_cost = sum(t.spread_cost_usd for t in bucket)
        commission_cost = sum(t.commission_cost_usd for t in bucket)
        winner_captures = [(t.rr_actual / t.mfe_r) for t in bucket if t.pnl_net > 0 and abs(t.mfe_r) > 1e-9]
        rows.append(
            {
                "ticker": ticker,
                "trades": total,
                "win_rate": (wins / total) * 100.0 if total else 0.0,
                "net_pnl_usd": pnl,
                "net_pnl_r": rr,
                "avg_mae_r": mae_avg,
                "avg_mfe_r": mfe_avg,
                "capture_ratio": (sum(winner_captures) / len(winner_captures)) if winner_captures else 0.0,
                "spread_cost_usd": spread_cost,
                "commission_cost_usd": commission_cost,
            }
        )
    rows.sort(key=lambda r: r["net_pnl_usd"], reverse=True)
    return rows


def compute_recent_trades(trades: list[NormalizedTrade], limit: int = 15) -> list[dict[str, Any]]:
    ordered = sorted(trades, key=lambda t: t.close_ts, reverse=True)[: max(1, int(limit))]
    return [
        {
            "trade_id": t.trade_id,
            "ticker": t.ticker,
            "side": t.side,
            "setup": t.setup,
            "pnl_net": t.pnl_net,
            "rr_actual": t.rr_actual,
            "close_ts": t.close_ts,
        }
        for t in ordered
    ]


def compute_equity_summary(equity_curve: list[dict[str, Any]]) -> dict[str, Any]:
    if not equity_curve:
        return {"actual_final": 0.0, "simulated_final": 0.0, "delta_final": 0.0, "actual_max_drawdown": 0.0, "simulated_max_drawdown": 0.0}
    actual_vals = [float(x.get("actual_equity", 0.0)) for x in equity_curve]
    sim_vals = [float(x.get("simulated_equity", 0.0)) for x in equity_curve]

    def _max_dd(series: list[float]) -> float:
        peak = series[0] if series else 0.0
        dd = 0.0
        for v in series:
            if v > peak:
                peak = v
            cur = peak - v
            if cur > dd:
                dd = cur
        return dd

    actual_final = actual_vals[-1]
    simulated_final = sim_vals[-1]
    return {
        "actual_final": actual_final,
        "simulated_final": simulated_final,
        "delta_final": simulated_final - actual_final,
        "actual_max_drawdown": _max_dd(actual_vals),
        "simulated_max_drawdown": _max_dd(sim_vals),
    }

