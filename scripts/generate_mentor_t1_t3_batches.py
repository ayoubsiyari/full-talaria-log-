#!/usr/bin/env python3
"""
Generate 10 T1 (standard backtest) + 10 T3 (live personal) mentor-format xlsx files
with realistic trades, then adapt each to full Talaria journal schema (140 columns).

Output (under mentor data/generated/):
  t1/*.xlsx              — raw mentor Journal sheet (batch_adapt input shape)
  t1/*-talaria-adapted.xlsx
  t3/*.xlsx
  t3/*-talaria-adapted.xlsx
  manifest.json

Usage:
  py scripts/generate_mentor_t1_t3_batches.py
  py scripts/generate_mentor_t1_t3_batches.py --seed 20260702
  py scripts/generate_mentor_t1_t3_batches.py --profile losing --seed 20260703
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
CHART_SCRIPTS = ROOT / "chart v 1.4" / "chart" / "scripts"
for p in (SCRIPTS, CHART_SCRIPTS):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from adapt_mentor_xlsx_to_talaria import (  # noqa: E402
    DEFAULT_TIMEFRAME_MINUTES,
    STRATEGY_BY_TICKER,
    convert_file,
    write_workbook,
)
from generate_dashboard_session_samples import INSTRUMENTS  # noqa: E402

try:
    from openpyxl import Workbook
except ImportError as exc:  # pragma: no cover
    raise SystemExit("openpyxl is required: pip install openpyxl") from exc

MENTOR_HEADERS: list[str] = [
    "id",
    "symbol",
    "direction",
    "instrument_type",
    "entry_price",
    "exit_price",
    "stop_loss",
    "take_profit",
    "high_price",
    "low_price",
    "entry_datetime",
    "exit_datetime",
    "trade_date",
    "quantity",
    "risk_amount",
    "pnl",
    "rr",
    "commission",
    "slippage",
    "setup",
    "strategy",
    "notes",
    "status",
    "variables_json",
    "entry_screenshot",
    "exit_screenshot",
    "var1",
    "var2",
    "var3",
    "var4",
    "var5",
]

T1_SPECS: list[dict[str, Any]] = [
    {
        "stem": "qa_gen_t1_eurusd_scalper",
        "session_name": "QA Gen T1 · EURUSD Scalper BT",
        "tickers": ["EURUSD"],
        "strategy_id": 57,
        "strategy_label": "1-Min Momentum Scalper",
        "bar_min": 5,
        "trades": (220, 340),
        "balance": 10000,
        "win_rate": 0.54,
    },
    {
        "stem": "qa_gen_t1_gbpusd_london",
        "session_name": "QA Gen T1 · GBPUSD London BT",
        "tickers": ["GBPUSD"],
        "strategy_id": 58,
        "strategy_label": "London Open Liquidity Scalp",
        "bar_min": 15,
        "trades": (180, 280),
        "balance": 15000,
        "win_rate": 0.52,
    },
    {
        "stem": "qa_gen_t1_xauusd_swing",
        "session_name": "QA Gen T1 · XAUUSD Swing BT",
        "tickers": ["XAUUSD"],
        "strategy_id": 64,
        "strategy_label": "Fibonacci Confluence Swing",
        "bar_min": 240,
        "trades": (90, 160),
        "balance": 25000,
        "win_rate": 0.50,
    },
    {
        "stem": "qa_gen_t1_es_orb",
        "session_name": "QA Gen T1 · ES Opening Range BT",
        "tickers": ["ES"],
        "strategy_id": 60,
        "strategy_label": "Opening Range Breakout",
        "bar_min": 5,
        "trades": (200, 320),
        "balance": 50000,
        "win_rate": 0.53,
    },
    {
        "stem": "qa_gen_t1_nq_vwap",
        "session_name": "QA Gen T1 · NQ VWAP Reclaim BT",
        "tickers": ["NQ"],
        "strategy_id": 59,
        "strategy_label": "VWAP Reclaim Intraday",
        "bar_min": 5,
        "trades": (210, 350),
        "balance": 50000,
        "win_rate": 0.51,
    },
    {
        "stem": "qa_gen_t1_btc_liquidity",
        "session_name": "QA Gen T1 · BTC Liquidity Sweep BT",
        "tickers": ["BTCUSD"],
        "strategy_id": 62,
        "strategy_label": "Liquidity Sweep + FVG",
        "bar_min": 15,
        "trades": (150, 260),
        "balance": 10000,
        "win_rate": 0.48,
    },
    {
        "stem": "qa_gen_t1_multipair_swing",
        "session_name": "QA Gen T1 · Multi-Pair Swing BT",
        "tickers": ["EURUSD", "GBPUSD", "USDJPY"],
        "strategy_id": 61,
        "strategy_label": "4H Trend Pullback Swing",
        "bar_min": 60,
        "trades": (280, 420),
        "balance": 20000,
        "win_rate": 0.52,
    },
    {
        "stem": "qa_gen_t1_usdjpy_fade",
        "session_name": "QA Gen T1 · USDJPY Carry Fade BT",
        "tickers": ["USDJPY"],
        "strategy_id": 61,
        "strategy_label": "4H Trend Pullback Swing",
        "bar_min": 60,
        "trades": (160, 240),
        "balance": 12000,
        "win_rate": 0.49,
    },
    {
        "stem": "qa_gen_t1_mixed_fx",
        "session_name": "QA Gen T1 · Mixed FX Portfolio BT",
        "tickers": ["EURUSD", "GBPUSD", "AUDUSD", "USDCHF"],
        "strategy_id": 57,
        "strategy_label": "1-Min Momentum Scalper",
        "bar_min": 15,
        "trades": (300, 450),
        "balance": 18000,
        "win_rate": 0.55,
    },
    {
        "stem": "qa_gen_t1_nq_momentum",
        "session_name": "QA Gen T1 · NQ 1m Momentum BT",
        "tickers": ["NQ"],
        "strategy_id": 59,
        "strategy_label": "VWAP Reclaim Intraday",
        "bar_min": 1,
        "trades": (350, 500),
        "balance": 35000,
        "win_rate": 0.47,
    },
]

T3_SPECS: list[dict[str, Any]] = [
    {
        "stem": "qa_gen_t3_oanda_personal",
        "session_name": "QA Gen T3 · OANDA Personal Live",
        "tickers": ["EURUSD", "GBPUSD"],
        "strategy_id": 57,
        "strategy_label": "1-Min Momentum Scalper",
        "bar_min": 15,
        "trades": (220, 380),
        "balance": 15000,
        "win_rate": 0.51,
        "discipline_mix": True,
    },
    {
        "stem": "qa_gen_t3_mt5_swing",
        "session_name": "QA Gen T3 · MT5 Swing Live",
        "tickers": ["EURUSD", "USDJPY"],
        "strategy_id": 61,
        "strategy_label": "4H Trend Pullback Swing",
        "bar_min": 60,
        "trades": (120, 220),
        "balance": 22000,
        "win_rate": 0.50,
        "discipline_mix": True,
    },
    {
        "stem": "qa_gen_t3_gold_live",
        "session_name": "QA Gen T3 · Gold Session Live",
        "tickers": ["XAUUSD"],
        "strategy_id": 64,
        "strategy_label": "Fibonacci Confluence Swing",
        "bar_min": 240,
        "trades": (80, 150),
        "balance": 30000,
        "win_rate": 0.49,
        "discipline_mix": True,
    },
    {
        "stem": "qa_gen_t3_es_daytrade",
        "session_name": "QA Gen T3 · ES Day Journal Live",
        "tickers": ["ES"],
        "strategy_id": 60,
        "strategy_label": "Opening Range Breakout",
        "bar_min": 5,
        "trades": (180, 300),
        "balance": 45000,
        "win_rate": 0.52,
        "discipline_mix": True,
    },
    {
        "stem": "qa_gen_t3_nq_scalp",
        "session_name": "QA Gen T3 · NQ Scalping Live",
        "tickers": ["NQ"],
        "strategy_id": 59,
        "strategy_label": "VWAP Reclaim Intraday",
        "bar_min": 5,
        "trades": (200, 340),
        "balance": 50000,
        "win_rate": 0.48,
        "discipline_mix": True,
    },
    {
        "stem": "qa_gen_t3_crypto_perps",
        "session_name": "QA Gen T3 · Crypto Perps Live",
        "tickers": ["BTCUSD"],
        "strategy_id": 62,
        "strategy_label": "Liquidity Sweep + FVG",
        "bar_min": 15,
        "trades": (140, 260),
        "balance": 20000,
        "win_rate": 0.46,
        "discipline_mix": True,
    },
    {
        "stem": "qa_gen_t3_multi_broker",
        "session_name": "QA Gen T3 · Multi-Broker Aggregate Live",
        "tickers": ["EURUSD", "GBPUSD", "XAUUSD"],
        "strategy_id": 58,
        "strategy_label": "London Open Liquidity Scalp",
        "bar_min": 15,
        "trades": (250, 400),
        "balance": 28000,
        "win_rate": 0.50,
        "discipline_mix": True,
    },
    {
        "stem": "qa_gen_t3_eur_scalp",
        "session_name": "QA Gen T3 · EUR Scalping Live",
        "tickers": ["EURUSD"],
        "strategy_id": 57,
        "strategy_label": "1-Min Momentum Scalper",
        "bar_min": 5,
        "trades": (300, 480),
        "balance": 12000,
        "win_rate": 0.53,
        "discipline_mix": True,
    },
    {
        "stem": "qa_gen_t3_indices_journal",
        "session_name": "QA Gen T3 · Indices Day Journal Live",
        "tickers": ["ES", "NQ"],
        "strategy_id": 60,
        "strategy_label": "Opening Range Breakout",
        "bar_min": 5,
        "trades": (190, 310),
        "balance": 40000,
        "win_rate": 0.51,
        "discipline_mix": True,
    },
    {
        "stem": "qa_gen_t3_discipline_tracker",
        "session_name": "QA Gen T3 · Discipline Tracker Live",
        "tickers": ["EURUSD", "GBPUSD", "USDJPY"],
        "strategy_id": 58,
        "strategy_label": "London Open Liquidity Scalp",
        "bar_min": 15,
        "trades": (260, 420),
        "balance": 18000,
        "win_rate": 0.47,
        "discipline_mix": True,
    },
]

# Drawdown / losing-period batch — ~26–34% win rate per file.
LOSING_WIN_RATES_T1 = [0.30, 0.28, 0.32, 0.27, 0.29, 0.31, 0.26, 0.33, 0.28, 0.30]
LOSING_WIN_RATES_T3 = [0.29, 0.27, 0.31, 0.28, 0.26, 0.30, 0.32, 0.27, 0.29, 0.28]


def _losing_specs(base: list[dict[str, Any]], kind: str, win_rates: list[float]) -> list[dict[str, Any]]:
    prefix = "qa_gen_t1_losing_" if kind == "t1" else "qa_gen_t3_losing_"
    label_tag = "T1 Losing ·" if kind == "t1" else "T3 Losing ·"
    src_tag = "QA Gen T1 ·" if kind == "t1" else "QA Gen T3 ·"
    out: list[dict[str, Any]] = []
    for i, spec in enumerate(base):
        row = dict(spec)
        old_stem = str(spec["stem"])
        suffix = old_stem.replace("qa_gen_t1_", "").replace("qa_gen_t3_", "")
        row["stem"] = f"{prefix}{suffix}"
        row["session_name"] = str(spec["session_name"]).replace(src_tag, f"QA Gen {label_tag} ", 1)
        row["strategy_label"] = f"{spec['strategy_label']} (Drawdown)"
        row["win_rate"] = win_rates[i] if i < len(win_rates) else 0.28
        row["losing_profile"] = True
        if kind == "t3":
            row["discipline_mix"] = True
        out.append(row)
    return out


T1_LOSING_SPECS = _losing_specs(T1_SPECS, "t1", LOSING_WIN_RATES_T1)
T3_LOSING_SPECS = _losing_specs(T3_SPECS, "t3", LOSING_WIN_RATES_T3)


def _price_fmt(value: float, pip: float) -> float:
    if pip >= 1:
        return round(value, 2)
    if pip >= 0.01:
        return round(value, 3 if pip == 0.01 else 5)
    return round(value, 5)


def _dt_str(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _variables_json(
    rng: random.Random,
    *,
    live: bool,
    setup: str,
    losing: bool = False,
) -> str:
    dol = rng.choice(["not taken", "taken", "not taken"] if losing else ["taken", "not taken", "taken", "taken"])
    extra: dict[str, list[str]] = {"dol": [dol], "setup_tag": [setup]}
    if losing:
        extra["period"] = ["drawdown"]
    if live:
        roll = rng.random()
        oop_thresh = 0.22 if losing else 0.12
        missed_thresh = oop_thresh + (0.10 if losing else 0.06)
        if roll < oop_thresh:
            extra["plan_review"] = ["out of plan"]
        elif roll < missed_thresh:
            extra["plan_review"] = ["missed trade"]
        elif roll < (0.55 if losing else 0.78):
            extra["session_mood"] = [rng.choice(["rushed", "tired", "frustrated", "distracted"] if losing else ["focused", "calm", "neutral"])]
        else:
            extra["session_mood"] = [rng.choice(["revenge", "impatient", "overconfident"] if losing else ["rushed", "tired", "distracted"])]
    return json.dumps(extra, ensure_ascii=False)


def _excursion_prices(
    direction: str,
    entry: float,
    exit_px: float,
    stop: float,
    target: float,
    rng: random.Random,
    pip: float,
) -> tuple[float, float]:
    sl_dist = abs(entry - stop) or pip
    if direction == "long":
        mfe_cap = entry + sl_dist * rng.uniform(0.35, 2.8)
        mae_cap = entry - sl_dist * rng.uniform(0.15, 1.4)
        high = max(entry, exit_px, mfe_cap, target * 0.999 if target > entry else entry)
        low = min(entry, exit_px, mae_cap, stop)
        high = max(high, low + pip)
    else:
        mfe_cap = entry - sl_dist * rng.uniform(0.35, 2.8)
        mae_cap = entry + sl_dist * rng.uniform(0.15, 1.4)
        high = max(entry, exit_px, mae_cap, stop)
        low = min(entry, exit_px, mfe_cap, target * 1.001 if target < entry else entry)
        low = min(low, high - pip)
    return _price_fmt(high, pip), _price_fmt(low, pip)


def _generate_trade(
    rng: random.Random,
    trade_id: int,
    ticker: str,
    entry_dt: datetime,
    *,
    win_rate: float,
    strategy_label: str,
    live: bool,
    bar_min: int,
    losing: bool = False,
) -> dict[str, Any]:
    inst = INSTRUMENTS.get(ticker) or INSTRUMENTS["EURUSD"]
    pip = float(inst["pip"])
    base = float(inst["base"])
    market = str(inst["market"])
    direction = rng.choice(["long", "short"])
    entry = _price_fmt(base * (1 + rng.uniform(-0.02, 0.02)), pip)

    sl_pips = rng.uniform(8, 28) if market == "Forex" else rng.uniform(4, 18)
    planned_rr = rng.choice([1.0, 1.5, 2.0, 2.5, 3.0])
    sl_dist = sl_pips * pip

    if direction == "long":
        stop = _price_fmt(entry - sl_dist, pip)
        target = _price_fmt(entry + sl_dist * planned_rr, pip)
    else:
        stop = _price_fmt(entry + sl_dist, pip)
        target = _price_fmt(entry - sl_dist * planned_rr, pip)

    win = rng.random() < win_rate
    tol = max(pip * 2, abs(entry) * 1e-6)
    if win:
        if rng.random() < 0.62:
            exit_px = target
        else:
            frac = rng.uniform(0.35, 0.92)
            exit_px = entry + (target - entry) * frac if direction == "long" else entry + (target - entry) * frac
    else:
        stop_prob = 0.72 if losing else 0.55
        if rng.random() < stop_prob:
            exit_px = stop
        elif rng.random() < (0.25 if losing else 0.35):
            exit_px = entry
        else:
            frac = rng.uniform(0.35, 0.95) if losing else rng.uniform(0.2, 0.85)
            exit_px = entry + (stop - entry) * frac if direction == "long" else entry + (stop - entry) * frac
    exit_px = _price_fmt(float(exit_px), pip)

    if abs(exit_px - entry) <= tol:
        close_note = "breakeven scratch"
    elif (direction == "long" and exit_px >= target - tol) or (direction == "short" and exit_px <= target + tol):
        close_note = "target hit"
    elif (direction == "long" and exit_px <= stop + tol) or (direction == "short" and exit_px >= stop - tol):
        close_note = "stop hit"
    else:
        close_note = "manual exit"

    hold_bars = rng.randint(3, max(4, int(180 / max(bar_min, 1))))
    exit_dt = entry_dt + timedelta(minutes=hold_bars * bar_min)
    if exit_dt.weekday() >= 5 and market != "Crypto":
        exit_dt += timedelta(days=2)

    high, low = _excursion_prices(direction, entry, exit_px, stop, target, rng, pip)
    risk_amount = round(rng.uniform(75, 320), 2)
    if market == "Futures":
        risk_amount = round(rng.uniform(180, 650), 2)
    qty = round(rng.uniform(0.1, 2.5) if market == "Forex" else rng.uniform(1, 8), 2)
    rr = (entry - exit_px) / sl_dist if direction == "short" else (exit_px - entry) / sl_dist
    if sl_dist <= 0:
        rr = 0.0
    pnl = round(rr * risk_amount, 2)
    commission = round(rng.uniform(1.5, 6.5), 2) if market == "Futures" else round(rng.uniform(0, 4.5), 2)
    slippage = round(rng.uniform(0, 1.2), 2)

    if losing:
        notes_pool = [
            f"{close_note}; revenge entry after prior loss",
            f"{close_note}; chased move — setup degraded",
            f"{close_note}; oversize relative to plan",
            f"{close_note}; stopped out in chop",
            f"{close_note}; held loser too long",
            f"{close_note}; early exit on winner, full loss on next",
        ]
    else:
        notes_pool = [
            f"{close_note}; followed playbook",
            f"{close_note}; waited for confirmation",
            f"{close_note}; session volatility elevated",
            f"{close_note}; partial scale considered",
            "",
        ]
    notes = rng.choice(notes_pool)

    return {
        "id": trade_id,
        "symbol": ticker,
        "direction": direction,
        "instrument_type": market,
        "entry_price": entry,
        "exit_price": exit_px,
        "stop_loss": stop,
        "take_profit": target,
        "high_price": high,
        "low_price": low,
        "entry_datetime": _dt_str(entry_dt),
        "exit_datetime": _dt_str(exit_dt),
        "trade_date": entry_dt.strftime("%Y-%m-%d"),
        "quantity": qty,
        "risk_amount": risk_amount,
        "pnl": pnl,
        "rr": round(rr, 4),
        "commission": commission,
        "slippage": slippage,
        "setup": strategy_label,
        "strategy": strategy_label,
        "notes": notes,
        "status": "closed",
        "variables_json": _variables_json(rng, live=live, setup=strategy_label, losing=losing),
        "entry_screenshot": "",
        "exit_screenshot": "",
        "var1": "",
        "var2": "",
        "var3": "",
        "var4": "",
        "var5": "",
    }


def generate_mentor_rows(spec: dict[str, Any], rng: random.Random) -> list[dict[str, Any]]:
    tickers = spec["tickers"]
    lo, hi = spec["trades"]
    count = rng.randint(lo, hi)
    live = bool(spec.get("discipline_mix"))
    bar_min = int(spec.get("bar_min") or DEFAULT_TIMEFRAME_MINUTES)
    win_rate = float(spec.get("win_rate") or 0.52)
    losing = bool(spec.get("losing_profile"))

    start = datetime(2024, 1, 8, 8, 0, tzinfo=timezone.utc)
    end = datetime(2025, 6, 30, 20, 0, tzinfo=timezone.utc)
    span_days = max(30, (end - start).days)
    cursor = start + timedelta(days=rng.randint(0, 14))
    rows: list[dict[str, Any]] = []

    for i in range(1, count + 1):
        ticker = tickers[i % len(tickers)]
        if cursor > end:
            cursor = start + timedelta(days=rng.randint(0, span_days // 2))
        if cursor.weekday() >= 5 and str(INSTRUMENTS.get(ticker, {}).get("market")) != "Crypto":
            cursor += timedelta(days=2)
        hour = rng.choice([7, 8, 9, 10, 13, 14, 15, 16, 20, 21])
        entry_dt = cursor.replace(hour=hour, minute=rng.randint(0, 59), second=0)
        rows.append(
            _generate_trade(
                rng,
                i,
                ticker,
                entry_dt,
                win_rate=win_rate,
                strategy_label=str(spec["strategy_label"]),
                live=live,
                bar_min=bar_min,
                losing=losing,
            )
        )
        cursor += timedelta(
            hours=rng.randint(2, 36),
            minutes=rng.randint(0, 45),
        )
    rows.sort(key=lambda r: (r["entry_datetime"], r["id"]))
    for idx, row in enumerate(rows, start=1):
        row["id"] = idx
    return rows


def write_mentor_workbook(path: Path, rows: list[dict[str, Any]]) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Journal"
    ws.append(MENTOR_HEADERS)
    for row in rows:
        ws.append([row.get(h, "") for h in MENTOR_HEADERS])
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)


def _summarize_pnl(trades: list[dict[str, Any]]) -> dict[str, Any]:
    pnls = [float(t.get("pnl") or t.get("netPnL") or 0) for t in trades]
    wins = sum(1 for p in pnls if p > 0)
    losses = sum(1 for p in pnls if p < 0)
    return {
        "net_pnl": round(sum(pnls), 2),
        "wins": wins,
        "losses": losses,
        "win_rate_actual": round(wins / len(pnls), 4) if pnls else 0,
    }


def process_spec(
    spec: dict[str, Any],
    *,
    source_kind: str,
    source_id: int,
    out_dir: Path,
    rng: random.Random,
) -> dict[str, Any]:
    stem = spec["stem"]
    mentor_name = f"{stem}_trading_journal_complete.xlsx"
    adapted_name = f"{stem}-talaria-adapted.xlsx"
    mentor_path = out_dir / mentor_name
    adapted_path = out_dir / adapted_name

    rows = generate_mentor_rows(spec, rng)
    write_mentor_workbook(mentor_path, rows)

    profile_id = source_id if source_kind == "live_personal" else None
    trades = convert_file(
        mentor_path,
        source_id=source_id,
        source_name=spec["session_name"],
        strategy_label=spec["strategy_label"],
        strategy_id=int(spec["strategy_id"]),
        start_balance=float(spec.get("balance") or 10000),
        source_kind=source_kind,
        profile_id=profile_id,
        mentor_stem=stem,
    )
    write_workbook(adapted_path, trades)

    with_bar = sum(1 for t in trades if isinstance(t.get("bar_high_r"), list) and len(t["bar_high_r"]) > 0)
    pnl_summary = _summarize_pnl(trades)
    return {
        "stem": stem,
        "source_kind": source_kind,
        "source_type": 1 if source_kind == "backtest" else 3,
        "session_name": spec["session_name"],
        "mentor_file": mentor_name,
        "adapted_file": adapted_name,
        "trade_count": len(trades),
        "with_bar_paths": with_bar,
        "tickers": spec["tickers"],
        "strategy_id": spec["strategy_id"],
        "start_balance": spec.get("balance"),
        "win_rate_target": spec.get("win_rate"),
        "profile": "losing" if spec.get("losing_profile") else "balanced",
        "pnl_summary": pnl_summary,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate mentor T1/T3 batch xlsx files")
    parser.add_argument("--seed", type=int, default=20260701)
    parser.add_argument(
        "--profile",
        choices=("balanced", "losing"),
        default="balanced",
        help="balanced (~48-55%% win) or losing drawdown (~26-34%% win)",
    )
    parser.add_argument(
        "--out",
        default=str(ROOT / "mentor data" / "generated"),
        help="Output root directory",
    )
    args = parser.parse_args()

    out_root = Path(args.out)
    if args.profile == "losing":
        t1_specs = T1_LOSING_SPECS
        t3_specs = T3_LOSING_SPECS
        t1_dir = out_root / "t1-losing"
        t3_dir = out_root / "t3-losing"
        manifest_name = "manifest-losing.json"
        source_id_t1 = 6100
        source_id_t3 = 6300
    else:
        t1_specs = T1_SPECS
        t3_specs = T3_SPECS
        t1_dir = out_root / "t1"
        t3_dir = out_root / "t3"
        manifest_name = "manifest.json"
        source_id_t1 = 5100
        source_id_t3 = 5300

    manifest: list[dict[str, Any]] = []

    for i, spec in enumerate(t1_specs, start=1):
        rng = random.Random(args.seed + i * 101)
        info = process_spec(
            spec,
            source_kind="backtest",
            source_id=source_id_t1 + i,
            out_dir=t1_dir,
            rng=rng,
        )
        manifest.append(info)
        ps = info["pnl_summary"]
        print(
            f"T1 [{i}/10] {info['mentor_file']} — {info['trade_count']} trades, "
            f"WR {ps['win_rate_actual']:.0%}, net ${ps['net_pnl']:,.0f}"
        )

    for i, spec in enumerate(t3_specs, start=1):
        rng = random.Random(args.seed + i * 307)
        info = process_spec(
            spec,
            source_kind="live_personal",
            source_id=source_id_t3 + i,
            out_dir=t3_dir,
            rng=rng,
        )
        manifest.append(info)
        ps = info["pnl_summary"]
        print(
            f"T3 [{i}/10] {info['mentor_file']} — {info['trade_count']} trades, "
            f"WR {ps['win_rate_actual']:.0%}, net ${ps['net_pnl']:,.0f}"
        )

    manifest_doc = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "seed": args.seed,
        "profile": args.profile,
        "t1_count": len(t1_specs),
        "t3_count": len(t3_specs),
        "mentor_headers": MENTOR_HEADERS,
        "adapted_columns": 140,
        "import_hint": "Use mentor *_trading_journal_complete.xlsx with batch_adapt_mentor_data.py (backtest / live_personal).",
        "files": manifest,
    }
    manifest_path = out_root / manifest_name
    manifest_path.write_text(json.dumps(manifest_doc, indent=2), encoding="utf-8")
    print(f"\nWrote manifest: {manifest_path}")
    print(f"T1 dir: {t1_dir}")
    print(f"T3 dir: {t3_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
