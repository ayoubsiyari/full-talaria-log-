"""HTTP security headers per spec §2.3."""

from __future__ import annotations

import secrets
from typing import Mapping, MutableMapping

HSTS_VALUE = "max-age=31536000; includeSubDomains; preload"
REFERRER_POLICY = "strict-origin-when-cross-origin"
PERMISSIONS_POLICY = "geolocation=(), camera=(), microphone=(), payment=()"
COOP = "same-origin"
COEP = "require-corp"
CORP = "same-origin"

_STRIP_HEADERS = frozenset(
    {
        "server",
        "x-powered-by",
        "x-aspnet-version",
        "x-aspnetmvc-version",
    }
)


def generate_csp_nonce() -> str:
    return secrets.token_urlsafe(16)


def build_csp(nonce: str, *, api_mode: bool = False) -> str:
    """Build Content-Security-Policy with per-request nonce (no unsafe-inline/eval)."""
    if api_mode:
        return "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    script = f"'self' 'nonce-{nonce}'"
    style = f"'self' 'nonce-{nonce}'"
    return (
        f"default-src 'self'; "
        f"script-src {script}; "
        f"style-src {style}; "
        f"img-src 'self' data: https:; "
        f"font-src 'self'; "
        f"connect-src 'self'; "
        f"frame-ancestors 'none'; "
        f"upgrade-insecure-requests; "
        f"base-uri 'self'"
    )


def apply_security_headers(
    headers: MutableMapping[str, str],
    *,
    nonce: str | None = None,
    https: bool = False,
    api_mode: bool = False,
) -> None:
    """Apply enterprise security headers to a response header mapping."""
    csp_nonce = nonce or generate_csp_nonce()
    headers["Content-Security-Policy"] = build_csp(csp_nonce, api_mode=api_mode)
    headers["X-Content-Type-Options"] = "nosniff"
    headers["X-Frame-Options"] = "DENY"
    headers["Referrer-Policy"] = REFERRER_POLICY
    headers["Permissions-Policy"] = PERMISSIONS_POLICY
    headers["Cross-Origin-Opener-Policy"] = COOP
    headers["Cross-Origin-Embedder-Policy"] = COEP
    headers["Cross-Origin-Resource-Policy"] = CORP
    if https:
        headers["Strict-Transport-Security"] = HSTS_VALUE


def strip_disclosure_headers(headers: Mapping[str, str]) -> dict[str, str]:
    """Return headers with server fingerprint headers removed."""
    return {k: v for k, v in headers.items() if k.lower() not in _STRIP_HEADERS}
