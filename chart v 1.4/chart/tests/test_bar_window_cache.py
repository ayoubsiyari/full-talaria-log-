"""Tests for shared Redis bar window cache (fakeredis)."""

import pytest
import fakeredis

import chart_redis
import bar_window_cache


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
    monkeypatch.setenv("BACKTEST_BARS_CACHE_ENABLED", "true")
    return r


def test_bars_cache_roundtrip(fake_redis):
    key = bar_window_cache.bars_cache_key(
        42, from_ms=1000, to_ms=2000, resolution="1m", limit=800
    )
    payload = {
        "file_id": 42,
        "resolution": "1m",
        "bars": [{"t": 1000, "o": 1, "h": 2, "l": 0.5, "c": 1.5, "v": 10}],
        "returned": 1,
        "has_more_left": False,
        "has_more_right": True,
        "source": "tiles",
    }
    assert bar_window_cache.get_bars(key) is None
    bar_window_cache.set_bars(key, payload)
    got = bar_window_cache.get_bars(key)
    assert got == payload


def test_smart_cache_roundtrip(fake_redis):
    key = bar_window_cache.smart_cache_key(
        7,
        timeframe="5m",
        limit=500,
        start_ts=None,
        end_ts=999999,
        anchor="end",
        response_format="candles",
        resolution=None,
    )
    payload = {
        "timeframe": "5m",
        "candles": [{"t": 1000, "o": 1, "h": 2, "l": 0.5, "c": 1.5, "v": 0}],
        "returned": 1,
        "source": "tiles",
    }
    bar_window_cache.set_smart(key, payload)
    assert bar_window_cache.get_smart(key) == payload


def test_cache_skips_empty_payload(fake_redis):
    key = bar_window_cache.bars_cache_key(
        1, from_ms=None, to_ms=None, resolution="1m", limit=100
    )
    bar_window_cache.set_bars(key, {"bars": [], "returned": 0})
    assert bar_window_cache.get_bars(key) is None


def test_invalidate_file_scoped(fake_redis):
    k1 = bar_window_cache.bars_cache_key(99, from_ms=1, to_ms=2, resolution="1m", limit=10)
    k2 = bar_window_cache.bars_cache_key(100, from_ms=1, to_ms=2, resolution="1m", limit=10)
    bar_window_cache.set_bars(k1, {"bars": [{"t": 1, "o": 1, "h": 1, "l": 1, "c": 1, "v": 0}]})
    bar_window_cache.set_bars(k2, {"bars": [{"t": 1, "o": 1, "h": 1, "l": 1, "c": 1, "v": 0}]})
    bar_window_cache.invalidate_file(99)
    assert bar_window_cache.get_bars(k1) is None
    assert bar_window_cache.get_bars(k2) is not None


def test_disabled_when_no_redis(monkeypatch):
    monkeypatch.setattr(chart_redis, "get_client", lambda: None)
    key = bar_window_cache.bars_cache_key(1, from_ms=0, to_ms=1, resolution="1m", limit=10)
    bar_window_cache.set_bars(key, {"bars": [{"t": 1, "o": 1, "h": 1, "l": 1, "c": 1, "v": 0}]})
    assert bar_window_cache.get_bars(key) is None
