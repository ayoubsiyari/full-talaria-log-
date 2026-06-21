# routes/journal/__init__.py
"""Journal API routes (access enforced via register_paid_journal_guard in blueprint_setup)."""

from flask import Blueprint

journal_bp = Blueprint("journal", __name__)

from . import advanced  # noqa: E402, F401
from . import analytics  # noqa: E402, F401
from . import brokers  # noqa: E402, F401
from . import exit_analysis  # noqa: E402, F401
from . import filters  # noqa: E402, F401
from . import import_export  # noqa: E402, F401
from . import live_accounts  # noqa: E402, F401
from . import trades  # noqa: E402, F401
