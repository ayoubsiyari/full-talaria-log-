"""Tests for chart_redis sliding window and wake helpers (fakeredis, no real Redis)."""

import time

import fakeredis
import pytest

import chart_redis


@pytest.fixture(autouse=True)
def _reset_chart_redis_singleton(monkeypatch):
    """Avoid leaking FakeRedis into other tests."""
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


def test_sliding_window_allow_under_limit(fake_redis):
    key = "chart:test:sw"
    assert chart_redis.sliding_window_allow(key, max_events=3, window_sec=60.0) is True
    assert chart_redis.sliding_window_allow(key, max_events=3, window_sec=60.0) is True
    assert chart_redis.sliding_window_allow(key, max_events=3, window_sec=60.0) is True


def test_sliding_window_allow_blocks_fourth(fake_redis):
    key = "chart:test:sw2"
    assert chart_redis.sliding_window_allow(key, 3, 60.0) is True
    assert chart_redis.sliding_window_allow(key, 3, 60.0) is True
    assert chart_redis.sliding_window_allow(key, 3, 60.0) is True
    assert chart_redis.sliding_window_allow(key, 3, 60.0) is False


def test_sliding_window_allow_after_window(fake_redis, monkeypatch):
    key = "chart:test:sw3"
    t0 = 1_000_000.0
    monkeypatch.setattr(time, "time", lambda: t0)
    assert chart_redis.sliding_window_allow(key, 2, 10.0) is True
    assert chart_redis.sliding_window_allow(key, 2, 10.0) is True
    assert chart_redis.sliding_window_allow(key, 2, 10.0) is False
    monkeypatch.setattr(time, "time", lambda: t0 + 11.0)
    assert chart_redis.sliding_window_allow(key, 2, 10.0) is True


def test_signal_and_brpop_wake(fake_redis):
    assert chart_redis.brpop_wake(1) is False
    chart_redis.signal_binary_job_queued()
    assert chart_redis.brpop_wake(2) is True
