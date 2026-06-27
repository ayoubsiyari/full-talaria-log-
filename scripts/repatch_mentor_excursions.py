#!/usr/bin/env python3
"""
Audit mentor high/low inputs and repatch imported trades with corrected excursion data.

Fixes bad source values (e.g. NQ placeholder high=30000/low=10000) at import time by
deriving bounds from entry/exit/stop/target. Does not change excursion R math (_excursions).

Usage:
  py scripts/repatch_mentor_excursions.py --audit-only
  py scripts/repatch_mentor_excursions.py --dry-run
  py scripts/repatch_mentor_excursions.py
  py scripts/repatch_mentor_excursions.py --only mohameddmare12
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

from adapt_mentor_xlsx_to_talaria import (  # noqa: E402
    _apply_source_metadata,
    audit_excursion_inputs,
    convert_file,
    read_mentor_rows,
    write_workbook,
)
from batch_adapt_mentor_data import (  # noqa: E402
    ORIGIN_DEFAULT,
    MENTOR_DIR,
    MENTOR_MANIFEST,
    pick_strategy_for_ticker,
    resolve_mentor_input_path,
    slug_stem,
    trade_to_journal_add_payload,
)
from seed_dashboard_test_sessions import Client  # noqa: E402
from seed_session_demo_trades import patch_journal  # noqa: E402

COMMUNITY_SUMMARY = ROOT / "mentor data" / "new data" / "community-batch-summary.json"
MENTOR_SUMMARY = ROOT / "mentor data" / "mentor-batch-summary.json"
COMMUNITY_DIR = ROOT / "mentor data" / "new data"


def load_summaries() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in (MENTOR_SUMMARY, COMMUNITY_SUMMARY):
        if not path.is_file():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            rows.extend(data)
    return [r for r in rows if r.get("status") == "ok" and r.get("source_id")]


def mentor_trade_key(trade: dict[str, Any]) -> str | None:
    notes = trade.get("postTradeNotes") or {}
    tid = notes.get("mentorTradeId")
    if tid is not None:
        return str(tid)
    extra = trade.get("extra_data") or {}
    tt = extra.get("talaria_trade") or {}
    notes2 = tt.get("postTradeNotes") or {}
    tid2 = notes2.get("mentorTradeId")
    return str(tid2) if tid2 is not None else None


def audit_all_mentor_xlsx(*dirs: Path) -> dict[str, Any]:
    totals: dict[str, int] = {}
    files: list[dict[str, Any]] = []
    seen: set[str] = set()
    for base in dirs:
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*.xlsx")):
            if "-talaria-adapted" in path.name:
                continue
            key = str(path.resolve()).lower()
            if key in seen:
                continue
            seen.add(key)
            try:
                rows = read_mentor_rows(path)
            except Exception as exc:
                files.append({"file": path.name, "error": str(exc)})
                continue
            report = audit_excursion_inputs(rows)
            if report["bad"]:
                files.append({"file": path.name, **report})
                for reason, count in (report.get("reasons") or {}).items():
                    totals[reason] = totals.get(reason, 0) + count
    return {"bad_total": sum(totals.values()), "reasons": totals, "files": files}


def reconvert_trades(
    *,
    filename: str,
    source_kind: str,
    source_id: int,
    source_name: str,
    mentor_dir: Path,
    profile_id: int | None,
) -> list[dict[str, Any]]:
    input_path = resolve_mentor_input_path(mentor_dir, filename)
    rows = read_mentor_rows(input_path)
    dominant = rows[0].get("symbol") if rows else "EURUSD"
    from adapt_mentor_xlsx_to_talaria import dominant_ticker_from_rows  # noqa: E402

    dominant = dominant_ticker_from_rows(rows)
    strategy_id, strategy_name = pick_strategy_for_ticker(dominant)
    stem = slug_stem(filename)
    trades = convert_file(
        input_path,
        source_id=source_id,
        source_name=source_name,
        strategy_label=strategy_name,
        strategy_id=strategy_id,
        start_balance=10000.0,
        source_kind=source_kind,
        mentor_stem=stem,
        profile_id=profile_id,
    )
    account_key = profile_id or source_id
    for t in trades:
        t["sourceSessionId"] = source_id
        t["trading_session_id"] = source_id
        if source_kind in {"live_personal", "live_prop"}:
            t["sourceKey"] = f"journalAccount:{account_key}"
            t["sourceFilterKey"] = f"journalAccount:{account_key}"
            t["journalAccountKey"] = account_key
        else:
            t["sourceKey"] = f"session:{source_id}"
            t["sourceFilterKey"] = f"session:{source_id}"
        t["sourceSessionName"] = source_name
        t["sourceLabel"] = source_name
        t["session"] = source_name
        _apply_source_metadata(
            t,
            source_kind=source_kind,
            source_id=source_id,
            source_name=source_name,
            profile_id=profile_id,
            mentor_filename=filename,
            plan_adherence=str(t.get("planAdherence") or "according-to-plan"),
            rng_seed=int(t.get("journal_trade_id") or t.get("id") or 0),
        )
    return trades


def patch_backtest(client: Client, session_id: int, trades: list[dict[str, Any]]) -> None:
    patch_journal(client, session_id, trades)


def patch_live_profile(client: Client, profile_id: int, trades: list[dict[str, Any]]) -> dict[str, int]:
    listed = client._request(
        f"{client.journal_base}/journal/list?profile_id={profile_id}",
        use_journal_token=True,
    )
    entries = listed if isinstance(listed, list) else listed.get("trades") or listed.get("entries") or []
    by_key: dict[str, dict[str, Any]] = {}
    for entry in entries:
        extra = entry.get("extra_data") or {}
        tt = extra.get("talaria_trade") or {}
        key = mentor_trade_key({"postTradeNotes": (tt.get("postTradeNotes") or {}), "extra_data": extra})
        if not key:
            key = mentor_trade_key(entry)
        if key:
            by_key[key] = entry

    updated = 0
    missing = 0
    for trade in trades:
        key = mentor_trade_key(trade)
        if not key or key not in by_key:
            missing += 1
            continue
        entry = by_key[key]
        entry_id = entry.get("id")
        if not entry_id:
            missing += 1
            continue
        payload = trade_to_journal_add_payload(trade, profile_id)
        client._request(
            f"{client.journal_base}/journal/{entry_id}",
            "PUT",
            {
                "high_price": payload.get("high_price"),
                "low_price": payload.get("low_price"),
                "extra_data": payload.get("extra_data"),
            },
            use_journal_token=True,
            csrf=True,
        )
        updated += 1
    return {"updated": updated, "missing": missing, "total": len(trades)}


def source_name_for(entry: dict[str, Any]) -> str:
    stem = slug_stem(str(entry.get("file") or ""))
    out = str(entry.get("output") or "").replace("\\", "/")
    if "new data" in out:
        return f"Community · {stem}"
    return f"Mentor · {stem}"


def mentor_dir_for(entry: dict[str, Any]) -> Path:
    out = str(entry.get("output") or "")
    if "new data" in out.replace("\\", "/"):
        return COMMUNITY_DIR
    return MENTOR_DIR


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit and repatch mentor excursion inputs")
    parser.add_argument("--origin", default=ORIGIN_DEFAULT)
    parser.add_argument("--email", default="data@talaria-log.com")
    parser.add_argument("--password", default="data@talaria-log.com")
    parser.add_argument("--audit-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--only", default="", help="Filter by filename stem or substring")
    parser.add_argument("--live-only", action="store_true", help="Repatch live journal accounts only")
    args = parser.parse_args()

    audit = audit_all_mentor_xlsx(MENTOR_DIR, COMMUNITY_DIR)
    print(f"Excursion input audit: {audit['bad_total']} suspicious row(s)")
    for reason, count in sorted((audit.get("reasons") or {}).items()):
        print(f"  {reason}: {count}")
    for row in audit.get("files") or []:
        if row.get("bad", 0) >= 10:
            print(f"  {row['file']}: {row['bad']} bad ({row.get('reasons')})")

    if args.audit_only:
        return 0

    summaries = load_summaries()
    if args.live_only:
        summaries = [s for s in summaries if s.get("source_kind") in {"live_personal", "live_prop"}]
    if args.only:
        needle = args.only.lower()
        summaries = [
            s
            for s in summaries
            if needle in str(s.get("file") or "").lower() or needle in slug_stem(str(s.get("file") or "")).lower()
        ]
    if not summaries:
        print("No matching batch summary entries.", file=sys.stderr)
        return 1

    client = Client(args.origin)
    client.login(args.email, args.password)

    results: list[dict[str, Any]] = []
    started = time.time()
    for entry in summaries:
        filename = str(entry["file"])
        source_kind = str(entry["source_kind"])
        source_id = int(entry["source_id"])
        profile_id = entry.get("profile_id")
        profile_id = int(profile_id) if profile_id else None
        display_name = source_name_for(entry)
        mentor_dir = mentor_dir_for(entry)
        print(f"\n=== {filename} → {display_name} ({source_kind}, id={source_id}) ===")
        try:
            trades = reconvert_trades(
                filename=filename,
                source_kind=source_kind,
                source_id=source_id,
                source_name=display_name,
                mentor_dir=mentor_dir,
                profile_id=profile_id,
            )
        except Exception as exc:
            print(f"  ERROR convert: {exc}", file=sys.stderr)
            results.append({"file": filename, "status": "error", "error": str(exc)})
            continue

        sanitized = sum(
            1
            for t in trades
            if (t.get("postTradeNotes") or {}).get("excursionSanitized")
        )
        out_dir = mentor_dir
        stem = slug_stem(filename)
        out_xlsx = out_dir / f"{stem}-talaria-adapted.xlsx"
        write_workbook(out_xlsx, trades)
        print(f"  converted {len(trades)} trades, sanitized {sanitized}, wrote {out_xlsx.name}")

        if args.dry_run:
            results.append(
                {
                    "file": filename,
                    "status": "dry_run",
                    "trades": len(trades),
                    "sanitized": sanitized,
                    "source_id": source_id,
                }
            )
            continue

        if source_kind in {"backtest", "prop_backtest"}:
            patch_backtest(client, source_id, trades)
            print(f"  repatched backtest session {source_id}")
            results.append(
                {
                    "file": filename,
                    "status": "ok",
                    "kind": "backtest",
                    "source_id": source_id,
                    "trades": len(trades),
                    "sanitized": sanitized,
                }
            )
        else:
            if not profile_id:
                detail = client._request(
                    f"{client.journal_journal_base}/live-accounts/{source_id}",
                    use_journal_token=True,
                )
                profile_id = int((detail.get("account") or {}).get("profile_id") or 0)
            if not profile_id:
                print("  ERROR no profile_id for live account", file=sys.stderr)
                results.append({"file": filename, "status": "error", "error": "no_profile_id"})
                continue
            stats = patch_live_profile(client, profile_id, trades)
            print(f"  repatched live profile {profile_id}: {stats}")
            results.append(
                {
                    "file": filename,
                    "status": "ok",
                    "kind": "live",
                    "source_id": source_id,
                    "profile_id": profile_id,
                    "trades": len(trades),
                    "sanitized": sanitized,
                    **stats,
                }
            )

    out_path = ROOT / "mentor data" / "excursion-repatch-summary.json"
    out_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nDone in {time.time() - started:.1f}s — {len(results)} source(s), summary → {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
