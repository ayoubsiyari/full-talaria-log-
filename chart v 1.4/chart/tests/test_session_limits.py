"""Regression tests for backtest session limit helpers in api_server."""

import pytest

pytest.importorskip("fastapi")


class _FakeUser:
    def __init__(self, uid=1, role="user", max_trading_sessions=5, entitlements_override=False):
        self.id = uid
        self.role = role
        self.max_trading_sessions = max_trading_sessions
        self.max_tickers_per_session = 5
        self.max_supporting_tickers_per_session = 5
        self.entitlements_override = entitlements_override
        self.access_expires_at = None


class _FakeDb:
    def __init__(self, session_count=0, locked_user=None):
        self._session_count = session_count
        self._locked_user = locked_user

    def query(self, *args):
        return self

    def filter(self, *args, **kwargs):
        return self

    def with_for_update(self):
        return self

    def first(self):
        return self._locked_user

    def scalar(self):
        return self._session_count


def test_user_backtest_limits_legacy_defaults(monkeypatch):
    import api_server as api

    monkeypatch.setattr(api.pe, "entitlements_resolver_v2_enabled", lambda: False)
    user = _FakeUser(max_trading_sessions=5)
    limits = api._user_backtest_limits(user)
    assert limits["max_trading_sessions"] == 5
    assert limits["max_tickers_per_session"] == 5


def test_check_session_create_quota_at_cap(monkeypatch):
    import api_server as api

    user = _FakeUser(max_trading_sessions=2, entitlements_override=True)
    db = _FakeDb(session_count=2, locked_user=user)
    with pytest.raises(api.HTTPException) as exc:
        api._check_session_create_quota(db, user)
    assert exc.value.status_code == 403


def test_check_session_create_quota_allows_under_cap(monkeypatch):
    import api_server as api

    user = _FakeUser(max_trading_sessions=5, entitlements_override=True)
    db = _FakeDb(session_count=3, locked_user=user)
    result = api._check_session_create_quota(db, user)
    assert result.id == user.id


def test_admin_bypasses_backtest_limits():
    import api_server as api

    admin = _FakeUser(role="admin")
    assert api._user_bypasses_backtest_limits(admin) is True
