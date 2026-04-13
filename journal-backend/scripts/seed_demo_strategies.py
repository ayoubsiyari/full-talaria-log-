#!/usr/bin/env python3
"""
Insert demo strategies for a user (default: yazan@gmail.com).

Usage on VPS (from journal-backend directory, with venv activated):

  export DATABASE_URL=...   # if not already in .env
  python scripts/seed_demo_strategies.py

Optional:

  export SEED_USER_EMAIL=other@example.com
  python scripts/seed_demo_strategies.py

Idempotent: skips if a strategy with the same name already exists for that user.
"""

from __future__ import annotations

import os
import sys

# journal-backend as cwd or PYTHONPATH
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from app import app  # noqa: E402
from models import db, Strategy, User  # noqa: E402


def _uid() -> str:
    import uuid

    return str(uuid.uuid4())[:12]


def _cat(cat_id: str, label: str, palette: str = "context") -> dict:
    palettes = {
        "context": ("#2643F7", "rgba(38,67,247,0.12)", "#2643F7"),
        "price": ("#f97316", "rgba(249,115,22,0.12)", "#f97316"),
        "flow": ("#06b6d4", "rgba(6,182,212,0.12)", "#06b6d4"),
    }
    color, bg, bd = palettes.get(palette, palettes["context"])
    return {
        "type": "category",
        "id": cat_id,
        "label": label,
        "color": color,
        "bg": bg,
        "bd": bd,
    }


def _cond(cid: str, cat_id: str, name: str, note: str, ctype: str = "yesno") -> dict:
    return {
        "type": "condition",
        "id": cid,
        "catId": cat_id,
        "name": name,
        "note": note,
        "ctype": ctype,
        "options": [],
    }


def _defn(
    *,
    markets: list,
    instruments: list,
    style: str,
    timeframe: str,
    direction: str,
    conditions: list,
    variables: list | None = None,
) -> dict:
    inst0 = instruments[0] if instruments else ""
    return {
        "instrument": inst0,
        "instruments": instruments,
        "market_categories": markets,
        "style": style,
        "direction": direction,
        "timeframe": timeframe,
        "conditions": conditions,
        "variables": variables or [],
        "cover_image": "",
    }


