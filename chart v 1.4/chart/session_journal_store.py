"""
Journal-first backtest sessions: trades in trading_session_journal_trades; state_json for UI chrome.

Enabled via SESSION_JOURNAL_SQL_PRIMARY (default on) and SESSION_STRIP_JOURNAL_FROM_STATE_JSON (default on).
"""

from __future__ import annotations

import json
import os
from typing import TYPE_CHECKING, Any, Callable

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


class JournalTradeLimitExceeded(ValueError):
    """Raised when journal length exceeds MAX_JOURNAL_TRADES_PER_SESSION."""


def journal_sql_primary_enabled() -> bool:
    return os.getenv("SESSION_JOURNAL_SQL_PRIMARY", "true").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def strip_journal_from_state_json_enabled() -> bool:
    return os.getenv("SESSION_STRIP_JOURNAL_FROM_STATE_JSON", "true").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def max_journal_trades_per_session() -> int:
    return max(100, int(os.getenv("MAX_JOURNAL_TRADES_PER_SESSION", "5000")))


def load_journal_trades_from_sql(db: "Session", session_id: int, journal_trade_model: Any) -> list[dict]:
    rows = (
        db.query(journal_trade_model)
        .filter(journal_trade_model.session_id == int(session_id))
        .order_by(journal_trade_model.updated_at.asc(), journal_trade_model.id.asc())
        .all()
    )
    out: list[dict] = []
    for row in rows:
        try:
            payload = json.loads(row.payload_json) if row.payload_json else {}
        except Exception:
            continue
        if isinstance(payload, dict):
            out.append(payload)
    return out


def backfill_journal_sql_from_state(
    db: "Session",
    session_id: int,
    user_id: int,
    state: dict,
    *,
    journal_trade_model: Any,
    sync_fn: Callable,
) -> bool:
    """If SQL has no rows but state_json still has journal, upsert SQL. Returns True if backfill ran."""
    if load_journal_trades_from_sql(db, session_id, journal_trade_model):
        return False
    journal = state.get("journal")
    if not isinstance(journal, list) or not journal:
        return False
    sync_fn(db, session_id, user_id, journal)
    return True


def resolve_session_journal(
    db: "Session",
    session_id: int,
    user_id: int,
    state: dict,
    *,
    journal_trade_model: Any,
    sync_fn: Callable,
) -> list[dict]:
    """
    Canonical journal for reads (GET state, what-if, analytics).
    SQL first; one-time backfill from legacy state_json.journal when SQL empty.
    """
    if journal_sql_primary_enabled():
        sql_journal = load_journal_trades_from_sql(db, session_id, journal_trade_model)
        if sql_journal:
            return sql_journal
        if backfill_journal_sql_from_state(
            db, session_id, user_id, state, journal_trade_model=journal_trade_model, sync_fn=sync_fn
        ):
            db.commit()
            sql_journal = load_journal_trades_from_sql(db, session_id, journal_trade_model)
            if sql_journal:
                return sql_journal
    journal = state.get("journal")
    return journal if isinstance(journal, list) else []


def apply_journal_to_state_for_response(state: dict, journal: list[dict]) -> None:
    """Response-only: chart clients expect state.journal on GET."""
    state["journal"] = journal
    state["journal_storage"] = "sql" if journal_sql_primary_enabled() else "inline"
    state["journal_count"] = len(journal)


def strip_journal_from_persisted_state(state: dict) -> None:
    """Remove bulky journal array from state_json blob after SQL sync."""
    if not strip_journal_from_state_json_enabled():
        return
    state.pop("journal", None)
    state["journal_storage"] = "sql"


def enforce_journal_trade_limit(journal: list) -> None:
    if not isinstance(journal, list):
        return
    max_n = max_journal_trades_per_session()
    if len(journal) > max_n:
        raise JournalTradeLimitExceeded(
            f"Too many journal trades ({len(journal)}). "
            f"Maximum per session is {max_n}. Archive or split into another session."
        )


def journal_trade_client_id(raw: dict) -> str:
    """Canonical client trade id used in trading_session_journal_trades."""
    if not isinstance(raw, dict):
        return ""
    return str(
        raw.get("tradeId")
        or raw.get("trade_id")
        or raw.get("client_trade_id")
        or raw.get("id")
        or ""
    ).strip()


def _parse_time_to_ms(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)) and value > 0:
        n = int(value)
        if n > 1_000_000_000_000:
            return n
        if n > 1_000_000_000:
            return n * 1000
        return n
    text = str(value).strip()
    if not text:
        return None
    if text.isdigit():
        n = int(text)
        return n if n > 1_000_000_000_000 else n * 1000
    try:
        from datetime import datetime

        normalized = text.replace("Z", "+00:00")
        if len(text) == 10 and text[4] == "-" and text[7] == "-":
            normalized = f"{text}T00:00:00+00:00"
        dt = datetime.fromisoformat(normalized)
        return int(dt.timestamp() * 1000)
    except Exception:
        return None


