"""D-036: DELETE /api/file admin gate, candle_push gate, prop-firm entry block."""

from __future__ import annotations

import inspect

import pytest

pytest.importorskip("fastapi")
from starlette.requests import Request  # noqa: E402


class _FakeUser:
    def __init__(self, uid=1, role="user"):
        self.id = uid
        self.role = role
        self.email = f"{role}@example.com"


def _make_request(path: str = "/api/file/1", query: str = "") -> Request:
    scope = {
        "type": "http",
        "method": "DELETE",
        "path": path,
        "query_string": query.encode("utf-8"),
        "headers": [],
        "client": ("127.0.0.1", 12345),
        "server": ("test", 80),
        "scheme": "http",
    }
    return Request(scope)


@pytest.mark.asyncio
async def test_delete_file_non_admin_forbidden(monkeypatch):
    import api_server as api

    monkeypatch.setattr(api, "AUTH_ENABLED", True)
    req = _make_request()

    def _deny(_r):
        raise api.HTTPException(status_code=403, detail="Forbidden")

    monkeypatch.setattr(api, "_require_admin", _deny)

    with pytest.raises(api.HTTPException) as exc:
        await api.delete_file(999999, req)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_delete_file_admin_reaches_handler_body(monkeypatch):
    """Admin passes gate; missing fixture file → not-found path (proves body after gate)."""
    import api_server as api

    monkeypatch.setattr(api, "AUTH_ENABLED", True)
    admin = _FakeUser(role="admin")
    monkeypatch.setattr(api, "_require_admin", lambda r: admin)

    class _Q:
        def filter(self, *a, **k):
            return self

        def first(self):
            return None

    class _Db:
        def query(self, *a, **k):
            return _Q()

        def rollback(self):
            pass

        def close(self):
            pass

    monkeypatch.setattr(api, "get_db", lambda: iter([_Db()]))

    req = _make_request()
    with pytest.raises(api.HTTPException) as exc:
        await api.delete_file(999999, req)
    # Pre-existing broad except may wrap HTTPException(404) as 500.
    assert exc.value.status_code in (404, 500)
    assert "File not found" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_candle_push_non_admin_forbidden(monkeypatch):
    import api_server as api

    monkeypatch.setattr(api, "AUTH_ENABLED", True)
    req = _make_request(path="/api/file/1/candle_push")

    def _deny(_r):
        raise api.HTTPException(status_code=403, detail="Forbidden")

    monkeypatch.setattr(api, "_require_admin", _deny)

    with pytest.raises(api.HTTPException) as exc:
        await api.push_candle_update(1, req)
    assert exc.value.status_code == 403


def test_delete_file_signature_requires_request_and_admin_call():
    import api_server as api

    sig = inspect.signature(api.delete_file)
    assert "request" in sig.parameters
    src = inspect.getsource(api.delete_file)
    assert "_require_admin(request)" in src


def test_candle_push_source_requires_admin():
    import api_server as api

    src = inspect.getsource(api.push_candle_update)
    assert "_require_admin(request)" in src


def test_propfirm_entry_helper_blocks_html_and_mode_not_backtest():
    import api_server as api

    assert api._request_is_propfirm_entry(
        "/chart/propfirm-backtest.html", _make_request("/chart/propfirm-backtest.html")
    )
    assert api._request_is_propfirm_entry(
        "/propfirm-backtest.html", _make_request("/propfirm-backtest.html")
    )
    assert api._request_is_propfirm_entry(
        "/chart/index.html",
        _make_request("/chart/index.html", "mode=propfirm&sessionId=1"),
    )
    assert not api._request_is_propfirm_entry(
        "/chart/index.html",
        _make_request("/chart/index.html", "mode=backtest&sessionId=1"),
    )
    assert not api._request_is_propfirm_entry(
        "/chart/backtesting.html", _make_request("/chart/backtesting.html")
    )


def test_propfirm_session_create_rejected_for_non_admin():
    import api_server as api

    with pytest.raises(api.HTTPException) as exc:
        api._assert_propfirm_session_allowed(_FakeUser(role="user"))
    assert exc.value.status_code == 403

    api._assert_propfirm_session_allowed(_FakeUser(role="admin"))  # no raise
