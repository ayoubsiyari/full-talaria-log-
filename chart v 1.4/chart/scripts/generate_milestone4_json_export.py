#!/usr/bin/env python3
"""
Generate chart-compatible Milestone-4 JSON exports (exportTradesToJSON shape).

Uses per-bar OHLC-consistent R arrays (same semantics as order-manager.js).
Output matches buildMilestone4ExportSnapshot() — suitable for analytics QA.

Usage:
  py "chart v 1.4/chart/scripts/generate_milestone4_json_export.py"
  py "chart v 1.4/chart/scripts/generate_milestone4_json_export.py" 50
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Reuse trade generator with fixed per-bar path logic
_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from generate_200_trades_full_csv import (  # noqa: E402
    INSTRUMENTS,
    SESSION_ID,
    SESSION_NAME,
    SETUP,
    generate_trades,
)


def _root() -> Path:
    return Path(__file__).resolve().parents[3]


def _parse_iso_ms(iso: str) -> int:
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return int(dt.timestamp() * 1000)


def _arr(val) -> list:
    if isinstance(val, list):
        return val
    if isinstance(val, str) and val.strip():
        return json.loads(val)
    return []


def _build_partial_closes(
    *,
    entry_ms: int,
    exit_ms: int,
    entry_price: float,
    exit_price: float,
    quantity: float,
    r_mult: float,
    risk_amount: float,
    bars_held: int,
) -> list[dict]:
    mid_ms = entry_ms + int((exit_ms - entry_ms) * 0.55)
    q1 = round(quantity * 0.5, 2)
    q2 = round(quantity - q1, 2)
    pnl1 = round(r_mult * risk_amount * 0.45, 2)
    pnl2 = round(r_mult * risk_amount - pnl1, 2)
    bar1 = max(1, int(bars_held * 0.45))
    return [
        {
            "closePrice": round((entry_price + exit_price) / 2, 5),
            "closeTime": mid_ms,
            "bar": bar1,
            "quantity": q1,
            "pnl": pnl1,
            "pnl_net": round(pnl1 * 0.98, 2),
            "commission": 3.5,
            "rr_at_exit": round(r_mult * 0.45, 4),
            "percentage": 0.5,
            "hitType": "TP-PARTIAL",
            "exit_reason": "TP_HIT",
            "targetId": "TP1",
        },
        {
            "closePrice": exit_price,
            "closeTime": exit_ms,
            "bar": bars_held,
            "quantity": q2,
            "pnl": pnl2,
            "pnl_net": round(pnl2 * 0.98, 2),
            "commission": 3.5,
            "rr_at_exit": round(r_mult * 0.55, 4),
            "percentage": 0.5,
            "hitType": "TP",
            "exit_reason": "TP_HIT",
            "targetId": "TP2",
        },
    ]


def _build_trail_sl_path(
    *,
    entry_ms: int,
    exit_ms: int,
    initial_sl: float,
    exit_price: float,
    bars: int,
) -> list[dict]:
    out: list[dict] = []
    step = max(1, bars // 6)
    for i in range(0, bars, step):
        t = entry_ms + int((exit_ms - entry_ms) * (i / max(bars - 1, 1)))
        trail = initial_sl + (exit_price - initial_sl) * (i / max(bars - 1, 1)) * 0.7
        out.append(
            {
                "bar": t,
                "time": datetime.fromtimestamp(t / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z"),
                "sl": round(trail, 5),
                "trigger": "TRAIL",
            }
        )
    return out


def _row_to_journal(row: dict, *, pending_post_exit: bool = False) -> dict:
    direction_csv = str(row.get("direction", "LONG"))
    trade_type = "BUY" if direction_csv == "LONG" else "SELL"
    ticker = str(row["ticker"])
    entry_ms = _parse_iso_ms(str(row["openTime"]))
    exit_ms = _parse_iso_ms(str(row["closeTime"]))
    entry_price = float(row["entryPrice"])
    exit_price = float(row["exitPrice"])
    stop = float(row["stopLoss"])
    qty = float(row["quantity"])
    r_mult = float(row["rMultiple"])
    risk = float(row["riskAmount"])

    bar_high = _arr(row.get("bar_high_r"))
    bar_low = _arr(row.get("bar_low_r"))
    bar_close = _arr(row.get("bar_close_r"))
    pe_high = _arr(row.get("post_exit_bar_high_r"))
    pe_low = _arr(row.get("post_exit_bar_low_r"))
    pe_close = _arr(row.get("post_exit_bar_close_r"))

    if pending_post_exit:
        pe_high, pe_low, pe_close = [], [], []
        total_mfe_r = float(row["mfe_r"])
        capture_ratio = None
        exit_timing_gap = None
        would_have_won = None
        exit_confirmed = None
    else:
        total_mfe_r = float(row["total_mfe_r"])
        capture_ratio = row.get("capture_ratio")
        exit_timing_gap = row.get("exit_timing_gap")
        would_have_won = row.get("would_have_won")
        exit_confirmed = row.get("exit_confirmed")

    trade_id = row["tradeId"]
    close_type = str(row["closeType"])
    has_partial = bool(row.get("hasPartialCloses"))
    bars_held = len(bar_close)

    entry: dict = {
        "tradeId": trade_id,
        "id": trade_id,
        "symbol": ticker,
        "ticker": ticker,
        "type": trade_type,
        "direction": trade_type,
        "orderType": "market",
        "setup": row.get("setup") or SETUP,
        "status": "closed",
        "entryTime": entry_ms,
        "exitTime": exit_ms,
        "openTime": entry_ms,
        "closeTime": exit_ms,
        "entryDate": row["openTime"],
        "exitDate": row["closeTime"],
        "dayOfWeek": row.get("dayOfWeek"),
        "hourOfEntry": row.get("hourOfEntry"),
        "hourOfExit": row.get("hourOfExit"),
        "month": row.get("month"),
        "year": row.get("year"),
        "entryPrice": entry_price,
        "exitPrice": exit_price,
        "openPrice": entry_price,
        "closePrice": exit_price,
        "stopLoss": stop,
        "takeProfit": float(row["takeProfit"]),
        "initial_sl": float(row.get("initial_sl") or stop),
        "array_base_price": float(row.get("array_base_price") or entry_price),
        "netPnL": float(row["netPnL"]),
        "pnl": float(row["netPnL"]),
        "realizedPnL": float(row["netPnL"]),
        "riskAmount": risk,
        "riskPerTrade": risk,
        "originalRiskAmount": float(row.get("originalRiskAmount") or risk),
        "rMultiple": r_mult,
        "rewardToRiskRatio": float(row.get("rewardToRiskRatio") or abs(r_mult)),
        "plannedRRAtEntry": float(row.get("plannedRR") or 2.0),
        "mfe": float(row.get("mfe") or row.get("mfe_points") or entry_price),
        "mae": float(row.get("mae") or row.get("mae_points") or entry_price),
        "mfe_r": float(row["mfe_r"]),
        "mae_r": float(row["mae_r"]),
        "mfe_points": float(row["mfe_points"]),
        "mae_points": float(row["mae_points"]),
        "highestPrice": float(row["highestPrice"]),
        "lowestPrice": float(row["lowestPrice"]),
        "bar_high_r": bar_high,
        "bar_low_r": bar_low,
        "bar_close_r": bar_close,
        "post_exit_bar_high_r": pe_high,
        "post_exit_bar_low_r": pe_low,
        "post_exit_bar_close_r": pe_close,
        "post_exit_anchor_time": exit_ms if not pending_post_exit else None,
        "total_mfe_r": total_mfe_r,
        "capture_ratio": capture_ratio,
        "management_gap": row.get("management_gap"),
        "exit_timing_gap": exit_timing_gap,
        "would_have_won": would_have_won,
        "exit_confirmed": exit_confirmed,
        "quantity": qty,
        "closeType": close_type,
        "spread_pips_at_entry": float(row.get("spread_pips_at_entry") or 0),
        "commission_at_entry": float(row.get("commission_at_entry") or 0),
        "pip_value_at_entry": float(row.get("pip_value_at_entry") or 10),
        "holdingTimeMs": int(row.get("holdingTimeMs") or (exit_ms - entry_ms)),
        "holdingTimeHours": float(row.get("holdingTimeHours") or 0),
        "balance_at_creation": float(row.get("balance_at_creation") or 0),
        "balance_at_exit": float(row.get("balance_at_exit") or 0),
        "hasPartialCloses": has_partial,
        "hasMultipleTakeProfits": bool(row.get("hasMultipleTakeProfits")),
        "rulesFollowed": bool(row.get("rulesFollowed")),
        "trading_session_id": row.get("trading_session_id"),
        "partialCloses": [],
        "sl_modifications": [],
        "trail_sl_path": [],
        "post_checkpoints": [],
        "preTradeNotes": {"setup": row.get("setup") or SETUP},
        "postTradeNotes": {},
        "savedAt": exit_ms + 60_000,
    }

    if has_partial:
        entry["partialCloses"] = _build_partial_closes(
            entry_ms=entry_ms,
            exit_ms=exit_ms,
            entry_price=entry_price,
            exit_price=exit_price,
            quantity=qty,
            r_mult=r_mult,
            risk_amount=risk,
            bars_held=bars_held,
        )
        entry["partialClosePnL"] = sum(float(p["pnl_net"]) for p in entry["partialCloses"])

    if close_type == "Trailing SL":
        entry["trail_sl_path"] = _build_trail_sl_path(
            entry_ms=entry_ms,
            exit_ms=exit_ms,
            initial_sl=stop,
            exit_price=exit_price,
            bars=max(bars_held, 8),
        )

    return entry


def _build_instruments(tickers: set[str]) -> dict:
    out: dict = {}
    for ticker in sorted(tickers):
        inst = INSTRUMENTS.get(ticker, INSTRUMENTS["EURUSD"])
        out[ticker] = {
            "ticker": ticker,
            "symbol": ticker,
            "asset_class": "Forex" if ticker in ("EURUSD", "GBPUSD", "USDJPY") else "Other",
            "spread_pips": inst["spread"],
            "commission_per_lot_per_side": inst["commission"],
            "pip_value_per_lot": inst["pip_value"],
            "pip_size": inst["pip"],
        }
    return out


def _build_per_instrument_stats(trades: list[dict]) -> dict:
    buckets: dict[str, dict] = {}
    for trade in trades:
        ticker = str(trade.get("ticker") or "UNKNOWN").upper()
        if ticker not in buckets:
            buckets[ticker] = {
                "trade_count": 0,
                "win_count": 0,
                "win_rate": 0.0,
                "net_pnl": 0.0,
                "net_rr": 0.0,
                "avg_rr": 0.0,
                "avg_mae_r": 0.0,
                "avg_mfe_r": 0.0,
            }
        b = buckets[ticker]
        b["trade_count"] += 1
        pnl = float(trade.get("netPnL") or 0)
        rr = float(trade.get("rMultiple") or 0)
        mfe = float(trade.get("mfe_r") or 0)
        mae = abs(float(trade.get("mae_r") or 0))
        if pnl > 0:
            b["win_count"] += 1
        b["net_pnl"] += pnl
        b["net_rr"] += rr
        b["avg_rr"] += rr
        b["avg_mae_r"] += mae
        b["avg_mfe_r"] += mfe

    for b in buckets.values():
        n = b["trade_count"] or 1
        b["win_rate"] = (b["win_count"] / n) * 100
        b["avg_rr"] = b["avg_rr"] / n
        b["avg_mae_r"] = b["avg_mae_r"] / n
        b["avg_mfe_r"] = b["avg_mfe_r"] / n
        for k in ("net_pnl", "net_rr", "avg_rr", "avg_mae_r", "avg_mfe_r", "win_rate"):
            b[k] = round(b[k], 4)
    return buckets


def _group_journal_by_ticker(trades: list[dict]) -> dict:
    grouped: dict[str, list] = {}
    for trade in trades:
        ticker = str(trade.get("ticker") or "UNKNOWN").upper()
        grouped.setdefault(ticker, []).append(trade)
    return grouped


def _validate_bar_arrays(
    trade_id,
    bh: list[float],
    bl: list[float],
    bc: list[float],
    *,
    label: str = "",
) -> list[str]:
    errors: list[str] = []
    prefix = f"trade {trade_id}{label}"
    for i, c in enumerate(bc):
        hi = bh[i] if i < len(bh) else 0.0
        lo = bl[i] if i < len(bl) else 0.0
        if c < -lo - 0.0001:
            errors.append(f"{prefix} bar {i}: close {c} < -bar_low_r {lo}")
        if c > hi + 0.0001:
            errors.append(f"{prefix} bar {i}: close {c} > bar_high_r {hi}")
    return errors


def _validate_trade(trade: dict) -> list[str]:
    errors: list[str] = []
    bh = _arr(trade.get("bar_high_r"))
    bl = _arr(trade.get("bar_low_r"))
    bc = _arr(trade.get("bar_close_r"))
    if not bh:
        return errors

    tid = trade.get("tradeId")
    mfe = float(trade.get("mfe_r") or 0)
    if abs(mfe - max(bh)) > 0.0001:
        errors.append(f"trade {tid}: mfe_r {mfe} != max(bar_high_r) {max(bh)}")

    mae_mag = abs(float(trade.get("mae_r") or 0))
    if abs(mae_mag - max(bl)) > 0.0001:
        errors.append(f"trade {tid}: |mae_r| {mae_mag} != max(bar_low_r) {max(bl)}")

    errors.extend(_validate_bar_arrays(tid, bh, bl, bc))

    pe_h = _arr(trade.get("post_exit_bar_high_r"))
    pe_l = _arr(trade.get("post_exit_bar_low_r"))
    pe_c = _arr(trade.get("post_exit_bar_close_r"))
    if pe_h:
        errors.extend(_validate_bar_arrays(tid, pe_h, pe_l, pe_c, label=" post-exit"))

    return errors


def build_milestone4_snapshot(rows: list[dict], *, pending_tail: int = 6) -> dict:
    trades: list[dict] = []
    for i, row in enumerate(rows):
        pending = i >= len(rows) - pending_tail
        trades.append(_row_to_journal(row, pending_post_exit=pending))

    tickers = {str(t["ticker"]).upper() for t in trades}
    start_balance = float(trades[0].get("balance_at_creation") or 10_000) if trades else 10_000
    end_balance = float(trades[-1].get("balance_at_exit") or start_balance) if trades else start_balance

    return {
        "session_summary": {
            "session_id": SESSION_ID,
            "account_currency": "USD",
            "leverage": 100,
            "margin_call_level": 50,
            "stop_out_level": 20,
            "max_risk_per_trade_pct": 1.5,
            "start_balance": start_balance,
            "current_balance": end_balance,
            "session_name": SESSION_NAME,
            "export_source": "generate_milestone4_json_export.py",
            "export_note": (
                "Chart-shaped Milestone-4 fixture with per-bar R arrays matching order-manager semantics. "
                "Last few trades have pending post-exit windows (empty post_exit arrays)."
            ),
        },
        "instruments": _build_instruments(tickers),
        "per_instrument_stats": _build_per_instrument_stats(trades),
        "journal_by_ticker": _group_journal_by_ticker(trades),
        "trades": trades,
    }


def main() -> None:
    count = 200
    if len(sys.argv) > 1:
        try:
            count = max(1, int(sys.argv[1]))
        except ValueError:
            pass

    out_dir = _root() / "docs" / "fixtures"
    out_dir.mkdir(parents=True, exist_ok=True)

    rows = generate_trades(count=count)
    snapshot = build_milestone4_snapshot(rows)

    errors: list[str] = []
    for trade in snapshot["trades"]:
        errors.extend(_validate_trade(trade))
    if errors:
        print("VALIDATION FAILED:")
        for e in errors[:20]:
            print(f"  - {e}")
        if len(errors) > 20:
            print(f"  ... and {len(errors) - 20} more")
        raise SystemExit(1)

    sized = out_dir / f"trade_journal_qa_{count}.json"
    payload = json.dumps(snapshot, indent=2, ensure_ascii=False)
    sized.write_text(payload, encoding="utf-8")
    if count == 200:
        primary = out_dir / f"trade_journal_{datetime.now(tz=timezone.utc).strftime('%Y-%m-%d')}.json"
        primary.write_text(payload, encoding="utf-8")

    trades = snapshot["trades"]
    wins = sum(1 for t in trades if float(t["netPnL"]) > 0)
    with_post = sum(1 for t in trades if t.get("post_exit_bar_high_r"))
    with_partial = sum(1 for t in trades if t.get("partialCloses"))
    with_trail = sum(1 for t in trades if t.get("trail_sl_path"))

    print(f"Wrote {len(trades)} trades to:")
    print(f"  {sized}")
    if count == 200:
        print(f"  {out_dir / f'trade_journal_{datetime.now(tz=timezone.utc).strftime('%Y-%m-%d')}.json'}")
    print(f"  Wins: {wins}/{len(trades)} | post-exit complete: {with_post} | partials: {with_partial} | trail: {with_trail}")


if __name__ == "__main__":
    main()
