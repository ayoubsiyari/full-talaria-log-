from __future__ import annotations

from typing import Any

from .simulation import simulate_trade
from .types import NormalizedTrade


def build_expectancy_heatmap(
    trades: list[NormalizedTrade],
    tp_levels: list[float] | None = None,
    sl_levels: list[float] | None = None,
) -> dict[str, Any]:
    tp_grid = tp_levels or [0.5, 1.0, 1.5, 2.0, 2.5, 3.0]
    sl_grid = sl_levels or [0.5, 1.0, 1.5, 2.0, 2.5, 3.0]
    flat: list[dict[str, Any]] = []
    best_cell: dict[str, Any] | None = None

    for sl in sl_grid:
        for tp in tp_grid:
            sims = [simulate_trade(t, tp_r=tp, sl_r=sl) for t in trades]
            n = len(sims)
            exp_usd = (sum(x["sim_net_usd"] for x in sims) / n) if n else 0.0
            exp_r = (sum(x["sim_net_r"] for x in sims) / n) if n else 0.0
            cell = {
                "tp_r": tp,
                "sl_r": sl,
                "expectancy_usd": exp_usd,
                "expectancy_r": exp_r,
                "trades": n,
            }
            flat.append(cell)
            if best_cell is None or cell["expectancy_usd"] > best_cell["expectancy_usd"]:
                best_cell = cell

    matrix = [
        [next((c for c in flat if c["sl_r"] == sl and c["tp_r"] == tp), None) for tp in tp_grid]
        for sl in sl_grid
    ]
    return {"tp_levels": tp_grid, "sl_levels": sl_grid, "flat": flat, "matrix": matrix, "best": best_cell}


def build_histogram(values: list[float], bucket_size: float = 0.5) -> list[dict[str, Any]]:
    clean = [v for v in values if isinstance(v, (int, float))]
    if not clean:
        return []
    mn = min(clean)
    mx = max(clean)
    start = int(mn // bucket_size) * bucket_size
    end = (int(mx / bucket_size) + 1) * bucket_size
    bins: list[dict[str, Any]] = []
    x = start
    while x < end:
        bins.append({"label": f"{x:.1f} to {x + bucket_size:.1f}", "from": x, "to": x + bucket_size, "count": 0})
        x += bucket_size
    for v in clean:
        idx = int((v - start) // bucket_size)
        if idx < 0:
            continue
        if idx >= len(bins):
            idx = len(bins) - 1
        bins[idx]["count"] += 1
    return bins

