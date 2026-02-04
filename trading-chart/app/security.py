from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

from passlib.context import CryptContext

from .settings import settings


_pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _pwd.verify(password, password_hash)


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode((s + pad).encode("utf-8"))


def create_session_token(user_id: int) -> str:
    payload = {"uid": user_id, "exp": int(time.time()) + int(settings.session_ttl_seconds)}
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = hmac.new(settings.secret_key.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    return payload_b64 + "." + _b64url_encode(sig)


def verify_session_token(token: str) -> int | None:
    if not token or "." not in token:
        return None
    payload_b64, sig_b64 = token.split(".", 1)
    expected = hmac.new(settings.secret_key.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    try:
        provided = _b64url_decode(sig_b64)
    except Exception:
        return None
    if not hmac.compare_digest(expected, provided):
        return None
    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    exp = payload.get("exp")
    uid = payload.get("uid")
    if not isinstance(exp, int) or not isinstance(uid, int):
        return None
    if exp < int(time.time()):
        return None
    return uid


def jsonable(obj: Any) -> Any:
    try:
        json.dumps(obj)
        return obj
    except Exception:
        return str(obj)
