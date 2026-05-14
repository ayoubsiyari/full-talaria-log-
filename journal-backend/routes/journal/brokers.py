# routes/journal/brokers.py
"""
Broker connection management: connect, list, delete, sync.
Supported auto-sync: Binance Futures, Bybit Linear.
Manual-only (CSV import): MT4/MT5, TradingView, cTrader.
"""

import os
import hmac
import hashlib
import base64
import time
from datetime import datetime, timedelta

import requests as http_req
from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity

from models import db, BrokerConnection, JournalEntry, Profile
from . import journal_bp
from .filters import get_active_profile_id


# ── Simple symmetric encryption (XOR + base64, keyed on SECRET_KEY) ──────────

def _enc_key() -> bytes:
    secret = os.environ.get("SECRET_KEY", "dev-secret-key-please-change-in-production")
    return hashlib.sha256(secret.encode()).digest()[:32]


def _encrypt(text: str) -> str:
    if not text:
        return ""
    key = _enc_key()
    raw = text.encode("utf-8")
    xored = bytes(b ^ key[i % 32] for i, b in enumerate(raw))
    return base64.urlsafe_b64encode(xored).decode()


def _decrypt(token: str) -> str:
    if not token:
        return ""
    try:
        key = _enc_key()
        xored = base64.urlsafe_b64decode(token.encode())
        return bytes(b ^ key[i % 32] for i, b in enumerate(xored)).decode("utf-8")
    except Exception:
        return ""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ts_ms() -> int:
    return int(time.time() * 1000)


def _binance_sign(secret: str, query: str) -> str:
    return hmac.new(secret.encode(), query.encode(), hashlib.sha256).hexdigest()


def _bybit_sign(api_key: str, api_secret: str, ts: str, recv_window: str, payload: str = "") -> str:
    msg = ts + api_key + recv_window + payload
    return hmac.new(api_secret.encode(), msg.encode(), hashlib.sha256).hexdigest()


def _serialize_conn(c: BrokerConnection) -> dict:
    return {
        "id": c.id,
        "broker": c.broker,
        "label": c.label or c.broker.replace("_", " ").title(),
        "status": c.status,
        "last_sync_at": c.last_sync_at.isoformat() if c.last_sync_at else None,
        "last_error": c.last_error,
        "last_trade_count": c.last_trade_count or 0,
        "created_at": c.created_at.isoformat(),
    }


def _get_profile(user_id: int) -> Profile | None:
    return Profile.query.filter_by(user_id=user_id, is_active=True).first() or \
           Profile.query.filter_by(user_id=user_id).first()


# ── Broker API validators ─────────────────────────────────────────────────────

def _validate_binance(api_key: str, api_secret: str) -> bool:
    ts = _ts_ms()
    qs = f"timestamp={ts}"
    sig = _binance_sign(api_secret, qs)
    r = http_req.get(
        "https://api.binance.com/api/v3/account",
        headers={"X-MBX-APIKEY": api_key},
        params={"timestamp": ts, "signature": sig},
        timeout=8,
    )
    r.raise_for_status()
    return True


def _validate_bybit(api_key: str, api_secret: str) -> bool:
    ts = str(_ts_ms())
    rw = "5000"
    sig = _bybit_sign(api_key, api_secret, ts, rw)
    r = http_req.get(
        "https://api.bybit.com/v5/account/wallet-balance",
        headers={"X-BAPI-API-KEY": api_key, "X-BAPI-SIGN": sig,
                 "X-BAPI-TIMESTAMP": ts, "X-BAPI-RECV-WINDOW": rw},
        params={"accountType": "UNIFIED"},
        timeout=8,
    )
    r.raise_for_status()
    return True


def _validate_oanda(api_key: str, account_id: str) -> bool:
    r = http_req.get(
        f"https://api-fxtrade.oanda.com/v3/accounts/{account_id}",
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=8,
    )
    r.raise_for_status()
    return True


VALIDATORS = {
    "binance": lambda k, s, p, cfg: _validate_binance(k, s),
    "bybit":   lambda k, s, p, cfg: _validate_bybit(k, s),
    "oanda":   lambda k, s, p, cfg: _validate_oanda(k, cfg.get("account_id", "")),
}


