"""Load `homepage/src/app/dashboard/analytics/backend` before analytics imports."""
from __future__ import annotations

import sys
from pathlib import Path

_REPO_BACKEND = (
    Path(__file__).resolve().parents[2]
    / "homepage"
    / "src"
    / "app"
    / "dashboard"
    / "analytics"
    / "backend"
)
_DOCKER_BACKEND = Path("/app/analytics_backend")


def install() -> Path:
    target = _DOCKER_BACKEND if _DOCKER_BACKEND.is_dir() else _REPO_BACKEND
    if not target.is_dir():
        raise RuntimeError(f"analytics dashboard backend not found: {target}")
    entry = str(target)
    if entry not in sys.path:
        sys.path.insert(0, entry)
    return target
