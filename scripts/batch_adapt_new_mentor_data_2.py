#!/usr/bin/env python3
"""
Import 20 community sources from mentor data/new data 2/:

  10 standard backtest sessions (type 1)
  10 live personal journal accounts (type 3)

Uses the same full-field pipeline as batch 1 (tags, variables, bar paths,
excursion input sanitization, synthetic live-journal discipline/demons).

Usage:
  py scripts/batch_adapt_new_mentor_data_2.py --dry-run
  py scripts/batch_adapt_new_mentor_data_2.py --prepare-live-slots --personal-live-cap 15 \\
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
    archive_live_account,
    bump_user_live_journal_caps,
    get_live_journal_limits,
    process_file,
    slug_stem,
)
from seed_dashboard_test_sessions import Client  # noqa: E402

NEW_DATA_DIR = ROOT / "mentor data" / "new data 2"
SESSION_PREFIX = "Community 2 · "
TARGET_USER_ID = 21
# Community batch 1 personal live journals (free slots when --prepare-live-slots)
COMMUNITY1_LIVE_IDS = [38, 39, 40, 41, 42]

NEW_BACKTEST_MANIFEST: list[str] = [
    "al_shaibh_Backtest_Profile_trading_journal_complete.xlsx",
    "kanaanm498_Bktest_300_trading_journal_complete.xlsx",
    "saadtrader16_backtest_15m__1m__15s_trading_journal_complete.xlsx",
    "wissamfrxx_Backtest_Profile_trading_journal_complete.xlsx",
    "mohammadjassem122_Weak_Strategy_trading_journal_complete.xlsx",
    "wissamfrxx_swing_strategy_trading_journal_complete.xlsx",
    "wissamfrxx_4h_modified_trading_journal_complete.xlsx",
    "abdullhmth_WD_2019-7-8-9_trading_journal_complete.xlsx",
    "xluffyd97_Rayleigh-MMXM_trading_journal_complete.xlsx",
    "alhamly_1_min_trading_journal_complete.xlsx",
]

NEW_LIVE_PERSONAL_MANIFEST: list[str] = [
    "abdullhmth_LIVE_JOURNAL_WD_trading_journal_complete.xlsx",
    "mohamed.tawil_IB_trading_journal_complete.xlsx",
    "mohamed.tawil_M.A_Strategy_trading_journal_complete.xlsx",
    "mohamed.tawil_M.T_Strategy_trading_journal_complete.xlsx",
    "mohamed.tawil_PCR_trading_journal_complete.xlsx",
    "ah.ameer2020_A_trading_journal_complete.xlsx",
    "alramadhan.ahmad_AA_trading_journal_complete.xlsx",
    "asila2288_Sila_trading_journal_complete.xlsx",
    "younis2096_Default_Profile_trading_journal_complete.xlsx",
    "wwwghu678_journal-1_trading_journal_complete.xlsx",
]


def build_manifest() -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = [(f, "backtest") for f in NEW_BACKTEST_MANIFEST]
    rows.extend((f, "live_personal") for f in NEW_LIVE_PERSONAL_MANIFEST)
    return rows


def archive_community_batch1_live(client: Client, account_ids: list[int]) -> None:
    for aid in account_ids:
        try:
            archive_live_account(client, aid)
            print(f"  archived Community batch 1 live journal id={aid}")
        except Exception as exc:
            if "404" not in str(exc):
                print(f"  skip archive id={aid}: {exc}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch import mentor data/new data 2 (20 sources)")
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
        help="Archive Community batch 1 personal live journals (ids 38–42) before import",
    )
    parser.add_argument(
        "--personal-live-cap",
        type=int,
        default=15,
        help="Target personal live journal cap (10 new + headroom)",
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
        print("Archiving Community batch 1 personal live journals to free slots ...")
        archive_community_batch1_live(client, COMMUNITY1_LIVE_IDS)

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
            print("  WARN: admin bump failed — overflow script may be needed for extra live files")

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
                name = f"{SESSION_PREFIX}{slug_stem(filename)}".lower()
                if source_kind == "backtest":
                    existing_bt.add(name)
                elif source_kind == "live_personal":
                    existing_live.add(name)
        except Exception as exc:
            print(f"  FAILED {filename}: {exc}", file=sys.stderr)
            results.append({"file": filename, "status": "error", "error": str(exc)})

    summary_path = NEW_DATA_DIR / "community2-batch-summary.json"
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
