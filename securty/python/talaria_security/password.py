"""Password policy per spec §4.2 — bcrypt, length, HaveIBeenPwned k-anonymity."""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Tuple

from passlib.context import CryptContext

from talaria_security.constants import (
    MAX_PASSWORD_LENGTH,
    MIN_PASSWORD_LENGTH,
    PASSWORD_BCRYPT_ROUNDS,
)

logger = logging.getLogger(__name__)

_pwd_ctx = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=PASSWORD_BCRYPT_ROUNDS,
)

# Legacy hashes from werkzeug pbkdf2 / passlib pbkdf2 (migration on login)
_legacy_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def validate_password_strength(password: str) -> Tuple[bool, str]:
    if not password:
        return False, "Password is required."
    if len(password) < MIN_PASSWORD_LENGTH:
        return False, f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
    if len(password) > MAX_PASSWORD_LENGTH:
        return False, f"Password must be at most {MAX_PASSWORD_LENGTH} characters."
    if not re.search(r"[a-z]", password):
        return False, "Password must include a lowercase letter."
    if not re.search(r"[A-Z]", password):
        return False, "Password must include an uppercase letter."
    if not re.search(r"\d", password):
        return False, "Password must include a number."
    return True, ""


def is_password_breached(password: str, *, timeout: float = 3.0) -> bool:
    """Check HaveIBeenPwned via k-anonymity (SHA-1 prefix only sent over the wire)."""
    if not password:
        return False
    try:
        import urllib.error
        import urllib.request

        sha1 = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
        prefix, suffix = sha1[:5], sha1[5:]
        url = f"https://api.pwnedpasswords.com/range/{prefix}"
        req = urllib.request.Request(url, headers={"User-Agent": "Talaria-Security-Check"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
        for line in body.splitlines():
            part, _, count = line.partition(":")
            if part.strip().upper() == suffix:
                return int(count or 0) > 0
        return False
    except Exception as exc:
        logger.warning("HIBP check skipped: %s", exc)
        return False


def hash_password(password: str) -> str:
    ok, msg = validate_password_strength(password)
    if not ok:
        raise ValueError(msg)
    if is_password_breached(password):
        raise ValueError(
            "This password has appeared in a known data breach. Please choose a different password."
        )
    return _pwd_ctx.hash(password)


def verify_password(stored_hash: str, password: str) -> bool:
    if not stored_hash or not password:
        return False
    try:
        if _pwd_ctx.verify(password, stored_hash):
            return True
    except (ValueError, TypeError):
        pass
    try:
        if _legacy_ctx.verify(password, stored_hash):
            return True
    except (ValueError, TypeError):
        pass
    # werkzeug pbkdf2:sha256
    try:
        from werkzeug.security import check_password_hash

        if check_password_hash(stored_hash, password):
            return True
    except (ValueError, TypeError):
        pass
    return False


def needs_rehash(stored_hash: str) -> bool:
    """True if hash should be upgraded to bcrypt on next successful login."""
    try:
        return not stored_hash.startswith("$2") or _pwd_ctx.needs_update(stored_hash)
    except Exception:
        return True
