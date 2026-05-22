"""QuestDB bars integration tests — skipped when QuestDB is not configured."""
import os

import pytest

import questdb_store
from bar_budget import choose_resolution


pytestmark = pytest.mark.skipif(
    not questdb_store.questdb_enabled() or not questdb_store._pg_url(),
    reason="QuestDB not configured (set QUESTDB_ENABLED + QUESTDB_PG_URL)",
)


def test_ping():
    assert questdb_store.ping_ok() is True


def test_schema_and_roundtrip():
    questdb_store.ensure_schema()
    fid = 999999
    questdb_store.delete_file_data(fid)
    candles = [
        {"t": 1640995200000 + i * 60_000, "o": 1.0, "h": 1.1, "l": 0.9, "c": 1.05, "v": 10}
        for i in range(120)
    ]
    questdb_store.sync_file_candles(fid, candles)
    assert questdb_store.count_bars(fid) == 120

    from_ms = candles[0]["t"]
    to_ms = candles[-1]["t"]
    res = choose_resolution(from_ms, to_ms, "auto")
    bars = questdb_store.query_bars(fid, res, from_ms, to_ms, limit=2000)
    assert len(bars) >= 1
    assert bars[0]["t"] >= from_ms
    questdb_store.delete_file_data(fid)
