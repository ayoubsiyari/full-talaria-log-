"""Matplotlib 3D surface for TP/SL expectancy heatmap (server-side PNG)."""

from __future__ import annotations

import io
from typing import Any

import numpy as np

# Coarse TP/SL grids (e.g. 6×6) look faceted; upsample for a smooth PNG surface only.
_SURFACE_UPSAMPLE = 48


def _bilinear_upsample(
    sl_1d: np.ndarray,
    tp_1d: np.ndarray,
    Z: np.ndarray,
    n_s: int,
    n_t: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Bilinear upsample of Z on the SL–TP rectangle (no SciPy)."""
    sl_1d = np.asarray(sl_1d, dtype=float).ravel()
    tp_1d = np.asarray(tp_1d, dtype=float).ravel()
    Z = np.asarray(Z, dtype=float)
    ns, nt = int(sl_1d.size), int(tp_1d.size)
    n_s = max(int(n_s), 2)
    n_t = max(int(n_t), 2)
    if ns < 2 or nt < 2:
        SL, TP = np.meshgrid(sl_1d, tp_1d, indexing="ij")
        return SL, TP, Z

    slo = np.linspace(sl_1d[0], sl_1d[-1], n_s)
    tpo = np.linspace(tp_1d[0], tp_1d[-1], n_t)
    SL_out, TP_out = np.meshgrid(slo, tpo, indexing="ij")

    eps = 1e-12
    denom_s = (sl_1d[-1] - sl_1d[0]) + eps
    denom_t = (tp_1d[-1] - tp_1d[0]) + eps
    s = (SL_out - sl_1d[0]) / denom_s * (ns - 1)
    t = (TP_out - tp_1d[0]) / denom_t * (nt - 1)
    i = np.floor(s).astype(np.int32)
    j = np.floor(t).astype(np.int32)
    i = np.clip(i, 0, ns - 2)
    j = np.clip(j, 0, nt - 2)
    ds = (s - i).astype(np.float64)
    dt = (t - j).astype(np.float64)

    z00 = Z[i, j]
    z01 = Z[i, j + 1]
    z10 = Z[i + 1, j]
    z11 = Z[i + 1, j + 1]
    finite = np.isfinite(z00) & np.isfinite(z01) & np.isfinite(z10) & np.isfinite(z11)
    z_bot = z00 * (1.0 - dt) + z01 * dt
    z_top = z10 * (1.0 - dt) + z11 * dt
    Z_out = z_bot * (1.0 - ds) + z_top * ds
    Z_out = np.where(finite, Z_out, np.nan)
    return SL_out, TP_out, Z_out


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
    dpi: int = 140,
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

    SL0, TP0, Z0 = heatmap_to_matrices(heatmap, metric)
    sl_1d = np.asarray(heatmap["sl_levels"], dtype=float).ravel()
    tp_1d = np.asarray(heatmap["tp_levels"], dtype=float).ravel()
    n_s = max(_SURFACE_UPSAMPLE, int(sl_1d.size) * 8)
    n_t = max(_SURFACE_UPSAMPLE, int(tp_1d.size) * 8)
    SL, TP, Z = _bilinear_upsample(sl_1d, tp_1d, Z0, n_s, n_t)
    zm = np.ma.masked_invalid(Z)

    fig = plt.figure(figsize=(10.5, 7.0), dpi=dpi, facecolor="#0a0c0f")
    ax = fig.add_subplot(111, projection="3d", facecolor="#0a0c0f")

    finite = np.isfinite(Z0)
    if not finite.any():
        raise ValueError("heatmap has no finite expectancy values")

    lo = float(np.nanmin(Z0))
    hi = float(np.nanmax(Z0))
    # Symmetric diverging scale when both signs exist so zero reads as neutral (not washed out).
    if lo < 0.0 < hi:
        span = max(abs(lo), abs(hi))
        norm: Normalize | TwoSlopeNorm = TwoSlopeNorm(vmin=-span, vcenter=0.0, vmax=span)
    else:
        norm = Normalize(vmin=lo, vmax=hi if hi != lo else lo + 1e-9)

    surf = ax.plot_surface(
        SL,
        TP,
        zm,
        cmap=cm.RdYlGn,
        norm=norm,
        linewidth=0,
        edgecolor="none",
        antialiased=True,
        rstride=1,
        cstride=1,
        shade=True,
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
    ax.xaxis.pane.set_facecolor((0.06, 0.07, 0.09, 0.88))
    ax.yaxis.pane.set_facecolor((0.06, 0.07, 0.09, 0.88))
    ax.zaxis.pane.set_facecolor((0.06, 0.07, 0.09, 0.88))
    ax.xaxis.pane.set_edgecolor((0.15, 0.17, 0.22, 0.5))
    ax.yaxis.pane.set_edgecolor((0.15, 0.17, 0.22, 0.5))
    ax.zaxis.pane.set_edgecolor((0.15, 0.17, 0.22, 0.5))
    ax.grid(True, color=(1, 1, 1, 0.06), linestyle="-", linewidth=0.35)

    xr = float(sl_1d[-1] - sl_1d[0]) if sl_1d.size > 1 else 1.0
    yr = float(tp_1d[-1] - tp_1d[0]) if tp_1d.size > 1 else 1.0
    zr = float(np.nanmax(Z0) - np.nanmin(Z0))
    if xr <= 0:
        xr = 1.0
    if yr <= 0:
        yr = 1.0
    if zr <= 0:
        zr = 1.0
    # Match data proportions so Z is not visually squashed against SL/TP.
    ax.set_box_aspect((xr, yr, zr))

    ax.view_init(elev=26, azim=-58)

    cbar = fig.colorbar(surf, ax=ax, shrink=0.55, aspect=16, pad=0.12)
    cbar.ax.yaxis.set_tick_params(color="#9ca3af", labelsize=8)
    cbar.outline.set_edgecolor("#2a3240")
    plt.setp(plt.getp(cbar.ax.axes, "yticklabels"), color="#9ca3af")

    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor=fig.get_facecolor(), bbox_inches="tight", pad_inches=0.2)
    plt.close(fig)
    return buf.getvalue()
