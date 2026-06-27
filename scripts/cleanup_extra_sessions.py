#!/usr/bin/env python3
"""Delete all backtest sessions except the 14 mentor backtests from mentor-batch-summary.json."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "http://31.97.192.82:3000"
SUMMARY = ROOT / "mentor data" / "mentor-batch-summary.json"


def main() -> int:
    rows = json.loads(SUMMARY.read_text(encoding="utf-8"))
    keep_bt = {
        int(r["source_id"])
        for r in rows
        if r.get("status") == "ok" and r.get("source_kind") in ("backtest", "prop_backtest")
    }

    jar = CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    login_req = urllib.request.Request(
        f"{ORIGIN}/api/auth/login",
        data=json.dumps({"email": "data@talaria-log.com", "password": "data@talaria-log.com"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with op.open(login_req) as resp:
        token = json.loads(resp.read()).get("journal_token")

    def api(method: str, url: str) -> dict:
        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            method=method,
        )
        try:
            with op.open(req, timeout=120) as r:
                raw = r.read().decode()
                return json.loads(raw) if raw.strip() else {}
        except urllib.error.HTTPError as e:
            return {"_error": e.code, "_body": e.read().decode()}

    sessions = api("GET", f"{ORIGIN}/api/sessions").get("sessions") or []
    deleted = 0
    failed = 0
    for s in sessions:
        sid = int(s["id"])
        if sid in keep_bt:
            continue
        result = api("DELETE", f"{ORIGIN}/api/sessions/{sid}")
        if result.get("success") or "_error" not in result:
            print(f"DELETED {sid}: {s.get('name')}")
            deleted += 1
        else:
            print(f"FAILED {sid}: {s.get('name')} -> {result}", file=sys.stderr)
            failed += 1

    remaining = api("GET", f"{ORIGIN}/api/sessions").get("sessions") or []
    print(f"\nDeleted {deleted}, failed {failed}")
    print(f"Remaining backtest sessions: {len(remaining)} (expected {len(keep_bt)})")
    for s in sorted(remaining, key=lambda x: int(x.get("id") or 0)):
        print(f"  {s.get('id')}: {s.get('name')}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
