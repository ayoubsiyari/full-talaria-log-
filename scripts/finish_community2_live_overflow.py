#!/usr/bin/env python3
"""Upload Community 2 live files that hit the personal live cap as standard backtests."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from batch_adapt_mentor_data import process_file  # noqa: E402
from seed_dashboard_test_sessions import Client  # noqa: E402

NEW_DATA_DIR = ROOT / "mentor data" / "new data 2"
OVERFLOW_PREFIX = "Community 2 · LiveBT · "
SUMMARY_PATH = NEW_DATA_DIR / "community2-batch-summary.json"


def failed_live_files() -> list[str]:
    if not SUMMARY_PATH.is_file():
        return []
    rows = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
    out: list[str] = []
    for row in rows:
        if row.get("status") != "error":
            continue
        err = str(row.get("error", "")).lower()
        if "live journal limit" in err or "limit reached" in err:
            name = str(row.get("file") or "").strip()
            if name and name not in out:
                out.append(name)
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--origin", default="http://31.97.192.82:3000")
    parser.add_argument("--email", default="data@talaria-log.com")
    parser.add_argument("--password", default="data@talaria-log.com")
    parser.add_argument(
        "--files",
        default="",
        help="Comma-separated filenames; default = failed live rows from community2-batch-summary.json",
    )
    args = parser.parse_args()

    files = [f.strip() for f in args.files.split(",") if f.strip()] if args.files else failed_live_files()
    if not files:
        print("No overflow live files to upload.")
        return 0

    client = Client(args.origin)
    client.login(args.email, args.password)
    client.load_strategies()
    chart_files = client.load_files()
    existing_bt = {s.get("name", "").lower() for s in client.list_backtest_sessions()}

    results: list[dict] = []
    if SUMMARY_PATH.is_file():
        results = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))

    for filename in files:
        print(f"\n=== overflow backtest: {filename} ===")
        row = process_file(
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
        results = [r for r in results if r.get("file") != filename]
        results.append({**row, "file": filename, "overflow_backtest": True})
        if row.get("status") == "ok":
            existing_bt.add(f"{OVERFLOW_PREFIX}{Path(filename).stem}".lower())

    SUMMARY_PATH.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nUpdated summary → {SUMMARY_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
