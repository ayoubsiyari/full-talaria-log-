# routes/journal/live_accounts.py
"""Persisted live journal accounts (personal / prop) for manual trade journals."""

import secrets
from datetime import datetime
from decimal import Decimal, InvalidOperation

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
_VALID_CURRENCIES = frozenset({"USD", "EUR", "GBP", "AUD", "CAD", "CHF", "JPY"})
_VALID_MARKETS = frozenset({"Forex", "Futures", "Stocks", "Crypto", "Indices"})


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


def _parse_balance(raw) -> Decimal | None:
    if raw is None or raw == "":
        return None
    try:
        value = Decimal(str(raw))
    except (InvalidOperation, ValueError, TypeError):
        return None
    if value <= 0:
        return None
    return value.quantize(Decimal("0.01"))


def _serialize_live_account(row: LiveJournalAccount, *, trade_count: int | None = None) -> dict:
    if trade_count is None:
        from models import JournalEntry

        trade_count = (
            JournalEntry.query.filter_by(user_id=row.user_id, profile_id=row.profile_id).count()
        )
    starting_balance = None
    if row.starting_balance is not None:
        try:
            starting_balance = float(row.starting_balance)
        except (TypeError, ValueError):
            starting_balance = None
    return {
        "id": row.id,
        "profile_id": row.profile_id,
        "name": row.name,
        "account_number": row.account_number,
        "platform": row.platform,
        "market": row.market,
        "account_type": row.account_type,
        "account_subtype": row.account_subtype,
        "starting_balance": starting_balance,
        "currency": row.currency or "USD",
        "prop_firm": row.prop_firm,
        "notes": row.notes,
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


def _generate_account_number(user_id: int) -> str:
    return f"LJ-{user_id}-{secrets.token_hex(4).upper()}"


def _profile_description(payload: dict) -> str:
    parts = ["Manual"]
    if payload["account_type"] == "prop" and payload.get("prop_firm"):
        parts.append(payload["prop_firm"])
    parts.append(payload["market"])
    if payload.get("starting_balance") is not None:
        parts.append(f"{payload['currency']} {payload['starting_balance']}")
    return " · ".join(parts)


def _normalize_payload(data: dict, *, existing: LiveJournalAccount | None = None) -> tuple[dict | None, tuple | None]:
    if not isinstance(data, dict):
        return None, (jsonify({"success": False, "error": "Invalid JSON body"}), 400)

    name = str(data.get("name") or "").strip()
    if not name:
        return None, (jsonify({"success": False, "error": "Journal name is required"}), 400)

    account_type = str(data.get("account_type") or (existing.account_type if existing else "personal")).strip().lower()
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

    starting_balance = _parse_balance(data.get("starting_balance"))
    if starting_balance is None:
        return None, (jsonify({"success": False, "error": "Starting balance is required and must be greater than zero"}), 400)

    currency = str(data.get("currency") or "USD").strip().upper()
    if currency not in _VALID_CURRENCIES:
        currency = "USD"

    market = str(data.get("market") or "Forex").strip()
    if market not in _VALID_MARKETS:
        market = "Forex"

    prop_firm = str(data.get("prop_firm") or "").strip()[:80] or None
    if account_type == "prop" and not prop_firm:
        return None, (jsonify({"success": False, "error": "Prop firm is required"}), 400)

    notes = str(data.get("notes") or "").strip()[:2000] or None
    platform = "Manual"

    account_number = str(data.get("account_number") or "").strip()
    if not account_number:
        account_number = existing.account_number if existing else ""

    return {
        "name": name[:120],
        "account_number": account_number[:64] if account_number else "",
        "platform": platform,
        "market": market[:40],
        "account_type": account_type,
        "account_subtype": account_subtype,
        "starting_balance": starting_balance,
        "currency": currency[:8],
        "prop_firm": prop_firm,
        "notes": notes,
    }, None


def _name_conflict(user_id: int, name: str, *, exclude_profile_id: int | None = None) -> bool:
    q = Profile.query.filter_by(user_id=user_id, name=name)
    if exclude_profile_id is not None:
        q = q.filter(Profile.id != exclude_profile_id)
    return q.first() is not None


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


@journal_bp.route("/live-accounts/<int:account_id>", methods=["GET"])
@jwt_required()
def get_live_journal_account(account_id: int):
    user, err = _require_journal_user()
    if err:
        return err

    row = LiveJournalAccount.query.filter_by(id=account_id, user_id=user.id, status="active").first()
    if not row:
        return jsonify({"success": False, "error": "Live journal account not found"}), 404
    return jsonify({"success": True, "account": _serialize_live_account(row)}), 200


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
    if _name_conflict(user.id, profile_name):
        return jsonify({"success": False, "error": "A journal with this name already exists"}), 400

    if not payload["account_number"]:
        payload["account_number"] = _generate_account_number(user.id)

    try:
        profile = Profile(
            user_id=user.id,
            name=profile_name,
            mode=profile_mode,
            description=_profile_description(payload),
            is_active=False,
            initial_balance=payload["starting_balance"],
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
            starting_balance=payload["starting_balance"],
            currency=payload["currency"],
            prop_firm=payload["prop_firm"],
            notes=payload["notes"],
            status="active",
        )
        db.session.add(row)
        _activate_profile(user.id, profile.id)
        db.session.commit()
        return jsonify({"success": True, "account": _serialize_live_account(row, trade_count=0)}), 201
    except Exception as exc:
        db.session.rollback()
        return jsonify({"success": False, "error": str(exc)}), 500


@journal_bp.route("/live-accounts/<int:account_id>", methods=["PATCH"])
@jwt_required()
def update_live_journal_account(account_id: int):
    user, err = _require_journal_user()
    if err:
        return err

    row = LiveJournalAccount.query.filter_by(id=account_id, user_id=user.id, status="active").first()
    if not row:
        return jsonify({"success": False, "error": "Live journal account not found"}), 404

    payload, err = _normalize_payload(request.get_json(silent=True) or {}, existing=row)
    if err:
        return err

    if payload["account_type"] != row.account_type:
        return jsonify({"success": False, "error": "Account type cannot be changed"}), 400

    profile = Profile.query.filter_by(id=row.profile_id, user_id=user.id).first()
    if not profile:
        return jsonify({"success": False, "error": "Linked journal profile not found"}), 404

    if _name_conflict(user.id, payload["name"], exclude_profile_id=profile.id):
        return jsonify({"success": False, "error": "A journal with this name already exists"}), 400

    try:
        profile.name = payload["name"]
        profile.mode = "journal_live" if payload["account_type"] == "prop" else "journal"
        profile.description = _profile_description(payload)
        profile.initial_balance = payload["starting_balance"]
        profile.updated_at = datetime.utcnow()

        row.name = payload["name"]
        row.platform = payload["platform"]
        row.market = payload["market"]
        row.account_subtype = payload["account_subtype"]
        row.starting_balance = payload["starting_balance"]
        row.currency = payload["currency"]
        row.prop_firm = payload["prop_firm"]
        row.notes = payload["notes"]
        row.updated_at = datetime.utcnow()

        db.session.commit()
        return jsonify({"success": True, "account": _serialize_live_account(row)}), 200
    except Exception as exc:
        db.session.rollback()
        return jsonify({"success": False, "error": str(exc)}), 500


@journal_bp.route("/live-accounts/<int:account_id>", methods=["DELETE"])
@jwt_required()
def delete_live_journal_account(account_id: int):
    user, err = _require_journal_user()
    if err:
        return err

    row = LiveJournalAccount.query.filter_by(id=account_id, user_id=user.id, status="active").first()
    if not row:
        return jsonify({"success": False, "error": "Live journal account not found"}), 404

    try:
        row.status = "archived"
        row.updated_at = datetime.utcnow()
        profile = Profile.query.filter_by(id=row.profile_id, user_id=user.id).first()
        if profile and profile.is_active:
            profile.is_active = False
            profile.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify({"success": True}), 200
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
