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


def test_normalize_manual_trade_payload_open_trade_zeros_realized_metrics():
    raw = {
        "trade_id": "manual-open-1",
        "symbol": "EURUSD",
        "side": "Short",
        "status": "Open",
        "entryPrice": 1.1,
        "stopLoss": 1.2,
        "takeProfit": 1.0,
        "plannedRR": 1.0,
        "entryTime": "2012-06-29T00:13:00.000Z",
        "entries": [{"price": 1.1, "qty": 1}],
        "exits": [{"price": "", "qty": 1}],
        "partial_exits": [],
    }
    out = sjs.normalize_manual_trade_payload(raw)
    assert out["status"] == "open"
    assert out["pnl"] == 0
    assert out["netPnL"] == 0
    assert out["rMultiple"] == 0
    assert out["rewardToRiskRatio"] == 1.0
    assert out.get("partialCloses") is None


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


def test_merge_trade_prefer_richer_keeps_screenshots_and_arrays():
    prev = {
        "tradeId": "t1",
        "pnl": 10,
        "entryScreenshot": "data:image/png;base64,AAA",
        "bar_close_r": [0.1, 0.2, 0.3],
        "bar_close_r_archive": [0.01],
    }
    slim = {"tradeId": "t1", "pnl": 99, "symbol": "EURUSD"}
    merged = sjs.merge_trade_prefer_richer(prev, slim)
    assert merged["pnl"] == 99
    assert merged["symbol"] == "EURUSD"
    assert merged["entryScreenshot"] == prev["entryScreenshot"]
    assert merged["bar_close_r"] == prev["bar_close_r"]
    assert merged["bar_close_r_archive"] == prev["bar_close_r_archive"]


def test_merge_trade_prefer_richer_keeps_nested_heavy_fields():
    """Symmetric with omit-before-clone nesting (metadata / journalEntry)."""
    prev = {
        "tradeId": "t1",
        "pnl": 10,
        "metadata": {
            "entryScreenshot": "data:image/png;base64,META_ENTRY",
            "bar_close_r": [0.1, 0.2],
            "note": "keep-me",
        },
        "journalEntry": {
            "exitScreenshot": "data:image/png;base64,JRN_EXIT",
            "comment": "old",
        },
    }
    slim = {
        "tradeId": "t1",
        "pnl": 99,
        "metadata": {"note": "updated", "tag": "hot"},
        "journalEntry": {"comment": "new"},
    }
    merged = sjs.merge_trade_prefer_richer(prev, slim)
    assert merged["pnl"] == 99
    assert merged["metadata"]["note"] == "updated"
    assert merged["metadata"]["tag"] == "hot"
    assert merged["metadata"]["entryScreenshot"] == prev["metadata"]["entryScreenshot"]
    assert merged["metadata"]["bar_close_r"] == prev["metadata"]["bar_close_r"]
    assert merged["journalEntry"]["comment"] == "new"
    assert merged["journalEntry"]["exitScreenshot"] == prev["journalEntry"]["exitScreenshot"]


def test_upsert_unmarked_uses_bera_replace_semantics():
    journal = [{
        "tradeId": "t1",
        "pnl": 10,
        "exitScreenshot": "data:image/png;base64,BBB",
        "bar_high_r": [1.0, 2.0],
    }]
    # Unmarked full/kill update may clear heavy fields (B-era replace).
    merged = sjs.upsert_trade_in_journal(journal, {"tradeId": "t1", "pnl": 11, "exitScreenshot": None})
    assert merged[0]["pnl"] == 11
    assert merged[0]["exitScreenshot"] is None


def test_upsert_prefer_richer_keeps_heavy_when_marked_slim():
    journal = [{
        "tradeId": "t1",
        "pnl": 10,
        "exitScreenshot": "data:image/png;base64,BBB",
        "bar_high_r": [1.0, 2.0],
    }]
    merged = sjs.upsert_trade_in_journal(
        journal, {"tradeId": "t1", "pnl": 11}, prefer_richer=True
    )
    assert merged[0]["pnl"] == 11
    assert merged[0]["exitScreenshot"].startswith("data:image")
    assert merged[0]["bar_high_r"] == [1.0, 2.0]


def test_is_hot_persist_trim_marked():
    assert sjs.is_hot_persist_trim_marked({"m19_hot_persist_trim_v1": True}) is True
    assert sjs.is_hot_persist_trim_marked({"journal": []}) is False


def test_m24_chart_patch_journal_is_not_delete_authority(monkeypatch):
    """TAL-01926: stale shorter chart PATCH must not decrement SQL history."""
    monkeypatch.delenv("SESSION_JOURNAL_PATCH_DELETE_GUARD", raising=False)
    assert sjs.journal_patch_delete_guard_enabled() is True
    assert sjs.should_prune_absent_journal_trades(explicit_replace=False) is False
    assert sjs.should_prune_absent_journal_trades(explicit_replace=True) is True


def test_m24_kill_switch_restores_legacy_patch_prune(monkeypatch):
    monkeypatch.setenv("SESSION_JOURNAL_PATCH_DELETE_GUARD", "0")
    assert sjs.journal_patch_delete_guard_enabled() is False
    assert sjs.should_prune_absent_journal_trades(explicit_replace=False) is True


