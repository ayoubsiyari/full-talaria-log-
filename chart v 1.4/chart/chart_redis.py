"""
Optional Redis: distributed rate limits + binary worker wake (LPUSH/BRPOP).

If REDIS_URL is unset or Redis is unreachable, api_server falls back to in-memory counters.
"""

from __future__ import annotations

import os
import secrets
import threading
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from redis import Redis

KEY_PREFIX = "chart:"

_SLIDING_WINDOW_LUA = """
local zkey = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local maxn = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', zkey, '-inf', now - window)
redis.call('ZADD', zkey, now, member)
local n = redis.call('ZCARD', zkey)
redis.call('EXPIRE', zkey, math.ceil(window) + 2)
if n > maxn then
  redis.call('ZREM', zkey, member)
  return 0
end
return 1
"""

_BINARY_WAKE_LIST = f"{KEY_PREFIX}binary_wake"

_pool = None
_client: Redis | None = None
_lock = threading.Lock()


def _redis_url() -> str:
    return (os.getenv("REDIS_URL") or "").strip()


def get_client():
    """Singleton Redis client, or None if disabled / import error / connection failure."""
    global _pool, _client
    if not _redis_url():
        return None
    with _lock:
        if _client is not None:
            return _client
        try:
            from redis import Redis
            from redis.connection import ConnectionPool
        except ImportError:
            return None
        try:
            _pool = ConnectionPool.from_url(
                _redis_url(),
                decode_responses=True,
                max_connections=int(os.getenv("REDIS_MAX_CONNECTIONS", "32")),
                socket_connect_timeout=2.0,
                socket_timeout=5.0,
            )
            _client = Redis(connection_pool=_pool)
            _client.ping()
        except Exception:
            _pool = None
            _client = None
    return _client


def ping_ok() -> bool | None:
    """True if ping OK, False if configured but failed, None if Redis not configured."""
    if not _redis_url():
        return None
    c = get_client()
    if c is None:
        return False
    try:
        return bool(c.ping())
    except Exception:
        return False


def sliding_window_allow(redis_key: str, max_events: int, window_sec: float) -> bool:
    c = get_client()
    if c is None:
        raise RuntimeError("redis_unavailable")
    now = time.time()
    member = f"{now}:{secrets.token_hex(6)}"
    max_events = max(1, int(max_events))
    window_sec = float(window_sec)
    allowed = c.eval(_SLIDING_WINDOW_LUA, 1, redis_key, str(now), str(window_sec), str(max_events), member)
    return int(allowed) == 1


def signal_binary_job_queued() -> None:
    c = get_client()
    if c is None:
        return
    try:
        c.lpush(_BINARY_WAKE_LIST, "1")
        c.ltrim(_BINARY_WAKE_LIST, 0, 64)
    except Exception:
        pass


def brpop_wake(timeout_sec: float) -> bool:
    c = get_client()
    if c is None:
        return False
    t = max(1, min(int(timeout_sec), 60))
    try:
        return c.brpop(_BINARY_WAKE_LIST, timeout=t) is not None
    except Exception:
        return False
