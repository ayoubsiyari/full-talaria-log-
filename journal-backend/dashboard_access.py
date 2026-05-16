"""
Per-dashboard-module access (admin-granted partial access without full subscription).

Keep in sync with chart v 1.4/chart/dashboard_access.py.
"""

from __future__ import annotations

import json
from typing import Any

from subscription_access import user_entitles_journal

# Canonical module keys (API + Next dashboard paths).
DASHBOARD_MODULES: tuple[tuple[str, str], ...] = (
    ("journal", "Journal"),
    ("backtest", "Backtest & sessions"),
    ("strategies", "Strategy lab"),
    ("cot", "COT analysis"),
    ("community", "Community feed"),
    ("chart", "Chart data & drawings"),
)

ALLOWED_MODULE_KEYS = frozenset(k for k, _ in DASHBOARD_MODULES)


def _raw_grants_dict(raw: Any) -> dict | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None
    return None


def normalize_module_grants(raw: Any) -> dict[str, bool]:
    raw = _raw_grants_dict(raw)
    if not isinstance(raw, dict):
        return {}
    out: dict[str, bool] = {}
    for key, val in raw.items():
        sk = str(key).strip().lower()
        if sk in ALLOWED_MODULE_KEYS and val is True:
            out[sk] = True
    return out


def effective_dashboard_modules(user) -> dict[str, bool]:
    """Resolved access per module for UI and enforcement."""
    if not user:
        return {k: False for k in ALLOWED_MODULE_KEYS}
    if getattr(user, "role", None) == "admin":
        return {k: True for k in ALLOWED_MODULE_KEYS}
    if user_entitles_journal(user):
        return {k: True for k in ALLOWED_MODULE_KEYS}
    grants = normalize_module_grants(_raw_grants_dict(getattr(user, "dashboard_module_grants", None)))
    return {k: bool(grants.get(k)) for k in ALLOWED_MODULE_KEYS}


def user_has_dashboard_module(user, module: str) -> bool:
    if not user or not module:
        return False
    key = str(module).strip().lower()
    if key not in ALLOWED_MODULE_KEYS:
        return False
    return bool(effective_dashboard_modules(user).get(key))


def modules_catalog() -> list[dict[str, str]]:
    return [{"key": k, "label": label} for k, label in DASHBOARD_MODULES]
