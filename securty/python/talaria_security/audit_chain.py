"""Hash-chained audit log integrity per spec §10.2."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any


GENESIS_HASH = "0" * 64


def compute_entry_hash(
    previous_hash: str,
    event_type: str,
    payload: dict[str, Any],
    timestamp: datetime | None = None,
) -> str:
    ts = (timestamp or datetime.now(timezone.utc)).isoformat()
    canonical = json.dumps(
        {"prev": previous_hash, "type": event_type, "payload": payload, "ts": ts},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def verify_chain(entries: list[dict[str, Any]]) -> bool:
    """Verify a list of {previous_hash, entry_hash, event_type, payload, created_at}."""
    prev = GENESIS_HASH
    for row in entries:
        if row.get("previous_hash") != prev:
            return False
        expected = compute_entry_hash(
            prev,
            row.get("event_type", ""),
            row.get("payload") or {},
            row.get("created_at"),
        )
        if row.get("entry_hash") != expected:
            return False
        prev = expected
    return True
