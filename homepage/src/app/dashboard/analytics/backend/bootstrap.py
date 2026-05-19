"""Register dashboard analytics backend on sys.path (dev + Docker)."""
from __future__ import annotations

import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent
_DOCKER_BACKEND = Path("/app/analytics_backend")


def install() -> Path:
    """Insert analytics backend directory at front of sys.path. Idempotent."""
    target = _DOCKER_BACKEND if _DOCKER_BACKEND.is_dir() else _BACKEND
    entry = str(target)
    if entry not in sys.path:
        sys.path.insert(0, entry)
    return target
