"""B-W17 acceptance — sweep parse-guard and durable journal delete logging.

Covers `api_server._sync_trading_session_journal_trades` only. Uses a real
SQLite-backed SQLAlchemy session over the shipping
`api_server.TradingSessionJournalTrade` model, so the `NOT IN` sweep, the
`db.delete()` calls and the commit are exercised for real rather than through a
stubbed query object.

GUARD-01 cells:
  1 alias-wipe        2 mixed             3 legitimate clear   4 normal orphan
  5 deletion logged   6 refusal logged    7 absence class      8 log cannot break write
"""

import builtins

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import api_server

SESSION_ID = 1003
USER_ID = 77
RESOLVER = "resolver=api_server._sync_trading_session_journal_trades.inline(tradeId|id)"


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    api_server.Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _seed(db, client_ids, session_id=SESSION_ID):
    for i, cid in enumerate(client_ids, start=1):
        db.add(
            api_server.TradingSessionJournalTrade(
                session_id=session_id,
                user_id=USER_ID,
                client_trade_id=cid,
                user_trade_id=i,
                payload_json='{"tradeId":"%s"}' % cid,
            )
        )
    db.commit()


def _stored_ids(db, session_id=SESSION_ID):
    rows = (
        db.query(api_server.TradingSessionJournalTrade)
        .filter(api_server.TradingSessionJournalTrade.session_id == session_id)
        .all()
    )
    return sorted(str(r.client_trade_id) for r in rows)


def _sync(db, journal, session_id=SESSION_ID):
    api_server._sync_trading_session_journal_trades(db, session_id, USER_ID, journal)
    db.commit()


# --- cell 1 -----------------------------------------------------------------

def test_cell1_alias_wipe_keyed_trade_id_deletes_nothing(db):
    """3 stored rows, payload of 3 entries keyed `trade_id` only.

    `trade_id` is canonical per session_journal_store.journal_trade_client_id but
    invisible to the sweep's two-key inline parse, so every entry is unresolved.
    Nothing may be deleted.
    """
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, [{"trade_id": "t1"}, {"trade_id": "t2"}, {"trade_id": "t3"}])
    assert _stored_ids(db) == ["t1", "t2", "t3"]


# --- cell 2 -----------------------------------------------------------------

def test_cell2_mixed_parseable_and_unparseable_deletes_nothing(db):
    """3 stored rows; 2 parseable entries and 1 unparseable. Nothing may be deleted."""
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, [{"tradeId": "t1"}, {"tradeId": "t2"}, {"trade_id": "t3"}])
    assert _stored_ids(db) == ["t1", "t2", "t3"]


# --- cell 3 -----------------------------------------------------------------

def test_cell3_legitimate_clear_still_deletes_everything(db):
    """An empty incoming journal is a real user action and must still clear all rows."""
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, [])
    assert _stored_ids(db) == []


# --- cell 4 -----------------------------------------------------------------

def test_cell4_normal_orphan_removal_still_works(db):
    """3 stored rows, payload holds 2 of them, all parseable: exactly 1 row is swept."""
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, [{"tradeId": "t1"}, {"tradeId": "t2"}])
    assert _stored_ids(db) == ["t1", "t2"]


# --- cell 5 -----------------------------------------------------------------

def test_cell5_deletion_is_logged(db, capsys):
    """Cell 4's deletion emits session id, before/after counts, resolver and deleted id."""
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, [{"tradeId": "t1"}, {"tradeId": "t2"}])
    out = capsys.readouterr().out

    assert "[JOURNAL-DELETE]" in out, "no deletion record emitted"
    line = [ln for ln in out.splitlines() if "[JOURNAL-DELETE]" in ln][0]
    assert "session_id=%d" % SESSION_ID in line, "deletion record omits the session id"
    assert "rows_before=3" in line, "deletion record omits the before count"
    assert "rows_after=2" in line, "deletion record omits the after count"
    assert RESOLVER in line, "deletion record omits the resolver name"
    assert "deleted_count=1" in line
    deleted_part = line.split("deleted_client_trade_ids=", 1)[1]
    assert "t3" in deleted_part, "deletion record omits the deleted client_trade_id"


