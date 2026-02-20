# routes/journal/__init__.py
"""
Journal routes package - Split from the monolithic journal_routes.py

Modules:
- trades: CRUD operations for journal entries
- filters: Common filtering logic
- analytics: Stats and performance metrics
- import_export: Excel/CSV import and export
- exit_analysis: Trade exit analysis
- advanced: Advanced analytics (streaks, equity, combinations)
"""

from flask import Blueprint

# Create the main journal blueprint
journal_bp = Blueprint('journal', __name__)

# Import route modules to register them with the blueprint
from . import trades
from . import filters
from . import analytics
from . import import_export
from . import exit_analysis
from . import advanced
