"""Ensure talaria_security package is importable from journal-backend and chart API."""

import sys
from pathlib import Path


def install_security_package() -> None:
    """Add securty/python to sys.path if talaria_security is not yet installed."""
    if "talaria_security" in sys.modules:
        try:
            import talaria_security  # noqa: F401
            return
        except ImportError:
            pass
    root = Path(__file__).resolve().parent
    candidates = [
        root.parent / "securty" / "python",
        Path("/opt/talaria_security_lib"),
        Path("/app/securty_python"),
    ]
    for parent in candidates:
        if (parent / "talaria_security" / "__init__.py").is_file():
            parent_str = str(parent)
            if parent_str not in sys.path:
                sys.path.insert(0, parent_str)
            return