def test_cell5b_deleted_id_list_is_capped(db, capsys):
    """A large delete must not produce an unbounded log line: first 50 plus a total."""
    ids = ["t%03d" % n for n in range(60)]
    _seed(db, ids)
    _sync(db, [])
    line = [ln for ln in capsys.readouterr().out.splitlines() if "[JOURNAL-DELETE]" in ln][0]
    deleted_part = line.split("deleted_client_trade_ids=", 1)[1]
    assert deleted_part.count("'") // 2 == 50, "deleted id list is not capped at 50"
    assert "deleted_count=60" in line, "capped line must still carry the true total"


def test_cell5c_rows_after_reconciles_when_the_same_patch_adds_and_deletes(db, capsys):
    """rows_after must equal the real table count, including rows the upsert added.

    Manager-added. rows_before is captured at function entry, so a PATCH that both
    adds a new trade and orphans an old one understates the surviving journal
    unless the added rows are counted. A record that cannot be reconciled against
    the table is not usable evidence, which is the entire point of logging this.
    """
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, [{"tradeId": "t1"}, {"tradeId": "t2"}, {"tradeId": "t4"}])
    line = [ln for ln in capsys.readouterr().out.splitlines() if "[JOURNAL-DELETE]" in ln][0]

    actual_after = len(_stored_ids(db))
    assert actual_after == 3, "fixture sanity: t1, t2 kept, t4 added, t3 swept"
    assert "rows_after=%d" % actual_after in line, (
        "logged rows_after does not match the real table count: %s" % line
    )
    assert "rows_added=1" in line, "record omits how many rows the upsert added"
    assert "deleted_count=1" in line


# --- cell 6 -----------------------------------------------------------------

def test_cell6_refusal_is_logged(db, capsys):
    """Cell 1 emits a distinct record naming the unresolved count."""
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, [{"trade_id": "t1"}, {"trade_id": "t2"}, {"trade_id": "t3"}])
    out = capsys.readouterr().out

    assert "[JOURNAL-SWEEP-REFUSED]" in out, "no refusal record emitted"
    assert "[JOURNAL-DELETE]" not in out, "refusal must be a distinct record from a delete"
    line = [ln for ln in out.splitlines() if "[JOURNAL-SWEEP-REFUSED]" in ln][0]
    assert "unresolved_incoming=3" in line, "refusal record omits the unresolved count"
    assert "session_id=%d" % SESSION_ID in line
    assert "rows_before=3" in line
    assert "rows_after=3" in line
    assert "rows_added=0" in line, "a refuse that already upserted is not a refuse"
    assert RESOLVER in line


def test_cell6b_refusal_writes_nothing_even_when_some_entries_parse(db):
    """SAFE-01: refuse runs before upserts. A mixed payload used to refresh
    parseable rows' payload_json and then skip the sweep — a partial commit.
    After the reorder, nothing on the session may change.
    """
    _seed(db, ["t1", "t2", "t3"])
    before = {
        r.client_trade_id: (r.payload_json, r.user_trade_id)
        for r in db.query(api_server.TradingSessionJournalTrade)
        .filter(api_server.TradingSessionJournalTrade.session_id == SESSION_ID)
        .all()
    }
    _sync(
        db,
        [
            {"tradeId": "t1", "note": "should-not-land"},
            {"tradeId": "t2", "note": "should-not-land"},
            {"trade_id": "t3"},
        ],
    )
    after_rows = (
        db.query(api_server.TradingSessionJournalTrade)
        .filter(api_server.TradingSessionJournalTrade.session_id == SESSION_ID)
        .all()
    )
    assert sorted(r.client_trade_id for r in after_rows) == ["t1", "t2", "t3"]
    for r in after_rows:
        payload, user_tid = before[r.client_trade_id]
        assert r.payload_json == payload, "refuse mutated a parseable row's payload"
        assert r.user_trade_id == user_tid


