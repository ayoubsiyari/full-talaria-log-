"""Pytest: load analytics dashboard backend before chart tests import analytics_core."""
from __future__ import annotations

import _analytics_bootstrap

_analytics_bootstrap.install()
