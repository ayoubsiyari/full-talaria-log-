"""Concurrent chart window claims: kick-oldest + hard gate."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

pytest.importorskip("fastapi")


@pytest.fixture
def window_helpers():
    import api_server as api

    return api


def test_chart_window_limit_for_user_admin_unlimited(window_helpers):
    api = window_helpers
    admin = SimpleNamespace(role="admin", max_sessions=1)
    assert api._chart_window_limit_for_user(admin) == 0


def test_chart_window_limit_for_user_default(window_helpers):
    api = window_helpers
    user = SimpleNamespace(role="user", max_sessions=1)
    assert api._chart_window_limit_for_user(user) == 1
    user2 = SimpleNamespace(role="user", max_sessions=3)
    assert api._chart_window_limit_for_user(user2) == 3


def test_purge_stale_chart_windows(window_helpers):
    api = window_helpers
    db = MagicMock()
    q = db.query.return_value
    filtered = q.filter.return_value
    api._purge_stale_chart_windows(db, user_id=7, now=datetime(2026, 7, 21, 12, 0, 0))
    filtered.delete.assert_called_once_with(synchronize_session=False)


def test_path_requires_chart_window(window_helpers):
    api = window_helpers
    assert api._path_requires_chart_window("/api/file/12/candles") is True
    assert api._path_requires_chart_window("/api/file/12/tile/1m/0") is True
    assert api._path_requires_chart_window("/api/sessions/9/state") is True
    assert api._path_requires_chart_window("/api/sessions/9/state/") is True
    assert api._path_requires_chart_window("/api/sessions") is False
    assert api._path_requires_chart_window("/api/sessions/9") is False
    assert api._path_requires_chart_window("/api/chart/windows/claim") is False
    assert api._path_requires_chart_window("/api/auth/me") is False


def test_evict_oldest_chart_windows(window_helpers):
    api = window_helpers
    db = MagicMock()
    oldest = SimpleNamespace(client_id="old-window-aaaaaaaa")
    newer = SimpleNamespace(client_id="new-window-bbbbbbbb")
    q = db.query.return_value
    filtered = q.filter.return_value
    ordered = filtered.order_by.return_value
    ordered.limit.return_value.all.return_value = [oldest, newer]

    evicted = api._evict_oldest_chart_windows(db, user_id=3, need_slots=2)
    assert evicted == ["old-window-aaaaaaaa", "new-window-bbbbbbbb"]
    assert db.delete.call_count == 2


def test_evict_oldest_noop_when_no_slots_needed(window_helpers):
    api = window_helpers
    db = MagicMock()
    assert api._evict_oldest_chart_windows(db, user_id=3, need_slots=0) == []
    db.query.assert_not_called()


def test_chart_window_id_from_request_header_and_query(window_helpers):
    api = window_helpers

    class _Req:
        def __init__(self, headers=None, query=None):
            self.headers = headers or {}
            self.query_params = query or {}

    assert (
        api._chart_window_id_from_request(
            _Req(headers={api._CHART_WINDOW_ID_HEADER: "headerid88888888"})
        )
        == "headerid88888888"
    )
    assert (
        api._chart_window_id_from_request(
            _Req(query={"chart_window_id": "queryid99999999"})
        )
        == "queryid99999999"
    )
    assert api._chart_window_id_from_request(_Req()) == ""


def test_require_active_chart_window_rejects_missing_id(window_helpers, monkeypatch):
    api = window_helpers
    monkeypatch.setattr(api, "AUTH_ENABLED", True)
    user = SimpleNamespace(id=1, role="user", max_sessions=1)

    class _Req:
        headers = {}
        query_params = {}

    with pytest.raises(api.HTTPException) as exc:
        api._require_active_chart_window(_Req(), user=user)
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "chart_window_kicked"


def test_require_active_chart_window_admin_bypass(window_helpers, monkeypatch):
    api = window_helpers
    monkeypatch.setattr(api, "AUTH_ENABLED", True)
    admin = SimpleNamespace(id=1, role="admin", max_sessions=1)

    class _Req:
        headers = {}
        query_params = {}

    api._require_active_chart_window(_Req(), user=admin)  # no raise


def test_require_active_chart_window_rejects_unknown_row(window_helpers, monkeypatch):
    api = window_helpers
    monkeypatch.setattr(api, "AUTH_ENABLED", True)
    user = SimpleNamespace(id=9, role="user", max_sessions=2)

    class _Req:
        headers = {api._CHART_WINDOW_ID_HEADER: "missingid12345678"}
        query_params = {}

    db = MagicMock()
    q = db.query.return_value
    filtered = q.filter.return_value
    filtered.first.return_value = None
    monkeypatch.setattr(api, "SessionLocal", lambda: db)

    with pytest.raises(api.HTTPException) as exc:
        api._require_active_chart_window(_Req(), user=user)
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "chart_window_kicked"
    db.close.assert_called_once()


def test_require_active_chart_window_accepts_fresh_row(window_helpers, monkeypatch):
    api = window_helpers
    monkeypatch.setattr(api, "AUTH_ENABLED", True)
    user = SimpleNamespace(id=9, role="user", max_sessions=2)
    cid = "activeid12345678"

    class _Req:
        headers = {api._CHART_WINDOW_ID_HEADER: cid}
        query_params = {}

    now = datetime.utcnow()
    row = SimpleNamespace(
        client_id=cid,
        user_id=9,
        last_seen_at=now,
        created_at=now,
    )
    db = MagicMock()
    q = db.query.return_value
    filtered = q.filter.return_value
    filtered.first.return_value = row
    monkeypatch.setattr(api, "SessionLocal", lambda: db)

    api._require_active_chart_window(_Req(), user=user)
    db.close.assert_called_once()


def test_require_active_chart_window_rejects_stale_row(window_helpers, monkeypatch):
    api = window_helpers
    monkeypatch.setattr(api, "AUTH_ENABLED", True)
    user = SimpleNamespace(id=9, role="user", max_sessions=1)
    cid = "staleid123456789"

    class _Req:
        headers = {api._CHART_WINDOW_ID_HEADER: cid}
        query_params = {}

    stale = datetime.utcnow() - timedelta(seconds=api._CHART_WINDOW_STALE_SECONDS + 5)
    row = SimpleNamespace(
        client_id=cid,
        user_id=9,
        last_seen_at=stale,
        created_at=stale,
    )
    db = MagicMock()
    q = db.query.return_value
    filtered = q.filter.return_value
    filtered.first.return_value = row
    monkeypatch.setattr(api, "SessionLocal", lambda: db)

    with pytest.raises(api.HTTPException) as exc:
        api._require_active_chart_window(_Req(), user=user)
    assert exc.value.detail["code"] == "chart_window_kicked"


class _FakePresenceRow:
    def __init__(self, client_id, user_id, last_seen_at=None):
        self.client_id = client_id
        self.user_id = user_id
        self.last_seen_at = last_seen_at or datetime.utcnow()
        self.created_at = self.last_seen_at
        self.user_agent = None


class _ClaimDb:
    """Minimal in-memory stand-in for claim eviction paths."""

    def __init__(self, user, rows):
        self.user = user
        self.rows = list(rows)
        self.added = []
        self.deleted = []
        self.committed = False
        self._lock_calls = 0

    def query(self, model):
        self._model = model
        return self

    def filter(self, *args, **kwargs):
        return self

    def with_for_update(self):
        self._lock_calls += 1
        return self

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def first(self):
        import api_server as api

        if self._model is api.User:
            return self.user
        # Presence lookup by client_id — tests set _lookup_client
        cid = getattr(self, "_lookup_client", None)
        if cid is not None:
            for r in self.rows:
                if r.client_id == cid:
                    return r
            return None
        return None

    def all(self):
        rows = sorted(self.rows, key=lambda r: r.last_seen_at)
        lim = getattr(self, "_limit", None)
        if lim is not None:
            return rows[:lim]
        return rows

    def scalar(self):
        return len(self.rows)

    def add(self, row):
        self.added.append(row)
        self.rows.append(row)

    def delete(self, row):
        self.deleted.append(row.client_id)
        self.rows = [r for r in self.rows if r.client_id != row.client_id]

    def commit(self):
        self.committed = True

    def rollback(self):
        pass

    def close(self):
        pass


def test_claim_kick_oldest_when_at_cap(window_helpers, monkeypatch):
    api = window_helpers
    monkeypatch.setattr(api, "AUTH_ENABLED", True)
    user = SimpleNamespace(id=42, role="user", max_sessions=1, is_active=True)
    old = _FakePresenceRow("oldestwin11111111", 42, datetime(2026, 7, 1, 10, 0, 0))
    db = _ClaimDb(user, [old])

    def _session_local():
        return db

    monkeypatch.setattr(api, "SessionLocal", _session_local)
    monkeypatch.setattr(api, "_get_session_identity", lambda request: user)
    monkeypatch.setattr(api, "_purge_stale_chart_windows", lambda *a, **k: None)

    class _Req:
        headers = {"user-agent": "pytest"}

    body = api._ChartWindowClaimIn(client_id="newestwin22222222")
    result = asyncio.run(api.chart_window_claim(_Req(), body))
    assert result["ok"] is True
    assert result["client_id"] == "newestwin22222222"
    assert "oldestwin11111111" in result["evicted_client_ids"]
    assert "oldestwin11111111" in db.deleted
    assert any(getattr(r, "client_id", None) == "newestwin22222222" for r in db.added)


def test_claim_under_cap_no_eviction(window_helpers, monkeypatch):
    api = window_helpers
    monkeypatch.setattr(api, "AUTH_ENABLED", True)
    user = SimpleNamespace(id=42, role="user", max_sessions=3, is_active=True)
    existing = _FakePresenceRow("keepwin3333333333", 42)
    db = _ClaimDb(user, [existing])
    monkeypatch.setattr(api, "SessionLocal", lambda: db)
    monkeypatch.setattr(api, "_get_session_identity", lambda request: user)
    monkeypatch.setattr(api, "_purge_stale_chart_windows", lambda *a, **k: None)

    class _Req:
        headers = {"user-agent": "pytest"}

    body = api._ChartWindowClaimIn(client_id="secondwin44444444")
    result = asyncio.run(api.chart_window_claim(_Req(), body))
    assert result["ok"] is True
    assert result["evicted_client_ids"] == []
    assert db.deleted == []


def test_heartbeat_after_eviction_returns_kicked(window_helpers, monkeypatch):
    api = window_helpers
    monkeypatch.setattr(api, "AUTH_ENABLED", True)
    user = SimpleNamespace(id=7, role="user", max_sessions=1)
    db = MagicMock()
    q = db.query.return_value
    filtered = q.filter.return_value
    filtered.first.return_value = None
    monkeypatch.setattr(api, "SessionLocal", lambda: db)
    monkeypatch.setattr(api, "_get_session_identity", lambda request: user)

    class _Req:
        headers = {}

    body = api._ChartWindowClaimIn(client_id="gonewindow55555555")
    with pytest.raises(api.HTTPException) as exc:
        asyncio.run(api.chart_window_heartbeat(_Req(), body))
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "chart_window_unknown"
    assert "opened elsewhere" in exc.value.detail["message"].lower() or "take over" in exc.value.detail["message"].lower()
