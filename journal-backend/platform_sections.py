"""Platform section kill-switches (shared app_settings table, managed from chart admin)."""

from __future__ import annotations

import json
import os

from sqlalchemy import text

from models import db

PLATFORM_SECTION_KEYS = (
    "dashboard",
    "trades",
    "sessions",
    "strategies",
    "resources",
    "support",
)

BACKTEST_SESSIONS_ENABLED_SETTING = "backtest_sessions_enabled"


def _truthy(v) -> bool:
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def _section_setting_key(section: str) -> str:
    return f"platform_section_{section}_enabled"


def platform_section_enabled(section: str, default: bool = True) -> bool:
    if section not in PLATFORM_SECTION_KEYS:
        return default
    key = _section_setting_key(section)
    try:
        row = db.session.execute(
            text("SELECT value FROM app_settings WHERE key = :k"),
            {"k": key},
        ).first()
        if row and row[0] is not None:
            return _truthy(row[0])
        if section == "sessions":
            legacy = db.session.execute(
                text("SELECT value FROM app_settings WHERE key = :k"),
                {"k": BACKTEST_SESSIONS_ENABLED_SETTING},
            ).first()
            if legacy and legacy[0] is not None:
                return _truthy(legacy[0])
    except Exception:
        pass
    return default


def normalize_section_grants(raw) -> dict:
    """Per-user page overrides (grant-only): known sections explicitly set True.

    Keep in sync with chart api_server.normalize_section_grants.
    """
    if isinstance(raw, str) and raw.strip():
        try:
            raw = json.loads(raw)
        except Exception:
            raw = None
    if not isinstance(raw, dict):
        return {}
    out: dict[str, bool] = {}
    for key, val in raw.items():
        sk = str(key).strip().lower()
        if sk in PLATFORM_SECTION_KEYS and val is True:
            out[sk] = True
    return out


def user_section_grant_on(user, section: str) -> bool:
    return bool(
        normalize_section_grants(getattr(user, "platform_section_grants", None)).get(section)
    )


def user_may_use_platform_section(user, section: str) -> bool:
    if not user:
        return False
    if (getattr(user, "role", None) or "") == "admin":
        return True
    # Per-user grant-only override: force-open a page for this user even when the
    # global switch is OFF (e.g. testers / support). Never hides a globally-on page.
    if user_section_grant_on(user, section):
        return True
    return platform_section_enabled(section)
