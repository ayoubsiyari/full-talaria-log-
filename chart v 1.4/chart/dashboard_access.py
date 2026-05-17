"""
Per-dashboard-module access — keep module keys in sync with journal-backend/dashboard_access.py.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

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


def user_has_full_dashboard_modules(
    user,
    *,
    subscription_entitled: bool = False,
    grants_override=None,
) -> bool:
    """All dashboard sections unlocked (admin manual grant, subscription, or legacy extension)."""
    if not user:
        return False
    if getattr(user, "role", None) == "admin":
        return True
    if getattr(user, "has_journal_access", False):
        return True
    if subscription_entitled:
        return True
    exp = getattr(user, "access_expires_at", None)
    if exp and datetime.utcnow() < exp:
        raw = (
            grants_override
            if grants_override is not None
            else getattr(user, "dashboard_module_grants", None)
        )
        if not normalize_module_grants(raw):
            return True
    return False


def effective_dashboard_modules(user, *, fully_entitled: bool, grants_override=None) -> dict[str, bool]:
    if not user:
        return {k: False for k in ALLOWED_MODULE_KEYS}
    if getattr(user, "role", None) == "admin" or fully_entitled:
        return {k: True for k in ALLOWED_MODULE_KEYS}
    raw = (
        grants_override
        if grants_override is not None
        else getattr(user, "dashboard_module_grants", None)
    )
    grants = normalize_module_grants(raw)
    return {k: bool(grants.get(k)) for k in ALLOWED_MODULE_KEYS}


def user_has_dashboard_module(
    user, module: str, *, fully_entitled: bool, grants_override=None
) -> bool:
    if not user or not module:
        return False
    key = str(module).strip().lower()
    if key not in ALLOWED_MODULE_KEYS:
        return False
    return bool(
        effective_dashboard_modules(
            user, fully_entitled=fully_entitled, grants_override=grants_override
        ).get(key)
    )


def user_has_any_dashboard_access(user, *, fully_entitled: bool, grants_override=None) -> bool:
    if not user:
        return False
    if fully_entitled:
        return True
    mods = effective_dashboard_modules(user, fully_entitled=False, grants_override=grants_override)
    return any(mods.values())


def modules_catalog() -> list[dict[str, str]]:
    return [{"key": k, "label": label} for k, label in DASHBOARD_MODULES]