# --- cell 7 -----------------------------------------------------------------

def test_cell7_journal_not_a_list_returns_early_unchanged(db):
    _seed(db, ["t1", "t2", "t3"])
    for bad in (None, "not-a-list", 42, {"tradeId": "t1"}):
        _sync(db, bad)
        assert _stored_ids(db) == ["t1", "t2", "t3"]


def test_cell7_non_dict_entries_block_the_sweep(db):
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, [{"tradeId": "t1"}, "t2", None])
    assert _stored_ids(db) == ["t1", "t2", "t3"]


def test_cell7_whitespace_only_id_blocks_the_sweep(db):
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, [{"tradeId": "t1"}, {"tradeId": "   "}])
    assert _stored_ids(db) == ["t1", "t2", "t3"]


def test_cell7_falsy_zero_and_false_ids_block_the_sweep(db):
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, [{"tradeId": "t1"}, {"tradeId": 0}, {"id": False}])
    assert _stored_ids(db) == ["t1", "t2", "t3"]


# --- cell 8 -----------------------------------------------------------------

def _print_that_raises(*a, **k):
    raise RuntimeError("induced logging failure")


def test_cell8_delete_survives_a_raising_logger(db, monkeypatch):
    """A logging failure must not abort or roll back the sweep."""
    _seed(db, ["t1", "t2", "t3"])
    monkeypatch.setattr(builtins, "print", _print_that_raises)
    _sync(db, [{"tradeId": "t1"}, {"tradeId": "t2"}])
    monkeypatch.undo()
    assert _stored_ids(db) == ["t1", "t2"]


def test_cell8_refusal_survives_a_raising_logger(db, monkeypatch):
    """A logging failure on the refusal path must not turn the refusal into a delete."""
    _seed(db, ["t1", "t2", "t3"])
    monkeypatch.setattr(builtins, "print", _print_that_raises)
    _sync(db, [{"trade_id": "t1"}, {"trade_id": "t2"}, {"trade_id": "t3"}])
    monkeypatch.undo()
    assert _stored_ids(db) == ["t1", "t2", "t3"]


# === B-W18 — negative controls for the parse-guard kill-switch ================
# Standing policy: every covered gate keeps a paired cell running with the kill
# switch OFF, asserting RED. A gate whose negative control is green is a lying
# gate. NC-4 is RED-by-design: it asserts the wipe RETURNS when the guard is
# switched off, which is what proves the switch is real and not decorative.
#
# The flag is read at CALL time inside `_sync_trading_session_journal_trades`,
# so `monkeypatch.setenv` alone toggles it — no module reimport, and no module
# attribute to patch.

FLAG = "JOURNAL_SWEEP_PARSE_GUARD_ENABLED"

ALIAS_PAYLOAD = [{"trade_id": "t1"}, {"trade_id": "t2"}, {"trade_id": "t3"}]


# --- NC-4 -------------------------------------------------------------------

def test_nc4_guard_disabled_reproduces_the_alias_wipe(db, monkeypatch):
    """Kill engaged + the cell-1 alias payload: every row is deleted.

    Cell 1 asserts these three rows survive. This asserts they do NOT when the
    guard is off. If this cell ever goes green with the guard ON, the switch is
    doing nothing and the rollback lever is a lie.
    """
    monkeypatch.setenv(FLAG, "false")
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, ALIAS_PAYLOAD)
    assert _stored_ids(db) == [], "kill engaged but rows survived: the switch does nothing"


def test_nc4b_guard_disabled_still_deletes_only_orphans_on_a_parseable_payload(db, monkeypatch):
    """Rollback fidelity: with the guard off, a normal parseable sweep is unchanged."""
    monkeypatch.setenv(FLAG, "false")
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, [{"tradeId": "t1"}, {"tradeId": "t2"}])
    assert _stored_ids(db) == ["t1", "t2"]


