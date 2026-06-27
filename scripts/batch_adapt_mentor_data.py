#!/usr/bin/env python3
"""
Batch-adapt every mentor-platform xlsx in mentor data/ to Talaria format.

For each source file:
  1. Convert trades (MAE/MFE, tags, bar paths, live-only fields synthesized)
  2. Create a dedicated session or live journal account on VPS
  3. Upload trades

Source kinds (Talaria dashboard source types 1–4):
  - backtest        → type 1 standard backtest (TradingSession personal)
  - prop_backtest   → type 2 prop backtest (TradingSession propfirm)
  - live_personal   → type 3 live journal personal (LiveJournalAccount)
  - live_prop       → type 4 live journal prop (LiveJournalAccount prop)

24 mentor files → 7 standard + 7 prop backtest + 5 live personal + 5 live prop
(live journal entitlements cap at 5 per kind on this user).

Usage:
  py scripts/batch_adapt_mentor_data.py
  py scripts/batch_adapt_mentor_data.py --dry-run
  py scripts/batch_adapt_mentor_data.py --only "alae2.xlsx"
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
for p in (SCRIPTS,):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from adapt_mentor_xlsx_to_talaria import (  # noqa: E402
    _apply_source_metadata,
    convert_file,
    dominant_ticker_from_rows,
    market_for_ticker,
    pick_strategy_for_ticker,
    read_mentor_rows,
    write_workbook,
)
from seed_dashboard_test_sessions import (  # noqa: E402
    Client,
    build_backtest_config,
    find_file,
    norm_sym,
)
from seed_session_demo_trades import patch_journal  # noqa: E402

ORIGIN_DEFAULT = "http://31.97.192.82:3000"
MENTOR_DIR = ROOT / "mentor data"
SESSION_PREFIX = "Mentor · "

# filename → source_kind (balanced across all 4 Talaria source types)
MENTOR_MANIFEST: list[tuple[str, str]] = [
    # Type 1 — standard backtest (7)
    ("alae 1.xlsx", "backtest"),
    ("alae2.xlsx", "backtest"),
    ("alae6.xlsx", "backtest"),
    ("alae8.xlsx", "backtest"),
    ("laith 1.xlsx", "backtest"),
    ("mogham 3.xlsx", "backtest"),
    ("moghamer 1.xlsx", "backtest"),
    # Type 2 — prop backtest (7)
    ("alae 3.xlsx", "prop_backtest"),
    ("alae 5.xlsx", "prop_backtest"),
    ("laith 2.xlsx", "prop_backtest"),
    ("laith 4.xlsx", "prop_backtest"),
    ("mogham 4.xlsx", "prop_backtest"),
    ("moghame 5.xlsx", "prop_backtest"),
    ("hadier 4.xlsx", "prop_backtest"),
    # Type 3 — live journal personal (5)
    ("mogha journal data 2.xlsx", "live_personal"),
    ("haider data1.xlsx", "live_personal"),
    ("haider data 2.xlsx", "live_personal"),
    ("haider 7.xlsx", "live_personal"),
    ("haider 8.xlsx", "live_personal"),
    # Type 4 — live journal prop (5)
    ("hadier 3 data3.xlsx", "live_prop"),
    ("hadier 5.xlsx", "live_prop"),
    ("hadier 6.xlsx", "live_prop"),
    ("alae 4.xlsx", "live_prop"),
    ("laith 3.xlsx", "live_prop"),
]

QA_LIVE_ACCOUNT_IDS = list(range(18, 28))  # QA T3 (18–22) + QA T4 (23–27)


def get_backtest_session(client: Client, name: str) -> dict[str, Any] | None:
    want = name.strip().lower()
    for row in client.list_backtest_sessions():
        if str(row.get("name") or "").strip().lower() == want:
            sid = row.get("id")
            if isinstance(sid, int):
                data = client._request(f"{client.origin}/api/sessions/{sid}")
                return data.get("session") or row
    return None


def get_live_account(client: Client, name: str) -> dict[str, Any] | None:
    want = name.strip().lower()
    for row in client.list_live_accounts():
        if str(row.get("name") or "").strip().lower() == want:
            return row
    return None


def session_ticker_for_vps(ticker: str) -> str:
    """Map mentor tickers to VPS dataset symbols."""
    key = norm_sym(ticker)
    if key == "XAUUSD":
        return "GC"
    if key in {"NDX", "NAS100", "US100"}:
        return "NQ"
    return key


def source_display_name(stem: str) -> str:
    return f"{SESSION_PREFIX}{stem}"


def slug_stem(filename: str) -> str:
    return Path(filename).stem


def trade_to_journal_add_payload(trade: dict[str, Any], profile_id: int) -> dict[str, Any]:
    direction = "long" if str(trade.get("direction") or "").upper() == "BUY" else "short"
    variables: dict[str, list[str]] = {}
    for var in trade.get("strategy_variables") or []:
        if not isinstance(var, dict):
            continue
        name = str(var.get("name") or var.get("id") or "").strip()
        val = str(var.get("value") or "").strip()
        if name and val:
            variables[name] = [val]

    extra = {
        "talaria_trade": trade,
        "mentor_import": True,
        "planAdherence": trade.get("planAdherence"),
        "mae_r": trade.get("mae_r"),
        "mfe_r": trade.get("mfe_r"),
        "bar_close_r": trade.get("bar_close_r"),
        "bar_high_r": trade.get("bar_high_r"),
        "bar_low_r": trade.get("bar_low_r"),
        "post_exit_bar_close_r": trade.get("post_exit_bar_close_r"),
        "post_exit_bar_high_r": trade.get("post_exit_bar_high_r"),
        "post_exit_bar_low_r": trade.get("post_exit_bar_low_r"),
        "strategy_variables": trade.get("strategy_variables"),
        "post_strategy_variables": trade.get("post_strategy_variables"),
        "preTags": trade.get("preTags"),
        "postTags": trade.get("postTags"),
        "sourceKey": trade.get("sourceKey"),
        "sourceFilterKey": trade.get("sourceFilterKey"),
        "category_sheet": trade.get("category_sheet"),
        "session_mode": trade.get("session_mode"),
        "accountType": trade.get("accountType"),
        "originSource": trade.get("originSource"),
    }

    return {
        "profile_id": profile_id,
        "symbol": trade.get("ticker") or trade.get("symbol"),
        "direction": direction,
        "entry_price": trade.get("entryPrice"),
        "exit_price": trade.get("exitPrice"),
        "stop_loss": trade.get("stopLoss"),
        "take_profit": trade.get("takeProfit"),
        "high_price": trade.get("highestPrice"),
        "low_price": trade.get("lowestPrice"),
        "quantity": trade.get("quantity") or 1,
        "risk_amount": trade.get("riskAmount") or trade.get("riskPerTrade"),
        "pnl": trade.get("pnl"),
        "rr": trade.get("rMultiple"),
        "strategy": trade.get("setup"),
        "strategy_id": trade.get("strategy_id"),
        "setup": trade.get("setup"),
        "commission": trade.get("commission_at_entry") or trade.get("commission_total"),
        "slippage": 0,
        "open_time": trade.get("entryDate"),
        "close_time": trade.get("exitDate"),
        "entry_datetime": trade.get("entryDate"),
        "entry_screenshot": trade.get("entryScreenshot") or None,
        "exit_screenshot": trade.get("exitScreenshot") or None,
        "notes": trade.get("v9TradeNotes"),
        "variables": variables,
        "extra_data": extra,
    }


def archive_live_account(client: Client, account_id: int) -> None:
    client._request(
        f"{client.journal_journal_base}/live-accounts/{account_id}",
        "DELETE",
        use_journal_token=True,
        csrf=True,
    )


def clear_backtest_journal(client: Client, session_id: int) -> None:
    """Empty journal on a backtest session (e.g. after moving trades to live)."""
    patch_journal(client, session_id, [])


def prepare_four_source_slots(client: Client, *, archive_qa: bool) -> None:
    """Free live journal slots and remove QA placeholder accounts."""
    if archive_qa:
        for aid in QA_LIVE_ACCOUNT_IDS:
            try:
                archive_live_account(client, aid)
                print(f"  archived QA live account id={aid}")
            except Exception as exc:
                if "404" not in str(exc):
                    print(f"  skip archive id={aid}: {exc}")


def count_active_live(client: Client, account_type: str) -> int:
    return sum(
        1
        for row in client.list_live_accounts()
        if str(row.get("account_type") or "").lower() == account_type.lower()
    )


def upload_live_trades(client: Client, profile_id: int, trades: list[dict[str, Any]]) -> None:
    url = f"{client.journal_base}/journal/add"
    total = len(trades)
    for i, trade in enumerate(trades, start=1):
        payload = trade_to_journal_add_payload(trade, profile_id)
        client._request(url, "POST", payload, use_journal_token=True, csrf=True)
        if i % 25 == 0 or i == total:
            print(f"    uploaded {i}/{total} live trades ...")


def build_live_account_payload(
    name: str,
    *,
    market: str,
    strategy_id: int,
    strategy_name: str,
    source_kind: str,
    trade_count: int,
    dominant: str,
) -> dict[str, Any]:
    is_prop = source_kind == "live_prop"
    notes = (
        f"Mentor live journal import — {trade_count} trades. "
        f"Strategy: {strategy_name} (id={strategy_id}). Dominant symbol: {dominant}."
    )
    payload: dict[str, Any] = {
        "name": name,
        "market": market,
        "starting_balance": "10000",
        "account_type": "prop" if is_prop else "personal",
        "account_subtype": "Challenge" if is_prop else "Live",
        "notes": notes,
    }
    if is_prop:
        payload["prop_firm"] = "FTMO"
        payload["prop_rules"] = {
            "numPhases": 2,
            "challengeType": "Evaluation",
            "currentPhase": 1,
            "limitMode": "percent",
            "p1Pct": {"dl": "5", "dd": "10", "pt": "8"},
            "p2Pct": {"dl": "5", "dd": "10", "pt": "5"},
            "p1Amt": {"dl": "500", "dd": "1000", "pt": "800"},
            "p2Amt": {"dl": "500", "dd": "1000", "pt": "500"},
            "minTradingDaysEnabled": True,
            "minTradingDays": "4",
            "consistencyEnabled": False,
            "trailingDrawdown": market.lower() != "futures",
            "dailyLossEnabled": True,
            "weekendHold": False,
        }
    return payload


def patch_backtest_session_config(
    client: Client,
    session_id: int,
    *,
    source_kind: str,
    strategy_id: int,
    strategy_name: str,
    dominant: str,
) -> None:
    """Align session config with source type 1 vs 2."""
    data = client._request(f"{client.origin}/api/sessions/{session_id}")
    sess = data.get("session") or {}
    cfg = dict(sess.get("config") or {})
    is_prop = source_kind == "prop_backtest"
    cfg["type"] = "propfirm" if is_prop else "standard"
    cfg["session_mode"] = "prop_backtest" if is_prop else "standard_backtest"
    cfg["trading_mode"] = "prop" if is_prop else "standard"
    cfg["source_type"] = 2 if is_prop else 1
    cfg["strategy_id"] = strategy_id
    cfg["strategy_name"] = strategy_name
    cfg["playbook_display"] = strategy_name
    client._request(
        f"{client.origin}/api/sessions/{session_id}",
        "PATCH",
        {"config": cfg},
        use_journal_token=True,
        csrf=True,
    )


def ensure_backtest_session(
    client: Client,
    *,
    name: str,
    dominant: str,
    strategy_id: int,
    strategy_name: str,
    source_kind: str,
    files: list[dict[str, Any]],
    existing: set[str],
    skip_existing: bool,
) -> dict[str, Any] | None:
    if name.lower() in existing:
        sess = get_backtest_session(client, name)
        if sess:
            sid = int(sess["id"])
            patch_backtest_session_config(
                client,
                sid,
                source_kind=source_kind,
                strategy_id=strategy_id,
                strategy_name=strategy_name,
                dominant=dominant,
            )
            print(f"  REUSE backtest: {name} (id={sid}, type={source_kind})")
            return sess
        if skip_existing:
            return None

    vps_ticker = session_ticker_for_vps(dominant)
    spec = {
        "source_type": 2 if source_kind == "prop_backtest" else 1,
        "kind": "backtest",
        "name": name,
        "tickers": [vps_ticker],
        "strategy_id": strategy_id,
        "timeframe": "5m" if vps_ticker in {"EURUSD", "ES", "NQ"} else "1h",
        "capital": "100000" if source_kind == "prop_backtest" else "25000",
        "prop": source_kind == "prop_backtest",
    }
    cfg = build_backtest_config(client, spec, files)
    cfg["description"] = (
        f"Mentor {'prop backtest' if source_kind == 'prop_backtest' else 'backtest'} import. "
        f"Strategy: {strategy_name} (id={strategy_id}). Dominant: {dominant}."
    )
    cfg["playbook_display"] = strategy_name
    cfg["strategy_name"] = strategy_name
    sess = client.create_backtest(
        name,
        "propfirm" if source_kind == "prop_backtest" else "personal",
        cfg,
    )
    print(f"  CREATED backtest id={sess.get('id')}: {name}")
    return sess


def ensure_live_account(
    client: Client,
    *,
    name: str,
    market: str,
    strategy_id: int,
    strategy_name: str,
    source_kind: str,
    trade_count: int,
    dominant: str,
    existing: set[str],
    skip_existing: bool,
) -> dict[str, Any] | None:
    if skip_existing and name.lower() in existing:
        acc = get_live_account(client, name)
        if acc:
            print(f"  REUSE existing live journal: {name} (id={acc.get('id')})")
            return acc
        return None
    payload = build_live_account_payload(
        name,
        market=market,
        strategy_id=strategy_id,
        strategy_name=strategy_name,
        source_kind=source_kind,
        trade_count=trade_count,
        dominant=dominant,
    )
    acc = client.create_live_account(payload)
    print(f"  CREATED live journal id={acc.get('id')}: {name}")
    return acc


def process_file(
    client: Client,
    *,
    filename: str,
    source_kind: str,
    files: list[dict[str, Any]],
    existing_bt: set[str],
    existing_live: set[str],
    skip_existing: bool,
    dry_run: bool,
    min_trades: int,
) -> dict[str, Any]:
    input_path = MENTOR_DIR / filename
    stem = slug_stem(filename)
    display_name = source_display_name(stem)
    out_xlsx = MENTOR_DIR / f"{stem}-talaria-adapted.xlsx"
    out_json = MENTOR_DIR / f"{stem}-talaria-adapted.json"

    print(f"\n=== {filename} → {display_name} ({source_kind}) ===")
    if not input_path.is_file():
        return {"file": filename, "status": "missing"}

    rows = read_mentor_rows(input_path)
    if len(rows) < min_trades:
        print(f"  SKIP only {len(rows)} rows (< {min_trades})")
        return {"file": filename, "status": "skipped_small", "rows": len(rows)}

    dominant = dominant_ticker_from_rows(rows)
    strategy_id, strategy_name = pick_strategy_for_ticker(dominant)
    market = market_for_ticker(dominant)
    print(f"  rows={len(rows)} dominant={dominant} strategy={strategy_name} ({strategy_id})")

    placeholder_id = 900000 + abs(hash(stem)) % 100000
    trades = convert_file(
        input_path,
        source_id=placeholder_id,
        source_name=display_name,
        strategy_label=strategy_name,
        strategy_id=strategy_id,
        start_balance=10000.0,
        source_kind=source_kind,
        mentor_stem=stem,
    )
    if not trades:
        return {"file": filename, "status": "no_trades"}

    write_workbook(out_xlsx, trades)
    out_json.write_text(json.dumps(trades, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  wrote {len(trades)} trades → {out_xlsx.name}")

    if dry_run:
        return {
            "file": filename,
            "status": "dry_run",
            "trades": len(trades),
            "dominant": dominant,
            "strategy_id": strategy_id,
        }

    source_id = placeholder_id
    profile_id: int | None = None

    if source_kind in {"backtest", "prop_backtest"}:
        match = find_file(session_ticker_for_vps(dominant), files)
        if not match:
            print(f"  ERROR no VPS dataset for {dominant}", file=sys.stderr)
            return {"file": filename, "status": "error", "error": "no_dataset"}
        sess = ensure_backtest_session(
            client,
            name=display_name,
            dominant=dominant,
            strategy_id=strategy_id,
            strategy_name=strategy_name,
            source_kind=source_kind,
            files=files,
            existing=existing_bt,
            skip_existing=skip_existing,
        )
        if not sess:
            return {"file": filename, "status": "error", "error": "session_create_failed"}
        source_id = int(sess["id"])
        for t in trades:
            t["sourceSessionId"] = source_id
            t["trading_session_id"] = source_id
            t["sourceKey"] = f"session:{source_id}"
            t["sourceFilterKey"] = f"session:{source_id}"
            t["sourceSessionName"] = display_name
            t["sourceLabel"] = display_name
            t["session"] = display_name
            _apply_source_metadata(
                t,
                source_kind=source_kind,
                source_id=source_id,
                source_name=display_name,
                profile_id=None,
                mentor_filename=filename,
                plan_adherence=str(t.get("planAdherence") or "according-to-plan"),
                rng_seed=int(t.get("journal_trade_id") or t.get("id") or 0),
            )
        patch_journal(client, source_id, trades)
        print(f"  uploaded {len(trades)} trades to backtest session {source_id}")
    else:
        want_type = "personal" if source_kind == "live_personal" else "prop"
        if count_active_live(client, want_type) >= 5 and display_name.lower() not in existing_live:
            raise RuntimeError(
                f"{want_type} live journal limit reached (5/5). "
                "Run with --prepare-four-sources to archive QA journals first."
            )
        acc = ensure_live_account(
            client,
            name=display_name,
            market=market,
            strategy_id=strategy_id,
            strategy_name=strategy_name,
            source_kind=source_kind,
            trade_count=len(trades),
            dominant=dominant,
            existing=existing_live,
            skip_existing=skip_existing,
        )
        if not acc:
            return {"file": filename, "status": "error", "error": "live_account_create_failed"}
        # If this file was previously uploaded as a backtest, clear that journal.
        wrong_bt = get_backtest_session(client, display_name)
        if wrong_bt and wrong_bt.get("id"):
            try:
                clear_backtest_journal(client, int(wrong_bt["id"]))
                print(f"  cleared old backtest journal on session {wrong_bt['id']}")
            except Exception as exc:
                print(f"  warn: could not clear old backtest session: {exc}")
        source_id = int(acc["id"])
        profile_id = int(acc.get("profile_id") or 0)
        if not profile_id:
            detail = client._request(
                f"{client.journal_journal_base}/live-accounts/{source_id}",
                use_journal_token=True,
            )
            profile_id = int((detail.get("account") or {}).get("profile_id") or 0)
        account_key = profile_id or source_id
        for t in trades:
            t["sourceSessionId"] = source_id
            t["trading_session_id"] = source_id
            t["sourceKey"] = f"journalAccount:{account_key}"
            t["sourceFilterKey"] = f"journalAccount:{account_key}"
            t["sourceSessionName"] = display_name
            t["sourceLabel"] = display_name
            t["journalAccountKey"] = account_key
            _apply_source_metadata(
                t,
                source_kind=source_kind,
                source_id=source_id,
                source_name=display_name,
                profile_id=profile_id,
                mentor_filename=filename,
                plan_adherence=str(t.get("planAdherence") or "according-to-plan"),
                rng_seed=int(t.get("journal_trade_id") or t.get("id") or 0),
            )
        upload_live_trades(client, profile_id, trades)
        print(f"  uploaded {len(trades)} trades to live account {source_id} (profile {profile_id})")

    return {
        "file": filename,
        "status": "ok",
        "source_kind": source_kind,
        "source_id": source_id,
        "profile_id": profile_id,
        "trades": len(trades),
        "dominant": dominant,
        "strategy_id": strategy_id,
        "output": str(out_xlsx),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch adapt all mentor xlsx files")
    parser.add_argument("--origin", default=ORIGIN_DEFAULT)
    parser.add_argument("--email", default="data@talaria-log.com")
    parser.add_argument("--password", default="data@talaria-log.com")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-existing", action="store_true", default=True)
    parser.add_argument("--no-skip-existing", action="store_false", dest="skip_existing")
    parser.add_argument("--min-trades", type=int, default=2)
    parser.add_argument("--only", default="", help="Process single filename e.g. alae2.xlsx")
    parser.add_argument(
        "--prepare-four-sources",
        action="store_true",
        help="Archive QA T3/T4 live journals to free slots for mentor live sources",
    )
    args = parser.parse_args()

    manifest = MENTOR_MANIFEST
    if args.only:
        manifest = [(f, k) for f, k in manifest if f == args.only or slug_stem(f) == args.only]
        if not manifest:
            print(f"File not in manifest: {args.only}", file=sys.stderr)
            return 1

    client = Client(args.origin)
    print(f"Logging in as {args.email} ...")
    client.login(args.email, args.password)
    client.load_strategies()

    chart_files = client.load_files()
    existing_bt = {s.get("name", "").lower() for s in client.list_backtest_sessions()}
    existing_live = {a.get("name", "").lower() for a in client.list_live_accounts()}
    print(f"Chart datasets: {len(chart_files)} | backtests: {len(existing_bt)} | live journals: {len(existing_live)}")

    if args.prepare_four_sources and not args.dry_run:
        print("Preparing four source types (archiving QA live journals) ...")
        prepare_four_source_slots(client, archive_qa=True)
        existing_live = {a.get("name", "").lower() for a in client.list_live_accounts()}

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
            )
            results.append(row)
            if row.get("status") == "ok" and not args.dry_run:
                name = source_display_name(slug_stem(filename)).lower()
                if source_kind in {"backtest", "prop_backtest"}:
                    existing_bt.add(name)
                elif source_kind.startswith("live"):
                    existing_live.add(name)
        except Exception as exc:
            print(f"  FAILED {filename}: {exc}", file=sys.stderr)
            results.append({"file": filename, "status": "error", "error": str(exc)})

    summary_path = MENTOR_DIR / "mentor-batch-summary.json"
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
