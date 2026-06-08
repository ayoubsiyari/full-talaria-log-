"""
Shared Redis cache for GET /api/file/{id}/bars and /smart responses.

Identical bar windows (same file + range + TF + limit) are served from one cached
JSON blob across all gunicorn workers — critical for multichart (4 panels × N users).

Falls back silently when REDIS_URL is unset or Redis is down.
"""

from __future__ import annotations

import json
import os
from typing import Any

import chart_redis

_BARS_PREFIX = f"{chart_redis.KEY_PREFIX}bars:win:"
_SMART_PREFIX = f"{chart_redis.KEY_PREFIX}smart:win:"


def _enabled() -> bool:
    if chart_redis.get_client() is None:
        return False
    raw = (os.getenv("BACKTEST_BARS_CACHE_ENABLED") or "true").strip().lower()
    return raw not in ("0", "false", "no", "off")


def _ttl_sec(timeframe: str | None = None) -> int:
    """Return TTL in seconds.

    Pre-built tiles for higher timeframes (5m+) are aggregated once at upload
    time and never change — cache them much longer than 1m windows.
    Override with BACKTEST_BARS_CACHE_TTL_SEC (applies to 1m / default).
    Override pre-built TTL with BACKTEST_BARS_CACHE_TTL_PREBUILT_SEC.
    """
    try:
        base = max(30, int(os.getenv("BACKTEST_BARS_CACHE_TTL_SEC", "300")))
    except (TypeError, ValueError):
        base = 300

    _PREBUILT_TFS = {"5m", "15m", "30m", "1h", "4h", "1d", "1w", "1mo"}
    if timeframe and str(timeframe).lower().strip() in _PREBUILT_TFS:
        try:
            return max(base, int(os.getenv("BACKTEST_BARS_CACHE_TTL_PREBUILT_SEC", "3600")))
        except (TypeError, ValueError):
            return max(base, 3600)
    return base


def _max_bytes() -> int:
    try:
        return max(64_000, int(os.getenv("BACKTEST_BARS_CACHE_MAX_BYTES", "8000000")))
    except (TypeError, ValueError):
        return 8_000_000


def bars_cache_key(
    file_id: int,
    *,
    from_ms: int | None,
    to_ms: int | None,
    resolution: str,
    limit: int,
) -> str:
    return "|".join([
        str(int(file_id)),
        str(from_ms if from_ms is not None else ""),
        str(to_ms if to_ms is not None else ""),
        str(resolution or "auto").lower().strip(),
        str(int(limit)),
    ])


def smart_cache_key(
    file_id: int,
    *,
    timeframe: str,
    limit: int,
    start_ts: int | None,
    end_ts: int | None,
    anchor: str,
    response_format: str,
    resolution: str | None,
) -> str:
    return "|".join([
        str(int(file_id)),
        str(timeframe or "1m").lower().strip(),
        str(int(limit)),
        str(start_ts if start_ts is not None else ""),
        str(end_ts if end_ts is not None else ""),
        str(anchor or "end").lower().strip(),
        str(response_format or "csv").lower().strip(),
        str(resolution or "").lower().strip(),
    ])


def get_bars(key: str) -> dict | None:
    return _get(_BARS_PREFIX, key)


def set_bars(key: str, payload: dict, *, timeframe: str | None = None) -> None:
    _set(_BARS_PREFIX, key, payload, timeframe=timeframe)


def get_smart(key: str) -> dict | None:
    return _get(_SMART_PREFIX, key)


def set_smart(key: str, payload: dict, *, timeframe: str | None = None) -> None:
    _set(_SMART_PREFIX, key, payload, timeframe=timeframe)


def invalidate_file(file_id: int) -> None:
    """Best-effort drop of cached windows for one dataset (after tile rebuild)."""
    c = chart_redis.get_client()
    if c is None or file_id is None:
        return
    fid = str(int(file_id))
    try:
        for prefix in (_BARS_PREFIX, _SMART_PREFIX):
            pattern = f"{prefix}{fid}|*"
            cursor = 0
            while True:
                cursor, keys = c.scan(cursor=cursor, match=pattern, count=128)
                if keys:
                    c.delete(*keys)
                if cursor == 0:
                    break
    except Exception:
        pass


def _get(prefix: str, key: str) -> dict | None:
    if not _enabled() or not key:
        return None
    c = chart_redis.get_client()
    if c is None:
        return None
    try:
        raw = c.get(f"{prefix}{key}")
        if not raw:
            return None
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _set(prefix: str, key: str, payload: dict, *, timeframe: str | None = None) -> None:
    if not _enabled() or not key or not isinstance(payload, dict):
        return
    if not payload.get("bars") and not payload.get("candles") and not payload.get("data"):
        return
    c = chart_redis.get_client()
    if c is None:
        return
    try:
        body = json.dumps(payload, separators=(",", ":"), default=str)
        if len(body) > _max_bytes():
            return
        c.setex(f"{prefix}{key}", _ttl_sec(timeframe), body)
    except Exception:
        pass
