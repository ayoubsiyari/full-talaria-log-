# journal-backend/dashboard/routes.py
"""
Dashboard v2 endpoints — scalable replacements for the dashboard's data needs.

ADDITIVE: these live under a separate blueprint (`/api/journal/dashboard` once registered)
and do NOT replace or modify the existing /api/journal/* endpoints. Enable via README.md.

What's different from the legacy analytics.py:
  - /stats        → computed in ONE SQL pass (no load-all + Python loop), Redis-cached.
  - /by-strategy  → SQL GROUP BY strategy.
  - /by-symbol    → SQL GROUP BY symbol.
  - /trades       → PAGINATED (limit/offset + total) so the client never downloads everything.

Access control is reused unchanged: @jwt_required + build_group_aware_query (user/profile/group
scoping). When registered, the paid-journal guard wraps the whole blueprint.
"""

from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import JournalEntry
from routes.journal.filters import (
    get_active_profile_id,
    apply_standard_filters,
    build_group_aware_query,
    serialize_entry,
)

from . import dashboard_bp
from . import cache
from .queries import aggregate_basic_stats, aggregate_grouped, paginate_trades


def _scoped_query(user_id, profile_id):
    """Reuse the exact access-control + standard filters the legacy endpoints use."""
    query = build_group_aware_query(user_id, profile_id)
    return apply_standard_filters(query)


def _cache_params():
    """Filter inputs that affect the result — part of the cache key."""
    keys = ("start", "end", "symbol", "strategy", "direction", "outcome")
    return {k: request.args.get(k) for k in keys if request.args.get(k) is not None}


@dashboard_bp.route("/stats", methods=["GET"])
@jwt_required()
def stats():
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)

        key = cache.make_key(user_id, profile_id, "stats", _cache_params())
        cached = cache.get_json(key)
        if cached is not None:
            return jsonify(cached), 200

        data = aggregate_basic_stats(_scoped_query(user_id, profile_id))
        cache.set_json(key, data)
        return jsonify(data), 200
    except Exception as e:
        print(" dashboard.stats error:", e)
        return jsonify({"error": str(e)}), 500


@dashboard_bp.route("/by-strategy", methods=["GET"])
@jwt_required()
def by_strategy():
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)

        key = cache.make_key(user_id, profile_id, "by_strategy", _cache_params())
        cached = cache.get_json(key)
        if cached is not None:
            return jsonify(cached), 200

        data = aggregate_grouped(_scoped_query(user_id, profile_id), JournalEntry.strategy)
        cache.set_json(key, data)
        return jsonify(data), 200
    except Exception as e:
        print(" dashboard.by_strategy error:", e)
        return jsonify({"error": str(e)}), 500


@dashboard_bp.route("/by-symbol", methods=["GET"])
@jwt_required()
def by_symbol():
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)

        key = cache.make_key(user_id, profile_id, "by_symbol", _cache_params())
        cached = cache.get_json(key)
        if cached is not None:
            return jsonify(cached), 200

        data = aggregate_grouped(_scoped_query(user_id, profile_id), JournalEntry.symbol)
        cache.set_json(key, data)
        return jsonify(data), 200
    except Exception as e:
        print(" dashboard.by_symbol error:", e)
        return jsonify({"error": str(e)}), 500


@dashboard_bp.route("/trades", methods=["GET"])
@jwt_required()
def trades():
    """Paginated trade list. Query params: limit (<=500), offset."""
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)

        page, total, limit, offset = paginate_trades(
            _scoped_query(user_id, profile_id),
            limit=request.args.get("limit", 100),
            offset=request.args.get("offset", 0),
        )
        items = [serialize_entry(e) for e in page]
        return (
            jsonify(
                {
                    "items": items,
                    "total": total,
                    "limit": limit,
                    "offset": offset,
                    "next_offset": offset + limit if (offset + limit) < total else None,
                }
            ),
            200,
        )
    except Exception as e:
        print(" dashboard.trades error:", e)
        return jsonify({"error": str(e)}), 500
