"""
Bar-budget resolution selection for bounded OHLC range queries.
"""
from __future__ import annotations

TARGET_BARS = 800
MAX_BARS = 2000

# Minutes per bar for each supported resolution (finest → coarsest).
TIMEFRAMES_MIN: list[tuple[str, int]] = [
    ("1m", 1),
    ("5m", 5),
    ("15m", 15),
    ("1h", 60),
    ("4h", 240),
    ("1d", 1440),
    ("1w", 10080),
]

RESOLUTION_TO_TABLE: dict[str, str] = {
    "1m": "ohlcv_1m",
    "5m": "ohlcv_5m",
    "15m": "ohlcv_15m",
    "1h": "ohlcv_1h",
    "4h": "ohlcv_4h",
    "1d": "ohlcv_1d",
    "1w": "ohlcv_1w",
}

TABLE_TO_RESOLUTION: dict[str, str] = {v: k for k, v in RESOLUTION_TO_TABLE.items()}


def choose_resolution(from_ms: int, to_ms: int, explicit: str | None = None) -> str:
    """
    Pick the finest timeframe where bar count <= MAX_BARS, preferring TARGET_BARS.
    """
    if explicit and explicit.lower() not in ("auto", ""):
        res = explicit.lower().strip()
        if res not in RESOLUTION_TO_TABLE:
            raise ValueError(f"Unsupported resolution: {explicit}")
        return res

    if to_ms <= from_ms:
        return "1m"

    span_minutes = max(1, (to_ms - from_ms) / 60_000.0)

    best: str | None = None

    for name, tf_min in TIMEFRAMES_MIN:
        bars = span_minutes / tf_min
        if bars <= MAX_BARS:
            return name

    return TIMEFRAMES_MIN[-1][0]


def resolution_table(resolution: str) -> str:
    key = resolution.lower().strip()
    if key not in RESOLUTION_TO_TABLE:
        raise ValueError(f"Unsupported resolution: {resolution}")
    return RESOLUTION_TO_TABLE[key]