# ── Sync implementations ──────────────────────────────────────────────────────

def _dedup_exists(user_id: int, ext_id: str) -> bool:
    """Check if a trade with this external broker ID already exists."""
    return JournalEntry.query.filter(
        JournalEntry.user_id == user_id,
        JournalEntry.extra_data.contains({"ext_id": ext_id}),
    ).first() is not None


def _sync_binance(conn: BrokerConnection, profile_id: int, user_id: int) -> int:
    api_key = _decrypt(conn.api_key_enc)
    api_secret = _decrypt(conn.api_secret_enc)
    since = int(((conn.last_sync_at or datetime.utcnow() - timedelta(days=30)).timestamp()) * 1000)
    imported = 0

    # ── Futures REALIZED_PNL income events ────────────────────────────────────
    ts = _ts_ms()
    qs = f"incomeType=REALIZED_PNL&startTime={since}&limit=200&timestamp={ts}"
    sig = _binance_sign(api_secret, qs)
    resp = http_req.get(
        "https://fapi.binance.com/fapi/v1/income",
        headers={"X-MBX-APIKEY": api_key},
        params={"incomeType": "REALIZED_PNL", "startTime": since,
                "limit": 200, "timestamp": ts, "signature": sig},
        timeout=10,
    )
    if resp.ok:
        for item in (resp.json() or []):
            ext_id = f"bnf_{item.get('tranId', item.get('time', ''))}"
            if _dedup_exists(user_id, ext_id):
                continue
            pnl_val = float(item.get("income", 0))
            trade_dt = datetime.utcfromtimestamp(item["time"] / 1000)
            entry = JournalEntry(
                user_id=user_id, profile_id=profile_id,
                symbol=item["symbol"], direction="long",
                entry_price=0.0, exit_price=0.0,
                quantity=1.0, risk_amount=0.0, rr=0.0,
                pnl=pnl_val, instrument_type="crypto",
                strategy="Binance Auto-Sync",
                date=trade_dt, open_time=trade_dt, close_time=trade_dt,
                extra_data={"ext_id": ext_id, "source": "binance_futures"},
            )
            db.session.add(entry)
            imported += 1

    # ── Spot: recent fills via allOrders for top-10 quote assets ─────────────
    SPOT_PAIRS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
                  "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "MATICUSDT"]
    for symbol in SPOT_PAIRS:
        try:
            ts2 = _ts_ms()
            qs2 = f"symbol={symbol}&limit=200&startTime={since}&timestamp={ts2}"
            sig2 = _binance_sign(api_secret, qs2)
            r2 = http_req.get(
                "https://api.binance.com/api/v3/myTrades",
                headers={"X-MBX-APIKEY": api_key},
                params={"symbol": symbol, "limit": 200, "startTime": since,
                        "timestamp": ts2, "signature": sig2},
                timeout=8,
            )
            if not r2.ok:
                continue
            for t in (r2.json() or []):
                ext_id = f"bns_{t['id']}"
                if _dedup_exists(user_id, ext_id):
                    continue
                price = float(t["price"])
                qty = float(t["qty"])
                comm = float(t.get("commission", 0))
                trade_dt = datetime.utcfromtimestamp(t["time"] / 1000)
                direction = "long" if t.get("isBuyer") else "short"
                entry = JournalEntry(
                    user_id=user_id, profile_id=profile_id,
                    symbol=symbol, direction=direction,
                    entry_price=price, exit_price=price,
                    quantity=qty, risk_amount=0.0, rr=0.0,
                    pnl=-comm, commission=comm,
                    instrument_type="crypto",
                    strategy="Binance Spot Auto-Sync",
                    date=trade_dt, open_time=trade_dt, close_time=trade_dt,
                    extra_data={"ext_id": ext_id, "source": "binance_spot"},
                )
                db.session.add(entry)
                imported += 1
        except Exception:
            continue

    db.session.commit()
    return imported


