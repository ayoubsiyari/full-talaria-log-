#!/usr/bin/env python3
"""
Import community journals from mentor data/new data/:

  10 standard backtest sessions (type 1)
  10 live personal journal accounts (type 3)

Usage:
  py scripts/batch_adapt_new_mentor_data.py
  py scripts/batch_adapt_new_mentor_data.py --dry-run
  py scripts/batch_adapt_new_mentor_data.py --prepare-live-slots --personal-live-cap 15 \\
      --admin-email ADMIN --admin-password PASS
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from batch_adapt_mentor_data import (  # noqa: E402
    ORIGIN_DEFAULT,
    archive_mentor_personal_live_journals,
    bump_user_live_journal_caps,
    get_live_journal_limits,
    process_file,
    slug_stem,
)
from seed_dashboard_test_sessions import Client  # noqa: E402

NEW_DATA_DIR = ROOT / "mentor data" / "new data"
SESSION_PREFIX = "Community · "
TARGET_USER_ID = 21
MENTOR_PERSONAL_LIVE_IDS = [28, 29, 30, 31, 32]

# 10 standard backtests — filenames resolved under NEW_DATA_DIR (deduped by basename)
NEW_BACKTEST_MANIFEST: list[str] = [
    "max99331_BT_Fayez_trading_journal_complete.xlsx",
    "moa.allo01_Backtest_1_trading_journal_complete.xlsx",
    "ialkataleen_backtest_trading_journal_complete.xlsx",
    "karkosh111_Backtest_Profile_trading_journal_complete.xlsx",
    "moa.allo01_Backtest_2_trading_journal_complete.xlsx",
    "moa.allo01_Backtest_3_كرون_trading_journal_complete.xlsx",
    "roonem.o.o.n_Backtest_Profile_trading_journal_complete.xlsx",
    "rami.hamwe_Backtest_Profile_trading_journal_complete.xlsx",
    "maitham.a.alzaher_Back_Test_trading_journal_complete.xlsx",
    "shoshoob_Backtest_Profile_trading_journal_complete.xlsx",
]

# 10 live personal journals — diverse symbols / users
NEW_LIVE_PERSONAL_MANIFEST: list[str] = [
    "mutasemtrade51_30sec_strategy_trading_journal_complete.xlsx",
    "karamkannan_LIQ_TRAP_trading_journal_complete.xlsx",
    "rami.hamwe_LIVE_trading_journal_complete.xlsx",
    "ahmad.kuddo27_Haidar-Turtel_Soup_trading_journal_complete.xlsx",
    "mohameddmare12_123_trading_journal_complete.xlsx",
    "karamkannan_liq_strategy_trading_journal_complete.xlsx",
    "zizo05561_سكالب_NQ_trading_journal_complete.xlsx",
    "mohammedosama717_Liquidity_trading_journal_complete.xlsx",
    "mr1gega_Mahmoud_Gega_trading_journal_complete.xlsx",
    "youcef.hamadi.yh_ib_2.0_trading_journal_complete.xlsx",
]


def build_manifest() -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = [(f, "backtest") for f in NEW_BACKTEST_MANIFEST]
    rows.extend((f, "live_personal") for f in NEW_LIVE_PERSONAL_MANIFEST)
    return rows


def display_name_for(filename: str) -> str:
    return f"{SESSION_PREFIX}{slug_stem(filename)}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch import mentor data/new data community journals")
    parser.add_argument("--origin", default=ORIGIN_DEFAULT)
    parser.add_argument("--email", default="data@talaria-log.com")
    parser.add_argument("--password", default="data@talaria-log.com")
    parser.add_argument("--user-id", type=int, default=TARGET_USER_ID)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-existing", action="store_true", default=True)
    parser.add_argument("--no-skip-existing", action="store_false", dest="skip_existing")
    parser.add_argument("--min-trades", type=int, default=2)
    parser.add_argument(
        "--prepare-live-slots",
        action="store_true",
        help="Archive existing Mentor personal live journals (ids 28–32) before import",
    )
    parser.add_argument(
        "--personal-live-cap",
        type=int,
        default=15,
        help="Target personal live journal cap (existing 5 + 10 new = 15)",
    )
    parser.add_argument("--admin-email", default="", help="Journal admin email to raise live caps")
    parser.add_argument("--admin-password", default="", help="Journal admin password")
    args = parser.parse_args()

    manifest = build_manifest()
    client = Client(args.origin)
    print(f"Logging in as {args.email} ...")
    client.login(args.email, args.password)
    client.load_strategies()

    if args.prepare_live_slots and not args.dry_run:
        print("Archiving Mentor personal live journals to free slots ...")
        archive_mentor_personal_live_journals(client, MENTOR_PERSONAL_LIVE_IDS)

    if args.admin_email and args.admin_password and not args.dry_run:
        print(f"Bumping user {args.user_id} personal live cap to {args.personal_live_cap} ...")
        ok = bump_user_live_journal_caps(
            client,
            user_id=args.user_id,
            personal_min=args.personal_live_cap,
            admin_email=args.admin_email,
            admin_password=args.admin_password,
        )
        if ok:
            limits = get_live_journal_limits(client)
            print(f"  limits now: {limits}")
        else:
            print("  WARN: admin bump failed — only up to current cap live journals can be created")

    chart_files = client.load_files()
    existing_bt = {s.get("name", "").lower() for s in client.list_backtest_sessions()}
    existing_live = {a.get("name", "").lower() for a in client.list_live_accounts()}
    limits = get_live_journal_limits(client)
    print(
        f"Chart datasets: {len(chart_files)} | backtests: {len(existing_bt)} | "
        f"live journals: {len(existing_live)} | personal cap: {limits.get('personal')}"
    )

    results: list[dict[str, Any]] = []
    started = time.time()
    for filename, source_kind in manifest:
        try:
            row = process_file(
                client,
                filename=filename,
                source_kind=source_kind,
                files=chart_files,
                existing_bt=existing_bt,
                existing_live=existing_live,
                skip_existing=args.skip_existing,
                dry_run=args.dry_run,
                min_trades=args.min_trades,
                mentor_dir=NEW_DATA_DIR,
                output_dir=NEW_DATA_DIR,
                session_prefix=SESSION_PREFIX,
            )
            results.append(row)
            if row.get("status") == "ok" and not args.dry_run:
                name = display_name_for(filename).lower()
                if source_kind == "backtest":
                    existing_bt.add(name)
                elif source_kind == "live_personal":
                    existing_live.add(name)
        except Exception as exc:
            print(f"  FAILED {filename}: {exc}", file=sys.stderr)
            results.append({"file": filename, "status": "error", "error": str(exc)})

    summary_path = NEW_DATA_DIR / "community-batch-summary.json"
    summary_path.write_text(json.dumps(results, indent=2), encoding="utf-8")

    ok = sum(1 for r in results if r.get("status") in {"ok", "dry_run"})
    failed = sum(1 for r in results if r.get("status") == "error")
    trades = sum(int(r.get("trades") or 0) for r in results)
    elapsed = round(time.time() - started, 1)
    print(f"\nDone in {elapsed}s — files ok={ok} failed={failed} trades={trades}")
    print(f"Summary → {summary_path}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
