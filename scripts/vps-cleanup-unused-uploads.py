#!/usr/bin/env python3
"""
Remove unused files under chart uploads/ (safe for live backtests).

Keeps: csv_files registry (DB), archive/bin/tiles for registered datasets,
       firstrate temp dirs newer than MIN_AGE_H (active imports).

Removes: stale firstrate_* scratch dirs, _quarantine/, orphan CSVs,
         old import job temps (duka_*, bn_*, yahoo_*), empty import dirs, .csv.tmp orphans.

Run on VPS from repo root:
  docker compose exec -T trading-chart python - < scripts/vps-cleanup-unused-uploads.py
  docker compose exec -T trading-chart python - < scripts/vps-cleanup-unused-uploads.py --apply
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, "/app")

from api_server import (  # noqa: E402
    CSV_ARCHIVE_DIR,
    CSVFile,
    FIrstrate_JOBS_DIR,
    QUARANTINE_DIR,
    UPLOAD_DIR,
    get_db,
)

MIN_AGE_H = 48
JOB_TEMP_PREFIXES = ("duka_", "bn_", "yahoo_")


def _bytes(path: Path) -> int:
    if not path.exists():
        return 0
    if path.is_file():
        return path.stat().st_size
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def _registered_paths(db) -> set[Path]:
    out: set[Path] = set()
    for row in db.query(CSVFile).all():
        for base in (UPLOAD_DIR, CSV_ARCHIVE_DIR):
            out.add((base / row.filename).resolve())
        out.add(Path(row.filename).resolve())
    return out


def _firstrate_import_running() -> bool:
    if not FIrstrate_JOBS_DIR.exists():
        return False
    for p in FIrstrate_JOBS_DIR.glob("*.json"):
        try:
            j = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if j.get("status") in ("queued", "running"):
            return True
    return False


def _plan(db) -> list[tuple[str, Path, int]]:
    reg = _registered_paths(db)
    now = time.time()
    min_age_sec = MIN_AGE_H * 3600
    plan: list[tuple[str, Path, int]] = []

    if QUARANTINE_DIR.exists():
        plan.append(("quarantine", QUARANTINE_DIR, _bytes(QUARANTINE_DIR)))

    for p in sorted(UPLOAD_DIR.iterdir()):
        if not p.is_dir():
            continue
        name = p.name
        if name in ("bin", "tiles", "archive", "aggregates", "support", "session_archive",
                    "firstrate_jobs", "dukascopy_jobs", "binance_jobs", "yahoo_cme_jobs"):
            continue
        age = now - p.stat().st_mtime
        if name.startswith("firstrate_"):
            if age >= min_age_sec:
                plan.append(("firstrate_temp", p, _bytes(p)))
            continue
        if any(name.startswith(pref) for pref in JOB_TEMP_PREFIXES) and age >= min_age_sec:
            plan.append(("import_job_temp", p, _bytes(p)))
            continue
        if name.endswith(".csv") or name.endswith(".csv.tmp") or "_firstrate_" in name:
            if _bytes(p) == 0 and age >= min_age_sec:
                plan.append(("empty_import_dir", p, 0)
                continue

    skip_parts = {"_quarantine", "firstrate_jobs"}
    for pat in ("*.csv", "*.csv.tmp"):
        for f in UPLOAD_DIR.rglob(pat):
            if any(part in skip_parts for part in f.parts):
                continue
            if "firstrate_" in f.parts and f.parent.name.startswith("firstrate_"):
                continue
            try:
                if f.resolve() in reg:
                    continue
            except OSError:
                pass
            plan.append(("orphan_csv", f, f.stat().st_size if f.is_file() else _bytes(f)))

    seen: set[str] = set()
    deduped: list[tuple[str, Path, int]] = []
    for kind, path, nbytes in plan:
        key = str(path.resolve())
        if key in seen:
            continue
        seen.add(key)
        deduped.append((kind, path, nbytes))
    return deduped


def main() -> int:
    ap = argparse.ArgumentParser(description="Clean unused chart upload artifacts")
    ap.add_argument(
        "--apply",
        action="store_true",
        help="Actually delete (default is dry-run only)",
    )
    args = ap.parse_args()
    dry = not args.apply

    db = next(get_db())
    try:
        plan = _plan(db)
    finally:
        db.close()

    if _firstrate_import_running():
        print("NOTE: FirstRate import is running — temps <48h are kept; only stale dirs are listed.")

    by_kind: dict[str, int] = {}
    total = 0
    for kind, path, nbytes in plan:
        by_kind[kind] = by_kind.get(kind, 0) + nbytes
        total += nbytes
        action = "would remove" if dry else "removing"
        print(f"  [{kind}] {action}: {path} ({nbytes / (1024**3):.3f} GiB)")

    print("")
    print("Summary by category:")
    for kind, nbytes in sorted(by_kind.items(), key=lambda x: -x[1]):
        print(f"  {kind}: {nbytes / (1024**3):.2f} GiB")
    print(f"  TOTAL: {total / (1024**3):.2f} GiB")

    if dry:
        print("\nDry-run only. Re-run with: ... python - < scripts/vps-cleanup-unused-uploads.py --apply")
        return 0

    freed = 0
    for _kind, path, nbytes in plan:
        try:
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
            elif path.exists():
                path.unlink(missing_ok=True)
            freed += nbytes
        except OSError as exc:
            print(f"  WARN failed {path}: {exc}", file=sys.stderr)

    print(f"\nDone. Freed ~{freed / (1024**3):.2f} GiB (registered datasets untouched).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
