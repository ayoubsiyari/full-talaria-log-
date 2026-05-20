"""Community strategy publish: visibility filters and backtest snapshot helpers."""

from __future__ import annotations

import copy
from typing import Any

TALARIA_V9_KEY = "talaria_v9"

DEFAULT_PUBLISH_SETTINGS: dict[str, bool] = {
    "include_description": True,
    "include_conditions": True,
    "include_variables": True,
    "include_strategy_details": True,
    "include_backtest_stats": False,
    "allow_clone": True,
}


def parse_publish_settings(data: dict | None) -> dict[str, bool]:
    """Normalize publish toggles from API / submit body."""
    raw = data if isinstance(data, dict) else {}
    out = dict(DEFAULT_PUBLISH_SETTINGS)
    for key in out:
        if key in raw:
            out[key] = bool(raw[key])
    return out


def _v9_panel(defn: dict) -> dict:
    raw = defn.get(TALARIA_V9_KEY)
    return raw if isinstance(raw, dict) else {}


def apply_publish_filter(defn: Any, settings: dict[str, bool] | None) -> dict:
    """
    Return a copy of strategy_definition safe to expose per author toggles.
    Stored on community templates; used again when serving list/detail/clone.
    """
    if not isinstance(defn, dict):
        return {}
    settings = settings or DEFAULT_PUBLISH_SETTINGS
    out = copy.deepcopy(defn)
    v9 = _v9_panel(out)

    if not settings.get("include_description"):
        out["description"] = ""
        if v9:
            v9["desc"] = ""

    if not settings.get("include_conditions"):
        out["conditions"] = []
        if v9:
            v9["conditions"] = []
            v9["tree"] = []
            v9["canvasNodes"] = []
            v9["canvasEdges"] = []

    if not settings.get("include_variables"):
        out["variables"] = []
        if v9:
            v9["variables"] = [{"type": "divider", "id": "div0"}]

    if not settings.get("include_strategy_details"):
        for key in ("instrument", "instruments", "market_categories", "style", "direction", "timeframe"):
            out.pop(key, None)
        if v9:
            v9["instruments"] = []
            v9["timeframes"] = []
            v9["markets"] = []
            v9["tags"] = []
            v9["supportInst"] = []
            v9["images"] = []
        out["strategy_tags"] = []

    if v9:
        out[TALARIA_V9_KEY] = v9
    return out


def normalize_backtest_snapshot(raw: Any, settings: dict[str, bool]) -> dict | None:
    """Keep only whitelisted KPI fields when author opts into backtest stats."""
    if not settings.get("include_backtest_stats"):
        return None
    if not isinstance(raw, dict):
        return None
    snap = {
        "session_id": raw.get("session_id"),
        "session_name": str(raw.get("session_name") or "")[:120],
        "win_rate": raw.get("win_rate"),
        "pnl": raw.get("pnl"),
        "trades": raw.get("trades"),
        "progress": raw.get("progress"),
        "rollback_allowed": bool(raw.get("rollback_allowed")),
        "start_date": str(raw.get("start_date") or "")[:32],
        "end_date": str(raw.get("end_date") or "")[:32],
    }
    if snap["win_rate"] is not None:
        try:
            snap["win_rate"] = int(round(float(snap["win_rate"])))
        except (TypeError, ValueError):
            snap["win_rate"] = None
    if snap["pnl"] is not None:
        try:
            snap["pnl"] = float(snap["pnl"])
        except (TypeError, ValueError):
            snap["pnl"] = None
    if snap["trades"] is not None:
        try:
            snap["trades"] = int(snap["trades"])
        except (TypeError, ValueError):
            snap["trades"] = None
    if snap["progress"] is not None:
        try:
            snap["progress"] = max(0, min(100, int(snap["progress"])))
        except (TypeError, ValueError):
            snap["progress"] = None
    return snap


def public_backtest_snapshot(template) -> dict | None:
    """Return snapshot for API consumers only when author allowed stats."""
    settings = template.publish_settings if isinstance(template.publish_settings, dict) else {}
    if not settings.get("include_backtest_stats"):
        return None
    snap = template.backtest_snapshot
    return snap if isinstance(snap, dict) else None
