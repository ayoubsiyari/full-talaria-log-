from __future__ import annotations

from typing import Any


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        out = float(value)
        if out != out:  # NaN
            return default
        return out
    except (TypeError, ValueError):
        return default


def to_ticker(raw: Any) -> str:
    txt = str(raw or "UNKNOWN").replace("/", "").strip().upper()
    return txt or "UNKNOWN"

