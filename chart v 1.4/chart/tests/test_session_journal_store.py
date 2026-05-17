"""session_journal_store helpers (no database)."""

import session_journal_store as sjs


def test_strip_journal_from_persisted_state():
    state = {"journal": [{"tradeId": "1"}], "drawings": []}
    sjs.strip_journal_from_persisted_state(state)
    assert "journal" not in state
    assert state.get("journal_storage") == "sql"


def test_enforce_journal_trade_limit_raises(monkeypatch):
    monkeypatch.setattr(sjs, "max_journal_trades_per_session", lambda: 2)
    try:
        sjs.enforce_journal_trade_limit([{"tradeId": "a"}, {"tradeId": "b"}, {"tradeId": "c"}])
        assert False, "expected JournalTradeLimitExceeded"
    except sjs.JournalTradeLimitExceeded:
        pass
