"""Unit tests for bar-budget resolution selection."""
from bar_budget import MAX_BARS, TARGET_BARS, choose_resolution


def _ms(year, month, day):
    from datetime import datetime, timezone
    return int(datetime(year, month, day, tzinfo=timezone.utc).timestamp() * 1000)


def test_sixteen_year_span_picks_weekly():
    start = _ms(2010, 1, 1)
    end = _ms(2026, 1, 1)
    res = choose_resolution(start, end)
    assert res == "1w"
    span_min = (end - start) / 60_000
    bars = span_min / 10080
    assert bars <= MAX_BARS


def test_one_month_span_picks_hourly():
    start = _ms(2024, 1, 1)
    end = _ms(2024, 2, 1)
    res = choose_resolution(start, end)
    assert res == "1h"


def test_one_day_span_picks_one_minute():
    start = _ms(2024, 6, 3, )
    end = start + 24 * 60 * 60 * 1000
    res = choose_resolution(start, end)
    assert res == "1m"


def test_explicit_resolution():
    start = _ms(2010, 1, 1)
    end = _ms(2026, 1, 1)
    assert choose_resolution(start, end, "1h") == "1h"


def test_auto_prefers_near_target_bars():
    # ~30 days → should land near TARGET_BARS with 1h
    start = _ms(2024, 3, 1)
    end = _ms(2024, 3, 31)
    res = choose_resolution(start, end, "auto")
    assert res in ("1h", "15m", "4h")
