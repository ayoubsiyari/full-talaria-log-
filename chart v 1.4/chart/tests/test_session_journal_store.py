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


def test_normalize_manual_trade_payload_aliases():
    raw = {
        "trade_id": "manual-abc",
        "symbol": "gbpusd",
        "side": "Short",
        "entryPrice": 1.22595,
        "exitPrice": 1.2211,
        "entryTime": "2026-06-19T14:25:00.000Z",
        "closeTime": "2026-06-19T16:00:00.000Z",
        "pnl": -184,
        "entries": [{"price": 1.22595, "qty": 1}],
        "partial_exits": [{"price": 1.2211, "qty": 1, "pnl_points": -4.85, "r": -0.5}],
        "spread": 0.8,
        "commission_total": 2.5,
        "sourceSessionId": 1003,
        "setup_tag": "Breakout",
        "preTags": ["Breakout", "NY Session"],
        "exit_reason": "TP_HIT",
    }
    out = sjs.normalize_manual_trade_payload(raw)
    assert out["tradeId"] == "manual-abc"
    assert out["ticker"] == "GBPUSD"
    assert out["type"] == "SELL"
    assert out["openPrice"] == 1.22595
    assert out["closePrice"] == 1.2211
    assert isinstance(out["openTime"], int) and out["openTime"] > 0
    assert isinstance(out["closeTime"], int) and out["closeTime"] > out["openTime"]
    assert out["netPnL"] == -184
    assert out["partialCloses"][0]["closePrice"] == 1.2211
    assert out["spread_pips_at_entry"] == 0.8
    assert out["commission_at_entry"] == 2.5
    assert out["trading_session_id"] == "1003"
    assert out["preTradeNotes"]["setup"] == "Breakout"
    assert out["closeType"] == "TP"
    assert out["is_manual"] is True
    assert out["entries"] == [{"price": 1.22595, "qty": 1}]


def test_upsert_trade_in_journal_replaces_by_id():
    journal = [{"tradeId": "t1", "pnl": 10}, {"tradeId": "t2", "pnl": 5}]
    merged = sjs.upsert_trade_in_journal(journal, {"trade_id": "t1", "pnl": 20, "symbol": "NQ"})
    assert len(merged) == 2
    assert merged[0]["pnl"] == 20
    assert merged[0]["symbol"] == "NQ"
    appended = sjs.upsert_trade_in_journal(merged, {"id": "t3", "pnl": 1})
    assert len(appended) == 3
    assert appended[-1]["tradeId"] == "t3"


def test_enrich_journal_trade_from_sql_row_adds_global_id():
    class Row:
        id = 42
        client_trade_id = "1"

    out = sjs.enrich_journal_trade_from_sql_row({"tradeId": "1", "pnl": 10}, Row(), 1003)
    assert out["journal_trade_id"] == 42
    assert out["trading_session_id"] == 1003
    assert out["client_trade_id"] == "1"
    assert out["tradeId"] == "1"
