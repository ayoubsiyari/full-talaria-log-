from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class NormalizedTrade:
    trade_id: str
    ticker: str
    side: str
    setup: str
    close_ts: float
    pnl_net: float
    rr_actual: float
    mae_r: float
    mfe_r: float
    quantity: float
    spread_pips_at_entry: float
    commission_at_entry: float
    pip_value_at_entry: float
    risk_usd: float

    @property
    def spread_cost_usd(self) -> float:
        return self.spread_pips_at_entry * self.pip_value_at_entry * self.quantity

    @property
    def commission_cost_usd(self) -> float:
        return self.commission_at_entry * self.quantity * 2.0

    @property
    def total_cost_usd(self) -> float:
        return self.spread_cost_usd + self.commission_cost_usd