def build_six_strategies() -> list[dict]:
    """Six realistic strategy specs (name, description, strategy_definition)."""
    out = []

    # 1 — London ORB
    c1, c2 = "a_" + _uid(), "b_" + _uid()
    out.append(
        {
            "name": "London ORB — Break & Retest",
            "description": "Trade the first 15m opening range after London open; enter on retest of OR high/low with trend alignment.",
            "strategy_definition": _defn(
                markets=["forex"],
                instruments=["EURUSD", "GBPUSD"],
                style="intraday",
                timeframe="15m",
                direction="both",
                conditions=[
                    _cat(c1, "PRE-MARKET", "flow"),
                    _cond(_uid(), c1, "Asia range defined", "Clear high/low between 00:00–07:00 GMT", "yesno"),
                    _cond(_uid(), c1, "No major red news", "Avoid BOE/FOMC within 60m", "yesno"),
                    _cat(c2, "LONDON OPEN", "price"),
                    _cond(_uid(), c2, "ORB formed", "First 15m candle range after 08:00 GMT", "yesno"),
                    _cond(_uid(), c2, "Breakout direction", "Price closes beyond OR with expansion", "yesno"),
                    _cond(_uid(), c2, "Retest entry", "Limit/stop at broken OR level", "yesno"),
                ],
            ),
        }
    )

    # 2 — ICT Silver Bullet
    c1, c2 = "a_" + _uid(), "b_" + _uid()
    out.append(
        {
            "name": "ICT Silver Bullet (NY)",
            "description": "NY AM session setup: FVG + liquidity sweep in the 10:00–11:00 ET window on NQ/ES.",
            "strategy_definition": _defn(
                markets=["futures"],
                instruments=["NQ", "ES"],
                style="intraday",
                timeframe="5m",
                direction="both",
                conditions=[
                    _cat(c1, "LIQUIDITY", "context"),
                    _cond(_uid(), c1, "Session liquidity taken", "Sweep of prior session high/low", "yesno"),
                    _cond(_uid(), c1, "Displacement", "Strong impulse after sweep", "yesno"),
                    _cat(c2, "SILVER BULLET", "price"),
                    _cond(_uid(), c2, "FVG present", "3-candle imbalance in direction of bias", "yesno"),
                    _cond(_uid(), c2, "Time window", "Entry only 10:00–11:00 ET", "yesno"),
                ],
            ),
        }
    )

    # 3 — BB Squeeze
    c1 = "a_" + _uid()
    out.append(
        {
            "name": "BB Squeeze Mean Reversion",
            "description": "Fade expansion after Bollinger Band squeeze on BTC/ETH when volatility compresses then pops.",
            "strategy_definition": _defn(
                markets=["crypto"],
                instruments=["BTCUSD", "ETHUSD"],
                style="scalping",
                timeframe="5m",
                direction="both",
                conditions=[
                    _cat(c1, "SQUEEZE", "flow"),
                    _cond(_uid(), c1, "Bands pinched", "Bandwidth at 20-period low vs recent", "yesno"),
                    _cond(_uid(), c1, "First expansion candle", "Close outside band after squeeze", "yesno"),
                    _cond(_uid(), c1, "Fade extreme", "Enter against wick toward mid-band", "yesno"),
                ],
            ),
        }
    )

    # 4 — EMA trend pullback
    c1, c2 = "a_" + _uid(), "b_" + _uid()
    out.append(
        {
            "name": "EMA Stack Trend Pullback",
            "description": "Swing continuation: 20/50/200 alignment on 4H; entry on 15m pullback to 20 EMA.",
            "strategy_definition": _defn(
                markets=["forex"],
                instruments=["EURUSD", "USDJPY"],
                style="swing",
                timeframe="4h",
                direction="both",
                conditions=[
                    _cat(c1, "HTF BIAS", "context"),
                    _cond(_uid(), c1, "EMA alignment", "20 > 50 > 200 for longs (inverse for shorts)", "yesno"),
                    _cond(_uid(), c1, "Price structure", "Higher highs / higher lows (or inverse)", "yesno"),
                    _cat(c2, "ENTRY", "price"),
                    _cond(_uid(), c2, "Pullback to 20 EMA", "On 15m, touch without closing through 50", "yesno"),
                    _cond(_uid(), c2, "Trigger candle", "Rejection / mini structure break in trend dir.", "yesno"),
                ],
            ),
        }
    )

    # 5 — News volatility
    c1 = "a_" + _uid()
    out.append(
        {
            "name": "News Spike Scalp",
            "description": "High-impact calendar events: wait for spike, trade failed continuation or VWAP mean reversion.",
            "strategy_definition": _defn(
                markets=["forex", "futures"],
                instruments=["EURUSD", "NQ"],
                style="scalping",
                timeframe="1m",
                direction="both",
                conditions=[
                    _cat(c1, "EVENT", "flow"),
                    _cond(_uid(), c1, "Red-folder news", "NFP/CPI/FOMC per plan", "yesno"),
                    _cond(_uid(), c1, "Spike printed", "Initial 1–3m range established", "yesno"),
                    _cond(_uid(), c1, "Failed breakout", "Price re-enters pre-news range", "yesno"),
                ],
            ),
        }
    )

    # 6 — Opening drive
    c1, c2 = "a_" + _uid(), "b_" + _uid()
    out.append(
        {
            "name": "Cash Open Drive",
            "description": "First 30m after equity cash open: trade continuation when opening drive holds above/below OR.",
            "strategy_definition": _defn(
                markets=["futures"],
                instruments=["ES", "NQ"],
                style="intraday",
                timeframe="5m",
                direction="both",
                conditions=[
                    _cat(c1, "OPENING RANGE", "price"),
                    _cond(_uid(), c1, "First 15m range", "Mark high/low from 9:30–9:45 ET", "yesno"),
                    _cond(_uid(), c1, "Drive direction", "Clear bias above/below midpoint", "yesno"),
                    _cat(c2, "CONTINUATION", "context"),
                    _cond(_uid(), c2, "No immediate reversal", "VWAP not reclaimed against trade", "yesno"),
                    _cond(_uid(), c2, "Volume supportive", "Drive candle volume > opening avg", "yesno"),
                ],
            ),
        }
    )

    return out


def main() -> int:
    email = (os.environ.get("SEED_USER_EMAIL") or "yazan@gmail.com").strip().lower()
    specs = build_six_strategies()

    with app.app_context():
        user = User.query.filter_by(email=email).first()
        if not user:
            print(f"ERROR: No user with email {email!r}. Create the account first or set SEED_USER_EMAIL.")
            return 1

        existing_names = {
            s.name for s in Strategy.query.filter_by(user_id=user.id).all()
        }
        added = 0
        skipped = 0
        for spec in specs:
            name = spec["name"][:100]
            if name in existing_names:
                print(f"  skip (exists): {name}")
                skipped += 1
                continue
            row = Strategy(
                user_id=user.id,
                name=name,
                description=(spec.get("description") or "")[:5000],
                entry_rules=[],
                exit_rules=[],
                risk_management={},
                strategy_definition=spec["strategy_definition"],
            )
            db.session.add(row)
            existing_names.add(name)
            added += 1

        if added:
            db.session.commit()
        print(f"Done. User: {email} (id={user.id})")
        print(f"  Added: {added}  Skipped (duplicate name): {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
