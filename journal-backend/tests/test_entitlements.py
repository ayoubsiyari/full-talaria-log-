"""Tests for plan_entitlements module (no Flask app required)."""

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


def test_plan_backtest_caps_uses_plan_values():
    plan = _FakePlan(max_trading_sessions=10, max_tickers_per_session=8, max_supporting_tickers_per_session=3)
    caps = pe.plan_backtest_caps(plan)
    assert caps["max_trading_sessions"] == 10
    assert caps["max_tickers_per_session"] == 8
    assert caps["max_supporting_tickers_per_session"] == 3


def test_apply_plan_entitlements_copies_caps():
    user = _FakeUser()
    plan = _FakePlan(max_trading_sessions=7, max_tickers_per_session=4, max_supporting_tickers_per_session=2)
    pe.apply_plan_entitlements(user, plan)
    assert user.max_trading_sessions == 7
    assert user.max_tickers_per_session == 4
    assert user.max_supporting_tickers_per_session == 2
    assert user.entitlements_override is False


def test_revoke_to_free_tier():
    user = _FakeUser(max_trading_sessions=20)
    pe.revoke_to_free_tier(user)
    ft = pe.free_tier_caps()
    assert user.max_trading_sessions == ft["max_trading_sessions"]
    assert user.max_tickers_per_session == ft["max_tickers_per_session"]


def test_revoke_skips_override():
    user = _FakeUser(max_trading_sessions=20, entitlements_override=True)
    pe.revoke_to_free_tier(user)
    assert user.max_trading_sessions == 20


def test_effective_limits_from_active_plan():
    user = _FakeUser()
    plan = _FakePlan(max_trading_sessions=15, max_tickers_per_session=6, max_supporting_tickers_per_session=4)
    sub = _FakeSub(status="active", plan_id=1)
    caps = pe.effective_backtest_limits(user, active_subscription=sub, active_plan=plan)
    assert caps["max_trading_sessions"] == 15
    assert caps["entitlements_source"] == "plan"


def test_effective_limits_override_wins():
    user = _FakeUser(entitlements_override=True, max_trading_sessions=99)
    plan = _FakePlan(max_trading_sessions=5)
    sub = _FakeSub(status="active", plan_id=1)
    caps = pe.effective_backtest_limits(user, active_subscription=sub, active_plan=plan)
    assert caps["max_trading_sessions"] == 99
    assert caps["entitlements_source"] == "override"


def test_effective_limits_free_tier():
    user = _FakeUser()
    caps = pe.effective_backtest_limits(user)
    ft = pe.free_tier_caps()
    assert caps["max_trading_sessions"] == ft["max_trading_sessions"]
    assert caps["entitlements_source"] == "free"


def test_subscription_status_requires_revoke():
    assert pe.subscription_status_requires_revoke("canceled") is True
    assert pe.subscription_status_requires_revoke("active") is False


def test_admin_extension_keeps_user_limits():
    user = _FakeUser(
        max_trading_sessions=12,
        access_expires_at=datetime.utcnow() + timedelta(days=7),
    )
    caps = pe.effective_backtest_limits(user)
    assert caps["max_trading_sessions"] == 12
    assert caps["entitlements_source"] == "extension"