def test_m24_implicit_chart_patch_must_not_prune_journal():
    """GATE-01 (TAL-01926): full pytest must fail when SESSION_JOURNAL_PATCH_DELETE_GUARD=0."""
    assert sjs.should_prune_absent_journal_trades(explicit_replace=False) is False


def test_merge_order_rows_prefer_richer_by_id():
    prev = [{"id": 1, "bar_close_r": [1, 2, 3], "entryScreenshot": "data:x"}]
    incoming = [{"id": 1, "unrealizedPnL": 4.5}]
    out = sjs.merge_order_rows_prefer_richer(prev, incoming)
    assert out[0]["unrealizedPnL"] == 4.5
    assert out[0]["bar_close_r"] == [1, 2, 3]
    assert out[0]["entryScreenshot"] == "data:x"


def test_enrich_journal_trade_from_sql_row_adds_global_id():
    class Row:
        id = 42
        client_trade_id = "1"
        user_trade_id = 7

    out = sjs.enrich_journal_trade_from_sql_row({"tradeId": "1", "pnl": 10}, Row(), 1003)
    assert out["journal_trade_id"] == 42
    assert out["trading_session_id"] == 1003
    assert out["client_trade_id"] == "1"
    assert out["tradeId"] == "1"
    assert out["user_trade_id"] == 7
    assert out["display_trade_id"] == 7


class _M8Column:
    def __eq__(self, _other):
        return True

    def asc(self):
        return self


class _M8Model:
    session_id = _M8Column()
    updated_at = _M8Column()
    id = _M8Column()


class _M8Row:
    def __init__(self, row_id, payload_json):
        self.id = row_id
        self.client_trade_id = str(row_id)
        self.user_trade_id = row_id
        self.payload_json = payload_json


class _M8Query:
    def __init__(self, rows):
        self.rows = rows
        self.limit_n = None

    def filter(self, *_args, **_kwargs):
        return self

    def order_by(self, *_args, **_kwargs):
        return self

    def limit(self, n):
        self.limit_n = n
        return self

    def count(self):
        return len(self.rows)

    def all(self):
        return self.rows[: self.limit_n]


class _M8Db:
    def __init__(self, rows):
        self.rows = rows

    def query(self, _model):
        return _M8Query(self.rows)


def test_m8_state_hydrate_strips_heavy_fields_but_keeps_complete_trade_count():
    rows = [
        _M8Row(
            1,
            '{"tradeId":"1","pnl":10,"entryScreenshot":"data:image/png;base64,A",'
            '"metadata":{"exitScreenshot":"data:image/png;base64,B","note":"keep"}}',
        )
    ]
    page = sjs.load_state_hydrate_journal_page_from_sql(
        _M8Db(rows),
        123,
        _M8Model,
        max_rows=10,
        strip_heavy=True,
    )
    assert page["complete"] is True
    assert page["total_count"] == 1
    assert page["returned_count"] == 1
    assert page["heavy_fields_omitted"] is True
    assert "entryScreenshot" not in page["rows"][0]
    assert "exitScreenshot" not in page["rows"][0]["metadata"]
    assert page["rows"][0]["metadata"]["note"] == "keep"


def test_m8_state_hydrate_marks_partial_when_row_limit_omits_trades():
    rows = [
        _M8Row(1, '{"tradeId":"1"}'),
        _M8Row(2, '{"tradeId":"2"}'),
        _M8Row(3, '{"tradeId":"3"}'),
    ]
    page = sjs.load_state_hydrate_journal_page_from_sql(
        _M8Db(rows),
        123,
        _M8Model,
        max_rows=2,
        strip_heavy=True,
    )
    assert page["complete"] is False
    assert page["total_count"] == 3
    assert page["returned_count"] == 2
    assert page["cursor"] == 2


def test_m8_state_hydrate_parse_failure_is_not_fake_empty_complete_journal():
    rows = [_M8Row(1, '{"tradeId":')]
    page = sjs.load_state_hydrate_journal_page_from_sql(
        _M8Db(rows),
        123,
        _M8Model,
        max_rows=10,
        strip_heavy=True,
    )
    assert page["complete"] is False
    assert page["total_count"] == 1
    assert page["returned_count"] == 0
    assert page["parse_errors"] == 1


def test_m8_state_hydrate_response_metadata_marks_slim_non_full_payload():
    state = {}
    sjs.apply_journal_page_to_state_for_response(
        state,
        {
            "rows": [{"tradeId": "1"}],
            "total_count": 1,
            "returned_count": 1,
            "complete": True,
            "cursor": None,
            "omitted_heavy_fields": ["entryScreenshot"],
            "heavy_fields_omitted": True,
            "parse_errors": 0,
            "storage": "sql",
        },
    )
    assert state["journal_complete"] is True
    assert state["journal_hydrate_mode"] == "complete-slim"
    assert state["journal_heavy_fields_omitted"] is True
    assert state["m19_hot_persist_trim_v1"] is True
