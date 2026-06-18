#!/usr/bin/env python3
"""
Sync chart binary tiles to S3 for CloudFront (Phase 2 tile CDN).

Disk layout:  uploads/tiles/{file_id}/{tf}/tile_{idx}.bin
S3/CDN keys:   api/file/{file_id}/tile/{tf}/{idx}   (matches TILE_CDN_REDIRECT in api_server.py)

Run on the VPS from repo root (AWS CLI required on host or in container):

  export TILE_CDN_S3_BUCKET=talaria-tiles-prod
  export AWS_DEFAULT_REGION=eu-north-1
  python3 scripts/sync-tiles-to-s3.py

Inside Docker (uploads at /app/uploads):

  docker compose exec -T trading-chart python3 /opt/talaria/scripts/sync-tiles-to-s3.py \\
    --uploads /app/uploads

Options:
  --uploads PATH   Root uploads dir (default: /app/uploads or ./uploads)
  --bucket NAME    S3 bucket (or TILE_CDN_S3_BUCKET env)
  --dry-run        Print actions only
  --limit N        Sync at most N tile files (smoke test)
  --delete         Pass --delete to aws s3 sync (remove S3 keys with no local tile)
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

TILE_RE = re.compile(r"^tile_(\d+)\.bin$")
CACHE_CONTROL = "public, max-age=86400, immutable"
CONTENT_TYPE = "application/octet-stream"


def cdn_key(file_id: str, tf: str, tile_idx: int) -> str:
    return f"api/file/{file_id}/tile/{tf}/{tile_idx}"


def iter_tiles(tiles_root: Path):
    if not tiles_root.is_dir():
        return
    for file_dir in sorted(tiles_root.iterdir()):
        if not file_dir.is_dir() or not file_dir.name.isdigit():
            continue
        file_id = file_dir.name
        for tf_dir in sorted(file_dir.iterdir()):
            if not tf_dir.is_dir():
                continue
            tf = tf_dir.name
            for tile_file in sorted(tf_dir.iterdir()):
                m = TILE_RE.match(tile_file.name)
                if not m:
                    continue
                yield file_id, tf, int(m.group(1)), tile_file


def run_aws(args: list[str], dry_run: bool) -> int:
    if dry_run:
        print("DRY-RUN:", " ".join(args))
        return 0
    proc = subprocess.run(args, check=False)
    return proc.returncode


def sync_via_staging(
    tiles_root: Path,
    bucket: str,
    dry_run: bool,
    limit: int | None,
    do_delete: bool,
) -> int:
    """Stage symlinks in CDN key layout, then one aws s3 sync (fast for large trees)."""
    count = 0
    errors = 0
    with tempfile.TemporaryDirectory(prefix="talaria-tile-cdn-") as staging:
        stage = Path(staging)
        for file_id, tf, tile_idx, src in iter_tiles(tiles_root):
            if limit is not None and count >= limit:
                break
            rel = cdn_key(file_id, tf, tile_idx)
            dest = stage / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            try:
                os.link(src, dest)
            except OSError:
                import shutil

                shutil.copy2(src, dest)
            count += 1

        if count == 0:
            print(f"No tiles under {tiles_root}", file=sys.stderr)
            return 1

        cmd = [
            "aws",
            "s3",
            "sync",
            str(stage),
            f"s3://{bucket}",
            "--content-type",
            CONTENT_TYPE,
            "--cache-control",
            CACHE_CONTROL,
            "--only-show-errors",
        ]
        if do_delete:
            cmd.append("--delete")

        print(f"Syncing {count} tile(s) → s3://{bucket}/api/file/...")
        rc = run_aws(cmd, dry_run)
        if rc != 0:
            errors += 1
        print(f"Done. tiles_synced={count} bucket=s3://{bucket}")
        return rc if not dry_run else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync Talaria tiles to S3 for CloudFront CDN")
    parser.add_argument(
        "--uploads",
        default=os.environ.get("TALARIA_UPLOADS", "/app/uploads"),
        help="Uploads root containing tiles/ (default: /app/uploads)",
    )
    parser.add_argument(
        "--bucket",
        default=os.environ.get("TILE_CDN_S3_BUCKET", "").strip(),
        help="S3 bucket name (or TILE_CDN_S3_BUCKET)",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--delete", action="store_true", help="Remove orphan keys on S3")
    args = parser.parse_args()

    bucket = args.bucket
    if not bucket:
        print("Set --bucket or TILE_CDN_S3_BUCKET", file=sys.stderr)
        return 2

    uploads = Path(args.uploads)
    tiles_root = uploads / "tiles"
    if not tiles_root.is_dir():
        # Local dev fallback
        alt = Path("chart v 1.4/chart/uploads/tiles")
        if alt.is_dir():
            tiles_root = alt
        else:
            print(f"Missing tiles dir: {tiles_root}", file=sys.stderr)
            return 1

    if subprocess.run(["aws", "--version"], capture_output=True).returncode != 0:
        print("AWS CLI not found. Install: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html", file=sys.stderr)
        return 2

    return sync_via_staging(tiles_root, bucket, args.dry_run, args.limit, args.delete)


if __name__ == "__main__":
    raise SystemExit(main())
