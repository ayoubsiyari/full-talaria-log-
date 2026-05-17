"""Per-user backtest rate limit helpers (fakeredis + in-memory fallback)."""

import fakeredis
import pytest

import chart_redis


@pytest.fixture(autouse=True)
def _reset_chart_redis_singleton(monkeypatch):
    import chart_redis as cr

    monkeypatch.setattr(cr, "_pool", None)
    monkeypatch.setattr(cr, "_client", None)
    yield
    monkeypatch.setattr(cr, "_pool", None)
    monkeypatch.setattr(cr, "_client", None)


@pytest.fixture
def fake_redis(monkeypatch):
    r = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(chart_redis, "get_client", lambda: r)
    return r


class _FakeUser:
    def __init__(self, uid: int, role: str = "user"):
        self.id = uid
        self.role = role


def test_backtest_user_rate_blocks_after_limit(fake_redis, monkeypatch):
    import api_server as api

    monkeypatch.setattr(api, "BACKTEST_WHATIF_RATE_PER_MINUTE", 2)
    api._backtest_whatif_user_times.clear()
    user = _FakeUser(42)
    assert api._backtest_user_rate_allow(user, "whatif") is True
    assert api._backtest_user_rate_allow(user, "whatif") is True
    assert api._backtest_user_rate_allow(user, "whatif") is False


def test_backtest_admin_exempt(fake_redis, monkeypatch):
    import api_server as api

    monkeypatch.setattr(api, "BACKTEST_WHATIF_RATE_PER_MINUTE", 1)
    api._backtest_whatif_user_times.clear()
    admin = _FakeUser(1, role="admin")
    assert api._backtest_user_rate_allow(admin, "whatif") is True
    assert api._backtest_user_rate_allow(admin, "whatif") is True
