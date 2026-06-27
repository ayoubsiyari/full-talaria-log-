"""SSRF prevention per spec §3.5."""

from __future__ import annotations

import ipaddress
import socket
from typing import Iterable
from urllib.parse import urlparse

_PRIVATE_NETWORKS: tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...] = (
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
)


def is_private_ip(ip_str: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip_str.strip())
    except ValueError:
        return True
    if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
        return True
    for net in _PRIVATE_NETWORKS:
        if addr in net:
            return True
    return False


def assert_safe_url(
    url: str,
    *,
    allowed_schemes: Iterable[str] = ("https", "http"),
    allowed_hosts: Iterable[str] | None = None,
    resolve_dns: bool = True,
) -> None:
    """Raise ValueError if URL is unsafe for server-side fetch."""
    parsed = urlparse(url.strip())
    scheme = (parsed.scheme or "").lower()
    if scheme not in {s.lower() for s in allowed_schemes}:
        raise ValueError(f"URL scheme not allowed: {scheme or '(none)'}")
    host = (parsed.hostname or "").lower()
    if not host:
        raise ValueError("URL host is required")
    if host in ("localhost", "metadata.google.internal"):
        raise ValueError("URL host not allowed")
    if allowed_hosts is not None:
        allowed = {h.lower() for h in allowed_hosts}
        if host not in allowed:
            raise ValueError(f"URL host not in allowlist: {host}")
    if resolve_dns:
        try:
            for info in socket.getaddrinfo(host, None):
                ip = info[4][0]
                if is_private_ip(ip):
                    raise ValueError(f"URL resolves to private/reserved IP: {ip}")
        except socket.gaierror as exc:
            raise ValueError(f"Cannot resolve URL host: {host}") from exc
