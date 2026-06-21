"""
Subscription plan entitlements: apply, revoke, and resolve backtest limits.

Shared logic mirrored in chart v 1.4/chart/plan_entitlements.py — keep in sync.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any

_ACTIVE_SUB_STATUSES = frozenset({"active", "trialing"})
_TERMINAL_SUB_STATUSES = frozenset(
    {"canceled", "cancelled", "unpaid", "incomplete_expired", "incomplete"}
)


def _entitlements_json_candidates() -> tuple[Path, ...]:
    """Resolve shared/entitlements.json without assuming repo depth (Docker uses /app)."""
    here = Path(__file__).resolve().parent
    out: list[Path] = []
    seen: set[str] = set()
    env_path = (os.getenv("ENTITLEMENTS_CONFIG_PATH") or "").strip()
    if env_path:
        out.append(Path(env_path))
    for root in (here, *here.parents):
        candidate = root / "shared" / "entitlements.json"
        key = str(candidate)
        if key in seen:
            continue
        seen.add(key)
        out.append(candidate)
    return tuple(out)


def _load_entitlements_config() -> dict:
    for path in _entitlements_json_candidates():
        try:
            if path.is_file():
                with open(path, encoding="utf-8") as f:
                    data = json.load(f)
                return data if isinstance(data, dict) else {}
        except Exception:
            continue
    return {}


def free_tier_caps() -> dict:
    cfg = _load_entitlements_config()
    ft = cfg.get("free_tier") or {}
    defaults = cfg.get("defaults") or {}
    return {
        "max_trading_sessions": max(0, int(ft.get("max_trading_sessions", 1) or 1)),
        "max_tickers_per_session": max(0, int(ft.get("max_tickers_per_session", 2) or 2)),
        "max_supporting_tickers_per_session": max(
            0, int(ft.get("max_supporting_tickers_per_session", 2) or 2)
        ),
        "has_journal_access": bool(ft.get("has_journal_access", False)),
        "_defaults": {
            "max_trading_sessions": max(0, int(defaults.get("max_trading_sessions", 5) or 5)),
            "max_tickers_per_session": max(0, int(defaults.get("max_tickers_per_session", 5) or 5)),
            "max_supporting_tickers_per_session": max(
                0, int(defaults.get("max_supporting_tickers_per_session", 5) or 5)
            ),
        },
    }


def entitlements_resolver_v2_enabled() -> bool:
    env = os.getenv("ENTITLEMENTS_RESOLVER_V2", "").strip().lower()
    if env in ("1", "true", "yes", "on"):
        return True
    if env in ("0", "false", "no", "off"):
        return False
    cfg = _load_entitlements_config()
    return bool((cfg.get("feature_flags") or {}).get("ENTITLEMENTS_RESOLVER_V2", False))


def _normalize_plan_template(raw: dict) -> dict | None:
    if not isinstance(raw, dict):
        return None
    tid = str(raw.get("id") or "").strip()
    label = str(raw.get("label") or "").strip()
    if not tid or not label:
        return None
    features_raw = raw.get("features")
    features: list[str] = []
    if isinstance(features_raw, list):
        features = [str(x).strip() for x in features_raw if str(x).strip()]
    return {
        "id": tid,
        "label": label,
        "description": str(raw.get("description") or "").strip(),
        "max_trading_sessions": max(0, int(raw.get("max_trading_sessions", 0) or 0)),
        "max_tickers_per_session": max(0, int(raw.get("max_tickers_per_session", 0) or 0)),
        "max_supporting_tickers_per_session": max(
            0, int(raw.get("max_supporting_tickers_per_session", 0) or 0)
        ),
        "tier_rank": max(0, int(raw.get("tier_rank", 0) or 0)),
        "features": features,
    }


def plan_templates() -> list[dict]:
    """Ready-made entitlement presets for admin plan creation."""
    cfg = _load_entitlements_config()
    raw = cfg.get("plan_templates")
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    for item in raw:
        norm = _normalize_plan_template(item)
        if norm:
            out.append(norm)
    return out


_ENTITLEMENT_FEATURE_RES = (
    re.compile(r"^\d+\s+backtest\s+sessions?$", re.I),
    re.compile(r"^\d+\s+trading\s+tickers?\s+per\s+session$", re.I),
    re.compile(r"^\d+\s+supporting\s+tickers?\s+per\s+session$", re.I),
    re.compile(r"^unlimited\s+backtest\s+sessions?$", re.I),
    re.compile(r"^unlimited\s+(trading\s+)?tickers?\s+per\s+session$", re.I),
    re.compile(r"^unlimited\s+supporting\s+tickers?\s+per\s+session$", re.I),
)


def is_entitlement_feature_line(line: str) -> bool:
    """True when a stored feature line duplicates auto-generated cap bullets."""
    text = str(line or "").strip()
    if not text:
        return False
    return any(r.match(text) for r in _ENTITLEMENT_FEATURE_RES)


def plan_entitlement_display_lines(
    *,
    max_trading_sessions=None,
    max_tickers_per_session=None,
    max_supporting_tickers_per_session=None,
) -> list[str]:
    """Pricing/admin bullets derived from numeric plan caps (source of truth)."""
    lines: list[str] = []
    if max_trading_sessions is not None:
        ms = int(max_trading_sessions)
        if ms == 0:
            lines.append("Unlimited backtest sessions")
        elif ms > 0:
            lines.append(f"{ms} backtest session{'s' if ms != 1 else ''}")
    if max_tickers_per_session is not None:
        mt = int(max_tickers_per_session)
        if mt == 0:
            lines.append("Unlimited trading tickers per session")
        elif mt > 0:
            lines.append(f"{mt} trading ticker{'s' if mt != 1 else ''} per session")
    if max_supporting_tickers_per_session is not None:
        msu = int(max_supporting_tickers_per_session)
        if msu == 0:
            lines.append("Unlimited supporting tickers per session")
        elif msu > 0:
            lines.append(f"{msu} supporting ticker{'s' if msu != 1 else ''} per session")
    return lines


def merge_plan_features_for_display(
    *,
    max_trading_sessions=None,
    max_tickers_per_session=None,
    max_supporting_tickers_per_session=None,
    stored_features=None,
) -> list[str]:
    """Cap lines first (from DB fields), then marketing features — no duplicates."""
    caps = plan_entitlement_display_lines(
        max_trading_sessions=max_trading_sessions,
        max_tickers_per_session=max_tickers_per_session,
        max_supporting_tickers_per_session=max_supporting_tickers_per_session,
    )
    extras: list[str] = []
    for raw in stored_features or []:
        line = str(raw).strip()
        if not line or is_entitlement_feature_line(line):
            continue
        extras.append(line)
    seen: set[str] = set()
    out: list[str] = []
    for line in caps + extras:
        key = line.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(line)
    return out


def _cap_int(raw, fallback: int) -> int:
    if raw is None:
        return max(0, fallback)
    try:
        return max(0, int(raw))
    except (TypeError, ValueError):
        return max(0, fallback)


def plan_backtest_caps(plan) -> dict:
    """Extract enforceable backtest caps from a subscription plan row."""
    ft = free_tier_caps()
    defaults = ft["_defaults"]
    if not plan:
        return {
            "max_trading_sessions": defaults["max_trading_sessions"],
            "max_tickers_per_session": defaults["max_tickers_per_session"],
            "max_supporting_tickers_per_session": defaults["max_supporting_tickers_per_session"],
        }
    return {
        "max_trading_sessions": _cap_int(
            getattr(plan, "max_trading_sessions", None),
            defaults["max_trading_sessions"],
        ),
        "max_tickers_per_session": _cap_int(
            getattr(plan, "max_tickers_per_session", None),
            defaults["max_tickers_per_session"],
        ),
        "max_supporting_tickers_per_session": _cap_int(
            getattr(plan, "max_supporting_tickers_per_session", None),
            defaults["max_supporting_tickers_per_session"],
        ),
    }


def _apply_caps_to_user(user, caps: dict, *, entitlements_override: bool) -> None:
    if not user:
        return
    user.max_trading_sessions = caps["max_trading_sessions"]
    user.max_tickers_per_session = caps["max_tickers_per_session"]
    user.max_supporting_tickers_per_session = caps["max_supporting_tickers_per_session"]
    if hasattr(user, "entitlements_override"):
        user.entitlements_override = entitlements_override


def apply_plan_entitlements(user, plan) -> None:
    """Copy plan caps to user cache; clear admin override flag."""
    caps = plan_backtest_caps(plan)
    _apply_caps_to_user(user, caps, entitlements_override=False)


def apply_admin_override(user, caps: dict | None = None) -> None:
    """Mark user limits as admin-custom (not synced from plan)."""
    if not user:
        return
    if caps:
        _apply_caps_to_user(user, caps, entitlements_override=True)
    elif hasattr(user, "entitlements_override"):
        user.entitlements_override = True


def revoke_to_free_tier(user) -> None:
    """Immediate cancel policy: revert to free-tier caps."""
    if not user:
        return
    if getattr(user, "entitlements_override", False):
        return
    ft = free_tier_caps()
    _apply_caps_to_user(
        user,
        {
            "max_trading_sessions": ft["max_trading_sessions"],
            "max_tickers_per_session": ft["max_tickers_per_session"],
            "max_supporting_tickers_per_session": ft["max_supporting_tickers_per_session"],
        },
        entitlements_override=False,
    )


def legacy_user_column_limits(user) -> dict:
    """Read limits directly from user row (pre-resolver behavior)."""
    ft = free_tier_caps()
    defaults = ft["_defaults"]
    return {
        "max_trading_sessions": _cap_int(getattr(user, "max_trading_sessions", None), defaults["max_trading_sessions"]),
        "max_tickers_per_session": _cap_int(
            getattr(user, "max_tickers_per_session", None), defaults["max_tickers_per_session"]
        ),
        "max_supporting_tickers_per_session": _cap_int(
            getattr(user, "max_supporting_tickers_per_session", None),
            defaults["max_supporting_tickers_per_session"],
        ),
    }


def _admin_extension_active(user) -> bool:
    exp = getattr(user, "access_expires_at", None)
    return bool(exp and datetime.utcnow() < exp)


def _resolve_entitlements_source(user, *, has_active_plan: bool) -> str:
    if getattr(user, "role", "") == "admin":
        return "admin"
    if getattr(user, "entitlements_override", False):
        return "override"
    if has_active_plan:
        return "plan"
    if _admin_extension_active(user):
        return "extension"
    return "free"


def effective_backtest_limits(
    user,
    *,
    active_subscription=None,
    active_plan=None,
) -> dict:
    """
    Resolve backtest caps for enforcement and /api/auth/me.

    Callers pass pre-loaded subscription/plan when available to avoid extra queries.
    """
    if getattr(user, "role", "") == "admin":
        return {
            "max_trading_sessions": 0,
            "max_tickers_per_session": 0,
            "max_supporting_tickers_per_session": 0,
            "entitlements_source": "admin",
        }

    if getattr(user, "entitlements_override", False):
        caps = legacy_user_column_limits(user)
        caps["entitlements_source"] = "override"
        return caps

    sub = active_subscription
    plan = active_plan
    if sub and getattr(sub, "status", "").lower() in _ACTIVE_SUB_STATUSES and getattr(sub, "plan_id", None):
        if plan is None and hasattr(sub, "plan"):
            plan = sub.plan
        if plan:
            caps = plan_backtest_caps(plan)
            caps["entitlements_source"] = "plan"
            return caps

    if _admin_extension_active(user):
        caps = legacy_user_column_limits(user)
        caps["entitlements_source"] = "extension"
        return caps

    ft = free_tier_caps()
    return {
        "max_trading_sessions": ft["max_trading_sessions"],
        "max_tickers_per_session": ft["max_tickers_per_session"],
        "max_supporting_tickers_per_session": ft["max_supporting_tickers_per_session"],
        "entitlements_source": "free",
    }


def user_should_revoke_entitlements(user, subscription_model, db_session) -> bool:
    """True when user has no active/trialing sub, no admin extension, no override."""
    if not user or getattr(user, "entitlements_override", False):
        return False
    if _admin_extension_active(user):
        return False
    uid = getattr(user, "id", None)
    if uid is None:
        return True
    active = (
        db_session.query(subscription_model)
        .filter(
            subscription_model.user_id == uid,
            subscription_model.status.in_(list(_ACTIVE_SUB_STATUSES)),
        )
        .first()
    )
    return active is None


def subscription_status_requires_revoke(status: str | None) -> bool:
    return (status or "").lower() in _TERMINAL_SUB_STATUSES
