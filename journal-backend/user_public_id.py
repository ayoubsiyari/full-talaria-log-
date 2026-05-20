"""Stable public identifiers for community strategy authors (TLR-########)."""

from __future__ import annotations

import secrets

from models import User, db

PUBLIC_ID_PREFIX = "TLR-"


def new_public_id() -> str:
    return f"{PUBLIC_ID_PREFIX}{secrets.randbelow(10**8):08d}"


def ensure_user_public_id(user: User | None, *, commit: bool = True) -> str | None:
    """Assign a unique public_id if the user exists and lacks one."""
    if user is None:
        return None
    existing = getattr(user, "public_id", None)
    if existing:
        return existing
    for _ in range(40):
        candidate = new_public_id()
        if User.query.filter_by(public_id=candidate).first():
            continue
        user.public_id = candidate
        if commit:
            db.session.commit()
        return candidate
    raise RuntimeError("Could not allocate user public_id")


def backfill_missing_public_ids(batch_size: int = 200) -> int:
    """Assign public_id to users missing one. Returns count updated."""
    updated = 0
    while True:
        rows = (
            User.query.filter(
                (User.public_id.is_(None)) | (User.public_id == "")
            )
            .limit(batch_size)
            .all()
        )
        if not rows:
            break
        for user in rows:
            ensure_user_public_id(user, commit=False)
            updated += 1
        db.session.commit()
    return updated
