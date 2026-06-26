# journal-backend/dashboard/cache.py
"""
Optional Redis cache for dashboard metrics — "compute once, serve many".

Design:
  - Cache key includes user_id + profile_id + a filter hash + a per-user `data_version`.
  - Bumping `data_version` (on any trade write) invalidates ALL of that user's cached
    metrics atomically, with no key scanning.
  - If Redis is not configured/reachable, every function degrades gracefully to a no-op,
    so enabling this module never risks breaking requests.

Security: keys are namespaced per user + profile. Never build a cache key without them.
"""

import hashlib
import json
import os

try:
    import redis  # type: ignore
except Exception:  # redis not installed
    redis = None

_CLIENT = None
_CLIENT_TRIED = False

DEFAULT_TTL_SECONDS = int(os.environ.get("DASHBOARD_CACHE_TTL_SEC", "300"))


def _get_client():
    """Lazily create a Redis client; return None if unavailable (cache becomes a no-op)."""
    global _CLIENT, _CLIENT_TRIED
    if _CLIENT_TRIED:
        return _CLIENT
    _CLIENT_TRIED = True
    url = os.environ.get("REDIS_URL")
    if not url or redis is None:
        _CLIENT = None
        return None
    try:
        client = redis.Redis.from_url(url, socket_connect_timeout=1, socket_timeout=1)
        client.ping()
        _CLIENT = client
    except Exception:
        _CLIENT = None
    return _CLIENT


def _version_key(user_id):
    return f"dash:ver:{int(user_id)}"


def get_data_version(user_id):
    client = _get_client()
    if client is None:
        return "0"
    try:
        v = client.get(_version_key(user_id))
        return v.decode() if v else "0"
    except Exception:
        return "0"


def bump_data_version(user_id):
    """Call on any trade add/update/delete/import to invalidate this user's cached metrics."""
    client = _get_client()
    if client is None:
        return
    try:
        client.incr(_version_key(user_id))
    except Exception:
        pass


def _filter_hash(params):
    raw = json.dumps(params or {}, sort_keys=True, default=str)
    return hashlib.sha1(raw.encode()).hexdigest()[:16]


def make_key(user_id, profile_id, name, params=None):
    version = get_data_version(user_id)
    return (
        f"dash:{name}:{int(user_id)}:{profile_id}:{_filter_hash(params)}:v{version}"
    )


def get_json(key):
    client = _get_client()
    if client is None:
        return None
    try:
        raw = client.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


def set_json(key, value, ttl=DEFAULT_TTL_SECONDS):
    client = _get_client()
    if client is None:
        return
    try:
        client.setex(key, ttl, json.dumps(value, default=str))
    except Exception:
        pass
