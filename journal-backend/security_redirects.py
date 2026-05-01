"""
Stripe checkout/portal redirect URL validation (open-redirect mitigation).

Only URLs whose origin matches FRONTEND_URL, CORS_ORIGINS, optional
STRIPE_REDIRECT_ALLOWED_ORIGINS, and (in production) known deploy hosts are accepted.
"""
from __future__ import annotations

import os
from typing import List, Optional
from urllib.parse import urlparse

_LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "[::1]"})

# Kept in sync with journal-backend/app.py production CORS extras
_PRODUCTION_DEPLOY_ORIGINS = [
    "http://31.97.192.82",
    "https://31.97.192.82",
    "http://31.97.192.82:3000",
    "https://31.97.192.82:3000",
    "http://talaria-log.com",
    "https://talaria-log.com",
    "http://www.talaria-log.com",
    "https://www.talaria-log.com",
]

_DEV_FALLBACK_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]


def _host_without_port(netloc: str) -> str:
    host = netloc.split("@")[-1]
    if host.startswith("["):
        return host.lower()
    if ":" in host:
        return host.rsplit(":", 1)[0].lower()
    return host.lower()


def _is_local_netloc(netloc: str) -> bool:
    h = _host_without_port(netloc)
    return h in _LOCAL_HOSTS or h.startswith("127.")


def normalize_origin(url_or_origin: str) -> Optional[str]:
    if not url_or_origin or not isinstance(url_or_origin, str):
        return None
    s = url_or_origin.strip()
    if not s:
        return None
    if "://" not in s:
        s = "https://" + s
    p = urlparse(s)
    if p.scheme not in ("http", "https") or not p.netloc:
        return None
    return f"{p.scheme.lower()}://{p.netloc.lower()}"


def collect_stripe_redirect_origins(app) -> List[str]:
    raw: List[str] = []
    fu = os.environ.get("FRONTEND_URL") or app.config.get("FRONTEND_URL")
    if fu:
        raw.append(fu)
    extra = os.environ.get("STRIPE_REDIRECT_ALLOWED_ORIGINS", "")
    if extra:
        raw.extend([x.strip() for x in extra.split(",") if x.strip()])
    for o in app.config.get("CORS_ORIGINS") or []:
        if o and o != "*":
            raw.append(o)
    if app.config.get("ENV") == "production":
        raw.extend(_PRODUCTION_DEPLOY_ORIGINS)
    else:
        raw.extend(_DEV_FALLBACK_ORIGINS)
    seen = set()
    out: List[str] = []
    for r in raw:
        n = normalize_origin(r)
        if n and n not in seen:
            seen.add(n)
            out.append(n)
    return out


def _https_required_for_redirects(app) -> bool:
    """In production, require https for Stripe redirects unless explicitly disabled (HTTP staging)."""
    if app.config.get("ENV") != "production":
        return False
    v = os.environ.get("STRIPE_REDIRECT_REQUIRE_HTTPS", "true").strip().lower()
    return v not in ("0", "false", "no", "off")


def is_allowed_stripe_redirect_url(url: str, app) -> bool:
    if not url or not isinstance(url, str):
        return False
    url = url.strip()
    if not url:
        return False
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.netloc:
        return False

    candidate_origin = f"{p.scheme.lower()}://{p.netloc.lower()}"
    origins = collect_stripe_redirect_origins(app)
    if candidate_origin not in origins:
        return False

    if _https_required_for_redirects(app):
        if p.scheme != "https" and not _is_local_netloc(p.netloc):
            return False

    return True


def append_checkout_session_placeholder(success_url: str) -> str:
    """Stripe expects session_id={CHECKOUT_SESSION_ID}; preserve existing query strings."""
    sep = "&" if "?" in success_url else "?"
    return f"{success_url}{sep}session_id={{CHECKOUT_SESSION_ID}}"
