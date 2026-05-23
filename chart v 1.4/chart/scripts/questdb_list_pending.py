#!/usr/bin/env python3
"""
List datasets that are not fully synced into QuestDB.

Run on the VPS (inside trading-chart-worker):

  docker compose exec trading-chart-worker python3 scripts/questdb_list_pending.py

Show only ids still needing migrate (missing + partial):

  docker compose exec trading-chart-worker python3 scripts/questdb_list_pending.py --ids-only

JSON for scripts / dashboards:

  docker compose exec trading-chart-worker python3 scripts/questdb_list_pending.py --json
"""

from __future__ import annotations

import argparse
import json
import os
import sys

os.environ.setdefault("APP_ROLE", "migrate")
os.environ.setdefault("FIrstrate_SCHEDULE_DISABLE", "true")

_CHART_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _CHART_DIR not in sys.path:
    sys.path.insert(0, _CHART_DIR)

from api_server import CSVFile, SessionLocal  # noqa: E402
import questdb_store  # noqa: E402


def _classify(file_id: int, csv_rows: int, q_rows: int, *, min_rows: int) -> str:
    if q_rows <= 0:
        return "missing"
    if csv_rows > 0:
        expected = max(min_rows, int(csv_rows * 0.99))
        if q_rows < expected:
            return "partial"
    elif q_rows < min_rows:
        return "partial"
    return "synced"


def _load_rows(min_rows: int) -> list[dict]:
    if not questdb_store.questdb_enabled():
        raise RuntimeError("QUESTDB_ENABLED is false — set env and retry")

    questdb_store.ensure_schema()
    db = SessionLocal()
    try:
        files = db.query(CSVFile).order_by(CSVFile.id.asc()).all()
        out: list[dict] = []
        for f in files:
            file_id = int(f.id)
            csv_rows = int(f.row_count or 0)
            q_rows = questdb_store.count_bars(file_id)
            status = _classify(file_id, csv_rows, q_rows, min_rows=min_rows)
            out.append(
                {
                    "file_id": file_id,
                    "status": status,
                    "questdb_rows_1m": q_rows,
                    "csv_rows_stored": csv_rows,
                    "original_name": f.original_name or "",
                    "filename": f.filename or "",
                    "upload_date": f.upload_date.isoformat() if f.upload_date else None,
                }
            )
        return out
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="List CSV datasets not yet fully synced to QuestDB"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON",
    )
    parser.add_argument(
        "--ids-only",
        action="store_true",
        help="Print only file_id values that still need migrate (one per line)",
    )
    parser.add_argument(
        "--include-synced",
        action="store_true",
        help="With --ids-only, print every file id (not just pending)",
    )
    parser.add_argument(
        "--min-rows",
        type=int,
        default=1000,
        help="Treat QuestDB counts below this (or below 99%% of csv_rows_stored) as partial (default: 1000)",
    )
    args = parser.parse_args()

    try:
        rows = _load_rows(args.min_rows)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    pending = [r for r in rows if r["status"] in ("missing", "partial")]
    synced = [r for r in rows if r["status"] == "synced"]
    missing_n = sum(1 for r in rows if r["status"] == "missing")
    partial_n = sum(1 for r in rows if r["status"] == "partial")

    summary = {
        "total_datasets": len(rows),
        "synced_count": len(synced),
        "pending_count": len(pending),
        "missing_count": missing_n,
        "partial_count": partial_n,
    }

    if args.ids_only:
        target = rows if args.include_synced else pending
        for r in target:
            print(r["file_id"])
        return 0

    if args.json:
        print(
            json.dumps(
                {
                    "summary": summary,
                    "pending": pending,
                    "synced": synced,
                },
                indent=2,
            )
        )
        return 0

    print(f"QuestDB sync status — {summary['synced_count']} synced, {summary['pending_count']} pending "
          f"({missing_n} missing, {partial_n} partial), {summary['total_datasets']} total\n")
    print(f"{'ID':>5}  {'STATUS':<8}  {'QuestDB 1m':>12}  {'CSV rows':>12}  Name")
    print("-" * 72)

    for r in rows:
        name = r["original_name"] or r["filename"] or "?"
        marker = " " if r["status"] == "synced" else "*"
        print(
            f"{marker}{r['file_id']:>4}  {r['status']:<8}  {r['questdb_rows_1m']:>12,}  "
            f"{r['csv_rows_stored']:>12,}  {name}"
        )

    print()
    if pending:
        ids = " ".join(str(r["file_id"]) for r in pending)
        print(f"Pending file ids ({len(pending)}): {ids}")
        print()
        print("Migrate one:")
        print(f"  docker compose exec trading-chart-worker python3 scripts/migrate_csv_to_questdb.py --file-id {pending[0]['file_id']}")
        print()
        print("Migrate all pending (skips already-synced files):")
        print("  docker compose exec trading-chart-worker python3 scripts/migrate_csv_to_questdb.py")
        print()
        print("Re-sync partial/corrupt rows:")
        print(f"  docker compose exec trading-chart-worker python3 scripts/migrate_csv_to_questdb.py --file-id {pending[0]['file_id']} --force")
    else:
        print("All datasets are synced to QuestDB.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
