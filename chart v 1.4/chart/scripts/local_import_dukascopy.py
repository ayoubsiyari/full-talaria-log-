#!/usr/bin/env python3
"""
Local dev helper: fetch Dukascopy M1 bid CSV and register as a chart dataset (no admin cookie).

Run inside the trading-chart container:
  python3 scripts/local_import_dukascopy.py --instrument eurusd --days 30
  python3 scripts/local_import_dukascopy.py --instrument gbpusd --from 2024-01-01 --to 2024-01-31

Or from repo root:
  docker compose exec trading-chart python3 scripts/local_import_dukascopy.py --majors --days 14
"""
from __future__ import annotations

import argparse
import secrets
import shutil
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from api_server import (  # noqa: E402
    DUKASCOPY_DEFAULT_TIMEFRAME,
    DUKASCOPY_SCRIPT_PATH,
    UPLOAD_DIR,
    _store_dataset_file,
)

MAJORS = ("eurusd", "gbpusd", "usdjpy", "audusd", "usdcad")


def _parse_date(value: str) -> datetime:
    return datetime.strptime(value.strip(), "%Y-%m-%d")


def _fetch_one(instrument: str, from_dt: datetime, to_dt: datetime) -> dict:
    instrument = instrument.strip().lower()
    from_str = from_dt.strftime("%Y-%m-%d")
    to_str = to_dt.strftime("%Y-%m-%d")
    original_name = f"{instrument}-{DUKASCOPY_DEFAULT_TIMEFRAME}-bid-{from_str}-{to_str}.csv"
    unique_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(3)}_{original_name}"
    output_path = (UPLOAD_DIR / unique_name).resolve()

    node = shutil.which("node")
    if not node:
        raise RuntimeError("node not found in PATH")
    if not DUKASCOPY_SCRIPT_PATH.exists():
        raise RuntimeError(f"missing Dukascopy script: {DUKASCOPY_SCRIPT_PATH}")

    cmd = [
        node,
        str(DUKASCOPY_SCRIPT_PATH),
        "--instrument",
        instrument,
        "--from",
        from_str,
        "--to",
        to_str,
        "--timeframe",
        DUKASCOPY_DEFAULT_TIMEFRAME,
        "--out",
        str(output_path),
    ]
    print(f"[dukascopy] {instrument.upper()} {from_str} → {to_str}", flush=True)
    proc = subprocess.run(cmd, cwd=str(_ROOT), capture_output=True, text=True, timeout=1200)
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "unknown error").strip()
        raise RuntimeError(err.splitlines()[-1] if err else "Dukascopy fetch failed")
    if not output_path.exists() or output_path.stat().st_size <= 0:
        raise RuntimeError("empty CSV from Dukascopy")

    return _store_dataset_file(
        file_path=output_path,
        original_name=original_name,
        description=f"Local Dukascopy {instrument.upper()} M1 {from_str} to {to_str}",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch Dukascopy M1 and register chart datasets")
    parser.add_argument("--instrument", "-i", action="append", default=[], help="e.g. eurusd (repeatable)")
    parser.add_argument("--majors", action="store_true", help=f"Fetch {', '.join(MAJORS)}")
    parser.add_argument("--days", type=int, default=30, help="Lookback when --from/--to omitted")
    parser.add_argument("--from", dest="from_date", help="YYYY-MM-DD")
    parser.add_argument("--to", dest="to_date", help="YYYY-MM-DD")
    args = parser.parse_args()

    instruments = [x.strip().lower() for x in args.instrument if x.strip()]
    if args.majors:
        instruments.extend(MAJORS)
    if not instruments:
        instruments = ["eurusd"]
    # preserve order, dedupe
    seen: set[str] = set()
    instruments = [x for x in instruments if not (x in seen or seen.add(x))]

    if args.from_date and args.to_date:
        from_dt = _parse_date(args.from_date)
        to_dt = _parse_date(args.to_date)
    else:
        to_dt = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        from_dt = to_dt - timedelta(days=max(1, args.days))

    ok = 0
    for inst in instruments:
        try:
            result = _fetch_one(inst, from_dt, to_dt)
            file_info = (result or {}).get("file") or {}
            print(f"  OK {inst.upper()} file_id={file_info.get('id')} rows={file_info.get('row_count')}", flush=True)
            ok += 1
        except Exception as exc:
            print(f"  FAIL {inst.upper()}: {exc}", file=sys.stderr, flush=True)
    print(f"Done: {ok}/{len(instruments)} datasets queued", flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