def _exit_reason_to_close_type(reason: Any) -> str | None:
    if reason is None or reason == "":
        return None
    key = str(reason).strip().upper().replace(" ", "_")
    return {
        "TP_HIT": "TP",
        "SL_HIT": "SL",
        "BE_HIT": "BE",
        "MANUAL": "MANUAL",
        "TRAILING": "TRAILING",
        "STOP_OUT": "STOP_OUT",
    }.get(key, str(reason).replace("_", " ").upper())


def _map_partial_exits_to_partial_closes(exits: Any, fallback_time_ms: int | None) -> list[dict] | None:
    if not isinstance(exits, list) or not exits:
        return None
    out: list[dict] = []
    for row in exits:
        if not isinstance(row, dict):
            continue
        price = row.get("price") if row.get("price") is not None else row.get("closePrice")
        qty = row.get("qty") if row.get("qty") is not None else row.get("quantity")
        if price is None and qty is None:
            continue
        out.append(
            {
                "closePrice": price,
                "closeTime": row.get("closeTime") or fallback_time_ms,
                "quantity": qty,
                "pnl": row.get("pnl_points") if row.get("pnl_points") is not None else row.get("pnl"),
                "pnl_net": row.get("pnl_points") if row.get("pnl_points") is not None else row.get("pnl_net"),
                "rr_at_exit": row.get("r") if row.get("r") is not None else row.get("rr_at_exit"),
                "exit_reason": row.get("exit_reason") or "MANUAL",
                "hitType": row.get("hitType") or "MANUAL",
            }
        )
    return out or None


