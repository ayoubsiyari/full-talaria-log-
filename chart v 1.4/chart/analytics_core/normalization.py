from __future__ import annotations

from typing import Any

from .types import NormalizedTrade
from .utils import to_float, to_ticker


def _instrument_settings_dict(t: dict[str, Any]) -> dict[str, Any]:
    inst = t.get("instrument_settings")
    return inst if isinstance(inst, dict) else {}


def _spread_pips_at_entry(t: dict[str, Any]) -> float:
    if "spread_pips_at_entry" in t and t["spread_pips_at_entry"] is not None:
        return to_float(t.get("spread_pips_at_entry"))
    inst = _instrument_settings_dict(t)
    return to_float(inst.get("spread_pips", inst.get("spreadPips", 0.0)))


def _commission_at_entry(t: dict[str, Any]) -> float:
    if "commission_at_entry" in t and t["commission_at_entry"] is not None:
        return to_float(t.get("commission_at_entry"))
    inst = _instrument_settings_dict(t)
    return to_float(inst.get("commission_per_lot_per_side", inst.get("commissionPerLotPerSide", 0.0)))


def _pip_value_at_entry(t: dict[str, Any]) -> float:
    if "pip_value_at_entry" in t and t["pip_value_at_entry"] is not None:
        return to_float(t.get("pip_value_at_entry"))
    inst = _instrument_settings_dict(t)
    return to_float(inst.get("pip_value_per_lot", inst.get("pipValuePerLot", 0.0)))


def normalize_trades(raw_trades: list[dict[str, Any]]) -> list[NormalizedTrade]:
    out: list[NormalizedTrade] = []
    for idx, t in enumerate(raw_trades):
        ticker = to_ticker(t.get("ticker") or t.get("symbol"))
        side = str(t.get("direction") or t.get("type") or "").upper()
        setup = str(
            t.get("setup")
            or (t.get("preTradeNotes") or {}).get("setup")
            or (t.get("postTradeNotes") or {}).get("setup")
            or (
                str((t.get("preTradeNotes") or {}).get("tags") or "").split(",")[0].strip()
                if (t.get("preTradeNotes") or {}).get("tags")
                else "General"
            )
        ).strip() or "General"

        pnl_net = to_float(t.get("netPnL", t.get("realizedPnL", t.get("pnl", 0.0))))
        rr_actual = to_float(t.get("rMultiple", t.get("rewardToRiskRatio", 0.0)))
        mae_r = to_float(t.get("mae_r", 0.0))
        mfe_r = to_float(t.get("mfe_r", 0.0))
        quantity = to_float(t.get("quantity", 0.0))
        # Prefer flat fields saved on the journal row; fall back to instrument_settings once (no duplicate work in Python).
        spread_pips = _spread_pips_at_entry(t)
        commission = _commission_at_entry(t)
        pip_value = _pip_value_at_entry(t)
        close_ts = to_float(t.get("closeTime", t.get("exitTime", 0.0)))
        risk_usd = to_float(t.get("riskAmount", t.get("originalRiskAmount", 0.0)))
        if risk_usd <= 0.0 and abs(rr_actual) > 1e-9:
            risk_usd = abs(pnl_net / rr_actual)

        out.append(
            NormalizedTrade(
                trade_id=str(t.get("tradeId", t.get("id", idx))),
                ticker=ticker,
                side=side,
                setup=setup,
                close_ts=close_ts,
                pnl_net=pnl_net,
                rr_actual=rr_actual,
                mae_r=mae_r,
                mfe_r=mfe_r,
                quantity=quantity,
                spread_pips_at_entry=spread_pips,
                commission_at_entry=commission,
                pip_value_at_entry=pip_value,
                risk_usd=risk_usd,
            )
        )
    return out


def filter_by_instrument(trades: list[NormalizedTrade], ticker: str = "ALL") -> list[NormalizedTrade]:
    if ticker == "ALL":
        return list(trades)
    target = to_ticker(ticker)
    return [t for t in trades if t.ticker == target]

