"""
Optional Redis: distributed rate limits + binary worker wake (LPUSH/BRPOP).

If REDIS_URL is unset or Redis is unreachable, api_server falls back to in-memory counters.
"""

from __future__ import annotations

import json
import os
import secrets
import threading
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from redis import Redis

KEY_PREFIX = "chart:"

_BINARY_WAKE_LIST = f"{KEY_PREFIX}binary_wake"
_WHATIF_QUEUE_LIST = f"{KEY_PREFIX}whatif:queue"
_WHATIF_WAKE_LIST = f"{KEY_PREFIX}whatif:wake"
_WHATIF_JOB_PREFIX = f"{KEY_PREFIX}whatif:job:"
_WHATIF_CACHE_PREFIX = f"{KEY_PREFIX}whatif:cache:"
_NEWS_HIST_CACHE_PREFIX = f"{KEY_PREFIX}news:hist:"

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
    """
    Sliding-window limiter using a sorted set (ZSET). Uses a pipeline (not Lua) so it works
    with fakeredis in tests; under extreme concurrency a few extra events may slip through.
    """
    c = get_client()
    if c is None:
        raise RuntimeError("redis_unavailable")
    now = time.time()
    member = f"{now}:{secrets.token_hex(6)}"
    max_events = max(1, int(max_events))
    window_sec = float(window_sec)
    pipe = c.pipeline()
    pipe.zremrangebyscore(redis_key, "-inf", now - window_sec)
    pipe.zadd(redis_key, {member: now})
    pipe.zcard(redis_key)
    pipe.expire(redis_key, int(window_sec) + 2)
    _, _, n, _ = pipe.execute()
    if int(n) > max_events:
        c.zrem(redis_key, member)
        return False
    return True


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


def _json_load(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def whatif_enqueue_job(job: dict) -> bool:
    c = get_client()
    if c is None:
        return False
    job_id = str(job.get("job_id") or "").strip()
    if not job_id:
        return False
    try:
        payload = json.dumps(job, separators=(",", ":"))
        pipe = c.pipeline()
        pipe.setex(f"{_WHATIF_JOB_PREFIX}{job_id}", 900, payload)
        pipe.lpush(_WHATIF_QUEUE_LIST, job_id)
        pipe.ltrim(_WHATIF_QUEUE_LIST, 0, 512)
        pipe.lpush(_WHATIF_WAKE_LIST, job_id)
        pipe.ltrim(_WHATIF_WAKE_LIST, 0, 64)
        pipe.execute()
        return True
    except Exception:
        return False


def whatif_pop_job_nonblocking() -> str | None:
    c = get_client()
    if c is None:
        return None
    try:
        job_id = c.lpop(_WHATIF_QUEUE_LIST)
        return str(job_id).strip() if job_id else None
    except Exception:
        return None


def whatif_brpop_job(timeout_sec: float) -> str | None:
    c = get_client()
    if c is None:
        return None
    t = max(1, min(int(timeout_sec), 60))
    try:
        item = c.brpop(_WHATIF_QUEUE_LIST, timeout=t)
        if not item:
            return None
        _, job_id = item
        return str(job_id).strip() or None
    except Exception:
        return None


def whatif_signal_wake() -> None:
    c = get_client()
    if c is None:
        return
    try:
        c.lpush(_WHATIF_WAKE_LIST, "1")
        c.ltrim(_WHATIF_WAKE_LIST, 0, 64)
    except Exception:
        pass


def whatif_get_job(job_id: str) -> dict | None:
    c = get_client()
    if c is None or not job_id:
        return None
    try:
        return _json_load(c.get(f"{_WHATIF_JOB_PREFIX}{job_id}"))
    except Exception:
        return None


def whatif_set_job(job_id: str, data: dict, ttl_sec: int) -> None:
    c = get_client()
    if c is None or not job_id:
        return
    try:
        c.setex(f"{_WHATIF_JOB_PREFIX}{job_id}", max(60, int(ttl_sec)), json.dumps(data, separators=(",", ":")))
    except Exception:
        pass


def whatif_get_cache(cache_key: str) -> dict | None:
    c = get_client()
    if c is None or not cache_key:
        return None
    try:
        raw = c.get(f"{_WHATIF_CACHE_PREFIX}{cache_key}")
        data = _json_load(raw)
        if data and isinstance(data.get("result"), dict):
            return data["result"]
        return None
    except Exception:
        return None


def whatif_set_cache(cache_key: str, result: dict, ttl_sec: int) -> None:
    c = get_client()
    if c is None or not cache_key:
        return
    try:
        body = json.dumps({"result": result}, separators=(",", ":"))
        if len(body) > 8_000_000:
            return
        c.setex(f"{_WHATIF_CACHE_PREFIX}{cache_key}", max(60, int(ttl_sec)), body)
    except Exception:
        pass


def news_hist_get_cache(cache_key: str) -> dict | None:
    c = get_client()
    if c is None or not cache_key:
        return None
    try:
        return _json_load(c.get(f"{_NEWS_HIST_CACHE_PREFIX}{cache_key}"))
    except Exception:
        return None


def news_hist_set_cache(cache_key: str, payload: dict, ttl_sec: int) -> None:
    c = get_client()
    if c is None or not cache_key:
        return
    try:
        body = json.dumps(payload, separators=(",", ":"))
        if len(body) > 4_000_000:
            return
        c.setex(f"{_NEWS_HIST_CACHE_PREFIX}{cache_key}", max(300, int(ttl_sec)), body)
    except Exception:
        pass


def brpop_background_wake(timeout_sec: float) -> bool:
    """Block until binary or what-if worker has work."""
    c = get_client()
    if c is None:
        return False
    t = max(1, min(int(timeout_sec), 60))
    try:
        return c.brpop([_WHATIF_WAKE_LIST, _BINARY_WAKE_LIST], timeout=t) is not None
    except Exception:
        return False
