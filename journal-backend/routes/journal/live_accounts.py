# routes/journal/live_accounts.py
"""Persisted live journal accounts (personal / prop) for Source modal creation."""

from datetime import datetime

from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func

from models import LiveJournalAccount, Profile, User, db
from subscription_access import user_entitles_journal

from . import journal_bp

_VALID_ACCOUNT_TYPES = frozenset({"personal", "prop"})
_VALID_SUBTYPES = frozenset({"Live", "Challenge", "Funded", "Demo"})
_PERSONAL_SUBTYPES = frozenset({"Live"})
_PROP_SUBTYPES = frozenset({"Challenge", "Funded", "Demo"})


def _require_journal_user():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return None, (jsonify({"success": False, "error": "User not found"}), 404)
    if not user_entitles_journal(user):
        return None, (
            jsonify({"success": False, "error": "Journal access required to manage live accounts"}),
            403,
        )
    return user, None


def _serialize_live_account(row: LiveJournalAccount, *, trade_count: int | None = None) -> dict:
    if trade_count is None:
        from models import JournalEntry

        trade_count = (
            JournalEntry.query.filter_by(user_id=row.user_id, profile_id=row.profile_id).count()
        )
    return {
        "id": row.id,
        "profile_id": row.profile_id,
        "name": row.name,
        "account_number": row.account_number,
        "platform": row.platform,
        "market": row.market,
        "account_type": row.account_type,
        "account_subtype": row.account_subtype,
        "status": row.status,
        "trade_count": int(trade_count or 0),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _activate_profile(user_id: int, profile_id: int) -> None:
    Profile.query.filter_by(user_id=user_id).update({"is_active": False})
    profile = Profile.query.filter_by(id=profile_id, user_id=user_id).first()
    if profile:
        profile.is_active = True
        profile.updated_at = datetime.utcnow()


def _normalize_payload(data: dict) -> tuple[dict | None, tuple | None]:
    if not isinstance(data, dict):
        return None, (jsonify({"success": False, "error": "Invalid JSON body"}), 400)

    name = str(data.get("name") or "").strip()
    account_number = str(data.get("account_number") or data.get("account") or "").strip()
    if not name:
        return None, (jsonify({"success": False, "error": "Account name is required"}), 400)
    if not account_number:
        return None, (jsonify({"success": False, "error": "Account number is required"}), 400)

    account_type = str(data.get("account_type") or "personal").strip().lower()
    if account_type not in _VALID_ACCOUNT_TYPES:
        return None, (jsonify({"success": False, "error": "Invalid account_type"}), 400)

    account_subtype = str(data.get("account_subtype") or data.get("accountType") or "").strip()
    if not account_subtype:
        account_subtype = "Live" if account_type == "personal" else "Challenge"
    if account_type == "personal" and account_subtype not in _PERSONAL_SUBTYPES:
        account_subtype = "Live"
    if account_type == "prop" and account_subtype not in _PROP_SUBTYPES:
        account_subtype = "Challenge"
    if account_subtype not in _VALID_SUBTYPES:
        return None, (jsonify({"success": False, "error": "Invalid account_subtype"}), 400)

    platform = str(data.get("platform") or "MetaTrader 5").strip()[:80] or "MetaTrader 5"
    market = str(data.get("market") or "Forex").strip()[:40] or "Forex"

    return {
        "name": name[:120],
        "account_number": account_number[:64],
        "platform": platform,
        "market": market,
        "account_type": account_type,
        "account_subtype": account_subtype,
    }, None


@journal_bp.route("/live-accounts", methods=["GET"])
@jwt_required()
def list_live_journal_accounts():
    user, err = _require_journal_user()
    if err:
        return err

    rows = (
        LiveJournalAccount.query.filter_by(user_id=user.id, status="active")
        .order_by(LiveJournalAccount.created_at.desc())
        .all()
    )
    from models import JournalEntry

    counts = dict(
        db.session.query(JournalEntry.profile_id, func.count(JournalEntry.id))
        .filter(JournalEntry.user_id == user.id)
        .group_by(JournalEntry.profile_id)
        .all()
    )
    return jsonify(
        {
            "success": True,
            "accounts": [_serialize_live_account(r, trade_count=counts.get(r.profile_id, 0)) for r in rows],
        }
    ), 200


@journal_bp.route("/live-accounts", methods=["POST"])
@jwt_required()
def create_live_journal_account():
    user, err = _require_journal_user()
    if err:
        return err

    payload, err = _normalize_payload(request.get_json(silent=True) or {})
    if err:
        return err

    profile_mode = "journal_live" if payload["account_type"] == "prop" else "journal"
    profile_name = payload["name"]
    existing_profile = Profile.query.filter_by(user_id=user.id, name=profile_name).first()
    if existing_profile:
        return jsonify({"success": False, "error": "A profile with this name already exists"}), 400

    dup_account = LiveJournalAccount.query.filter_by(
        user_id=user.id, account_number=payload["account_number"]
    ).first()
    if dup_account:
        return jsonify({"success": False, "error": "Account number already exists"}), 400

    try:
        profile = Profile(
            user_id=user.id,
            name=profile_name,
            mode=profile_mode,
            description=f"{payload['platform']} · {payload['market']} · {payload['account_number']}",
            is_active=False,
        )
        db.session.add(profile)
        db.session.flush()

        row = LiveJournalAccount(
            user_id=user.id,
            profile_id=profile.id,
            name=payload["name"],
            account_number=payload["account_number"],
            platform=payload["platform"],
            market=payload["market"],
            account_type=payload["account_type"],
            account_subtype=payload["account_subtype"],
            status="active",
        )
        db.session.add(row)
        _activate_profile(user.id, profile.id)
        db.session.commit()
        return jsonify({"success": True, "account": _serialize_live_account(row, trade_count=0)}), 201
    except Exception as exc:
        db.session.rollback()
        return jsonify({"success": False, "error": str(exc)}), 500


@journal_bp.route("/live-accounts/<int:account_id>/activate", methods=["POST"])
@jwt_required()
def activate_live_journal_account(account_id: int):
    user, err = _require_journal_user()
    if err:
        return err

    row = LiveJournalAccount.query.filter_by(id=account_id, user_id=user.id, status="active").first()
    if not row:
        return jsonify({"success": False, "error": "Live journal account not found"}), 404

    try:
        _activate_profile(user.id, row.profile_id)
        db.session.commit()
        return jsonify(
            {
                "success": True,
                "profile_id": row.profile_id,
                "account": _serialize_live_account(row),
            }
        ), 200
    except Exception as exc:
        db.session.rollback()
        return jsonify({"success": False, "error": str(exc)}), 500
