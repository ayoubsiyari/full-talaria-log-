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
