#!/usr/bin/env python3
"""
Generate 1–2 T3 live-personal journals with multiple strategies per source.

Usage:
  py scripts/generate_mentor_t3_multistrat_fixture.py
  py scripts/generate_mentor_t3_multistrat_fixture.py --seed 20260704
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
CHART_SCRIPTS = ROOT / "chart v 1.4" / "chart" / "scripts"
for p in (SCRIPTS, CHART_SCRIPTS):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from adapt_mentor_xlsx_to_talaria import convert_file, write_workbook  # noqa: E402
from generate_mentor_t1_t3_batches import (  # noqa: E402
    MENTOR_HEADERS,
    _generate_trade,
    _summarize_pnl,
    write_mentor_workbook,
)

MENTOR_HEADERS_MULTISTRAT = MENTOR_HEADERS + [
    "strategy_id",
    "strategy_name",
    "post_variables_schema",
]

STRATEGY_LONDON = {
    "id": 58,
    "name": "London Open Liquidity Scalp",
    "schema": "london_open",
    "post_schema": "london_open",
    "variable_keys": ["dol", "setup_tag", "session_mood"],
    "tickers": ["EURUSD", "GBPUSD"],
    "bar_min": 15,
}
STRATEGY_VWAP = {
    "id": 59,
    "name": "VWAP Reclaim Intraday",
    "schema": "vwap_reclaim",
    "post_schema": "vwap_reclaim",
    "variable_keys": ["bias", "entry_model", "htf_confluence"],
    "tickers": ["NQ", "ES"],
    "bar_min": 5,
}
STRATEGY_FIB = {
    "id": 64,
    "name": "Fibonacci Confluence Swing",
    "schema": "fib_swing",
    "post_schema": "fib_swing",
    "variable_keys": ["fib_zone", "confluence_count", "dol"],
    "tickers": ["XAUUSD"],
    "bar_min": 240,
}
STRATEGY_LIQ = {
    "id": 62,
    "name": "Liquidity Sweep + FVG",
    "schema": "liquidity_fvg",
    "post_schema": "liquidity_fvg",
    "variable_keys": ["sweep_type", "fvg_quality", "session_mood"],
    "tickers": ["BTCUSD"],
    "bar_min": 15,
}

FIXTURES: list[dict[str, Any]] = [
    {
        "stem": "qa_gen_t3_multistrat_fx_indices",
        "session_name": "QA Gen T3 · Multi-Strategy FX + Indices Live",
        "strategies": [STRATEGY_LONDON, STRATEGY_VWAP],
        "trades_per_strategy": (55, 95),
        "balance": 35000,
        "win_rate": 0.51,
        "source_id": 6401,
    },
    {
        "stem": "qa_gen_t3_multistrat_gold_crypto",
        "session_name": "QA Gen T3 · Multi-Strategy Gold + Crypto Live",
        "strategies": [STRATEGY_FIB, STRATEGY_LIQ],
        "trades_per_strategy": (45, 80),
        "balance": 25000,
        "win_rate": 0.49,
        "source_id": 6402,
    },
]


def _variables_json(rng: random.Random, strat: dict[str, Any]) -> str:
    schema = strat["schema"]
    if schema == "london_open":
        payload = {
            "dol": [rng.choice(["taken", "not taken", "taken"])],
            "setup_tag": [rng.choice(["London sweep", "OR break", "Liquidity raid"])],
            "session_mood": [rng.choice(["focused", "calm", "neutral", "rushed"])],
        }
    elif schema == "vwap_reclaim":
        payload = {
            "bias": [rng.choice(["bullish", "bearish", "neutral"])],
            "entry_model": [rng.choice(["reclaim", "fade", "continuation"])],
            "htf_confluence": [rng.choice(["yes", "no"])],
        }
    elif schema == "fib_swing":
        payload = {
            "fib_zone": [rng.choice(["0.618", "0.5", "0.786"])],
            "confluence_count": [rng.choice(["2", "3", "4"])],
            "dol": [rng.choice(["taken", "not taken"])],
        }
    else:  # liquidity_fvg
        payload = {
            "sweep_type": [rng.choice(["asia", "london", "ny"])],
            "fvg_quality": [rng.choice(["clean", "partial", "messy"])],
            "session_mood": [rng.choice(["focused", "impatient", "neutral"])],
        }
    roll = rng.random()
    if roll < 0.14:
        payload["plan_review"] = ["out of plan"]
    elif roll < 0.20:
        payload["plan_review"] = ["missed trade"]
    return json.dumps(payload, ensure_ascii=False)


def generate_multistrat_rows(spec: dict[str, Any], rng: random.Random) -> list[dict[str, Any]]:
    from datetime import timedelta

    from generate_dashboard_session_samples import INSTRUMENTS  # noqa: E402

    strategies = spec["strategies"]
    lo, hi = spec["trades_per_strategy"]
    win_rate = float(spec.get("win_rate") or 0.51)
    start = datetime(2024, 3, 4, 8, 0, tzinfo=timezone.utc)
    cursor = start
    rows: list[dict[str, Any]] = []
    trade_id = 0

    for strat in strategies:
        count = rng.randint(lo, hi)
        tickers = strat["tickers"]
        for _ in range(count):
            trade_id += 1
            ticker = tickers[trade_id % len(tickers)]
            if cursor.weekday() >= 5 and str(INSTRUMENTS.get(ticker, {}).get("market")) != "Crypto":
                cursor += timedelta(days=2)
            hour = rng.choice([7, 8, 9, 10, 13, 14, 15, 16])
            entry_dt = cursor.replace(hour=hour, minute=rng.randint(0, 59), second=0)
            row = _generate_trade(
                rng,
                trade_id,
                ticker,
                entry_dt,
                win_rate=win_rate,
                strategy_label=strat["name"],
                live=True,
                bar_min=int(strat.get("bar_min") or 15),
                losing=False,
            )
            row["strategy_id"] = strat["id"]
            row["strategy_name"] = strat["name"]
            row["setup"] = strat["name"]
            row["strategy"] = strat["name"]
            row["variables_json"] = _variables_json(rng, strat)
            row["post_variables_schema"] = strat["post_schema"]
            rows.append(row)
            cursor += timedelta(hours=rng.randint(3, 28), minutes=rng.randint(0, 45))

    rows.sort(key=lambda r: (r["entry_datetime"], r["id"]))
    for idx, row in enumerate(rows, start=1):
        row["id"] = idx
    return rows


def write_multistrat_mentor_workbook(path: Path, rows: list[dict[str, Any]]) -> None:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Journal"
    ws.append(MENTOR_HEADERS_MULTISTRAT)
    for row in rows:
        ws.append([row.get(h, "") for h in MENTOR_HEADERS_MULTISTRAT])
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)


def process_fixture(spec: dict[str, Any], rng: random.Random, out_dir: Path) -> dict[str, Any]:
    stem = spec["stem"]
    mentor_path = out_dir / f"{stem}_trading_journal_complete.xlsx"
    adapted_path = out_dir / f"{stem}-talaria-adapted.xlsx"
    rows = generate_multistrat_rows(spec, rng)
    write_multistrat_mentor_workbook(mentor_path, rows)

    # Default strategy for convert_file header only — per-row overrides apply in adapter.
    default_strat = spec["strategies"][0]
    trades = convert_file(
        mentor_path,
        source_id=int(spec["source_id"]),
        source_name=spec["session_name"],
        strategy_label=default_strat["name"],
        strategy_id=int(default_strat["id"]),
        start_balance=float(spec.get("balance") or 25000),
        source_kind="live_personal",
        profile_id=int(spec["source_id"]),
        mentor_stem=stem,
    )
    write_workbook(adapted_path, trades)

    by_strategy: dict[int, int] = {}
    for t in trades:
        sid = int(t.get("strategy_id") or 0)
        by_strategy[sid] = by_strategy.get(sid, 0) + 1

    return {
        "stem": stem,
        "session_name": spec["session_name"],
        "mentor_file": mentor_path.name,
        "adapted_file": adapted_path.name,
        "trade_count": len(trades),
        "strategies": [
            {
                "strategy_id": s["id"],
                "strategy_name": s["name"],
                "variable_keys": s["variable_keys"],
                "trade_count": by_strategy.get(int(s["id"]), 0),
            }
            for s in spec["strategies"]
        ],
        "pnl_summary": _summarize_pnl(trades),
        "profile": "multistrategy_t3",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate multi-strategy T3 QA fixtures")
    parser.add_argument("--seed", type=int, default=20260704)
    parser.add_argument(
        "--out",
        default=str(ROOT / "mentor data" / "generated" / "t3-multistrat"),
    )
    args = parser.parse_args()

    out_dir = Path(args.out)
    manifest_entries: list[dict[str, Any]] = []

    for i, spec in enumerate(FIXTURES, start=1):
        rng = random.Random(args.seed + i * 509)
        info = process_fixture(spec, rng, out_dir)
        manifest_entries.append(info)
        strat_line = "; ".join(
            f"{s['strategy_id']}={s['strategy_name']} ({s['trade_count']} trades, keys: {', '.join(s['variable_keys'])})"
            for s in info["strategies"]
        )
        print(f"[{i}/{len(FIXTURES)}] {info['mentor_file']} — {info['trade_count']} trades")
        print(f"    {strat_line}")

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "seed": args.seed,
        "profile": "multistrategy_t3",
        "pipeline": "mentor 32-col + adapted 142-col (includes strategy_id, strategyName)",
        "files": manifest_entries,
        "verification_note": (
            "Filter by strategy_id/strategyName; tag namespaces differ per strategy "
            "(London: dol/setup_tag/session_mood; VWAP: bias/entry_model/htf_confluence; etc.)"
        ),
    }
    manifest_path = out_dir.parent / "manifest-multistrat.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nWrote manifest: {manifest_path}")
    print(f"Output dir: {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
