"""Concurrent chart window claims respect users.max_sessions."""

from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest


@pytest.fixture
def window_helpers(monkeypatch):
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
