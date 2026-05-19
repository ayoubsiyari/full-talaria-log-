"""Load dashboard analytics Python backend before chart API imports analytics modules."""
from __future__ import annotations

import sys
from pathlib import Path

_CHART_DIR = Path(__file__).resolve().parent


def _dev_backend_from_repo() -> Path | None:
    """Local dev: homepage/.../backend when chart lives under repo root."""
    rel = Path("homepage") / "src" / "app" / "dashboard" / "analytics" / "backend"
    for base in (_CHART_DIR, *_CHART_DIR.parents):
        candidate = base / rel
        if (candidate / "analytics_core").is_dir():
            return candidate
    return None


def _backend_candidates() -> list[Path]:
    out: list[Path] = [
        _CHART_DIR / "analytics_backend",
        Path("/app/analytics_backend"),
    ]
    dev = _dev_backend_from_repo()
    if dev is not None:
        out.append(dev)
    return out


def install() -> Path:
    for target in _backend_candidates():
        if target.is_dir() and (target / "analytics_core").is_dir():
            entry = str(target)
            if entry not in sys.path:
                sys.path.insert(0, entry)
            return target
    tried = ", ".join(str(p) for p in _backend_candidates())
    raise RuntimeError(f"analytics dashboard backend not found (tried: {tried})")
