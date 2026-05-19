from __future__ import annotations

from typing import Any

from .types import NormalizedTrade


def _resolve_simulated_rr(trade: NormalizedTrade, tp_r: float, sl_r: float) -> float:
    hit_tp = trade.mfe_r >= tp_r
    hit_sl = trade.mae_r <= -sl_r
    if hit_tp and not hit_sl:
        return tp_r
    if hit_sl and not hit_tp:
        return -sl_r
    if hit_tp and hit_sl:
        return tp_r if trade.rr_actual >= 0 else -sl_r
    return trade.rr_actual


def simulate_trade(trade: NormalizedTrade, tp_r: float, sl_r: float) -> dict[str, Any]:
    sim_rr = _resolve_simulated_rr(trade, tp_r=tp_r, sl_r=sl_r)
    sim_gross_usd = sim_rr * trade.risk_usd
    sim_net_usd = sim_gross_usd - trade.total_cost_usd
    sim_net_r = sim_rr - (trade.total_cost_usd / trade.risk_usd if trade.risk_usd > 0 else 0.0)
    return {
        "trade_id": trade.trade_id,
        "ticker": trade.ticker,
        "close_ts": trade.close_ts,
        "actual_net_usd": trade.pnl_net,
        "actual_r": trade.rr_actual,
        "sim_rr": sim_rr,
        "sim_net_usd": sim_net_usd,
        "sim_net_r": sim_net_r,
        "cost_usd": trade.total_cost_usd,
    }


def simulate_equity_curve(
    trades: list[NormalizedTrade],
    tp_r: float,
    sl_r: float,
) -> list[dict[str, Any]]:
    ordered = sorted(trades, key=lambda t: t.close_ts)
    out: list[dict[str, Any]] = []
    actual_cum = 0.0
    simulated_cum = 0.0
    for i, t in enumerate(ordered, start=1):
        sim = simulate_trade(t, tp_r=tp_r, sl_r=sl_r)
        actual_cum += sim["actual_net_usd"]
        simulated_cum += sim["sim_net_usd"]
        out.append(
            {
                "index": i,
                "ticker": t.ticker,
                "close_ts": t.close_ts,
                "actual_equity": actual_cum,
                "simulated_equity": simulated_cum,
                "sim_rr": sim["sim_rr"],
            }
        )
    return out

