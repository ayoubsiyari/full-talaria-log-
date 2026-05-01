#!/usr/bin/env python3
"""
Generate a UTF-8 CSV of synthetic trades for analytics / what-if testing.

Usage:
  python3 scripts/generate_analytics_demo_trades.py
  python3 scripts/generate_analytics_demo_trades.py 500 /path/to/out.csv

Default output (repo layout): ../../../homepage/public/samples/analytics-demo-500-trades.csv
"""

from __future__ import annotations

import csv
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

_PAIRS = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100"]
_SETUPS = ["Breakout", "Pullback", "Reversal", "CSV"]


def _default_out() -> Path:
    root = Path(__file__).resolve().parents[3]
    return root / "homepage" / "public" / "samples" / "analytics-demo-500-trades.csv"


def generate(n: int, start: datetime | None = None) -> list[dict[str, object]]:
    random.seed(42)
    t = start or datetime(2023, 1, 3, 8, 0, tzinfo=timezone.utc)
    rows: list[dict[str, object]] = []
    for i in range(n):
        pair = _PAIRS[i % len(_PAIRS)]
        o = t
        hold_h = random.randint(1, 72)
        c = o + timedelta(hours=hold_h)
        t = c + timedelta(minutes=random.randint(15, 180))
        risk = 80.0 + random.randint(0, 160)
        win = random.random() < 0.52
        r = random.uniform(0.35, 2.1) if win else -random.uniform(0.25, 1.35)
        pnl = r * risk
        mae = -random.uniform(0.05, 1.0)
        mfe = random.uniform(0.08, 2.4)
        if not win:
            mfe = min(mfe, 0.85)
        rows.append(
            {
                "tradeId": f"demo-{i + 1}",
                "ticker": pair,
                "direction": random.choice(["BUY", "SELL"]),
                "setup": _SETUPS[i % len(_SETUPS)],
                "netPnL": round(pnl, 2),
                "openTime": int(o.timestamp() * 1000),
                "closeTime": int(c.timestamp() * 1000),
                "rMultiple": round(r, 2),
                "mae_r": round(mae, 2),
                "mfe_r": round(mfe, 2),
                "quantity": 1,
                "riskAmount": risk,
                "spread_pips_at_entry": round(random.uniform(0.6, 2.0), 1),
                "commission_at_entry": round(random.uniform(1.0, 4.0), 1),
                "pip_value_at_entry": 8.0 if "JPY" in pair else 10.0,
            }
        )
    return rows


def main(argv: list[str]) -> None:
    n = int(argv[1]) if len(argv) > 1 else 500
    out = Path(argv[2]).expanduser() if len(argv) > 2 else _default_out()
    n = max(1, min(n, 2000))
    out.parent.mkdir(parents=True, exist_ok=True)
    rows = generate(n)
    fieldnames = list(rows[0].keys()) if rows else []
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} rows to {out}")


if __name__ == "__main__":
    main(sys.argv)
