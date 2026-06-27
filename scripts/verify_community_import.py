#!/usr/bin/env python3
"""
Verify Community import on VPS: trade counts, core fields, variables, and tags.

Compares API data against mentor data/new data/community-batch-summary.json
and optional local *-talaria-adapted.json files.

Usage:
  py scripts/verify_community_import.py
  py scripts/verify_community_import.py --session-id 653
  py scripts/verify_community_import.py --live-account-id 38
  py scripts/verify_community_import.py --sample 3
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from seed_dashboard_test_sessions import Client  # noqa: E402

NEW_DATA_DIR = ROOT / "mentor data" / "new data"
SUMMARY_PATH = NEW_DATA_DIR / "community-batch-summary.json"
ORIGIN_DEFAULT = "http://31.97.192.82:3000"


def _pct(n: int, total: int) -> str:
    if not total:
        return "0%"
    return f"{round(100 * n / total)}%"


def summarize_backtest_trades(trades: list[dict[str, Any]]) -> dict[str, Any]:
    payloads = [t.get("payload") or t for t in trades]
    return {
        "count": len(payloads),
        "with_pnl": sum(1 for t in payloads if t.get("pnl") is not None),
        "with_symbol": sum(1 for t in payloads if t.get("symbol") or t.get("ticker")),
        "with_entry_exit": sum(
            1 for t in payloads if t.get("entryPrice") is not None and t.get("exitPrice") is not None
        ),
        "with_mae_mfe": sum(1 for t in payloads if t.get("mae_r") is not None and t.get("mfe_r") is not None),
        "with_bar_paths": sum(
            1 for t in payloads if isinstance(t.get("bar_close_r"), list) and len(t.get("bar_close_r") or []) > 0
        ),
        "with_pre_tags": sum(1 for t in payloads if t.get("preTags")),
        "with_post_tags": sum(1 for t in payloads if t.get("postTags")),
        "with_strategy_variables": sum(1 for t in payloads if t.get("strategy_variables")),
        "with_post_strategy_variables": sum(1 for t in payloads if t.get("post_strategy_variables")),
        "mentor_import": sum(1 for t in payloads if (t.get("postTradeNotes") or {}).get("mentorImport")),
    }


def summarize_live_entries(entries: list[dict[str, Any]]) -> dict[str, Any]:
    stats = {
        "count": len(entries),
        "with_pnl": 0,
        "with_prices": 0,
        "with_variables_column": 0,
        "with_extra_talaria_trade": 0,
        "with_extra_pre_tags": 0,
        "with_extra_strategy_variables": 0,
        "with_extra_bar_paths": 0,
        "with_mae_mfe": 0,
        "variable_keys": set(),
    }
    for e in entries:
        if e.get("pnl") is not None:
            stats["with_pnl"] += 1
        if e.get("entry_price") is not None and e.get("exit_price") is not None:
            stats["with_prices"] += 1
        vars_col = e.get("variables") or {}
        if isinstance(vars_col, dict) and vars_col:
            stats["with_variables_column"] += 1
            stats["variable_keys"].update(vars_col.keys())
        extra = e.get("extra_data") or {}
        if not isinstance(extra, dict):
            continue
        tt = extra.get("talaria_trade")
        if isinstance(tt, dict):
            stats["with_extra_talaria_trade"] += 1
            if tt.get("preTags"):
                stats["with_extra_pre_tags"] += 1
            if tt.get("strategy_variables"):
                stats["with_extra_strategy_variables"] += 1
            if isinstance(tt.get("bar_close_r"), list) and tt["bar_close_r"]:
                stats["with_extra_bar_paths"] += 1
            if tt.get("mae_r") is not None:
                stats["with_mae_mfe"] += 1
        else:
            if extra.get("preTags"):
                stats["with_extra_pre_tags"] += 1
            if extra.get("strategy_variables"):
                stats["with_extra_strategy_variables"] += 1
            if extra.get("mae_r") is not None or extra.get("mfe_r") is not None:
                stats["with_mae_mfe"] += 1
    stats["variable_keys"] = sorted(stats["variable_keys"])
    return stats


def print_stats_block(title: str, stats: dict[str, Any], expected: int | None = None) -> None:
    print(f"\n{title}")
    count = int(stats.get("count") or 0)
    if expected is not None:
        delta = count - expected
        flag = "OK" if count == expected else ("WARN" if abs(delta) <= max(2, expected * 0.02) else "FAIL")
        print(f"  trades: {count} (expected {expected}) [{flag}]")
    else:
        print(f"  trades: {count}")
    for key, value in stats.items():
        if key in {"count", "variable_keys"}:
            continue
        if isinstance(value, int):
            print(f"  {key}: {value} ({_pct(value, count)})")
    if stats.get("variable_keys"):
        print(f"  variable_keys: {', '.join(stats['variable_keys'])}")


def sample_backtest(trades: list[dict[str, Any]], n: int) -> None:
    payloads = [t.get("payload") or t for t in trades[:n]]
    for i, t in enumerate(payloads, start=1):
        print(f"\n  sample backtest #{i}")
        print(f"    symbol={t.get('symbol')} pnl={t.get('pnl')} r={t.get('rMultiple')}")
        print(f"    preTags={t.get('preTags')}")
        print(f"    postTags={t.get('postTags')}")
        pre_vars = t.get("strategy_variables") or []
        if pre_vars:
            print(f"    strategy_variables[0]={pre_vars[0]}")
        print(f"    bar_close_r len={len(t.get('bar_close_r') or [])} mae_r={t.get('mae_r')} mfe_r={t.get('mfe_r')}")


def sample_live(entries: list[dict[str, Any]], n: int) -> None:
    for i, e in enumerate(entries[:n], start=1):
        extra = e.get("extra_data") or {}
        tt = extra.get("talaria_trade") if isinstance(extra, dict) else None
        print(f"\n  sample live #{i} id={e.get('id')}")
        print(f"    symbol={e.get('symbol')} pnl={e.get('pnl')} rr={e.get('rr')}")
        print(f"    variables column={e.get('variables')}")
        if isinstance(tt, dict):
            print(f"    talaria_trade.preTags={tt.get('preTags')}")
            print(f"    talaria_trade.postTags={tt.get('postTags')}")
            sv = tt.get("strategy_variables") or []
            if sv:
                print(f"    talaria_trade.strategy_variables[0]={sv[0]}")
            print(
                f"    talaria_trade bar_close_r len={len(tt.get('bar_close_r') or [])} "
                f"mae_r={tt.get('mae_r')} mfe_r={tt.get('mfe_r')}"
            )
        else:
            print(f"    extra_data.preTags={extra.get('preTags') if isinstance(extra, dict) else None}")


def load_local_expected(stem: str) -> int | None:
    path = NEW_DATA_DIR / f"{stem}-talaria-adapted.json"
    if not path.is_file():
        return None
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
        return len(rows) if isinstance(rows, list) else None
    except Exception:
        return None


def verify_backtest(client: Client, row: dict[str, Any], sample_n: int) -> bool:
    sid = int(row["source_id"])
    name = row.get("file", "")
    stem = Path(name).stem
    expected = int(row.get("trades") or 0)
    local_expected = load_local_expected(stem)
    data = client._request(f"{client.origin}/api/sessions/{sid}/journal-trades")
    trades = list(data.get("trades") or [])
    stats = summarize_backtest_trades(trades)
    print_stats_block(f"BACKTEST id={sid} ({stem})", stats, expected)
    if local_expected and local_expected != stats["count"]:
        print(f"  local adapted json count={local_expected} (delta {stats['count'] - local_expected})")
    if sample_n:
        sample_backtest(trades, sample_n)
    return stats["count"] == expected


def verify_live(client: Client, row: dict[str, Any], sample_n: int) -> bool:
    pid = int(row.get("profile_id") or 0)
    aid = int(row["source_id"])
    stem = Path(row.get("file", "")).stem
    expected = int(row.get("trades") or 0)
    if not pid:
        acc = client._request(
            f"{client.journal_journal_base}/live-accounts/{aid}",
            use_journal_token=True,
        )
        pid = int((acc.get("account") or {}).get("profile_id") or 0)
    entries = client._request(
        f"{client.journal_base}/journal/list?profile_id={pid}",
        use_journal_token=True,
    )
    if not isinstance(entries, list):
        entries = list(entries.get("trades") or entries.get("entries") or [])
    stats = summarize_live_entries(entries)
    print_stats_block(f"LIVE account id={aid} profile={pid} ({stem})", stats, expected)
    if sample_n:
        sample_live(entries, sample_n)
    return stats["count"] == expected


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify Community mentor import on VPS")
    parser.add_argument("--origin", default=ORIGIN_DEFAULT)
    parser.add_argument("--email", default="data@talaria-log.com")
    parser.add_argument("--password", default="data@talaria-log.com")
    parser.add_argument("--session-id", type=int, default=0)
    parser.add_argument("--live-account-id", type=int, default=0)
    parser.add_argument("--sample", type=int, default=1, help="Print N sample trades per source (0=off)")
    args = parser.parse_args()

    if not SUMMARY_PATH.is_file():
        print(f"Missing summary: {SUMMARY_PATH}", file=sys.stderr)
        return 1

    summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
    client = Client(args.origin)
    client.login(args.email, args.password)

    rows = [r for r in summary if r.get("status") == "ok"]
    if args.session_id:
        rows = [r for r in rows if int(r.get("source_id") or 0) == args.session_id]
    if args.live_account_id:
        rows = [r for r in rows if int(r.get("source_id") or 0) == args.live_account_id]

    ok = 0
    warn = 0
    for row in rows:
        kind = row.get("source_kind")
        try:
            if kind == "backtest":
                passed = verify_backtest(client, row, args.sample)
            elif kind == "live_personal":
                passed = verify_live(client, row, args.sample)
            else:
                continue
            if passed:
                ok += 1
            else:
                warn += 1
        except Exception as exc:
            print(f"\nERROR {row.get('file')}: {exc}", file=sys.stderr)
            warn += 1

    print(f"\n=== Done: {ok} exact matches, {warn} with count mismatch or error (of {len(rows)} sources) ===")
    print("Tip: small mismatches are normal when mentor rows lacked prices (see import warnings).")
    return 0 if warn == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
