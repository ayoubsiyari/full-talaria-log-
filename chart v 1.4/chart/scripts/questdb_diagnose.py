#!/usr/bin/env python3
"""
Diagnose QuestDB OHLC coverage for one dataset (e.g. file_id 22).

  docker compose exec trading-chart-worker python3 scripts/questdb_diagnose.py --file-id 22

Optional probes (hits /bars for a replay-era window):
  docker compose exec trading-chart-worker python3 scripts/questdb_diagnose.py --file-id 22 --probe
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

_CHART_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _CHART_DIR not in sys.path:
    sys.path.insert(0, _CHART_DIR)

import bar_budget  # noqa: E402
import questdb_store  # noqa: E402


def _probe_bars(file_id: int, resolution: str, from_ms: int, to_ms: int) -> dict:
    t0 = time.monotonic()
    try:
        bars = questdb_store.query_bars(file_id, resolution, from_ms, to_ms, limit=2000)
        elapsed = round((time.monotonic() - t0) * 1000, 1)
        first_t = bars[0]["t"] if bars else None
        last_t = bars[-1]["t"] if bars else None
        return {
            "resolution": resolution,
            "returned": len(bars),
            "first_t": first_t,
            "last_t": last_t,
            "elapsed_ms": elapsed,
            "via": "ohlcv_1m_sample"
            if questdb_store.preagg_is_incomplete(file_id, resolution)
            else bar_budget.resolution_table(resolution),
        }
    except Exception as exc:
        return {"resolution": resolution, "error": str(exc)[:500]}


def main() -> int:
    parser = argparse.ArgumentParser(description="QuestDB dataset diagnostics")
    parser.add_argument("--file-id", type=int, required=True)
    parser.add_argument(
        "--probe",
        action="store_true",
        help="Run sample /bars queries (Apr 2015 replay window)",
    )
    parser.add_argument(
        "--rebuild-aggregates",
        action="store_true",
        help="Rebuild pre-agg tables from ohlcv_1m (can take minutes for large files)",
    )
    args = parser.parse_args()

    if not questdb_store.questdb_enabled():
        print("QUESTDB_ENABLED is false — set env and retry.")
        return 1

    ping = questdb_store.ping_ok()
    if ping is not True:
        print(
            "QuestDB PG wire is not reachable (ping_ok=%s).\n"
            "On the VPS run:\n"
            "  docker compose ps questdb\n"
            "  docker compose logs questdb --tail 80\n"
            "  docker compose restart questdb\n"
            "  docker compose exec trading-chart-worker bash -lc "
            "'timeout 5 bash -c \"echo > /dev/tcp/questdb/8812\" && echo PG_OK'\n"
            % (ping,)
        )
        return 2

    stats = questdb_store.dataset_stats(args.file_id)
    print(json.dumps(stats, indent=2))

    if args.rebuild_aggregates:
        print(f"\nRebuilding aggregates for file {args.file_id} …")
        t0 = time.monotonic()
        counts = questdb_store.rebuild_aggregates(args.file_id)
        elapsed = round(time.monotonic() - t0, 1)
        print(json.dumps({"aggregates": counts, "elapsed_sec": elapsed}, indent=2))
        stats = questdb_store.dataset_stats(args.file_id)
        print("\nAfter rebuild:")
        print(json.dumps(stats, indent=2))

    if args.probe:
        # Apr 2015 replay playhead window (matches typical backtest errors)
        from_ms = 1427846400000  # 2015-04-01
        to_ms = 1430438400000    # 2015-05-01
        print(f"\nProbing window {from_ms} → {to_ms} …")
        for tf in ("1m", "5m", "15m", "1h", "4h", "1d"):
            out = _probe_bars(args.file_id, tf, from_ms, to_ms)
            print(json.dumps(out))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
