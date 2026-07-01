#!/usr/bin/env python3
"""
Generate 200 realistic closed trades with every dashboard + journal field populated.

Output:
  docs/talaria-200-trades-full-2026.csv  — wide CSV (27 analytics columns + journal extras)
  docs/talaria-200-trades-analytics-2026.csv — 27-column dashboard export (Page 5 ingest)

Conventions (matches chart order-manager after excursion fix):
  mfe_r  >= 0  (favorable R)
  mae_r  <= 0  (adverse R, negative)
  rMultiple = netPnL / riskAmount (signed)
  mae_points / mfe_points = worst / best price during trade

Usage:
  py "chart v 1.4/chart/scripts/generate_200_trades_full_csv.py"
"""

from __future__ import annotations

import csv
import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Dashboard Page-5 export column order (DASH_CSV_FIELD_CATALOG)
ANALYTICS_COLUMNS: list[str] = [
    "netPnL",
    "closeTime",
    "openTime",
    "tradeId",
    "ticker",
    "direction",
    "setup",
    "rMultiple",
    "quantity",
    "riskAmount",
    "mae_r",
    "mfe_r",
    "mae_points",
    "mfe_points",
    "highestPrice",
    "lowestPrice",
    "plannedRR",
    "entryPrice",
    "exitPrice",
    "stopLoss",
    "takeProfit",
    "commission_at_entry",
    "spread_pips_at_entry",
    "pip_value_at_entry",
    "closeType",
    "durationMinutes",
    "status",
]

# Additional journal / session fields stored in payload_json
EXTRA_COLUMNS: list[str] = [
    "originalRiskAmount",
    "rewardToRiskRatio",
    "mfe",
    "mae",
    "total_mfe_r",
    "capture_ratio",
    "management_gap",
    "exit_timing_gap",
    "would_have_won",
    "exit_confirmed",
    "dayOfWeek",
    "hourOfEntry",
    "hourOfExit",
    "month",
    "year",
    "holdingTimeHours",
    "holdingTimeMs",
    "initial_sl",
    "array_base_price",
    "balance_at_creation",
    "balance_at_exit",
    "commission_total",
    "planned_risk_pct",
    "actual_risk_r",
    "hasPartialCloses",
    "hasMultipleTakeProfits",
    "rulesFollowed",
    "trading_session_id",
    "sourceSessionName",
    "bar_high_r",
    "bar_low_r",
    "bar_close_r",
    "post_exit_bar_high_r",
    "post_exit_bar_low_r",
    "post_exit_bar_close_r",
]

FULL_COLUMNS = ANALYTICS_COLUMNS + EXTRA_COLUMNS

SETUP = "London Open Liquidity Scalp"
SESSION_ID = 8801
SESSION_NAME = "London Open Liquidity Scalp — QA 200"
START_TRADE_ID = 22001

INSTRUMENTS: dict[str, dict] = {
    "GBPUSD": {"pip": 0.0001, "mid": 1.265, "pip_value": 10.0, "spread": 1.2, "commission": 3.5},
    "EURUSD": {"pip": 0.0001, "mid": 1.085, "pip_value": 10.0, "spread": 0.8, "commission": 3.0},
    "USDJPY": {"pip": 0.01, "mid": 148.5, "pip_value": 9.2, "spread": 0.9, "commission": 3.0},
    "XAUUSD": {"pip": 0.01, "mid": 2035.0, "pip_value": 1.0, "spread": 2.5, "commission": 4.0},
    "NQ": {"pip": 0.25, "mid": 18450.0, "pip_value": 5.0, "spread": 0.75, "commission": 4.5},
}

TICKER_WEIGHTS = ["GBPUSD", "GBPUSD", "EURUSD", "EURUSD", "USDJPY", "XAUUSD", "XAUUSD", "NQ"]
CLOSE_TYPES_WIN = ["TP", "TP", "TP", "MANUAL", "BE", "Trailing SL"]
CLOSE_TYPES_LOSS = ["SL", "SL", "MANUAL", "BE", "STOP_OUT"]
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def _root() -> Path:
    return Path(__file__).resolve().parents[3]


def _price_fmt(value: float, pip: float) -> float:
    if pip >= 1:
        return round(value, 2)
    if pip >= 0.01:
        return round(value, 3 if pip == 0.01 else 5)
    return round(value, 5)


