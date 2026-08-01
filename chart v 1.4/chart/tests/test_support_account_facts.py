"""Support passport: the account-position axis is stamped by the server, not the browser.

Two facts ride on every support ticket — how old the account is and how many closed trades it
has — so a report can be triaged against the reporter's own position rather than in a vacuum.

These live server-side on purpose. The rest of the passport is assembled in the browser, and
both of these change triage priority, so a client-editable version is one a user can use to jump
the queue. The tests below pin that boundary, and pin the "unknown" behaviour: a fact that could
not be read must never render as 0, because a brand-new account and a broken lookup would then
be indistinguishable — which defeats the axis.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

pytest.importorskip("fastapi")


@pytest.fixture
def api():
    import api_server as api_server_module

    return api_server_module


def _db_returning(count):
    """A db whose count(...) aggregate resolves to `count`."""
    db = MagicMock()
    db.query.return_value.filter.return_value.scalar.return_value = count
    return db


def _db_raising():
    db = MagicMock()
    db.query.side_effect = RuntimeError("database is on fire")
    return db


def test_account_age_is_days_since_created_at(api):
    user = SimpleNamespace(id=7, created_at=datetime.utcnow() - timedelta(days=93, hours=6))
    facts = api._support_account_facts(_db_returning(0), user)
    assert facts["account_age_days"] == 93


def test_account_created_today_is_zero_not_missing(api):
    # A genuine zero must be a number. It is the "brand new user" signal support acts on.
    user = SimpleNamespace(id=7, created_at=datetime.utcnow())
    facts = api._support_account_facts(_db_returning(0), user)
    assert facts["account_age_days"] == 0
    assert facts["closed_trades"] == 0


def test_closed_trade_count_is_read_from_the_journal_trade_table(api):
    user = SimpleNamespace(id=7, created_at=datetime.utcnow())
    facts = api._support_account_facts(_db_returning(412), user)
    assert facts["closed_trades"] == 412


def test_missing_created_at_reports_unknown_not_zero(api):
    # The distinction this whole axis rests on: unreadable is not the same as new.
    user = SimpleNamespace(id=7, created_at=None)
    facts = api._support_account_facts(_db_returning(5), user)
    assert facts["account_age_days"] == "unknown"
    assert facts["account_age_days"] != 0


def test_failed_trade_count_reports_unknown_and_still_opens_the_ticket(api):
    user = SimpleNamespace(id=7, created_at=datetime.utcnow() - timedelta(days=10))
    facts = api._support_account_facts(_db_raising(), user)
    assert facts["closed_trades"] == "unknown"
    # The age half must survive the trade half failing.
    assert facts["account_age_days"] == 10


def test_clock_skew_never_produces_a_negative_age(api):
    user = SimpleNamespace(id=7, created_at=datetime.utcnow() + timedelta(days=3))
    facts = api._support_account_facts(_db_returning(0), user)
    assert facts["account_age_days"] == 0


def test_facts_are_json_serialisable_for_ticket_extra(api):
    # ticket_extra is json.dumps'd; a non-serialisable value would lose the whole blob.
    user = SimpleNamespace(id=7, created_at=datetime.utcnow() - timedelta(days=1))
    for db in (_db_returning(3), _db_raising()):
        facts = api._support_account_facts(db, user)
        assert json.loads(json.dumps(facts)) == facts


def test_one_day_old_account_is_one_day(api):
    user = SimpleNamespace(id=7, created_at=datetime.utcnow() - timedelta(days=1, minutes=1))
    assert api._support_account_facts(_db_returning(0), user)["account_age_days"] == 1


def test_thread_dict_exposes_account_separately_from_client_context(api):
    """A crafted client `context` must not be able to impersonate the server block."""
    extra = {
        "context": {"account_age_days": "9999", "closed_trades": "9999", "app": "talaria-dashboard"},
        "account": {"account_age_days": 2, "closed_trades": 0},
    }
    # The serialiser reads the two keys independently; the client owns one and not the other.
    assert extra.get("account")["account_age_days"] == 2
    assert extra.get("context")["account_age_days"] == "9999"
    # And the transport keeps them apart.
    round_tripped = json.loads(json.dumps(extra))
    assert round_tripped["account"] == {"account_age_days": 2, "closed_trades": 0}


def test_account_block_is_written_under_its_own_key(api):
    """Guards the ordering in support_create_thread: `account` is assigned after `context`."""
    import inspect

    src = inspect.getsource(api.support_create_thread)
    ctx_at = src.index('extra["context"]')
    acct_at = src.index('extra["account"]')
    assert acct_at > ctx_at, "the server block must be written after, and outside, client context"
    assert 'extra["account"] = _support_account_facts(' in src
