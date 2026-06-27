#!/usr/bin/env python3
"""Finish community import: upload remaining live files as standard backtests when live cap blocks."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from batch_adapt_mentor_data import process_file  # noqa: E402
from seed_dashboard_test_sessions import Client  # noqa: E402

NEW_DATA_DIR = ROOT / "mentor data" / "new data"
OVERFLOW_PREFIX = "Community · LiveBT · "

OVERFLOW_FILES = [
    "karamkannan_liq_strategy_trading_journal_complete.xlsx",
    "zizo05561_سكالب_NQ_trading_journal_complete.xlsx",
    "mohammedosama717_Liquidity_trading_journal_complete.xlsx",
    "mr1gega_Mahmoud_Gega_trading_journal_complete.xlsx",
    "youcef.hamadi.yh_ib_2.0_trading_journal_complete.xlsx",
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--origin", default="http://31.97.192.82:3000")
    parser.add_argument("--email", default="data@talaria-log.com")
    parser.add_argument("--password", default="data@talaria-log.com")
    args = parser.parse_args()

    client = Client(args.origin)
    client.login(args.email, args.password)
    client.load_strategies()
    chart_files = client.load_files()
    existing_bt = {s.get("name", "").lower() for s in client.list_backtest_sessions()}

    for filename in OVERFLOW_FILES:
        process_file(
            client,
            filename=filename,
            source_kind="backtest",
            files=chart_files,
            existing_bt=existing_bt,
            existing_live=set(),
            skip_existing=False,
            dry_run=False,
            min_trades=2,
            mentor_dir=NEW_DATA_DIR,
            output_dir=NEW_DATA_DIR,
            session_prefix=OVERFLOW_PREFIX,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
