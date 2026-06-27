#!/usr/bin/env python3
"""Patch prop live journal accounts with full challenge rules (profit target, daily loss, max DD, min days)."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.batch_adapt_mentor_data import (  # noqa: E402
    Client,
    patch_live_account_prop_rules,
    prop_rules_complete,
)
from scripts.seed_dashboard_test_sessions import ORIGIN_DEFAULT  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch prop live journal challenge rules on VPS")
    parser.add_argument("--origin", default=ORIGIN_DEFAULT)
    parser.add_argument("--email", default="data@talaria-log.com")
    parser.add_argument("--password", default="data@talaria-log.com")
    parser.add_argument("--account-id", type=int, default=0, help="Patch only this account id")
    args = parser.parse_args()

    client = Client(args.origin)
    client.login(args.email, args.password)

    accounts = client.list_live_accounts()
    prop_accounts = [
        row for row in accounts if str(row.get("account_type") or "").lower() == "prop"
    ]
    if args.account_id:
        prop_accounts = [row for row in prop_accounts if int(row.get("id") or 0) == args.account_id]

    if not prop_accounts:
        print("No prop live journal accounts found.")
        return 0

    patched = 0
    for row in prop_accounts:
        aid = int(row.get("id") or 0)
        name = row.get("name") or f"id={aid}"
        if prop_rules_complete(row.get("prop_rules")):
            print(f"  OK id={aid} {name} — rules already complete")
            continue
        patch_live_account_prop_rules(client, row)
        patched += 1

    print(f"\nDone — patched {patched}/{len(prop_accounts)} prop live journal account(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
