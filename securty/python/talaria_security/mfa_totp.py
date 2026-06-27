"""TOTP MFA per spec §4.1."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import struct
import time
from typing import List

from talaria_security.constants import MFA_BACKUP_CODE_COUNT, MFA_TOTP_ISSUER


def generate_totp_secret() -> str:
    """Return base32 secret suitable for authenticator apps."""
    raw = secrets.token_bytes(20)
    return base64.b32encode(raw).decode("ascii").rstrip("=")


def _hotp(secret_b32: str, counter: int, digits: int = 6) -> str:
    pad = (8 - len(secret_b32) % 8) % 8
    key = base64.b32decode(secret_b32.upper() + "=" * pad)
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(code % (10**digits)).zfill(digits)


def verify_totp(secret_b32: str, code: str, *, window: int = 1) -> bool:
    if not secret_b32 or not code or not code.isdigit() or len(code) != 6:
        return False
    now = int(time.time()) // 30
    for offset in range(-window, window + 1):
        if hmac.compare_digest(_hotp(secret_b32, now + offset), code):
            return True
    return False


def provisioning_uri(secret_b32: str, email: str, *, issuer: str = MFA_TOTP_ISSUER) -> str:
    from urllib.parse import quote

    label = quote(f"{issuer}:{email}")
    params = f"secret={secret_b32}&issuer={quote(issuer)}&algorithm=SHA1&digits=6&period=30"
    return f"otpauth://totp/{label}?{params}"


def generate_backup_codes(count: int = MFA_BACKUP_CODE_COUNT) -> List[str]:
    return [secrets.token_hex(4).upper() for _ in range(count)]


def hash_backup_codes(codes: List[str]) -> str:
    """Store hashed backup codes as JSON list of sha256 hex digests."""
    digests = [hashlib.sha256(c.encode("utf-8")).hexdigest() for c in codes]
    return json.dumps(digests)


def verify_backup_code(stored_json: str, code: str) -> tuple[bool, str]:
    """Verify a backup code; returns (ok, updated_stored_json with used code removed)."""
    if not stored_json or not code:
        return False, stored_json or "[]"
    try:
        digests: List[str] = json.loads(stored_json)
    except json.JSONDecodeError:
        return False, stored_json
    candidate = hashlib.sha256(code.strip().upper().encode("utf-8")).hexdigest()
    if candidate not in digests:
        return False, stored_json
    digests.remove(candidate)
    return True, json.dumps(digests)
