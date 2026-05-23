#!/usr/bin/env python3
"""
Backfill QuestDB OHLC tables from canonical CSV datasets.

Run from chart v 1.4/chart with DATABASE_URL + QuestDB env configured:

  cd "chart v 1.4/chart"
  set QUESTDB_ENABLED=true
  set QUESTDB_PG_URL=postgresql://admin:quest@localhost:8812/qdb
  set QUESTDB_ILP_HOST=127.0.0.1
  python3 scripts/migrate_csv_to_questdb.py

Docker (Linux container — use python3, not Windows `py`):

  docker compose exec trading-chart-worker python3 scripts/migrate_csv_to_questdb.py --file-id 22 --force

Options:
  --dry-run       List files that would be synced
  --force         Re-sync even when QuestDB already has rows
  --file-id N     Sync a single dataset id
  --limit N       Process at most N files (0 = all)
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import traceback

# Avoid spawning binary/what-if background workers when importing api_server.
os.environ["APP_ROLE"] = "migrate"
os.environ["FIrstrate_SCHEDULE_DISABLE"] = "true"

_CHART_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _CHART_DIR not in sys.path:
    sys.path.insert(0, _CHART_DIR)

from api_server import (  # noqa: E402
    CSVFile,
    SessionLocal,
    _parse_candles_from_csv,
    _resolve_dataset_csv_for_file,
)
import questdb_store  # noqa: E402

# Large files: skip pre-agg rebuild (reads use runtime SAMPLE BY on ohlcv_1m).
_PARTIAL_ROW_THRESHOLD = 50_000


def sync_one(file_id: int, force: bool, dry_run: bool) -> dict:
    db = SessionLocal()
    try:
        db_file = db.query(CSVFile).filter(CSVFile.id == file_id).first()
        if not db_file:
            return {"file_id": file_id, "status": "not_found"}

        existing = questdb_store.count_bars(file_id) if questdb_store.questdb_enabled() else 0
        if existing > 0 and not force:
            if existing < _PARTIAL_ROW_THRESHOLD:
                return {
                    "file_id": file_id,
                    "status": "partial",
                    "existing": existing,
                    "hint": "Re-run with --force to replace corrupt partial data",
                }
            return {"file_id": file_id, "status": "skipped", "existing": existing}

        csv_path = _resolve_dataset_csv_for_file(db_file)
        if not csv_path.exists():
            return {"file_id": file_id, "status": "csv_missing"}

        if dry_run:
            return {"file_id": file_id, "status": "would_sync", "csv": str(csv_path)}

        t0 = time.monotonic()
        print(f"📂 Parsing CSV for file {file_id} ({db_file.original_name}) …", flush=True)
        candles = _parse_candles_from_csv(csv_path, original_name=db_file.original_name)
        if not candles:
            return {"file_id": file_id, "status": "empty_csv"}

        print(f"📤 Syncing {len(candles):,} candles to QuestDB via PG wire (1m only) …", flush=True)
        result = questdb_store.sync_file_candles(
            file_id,
            candles,
            rebuild_agg=False,
        )
        elapsed = round(time.monotonic() - t0, 2)
        visible = int(result.get("visible_1m") or 0)
        if visible < max(1000, int(len(candles) * 0.99)):
            return {
                "file_id": file_id,
                "status": "incomplete",
                "rows_1m": len(candles),
                "visible_1m": visible,
                "elapsed_sec": elapsed,
                **result,
                "hint": "QuestDB ILP did not commit full row count — check questdb logs / disk / OOM",
            }
        return {
            "file_id": file_id,
            "status": "synced",
            "rows_1m": len(candles),
            "elapsed_sec": elapsed,
            **result,
        }
    except Exception as exc:
        return {
            "file_id": file_id,
            "status": "error",
            "error": str(exc)[:500],
            "traceback": traceback.format_exc()[-2000:],
        }
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate CSV datasets into QuestDB")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--file-id", type=int, default=0)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    if not questdb_store.questdb_enabled():
        print("QUESTDB_ENABLED is false — set env and retry")
        return 1

    questdb_store.ensure_schema()

    if args.file_id:
        out = sync_one(args.file_id, args.force, args.dry_run)
        print(out, flush=True)
        return 0 if out.get("status") == "synced" else 1

    db = SessionLocal()
    try:
        q = db.query(CSVFile).order_by(CSVFile.id.asc())
        if args.limit and args.limit > 0:
            q = q.limit(args.limit)
        files = q.all()
    finally:
        db.close()

    ok = 0
    skipped = 0
    failed = 0
    for f in files:
        out = sync_one(int(f.id), args.force, args.dry_run)
        print(out, flush=True)
        st = out.get("status")
        if st in ("synced", "would_sync"):
            ok += 1
        elif st == "skipped":
            skipped += 1
        else:
            failed += 1

    print(f"done synced={ok} skipped={skipped} failed={failed} dry_run={args.dry_run}", flush=True)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
