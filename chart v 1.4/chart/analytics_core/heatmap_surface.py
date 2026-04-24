"""Matplotlib 3D surface for TP/SL expectancy heatmap (server-side PNG)."""

from __future__ import annotations

import io
from typing import Any

import numpy as np


def heatmap_to_matrices(heatmap: dict[str, Any], metric: str = "usd") -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Build mesh grids (SL, TP, Z) from `build_expectancy_heatmap` output."""
    tp = np.asarray(heatmap["tp_levels"], dtype=float)
    sl = np.asarray(heatmap["sl_levels"], dtype=float)
    z = np.full((len(sl), len(tp)), np.nan, dtype=float)
    m = str(metric or "usd").lower()
    key = "expectancy_usd" if m in ("usd", "dollar", "$") else "expectancy_r"
    matrix = heatmap.get("matrix") or []
    for i in range(len(sl)):
        row = matrix[i] if i < len(matrix) else []
        for j in range(len(tp)):
            cell = row[j] if j < len(row) else None
            if isinstance(cell, dict) and key in cell:
                z[i, j] = float(cell[key])
    # indexing="ij": first dim SL, second TP — matches matrix layout
    SL, TP = np.meshgrid(sl, tp, indexing="ij")
    return SL, TP, z


def render_expectancy_heatmap_surface_png(
    heatmap: dict[str, Any],
    *,
    metric: str = "usd",
    title: str | None = None,
    dpi: int = 115,
) -> bytes:
    """
    Render expectancy grid as a 3D surface (Matplotlib Agg).

    Dark theme to match BacktestOS; returns PNG bytes.
    """
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib import cm
    from matplotlib.colors import Normalize, TwoSlopeNorm

    SL, TP, Z = heatmap_to_matrices(heatmap, metric)
    zm = np.ma.masked_invalid(Z)

    fig = plt.figure(figsize=(10, 6.8), dpi=dpi, facecolor="#0a0c0f")
    ax = fig.add_subplot(111, projection="3d", facecolor="#0a0c0f")

    finite = np.isfinite(Z)
    if not finite.any():
        raise ValueError("heatmap has no finite expectancy values")

    lo = float(np.nanmin(Z))
    hi = float(np.nanmax(Z))
    if lo < 0.0 < hi:
        norm: Normalize | TwoSlopeNorm = TwoSlopeNorm(vmin=lo, vcenter=0.0, vmax=hi)
    else:
        norm = Normalize(vmin=lo, vmax=hi if hi != lo else lo + 1e-9)

    surf = ax.plot_surface(
        SL,
        TP,
        zm,
        cmap=cm.RdYlGn,
        norm=norm,
        linewidth=0.15,
        edgecolor="#2a3240",
        alpha=0.92,
        antialiased=True,
        rstride=1,
        cstride=1,
    )

    mlow = str(metric or "usd").lower()
    zlab = "E[net $]" if mlow in ("usd", "dollar", "$") else "E[net R]"
    ax.set_xlabel("SL (R)", color="#9ca3af", fontsize=10, labelpad=8)
    ax.set_ylabel("TP (R)", color="#9ca3af", fontsize=10, labelpad=8)
    ax.set_zlabel(zlab, color="#9ca3af", fontsize=10, labelpad=10)
    ax.set_title(title or "TP / SL expectancy surface", color="#e8eaed", fontsize=11, pad=12)

    ax.tick_params(axis="x", colors="#6b7280", labelsize=8)
    ax.tick_params(axis="y", colors="#6b7280", labelsize=8)
    ax.tick_params(axis="z", colors="#6b7280", labelsize=8)
    ax.xaxis.pane.set_facecolor((0.06, 0.07, 0.09, 0.9))
    ax.yaxis.pane.set_facecolor((0.06, 0.07, 0.09, 0.9))
    ax.zaxis.pane.set_facecolor((0.06, 0.07, 0.09, 0.9))
    ax.grid(True, color=(1, 1, 1, 0.07), linestyle="-", linewidth=0.4)

    cbar = fig.colorbar(surf, ax=ax, shrink=0.55, aspect=16, pad=0.12)
    cbar.ax.yaxis.set_tick_params(color="#9ca3af", labelsize=8)
    cbar.outline.set_edgecolor("#2a3240")
    plt.setp(plt.getp(cbar.ax.axes, "yticklabels"), color="#9ca3af")

    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor=fig.get_facecolor(), bbox_inches="tight", pad_inches=0.2)
    plt.close(fig)
    return buf.getvalue()
