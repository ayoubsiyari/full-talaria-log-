"""Redis what-if queue + cache helpers (fakeredis)."""

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


def test_whatif_enqueue_pop_and_cache(fake_redis):
    job = {
        "job_id": "job-test-1",
        "user_id": 7,
        "status": "queued",
        "cache_key": "cachekey1",
        "session_id": 99,
    }
    assert chart_redis.whatif_enqueue_job(job) is True
    popped = chart_redis.whatif_pop_job_nonblocking()
    assert popped == "job-test-1"
    loaded = chart_redis.whatif_get_job("job-test-1")
    assert loaded is not None
    assert loaded["user_id"] == 7

    result = {"meta": {"session_id": 99}, "equity_curve": []}
    chart_redis.whatif_set_cache("cachekey1", result, 120)
    cached = chart_redis.whatif_get_cache("cachekey1")
    assert cached == result