def test_nc4c_guard_disabled_emits_no_refusal_record(db, monkeypatch, capsys):
    """With the guard off there is no refusal to record."""
    monkeypatch.setenv(FLAG, "false")
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, ALIAS_PAYLOAD)
    assert "[JOURNAL-SWEEP-REFUSED]" not in capsys.readouterr().out


# --- NC-5 -------------------------------------------------------------------

def test_nc5_env_unset_leaves_the_guard_active(db, monkeypatch):
    """Default-on: with the variable absent entirely, cell 1 still protects."""
    monkeypatch.delenv(FLAG, raising=False)
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, ALIAS_PAYLOAD)
    assert _stored_ids(db) == ["t1", "t2", "t3"]


def test_nc5b_env_unset_still_emits_the_refusal_record(db, monkeypatch, capsys):
    monkeypatch.delenv(FLAG, raising=False)
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, ALIAS_PAYLOAD)
    assert "[JOURNAL-SWEEP-REFUSED]" in capsys.readouterr().out


# --- NC-6 -------------------------------------------------------------------

def test_nc6_deletion_log_still_fires_with_the_guard_disabled(db, monkeypatch, capsys):
    """The deletion record is deliberately NOT killable.

    When the parse guard is off the sweep deletes again, and that is precisely
    when the record matters most. A switch that could silence it would recreate
    the unanswerable question this train exists to end.
    """
    monkeypatch.setenv(FLAG, "false")
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, ALIAS_PAYLOAD)
    out = capsys.readouterr().out

    assert "[JOURNAL-DELETE]" in out, "guard disabled silenced the deletion record"
    line = [ln for ln in out.splitlines() if "[JOURNAL-DELETE]" in ln][0]
    assert "session_id=%d" % SESSION_ID in line
    assert "rows_before=3" in line
    assert "rows_after=0" in line
    assert "deleted_count=3" in line
    assert RESOLVER in line
    deleted_part = line.split("deleted_client_trade_ids=", 1)[1]
    for cid in ("t1", "t2", "t3"):
        assert cid in deleted_part, "record omits a deleted client_trade_id"


def test_nc6b_deletion_log_still_fires_on_a_normal_sweep_with_the_guard_disabled(db, monkeypatch, capsys):
    monkeypatch.setenv(FLAG, "false")
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, [{"tradeId": "t1"}, {"tradeId": "t2"}])
    assert "[JOURNAL-DELETE]" in capsys.readouterr().out


# --- NC-6c: the exact value vocabulary ---------------------------------------
# Documented as executable evidence so the incident runbook and the code cannot
# drift apart. Only an explicitly recognised negative value disables the guard;
# everything else — including "" and any typo — leaves it ACTIVE.

DISABLING_VALUES = ["0", "false", "FALSE", "False", " false ", "no", "off", "OFF"]

NON_DISABLING_VALUES = [
    "",            # empty string: the classic allow-list fail-open
    "   ",         # whitespace only
    "true",
    "TRUE",
    "1",
    "yes",
    "on",
    "fasle",       # typo of a disable value
    "flase",
    "disable",     # plausible-but-unrecognised
    "disabled",
    "nope",
    "2",
    "null",
    "None",
]


@pytest.mark.parametrize("value", DISABLING_VALUES)
def test_nc6c_values_that_disable_the_guard(db, monkeypatch, value):
    monkeypatch.setenv(FLAG, value)
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, ALIAS_PAYLOAD)
    assert _stored_ids(db) == [], "%r should disable the guard" % value


@pytest.mark.parametrize("value", NON_DISABLING_VALUES)
def test_nc6c_values_that_leave_the_guard_active(db, monkeypatch, value):
    monkeypatch.setenv(FLAG, value)
    _seed(db, ["t1", "t2", "t3"])
    _sync(db, ALIAS_PAYLOAD)
    assert _stored_ids(db) == ["t1", "t2", "t3"], "%r must NOT disable the guard" % value
