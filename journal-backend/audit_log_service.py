"""Append hash-chained audit log entries (spec §10.2)."""

from __future__ import annotations

import json
from typing import Any

import security_bootstrap

security_bootstrap.install_security_package()

from talaria_security.audit_chain import GENESIS_HASH, compute_entry_hash

from models import db, AuditLogChain


def append_audit_event(
    event_type: str,
    payload: dict[str, Any],
    *,
    actor_user_id: int | None = None,
    ip_address: str | None = None,
) -> AuditLogChain:
    last = AuditLogChain.query.order_by(AuditLogChain.id.desc()).first()
    previous = last.entry_hash if last else GENESIS_HASH
    entry_hash = compute_entry_hash(previous, event_type, payload)
    row = AuditLogChain(
        previous_hash=previous,
        entry_hash=entry_hash,
        event_type=event_type,
        payload=json.dumps(payload, sort_keys=True),
        actor_user_id=actor_user_id,
        ip_address=ip_address,
    )
    db.session.add(row)
    return row
