#!/usr/bin/env python3
"""
Generate and upload demo trades for a backtest session on VPS/staging.

Uses local session_seed_trades generator (full fields: strategy tags, bar paths)
then PATCH /api/sessions/{id}/state with journal array.
"""
from __future__ import annotations

import argparse
import base64
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ANALYTICS_CORE = ROOT / "homepage" / "src" / "app" / "dashboard" / "analytics" / "backend"
if str(ANALYTICS_CORE) not in sys.path:
    sys.path.insert(0, str(ANALYTICS_CORE))

from analytics_core.session_seed_trades import (  # noqa: E402
    extract_session_contract,
    generate_session_seed_trades,
    load_bars_for_contract,
)

ORIGIN_DEFAULT = "http://31.97.192.82:3000"
DEFAULT_SESSION_NAME = "QA T1 · EURUSD Scalper BT"


class Client:
    def __init__(self, origin: str):
        self.origin = origin.rstrip("/")
        self.jar = CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.journal_token: str | None = None
        self.csrf: str | None = None

    def _request(
        self,
        url: str,
        method: str = "GET",
        data: dict | list | None = None,
        *,
        use_journal_token: bool = False,
        csrf: bool = False,
    ) -> Any:
        headers = {"Accept": "application/json"}
        body = None
        if data is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(data).encode("utf-8")
        if use_journal_token and self.journal_token:
            headers["Authorization"] = f"Bearer {self.journal_token}"
        if csrf and self.csrf:
            headers["X-CSRF-TOKEN"] = self.csrf
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with self.opener.open(req, timeout=180) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw.strip() else {}
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {e.code} {method} {url}: {err}") from e

    def login(self, email: str, password: str) -> None:
        data = self._request(
            f"{self.origin}/api/auth/login",
            "POST",
            {"email": email, "password": password},
        )
        token = data.get("journal_token") or data.get("token")
        if not token:
            raise RuntimeError(f"Login failed: {data}")
        self.journal_token = token
        try:
            payload_b64 = token.split(".")[1]
            payload_b64 += "=" * (-len(payload_b64) % 4)
            claims = json.loads(base64.urlsafe_b64decode(payload_b64))
            self.csrf = str(claims.get("csrf") or "") or None
        except Exception:
            self.csrf = None

    def list_sessions(self) -> list[dict[str, Any]]:
        data = self._request(f"{self.origin}/api/sessions")
        return list(data.get("sessions") or [])

    def get_session(self, session_id: int) -> dict[str, Any]:
        data = self._request(f"{self.origin}/api/sessions/{session_id}")
        sess = data.get("session")
        if not sess:
            raise RuntimeError(f"Session {session_id} not found: {data}")
        return sess

    def load_bars(self, file_id: int, from_ms: int, to_ms: int, resolution: str) -> list[dict[str, Any]]:
        q = (
            f"{self.origin}/api/file/{file_id}/bars"
            f"?from={from_ms}&to={to_ms}&resolution={urllib.parse.quote(resolution)}&limit=2000"
        )
        data = self._request(q)
        return list(data.get("bars") or [])


def find_session(client: Client, *, session_id: int | None, session_name: str) -> dict[str, Any]:
    if session_id is not None:
        return client.get_session(session_id)
    want = session_name.strip().lower()
    for row in client.list_sessions():
        if str(row.get("name") or "").strip().lower() == want:
            sid = row.get("id")
            if isinstance(sid, int):
                return client.get_session(sid)
    raise RuntimeError(f"No session named {session_name!r}")


def patch_journal(client: Client, session_id: int, trades: list[dict[str, Any]]) -> dict[str, Any]:
    return client._request(
        f"{client.origin}/api/sessions/{session_id}/state",
        "PATCH",
        {"journal": trades},
        use_journal_token=True,
        csrf=True,
    )


def summarize_trades(trades: list[dict[str, Any]]) -> dict[str, Any]:
    with_paths = sum(1 for t in trades if isinstance(t.get("bar_close_r"), list) and t["bar_close_r"])
    with_pre_tags = sum(1 for t in trades if t.get("preTags"))
    with_strat_vars = sum(1 for t in trades if t.get("strategy_variables"))
    wins = sum(1 for t in trades if float(t.get("pnl") or 0) > 0)
    return {
        "count": len(trades),
        "wins": wins,
        "losses": len(trades) - wins,
        "with_bar_paths": with_paths,
        "with_pre_tags": with_pre_tags,
        "with_strategy_variables": with_strat_vars,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed full demo trades on a backtest session")
    parser.add_argument("--origin", default=ORIGIN_DEFAULT)
    parser.add_argument("--email", default="data@talaria-log.com")
    parser.add_argument("--password", default="data@talaria-log.com")
    parser.add_argument("--session-id", type=int, default=None)
    parser.add_argument("--session-name", default=DEFAULT_SESSION_NAME)
    parser.add_argument("--count", type=int, default=200)
    parser.add_argument("--scenario", default="stress", help="balanced | stress | realistic | ...")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    client = Client(args.origin)
    print(f"Logging in as {args.email} ...")
    client.login(args.email, args.password)

    session = find_session(client, session_id=args.session_id, session_name=args.session_name)
    session_id = int(session["id"])
    print(f"Target session id={session_id}: {session.get('name')}")

    contract = extract_session_contract(session)
    print(
        f"  Strategy: {contract.get('strategy')} (id={contract.get('strategy_id')}) "
        f"| tickers={contract.get('tickers')} | pre vars={len(contract.get('pre_var_defs') or [])} "
        f"| post vars={len(contract.get('post_var_defs') or [])}"
    )

    def bars_loader(file_id: int, from_ms: int, to_ms: int, resolution: str) -> list[dict[str, Any]]:
        return client.load_bars(file_id, from_ms, to_ms, resolution)

    bars_by_ticker = load_bars_for_contract(contract, bars_loader, limit=2000)
    loaded = {k: len(v) for k, v in bars_by_ticker.items()}
    print(f"  Loaded bars: {loaded or '(fallback prices only)'}")

    generated = generate_session_seed_trades(
        session,
        count=args.count,
        seed=session_id * 1000 + args.count,
        bars_by_ticker=bars_by_ticker,
        scenario=args.scenario,
    )
    trades = generated.get("trades") or []
    warnings = generated.get("warnings") or []
    if warnings:
        for w in warnings:
            print(f"  WARNING: {w}")
    if not trades:
        print("No trades generated.", file=sys.stderr)
        return 1

    stats = summarize_trades(trades)
    print(f"Generated {stats['count']} trades — wins={stats['wins']} losses={stats['losses']}")
    print(
        f"  bar paths={stats['with_bar_paths']} | preTags={stats['with_pre_tags']} "
        f"| strategy_variables={stats['with_strategy_variables']}"
    )
    sample = trades[0]
    print(
        f"  Sample preTags={sample.get('preTags')} postTags={sample.get('postTags')} "
        f"bar_close_r len={len(sample.get('bar_close_r') or [])} "
        f"post_exit len={len(sample.get('post_exit_bar_close_r') or [])}"
    )

    if args.dry_run:
        print("Dry run — not uploading.")
        return 0

    print(f"Uploading journal ({len(trades)} trades) via PATCH state ...")
    result = patch_journal(client, session_id, trades)
    print(f"Done. API response keys: {list(result.keys()) if isinstance(result, dict) else type(result)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
