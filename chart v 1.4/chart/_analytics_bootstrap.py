"""Load dashboard analytics Python backend before chart API imports analytics modules."""
from __future__ import annotations

import sys
from pathlib import Path

_CHART_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _CHART_DIR.parents[1]


def _backend_candidates() -> list[Path]:
    return [
        _CHART_DIR / "analytics_backend",
        Path("/app/analytics_backend"),
        _REPO_ROOT
        / "homepage"
        / "src"
        / "app"
        / "dashboard"
        / "analytics"
        / "backend",
    ]


def install() -> Path:
    for target in _backend_candidates():
        if target.is_dir() and (target / "analytics_core").is_dir():
            entry = str(target)
            if entry not in sys.path:
                sys.path.insert(0, entry)
            return target
    tried = ", ".join(str(p) for p in _backend_candidates())
    raise RuntimeError(f"analytics dashboard backend not found (tried: {tried})")
