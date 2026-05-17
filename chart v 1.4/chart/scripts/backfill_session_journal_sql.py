#!/usr/bin/env python3
"""
Backfill trading_session_journal_trades from trading_session_states.state_json.journal.

Run from chart v 1.4/chart with DATABASE_URL set (same as api_server):

  cd "chart v 1.4/chart"
  set DATABASE_URL=postgresql://...
  py scripts/backfill_session_journal_sql.py

Options:
  --dry-run     Count only, no writes
  --strip       After backfill, remove journal from state_json (journal_storage=sql)
  --limit N     Process at most N sessions
"""

from __future__ import annotations

import argparse
import json
import os
import sys

# Allow imports from chart package directory
_CHART_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _CHART_DIR not in sys.path:
    sys.path.insert(0, _CHART_DIR)

from api_server import (  # noqa: E402
    SessionLocal,
    TradingSessionJournalTrade,
    TradingSessionState,
    _parse_json_dict,
    _sync_trading_session_journal_trades,
)
import session_journal_store as sjs  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill SQL journal trades from state_json")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--strip", action="store_true", help="Remove journal array from state_json after backfill")
    parser.add_argument("--limit", type=int, default=0, help="Max sessions to process (0 = all)")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        q = db.query(TradingSessionState).order_by(TradingSessionState.session_id.asc())
        if args.limit and args.limit > 0:
            q = q.limit(args.limit)
        rows = q.all()
        scanned = 0
        backfilled = 0
        stripped = 0
        for st in rows:
            scanned += 1
            state = _parse_json_dict(st.state_json)
            journal = state.get("journal")
            if not isinstance(journal, list) or not journal:
                continue
            sql_count = len(sjs.load_journal_trades_from_sql(db, st.session_id, TradingSessionJournalTrade))
            if sql_count >= len(journal):
                continue
            if args.dry_run:
                backfilled += 1
                continue
            _sync_trading_session_journal_trades(db, st.session_id, st.user_id, journal)
            backfilled += 1
            if args.strip:
                sjs.strip_journal_from_persisted_state(state)
                st.state_json = json.dumps(state, separators=(",", ":"))
                stripped += 1
        if not args.dry_run:
            db.commit()
        print(
            f"scanned={scanned} backfill_candidates={backfilled} stripped={stripped} dry_run={args.dry_run}"
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