def _iso_ms(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _bar_path(
    is_buy: bool,
    bars: int,
    exit_r: float,
    rng: random.Random,
) -> tuple[list[float], list[float], list[float], float, float]:
    """
    Per-bar H/L/C in R (matches chart _calculateExcursionRValues — NOT running envelopes).
    bar_high_r = favorable extreme of bar i (positive)
    bar_low_r  = adverse magnitude of bar i (positive)
    bar_close_r = signed close of bar i
    """
    high_r: list[float] = []
    low_r: list[float] = []
    close_r: list[float] = []
    pos = 0.0
    for i in range(bars):
        drift = (exit_r - pos) * rng.uniform(0.08, 0.22)
        shock = rng.uniform(-0.35, 0.35)
        pos = pos + drift + shock
        if i == bars - 1:
            pos = exit_r
        bar_range = rng.uniform(0.05, 0.45)
        if is_buy:
            bh = pos + bar_range * rng.uniform(0.2, 1.0)
            bl = pos - bar_range * rng.uniform(0.2, 1.0)
            fav = max(0.0, bh)
            adv = max(0.0, -bl)
            c = round(pos, 4)
            if c < -adv:
                c = round(-adv + rng.uniform(0, 0.03), 4)
        else:
            # SELL: favorable = down (negative close direction), adverse = up
            bh_down = -pos + bar_range * rng.uniform(0.1, 0.9)
            bl_up = pos + bar_range * rng.uniform(0.1, 0.9)
            fav = max(0.0, bh_down)
            adv = max(0.0, bl_up)
            c = round(pos, 4)
            if c > adv:
                c = round(adv - rng.uniform(0, 0.03), 4)
        high_r.append(round(fav, 4))
        low_r.append(round(adv, 4))
        close_r.append(c)
    mfe_r = round(max(high_r) if high_r else 0.0, 4)
    mae_mag = round(max(low_r) if low_r else 0.0, 4)
    return high_r, low_r, close_r, mfe_r, mae_mag


def _post_exit_bars(
    is_buy: bool,
    exit_r: float,
    in_mfe_r: float,
    bars: int,
    rng: random.Random,
) -> tuple[list[float], list[float], list[float], float]:
    """Per-bar post-exit arrays (same semantics as in-trade)."""
    _, _, close_r, mfe_r, mae_mag = _bar_path(is_buy, bars, exit_r + rng.uniform(-0.15, 0.35), rng)
    # Re-roll with slight favorable extension possible after exit
    high_r: list[float] = []
    low_r: list[float] = []
    close_r = []
    pos = exit_r
    for i in range(bars):
        pos += rng.uniform(-0.12, 0.18)
        bar_range = rng.uniform(0.03, 0.25)
        if is_buy:
            bh = pos + bar_range * rng.uniform(0.2, 1.0)
            bl = pos - bar_range * rng.uniform(0.2, 1.0)
            high_r.append(round(max(0.0, bh), 4))
            low_r.append(round(max(0.0, -bl), 4))
            c = round(pos, 4)
            if c < -low_r[-1]:
                c = round(-low_r[-1], 4)
            close_r.append(c)
        else:
            adv = pos + bar_range * rng.uniform(0.1, 0.9)
            fav = -pos + bar_range * rng.uniform(0.1, 0.9)
            high_r.append(round(max(0.0, fav), 4))
            low_r.append(round(max(0.0, adv), 4))
            c = round(pos, 4)
            if c > low_r[-1]:
                c = round(low_r[-1], 4)
            close_r.append(c)
    post_mfe = round(max(high_r) if high_r else 0.0, 4)
    return high_r, low_r, close_r, post_mfe


def generate_trade(
    trade_num: int,
    trade_id: int,
    balance: float,
    rng: random.Random,
    window_start: datetime,
    window_end: datetime,
) -> dict:
    ticker = rng.choice(TICKER_WEIGHTS)
    inst = INSTRUMENTS[ticker]
    pip = inst["pip"]
    direction = rng.choice(["LONG", "SHORT"])
    is_buy = direction == "LONG"

    # Entry during London / NY overlap hours weighted
    span_days = (window_end - window_start).days
    day_offset = rng.randint(0, max(span_days - 1, 1))
    entry_dt = window_start + timedelta(days=day_offset)
    entry_dt = entry_dt.replace(
        hour=rng.choice([7, 8, 9, 10, 13, 14, 15]),
        minute=rng.randint(0, 59),
        second=0,
        microsecond=0,
    )
    if entry_dt > window_end:
        entry_dt = window_end - timedelta(hours=rng.randint(2, 48))

    risk_amount = round(rng.uniform(40, 55), 2)
    planned_rr = rng.choice([1.5, 2.0, 2.5, 3.0])
    entry = _price_fmt(inst["mid"] * (1 + rng.uniform(-0.025, 0.025)), pip)
    sl_pips = rng.uniform(12, 28)
    sl_dist = sl_pips * pip

    if is_buy:
        stop = _price_fmt(entry - sl_dist, pip)
        target = _price_fmt(entry + sl_dist * planned_rr, pip)
    else:
        stop = _price_fmt(entry + sl_dist, pip)
        target = _price_fmt(entry - sl_dist * planned_rr, pip)

    win = rng.random() < 0.54
    if win:
        r_mult = rng.uniform(0.4, min(planned_rr * 1.05, 3.8))
        close_type = rng.choice(CLOSE_TYPES_WIN)
        if close_type == "TP":
            exit_price = target
        elif close_type == "BE":
            r_mult = rng.uniform(-0.08, 0.12)
            exit_price = _price_fmt(entry, pip)
        else:
            move = sl_dist * r_mult
            exit_price = _price_fmt(entry + move if is_buy else entry - move, pip)
    else:
        r_mult = -rng.uniform(0.35, 1.0)
        close_type = rng.choice(CLOSE_TYPES_LOSS)
        if close_type == "SL":
            exit_price = stop
        elif close_type == "BE":
            r_mult = rng.uniform(-0.15, 0.05)
            exit_price = _price_fmt(entry + (pip if is_buy else -pip), pip)
        else:
            move = sl_dist * abs(r_mult)
            exit_price = _price_fmt(entry - move if is_buy else entry + move, pip)

    net_pnl = round(r_mult * risk_amount, 2)
    r_mult = round(net_pnl / risk_amount, 4) if risk_amount else 0.0

    hold_min = rng.randint(18, 420)
    bars_held = max(8, min(hold_min // max(int(rng.choice([1, 5, 15])), 1), 80))
    bar_high, bar_low, bar_close, mfe_r, mae_mag = _bar_path(is_buy, bars_held, r_mult, rng)
    mae_r = round(-mae_mag, 4)

    if is_buy:
        mfe_points = _price_fmt(entry + mfe_r * sl_dist, pip)
        mae_points = _price_fmt(entry - mae_mag * sl_dist, pip)
        highest = _price_fmt(max(entry, exit_price, mfe_points), pip)
        lowest = _price_fmt(min(entry, exit_price, mae_points), pip)
    else:
        mfe_points = _price_fmt(entry - mfe_r * sl_dist, pip)
        mae_points = _price_fmt(entry + mae_mag * sl_dist, pip)
        highest = _price_fmt(max(entry, exit_price, mae_points), pip)
        lowest = _price_fmt(min(entry, exit_price, mfe_points), pip)

    exit_dt = entry_dt + timedelta(minutes=hold_min)
    entry_ms = int(entry_dt.timestamp() * 1000)
    exit_ms = int(exit_dt.timestamp() * 1000)
    holding_ms = exit_ms - entry_ms

    qty = round(max(0.01, risk_amount / max(sl_pips * inst["pip_value"], 1)), 2)
    balance_after = round(balance + net_pnl, 2)

    post_n = rng.randint(5, 25)
    pe_high, pe_low, pe_close, post_mfe_r = _post_exit_bars(is_buy, r_mult, mfe_r, post_n, rng)
    total_mfe_r = round(max(mfe_r, post_mfe_r), 4)
    capture = round(r_mult / total_mfe_r, 4) if total_mfe_r > 0 else 0.0
    mgmt_gap = round(mfe_r - r_mult, 4)
    exit_timing = round(post_mfe_r, 4)
    would_have_won = net_pnl <= 0 and post_mfe_r > 0.05
    exit_confirmed = max(pe_low) > max(pe_high) if pe_low and pe_high else False

    has_partial = rng.random() < 0.18
    has_multi_tp = rng.random() < 0.12
    rules_followed = rng.random() < 0.78

    row: dict = {
        "netPnL": net_pnl,
        "closeTime": _iso_ms(exit_ms),
        "openTime": _iso_ms(entry_ms),
        "tradeId": trade_id,
        "ticker": ticker,
        "direction": direction,
        "setup": SETUP,
        "rMultiple": r_mult,
        "quantity": qty,
        "riskAmount": risk_amount,
        "mae_r": mae_r,
        "mfe_r": mfe_r,
        "mae_points": mae_points,
        "mfe_points": mfe_points,
        "highestPrice": highest,
        "lowestPrice": lowest,
        "plannedRR": planned_rr,
        "entryPrice": entry,
        "exitPrice": exit_price,
        "stopLoss": stop,
        "takeProfit": target,
        "commission_at_entry": inst["commission"],
        "spread_pips_at_entry": inst["spread"],
        "pip_value_at_entry": inst["pip_value"],
        "closeType": close_type,
        "durationMinutes": hold_min,
        "status": "closed",
        "originalRiskAmount": risk_amount,
        "rewardToRiskRatio": round(abs(r_mult), 2),
        "mfe": mfe_points,
        "mae": mae_points,
        "total_mfe_r": total_mfe_r,
        "capture_ratio": capture,
        "management_gap": mgmt_gap,
        "exit_timing_gap": exit_timing,
        "would_have_won": would_have_won,
        "exit_confirmed": exit_confirmed,
        "dayOfWeek": DAYS[entry_dt.weekday() if entry_dt.weekday() < 5 else 0],
        "hourOfEntry": entry_dt.hour,
        "hourOfExit": exit_dt.hour,
        "month": MONTHS[entry_dt.month - 1],
        "year": entry_dt.year,
        "holdingTimeHours": round(holding_ms / 3_600_000, 4),
        "holdingTimeMs": holding_ms,
        "initial_sl": stop,
        "array_base_price": entry,
        "balance_at_creation": round(balance, 2),
        "balance_at_exit": balance_after,
        "commission_total": round(inst["commission"] * 2, 2),
        "planned_risk_pct": round(risk_amount / max(balance, 1) * 100, 4),
        "actual_risk_r": 1.0,
        "hasPartialCloses": has_partial,
        "hasMultipleTakeProfits": has_multi_tp,
        "rulesFollowed": rules_followed,
        "trading_session_id": SESSION_ID,
        "sourceSessionName": SESSION_NAME,
        "bar_high_r": json.dumps(bar_high),
        "bar_low_r": json.dumps(bar_low),
        "bar_close_r": json.dumps(bar_close),
        "post_exit_bar_high_r": json.dumps(pe_high),
        "post_exit_bar_low_r": json.dumps(pe_low),
        "post_exit_bar_close_r": json.dumps(pe_close),
    }
    row["_balance_after"] = balance_after
    return row


def generate_trades(count: int = 200, seed: int = 20260701) -> list[dict]:
    rng = random.Random(seed)
    window_start = datetime(2023, 12, 4, 8, 0, 0, tzinfo=timezone.utc)
    window_end = datetime(2025, 12, 20, 20, 0, 0, tzinfo=timezone.utc)
    balance = 10_000.0
    trades: list[dict] = []
    for i in range(count):
        trade_id = START_TRADE_ID + i
        row = generate_trade(i + 1, trade_id, balance, rng, window_start, window_end)
        balance = row.pop("_balance_after", balance)
        trades.append(row)
    return trades


def _write_csv(path: Path, columns: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            out = {}
            for col in columns:
                val = row.get(col, "")
                if isinstance(val, bool):
                    out[col] = "true" if val else "false"
                else:
                    out[col] = val
            writer.writerow(out)


def main() -> None:
    out_dir = _root() / "docs"
    count = 200
    if len(sys.argv) > 1:
        try:
            count = int(sys.argv[1])
        except ValueError:
            pass

    trades = generate_trades(count=count)
    full_path = out_dir / "talaria-200-trades-full-2026.csv"
    analytics_path = out_dir / "talaria-200-trades-analytics-2026.csv"

    _write_csv(full_path, FULL_COLUMNS, trades)
    _write_csv(analytics_path, ANALYTICS_COLUMNS, trades)

    wins = sum(1 for t in trades if float(t["netPnL"]) > 0)
    total_pnl = sum(float(t["netPnL"]) for t in trades)
    null_mae_pts = sum(1 for t in trades if t.get("mae_points") in ("", None))
    print(f"Wrote {len(trades)} trades")
    print(f"  Full CSV ({len(FULL_COLUMNS)} cols): {full_path}")
    print(f"  Analytics CSV ({len(ANALYTICS_COLUMNS)} cols): {analytics_path}")
    print(f"  Wins: {wins}/{len(trades)} | Net PnL: ${total_pnl:,.2f}")
    print(f"  mae_points empty: {null_mae_pts} | tradeId range: {trades[0]['tradeId']}-{trades[-1]['tradeId']}")


if __name__ == "__main__":
    main()
