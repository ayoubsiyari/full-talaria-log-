"""Tests for chart plan_entitlements module."""

from datetime import datetime, timedelta

import plan_entitlements as pe


class _FakePlan:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class _FakeUser:
    def __init__(self, **kwargs):
        self.role = "user"
        self.entitlements_override = False
        self.max_trading_sessions = 5
        self.max_tickers_per_session = 5
        self.max_supporting_tickers_per_session = 5
        self.access_expires_at = None
        for k, v in kwargs.items():
            setattr(self, k, v)


class _FakeSub:
    def __init__(self, **kwargs):
        self.status = "active"
        self.plan_id = 1
        for k, v in kwargs.items():
            setattr(self, k, v)


def test_plan_backtest_caps_defaults_when_null():
    plan = _FakePlan(max_trading_sessions=None, max_tickers_per_session=None)
    caps = pe.plan_backtest_caps(plan)
    defaults = pe.free_tier_caps()["_defaults"]
    assert caps["max_trading_sessions"] == defaults["max_trading_sessions"]


def test_apply_plan_entitlements():
    user = _FakeUser()
    plan = _FakePlan(max_trading_sessions=8, max_tickers_per_session=3, max_supporting_tickers_per_session=1)
    pe.apply_plan_entitlements(user, plan)
    assert user.max_trading_sessions == 8
    assert user.entitlements_override is False


def test_legacy_user_column_limits():
    user = _FakeUser(max_trading_sessions=3, max_tickers_per_session=2, max_supporting_tickers_per_session=1)
    caps = pe.legacy_user_column_limits(user)
    assert caps["max_trading_sessions"] == 3


def test_effective_limits_admin_unlimited():
    user = _FakeUser(role="admin")
    caps = pe.effective_backtest_limits(user)
    assert caps["max_trading_sessions"] == 0
    assert caps["entitlements_source"] == "admin"


def test_entitlements_resolver_flag_default_off(monkeypatch):
    monkeypatch.delenv("ENTITLEMENTS_RESOLVER_V2", raising=False)
    assert pe.entitlements_resolver_v2_enabled() is False


def test_entitlements_resolver_flag_env_on(monkeypatch):
    monkeypatch.setenv("ENTITLEMENTS_RESOLVER_V2", "true")
    assert pe.entitlements_resolver_v2_enabled() is True


def test_revoke_to_free_tier():
    user = _FakeUser(max_trading_sessions=50)
    pe.revoke_to_free_tier(user)
    assert user.max_trading_sessions == pe.free_tier_caps()["max_trading_sessions"]


def test_effective_limits_extension():
    user = _FakeUser(
        max_trading_sessions=11,
        access_expires_at=datetime.utcnow() + timedelta(days=3),
    )
    caps = pe.effective_backtest_limits(user)
    assert caps["entitlements_source"] == "extension"
    assert caps["max_trading_sessions"] == 11