def _sync_bybit(conn: BrokerConnection, profile_id: int, user_id: int) -> int:
    api_key = _decrypt(conn.api_key_enc)
    api_secret = _decrypt(conn.api_secret_enc)
    since = int(((conn.last_sync_at or datetime.utcnow() - timedelta(days=30)).timestamp()) * 1000)
    imported = 0
    rw = "5000"

    # Closed P&L (Linear perpetuals)
    cursor = None
    for _ in range(5):
        ts = str(_ts_ms())
        params: dict = {"category": "linear", "limit": 200, "startTime": since}
        if cursor:
            params["cursor"] = cursor
        qs = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
        sig = _bybit_sign(api_key, api_secret, ts, rw, qs)
        resp = http_req.get(
            "https://api.bybit.com/v5/position/closed-pnl",
            headers={"X-BAPI-API-KEY": api_key, "X-BAPI-SIGN": sig,
                     "X-BAPI-TIMESTAMP": ts, "X-BAPI-RECV-WINDOW": rw},
            params=params, timeout=10,
        )
        if not resp.ok:
            break
        body = resp.json()
        items = (body.get("result") or {}).get("list") or []
        for t in items:
            ext_id = f"bybit_{t.get('orderId', '')}"
            if _dedup_exists(user_id, ext_id):
                continue
            pnl_val = float(t.get("closedPnl", 0))
            entry_p = float(t.get("avgEntryPrice", 0))
            exit_p = float(t.get("avgExitPrice", 0))
            qty = float(t.get("closedSize", 1))
            direction = "long" if t.get("side", "Buy").lower() == "buy" else "short"
            risk = abs(entry_p - exit_p) * qty if entry_p and exit_p else 0
            trade_dt = datetime.utcfromtimestamp(int(t.get("updatedTime", _ts_ms())) / 1000)
            rr_val = 0.0
            je = JournalEntry(
                user_id=user_id, profile_id=profile_id,
                symbol=t.get("symbol", "UNKNOWN"), direction=direction,
                entry_price=entry_p, exit_price=exit_p,
                quantity=qty, risk_amount=risk, rr=rr_val,
                pnl=pnl_val, instrument_type="crypto",
                strategy="Bybit Auto-Sync",
                date=trade_dt, open_time=trade_dt, close_time=trade_dt,
                extra_data={"ext_id": ext_id, "source": "bybit_linear"},
            )
            db.session.add(je)
            imported += 1
        cursor = (body.get("result") or {}).get("nextPageCursor")
        if not cursor or not items:
            break

    db.session.commit()
    return imported