def normalize_manual_trade_payload(raw: dict) -> dict:
    """
    Normalize dashboard / V16 manual-add payload to chart journal shape.
    Preserves the full incoming dict and adds aliases chart clients and analytics expect.
    """
    if not isinstance(raw, dict):
        raise ValueError("trade must be an object")

    out = dict(raw)
    tid = journal_trade_client_id(out)
    if not tid:
        raise ValueError("trade id is required (tradeId, trade_id, client_trade_id, or id)")

    out["tradeId"] = tid
    out["id"] = tid
    out["trade_id"] = tid
    out["client_trade_id"] = tid

    sym = str(out.get("symbol") or out.get("ticker") or "").strip().upper()
    if sym:
        out["symbol"] = sym
        out["ticker"] = sym

    side = str(out.get("direction") or out.get("side") or out.get("type") or "").strip().lower()
    if side in {"sell", "short"} or "short" in side:
        chart_type = "SELL"
    elif side in {"buy", "long"} or "long" in side:
        chart_type = "BUY"
    else:
        chart_type = str(out.get("type") or "").strip().upper() or None
    if chart_type:
        out["type"] = chart_type
        out["direction"] = chart_type

    alias_pairs = (
        ("entryPrice", "openPrice"),
        ("openPrice", "entryPrice"),
        ("exitPrice", "closePrice"),
        ("closePrice", "exitPrice"),
        ("stopLoss", "planned_sl"),
        ("planned_sl", "stopLoss"),
        ("takeProfit", "target"),
        ("target", "takeProfit"),
        ("rMultiple", "rr"),
        ("rr", "rMultiple"),
        ("actual_rr_net", "actualRR"),
        ("actualRR", "actual_rr_net"),
        ("pnl_currency_net", "netPnL"),
        ("netPnL", "pnl_currency_net"),
        ("position_size", "quantity"),
        ("quantity", "position_size"),
        ("order_type", "orderType"),
        ("orderType", "order_type"),
        ("highest_price", "highestPrice"),
        ("highestPrice", "highest_price"),
        ("lowest_price", "lowestPrice"),
        ("lowestPrice", "lowest_price"),
        ("planned_rr", "plannedRR"),
        ("plannedRR", "planned_rr"),
        ("commission_total", "commissionCost"),
        ("commissionCost", "commission_total"),
        ("risk_amount", "riskAmount"),
        ("riskAmount", "risk_amount"),
        ("riskPerTrade", "riskAmount"),
        ("setup_tag", "setup"),
        ("setup", "setup_tag"),
    )
    for left, right in alias_pairs:
        if out.get(left) is not None and out.get(right) is None:
            out[right] = out[left]

    entry_ms = _parse_time_to_ms(
        out.get("openTime") or out.get("entryTime") or out.get("entryDate")
    )
    exit_ms = _parse_time_to_ms(
        out.get("closeTime") or out.get("exitTime") or out.get("exitDate")
    )
    if entry_ms is not None:
        out["openTime"] = entry_ms
        out["entryTime"] = entry_ms
    if exit_ms is not None:
        out["closeTime"] = exit_ms
        out["exitTime"] = exit_ms

    pnl = out.get("pnl_currency_net")
    if pnl is None:
        pnl = out.get("pnl")
    if pnl is None:
        pnl = out.get("netPnL")
    if pnl is not None:
        out["pnl"] = pnl
        out["netPnL"] = pnl
        out["realizedPnL"] = pnl
        out["pnl_currency_net"] = pnl
        out["pnl_dollars_net"] = pnl
        out["pnl_dollars_gross"] = out.get("pnl_currency_gross") or pnl

    qty = out.get("quantity") if out.get("quantity") is not None else out.get("position_size")
    if qty is not None:
        out["quantity"] = qty
        out["originalQuantity"] = out.get("originalQuantity") or qty

    if out.get("plannedRR") is not None and out.get("rewardToRiskRatio") is None:
        out["rewardToRiskRatio"] = out.get("plannedRR")
    if out.get("riskAmount") is not None and out.get("originalRiskAmount") is None:
        out["originalRiskAmount"] = out.get("riskAmount")

    if out.get("stopLoss") is not None and out.get("initial_sl") is None:
        out["initial_sl"] = out.get("stopLoss")

    if out.get("spread") is not None and out.get("spread_pips_at_entry") is None:
        out["spread_pips_at_entry"] = out.get("spread")
    comm = out.get("commission_at_entry")
    if comm is None:
        comm = out.get("commission_total")
    if comm is None:
        comm = out.get("commissionCost")
    if comm is not None:
        out["commission_at_entry"] = comm
        out["commission_total"] = out.get("commission_total") or comm

    inst = out.get("instrument_settings")
    if isinstance(inst, dict) and out.get("pip_value_at_entry") is None:
        pip_val = inst.get("pip_value_per_lot") or inst.get("pipValuePerLot")
        if pip_val is not None:
            out["pip_value_at_entry"] = pip_val

    session_id = out.get("trading_session_id") or out.get("sourceSessionId")
    if session_id is not None and str(session_id).strip():
        out["trading_session_id"] = str(session_id)

    if out.get("exit_reason") and not out.get("closeType"):
        out["closeType"] = _exit_reason_to_close_type(out.get("exit_reason"))

    partial_src = out.get("partialCloses")
    if not partial_src:
        partial_src = out.get("partial_exits") or out.get("exits")
    mapped_partials = _map_partial_exits_to_partial_closes(partial_src, exit_ms or entry_ms)
    if mapped_partials:
        out["partialCloses"] = mapped_partials

    pre_tags = out.get("preTags") if isinstance(out.get("preTags"), list) else None
    setup = out.get("setup") or out.get("setup_tag")
    if setup or pre_tags:
        prev_pre = out.get("preTradeNotes") if isinstance(out.get("preTradeNotes"), dict) else {}
        out["preTradeNotes"] = {
            **prev_pre,
            **({"setup": setup} if setup else {}),
            **({"tags": ", ".join(str(t) for t in pre_tags)} if pre_tags else {}),
        }

    post_tags = out.get("postTags") if isinstance(out.get("postTags"), list) else None
    if post_tags and not isinstance(out.get("postTradeNotes"), dict):
        out["postTradeNotes"] = {"tags": ", ".join(str(t) for t in post_tags)}

    shots = out.get("screenshots")
    if isinstance(shots, dict) and not out.get("railScreenshots"):
        pre_shots = shots.get("pre") if isinstance(shots.get("pre"), list) else []
        post_shots = shots.get("post") if isinstance(shots.get("post"), list) else []
        rail = []
        for item in pre_shots + post_shots:
            if isinstance(item, dict) and item.get("dataUrl"):
                rail.append({"dataUrl": item.get("dataUrl"), "name": item.get("name") or ""})
            elif isinstance(item, str) and item.strip():
                rail.append({"dataUrl": item, "name": ""})
        if rail:
            out["railScreenshots"] = rail

    status = str(out.get("status") or "").strip().lower()
    if not status:
        status = "closed" if exit_ms is not None else "open"
    out["status"] = "closed" if status in {"closed", "close"} else "open"

    if entry_ms is not None and exit_ms is not None and exit_ms >= entry_ms:
        holding_ms = exit_ms - entry_ms
        out["holdingTimeMs"] = holding_ms
        out["holdingTimeHours"] = round(holding_ms / (1000 * 60 * 60), 2)
        out["holdingTimeDays"] = round(holding_ms / (1000 * 60 * 60 * 24), 4)
    elif out.get("duration") is not None:
        try:
            mins = float(out.get("duration"))
            holding_ms = int(mins * 60 * 1000)
            out["holdingTimeMs"] = holding_ms
            out["holdingTimeHours"] = round(mins / 60, 2)
        except (TypeError, ValueError):
            pass

    if out.get("savedAt") is None:
        from datetime import datetime, timezone

        out["savedAt"] = int(datetime.now(timezone.utc).timestamp() * 1000)

    out["is_manual"] = True
    out["data_source"] = str(out.get("data_source") or "manual")
    out["manual"] = True
    out["manuallyAdded"] = True
    if not out.get("sourceOrigin"):
        out["sourceOrigin"] = "manual"

    return out


def upsert_trade_in_journal(journal: list, trade: dict) -> list:
    """Replace trade with same client id or append."""
    merged = list(journal) if isinstance(journal, list) else []
    tid = journal_trade_client_id(trade)
    if not tid:
        raise ValueError("trade id is required")
    idx = -1
    for i, row in enumerate(merged):
        if isinstance(row, dict) and journal_trade_client_id(row) == tid:
            idx = i
            break
    if idx >= 0:
        merged[idx] = {**merged[idx], **trade}
    else:
        merged.append(trade)
    return merged
