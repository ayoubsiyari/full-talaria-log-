# journal-backend/dashboard/__init__.py
"""
Dashboard metrics backend (additive, scalable).

Defines `dashboard_bp` but does NOT register it — wiring is opt-in (see README.md).
Importing this package has no effect on the running app until the blueprint is
registered in routes/blueprint_setup.py.
"""

from flask import Blueprint

dashboard_bp = Blueprint("dashboard", __name__)

from . import routes  # noqa: E402, F401