def _sync_oanda(conn: BrokerConnection, profile_id: int, user_id: int) -> int:
    api_key = _decrypt(conn.api_key_enc)
    account_id = (conn.extra_config or {}).get("account_id", "")
    if not account_id:
        raise ValueError("OANDA account_id missing")
    since = (conn.last_sync_at or datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S.000000000Z")
    imported = 0

    resp = http_req.get(
        f"https://api-fxtrade.oanda.com/v3/accounts/{account_id}/trades",
        headers={"Authorization": f"Bearer {api_key}"},
        params={"state": "CLOSED", "count": 200},
        timeout=10,
    )
    resp.raise_for_status()
    for t in (resp.json().get("trades") or []):
        ext_id = f"oanda_{t['id']}"
        if _dedup_exists(user_id, ext_id):
            continue
        pnl_val = float(t.get("realizedPL", 0))
        entry_p = float(t.get("price", 0))
        qty = float(t.get("initialUnits", 1))
        direction = "long" if qty >= 0 else "short"
        close_dt_str = t.get("closeTime", t.get("openTime", ""))
        open_dt_str = t.get("openTime", close_dt_str)
        try:
            close_dt = datetime.fromisoformat(close_dt_str.rstrip("Z"))
            open_dt = datetime.fromisoformat(open_dt_str.rstrip("Z"))
        except ValueError:
            close_dt = open_dt = datetime.utcnow()
        symbol = t.get("instrument", "UNKNOWN").replace("_", "")
        je = JournalEntry(
            user_id=user_id, profile_id=profile_id,
            symbol=symbol, direction=direction,
            entry_price=entry_p, exit_price=entry_p,
            quantity=abs(qty), risk_amount=0.0, rr=0.0,
            pnl=pnl_val, instrument_type="forex",
            strategy="OANDA Auto-Sync",
            date=close_dt, open_time=open_dt, close_time=close_dt,
            extra_data={"ext_id": ext_id, "source": "oanda"},
        )
        db.session.add(je)
        imported += 1

    db.session.commit()
    return imported


SYNCERS = {
    "binance": _sync_binance,
    "bybit":   _sync_bybit,
    "oanda":   _sync_oanda,
}


# ── Routes ────────────────────────────────────────────────────────────────────

@journal_bp.route("/broker/list", methods=["GET"])
def broker_list():
    user_id = int(get_jwt_identity())
    conns = BrokerConnection.query.filter_by(user_id=user_id).order_by(BrokerConnection.created_at.desc()).all()
    return jsonify([_serialize_conn(c) for c in conns]), 200


@journal_bp.route("/broker/connect", methods=["POST"])
def broker_connect():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    broker = str(data.get("broker", "")).lower().strip()
    if not broker:
        return jsonify({"error": "broker is required"}), 400

    api_key = str(data.get("api_key", "")).strip()
    api_secret = str(data.get("api_secret", "")).strip()
    api_passphrase = str(data.get("api_passphrase", "")).strip()
    account_id = str(data.get("account_id", "")).strip()
    label = str(data.get("label", "")).strip() or None

    # Validate credentials if we have a tester
    if broker in VALIDATORS:
        try:
            cfg = {"account_id": account_id}
            VALIDATORS[broker](api_key, api_secret, api_passphrase, cfg)
        except Exception as e:
            return jsonify({"error": f"Connection failed: {str(e)[:200]}"}), 400

    conn = BrokerConnection(
        user_id=user_id,
        broker=broker,
        label=label,
        api_key_enc=_encrypt(api_key) if api_key else None,
        api_secret_enc=_encrypt(api_secret) if api_secret else None,
        api_passphrase_enc=_encrypt(api_passphrase) if api_passphrase else None,
        extra_config={"account_id": account_id} if account_id else {},
        status="active",
    )
    db.session.add(conn)
    db.session.commit()

    # Trigger initial sync if supported
    imported = 0
    if broker in SYNCERS:
        profile = _get_profile(user_id)
        if profile:
            try:
                imported = SYNCERS[broker](conn, profile.id, user_id)
                conn.last_sync_at = datetime.utcnow()
                conn.last_trade_count = imported
                conn.status = "active"
                db.session.commit()
            except Exception as e:
                conn.last_error = str(e)[:500]
                conn.status = "error"
                db.session.commit()

    return jsonify({
        "connection": _serialize_conn(conn),
        "imported": imported,
        "message": f"Connected. Imported {imported} trades." if imported else "Connected.",
    }), 201


@journal_bp.route("/broker/<int:conn_id>", methods=["DELETE"])
def broker_delete(conn_id: int):
    user_id = int(get_jwt_identity())
    conn = BrokerConnection.query.filter_by(id=conn_id, user_id=user_id).first()
    if not conn:
        return jsonify({"error": "Connection not found"}), 404
    db.session.delete(conn)
    db.session.commit()
    return jsonify({"deleted": conn_id}), 200


@journal_bp.route("/broker/<int:conn_id>/sync", methods=["POST"])
def broker_sync(conn_id: int):
    user_id = int(get_jwt_identity())
    conn = BrokerConnection.query.filter_by(id=conn_id, user_id=user_id).first()
    if not conn:
        return jsonify({"error": "Connection not found"}), 404

    if conn.broker not in SYNCERS:
        return jsonify({"error": f"{conn.broker} does not support automatic sync. Please import via CSV."}), 400

    profile = _get_profile(user_id)
    if not profile:
        return jsonify({"error": "No active journal profile found"}), 400

    try:
        imported = SYNCERS[conn.broker](conn, profile.id, user_id)
        conn.last_sync_at = datetime.utcnow()
        conn.last_trade_count = (conn.last_trade_count or 0) + imported
        conn.last_error = None
        conn.status = "active"
        db.session.commit()
        return jsonify({"imported": imported, "connection": _serialize_conn(conn)}), 200
    except Exception as e:
        conn.last_error = str(e)[:500]
        conn.status = "error"
        db.session.commit()
        return jsonify({"error": str(e)[:300], "connection": _serialize_conn(conn)}), 500
