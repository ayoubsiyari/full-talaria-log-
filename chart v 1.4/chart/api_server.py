from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Response, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse, RedirectResponse, Response, HTMLResponse
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    DateTime,
    Date,
    Boolean,
    ForeignKey,
    Text,
    Float,
    text,
    func,
    nulls_last,
    UniqueConstraint,
    or_,
    and_,
    case,
)
from sqlalchemy.orm import sessionmaker, declarative_base, aliased
from datetime import datetime, timedelta
import csv
import gzip
import os
import sqlite3
import shutil
from pathlib import Path
import secrets
import hashlib
import base64
import json
import re
import subprocess
import tempfile
import time
import threading
import smtplib
import ssl as ssl_module
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from collections import deque
from pydantic import BaseModel, Field
from passlib.context import CryptContext
from google.oauth2 import id_token as google_id_token
from google.oauth2.service_account import Credentials
from google.auth.transport import requests as google_auth_requests
from googleapiclient.discovery import build
from urllib.parse import quote, urlparse, parse_qs
import urllib.error
import urllib.request

import math
import random
import platform as _py_platform

try:
    import psutil
except ImportError:
    psutil = None  # type: ignore

try:
    import jwt as pyjwt
except ImportError:
    pyjwt = None  # type: ignore

# Chart directory — load .env next to api_server.py for local dev (Docker Compose also injects env).
# Python does not read .env by itself; we merge KEY=value lines into os.environ if not already set.
_CHART_DIR = Path(__file__).resolve().parent


def _parse_dotenv_line(line: str) -> tuple[str, str] | None:
    trimmed = line.strip()
    if not trimmed or trimmed.startswith("#"):
        return None
    if trimmed.startswith("export "):
        trimmed = trimmed[7:].strip()
    if "=" not in trimmed:
        return None
    key, _, rest = trimmed.partition("=")
    key = key.strip()
    if not key:
        return None
    val = rest.strip()
    if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
        val = val[1:-1]
    return (key, val)


def _load_dotenv_files_from_chart_dir() -> None:
    """Load .env / .env.local into os.environ (does not override existing vars)."""
    for name in (".env", ".env.local"):
        path = _CHART_DIR / name
        if not path.is_file():
            continue
        try:
            raw = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for line in raw.splitlines():
            parsed = _parse_dotenv_line(line)
            if not parsed:
                continue
            key, val = parsed
            if key not in os.environ:
                os.environ[key] = val


_load_dotenv_files_from_chart_dir()

import _analytics_bootstrap

_analytics_bootstrap.install()

import chart_redis
import bar_window_cache
import backtest_whatif as bw
import session_journal_store as sjs
import bar_budget
import questdb_store
import plan_entitlements as pe

from analytics_engine import (
    normalize_trades,
    filter_by_instrument,
    simulate_equity_curve,
    build_expectancy_heatmap,
    compute_per_instrument_summary,
    build_histogram,
    compute_stats,
    compute_playbook_breakdown,
    compute_recent_trades,
    compute_equity_summary,
    compute_session_dashboard_extras,
)
from analytics_core.csv_journal import parse_trades_csv_bytes
from analytics_core.session_seed_trades import (
    extract_session_contract,
    generate_session_seed_trades,
    load_bars_for_contract,
    normalize_seed_scenario,
    seed_scenario_catalog,
)
from dashboard_access import (
    effective_dashboard_modules,
    modules_catalog,
    normalize_module_grants,
    user_has_dashboard_module,
    user_has_full_dashboard_modules,
)

from firstrate_ingest import (
    MAX_TICKER_LISTING_RETURN,
    VALID_FUTURES_ADJUSTMENTS,
    VALID_INSTRUMENT_TYPES,
    VALID_LAST_UPDATE_TYPES,
    VALID_STOCK_ADJUSTMENTS,
    download_firstrate_bundle,
    extract_zip,
    fetch_firstrate_last_update,
    fetch_firstrate_ticker_listing_rows,
    get_firstrate_userid,
    run_firstrate_connection_checks,
    iter_csv_files,
    normalize_firstrate_csv_to_standard,
)

# Error tracking (opt-in): only initializes when SENTRY_DSN is set, so any deploy
# without a DSN behaves exactly as before. sentry-sdk auto-enables its FastAPI/
# Starlette integration when those packages are importable.
_SENTRY_DSN = os.environ.get("SENTRY_DSN", "").strip()
if _SENTRY_DSN:
    try:
        import sentry_sdk

        def _float_env(name: str, default: float) -> float:
            try:
                return float(os.environ.get(name, str(default)))
            except (TypeError, ValueError):
                return default

        sentry_sdk.init(
            dsn=_SENTRY_DSN,
            environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
            traces_sample_rate=_float_env("SENTRY_TRACES_SAMPLE_RATE", 0.0),
            send_default_pii=False,
        )
        print("✅ Sentry error tracking enabled (trading-chart)")
    except Exception as _exc:  # never let observability setup break boot
        print(f"⚠️  Sentry init skipped (trading-chart): {_exc}")

# Initialize FastAPI
app = FastAPI(title="Trading Chart API")

# CORS Configuration - Allow your React frontend
cors_origins_env = os.getenv("CORS_ORIGINS", "").strip()
cors_allow_credentials = True
if cors_origins_env == "*":
    cors_origins = ["*"]
    cors_allow_credentials = False
else:
    cors_origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()] if cors_origins_env else []

CSRF_ENABLED = os.getenv("CSRF_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
trusted_origins_env = os.getenv("TRUSTED_ORIGINS", "").strip()
TRUSTED_ORIGINS = {o.strip() for o in trusted_origins_env.split(",") if o.strip()} if trusted_origins_env else set()

@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    if not CSRF_ENABLED:
        return await call_next(request)

    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return await call_next(request)

    origin = request.headers.get("origin")
    if not origin:
        return await call_next(request)

    def _normalize_origin(value: str) -> str:
        try:
            p = urlparse(value)
            scheme = (p.scheme or "").lower()
            host = (p.hostname or "").lower()
            port = p.port
            if not scheme or not host:
                return value
            if (scheme == "http" and port in (None, 80)) or (scheme == "https" and port in (None, 443)):
                return f"{scheme}://{host}"
            if port is None:
                return f"{scheme}://{host}"
            return f"{scheme}://{host}:{port}"
        except Exception:
            return value

    origin_norm = _normalize_origin(origin)

    allowed = set(TRUSTED_ORIGINS)
    if not allowed:
        proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        host = request.headers.get("x-forwarded-host") or request.headers.get("host", request.url.netloc)
        if host:
            candidates = [proto, request.url.scheme, "https", "http"]
            for scheme in dict.fromkeys(candidates):
                allowed.add(_normalize_origin(f"{scheme}://{host}"))
                if ":" in host:
                    allowed.add(_normalize_origin(f"{scheme}://{host.split(':', 1)[0]}"))

    allowed_norm = {_normalize_origin(o) for o in allowed}

    origin_host = None
    try:
        origin_host = (urlparse(origin).hostname or "").lower() or None
    except Exception:
        origin_host = None

    req_host_header = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",", 1)[0].strip()
    req_host = req_host_header.split(":", 1)[0].lower() if req_host_header else None

    if allowed_norm and origin_norm not in allowed_norm:
        if origin_host and req_host and origin_host == req_host:
            return await call_next(request)
        return JSONResponse({"detail": "Invalid origin"}, status_code=403)

    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _client_wants_html_error_page(request: Request) -> bool:
    """Browser page navigations get the ghost oops UI; API clients keep JSON."""
    path = (request.url.path or "").lower()
    if path.startswith("/api/") or path.startswith("/journal/api/"):
        return False
    accept = (request.headers.get("accept") or "").lower()
    if accept.startswith("application/json") and "text/html" not in accept:
        return False
    if "text/html" in accept:
        return True
    if path.endswith(".html"):
        return True
    if path.startswith("/dashboard") or path.startswith("/chart/") or path.startswith("/login"):
        return True
    if path in ("/", "/forbidden", "/forbidden/"):
        return True
    return False


def _oops_static_candidates(status_code: int) -> list[Path]:
    out = Path("homepage/out")
    fallback = Path(__file__).resolve().parent / "static" / "oops.html"
    if status_code == 403:
        return [out / "forbidden" / "index.html", fallback]
    return [out / "404.html", out / "not-found.html", fallback]


def _serve_oops_page(status_code: int):
    for candidate in _oops_static_candidates(status_code):
        if not candidate.is_file():
            continue
        if candidate.name == "oops.html":
            q = "403" if status_code == 403 else "404"
            return RedirectResponse(url=f"/chart/static/oops.html?status={q}", status_code=302)
        return FileResponse(str(candidate), status_code=status_code)
    title = "Access denied" if status_code == 403 else "Page not found"
    message = (
        "You don't have permission to open this page."
        if status_code == 403
        else "This page must be a ghost — it's not here."
    )
    right = "3" if status_code == 403 else "4"
    html = f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Talaria — {title}</title><style>body{{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#07080e;color:#e8ecff;font-family:system-ui,sans-serif;padding:24px}}.w{{text-align:center;max-width:520px}}h1{{font-size:2rem;margin:0 0 12px}}p{{color:#b4bedc;line-height:1.55}}a{{display:inline-block;margin-top:20px;padding:12px 28px;border-radius:999px;background:linear-gradient(135deg,#1e38e8,#4a6aff);color:#fff;text-decoration:none;font-weight:700}}</style></head><body><div class="w"><div style="font-size:88px;font-weight:800;opacity:.75;margin-bottom:16px">4<span style="opacity:.35">·</span>{right}</div><h1>{title}</h1><p>{message}</p><a href="/">Back home</a></div></body></html>"""
    return HTMLResponse(content=html, status_code=status_code)


@app.exception_handler(HTTPException)
async def _html_friendly_http_exception_handler(request: Request, exc: HTTPException):
    if exc.status_code in (401, 403, 404) and _client_wants_html_error_page(request):
        return _serve_oops_page(exc.status_code)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


# ───────────────────────────────────────────────────────────────────────
# Admin audit middleware
#
# Auto-logs every mutating request whose path starts with `/api/admin/` so
# we capture calls the structured `_record_admin_action` helper hasn't been
# wired into yet (user ban/delete/extend, dataset upload, plan edits…).
# Intentionally minimal to avoid coupling to individual handlers:
#   * only POST/PUT/PATCH/DELETE (reads aren't destructive)
#   * never consumes the body (would break downstream handlers)
#   * writes AFTER the response so we know the final status code
#   * attribution via `request.state.admin_user_id` set by `_require_admin`
#     — if the handler short-circuited with 401/403 we still log it with
#     status="denied" and no admin_user_id so you see break-in attempts.
# Log writes are fire-and-forget: any DB failure here is swallowed so a
# broken audit table never breaks a working admin flow.
# ───────────────────────────────────────────────────────────────────────
_AUDIT_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

@app.middleware("http")
async def _admin_audit_middleware(request: Request, call_next):
    path = request.url.path or ""
    should_audit = (
        request.method in _AUDIT_MUTATING_METHODS
        and path.startswith("/api/admin/")
    )
    response = await call_next(request)
    if not should_audit:
        return response
    try:
        admin_user_id = getattr(request.state, "admin_user_id", None)
        admin_email = getattr(request.state, "admin_email", None)
        sc = int(getattr(response, "status_code", 0) or 0)
        if sc in (401, 403):
            status_label = "denied"
        elif sc >= 500:
            status_label = "error"
        elif sc >= 400:
            status_label = "error"
        else:
            status_label = "ok"
        # Infer a short `action` from the last non-empty path segment so the
        # log is searchable (e.g. /api/admin/users/42/ban -> "ban").
        segs = [s for s in path.split("/") if s]
        action = "admin_call"
        if len(segs) >= 3:
            tail = segs[-1]
            action = tail if not tail.isdigit() else (segs[-2] if len(segs) >= 2 else tail)
        action = (action or "admin_call")[:64]

        db = SessionLocal()
        try:
            db.add(AdminAuditLog(
                admin_user_id=admin_user_id,
                admin_email=(admin_email or None),
                action=action,
                method=request.method,
                path=path[:500],
                target_type=None,
                target_id=None,
                status=status_label,
                status_code=sc,
                params_json=None,      # middleware never inspects body
                result_json=None,
                error_message=None,
                ip_address=_client_ip(request),
                user_agent=(request.headers.get("user-agent") or "")[:500],
            ))
            db.commit()
        finally:
            db.close()
    except Exception:
        # Never let audit failure affect the real response.
        pass
    return response

# Database Setup - Use environment variable or default to SQLite
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./db/chart_data.db")
_APP_DIR = Path(__file__).resolve().parent

def _absolutize_sqlite_url(url: str) -> str:
    if not url.startswith("sqlite"):
        return url
    if url.startswith("sqlite:////"):
        return url
    if not url.startswith("sqlite:///"):
        return url
    raw_path = url.replace("sqlite:///", "", 1)
    p = Path(raw_path)
    if p.is_absolute():
        return url
    abs_path = (_APP_DIR / p).resolve()
    return f"sqlite:///{abs_path.as_posix()}"

DATABASE_URL = _absolutize_sqlite_url(DATABASE_URL)

AUTH_ENABLED = os.getenv("AUTH_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
SESSION_COOKIE_NAME = os.getenv("SESSION_COOKIE_NAME", "session_id").strip() or "session_id"
SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "false").strip().lower() in {"1", "true", "yes", "on"}
SESSION_COOKIE_SAMESITE = (os.getenv("SESSION_COOKIE_SAMESITE", "lax").strip().lower() or "lax")
SESSION_COOKIE_MAX_AGE_SECONDS = int(os.getenv("SESSION_COOKIE_MAX_AGE_SECONDS", "1209600"))

AFFILIATE_COOKIE_NAME = (os.getenv("AFFILIATE_COOKIE_NAME", "talaria_aff").strip() or "talaria_aff")
AFFILIATE_COOKIE_MAX_AGE_SECONDS = int(os.getenv("AFFILIATE_COOKIE_MAX_AGE_SECONDS", str(90 * 24 * 3600)))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def _sqlite_path_from_url(url: str) -> Path | None:
    if not url.startswith("sqlite"):
        return None
    if url.startswith("sqlite:////"):
        return Path(url.replace("sqlite:////", "/", 1))
    if url.startswith("sqlite:///"):
        return Path(url.replace("sqlite:///", "", 1))
    return None

def _count_csv_files_in_sqlite(db_path: Path) -> int:
    if not db_path.exists():
        return 0
    try:
        con = sqlite3.connect(str(db_path))
        try:
            cur = con.cursor()
            cur.execute("SELECT COUNT(*) FROM csv_files")
            row = cur.fetchone()
            return int(row[0]) if row and row[0] is not None else 0
        finally:
            con.close()
    except Exception:
        return 0

sqlite_target_path = _sqlite_path_from_url(DATABASE_URL)
if sqlite_target_path is not None:
    sqlite_target_path.parent.mkdir(parents=True, exist_ok=True)
    legacy_path = Path("chart_data.db")
    target_count = _count_csv_files_in_sqlite(sqlite_target_path)
    legacy_count = _count_csv_files_in_sqlite(legacy_path)
    if legacy_path.exists() and legacy_path.resolve() != sqlite_target_path.resolve():
        if not sqlite_target_path.exists() and legacy_count > 0:
            shutil.copy2(str(legacy_path), str(sqlite_target_path))

# SQLite-specific connection args
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return default


# Connection pool tuning. SQLite uses its own (non-network) pool, so only apply
# QueuePool sizing to networked databases (Postgres). pool_pre_ping discards
# connections that the DB/proxy dropped while idle (prevents "server closed the
# connection" 500s); pool_recycle guards against stale long-lived connections.
# Sized per gunicorn worker process — keep (pool_size + max_overflow) × workers
# comfortably under Postgres max_connections.
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args=connect_args)
else:
    engine = create_engine(
        DATABASE_URL,
        connect_args=connect_args,
        pool_size=_int_env("DB_POOL_SIZE", 10),
        max_overflow=_int_env("DB_MAX_OVERFLOW", 20),
        pool_timeout=_int_env("DB_POOL_TIMEOUT", 30),
        pool_recycle=_int_env("DB_POOL_RECYCLE", 1800),
        pool_pre_ping=True,
    )
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)
_DATABASE_USES_ROW_LOCK = not DATABASE_URL.startswith("sqlite")

# Single Base so FK references between models resolve correctly.
# The users table is owned by journal-backend — we declare it here for FK resolution
# but exclude it from create_all (see CHART_TABLES below).
Base = declarative_base()

# Upload directory
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
SUPPORT_UPLOAD_DIR = UPLOAD_DIR / "support"
SUPPORT_UPLOAD_DIR.mkdir(exist_ok=True)

DUKASCOPY_SCRIPT_PATH = _APP_DIR / "download" / "fetch-data.js"
DUKASCOPY_DEFAULT_TIMEFRAME = "m1"
DUKASCOPY_MAX_RANGE_DAYS = int(os.getenv("DUKASCOPY_MAX_RANGE_DAYS", "365"))
DUKASCOPY_MAX_TOTAL_DAYS = int(os.getenv("DUKASCOPY_MAX_TOTAL_DAYS", "7300"))
DUKASCOPY_JOB_TTL_SECONDS = int(os.getenv("DUKASCOPY_JOB_TTL_SECONDS", "21600"))
DUKASCOPY_JOBS_DIR = UPLOAD_DIR / "dukascopy_jobs"
DUKASCOPY_JOBS_DIR.mkdir(exist_ok=True)

# FirstRate Data bundle imports (ZIP → CSV → chart binaries). Jobs mirror Dukascopy JSON files.
FIrstrate_JOB_TTL_SECONDS = int(os.getenv("FIrstrate_JOB_TTL_SECONDS", "86400"))
FIrstrate_JOBS_DIR = UPLOAD_DIR / "firstrate_jobs"
FIrstrate_JOBS_DIR.mkdir(exist_ok=True)
# Required phrase (or env override) when wiping every dataset before a FirstRate re-import.
DATASET_PURGE_CONFIRMATION = os.getenv("DATASET_PURGE_CONFIRMATION", "DELETE_ALL_CHART_DATASETS")

# VPS auto-sync (editable from admin dashboard). Env FIrstrate_SCHEDULE_ENABLED bootstraps default when file missing.
FIrstrate_SCHEDULE_PATH = UPLOAD_DIR / "firstrate_schedule.json"
_firstrate_schedule_lock = threading.Lock()

# Curated Dukascopy instrument ids for admin UI (indices / commodities / forex).
# These are Dukascopy CFD / cash-index symbols — not exchange-listed futures like CME NQ or CL.
DUKASCOPY_INSTRUMENT_GROUPS: dict[str, list[dict[str, str]]] = {
    "us_indices": [
        {
            "id": "usa500idxusd",
            "label": "USA 500 index (S&P 500–style cash index CFD)",
        },
        {
            "id": "usatechidxusd",
            "label": "USA 100 Tech index (Nasdaq-100–style cash index CFD)",
        },
        {"id": "usa30idxusd", "label": "USA 30 index (Dow-style cash index CFD)"},
        {"id": "dollaridxusd", "label": "US Dollar index"},
    ],
    "energy": [
        {"id": "lightcmdusd", "label": "US Light crude oil (WTI-style CFD)"},
        {"id": "brentcmdusd", "label": "Brent crude oil (CFD)"},
        {"id": "gascmdusd", "label": "Natural gas (CFD)"},
        {"id": "dieselcmdusd", "label": "Gas oil (CFD)"},
    ],
    "world_indices": [
        {"id": "fraidxeur", "label": "France 40 index"},
        {"id": "deuidxeur", "label": "Germany 40 index"},
        {"id": "gbridxgbp", "label": "UK 100 index"},
        {"id": "eusidxeur", "label": "Europe 50 index"},
        {"id": "jpnidxjpy", "label": "Japan 225 index"},
        {"id": "hkgidxhkd", "label": "Hong Kong 40 index"},
    ],
    "forex": [
        {"id": "eurusd", "label": "EUR/USD"},
        {"id": "gbpusd", "label": "GBP/USD"},
        {"id": "usdjpy", "label": "USD/JPY"},
        {"id": "audusd", "label": "AUD/USD"},
        {"id": "nzdusd", "label": "NZD/USD"},
        {"id": "usdcad", "label": "USD/CAD"},
        {"id": "usdchf", "label": "USD/CHF"},
        {"id": "eurgbp", "label": "EUR/GBP"},
        {"id": "eurjpy", "label": "EUR/JPY"},
        {"id": "gbpjpy", "label": "GBP/JPY"},
        {"id": "audjpy", "label": "AUD/JPY"},
        {"id": "nzdjpy", "label": "NZD/JPY"},
        {"id": "cadjpy", "label": "CAD/JPY"},
        {"id": "chfjpy", "label": "CHF/JPY"},
        {"id": "euraud", "label": "EUR/AUD"},
        {"id": "eurnzd", "label": "EUR/NZD"},
        {"id": "eurcad", "label": "EUR/CAD"},
        {"id": "eurchf", "label": "EUR/CHF"},
        {"id": "gbpaud", "label": "GBP/AUD"},
        {"id": "gbpnzd", "label": "GBP/NZD"},
        {"id": "gbpcad", "label": "GBP/CAD"},
        {"id": "gbpchf", "label": "GBP/CHF"},
        {"id": "audnzd", "label": "AUD/NZD"},
        {"id": "audcad", "label": "AUD/CAD"},
        {"id": "audchf", "label": "AUD/CHF"},
        {"id": "nzdcad", "label": "NZD/CAD"},
        {"id": "nzdchf", "label": "NZD/CHF"},
        {"id": "cadchf", "label": "CAD/CHF"},
        {"id": "usdnok", "label": "USD/NOK"},
        {"id": "eurnok", "label": "EUR/NOK"},
        {"id": "usdsek", "label": "USD/SEK"},
        {"id": "eursek", "label": "EUR/SEK"},
        {"id": "usddkk", "label": "USD/DKK"},
        {"id": "usdpln", "label": "USD/PLN"},
        {"id": "eurpln", "label": "EUR/PLN"},
        {"id": "usdhuf", "label": "USD/HUF"},
        {"id": "usdczk", "label": "USD/CZK"},
        {"id": "eurczk", "label": "EUR/CZK"},
        {"id": "usdsgd", "label": "USD/SGD"},
        {"id": "eursgd", "label": "EUR/SGD"},
        {"id": "sgdjpy", "label": "SGD/JPY"},
        {"id": "usdhkd", "label": "USD/HKD"},
        {"id": "usdcnh", "label": "USD/CNH (offshore yuan)"},
        {"id": "usdthb", "label": "USD/THB"},
        {"id": "usdinr", "label": "USD/INR"},
        {"id": "usdkrw", "label": "USD/KRW"},
        {"id": "usdidr", "label": "USD/IDR"},
        {"id": "usdphp", "label": "USD/PHP"},
        {"id": "usdmxn", "label": "USD/MXN"},
        {"id": "eurmxn", "label": "EUR/MXN"},
        {"id": "usdbrl", "label": "USD/BRL"},
        {"id": "usdclp", "label": "USD/CLP"},
        {"id": "usdtry", "label": "USD/TRY"},
        {"id": "eurtry", "label": "EUR/TRY"},
        {"id": "usdzar", "label": "USD/ZAR"},
        {"id": "eurzar", "label": "EUR/ZAR"},
        {"id": "gbpzar", "label": "GBP/ZAR"},
        {"id": "xauusd", "label": "Gold / USD"},
        {"id": "xagusd", "label": "Silver / USD"},
    ],
}

BINANCE_MAX_TICKERS = int(os.getenv("BINANCE_MAX_TICKERS", "5"))
BINANCE_MAX_TOTAL_DAYS = int(os.getenv("BINANCE_MAX_TOTAL_DAYS", "7300"))
BINANCE_JOB_TTL_SECONDS = int(os.getenv("BINANCE_JOB_TTL_SECONDS", "21600"))
BINANCE_JOBS_DIR = UPLOAD_DIR / "binance_jobs"
BINANCE_JOBS_DIR.mkdir(exist_ok=True)
# Must match BinanceDataDumper._DATA_FREQUENCY_ENUM (binance-historical-data)
BINANCE_ALLOWED_FREQUENCIES = frozenset({
    "1s", "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h",
    "1d", "3d", "1w", "1mo",
})
# Subset validated against BinanceDataDumper; only OHLC-like CSVs go through merge → datasets.
BINANCE_FETCH_DATA_TYPES_SPOT = frozenset({"klines"})
BINANCE_FETCH_DATA_TYPES_FUTURES = frozenset({
    "klines", "indexPriceKlines", "markPriceKlines", "premiumIndexKlines",
})
BINANCE_SYMBOLS_CACHE_TTL = float(os.getenv("BINANCE_SYMBOLS_CACHE_TTL", "300"))
_BINANCE_SYMBOLS_CACHE: dict[str, tuple[float, list[str]]] = {}

# Yahoo Finance — CME-style continuous futures (root symbols ending in =F).
# This is not CME DataMine or exchange-native contract rolls; data is aggregated by Yahoo.
YAHOO_CME_JOB_TTL_SECONDS = int(os.getenv("YAHOO_CME_JOB_TTL_SECONDS", "21600"))
YAHOO_CME_MAX_TOTAL_DAYS = int(os.getenv("YAHOO_CME_MAX_TOTAL_DAYS", "7300"))
# Large ranges at 1m/d need many small Yahoo calls; keep high enough that daily-year chunks are not blocked.
YAHOO_CME_MAX_CHUNKS = int(os.getenv("YAHOO_CME_MAX_CHUNKS", "2500"))
YAHOO_CME_JOBS_DIR = UPLOAD_DIR / "yahoo_cme_jobs"
YAHOO_CME_JOBS_DIR.mkdir(exist_ok=True)
# Pause between Yahoo requests (same idea as Dukascopy time-chunking — avoids rate limits).
YAHOO_CME_CHUNK_SLEEP_SECONDS = float(os.getenv("YAHOO_CME_CHUNK_SLEEP_SECONDS", "2.5"))
YAHOO_CME_CHUNK_SLEEP_JITTER_SECONDS = float(os.getenv("YAHOO_CME_CHUNK_SLEEP_JITTER_SECONDS", "1.0"))

YAHOO_CME_ALLOWED_INTERVALS = frozenset({"1m", "2m", "5m", "15m", "30m", "60m", "1d"})
YAHOO_CME_INTERVAL_ALIASES = {"1h": "60m"}

# Curated Yahoo tickers (continuous futures); users may also pass any valid =F symbol.
YAHOO_CME_INSTRUMENT_GROUPS: dict[str, list[dict[str, str]]] = {
    "equity_index": [
        {"ticker": "ES=F", "label": "E-mini S&P 500"},
        {"ticker": "MES=F", "label": "Micro E-mini S&P 500"},
        {"ticker": "NQ=F", "label": "E-mini Nasdaq-100"},
        {"ticker": "MNQ=F", "label": "Micro E-mini Nasdaq-100"},
        {"ticker": "YM=F", "label": "E-mini Dow"},
        {"ticker": "MYM=F", "label": "Micro E-mini Dow"},
        {"ticker": "RTY=F", "label": "E-mini Russell 2000"},
        {"ticker": "M2K=F", "label": "Micro E-mini Russell 2000"},
    ],
    "energy": [
        {"ticker": "CL=F", "label": "Crude oil (WTI)"},
        {"ticker": "MCL=F", "label": "Micro WTI crude oil"},
        {"ticker": "NG=F", "label": "Natural gas"},
        {"ticker": "RB=F", "label": "RBOB gasoline"},
        {"ticker": "HO=F", "label": "Heating oil"},
    ],
    "metals": [
        {"ticker": "GC=F", "label": "Gold"},
        {"ticker": "MGC=F", "label": "Micro gold"},
        {"ticker": "SI=F", "label": "Silver"},
        {"ticker": "HG=F", "label": "Copper"},
    ],
    "rates": [
        {"ticker": "ZB=F", "label": "30-Year T-Bond"},
        {"ticker": "ZN=F", "label": "10-Year T-Note"},
        {"ticker": "ZF=F", "label": "5-Year T-Note"},
        {"ticker": "ZT=F", "label": "2-Year T-Note"},
    ],
    "fx": [
        {"ticker": "6E=F", "label": "Euro FX"},
        {"ticker": "6B=F", "label": "British pound FX"},
        {"ticker": "6J=F", "label": "Japanese yen FX"},
        {"ticker": "6A=F", "label": "Australian dollar FX"},
        {"ticker": "6C=F", "label": "Canadian dollar FX"},
        {"ticker": "6S=F", "label": "Swiss franc FX"},
    ],
    "ag": [
        {"ticker": "ZC=F", "label": "Corn"},
        {"ticker": "ZS=F", "label": "Soybeans"},
        {"ticker": "ZW=F", "label": "Wheat"},
    ],
}

# Conservative data-sanity smoothing for isolated bad ticks.
# Enabled by default; tuned to only touch obvious one-bar anomalies where
# surrounding candles are stable and the middle bar is far away.
SPIKE_FILTER_ENABLED = os.getenv("SPIKE_FILTER_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
SPIKE_FILTER_NEIGHBOR_GAP_PCT = float(os.getenv("SPIKE_FILTER_NEIGHBOR_GAP_PCT", "0.0015"))
SPIKE_FILTER_MIN_DEVIATION_PCT = float(os.getenv("SPIKE_FILTER_MIN_DEVIATION_PCT", "0.0035"))
SPIKE_FILTER_MAX_ADJUST_RATIO = float(os.getenv("SPIKE_FILTER_MAX_ADJUST_RATIO", "0.10"))
EXCLUDE_WEEKEND_CANDLES = os.getenv("EXCLUDE_WEEKEND_CANDLES", "true").strip().lower() in {"1", "true", "yes", "on"}
FIRSTRATE_EXTREME_RATIO_FILTER = os.getenv("FIRSTRATE_EXTREME_RATIO_FILTER", "true").strip().lower() in {"1", "true", "yes", "on"}
FIRSTRATE_EXTREME_RATIO_MAX = float(os.getenv("FIRSTRATE_EXTREME_RATIO_MAX", "5.0"))

# Scale/runtime controls
BINARY_ONLY_RUNTIME = os.getenv("BINARY_ONLY_RUNTIME", "false").strip().lower() in {"1", "true", "yes", "on"}
BINARY_BUILD_MODE = (os.getenv("BINARY_BUILD_MODE", "thread").strip().lower() or "thread")
BINARY_QUEUE_POLL_SECONDS = float(os.getenv("BINARY_QUEUE_POLL_SECONDS", "2.0"))
# When true, API startup skips scanning all datasets and queueing binary/tile backfill jobs.
# Set false (or trigger rebuilds from admin) when you need a full chart-data repair pass.
SKIP_BINARY_BACKFILL_ON_STARTUP = os.getenv("SKIP_BINARY_BACKFILL_ON_STARTUP", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
APP_ROLE = (os.getenv("APP_ROLE", "api").strip().lower() or "api")

# CSV archival support (cold storage on same filesystem/volume by default)
CSV_ARCHIVE_DIR = UPLOAD_DIR / "archive"
CSV_ARCHIVE_DIR.mkdir(exist_ok=True)

# Trading-session state guardrails (protects the 200 GB VPS disk from runaway
# drawings / journals stored in the single `TradingSessionState.state_json`
# column). Enforced by PATCH /api/sessions/:id/state — SOFT returns a warning
# in the response, HARD 413s the write (but only if the payload is also
# larger than the previous version, so an oversize user can still shrink).
SESSION_STATE_SOFT_LIMIT_BYTES = int(os.getenv("SESSION_STATE_SOFT_LIMIT_BYTES", str(4 * 1024 * 1024)))
SESSION_STATE_HARD_LIMIT_BYTES = int(os.getenv("SESSION_STATE_HARD_LIMIT_BYTES", str(16 * 1024 * 1024)))
# Directory for compressed, admin-triggered archives of stale trading-session
# state (see /api/admin/system/archive-stale-sessions).
SESSION_ARCHIVE_DIR = UPLOAD_DIR / "session_archive"
SESSION_ARCHIVE_DIR.mkdir(exist_ok=True)

# Optional tile CDN redirect mode
TILE_CDN_BASE_URL = os.getenv("TILE_CDN_BASE_URL", "").strip().rstrip("/")
TILE_CDN_REDIRECT = os.getenv("TILE_CDN_REDIRECT", "false").strip().lower() in {"1", "true", "yes", "on"}

# Database Model
class CSVFile(Base):
    __tablename__ = "csv_files"
    
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    original_name = Column(String, nullable=False)
    upload_date = Column(DateTime, default=datetime.utcnow)
    row_count = Column(Integer)
    description = Column(String)

class CSVAggregate(Base):
    __tablename__ = "csv_aggregates"

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(Integer, ForeignKey("csv_files.id"), index=True, nullable=False)
    timeframe = Column(String, nullable=False)
    agg_filename = Column(String, nullable=False)
    row_count = Column(Integer)
    start_ts = Column(Float)  # epoch ms
    end_ts = Column(Float)    # epoch ms
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="ready")  # pending | processing | ready | failed

class DatasetSettings(Base):
    __tablename__ = "dataset_settings"

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(Integer, ForeignKey("csv_files.id"), index=True, nullable=False, unique=True)
    display_name = Column(String, nullable=True)
    csv_delimiter = Column(String, default=",", nullable=False)
    datetime_format = Column(String, nullable=True)
    csv_timezone = Column(String, default="UTC", nullable=False)
    csv_has_header = Column(Boolean, default=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class BinaryBuildJob(Base):
    __tablename__ = "binary_build_jobs"

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(Integer, ForeignKey("csv_files.id"), index=True, nullable=False)
    source_path = Column(String, nullable=False)
    original_name = Column(String, nullable=False)
    trigger = Column(String, nullable=False, default="manual")
    status = Column(String, nullable=False, default="queued")  # queued | processing | done | failed
    attempt_count = Column(Integer, nullable=False, default=0)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

DATASET_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1mo']

class User(Base):
    """Maps to the shared 'users' table managed by journal-backend.
    Declared here so FK references in chart tables resolve correctly.
    Excluded from create_all — journal-backend owns this schema.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user", nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    access_expires_at = Column(DateTime, nullable=True)
    max_sessions = Column(Integer, default=1, nullable=False, server_default="1")
    max_trading_sessions = Column(Integer, default=5, nullable=False, server_default="5")
    max_tickers_per_session = Column(Integer, default=5, nullable=False, server_default="5")
    max_supporting_tickers_per_session = Column(Integer, default=5, nullable=False, server_default="5")
    has_journal_access = Column(Boolean, default=False)
    dashboard_module_grants = Column(Text, nullable=True)  # JSON: {"journal": true, ...}
    stripe_customer_id = Column(String, nullable=True)
    country = Column(String(100), nullable=True)
    phone = Column(String(50), nullable=True)
    birth_date = Column(Date, nullable=True)
    public_id = Column(String(20), unique=True, nullable=True, index=True)

class SubscriptionPlan(Base):
    """Maps to journal-backend's subscription_plans table (read/write for admin)."""
    __tablename__ = "subscription_plans"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    price = Column(Float, default=0)
    price_monthly = Column(Float, default=0)
    price_yearly = Column(Float, default=0)
    interval = Column(String, default="month")
    stripe_price_id = Column(String, nullable=True)
    stripe_price_id_yearly = Column(String, nullable=True)
    stripe_product_id = Column(String, nullable=True)
    features = Column(Text, nullable=True)
    trial_days = Column(Integer, default=0)
    max_trading_sessions = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Subscription(Base):
    """Maps to journal-backend's subscriptions table (read/write for admin)."""
    __tablename__ = "subscriptions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True, nullable=False)
    plan_id = Column(Integer, nullable=True)
    stripe_subscription_id = Column(String, nullable=True)
    stripe_customer_id = Column(String, nullable=True)
    status = Column(String, default="active")
    started_at = Column(DateTime, nullable=True)
    ends_at = Column(DateTime, nullable=True)
    current_period_start = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    cancel_at_period_end = Column(Boolean, default=False)
    cancelled_at = Column(DateTime, nullable=True)
    is_manual = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Payment(Base):
    """Maps to journal-backend's payments table (read for admin)."""
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=True)
    subscription_id = Column(Integer, nullable=True)
    provider = Column(String, default="stripe")
    amount = Column(Float, nullable=False)
    currency = Column(String, default="usd")
    status = Column(String, nullable=False)
    invoice_url = Column(String, nullable=True)
    description = Column(String, nullable=True)
    stripe_payment_id = Column(String, nullable=True)
    stripe_invoice_id = Column(String, nullable=True)
    refunded = Column(Boolean, default=False)
    refund_amount = Column(Float, nullable=True)
    refunded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class PlanEntitlementAuditLog(Base):
    __tablename__ = "plan_entitlement_audit_log"
    id = Column(Integer, primary_key=True)
    plan_id = Column(Integer, nullable=True, index=True)
    admin_user_id = Column(Integer, nullable=True)
    action = Column(String(64), nullable=False)
    payload_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)  # no FK — users table is managed by journal-backend
    ip_address = Column(String)
    device = Column(String)
    last_active_at = Column(DateTime, default=datetime.utcnow)

class TradingSession(Base):
    __tablename__ = "trading_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)  # no FK — users table is managed by journal-backend
    name = Column(String, nullable=False)
    session_type = Column(String, nullable=False)  # personal | propfirm
    config_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class TradingSessionState(Base):
    __tablename__ = "trading_session_states"

    session_id = Column(Integer, ForeignKey("trading_sessions.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(Integer, index=True, nullable=False)  # no FK — users table is managed by journal-backend
    state_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TradingSessionJournalTrade(Base):
    """One row per backtest journal trade for SQL queries and backups; kept in sync with state_json journal on PATCH."""

    __tablename__ = "trading_session_journal_trades"
    __table_args__ = (UniqueConstraint("session_id", "client_trade_id", name="uq_tsjt_session_client_trade"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("trading_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id = Column(Integer, index=True, nullable=False)
    client_trade_id = Column(String(128), nullable=False, index=True)
    payload_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SupportThread(Base):
    __tablename__ = "support_threads"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    subject = Column(String(500), nullable=False)
    category = Column(String(32), nullable=False, default="other")
    status = Column(String(32), nullable=False, default="open")  # open | pending | resolved | user_replied | closed
    priority = Column(String(16), nullable=False, default="normal")  # low | normal | high | urgent
    assigned_to_user_id = Column(Integer, index=True, nullable=True)
    first_response_due_at = Column(DateTime, nullable=True, index=True)
    first_responded_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_message_at = Column(DateTime, nullable=True, index=True)
    ticket_extra = Column(Text, nullable=True)  # JSON: context, structured fields
    tags_json = Column(Text, nullable=True)  # JSON array of tag strings
    related_thread_id = Column(Integer, index=True, nullable=True)
    csat_rating = Column(Integer, nullable=True)
    csat_comment = Column(Text, nullable=True)
    csat_at = Column(DateTime, nullable=True)
    admin_yes_no = Column(String(8), nullable=True)  # admin verdict: 'yes' | 'no'
    archived_at = Column(DateTime, nullable=True, index=True)


class SupportMessage(Base):
    __tablename__ = "support_messages"

    id = Column(Integer, primary_key=True, index=True)
    thread_id = Column(Integer, ForeignKey("support_threads.id"), index=True, nullable=False)
    sender_user_id = Column(Integer, index=True, nullable=False)
    body = Column(Text, nullable=False)
    is_internal = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class SupportCannedReply(Base):
    __tablename__ = "support_canned_replies"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    category = Column(String(32), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class SupportAttachment(Base):
    __tablename__ = "support_attachments"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("support_messages.id"), index=True, nullable=False, unique=True)
    user_id = Column(Integer, index=True, nullable=False)
    stored_name = Column(String(128), nullable=False, unique=True)
    original_name = Column(String(255), nullable=True)
    mime_type = Column(String(128), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    type = Column(String(64), nullable=False, default="support_message")
    thread_id = Column(Integer, index=True, nullable=True)
    message_id = Column(Integer, nullable=True)
    title = Column(String(300), nullable=False)
    body = Column(Text, nullable=True)
    read_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class SupportThreadRead(Base):
    """Per-user read watermark for a thread (for read receipts)."""

    __tablename__ = "support_thread_reads"
    __table_args__ = (UniqueConstraint("thread_id", "user_id", name="uq_support_thread_reads_thread_user"),)

    id = Column(Integer, primary_key=True, index=True)
    thread_id = Column(Integer, ForeignKey("support_threads.id"), index=True, nullable=False)
    user_id = Column(Integer, index=True, nullable=False)
    last_read_message_id = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Affiliate(Base):
    """Partner profile: promo code matches Stripe promotion code for checkout + tracking."""

    __tablename__ = "affiliates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    contact_email = Column(String(255), nullable=True)
    promo_code = Column(String(64), nullable=False, unique=True, index=True)
    stripe_coupon_id = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AffiliateAttribution(Base):
    """First-touch: which affiliate referred this user (one row per user)."""

    __tablename__ = "affiliate_attributions"
    __table_args__ = (UniqueConstraint("user_id", name="uq_affiliate_attr_user"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    affiliate_id = Column(Integer, ForeignKey("affiliates.id"), index=True, nullable=False)
    source = Column(String(32), nullable=False, default="cookie")
    created_at = Column(DateTime, default=datetime.utcnow)


class AffiliateEvent(Base):
    """signup | login | purchase events for reporting."""

    __tablename__ = "affiliate_events"

    id = Column(Integer, primary_key=True, index=True)
    affiliate_id = Column(Integer, ForeignKey("affiliates.id"), index=True, nullable=False)
    user_id = Column(Integer, index=True, nullable=False)
    event_type = Column(String(32), nullable=False)
    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=True, index=True)
    amount = Column(Float, nullable=True)
    currency = Column(String(8), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class AdminAuditLog(Base):
    """
    Forensic trail of every admin-origin mutation — writes are append-only and
    survive independently of the resource they mutated. Powers the "who did
    what and when" view on the admin dashboard + satisfies the user's
    "never lose data" requirement by making every destructive call visible.

    Populated from two places:
      1. `_admin_audit_middleware` — auto-logs any mutating request to `/api/admin/*`
         with method + path + status + ip + admin user id. Zero-config coverage
         for every existing and future admin endpoint.
      2. `_record_admin_action(...)` — called explicitly by high-risk handlers
         (archive / prune / restore / user delete / etc.) with structured
         `action` + `params` + `result` for richer queries.

    `params_json` / `result_json` MUST NOT contain secrets. We never log
    request body by default — only explicit param dicts passed by handlers.
    """

    __tablename__ = "admin_audit_log"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    admin_user_id = Column(Integer, index=True, nullable=True)
    admin_email = Column(String(255), nullable=True)
    action = Column(String(64), index=True, nullable=False)  # e.g. archive_stale_sessions
    method = Column(String(8), nullable=True)                # GET/POST/...
    path = Column(String(512), nullable=True)
    target_type = Column(String(64), nullable=True)          # session, attachment, user, ...
    target_id = Column(String(64), nullable=True)            # string so we can log "42", "uuid-…", or "-"
    status = Column(String(16), index=True, nullable=False)  # ok | error | denied | dry_run
    status_code = Column(Integer, nullable=True)
    params_json = Column(Text, nullable=True)
    result_json = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)


# Create chart-specific tables only — exclude 'users' (managed by journal-backend).
_CHART_TABLES = [
    CSVFile.__table__,
    CSVAggregate.__table__,
    DatasetSettings.__table__,
    BinaryBuildJob.__table__,
    UserSession.__table__,
    TradingSession.__table__,
    TradingSessionState.__table__,
    TradingSessionJournalTrade.__table__,
    SupportThread.__table__,
    SupportMessage.__table__,
    SupportAttachment.__table__,
    Notification.__table__,
    SupportThreadRead.__table__,
    SupportCannedReply.__table__,
    Affiliate.__table__,
    AffiliateAttribution.__table__,
    AffiliateEvent.__table__,
    AdminAuditLog.__table__,
]
Base.metadata.create_all(bind=engine, tables=_CHART_TABLES)

# Ensure journal-trade mirror table exists (deployments that predated TradingSessionJournalTrade).
try:
    TradingSessionJournalTrade.__table__.create(bind=engine, checkfirst=True)
except Exception:
    pass

# Safe migration: add access_expires_at to users table if missing.
def _backfill_plan_tier_ranks(conn) -> None:
    """One-time idempotent: assign tier_rank from price order when all plans are rank 0."""
    try:
        has_rank = conn.execute(
            text("SELECT COUNT(*) FROM subscription_plans WHERE tier_rank > 0")
        ).scalar()
        if has_rank and int(has_rank or 0) > 0:
            return
        rows = conn.execute(
            text(
                "SELECT id FROM subscription_plans "
                "ORDER BY COALESCE(price_monthly, price, 0) ASC, id ASC"
            )
        ).fetchall()
        for idx, row in enumerate(rows):
            pid = row[0] if not isinstance(row, dict) else row.get("id")
            if pid is None:
                continue
            conn.execute(
                text(
                    "UPDATE subscription_plans SET tier_rank = :rank "
                    "WHERE id = :id AND COALESCE(tier_rank, 0) = 0"
                ),
                {"rank": (idx + 1) * 10, "id": pid},
            )
    except Exception:
        pass


def _migration_add_column(engine, table: str, column: str, col_ddl: str) -> None:
    """Add one column in its own transaction so a later failure cannot roll back earlier alters."""
    from sqlalchemy import inspect as sa_inspect

    try:
        insp = sa_inspect(engine)
        if table in insp.get_table_names():
            existing = {c["name"] for c in insp.get_columns(table)}
            if column in existing:
                return
    except Exception:
        pass
    try:
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_ddl}"))
    except Exception as exc:
        try:
            print(f"[migration] skip {table}.{column}: {exc}", flush=True)
        except Exception:
            pass


def _apply_entitlements_schema_migrations(engine) -> None:
    """Ensure entitlement columns exist (each ALTER commits independently)."""
    from sqlalchemy import inspect as sa_inspect

    try:
        insp = sa_inspect(engine)
        tables = set(insp.get_table_names())
    except Exception:
        tables = set()

    bool_default = "INTEGER NOT NULL DEFAULT 0" if DATABASE_URL.startswith("sqlite") else "BOOLEAN NOT NULL DEFAULT FALSE"

    if "users" in tables:
        for col, ddl in (
            ("entitlements_override", bool_default),
        ):
            user_cols = {c["name"] for c in insp.get_columns("users")}
            if col not in user_cols:
                _migration_add_column(engine, "users", col, ddl)

    if "subscription_plans" in tables:
        plan_cols = {c["name"] for c in insp.get_columns("subscription_plans")}
        plan_migrations = (
            ("max_trading_sessions", "INTEGER"),
            ("max_tickers_per_session", "INTEGER"),
            ("max_supporting_tickers_per_session", "INTEGER"),
            ("tier_rank", "INTEGER NOT NULL DEFAULT 0"),
            ("entitlements_json", "TEXT"),
        )
        for col, ddl in plan_migrations:
            if col not in plan_cols:
                _migration_add_column(engine, "subscription_plans", col, ddl)
        try:
            with engine.connect() as conn:
                _backfill_plan_tier_ranks(conn)
                conn.commit()
        except Exception:
            pass


try:
    with engine.connect() as _conn:
        _conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMP"))
        _conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS max_sessions INTEGER NOT NULL DEFAULT 1"))
        _conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS max_trading_sessions INTEGER NOT NULL DEFAULT 5"))
        _conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS max_tickers_per_session INTEGER NOT NULL DEFAULT 5"))
        _conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS max_supporting_tickers_per_session INTEGER NOT NULL DEFAULT 5"))
        _conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS has_journal_access BOOLEAN DEFAULT FALSE"))
        _conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS dashboard_module_grants TEXT"))
        _conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100)"))
        _conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(100)"))
        _conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)"))
        _conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE"))
        _conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id VARCHAR(20)"))
        try:
            _conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_public_id "
                    "ON users (public_id) WHERE public_id IS NOT NULL"
                )
            )
        except Exception:
            pass
        _conn.commit()
except Exception:
    pass

_apply_entitlements_schema_migrations(engine)

try:
    PlanEntitlementAuditLog.__table__.create(bind=engine, checkfirst=True)
except Exception:
    pass

# Safe migration: indexes for hot queue/poll paths.
# The binary worker claims jobs every few seconds with
#   WHERE status = 'queued' ORDER BY created_at, id
# and reclaim/progress scans filter csv_aggregates by (file_id, status). Without
# these composite indexes those queries seq-scan under sustained traffic.
try:
    with engine.connect() as _conn:
        for _stmt in (
            "CREATE INDEX IF NOT EXISTS ix_binary_build_jobs_status_created "
            "ON binary_build_jobs (status, created_at)",
            "CREATE INDEX IF NOT EXISTS ix_csv_aggregates_file_status "
            "ON csv_aggregates (file_id, status)",
        ):
            _conn.execute(text(_stmt))
        _conn.commit()
except Exception:
    pass

# Safe migration: support ticket helpdesk columns.
try:
    with engine.connect() as _conn:
        for _stmt in (
            "ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS priority VARCHAR(16) NOT NULL DEFAULT 'normal'",
            "ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS assigned_to_user_id INTEGER",
            "ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS first_response_due_at TIMESTAMP",
            "ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS first_responded_at TIMESTAMP",
            "ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP",
            "ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP",
            "ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS ticket_extra TEXT",
            "ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS tags_json TEXT",
            "ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS related_thread_id INTEGER",
            "ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS csat_rating INTEGER",
            "ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS csat_comment TEXT",
            "ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS csat_at TIMESTAMP",
            "ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS admin_yes_no VARCHAR(8)",
            "ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP",
        ):
            _conn.execute(text(_stmt))
        _conn.commit()
        # Backfill SLA due date for open tickets missing it.
        _sla_h = max(1, int(os.getenv("SUPPORT_SLA_FIRST_RESPONSE_HOURS", "24")))
        try:
            _conn.execute(
                text(
                    "UPDATE support_threads SET first_response_due_at = "
                    f"datetime(created_at, '+{_sla_h} hours') "
                    "WHERE first_response_due_at IS NULL AND status IN ('open', 'pending')"
                )
            )
            _conn.commit()
        except Exception:
            pass
except Exception:
    pass

def _normalize_password_for_bcrypt(password: str) -> str:
    b = password.encode("utf-8")
    if len(b) <= 72:
        return password
    return hashlib.sha256(b).hexdigest()

def _hash_password(password: str) -> str:
    return pwd_context.hash(_normalize_password_for_bcrypt(password))

def _verify_password(password: str, password_hash: str) -> bool:
    """Verify against bcrypt (chart-created) or werkzeug pbkdf2 (journal-created) hashes."""
    # bcrypt (native chart format)
    try:
        if pwd_context.verify(_normalize_password_for_bcrypt(password), password_hash):
            return True
    except Exception:
        pass
    # werkzeug pbkdf2 (journal-backend format)
    try:
        from werkzeug.security import check_password_hash
        if check_password_hash(password_hash, password):
            return True
    except Exception:
        pass
    return False

def _is_https_request(request: Request | None) -> bool:
    if request is None:
        return False
    xf_proto = (request.headers.get("x-forwarded-proto") or "").split(",", 1)[0].strip().lower()
    if xf_proto:
        return xf_proto == "https"
    try:
        return (request.url.scheme or "").lower() == "https"
    except Exception:
        return False

def _set_session_cookie(response: Response, session_id: str, request: Request | None = None):
    secure_flag = SESSION_COOKIE_SECURE
    if _is_https_request(request):
        secure_flag = True
    elif request is not None:
        secure_flag = False
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_id,
        httponly=True,
        secure=secure_flag,
        samesite=SESSION_COOKIE_SAMESITE,
        max_age=SESSION_COOKIE_MAX_AGE_SECONDS,
        path="/",
    )

def _clear_session_cookie(response: Response):
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")


def _normalize_affiliate_code(raw: str | None) -> str | None:
    if not raw:
        return None
    s = raw.strip().upper()
    if len(s) < 2 or len(s) > 64:
        return None
    if not re.match(r"^[A-Z0-9][A-Z0-9_-]*$", s):
        return None
    return s


def _set_affiliate_cookie(response: Response, code: str, request: Request | None = None):
    normalized = _normalize_affiliate_code(code)
    if not normalized:
        return
    secure_flag = SESSION_COOKIE_SECURE
    if _is_https_request(request):
        secure_flag = True
    elif request is not None:
        secure_flag = False
    response.set_cookie(
        key=AFFILIATE_COOKIE_NAME,
        value=normalized,
        max_age=AFFILIATE_COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        secure=secure_flag,
        samesite=SESSION_COOKIE_SAMESITE,
        path="/",
    )


def _clear_affiliate_cookie(response: Response):
    response.delete_cookie(key=AFFILIATE_COOKIE_NAME, path="/")


def _affiliate_code_from_request(request: Request) -> str | None:
    return _normalize_affiliate_code(request.cookies.get(AFFILIATE_COOKIE_NAME))


def _affiliate_record_login_if_needed(db, affiliate_id: int, user_id: int) -> None:
    day_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    exists = (
        db.query(AffiliateEvent)
        .filter(
            AffiliateEvent.affiliate_id == affiliate_id,
            AffiliateEvent.user_id == user_id,
            AffiliateEvent.event_type == "login",
            AffiliateEvent.created_at >= day_start,
        )
        .first()
    )
    if exists:
        return
    db.add(
        AffiliateEvent(
            affiliate_id=affiliate_id,
            user_id=user_id,
            event_type="login",
            amount=None,
            currency=None,
        )
    )


def _affiliate_sync_purchases(db, user_id: int) -> None:
    att = db.query(AffiliateAttribution).filter(AffiliateAttribution.user_id == user_id).first()
    if not att:
        return
    paid = (
        db.query(Payment)
        .filter(
            Payment.user_id == user_id,
            Payment.status == "succeeded",
            Payment.refunded == False,
        )
        .all()
    )
    if not paid:
        return
    existing_pids = {
        e[0]
        for e in db.query(AffiliateEvent.payment_id)
        .filter(
            AffiliateEvent.user_id == user_id,
            AffiliateEvent.event_type == "purchase",
            AffiliateEvent.payment_id.isnot(None),
        )
        .all()
    }
    for p in paid:
        if p.id in existing_pids:
            continue
        db.add(
            AffiliateEvent(
                affiliate_id=att.affiliate_id,
                user_id=user_id,
                event_type="purchase",
                payment_id=p.id,
                amount=float(p.amount) if p.amount is not None else None,
                currency=(p.currency or "usd").lower(),
            )
        )


def _affiliate_post_auth(db, user: User, request: Request, explicit_code: str | None, *, is_signup: bool) -> None:
    code = _normalize_affiliate_code(explicit_code) or _affiliate_code_from_request(request)
    aff = None
    if code:
        aff = db.query(Affiliate).filter(Affiliate.promo_code == code, Affiliate.is_active == True).first()
    existing = db.query(AffiliateAttribution).filter(AffiliateAttribution.user_id == user.id).first()
    src = "body" if _normalize_affiliate_code(explicit_code) else "cookie"

    if aff and not existing:
        db.add(
            AffiliateAttribution(
                user_id=user.id,
                affiliate_id=aff.id,
                source=src,
            )
        )
        db.flush()
        db.add(
            AffiliateEvent(
                affiliate_id=aff.id,
                user_id=user.id,
                event_type="signup" if is_signup else "login",
                amount=None,
                currency=None,
            )
        )
    elif existing and not is_signup:
        _affiliate_record_login_if_needed(db, existing.affiliate_id, user.id)

    _affiliate_sync_purchases(db, user.id)


def _get_user_from_request(request: Request):
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    if not session_id:
        return None
    db = SessionLocal()
    try:
        sess = db.query(UserSession).filter(UserSession.id == session_id).first()
        if not sess:
            return None
        user = db.query(User).filter(User.id == sess.user_id).first()
        if not user or not user.is_active:
            return None
        # Revoke session when entitlement ended (admins exempt) — forces re-login with clear denial.
        if (user.role or "") != "admin" and not _user_entitles_journal_db(db, user):
            db.query(UserSession).filter(UserSession.user_id == user.id).delete()
            db.commit()
            return None
        sess.last_active_at = datetime.utcnow()
        db.commit()
        return user
    except Exception:
        db.rollback()
        return None
    finally:
        db.close()


def _get_user_from_websocket(ws: WebSocket):
    """Resolve session cookie to User for WebSocket connections (no last_active touch on every message)."""
    if not AUTH_ENABLED:
        return _ANON_USER
    session_id = ws.cookies.get(SESSION_COOKIE_NAME)
    if not session_id:
        return None
    db = SessionLocal()
    try:
        sess = db.query(UserSession).filter(UserSession.id == session_id).first()
        if not sess:
            return None
        user = db.query(User).filter(User.id == sess.user_id).first()
        if not user or not user.is_active:
            return None
        if (user.role or "") != "admin" and not _user_entitles_journal_db(db, user):
            return None
        return user
    except Exception:
        return None
    finally:
        db.close()


SUPPORT_SUBJECT_MAX = 500
SUPPORT_BODY_MAX = 8000
SUPPORT_IMAGE_MAX_BYTES = max(1024, int(os.getenv("SUPPORT_IMAGE_MAX_BYTES", str(2 * 1024 * 1024))))
SUPPORT_IMAGE_ALLOWED_MIME = frozenset({"image/jpeg", "image/png", "image/gif", "image/webp"})
SUPPORT_FILE_ALLOWED_MIME = SUPPORT_IMAGE_ALLOWED_MIME | frozenset(
    {"text/plain", "application/json", "text/json"}
)
SUPPORT_SLA_BUSINESS_HOURS = os.getenv("SUPPORT_SLA_BUSINESS_HOURS", "").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
SUPPORT_BH_START_HOUR = max(0, min(23, int(os.getenv("SUPPORT_BH_START_HOUR", "9"))))
SUPPORT_BH_END_HOUR = max(1, min(24, int(os.getenv("SUPPORT_BH_END_HOUR", "17"))))

# Anti-spam / auth limits: Redis sliding window when REDIS_URL is set (shared across workers); else in-memory.
SUPPORT_RATE_MSG_PER_MINUTE = max(1, int(os.getenv("SUPPORT_RATE_MSG_PER_MINUTE", "30")))
SUPPORT_RATE_THREAD_PER_HOUR = max(1, int(os.getenv("SUPPORT_RATE_THREAD_PER_HOUR", "10")))
SUPPORT_UNLIMITED_RATE_CATEGORIES = frozenset({"bug", "error"})
SUPPORT_SLA_FIRST_RESPONSE_HOURS = max(1, int(os.getenv("SUPPORT_SLA_FIRST_RESPONSE_HOURS", "24")))
SUPPORT_TICKET_URL_BASE = (
    os.getenv("SUPPORT_TICKET_URL_BASE", "/dashboard/profile/?tab=support&thread=").strip()
    or "/dashboard/profile/?tab=support&thread="
)
SUPPORT_CATEGORIES = frozenset(
    {
        "billing",
        "account",
        "access",
        "bug",
        "error",
        "feature",
        "modifications",
        "suggestions",
        "other",
    }
)
SUPPORT_STATUSES = frozenset({"open", "pending", "resolved", "user_replied", "closed"})
SUPPORT_ACTIVE_STATUSES = frozenset({"open", "pending", "user_replied"})
SUPPORT_ARCHIVABLE_STATUSES = frozenset({"closed", "resolved"})
SUPPORT_PRIORITIES = frozenset({"low", "normal", "high", "urgent"})
_support_msg_times: dict[int, deque] = {}
_support_thread_times: dict[int, deque] = {}
_support_rate_lock = threading.Lock()


def _support_rate_exempt(user: User) -> bool:
    """Admins are not throttled so staff can reply without hitting user limits."""
    return getattr(user, "role", None) == "admin"


def _support_category_rate_unlimited(cat: str | None) -> bool:
    """Bug/error reports are never throttled — users may report multiple issues quickly."""
    return (cat or "").strip().lower() in SUPPORT_UNLIMITED_RATE_CATEGORIES


def _sliding_window_allow_local(bucket: dict, key, lock: threading.Lock, max_events: int, window_sec: float) -> bool:
    """In-memory sliding window (per process). key is int (user id) or str (ip)."""
    now = time.monotonic()
    with lock:
        q = bucket.get(key)
        if q is None:
            q = deque()
            bucket[key] = q
        cutoff = now - window_sec
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= max_events:
            return False
        q.append(now)
        return True


def _redis_sliding_allow_or_local(
    redis_key: str,
    bucket: dict,
    bucket_key,
    lock: threading.Lock,
    max_events: int,
    window_sec: float,
    label: str,
) -> bool:
    if chart_redis.get_client() is not None:
        try:
            return chart_redis.sliding_window_allow(redis_key, max_events, window_sec)
        except Exception as exc:
            print(f"⚠️ Redis rate limit fallback ({label}): {exc}")
    return _sliding_window_allow_local(bucket, bucket_key, lock, max_events, window_sec)


def _support_rate_allow_message(uid: int) -> bool:
    rk = f"{chart_redis.KEY_PREFIX}rl:support:msg:{uid}"
    return _redis_sliding_allow_or_local(
        rk,
        _support_msg_times,
        uid,
        _support_rate_lock,
        SUPPORT_RATE_MSG_PER_MINUTE,
        60.0,
        "support_msg",
    )


def _support_rate_allow_new_thread(uid: int) -> bool:
    rk = f"{chart_redis.KEY_PREFIX}rl:support:thread:{uid}"
    return _redis_sliding_allow_or_local(
        rk,
        _support_thread_times,
        uid,
        _support_rate_lock,
        SUPPORT_RATE_THREAD_PER_HOUR,
        3600.0,
        "support_thread",
    )


# Public GET /api/affiliate/click — limit abuse (cookie spam / redirect probing).
AFFILIATE_CLICK_MAX_PER_MINUTE = max(10, int(os.getenv("AFFILIATE_CLICK_MAX_PER_MINUTE", "90")))
_affiliate_click_ip_times: dict[str, deque] = {}
_affiliate_click_rate_lock = threading.Lock()


def _client_ip_for_rate_limit(request: Request) -> str:
    xf = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if xf:
        return xf[:128]
    try:
        if request.client and request.client.host:
            return str(request.client.host)[:128]
    except Exception:
        pass
    return "unknown"


def _affiliate_click_rate_allow(ip: str) -> bool:
    safe = ip.replace(":", "_")[:200]
    rk = f"{chart_redis.KEY_PREFIX}rl:affiliate:{safe}"
    return _redis_sliding_allow_or_local(
        rk,
        _affiliate_click_ip_times,
        ip,
        _affiliate_click_rate_lock,
        AFFILIATE_CLICK_MAX_PER_MINUTE,
        60.0,
        "affiliate",
    )


# Brute-force / credential-stuffing mitigation. Tune via env.
AUTH_LOGIN_MAX_PER_MINUTE = max(5, int(os.getenv("AUTH_LOGIN_MAX_PER_MINUTE", "30")))
AUTH_SIGNUP_MAX_PER_MINUTE = max(3, int(os.getenv("AUTH_SIGNUP_MAX_PER_MINUTE", "12")))
_auth_rate_lock = threading.Lock()
_auth_login_ip_times: dict[str, deque] = {}
_auth_signup_ip_times: dict[str, deque] = {}


def _auth_ip_rate_allow(
    bucket: dict[str, deque],
    ip: str,
    max_n: int,
    window_sec: float = 60.0,
    *,
    redis_scope: str = "login",
) -> bool:
    safe = ip.replace(":", "_")[:200]
    rk = f"{chart_redis.KEY_PREFIX}rl:auth:{redis_scope}:{safe}"
    return _redis_sliding_allow_or_local(
        rk,
        bucket,
        ip,
        _auth_rate_lock,
        max_n,
        window_sec,
        f"auth_{redis_scope}",
    )


# Backtest / chart hot paths — per-user limits (Redis when configured, else in-memory per worker).
BACKTEST_SMART_RATE_PER_MINUTE = max(10, int(os.getenv("BACKTEST_SMART_RATE_PER_MINUTE", "90")))
BACKTEST_WHATIF_RATE_PER_MINUTE = max(5, int(os.getenv("BACKTEST_WHATIF_RATE_PER_MINUTE", "30")))
BACKTEST_SESSION_PATCH_RATE_PER_MINUTE = max(
    5, int(os.getenv("BACKTEST_SESSION_PATCH_RATE_PER_MINUTE", "60"))
)
_backtest_rate_lock = threading.Lock()
_backtest_smart_user_times: dict[int, deque] = {}
_backtest_whatif_user_times: dict[int, deque] = {}
_backtest_session_patch_user_times: dict[int, deque] = {}


def _backtest_rate_exempt(user: User) -> bool:
    return getattr(user, "role", None) == "admin"


def _backtest_user_rate_allow(user: User, scope: str) -> bool:
    """scope: smart | whatif | session_patch"""
    if _backtest_rate_exempt(user):
        return True
    uid = int(user.id)
    scopes: dict[str, tuple[dict[int, deque], int]] = {
        "smart": (_backtest_smart_user_times, BACKTEST_SMART_RATE_PER_MINUTE),
        "whatif": (_backtest_whatif_user_times, BACKTEST_WHATIF_RATE_PER_MINUTE),
        "session_patch": (_backtest_session_patch_user_times, BACKTEST_SESSION_PATCH_RATE_PER_MINUTE),
    }
    bucket, max_n = scopes.get(scope, (_backtest_smart_user_times, BACKTEST_SMART_RATE_PER_MINUTE))
    rk = f"{chart_redis.KEY_PREFIX}rl:backtest:{scope}:{uid}"
    return _redis_sliding_allow_or_local(
        rk,
        bucket,
        uid,
        _backtest_rate_lock,
        max_n,
        60.0,
        f"backtest_{scope}",
    )


def _enforce_backtest_user_rate(user: User, scope: str) -> None:
    if _backtest_user_rate_allow(user, scope):
        return
    raise HTTPException(
        status_code=429,
        detail="Too many requests. Please try again in a minute.",
        headers={"Retry-After": "60"},
    )


def _support_thread_archived(t: SupportThread | None) -> bool:
    return t is not None and getattr(t, "archived_at", None) is not None


def _support_user_can_access_thread(user: User, thread: SupportThread) -> bool:
    if user.role != "admin":
        if _support_thread_archived(thread) and (thread.status or "") not in SUPPORT_ACTIVE_STATUSES:
            return False
    if user.role == "admin":
        return True
    return int(thread.user_id) == int(user.id)


def _support_require_thread_access(user: User, t: SupportThread | None) -> SupportThread:
    """Return thread or raise 404 (hidden/archived tickets look deleted to users)."""
    if not t or not _support_user_can_access_thread(user, t):
        raise HTTPException(status_code=404, detail="Thread not found")
    return t


def _support_exclude_archived(query):
    return query.filter(SupportThread.archived_at.is_(None))


def _support_inbox_visible_filter(query):
    """Show non-archived tickets, plus active queue tickets even if mistakenly archived."""
    return query.filter(
        or_(
            SupportThread.archived_at.is_(None),
            SupportThread.status.in_(tuple(SUPPORT_ACTIVE_STATUSES)),
        )
    )


def _support_heal_archived_active_tickets(db) -> int:
    """Clear archived_at on open/pending/user_replied tickets (legacy bulk-archive mistakes)."""
    now = datetime.utcnow()
    n = (
        db.query(SupportThread)
        .filter(
            SupportThread.archived_at.isnot(None),
            SupportThread.status.in_(tuple(SUPPORT_ACTIVE_STATUSES)),
        )
        .update({SupportThread.archived_at: None, SupportThread.updated_at: now}, synchronize_session=False)
    )
    if n:
        db.commit()
    return int(n or 0)


def _support_heal_thread_if_active(db, t: SupportThread | None) -> None:
    if not t or not _support_thread_archived(t):
        return
    if (t.status or "") not in SUPPORT_ACTIVE_STATUSES:
        return
    t.archived_at = None
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)


def _support_import_candidates_query(db, user_id: int | None = None):
    """Archived tickets users may still need, or that had activity after bulk archive."""
    q = db.query(SupportThread).filter(SupportThread.archived_at.isnot(None))
    if user_id is not None:
        q = q.filter(SupportThread.user_id == int(user_id))
    activity_after_archive = and_(
        SupportThread.last_message_at.isnot(None),
        SupportThread.archived_at.isnot(None),
        SupportThread.last_message_at > SupportThread.archived_at,
    )
    created_after_archive = and_(
        SupportThread.archived_at.isnot(None),
        SupportThread.created_at > SupportThread.archived_at,
    )
    return q.filter(
        or_(
            SupportThread.status.in_(tuple(SUPPORT_ACTIVE_STATUSES)),
            activity_after_archive,
            created_after_archive,
        )
    )


def _support_import_preview_row(db, t: SupportThread) -> dict:
    u = db.query(User).filter(User.id == t.user_id).first()
    return {
        "id": t.id,
        "ticket_ref": _support_ticket_ref(t.id),
        "user_id": t.user_id,
        "user_email": u.email if u else None,
        "user_name": u.name if u else None,
        "subject": (t.subject or "")[:160],
        "status": t.status,
        "archived_at": t.archived_at.isoformat() if t.archived_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "last_message_at": t.last_message_at.isoformat() if t.last_message_at else None,
        "reason": (
            "active_status"
            if (t.status or "") in SUPPORT_ACTIVE_STATUSES
            else (
                "created_after_archive"
                if t.archived_at and t.created_at and t.created_at > t.archived_at
                else "activity_after_archive"
            )
        ),
    }


def _support_parse_ticket_ref(ref: str | None) -> int | None:
    s = (ref or "").strip().upper()
    if not s.startswith("TAL-"):
        return None
    tail = s[4:].lstrip("0") or "0"
    try:
        return int(tail)
    except ValueError:
        return None


def _support_user_export_thread_row(db, t: SupportThread) -> dict:
    last = (
        db.query(SupportMessage)
        .filter(SupportMessage.thread_id == t.id, SupportMessage.is_internal == False)
        .order_by(SupportMessage.id.desc())
        .first()
    )
    preview = (last.body[:200] + "…") if last and len(last.body or "") > 200 else (last.body if last else None)
    msg_count = (
        db.query(func.count(SupportMessage.id))
        .filter(SupportMessage.thread_id == t.id, SupportMessage.is_internal == False)
        .scalar()
        or 0
    )
    return {
        "id": int(t.id),
        "ticket_ref": _support_ticket_ref(t.id),
        "subject": t.subject or "",
        "category": t.category or "other",
        "status": t.status or "open",
        "priority": t.priority or "normal",
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "last_message_at": t.last_message_at.isoformat() if t.last_message_at else None,
        "archived_at": t.archived_at.isoformat() if t.archived_at else None,
        "message_count": int(msg_count),
        "last_message_preview": preview,
    }


def _support_import_ids_from_export(payload: dict) -> tuple[list[int], dict]:
    """Return unique thread ids from a user export payload."""
    threads = payload.get("threads")
    if not isinstance(threads, list):
        raise HTTPException(status_code=400, detail="Export file must contain a threads array")
    ids: list[int] = []
    seen: set[int] = set()
    skipped = 0
    for row in threads:
        if not isinstance(row, dict):
            skipped += 1
            continue
        tid = row.get("id")
        if tid is None:
            tid = _support_parse_ticket_ref(str(row.get("ticket_ref") or ""))
        try:
            tid_int = int(tid)
        except (TypeError, ValueError):
            skipped += 1
            continue
        if tid_int <= 0 or tid_int in seen:
            continue
        seen.add(tid_int)
        ids.append(tid_int)
    return ids, {
        "export_user_id": (payload.get("user") or {}).get("id"),
        "export_user_email": (payload.get("user") or {}).get("email"),
        "skipped_rows": skipped,
    }


class SupportConnectionManager:
    """WebSocket connections subscribed to a support thread."""

    def __init__(self):
        self.by_thread: dict[int, set] = {}

    def subscribe(self, ws: WebSocket, thread_id: int):
        """Register an already-accepted socket for a thread."""
        if thread_id not in self.by_thread:
            self.by_thread[thread_id] = set()
        self.by_thread[thread_id].add(ws)

    def disconnect(self, ws: WebSocket, thread_id: int):
        if thread_id in self.by_thread:
            self.by_thread[thread_id].discard(ws)
            if not self.by_thread[thread_id]:
                del self.by_thread[thread_id]

    async def broadcast(self, thread_id: int, message: dict):
        if thread_id not in self.by_thread:
            return
        dead = []
        for w in self.by_thread[thread_id]:
            try:
                await w.send_json(message)
            except Exception:
                dead.append(w)
        for w in dead:
            self.by_thread[thread_id].discard(w)


support_ws_manager = SupportConnectionManager()


class InboxConnectionManager:
    """WebSocket connections subscribed to live notification pings for a user."""

    def __init__(self):
        self.by_user: dict[int, set] = {}

    def subscribe(self, ws: WebSocket, user_id: int):
        if user_id not in self.by_user:
            self.by_user[user_id] = set()
        self.by_user[user_id].add(ws)

    def disconnect(self, ws: WebSocket, user_id: int):
        if user_id in self.by_user:
            self.by_user[user_id].discard(ws)
            if not self.by_user[user_id]:
                del self.by_user[user_id]

    async def broadcast_user(self, user_id: int, message: dict):
        if user_id not in self.by_user:
            return
        dead = []
        for w in self.by_user[user_id]:
            try:
                await w.send_json(message)
            except Exception:
                dead.append(w)
        for w in dead:
            self.by_user[user_id].discard(w)


inbox_ws_manager = InboxConnectionManager()


async def _push_inbox_notification_pings(recipient_ids: list[int], thread_id: int, message_id: int | None):
    for uid in recipient_ids:
        await inbox_ws_manager.broadcast_user(
            uid,
            {"type": "notification_ping", "thread_id": thread_id, "message_id": message_id},
        )


@app.get("/api/sessions/{session_id}/analytics")
async def get_trading_session_analytics(session_id: int, request: Request):
    user = _require_paid_journal_user(request)
    db = SessionLocal()
    try:
        s = db.query(TradingSession).filter(TradingSession.id == session_id).first()
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")
        if not _can_access_trading_session(user, s):
            raise HTTPException(status_code=403, detail="Forbidden")

        st = _get_or_create_trading_session_state(db, session_id=s.id, user_id=s.user_id)
        state = _parse_json_dict(st.state_json)
        journal = sjs.resolve_session_journal(
            db,
            s.id,
            s.user_id,
            state,
            journal_trade_model=TradingSessionJournalTrade,
            sync_fn=_sync_trading_session_journal_trades,
        )
        session_public = _session_public_dict(s)
        analytics = _compute_session_analytics(session_public, journal)
        return {"analytics": _sanitize_for_json(analytics)}
    finally:
        db.close()


class BacktestWhatIfRequest(BaseModel):
    session_id: int
    pair_filter: str = "ALL"
    playbook_filter: str = "ALL"
    strategy_filter: str = "ALL"
    outcome_filter: str = "ALL"
    heatmap_pair: str = "ALL"
    tp_r: float = 1.5
    sl_r: float = 1.0


def _trade_setup_label(trade: dict) -> str:
    setup = (
        trade.get("setup")
        or (trade.get("preTradeNotes") or {}).get("setup")
        or (trade.get("postTradeNotes") or {}).get("setup")
    )
    if setup:
        return str(setup).strip() or "General"
    tags = (trade.get("preTradeNotes") or {}).get("tags")
    if isinstance(tags, str) and tags.strip():
        first = tags.split(",")[0].strip()
        return first or "General"
    return "General"


def _parse_strategy_filter(strategy_filter: str) -> tuple[int | None, str | None]:
    sf = str(strategy_filter or "ALL").strip()
    if not sf or sf.upper() == "ALL":
        return None, None
    if sf.startswith("strategy:"):
        try:
            return int(sf.split(":", 1)[1]), None
        except Exception:
            return None, None
    if sf.isdigit():
        try:
            return int(sf), None
        except Exception:
            return None, None
    return None, sf


def _passes_strategy_filter(
    trade: dict,
    strategy_filter: str,
    *,
    session_strategy_id: int | None = None,
) -> bool:
    target_id, target_name = _parse_strategy_filter(strategy_filter)
    if target_id is None and not target_name:
        return True
    if (
        target_id is not None
        and session_strategy_id is not None
        and int(session_strategy_id) == int(target_id)
    ):
        return True
    for k in ("strategy_id", "strategyId"):
        v = trade.get(k)
        if v is not None and target_id is not None:
            try:
                if int(v) == int(target_id):
                    return True
            except Exception:
                pass
    setup = _trade_setup_label(trade).lower()
    if target_name and setup == str(target_name).strip().lower():
        return True
    tags = (trade.get("preTradeNotes") or {}).get("tags") if isinstance(trade.get("preTradeNotes"), dict) else None
    if target_name and isinstance(tags, str):
        parts = [p.strip().lower() for p in tags.split(",") if p.strip()]
        tn = str(target_name).strip().lower()
        if tn in parts or any(tn in p for p in parts):
            return True
    return False


def _filter_journal_raw_trades(
    journal: list,
    pair_filter: str,
    playbook_filter: str,
    outcome_filter: str,
    strategy_filter: str = "ALL",
    session_strategy_id: int | None = None,
) -> list[dict]:
    pair_f = str(pair_filter or "ALL").strip().upper().replace("/", "")
    playbook_f = str(playbook_filter or "ALL").strip()
    outcome_f = str(outcome_filter or "ALL").strip().upper()
    out: list[dict] = []
    for t in journal:
        if not isinstance(t, dict):
            continue
        ticker = str(t.get("ticker") or t.get("symbol") or "UNKNOWN").strip().upper().replace("/", "")
        pnl = float(t.get("netPnL", t.get("realizedPnL", t.get("pnl", 0.0))) or 0.0)
        setup = _trade_setup_label(t)
        pass_pair = pair_f == "ALL" or ticker == pair_f
        pass_playbook = playbook_f == "ALL" or setup == playbook_f
        pass_strategy = _passes_strategy_filter(
            t, strategy_filter, session_strategy_id=session_strategy_id
        )
        pass_outcome = (
            outcome_f == "ALL"
            or (outcome_f == "WINNERS" and pnl > 0)
            or (outcome_f == "LOSERS" and pnl < 0)
            or (outcome_f == "BREAKEVEN" and pnl == 0)
        )
        if pass_pair and pass_playbook and pass_strategy and pass_outcome:
            out.append(t)
    return out


def _compute_backtest_whatif_for_session(
    db,
    *,
    session_id: int,
    pair_filter: str,
    playbook_filter: str,
    strategy_filter: str,
    outcome_filter: str,
    heatmap_pair: str,
    tp_r: float,
    sl_r: float,
) -> dict:
    s = db.query(TradingSession).filter(TradingSession.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    st = _get_or_create_trading_session_state(db, session_id=s.id, user_id=s.user_id)
    state = _parse_json_dict(st.state_json)
    journal = sjs.resolve_session_journal(
        db,
        s.id,
        s.user_id,
        state,
        journal_trade_model=TradingSessionJournalTrade,
        sync_fn=_sync_trading_session_journal_trades,
    )

    cfg: dict = {}
    try:
        cfg = json.loads(s.config_json) if s.config_json else {}
    except Exception:
        cfg = {}
    sess_strategy_id = bw.session_strategy_id_from_config(cfg)
    session_pub = _session_public_dict(s)
    start_bal = _to_float(session_pub.get("start_balance"))

    result = bw.compute_backtest_whatif_payload(
        session_id=int(session_id),
        journal=journal,
        session_public=session_pub,
        sess_strategy_id=sess_strategy_id,
        pair_filter=pair_filter,
        playbook_filter=playbook_filter,
        strategy_filter=strategy_filter,
        outcome_filter=outcome_filter,
        heatmap_pair=heatmap_pair,
        tp_r=tp_r,
        sl_r=sl_r,
        start_balance=start_bal,
    )
    result["session_analytics"] = _sanitize_for_json(result.get("session_analytics"))
    return result


def _execute_whatif_job_record(job: dict) -> dict:
    session_id = int(job["session_id"])
    db = SessionLocal()
    try:
        return _compute_backtest_whatif_for_session(
            db,
            session_id=session_id,
            pair_filter=str(job.get("pair_filter") or "ALL"),
            playbook_filter=str(job.get("playbook_filter") or "ALL"),
            strategy_filter=str(job.get("strategy_filter") or "ALL"),
            outcome_filter=str(job.get("outcome_filter") or "ALL"),
            heatmap_pair=str(job.get("heatmap_pair") or "ALL"),
            tp_r=float(job.get("tp_r") or 1.5),
            sl_r=float(job.get("sl_r") or 1.0),
        )
    finally:
        db.close()


def _process_next_whatif_job() -> bool:
    job_id = chart_redis.whatif_pop_job_nonblocking()
    if not job_id:
        return False
    job = chart_redis.whatif_get_job(job_id)
    if not job:
        return True
    job["status"] = "running"
    chart_redis.whatif_set_job(job_id, job, bw.WHATIF_JOB_TTL_SEC)
    cache_key = str(job.get("cache_key") or "")
    try:
        result = _execute_whatif_job_record(job)
        body = json.dumps(result, separators=(",", ":"))
        if len(body) <= bw.WHATIF_MAX_RESULT_BYTES:
            if cache_key:
                bw.set_cached_whatif(cache_key, result)
            job["status"] = "done"
            job["result"] = result
            job.pop("error", None)
        else:
            job["status"] = "failed"
            job["error"] = "What-if result too large to cache"
    except HTTPException as exc:
        job["status"] = "failed"
        job["error"] = str(exc.detail) if exc.detail else "Session not found"
    except Exception as exc:
        job["status"] = "failed"
        job["error"] = str(exc)[:500]
    chart_redis.whatif_set_job(job_id, job, bw.WHATIF_JOB_TTL_SEC)
    return True


@app.post("/api/analytics/backtest/whatif")
async def get_backtest_whatif(payload: BacktestWhatIfRequest, request: Request):
    user = _require_paid_journal_user(request)
    _enforce_backtest_user_rate(user, "whatif")
    db = SessionLocal()
    try:
        s = db.query(TradingSession).filter(TradingSession.id == payload.session_id).first()
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")
        if not _can_access_trading_session(user, s):
            raise HTTPException(status_code=403, detail="Forbidden")

        st = _get_or_create_trading_session_state(db, session_id=s.id, user_id=s.user_id)
        jver = bw.journal_version_token(st.updated_at)
        cache_key = bw.build_whatif_cache_key(
            session_id=int(payload.session_id),
            pair_filter=str(payload.pair_filter or "ALL"),
            playbook_filter=str(payload.playbook_filter or "ALL"),
            strategy_filter=str(payload.strategy_filter or "ALL"),
            outcome_filter=str(payload.outcome_filter or "ALL"),
            heatmap_pair=str(payload.heatmap_pair or "ALL"),
            tp_r=float(payload.tp_r),
            sl_r=float(payload.sl_r),
            journal_version=jver,
        )

        cached = bw.get_cached_whatif(cache_key)
        if cached is not None:
            return cached

        if not bw.whatif_async_available():
            return _compute_backtest_whatif_for_session(
                db,
                session_id=int(payload.session_id),
                pair_filter=str(payload.pair_filter or "ALL"),
                playbook_filter=str(payload.playbook_filter or "ALL"),
                strategy_filter=str(payload.strategy_filter or "ALL"),
                outcome_filter=str(payload.outcome_filter or "ALL"),
                heatmap_pair=str(payload.heatmap_pair or "ALL"),
                tp_r=float(payload.tp_r),
                sl_r=float(payload.sl_r),
            )

        job_id = bw.new_job_id()
        job = {
            "job_id": job_id,
            "user_id": int(user.id),
            "status": "queued",
            "cache_key": cache_key,
            "session_id": int(payload.session_id),
            "pair_filter": str(payload.pair_filter or "ALL"),
            "playbook_filter": str(payload.playbook_filter or "ALL"),
            "strategy_filter": str(payload.strategy_filter or "ALL"),
            "outcome_filter": str(payload.outcome_filter or "ALL"),
            "heatmap_pair": str(payload.heatmap_pair or "ALL"),
            "tp_r": float(payload.tp_r),
            "sl_r": float(payload.sl_r),
            "journal_version": jver,
        }
        if not bw.enqueue_whatif_job(job):
            return _compute_backtest_whatif_for_session(
                db,
                session_id=int(payload.session_id),
                pair_filter=job["pair_filter"],
                playbook_filter=job["playbook_filter"],
                strategy_filter=job["strategy_filter"],
                outcome_filter=job["outcome_filter"],
                heatmap_pair=job["heatmap_pair"],
                tp_r=job["tp_r"],
                sl_r=job["sl_r"],
            )

        return JSONResponse(
            status_code=202,
            content={"job_id": job_id, "status": "queued"},
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()


@app.get("/api/analytics/backtest/whatif/jobs/{job_id}")
async def get_backtest_whatif_job(job_id: str, request: Request):
    user = _require_paid_journal_user(request)
    job = bw.get_whatif_job(job_id.strip())
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if int(job.get("user_id", -1)) != int(user.id) and getattr(user, "role", None) != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    status = str(job.get("status") or "queued")
    out: dict = {"job_id": job_id, "status": status}
    if status == "done":
        result = job.get("result")
        if not isinstance(result, dict):
            ck = str(job.get("cache_key") or "")
            result = bw.get_cached_whatif(ck) if ck else None
        if isinstance(result, dict):
            out["result"] = result
    elif status == "failed":
        out["error"] = str(job.get("error") or "What-if job failed")
    return out


@app.get("/api/sessions/{session_id}/trades/{trade_id}/screenshot")
async def get_trading_session_trade_screenshot(session_id: int, trade_id: str, kind: str = "entry", request: Request = None):
    user = _require_paid_journal_user(request)
    db = SessionLocal()
    try:
        s = db.query(TradingSession).filter(TradingSession.id == session_id).first()
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")
        if not _can_access_trading_session(user, s):
            raise HTTPException(status_code=403, detail="Forbidden")

        st = _get_or_create_trading_session_state(db, session_id=s.id, user_id=s.user_id)
        state = _parse_json_dict(st.state_json)
        journal = state.get("journal") if isinstance(state.get("journal"), list) else []

        wanted = str(trade_id)
        found = None
        for t in journal:
            if not isinstance(t, dict):
                continue
            tid = t.get("tradeId") or t.get("id")
            if tid is None:
                continue
            if str(tid) == wanted:
                found = t
                break

        if not found:
            raise HTTPException(status_code=404, detail="Trade not found")

        k = (kind or "").lower()
        if k not in ("entry", "exit"):
            raise HTTPException(status_code=400, detail="Invalid kind")

        img = None
        if k == "exit":
            img = found.get("exitScreenshot")
        else:
            img = found.get("entryScreenshot")
            if not img:
                es = found.get("entryScreenshots")
                if isinstance(es, list) and es:
                    first = es[0]
                    if isinstance(first, dict):
                        img = first.get("screenshot")

        if not img or not isinstance(img, str):
            return Response(status_code=204)

        s = img.strip()
        if not s:
            return Response(status_code=204)

        media_type = "image/png"
        b64 = None
        if s.startswith("data:") and ";base64," in s:
            try:
                header, b64 = s.split(",", 1)
                media_type = header.split(";", 1)[0].split(":", 1)[1] or media_type
            except Exception:
                b64 = None

        data = None
        try:
            if b64 is not None:
                data = base64.b64decode(b64)
            else:
                data = base64.b64decode(s)
        except Exception:
            data = None

        if data is None:
            raise HTTPException(status_code=415, detail="Unsupported screenshot format")

        return Response(content=data, media_type=media_type)
    finally:
        db.close()

def _request_requires_journal_for_backtest(path: str, request: Request) -> bool:
    """Paths that load backtest / prop-firm replay UI — require subscription (admins exempt)."""
    if path in (
        "/chart/backtesting.html",
        "/chart/propfirm-backtest.html",
        "/backtesting.html",
        "/propfirm-backtest.html",
    ):
        return True
    if path.startswith("/backtest"):
        return True
    if path not in ("/chart/index.html", "/index.html"):
        return False
    try:
        qs = parse_qs(urlparse(str(request.url)).query)
        mode = (qs.get("mode") or [""])[0].strip().lower()
        if mode in ("backtest", "propfirm"):
            return True
    except Exception:
        pass
    return False


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if not AUTH_ENABLED:
        return await call_next(request)

    path = request.url.path or "/"

    public_paths = {
        "/",
        "/login",
        "/login/",
        "/register",
        "/register/",
        "/api/bootcamp/register",
        "/bootcamp",
        "/bootcamp/",
        "/ninjatrader",
        "/ninjatrader/",
        "/terms",
        "/terms/",
        "/privacy",
        "/privacy/",
        "/refunds",
        "/refunds/",
        "/disclaimer",
        "/disclaimer/",
        "/logo-04.png",
        "/logo-08.png",
        "/talaria-chart.png",
        "/talaria chart.png",
    }

    public_prefixes = (
        "/_next/",
        "/assets/ninjatrader/",
        "/api/auth/",
    )

    if path in public_paths or any(path.startswith(p) for p in public_prefixes):
        return await call_next(request)

    protected = False
    if path.startswith("/chart"):
        protected = True
    if path.startswith("/dashboard"):
        protected = True
    if path in {"/index.html", "/backtesting.html"}:
        protected = True
    if path.startswith("/api/") and not (
        path == "/api/status"
        or path.startswith("/api/auth/")
        or path.startswith("/api/affiliate/")
    ):
        protected = True

    if not protected:
        return await call_next(request)

    user = _get_user_from_request(request)
    if user is not None:
        # Gate backtest / replay UI (including ?mode=backtest on main chart) behind subscription
        if _request_requires_journal_for_backtest(path, request):
            if not _chart_user_has_module(user, "backtest"):
                return RedirectResponse(url="/pricing/?browse=1")
        # Historical tiles / conversion status are paid chart data (auth already required above).
        if path.startswith("/api/file/") and not _chart_user_has_module(user, "chart"):
            return JSONResponse(
                {"detail": "Active subscription required to use chart market data"},
                status_code=403,
            )
        return await call_next(request)

    if path.startswith("/api/"):
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)

    target = path
    if request.url.query:
        target = f"{path}?{request.url.query}"
    return RedirectResponse(url=f"/login/?next={quote(target, safe='')}")

# ── Startup: backfill binary files for existing CSV files ──
def _backfill_binaries():
    """Check all existing CSV files and build binary files for any that are missing."""
    if APP_ROLE == "worker":
        print("⏭️ Skipping binary backfill in worker role")
        return
    if SKIP_BINARY_BACKFILL_ON_STARTUP:
        print("⏭️ Skipping binary backfill on startup (SKIP_BINARY_BACKFILL_ON_STARTUP=true)")
        return

    import threading

    def _run():
        db = SessionLocal()
        try:
            files = db.query(CSVFile).all()
            required_tfs = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1mo']
            for f in files:
                aggregate_rows = db.query(CSVAggregate).filter(CSVAggregate.file_id == f.id).all()
                aggregate_map = {a.timeframe: a for a in aggregate_rows}

                missing_or_unready = any(
                    (tf not in aggregate_map) or (aggregate_map[tf].status != "ready")
                    for tf in required_tfs
                )

                missing_files = any(
                    not (BIN_DIR / f"bin_{f.id}_{tf}.bin").exists()
                    for tf in required_tfs
                )

                missing_tiles = any(
                    not _tile_meta_path(f.id, tf).exists()
                    for tf in required_tfs
                )

                # Detect older/invalid binaries (e.g., non-monotonic timestamps)
                bin_1m = BIN_DIR / f"bin_{f.id}_1m.bin"
                invalid_1m = bin_1m.exists() and not _bin_has_valid_time_order(bin_1m)

                if not (missing_or_unready or missing_files or missing_tiles or invalid_1m):
                    continue

                fpath = _resolve_dataset_csv_path(f.filename)
                if fpath.exists():
                    reason = []
                    if missing_or_unready:
                        reason.append("aggregate status")
                    if missing_files:
                        reason.append("missing bin files")
                    if missing_tiles:
                        reason.append("missing tiles")
                    if invalid_1m:
                        reason.append("invalid 1m timestamps")
                    print(f"📦 Backfilling binary for file {f.id} ({f.original_name}) - {', '.join(reason)}")
                    build_binary_for_file(
                        f.id,
                        fpath,
                        f.original_name,
                        run_async=True,
                        trigger="backfill",
                    )
        except Exception as exc:
            print(f"⚠️ Backfill check error: {exc}")
        finally:
            db.close()

    t = threading.Thread(target=_run, daemon=True)
    t.start()

# Helper functions
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def count_csv_rows(file_path: str) -> int:
    """Count data rows in a CSV (streaming; safe for multi-million-row files)."""
    try:
        n = 0
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                if line.strip():
                    n += 1
        return max(0, n - 1)  # exclude header
    except Exception:
        return 0


def _csv_has_data_rows(file_path: str | Path) -> bool:
    """True if the CSV has at least one non-header data row (without scanning the whole file)."""
    try:
        p = Path(file_path)
        if p.stat().st_size < 32:
            return False
    except OSError:
        return False
    try:
        with open(p, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                s = line.strip()
                if not s:
                    continue
                first = s.split(",", 1)[0].strip().strip('"').lower()
                if first in {"timestamp", "datetime", "date", "time"}:
                    continue
                return True
    except OSError:
        return False
    return False


def _build_csvfile_ticker_cache() -> list[CSVFile]:
    """Snapshot dataset registry rows for ticker-based upsert matching (one query per import job)."""
    db = SessionLocal()
    try:
        return list(db.query(CSVFile).all())
    finally:
        db.close()


def _pick_csvfile_by_canonical_ticker(
    rows: list[CSVFile],
    wanted_ticker: str,
    wanted_class: str | None,
) -> CSVFile | None:
    wanted_ticker = (wanted_ticker or "").strip().upper()
    if not wanted_ticker:
        return None
    firstrate_matches: list[CSVFile] = []
    any_source_matches: list[CSVFile] = []
    for cand in rows:
        cand_orig = cand.original_name or ""
        cand_ticker = (_firstrate_extract_ticker_from_filename(cand_orig) or "").upper()
        if not cand_ticker or cand_ticker != wanted_ticker:
            continue
        if wanted_class:
            cand_class = _firstrate_classify_ticker(cand_ticker)
            if cand_class != wanted_class:
                continue
        cand_disk = (cand.filename or "").lower()
        if "_firstrate_" in cand_disk:
            firstrate_matches.append(cand)
        else:
            any_source_matches.append(cand)
    matches = firstrate_matches or any_source_matches
    if not matches:
        return None
    return max(matches, key=lambda r: int(r.row_count or 0))

def _dataset_file_public_dict(db_file: CSVFile) -> dict:
    return {
        "id": db_file.id,
        "filename": db_file.original_name,
        "rowCount": int(db_file.row_count or 0),
        "uploadDate": db_file.upload_date.isoformat() if db_file.upload_date else None,
    }

def _store_dataset_file(
    file_path: Path,
    original_name: str,
    description: str | None = None,
    *,
    skip_binary_build: bool = False,
):
    row_count = count_csv_rows(file_path)
    db = SessionLocal()
    try:
        db_file = CSVFile(
            filename=file_path.name,
            original_name=original_name,
            row_count=row_count,
            description=(description or f"Uploaded on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        )
        db.add(db_file)
        db.commit()
        db.refresh(db_file)

        if not skip_binary_build:
            build_binary_for_file(db_file.id, file_path, original_name)

        return {
            "success": True,
            "file": _dataset_file_public_dict(db_file)
        }
    except Exception as e:
        db.rollback()
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        db.close()


def _external_sort_csv_by_timestamp(path: Path) -> Path:
    """GNU sort by first column (epoch ms). Returns a temp path; caller must unlink."""
    import subprocess

    if not path.exists():
        raise ValueError(f"missing csv for sort: {path}")
    out = path.with_suffix(path.suffix + ".tsorted.tmp")
    size_mb = max(1, path.stat().st_size // (1024 * 1024))
    timeout_sec = max(300, min(7200, size_mb * 4))
    try:
        subprocess.run(
            ["sort", "-t,", "-k1,1n", "-o", str(out), str(path)],
            check=True,
            timeout=timeout_sec,
        )
    except FileNotFoundError as exc:
        raise ValueError(
            "CSV not sorted and `sort` unavailable — use week bundles or re-normalize"
        ) from exc
    except subprocess.CalledProcessError as exc:
        raise ValueError(f"external sort failed for {path.name}") from exc
    return out


def _merge_canonical_ohlcv_csvs(existing: Path, incoming: Path, dest: Path) -> tuple[int, int]:
    """
    Merge two canonical OHLCV CSVs (header `timestamp,open,high,low,close,volume`,
    ascending epoch-ms timestamps) into `dest`. On timestamp collisions the
    incoming row wins — the vendor's latest print for that minute replaces any
    partial/preliminary bar we may have imported before.

    Inputs are expected to be already sorted (they are when produced by
    `normalize_firstrate_csv_to_standard`). If one of them turns out not to be,
    we fall back to a dict-based merge that sorts in Python — slower but safe.

    Returns `(rows_out, new_rows_added)` where `new_rows_added` is how many of
    the incoming timestamps were not already present in `existing` (useful for
    progress messages / deciding whether the merge was worthwhile).
    """
    import heapq

    header = ["timestamp", "open", "high", "low", "close", "volume"]

    def iter_rows(path: Path, priority: int):
        # priority=0 → incoming (wins on tie), priority=1 → existing
        with open(path, "r", newline="", encoding="utf-8") as f:
            r = csv.reader(f)
            next(r, None)  # discard header
            for row in r:
                if not row:
                    continue
                try:
                    ts = int(float(row[0]))
                except (ValueError, IndexError):
                    continue
                yield ts, priority, row

    # Track which incoming timestamps were already present so we can report
    # how many genuinely-new bars the merge added.
    existing_ts: set[int] = set()
    try:
        # Fast path: sorted streaming merge. Raises if either input is not sorted.
        tmp = dest.with_suffix(dest.suffix + ".merge.tmp")
        rows_out = 0
        last_ts: int | None = None
        with open(tmp, "w", newline="", encoding="utf-8") as outf:
            w = csv.writer(outf)
            w.writerow(header)
            merged = heapq.merge(
                iter_rows(incoming, 0),
                iter_rows(existing, 1),
            )
            for ts, prio, row in merged:
                if prio == 1:
                    existing_ts.add(ts)
                if last_ts is not None and ts == last_ts:
                    # Duplicate timestamp — heapq.merge already emitted the
                    # winning (lower-priority-number) row.
                    continue
                if last_ts is not None and ts < last_ts:
                    raise ValueError("csv-not-sorted")
                w.writerow(row)
                last_ts = ts
                rows_out += 1
        tmp.replace(dest)
    except ValueError:
        # Large unsorted merges used to load entire CSVs into RAM (hours / OOM).
        merge_row_cap = max(
            200_000, int(os.getenv("MERGE_DICT_FALLBACK_MAX_ROWS", "1500000"))
        )
        try:
            est_rows = count_csv_rows(str(existing)) + count_csv_rows(str(incoming))
        except Exception:
            est_rows = merge_row_cap + 1
        if est_rows > merge_row_cap:
            ex_sorted = _external_sort_csv_by_timestamp(existing)
            in_sorted = _external_sort_csv_by_timestamp(incoming)
            try:
                return _merge_canonical_ohlcv_csvs(ex_sorted, in_sorted, dest)
            finally:
                for p in (ex_sorted, in_sorted):
                    if p != existing and p != incoming:
                        try:
                            p.unlink(missing_ok=True)
                        except Exception:
                            pass
        # Fallback: load both into a dict keyed by timestamp. Incoming wins on
        # collision. Sort the union and re-emit (small files only).
        merged_map: dict[int, list[str]] = {}
        existing_ts.clear()
        with open(existing, "r", newline="", encoding="utf-8") as f:
            r = csv.reader(f)
            next(r, None)
            for row in r:
                if not row:
                    continue
                try:
                    ts = int(float(row[0]))
                except (ValueError, IndexError):
                    continue
                merged_map[ts] = row
                existing_ts.add(ts)
        with open(incoming, "r", newline="", encoding="utf-8") as f:
            r = csv.reader(f)
            next(r, None)
            for row in r:
                if not row:
                    continue
                try:
                    ts = int(float(row[0]))
                except (ValueError, IndexError):
                    continue
                merged_map[ts] = row  # incoming wins
        tmp = dest.with_suffix(dest.suffix + ".merge.tmp")
        rows_out = 0
        with open(tmp, "w", newline="", encoding="utf-8") as outf:
            w = csv.writer(outf)
            w.writerow(header)
            for ts in sorted(merged_map):
                w.writerow(merged_map[ts])
                rows_out += 1
        tmp.replace(dest)

    # Count newly-added timestamps (present in incoming but not in existing).
    new_rows_added = 0
    with open(incoming, "r", newline="", encoding="utf-8") as f:
        r = csv.reader(f)
        next(r, None)
        for row in r:
            if not row:
                continue
            try:
                ts = int(float(row[0]))
            except (ValueError, IndexError):
                continue
            if ts not in existing_ts:
                new_rows_added += 1
    return rows_out, new_rows_added


def _upsert_or_create_dataset_from_csv(
    file_path: Path,
    original_name: str,
    description: str | None,
    upsert: bool,
    match_canonical_ticker: str | None = None,
    match_canonical_class: str | None = None,
    *,
    csv_ticker_cache: list[CSVFile] | None = None,
    defer_binary_build: bool = False,
    skip_inline_duplicate_consolidation: bool = False,
) -> dict:
    """
    Register a normalized CSV as a dataset, or **merge** the incoming CSV into
    an existing dataset with the same original_name when `upsert=True`.

    Merge semantics: the existing CSV is preserved, the incoming candles are
    unioned in by epoch-ms timestamp, and any timestamp appearing in both is
    replaced by the incoming row (vendor's freshest print wins). This lets
    daily update bundles (`period=day`) progressively extend the historical
    series instead of overwriting it — which was the previous behaviour and
    would silently destroy old bars when a short-period bundle was imported
    on top of a long one.

    Fallback matching: when the strict `original_name` lookup misses and the
    caller supplies `match_canonical_ticker` (and optionally
    `match_canonical_class`), we search FirstRate-imported rows whose
    extracted ticker + classified asset class equal the requested values. This
    is what stops daily updates from creating brand-new dataset rows when a
    library was originally seeded under a different filename shape — e.g. an
    old `period=full` import stored as `EURUSD_full_1min_1min.csv` will still
    receive merges from a new `period=day` bundle that resolves to the
    canonical `EURUSD_1min.csv`. When multiple rows match (i.e. duplicates
    have already accumulated), we merge into the densest series (`max
    row_count`) so the freshest data lands on the row most likely to be the
    "real" one.

    The dataset row keeps its `file.id`, so downstream references (binary
    tiles, saved selections) remain stable.
    """
    if upsert:
        db = SessionLocal()
        try:
            db_file = db.query(CSVFile).filter(CSVFile.original_name == original_name).first()

            # Canonical-ticker fallback: find any existing dataset with the
            # same canonical ticker, regardless of import source.  Prefer
            # FirstRate-imported rows (filename contains `_firstrate_`) but
            # also match Dukascopy / manual uploads so a nightly delta pull
            # merges into the existing series instead of creating duplicates.
            if db_file is None and match_canonical_ticker:
                wanted_ticker = (match_canonical_ticker or "").strip().upper()
                wanted_class = (match_canonical_class or "").strip().lower() or None
                if wanted_ticker:
                    cache_rows = csv_ticker_cache if csv_ticker_cache is not None else db.query(CSVFile).all()
                    cached_pick = _pick_csvfile_by_canonical_ticker(
                        cache_rows, wanted_ticker, wanted_class
                    )
                    if cached_pick is not None:
                        db_file = (
                            db.query(CSVFile).filter(CSVFile.id == cached_pick.id).first()
                            or cached_pick
                        )
                    firstrate_matches = []
                    any_source_matches = []
                    for cand in cache_rows:
                        cand_orig = cand.original_name or ""
                        cand_ticker = (
                            _firstrate_extract_ticker_from_filename(cand_orig) or ""
                        ).upper()
                        if not cand_ticker or cand_ticker != wanted_ticker:
                            continue
                        if wanted_class:
                            cand_class = _firstrate_classify_ticker(cand_ticker)
                            if cand_class != wanted_class:
                                continue
                        cand_disk = (cand.filename or "").lower()
                        if "_firstrate_" in cand_disk:
                            firstrate_matches.append(cand)
                        else:
                            any_source_matches.append(cand)
                    # Auto-consolidate: merge stale duplicates into winner so
                    # they don't accumulate over repeated nightly imports.
                    all_matches = firstrate_matches + any_source_matches
                    if (
                        not skip_inline_duplicate_consolidation
                        and db_file
                        and len(all_matches) > 1
                    ):
                        losers = [m for m in all_matches if m.id != db_file.id]
                        winner_path = _resolve_dataset_csv_for_file(db_file)
                        for loser in losers:
                            try:
                                loser_path = _resolve_dataset_csv_for_file(loser)
                                if loser_path.exists() and winner_path.exists():
                                    _merge_canonical_ohlcv_csvs(
                                        existing=winner_path,
                                        incoming=loser_path,
                                        dest=winner_path,
                                    )
                                db.delete(loser)
                                if loser_path.exists():
                                    loser_path.unlink(missing_ok=True)
                            except Exception:
                                pass
                        db.commit()

            if db_file:
                # Normalize the original_name to the canonical label so future
                # strict lookups always succeed (avoids re-triggering fallback).
                if db_file.original_name != original_name:
                    db_file.original_name = original_name
                final_path = _resolve_dataset_csv_for_file(db_file)
                new_rows_added = 0
                if final_path.exists() and _csv_has_data_rows(final_path):
                    try:
                        rc, new_rows_added = _merge_canonical_ohlcv_csvs(
                            existing=final_path,
                            incoming=file_path,
                            dest=final_path,
                        )
                    except Exception as merge_err:
                        # On unexpected merge failure, do NOT fall back to
                        # overwrite (that would destroy historical bars). Re-raise
                        # so the import job is marked failed and the admin notices.
                        raise RuntimeError(
                            f"Failed to merge incoming CSV into existing dataset "
                            f"{original_name!r}: {merge_err}"
                        ) from merge_err
                else:
                    # No existing data (file missing or empty) → plain copy is fine.
                    shutil.copyfile(file_path, final_path)
                    rc = count_csv_rows(str(final_path))
                    new_rows_added = rc
                db_file.row_count = rc
                if description:
                    db_file.description = description
                db.commit()
                db.refresh(db_file)
                _sync_1m_aggregate_end_ts_from_csv(int(db_file.id), final_path)
                if not defer_binary_build:
                    build_binary_for_file(db_file.id, final_path, db_file.original_name)
                try:
                    if file_path.resolve() != final_path.resolve():
                        file_path.unlink(missing_ok=True)
                except Exception:
                    pass
                out = {
                    "success": True,
                    "file": _dataset_file_public_dict(db_file),
                    "upserted": True,
                    "merged": True,
                    "new_rows_added": int(new_rows_added),
                    "total_rows": int(rc),
                    "binary_file_id": int(db_file.id),
                    "binary_path": str(final_path),
                    "binary_original_name": db_file.original_name or original_name,
                }
                return out
        finally:
            db.close()

    out = _store_dataset_file(
        file_path,
        original_name=original_name,
        description=description,
        skip_binary_build=defer_binary_build,
    )
    if isinstance(out, dict):
        out["upserted"] = False
        out["merged"] = False
        f = out.get("file") if isinstance(out.get("file"), dict) else None
        if defer_binary_build and f and f.get("id"):
            out["binary_file_id"] = int(f["id"])
            out["binary_path"] = str(file_path)
            out["binary_original_name"] = original_name
    return out


def _parse_iso_date(value: str, field_name: str) -> datetime:
    raw = (value or "").strip()
    try:
        return datetime.strptime(raw, "%Y-%m-%d")
    except Exception:
        raise HTTPException(status_code=400, detail=f"{field_name} must use YYYY-MM-DD format")

def _normalize_dukascopy_instrument(value: str) -> str:
    instrument = (value or "").strip().lower()
    if not instrument:
        raise HTTPException(status_code=400, detail="instrument is required")
    # dukascopy-node instrument keys are lowercase alphanumerics (max observed length 14).
    if not re.fullmatch(r"[a-z0-9]{3,24}", instrument):
        raise HTTPException(status_code=400, detail="instrument must contain only letters/numbers (3-24 chars)")
    return instrument

def _split_dukascopy_date_ranges(from_dt: datetime, to_dt: datetime, chunk_days: int) -> list[tuple[datetime, datetime]]:
    step_days = max(1, int(chunk_days))
    ranges: list[tuple[datetime, datetime]] = []
    cursor = from_dt
    delta = timedelta(days=step_days - 1)
    while cursor <= to_dt:
        chunk_to = min(cursor + delta, to_dt)
        ranges.append((cursor, chunk_to))
        cursor = chunk_to + timedelta(days=1)
    return ranges

def _dukascopy_job_path(job_id: str) -> Path:
    safe_job_id = re.sub(r"[^a-zA-Z0-9_-]", "", (job_id or ""))
    if not safe_job_id:
        safe_job_id = "invalid"
    return DUKASCOPY_JOBS_DIR / f"{safe_job_id}.json"

def _dukascopy_cleanup_jobs() -> None:
    cutoff = time.time() - max(60, DUKASCOPY_JOB_TTL_SECONDS)
    for p in DUKASCOPY_JOBS_DIR.glob("*.json"):
        try:
            if p.stat().st_mtime < cutoff:
                p.unlink()
        except Exception:
            pass

def _dukascopy_write_job(job_id: str, state: dict) -> None:
    p = _dukascopy_job_path(job_id)
    state["updated_at"] = datetime.utcnow().isoformat()
    tmp = p.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f)
    tmp.replace(p)

def _dukascopy_read_job(job_id: str) -> dict | None:
    p = _dukascopy_job_path(job_id)
    if not p.exists():
        return None
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _firstrate_job_path(job_id: str) -> Path:
    safe_job_id = re.sub(r"[^a-zA-Z0-9_-]", "", (job_id or ""))
    if not safe_job_id:
        safe_job_id = "invalid"
    return FIrstrate_JOBS_DIR / f"{safe_job_id}.json"


def _firstrate_cleanup_jobs() -> None:
    cutoff = time.time() - max(60, FIrstrate_JOB_TTL_SECONDS)
    for p in FIrstrate_JOBS_DIR.glob("*.json"):
        try:
            if p.stat().st_mtime < cutoff:
                p.unlink()
        except Exception:
            pass


def _firstrate_write_job(job_id: str, state: dict, *, force: bool = False) -> None:
    """
  Write job JSON. When `force` is false, do not overwrite admin-cancelled / failed jobs
  (background import threads keep running after Unstick otherwise).
    """
    if not force:
        cur = _firstrate_read_job(job_id)
        if cur:
            if cur.get("cancelled"):
                return
            cur_status = str(cur.get("status") or "")
            new_status = str(state.get("status") or "")
            if cur_status == "failed" and new_status in ("queued", "running"):
                return
    p = _firstrate_job_path(job_id)
    state["updated_at"] = datetime.utcnow().isoformat()
    tmp = p.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f)
    tmp.replace(p)


def _firstrate_job_aborted(job_id: str) -> bool:
    st = _firstrate_read_job(job_id)
    if not st:
        return True
    if st.get("cancelled"):
        return True
    return str(st.get("status") or "") == "failed"


def _firstrate_force_fail_running_import_jobs(reason: str) -> int:
    """Admin Unstick: fail every queued/running import immediately (no idle-time wait)."""
    _firstrate_cleanup_jobs()
    n = 0
    for p in FIrstrate_JOBS_DIR.glob("*.json"):
        try:
            with open(p, "r", encoding="utf-8") as f:
                st = json.load(f)
            if str(st.get("status") or "") not in ("queued", "running"):
                continue
            job_id = str(st.get("job_id") or p.stem)
            _firstrate_fail_stuck_job(st, job_id, reason[:2000])
            n += 1
        except Exception:
            continue
    return n


def _call_with_timeout(timeout_sec: float, fn, *args, **kwargs):
    """Run `fn` in a worker thread; raise TimeoutError if it exceeds `timeout_sec`."""
    from concurrent.futures import ThreadPoolExecutor
    from concurrent.futures import TimeoutError as FuturesTimeout

    limit = max(30.0, float(timeout_sec))
    with ThreadPoolExecutor(max_workers=1) as pool:
        fut = pool.submit(fn, *args, **kwargs)
        try:
            return fut.result(timeout=limit)
        except FuturesTimeout as exc:
            raise TimeoutError(f"Timed out after {int(limit)}s") from exc


def _firstrate_start_file_heartbeat(
    job_id: str,
    *,
    message: str,
    current_file: str | None,
) -> threading.Event:
    """Refresh job JSON while a single CSV normalize/merge runs (admin live panel)."""
    stop = threading.Event()

    def _beat() -> None:
        while not stop.wait(12.0):
            st = _firstrate_read_job(job_id)
            if not st or str(st.get("status")) not in ("queued", "running"):
                break
            if st.get("cancelled"):
                break
            st["message"] = message
            if current_file:
                st["current_file"] = current_file
            st["heartbeat_at"] = datetime.utcnow().isoformat() + "Z"
            _firstrate_write_job(job_id, st)

    threading.Thread(target=_beat, daemon=True).start()
    return stop


def _firstrate_read_job(job_id: str) -> dict | None:
    p = _firstrate_job_path(job_id)
    if not p.exists():
        return None
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _normalize_ticker_filter_list(pairs: list[str] | None) -> list[str]:
    """Normalize ticker / pair tokens (e.g. EURUSD, AAPL). Empty list = no filter."""
    if not pairs:
        return []
    out: list[str] = []
    for p in pairs:
        if p is None:
            continue
        compact = re.sub(r"[^A-Za-z0-9]", "", str(p).strip()).upper()
        if not compact:
            continue
        out.append(compact[:12])
    seen: set[str] = set()
    uniq: list[str] = []
    for x in out:
        if x not in seen:
            seen.add(x)
            uniq.append(x)
    return uniq


_FIRSTRATE_META_SEGMENTS = {
    "FULL", "DAY", "WEEK", "MONTH", "YEAR", "HOUR", "MIN",
    "ADJ", "UNADJ", "CONTIN", "SPLIT", "DIV", "RATIO", "ABSOLUTE",
}
# Common quote currencies that appear trailing on user-typed crypto tickers.
# Ordered longest-first so `USDT`/`USDC` are stripped before the shorter `USD`.
_FIRSTRATE_CRYPTO_QUOTE_ALIASES = ("USDT", "USDC", "USD", "EUR", "GBP", "JPY", "BTC", "ETH")


def _token_matches_firstrate_stem(tok: str, stem: str) -> bool:
    """
    Match a filter token against a FirstRate CSV filename stem.

    FirstRate filenames carry several pieces separated by `_`, `-`, or `.`, e.g.:
        EURUSD_full_1min.txt                     (FX)
        AAPL_full_1min_adj_split.txt             (stock)
        ES_full_1min_contin_UNadj.txt            (futures, continuous)
        BTC_full_1min.txt                        (crypto, implicit USD quote)
        BTC-EUR_full_1min.txt                    (crypto, explicit non-USD quote)
    We split the stem on non-alphanumerics into segments and consider a token to match if:
      * any segment equals the token exactly (`ES` matches `ES_continuous…`, not `ESM2024`), OR
      * the first segment starts with the token and is only a little longer than it
        (handles contract-coded futures like `ESM2024.txt` when the user typed `ES`), OR
      * for longer tokens (>=6 chars) the alnum-compacted stem contains the token as prefix
        or substring (handles `EURUSD`, `GBPJPY`, etc. against any FirstRate naming style), OR
      * [crypto] the token ends with a known quote currency (USD/USDT/USDC/EUR/...) and its
        base matches the first segment — FirstRate's crypto bundle names files by base asset
        only for USD-quoted pairs (`BTC_full_1min` means BTC/USD), so users typing `BTCUSD` or
        `BTCUSDT` still resolve to the right file.
    """
    if not tok or not stem:
        return False
    tok_up = tok.upper()
    stem_up = stem.upper()
    segments = [s for s in re.split(r"[^A-Za-z0-9]+", stem_up) if s]
    if tok_up in segments:
        return True
    if len(tok_up) >= 6:
        compact = "".join(segments)
        if compact.startswith(tok_up) or (tok_up in compact):
            return True
    # Short root tokens (2–5 chars, e.g. futures roots "ES", "NQ", metal "GC") should also match
    # continuous contract codes like `ESM2024` / `CLH25` / `ES1` — never prefix-only (ES ≠ ESG).
    if segments and segments[0].startswith(tok_up):
        rest = segments[0][len(tok_up):]
        if not rest:
            return True
        if rest.isdigit() and len(rest) == 1:
            return True
        if re.fullmatch(r"[FGHJKMNQUVXZ]\d{0,4}", rest, re.IGNORECASE):
            return True
    # Crypto pair fallback — FirstRate ships crypto as `<BASE>_full_1min.txt` (implicit USD) or
    # `<BASE>-<QUOTE>_full_1min.txt` (explicit non-USD). Accept common user-typed suffixes.
    for quote in _FIRSTRATE_CRYPTO_QUOTE_ALIASES:
        if not tok_up.endswith(quote) or len(tok_up) <= len(quote):
            continue
        base = tok_up[: -len(quote)]
        if not segments or segments[0] != base:
            continue
        # Look at the segment right after the base to see whether the stem carries an
        # explicit quote (e.g. `BTC-EUR_…`) or is a pure base-only stem (`BTC_…`).
        sibling = segments[1] if len(segments) >= 2 else None
        sibling_is_quote = (
            sibling is not None
            and sibling.isalpha()
            and 3 <= len(sibling) <= 5
            and sibling not in _FIRSTRATE_META_SEGMENTS
        )
        if not sibling_is_quote:
            # Base-only stem → default quote is USD. Accept USD and its stablecoin aliases,
            # since FirstRate does not separately ship USDT/USDC-quoted bundles for these.
            if quote in {"USD", "USDT", "USDC"}:
                return True
        elif sibling == quote:
            return True
    return False


def _firstrate_filter_csv_paths_by_tickers(paths: list[Path], tokens: list[str]) -> tuple[list[Path], int]:
    """Keep CSVs whose stem matches at least one token (FX pairs, stock tickers, futures roots, etc.)."""
    if not tokens:
        return paths, 0
    kept: list[Path] = []
    for path in paths:
        stem = path.stem
        if any(_token_matches_firstrate_stem(t, stem) for t in tokens):
            kept.append(path)
    return kept, len(paths) - len(kept)


# Static symbol tables mirrored from backtesting.html's `classifyFile`. Kept
# inline (rather than imported from a shared module) because the admin server
# is otherwise self-contained and the lists rarely change.
# CME roots on My Funded Futures (40 instruments). Source:
# https://help.myfundedfutures.com/en/articles/9735811-futures-instrument-list
_FIRSTRATE_FUTURES_SYMS = frozenset({
    # FX futures
    "6A", "6B", "6C", "6E", "6J", "6N", "6S",
    # Equity index
    "ES", "NQ", "RTY", "YM", "MES", "MNQ", "M2K", "MYM", "NKD",
    # Micro FX
    "M6A", "M6E",
    # Crypto futures
    "MBT", "MET",
    # Metals
    "GC", "MGC", "SI", "SIL", "HG", "PL",
    # Energy
    "CL", "MCL", "QM", "NG", "QG", "HO", "RB",
    # Agriculture / livestock
    "ZC", "ZS", "ZW", "ZL", "ZM", "HE", "LE",
    # Legacy / FirstRate extras not on MFF list (keep for existing datasets)
    "ZB", "ZN", "ZF", "ZT", "MSI", "MNG", "PA",
})
_FIRSTRATE_CRYPTO_SYMS = frozenset({
    "BTC","ETH","SOL","XRP","ADA","DOGE","BNB","LTC","AVAX","ATOM","DOT",
    "LINK","MATIC","UNI","BCH","ETC","FIL","NEAR","ALGO","XLM","TRX",
    "SHIB","APT","ARB","OP",
})
_FIRSTRATE_CURRENCY_SYMS = frozenset({
    "USD","EUR","GBP","JPY","AUD","NZD","CAD","CHF","HKD","SGD","SEK",
    "NOK","DKK","ZAR","TRY","MXN","CNY","PLN","HUF","CZK","THB","INR",
    "KRW","IDR","PHP","BRL","CLP","XAU","XAG","XPT",
})
# Cash-index / commodity CFD stems (FirstRate `index` type — not 6-letter FX pairs).
_FIRSTRATE_INDEX_SYMS = frozenset({
    "SPX500","NAS100","US30","US2000","US100","US500",
    "GER40","UK100","FRA40","EUSTX50","JPN225","HK50","AUS200",
    "USOIL","UKOIL","NGAS","COPPER","CORN","WHEAT","SOYBN",
    "DAX","NIKKEI","NDX","SPX",
})
# FirstRate bucket name for each classified instrument. These are the `type`
# values the vendor's data_file / last_update endpoints accept.
_FIRSTRATE_INSTRUMENT_TYPE_CANON = {
    "futures": "futures",
    "crypto":  "crypto",
    "fx":      "fx",
    "index":   "index",
    "stock":   "stock",
}
# "Meta" filename segments added by the FirstRate pipeline that should be
# ignored when pulling the ticker out of `original_name`.
_FIRSTRATE_FILENAME_META = frozenset({
    "FULL","DAY","WEEK","MONTH","YEAR","HOUR","MIN",
    "ADJ","UNADJ","CONTIN","CONTINUOUS","SPLIT","DIV","RATIO","ABSOLUTE",
    "1MIN","5MIN","15MIN","30MIN","1HOUR","1DAY","1WEEK","1MONTH",
    "1H","4H","1D","1W","1MO",
})


def _firstrate_extract_ticker_from_filename(raw_name: str) -> str:
    """
    Mirror of JS `cleanPairName` in backtesting.html. Pulls a canonical ticker
    out of a dataset filename like `BTC_full_1min_1min.csv`,
    `20260217_182920_GBPUSD.csv`, or `b01_0003_firstrate_EURUSD_full_1min_1min.csv`.
    Returns empty string on anything we can't confidently classify.
    """
    if not raw_name:
        return ""
    # Strip any path + extension, then the common FirstRate-pipeline prefixes.
    name = re.sub(r"^.*[\\/]", "", str(raw_name))
    name = re.sub(r"\.csv$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"^\d{8}_\d{6}_", "", name)
    name = re.sub(r"^b\d{2}_\d{4}_firstrate_", "", name)
    name = re.sub(r"^firstrate_", "", name)
    parts = [p for p in name.split("_") if p]
    if not parts:
        return ""
    seg = next(
        (p for p in parts
         if p.upper() not in _FIRSTRATE_FILENAME_META and not p.isdigit()),
        parts[0],
    )
    if re.fullmatch(r"[A-Za-z]{2,5}-[A-Za-z]{2,5}", seg):
        a, b = seg.upper().split("-")
        return a + b
    return seg.upper()


def _firstrate_classify_ticker(ticker: str) -> str | None:
    """
    Bucket a canonical ticker into one of `futures | crypto | fx | stock`,
    matching the grouping used in the backtesting dropdown. Returns None for
    tickers we don't recognize (so they can be safely skipped by the
    auto-nightly loop rather than sent to the wrong FirstRate endpoint).
    """
    t = (ticker or "").upper().replace("/", "").replace("-", "")
    if not t:
        return None
    if t in _FIRSTRATE_FUTURES_SYMS:
        return "futures"
    if t in _FIRSTRATE_INDEX_SYMS:
        return "index"
    if len(t) >= 6:
        base, quote = t[:3], t[3:6]
        if base in _FIRSTRATE_CRYPTO_SYMS or quote in _FIRSTRATE_CRYPTO_SYMS:
            return "crypto"
        if base in _FIRSTRATE_CURRENCY_SYMS and quote in _FIRSTRATE_CURRENCY_SYMS:
            return "fx"
    if t in _FIRSTRATE_CRYPTO_SYMS:
        return "crypto"
    if t in _FIRSTRATE_CURRENCY_SYMS:
        return "fx"
    if t.isalpha() and 1 <= len(t) <= 5:
        return "stock"
    return None


def _guess_ticker_from_csv_filename_fallback(original_name: str) -> str:
    """
    When FirstRate-style extraction yields nothing, derive a best-effort ticker from the CSV filename
    (same spirit as the homepage backtest modal client fallback).
    """
    name = re.sub(r"^.*[\\/]", "", str(original_name or ""))
    base = re.sub(r"\.csv$", "", name, flags=re.IGNORECASE)
    parts = re.split(r"[\s_-]+", base)
    for p in parts:
        pu = str(p).strip().upper()
        if not pu or pu.isdigit():
            continue
        if re.fullmatch(r"[A-Z]{6}", pu):
            return pu
        if re.fullmatch(r"[A-Z0-9]{2,12}", pu):
            return pu
    stem = re.sub(r"^.*[\\/]", "", base).upper()
    return stem[:18].strip()


def _infer_dataset_asset_label(ticker: str, original_name: str) -> str:
    """
    Map a ticker + filename to UI asset buckets: Forex | Futures | Crypto | Stocks.
    Prefer FirstRate classifier; fall back to filename/ticker heuristics (mirrors homepage modal).
    """
    cls = _firstrate_classify_ticker(ticker or "")
    if cls == "fx":
        return "Forex"
    if cls == "index":
        return "Indices"
    if cls == "futures":
        return "Futures"
    if cls == "crypto":
        return "Crypto"
    if cls == "stock":
        return "Stocks"

    t = (ticker or "").upper()
    n = (original_name or "").upper()
    if re.search(r"(BTC|ETH|BNB|SOL|ADA|XRP|DOGE|CRYPTO|USDT|USDC)", t) or re.search(r"(CRYPTO|USDT|USDC)", n):
        return "Crypto"
    if re.search(r"(NQ|ES|YM|RTY|MNQ|MES|MYM|M2K|MGC|MCL|CL|GC|SI|NG|HG|PL|RB|HO|FUTURE)", t) or re.search(
        r"(FUTURE|CME|CBOT|NYMEX|COMEX)", n
    ):
        return "Futures"
    if re.fullmatch(r"[A-Z]{3}[A-Z]{3}", t) or re.search(r"(FOREX|FX)", n):
        return "Forex"
    if re.search(r"(STOCK|NASDAQ|NYSE)", n) or (re.fullmatch(r"[A-Z]{1,5}", t) is not None):
        return "Stocks"
    return "Forex"


def _dataset_file_symbol_fields(original_name: str) -> tuple[str, str]:
    raw_name = original_name or ""
    ticker = (_firstrate_extract_ticker_from_filename(raw_name) or "").strip().upper()
    if not ticker:
        ticker = _guess_ticker_from_csv_filename_fallback(raw_name).strip().upper()
    asset = _infer_dataset_asset_label(ticker, raw_name)
    return ticker, asset


def _firstrate_classify_existing_datasets() -> dict[str, list[str]]:
    """
    Walk the dataset registry and bucket every CSV into the FirstRate instrument
    type it came from. Used by the nightly auto-sync to decide which
    `data_file?type=…` calls to make and with which pairs.

    Returns `{"fx": ["EURUSD", …], "crypto": ["BTC", …], …}` with sorted,
    deduplicated ticker lists. Instrument types with zero datasets are omitted.
    """
    buckets: dict[str, set[str]] = {}
    db = SessionLocal()
    try:
        rows = db.query(CSVFile).all()
    finally:
        db.close()
    for row in rows:
        ticker = _firstrate_extract_ticker_from_filename(row.original_name or "")
        if not ticker:
            continue
        cls = _firstrate_classify_ticker(ticker)
        if not cls:
            continue
        canon = _FIRSTRATE_INSTRUMENT_TYPE_CANON.get(cls)
        if not canon:
            continue
        buckets.setdefault(canon, set()).add(ticker)
    return {k: sorted(v) for k, v in buckets.items() if v}


def _default_firstrate_schedule() -> dict:
    """
    Defaults for automatic VPS sync; first load creates
    `uploads/firstrate_schedule.json` (overridable via env).

    Two modes:
      * `nightly`  — fire once per day at `nightly_utc_hour`, iterating every
                     asset class present in the dataset registry (or just
                     `instrument_type` if `auto_all_types` is off).
      * `interval` — legacy behaviour: fire every `interval_minutes`, single
                     `instrument_type` only.

    `nightly` is the default now because it matches what traders actually want
    (one delta pull per asset class per night, merged into existing history).
    """
    return {
        "enabled": os.getenv("FIrstrate_SCHEDULE_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"},
        "mode": (os.getenv("FIrstrate_SCHEDULE_MODE", "nightly").strip().lower() or "nightly"),
        "nightly_utc_hour": int(os.getenv("FIrstrate_SCHEDULE_NIGHTLY_UTC_HOUR", "2")),
        "auto_all_types": os.getenv("FIrstrate_SCHEDULE_AUTO_ALL_TYPES", "true").strip().lower() in {"1", "true", "yes", "on"},
        "excluded_types": [x.strip().lower() for x in os.getenv("FIrstrate_SCHEDULE_EXCLUDED_TYPES", "").split(",") if x.strip()],
        "interval_minutes": int(os.getenv("FIrstrate_SCHEDULE_INTERVAL_MINUTES", "1440")),
        # Default `day` for routine daily sync (last session). Use week/month via adaptive when very stale.
        "period": (os.getenv("FIrstrate_SCHEDULE_PERIOD", "day").strip() or "day"),
        "timeframe": (os.getenv("FIrstrate_SCHEDULE_TIMEFRAME", "1min").strip() or "1min"),
        "adaptive_period": os.getenv("FIrstrate_SCHEDULE_ADAPTIVE_PERIOD", "true").strip().lower()
        in {"1", "true", "yes", "on"},
        # 24/7: queue imports for stale/missing tickers only (not whole asset class).
        "auto_repair": os.getenv("FIrstrate_SCHEDULE_AUTO_REPAIR", "true").strip().lower()
        in {"1", "true", "yes", "on"},
        # When true, auto-repair and nightly pulls pass `pairs` = stale/missing tickers only.
        "stale_pairs_only": os.getenv("FIrstrate_STALE_PAIRS_ONLY", "true").strip().lower()
        in {"1", "true", "yes", "on"},
        # After each successful import: merge duplicate datasets into the densest row per ticker.
        "auto_duplicate_cleanup": os.getenv("FIrstrate_AUTO_DUPLICATE_CLEANUP", "true").strip().lower()
        in {"1", "true", "yes", "on"},
        "upsert_existing": os.getenv("FIrstrate_SCHEDULE_UPSERT", "true").strip().lower() in {"1", "true", "yes", "on"},
        "delete_existing_first": False,
        "purge_confirmation": None,
        "ticker_range": None,
        "download_timeout_sec": float(os.getenv("FIrstrate_SCHEDULE_DOWNLOAD_TIMEOUT", "7200")),
        "instrument_type": (os.getenv("FIrstrate_SCHEDULE_TYPE", "fx").strip().lower() or "fx"),
        "adjustment": os.getenv("FIrstrate_SCHEDULE_ADJUSTMENT", "").strip() or None,
        "last_run_started_at": None,
        "last_run_finished_at": None,
        "last_job_id": None,
        "last_status": None,
        "last_error": None,
        "last_run_date": None,            # YYYY-MM-DD UTC; resets per-day completion list
        "last_run_types_today": [],       # instrument_types successfully synced today (scheduled)
        "last_auto_repair_class": None,   # round-robin cursor for stale_auto (fx→futures→…)
        "last_import_finished_at_by_type": {},  # ISO UTC — last successful import per class
        "vendor_last_update_by_type": {},  # last seen FirstRate last_update per type (incremental)
        "type_failure_cooldown_until": {},  # ISO UTC — backoff after a failed scheduled job
        "pairs": [],
    }


def _load_firstrate_schedule() -> dict:
    with _firstrate_schedule_lock:
        if not FIrstrate_SCHEDULE_PATH.exists():
            cfg = _default_firstrate_schedule()
            try:
                with open(FIrstrate_SCHEDULE_PATH, "w", encoding="utf-8") as f:
                    json.dump(cfg, f, indent=2)
            except OSError:
                pass
            return dict(cfg)
        try:
            with open(FIrstrate_SCHEDULE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            return _default_firstrate_schedule()
        if not isinstance(data, dict):
            return _default_firstrate_schedule()
        base = _default_firstrate_schedule()
        for k in list(base.keys()) + ["purge_confirmation", "pairs", "instrument_type", "adjustment", "excluded_types"]:
            if k in data:
                base[k] = data[k]
        return base


def _save_firstrate_schedule(cfg: dict) -> None:
    with _firstrate_schedule_lock:
        tmp = FIrstrate_SCHEDULE_PATH.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
        tmp.replace(FIrstrate_SCHEDULE_PATH)


def _firstrate_parse_job_utc(ts_raw: str | None) -> datetime | None:
    if not ts_raw:
        return None
    try:
        return datetime.fromisoformat(str(ts_raw).replace("Z", ""))
    except Exception:
        return None


def _firstrate_fail_stuck_job(st: dict, job_id: str, reason: str) -> None:
    st["status"] = "failed"
    st["phase"] = "failed"
    st["cancelled"] = True
    st["message"] = reason[:2000]
    st["error"] = reason[:4000]
    _firstrate_write_job(job_id, st, force=True)
    try:
        _firstrate_schedule_after_job(job_id, success=False, error_message=reason)
    except Exception:
        pass


def _firstrate_note_import_file_progress(st: dict, job_id: str) -> None:
    """Record that files_done advanced (heartbeat must not reset this clock)."""
    st["last_files_done"] = int(st.get("files_done") or 0)
    st["last_files_done_at"] = datetime.utcnow().isoformat() + "Z"
    _firstrate_write_job(job_id, st)


def _firstrate_reclaim_stuck_import_jobs() -> int:
    """
    Mark zombie import jobs failed so nightly auto-repair can continue.
    Uses last_files_done_at (real progress), not heartbeat updated_at.
    """
    _firstrate_cleanup_jobs()
    now = datetime.utcnow()
    stale_queued_min = max(10, int(os.getenv("FIrstrate_STALE_QUEUED_MINUTES", "30")))
    stale_dead_min = max(60, int(os.getenv("FIrstrate_STALE_DEAD_MINUTES", "240")))
    stale_file_min = max(45, int(os.getenv("FIrstrate_STUCK_FILE_MINUTES", "60")))
    stale_binary_min = max(90, int(os.getenv("FIrstrate_STUCK_BINARY_MINUTES", "180")))
    merge_timeout_min = max(
        30.0,
        float(os.getenv("FIrstrate_FILE_MERGE_TIMEOUT_SEC", "2400")) / 60.0,
    )
    register_stuck_min = max(
        45.0,
        merge_timeout_min + 15.0,
        float(os.getenv("FIrstrate_REGISTER_STUCK_MINUTES", "0")) or 0,
    )
    if register_stuck_min <= 0:
        register_stuck_min = merge_timeout_min + 15.0
    reclaimed = 0
    for p in FIrstrate_JOBS_DIR.glob("*.json"):
        try:
            with open(p, "r", encoding="utf-8") as f:
                st = json.load(f)
            status = str(st.get("status") or "")
            if status not in ("queued", "running"):
                continue
            job_id = str(st.get("job_id") or p.stem)
            updated_raw = st.get("updated_at") or st.get("created_at")
            last_update = _firstrate_parse_job_utc(updated_raw)
            if status == "queued":
                if last_update and (now - last_update).total_seconds() / 60.0 > stale_queued_min:
                    _firstrate_fail_stuck_job(
                        st,
                        job_id,
                        f"Auto-failed: queued {int((now - last_update).total_seconds() / 60)} min with no start",
                    )
                    reclaimed += 1
                continue
            phase = str(st.get("phase") or "").lower()
            prog_raw = st.get("last_files_done_at") or st.get("created_at") or updated_raw
            prog_at = _firstrate_parse_job_utc(prog_raw)
            bin_raw = st.get("last_binary_at")
            bin_at = _firstrate_parse_job_utc(bin_raw) if bin_raw else None
            reason: str | None = None
            if phase == "binary" and bin_at:
                bin_min = (now - bin_at).total_seconds() / 60.0
                if bin_min > stale_binary_min:
                    reason = (
                        f"Auto-failed: binary build stalled {int(bin_min)} min on "
                        f"{st.get('message') or 'chart binaries'}"
                    )
            elif prog_at:
                prog_min = (now - prog_at).total_seconds() / 60.0
                msg_l = str(st.get("message") or "").lower()
                stuck_limit = stale_file_min
                if phase == "normalize" and "registering" in msg_l:
                    stuck_limit = min(stale_file_min, register_stuck_min)
                if prog_min > stuck_limit:
                    cur = st.get("current_file") or st.get("message") or "?"
                    done = int(st.get("files_done") or 0)
                    total = int(st.get("files_total") or 0)
                    reason = (
                        f"Auto-failed: no file progress for {int(prog_min)} min "
                        f"({done}/{total} files, stuck on {cur})"
                    )
            if not reason and last_update:
                dead_min = (now - last_update).total_seconds() / 60.0
                if dead_min > stale_dead_min:
                    reason = f"Auto-failed: no server heartbeat for {int(dead_min)} min (crashed?)"
            if reason:
                _firstrate_fail_stuck_job(st, job_id, reason)
                reclaimed += 1
        except Exception:
            continue
    return reclaimed


def _firstrate_has_active_import_job() -> bool:
    _firstrate_reclaim_stuck_import_jobs()
    for p in FIrstrate_JOBS_DIR.glob("*.json"):
        try:
            with open(p, "r", encoding="utf-8") as f:
                st = json.load(f)
            if str(st.get("status") or "") in ("queued", "running"):
                return True
        except Exception:
            continue
    return False


def _firstrate_mark_scheduled_type_attempted(instrument_type: str) -> None:
    """
    Record that we ran a scheduled/repair import for this class today so nightly
    rotation advances even if some tickers remain stale (avoids stock-only loops).
    """
    it = (instrument_type or "").strip().lower()
    if not it:
        return
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    cfg = _load_firstrate_schedule()
    if str(cfg.get("last_run_date") or "") != today_str:
        cfg["last_run_date"] = today_str
        cfg["last_run_types_today"] = []
    done = list(cfg.get("last_run_types_today") or [])
    if it not in done:
        done.append(it)
    cfg["last_run_types_today"] = done
    _save_firstrate_schedule(cfg)


def _firstrate_mark_scheduled_type_complete(instrument_type: str) -> None:
    """
    Mark an asset class as successfully synced for the current UTC day.
    Only when every ticker in that class is fresh (no stale / missing left).
    """
    it = (instrument_type or "").strip().lower()
    if not it:
        return
    stats = _firstrate_class_health_stats(it)
    if int(stats.get("stale_count") or 0) > 0 or int(stats.get("missing_count") or 0) > 0:
        return
    _firstrate_mark_scheduled_type_attempted(it)


def _firstrate_type_in_failure_cooldown(instrument_type: str, cfg: dict) -> bool:
    cooldowns = cfg.get("type_failure_cooldown_until") or {}
    until_raw = cooldowns.get((instrument_type or "").strip().lower())
    if not until_raw:
        return False
    try:
        until = datetime.fromisoformat(str(until_raw).replace("Z", ""))
        return datetime.utcnow() < until
    except Exception:
        return False


def _firstrate_set_type_failure_cooldown(instrument_type: str, minutes: int = 30) -> None:
    it = (instrument_type or "").strip().lower()
    if not it:
        return
    cfg = _load_firstrate_schedule()
    cooldowns = dict(cfg.get("type_failure_cooldown_until") or {})
    until = datetime.utcnow() + timedelta(minutes=max(5, int(minutes)))
    cooldowns[it] = until.isoformat() + "Z"
    cfg["type_failure_cooldown_until"] = cooldowns
    _save_firstrate_schedule(cfg)


def _firstrate_clear_type_failure_cooldown(instrument_type: str) -> None:
    it = (instrument_type or "").strip().lower()
    if not it:
        return
    cfg = _load_firstrate_schedule()
    cooldowns = dict(cfg.get("type_failure_cooldown_until") or {})
    if it in cooldowns:
        cooldowns.pop(it, None)
        cfg["type_failure_cooldown_until"] = cooldowns
        _save_firstrate_schedule(cfg)


def _firstrate_fetch_vendor_last_update_date(instrument_type: str) -> str | None:
    """FirstRate `last_update` for incremental (day/week/month) bundles."""
    uid = get_firstrate_userid()
    it = (instrument_type or "").strip().lower()
    if not uid or it not in VALID_LAST_UPDATE_TYPES:
        return None
    try:
        info = fetch_firstrate_last_update(
            userid=uid, instrument_type=it, is_full_update=False
        )
        return str(info.get("last_update_iso") or info.get("last_update") or "").strip() or None
    except Exception:
        return None


def _firstrate_vendor_has_new_incremental_data(instrument_type: str, cfg: dict) -> bool:
    """
    True when FirstRate reports a newer incremental `last_update` than we recorded
    after the last successful scheduled merge for this type.
    """
    it = (instrument_type or "").strip().lower()
    if it not in VALID_LAST_UPDATE_TYPES:
        return True
    cur = _firstrate_fetch_vendor_last_update_date(it)
    if not cur:
        return True
    prev = (cfg.get("vendor_last_update_by_type") or {}).get(it)
    if not prev:
        return True
    return str(cur) != str(prev)


def _firstrate_record_vendor_last_update(instrument_type: str) -> None:
    it = (instrument_type or "").strip().lower()
    cur = _firstrate_fetch_vendor_last_update_date(it)
    if not cur:
        return
    cfg = _load_firstrate_schedule()
    by_type = dict(cfg.get("vendor_last_update_by_type") or {})
    by_type[it] = cur
    cfg["vendor_last_update_by_type"] = by_type
    _save_firstrate_schedule(cfg)


def _firstrate_filter_actionable_pending(pending: list[str], cfg: dict) -> list[str]:
    """Drop types in failure cooldown so the scheduler can advance to the next class."""
    return [t for t in pending if not _firstrate_type_in_failure_cooldown(t, cfg)]


def _firstrate_freshness_bucket(staleness_hours: float | None) -> str:
    """Same buckets as nightly-health UI (fresh / stale / missing)."""
    if staleness_hours is None or staleness_hours > 24 * 7:
        return "missing"
    if staleness_hours > 48:
        return "stale"
    return "fresh"


def _firstrate_class_health_stats(instrument_type: str) -> dict:
    """
    Per asset-class rollup of dataset freshness (1m aggregate end_ts vs now).
    Used to pick week/month catch-up bundles instead of day-only deltas.
    """
    want = (instrument_type or "").strip().lower()
    now_ms = datetime.utcnow().timestamp() * 1000.0
    stats = {
        "asset_class": want,
        "ticker_count": 0,
        "fresh_count": 0,
        "stale_count": 0,
        "missing_count": 0,
        "max_staleness_hours": None,
    }
    if not want:
        return stats
    db = SessionLocal()
    try:
        files = db.query(CSVFile).all()
        aggs = (
            db.query(CSVAggregate)
            .filter(CSVAggregate.timeframe == "1m")
            .all()
        )
    finally:
        db.close()
    agg_by_file = {int(a.file_id): a for a in aggs}
    max_stale: float | None = None
    for f in files:
        ticker = _firstrate_extract_ticker_from_filename(f.original_name or "")
        asset_class = _firstrate_classify_ticker(ticker) if ticker else None
        if asset_class != want:
            continue
        stats["ticker_count"] += 1
        last_ts = None
        agg = agg_by_file.get(int(f.id))
        if agg is not None and agg.end_ts is not None:
            try:
                last_ts = float(agg.end_ts)
            except (TypeError, ValueError):
                last_ts = None
        staleness_hours: float | None = None
        if last_ts is not None:
            staleness_hours = max(0.0, (now_ms - last_ts) / 3_600_000.0)
            if max_stale is None or staleness_hours > max_stale:
                max_stale = staleness_hours
        bucket = _firstrate_freshness_bucket(staleness_hours)
        stats[f"{bucket}_count"] += 1
    stats["max_staleness_hours"] = round(max_stale, 2) if max_stale is not None else None
    return stats


_FIRSTRATE_AUTO_REPAIR_CLASS_ORDER = ("fx", "index", "futures", "crypto", "stock", "etf")


def _firstrate_tickers_repair_bucket(
    instrument_type: str, bucket: str
) -> list[str]:
    """Tickers in this class that are only `stale` or only `missing` (not both)."""
    want = (instrument_type or "").strip().lower()
    bucket = (bucket or "").strip().lower()
    if bucket not in {"stale", "missing"}:
        return []
    all_need = _firstrate_tickers_needing_repair(want)
    if not all_need:
        return []
    now_ms = datetime.utcnow().timestamp() * 1000.0
    out: list[str] = []
    db = SessionLocal()
    try:
        files = db.query(CSVFile).all()
        aggs = (
            db.query(CSVAggregate)
            .filter(CSVAggregate.timeframe == "1m")
            .all()
        )
    finally:
        db.close()
    agg_by_file = {int(a.file_id): a for a in aggs}
    for f in files:
        ticker = _firstrate_extract_ticker_from_filename(f.original_name or "")
        asset_class = _firstrate_classify_ticker(ticker) if ticker else None
        if asset_class != want or not ticker:
            continue
        canon = ticker.upper()
        if canon not in all_need:
            continue
        last_ts = None
        agg = agg_by_file.get(int(f.id))
        if agg is not None and agg.end_ts is not None:
            try:
                last_ts = float(agg.end_ts)
            except (TypeError, ValueError):
                last_ts = None
        staleness_hours: float | None = None
        if last_ts is not None:
            staleness_hours = max(0.0, (now_ms - last_ts) / 3_600_000.0)
        b = _firstrate_freshness_bucket(staleness_hours)
        if b == bucket:
            out.append(canon)
    return sorted(set(out))


def _firstrate_canonical_ticker_status_map(
    instrument_type: str | None = None,
) -> dict[str, dict]:
    """
    Best dataset row per canonical ticker (newest 1m end_ts when duplicates exist).
    Keys are uppercase tickers; values include freshness bucket (fresh/stale/missing).
    """
    want = (instrument_type or "").strip().lower() or None
    now_ms = datetime.utcnow().timestamp() * 1000.0
    best: dict[str, dict] = {}
    db = SessionLocal()
    try:
        files = db.query(CSVFile).all()
        aggs = (
            db.query(CSVAggregate)
            .filter(CSVAggregate.timeframe == "1m")
            .all()
        )
    finally:
        db.close()
    agg_by_file = {int(a.file_id): a for a in aggs}
    for f in files:
        ticker = _firstrate_extract_ticker_from_filename(f.original_name or "")
        if not ticker:
            continue
        asset_class = _firstrate_classify_ticker(ticker)
        if want and asset_class != want:
            continue
        canon = ticker.upper()
        last_ts = None
        agg = agg_by_file.get(int(f.id))
        if agg is not None and agg.end_ts is not None:
            try:
                last_ts = float(agg.end_ts)
            except (TypeError, ValueError):
                last_ts = None
        staleness_hours: float | None = None
        if last_ts is not None:
            staleness_hours = max(0.0, (now_ms - last_ts) / 3_600_000.0)
        bucket = _firstrate_freshness_bucket(staleness_hours)
        row_count_1m = int(agg.row_count or 0) if agg else 0
        prev = best.get(canon)
        prev_ts = float(prev["last_ts"]) if prev and prev.get("last_ts") is not None else -1.0
        if prev is None or (last_ts or 0) > prev_ts:
            best[canon] = {
                "ticker": canon,
                "asset_class": asset_class,
                "bucket": bucket,
                "last_ts": last_ts,
                "staleness_hours": round(staleness_hours, 2) if staleness_hours is not None else None,
                "file_id": int(f.id),
                "row_count_1m": row_count_1m,
            }
    return best


def _firstrate_plan_pair_import(
    instrument_type: str,
    pairs: list[str] | None,
    *,
    skip_fresh: bool = True,
    skip_all_existing: bool = False,
) -> dict:
    """
    Split a requested ticker list into download vs skip buckets using the dataset registry.

    - fresh (≤48h): skipped when skip_fresh
    - stale: queued for update (merge)
    - missing (not in registry): queued for first-time download
    - skip_all_existing: only symbols with no registry row are downloaded
    """
    it = (instrument_type or "fx").strip().lower()
    requested = _normalize_ticker_filter_list(pairs) if pairs else []
    registry = _firstrate_canonical_ticker_status_map(it)

    skipped_fresh: list[str] = []
    skipped_existing: list[str] = []
    to_update_stale: list[str] = []
    to_download_new: list[str] = []
    wrong_class: list[dict] = []

    for tok in requested:
        cls = _firstrate_classify_ticker(tok)
        if cls and cls != it:
            wrong_class.append({"ticker": tok, "expected": it, "actual": cls})
            continue
        row = registry.get(tok)
        if row is None:
            to_download_new.append(tok)
            continue
        if skip_all_existing:
            skipped_existing.append(tok)
            continue
        bucket = str(row.get("bucket") or "missing")
        if bucket == "fresh" and skip_fresh:
            skipped_fresh.append(tok)
        elif bucket in {"stale", "missing"}:
            to_update_stale.append(tok)
        elif skip_fresh:
            skipped_fresh.append(tok)
        else:
            to_update_stale.append(tok)

    to_download = sorted(set(to_download_new + ([] if skip_all_existing else to_update_stale)))

    return {
        "instrument_type": it,
        "requested_count": len(requested),
        "requested": requested,
        "to_download": to_download,
        "to_download_new": sorted(set(to_download_new)),
        "to_update_stale": sorted(set(to_update_stale)),
        "skipped_fresh": sorted(set(skipped_fresh)),
        "skipped_existing": sorted(set(skipped_existing)),
        "wrong_class": wrong_class,
        "registry_count": len(registry),
        "summary": {
            "download": len(to_download),
            "new": len(to_download_new),
            "stale_update": len(to_update_stale) if not skip_all_existing else 0,
            "skipped_fresh": len(skipped_fresh),
            "skipped_existing": len(skipped_existing),
            "wrong_class": len(wrong_class),
        },
    }


def _firstrate_tickers_needing_repair(instrument_type: str) -> list[str]:
    """Canonical tickers in this class that are stale or missing (for targeted merge)."""
    want = (instrument_type or "").strip().lower()
    if not want:
        return []
    now_ms = datetime.utcnow().timestamp() * 1000.0
    out: list[str] = []
    db = SessionLocal()
    try:
        files = db.query(CSVFile).all()
        aggs = (
            db.query(CSVAggregate)
            .filter(CSVAggregate.timeframe == "1m")
            .all()
        )
    finally:
        db.close()
    agg_by_file = {int(a.file_id): a for a in aggs}
    seen: set[str] = set()
    for f in files:
        ticker = _firstrate_extract_ticker_from_filename(f.original_name or "")
        asset_class = _firstrate_classify_ticker(ticker) if ticker else None
        if asset_class != want or not ticker:
            continue
        canon = ticker.upper()
        if canon in seen:
            continue
        last_ts = None
        agg = agg_by_file.get(int(f.id))
        if agg is not None and agg.end_ts is not None:
            try:
                last_ts = float(agg.end_ts)
            except (TypeError, ValueError):
                last_ts = None
        staleness_hours: float | None = None
        if last_ts is not None:
            staleness_hours = max(0.0, (now_ms - last_ts) / 3_600_000.0)
        if _firstrate_freshness_bucket(staleness_hours) in {"stale", "missing"}:
            seen.add(canon)
            out.append(canon)
    return sorted(out)


def _firstrate_stale_pairs_only(cfg: dict) -> bool:
    return bool(cfg.get("stale_pairs_only", True))


def _firstrate_stale_repair_batch_limit() -> int:
    """Max tickers per auto-repair job (0 = no limit)."""
    try:
        return max(0, int(os.getenv("FIrstrate_STALE_REPAIR_MAX_PAIRS", "12")))
    except (TypeError, ValueError):
        return 0


def _firstrate_cap_pair_list(pair_list: list[str]) -> list[str]:
    limit = _firstrate_stale_repair_batch_limit()
    if limit <= 0 or len(pair_list) <= limit:
        return pair_list
    return sorted(pair_list)[:limit]


def _firstrate_targeted_pair_list(
    cfg: dict, instrument_type: str, all_pairs: list[str]
) -> list[str]:
    """
    Pair list for scheduled / nightly imports.

    When `stale_pairs_only` is on and any ticker is stale/missing, return only
    those tickers; otherwise return the full class list (routine day pull).
    """
    if not _firstrate_stale_pairs_only(cfg):
        return list(all_pairs)
    repair = _firstrate_tickers_needing_repair(instrument_type)
    return repair if repair else list(all_pairs)


def _firstrate_repair_candidates(cfg: dict) -> list[tuple[int, str, list[str], dict]]:
    """
    Asset classes with stale/missing datasets, highest priority first.
    Returns [(score, instrument_type, pair_list, health_stats), ...].

    With `stale_pairs_only` (default), only tickers that are actually stale or
    missing are queued — never the whole asset class.
    """
    if not bool(cfg.get("auto_repair", True)):
        return []
    excluded = set(
        str(x).strip().lower() for x in (cfg.get("excluded_types") or []) if x
    )
    buckets = _firstrate_classify_existing_datasets()
    stale_only = _firstrate_stale_pairs_only(cfg)
    candidates: list[tuple[int, str, list[str], dict]] = []
    for it, all_pairs in buckets.items():
        if it in excluded:
            continue
        stats = _firstrate_class_health_stats(it)
        stale_n = int(stats.get("stale_count") or 0)
        missing_n = int(stats.get("missing_count") or 0)
        if stale_n < 1 and missing_n < 1:
            continue
        repair_pairs = _firstrate_tickers_needing_repair(it)
        if stale_only:
            if not repair_pairs:
                continue
            pair_list = _firstrate_cap_pair_list(repair_pairs)
        else:
            pair_list = repair_pairs if repair_pairs else list(all_pairs)
        score = missing_n * 1000 + stale_n * 10
        candidates.append((score, it, pair_list, stats))
    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates


def _firstrate_period_for_repair_stats(
    stats: dict,
    *,
    trigger: str = "repair",
    stale_only_job: bool = False,
) -> str:
    """
    Manual Fix: month when any missing. Auto/stale_auto: week/day only — month ZIPs
    (especially stock) monopolize the VPS and loop because missing_count stays > 0.
    """
    max_h = stats.get("max_staleness_hours")
    stale_n = int(stats.get("stale_count") or 0)
    missing_n = int(stats.get("missing_count") or 0)
    auto = str(trigger or "").strip().lower() in {"stale_auto", "schedule"}
    no_month_auto = os.getenv("FIrstrate_AUTO_REPAIR_NO_MONTH", "true").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    # Stale < 7d: use `day` (last session — e.g. Monday when run on Tuesday). `week` often
    # re-downloads the same rolling window ending Friday and adds 0 new bars (MERGED —).
    if auto and no_month_auto:
        if stale_n > 0 or stale_only_job:
            if max_h is not None and float(max_h) <= 24 * 7:
                return "day"
            return "week"
        if missing_n > 0:
            return "week"
        return "day"
    if missing_n > 0 and not stale_only_job:
        return "month"
    if stale_n > 0:
        if max_h is not None and float(max_h) <= 24 * 7:
            return "day"
        return "week"
    return "day"


def _firstrate_auto_repair_pair_list(instrument_type: str) -> tuple[list[str], dict, bool]:
    """
    Pairs for 24/7 auto-repair: prefer stale tickers (week bundle). Missing-only
    tickers are capped (3) and still use week in auto — never month.
    Returns (pair_list, health_stats, stale_only_job).
    """
    it = (instrument_type or "").strip().lower()
    stats = _firstrate_class_health_stats(it)
    stale_pairs = _firstrate_tickers_repair_bucket(it, "stale")
    if stale_pairs:
        return _firstrate_cap_pair_list(stale_pairs), stats, True
    missing_pairs = _firstrate_tickers_repair_bucket(it, "missing")
    skip_missing_only = os.getenv("FIrstrate_AUTO_REPAIR_SKIP_MISSING_ONLY", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if missing_pairs and not skip_missing_only:
        cap = min(3, _firstrate_stale_repair_batch_limit() or 3)
        return sorted(missing_pairs)[: max(1, cap)], stats, False
    return [], stats, False


def _firstrate_pick_auto_repair_candidate(
    cfg: dict,
    candidates: list[tuple[int, str, list[str], dict]],
) -> tuple[str, list[str], dict] | None:
    """
    Round-robin across fx → futures → crypto → stock so stock missing_count
    does not starve fx/futures forever.
    """
    if not candidates:
        return None
    by_class = {item[1]: item for item in candidates}
    order = list(_FIRSTRATE_AUTO_REPAIR_CLASS_ORDER)
    for k in by_class:
        if k not in order:
            order.append(k)
    last = str(cfg.get("last_auto_repair_class") or "").strip().lower()
    start = (order.index(last) + 1) % len(order) if last in order else 0
    cooldown_h = _firstrate_repair_cooldown_hours(cfg)
    for offset in range(len(order)):
        it = order[(start + offset) % len(order)]
        if it not in by_class:
            continue
        if _firstrate_type_in_failure_cooldown(it, cfg):
            continue
        hrs = _firstrate_hours_since_type_repair(cfg, it)
        if hrs is not None and hrs < cooldown_h:
            continue
        finish_hrs = _firstrate_hours_since_type_import_finished(cfg, it)
        if finish_hrs is not None and finish_hrs < cooldown_h:
            continue
        _score, _it, _pairs, stats = by_class[it]
        pair_list, stats, _stale_only = _firstrate_auto_repair_pair_list(it)
        if not pair_list:
            continue
        return it, pair_list, stats
    return None


def _firstrate_pick_schedule_period(cfg: dict, instrument_type: str) -> tuple[str, dict]:
    """
    Choose FirstRate `period` for a scheduled pull.

    - `day`  — last session only (routine maintenance when everything is fresh)
    - `week` — last ~7 days (fills recent gaps / stale tickers)
    - `month` — last ~30 days (very stale or missing last bar)

    FirstRate does not expose per-ticker date ranges; one ZIP per asset class is
    downloaded and merged for every registered ticker in that class.
    """
    stats = _firstrate_class_health_stats(instrument_type)
    base = str(cfg.get("period") or "week").strip().lower()
    if base not in {"full", "month", "week", "day"}:
        base = "week"
    adaptive = cfg.get("adaptive_period")
    if adaptive is None:
        adaptive = True
    if not adaptive:
        return base, stats

    max_h = stats.get("max_staleness_hours")
    if stats["missing_count"] > 0 or (max_h is not None and max_h > 24 * 7):
        return "month", stats
    if stats["stale_count"] > 0 or (max_h is not None and max_h > 48):
        if max_h is not None and float(max_h) <= 24 * 7:
            return "day", stats
        return "week", stats
    if base == "day":
        return "day", stats
    return base, stats


def _firstrate_queue_scheduled_import_for_type(
    *,
    cfg: dict,
    next_type: str,
    pair_list: list[str],
    adjustment: str | None,
    period_override: str | None = None,
    trigger: str = "schedule",
    force_download: bool = False,
) -> None:
    """
    Queue one scheduled FirstRate import with merge enabled.

    Picks `week` / `month` when this asset class has stale or missing datasets
    (not day-only). Skips download when vendor `last_update` is unchanged AND
    every ticker in the class is already fresh. Marks complete only after success.
    """
    health = _firstrate_class_health_stats(next_type)
    if period_override:
        period = str(period_override).strip().lower()
    else:
        period, health = _firstrate_pick_schedule_period(cfg, next_type)
    timeframe = str(cfg.get("timeframe") or "1min")
    needs_catchup = force_download or period in {"week", "month"} or int(
        health.get("stale_count") or 0
    ) > 0 or int(health.get("missing_count") or 0) > 0

    if not needs_catchup and not _firstrate_vendor_has_new_incremental_data(next_type, cfg):
        _firstrate_mark_scheduled_type_complete(next_type)
        cfg2 = _load_firstrate_schedule()
        vendor_dt = (cfg2.get("vendor_last_update_by_type") or {}).get(next_type)
        cfg2["last_run_started_at"] = datetime.utcnow().isoformat() + "Z"
        cfg2["last_status"] = "skipped"
        cfg2["last_error"] = None
        cfg2["last_message"] = (
            f"No new FirstRate {next_type} incremental bundle "
            f"(last_update still {vendor_dt or 'unknown'}; all tickers fresh)"
        )
        _save_firstrate_schedule(cfg2)
        return

    _queue_firstrate_fx_import_job(
        period=period,
        timeframe=timeframe,
        instrument_type=next_type,
        adjustment=adjustment,
        delete_existing_first=False,
        purge_confirmation=None,
        ticker_range=None,
        download_timeout_sec=float(cfg.get("download_timeout_sec") or 7200),
        upsert_existing=True,
        trigger=trigger,
        pairs=pair_list,
    )
    cfg2 = _load_firstrate_schedule()
    cfg2["last_run_started_at"] = datetime.utcnow().isoformat() + "Z"
    cfg2["last_error"] = None
    hc = health
    cfg2["last_message"] = (
        f"Queued {next_type} ({trigger}) period={period} ({timeframe}) "
        f"pairs={len(pair_list)} — fresh={hc.get('fresh_count', 0)} "
        f"stale={hc.get('stale_count', 0)} missing={hc.get('missing_count', 0)}"
    )
    _save_firstrate_schedule(cfg2)


def _firstrate_repair_cooldown_hours(cfg: dict) -> float:
    return max(
        1.0,
        float(os.getenv("FIrstrate_REPAIR_CLASS_COOLDOWN_HOURS", "2")),
    )


def _firstrate_hours_since_type_repair(cfg: dict, instrument_type: str) -> float | None:
    it = (instrument_type or "").strip().lower()
    raw = (cfg.get("last_repair_queued_at_by_type") or {}).get(it)
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", ""))
        return (datetime.utcnow() - dt).total_seconds() / 3600.0
    except Exception:
        return None


def _firstrate_hours_since_type_import_finished(cfg: dict, instrument_type: str) -> float | None:
    it = (instrument_type or "").strip().lower()
    raw = (cfg.get("last_import_finished_at_by_type") or {}).get(it)
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", ""))
        return (datetime.utcnow() - dt).total_seconds() / 3600.0
    except Exception:
        return None


def _firstrate_note_import_finished_for_type(
    instrument_type: str,
    *,
    files_done: int = 0,
    trigger: str = "manual",
) -> None:
    """
    After a successful import, record finish time per asset class.

    Manual imports also mark the class as done for today's nightly rotation and
    apply auto-repair cooldown so the scheduler does not immediately start another
    fx/week job when health cards still show stale tickers.
    """
    it = (instrument_type or "").strip().lower()
    if not it:
        return
    cfg = _load_firstrate_schedule()
    now_iso = datetime.utcnow().isoformat() + "Z"
    finished_map = dict(cfg.get("last_import_finished_at_by_type") or {})
    finished_map[it] = now_iso
    cfg["last_import_finished_at_by_type"] = finished_map
    trig = str(trigger or "manual").strip().lower()
    if trig == "manual" and int(files_done or 0) > 0:
        today_str = datetime.utcnow().strftime("%Y-%m-%d")
        if str(cfg.get("last_run_date") or "") != today_str:
            cfg["last_run_date"] = today_str
            cfg["last_run_types_today"] = []
        done = list(cfg.get("last_run_types_today") or [])
        if it not in done:
            done.append(it)
        cfg["last_run_types_today"] = done
        repair_map = dict(cfg.get("last_repair_queued_at_by_type") or {})
        repair_map[it] = now_iso
        cfg["last_repair_queued_at_by_type"] = repair_map
        cool_h = _firstrate_repair_cooldown_hours(cfg)
        cfg["last_message"] = (
            f"Manual {it} import finished ({int(files_done)} file(s)) — "
            f"nightly will not re-queue {it} again today; auto-repair paused "
            f"{cool_h:.0f}h for this class."
        )
    _save_firstrate_schedule(cfg)


def _firstrate_try_queue_auto_repair(cfg: dict) -> bool:
    """
    24/7 background repair: stale tickers only, week/day bundles, round-robin
    fx → futures → crypto → stock (stock no longer wins every time due to missing).
    """
    candidates = _firstrate_repair_candidates(cfg)
    if not candidates:
        return False

    picked = _firstrate_pick_auto_repair_candidate(cfg, candidates)
    if not picked:
        return False
    next_type, pair_list, stats = picked
    stale_only = bool(_firstrate_tickers_repair_bucket(next_type, "stale"))
    period = _firstrate_period_for_repair_stats(
        stats, trigger="stale_auto", stale_only_job=stale_only
    )
    adjustment = _firstrate_default_adjustment_for(next_type)
    _firstrate_queue_scheduled_import_for_type(
        cfg=cfg,
        next_type=next_type,
        pair_list=pair_list,
        adjustment=adjustment,
        period_override=period,
        trigger="stale_auto",
        force_download=True,
    )
    cfg2 = _load_firstrate_schedule()
    last_map = dict(cfg2.get("last_repair_queued_at_by_type") or {})
    last_map[next_type] = datetime.utcnow().isoformat() + "Z"
    cfg2["last_repair_queued_at_by_type"] = last_map
    cfg2["last_auto_repair_class"] = next_type
    _save_firstrate_schedule(cfg2)
    return True


def _firstrate_schedule_after_job(job_id: str, success: bool, error_message: str | None) -> None:
    try:
        st = _firstrate_read_job(job_id)
        if not st or st.get("trigger") not in ("schedule", "repair", "stale_auto"):
            return
        it = str(st.get("instrument_type") or "").strip().lower()
        cfg = _load_firstrate_schedule()
        cfg["last_run_finished_at"] = datetime.utcnow().isoformat() + "Z"
        cfg["last_job_id"] = job_id
        cfg["last_status"] = "done" if success else "failed"
        cfg["last_error"] = None if success else ((error_message or "")[:2000])
        if success and it:
            _firstrate_mark_scheduled_type_attempted(it)
            _firstrate_mark_scheduled_type_complete(it)
            _firstrate_record_vendor_last_update(it)
            _firstrate_clear_type_failure_cooldown(it)
            _firstrate_queue_auto_duplicate_cleanup(trigger=f"after_{it}_import")
        elif not success and it:
            _firstrate_set_type_failure_cooldown(it, 30)
        _save_firstrate_schedule(cfg)
    except Exception:
        pass


def _firstrate_default_adjustment_for(instrument_type: str) -> str | None:
    """Pick a safe default `adjustment` value for vendor types that require one."""
    t = (instrument_type or "").strip().lower()
    if t == "futures":
        # FirstRate requires a continuous-contract adjustment on every futures
        # data_file call; `contin_UNadj` is the raw unadjusted stitched series.
        return DEFAULT_FUTURES_ADJUSTMENT
    return None


def _firstrate_pending_types_for_nightly(cfg: dict) -> tuple[dict[str, list[str]], list[str]]:
    """
    Compute `(buckets_to_run, already_done_today)` for the nightly auto-sync.

    - If `auto_all_types` is on: walks the dataset registry and buckets every
      registered CSV into fx/crypto/futures/stock so every asset class the user
      has data for gets a delta pull.
    - If off: honours the legacy single `instrument_type` + `pairs` config.

    Respects `excluded_types` — any asset class in that list is silently dropped
    from the buckets so the scheduler never downloads it.

    Only buckets with at least one ticker are returned.
    """
    if bool(cfg.get("auto_all_types", True)):
        buckets = _firstrate_classify_existing_datasets()
    else:
        inst = str(cfg.get("instrument_type") or "fx").strip().lower()
        pairs = cfg.get("pairs") if isinstance(cfg.get("pairs"), list) else []
        buckets = {inst: list(pairs)} if inst else {}
    # Remove excluded asset classes so they never get queued.
    excluded = set(str(x).strip().lower() for x in (cfg.get("excluded_types") or []) if x)
    if excluded:
        buckets = {k: v for k, v in buckets.items() if k not in excluded}
    # Strip empties so we don't queue a no-op job for a class with no tickers.
    buckets = {k: v for k, v in buckets.items() if v}
    done = list(cfg.get("last_run_types_today") or [])
    return buckets, done


def _firstrate_scheduler_tick() -> None:
    try:
        cfg = _load_firstrate_schedule()
        if not cfg.get("enabled"):
            return
        if not get_firstrate_userid():
            return
        # Only one FirstRate import can run at a time; wait for the current one
        # to finish before queueing the next asset class.
        if _firstrate_has_active_import_job():
            return

        # --- 24/7 auto-repair (stale / missing) — no admin clicks required. ----
        if _firstrate_try_queue_auto_repair(cfg):
            return

        mode = str(cfg.get("mode") or "nightly").strip().lower()
        now = datetime.utcnow()
        today_str = now.strftime("%Y-%m-%d")

        # --- Nightly mode: once per day, after the configured UTC hour, ------
        # progressively queue one instrument type per tick until every asset
        # class present in the registry has been pulled for the day.
        if mode == "nightly":
            target_hour = int(cfg.get("nightly_utc_hour", 2) or 0)
            target_hour = max(0, min(23, target_hour))
            if now.hour < target_hour:
                return

            # Reset the per-day done-list when a new UTC day starts.
            if str(cfg.get("last_run_date") or "") != today_str:
                cfg["last_run_date"] = today_str
                cfg["last_run_types_today"] = []
                _save_firstrate_schedule(cfg)

            buckets, done_today = _firstrate_pending_types_for_nightly(cfg)
            pending = _firstrate_filter_actionable_pending(
                [t for t in buckets if t not in done_today], cfg
            )
            if not pending:
                return

            next_type = pending[0]
            all_pairs = list(buckets[next_type])
            pair_list = _firstrate_targeted_pair_list(cfg, next_type, all_pairs)
            adjustment = _firstrate_default_adjustment_for(next_type)
            period_override = None
            if pair_list != all_pairs:
                period_override = _firstrate_period_for_repair_stats(
                    _firstrate_class_health_stats(next_type),
                    trigger="schedule",
                )
            _firstrate_queue_scheduled_import_for_type(
                cfg=cfg,
                next_type=next_type,
                pair_list=pair_list,
                adjustment=adjustment,
                period_override=period_override,
            )
            return

        # --- Interval mode --------------------------------------------------
        # When `auto_all_types` is on, behave like nightly: queue ONE asset
        # class per tick until every class with registered data has been
        # pulled in this cycle, then wait `interval_minutes` from the last
        # completion before starting the next cycle. When off, fall back to
        # the original single-instrument behaviour for back-compat with
        # environments that intentionally pin one type via `instrument_type`.
        interval_min = max(15, int(cfg.get("interval_minutes") or 1440))
        last_fin = cfg.get("last_run_finished_at")
        elapsed_min: float | None = None
        if last_fin:
            try:
                raw = str(last_fin).replace("Z", "")
                lf = datetime.fromisoformat(raw)
                if lf.tzinfo is not None:
                    lf = lf.replace(tzinfo=None)
                elapsed_min = (now - lf).total_seconds() / 60.0
            except Exception:
                elapsed_min = None

        if bool(cfg.get("auto_all_types", True)):
            buckets, done_today = _firstrate_pending_types_for_nightly(cfg)
            pending = [t for t in buckets if t not in done_today]

            if not pending:
                # Whole cycle complete — wait the configured interval before
                # restarting (mirrors nightly's per-day reset, but keyed off
                # last finish time rather than UTC midnight).
                if elapsed_min is None or elapsed_min < interval_min:
                    return
                cfg["last_run_types_today"] = []
                cfg["last_run_date"] = now.strftime("%Y-%m-%d")
                _save_firstrate_schedule(cfg)
                buckets, done_today = _firstrate_pending_types_for_nightly(cfg)
                pending = [t for t in buckets if t not in done_today]
                if not pending:
                    return

            pending = _firstrate_filter_actionable_pending(pending, cfg)
            if not pending:
                return

            next_type = pending[0]
            all_pairs = list(buckets[next_type])
            pair_list = _firstrate_targeted_pair_list(cfg, next_type, all_pairs)
            adjustment = _firstrate_default_adjustment_for(next_type)
            period_override = None
            if pair_list != all_pairs:
                period_override = _firstrate_period_for_repair_stats(
                    _firstrate_class_health_stats(next_type),
                    trigger="schedule",
                )
            _firstrate_queue_scheduled_import_for_type(
                cfg=cfg,
                next_type=next_type,
                pair_list=pair_list,
                adjustment=adjustment,
                period_override=period_override,
            )
            return

        # Single-instrument back-compat path (auto_all_types is off).
        if elapsed_min is not None and elapsed_min < interval_min:
            return

        sched_pairs = cfg.get("pairs")
        pair_list = sched_pairs if isinstance(sched_pairs, list) else []
        single_type = str(cfg.get("instrument_type") or "fx").strip().lower()
        if _firstrate_type_in_failure_cooldown(single_type, cfg):
            return
        _firstrate_queue_scheduled_import_for_type(
            cfg=cfg,
            next_type=single_type,
            pair_list=pair_list,
            adjustment=cfg.get("adjustment"),
        )
    except ValueError as e:
        try:
            cfg2 = _load_firstrate_schedule()
            cfg2["last_error"] = str(e)[:2000]
            _save_firstrate_schedule(cfg2)
        except Exception:
            pass
    except Exception:
        pass


def _firstrate_scheduler_loop() -> None:
    while True:
        try:
            _firstrate_scheduler_tick()
        except Exception:
            pass
        try:
            cfg = _load_firstrate_schedule()
            repair_pending = bool(_firstrate_repair_candidates(cfg))
        except Exception:
            repair_pending = False
        default_sleep = 30.0 if repair_pending else 60.0
        sleep_sec = float(os.getenv("FIrstrate_SCHEDULE_TICK_SEC", str(default_sleep)))
        time.sleep(max(15.0, sleep_sec))


def _firstrate_scheduler_bootstrap() -> None:
    """On container start: clear stuck imports, then run one scheduler tick."""
    try:
        reclaimed = _firstrate_reclaim_stuck_import_jobs()
        if reclaimed:
            print(f"[firstrate] Reclaimed {reclaimed} stuck import job(s) on startup")
        binary_reclaimed = _reclaim_stale_binary_build_jobs()
        if binary_reclaimed:
            print(f"[binary] Re-queued {binary_reclaimed} stale binary build job(s) on startup")
        _firstrate_scheduler_tick()
    except Exception as exc:
        print(f"[firstrate] Scheduler bootstrap: {exc}")


def _start_firstrate_scheduler_thread() -> None:
    """Run FirstRate nightly/repair scheduler on the dedicated worker only (not per gunicorn API worker)."""
    if os.getenv("FIrstrate_SCHEDULE_DISABLE", "").strip().lower() in {"1", "true", "yes", "on"}:
        return
    if APP_ROLE != "worker":
        return
    threading.Thread(target=_firstrate_scheduler_bootstrap, daemon=True, name="firstrate-bootstrap").start()
    threading.Thread(target=_firstrate_scheduler_loop, daemon=True, name="firstrate-scheduler").start()


def _start_dukascopy_fetch_job(instrument: str, from_dt: datetime, to_dt: datetime, node_binary: str) -> dict:
    chunk_ranges = _split_dukascopy_date_ranges(from_dt, to_dt, DUKASCOPY_MAX_RANGE_DAYS)
    total_chunks = len(chunk_ranges)
    from_str = from_dt.strftime("%Y-%m-%d")
    to_str = to_dt.strftime("%Y-%m-%d")
    original_name = f"{instrument}-{DUKASCOPY_DEFAULT_TIMEFRAME}-bid-{from_str}-{to_str}.csv"
    unique_filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(3)}_{original_name}"
    output_path = (UPLOAD_DIR / unique_filename).resolve()

    job_id = f"dk_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{secrets.token_hex(4)}"
    now_iso = datetime.utcnow().isoformat()
    state = {
        "job_id": job_id,
        "status": "queued",          # queued | running | done | failed
        "phase": "queued",           # queued | download | merge | store | done | failed
        "message": f"Queued Dukascopy fetch ({total_chunks} chunk{'s' if total_chunks != 1 else ''})",
        "instrument": instrument,
        "from_date": from_str,
        "to_date": to_str,
        "timeframe": DUKASCOPY_DEFAULT_TIMEFRAME,
        "chunk_days": DUKASCOPY_MAX_RANGE_DAYS,
        "chunk_count": total_chunks,
        "completed_chunks": 0,
        "current_chunk": 0,
        "created_at": now_iso,
        "updated_at": now_iso,
        "chunks": [
            {
                "index": idx,
                "from_date": c_from.strftime("%Y-%m-%d"),
                "to_date": c_to.strftime("%Y-%m-%d"),
                "status": "pending",  # pending | processing | done | failed
            }
            for idx, (c_from, c_to) in enumerate(chunk_ranges, start=1)
        ],
        "result": None,
    }
    _dukascopy_write_job(job_id, state)

    def _worker():
        current_chunk_idx = 0
        try:
            state["status"] = "running"
            state["phase"] = "download"
            state["message"] = f"Starting Dukascopy download ({total_chunks} chunk{'s' if total_chunks != 1 else ''})"
            _dukascopy_write_job(job_id, state)

            with tempfile.TemporaryDirectory(prefix="duka_", dir=str(UPLOAD_DIR.resolve())) as tmp_dir:
                tmp_dir_path = Path(tmp_dir)
                chunk_paths: list[Path] = []

                for idx, (chunk_from, chunk_to) in enumerate(chunk_ranges, start=1):
                    current_chunk_idx = idx
                    chunk_from_str = chunk_from.strftime("%Y-%m-%d")
                    chunk_to_str = chunk_to.strftime("%Y-%m-%d")
                    chunk_path = tmp_dir_path / f"chunk_{idx:04d}.csv"

                    chunk_info = state["chunks"][idx - 1]
                    chunk_info["status"] = "processing"
                    chunk_info["started_at"] = datetime.utcnow().isoformat()
                    state["current_chunk"] = idx
                    state["message"] = f"Downloading chunk {idx}/{total_chunks} ({chunk_from_str} to {chunk_to_str})"
                    _dukascopy_write_job(job_id, state)

                    cmd = [
                        node_binary,
                        str(DUKASCOPY_SCRIPT_PATH),
                        "--instrument", instrument,
                        "--from", chunk_from_str,
                        "--to", chunk_to_str,
                        "--timeframe", DUKASCOPY_DEFAULT_TIMEFRAME,
                        "--out", str(chunk_path),
                    ]

                    try:
                        proc = subprocess.run(
                            cmd,
                            cwd=str(_APP_DIR),
                            capture_output=True,
                            text=True,
                            timeout=1200,
                        )
                    except subprocess.TimeoutExpired:
                        raise RuntimeError(f"Chunk {idx}/{total_chunks} timed out ({chunk_from_str} to {chunk_to_str})")
                    except Exception as exc:
                        raise RuntimeError(f"Chunk {idx}/{total_chunks} failed to start: {str(exc)}")

                    if proc.returncode != 0:
                        err_txt = (proc.stderr or proc.stdout or "Unknown Dukascopy error").strip()
                        err_line = err_txt.splitlines()[-1] if err_txt else "Unknown error"
                        raise RuntimeError(
                            f"Chunk {idx}/{total_chunks} failed ({chunk_from_str} to {chunk_to_str}): {err_line}"
                        )

                    if not chunk_path.exists() or chunk_path.stat().st_size <= 0:
                        raise RuntimeError(
                            f"Chunk {idx}/{total_chunks} returned empty CSV ({chunk_from_str} to {chunk_to_str})"
                        )

                    chunk_info["status"] = "done"
                    chunk_info["rows"] = int(max(count_csv_rows(chunk_path), 0))
                    chunk_info["completed_at"] = datetime.utcnow().isoformat()
                    state["completed_chunks"] = idx
                    state["message"] = f"Completed chunk {idx}/{total_chunks}"
                    _dukascopy_write_job(job_id, state)

                    chunk_paths.append(chunk_path)

                state["phase"] = "merge"
                state["message"] = f"Merging {total_chunks} chunk{'s' if total_chunks != 1 else ''} into one CSV"
                _dukascopy_write_job(job_id, state)

                with open(output_path, "wb") as out_f:
                    first_header = None
                    for idx, chunk_path in enumerate(chunk_paths):
                        with open(chunk_path, "rb") as in_f:
                            first_line = in_f.readline()
                            if not first_line:
                                continue

                            if idx == 0:
                                first_header = first_line
                                out_f.write(first_line)
                            else:
                                if not first_header or first_line.strip().lower() != first_header.strip().lower():
                                    out_f.write(first_line)

                            shutil.copyfileobj(in_f, out_f)

            if not output_path.exists() or output_path.stat().st_size <= 0:
                raise RuntimeError("Merged Dukascopy CSV is empty")

            state["phase"] = "store"
            state["message"] = "Saving dataset and triggering binary conversion"
            _dukascopy_write_job(job_id, state)

            result = _store_dataset_file(
                file_path=output_path,
                original_name=original_name,
                description=f"Dukascopy {instrument.upper()} {DUKASCOPY_DEFAULT_TIMEFRAME.upper()} {from_str} to {to_str}"
            )
            result["source"] = "dukascopy"
            result["params"] = {
                "instrument": instrument,
                "from_date": from_str,
                "to_date": to_str,
                "timeframe": DUKASCOPY_DEFAULT_TIMEFRAME,
                "chunk_days": DUKASCOPY_MAX_RANGE_DAYS,
                "chunk_count": total_chunks,
            }

            state["status"] = "done"
            state["phase"] = "done"
            state["message"] = f"Completed Dukascopy fetch ({total_chunks} chunk{'s' if total_chunks != 1 else ''})"
            state["result"] = result
            state["finished_at"] = datetime.utcnow().isoformat()
            _dukascopy_write_job(job_id, state)
        except Exception as exc:
            err_text = str(exc) or "Unknown Dukascopy job error"
            if output_path.exists():
                try:
                    output_path.unlink()
                except Exception:
                    pass

            if current_chunk_idx > 0 and current_chunk_idx <= len(state.get("chunks", [])):
                c = state["chunks"][current_chunk_idx - 1]
                if c.get("status") not in {"done", "failed"}:
                    c["status"] = "failed"
                    c["error"] = err_text
                    c["completed_at"] = datetime.utcnow().isoformat()

            state["status"] = "failed"
            state["phase"] = "failed"
            state["message"] = err_text
            state["error"] = err_text
            state["finished_at"] = datetime.utcnow().isoformat()
            _dukascopy_write_job(job_id, state)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()

    return {
        "success": True,
        "job_id": job_id,
        "status": "queued",
        "params": {
            "instrument": instrument,
            "from_date": from_str,
            "to_date": to_str,
            "timeframe": DUKASCOPY_DEFAULT_TIMEFRAME,
            "chunk_days": DUKASCOPY_MAX_RANGE_DAYS,
            "chunk_count": total_chunks,
        }
    }

# ── Binance historical (binance-historical-data) jobs ─────────────────────

def _binance_job_path(job_id: str) -> Path:
    safe_job_id = re.sub(r"[^a-zA-Z0-9_-]", "", (job_id or ""))
    if not safe_job_id:
        safe_job_id = "invalid"
    return BINANCE_JOBS_DIR / f"{safe_job_id}.json"


def _binance_cleanup_jobs() -> None:
    cutoff = time.time() - max(60, BINANCE_JOB_TTL_SECONDS)
    for p in BINANCE_JOBS_DIR.glob("*.json"):
        try:
            if p.stat().st_mtime < cutoff:
                p.unlink()
        except Exception:
            pass


def _binance_write_job(job_id: str, state: dict) -> None:
    p = _binance_job_path(job_id)
    state["updated_at"] = datetime.utcnow().isoformat()
    tmp = p.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f)
    tmp.replace(p)


def _binance_read_job(job_id: str) -> dict | None:
    p = _binance_job_path(job_id)
    if not p.exists():
        return None
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _normalize_binance_tickers_required(raw: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for t in raw:
        s = (t or "").strip().upper()
        if not s:
            continue
        if not re.fullmatch(r"[A-Z0-9]{4,20}", s):
            raise HTTPException(status_code=400, detail=f"Invalid ticker: {t!r} (e.g. BTCUSDT)")
        if s not in seen:
            seen.add(s)
            out.append(s)
    if not out:
        raise HTTPException(status_code=400, detail="At least one ticker is required")
    if len(out) > BINANCE_MAX_TICKERS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many tickers ({len(out)}). Max per request is {BINANCE_MAX_TICKERS}.",
        )
    return out


def _normalize_binance_exclude_tickers(raw: list[str] | None) -> list[str] | None:
    if not raw:
        return None
    out: list[str] = []
    seen: set[str] = set()
    for t in raw:
        s = (t or "").strip().upper()
        if not s:
            continue
        if not re.fullmatch(r"[A-Z0-9]{4,20}", s):
            raise HTTPException(status_code=400, detail=f"Invalid tickers_to_exclude entry: {t!r}")
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out or None


def _collect_binance_kline_csvs(
    dump_root: Path,
    asset_class: str,
    ticker: str,
    data_frequency: str,
    data_type: str = "klines",
) -> list[Path]:
    if asset_class in ("um", "cm"):
        base = dump_root / "futures" / asset_class
    else:
        base = dump_root / asset_class
    dt_folder = (data_type or "klines").strip() or "klines"
    found: list[Path] = []
    for period in ("monthly", "daily"):
        d = base / period / dt_folder / ticker / data_frequency
        if d.is_dir():
            found.extend(p for p in d.iterdir() if p.suffix.lower() == ".csv" and p.is_file())
    return sorted(found, key=lambda p: p.name)


def _merge_binance_kline_csvs_to_file(csv_paths: list[Path], out_path: Path) -> int:
    import csv as csv_mod

    def _parse_ts(cell: str) -> int | None:
        raw = str(cell or "").strip()
        if not raw:
            return None
        try:
            return int(float(raw))
        except (ValueError, TypeError):
            return None

    rows_by_ts: dict[int, tuple[float, float, float, float, float]] = {}
    for p in csv_paths:
        try:
            with open(p, "r", encoding="utf-8-sig", errors="replace", newline="") as f:
                reader = csv_mod.reader(f)
                for row in reader:
                    if len(row) < 6:
                        continue
                    ts = _parse_ts(row[0])
                    if ts is None:
                        continue
                    try:
                        o, h, l, c, v = float(row[1]), float(row[2]), float(row[3]), float(row[4]), float(row[5])
                    except (ValueError, TypeError):
                        continue
                    rows_by_ts[ts] = (o, h, l, c, v)
        except OSError:
            continue

    if not rows_by_ts:
        return 0

    sorted_ts = sorted(rows_by_ts.keys())
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        w = csv_mod.writer(f)
        w.writerow(["timestamp", "open", "high", "low", "close", "volume"])
        for ts in sorted_ts:
            o, h, l, c, v = rows_by_ts[ts]
            w.writerow([ts, o, h, l, c, v])
    return len(sorted_ts)


def _start_binance_fetch_job(
    tickers: list[str],
    asset_class: str,
    data_frequency: str,
    data_type: str,
    from_dt: datetime,
    to_dt: datetime,
    is_to_update_existing: bool,
    tickers_to_exclude: list[str] | None,
) -> dict:
    from_str = from_dt.strftime("%Y-%m-%d")
    to_str = to_dt.strftime("%Y-%m-%d")

    job_id = f"bn_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{secrets.token_hex(4)}"
    now_iso = datetime.utcnow().isoformat()
    state = {
        "job_id": job_id,
        "status": "queued",
        "message": "Queued Binance historical download",
        "tickers": tickers,
        "asset_class": asset_class,
        "data_frequency": data_frequency,
        "data_type": data_type,
        "from_date": from_str,
        "to_date": to_str,
        "created_at": now_iso,
        "updated_at": now_iso,
        "result": None,
        "results": None,
        "error": None,
    }
    _binance_write_job(job_id, state)

    def _worker():
        try:
            from binance_historical_data import BinanceDataDumper

            state["status"] = "running"
            state["message"] = "Downloading from Binance Vision (may take several minutes)…"
            _binance_write_job(job_id, state)

            with tempfile.TemporaryDirectory(prefix="bn_", dir=str(UPLOAD_DIR.resolve())) as tmp:
                tmp_path = Path(tmp)
                dumper = BinanceDataDumper(
                    path_dir_where_to_dump=str(tmp_path),
                    asset_class=asset_class,
                    data_type=data_type,
                    data_frequency=data_frequency,
                )
                dumper.dump_data(
                    tickers=tickers,
                    date_start=from_dt.date(),
                    date_end=to_dt.date(),
                    is_to_update_existing=is_to_update_existing,
                    tickers_to_exclude=tickers_to_exclude,
                )

                aggregate_results = []
                for idx, ticker in enumerate(tickers, start=1):
                    state["message"] = f"Merging CSV for {ticker} ({idx}/{len(tickers)})…"
                    _binance_write_job(job_id, state)

                    csv_paths = _collect_binance_kline_csvs(
                        tmp_path, asset_class, ticker, data_frequency, data_type=data_type
                    )
                    type_slug = data_type if data_type != "klines" else ""
                    original_name = (
                        f"{ticker}-{data_type}-{data_frequency}-{from_str}-{to_str}.csv"
                        if type_slug
                        else f"{ticker}-{data_frequency}-{from_str}-{to_str}.csv"
                    )
                    unique_filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(3)}_{original_name}"
                    output_path = (UPLOAD_DIR / unique_filename).resolve()

                    row_n = _merge_binance_kline_csvs_to_file(csv_paths, output_path)
                    if row_n <= 0:
                        if output_path.exists():
                            try:
                                output_path.unlink()
                            except OSError:
                                pass
                        raise RuntimeError(
                            f"No kline rows parsed for {ticker}. "
                            "Check symbol, interval, dates, and that files exist under Binance public data."
                        )

                    desc = (
                        f"Binance {asset_class} {data_type} {ticker} {data_frequency} {from_str} → {to_str} "
                        f"(binance-historical-data)"
                    )
                    one = _store_dataset_file(
                        file_path=output_path,
                        original_name=original_name,
                        description=desc,
                    )
                    one["source"] = "binance-historical-data"
                    one["ticker"] = ticker
                    aggregate_results.append(one)

                state["status"] = "done"
                state["message"] = f"Completed Binance fetch for {len(tickers)} ticker(s)"
                state["results"] = aggregate_results
                state["result"] = aggregate_results[-1] if aggregate_results else None
                state["finished_at"] = datetime.utcnow().isoformat()
                _binance_write_job(job_id, state)
        except Exception as exc:
            err_text = str(exc) or "Unknown Binance job error"
            state["status"] = "failed"
            state["message"] = err_text
            state["error"] = err_text
            state["finished_at"] = datetime.utcnow().isoformat()
            _binance_write_job(job_id, state)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()

    return {
        "success": True,
        "job_id": job_id,
        "status": "queued",
        "params": {
            "tickers": tickers,
            "asset_class": asset_class,
            "data_frequency": data_frequency,
            "data_type": data_type,
            "from_date": from_str,
            "to_date": to_str,
            "is_to_update_existing": is_to_update_existing,
        },
    }


# ── Yahoo Finance CME-style continuous futures (ES=F, NQ=F, …) ───────────────

def _normalize_yahoo_cme_ticker(value: str) -> str:
    t = (value or "").strip().upper()
    if not t:
        raise HTTPException(status_code=400, detail="ticker is required")
    # Yahoo continuous futures use "ROOT=F" (may include digits, e.g. 6E=F).
    if not re.fullmatch(r"[A-Z0-9]{1,6}=F", t):
        raise HTTPException(
            status_code=400,
            detail='ticker must look like a Yahoo continuous future (e.g. ES=F, NQ=F, 6E=F).',
        )
    return t


def _normalize_yahoo_cme_interval(value: str) -> str:
    raw = (value or "1d").strip().lower()
    iv = YAHOO_CME_INTERVAL_ALIASES.get(raw, raw)
    if iv not in YAHOO_CME_ALLOWED_INTERVALS:
        raise HTTPException(
            status_code=400,
            detail=f"interval must be one of: {', '.join(sorted(YAHOO_CME_ALLOWED_INTERVALS))}",
        )
    return iv


def _yahoo_cme_chunk_days(interval: str) -> int:
    """
    Calendar days per Yahoo request — small windows (like Dukascopy forex chunks) to avoid
    truncation, empty responses, and rate limits on long ranges. Tunable via env.
    """
    i = interval.lower()
    if i == "1m":
        return max(1, int(os.getenv("YAHOO_CME_CHUNK_DAYS_1M", "5")))
    if i in ("2m", "5m"):
        return max(1, int(os.getenv("YAHOO_CME_CHUNK_DAYS_2M_5M", "14")))
    if i in ("15m", "30m"):
        return max(1, int(os.getenv("YAHOO_CME_CHUNK_DAYS_15M_30M", "45")))
    if i in ("60m", "1h"):
        return max(1, int(os.getenv("YAHOO_CME_CHUNK_DAYS_60M", "180")))
    if i == "1d":
        # Single multi-year daily calls often fail or return partial data on Yahoo.
        return max(1, int(os.getenv("YAHOO_CME_CHUNK_DAYS_1D", "365")))
    return max(1, int(os.getenv("YAHOO_CME_CHUNK_DAYS_DEFAULT", "14")))


def _yahoo_cme_date_chunks(
    from_dt: datetime,
    to_dt: datetime,
    chunk_days: int,
) -> list[tuple[datetime.date, datetime.date]]:
    ranges: list[tuple[datetime.date, datetime.date]] = []
    step = max(1, int(chunk_days))
    cursor = from_dt.date()
    end_d = to_dt.date()
    while cursor <= end_d:
        chunk_end = min(cursor + timedelta(days=step - 1), end_d)
        ranges.append((cursor, chunk_end))
        cursor = chunk_end + timedelta(days=1)
    return ranges


def _yahoo_cme_flatten_columns(df):
    import pandas as pd

    if df is None or df.empty:
        return df
    if isinstance(df.columns, pd.MultiIndex):
        df = df.copy()
        df.columns = [str(c[0]) for c in df.columns]
    return df


def _yahoo_cme_index_to_epoch_ms(index) -> "object":
    import numpy as np
    import pandas as pd

    idx = pd.DatetimeIndex(index)
    if idx.tz is None:
        idx = idx.tz_localize("America/New_York", ambiguous="infer", nonexistent="shift_forward")
    utc = idx.tz_convert("UTC")
    return (utc.astype(np.int64) // 1_000_000).astype(np.int64)


def _yahoo_cme_df_to_csv_file(df, out_path: Path) -> int:
    import csv as csv_mod

    import pandas as pd

    df = _yahoo_cme_flatten_columns(df)
    if df is None or df.empty:
        raise ValueError("No rows returned from Yahoo Finance")
    rename = {}
    for c in df.columns:
        cl = str(c).lower()
        if cl in ("open", "high", "low", "close", "volume"):
            rename[c] = cl
    df2 = df.rename(columns=rename)
    for need in ("open", "high", "low", "close"):
        if need not in df2.columns:
            raise ValueError(f"Missing column {need} in Yahoo response")
    vol_col = "volume" if "volume" in df2.columns else None
    ts_ms = _yahoo_cme_index_to_epoch_ms(df2.index)
    n = len(df2)
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        w = csv_mod.writer(f)
        w.writerow(["timestamp", "open", "high", "low", "close", "volume"])
        for i in range(n):
            if vol_col:
                vraw = df2["volume"].iloc[i]
                try:
                    vrow = 0.0 if pd.isna(vraw) else float(vraw)
                except Exception:
                    vrow = 0.0
            else:
                vrow = 0.0
            w.writerow(
                [
                    int(ts_ms[i]),
                    float(df2["open"].iloc[i]),
                    float(df2["high"].iloc[i]),
                    float(df2["low"].iloc[i]),
                    float(df2["close"].iloc[i]),
                    vrow,
                ]
            )
    return n


def _yf_download_chunk(ticker: str, start_d: datetime.date, end_exclusive: datetime.date, interval: str):
    """Single yfinance download; retries on Yahoo rate limits and transient empty frames."""
    import time

    import yfinance as yf

    start_s = start_d.strftime("%Y-%m-%d")
    end_s = end_exclusive.strftime("%Y-%m-%d")
    last_exc: Exception | None = None
    for attempt in range(10):
        try:
            df = yf.download(
                ticker,
                start=start_s,
                end=end_s,
                interval=interval,
                auto_adjust=False,
                progress=False,
                threads=False,
            )
            if df is not None and not df.empty:
                return df
            # Yahoo sometimes returns an empty frame under load — treat like a soft failure.
            if attempt < 7:
                time.sleep(min(90.0, 6.0 + 5.0 * attempt + (attempt ** 1.5)))
                continue
            return df
        except Exception as exc:
            last_exc = exc
            err = str(exc).lower()
            if any(
                x in err
                for x in (
                    "rate",
                    "too many",
                    "429",
                    "limited",
                    "limit",
                    "timeout",
                    "temporar",
                    "yahoo",
                    "blocked",
                    "503",
                    "502",
                )
            ):
                time.sleep(min(120.0, 5.0 * (2 ** min(attempt, 7))))
            else:
                raise
    raise last_exc if last_exc else RuntimeError("Yahoo Finance download failed")


def _yahoo_cme_fetch_and_write(
    ticker: str,
    from_dt: datetime,
    to_dt: datetime,
    interval: str,
    output_path: Path,
    job_id: str | None = None,
) -> int:
    """Download all chunks (small date windows), merge, write CSV. Returns row count."""
    import time

    import pandas as pd

    chunk_days = _yahoo_cme_chunk_days(interval)
    ranges = _yahoo_cme_date_chunks(from_dt, to_dt, chunk_days)
    total = len(ranges)
    if total > YAHOO_CME_MAX_CHUNKS:
        raise ValueError(
            f"Download would require {total} Yahoo requests (max {YAHOO_CME_MAX_CHUNKS}). "
            "Use a shorter date range or a coarser interval (for example 1d), "
            "or raise YAHOO_CME_MAX_CHUNKS / widen YAHOO_CME_CHUNK_DAYS_* env vars."
        )

    def _progress(current: int, a: datetime.date, b: datetime.date) -> None:
        if not job_id:
            return
        st = _yahoo_cme_read_job(job_id)
        if not st:
            return
        st["status"] = "running"
        st["phase"] = "download"
        st["completed_chunks"] = current
        st["chunk_count"] = total
        st["current_chunk"] = current
        st["message"] = f"Yahoo chunk {current}/{total} ({a.isoformat()} → {b.isoformat()})"
        _yahoo_cme_write_job(job_id, st)

    dfs: list = []
    base_sleep = max(0.0, YAHOO_CME_CHUNK_SLEEP_SECONDS)
    jitter_max = max(0.0, YAHOO_CME_CHUNK_SLEEP_JITTER_SECONDS)

    for idx, (a, b) in enumerate(ranges, start=1):
        end_excl = b + timedelta(days=1)
        _progress(idx, a, b)
        df = _yf_download_chunk(ticker, a, end_excl, interval)
        df = _yahoo_cme_flatten_columns(df)
        if df is not None and not df.empty:
            dfs.append(df)
        if idx < total:
            delay = base_sleep + (random.uniform(0, jitter_max) if jitter_max > 0 else 0.0)
            if delay > 0:
                time.sleep(delay)
    if not dfs:
        raise ValueError("Yahoo Finance returned no rows (check ticker, dates, and rate limits)")
    merged = pd.concat(dfs, axis=0)
    merged = merged[~merged.index.duplicated(keep="last")]
    merged = merged.sort_index()
    if job_id:
        st = _yahoo_cme_read_job(job_id)
        if st:
            st["phase"] = "merge"
            st["message"] = "Merging Yahoo chunks and writing CSV…"
            _yahoo_cme_write_job(job_id, st)
    return _yahoo_cme_df_to_csv_file(merged, output_path)


def _yahoo_cme_job_path(job_id: str) -> Path:
    safe_job_id = re.sub(r"[^a-zA-Z0-9_-]", "", (job_id or ""))
    if not safe_job_id:
        safe_job_id = "invalid"
    return YAHOO_CME_JOBS_DIR / f"{safe_job_id}.json"


def _yahoo_cme_cleanup_jobs() -> None:
    cutoff = time.time() - max(60, YAHOO_CME_JOB_TTL_SECONDS)
    for p in YAHOO_CME_JOBS_DIR.glob("*.json"):
        try:
            if p.stat().st_mtime < cutoff:
                p.unlink()
        except Exception:
            pass


def _yahoo_cme_write_job(job_id: str, state: dict) -> None:
    p = _yahoo_cme_job_path(job_id)
    state["updated_at"] = datetime.utcnow().isoformat()
    tmp = p.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f)
    tmp.replace(p)


def _yahoo_cme_read_job(job_id: str) -> dict | None:
    p = _yahoo_cme_job_path(job_id)
    if not p.exists():
        return None
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _yahoo_cme_find_latest_active_job() -> dict | None:
    """
    Newest queued/running Yahoo job on disk — used so the admin UI can reconnect after refresh.
    The download worker runs in a server thread; losing the browser tab does not cancel it.
    """
    best: dict | None = None
    best_updated = ""
    _yahoo_cme_cleanup_jobs()
    for p in YAHOO_CME_JOBS_DIR.glob("*.json"):
        try:
            with open(p, "r", encoding="utf-8") as f:
                st = json.load(f)
        except Exception:
            continue
        if st.get("status") not in ("queued", "running"):
            continue
        u = str(st.get("updated_at") or st.get("created_at") or "")
        if u >= best_updated:
            best_updated = u
            best = st
    return best


def _start_yahoo_cme_fetch_job(ticker: str, from_dt: datetime, to_dt: datetime, interval: str) -> dict:
    from_str = from_dt.strftime("%Y-%m-%d")
    to_str = to_dt.strftime("%Y-%m-%d")
    original_name = f"{ticker}-{interval}-{from_str}-{to_str}.csv"
    unique_filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(3)}_{original_name}"
    output_path = (UPLOAD_DIR / unique_filename).resolve()

    job_id = f"ycm_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{secrets.token_hex(4)}"
    now_iso = datetime.utcnow().isoformat()
    chunk_days = _yahoo_cme_chunk_days(interval)
    ranges = _yahoo_cme_date_chunks(from_dt, to_dt, chunk_days)
    chunk_n = len(ranges)
    if chunk_n > YAHOO_CME_MAX_CHUNKS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"This range/interval needs {chunk_n} Yahoo requests (limit {YAHOO_CME_MAX_CHUNKS}). "
                "Narrow the dates or use a larger interval."
            ),
        )

    state = {
        "job_id": job_id,
        "status": "queued",
        "phase": "queued",
        "message": f"Queued Yahoo Finance download ({chunk_n} date chunk{'s' if chunk_n != 1 else ''})",
        "ticker": ticker,
        "interval": interval,
        "from_date": from_str,
        "to_date": to_str,
        "chunk_count": chunk_n,
        "completed_chunks": 0,
        "current_chunk": 0,
        "created_at": now_iso,
        "updated_at": now_iso,
        "result": None,
        "error": None,
    }
    _yahoo_cme_write_job(job_id, state)

    def _worker():
        try:
            state["status"] = "running"
            state["phase"] = "download"
            state["completed_chunks"] = 0
            state["message"] = "Downloading from Yahoo Finance (small date ranges)…"
            _yahoo_cme_write_job(job_id, state)

            rows = _yahoo_cme_fetch_and_write(
                ticker, from_dt, to_dt, interval, output_path, job_id=job_id
            )

            latest = _yahoo_cme_read_job(job_id)
            if latest:
                state.update(latest)
            state["phase"] = "store"
            state["message"] = "Saving dataset and building binary timeframes…"
            _yahoo_cme_write_job(job_id, state)

            desc = (
                f"Yahoo Finance CME continuous future {ticker} {interval} {from_str} → {to_str} "
                f"({rows} rows)"
            )
            result = _store_dataset_file(
                file_path=output_path,
                original_name=original_name,
                description=desc,
            )
            result["source"] = "yahoo-finance-cme"
            result["params"] = {
                "ticker": ticker,
                "from_date": from_str,
                "to_date": to_str,
                "interval": interval,
            }
            state["status"] = "done"
            state["phase"] = "done"
            state["message"] = f"Completed Yahoo download ({rows} candles)"
            state["result"] = result
            state["finished_at"] = datetime.utcnow().isoformat()
            _yahoo_cme_write_job(job_id, state)
        except Exception as exc:
            err_text = str(exc) or "Unknown Yahoo CME job error"
            if output_path.exists():
                try:
                    output_path.unlink()
                except OSError:
                    pass
            state["status"] = "failed"
            state["phase"] = "failed"
            state["message"] = err_text
            state["error"] = err_text
            state["finished_at"] = datetime.utcnow().isoformat()
            _yahoo_cme_write_job(job_id, state)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()

    return {
        "success": True,
        "job_id": job_id,
        "status": "queued",
        "params": {
            "ticker": ticker,
            "from_date": from_str,
            "to_date": to_str,
            "interval": interval,
        },
    }


def file_response_if_exists(path: str):
    p = Path(path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(str(p))

# ── Binary & Aggregation directories ──
BIN_DIR = UPLOAD_DIR / "bin"
BIN_DIR.mkdir(exist_ok=True)
AGG_DIR = UPLOAD_DIR / "aggregates"
AGG_DIR.mkdir(exist_ok=True)
TILES_DIR = UPLOAD_DIR / "tiles"
TILES_DIR.mkdir(exist_ok=True)

import struct
import mmap as _mmap_mod

CANDLE_STRUCT = struct.Struct('<6d')  # 6 x float64 = 48 bytes per candle (t,o,h,l,c,v)
CANDLE_SIZE = CANDLE_STRUCT.size      # 48
TILE_SIZE   = 50_000                  # candles per tile

# ── mmap LRU Cache ──────────────────────────────────────────────────────────
class _MmapCache:
    """Thread-safe LRU cache of memory-mapped binary tile files."""
    def __init__(self, maxsize: int = 200):
        import threading
        self._lock = threading.Lock()
        self._maxsize = maxsize
        self._cache: dict = {}   # str(path) -> (fh, mmap)
        self._order: list = []

    def get(self, path):
        key = str(path)
        with self._lock:
            if key in self._cache:
                self._order.remove(key)
                self._order.append(key)
                return self._cache[key][1]
            if not Path(path).exists():
                return None
            if len(self._cache) >= self._maxsize:
                self._evict_locked()
            try:
                fh = open(path, 'rb')
                mm = _mmap_mod.mmap(fh.fileno(), 0, access=_mmap_mod.ACCESS_READ)
                self._cache[key] = (fh, mm)
                self._order.append(key)
                return mm
            except Exception:
                return None

    def invalidate(self, path):
        key = str(path)
        with self._lock:
            if key in self._cache:
                fh, mm = self._cache.pop(key)
                if key in self._order:
                    self._order.remove(key)
                try: mm.close()
                except Exception: pass
                try: fh.close()
                except Exception: pass

    def _evict_locked(self):
        if self._order:
            oldest = self._order.pop(0)
            fh, mm = self._cache.pop(oldest, (None, None))
            if mm:
                try: mm.close()
                except Exception: pass
            if fh:
                try: fh.close()
                except Exception: pass

_mmap_cache = _MmapCache(maxsize=200)

def _mmap_read_range(path, start_idx: int, count: int) -> list:
    """Read candles from a binary file via mmap — O(1) seek, OS page-cached."""
    mm = _mmap_cache.get(path)
    if mm is None:
        return []
    candles = []
    pos = start_idx * CANDLE_SIZE
    end = pos + count * CANDLE_SIZE
    if end > len(mm):
        end = len(mm)
    data = mm[pos:end]
    for i in range(0, len(data) - CANDLE_SIZE + 1, CANDLE_SIZE):
        t, o, h, l, c, v = CANDLE_STRUCT.unpack_from(data, i)
        candles.append({'t': int(t), 'o': o, 'h': h, 'l': l, 'c': c, 'v': v})
    return candles

def _mmap_total(path) -> int:
    mm = _mmap_cache.get(path)
    return len(mm) // CANDLE_SIZE if mm else 0

def _mmap_bisect(path, target_ts: int) -> int:
    """Binary search for first candle with t >= target_ts using mmap."""
    mm = _mmap_cache.get(path)
    if mm is None:
        return 0
    total = len(mm) // CANDLE_SIZE
    lo, hi = 0, total
    while lo < hi:
        mid = (lo + hi) // 2
        pos = mid * CANDLE_SIZE
        t = int(struct.unpack_from('<d', mm, pos)[0])
        if t < target_ts:
            lo = mid + 1
        else:
            hi = mid
    return lo

# ── Tile helpers ─────────────────────────────────────────────────────────────
def _tile_dir(file_id: int, tf: str) -> Path:
    d = TILES_DIR / str(file_id) / tf
    d.mkdir(parents=True, exist_ok=True)
    return d

def _tile_path(file_id: int, tf: str, tile_idx: int) -> Path:
    return TILES_DIR / str(file_id) / tf / f"tile_{tile_idx}.bin"

def _tile_meta_path(file_id: int, tf: str) -> Path:
    return TILES_DIR / str(file_id) / tf / "meta.json"

def _write_tiles(file_id: int, tf: str, candles: list) -> dict:
    """Split candles into TILE_SIZE chunks, write each as a .bin tile, save meta.json."""
    _tile_dir(file_id, tf)
    total = len(candles)
    tile_count = math.ceil(total / TILE_SIZE) if total > 0 else 0
    tiles_meta = []
    for i in range(tile_count):
        chunk = candles[i * TILE_SIZE:(i + 1) * TILE_SIZE]
        tp = _tile_path(file_id, tf, i)
        _write_bin(chunk, tp)
        _mmap_cache.invalidate(tp)
        tiles_meta.append({
            "start_ts": chunk[0]['t'],
            "end_ts":   chunk[-1]['t'],
            "count":    len(chunk),
        })
    meta = {"tile_count": tile_count, "total": total, "tile_size": TILE_SIZE, "tiles": tiles_meta}
    with open(_tile_meta_path(file_id, tf), 'w') as f:
        json.dump(meta, f)
    return meta

def _load_tile_meta(file_id: int, tf: str) -> dict | None:
    p = _tile_meta_path(file_id, tf)
    if not p.exists():
        return None
    try:
        with open(p) as f:
            return json.load(f)
    except Exception:
        return None

def _tiles_read_window(file_id: int, tf: str, meta: dict,
                       limit: int, anchor: str = "end",
                       start_ts: int = None, end_ts: int = None):
    """Read up to `limit` candles from tiles, honouring anchor + optional date filter."""
    tiles = meta["tiles"]
    total = meta["total"]
    if not tiles or limit <= 0:
        return [], 0, False, False

    # Fast path: common viewport boot load asks for latest/earliest N bars with no
    # date filter. Avoid scanning every tile; read only the minimum tail/head slices.
    if start_ts is None and end_ts is None:
        if anchor == "start":
            out = []
            remaining = limit
            for ti in range(0, len(tiles)):
                if remaining <= 0:
                    break
                tp = _tile_path(file_id, tf, ti)
                n = int(tiles[ti]["count"])
                take = min(remaining, n)
                if take > 0:
                    out.extend(_mmap_read_range(tp, 0, take))
                    remaining -= take
            has_more_left = False
            has_more_right = total > len(out)
            return out, total, has_more_left, has_more_right

        # anchor=end (default)
        parts = []
        remaining = limit
        for ti in range(len(tiles) - 1, -1, -1):
            if remaining <= 0:
                break
            tp = _tile_path(file_id, tf, ti)
            n = int(tiles[ti]["count"])
            take = min(remaining, n)
            if take <= 0:
                continue
            start_idx = max(0, n - take)
            chunk = _mmap_read_range(tp, start_idx, take)
            if chunk:
                parts.append(chunk)
                remaining -= len(chunk)

        out = []
        for part in reversed(parts):
            out.extend(part)
        has_more_left = total > len(out)
        has_more_right = False
        return out, total, has_more_left, has_more_right

    # Find tile range that overlaps the requested date window
    first_tile = 0
    last_tile  = len(tiles) - 1
    if start_ts is not None:
        for i, t in enumerate(tiles):
            if t["end_ts"] >= start_ts:
                first_tile = i
                break
    if end_ts is not None:
        for i in range(len(tiles) - 1, -1, -1):
            if tiles[i]["start_ts"] <= end_ts:
                last_tile = i
                break

    # Collect candles from the relevant tiles
    candles = []
    for ti in range(first_tile, last_tile + 1):
        tp = _tile_path(file_id, tf, ti)
        n  = tiles[ti]["count"]
        candles.extend(_mmap_read_range(tp, 0, n))

    # Apply date filter
    if start_ts is not None:
        candles = [c for c in candles if c['t'] >= start_ts]
    if end_ts is not None:
        candles = [c for c in candles if c['t'] <= end_ts]

    range_total = len(candles)

    # Apply limit + anchor
    if range_total > limit:
        if anchor == "start":
            has_more_left  = first_tile > 0 or (start_ts and candles[0]['t'] > start_ts)
            has_more_right = True
            candles = candles[:limit]
        else:
            has_more_left  = True
            has_more_right = last_tile < len(tiles) - 1 or (end_ts and candles[-1]['t'] < end_ts)
            candles = candles[-limit:]
    else:
        has_more_left  = first_tile > 0
        has_more_right = last_tile < len(tiles) - 1

    return candles, range_total, has_more_left, has_more_right


def _tiles_read_cursor_window(file_id: int, tf: str, meta: dict,
                              limit: int, cursor_ts: int, direction: str):
    """
    Cursor pagination on tile metadata without scanning the full remaining range.
    Reads only the tiles/candles required to produce up to `limit` candles.
    Returns candles in ascending time order.
    """
    tiles = (meta or {}).get("tiles") or []
    if not tiles or limit <= 0:
        return [], False, False

    if direction == "forward":
        start_ts = cursor_ts + 1 if cursor_ts is not None else None

        start_tile = None
        for i, t in enumerate(tiles):
            if start_ts is None or t["end_ts"] >= start_ts:
                start_tile = i
                break

        has_more_left = cursor_ts is not None
        if start_tile is None:
            return [], has_more_left, False

        candles = []
        for ti in range(start_tile, len(tiles)):
            tp = _tile_path(file_id, tf, ti)
            n = tiles[ti]["count"]
            chunk = _mmap_read_range(tp, 0, n)

            if ti == start_tile and start_ts is not None:
                chunk = [c for c in chunk if c['t'] >= start_ts]

            if not chunk:
                continue

            need = limit - len(candles)
            if need <= 0:
                break

            if len(chunk) > need:
                candles.extend(chunk[:need])
                break

            candles.extend(chunk)
            if len(candles) >= limit:
                break

        if not candles:
            return [], has_more_left, False

        has_more_right = candles[-1]['t'] < tiles[-1]['end_ts']
        return candles, has_more_left, has_more_right

    # backward
    end_ts = cursor_ts - 1 if cursor_ts is not None else None

    end_tile = None
    for i in range(len(tiles) - 1, -1, -1):
        if end_ts is None or tiles[i]["start_ts"] <= end_ts:
            end_tile = i
            break

    has_more_right = cursor_ts is not None
    if end_tile is None:
        return [], False, has_more_right

    parts = []
    collected = 0
    for ti in range(end_tile, -1, -1):
        tp = _tile_path(file_id, tf, ti)
        n = tiles[ti]["count"]
        chunk = _mmap_read_range(tp, 0, n)

        if ti == end_tile and end_ts is not None:
            chunk = [c for c in chunk if c['t'] <= end_ts]

        if not chunk:
            continue

        need = limit - collected
        if need <= 0:
            break

        if len(chunk) > need:
            chunk = chunk[-need:]

        parts.append(chunk)
        collected += len(chunk)

        if collected >= limit:
            break

    candles = []
    for part in reversed(parts):
        candles.extend(part)

    if not candles:
        return [], False, has_more_right

    has_more_left = candles[0]['t'] > tiles[0]['start_ts']
    return candles, has_more_left, has_more_right

def _csv_to_bin(csv_path, bin_path):
    """Convert a CSV file to binary format. Each candle = 48 bytes (6 x float64)."""
    candles = _parse_candles_from_csv(csv_path)
    _write_bin(candles, bin_path)
    return len(candles)

def _write_bin(candles, bin_path):
    """Write candle dicts to a binary file."""
    tmp_path = Path(f"{bin_path}.tmp")
    try:
        with open(tmp_path, 'wb') as f:
            for c in candles:
                f.write(CANDLE_STRUCT.pack(float(c['t']), c['o'], c['h'], c['l'], c['c'], c['v']))
        os.replace(tmp_path, bin_path)
    finally:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except Exception:
                pass

def _read_bin_range(bin_path, start_idx, count):
    """Read `count` candles starting at `start_idx` from a binary file. O(1) seek."""
    candles = []
    with open(bin_path, 'rb') as f:
        f.seek(start_idx * CANDLE_SIZE)
        for _ in range(count):
            data = f.read(CANDLE_SIZE)
            if len(data) < CANDLE_SIZE:
                break
            t, o, h, l, c, v = CANDLE_STRUCT.unpack(data)
            candles.append({'t': int(t), 'o': o, 'h': h, 'l': l, 'c': c, 'v': v})
    return candles


def _normalize_epoch_ms(v) -> int | None:
    """Normalize stored candle timestamps to UTC epoch ms; reject corrupt/out-of-range values."""
    if v is None:
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(x):
        return None
    xi = int(x)
    if xi <= 0:
        return None
    # Reject garbage / double-scaled values (would show as year 50k+ in browsers)
    if xi >= 10**14:
        return None
    if xi >= 10**12:
        ms = xi
    elif xi >= 10**9:
        ms = xi * 1000
    else:
        return None
    # Plausible historical market data window (~1990 .. 2100 UTC)
    if ms < 631_152_000_000 or ms > 4_102_444_800_000:
        return None
    return ms

def _bin_total_candles(bin_path):
    """Get total number of candles in a binary file."""
    return os.path.getsize(bin_path) // CANDLE_SIZE

def _bin_read_raw_bytes(bin_path, start_idx, count):
    """Read raw bytes for `count` candles starting at `start_idx`. For binary transfer."""
    with open(bin_path, 'rb') as f:
        f.seek(start_idx * CANDLE_SIZE)
        return f.read(count * CANDLE_SIZE)

def _bisect_bin_for_timestamp(bin_path, target_ts):
    """Binary search on a .bin file to find the index of the first candle with t >= target_ts."""
    total = _bin_total_candles(bin_path)
    if total == 0:
        return 0
    lo, hi = 0, total
    with open(bin_path, 'rb') as f:
        while lo < hi:
            mid = (lo + hi) // 2
            f.seek(mid * CANDLE_SIZE)
            data = f.read(8)  # first field is timestamp (float64)
            if len(data) < 8:
                hi = mid
                continue
            t = int(struct.unpack('<d', data)[0])
            if t < target_ts:
                lo = mid + 1
            else:
                hi = mid
    return lo

def _bin_has_valid_time_order(bin_path):
    """Sanity-check that binary timestamps are non-decreasing and plausible for large datasets."""
    try:
        total = _bin_total_candles(bin_path)
        if total <= 1:
            return True

        first_t = None
        last_t = None
        prev_t = None
        with open(bin_path, 'rb') as f:
            for _ in range(total):
                data = f.read(CANDLE_SIZE)
                if len(data) < CANDLE_SIZE:
                    return False
                t = int(struct.unpack('<d', data[:8])[0])
                if first_t is None:
                    first_t = t
                if prev_t is not None and t < prev_t:
                    return False
                prev_t = t
                last_t = t

        if first_t is None or last_t is None:
            return False

        # For large sets, reject implausibly tiny spans (often indicates misparsed date/time).
        if total >= 1000 and (last_t - first_t) < (total - 1) * 1000:
            return False
        return True
    except Exception:
        return False

def _normalize_header_name(name):
    return ''.join(ch for ch in str(name or '').lower() if ch.isalnum())

def _parse_timestamp_value(raw_value):
    value = str(raw_value or '').strip()
    if not value:
        return None

    numeric_like = value.replace('.', '', 1).replace('-', '', 1)
    if numeric_like.isdigit():
        int_part = value.lstrip('+-').split('.')[0]

        if len(int_part) == 8 and int_part.isdigit():
            try:
                return int(datetime.strptime(int_part, '%Y%m%d').timestamp() * 1000)
            except Exception:
                pass

        if len(int_part) in (12, 14) and int_part.isdigit():
            for fmt in ('%Y%m%d%H%M', '%Y%m%d%H%M%S'):
                try:
                    return int(datetime.strptime(int_part, fmt).timestamp() * 1000)
                except Exception:
                    continue

        # Time-only numeric strings (HHMM / HHMMSS) are NOT epoch timestamps.
        if len(int_part) in (3, 4, 5, 6):
            return None

        try:
            ts = int(float(value))
            if ts >= 10_000_000_000:  # ms epoch
                return ts
            if ts >= 100_000_000:     # seconds epoch (supports older historical data)
                return ts * 1000
        except Exception:
            pass

    for fmt in [
        '%d.%m.%Y %H:%M:%S.%f', '%d.%m.%Y %H:%M:%S', '%d.%m.%Y %H:%M',
        '%Y-%m-%d %H:%M:%S.%f', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M',
        '%Y/%m/%d %H:%M:%S.%f', '%Y/%m/%d %H:%M:%S', '%Y/%m/%d %H:%M',
        '%m/%d/%Y %H:%M:%S.%f', '%m/%d/%Y %H:%M:%S', '%m/%d/%Y %H:%M',
        '%Y-%m-%d', '%Y/%m/%d', '%d.%m.%Y', '%m/%d/%Y', '%Y%m%d'
    ]:
        try:
            return int(datetime.strptime(value, fmt).timestamp() * 1000)
        except Exception:
            continue

    try:
        iso_value = value.replace('Z', '+00:00') if value.endswith('Z') else value
        return int(datetime.fromisoformat(iso_value).timestamp() * 1000)
    except Exception:
        return None

def _parse_date_and_time_parts(raw_date, raw_time):
    date_part = str(raw_date or '').strip()
    time_part = str(raw_time or '').strip()
    if not date_part:
        return None

    year = month = day = None
    try:
        if '-' in date_part:
            parts = [p for p in date_part.split('-') if p]
            if len(parts) >= 3:
                if len(parts[0]) == 4:
                    year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
                else:
                    day, month, year = int(parts[0]), int(parts[1]), int(parts[2])
        elif '.' in date_part:
            parts = [p for p in date_part.split('.') if p]
            if len(parts) >= 3:
                if len(parts[0]) == 4:
                    year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
                else:
                    day, month, year = int(parts[0]), int(parts[1]), int(parts[2])
        elif '/' in date_part:
            parts = [p for p in date_part.split('/') if p]
            if len(parts) >= 3:
                if len(parts[0]) == 4:
                    year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
                elif len(parts[2]) == 4:
                    a, b, y = int(parts[0]), int(parts[1]), int(parts[2])
                    if a > 12:
                        day, month = a, b
                    elif b > 12:
                        day, month = b, a
                    else:
                        month, day = a, b
                    year = y
        elif date_part.isdigit() and len(date_part) >= 8:
            year = int(date_part[0:4])
            month = int(date_part[4:6])
            day = int(date_part[6:8])
    except Exception:
        return None

    if year is None or month is None or day is None:
        return None

    hour = minute = second = 0
    if time_part:
        try:
            normalized_time = time_part.replace(',', '.')
            if ':' in normalized_time:
                t_parts = normalized_time.split(':')
                hour = int(float(t_parts[0])) if len(t_parts) > 0 and t_parts[0] else 0
                minute = int(float(t_parts[1])) if len(t_parts) > 1 and t_parts[1] else 0
                second = int(float(t_parts[2])) if len(t_parts) > 2 and t_parts[2] else 0
            else:
                digits = ''.join(ch for ch in normalized_time if ch.isdigit())
                if digits:
                    if len(digits) <= 2:
                        hour = int(digits)
                    elif len(digits) <= 4:
                        digits = digits.zfill(4)
                        hour = int(digits[:2])
                        minute = int(digits[2:4])
                    else:
                        digits = digits.zfill(6)
                        hour = int(digits[:2])
                        minute = int(digits[2:4])
                        second = int(digits[4:6])
        except Exception:
            return None

    try:
        return int(datetime(year, month, day, hour, minute, second).timestamp() * 1000)
    except Exception:
        return None

def _sanitize_candle_record(c):
    """Return normalized candle dict or None for invalid input."""
    try:
        t = int(float(c['t']))
        o = float(c['o'])
        h = float(c['h'])
        l = float(c['l'])
        cl = float(c['c'])
        v = float(c.get('v', 0) or 0)
    except Exception:
        return None

    if not (
        math.isfinite(t) and math.isfinite(o) and math.isfinite(h)
        and math.isfinite(l) and math.isfinite(cl) and math.isfinite(v)
    ):
        return None

    # Reject fully zero/negative placeholders which can collapse chart scales.
    if max(o, h, l, cl) <= 0:
        return None

    high = max(h, o, l, cl)
    low = min(l, o, h, cl)

    return {
        't': t,
        'o': o,
        'h': high,
        'l': low,
        'c': cl,
        'v': v if math.isfinite(v) else 0.0
    }

def _is_weekend_timestamp_ms(ts):
    """Return True when timestamp (epoch ms) falls inside the FX weekend close.

    The 24x5 FX market closes Friday 17:00 America/New_York and reopens Sunday
    17:00 America/New_York. Using a naive UTC weekday check (`day >= 5`) drops
    legitimate Sunday-evening NY trading because Sunday in NY is still Sunday
    in UTC for hours after the market opens — which leaves the first 1h candle
    of the trading week with a multi-hour gap to the previous bar and breaks
    `inferBarDurationMs` / multi-panel time sync.

    We therefore convert the timestamp to America/New_York wall-clock and only
    flag bars in the actual closed window (Friday after 17:00 → Sunday before
    17:00). Falls back to UTC weekday if the timezone database is unavailable.
    """
    try:
        ts_s = float(ts) / 1000.0
    except Exception:
        return False
    try:
        from zoneinfo import ZoneInfo
        local = datetime.fromtimestamp(ts_s, tz=ZoneInfo("America/New_York"))
        wd = local.weekday()  # Mon=0 … Sun=6
        if wd == 5:  # Saturday — fully closed
            return True
        if wd == 6 and local.hour < 17:  # Sunday before 17:00 NY open
            return True
        if wd == 4 and local.hour >= 17:  # Friday after 17:00 NY close
            return True
        return False
    except Exception:
        try:
            day = datetime.utcfromtimestamp(ts_s).weekday()
            return day >= 5
        except Exception:
            return False

def _filter_weekend_candles(candles):
    if not EXCLUDE_WEEKEND_CANDLES or not candles:
        return candles
    filtered = [c for c in candles if not _is_weekend_timestamp_ms(c.get('t'))]
    return filtered

def _smooth_isolated_candle_spikes(candles):
    """
    Smooth only obvious isolated one-bar spikes.
    Keeps timestamps/candle count unchanged so paging/cursors remain stable.
    """
    if not SPIKE_FILTER_ENABLED or not candles or len(candles) < 3:
        return candles

    filtered = [dict(c) for c in candles]
    adjusted = 0

    for i in range(1, len(filtered) - 1):
        prev_c = filtered[i - 1]
        curr_c = filtered[i]
        next_c = filtered[i + 1]

        prev_close = float(prev_c['c'])
        curr_close = float(curr_c['c'])
        next_close = float(next_c['c'])

        ref = max(abs(prev_close), abs(curr_close), abs(next_close), 1e-12)
        neighbor_gap = abs(next_close - prev_close) / ref
        dev_prev = abs(curr_close - prev_close) / ref
        dev_next = abs(curr_close - next_close) / ref

        # Full-body isolated spike: bridge between neighboring closes.
        if (
            neighbor_gap <= SPIKE_FILTER_NEIGHBOR_GAP_PCT
            and dev_prev >= SPIKE_FILTER_MIN_DEVIATION_PCT
            and dev_next >= SPIKE_FILTER_MIN_DEVIATION_PCT
        ):
            bridged_open = prev_close
            bridged_close = next_close
            curr_c['o'] = bridged_open
            curr_c['c'] = bridged_close
            curr_c['h'] = max(bridged_open, bridged_close)
            curr_c['l'] = min(bridged_open, bridged_close)
            adjusted += 1
            continue

        # Wick-only anomaly: cap wick when body is already aligned with neighbors.
        if neighbor_gap <= SPIKE_FILTER_NEIGHBOR_GAP_PCT:
            top_neighbor = max(prev_close, next_close)
            bottom_neighbor = min(prev_close, next_close)
            max_high = top_neighbor * (1.0 + SPIKE_FILTER_MIN_DEVIATION_PCT)
            min_low = bottom_neighbor * (1.0 - SPIKE_FILTER_MIN_DEVIATION_PCT)

            body_top = max(float(curr_c['o']), float(curr_c['c']))
            body_bottom = min(float(curr_c['o']), float(curr_c['c']))
            touched = False

            # Cap upside wick only if body itself is not the outlier.
            if float(curr_c['h']) > max_high and body_top <= max_high:
                curr_c['h'] = max(body_top, max_high)
                touched = True

            # Cap downside wick only if body itself is not the outlier.
            if float(curr_c['l']) < min_low and body_bottom >= min_low:
                curr_c['l'] = min(body_bottom, min_low)
                touched = True

            if touched:
                adjusted += 1

    if adjusted == 0:
        return candles

    adjusted_ratio = adjusted / max(1, len(filtered))
    if adjusted_ratio > SPIKE_FILTER_MAX_ADJUST_RATIO:
        # Too many changes implies trending/volatile market, not isolated bad ticks.
        return candles

    print(f"🧹 Spike filter adjusted {adjusted}/{len(filtered)} candles ({adjusted_ratio:.2%})")
    return filtered

def _infer_dataset_provider_from_name(original_name: str | None) -> str:
    n = str(original_name or "").strip().lower()
    if not n:
        return "unknown"
    if "firstrate" in n:
        return "firstrate"
    if "dukascopy" in n or "-m1-bid-" in n:
        return "dukascopy"
    if "binance" in n:
        return "binance"
    return "unknown"


def _resolve_dataset_filter_policy(original_name: str | None):
    """
    Decide weekend/spike filtering behavior per dataset source.
    Preserve raw market/session structure for FirstRate datasets.
    """
    provider = _infer_dataset_provider_from_name(original_name)
    weekend_filter = EXCLUDE_WEEKEND_CANDLES
    spike_filter = SPIKE_FILTER_ENABLED
    if provider == "firstrate":
        # Keep FirstRate session gaps intact, but still smooth isolated bad ticks
        # so one corrupted bar cannot explode y-scale on mixed-pair layouts.
        weekend_filter = False
        spike_filter = SPIKE_FILTER_ENABLED
    return {
        "provider": provider,
        "weekend_filter": bool(weekend_filter),
        "spike_filter": bool(spike_filter),
    }


def _apply_dataset_filters(candles, *, original_name: str | None, apply_spike: bool = True):
    if not candles:
        return candles
    policy = _resolve_dataset_filter_policy(original_name)
    out = candles
    if policy["weekend_filter"]:
        out = _filter_weekend_candles(out)
    if not out:
        return []
    out = _drop_extreme_outlier_candles(out, original_name=original_name)
    if not out:
        return []
    if apply_spike and policy["spike_filter"]:
        out = _smooth_isolated_candle_spikes(out)
    return out


def _drop_extreme_outlier_candles(candles, *, original_name: str | None):
    """
    Guard against malformed vendor ticks that can explode chart y-scale
    (e.g. FX around 1.21 with one accidental candle near 110).
    Only active for FirstRate FX/crypto datasets.
    """
    if not candles or not FIRSTRATE_EXTREME_RATIO_FILTER:
        return candles
    policy = _resolve_dataset_filter_policy(original_name)
    if policy.get("provider") != "firstrate":
        return candles

    ticker = _firstrate_extract_ticker_from_filename(str(original_name or ""))
    cls = _firstrate_classify_ticker(ticker) if ticker else None
    if cls not in {"fx", "crypto"}:
        return candles

    ratio_max = max(1.5, float(FIRSTRATE_EXTREME_RATIO_MAX))
    kept = []
    dropped = 0

    for i, c in enumerate(candles):
        try:
            o = float(c.get("o", 0))
            h = float(c.get("h", 0))
            l = float(c.get("l", 0))
            cl = float(c.get("c", 0))
        except Exception:
            dropped += 1
            continue

        low = min(o, h, l, cl)
        high = max(o, h, l, cl)
        if low <= 0:
            dropped += 1
            continue

        prev_close = None
        next_close = None
        if i > 0:
            try:
                prev_close = float(candles[i - 1].get("c", 0))
            except Exception:
                prev_close = None
        if i + 1 < len(candles):
            try:
                next_close = float(candles[i + 1].get("c", 0))
            except Exception:
                next_close = None

        refs = [r for r in (prev_close, next_close) if r is not None and r > 0]
        ref = (sum(refs) / len(refs)) if refs else cl
        if not (isinstance(ref, (int, float)) and math.isfinite(ref) and ref > 0):
            kept.append(c)
            continue

        # Extreme relative jump OR impossible wick ratio for FX/crypto stream.
        extreme_vs_ref = (high / ref > ratio_max) or (ref / low > ratio_max)
        extreme_wick = (high / low > ratio_max * 1.2)
        if extreme_vs_ref or extreme_wick:
            dropped += 1
            continue

        kept.append(c)

    if dropped > 0:
        print(f"🧯 Dropped {dropped}/{len(candles)} extreme outlier candles for {original_name}")
    return kept


def _canonicalize_candles(candles, *, original_name: str | None = None):
    """Normalize candles into ascending timestamp order and merge duplicate timestamps."""
    if not candles:
        return []

    cleaned = []
    for c in candles:
        normalized = _sanitize_candle_record(c)
        if normalized is not None:
            cleaned.append(normalized)

    if not cleaned:
        return []

    cleaned.sort(key=lambda x: x['t'])
    cleaned = _apply_dataset_filters(cleaned, original_name=original_name, apply_spike=False)
    if not cleaned:
        return []

    merged = []
    for c in cleaned:
        if merged and merged[-1]['t'] == c['t']:
            prev = merged[-1]
            prev['h'] = max(prev['h'], c['h'])
            prev['l'] = min(prev['l'], c['l'])
            prev['c'] = c['c']
            prev['v'] += c['v']
        else:
            merged.append(c)
    policy = _resolve_dataset_filter_policy(original_name)
    if policy["spike_filter"]:
        return _smooth_isolated_candle_spikes(merged)
    return merged

def _parse_candles_from_csv(file_path, original_name: str | None = None):
    """Parse a CSV file into a list of candle dicts {t,o,h,l,c,v}."""
    import csv as csv_mod
    candles = []
    with open(file_path, 'r', encoding='utf-8-sig', errors='replace', newline='') as f:
        reader = csv_mod.DictReader(f)
        headers = reader.fieldnames
        if not headers:
            return candles

        def find_col(names):
            normalized_headers = [(h, _normalize_header_name(h)) for h in headers]
            wanted = [_normalize_header_name(n) for n in names]
            for n in wanted:
                for original, normalized in normalized_headers:
                    if n and n in normalized:
                        return original
            return None

        datetime_col = find_col(['timestamp', 'datetime', 'gmttime'])
        date_col = find_col(['date', 'dt', 'yyyymmdd'])
        time_col = find_col(['time'])
        open_col = find_col(['open'])
        high_col = find_col(['high'])
        low_col = find_col(['low'])
        close_col = find_col(['close'])
        vol_col = find_col(['volume', 'vol'])

        if datetime_col and time_col == datetime_col:
            time_col = None
        if datetime_col and date_col == datetime_col:
            date_col = None

        if not datetime_col and not date_col and time_col:
            datetime_col = time_col
            time_col = None

        if not open_col or not high_col or not low_col or not close_col:
            return []

        for row in reader:
            try:
                t = None
                if date_col and time_col and date_col != time_col:
                    t = _parse_date_and_time_parts(row.get(date_col, ''), row.get(time_col, ''))

                if t is None:
                    ts_source_col = datetime_col or date_col or time_col
                    if ts_source_col:
                        t = _parse_timestamp_value(row.get(ts_source_col, ''))

                if t is None:
                    continue

                candles.append({
                    't': t,
                    'o': float(row.get(open_col, 0) or 0),
                    'h': float(row.get(high_col, 0) or 0),
                    'l': float(row.get(low_col, 0) or 0),
                    'c': float(row.get(close_col, 0) or 0),
                    'v': float(row.get(vol_col, 0)) if vol_col else 0
                })
            except Exception:
                continue
    return _canonicalize_candles(candles, original_name=original_name)

def _parse_tf_ms(tf: str) -> int:
    """Parse any timeframe string (e.g. '3m','2h','45m') to milliseconds."""
    import re
    m = re.match(r'^(\d+)(mo|m|h|d|w)$', str(tf).strip().lower())
    if not m:
        return 60_000
    val, unit = int(m.group(1)), m.group(2)
    return val * {'m': 60_000, 'h': 3_600_000, 'd': 86_400_000, 'w': 604_800_000, 'mo': 2_592_000_000}[unit]

def _resample_candles(candles, tf_ms):
    """Resample a sorted list of candle dicts to a given bucket size in ms."""
    aggregated = []
    current_bucket = None
    current_candle = None
    for c in candles:
        bucket = (c['t'] // tf_ms) * tf_ms
        if bucket != current_bucket:
            if current_candle:
                aggregated.append(current_candle)
            current_bucket = bucket
            # Use the first candle's actual open time rather than the floor-bucket
            # midnight.  For FX daily bars the floor bucket (Sunday 00:00 UTC) maps
            # to Saturday NY and is wrongly stripped by _filter_weekend_candles;
            # using the real open time (Sunday 22:00 UTC = 17:00 NY) avoids that.
            current_candle = {'t': c['t'], 'o': c['o'], 'h': c['h'], 'l': c['l'], 'c': c['c'], 'v': c['v']}
        else:
            current_candle['h'] = max(current_candle['h'], c['h'])
            current_candle['l'] = min(current_candle['l'], c['l'])
            current_candle['c'] = c['c']
            current_candle['v'] += c['v']
    if current_candle:
        aggregated.append(current_candle)
    return aggregated

def _resample_candles_monthly(candles):
    """Resample candles into monthly buckets (variable-length months)."""
    from datetime import datetime, timezone
    import calendar
    aggregated = []
    current_key = None
    current_candle = None
    for c in candles:
        dt = datetime.fromtimestamp(c['t'] / 1000, tz=timezone.utc)
        key = (dt.year, dt.month)
        bucket_ts = int(datetime(dt.year, dt.month, 1, tzinfo=timezone.utc).timestamp() * 1000)
        if key != current_key:
            if current_candle:
                aggregated.append(current_candle)
            current_key = key
            # Use actual open time (not month-start midnight) to survive weekend filter.
            current_candle = {'t': c['t'], 'o': c['o'], 'h': c['h'], 'l': c['l'], 'c': c['c'], 'v': c['v']}
        else:
            current_candle['h'] = max(current_candle['h'], c['h'])
            current_candle['l'] = min(current_candle['l'], c['l'])
            current_candle['c'] = c['c']
            current_candle['v'] += c['v']
    if current_candle:
        aggregated.append(current_candle)
    return aggregated

def _tail_read_csv(file_path, n_lines):
    """
    Fast tail-read: read the header + last N data lines from a CSV file.
    Uses seek from end of file to avoid reading the entire file.
    Returns (header_line, list_of_last_n_lines).
    """
    with open(file_path, 'rb') as f:
        # Read header
        header = f.readline().decode('utf-8', errors='replace').strip()

        # Seek to end and read backwards to find last N lines
        f.seek(0, 2)  # end of file
        file_size = f.tell()

        if file_size < 1000:
            # Tiny file — just read everything
            f.seek(0)
            f.readline()  # skip header
            lines = [l.decode('utf-8', errors='replace').strip() for l in f if l.strip()]
            return header, lines[-n_lines:] if len(lines) > n_lines else lines

        # Read backwards in chunks to find enough lines
        chunk_size = max(256, n_lines * 80)  # estimate ~80 bytes per line
        lines = []
        pos = file_size

        while pos > 0 and len(lines) < n_lines + 1:
            read_size = min(chunk_size, pos)
            pos -= read_size
            f.seek(pos)
            chunk = f.read(read_size).decode('utf-8', errors='replace')
            chunk_lines = chunk.split('\n')

            if lines:
                # Merge partial line from previous chunk
                chunk_lines[-1] += lines[0]
                lines = chunk_lines + lines[1:]
            else:
                lines = chunk_lines

            chunk_size *= 2  # double chunk size if we need more

        # Filter empty lines, skip header if it got included
        lines = [l.strip() for l in lines if l.strip()]
        if lines and lines[0] == header:
            lines = lines[1:]

        return header, lines[-n_lines:] if len(lines) > n_lines else lines

def _parse_tail_lines(header, lines):
    """Parse header + raw CSV lines into candle dicts. Fast path for tail-read."""
    import csv as csv_mod
    from io import StringIO

    # Reconstruct mini-CSV
    text = header + '\n' + '\n'.join(lines)
    reader = csv_mod.DictReader(StringIO(text))
    headers = reader.fieldnames
    if not headers:
        return []

    def find_col(names):
        for n in names:
            for h in headers:
                if n.lower() in h.lower():
                    return h
        return None

    time_col = find_col(['timestamp', 'time', 'date', 'datetime', 'dt'])
    open_col = find_col(['open'])
    high_col = find_col(['high'])
    low_col = find_col(['low'])
    close_col = find_col(['close'])
    vol_col = find_col(['volume', 'vol'])

    candles = []
    for row in reader:
        try:
            time_val = row.get(time_col, '')
            if not time_val:
                continue
            try:
                t = int(float(time_val))
                if t < 10000000000:
                    t = t * 1000
            except ValueError:
                for fmt in ['%d.%m.%Y %H:%M:%S', '%Y-%m-%d %H:%M:%S', '%Y/%m/%d %H:%M:%S',
                           '%d.%m.%Y %H:%M', '%Y-%m-%d %H:%M', '%m/%d/%Y %H:%M:%S']:
                    try:
                        t = int(datetime.strptime(time_val.strip(), fmt).timestamp() * 1000)
                        break
                    except:
                        continue
                else:
                    continue
            candles.append({
                't': t,
                'o': float(row.get(open_col, 0)),
                'h': float(row.get(high_col, 0)),
                'l': float(row.get(low_col, 0)),
                'c': float(row.get(close_col, 0)),
                'v': float(row.get(vol_col, 0)) if vol_col else 0
            })
        except:
            continue
    return candles

def _bisect_file_for_timestamp(file_path, target_ts):
    """
    Binary search on a sorted CSV file to find the byte offset of the
    first line where timestamp >= target_ts.
    Returns (header_str, byte_offset_of_that_line).
    """
    with open(file_path, 'rb') as f:
        header = f.readline()
        header_end = f.tell()
        f.seek(0, 2)
        file_end = f.tell()

        lo = header_end
        hi = file_end
        result = file_end  # default: past end of file

        while lo < hi:
            mid = (lo + hi) // 2
            f.seek(mid)
            f.readline()  # skip partial line at mid
            line_start = f.tell()
            line = f.readline()
            if not line or line_start >= file_end:
                hi = mid
                continue
            try:
                first_field = line.decode('utf-8', errors='replace').split(',')[0].strip()
                t = int(float(first_field))
                if t < 10000000000:
                    t = t * 1000
            except:
                hi = mid
                continue

            if t < target_ts:
                lo = line_start + len(line)
            else:
                result = line_start
                hi = mid

        return header.decode('utf-8', errors='replace').strip(), result

def _read_n_lines_before(file_path, byte_offset, n_lines, header_end_offset):
    """
    Read N lines ending just before byte_offset from a file.
    Uses backward seek from byte_offset.
    """
    with open(file_path, 'rb') as f:
        # Read backwards from byte_offset
        read_end = byte_offset
        chunk_size = max(256, n_lines * 80)
        lines = []
        pos = read_end

        while pos > header_end_offset and len(lines) < n_lines + 1:
            read_size = min(chunk_size, pos - header_end_offset)
            pos -= read_size
            if pos < header_end_offset:
                pos = header_end_offset
                read_size = read_end - pos
            f.seek(pos)
            chunk = f.read(read_size).decode('utf-8', errors='replace')
            chunk_lines = chunk.split('\n')

            if lines:
                chunk_lines[-1] += lines[0]
                lines = chunk_lines + lines[1:]
            else:
                lines = chunk_lines

            chunk_size *= 2

        lines = [l.strip() for l in lines if l.strip()]
        return lines[-n_lines:] if len(lines) > n_lines else lines

def _stream_candles_before_cursor(file_path, cursor_ts, n):
    """
    Fast: binary-search the file for cursor_ts, then read N lines before it.
    O(log N) seek + O(n) read instead of O(N) full scan.
    """
    header, cursor_offset = _bisect_file_for_timestamp(file_path, cursor_ts)

    # Get header end offset
    with open(file_path, 'rb') as f:
        f.readline()
        header_end = f.tell()

    # Read N+buffer lines before cursor_offset, then filter by timestamp
    lines = _read_n_lines_before(file_path, cursor_offset, n + 10, header_end)
    candles = _parse_tail_lines(header, lines)

    # Strict filter: only candles with t < cursor_ts
    candles = [c for c in candles if c['t'] < cursor_ts]
    if len(candles) > n:
        candles = candles[-n:]

    # Estimate if there's more data before
    has_more = cursor_offset > header_end + (n * 80)

    return candles, len(candles) + (1 if has_more else 0)

def _write_candles_csv(candles, out_path):
    """Write candle dicts to a CSV file."""
    with open(out_path, 'w') as f:
        f.write("time,open,high,low,close,volume\n")
        for c in candles:
            f.write(f"{c['t']},{c['o']},{c['h']},{c['l']},{c['c']},{c['v']}\n")

def _resolve_dataset_csv_path(filename: str) -> Path:
    """Resolve dataset CSV path from hot uploads or archive storage."""
    primary = UPLOAD_DIR / filename
    if primary.exists():
        return primary
    archived = CSV_ARCHIVE_DIR / filename
    if archived.exists():
        return archived
    return primary

def _resolve_dataset_csv_for_file(db_file: CSVFile) -> Path:
    return _resolve_dataset_csv_path(db_file.filename)


def _human_bytes(num: int) -> str:
    n = max(0, int(num or 0))
    if n < 1024:
        return f"{n} B"
    v = n / 1024.0
    if v < 1024:
        return f"{v:.1f} KiB"
    v /= 1024.0
    if v < 1024:
        return f"{v:.2f} MiB"
    v /= 1024.0
    return f"{v:.2f} GiB"


def _path_disk_bytes(path: Path) -> int:
    try:
        if path.is_file():
            return int(path.stat().st_size)
        if path.is_dir():
            s = 0
            for p in path.rglob("*"):
                if p.is_file():
                    try:
                        s += int(p.stat().st_size)
                    except OSError:
                        pass
            return s
    except OSError:
        pass
    return 0


def _epoch_ms_to_iso_utc(ms: float | None) -> str | None:
    if ms is None:
        return None
    try:
        v = float(ms) / 1000.0
        return datetime.utcfromtimestamp(v).strftime("%Y-%m-%d %H:%M:%S") + " UTC"
    except Exception:
        return None


def _delete_dataset_source_csv(filename: str):
    for candidate in (UPLOAD_DIR / filename, CSV_ARCHIVE_DIR / filename):
        if candidate.exists():
            try:
                candidate.unlink()
            except Exception:
                pass


def _purge_dataset_rows(db, db_file: CSVFile) -> None:
    """Remove on-disk dataset assets and DB rows for one csv_files record (caller commits)."""
    file_id = int(db_file.id)
    _delete_dataset_source_csv(db_file.filename)

    aggs = db.query(CSVAggregate).filter(CSVAggregate.file_id == file_id).all()
    for agg in aggs:
        for d in (BIN_DIR, AGG_DIR):
            p = d / agg.agg_filename
            if p.exists():
                p.unlink()
        db.delete(agg)

    for tf in DATASET_TIMEFRAMES:
        p = BIN_DIR / f"bin_{file_id}_{tf}.bin"
        if p.exists():
            p.unlink()

    tile_file_dir = TILES_DIR / str(file_id)
    if tile_file_dir.exists():
        for tp in tile_file_dir.rglob("tile_*.bin"):
            _mmap_cache.invalidate(tp)
        shutil.rmtree(tile_file_dir, ignore_errors=True)

    db.query(DatasetSettings).filter(DatasetSettings.file_id == file_id).delete()
    db.query(BinaryBuildJob).filter(BinaryBuildJob.file_id == file_id).delete()
    db.delete(db_file)


def _purge_all_chart_datasets() -> dict:
    """Delete every registered dataset. Destructive — invalidates stored client fileId references."""
    db = SessionLocal()
    deleted_ids: list[int] = []
    try:
        rows = db.query(CSVFile).order_by(CSVFile.id.asc()).all()
        for db_file in rows:
            deleted_ids.append(int(db_file.id))
            _purge_dataset_rows(db, db_file)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    return {"deleted_count": len(deleted_ids), "deleted_ids": deleted_ids}


# ---------------------------------------------------------------------------
# FirstRate duplicate-dataset cleanup tooling
#
# Background: prior to the canonical-ticker fix in
# `_upsert_or_create_dataset_from_csv`, every change of `period`/`timeframe`
# in a FirstRate import would mint a fresh `CSVFile` row instead of merging
# into the existing one (e.g. a `period=full` seed at `EURUSD_full_1min_1min.csv`
# and a later nightly `period=day` import at `EURUSD_1min_1min.csv` end up as
# two rows for the same instrument). The helpers below let the admin scan for
# such groups and consolidate them without ever truly deleting the historical
# big dataset.
#
# Safety contract:
#   * Identification is read-only — `_collect_firstrate_duplicate_groups`
#     never touches disk or DB state.
#   * Consolidation is opt-in per group, requires an explicit confirmation
#     phrase, and quarantines the loser bytes under `_quarantine/<id>/` so a
#     future restore is always possible.
#   * The winner CSV gets a pre-merge backup before any merge, and a hard
#     row-count guard refuses to delete losers if the merge produces a
#     smaller-than-input result.
# ---------------------------------------------------------------------------

QUARANTINE_DIR = UPLOAD_DIR / "_quarantine"


def _collect_firstrate_duplicate_groups() -> list[dict]:
    """
    Scan the `csv_files` registry, bucket FirstRate-imported rows by
    `(canonical_ticker, asset_class)`, and return one entry per group with
    ≥2 members. The on-disk filename containing `_firstrate_` is the gate
    that stops arbitrary user uploads (Dukascopy, manual CSV, …) from being
    pulled into a group with the same ticker.

    Each returned dict carries enough metadata for the admin UI to render a
    decision form: per-row `id`, `original_name`, `filename`, `row_count`,
    `last_bar_iso`, plus the densest row's id flagged as `suggested_winner_id`
    (the UI uses this only as a default — the admin can pick a different one).
    """
    db = SessionLocal()
    try:
        files = db.query(CSVFile).all()
        agg_rows = (
            db.query(CSVAggregate)
            .filter(CSVAggregate.timeframe == "1m")
            .all()
        )
    finally:
        db.close()
    end_ts_by_file: dict[int, float | None] = {}
    for a in agg_rows:
        try:
            end_ts_by_file[int(a.file_id)] = float(a.end_ts) if a.end_ts is not None else None
        except (TypeError, ValueError):
            end_ts_by_file[int(a.file_id)] = None

    grouped: dict[tuple[str, str], list[dict]] = {}
    for f in files:
        disk = (f.filename or "").lower()
        if "_firstrate_" not in disk:
            continue
        ticker = (
            _firstrate_extract_ticker_from_filename(f.original_name or "") or ""
        ).upper()
        if not ticker:
            continue
        asset_class = _firstrate_classify_ticker(ticker) or ""
        if not asset_class:
            continue
        key = (ticker, asset_class)
        ts = end_ts_by_file.get(int(f.id))
        grouped.setdefault(key, []).append({
            "id": int(f.id),
            "original_name": f.original_name,
            "filename": f.filename,
            "row_count": int(f.row_count or 0),
            "description": f.description or "",
            "last_bar_ms": ts,
            "last_bar_iso": _epoch_ms_to_iso_utc(ts) if ts is not None else None,
        })

    out: list[dict] = []
    for (ticker, asset_class), rows in grouped.items():
        if len(rows) < 2:
            continue
        rows.sort(key=lambda r: int(r["row_count"] or 0), reverse=True)
        suggested = rows[0]["id"]
        out.append({
            "ticker": ticker,
            "asset_class": asset_class,
            "group_key": f"{asset_class}:{ticker}",
            "suggested_winner_id": suggested,
            "row_count_total": sum(int(r["row_count"] or 0) for r in rows),
            "rows": rows,
        })
    out.sort(key=lambda g: (g["asset_class"], g["ticker"]))
    return out


def _quarantine_dataset_assets(db, db_file: CSVFile, dest_root: Path) -> dict:
    """
    Move (not copy) every on-disk artifact + DB row for `db_file` into
    `dest_root`, then delete the DB rows. Mirrors `_purge_dataset_rows` but
    with `move` instead of `unlink`, so a future restore endpoint can put the
    bytes back. Returns a small manifest describing what was moved.
    """
    file_id = int(db_file.id)
    dest_root.mkdir(parents=True, exist_ok=True)
    csv_dest = dest_root / "source"
    bin_dest = dest_root / "bin"
    agg_dest = dest_root / "aggregates"
    tile_dest = dest_root / "tiles"
    for d in (csv_dest, bin_dest, agg_dest, tile_dest):
        d.mkdir(parents=True, exist_ok=True)

    moved: dict[str, list[str]] = {"source": [], "bin": [], "aggregates": [], "tiles": []}

    src_csv_candidates = [UPLOAD_DIR / db_file.filename, CSV_ARCHIVE_DIR / db_file.filename]
    for cand in src_csv_candidates:
        if cand.exists():
            try:
                shutil.move(str(cand), str(csv_dest / cand.name))
                moved["source"].append(cand.name)
            except Exception:
                pass

    aggs = db.query(CSVAggregate).filter(CSVAggregate.file_id == file_id).all()
    for agg in aggs:
        for d in (BIN_DIR, AGG_DIR):
            p = d / agg.agg_filename
            if p.exists():
                try:
                    target = (bin_dest if d is BIN_DIR else agg_dest) / agg.agg_filename
                    shutil.move(str(p), str(target))
                    moved["aggregates"].append(agg.agg_filename)
                except Exception:
                    pass
        db.delete(agg)

    for tf in DATASET_TIMEFRAMES:
        p = BIN_DIR / f"bin_{file_id}_{tf}.bin"
        if p.exists():
            try:
                shutil.move(str(p), str(bin_dest / p.name))
                moved["bin"].append(p.name)
            except Exception:
                pass

    tile_file_dir = TILES_DIR / str(file_id)
    if tile_file_dir.exists():
        for tp in tile_file_dir.rglob("tile_*.bin"):
            try:
                _mmap_cache.invalidate(tp)
            except Exception:
                pass
        try:
            shutil.move(str(tile_file_dir), str(tile_dest / str(file_id)))
            moved["tiles"].append(str(file_id))
        except Exception:
            pass

    db.query(DatasetSettings).filter(DatasetSettings.file_id == file_id).delete()
    db.query(BinaryBuildJob).filter(BinaryBuildJob.file_id == file_id).delete()
    db.delete(db_file)

    return {
        "file_id": file_id,
        "original_name": db_file.original_name,
        "filename": db_file.filename,
        "moved": moved,
    }


def _consolidate_duplicate_group(
    *,
    winner_id: int,
    loser_ids: list[int],
    expected_ticker: str,
    expected_class: str,
    consolidation_id: str,
    dry_run: bool,
) -> dict:
    """
    Merge every loser dataset into `winner_id` and (when not `dry_run`)
    quarantine the losers. Returns a per-loser report with pre/post row
    counts and the rows added. Aborts the entire group on any safety
    violation — the caller is expected to surface the abort reason.

    Safety violations that abort the group:
      * winner or any loser missing in DB
      * any row's filename does not contain `_firstrate_`
      * any row's extracted ticker / classified class disagrees with
        `expected_ticker` / `expected_class`
      * a loser's row_count is greater than the winner's (configured to be
        defensive — the caller should already be picking the densest row)
      * the merged CSV ends up shorter than the pre-merge winner
    """
    db = SessionLocal()
    try:
        winner = db.query(CSVFile).filter(CSVFile.id == int(winner_id)).first()
        if winner is None:
            raise ValueError(f"winner CSVFile id={winner_id} not found")
        if "_firstrate_" not in (winner.filename or "").lower():
            raise ValueError(
                f"winner id={winner_id} is not a FirstRate-imported dataset "
                "(consolidation refuses to touch arbitrary uploads)"
            )

        winner_ticker = (
            _firstrate_extract_ticker_from_filename(winner.original_name or "") or ""
        ).upper()
        winner_class = _firstrate_classify_ticker(winner_ticker) or ""
        if winner_ticker != expected_ticker.upper():
            raise ValueError(
                f"winner id={winner_id} has ticker {winner_ticker!r}, "
                f"expected {expected_ticker!r}"
            )
        if winner_class != expected_class.lower():
            raise ValueError(
                f"winner id={winner_id} classified as {winner_class!r}, "
                f"expected {expected_class!r}"
            )

        loser_rows: list[CSVFile] = []
        for lid in loser_ids:
            row = db.query(CSVFile).filter(CSVFile.id == int(lid)).first()
            if row is None:
                raise ValueError(f"loser CSVFile id={lid} not found")
            if int(row.id) == int(winner.id):
                raise ValueError(f"loser id={lid} is the same as winner")
            if "_firstrate_" not in (row.filename or "").lower():
                raise ValueError(
                    f"loser id={lid} is not a FirstRate-imported dataset"
                )
            row_ticker = (
                _firstrate_extract_ticker_from_filename(row.original_name or "") or ""
            ).upper()
            row_class = _firstrate_classify_ticker(row_ticker) or ""
            if row_ticker != expected_ticker.upper():
                raise ValueError(
                    f"loser id={lid} ticker {row_ticker!r} does not match "
                    f"expected {expected_ticker!r}"
                )
            if row_class != expected_class.lower():
                raise ValueError(
                    f"loser id={lid} classified as {row_class!r}, expected "
                    f"{expected_class!r}"
                )
            if int(row.row_count or 0) > int(winner.row_count or 0):
                raise ValueError(
                    f"refusing to consolidate: loser id={lid} has "
                    f"{int(row.row_count or 0)} rows but winner id={winner.id} "
                    f"has only {int(winner.row_count or 0)} — pick the larger row "
                    "as the winner instead"
                )
            loser_rows.append(row)

        winner_csv = _resolve_dataset_csv_for_file(winner)
        if not winner_csv.exists():
            raise ValueError(
                f"winner CSV file is missing on disk: {winner_csv}"
            )

        group_dir = QUARANTINE_DIR / consolidation_id / "groups" / f"{expected_class}_{expected_ticker}"
        backup_dir = group_dir / "winners_pre_merge"
        losers_dir = group_dir / "losers"

        per_loser_report: list[dict] = []

        if dry_run:
            # Simulate the merge into a temp directory so we can report a
            # projected post-merge row count without touching anything live.
            # Each loser is merged into a copy of the winner CSV in sequence,
            # exactly mirroring the real path so the projected counts reflect
            # what the destructive call will produce.
            tmp_root = Path(tempfile.mkdtemp(prefix=f"frconsdr_{consolidation_id}_"))
            try:
                tmp_winner = tmp_root / "winner.csv"
                shutil.copyfile(winner_csv, tmp_winner)
                running_count = int(count_csv_rows(str(tmp_winner)) or 0)
                for row in loser_rows:
                    loser_csv = _resolve_dataset_csv_for_file(row)
                    if not loser_csv.exists():
                        per_loser_report.append({
                            "id": int(row.id),
                            "original_name": row.original_name,
                            "filename": row.filename,
                            "rows_before": int(row.row_count or 0),
                            "skipped": True,
                            "reason": "loser CSV missing on disk",
                        })
                        continue
                    rows_out, new_added = _merge_canonical_ohlcv_csvs(
                        existing=tmp_winner, incoming=loser_csv, dest=tmp_winner
                    )
                    if int(rows_out) < running_count:
                        raise ValueError(
                            f"merge with loser id={row.id} would shrink the "
                            f"winner from {running_count} to {rows_out} rows — "
                            "aborting"
                        )
                    per_loser_report.append({
                        "id": int(row.id),
                        "original_name": row.original_name,
                        "filename": row.filename,
                        "rows_before": int(row.row_count or 0),
                        "new_rows_added": int(new_added),
                        "winner_total_after_this_merge": int(rows_out),
                        "skipped": False,
                    })
                    running_count = int(rows_out)
                return {
                    "winner_id": int(winner.id),
                    "winner_original_name": winner.original_name,
                    "winner_filename": winner.filename,
                    "winner_rows_before": int(winner.row_count or 0),
                    "projected_winner_rows": running_count,
                    "losers": per_loser_report,
                    "dry_run": True,
                }
            finally:
                shutil.rmtree(tmp_root, ignore_errors=True)

        # Real execution path.
        group_dir.mkdir(parents=True, exist_ok=True)
        backup_dir.mkdir(parents=True, exist_ok=True)
        losers_dir.mkdir(parents=True, exist_ok=True)

        winner_backup = backup_dir / winner_csv.name
        shutil.copyfile(winner_csv, winner_backup)
        winner_rows_before = int(winner.row_count or 0)

        try:
            running_count = int(count_csv_rows(str(winner_csv)) or 0)
            for row in loser_rows:
                loser_csv = _resolve_dataset_csv_for_file(row)
                if not loser_csv.exists():
                    per_loser_report.append({
                        "id": int(row.id),
                        "original_name": row.original_name,
                        "filename": row.filename,
                        "rows_before": int(row.row_count or 0),
                        "new_rows_added": 0,
                        "skipped": True,
                        "reason": "loser CSV missing on disk; loser DB row will still be quarantined",
                    })
                    continue
                rows_out, new_added = _merge_canonical_ohlcv_csvs(
                    existing=winner_csv, incoming=loser_csv, dest=winner_csv
                )
                if int(rows_out) < running_count:
                    raise RuntimeError(
                        f"merge with loser id={row.id} shrunk the winner from "
                        f"{running_count} to {rows_out} — restoring backup and "
                        "aborting"
                    )
                per_loser_report.append({
                    "id": int(row.id),
                    "original_name": row.original_name,
                    "filename": row.filename,
                    "rows_before": int(row.row_count or 0),
                    "new_rows_added": int(new_added),
                    "winner_total_after_this_merge": int(rows_out),
                    "skipped": False,
                })
                running_count = int(rows_out)
        except Exception:
            shutil.copyfile(winner_backup, winner_csv)
            raise

        winner.row_count = running_count
        try:
            build_binary_for_file(
                int(winner.id), winner_csv, winner.original_name, run_async=False, trigger="consolidate"
            )
        except Exception:
            pass

        # Move loser assets and delete their DB rows.
        loser_manifests: list[dict] = []
        for row in loser_rows:
            loser_dir = losers_dir / str(int(row.id))
            man = _quarantine_dataset_assets(db, row, loser_dir)
            loser_manifests.append(man)

        db.commit()
        db.refresh(winner)

        return {
            "winner_id": int(winner.id),
            "winner_original_name": winner.original_name,
            "winner_filename": winner.filename,
            "winner_rows_before": winner_rows_before,
            "winner_rows_after": running_count,
            "winner_pre_merge_backup": str(winner_backup),
            "losers": per_loser_report,
            "loser_quarantine": loser_manifests,
            "quarantine_dir": str(group_dir),
            "dry_run": False,
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _dataset_binary_integrity(db, file_id: int) -> tuple[bool, list[str]]:
    """Validate that required TF binaries + tile metadata are all ready for a dataset."""
    issues: list[str] = []
    aggregate_rows = db.query(CSVAggregate).filter(CSVAggregate.file_id == file_id).all()
    aggregate_map = {a.timeframe: a for a in aggregate_rows}

    for tf in DATASET_TIMEFRAMES:
        agg = aggregate_map.get(tf)
        if not agg:
            issues.append(f"missing aggregate row ({tf})")
            continue
        if agg.status != "ready":
            issues.append(f"aggregate not ready ({tf}={agg.status})")
        bin_path = BIN_DIR / f"bin_{file_id}_{tf}.bin"
        if not bin_path.exists():
            issues.append(f"missing binary ({tf})")
        if _load_tile_meta(file_id, tf) is None:
            issues.append(f"missing tile meta ({tf})")

    return len(issues) == 0, issues


def _dataset_overview_entry(
    db,
    db_file: CSVFile,
    ds_settings: DatasetSettings | None,
    latest_job: BinaryBuildJob | None,
) -> dict:
    """Disk sizes, readiness, integrity, and per-timeframe breakdown for admin overview."""
    file_id = int(db_file.id)
    csv_path = _resolve_dataset_csv_for_file(db_file)
    csv_exists = csv_path.exists()
    csv_bytes = _path_disk_bytes(csv_path) if csv_exists else 0

    aggs_list = db.query(CSVAggregate).filter(CSVAggregate.file_id == file_id).all()
    agg_by_tf = {str(a.timeframe): a for a in aggs_list}

    tiles_root = TILES_DIR / str(file_id)
    tiles_bytes = _path_disk_bytes(tiles_root) if tiles_root.exists() else 0

    bin_total = 0
    ready_tf = 0
    timeframes_detail: list[dict] = []
    for tf in DATASET_TIMEFRAMES:
        agg = agg_by_tf.get(tf)
        fname = agg.agg_filename if agg and agg.agg_filename else f"bin_{file_id}_{tf}.bin"
        bp = BIN_DIR / fname
        bsz = int(bp.stat().st_size) if bp.exists() else 0
        bin_total += bsz
        st = str(agg.status or "") if agg else ""
        if not agg and bp.exists():
            st = "ready"
        elif not agg:
            st = "missing"
        if st == "ready":
            ready_tf += 1
        rc = int(agg.row_count or 0) if agg else 0
        timeframes_detail.append(
            {
                "timeframe": tf,
                "status": st,
                "row_count": rc,
                "binary_bytes": bsz,
                "binary_human": _human_bytes(bsz),
                "binary_exists": bp.exists(),
            }
        )

    total_storage = csv_bytes + bin_total + tiles_bytes
    ok, integrity_issues = _dataset_binary_integrity(db, file_id)

    one_m = agg_by_tf.get("1m")
    coverage = None
    if one_m and one_m.start_ts is not None and one_m.end_ts is not None:
        span_ms = float(one_m.end_ts) - float(one_m.start_ts)
        coverage = {
            "start_iso": _epoch_ms_to_iso_utc(float(one_m.start_ts)),
            "end_iso": _epoch_ms_to_iso_utc(float(one_m.end_ts)),
            "span_days": round(span_ms / 86400000.0, 2),
            "candle_count_1m": int(one_m.row_count or 0),
        }

    job_status = str(latest_job.status or "").lower() if latest_job else ""
    chart_complete = ready_tf >= len(DATASET_TIMEFRAMES) and ok
    if job_status in {"queued", "processing"}:
        # Redundant import jobs queue binaries even when 9/9 TFs are ready — don't
        # downgrade healthy datasets to "building" in the admin overview.
        health = "healthy" if chart_complete else "building"
    elif latest_job and job_status == "failed":
        # Binaries/tiles can be 9/9 ready while QuestDB sync alone failed — don't show
        # "Build failed" when the chart path is actually usable (tiles fallback).
        health = "failed" if not chart_complete else "healthy"
    elif not ok:
        health = "integrity_issues"
    elif chart_complete:
        health = "healthy"
    elif ready_tf > 0:
        health = "partial"
    else:
        health = "empty"

    return {
        "id": file_id,
        "filename": db_file.filename,
        "original_name": db_file.original_name,
        "description": db_file.description or "",
        "upload_date": db_file.upload_date.isoformat() if db_file.upload_date else None,
        "settings": _dataset_settings_public_dict(ds_settings, db_file),
        "csv_storage_rows_stored": int(db_file.row_count or 0),
        "csv": {"exists": csv_exists, "bytes": csv_bytes, "human": _human_bytes(csv_bytes)},
        "binaries_total_bytes": bin_total,
        "binaries_total_human": _human_bytes(bin_total),
        "tiles_total_bytes": tiles_bytes,
        "tiles_total_human": _human_bytes(tiles_bytes),
        "total_storage_bytes": total_storage,
        "total_storage_human": _human_bytes(total_storage),
        "ready_timeframes": ready_tf,
        "total_timeframes": len(DATASET_TIMEFRAMES),
        "coverage": coverage,
        "integrity_ok": ok,
        "integrity_issues": integrity_issues,
        "integrity_issue_count": len(integrity_issues),
        "health": health,
        "timeframes": timeframes_detail,
        "build_job": (
            {
                "id": int(latest_job.id),
                "status": job_status,
                "attempt_count": int(latest_job.attempt_count or 0),
                "error": ((latest_job.error or "")[:400] if latest_job.error else None),
            }
            if latest_job
            else None
        ),
    }


def _dataset_file_health_for_session(
    db,
    file_id: int,
    agg_by_tf: dict[str, CSVAggregate],
    latest_job: BinaryBuildJob | None,
) -> tuple[str, int]:
    """
    Same health bucketing as admin dataset overview (`_dataset_overview_entry`).
    Returns (health, ready_timeframe_count).
    """
    ready_tf = 0
    for tf in DATASET_TIMEFRAMES:
        agg = agg_by_tf.get(tf)
        fname = agg.agg_filename if agg and agg.agg_filename else f"bin_{file_id}_{tf}.bin"
        bp = BIN_DIR / fname
        st = str(agg.status or "") if agg else ""
        if not agg and bp.exists():
            st = "ready"
        elif not agg:
            st = "missing"
        if st == "ready":
            ready_tf += 1

    ok, _issues = _dataset_binary_integrity(db, file_id)
    job_status = str(latest_job.status or "").lower() if latest_job else ""
    chart_complete = ready_tf >= len(DATASET_TIMEFRAMES) and ok
    if job_status in {"queued", "processing"}:
        health = "healthy" if chart_complete else "building"
    elif latest_job and job_status == "failed":
        # Binaries/tiles can be 9/9 ready while QuestDB sync alone failed — don't show
        # "Build failed" when the chart path is actually usable (tiles fallback).
        health = "failed" if not chart_complete else "healthy"
    elif not ok:
        health = "integrity_issues"
    elif chart_complete:
        health = "healthy"
    elif ready_tf > 0:
        health = "partial"
    else:
        health = "empty"
    return health, ready_tf


def _dataset_coverage_span(agg_by_tf: dict[str, CSVAggregate]) -> dict[str, object] | None:
    """First/last bar span for session date pickers (prefer 1m aggregate)."""
    order: list[str] = ["1m"] + [tf for tf in DATASET_TIMEFRAMES if tf != "1m"]
    for tf in order:
        agg = agg_by_tf.get(tf)
        if agg and agg.start_ts is not None and agg.end_ts is not None:
            start_ms = float(agg.start_ts)
            end_ms = float(agg.end_ts)
            return {
                "start_ts_ms": start_ms,
                "end_ts_ms": end_ms,
                "start_iso": _epoch_ms_to_iso_utc(start_ms),
                "end_iso": _epoch_ms_to_iso_utc(end_ms),
            }
    return None


def _dataset_chart_ready_state(db, file_id: int) -> tuple[int, bool]:
    """Count ready timeframes and whether binary integrity passes."""
    aggs_list = db.query(CSVAggregate).filter(CSVAggregate.file_id == int(file_id)).all()
    agg_by_tf = {str(a.timeframe): a for a in aggs_list}
    ready_tf = 0
    for tf in DATASET_TIMEFRAMES:
        agg = agg_by_tf.get(tf)
        fname = agg.agg_filename if agg and agg.agg_filename else f"bin_{file_id}_{tf}.bin"
        bp = BIN_DIR / fname
        st = str(agg.status or "") if agg else ""
        if not agg and bp.exists():
            st = "ready"
        elif not agg:
            st = "missing"
        if st == "ready":
            ready_tf += 1
    ok, _issues = _dataset_binary_integrity(db, int(file_id))
    return ready_tf, ok


def _binary_rebuild_needed(
    file_id: int,
    *,
    new_rows_added: int | None = None,
    force: bool = False,
    db=None,
) -> bool:
    """
    True when chart binaries should be built/rebuilt.
    False when all TFs are ready, integrity OK, and merge added no new rows.
    """
    if force:
        return True
    own_db = db is None
    if own_db:
        db = SessionLocal()
    try:
        ready_tf, ok = _dataset_chart_ready_state(db, int(file_id))
        if ready_tf < len(DATASET_TIMEFRAMES) or not ok:
            return True
        if new_rows_added is not None and int(new_rows_added) > 0:
            return True
        db_file = db.query(CSVFile).filter(CSVFile.id == int(file_id)).first()
        if db_file and _csv_ahead_of_chart_binary(int(file_id), db_file):
            return True
        return False
    finally:
        if own_db:
            db.close()


def _complete_redundant_binary_jobs_for_file(file_id: int, db=None) -> int:
    """Drop queued/processing jobs when the dataset is already chart-ready."""
    own_db = db is None
    if own_db:
        db = SessionLocal()
    completed = 0
    try:
        if _binary_rebuild_needed(int(file_id), db=db):
            return 0
        rows = (
            db.query(BinaryBuildJob)
            .filter(
                BinaryBuildJob.file_id == int(file_id),
                BinaryBuildJob.status.in_(["queued", "processing"]),
            )
            .all()
        )
        for row in rows:
            row.status = "done"
            row.finished_at = datetime.utcnow()
            row.error = "skipped: chart already ready (no rebuild needed)"
            completed += 1
        if completed:
            db.commit()
    finally:
        if own_db:
            db.close()
    return completed


def _sweep_redundant_binary_jobs(limit: int = 400) -> int:
    """Admin/diagnostics: clear bogus queue entries for already-healthy datasets."""
    db = SessionLocal()
    swept = 0
    try:
        rows = (
            db.query(BinaryBuildJob)
            .filter(BinaryBuildJob.status.in_(["queued", "processing"]))
            .order_by(BinaryBuildJob.id.asc())
            .limit(max(1, int(limit)))
            .all()
        )
        for row in rows:
            swept += _complete_redundant_binary_jobs_for_file(int(row.file_id), db=db)
    finally:
        db.close()
    return swept


def _archive_source_csv_if_ready(file_id: int, source_path: Path):
    """Move CSV from hot uploads to archive once binaries/tiles are fully ready."""
    source_path = Path(source_path)
    if not source_path.exists():
        return

    try:
        if source_path.resolve().parent != UPLOAD_DIR.resolve():
            return
    except Exception:
        return

    db = SessionLocal()
    try:
        ok, issues = _dataset_binary_integrity(db, file_id)
    finally:
        db.close()

    if not ok:
        sample = ", ".join(issues[:3]) if issues else "integrity check failed"
        print(f"ℹ️ Skipping CSV archive for file {file_id}: {sample}")
        return

    archived_path = CSV_ARCHIVE_DIR / source_path.name
    try:
        if archived_path.exists():
            archived_path.unlink()
        shutil.move(str(source_path), str(archived_path))
        print(f"🗄️ Archived CSV for file {file_id} -> {archived_path}")
    except Exception as exc:
        print(f"⚠️ Failed to archive CSV for file {file_id}: {exc}")

def _enqueue_binary_build_job(
    file_id: int,
    file_path: Path,
    original_filename: str,
    trigger: str = "manual",
    *,
    force: bool = False,
    new_rows_added: int | None = None,
) -> int:
    tr = str(trigger or "")
    is_manual = tr.startswith("manual") or tr.startswith("admin") or tr == "worker:manual"
    if not force and not is_manual:
        if not _binary_rebuild_needed(int(file_id), new_rows_added=new_rows_added):
            _complete_redundant_binary_jobs_for_file(int(file_id))
            return 0

    db = SessionLocal()
    try:
        existing = db.query(BinaryBuildJob).filter(
            BinaryBuildJob.file_id == file_id,
            BinaryBuildJob.status.in_(["queued", "processing"]),
        ).order_by(BinaryBuildJob.id.desc()).first()
        if existing:
            if not force and not is_manual and not _binary_rebuild_needed(
                int(file_id), new_rows_added=new_rows_added, db=db
            ):
                existing.status = "done"
                existing.finished_at = datetime.utcnow()
                existing.error = "skipped: chart already ready (no rebuild needed)"
                db.commit()
                return 0
            return int(existing.id)

        job = BinaryBuildJob(
            file_id=file_id,
            source_path=str(file_path),
            original_name=original_filename,
            trigger=trigger,
            status="queued",
            attempt_count=0,
            error=None,
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        jid = int(job.id)
        chart_redis.signal_binary_job_queued()
        return jid
    finally:
        db.close()

def build_binary_for_file(
    file_id: int,
    file_path,
    original_filename: str,
    run_async: bool = True,
    trigger: str = "manual",
    *,
    force: bool = False,
    new_rows_added: int | None = None,
):
    """
    Background job: parse CSV once, write binary (.bin) files for 1m + all TFs.
    Binary format: 48 bytes per candle (6 x float64: t,o,h,l,c,v).
    This replaces the old CSV aggregation — binary is 100x faster to read.
    """
    if run_async and BINARY_BUILD_MODE == "queue":
        _enqueue_binary_build_job(
            file_id=file_id,
            file_path=Path(file_path),
            original_filename=original_filename,
            trigger=trigger,
            force=force,
            new_rows_added=new_rows_added,
        )
        return True

    import threading

    def _run():
        tr = str(trigger or "")
        is_manual = tr.startswith("manual") or tr.startswith("admin") or tr == "worker:manual"
        if not force and not is_manual and "firstrate" in tr:
            db_skip = SessionLocal()
            try:
                if not _binary_rebuild_needed(int(file_id), new_rows_added=new_rows_added, db=db_skip):
                    print(
                        f"⏭️ Skip binary rebuild for file {file_id} ({original_filename}) — "
                        "chart already ready, no new CSV rows"
                    )
                    return True
            finally:
                db_skip.close()

        all_ok = True
        ALL_TFS = {
            '1m': 60000,
            '5m': 300000, '15m': 900000, '30m': 1800000,
            '1h': 3600000, '4h': 14400000, '1d': 86400000, '1w': 604800000,
            '1mo': 2592000000
        }

        db = SessionLocal()
        try:
            # Create DB records for all TFs (including 1m)
            for tf in ALL_TFS:
                bin_name = f"bin_{file_id}_{tf}.bin"
                existing = db.query(CSVAggregate).filter(
                    CSVAggregate.file_id == file_id,
                    CSVAggregate.timeframe == tf
                ).first()
                if not existing:
                    agg = CSVAggregate(
                        file_id=file_id,
                        timeframe=tf,
                        agg_filename=bin_name,
                        row_count=0,
                        status="pending"
                    )
                    db.add(agg)
                else:
                    existing.agg_filename = bin_name
                    existing.status = "pending"
            db.commit()

            # Parse source CSV once
            print(f"📦 Parsing CSV for file {file_id} ({original_filename})...")
            candles = _parse_candles_from_csv(file_path, original_name=original_filename)
            if not candles:
                all_ok = False
                db.query(CSVAggregate).filter(
                    CSVAggregate.file_id == file_id
                ).update({"status": "failed"})
                db.commit()
                return False

            if questdb_store.sync_on_build():
                try:
                    questdb_store.ensure_schema()
                    qsync = questdb_store.sync_file_candles(file_id, candles)
                    print(f"  ✅ QuestDB: {qsync.get('inserted_1m', 0)} 1m rows synced")
                except Exception as qexc:
                    print(f"  ⚠️ QuestDB sync failed for file {file_id}: {qexc}")
                    # Only fail the whole build when QuestDB is the sole read path.
                    if (
                        questdb_store.questdb_read_primary()
                        and not questdb_store.questdb_tiles_fallback()
                    ):
                        all_ok = False
            elif questdb_store.questdb_enabled():
                print(
                    f"  ⏭️ Skipping QuestDB sync for file {file_id} "
                    "(QUESTDB_READ_PRIMARY=false; set QUESTDB_SYNC_ON_BUILD=true to backfill)"
                )

            skip_tiles = (
                questdb_store.questdb_enabled()
                and questdb_store.questdb_read_primary()
                and not questdb_store.questdb_tiles_fallback()
            )

            if skip_tiles:
                for tf in ALL_TFS:
                    resampled = candles if tf == "1m" else (
                        _resample_candles_monthly(candles) if tf == "1mo"
                        else _resample_candles(candles, ALL_TFS[tf])
                    )
                    start_ts = resampled[0]["t"] if resampled else None
                    end_ts = resampled[-1]["t"] if resampled else None
                    db.query(CSVAggregate).filter(
                        CSVAggregate.file_id == file_id,
                        CSVAggregate.timeframe == tf,
                    ).update({
                        "status": "ready",
                        "row_count": len(resampled),
                        "start_ts": start_ts,
                        "end_ts": end_ts,
                    })
                db.commit()
                print(f"✅ QuestDB-only build complete for file {file_id} (tiles skipped)")
                bar_window_cache.invalidate_file(file_id)
                if all_ok:
                    _archive_source_csv_if_ready(file_id, Path(file_path))
                return all_ok

            # Write binary for each timeframe
            for tf, ms in ALL_TFS.items():
                bin_name = f"bin_{file_id}_{tf}.bin"
                bin_path = BIN_DIR / bin_name
                try:
                    db.query(CSVAggregate).filter(
                        CSVAggregate.file_id == file_id,
                        CSVAggregate.timeframe == tf
                    ).update({"status": "processing"})
                    db.commit()

                    if tf == '1m':
                        resampled = candles
                    elif tf == '1mo':
                        resampled = _resample_candles_monthly(candles)
                    else:
                        resampled = _resample_candles(candles, ms)

                    _write_bin(resampled, bin_path)
                    _write_tiles(file_id, tf, resampled)

                    start_ts = resampled[0]['t'] if resampled else None
                    end_ts = resampled[-1]['t'] if resampled else None

                    db.query(CSVAggregate).filter(
                        CSVAggregate.file_id == file_id,
                        CSVAggregate.timeframe == tf
                    ).update({
                        "status": "ready",
                        "row_count": len(resampled),
                        "start_ts": start_ts,
                        "end_ts": end_ts,
                        "agg_filename": bin_name
                    })
                    db.commit()
                    tile_count = math.ceil(len(resampled) / TILE_SIZE) if resampled else 0
                    print(f"  ✅ {tf}: {len(resampled)} candles → {bin_name} + {tile_count} tiles")
                except Exception as exc:
                    all_ok = False
                    print(f"  ⚠️ {tf} failed: {exc}")
                    db.query(CSVAggregate).filter(
                        CSVAggregate.file_id == file_id,
                        CSVAggregate.timeframe == tf
                    ).update({"status": "failed"})
                    db.commit()

            if all_ok:
                integrity_ok, integrity_issues = _dataset_binary_integrity(db, file_id)
                if not integrity_ok:
                    all_ok = False
                    print(f"❌ Binary integrity check failed for file {file_id}: {integrity_issues}")
                    db.query(CSVAggregate).filter(
                        CSVAggregate.file_id == file_id
                    ).update({"status": "failed"})
                    db.commit()

            print(f"✅ Binary conversion complete for file {file_id} ({original_filename})")
            if all_ok:
                bar_window_cache.invalidate_file(file_id)
                _archive_source_csv_if_ready(file_id, Path(file_path))
            return all_ok
        except Exception as exc:
            print(f"❌ Binary pipeline error for file {file_id}: {exc}")
            return False
        finally:
            db.close()

    if run_async:
        t = threading.Thread(target=_run, daemon=True)
        t.start()
        return True
    return _run()


# Instrument types whose `period=full` archives are sharded by first letter (one ZIP per A–Z bucket).
# Futures are NOT in this set — FirstRate ships futures as continuous-contract bundles selected via
# the `adjustment` parameter (contin_UNadj / contin_adj_ratio / contin_adj_absolute), not by letter.
_INSTRUMENT_TYPES_NEEDING_LETTER_FOR_FULL = {"stock", "etf", "options"}


def _firstrate_plan_ticker_ranges(
    *,
    instrument_type: str,
    period: str,
    explicit_range: str | None,
    pairs_norm: list[str],
) -> list[str | None]:
    """
    Decide which `ticker_range` letters to request from FirstRate for this job.

    FirstRate splits `period=full` bundles alphabetically for stock/etf/futures/options
    (one ZIP per letter). For everything else (fx/crypto/index, or non-full periods),
    a single request with `ticker_range=None` returns the whole dataset.

    Rules:
    - Explicit letter from the UI (A–Z) → always honored, single bundle.
    - Non-letter-split type, or period != "full" → [None] (single bundle).
    - Letter-split type + period == "full":
        * if pairs provided → one letter per unique first-letter of the pairs.
        * else → full A..Z sweep (expensive; only if user intentionally left pairs empty).
    """
    if explicit_range:
        return [explicit_range]
    if period != "full" or instrument_type not in _INSTRUMENT_TYPES_NEEDING_LETTER_FOR_FULL:
        return [None]
    if pairs_norm:
        letters = sorted({p[0].upper() for p in pairs_norm if p and p[0].isalpha()})
        return list(letters) if letters else [None]
    return [chr(c) for c in range(ord("A"), ord("Z") + 1)]


def _run_firstrate_import_job(job_id: str) -> None:
    """Background: optional purge → download FirstRate ZIP(s) → normalize CSVs → register datasets → binary build.

    When `period=full` and the instrument type is split alphabetically (stock/etf/futures/options),
    the job automatically iterates over the letters derived from the selected pairs, so a single
    click downloads *full* history for every requested symbol with no manual letter picking.
    """
    tmp_root: Path | None = None
    try:
        state = _firstrate_read_job(job_id)
        if not state:
            return

        uid = get_firstrate_userid()
        if not uid:
            raise RuntimeError("Set FIrstrate_USERID in the server environment (FirstRate customer userid).")

        instrument_type = (state.get("instrument_type") or "fx").strip().lower()
        if instrument_type not in VALID_INSTRUMENT_TYPES:
            raise ValueError(f"Invalid instrument_type {instrument_type!r}")
        adj_raw = state.get("adjustment")
        adj_in = str(adj_raw).strip() if adj_raw is not None and str(adj_raw).strip() else None
        adjustment: str | None = None
        if instrument_type in {"stock", "etf"}:
            if adj_in is not None:
                if adj_in not in VALID_STOCK_ADJUSTMENTS:
                    raise ValueError(f"adjustment for stock/etf must be one of {sorted(VALID_STOCK_ADJUSTMENTS)}")
                adjustment = adj_in
        elif instrument_type == "futures":
            # FirstRate rejects futures data_file calls without a continuous-contract adjustment.
            # Default to contin_UNadj (raw unadjusted continuous series) when user leaves it blank.
            if adj_in is None:
                adjustment = "contin_UNadj"
            else:
                if adj_in not in VALID_FUTURES_ADJUSTMENTS:
                    raise ValueError(
                        f"adjustment for futures must be one of {sorted(VALID_FUTURES_ADJUSTMENTS)}"
                    )
                adjustment = adj_in
        else:
            if adj_in is not None:
                raise ValueError(
                    f"adjustment is only valid for stock/etf (split/div handling) or futures "
                    f"(continuous-contract stitching) — not for {instrument_type}"
                )

        state["status"] = "running"
        state["phase"] = "init"
        state["message"] = "Starting FirstRate import"
        _firstrate_write_job(job_id, state)

        if state.get("delete_existing_first"):
            purge = _purge_all_chart_datasets()
            state["purge"] = purge
            state["phase"] = "purge"
            state["message"] = f"Removed {purge.get('deleted_count', 0)} dataset(s)"
            _firstrate_write_job(job_id, state)

        tmp_root = Path(tempfile.mkdtemp(prefix="firstrate_", dir=str(UPLOAD_DIR.resolve())))

        period = (state.get("period") or "week").strip().lower()
        timeframe = (state.get("timeframe") or "1min").strip().lower()
        explicit_range = state.get("ticker_range")
        if isinstance(explicit_range, str):
            explicit_range = explicit_range.strip().upper()[:1] or None

        pairs_norm = _normalize_ticker_filter_list(
            state.get("pairs") if isinstance(state.get("pairs"), list) else None
        )
        ranges_to_fetch = _firstrate_plan_ticker_ranges(
            instrument_type=instrument_type,
            period=period,
            explicit_range=explicit_range,
            pairs_norm=pairs_norm,
        )
        state["planned_ticker_ranges"] = [r for r in ranges_to_fetch if r]
        state["pairs_filter"] = pairs_norm
        state["files_total"] = 0
        state["files_done"] = 0
        state["last_files_done"] = 0
        state["last_files_done_at"] = datetime.utcnow().isoformat() + "Z"
        state["files_skipped_by_pair_filter"] = 0
        state["datasets_created"] = []
        state["skipped_files"] = []
        _firstrate_write_job(job_id, state)

        timeout_sec = float(state.get("download_timeout_sec") or 7200)
        ts_prefix = datetime.now().strftime("%Y%m%d_%H%M%S")
        created: list[dict] = []
        skipped: list[dict] = []
        total_skipped_by_filter = 0
        csv_ticker_cache = _build_csvfile_ticker_cache()
        deferred_binary_builds: list[tuple[int, Path, str, int]] = []

        for bundle_idx, current_range in enumerate(ranges_to_fetch, start=1):
            bundle_label = (
                f" [letter {current_range}, bundle {bundle_idx}/{len(ranges_to_fetch)}]"
                if current_range
                else ""
            )
            zip_path = tmp_root / f"firstrate_bundle_{bundle_idx:02d}.zip"

            st = _firstrate_read_job(job_id) or state
            st["phase"] = "download"
            st["current_bundle"] = {"index": bundle_idx, "total": len(ranges_to_fetch), "letter": current_range}
            st["message"] = f"Downloading ZIP from FirstRate{bundle_label} — starting…"
            st["download_bytes_received"] = 0
            st["download_bytes_total"] = None
            st["download_percent"] = None
            _firstrate_write_job(job_id, st)

            _dl_prog = {"last_t": 0.0, "last_n": -1}

            def _firstrate_download_progress(written: int, total: int | None, _label: str = bundle_label) -> None:
                now = time.monotonic()
                done = total is not None and total > 0 and written >= total
                if written > 0 and not done:
                    if (
                        now - _dl_prog["last_t"] < 0.9
                        and written - _dl_prog["last_n"] < 8 * 1024 * 1024
                    ):
                        return
                _dl_prog["last_t"] = now
                _dl_prog["last_n"] = written
                sti = _firstrate_read_job(job_id)
                if not sti:
                    return
                pct: int | None = None
                if total is not None and total > 0:
                    pct = min(100, int((100 * written) / total))
                msg_parts = [
                    f"Downloading ZIP from FirstRate{_label}",
                    f"{written / (1024 * 1024):.1f} MiB received",
                ]
                if total:
                    msg_parts.append(f"/ {total / (1024 * 1024):.1f} MiB total")
                    if pct is not None:
                        msg_parts.append(f"({pct}%)")
                elif written == 0:
                    msg_parts.append("(connected — streaming…)")
                else:
                    msg_parts.append("(total size not reported — bytes only)")
                sti["phase"] = "download"
                sti["download_bytes_received"] = written
                sti["download_bytes_total"] = total
                sti["download_percent"] = pct
                sti["message"] = " — ".join(msg_parts)
                _firstrate_write_job(job_id, sti)

            try:
                download_firstrate_bundle(
                    userid=uid,
                    period=period,
                    timeframe=timeframe,
                    instrument_type=instrument_type,
                    ticker_range=current_range,
                    adjustment=adjustment,
                    dest_zip=zip_path,
                    timeout_sec=timeout_sec,
                    progress_callback=_firstrate_download_progress,
                )
            except Exception as exc:
                # Missing-letter bundles are common when auto-sweeping A..Z: skip quietly.
                msg = str(exc)
                if len(ranges_to_fetch) > 1 and "no datafile" in msg.lower():
                    skipped.append({"bundle_letter": current_range, "error": "vendor: no datafile (skipped)"})
                    continue
                raise

            st = _firstrate_read_job(job_id) or state
            st["phase"] = "extract"
            st["message"] = f"Unpacking ZIP archive{bundle_label}…"
            for _k in ("download_bytes_received", "download_bytes_total", "download_percent"):
                st.pop(_k, None)
            _firstrate_write_job(job_id, st)

            extract_dir = tmp_root / f"extracted_{bundle_idx:02d}"
            extract_zip(zip_path, extract_dir)
            try:
                zip_path.unlink(missing_ok=True)
            except Exception:
                pass

            csv_paths = iter_csv_files(extract_dir)

            # Diagnostic: if the bundle produced no CSVs, capture what files DID land in the
            # extract dir so the admin can see (in the live job status + server logs) whether
            # the archive nested differently than expected. Without this hint, crypto / futures
            # ZIP-of-ZIPs failures look like silent "0 datasets" completions.
            if not csv_paths:
                try:
                    all_files = [p for p in extract_dir.rglob("*") if p.is_file()]
                except Exception:
                    all_files = []
                exts: dict[str, int] = {}
                for p in all_files:
                    key = (p.suffix or "(no-ext)").lower()
                    exts[key] = exts.get(key, 0) + 1
                sample_names = [p.relative_to(extract_dir).as_posix() for p in all_files[:25]]
                diag = {
                    "bundle_letter": current_range,
                    "bundle_index": bundle_idx,
                    "total_files_extracted": len(all_files),
                    "extensions": exts,
                    "sample_paths": sample_names,
                }
                print(
                    f"[firstrate][{job_id}] extract produced 0 CSV/TXT in {extract_dir} — "
                    f"files={len(all_files)} exts={exts} sample={sample_names[:10]}"
                )
                skipped.append({
                    "bundle_letter": current_range,
                    "error": (
                        "archive contained no CSV/TXT files after recursive extract — "
                        f"saw {len(all_files)} file(s), extensions: {exts}"
                    ),
                    "diagnostic": diag,
                })

            if pairs_norm:
                before_n = len(csv_paths)
                csv_paths, skipped_pair_n = _firstrate_filter_csv_paths_by_tickers(csv_paths, pairs_norm)
                total_skipped_by_filter += skipped_pair_n
                filter_msg = (
                    f"Ticker filter kept {len(csv_paths)}/{before_n} CSV(s){bundle_label}"
                )
                if before_n > 0 and not csv_paths:
                    # All files present but the token filter dropped everything — useful to log.
                    try:
                        before_paths = iter_csv_files(extract_dir)
                        sample_stems = [p.stem for p in before_paths[:25]]
                    except Exception:
                        sample_stems = []
                    print(
                        f"[firstrate][{job_id}] ticker filter dropped ALL {before_n} file(s); "
                        f"tokens={pairs_norm} first-stems={sample_stems}"
                    )
                    skipped.append({
                        "bundle_letter": current_range,
                        "error": (
                            f"ticker filter {pairs_norm} matched 0 of {before_n} CSVs — "
                            f"check spelling. Sample filenames in bundle: {sample_stems[:8]}"
                        ),
                    })
            else:
                filter_msg = f"Normalizing {len(csv_paths)} CSV file(s){bundle_label}"

            st = _firstrate_read_job(job_id) or state
            st["phase"] = "normalize"
            st["files_total"] = int(st.get("files_total") or 0) + len(csv_paths)
            st["files_skipped_by_pair_filter"] = total_skipped_by_filter
            st["message"] = filter_msg
            _firstrate_write_job(job_id, st)

            normalize_timeout = float(
                os.getenv("FIrstrate_FILE_NORMALIZE_TIMEOUT_SEC", "900")
            )
            merge_timeout = float(os.getenv("FIrstrate_FILE_MERGE_TIMEOUT_SEC", "2400"))

            for src_idx, src in enumerate(csv_paths):
                if _firstrate_job_aborted(job_id):
                    return
                stem_raw = src.stem
                stem_safe = re.sub(r"[^A-Za-z0-9_\-]+", "_", stem_raw).strip("_")[:96] or "instrument"
                out_name = f"{ts_prefix}_b{bundle_idx:02d}_{src_idx:04d}_firstrate_{stem_safe}_{timeframe}.csv"
                dest_csv = UPLOAD_DIR / out_name

                files_done_so_far = int((st.get("files_done") if isinstance(st, dict) else 0) or 0)
                files_total_so_far = int((st.get("files_total") if isinstance(st, dict) else 0) or 0)
                st = _firstrate_read_job(job_id) or state
                st["message"] = f"Normalizing {src.name} ({files_done_so_far + 1}/{files_total_so_far})"
                st["current_file"] = src.name
                _firstrate_write_job(job_id, st)

                hb_stop = _firstrate_start_file_heartbeat(
                    job_id,
                    message=st["message"],
                    current_file=src.name,
                )
                try:
                    n = _call_with_timeout(
                        normalize_timeout,
                        normalize_firstrate_csv_to_standard,
                        src,
                        dest_csv,
                        instrument_type,
                    )
                except TimeoutError as exc:
                    skipped.append(
                        {"file": src.name, "error": f"normalize timeout: {exc}"[:800]}
                    )
                    try:
                        dest_csv.unlink(missing_ok=True)
                    except Exception:
                        pass
                    st = _firstrate_read_job(job_id) or state
                    st["files_done"] = int(st.get("files_done") or 0) + 1
                    st["skipped_files"] = list(skipped)
                    st["message"] = f"Skipped {src.name} (normalize timeout)"
                    st["current_file"] = None
                    _firstrate_note_import_file_progress(st, job_id)
                    continue
                except Exception as exc:
                    skipped.append({"file": src.name, "error": str(exc)[:800]})
                    st = _firstrate_read_job(job_id) or state
                    st["files_done"] = int(st.get("files_done") or 0) + 1
                    st["skipped_files"] = list(skipped)
                    st["message"] = f"Normalize error on {src.name} — skipped"
                    st["current_file"] = None
                    _firstrate_note_import_file_progress(st, job_id)
                    continue
                finally:
                    hb_stop.set()

                if n < 1:
                    try:
                        dest_csv.unlink(missing_ok=True)
                    except Exception:
                        pass
                    skipped.append({"file": src.name, "error": "no rows parsed"})
                    st = _firstrate_read_job(job_id) or state
                    st["files_done"] = int(st.get("files_done") or 0) + 1
                    st["skipped_files"] = list(skipped)
                    st["message"] = f"Skipped {src.name} (0 rows)"
                    st["current_file"] = None
                    _firstrate_note_import_file_progress(st, job_id)
                    continue

                # Use the canonical ticker (period-independent) for the
                # dataset key so nightly `period=day` bundles merge into the
                # dataset originally seeded from `period=full` (or any other
                # period). Without this, the vendor's stem changes per period
                # — `EURUSD_full_1min` vs `EURUSD_1min` vs `EURUSD_week_1min`
                # — and the strict `original_name` lookup misses, creating a
                # fresh duplicate dataset every time the period changes.
                canonical_ticker = (
                    _firstrate_extract_ticker_from_filename(stem_raw) or stem_safe
                ).upper()
                original_label = f"{canonical_ticker}_{timeframe}.csv"
                upsert = bool(state.get("upsert_existing"))
                st = _firstrate_read_job(job_id) or state
                st["message"] = (
                    f"Registering {canonical_ticker} ({files_done_so_far + 1}/{files_total_so_far})"
                )
                st["current_file"] = src.name
                _firstrate_write_job(job_id, st)
                reg_stop = _firstrate_start_file_heartbeat(
                    job_id,
                    message=st["message"],
                    current_file=src.name,
                )
                try:
                    info = _call_with_timeout(
                        merge_timeout,
                        lambda: _upsert_or_create_dataset_from_csv(
                            dest_csv,
                            original_name=original_label,
                            description=f"FirstRate {instrument_type} ({period}, {timeframe})",
                            upsert=upsert,
                            match_canonical_ticker=canonical_ticker,
                            match_canonical_class=instrument_type,
                            csv_ticker_cache=csv_ticker_cache,
                            defer_binary_build=True,
                            skip_inline_duplicate_consolidation=True,
                        ),
                    )
                except TimeoutError as exc:
                    skipped.append(
                        {"file": src.name, "error": f"merge timeout: {exc}"[:800]}
                    )
                    try:
                        dest_csv.unlink(missing_ok=True)
                    except Exception:
                        pass
                    st = _firstrate_read_job(job_id) or state
                    st["files_done"] = int(st.get("files_done") or 0) + 1
                    st["skipped_files"] = list(skipped)
                    st["message"] = f"Skipped {src.name} (merge timeout — retry week bundle)"
                    st["current_file"] = None
                    _firstrate_note_import_file_progress(st, job_id)
                    continue
                finally:
                    reg_stop.set()
                if isinstance(info, dict) and info.get("binary_file_id"):
                    try:
                        fid = int(info["binary_file_id"])
                        new_rows = int(info.get("new_rows_added") or 0)
                        if _binary_rebuild_needed(fid, new_rows_added=new_rows):
                            deferred_binary_builds.append(
                                (
                                    fid,
                                    Path(str(info["binary_path"])),
                                    str(info.get("binary_original_name") or original_label),
                                    new_rows,
                                )
                            )
                    except (TypeError, ValueError):
                        pass
                entry = info.get("file") if isinstance(info, dict) else None
                if entry:
                    created.append(entry)
                st = _firstrate_read_job(job_id) or state
                st["files_done"] = int(st.get("files_done") or 0) + 1
                st["datasets_created"] = list(created)
                st["skipped_files"] = list(skipped)
                # Record per-ticker merge stats so the nightly-health UI can show
                # how many bars each dataset picked up on this run. Keyed by
                # original_label (e.g. `EURUSD_1min.csv`) so a ticker imported
                # across multiple bundles aggregates correctly.
                merge_map = st.get("merge_summary") or {}
                if isinstance(info, dict):
                    merge_map[original_label] = {
                        "ticker": stem_safe,
                        "merged": bool(info.get("merged")),
                        "upserted": bool(info.get("upserted")),
                        "new_rows_added": int(info.get("new_rows_added") or 0),
                        "total_rows": int(info.get("total_rows") or 0),
                    }
                st["merge_summary"] = merge_map
                st["message"] = (
                    f"Imported {len(created)} dataset(s){bundle_label}"
                )
                _firstrate_note_import_file_progress(st, job_id)

            # Free extracted files between bundles.
            try:
                shutil.rmtree(extract_dir, ignore_errors=True)
            except Exception:
                pass

        if deferred_binary_builds:
            # Queue binaries for trading-chart-worker — do NOT build synchronously on the
            # API process (6M-row FX CSVs can take 30–90+ min each and block everything).
            _bin_seen: dict[int, tuple[int, Path, str, int]] = {}
            for item in deferred_binary_builds:
                fid = int(item[0])
                _bin_seen[fid] = (
                    fid,
                    item[1],
                    str(item[2]),
                    int(item[3]) if len(item) > 3 else 0,
                )
            deferred_binary_builds = list(_bin_seen.values())
            state = _firstrate_read_job(job_id) or state
            state["phase"] = "binary_queue"
            state["current_file"] = None
            state["binary_queued"] = 0
            state["binary_skipped_ready"] = 0
            for fid, bpath, bname, new_rows in deferred_binary_builds:
                if not _binary_rebuild_needed(int(fid), new_rows_added=new_rows):
                    _complete_redundant_binary_jobs_for_file(int(fid))
                    state["binary_skipped_ready"] = int(state.get("binary_skipped_ready") or 0) + 1
                    continue
                build_binary_for_file(
                    int(fid),
                    bpath,
                    bname,
                    run_async=True,
                    trigger="firstrate_import",
                    new_rows_added=new_rows,
                )
                state["binary_queued"] = int(state.get("binary_queued") or 0) + 1
            state["message"] = (
                f"CSV import done — {state['binary_queued']} binary job(s) queued, "
                f"{state.get('binary_skipped_ready', 0)} skipped (already chart-ready)"
            )
            _firstrate_write_job(job_id, state)

        state = _firstrate_read_job(job_id) or state
        state["status"] = "done"
        state["phase"] = "done"
        state["current_bundle"] = None
        state["current_file"] = None
        state["message"] = (
            f"Complete — {len(created)} dataset(s), {len(skipped)} skipped across "
            f"{len(ranges_to_fetch)} bundle(s)"
        )
        _firstrate_write_job(job_id, state)
        st_done = _firstrate_read_job(job_id) or state
        it_done = str(st_done.get("instrument_type") or "").strip().lower()
        if it_done:
            _firstrate_note_import_finished_for_type(
                it_done,
                files_done=int(st_done.get("files_done") or 0),
                trigger=str(st_done.get("trigger") or "manual"),
            )
        _firstrate_schedule_after_job(job_id, success=True, error_message=None)
        try:
            trig = str(state.get("trigger") or "import")
            _firstrate_queue_auto_duplicate_cleanup(trigger=f"after_{trig}")
        except Exception:
            pass

    except Exception as exc:
        err = _firstrate_read_job(job_id) or {}
        err["status"] = "failed"
        err["phase"] = "failed"
        err["message"] = str(exc)[:2000]
        err["error"] = str(exc)[:4000]
        _firstrate_write_job(job_id, err)
        _firstrate_schedule_after_job(job_id, success=False, error_message=str(exc))
    finally:
        if tmp_root is not None:
            try:
                shutil.rmtree(tmp_root, ignore_errors=True)
            except Exception:
                pass


def _queue_firstrate_fx_import_job(
    *,
    period: str,
    timeframe: str,
    instrument_type: str = "fx",
    adjustment: str | None = None,
    delete_existing_first: bool,
    purge_confirmation: str | None,
    ticker_range: str | None,
    download_timeout_sec: float | None,
    upsert_existing: bool,
    trigger: str,
    pairs: list[str] | None = None,
    import_plan: dict | None = None,
) -> dict:
    uid = get_firstrate_userid()
    if not uid:
        raise ValueError("Set FIrstrate_USERID in the server environment (FirstRate customer userid).")

    it = (instrument_type or "fx").strip().lower()
    if it not in VALID_INSTRUMENT_TYPES:
        raise ValueError(f"type must be one of {sorted(VALID_INSTRUMENT_TYPES)}")
    adj_clean: str | None = None
    if adjustment is not None and str(adjustment).strip():
        adj_clean = str(adjustment).strip()
        if it not in {"stock", "etf"}:
            raise ValueError("adjustment is only valid for stock and etf bundles")
        if adj_clean not in VALID_STOCK_ADJUSTMENTS:
            raise ValueError(f"adjustment must be one of {sorted(VALID_STOCK_ADJUSTMENTS)}")

    if delete_existing_first:
        expected = (DATASET_PURGE_CONFIRMATION or "").strip()
        if (purge_confirmation or "").strip() != expected:
            raise ValueError(
                f"When delete_existing_first is true, purge_confirmation must exactly equal {expected!r}"
            )

    _firstrate_cleanup_jobs()
    # Free the single-import lock if a previous job is hung (unblocks manual + auto sync).
    reclaimed = _firstrate_reclaim_stuck_import_jobs()
    if _firstrate_has_active_import_job():
        raise ValueError(
            "A FirstRate import is already running. Wait for it to finish, or click "
            "Unstick in Admin → Datasets → VPS pipeline to force-fail a stuck job."
        )
    job_id = f"fr_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{secrets.token_hex(4)}"
    state = {
        "job_id": job_id,
        "status": "queued",
        "phase": "queued",
        "message": "Queued FirstRate import",
        "instrument_type": it,
        "adjustment": adj_clean,
        "period": period,
        "timeframe": timeframe,
        "delete_existing_first": bool(delete_existing_first),
        "ticker_range": ticker_range,
        "download_timeout_sec": float(download_timeout_sec or 7200),
        "upsert_existing": bool(upsert_existing),
        "trigger": trigger,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
        "files_total": 0,
        "files_done": 0,
        "datasets_created": [],
        "skipped_files": [],
        "pairs": list(pairs) if pairs else [],
        "import_plan": import_plan,
    }
    if import_plan and pairs:
        sk = int(import_plan.get("summary", {}).get("skipped_fresh") or 0)
        dl = len(pairs)
        state["message"] = (
            f"Queued FirstRate import — {dl} ticker{'s' if dl != 1 else ''} to download"
            + (f" ({sk} fresh skipped)" if sk else "")
        )
    _firstrate_write_job(job_id, state)
    try:
        cfg = _load_firstrate_schedule()
        cfg["last_error"] = None
        cfg["last_message"] = f"Import queued ({trigger}) job {job_id}"
        _save_firstrate_schedule(cfg)
    except Exception:
        pass
    threading.Thread(target=lambda: _run_firstrate_import_job(job_id), daemon=True).start()
    return {"success": True, "job_id": job_id}


def _start_firstrate_fx_import_job(
    *,
    period: str,
    timeframe: str,
    instrument_type: str = "fx",
    adjustment: str | None = None,
    delete_existing_first: bool,
    purge_confirmation: str | None,
    ticker_range: str | None,
    download_timeout_sec: float | None,
    upsert_existing: bool = False,
    trigger: str = "manual",
    pairs: list[str] | None = None,
    skip_fresh_existing: bool = True,
    skip_all_existing: bool = False,
) -> dict:
    pair_list = list(pairs) if pairs else []
    import_plan: dict | None = None
    if pair_list and not delete_existing_first:
        import_plan = _firstrate_plan_pair_import(
            instrument_type,
            pair_list,
            skip_fresh=bool(skip_fresh_existing),
            skip_all_existing=bool(skip_all_existing),
        )
        pair_list = list(import_plan.get("to_download") or [])
        if import_plan.get("wrong_class"):
            bad = import_plan["wrong_class"][:5]
            hints = ", ".join(
                f"{x['ticker']}→{x['actual']}" for x in bad
            )
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Some tickers belong to a different instrument type ({hints}). "
                    f"Switch Instrument type to match, or remove them from the list."
                ),
            )
        if not pair_list:
            msg = (
                f"All {import_plan.get('requested_count', 0)} tickers already in registry "
                f"({import_plan['summary'].get('skipped_fresh', 0)} fresh"
                f"{', ' + str(import_plan['summary'].get('skipped_existing', 0)) + ' existing skipped' if skip_all_existing else ''}) "
                "— nothing to download."
            )
            return {
                "success": True,
                "skipped": True,
                "message": msg,
                "import_plan": import_plan,
            }

    try:
        result = _queue_firstrate_fx_import_job(
            period=period,
            timeframe=timeframe,
            instrument_type=instrument_type,
            adjustment=adjustment,
            delete_existing_first=delete_existing_first,
            purge_confirmation=purge_confirmation,
            ticker_range=ticker_range,
            download_timeout_sec=download_timeout_sec,
            upsert_existing=upsert_existing,
            trigger=trigger,
            pairs=pair_list,
            import_plan=import_plan,
        )
        if import_plan and isinstance(result, dict):
            result["import_plan"] = import_plan
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _claim_next_binary_build_job() -> dict | None:
    """Atomically claim the next queued binary build job."""
    db = SessionLocal()
    try:
        while True:
            job = db.query(BinaryBuildJob).filter(
                BinaryBuildJob.status == "queued"
            ).order_by(BinaryBuildJob.created_at.asc(), BinaryBuildJob.id.asc()).first()
            if not job:
                return None

            next_attempt = int(job.attempt_count or 0) + 1
            updated = db.query(BinaryBuildJob).filter(
                BinaryBuildJob.id == job.id,
                BinaryBuildJob.status == "queued",
            ).update(
                {
                    "status": "processing",
                    "started_at": datetime.utcnow(),
                    "error": None,
                    "attempt_count": next_attempt,
                },
                synchronize_session=False,
            )
            if updated:
                db.commit()
                return {
                    "id": int(job.id),
                    "file_id": int(job.file_id),
                    "source_path": job.source_path,
                    "original_name": job.original_name,
                    "trigger": job.trigger,
                }
            db.rollback()
    finally:
        db.close()


def _minutes_since_utc_iso(iso: str | None) -> float | None:
    if not iso:
        return None
    dt = _firstrate_parse_job_utc(iso)
    if not dt:
        return None
    return (datetime.utcnow() - dt).total_seconds() / 60.0


def _binary_aggregate_progress(db, file_id: int) -> dict:
    aggs = db.query(CSVAggregate).filter(CSVAggregate.file_id == int(file_id)).all()
    processing = [a.timeframe for a in aggs if str(a.status) == "processing"]
    return {
        "ready_timeframes": sum(1 for a in aggs if str(a.status) == "ready"),
        "processing_tf": processing[0] if len(processing) == 1 else processing,
        "failed_timeframes": sum(1 for a in aggs if str(a.status) == "failed"),
    }


def _reclaim_stale_binary_build_jobs(stale_minutes: int | None = None) -> int:
    """Re-queue binary jobs stuck in `processing` (e.g. API died mid-build)."""
    stale_min = max(
        20,
        int(
            stale_minutes
            if stale_minutes is not None
            else os.getenv("BINARY_STUCK_PROCESSING_MINUTES", "75")
        ),
    )
    now = datetime.utcnow()
    reclaimed = 0
    db = SessionLocal()
    try:
        rows = (
            db.query(BinaryBuildJob)
            .filter(BinaryBuildJob.status == "processing")
            .all()
        )
        for row in rows:
            started = row.started_at or row.created_at
            if not started:
                continue
            elapsed_min = (now - started).total_seconds() / 60.0
            if elapsed_min < stale_min:
                continue
            row.status = "queued"
            row.started_at = None
            row.error = (f"Re-queued after {int(elapsed_min)}m in processing")[:500]
            reclaimed += 1
        if reclaimed:
            db.commit()
            chart_redis.signal_binary_job_queued()
    finally:
        db.close()
    return reclaimed


def _collect_pipeline_diagnostics() -> dict:
    """Single snapshot for admin: imports, binary queue, disk, building datasets."""
    import shutil

    import_reclaimed = _firstrate_reclaim_stuck_import_jobs()
    binary_reclaimed = _reclaim_stale_binary_build_jobs()
    redundant_swept = _sweep_redundant_binary_jobs()

    firstrate_active: list[dict] = []
    firstrate_recent: list[dict] = []
    for p in sorted(FIrstrate_JOBS_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True)[:12]:
        try:
            with open(p, "r", encoding="utf-8") as f:
                st = json.load(f)
            st["job_file"] = p.name
            if str(st.get("status")) in ("queued", "running"):
                firstrate_active.append(st)
            else:
                firstrate_recent.append(st)
        except Exception:
            continue

    db = SessionLocal()
    binary_processing_sample: list[dict] = []
    building_datasets: list[dict] = []
    queued_n = processing_n = 0
    bin_counts: dict[str, int] = {}
    try:
        for status, cnt in db.query(
            BinaryBuildJob.status, func.count(BinaryBuildJob.id)
        ).group_by(BinaryBuildJob.status):
            bin_counts[str(status)] = int(cnt)

        processing_rows = (
            db.query(BinaryBuildJob)
            .filter(BinaryBuildJob.status == "processing")
            .order_by(BinaryBuildJob.started_at.asc())
            .limit(5)
            .all()
        )
        queued_n = int(bin_counts.get("queued") or 0)
        processing_n = int(bin_counts.get("processing") or 0)

        binary_processing_sample: list[dict] = []
        for r in processing_rows:
            prog = _binary_aggregate_progress(db, int(r.file_id))
            started_iso = r.started_at.isoformat() if r.started_at else None
            elapsed = _minutes_since_utc_iso(started_iso)
            binary_processing_sample.append(
                {
                    "id": int(r.id),
                    "file_id": int(r.file_id),
                    "original_name": r.original_name,
                    "started_at": started_iso,
                    "elapsed_min": round(elapsed, 1) if elapsed is not None else None,
                    "ready_timeframes": prog["ready_timeframes"],
                    "processing_tf": prog.get("processing_tf"),
                }
            )

        building_datasets: list[dict] = []
        files = db.query(CSVFile).order_by(CSVFile.id.desc()).limit(400).all()
        for f in files:
            job = (
                db.query(BinaryBuildJob)
                .filter(BinaryBuildJob.file_id == int(f.id))
                .order_by(BinaryBuildJob.id.desc())
                .first()
            )
            if not job or str(job.status) not in ("queued", "processing"):
                continue
            prog = _binary_aggregate_progress(db, int(f.id))
            started_iso = job.started_at.isoformat() if job.started_at else None
            building_datasets.append(
                {
                    "file_id": int(f.id),
                    "original_name": f.original_name or "",
                    "binary_job_id": int(job.id),
                    "binary_status": str(job.status),
                    "ready_timeframes": prog["ready_timeframes"],
                    "total_timeframes": len(DATASET_TIMEFRAMES),
                    "processing_tf": prog.get("processing_tf"),
                    "binary_error": (job.error or "")[:200] if job.error else None,
                    "started_at": started_iso,
                    "elapsed_min": round(_minutes_since_utc_iso(started_iso) or 0, 1)
                    if started_iso
                    else None,
                }
            )
            if len(building_datasets) >= 15:
                break
    finally:
        db.close()

    warnings: list[str] = []
    import_stuck_min = max(35, int(os.getenv("FIrstrate_STUCK_FILE_MINUTES", "60")))
    binary_stuck_min = max(20, int(os.getenv("BINARY_STUCK_PROCESSING_MINUTES", "75")))
    for j in firstrate_active:
        prog_min = _minutes_since_utc_iso(j.get("last_files_done_at"))
        if prog_min is not None and prog_min >= import_stuck_min * 0.5:
            warnings.append(
                f"Import file progress idle {int(prog_min)} min at "
                f"{j.get('files_done')}/{j.get('files_total')} — "
                f"{j.get('message') or j.get('current_file') or '?'}"
            )
        if prog_min is not None and prog_min >= import_stuck_min:
            warnings.append(
                "Import looks STUCK (no file finished recently). Click «Unstick» or wait for auto-fail."
            )
    for bp in binary_processing_sample:
        em = bp.get("elapsed_min")
        if em is not None and em >= binary_stuck_min * 0.6:
            tf = bp.get("processing_tf") or "?"
            warnings.append(
                f"Binary build on {bp.get('original_name')} running {em} min "
                f"(TF {bp.get('ready_timeframes')}/9, on {tf})"
            )
        if em is not None and em >= binary_stuck_min:
            warnings.append(
                f"Binary job #{bp.get('id')} may be hung — will re-queue on next refresh after "
                f"{binary_stuck_min} min."
            )
    if queued_n + processing_n >= 15:
        warnings.append(
            f"Binary backlog depth {queued_n + processing_n} — only 1 worker thread runs at a time; "
            "large files can take 30–90 min each."
        )

    du = shutil.disk_usage(str(UPLOAD_DIR.resolve()))
    sch = _load_firstrate_schedule()
    worker_expected = APP_ROLE == "worker" or BINARY_BUILD_MODE == "queue"
    worker_threads = max(1, int(os.getenv("BINARY_WORKER_THREADS", "1")))

    for j in firstrate_active:
        j["minutes_since_file_progress"] = _minutes_since_utc_iso(j.get("last_files_done_at"))

    return {
        "checked_at": datetime.utcnow().isoformat() + "Z",
        "app_role": APP_ROLE,
        "binary_build_mode": BINARY_BUILD_MODE,
        "binary_queue": bin_counts,
        "binary_queue_depth": queued_n + processing_n,
        "binary_processing_sample": binary_processing_sample,
        "building_datasets": building_datasets,
        "warnings": warnings,
        "binary_worker_threads": worker_threads,
        "firstrate_active_jobs": firstrate_active[:3],
        "firstrate_recent_jobs": firstrate_recent[:3],
        "reclaimed": {
            "firstrate_import_jobs": import_reclaimed,
            "binary_build_jobs": binary_reclaimed,
            "redundant_binary_jobs_cleared": redundant_swept,
        },
        "disk": {
            "uploads_free_gb": round(du.free / (1024**3), 2),
            "uploads_used_gb": round(du.used / (1024**3), 2),
        },
        "schedule": {
            "enabled": bool(sch.get("enabled")),
            "last_status": sch.get("last_status"),
            "last_error": (sch.get("last_error") or "")[:300] if sch.get("last_error") else None,
            "last_message": (sch.get("last_message") or "")[:300] if sch.get("last_message") else None,
        },
        "hints": [
            "Stale/missing counts on asset cards do NOT update until the import finishes + you click Refresh.",
            "FirstRate CSV import runs on trading-chart; chart binaries run on trading-chart-worker when BINARY_BUILD_MODE=queue.",
            "Registry «Building» = binary queued/processing (30–90+ min per large 1m stock/FX file is normal).",
            "Compare «minutes_since_file_progress» and binary «elapsed_min» between refreshes — if both grow, work is moving.",
            "If nothing moves for 55+ min on Registering/merge, click Unstick (or wait for auto-fail ~60 min)",
        ],
        "worker_expected": worker_expected,
    }


def _mark_binary_build_job_done(job_id: int, ok: bool, error: str | None = None):
    db = SessionLocal()
    try:
        row = db.query(BinaryBuildJob).filter(BinaryBuildJob.id == job_id).first()
        if row:
            row.status = "done" if ok else "failed"
            row.finished_at = datetime.utcnow()
            row.error = None if ok else ((error or "binary build failed")[:2000])
            db.commit()
    finally:
        db.close()


def _process_next_binary_build_job() -> bool:
    """Process one queued binary build job. Returns True if a job was processed."""
    job = _claim_next_binary_build_job()
    if not job:
        return False

    source_path = Path(job["source_path"])
    if not source_path.exists():
        db = SessionLocal()
        try:
            db_file = db.query(CSVFile).filter(CSVFile.id == int(job["file_id"])).first()
            if db_file:
                source_path = _resolve_dataset_csv_for_file(db_file)
        finally:
            db.close()

    if not source_path.exists():
        _mark_binary_build_job_done(int(job["id"]), ok=False, error=f"source file missing: {source_path}")
        return True

    if not _binary_rebuild_needed(int(job["file_id"])):
        _mark_binary_build_job_done(
            int(job["id"]),
            ok=True,
            error=None,
        )
        print(
            f"⏭️ Worker skipped binary job #{job['id']} file {job['file_id']} "
            f"({job['original_name']}) — already chart-ready"
        )
        return True

    binary_max_min = max(30.0, float(os.getenv("BINARY_JOB_MAX_MINUTES", "120")))
    try:
        ok = bool(
            _call_with_timeout(
                binary_max_min * 60.0,
                build_binary_for_file,
                int(job["file_id"]),
                source_path,
                str(job["original_name"]),
                False,
                f"worker:{job['trigger']}",
            )
        )
        _mark_binary_build_job_done(int(job["id"]), ok=ok, error=None if ok else "binary build returned failure")
    except TimeoutError as exc:
        _mark_binary_build_job_done(
            int(job["id"]),
            ok=False,
            error=f"binary build exceeded {int(binary_max_min)} min: {exc}"[:500],
        )
    except Exception as exc:
        _mark_binary_build_job_done(int(job["id"]), ok=False, error=str(exc))

    return True


def _run_chart_background_worker():
    """Binary build queue + backtest what-if job queue."""
    poll_seconds = max(0.2, float(BINARY_QUEUE_POLL_SECONDS))
    print(
        f"👷 Chart background worker started (poll={poll_seconds:.1f}s, "
        f"whatif_async={bw.whatif_async_available()})"
    )
    try:
        br = _reclaim_stale_binary_build_jobs()
        if br:
            print(f"[binary] Re-queued {br} stale binary build job(s) at worker start")
    except Exception as exc:
        print(f"[binary] Stale reclaim at worker start: {exc}")
    while True:
        did_work = _process_next_binary_build_job()
        if not did_work:
            did_work = _process_next_whatif_job()
        if not did_work:
            if chart_redis.get_client() is not None:
                chart_redis.brpop_background_wake(poll_seconds)
            else:
                time.sleep(poll_seconds)


def _run_binary_build_worker():
    _run_chart_background_worker()

# Startup background behavior
if APP_ROLE == "worker" and BINARY_BUILD_MODE == "queue":
    _binary_worker_threads = max(1, min(4, int(os.getenv("BINARY_WORKER_THREADS", "1"))))
    for _wi in range(_binary_worker_threads):
        threading.Thread(
            target=_run_chart_background_worker,
            daemon=True,
            name=f"chart-binary-worker-{_wi}",
        ).start()
elif APP_ROLE == "api":
    _backfill_binaries()
    if bw.whatif_async_available() and os.getenv("BACKTEST_WHATIF_DRAIN_ON_API", "true").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }:

        def _run_whatif_drain_on_api():
            poll_seconds = max(0.2, float(BINARY_QUEUE_POLL_SECONDS))
            print(f"📊 What-if drain on API started (poll={poll_seconds:.1f}s)")
            while True:
                if not _process_next_whatif_job():
                    if chart_redis.get_client() is not None:
                        chart_redis.whatif_brpop_job(poll_seconds)
                    else:
                        time.sleep(poll_seconds)

        threading.Thread(target=_run_whatif_drain_on_api, daemon=True).start()

# API Endpoints

@app.get("/api/status")
async def api_status():
    out: dict = {"message": "Trading Chart API is running", "version": "1.0"}
    rp = chart_redis.ping_ok()
    if rp is True:
        out["redis"] = "ok"
    elif rp is False:
        out["redis"] = "unavailable"
    else:
        out["redis"] = "not_configured"
    qp = questdb_store.ping_ok()
    if qp is True:
        out["questdb"] = "ok"
    elif qp is False:
        out["questdb"] = "unavailable"
    else:
        out["questdb"] = "not_configured"
    out["questdb_read_primary"] = questdb_store.questdb_read_primary()
    return out


def _finnhub_api_key() -> str:
    return (os.getenv("FINNHUB_API_KEY") or "").strip()


def _proxy_finnhub_json(upstream_url: str):
    """GET JSON from Finnhub (server-side token)."""
    req = urllib.request.Request(
        upstream_url,
        headers={"User-Agent": "TalariaChart/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode(errors="replace")[:1200]
        except Exception:
            pass
        if e.code in (401, 403):
            hint = (
                "Your Finnhub API key does not include the Economic Calendar endpoint. "
                "Upgrade your Finnhub plan (finnhub.io/pricing) or use a key with calendar access."
            )
            if body and "don't have access" in body.lower():
                raise HTTPException(status_code=e.code, detail=hint) from e
            raise HTTPException(
                status_code=e.code,
                detail=f"Finnhub HTTP {e.code}: {body or e.reason}. {hint}",
            ) from e
        raise HTTPException(
            status_code=502,
            detail=f"Finnhub HTTP {e.code}: {body or e.reason}",
        ) from e
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"Finnhub unreachable: {e.reason!r}") from e


@app.get("/api/finnhub/calendar/economic")
def api_finnhub_economic_calendar(
    from_: str = Query(..., alias="from", description="Start date YYYY-MM-DD"),
    to: str = Query(..., description="End date YYYY-MM-DD"),
):
    """Economic calendar — browser calls this; Finnhub token stays on the server."""
    key = _finnhub_api_key()
    if not key:
        raise HTTPException(
            status_code=503,
            detail=(
                "FINNHUB_API_KEY is not set. Add it to chart/.env next to api_server.py "
                "(FINNHUB_API_KEY=...) or pass it into the trading-chart container, then restart the API."
            ),
        )
    upstream = (
        "https://finnhub.io/api/v1/calendar/economic"
        f"?from={quote(from_, safe='')}&to={quote(to, safe='')}&token={quote(key, safe='')}"
    )
    return _proxy_finnhub_json(upstream)


@app.get("/api/finnhub/news")
def api_finnhub_news(
    category: str = Query("forex"),
    minId: str | None = Query(None),
):
    """Forex (or other) news — same as Finnhub /news; token server-side only."""
    key = _finnhub_api_key()
    if not key:
        raise HTTPException(
            status_code=503,
            detail=(
                "FINNHUB_API_KEY is not set. Add it to chart/.env next to api_server.py "
                "(FINNHUB_API_KEY=...) or pass it into the trading-chart container, then restart the API."
            ),
        )
    q = f"category={quote(category, safe='')}&token={quote(key, safe='')}"
    if minId is not None and str(minId).strip() != "":
        q += f"&minId={quote(str(minId).strip(), safe='')}"
    upstream = f"https://finnhub.io/api/v1/news?{q}"
    return _proxy_finnhub_json(upstream)


def _marketaux_api_token() -> str:
    return (os.getenv("MARKETAUX_API_TOKEN") or "").strip()


def _proxy_marketaux_json(upstream_url: str):
    """GET JSON from Marketaux (server-side token)."""
    req = urllib.request.Request(
        upstream_url,
        headers={"User-Agent": "TalariaChart/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode(errors="replace")[:1200]
        except Exception:
            pass
        if e.code in (401, 403):
            raise HTTPException(
                status_code=e.code,
                detail=(
                    f"Marketaux HTTP {e.code}: {body or e.reason}. "
                    "Check MARKETAUX_API_TOKEN (free key at marketaux.com)."
                ),
            ) from e
        if e.code == 402:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Marketaux daily API limit reached (free tier ~100 requests/day). "
                    "Cached headlines are returned when available; otherwise try again tomorrow "
                    "or upgrade at marketaux.com."
                ),
            ) from e
        raise HTTPException(
            status_code=502,
            detail=f"Marketaux HTTP {e.code}: {body or e.reason}",
        ) from e
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"Marketaux unreachable: {e.reason!r}") from e


def _forex_symbol_search_query(symbol: str, *, broad: bool = False) -> str:
    """Build Marketaux search query for a forex pair like EURUSD."""
    if broad:
        return 'forex OR "foreign exchange" OR currency OR "central bank" OR ECB OR Fed'
    sym = re.sub(r"[^a-zA-Z]", "", (symbol or "")).upper()
    if len(sym) >= 6 and sym.isalpha():
        base, quote_ccy = sym[:3], sym[3:6]
        slash = f"{base}/{quote_ccy}"
        return f'("{slash}" OR {sym} OR {base}/{quote_ccy} OR {base} OR {quote_ccy})'
    if sym:
        return sym
    return 'forex OR currency OR "foreign exchange"'


def _marketaux_fetch_news(
    token: str,
    *,
    published_after: str,
    published_before: str,
    search: str,
    limit: int,
    page: int,
) -> tuple[list[dict], dict]:
    q_parts = [
        f"api_token={quote(token, safe='')}",
        "language=en",
        f"search={quote(search, safe='')}",
        f"published_after={quote(published_after, safe='')}",
        f"published_before={quote(published_before, safe='')}",
        "sort=published_on",
        "sort_order=desc",
        "group_similar=false",
        f"limit={limit}",
        f"page={page}",
    ]
    upstream = f"https://api.marketaux.com/v1/news/all?{'&'.join(q_parts)}"
    payload = _proxy_marketaux_json(upstream)
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        data = []
    meta = payload.get("meta") if isinstance(payload, dict) else {}
    return data, meta if isinstance(meta, dict) else {}


_NEWS_HIST_MEM: dict[str, tuple[float, dict]] = {}
_NEWS_HIST_MEM_LOCK = threading.Lock()


def _news_hist_cache_ttl_sec() -> int:
    raw = (os.getenv("MARKETAUX_NEWS_CACHE_TTL_SEC") or "86400").strip()
    try:
        return max(300, int(raw))
    except ValueError:
        return 86400


def _news_hist_cache_key(from_: int, to: int, symbol: str, limit: int, page: int) -> str:
    sym = re.sub(r"[^a-zA-Z]", "", (symbol or "")).upper()
    return f"{from_}|{to}|{sym}|{limit}|{page}"


def _news_hist_cache_get(key: str) -> dict | None:
    now = time.time()
    with _NEWS_HIST_MEM_LOCK:
        row = _NEWS_HIST_MEM.get(key)
        if row and row[0] > now:
            return row[1]
    cached = chart_redis.news_hist_get_cache(key)
    if cached:
        with _NEWS_HIST_MEM_LOCK:
            _NEWS_HIST_MEM[key] = (now + _news_hist_cache_ttl_sec(), cached)
        return cached
    return None


def _news_hist_cache_set(key: str, payload: dict) -> None:
    ttl = _news_hist_cache_ttl_sec()
    exp = time.time() + ttl
    with _NEWS_HIST_MEM_LOCK:
        _NEWS_HIST_MEM[key] = (exp, payload)
        if len(_NEWS_HIST_MEM) > 512:
            stale = [k for k, v in _NEWS_HIST_MEM.items() if v[0] <= time.time()]
            for k in stale[:256]:
                _NEWS_HIST_MEM.pop(k, None)
    chart_redis.news_hist_set_cache(key, payload, ttl)


def _marketaux_published_ts(published_at: str) -> int:
    if not published_at:
        return 0
    raw = str(published_at).strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.now().astimezone().tzinfo)
        return int(dt.timestamp())
    except ValueError:
        return 0


def _normalize_marketaux_article(article: dict, symbol: str) -> dict:
    ts = _marketaux_published_ts(article.get("published_at") or "")
    entities = article.get("entities") or []
    related_parts = []
    for ent in entities[:6]:
        if isinstance(ent, dict):
            sym = ent.get("symbol")
            if sym:
                related_parts.append(str(sym))
    related = ",".join(related_parts)
    if not related and symbol:
        sym = re.sub(r"[^a-zA-Z]", "", symbol).upper()
        if len(sym) >= 6:
            related = f"{sym[:3]},{sym[3:6]}"
    summary = (
        article.get("snippet")
        or article.get("description")
        or ""
    )
    return {
        "id": article.get("uuid") or article.get("url") or "",
        "datetime": ts,
        "datetime_iso": (article.get("published_at") or "")[:19].replace("T", " ") + " UTC"
        if ts
        else "",
        "headline": str(article.get("title") or "")[:500],
        "summary": str(summary)[:2000],
        "source": str(article.get("source") or ""),
        "url": str(article.get("url") or ""),
        "related": related,
        "demo": False,
    }


@app.get("/api/news/historical")
def api_news_historical(
    from_: int = Query(..., alias="from", description="Start Unix timestamp (seconds)"),
    to: int = Query(..., description="End Unix timestamp (seconds)"),
    symbol: str | None = Query(None, description="Forex pair e.g. EURUSD"),
    limit: int = Query(50, ge=1, le=100),
    page: int = Query(1, ge=1, le=400),
):
    """Historical financial news by date range — Marketaux token stays on the server."""
    token = _marketaux_api_token()
    if not token:
        raise HTTPException(
            status_code=503,
            detail=(
                "MARKETAUX_API_TOKEN is not set. Add it to chart/.env next to api_server.py "
                "(MARKETAUX_API_TOKEN=...) — free key at https://www.marketaux.com/ "
                "— then restart the chart API."
            ),
        )
    if to <= from_:
        raise HTTPException(status_code=400, detail="`to` must be greater than `from`")
    span_sec = to - from_
    if span_sec > 31 * 86400:
        to = from_ + 31 * 86400

    from datetime import timezone

    start_dt = datetime.fromtimestamp(from_, tz=timezone.utc)
    end_dt = datetime.fromtimestamp(to, tz=timezone.utc)
    published_after = start_dt.strftime("%Y-%m-%dT%H:%M:%S")
    published_before = end_dt.strftime("%Y-%m-%dT%H:%M:%S")
    sym_clean = re.sub(r"[^a-zA-Z]", "", (symbol or "")).upper()

    cache_key = _news_hist_cache_key(from_, to, sym_clean, limit, page)
    cached = _news_hist_cache_get(cache_key)
    if cached:
        out = dict(cached)
        out["cached"] = True
        return out

    search_candidates = [
        _forex_symbol_search_query(sym_clean),
        _forex_symbol_search_query(sym_clean, broad=True) if sym_clean else None,
        _forex_symbol_search_query("", broad=True),
    ]

    data: list[dict] = []
    meta: dict = {}
    seen_uuids: set[str] = set()
    last_err: HTTPException | None = None
    for search in search_candidates:
        if not search or data:
            break
        try:
            chunk, chunk_meta = _marketaux_fetch_news(
                token,
                published_after=published_after,
                published_before=published_before,
                search=search,
                limit=limit,
                page=page,
            )
        except HTTPException as exc:
            last_err = exc
            if exc.status_code == 503 and "daily API limit" in str(exc.detail):
                break
            raise
        if chunk_meta.get("found") and not meta:
            meta = chunk_meta
        for article in chunk:
            if not isinstance(article, dict):
                continue
            uid = str(article.get("uuid") or article.get("url") or "")
            if uid and uid in seen_uuids:
                continue
            if uid:
                seen_uuids.add(uid)
            data.append(article)

    if not data and last_err is not None:
        stale = _news_hist_cache_get(cache_key)
        if stale:
            out = dict(stale)
            out["cached"] = True
            out["message"] = str(last_err.detail)
            return out
        raise last_err

    items = [_normalize_marketaux_article(a, symbol or "") for a in data[:limit]]
    items.sort(key=lambda x: x.get("datetime") or 0, reverse=True)
    if not meta:
        meta = {}
    payload = {
        "success": True,
        "items": items[:limit],
        "source": "marketaux",
        "meta": meta,
        "cached": False,
    }
    if items:
        _news_hist_cache_set(cache_key, payload)
    return payload


@app.get("/api/file/{file_id}/tile-meta/{tf}")
async def get_tile_meta(file_id: int, tf: str):
    """Return tile index (count, timestamps per tile) for a file+timeframe."""
    meta = _load_tile_meta(file_id, tf)
    if meta is None:
        raise HTTPException(status_code=404, detail="Tiles not ready for this timeframe")
    return meta


@app.get("/api/file/{file_id}/tile/{tf}/{tile_idx}")
async def get_tile(file_id: int, tf: str, tile_idx: int, response: Response):
    """
    Return raw binary tile — 48 bytes/candle (little-endian float64: t,o,h,l,c,v).
    Cache-Control: immutable — nginx caches this for every user after the first request.
    """
    meta = _load_tile_meta(file_id, tf)
    if meta is None:
        raise HTTPException(status_code=404, detail="Tiles not ready")
    if tile_idx < 0 or tile_idx >= meta["tile_count"]:
        raise HTTPException(status_code=404, detail="Tile index out of range")

    if TILE_CDN_REDIRECT and TILE_CDN_BASE_URL:
        tile_path = f"api/file/{file_id}/tile/{tf}/{tile_idx}"
        return RedirectResponse(url=f"{TILE_CDN_BASE_URL}/{tile_path}", status_code=307)

    tp = _tile_path(file_id, tf, tile_idx)
    if not tp.exists():
        raise HTTPException(status_code=404, detail="Tile file missing")
    response.headers["Cache-Control"] = "public, max-age=86400, immutable"
    response.headers["X-Candle-Count"] = str(meta["tiles"][tile_idx]["count"])
    return FileResponse(str(tp), media_type="application/octet-stream")


@app.get("/api/file/{file_id}/conversion-status")
async def get_conversion_status(file_id: int):
    """SSE-friendly polling endpoint for upload→binary conversion progress."""
    db = next(get_db())
    try:
        aggs = db.query(CSVAggregate).filter(CSVAggregate.file_id == file_id).all()
        if not aggs:
            latest_job = db.query(BinaryBuildJob).filter(
                BinaryBuildJob.file_id == file_id
            ).order_by(BinaryBuildJob.created_at.desc(), BinaryBuildJob.id.desc()).first()
            if latest_job:
                job_status = str(latest_job.status or "").lower()
                if job_status == "failed":
                    return {
                        "status": "failed",
                        "progress": 100,
                        "ready": 0,
                        "failed": 0,
                        "pending": 0,
                        "total": 0,
                        "job_status": job_status,
                        "job_id": int(latest_job.id),
                        "error": latest_job.error,
                        "timeframes": {},
                    }
                mapped = "processing" if job_status in {"queued", "processing"} else "pending"
                return {
                    "status": mapped,
                    "progress": 0,
                    "ready": 0,
                    "failed": 0,
                    "pending": 0,
                    "total": 0,
                    "job_status": job_status,
                    "job_id": int(latest_job.id),
                    "timeframes": {},
                }
            return {
                "status": "pending",
                "progress": 0,
                "ready": 0,
                "failed": 0,
                "pending": 0,
                "total": 0,
                "timeframes": {},
            }
        total = len(aggs)
        ready = sum(1 for a in aggs if a.status == "ready")
        failed = sum(1 for a in aggs if a.status == "failed")
        pending = max(total - ready - failed, 0)
        completed = ready + failed
        latest_job = db.query(BinaryBuildJob).filter(
            BinaryBuildJob.file_id == file_id
        ).order_by(BinaryBuildJob.created_at.desc(), BinaryBuildJob.id.desc()).first()
        job_status = str(latest_job.status or "").lower() if latest_job else None
        overall = "processing"
        if pending == 0:
            overall = "failed" if failed > 0 else "ready"
        elif job_status == "failed":
            overall = "failed"

        integrity_ok = True
        integrity_issues = []
        if overall == "ready":
            integrity_ok, integrity_issues = _dataset_binary_integrity(db, file_id)
            if not integrity_ok:
                overall = "failed"

        payload = {
            "status": overall,
            "progress": round(completed / total * 100) if total else 0,
            "ready": ready,
            "failed": failed,
            "pending": pending,
            "total": total,
            "timeframes": {a.timeframe: a.status for a in aggs},
            "integrity_ok": integrity_ok,
            "integrity_issues": integrity_issues,
        }
        if latest_job:
            payload["job_status"] = job_status
            payload["job_id"] = int(latest_job.id)
            if overall == "failed" and latest_job.error:
                payload["error"] = latest_job.error
        return payload
    finally:
        db.close()

class SignUpIn(BaseModel):
    name: str
    email: str
    password: str
    affiliate_code: str | None = None

class LoginIn(BaseModel):
    email: str
    password: str
    affiliate_code: str | None = None
    next_path: str | None = None


class GoogleAuthIn(BaseModel):
    """Google Identity Services ID token (JWT credential)."""
    credential: str
    affiliate_code: str | None = None
    next_path: str | None = None


class BootcampRegistrationIn(BaseModel):
    full_name: str
    email: str
    phone: str | None = None
    country: str
    age: int
    telegram: str | None = None
    discord: str
    instagram: str | None = None
    agree_terms: bool
    agree_rules: bool

class TradingSessionCreateIn(BaseModel):
    name: str
    session_type: str
    config: dict

class TradingSessionUpdateIn(BaseModel):
    name: str | None = None
    config: dict | None = None

class TradingSessionStateUpdateIn(BaseModel):
    drawings: list | None = None
    journal: list | None = None
    journal_by_ticker: dict | None = None
    per_instrument_stats: dict | None = None
    pending_orders: list | None = None
    open_positions: list | None = None
    account_runtime: dict | None = None
    order_counters: dict | None = None
    replay: dict | None = None
    chartView: dict | None = None
    chartSettings: dict | None = None
    toolDefaults: dict | None = None
    indicators: list | None = None
    propfirm_challenge: dict | None = None


class JournalTradeUpsertIn(BaseModel):
    """Dashboard manual add/edit — full trade payload stored like chart journal rows."""

    trade: dict

class AdminDatasetSettingsIn(BaseModel):
    display_name: str | None = None
    csv_delimiter: str | None = None
    datetime_format: str | None = None
    csv_timezone: str | None = None
    csv_has_header: bool | None = None
    is_active: bool | None = None
    notes: str | None = None

class AdminDukascopyFetchIn(BaseModel):
    instrument: str
    from_date: str
    to_date: str


class AdminFirstrateFxSyncIn(BaseModel):
    """FirstRate `data_file` API — see https://firstratedata.com/about/api-docs"""
    instrument_type: str = "fx"
    adjustment: str | None = None
    period: str = "week"  # full | month | week | day
    timeframe: str = "1min"  # 1min | 5min | 30min | 1hour | 1day
    delete_existing_first: bool = False
    purge_confirmation: str | None = None
    ticker_range: str | None = None
    download_timeout_sec: float | None = 7200
    upsert_existing: bool = False
    pairs: list[str] | None = None
    skip_fresh_existing: bool = True
    skip_all_existing: bool = False


class AdminFirstrateScheduleIn(BaseModel):
    """Persisted VPS auto-sync settings (`uploads/firstrate_schedule.json`)."""
    enabled: bool | None = None
    # nightly | interval — nightly is the supported default; interval kept for back-compat.
    mode: str | None = None
    # Hour-of-day (UTC) at which nightly sync starts queuing jobs; 0–23.
    nightly_utc_hour: int | None = Field(default=None, ge=0, le=23)
    # When true, nightly mode pulls every asset class present in the registry
    # (ignores `instrument_type` / `pairs`).
    auto_all_types: bool | None = None
    # Asset classes to SKIP during auto_all_types nightly sync (e.g. ["stock", "etf"]).
    excluded_types: list[str] | None = None
    interval_minutes: int | None = Field(default=None, ge=15, le=10080)
    instrument_type: str | None = None
    adjustment: str | None = None
    period: str | None = None
    timeframe: str | None = None
    adaptive_period: bool | None = None
    auto_repair: bool | None = None
    upsert_existing: bool | None = None
    delete_existing_first: bool | None = None
    purge_confirmation: str | None = None
    ticker_range: str | None = None
    download_timeout_sec: float | None = Field(default=None, ge=60.0, le=86400.0)
    pairs: list[str] | None = None


class AdminPurgeDatasetsIn(BaseModel):
    """Wipe all chart datasets (DB + binaries + tiles + source CSVs)."""
    confirmation: str

class AdminBinanceFetchIn(BaseModel):
    tickers: list[str]
    asset_class: str = "spot"
    data_type: str = "klines"
    data_frequency: str = "1m"
    from_date: str
    to_date: str
    is_to_update_existing: bool = False
    tickers_to_exclude: list[str] | None = None


class AdminYahooCmeFetchIn(BaseModel):
    ticker: str
    from_date: str
    to_date: str
    interval: str = "1d"


class _AnonymousUser:
    """Dummy user object used when AUTH_ENABLED is False."""
    id = 0
    name = "Trader"
    email = "anonymous@local"
    role = "admin"
    timezone = "UTC"
    base_currency = "USD"
    is_active = True
    created_at = None
    updated_at = None

_ANON_USER = _AnonymousUser()

def _require_user(request: Request):
    if not AUTH_ENABLED:
        return _ANON_USER
    user = _get_user_from_request(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _require_paid_journal_user(request: Request, module: str = "backtest"):
    """Full subscription or admin-granted access to a specific dashboard module."""
    user = _require_user(request)
    if not AUTH_ENABLED:
        return user
    if _user_has_chart_journal_access(user):
        return user
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == user.id).first()
        if not u:
            raise HTTPException(status_code=403, detail="Forbidden")
        grants = _parse_user_module_grants(u)
        subscription_entitled = (
            db.query(Subscription)
            .filter(
                Subscription.user_id == u.id,
                Subscription.status.in_(["active", "trialing"]),
            )
            .first()
            is not None
        )
        full_modules = user_has_full_dashboard_modules(
            u, subscription_entitled=subscription_entitled, grants_override=grants
        )
        if user_has_dashboard_module(
            u, module, fully_entitled=full_modules, grants_override=grants
        ):
            return user
    finally:
        db.close()
    raise HTTPException(
        status_code=403,
        detail=f"Access to {module} is not enabled for this account",
    )


def _require_admin(request: Request):
    if not AUTH_ENABLED:
        # Stamp the synthetic anon-admin for the audit middleware anyway.
        try:
            request.state.admin_user_id = getattr(_ANON_USER, "id", None)
            request.state.admin_email = getattr(_ANON_USER, "email", None)
        except Exception:
            pass
        return _ANON_USER
    user = _require_user(request)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    # Stash on request.state so `_admin_audit_middleware` can attribute the
    # call without re-doing the cookie lookup / DB query post-response.
    try:
        request.state.admin_user_id = int(user.id)
        request.state.admin_email = user.email
    except Exception:
        pass
    return user


def _client_ip(request: Request) -> str | None:
    """Nginx sits in front so we trust `X-Forwarded-For` (first hop)."""
    xff = request.headers.get("x-forwarded-for") or ""
    if xff:
        return xff.split(",", 1)[0].strip()[:63] or None
    xr = request.headers.get("x-real-ip")
    if xr:
        return xr.strip()[:63] or None
    try:
        return (request.client.host or "")[:63] or None
    except Exception:
        return None


def _audit_truncate(value, max_len: int = 4000) -> str | None:
    """Safely coerce any JSON-ish value into a bounded text column."""
    if value is None:
        return None
    try:
        s = value if isinstance(value, str) else json.dumps(value, default=str, separators=(",", ":"))
    except Exception:
        s = str(value)
    if len(s) > max_len:
        s = s[: max_len - 20] + '…"[truncated]"'
    return s


def _record_admin_action(
    request: Request,
    *,
    action: str,
    status: str = "ok",
    status_code: int | None = None,
    target_type: str | None = None,
    target_id: str | int | None = None,
    params: dict | None = None,
    result: dict | None = None,
    error: str | None = None,
) -> None:
    """
    Structured audit write from high-risk admin handlers. Never raises — a
    failing audit MUST NOT break the actual endpoint (that would be worse
    than no audit at all). Keep params/result small (both truncate to 4 KB)
    and scrubbed of secrets (we never log request bodies here).
    """
    db = None
    try:
        admin_user_id = getattr(request.state, "admin_user_id", None) if request else None
        admin_email = getattr(request.state, "admin_email", None) if request else None
        entry = AdminAuditLog(
            admin_user_id=admin_user_id,
            admin_email=(admin_email or None),
            action=(action or "unknown")[:64],
            method=(request.method if request else None),
            path=(str(request.url.path) if request else None),
            target_type=(target_type or None),
            target_id=(str(target_id) if target_id is not None else None),
            status=(status or "ok")[:16],
            status_code=status_code,
            params_json=_audit_truncate(params),
            result_json=_audit_truncate(result),
            error_message=_audit_truncate(error, max_len=2000),
            ip_address=_client_ip(request) if request else None,
            user_agent=((request.headers.get("user-agent") or "")[:500] if request else None),
        )
        db = SessionLocal()
        db.add(entry)
        db.commit()
    except Exception:
        try:
            if db is not None:
                db.rollback()
        except Exception:
            pass
    finally:
        try:
            if db is not None:
                db.close()
        except Exception:
            pass

def _can_access_trading_session(user: User, session: TradingSession) -> bool:
    return int(session.user_id) == int(user.id)

def _session_symbol_from_config(cfg: dict):
    """Top-level symbol for session lists; personal backtest used to omit cfg['symbol'] (only symbols[])."""
    sym = cfg.get("symbol")
    if sym:
        return sym
    syms = cfg.get("symbols")
    if not isinstance(syms, list) or not syms:
        return None
    if len(syms) == 1:
        row = syms[0] if isinstance(syms[0], dict) else {}
        return row.get("symbolName") or row.get("ticker")
    return f"{len(syms)} symbols"


def _session_public_dict(s: TradingSession):
    cfg = {}
    try:
        cfg = json.loads(s.config_json) if s.config_json else {}
    except Exception:
        cfg = {}

    return {
        "id": s.id,
        "name": s.name,
        "session_type": s.session_type,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        "start_balance": cfg.get("startBalance") or cfg.get("start_balance") or cfg.get("balance"),
        "start_date": cfg.get("startDate") or cfg.get("start_date"),
        "end_date": cfg.get("endDate") or cfg.get("end_date"),
        "symbol": _session_symbol_from_config(cfg),
        "config": cfg,
    }

def _parse_dt_any(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        try:
            return datetime.fromtimestamp(float(v) / 1000.0)
        except Exception:
            return None
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            return None
    return None

def _to_float(v):
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v)
        except Exception:
            return None
    return None

def _trade_pnl(trade: dict) -> float:
    for k in ("netPnL", "pnl", "net_pnl", "profit"):
        f = _to_float(trade.get(k))
        if f is not None and math.isfinite(f):
            return float(f)
    return 0.0

def _trade_r_multiple(trade: dict):
    for k in ("rMultiple", "r_multiple", "r"):
        f = _to_float(trade.get(k))
        if f is not None and math.isfinite(f):
            return float(f)
    return None

def _sanitize_for_json(v):
    if v is None:
        return None
    if isinstance(v, float):
        return v if math.isfinite(v) else None
    if isinstance(v, (int, str, bool)):
        return v
    if isinstance(v, list):
        return [_sanitize_for_json(x) for x in v]
    if isinstance(v, dict):
        return {k: _sanitize_for_json(val) for k, val in v.items()}
    return v

def _trade_sort_ts(trade: dict) -> float:
    """Chronological sort key for equity path (seconds)."""
    dt = _parse_dt_any(
        trade.get("exitTime")
        or trade.get("closeTime")
        or trade.get("exit_time")
        or trade.get("close_time")
        or trade.get("entryTime")
        or trade.get("openTime")
    )
    if not dt:
        return 0.0
    try:
        return float(dt.timestamp())
    except Exception:
        return 0.0


def _compute_session_analytics(session_public: dict, journal: list):
    trades = [t for t in journal if isinstance(t, dict)]
    trades.sort(key=_trade_sort_ts)
    pnls = [float(_trade_pnl(t)) for t in trades]
    wins = sum(1 for p in pnls if p > 0)
    losses = sum(1 for p in pnls if p < 0)
    breakeven = len(pnls) - wins - losses

    net_pnl = float(sum(pnls))
    gross_profit = float(sum(p for p in pnls if p > 0))
    gross_loss = float(sum(p for p in pnls if p < 0))
    profit_factor = None
    if gross_loss != 0:
        profit_factor = gross_profit / abs(gross_loss)

    win_rate = (wins / len(pnls)) if pnls else None
    avg_pnl = (net_pnl / len(pnls)) if pnls else None
    avg_win = (gross_profit / wins) if wins else None
    avg_loss = (gross_loss / losses) if losses else None

    r_mults = [rm for rm in (_trade_r_multiple(t) for t in trades) if rm is not None]
    expectancy_r = (sum(r_mults) / len(r_mults)) if r_mults else None

    start_balance = _to_float(session_public.get("start_balance"))
    equity_curve = []
    drawdown_curve = []
    max_drawdown = None
    max_drawdown_pct = None
    if start_balance is not None:
        eq = float(start_balance)
        peak = eq
        max_dd = 0.0
        max_dd_pct = 0.0
        for i, trade in enumerate(trades):
            eq += float(_trade_pnl(trade))
            peak = max(peak, eq)
            dd = peak - eq
            dd_pct = (dd / peak) if peak > 0 else 0.0
            max_dd = max(max_dd, dd)
            max_dd_pct = max(max_dd_pct, dd_pct)

            dt = _parse_dt_any(
                trade.get("exitTime")
                or trade.get("closeTime")
                or trade.get("exit_time")
                or trade.get("close_time")
            )
            label = dt.isoformat() if dt else str(i + 1)
            equity_curve.append({"x": label, "y": eq})
            drawdown_curve.append({"x": label, "y": -dd_pct * 100.0})

        max_drawdown = max_dd
        max_drawdown_pct = max_dd_pct

    sharpe = None
    sortino = None
    if len(pnls) >= 2:
        mean = sum(pnls) / len(pnls)
        var = sum((p - mean) ** 2 for p in pnls) / (len(pnls) - 1)
        sd = math.sqrt(var) if var >= 0 else 0.0
        if sd > 0:
            sharpe = mean / sd

        downside = [min(0.0, p) for p in pnls]
        dvar = sum((d) ** 2 for d in downside) / (len(downside) - 1)
        dsd = math.sqrt(dvar) if dvar >= 0 else 0.0
        if dsd > 0:
            sortino = mean / dsd

    recovery_factor = None
    if max_drawdown is not None and max_drawdown > 0:
        recovery_factor = net_pnl / max_drawdown

    monthly = {}
    weekday = {
        "Mon": {"w": 0, "n": 0},
        "Tue": {"w": 0, "n": 0},
        "Wed": {"w": 0, "n": 0},
        "Thu": {"w": 0, "n": 0},
        "Fri": {"w": 0, "n": 0},
        "Sat": {"w": 0, "n": 0},
        "Sun": {"w": 0, "n": 0},
    }
    for trade in trades:
        dt = _parse_dt_any(
            trade.get("exitTime")
            or trade.get("closeTime")
            or trade.get("entryTime")
            or trade.get("openTime")
        )
        if not dt:
            continue
        key = f"{dt.year:04d}-{dt.month:02d}"
        monthly[key] = monthly.get(key, 0.0) + float(_trade_pnl(trade))
        wd = dt.strftime("%a")
        if wd in weekday:
            weekday[wd]["n"] += 1
            if float(_trade_pnl(trade)) > 0:
                weekday[wd]["w"] += 1

    monthly_series = [{"x": k, "y": monthly[k]} for k in sorted(monthly.keys())]
    weekday_series = [
        {
            "x": k,
            "y": (weekday[k]["w"] / weekday[k]["n"] * 100.0) if weekday[k]["n"] else 0.0,
            "n": weekday[k]["n"],
        }
        for k in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    ]

    def _infer_pip_size(price) -> float:
        try:
            p = float(price)
        except Exception:
            return 0.01
        if not math.isfinite(p):
            return 0.01

        if abs(p) >= 20:
            return 0.01
        s = f"{p}"
        if "." in s:
            dec = len(s.split(".", 1)[1])
            if dec >= 4:
                return 0.0001
            if dec == 3:
                return 0.01
        return 0.01

    def _finite_num(v):
        f = _to_float(v)
        if f is None:
            return None
        return float(f) if math.isfinite(float(f)) else None

    def _maybe_json_str(v):
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        if isinstance(v, (dict, list)):
            try:
                if not v:
                    return None
            except Exception:
                pass
            try:
                return json.dumps(v, ensure_ascii=False)
            except Exception:
                return str(v)
        return str(v)

    def _trade_row(trade: dict):
        dt = _parse_dt_any(
            trade.get("exitTime")
            or trade.get("closeTime")
            or trade.get("exit_time")
            or trade.get("close_time")
            or trade.get("entryTime")
            or trade.get("openTime")
        )

        entry_price = trade.get("entryPrice") or trade.get("openPrice")
        exit_price = trade.get("exitPrice") or trade.get("closePrice")
        stop_loss = trade.get("stopLoss")
        take_profit = trade.get("takeProfit")
        pnl = float(_trade_pnl(trade))

        rr_planned = None
        try:
            ep = float(entry_price) if entry_price is not None else None
            sl = float(stop_loss) if stop_loss is not None else None
            tp = float(take_profit) if take_profit is not None else None
            if ep is not None and sl is not None and tp is not None and math.isfinite(ep) and math.isfinite(sl) and math.isfinite(tp):
                risk = abs(ep - sl)
                reward = abs(tp - ep)
                if risk > 0:
                    rr_planned = reward / risk
        except Exception:
            rr_planned = None

        price_move_pips = None
        try:
            ep = float(entry_price) if entry_price is not None else None
            xp = float(exit_price) if exit_price is not None else None
            if ep is not None and xp is not None and math.isfinite(ep) and math.isfinite(xp):
                pip_size = _infer_pip_size(ep)
                if pip_size > 0:
                    price_move_pips = abs(xp - ep) / pip_size
        except Exception:
            price_move_pips = None

        trade_id = trade.get("tradeId") or trade.get("id")
        risk_amount = trade.get("riskPerTrade")
        if risk_amount is None:
            risk_amount = trade.get("riskAmount")

        risk_amount_f = _finite_num(risk_amount)
        risk_amount = round(risk_amount_f, 2) if risk_amount_f is not None else risk_amount

        rr_actual = _finite_num(trade.get("rewardToRiskRatio"))
        if rr_actual is None:
            ra = risk_amount_f
            if ra is not None and ra > 0:
                rr_actual = abs(pnl) / ra
        rr_actual = round(rr_actual, 2) if rr_actual is not None else None

        r_multiple = _finite_num(trade.get("rMultiple"))
        r_multiple = round(r_multiple, 2) if r_multiple is not None else None

        rr_planned = round(rr_planned, 2) if rr_planned is not None else None

        entry_time_raw = trade.get("entryTime") or trade.get("openTime") or trade.get("entry_time")
        exit_time_raw = trade.get("exitTime") or trade.get("closeTime") or trade.get("exit_time")
        entry_dt = _parse_dt_any(entry_time_raw)
        exit_dt = _parse_dt_any(exit_time_raw)

        return {
            "trade_id": str(trade_id) if trade_id is not None else None,
            "date": dt.isoformat() if dt else None,
            "symbol": trade.get("symbol") or session_public.get("symbol"),
            "side": trade.get("direction") or trade.get("side") or trade.get("type"),
            "entry": entry_price,
            "exit": exit_price,
            "pnl": pnl,
            "status": "win" if pnl > 0 else "loss" if pnl < 0 else "breakeven",
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "risk_amount": risk_amount,
            "rr_planned": rr_planned,
            "rr_actual": rr_actual,
            "r_multiple": r_multiple,
            "price_move_pips": price_move_pips,
            "quantity": trade.get("quantity"),
            "close_type": trade.get("closeType") or trade.get("close_type"),
            "holding_time_hours": trade.get("holdingTimeHours") or trade.get("holding_time_hours"),
            "entry_time": entry_dt.isoformat() if entry_dt else None,
            "exit_time": exit_dt.isoformat() if exit_dt else None,
            "day_of_week": trade.get("dayOfWeek") or trade.get("day_of_week"),
            "month": trade.get("month"),
            "year": trade.get("year"),
            "hour_of_entry": trade.get("hourOfEntry") or trade.get("hour_of_entry"),
            "hour_of_exit": trade.get("hourOfExit") or trade.get("hour_of_exit"),
            "mfe": trade.get("mfe"),
            "mae": trade.get("mae"),
            "highest_price": trade.get("highestPrice") or trade.get("highest_price"),
            "lowest_price": trade.get("lowestPrice") or trade.get("lowest_price"),
            "pre_trade_notes": _maybe_json_str(trade.get("preTradeNotes") or trade.get("pre_trade_notes")),
            "post_trade_notes": _maybe_json_str(trade.get("postTradeNotes") or trade.get("post_trade_notes")),
            "has_entry_screenshot": True if (trade.get("entryScreenshot") or (isinstance(trade.get("entryScreenshots"), list) and len(trade.get("entryScreenshots")) > 0)) else False,
            "has_exit_screenshot": True if trade.get("exitScreenshot") else False,
        }

    recent = [_trade_row(t) for t in trades[-20:][::-1]]

    return {
        "session": {
            "id": session_public.get("id"),
            "name": session_public.get("name"),
            "session_type": session_public.get("session_type"),
        },
        "kpis": {
            "trades": len(pnls),
            "wins": wins,
            "losses": losses,
            "breakeven": breakeven,
            "net_pnl": net_pnl,
            "gross_profit": gross_profit,
            "gross_loss": gross_loss,
            "profit_factor": profit_factor,
            "win_rate": win_rate,
            "avg_pnl": avg_pnl,
            "avg_win": avg_win,
            "avg_loss": avg_loss,
            "expectancy_r": expectancy_r,
            "sharpe": sharpe,
            "sortino": sortino,
            "max_drawdown": max_drawdown,
            "max_drawdown_pct": max_drawdown_pct,
            "recovery_factor": recovery_factor,
            "start_balance": start_balance,
        },
        "series": {
            "equity": equity_curve,
            "drawdown": drawdown_curve,
            "monthly_pnl": monthly_series,
            "weekday_winrate": weekday_series,
        },
        "recent_trades": recent,
    }

def _parse_json_dict(s: str) -> dict:
    try:
        v = json.loads(s) if s else {}
        return v if isinstance(v, dict) else {}
    except Exception:
        return {}

def _parse_json_list(s: str) -> list:
    try:
        v = json.loads(s) if s else []
        return v if isinstance(v, list) else []
    except Exception:
        return []

def _get_or_create_trading_session_state(db, session_id: int, user_id: int) -> TradingSessionState:
    st = db.query(TradingSessionState).filter(TradingSessionState.session_id == session_id).first()
    if st:
        return st
    st = TradingSessionState(session_id=session_id, user_id=user_id, state_json="{}")
    db.add(st)
    db.commit()
    db.refresh(st)
    return st


def _sync_trading_session_journal_trades(db, session_id: int, user_id: int, journal: list) -> None:
    """Upsert one DB row per chart journal trade; remove rows no longer present in the canonical journal array."""
    if not isinstance(journal, list):
        return
    incoming_ids: set[str] = set()
    for raw in journal:
        if not isinstance(raw, dict):
            continue
        tid = str(raw.get("tradeId") or raw.get("id") or "").strip()
        if not tid:
            continue
        incoming_ids.add(tid)
        payload = json.dumps(raw, separators=(",", ":"))
        row = (
            db.query(TradingSessionJournalTrade)
            .filter(
                TradingSessionJournalTrade.session_id == session_id,
                TradingSessionJournalTrade.client_trade_id == tid,
            )
            .first()
        )
        if row:
            row.payload_json = payload
            row.user_id = user_id
        else:
            db.add(
                TradingSessionJournalTrade(
                    session_id=session_id,
                    user_id=user_id,
                    client_trade_id=tid,
                    payload_json=payload,
                )
            )

    q = db.query(TradingSessionJournalTrade).filter(TradingSessionJournalTrade.session_id == session_id)
    if incoming_ids:
        q = q.filter(~TradingSessionJournalTrade.client_trade_id.in_(incoming_ids))
    for orphan in q.all():
        db.delete(orphan)


def _google_sheets_service():
    spreadsheet_id = os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID", "").strip()
    if not spreadsheet_id:
        raise RuntimeError("Missing GOOGLE_SHEETS_SPREADSHEET_ID")

    sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    sa_json_b64 = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64", "").strip()
    sa_file = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "").strip()

    info = None
    if sa_json:
        info = json.loads(sa_json)
    elif sa_json_b64:
        info = json.loads(base64.b64decode(sa_json_b64.encode("utf-8")).decode("utf-8"))
    elif sa_file:
        with open(sa_file, "r", encoding="utf-8") as f:
            info = json.load(f)
    else:
        raise RuntimeError(
            "Missing Google service account credentials. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 or GOOGLE_SERVICE_ACCOUNT_FILE"
        )

    scopes = ["https://www.googleapis.com/auth/spreadsheets"]
    creds = Credentials.from_service_account_info(info, scopes=scopes)
    service = build("sheets", "v4", credentials=creds, cache_discovery=False)
    return service

def _ensure_worksheet_exists(service, spreadsheet_id: str, worksheet: str) -> None:
    meta = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sheets = meta.get("sheets") or []
    for s in sheets:
        props = (s or {}).get("properties") or {}
        if props.get("title") == worksheet:
            return

    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"requests": [{"addSheet": {"properties": {"title": worksheet}}}]},
    ).execute()

def _ensure_sheet_header(service, spreadsheet_id: str, worksheet: str) -> None:
    header = [
        "created_at",
        "full_name",
        "email",
        "phone",
        "country",
        "age",
        "telegram",
        "discord",
        "instagram",
        "agree_rules",
        "agree_terms",
    ]

    _ensure_worksheet_exists(service, spreadsheet_id, worksheet)
    existing = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=f"{worksheet}!A1:K1")
        .execute()
    )
    values = existing.get("values") or []
    if not values or not values[0]:
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"{worksheet}!A1:K1",
            valueInputOption="RAW",
            body={"values": [header]},
        ).execute()

def _append_bootcamp_registration_to_google_sheet(payload: BootcampRegistrationIn) -> None:
    spreadsheet_id = os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID", "").strip()
    worksheet = os.getenv("GOOGLE_SHEETS_WORKSHEET", "Registrations").strip() or "Registrations"

    service = _google_sheets_service()
    _ensure_sheet_header(service, spreadsheet_id, worksheet)

    row = [
        datetime.utcnow().isoformat(),
        payload.full_name.strip(),
        payload.email.strip().lower(),
        (payload.phone or "").strip(),
        payload.country.strip(),
        int(payload.age),
        (payload.telegram or "").strip(),
        payload.discord.strip(),
        (payload.instagram or "").strip(),
        bool(payload.agree_rules),
        bool(payload.agree_terms),
    ]

    service.spreadsheets().values().append(
        spreadsheetId=spreadsheet_id,
        range=f"{worksheet}!A:K",
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": [row]},
    ).execute()

def _parse_user_module_grants(user: User):
    raw = getattr(user, "dashboard_module_grants", None)
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None
    return None


def _set_user_module_grants(user: User, grants) -> None:
    normalized = normalize_module_grants(grants)
    user.dashboard_module_grants = (
        json.dumps(normalized, separators=(",", ":")) if normalized else None
    )


def _is_pricing_renewal_path(path: str | None) -> bool:
    """Allow sign-in without active entitlement only when returning to pricing to renew."""
    if not path or not path.startswith("/") or path.startswith("//"):
        return False
    pathname = path.split("?")[0].split("#")[0].rstrip("/") or "/"
    return pathname == "/pricing" or pathname.startswith("/pricing/")


def _login_access_denied_message(user: User, ctx: dict) -> str:
    reason = ctx.get("access_denial_reason") or "subscription"
    lapsed = ctx.get("lapsed_subscription") or {}
    plan = (lapsed.get("plan_name") or "").strip()
    expired_at = ctx.get("access_expired_at")
    if not expired_at and getattr(user, "access_expires_at", None):
        exp = user.access_expires_at
        expired_at = exp.isoformat() if exp else None
    period_end = lapsed.get("current_period_end")
    date_hint = period_end or expired_at
    date_str = ""
    if date_hint:
        try:
            dt = datetime.fromisoformat(str(date_hint).replace("Z", "+00:00")).replace(tzinfo=None)
            date_str = dt.strftime("%b %d, %Y")
        except Exception:
            date_str = ""
    if reason == "account_disabled":
        return "Your account has been deactivated by an administrator. Please contact support if you need help."
    if reason == "subscription_ended":
        if plan and date_str:
            return f"Your {plan} subscription ended on {date_str}. Renew on the pricing page or contact support."
        if plan:
            return f"Your {plan} subscription has ended. Renew on the pricing page or contact support."
        return "Your subscription has ended. Renew on the pricing page or contact support."
    if reason == "payment_required":
        return "We could not collect your last payment. Update billing on the pricing page or contact support."
    if reason == "access_period_ended":
        if date_str:
            return f"Your access period ended on {date_str}. Renew on the pricing page or contact support."
        return "Your access period has ended. Renew on the pricing page or contact support."
    if reason == "subscription_inactive":
        return "Your subscription is no longer active. Renew on the pricing page or contact support."
    if reason == "no_plan":
        return "You do not have an active plan. Subscribe on the pricing page to access the dashboard."
    return "Your access has expired. Renew on the pricing page or contact support."


def _subscription_access_context(db, user: User) -> dict:
    """Why billing access may be denied — for dashboard/pricing UI after plan ends."""
    if not db or not user:
        return {}
    latest = (
        db.query(Subscription)
        .filter(Subscription.user_id == user.id)
        .order_by(Subscription.id.desc())
        .first()
    )
    st = (latest.status or "").lower() if latest else ""
    has_stripe = bool(getattr(user, "stripe_customer_id", None))
    lapsed = None
    if latest:
        plan = (
            db.query(SubscriptionPlan).filter(SubscriptionPlan.id == latest.plan_id).first()
            if latest.plan_id
            else None
        )
        period_end = latest.current_period_end or latest.ends_at
        lapsed = {
            "plan_id": latest.plan_id,
            "plan_name": plan.name if plan else ("Manual" if latest.is_manual else None),
            "status": latest.status,
            "current_period_end": period_end.isoformat() if period_end else None,
            "cancel_at_period_end": bool(latest.cancel_at_period_end),
        }
    if st in ("past_due", "unpaid"):
        return {
            "billing_issue": True,
            "access_denial_reason": "payment_required",
            "lapsed_subscription": lapsed,
        }
    if latest and has_stripe and st in ("canceled", "cancelled"):
        return {
            "billing_issue": False,
            "access_denial_reason": "subscription_ended",
            "lapsed_subscription": lapsed,
        }
    if latest and has_stripe:
        return {
            "billing_issue": False,
            "access_denial_reason": "subscription_inactive",
            "lapsed_subscription": lapsed,
        }
    expires = getattr(user, "access_expires_at", None)
    if expires and expires < datetime.utcnow() and (getattr(user, "role", "") or "") != "admin":
        return {
            "billing_issue": False,
            "access_denial_reason": "access_period_ended",
            "access_expired_at": expires.isoformat(),
            "lapsed_subscription": lapsed,
        }
    return {
        "billing_issue": False,
        "access_denial_reason": "no_plan",
        "lapsed_subscription": lapsed,
    }


def _ensure_user_public_id_chart(db, user: User) -> str | None:
    """Assign TLR-######## when missing (shared users table with journal-backend)."""
    existing = getattr(user, "public_id", None)
    if existing:
        return existing
    for _ in range(40):
        candidate = f"TLR-{secrets.randbelow(10**8):08d}"
        clash = db.query(User).filter(User.public_id == candidate).first()
        if clash:
            continue
        user.public_id = candidate
        db.commit()
        db.refresh(user)
        return candidate
    return None


def _user_entitlements_override_db(db, user_id: int) -> bool:
    try:
        row = db.execute(
            text("SELECT entitlements_override FROM users WHERE id = :id"),
            {"id": user_id},
        ).scalar()
        return bool(row)
    except Exception:
        return False


def _set_user_entitlements_override_db(db, user_id: int, value: bool) -> None:
    try:
        db.execute(
            text("UPDATE users SET entitlements_override = :v WHERE id = :id"),
            {"id": user_id, "v": bool(value)},
        )
    except Exception:
        pass


class _PlanCapsRow:
    def __init__(self, data: dict):
        for k, v in data.items():
            setattr(self, k, v)


def _apply_plan_entitlements_chart(db, user, plan) -> None:
    extra = _plan_extra_columns_from_db(db, plan.id)
    caps_row = _PlanCapsRow(
        {
            "max_trading_sessions": extra.get("max_trading_sessions", getattr(plan, "max_trading_sessions", None)),
            "max_tickers_per_session": extra.get("max_tickers_per_session"),
            "max_supporting_tickers_per_session": extra.get("max_supporting_tickers_per_session"),
        }
    )
    pe.apply_plan_entitlements(user, caps_row)
    _set_user_entitlements_override_db(db, user.id, False)


def _apply_admin_override_chart(db, user) -> None:
    _set_user_entitlements_override_db(db, user.id, True)


def _plan_extra_columns_from_db(db, plan_id: int) -> dict:
    try:
        row = (
            db.execute(
                text(
                    "SELECT max_trading_sessions, max_tickers_per_session, "
                    "max_supporting_tickers_per_session, tier_rank, entitlements_json "
                    "FROM subscription_plans WHERE id = :id"
                ),
                {"id": plan_id},
            )
            .mappings()
            .first()
        )
        return dict(row) if row else {}
    except Exception:
        try:
            row = (
                db.execute(
                    text("SELECT max_trading_sessions FROM subscription_plans WHERE id = :id"),
                    {"id": plan_id},
                )
                .mappings()
                .first()
            )
            return dict(row) if row else {}
        except Exception:
            return {}


def _update_plan_entitlement_columns_db(db, plan_id: int, payload: dict) -> None:
    fields: dict = {}
    for key in (
        "max_trading_sessions",
        "max_tickers_per_session",
        "max_supporting_tickers_per_session",
        "tier_rank",
        "entitlements_json",
    ):
        if key not in payload or payload[key] is None:
            continue
        if key == "entitlements_json":
            fields[key] = payload[key]
        elif key == "tier_rank":
            fields[key] = max(0, int(payload[key]))
        else:
            fields[key] = max(0, int(payload[key]))
    if not fields:
        return
    sets = ", ".join(f"{col} = :{col}" for col in fields)
    fields["id"] = plan_id
    db.execute(text(f"UPDATE subscription_plans SET {sets} WHERE id = :id"), fields)


def _plan_caps_from_db(db, plan_id: int | None) -> dict | None:
    """Load plan entitlement columns via raw SQL (ORM may omit columns pre-migration)."""
    if not plan_id:
        return None
    try:
        row = db.execute(
            text(
                "SELECT max_trading_sessions, max_tickers_per_session, "
                "max_supporting_tickers_per_session FROM subscription_plans WHERE id = :id"
            ),
            {"id": plan_id},
        ).mappings().first()
        if not row:
            return None
        return pe.plan_backtest_caps(_PlanCapsRow(dict(row)))
    except Exception:
        try:
            row = db.execute(
                text("SELECT max_trading_sessions FROM subscription_plans WHERE id = :id"),
                {"id": plan_id},
            ).mappings().first()
            if not row:
                return None
            return pe.plan_backtest_caps(_PlanCapsRow(dict(row)))
        except Exception:
            return None


def _user_backtest_limits(user: User, db=None) -> dict:
    """Per-user caps for backtest sessions and tickers."""
    if db is None:
        return pe.legacy_user_column_limits(user)
    try:
        if getattr(user, "role", "") == "admin":
            return {
                "max_trading_sessions": 0,
                "max_tickers_per_session": 0,
                "max_supporting_tickers_per_session": 0,
                "entitlements_source": "admin",
            }
        if _user_entitlements_override_db(db, user.id):
            caps = pe.legacy_user_column_limits(user)
            caps["entitlements_source"] = "override"
            return caps
        sub = (
            db.query(Subscription)
            .filter(
                Subscription.user_id == user.id,
                Subscription.status.in_(["active", "trialing"]),
            )
            .order_by(Subscription.id.desc())
            .first()
        )
        if sub and sub.plan_id:
            plan_caps = _plan_caps_from_db(db, sub.plan_id)
            if plan_caps:
                plan_caps["entitlements_source"] = "plan"
                return plan_caps
        return pe.effective_backtest_limits(user, active_subscription=sub, active_plan=None)
    except Exception:
        return pe.legacy_user_column_limits(user)


def _user_bypasses_backtest_limits(user: User) -> bool:
    return getattr(user, "role", "") == "admin"


def _normalize_symbol_list(raw) -> list[str]:
    if not isinstance(raw, list):
        return []
    seen = set()
    out = []
    for item in raw:
        sym = str(item or "").strip().upper()
        if not sym or sym in seen:
            continue
        seen.add(sym)
        out.append(sym)
    return out


def _session_config_ticker_counts(config: dict | None) -> tuple[int, int]:
    cfg = config if isinstance(config, dict) else {}
    tickers = _normalize_symbol_list(cfg.get("tickers"))
    supporting = _normalize_symbol_list(cfg.get("supporting_tickers"))
    if not tickers:
        primary = str(cfg.get("symbol") or cfg.get("primary_symbol") or "").strip().upper()
        if primary:
            tickers = [primary]
    return len(tickers), len(supporting)


def _count_user_trading_sessions(db, user_id: int) -> int:
    try:
        return int(
            db.query(func.count(TradingSession.id))
            .filter(TradingSession.user_id == user_id)
            .scalar()
            or 0
        )
    except Exception:
        return 0


def _session_limit_reached_error(current: int, cap: int) -> HTTPException:
    return HTTPException(
        status_code=403,
        detail=(
            f"Backtest session limit reached ({current}/{cap}). "
            "Delete an existing session or contact your administrator."
        ),
    )


def _lock_user_for_session_quota(db, user_id: int) -> User | None:
    """Serialize concurrent session creates per user (PostgreSQL row lock)."""
    q = db.query(User).filter(User.id == user_id)
    if _DATABASE_USES_ROW_LOCK:
        q = q.with_for_update()
    return q.first()


def _check_session_create_quota(db, user: User) -> User:
    """Ensure the user may create one more session; returns fresh locked user row."""
    if _user_bypasses_backtest_limits(user):
        return user
    locked = _lock_user_for_session_quota(db, user.id)
    if not locked:
        raise HTTPException(status_code=404, detail="User not found")
    limits = _user_backtest_limits(locked, db)
    cap = limits["max_trading_sessions"]
    if cap > 0:
        current = _count_user_trading_sessions(db, locked.id)
        if current >= cap:
            raise _session_limit_reached_error(current, cap)
    return locked


def _verify_session_count_after_flush(db, user: User) -> None:
    """Post-insert guard for races (especially SQLite without FOR UPDATE)."""
    if _user_bypasses_backtest_limits(user):
        return
    limits = _user_backtest_limits(user, db)
    cap = limits["max_trading_sessions"]
    if cap <= 0:
        return
    current = _count_user_trading_sessions(db, user.id)
    if current > cap:
        raise _session_limit_reached_error(current, cap)


def _enforce_backtest_limits(
    db,
    user: User,
    config: dict | None,
    *,
    is_create: bool = False,
) -> User:
    """Validate ticker caps; on create also enforce session count under user row lock."""
    if is_create:
        user = _check_session_create_quota(db, user)
    if _user_bypasses_backtest_limits(user):
        return user
    limits = _user_backtest_limits(user, db)
    ticker_count, supporting_count = _session_config_ticker_counts(config)
    max_tickers = limits["max_tickers_per_session"]
    if max_tickers > 0 and ticker_count > max_tickers:
        raise HTTPException(
            status_code=400,
            detail=f"Too many trading tickers ({ticker_count}). Maximum allowed: {max_tickers}.",
        )
    max_supporting = limits["max_supporting_tickers_per_session"]
    if max_supporting > 0 and supporting_count > max_supporting:
        raise HTTPException(
            status_code=400,
            detail=f"Too many supporting tickers ({supporting_count}). Maximum allowed: {max_supporting}.",
        )
    return user


def _safe_iso(value) -> str | None:
    if value is None:
        return None
    try:
        if hasattr(value, "isoformat"):
            return value.isoformat()
    except Exception:
        pass
    try:
        return str(value)
    except Exception:
        return None


def _limits_public_fields(user: User, db=None) -> dict:
    try:
        limits = _user_backtest_limits(user, db)
        out = {
            "max_trading_sessions": limits["max_trading_sessions"],
            "max_tickers_per_session": limits["max_tickers_per_session"],
            "max_supporting_tickers_per_session": limits["max_supporting_tickers_per_session"],
        }
        if "entitlements_source" in limits:
            out["entitlements_source"] = limits["entitlements_source"]
        if db is not None:
            out["entitlements_override"] = _user_entitlements_override_db(db, user.id)
        return out
    except Exception:
        legacy = pe.legacy_user_column_limits(user)
        return {
            "max_trading_sessions": legacy["max_trading_sessions"],
            "max_tickers_per_session": legacy["max_tickers_per_session"],
            "max_supporting_tickers_per_session": legacy["max_supporting_tickers_per_session"],
            "entitlements_source": "legacy",
            "entitlements_override": False,
        }


def _user_public_dict(user: User, db=None):
    try:
        return _user_public_dict_impl(user, db)
    except Exception as exc:
        try:
            print(f"[auth] _user_public_dict fallback for user {getattr(user, 'id', '?')}: {exc}", flush=True)
        except Exception:
            pass
        legacy = pe.legacy_user_column_limits(user)
        return {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "public_id": getattr(user, "public_id", None),
            "role": getattr(user, "role", "user"),
            "is_active": bool(getattr(user, "is_active", True)),
            "has_journal_access": bool(getattr(user, "has_journal_access", False)),
            "has_active_subscription": False,
            "has_dashboard_access": bool(getattr(user, "has_journal_access", False)),
            "max_sessions": getattr(user, "max_sessions", 1) or 1,
            "max_trading_sessions": legacy["max_trading_sessions"],
            "max_tickers_per_session": legacy["max_tickers_per_session"],
            "max_supporting_tickers_per_session": legacy["max_supporting_tickers_per_session"],
            "trading_sessions_count": 0,
            "subscription": None,
            "entitlements_source": "legacy",
            "entitlements_override": False,
        }


def _user_public_dict_impl(user: User, db=None):
    created = getattr(user, 'created_at', None)
    updated = getattr(user, 'updated_at', created)
    expires = getattr(user, 'access_expires_at', None)
    sub_info = None
    trading_sessions_count = 0
    if db:
        try:
            trading_sessions_count = int(
                db.query(func.count(TradingSession.id)).filter(TradingSession.user_id == user.id).scalar() or 0
            )
        except Exception:
            trading_sessions_count = 0
        try:
            active_sub = db.query(Subscription).filter(
                Subscription.user_id == user.id,
                Subscription.status.in_(["active", "trialing"])
            ).first()
            if active_sub:
                plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == active_sub.plan_id).first() if active_sub.plan_id else None
                period_end = active_sub.current_period_end or active_sub.ends_at
                sub_info = {
                    "id": active_sub.id,
                    "plan_id": active_sub.plan_id,
                    "plan_name": plan.name if plan else ("Manual" if active_sub.is_manual else "—"),
                    "status": active_sub.status,
                    "is_manual": bool(active_sub.is_manual),
                    "period_end": period_end.isoformat() if period_end else None,
                    "cancel_at_period_end": bool(active_sub.cancel_at_period_end),
                    "stripe_subscription_id": active_sub.stripe_subscription_id,
                }
        except Exception:
            pass
    journal_entitled = (
        _user_entitles_journal_db(db, user)
        if db is not None
        else bool(getattr(user, "has_journal_access", False))
    )
    grants = _parse_user_module_grants(user)
    subscription_entitled = False
    if db is not None:
        try:
            subscription_entitled = (
                db.query(Subscription)
                .filter(
                    Subscription.user_id == user.id,
                    Subscription.status.in_(["active", "trialing"]),
                )
                .first()
                is not None
            )
        except Exception:
            subscription_entitled = False
    full_modules = user_has_full_dashboard_modules(
        user, subscription_entitled=subscription_entitled, grants_override=grants
    )
    mod_map = effective_dashboard_modules(
        user, fully_entitled=full_modules, grants_override=grants
    )
    has_dashboard_access = full_modules or any(mod_map.values())
    public_id = getattr(user, "public_id", None)
    if db is not None and not public_id:
        public_id = _ensure_user_public_id_chart(db, user)
    out = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "public_id": public_id,
        "role": user.role,
        "timezone": getattr(user, 'timezone', 'UTC'),
        "base_currency": getattr(user, 'base_currency', 'USD'),
        "is_active": bool(user.is_active),
        "manual_full_access": bool(getattr(user, "has_journal_access", False)),
        "module_grants": grants or {},
        "has_journal_access": journal_entitled,
        "has_active_subscription": subscription_entitled,
        "has_dashboard_access": has_dashboard_access,
        "dashboard_modules": mod_map,
        "access_expires_at": _safe_iso(expires),
        "max_sessions": getattr(user, 'max_sessions', 1) or 1,
        **_limits_public_fields(user, db),
        "trading_sessions_count": trading_sessions_count,
        "subscription": sub_info,
        "created_at": _safe_iso(created),
        "updated_at": _safe_iso(updated),
        "country": getattr(user, "country", None),
        "phone": getattr(user, "phone", None),
        "birth_date": _safe_iso(getattr(user, "birth_date", None)),
        "stripe_customer_id": getattr(user, "stripe_customer_id", None),
    }
    if db is not None and not subscription_entitled:
        try:
            out.update(_subscription_access_context(db, user))
        except Exception:
            pass
    return out

def _dataset_settings_public_dict(settings: DatasetSettings | None, file_obj: CSVFile):
    delimiter = settings.csv_delimiter if settings and settings.csv_delimiter else ","
    return {
        "display_name": settings.display_name if settings and settings.display_name else file_obj.original_name,
        "csv_delimiter": "\\t" if delimiter == "\t" else delimiter,
        "datetime_format": settings.datetime_format if settings else None,
        "csv_timezone": settings.csv_timezone if settings and settings.csv_timezone else "UTC",
        "csv_has_header": bool(settings.csv_has_header) if settings is not None else True,
        "is_active": bool(settings.is_active) if settings is not None else True,
        "notes": settings.notes if settings else None,
    }

@app.post("/api/auth/signup")
async def auth_signup(payload: SignUpIn, request: Request):
    ip = _client_ip_for_rate_limit(request)
    if not _auth_ip_rate_allow(_auth_signup_ip_times, ip, AUTH_SIGNUP_MAX_PER_MINUTE, redis_scope="signup"):
        raise HTTPException(
            status_code=429,
            detail="Too many signup attempts. Please try again later.",
        )
    email = payload.email.strip().lower()
    name = payload.name.strip()
    if not email or not name or not payload.password:
        raise HTTPException(status_code=400, detail="Invalid input")

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already exists")

        user = User(
            name=name,
            email=email,
            password_hash=_hash_password(payload.password),
            role="user",
            is_active=True,
        )
        db.add(user)
        db.flush()
        _ensure_user_public_id_chart(db, user)
        db.commit()
        db.refresh(user)
        try:
            _affiliate_post_auth(db, user, request, payload.affiliate_code, is_signup=True)
            db.commit()
        except Exception:
            db.rollback()
        return {"success": True, "user": _user_public_dict(user)}
    finally:
        db.close()

@app.post("/api/auth/login")
async def auth_login(payload: LoginIn, request: Request, response: Response):
    ip = _client_ip_for_rate_limit(request)
    if not _auth_ip_rate_allow(_auth_login_ip_times, ip, AUTH_LOGIN_MAX_PER_MINUTE):
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Please try again later.",
        )
    email = payload.email.strip().lower()

    if not payload.password:
        raise HTTPException(status_code=400, detail="Invalid input")

    db = SessionLocal()
    try:
        _apply_entitlements_schema_migrations(engine)
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        if not user.is_active:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "account_disabled",
                    "message": "Your account has been deactivated by an administrator. Please contact support if you need help.",
                },
            )
        if not _verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        is_admin = (user.role or "") == "admin"
        entitled = is_admin or _user_entitles_journal_db(db, user)
        if not entitled and not _is_pricing_renewal_path(payload.next_path):
            ctx = _subscription_access_context(db, user)
            reason = ctx.get("access_denial_reason") or "subscription"
            raise HTTPException(
                status_code=403,
                detail={
                    "code": reason,
                    "message": _login_access_denied_message(user, ctx),
                },
            )

        session_id = _enforce_session_limit_and_create(db, user, request)
        db.refresh(user)

        _set_session_cookie(response, session_id, request=request)
        try:
            _affiliate_post_auth(db, user, request, payload.affiliate_code, is_signup=False)
            db.commit()
        except Exception:
            db.rollback()
        return {"success": True, **_auth_response_with_journal_token(user, db)}
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        try:
            print(f"[auth] login failed for {email}: {type(exc).__name__}: {exc}", flush=True)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Login failed due to a server error. Please try again.") from exc
    finally:
        db.close()


@app.post("/api/auth/google")
async def auth_google(payload: GoogleAuthIn, request: Request, response: Response):
    """Sign in or sign up with Google Identity Services (ID token)."""
    ip = _client_ip_for_rate_limit(request)
    if not _auth_ip_rate_allow(_auth_login_ip_times, ip, AUTH_LOGIN_MAX_PER_MINUTE):
        raise HTTPException(
            status_code=429,
            detail="Too many sign-in attempts. Please try again later.",
        )
    claims = _verify_google_id_token(payload.credential)
    email = claims["email"]
    name = claims["name"]

    db = SessionLocal()
    try:
        _apply_entitlements_schema_migrations(engine)
        user = db.query(User).filter(User.email == email).first()
        is_new = False
        if not user:
            user = User(
                name=name,
                email=email,
                password_hash=_hash_password(secrets.token_urlsafe(48)),
                role="user",
                is_active=True,
            )
            db.add(user)
            db.flush()
            _ensure_user_public_id_chart(db, user)
            db.commit()
            db.refresh(user)
            is_new = True
        elif not user.is_active:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "account_disabled",
                    "message": "Your account has been deactivated by an administrator. Please contact support if you need help.",
                },
            )
        elif not is_new:
            is_admin = (user.role or "") == "admin"
            entitled = is_admin or _user_entitles_journal_db(db, user)
            if not entitled and not _is_pricing_renewal_path(getattr(payload, "next_path", None)):
                ctx = _subscription_access_context(db, user)
                reason = ctx.get("access_denial_reason") or "subscription"
                raise HTTPException(
                    status_code=403,
                    detail={
                        "code": reason,
                        "message": _login_access_denied_message(user, ctx),
                    },
                )

        session_id = _enforce_session_limit_and_create(db, user, request)
        db.refresh(user)
        _set_session_cookie(response, session_id, request=request)
        try:
            _affiliate_post_auth(
                db,
                user,
                request,
                payload.affiliate_code,
                is_signup=is_new,
            )
            db.commit()
        except Exception:
            db.rollback()
        out = {"success": True, "is_new_user": is_new, **_auth_response_with_journal_token(user, db)}
        return out
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        try:
            print(f"[auth] google sign-in failed for {email}: {exc}", flush=True)
        except Exception:
            pass
        raise HTTPException(
            status_code=500,
            detail="Google sign-in failed due to a server error. Please try again.",
        ) from exc
    finally:
        db.close()


@app.get("/api/affiliate/click")
async def affiliate_click_redirect(
    request: Request,
    response: Response,
    code: str = Query(...),
    next: str = Query("/"),
):
    """Set affiliate tracking cookie and redirect. Use: /api/affiliate/click?code=PROMO&next=/register/"""
    ip = _client_ip_for_rate_limit(request)
    if not _affiliate_click_rate_allow(ip):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later.",
        )
    normalized = _normalize_affiliate_code(code)
    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid code")
    safe_next = next if (next.startswith("/") and not next.startswith("//")) else "/"
    _set_affiliate_cookie(response, normalized, request=request)
    return RedirectResponse(url=safe_next, status_code=302)


@app.post("/api/auth/logout")
async def auth_logout(request: Request, response: Response):
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    if session_id:
        db = SessionLocal()
        try:
            db.query(UserSession).filter(UserSession.id == session_id).delete()
            db.commit()
        finally:
            db.close()
    _clear_session_cookie(response)
    return {"success": True}


def _stripe_customer_card_preview(_stripe, cust_id: str) -> dict | None:
    """Default card on Stripe customer for profile UI: brand, last4, exp_month, exp_year."""
    if not _stripe or not cust_id:
        return None
    try:
        co = _stripe.Customer.retrieve(cust_id, expand=["invoice_settings.default_payment_method"])
    except Exception:
        return None
    pm = None
    if isinstance(co, dict):
        inv = co.get("invoice_settings") or {}
        pm = inv.get("default_payment_method")
    else:
        inv = getattr(co, "invoice_settings", None)
        pm = getattr(inv, "default_payment_method", None) if inv is not None else None
    if pm is None:
        return None
    if isinstance(pm, str):
        try:
            pm = _stripe.PaymentMethod.retrieve(pm)
        except Exception:
            return None
    ctype = pm.get("type") if isinstance(pm, dict) else getattr(pm, "type", None)
    if ctype != "card":
        return None
    card = pm.get("card") if isinstance(pm, dict) else getattr(pm, "card", None)
    if isinstance(card, dict):
        brand = (card.get("display_brand") or card.get("brand") or "card").upper()
        return {
            "brand": str(brand)[:16],
            "last4": card.get("last4"),
            "exp_month": card.get("exp_month"),
            "exp_year": card.get("exp_year"),
        }
    if card is None:
        return None
    brand = (getattr(card, "display_brand", None) or getattr(card, "brand", None) or "CARD")
    return {
        "brand": str(brand).upper()[:16],
        "last4": getattr(card, "last4", None),
        "exp_month": getattr(card, "exp_month", None),
        "exp_year": getattr(card, "exp_year", None),
    }


@app.get("/api/auth/billing-snapshot")
async def auth_billing_snapshot(request: Request, limit: int = 12):
    """Signed-in user: default card + recent Stripe invoices (no admin)."""
    if not AUTH_ENABLED:
        raise HTTPException(501, detail="Auth disabled")
    user = _get_user_from_request(request)
    if user is None:
        raise HTTPException(401, detail="Not authenticated")
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == user.id).first()
        cust = (u.stripe_customer_id or "").strip() if u else ""
    finally:
        db.close()
    if not cust:
        return {"success": True, "card": None, "invoices": [], "stripe_configured": bool(_stripe_client())}
    _stripe = _stripe_client()
    if not _stripe:
        return {"success": True, "card": None, "invoices": [], "stripe_configured": False}
    card = _stripe_customer_card_preview(_stripe, cust)
    lim = max(1, min(25, int(limit or 12)))
    inv_out: list[dict] = []
    try:
        lst = _stripe.Invoice.list(customer=cust, limit=lim)
        stream = getattr(lst, "data", None) or []
        for inv in stream:
            d = _stripe_invoice_to_admin_dict(inv)
            inv_out.append(
                {
                    "id": d.get("id"),
                    "created": d.get("created"),
                    "total": d.get("total"),
                    "currency": (d.get("currency") or "usd"),
                    "invoice_pdf": d.get("invoice_pdf"),
                    "hosted_invoice_url": d.get("hosted_invoice_url"),
                    "status": d.get("status"),
                }
            )
    except Exception as e:
        import logging as _logging

        _logging.warning("auth_billing_snapshot invoices: %s", e)
        inv_out = []
    return {"success": True, "card": card, "invoices": inv_out, "stripe_configured": True}


def _journal_jwt_secret() -> str | None:
    secret = (os.environ.get("JWT_SECRET_KEY") or "").strip()
    return secret if len(secret) >= 32 else None


def _mint_journal_access_token(user: User) -> str | None:
    """Flask-JWT-Extended compatible access token for /journal/api/* (shared JWT_SECRET_KEY)."""
    secret = _journal_jwt_secret()
    if not secret or pyjwt is None:
        return None
    is_admin = getattr(user, "role", None) == "admin" or bool(getattr(user, "is_admin", False))
    now = datetime.utcnow()
    payload = {
        "sub": str(user.id),
        "is_admin": is_admin,
        "exp": now + timedelta(hours=24),
        "iat": now,
        "nbf": now,
        "type": "access",
        "fresh": False,
        "jti": secrets.token_urlsafe(16),
    }
    try:
        return pyjwt.encode(payload, secret, algorithm="HS256")
    except Exception:
        return None


def _auth_response_with_journal_token(user: User, db) -> dict:
    out: dict = {"user": _user_public_dict(user, db=db)}
    tok = _mint_journal_access_token(user)
    if tok:
        out["journal_token"] = tok
    return out


def _google_client_id() -> str:
    return (os.environ.get("GOOGLE_CLIENT_ID") or "").strip()


def _verify_google_id_token(credential: str) -> dict:
    """Validate GIS credential and return { email, name }."""
    client_id = _google_client_id()
    if not client_id:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    token = (credential or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Missing Google credential")
    try:
        idinfo = google_id_token.verify_oauth2_token(
            token,
            google_auth_requests.Request(),
            client_id,
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google sign-in token")
    iss = idinfo.get("iss")
    if iss not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(status_code=401, detail="Invalid Google sign-in issuer")
    email = (idinfo.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email address")
    if idinfo.get("email_verified") is False:
        raise HTTPException(status_code=400, detail="Google email is not verified")
    name = (idinfo.get("name") or email.split("@", 1)[0] or "User").strip()[:120]
    return {"email": email, "name": name}


def _enforce_session_limit_and_create(
    db,
    user: User,
    request: Request,
) -> str:
    max_sess = user.max_sessions if user.max_sessions and user.max_sessions > 0 else 1
    if user.role != "admin":
        existing = (
            db.query(UserSession)
            .filter(UserSession.user_id == user.id)
            .order_by(UserSession.last_active_at.desc())
            .all()
        )
        if len(existing) >= max_sess:
            for old in existing[max_sess - 1 :]:
                db.delete(old)
    session_id = secrets.token_urlsafe(32)
    sess = UserSession(
        id=session_id,
        user_id=user.id,
        ip_address=request.client.host if request.client else None,
        device=request.headers.get("user-agent"),
        last_active_at=datetime.utcnow(),
    )
    db.add(sess)
    db.commit()
    return session_id


@app.get("/api/auth/config")
async def auth_config():
    """Public auth UI config (e.g. Google client id for Sign in with Google)."""
    cid = _google_client_id()
    return {
        "google_client_id": cid if cid else None,
        "auth_enabled": AUTH_ENABLED,
    }


@app.get("/api/auth/me")
async def auth_me(request: Request):
    if not AUTH_ENABLED:
        return {"user": {"id": 0, "email": "anonymous@local", "name": "Trader", "role": "admin"}}
    user = _get_user_from_request(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    db = SessionLocal()
    try:
        _apply_entitlements_schema_migrations(engine)
        return _auth_response_with_journal_token(user, db)
    except HTTPException:
        raise
    except Exception as exc:
        try:
            print(f"[auth] /me failed for user {getattr(user, 'id', '?')}: {exc}", flush=True)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Could not load profile.") from exc
    finally:
        db.close()


class _UserSelfProfileIn(BaseModel):
    """Self-service profile update. Email and role cannot be changed here."""

    name: str | None = Field(None, min_length=1, max_length=120)
    password: str | None = Field(None, min_length=8, max_length=200)
    current_password: str | None = Field(None, max_length=200)
    country: str | None = Field(None, max_length=100)
    phone: str | None = Field(None, max_length=50)


@app.patch("/api/auth/profile")
async def auth_patch_profile(request: Request):
    """Update the signed-in user's profile (not email)."""
    if not AUTH_ENABLED:
        raise HTTPException(status_code=501, detail="Auth disabled")
    user = _get_user_from_request(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    body.pop("email", None)
    body.pop("role", None)
    body.pop("id", None)
    birth_sent = "birth_date" in body
    birth_val = body.get("birth_date") if birth_sent else None
    filtered = {k: body[k] for k in ("name", "password", "current_password", "country", "phone") if k in body}
    try:
        payload = _UserSelfProfileIn(**filtered)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    has_any = (
        payload.name is not None
        or payload.password is not None
        or payload.country is not None
        or payload.phone is not None
        or birth_sent
    )
    if not has_any:
        raise HTTPException(status_code=400, detail="No fields to update")

    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == user.id).first()
        if not u:
            raise HTTPException(status_code=404, detail="User not found")

        if payload.name is not None:
            u.name = payload.name.strip()[:120]

        if payload.country is not None:
            c = payload.country.strip()
            u.country = c[:100] if c else None

        if payload.phone is not None:
            p = payload.phone.strip()
            u.phone = p[:50] if p else None

        if birth_sent:
            val = birth_val
            if val is None or (isinstance(val, str) and not str(val).strip()):
                u.birth_date = None
            else:
                try:
                    u.birth_date = datetime.strptime(str(val).strip()[:10], "%Y-%m-%d").date()
                except ValueError:
                    raise HTTPException(status_code=400, detail="birth_date must be YYYY-MM-DD")

        if payload.password is not None:
            if not payload.current_password:
                raise HTTPException(
                    status_code=400,
                    detail="current_password is required to change password",
                )
            if not _verify_password(payload.current_password, u.password_hash):
                raise HTTPException(status_code=400, detail="Current password is incorrect")
            u.password_hash = _hash_password(payload.password)

        db.commit()
        db.refresh(u)
        return {"success": True, "user": _user_public_dict(u, db=db)}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


def _user_stripe_manageable_subscription(db, user_id: int):
    """Active/trialing Stripe-linked subscription for self-service cancel/reactivate."""
    return (
        db.query(Subscription)
        .filter(
            Subscription.user_id == user_id,
            Subscription.status.in_(["active", "trialing"]),
            Subscription.is_manual == False,
            Subscription.stripe_subscription_id.isnot(None),
        )
        .order_by(Subscription.updated_at.desc())
        .first()
    )


class _UserBillingPortalIn(BaseModel):
    return_url: str | None = Field(None, max_length=2000)


@app.post("/api/auth/billing-portal")
async def auth_billing_portal(request: Request):
    """Stripe Customer Portal for the signed-in user (payment method, invoices, cancel in Stripe UI if enabled)."""
    if not AUTH_ENABLED:
        raise HTTPException(501, detail="Auth disabled")
    user = _get_user_from_request(request)
    if user is None:
        raise HTTPException(401, detail="Not authenticated")
    body = {}
    try:
        raw = await request.json()
        if isinstance(raw, dict):
            body = raw
    except Exception:
        pass
    try:
        payload = _UserBillingPortalIn(**{k: body[k] for k in ("return_url",) if k in body})
    except Exception as e:
        raise HTTPException(400, detail=str(e)) from e
    base = (os.environ.get("FRONTEND_URL") or "http://localhost:3000").rstrip("/")
    return_url = (payload.return_url or (base + "/dashboard/profile/")).strip()
    if not _chart_is_allowed_stripe_return_url(return_url):
        raise HTTPException(
            status_code=400,
            detail="return_url origin not allowed; set FRONTEND_URL or STRIPE_REDIRECT_ALLOWED_ORIGINS",
        )
    cust = (getattr(user, "stripe_customer_id", None) or "").strip()
    if not cust:
        raise HTTPException(status_code=400, detail="User has no stripe_customer_id")
    _stripe = _stripe_client()
    if not _stripe:
        raise HTTPException(status_code=503, detail="Stripe not configured (set STRIPE_SECRET_KEY)")
    try:
        session = _stripe.billing_portal.Session.create(customer=cust, return_url=return_url)
    except Exception as e:
        import stripe as _stripe_mod

        if isinstance(e, _stripe_mod.error.StripeError):
            raise HTTPException(status_code=400, detail=(getattr(e, "user_message", None) or str(e))[:500]) from e
        raise HTTPException(status_code=400, detail=str(e)[:500]) from e
    url = getattr(session, "url", None) or (session.get("url") if isinstance(session, dict) else None)
    if not url:
        raise HTTPException(status_code=500, detail="Stripe returned no portal URL")
    return {"success": True, "url": url}


@app.post("/api/auth/subscription/cancel-at-period-end")
async def auth_subscription_cancel_at_period_end(request: Request):
    """Schedule Stripe cancel at period end; journal access stays until period ends while status stays active/trialing."""
    if not AUTH_ENABLED:
        raise HTTPException(501, detail="Auth disabled")
    user = _get_user_from_request(request)
    if user is None:
        raise HTTPException(401, detail="Not authenticated")
    db = SessionLocal()
    try:
        sub = _user_stripe_manageable_subscription(db, user.id)
        if not sub:
            raise HTTPException(
                status_code=404,
                detail="No active Stripe subscription found (manual or promotional plans: contact support).",
            )
        if sub.cancel_at_period_end:
            return {"success": True, "already_scheduled": True, "subscription": _sub_public_dict(sub, db)}
        _stripe = _stripe_client()
        if not _stripe:
            raise HTTPException(status_code=503, detail="Stripe not configured (set STRIPE_SECRET_KEY)")
        try:
            ss = _stripe.Subscription.modify(sub.stripe_subscription_id, cancel_at_period_end=True)
        except Exception as e:
            import stripe as _stripe_mod

            db.rollback()
            if isinstance(e, _stripe_mod.error.StripeError):
                raise HTTPException(status_code=400, detail=(getattr(e, "user_message", None) or str(e))[:500]) from e
            raise HTTPException(status_code=400, detail=str(e)[:500]) from e
        patch = _stripe_subscription_fields_from_object(ss)
        _apply_stripe_subscription_fields(sub, patch)
        db.commit()
        db.refresh(sub)
        return {"success": True, "subscription": _sub_public_dict(sub, db)}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        db.close()


@app.post("/api/auth/subscription/reactivate")
async def auth_subscription_reactivate(request: Request):
    """Undo cancel_at_period_end before the period ends (Stripe still active/trialing)."""
    if not AUTH_ENABLED:
        raise HTTPException(501, detail="Auth disabled")
    user = _get_user_from_request(request)
    if user is None:
        raise HTTPException(401, detail="Not authenticated")
    db = SessionLocal()
    try:
        sub = (
            db.query(Subscription)
            .filter(
                Subscription.user_id == user.id,
                Subscription.status.in_(["active", "trialing"]),
                Subscription.is_manual == False,
                Subscription.stripe_subscription_id.isnot(None),
                Subscription.cancel_at_period_end == True,
            )
            .first()
        )
        if not sub:
            raise HTTPException(status_code=404, detail="No scheduled cancellation to undo.")
        _stripe = _stripe_client()
        if not _stripe:
            raise HTTPException(status_code=503, detail="Stripe not configured (set STRIPE_SECRET_KEY)")
        try:
            ss = _stripe.Subscription.modify(sub.stripe_subscription_id, cancel_at_period_end=False)
        except Exception as e:
            import stripe as _stripe_mod

            db.rollback()
            if isinstance(e, _stripe_mod.error.StripeError):
                raise HTTPException(status_code=400, detail=(getattr(e, "user_message", None) or str(e))[:500]) from e
            raise HTTPException(status_code=400, detail=str(e)[:500]) from e
        patch = _stripe_subscription_fields_from_object(ss)
        _apply_stripe_subscription_fields(sub, patch)
        db.commit()
        db.refresh(sub)
        return {"success": True, "subscription": _sub_public_dict(sub, db)}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        db.close()


def _support_ticket_ref(thread_id: int) -> str:
    return f"TAL-{int(thread_id):05d}"


def _support_category_assignees() -> dict[str, int]:
    raw = os.getenv("SUPPORT_CATEGORY_ASSIGNEES", "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return {}
        out: dict[str, int] = {}
        for k, v in data.items():
            try:
                out[str(k).strip().lower()] = int(v)
            except (TypeError, ValueError):
                continue
        return out
    except json.JSONDecodeError:
        return {}


def _support_priority_for_category(cat: str) -> str:
    c = (cat or "other").strip().lower()
    if c in ("bug", "error", "access", "billing"):
        return "high"
    if c in ("suggestions", "feature", "other"):
        return "low"
    return "normal"


def _support_default_assignee_id(db, cat: str) -> int | None:
    aid = _support_category_assignees().get((cat or "").strip().lower())
    if not aid:
        return None
    agent = (
        db.query(User)
        .filter(User.id == aid, User.role == "admin", User.is_active == True)
        .first()
    )
    return int(agent.id) if agent else None


def _support_load_ticket_extra(t: SupportThread) -> dict:
    raw = getattr(t, "ticket_extra", None) or ""
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _support_set_ticket_extra(t: SupportThread, data: dict) -> None:
    t.ticket_extra = json.dumps(data, separators=(",", ":"))[:12000]


def _support_load_tags(t: SupportThread) -> list[str]:
    raw = getattr(t, "tags_json", None) or ""
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if not isinstance(data, list):
            return []
        return [str(x).strip()[:32] for x in data if str(x).strip()][:10]
    except json.JSONDecodeError:
        return []


def _support_validate_tags(tags: list | None) -> list[str]:
    if not tags:
        return []
    out: list[str] = []
    for item in tags:
        s = str(item).strip().lower()[:32]
        if not s or s in out:
            continue
        if not re.match(r"^[a-z0-9][a-z0-9_-]{0,31}$", s):
            continue
        out.append(s)
        if len(out) >= 10:
            break
    return out


def _support_sla_add_business_hours(start: datetime, hours: int) -> datetime:
    """Advance by `hours` counted only on weekdays SUPPORT_BH_START_HOUR–END_HOUR UTC."""
    if hours <= 0:
        return start
    cur = start
    remaining = float(hours)
    while remaining > 0:
        cur += timedelta(hours=1)
        if cur.weekday() >= 5:
            continue
        if SUPPORT_BH_START_HOUR <= cur.hour < SUPPORT_BH_END_HOUR:
            remaining -= 1.0
    return cur


def _support_sla_due_at(from_dt: datetime | None = None) -> datetime:
    base = from_dt or datetime.utcnow()
    if SUPPORT_SLA_BUSINESS_HOURS:
        return _support_sla_add_business_hours(base, SUPPORT_SLA_FIRST_RESPONSE_HOURS)
    return base + timedelta(hours=SUPPORT_SLA_FIRST_RESPONSE_HOURS)


def _support_sla_status_label(t: SupportThread, now: datetime | None = None) -> str | None:
    now = now or datetime.utcnow()
    if t.status not in ("open", "pending") or t.first_responded_at is not None:
        return None
    due = t.first_response_due_at
    if not due:
        return None
    delta = due - now
    if delta.total_seconds() < 0:
        overdue_h = int((now - due).total_seconds() // 3600)
        if overdue_h < 1:
            return "Overdue"
        return f"Overdue {overdue_h}h"
    left_h = int(delta.total_seconds() // 3600)
    left_m = int((delta.total_seconds() % 3600) // 60)
    if left_h >= 1:
        return f"Due in {left_h}h"
    if left_m >= 1:
        return f"Due in {left_m}m"
    return "Due soon"


def _support_ticket_url(thread_id: int) -> str:
    base = SUPPORT_TICKET_URL_BASE.rstrip("=")
    if base.endswith("=") or base.endswith("thread="):
        return f"{base}{thread_id}"
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}thread={thread_id}"


def _support_validate_category(cat: str) -> str:
    c = (cat or "other").strip().lower()
    if c not in SUPPORT_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    return c


def _support_validate_status(st: str) -> str:
    s = (st or "").strip().lower()
    if s not in SUPPORT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    return s


def _support_validate_priority(pr: str) -> str:
    p = (pr or "normal").strip().lower()
    if p not in SUPPORT_PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")
    return p


def _support_validate_admin_yes_no(val: str | None) -> str | None:
    if val is None:
        return None
    v = str(val).strip().lower()
    if v in ("", "null", "none", "clear"):
        return None
    if v in ("yes", "no"):
        return v
    raise HTTPException(status_code=400, detail="admin_yes_no must be yes, no, or empty to clear")


def _support_apply_status_timestamps(t: SupportThread, new_status: str, now: datetime) -> None:
    t.status = new_status
    t.updated_at = now
    if new_status == "resolved" and not t.resolved_at:
        t.resolved_at = now
    elif new_status == "closed":
        if not t.closed_at:
            t.closed_at = now
    elif new_status in ("open", "pending"):
        if new_status == "open":
            t.resolved_at = None
    elif new_status == "user_replied":
        pass


def _support_thread_sla_overdue(t: SupportThread, now: datetime | None = None) -> bool:
    now = now or datetime.utcnow()
    if t.status not in ("open", "pending"):
        return False
    if t.first_responded_at is not None:
        return False
    due = t.first_response_due_at
    return bool(due and due < now)


class SupportCreateThreadIn(BaseModel):
    subject: str = Field(..., max_length=SUPPORT_SUBJECT_MAX)
    category: str = Field(default="other")
    body: str = Field(..., max_length=SUPPORT_BODY_MAX)
    tags: list[str] | None = None
    context: dict | None = None
    structured: dict | None = None


class SupportCsatIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str | None = Field(None, max_length=1000)


class SupportAppendMessageIn(BaseModel):
    body: str = Field(..., max_length=SUPPORT_BODY_MAX)


class SupportAdminAppendMessageIn(BaseModel):
    body: str = Field(..., max_length=SUPPORT_BODY_MAX)
    is_internal: bool = False


class SupportPatchThreadIn(BaseModel):
    status: str | None = None


class SupportAdminPatchThreadIn(BaseModel):
    status: str | None = None
    priority: str | None = None
    assigned_to_user_id: int | None = None
    category: str | None = None
    tags: list[str] | None = None
    related_thread_id: int | None = None
    admin_yes_no: str | None = None


class AdminSupportBulkFilterIn(BaseModel):
    dry_run: bool = False
    include_resolved: bool = True
    all_tickets: bool = False
    category: str | None = None
    older_than_days: int | None = Field(None, ge=1, le=3650)
    before_date: str | None = Field(None, max_length=32)


class AdminArchiveClosedSupportIn(AdminSupportBulkFilterIn):
    pass


class AdminSupportUnarchiveIn(AdminSupportBulkFilterIn):
    all_archived: bool = False


class AdminSupportImportUserTicketsIn(BaseModel):
    dry_run: bool = False
    user_id: int | None = None


class AdminSupportImportExportIn(BaseModel):
    dry_run: bool = False
    export: dict


class AdminSupportDeleteBulkIn(AdminSupportBulkFilterIn):
    pass


def _support_thread_archive_reference_dt():
    """Best-effort finished/activity timestamp for archive time filters."""
    return func.coalesce(
        SupportThread.closed_at,
        SupportThread.resolved_at,
        SupportThread.last_message_at,
        SupportThread.created_at,
    )


def _parse_support_archive_before_date(raw: str) -> datetime:
    s = (raw or "").strip()[:10]
    try:
        d = datetime.strptime(s, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="before_date must be YYYY-MM-DD") from exc
    return d.replace(hour=23, minute=59, second=59, microsecond=999999)


def _admin_support_bulk_filter_query(db, payload: AdminSupportBulkFilterIn, *, archived_mode: str = "exclude"):
    """archived_mode: exclude | only | any"""
    statuses = ("closed",)
    if payload.include_resolved:
        statuses = ("closed", "resolved")
    if payload.all_tickets:
        statuses = tuple(SUPPORT_STATUSES)
    q = db.query(SupportThread)
    if archived_mode == "exclude":
        q = _support_exclude_archived(q)
    elif archived_mode == "only":
        q = q.filter(SupportThread.archived_at.isnot(None))
    if not payload.all_tickets:
        q = q.filter(SupportThread.status.in_(statuses))
    if payload.category:
        q = q.filter(SupportThread.category == _support_validate_category(payload.category))
    ref_dt = _support_thread_archive_reference_dt()
    now = datetime.utcnow()
    if payload.older_than_days is not None:
        cutoff = now - timedelta(days=int(payload.older_than_days))
        q = q.filter(ref_dt < cutoff)
    if payload.before_date:
        before = _parse_support_archive_before_date(payload.before_date)
        q = q.filter(ref_dt <= before)
    return q, list(statuses)


def _admin_support_bulk_filter_summary(payload: AdminSupportBulkFilterIn, statuses: list[str]) -> dict:
    return {
        "statuses": statuses,
        "include_resolved": payload.include_resolved,
        "all_tickets": payload.all_tickets,
        "category": payload.category,
        "older_than_days": payload.older_than_days,
        "before_date": payload.before_date,
    }


def _admin_support_bulk_preview(rows: list) -> list[dict]:
    return [
        {
            "id": t.id,
            "ticket_ref": _support_ticket_ref(t.id),
            "status": t.status,
            "category": t.category,
            "subject": (t.subject or "")[:120],
            "archived_at": t.archived_at.isoformat() if getattr(t, "archived_at", None) else None,
        }
        for t in rows[:100]
    ]


def _admin_support_delete_threads(db, threads: list) -> int:
    thread_ids = [int(t.id) for t in threads]
    if not thread_ids:
        return 0
    msg_ids = [
        int(r[0])
        for r in db.query(SupportMessage.id).filter(SupportMessage.thread_id.in_(thread_ids)).all()
    ]
    if msg_ids:
        atts = db.query(SupportAttachment).filter(SupportAttachment.message_id.in_(msg_ids)).all()
        for att in atts:
            path = SUPPORT_UPLOAD_DIR / att.stored_name
            try:
                if path.is_file():
                    path.unlink()
            except OSError:
                pass
        db.query(SupportAttachment).filter(SupportAttachment.message_id.in_(msg_ids)).delete(
            synchronize_session=False
        )
        db.query(SupportMessage).filter(SupportMessage.thread_id.in_(thread_ids)).delete(
            synchronize_session=False
        )
    db.query(SupportThreadRead).filter(SupportThreadRead.thread_id.in_(thread_ids)).delete(
        synchronize_session=False
    )
    db.query(Notification).filter(Notification.thread_id.in_(thread_ids)).delete(synchronize_session=False)
    db.query(SupportThread).filter(SupportThread.related_thread_id.in_(thread_ids)).update(
        {SupportThread.related_thread_id: None}, synchronize_session=False
    )
    return db.query(SupportThread).filter(SupportThread.id.in_(thread_ids)).delete(synchronize_session=False)


def _admin_support_archive_query(db, payload: AdminArchiveClosedSupportIn):
    """Archive only finished tickets — never open/pending/user_replied."""
    arch_statuses = ("closed", "resolved") if payload.include_resolved else ("closed",)
    narrow = payload.model_copy(update={"all_tickets": False, "include_resolved": True})
    q, _ = _admin_support_bulk_filter_query(db, narrow, archived_mode="exclude")
    q = q.filter(SupportThread.status.in_(arch_statuses))
    return q, list(arch_statuses)


class SupportCannedReplyIn(BaseModel):
    title: str = Field(..., max_length=200)
    body: str = Field(..., max_length=SUPPORT_BODY_MAX)
    category: str | None = None
    is_active: bool = True
    sort_order: int = 0


class SupportCannedReplyPatchIn(BaseModel):
    title: str | None = Field(None, max_length=200)
    body: str | None = Field(None, max_length=SUPPORT_BODY_MAX)
    category: str | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class NotificationsReadIn(BaseModel):
    ids: list[int] | None = None
    all: bool | None = None


class SupportMarkReadIn(BaseModel):
    last_read_message_id: int | None = None


async def _support_consume_upload_attachment(upload) -> tuple[bytes, str, str | None]:
    """Read attachment (image, .log, .json) with 2 MiB cap."""
    raw_ct = (getattr(upload, "content_type", None) or "").split(";")[0].strip().lower()
    orig = getattr(upload, "filename", None)
    orig_l = (orig or "").lower()
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(65536)
        if not chunk:
            break
        total += len(chunk)
        if total > SUPPORT_IMAGE_MAX_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"File too large (max {SUPPORT_IMAGE_MAX_BYTES // (1024 * 1024)} MB)",
            )
        chunks.append(chunk)
    data = b"".join(chunks)
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    mime = raw_ct
    if mime not in SUPPORT_FILE_ALLOWED_MIME:
        if data[:3] == b"\xff\xd8\xff":
            mime = "image/jpeg"
        elif len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
            mime = "image/png"
        elif len(data) >= 6 and data[:6] in (b"GIF87a", b"GIF89a"):
            mime = "image/gif"
        elif len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            mime = "image/webp"
        elif orig_l.endswith(".json") or (data[:1:2] == b"{" or data[:1:2] == b"["):
            mime = "application/json"
        elif orig_l.endswith((".log", ".txt")) or all(32 <= b < 127 or b in (9, 10, 13) for b in data[:512]):
            mime = "text/plain"
        else:
            raise HTTPException(
                status_code=400,
                detail="Allowed: JPEG, PNG, GIF, WebP, .txt, .log, or .json (max 2 MB)",
            )
    if mime not in SUPPORT_FILE_ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail="Allowed: JPEG, PNG, GIF, WebP, .txt, .log, or .json (max 2 MB)",
        )
    return data, mime, orig


async def _support_consume_upload_image(upload) -> tuple[bytes, str, str | None]:
    """Backward-compatible alias — images only."""
    data, mime, orig = await _support_consume_upload_attachment(upload)
    if mime not in SUPPORT_IMAGE_ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, GIF, or WebP images are allowed")
    return data, mime, orig


def _support_ext_for_mime(mime: str) -> str:
    return {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "text/plain": ".txt",
        "application/json": ".json",
        "text/json": ".json",
    }.get(mime, ".bin")


def _support_write_attachment_file(data: bytes, mime: str) -> str:
    ext = _support_ext_for_mime(mime)
    stored = secrets.token_urlsafe(18).replace("-", "")[:24] + ext
    path = SUPPORT_UPLOAD_DIR / stored
    path.write_bytes(data)
    return stored


def _support_write_image_file(data: bytes, mime: str) -> str:
    return _support_write_attachment_file(data, mime)


def _support_add_attachment(
    db,
    message_id: int,
    user_id: int,
    data: bytes,
    mime: str,
    orig_name: str | None,
) -> SupportAttachment:
    stored = _support_write_image_file(data, mime)
    on = (orig_name or "").strip()[:250] or None
    att = SupportAttachment(
        message_id=message_id,
        user_id=user_id,
        stored_name=stored,
        original_name=on,
        mime_type=mime,
        size_bytes=len(data),
    )
    db.add(att)
    return att


def _support_msg_dict(db, m: SupportMessage) -> dict:
    sender = db.query(User).filter(User.id == m.sender_user_id).first()
    att = db.query(SupportAttachment).filter(SupportAttachment.message_id == m.id).first()
    attachment = None
    if att:
        attachment = {
            "id": att.id,
            "url": f"/api/support/attachments/{att.id}/file",
            "mime_type": att.mime_type,
            "original_name": att.original_name,
        }
    return {
        "id": m.id,
        "thread_id": m.thread_id,
        "sender_user_id": m.sender_user_id,
        "sender_name": (sender.name if sender else None),
        "sender_email": (sender.email if sender else None),
        "body": m.body,
        "is_internal": bool(getattr(m, "is_internal", False)),
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "attachment": attachment,
    }


def _support_read_watermarks(db, thread: SupportThread) -> tuple[int, int]:
    """(requester_read_upto, staff_read_upto) — max message id seen by requester / any admin."""
    rows = db.query(SupportThreadRead).filter(SupportThreadRead.thread_id == thread.id).all()
    owner = int(thread.user_id)
    requester_upto = 0
    staff_upto = 0
    for r in rows:
        mid = int(r.last_read_message_id or 0)
        uid = int(r.user_id)
        if uid == owner:
            requester_upto = max(requester_upto, mid)
            continue
        u = db.query(User).filter(User.id == uid).first()
        if u and u.role == "admin":
            staff_upto = max(staff_upto, mid)
    return requester_upto, staff_upto


def _support_msg_dict_with_read(
    db,
    m: SupportMessage,
    thread: SupportThread,
    requester_upto: int,
    staff_upto: int,
) -> dict:
    d = _support_msg_dict(db, m)
    owner = int(thread.user_id)
    sid = int(m.sender_user_id)
    if sid == owner:
        d["read_by_counterparty"] = staff_upto >= m.id
    else:
        d["read_by_counterparty"] = requester_upto >= m.id
    return d


def _support_user_detail_dict(db, u: User, *, admin_style: bool) -> dict:
    d = _user_public_dict(u, db)
    if not admin_style:
        return d
    sess_row = (
        db.query(
            func.count(UserSession.id).label("cnt"),
            func.max(UserSession.last_active_at).label("last_active"),
        )
        .filter(UserSession.user_id == u.id)
        .first()
    )
    d["session_count"] = int(sess_row.cnt or 0) if sess_row else 0
    la = sess_row.last_active if sess_row else None
    d["last_active_at"] = la.isoformat() if la else None
    tc = (
        db.query(func.count(TradingSession.id))
        .filter(TradingSession.user_id == u.id)
        .scalar()
    )
    d["trading_sessions_count"] = int(tc or 0)
    now = datetime.utcnow()
    expired = u.access_expires_at and u.access_expires_at < now
    d["account_status"] = "banned" if not u.is_active else ("expired" if expired else "active")
    d["stripe_customer_id"] = getattr(u, "stripe_customer_id", None)
    return d


def _support_last_public_message(db, thread_id: int) -> SupportMessage | None:
    return (
        db.query(SupportMessage)
        .filter(SupportMessage.thread_id == thread_id, SupportMessage.is_internal == False)
        .order_by(SupportMessage.id.desc())
        .first()
    )


def _support_needs_staff_reply(db, t: SupportThread) -> bool:
    if t.status not in ("open", "pending", "user_replied"):
        return False
    last = _support_last_public_message(db, t.id)
    return bool(last and int(last.sender_user_id) == int(t.user_id))


def _support_staff_unread(db, t: SupportThread, staff_upto: int) -> bool:
    if t.status not in ("open", "pending", "user_replied"):
        return False
    last = _support_last_public_message(db, t.id)
    return bool(
        last
        and int(last.sender_user_id) == int(t.user_id)
        and int(staff_upto) < int(last.id)
    )


def _support_format_structured_body(cat: str, structured: dict | None) -> str:
    if not structured or not isinstance(structured, dict):
        return ""
    lines: list[str] = []
    if cat == "modifications":
        for key, label in (
            ("change_summary", "What should change"),
            ("current_behavior", "Current behavior"),
            ("expected_behavior", "Expected behavior"),
        ):
            val = str(structured.get(key) or "").strip()
            if val:
                lines.append(f"{label}:\n{val}")
    elif cat == "suggestions":
        for key, label in (
            ("feature_summary", "Feature / idea"),
            ("use_case", "Use case"),
            ("priority_note", "Why it matters"),
        ):
            val = str(structured.get(key) or "").strip()
            if val:
                lines.append(f"{label}:\n{val}")
    if not lines:
        return ""
    return "---\n" + "\n\n".join(lines) + "\n---\n\n"


def _support_thread_dict(
    db,
    t: SupportThread,
    last_preview: str | None = None,
    *,
    viewer: User | None = None,
) -> dict:
    u = db.query(User).filter(User.id == t.user_id).first()
    assignee = None
    aid = getattr(t, "assigned_to_user_id", None)
    if aid:
        a = db.query(User).filter(User.id == aid).first()
        if a:
            assignee = {"id": a.id, "name": a.name, "email": a.email}
    now = datetime.utcnow()
    req_upto, stf_upto = _support_read_watermarks(db, t)
    extra = _support_load_ticket_extra(t)
    tags = _support_load_tags(t)
    rel_id = getattr(t, "related_thread_id", None)
    rel_ref = _support_ticket_ref(rel_id) if rel_id else None
    d = {
        "id": t.id,
        "ticket_ref": _support_ticket_ref(t.id),
        "user_id": t.user_id,
        "user_name": u.name if u else None,
        "user_email": u.email if u else None,
        "subject": t.subject,
        "category": t.category,
        "status": t.status,
        "priority": getattr(t, "priority", None) or "normal",
        "assigned_to_user_id": aid,
        "assignee": assignee,
        "first_response_due_at": t.first_response_due_at.isoformat() if t.first_response_due_at else None,
        "first_responded_at": t.first_responded_at.isoformat() if t.first_responded_at else None,
        "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
        "closed_at": t.closed_at.isoformat() if t.closed_at else None,
        "archived_at": t.archived_at.isoformat() if getattr(t, "archived_at", None) else None,
        "sla_overdue": _support_thread_sla_overdue(t, now),
        "sla_label": _support_sla_status_label(t, now),
        "sla_business_hours": SUPPORT_SLA_BUSINESS_HOURS,
        "needs_staff_reply": _support_needs_staff_reply(db, t),
        "staff_unread": _support_staff_unread(db, t, stf_upto),
        "tags": tags,
        "context": extra.get("context") if isinstance(extra.get("context"), dict) else None,
        "structured": extra.get("structured") if isinstance(extra.get("structured"), dict) else None,
        "related_thread_id": rel_id,
        "related_ticket_ref": rel_ref,
        "csat_rating": getattr(t, "csat_rating", None),
        "csat_comment": getattr(t, "csat_comment", None),
        "csat_at": t.csat_at.isoformat() if getattr(t, "csat_at", None) else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        "last_message_at": t.last_message_at.isoformat() if t.last_message_at else None,
        "last_message_preview": last_preview,
    }
    if viewer and getattr(viewer, "role", None) == "admin":
        d["admin_yes_no"] = getattr(t, "admin_yes_no", None)
        d["requester_read_upto"] = req_upto
        d["staff_read_upto"] = stf_upto
    return d


def _notify_support_recipients(db, thread: SupportThread, msg: SupportMessage, sender: User) -> list[int]:
    if bool(getattr(msg, "is_internal", False)):
        return []
    preview = (msg.body or "")[:200]
    recipients: list[int] = []
    if sender.role == "admin":
        n = Notification(
            user_id=thread.user_id,
            type="support_message",
            thread_id=thread.id,
            message_id=msg.id,
            title="Reply from support",
            body=preview,
        )
        db.add(n)
        recipients.append(int(thread.user_id))
    else:
        admins = db.query(User).filter(User.role == "admin", User.is_active == True).all()
        subj = (thread.subject or "")[:80]
        for a in admins:
            if a.id == sender.id:
                continue
            db.add(
                Notification(
                    user_id=a.id,
                    type="support_message",
                    thread_id=thread.id,
                    message_id=msg.id,
                    title=f"Support: {subj}",
                    body=preview,
                )
            )
            recipients.append(int(a.id))
    return recipients


def _support_esc_html(s: str) -> str:
    import html as _html

    return _html.escape(s or "", quote=True)


def _support_email_html(message: str, link_url: str, link_label: str) -> str:
    safe_msg = _support_esc_html(message) if "<" not in (message or "") else message
    safe_url = _support_esc_html(link_url)
    safe_label = _support_esc_html(link_label)
    return (
        f"<p>{safe_msg}</p>"
        f'<p><a href="{safe_url}" style="color:#2563eb">{safe_label}</a></p>'
        "<p style=\"color:#666;font-size:12px\">— Talaria Support</p>"
    )


def _send_support_ticket_email_sync(to_addr: str, subject: str, html_body: str) -> None:
    try:
        _run_bulk_smtp_session([to_addr.strip().lower()], subject[:500], html_body)
    except Exception as exc:
        print(f"[support-email] failed to {to_addr}: {exc}", flush=True)


def _schedule_support_ticket_email(to_addr: str, subject: str, html_body: str) -> None:
    addr = (to_addr or "").strip()
    if not addr:
        return
    threading.Thread(
        target=_send_support_ticket_email_sync,
        args=(addr, subject, html_body),
        daemon=True,
        name="support-ticket-email",
    ).start()


def _support_admin_on_public_reply(db, t: SupportThread, admin_user: User, now: datetime) -> None:
    if not t.first_responded_at:
        t.first_responded_at = now
    if t.status == "open":
        t.status = "pending"
    t.updated_at = now


def _support_email_user_on_admin_reply(db, t: SupportThread, body_preview: str) -> None:
    requester = db.query(User).filter(User.id == t.user_id).first()
    if not requester or not requester.email:
        return
    ref = _support_ticket_ref(t.id)
    _schedule_support_ticket_email(
        requester.email,
        f"New reply on ticket {ref}",
        _support_email_html(
            f"Support replied on <strong>{_support_esc_html(t.subject)}</strong>: "
            f"{_support_esc_html((body_preview or '')[:300])}",
            _support_ticket_url(t.id),
            "View ticket",
        ),
    )


def _support_email_user_on_status(db, t: SupportThread, status_label: str) -> None:
    requester = db.query(User).filter(User.id == t.user_id).first()
    if not requester or not requester.email:
        return
    ref = _support_ticket_ref(t.id)
    _schedule_support_ticket_email(
        requester.email,
        f"Ticket {ref} {status_label}",
        _support_email_html(
            f"Your ticket <strong>{_support_esc_html(t.subject)}</strong> was marked <strong>{status_label}</strong>.",
            _support_ticket_url(t.id),
            "View ticket",
        ),
    )


def _support_parse_json_field(raw, field_name: str) -> dict | list | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail=f"Invalid {field_name} JSON")
    return None


@app.post("/api/support/threads")
async def support_create_thread(request: Request):
    user = _require_user(request)
    file_tuple: tuple[bytes, str, str | None] | None = None
    tags_in: list[str] | None = None
    context_in: dict | None = None
    structured_in: dict | None = None
    ct = (request.headers.get("content-type") or "").lower()
    if "multipart/form-data" in ct:
        form = await request.form()
        subj = (form.get("subject") or "").strip()
        cat = (form.get("category") or "other").strip().lower()
        body_raw = (form.get("body") or "").strip()
        tags_raw = form.get("tags")
        if tags_raw:
            tags_in = [x.strip() for x in str(tags_raw).split(",") if x.strip()]
        context_in = _support_parse_json_field(form.get("context"), "context")
        structured_in = _support_parse_json_field(form.get("structured"), "structured")
        up = form.get("file")
        if up is not None and hasattr(up, "read"):
            file_tuple = await _support_consume_upload_attachment(up)
        body = body_raw
        if not body and file_tuple:
            body = "[Attachment]"
        elif not body and not file_tuple:
            raise HTTPException(status_code=400, detail="Message text or a file is required")
    else:
        try:
            raw = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        payload = SupportCreateThreadIn(**raw)
        cat = (payload.category or "other").strip().lower()
        subj = payload.subject.strip()
        body = payload.body.strip()
        tags_in = payload.tags
        context_in = payload.context
        structured_in = payload.structured
        if not body:
            raise HTTPException(status_code=400, detail="Message is required")

    cat = _support_validate_category(cat)
    if not subj:
        raise HTTPException(status_code=400, detail="Subject is required")
    structured_block = _support_format_structured_body(cat, structured_in if isinstance(structured_in, dict) else None)
    body = (structured_block + body.strip())[:SUPPORT_BODY_MAX]
    tags_valid = _support_validate_tags(tags_in)
    if not _support_rate_exempt(user) and not _support_category_rate_unlimited(cat):
        uid = int(user.id)
        if not _support_rate_allow_new_thread(uid):
            raise HTTPException(
                status_code=429,
                detail=f"Too many new conversations. Limit: {SUPPORT_RATE_THREAD_PER_HOUR} per hour. Try again later.",
            )
        if not _support_rate_allow_message(uid):
            raise HTTPException(
                status_code=429,
                detail=f"Too many messages. Limit: {SUPPORT_RATE_MSG_PER_MINUTE} per minute. Wait briefly and try again.",
            )
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        assignee_id = _support_default_assignee_id(db, cat)
        extra: dict = {}
        if isinstance(context_in, dict) and context_in:
            extra["context"] = {str(k)[:64]: str(v)[:500] for k, v in list(context_in.items())[:20]}
        if isinstance(structured_in, dict) and structured_in:
            extra["structured"] = {
                str(k)[:64]: str(v)[:2000] for k, v in list(structured_in.items())[:12]
            }
        t = SupportThread(
            user_id=user.id,
            subject=subj[: SUPPORT_SUBJECT_MAX],
            category=cat,
            status="open",
            priority=_support_priority_for_category(cat),
            assigned_to_user_id=assignee_id,
            first_response_due_at=_support_sla_due_at(now),
            last_message_at=now,
            tags_json=json.dumps(tags_valid) if tags_valid else None,
        )
        if extra:
            _support_set_ticket_extra(t, extra)
        db.add(t)
        db.commit()
        db.refresh(t)
        m = SupportMessage(thread_id=t.id, sender_user_id=user.id, body=body, is_internal=False)
        db.add(m)
        db.commit()
        db.refresh(m)
        if file_tuple:
            data, mime, orig = file_tuple
            _support_add_attachment(db, m.id, int(user.id), data, mime, orig)
            db.commit()
        recipients = _notify_support_recipients(db, t, m, user)
        db.commit()
        req_upto, stf_upto = _support_read_watermarks(db, t)
        msg_dict = _support_msg_dict_with_read(db, m, t, req_upto, stf_upto)
        await support_ws_manager.broadcast(
            t.id,
            {"type": "message", "thread_id": t.id, "message": msg_dict},
        )
        await _push_inbox_notification_pings(recipients, t.id, m.id)
        preview = body[:160] if len(body) > 160 else body
        requester = db.query(User).filter(User.id == t.user_id).first()
        if requester and requester.email:
            _schedule_support_ticket_email(
                requester.email,
                f"Ticket {_support_ticket_ref(t.id)} received",
                _support_email_html(
                    f"We received your support request: <strong>{_support_esc_html(t.subject)}</strong>",
                    _support_ticket_url(t.id),
                    "View your ticket",
                ),
            )
        return {
            "thread": _support_thread_dict(db, t, last_preview=preview, viewer=user),
            "message": msg_dict,
        }
    finally:
        db.close()


@app.post("/api/support/threads/{thread_id}/csat")
async def support_submit_csat(thread_id: int, payload: SupportCsatIn, request: Request):
    user = _require_user(request)
    db = SessionLocal()
    try:
        t = db.query(SupportThread).filter(SupportThread.id == thread_id).first()
        t = _support_require_thread_access(user, t)
        if int(t.user_id) != int(user.id):
            raise HTTPException(status_code=403, detail="Forbidden")
        if t.status not in ("resolved", "closed"):
            raise HTTPException(status_code=400, detail="CSAT is available after the ticket is resolved")
        if getattr(t, "csat_rating", None) is not None:
            raise HTTPException(status_code=400, detail="Feedback already submitted")
        now = datetime.utcnow()
        t.csat_rating = int(payload.rating)
        t.csat_comment = (payload.comment or "").strip()[:1000] or None
        t.csat_at = now
        t.updated_at = now
        db.commit()
        db.refresh(t)
        return {"thread": _support_thread_dict(db, t, viewer=user)}
    finally:
        db.close()


@app.get("/api/support/threads/export")
async def support_export_my_threads(request: Request):
    """Download JSON list of tickets visible to the signed-in user (for admin import)."""
    user = _require_user(request)
    db = SessionLocal()
    try:
        _support_heal_archived_active_tickets(db)
        rows = (
            _support_exclude_archived(db.query(SupportThread).filter(SupportThread.user_id == user.id))
            .order_by(nulls_last(SupportThread.last_message_at.desc()), SupportThread.id.desc())
            .limit(5000)
            .all()
        )
        payload = {
            "format": "talaria-support-export",
            "version": 1,
            "exported_at": datetime.utcnow().isoformat() + "Z",
            "user": {"id": int(user.id), "email": user.email, "name": user.name},
            "thread_count": len(rows),
            "threads": [_support_user_export_thread_row(db, t) for t in rows],
        }
        fname = f"talaria-tickets-u{user.id}-{datetime.utcnow().strftime('%Y%m%d')}.json"
        body = json.dumps(payload, indent=2)
        return Response(
            content=body,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    finally:
        db.close()


@app.get("/api/support/threads/{thread_id}")
async def support_get_thread(thread_id: int, request: Request):
    """Thread metadata + requester profile (admin gets full CRM-style fields)."""
    user = _require_user(request)
    db = SessionLocal()
    try:
        t = db.query(SupportThread).filter(SupportThread.id == thread_id).first()
        t = _support_require_thread_access(user, t)
        req_upto, stf_upto = _support_read_watermarks(db, t)
        requester = db.query(User).filter(User.id == t.user_id).first()
        requester_detail = None
        if requester:
            if user.role == "admin":
                requester_detail = _support_user_detail_dict(db, requester, admin_style=True)
            elif int(user.id) == int(t.user_id):
                requester_detail = _support_user_detail_dict(db, requester, admin_style=False)
        th_dict = _support_thread_dict(db, t, viewer=user)
        return {
            "thread": th_dict,
            "requester": requester_detail,
            "read_state": {
                "requester_read_upto": req_upto,
                "staff_read_upto": stf_upto,
            },
        }
    finally:
        db.close()


@app.get("/api/support/attachments/{attachment_id}/file")
async def support_download_attachment(attachment_id: int, request: Request):
    user = _require_user(request)
    db = SessionLocal()
    try:
        att = db.query(SupportAttachment).filter(SupportAttachment.id == attachment_id).first()
        if not att:
            raise HTTPException(status_code=404, detail="Not found")
        msg = db.query(SupportMessage).filter(SupportMessage.id == att.message_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="Not found")
        t = db.query(SupportThread).filter(SupportThread.id == msg.thread_id).first()
        t = _support_require_thread_access(user, t)
        path = SUPPORT_UPLOAD_DIR / att.stored_name
        if not path.is_file():
            raise HTTPException(status_code=404, detail="File missing")
        fname = att.original_name or "attachment.jpg"
        # inline so browsers show a full-size preview instead of forcing download
        return FileResponse(
            path,
            media_type=att.mime_type,
            filename=fname,
            content_disposition_type="inline",
        )
    finally:
        db.close()


@app.get("/api/support/threads")
async def support_list_threads(
    request: Request,
    status: str | None = None,
    q: str | None = None,
):
    user = _require_user(request)
    db = SessionLocal()
    try:
        _support_heal_archived_active_tickets(db)
        query = db.query(SupportThread)
        if user.role != "admin":
            query = _support_exclude_archived(query.filter(SupportThread.user_id == user.id))
        else:
            if status and status in SUPPORT_STATUSES:
                query = query.filter(SupportThread.status == status)
            if q and q.strip():
                like = f"%{q.strip()}%"
                query = query.filter(SupportThread.subject.ilike(like))
        total = query.count()
        rows = (
            query.order_by(nulls_last(SupportThread.last_message_at.desc()), SupportThread.id.desc())
            .limit(5000)
            .all()
        )
        out = []
        for t in rows:
            last = (
                db.query(SupportMessage)
                .filter(SupportMessage.thread_id == t.id)
                .order_by(SupportMessage.id.desc())
                .first()
            )
            preview = (last.body[:160] + "…") if last and len(last.body or "") > 160 else (last.body if last else None)
            out.append(_support_thread_dict(db, t, last_preview=preview, viewer=user))
        return {"threads": out, "total": total}
    finally:
        db.close()


@app.get("/api/support/threads/{thread_id}/messages")
async def support_list_messages(
    thread_id: int,
    request: Request,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    user = _require_user(request)
    db = SessionLocal()
    try:
        t = db.query(SupportThread).filter(SupportThread.id == thread_id).first()
        t = _support_require_thread_access(user, t)
        msg_q = db.query(SupportMessage).filter(SupportMessage.thread_id == thread_id)
        if user.role != "admin":
            msg_q = msg_q.filter(SupportMessage.is_internal == False)
        total = msg_q.count()
        msgs = (
            msg_q.order_by(SupportMessage.id.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        req_upto, stf_upto = _support_read_watermarks(db, t)
        return {
            "messages": [_support_msg_dict_with_read(db, m, t, req_upto, stf_upto) for m in msgs],
            "total": total,
            "read_state": {
                "requester_read_upto": req_upto,
                "staff_read_upto": stf_upto,
            },
        }
    finally:
        db.close()


@app.post("/api/support/threads/{thread_id}/messages")
async def support_post_message(thread_id: int, request: Request):
    user = _require_user(request)
    file_tuple: tuple[bytes, str, str | None] | None = None
    ct = (request.headers.get("content-type") or "").lower()
    if "multipart/form-data" in ct:
        form = await request.form()
        body_raw = (form.get("body") or "").strip()
        up = form.get("file")
        if up is not None and hasattr(up, "read"):
            file_tuple = await _support_consume_upload_attachment(up)
        body = body_raw
        if not body and file_tuple:
            body = "[Attachment]"
        elif not body and not file_tuple:
            raise HTTPException(status_code=400, detail="Message text or a file is required")
    else:
        try:
            raw = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        payload = SupportAppendMessageIn(**raw)
        body = payload.body.strip()
        if not body:
            raise HTTPException(status_code=400, detail="Message is required")
    body = body.strip()[:SUPPORT_BODY_MAX]
    db = SessionLocal()
    try:
        t = db.query(SupportThread).filter(SupportThread.id == thread_id).first()
        t = _support_require_thread_access(user, t)
        if not _support_rate_exempt(user) and not _support_category_rate_unlimited(t.category):
            if not _support_rate_allow_message(int(user.id)):
                raise HTTPException(
                    status_code=429,
                    detail=f"Too many messages. Limit: {SUPPORT_RATE_MSG_PER_MINUTE} per minute. Wait briefly and try again.",
                )
        if t.status == "closed":
            raise HTTPException(status_code=400, detail="Ticket is closed")
        now = datetime.utcnow()
        if t.status == "resolved" and user.role != "admin":
            t.status = "user_replied"
            t.updated_at = now
        if user.role != "admin" and _support_thread_archived(t):
            t.archived_at = None
            t.updated_at = now
        m = SupportMessage(thread_id=t.id, sender_user_id=user.id, body=body, is_internal=False)
        db.add(m)
        t.last_message_at = now
        t.updated_at = now
        db.commit()
        db.refresh(m)
        if file_tuple:
            data, mime, orig = file_tuple
            _support_add_attachment(db, m.id, int(user.id), data, mime, orig)
            db.commit()
        recipients = _notify_support_recipients(db, t, m, user)
        db.commit()
        req_upto, stf_upto = _support_read_watermarks(db, t)
        msg_dict = _support_msg_dict_with_read(db, m, t, req_upto, stf_upto)
        await support_ws_manager.broadcast(
            t.id,
            {"type": "message", "thread_id": t.id, "message": msg_dict},
        )
        await _push_inbox_notification_pings(recipients, t.id, m.id)
        return {"message": msg_dict}
    finally:
        db.close()


@app.patch("/api/support/threads/{thread_id}/read")
async def support_mark_thread_read(
    thread_id: int,
    payload: SupportMarkReadIn,
    request: Request,
):
    user = _require_user(request)
    db = SessionLocal()
    try:
        t = db.query(SupportThread).filter(SupportThread.id == thread_id).first()
        t = _support_require_thread_access(user, t)
        last_msg = (
            db.query(SupportMessage)
            .filter(SupportMessage.thread_id == thread_id)
            .order_by(SupportMessage.id.desc())
            .first()
        )
        max_id = int(last_msg.id) if last_msg else 0
        target_mid = int(payload.last_read_message_id) if payload.last_read_message_id is not None else max_id
        if target_mid < 0:
            target_mid = 0
        if max_id and target_mid > max_id:
            target_mid = max_id
        row = (
            db.query(SupportThreadRead)
            .filter(SupportThreadRead.thread_id == thread_id, SupportThreadRead.user_id == user.id)
            .first()
        )
        if row:
            cur = int(row.last_read_message_id or 0)
            if target_mid > cur:
                row.last_read_message_id = target_mid
                row.updated_at = datetime.utcnow()
        else:
            db.add(
                SupportThreadRead(
                    thread_id=thread_id,
                    user_id=user.id,
                    last_read_message_id=target_mid,
                )
            )
        db.commit()
        req_upto, stf_upto = _support_read_watermarks(db, t)
        await support_ws_manager.broadcast(
            thread_id,
            {
                "type": "read_receipt",
                "thread_id": thread_id,
                "requester_read_upto": req_upto,
                "staff_read_upto": stf_upto,
            },
        )
        return {"read_state": {"requester_read_upto": req_upto, "staff_read_upto": stf_upto}}
    finally:
        db.close()


@app.patch("/api/support/threads/{thread_id}")
async def support_patch_thread(thread_id: int, payload: SupportPatchThreadIn, request: Request):
    """Legacy admin close/open — prefer /api/admin/support/threads/{id}."""
    admin_payload = SupportAdminPatchThreadIn(status=payload.status)
    return await admin_support_patch_thread(thread_id, admin_payload, request)


def _admin_support_query_threads(
    db,
    *,
    status: str | None,
    exclude_status: str | None,
    priority: str | None,
    category: str | None,
    assigned_to: int | None,
    user_id: int | None,
    q: str | None,
    sla_overdue: bool,
    needs_reply: bool,
    sort: str,
    limit: int,
    offset: int,
    include_archived: bool = False,
):
    query = db.query(SupportThread)
    if not include_archived:
        query = _support_exclude_archived(query)
    if status:
        query = query.filter(SupportThread.status == _support_validate_status(status))
    if exclude_status:
        query = query.filter(SupportThread.status != _support_validate_status(exclude_status))
    if priority:
        query = query.filter(SupportThread.priority == _support_validate_priority(priority))
    if category:
        query = query.filter(SupportThread.category == _support_validate_category(category))
    if assigned_to is not None:
        if assigned_to == 0:
            query = query.filter(SupportThread.assigned_to_user_id.is_(None))
        else:
            query = query.filter(SupportThread.assigned_to_user_id == int(assigned_to))
    if user_id is not None:
        query = query.filter(SupportThread.user_id == int(user_id))
    if q and q.strip():
        needle = f"%{q.strip()}%"
        user_ids = [
            r[0]
            for r in db.query(User.id)
            .filter((User.email.ilike(needle)) | (User.name.ilike(needle)))
            .limit(200)
            .all()
        ]
        msg_thread_ids = [
            r[0]
            for r in db.query(SupportMessage.thread_id)
            .filter(SupportMessage.body.ilike(needle), SupportMessage.is_internal == False)
            .distinct()
            .limit(500)
            .all()
        ]
        clauses = [SupportThread.subject.ilike(needle)]
        if user_ids:
            clauses.append(SupportThread.user_id.in_(user_ids))
        if msg_thread_ids:
            clauses.append(SupportThread.id.in_(msg_thread_ids))
        query = query.filter(or_(*clauses))
    if sla_overdue:
        now = datetime.utcnow()
        query = query.filter(
            SupportThread.status.in_(("open", "pending")),
            SupportThread.first_responded_at.is_(None),
            SupportThread.first_response_due_at.isnot(None),
            SupportThread.first_response_due_at < now,
        )
    if needs_reply:
        last_pub = (
            db.query(
                SupportMessage.thread_id.label("tid"),
                func.max(SupportMessage.id).label("max_id"),
            )
            .filter(SupportMessage.is_internal == False)
            .group_by(SupportMessage.thread_id)
            .subquery()
        )
        LastM = aliased(SupportMessage)
        query = (
            query.join(last_pub, SupportThread.id == last_pub.c.tid)
            .join(LastM, LastM.id == last_pub.c.max_id)
            .filter(
                SupportThread.status.in_(("open", "pending", "user_replied")),
                LastM.sender_user_id == SupportThread.user_id,
            )
        )
    total = query.count()
    sort_key = (sort or "activity").strip().lower()
    if sort_key == "sla":
        order = (
            nulls_last(SupportThread.first_response_due_at.asc()),
            SupportThread.id.desc(),
        )
    elif sort_key == "oldest":
        order = (SupportThread.created_at.asc(), SupportThread.id.asc())
    elif sort_key == "newest":
        order = (SupportThread.created_at.desc(), SupportThread.id.desc())
    else:
        order = (nulls_last(SupportThread.last_message_at.desc()), SupportThread.id.desc())
    rows = query.order_by(*order).offset(offset).limit(limit).all()
    return total, rows


@app.get("/api/admin/support/stats")
async def admin_support_stats(request: Request, user_id: int | None = None):
    _require_admin(request)
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        def base_q():
            q = _support_exclude_archived(db.query(SupportThread))
            if user_id is not None:
                q = q.filter(SupportThread.user_id == int(user_id))
            return q

        open_n = base_q().filter(SupportThread.status == "open").count()
        pending_n = base_q().filter(SupportThread.status == "pending").count()
        unassigned_n = (
            base_q()
            .filter(SupportThread.status.in_(("open", "pending")), SupportThread.assigned_to_user_id.is_(None))
            .count()
        )
        overdue_n = (
            base_q()
            .filter(
                SupportThread.status.in_(("open", "pending")),
                SupportThread.first_responded_at.is_(None),
                SupportThread.first_response_due_at.isnot(None),
                SupportThread.first_response_due_at < now,
            )
            .count()
        )
        closed_today = (
            base_q()
            .filter(SupportThread.status == "closed", SupportThread.closed_at >= today_start)
            .count()
        )
        user_replied_n = base_q().filter(SupportThread.status == "user_replied").count()
        total_active = open_n + pending_n + user_replied_n
        # Finished = staff closed or marked resolved — NOT user follow-ups (user_replied).
        finished_statuses = ("resolved", "closed")
        active_statuses = ("open", "pending", "user_replied")
        bug_error_cats = ("bug", "error")
        product_resolve_cats = bug_error_cats + ("modifications", "feature", "suggestions")

        def _resolve_pct(resolved: int, total: int) -> float:
            if not total:
                return 0.0
            if resolved >= total:
                return 100.0
            return round(resolved / total * 1000) / 10

        def category_resolve_stats(*categories: str) -> dict:
            cats = tuple(categories)
            base = base_q().filter(SupportThread.category.in_(cats))
            total = base.count()
            user_replied_n = base.filter(SupportThread.status == "user_replied").count()
            open_n = base.filter(SupportThread.status == "open").count()
            pending_n = base.filter(SupportThread.status == "pending").count()
            finished = base.filter(SupportThread.status.in_(finished_statuses)).count()
            queue_n = open_n + pending_n
            # Percentages exclude user follow-ups (user_replied) — queue = open + pending only.
            resolve_base = open_n + pending_n + finished
            resolve_pct = _resolve_pct(finished, resolve_base)
            queue_pct = _resolve_pct(queue_n, resolve_base)
            return {
                "total": total,
                "resolved": finished,
                "active": open_n + pending_n + user_replied_n,
                "user_replied": user_replied_n,
                "queue": queue_n,
                "resolve_base": resolve_base,
                "pct": resolve_pct,
                "queue_pct": queue_pct,
            }

        bug_error_stats = category_resolve_stats(*bug_error_cats)
        modifications_stats = category_resolve_stats("modifications")
        feature_stats = category_resolve_stats("feature")
        suggestions_stats = category_resolve_stats("suggestions")
        combined_stats = category_resolve_stats(*product_resolve_cats)

        bug_error_total = bug_error_stats["total"]
        bug_error_resolved = bug_error_stats["resolved"]
        resolve_pct = bug_error_stats["pct"]
        yes_n = base_q().filter(SupportThread.admin_yes_no == "yes").count()
        no_n = base_q().filter(SupportThread.admin_yes_no == "no").count()
        unset_n = base_q().filter(
            or_(SupportThread.admin_yes_no.is_(None), SupportThread.admin_yes_no == "")
        ).count()
        rated_n = yes_n + no_n
        yes_no_yes_pct = round(yes_n / rated_n * 100) if rated_n else 0
        yes_no_no_pct = round(no_n / rated_n * 100) if rated_n else 0
        by_category: dict[str, int] = {}
        by_category_pct: dict[str, int] = {}
        for cat in SUPPORT_CATEGORIES:
            n = (
                base_q()
                .filter(
                    SupportThread.category == cat,
                    SupportThread.status.in_(active_statuses),
                )
                .count()
            )
            by_category[cat] = n
            by_category_pct[cat] = round(n / total_active * 100) if total_active else 0
        requester = None
        if user_id is not None:
            u = db.query(User).filter(User.id == int(user_id)).first()
            if u:
                requester = {"id": u.id, "name": u.name, "email": u.email}
        return {
            "open": open_n,
            "pending": pending_n,
            "user_replied": user_replied_n,
            "unassigned": unassigned_n,
            "sla_overdue": overdue_n,
            "closed_today": closed_today,
            "total_active": total_active,
            "bug_error_total": bug_error_total,
            "bug_error_resolved": bug_error_resolved,
            "bug_error_active": bug_error_stats["active"],
            "bug_error_queue": bug_error_stats["queue"],
            "bug_error_queue_pct": bug_error_stats["queue_pct"],
            "bug_error_user_replied": bug_error_stats["user_replied"],
            "bug_error_resolve_base": bug_error_stats["resolve_base"],
            "resolve_pct": resolve_pct,
            "modifications_total": modifications_stats["total"],
            "modifications_resolved": modifications_stats["resolved"],
            "modifications_active": modifications_stats["active"],
            "modifications_queue": modifications_stats["queue"],
            "modifications_queue_pct": modifications_stats["queue_pct"],
            "modifications_user_replied": modifications_stats["user_replied"],
            "modifications_resolve_pct": modifications_stats["pct"],
            "feature_total": feature_stats["total"],
            "feature_resolved": feature_stats["resolved"],
            "feature_active": feature_stats["active"],
            "feature_queue": feature_stats["queue"],
            "feature_queue_pct": feature_stats["queue_pct"],
            "feature_user_replied": feature_stats["user_replied"],
            "feature_resolve_pct": feature_stats["pct"],
            "suggestions_total": suggestions_stats["total"],
            "suggestions_resolved": suggestions_stats["resolved"],
            "suggestions_active": suggestions_stats["active"],
            "suggestions_queue": suggestions_stats["queue"],
            "suggestions_queue_pct": suggestions_stats["queue_pct"],
            "suggestions_user_replied": suggestions_stats["user_replied"],
            "suggestions_resolve_pct": suggestions_stats["pct"],
            "combined_resolve_total": combined_stats["total"],
            "combined_resolve_resolved": combined_stats["resolved"],
            "combined_resolve_active": combined_stats["active"],
            "combined_resolve_queue": combined_stats["queue"],
            "combined_resolve_queue_pct": combined_stats["queue_pct"],
            "combined_resolve_user_replied": combined_stats["user_replied"],
            "combined_resolve_pct": combined_stats["pct"],
            "category_resolve": {
                "bug_error": bug_error_stats,
                "modifications": modifications_stats,
                "feature": feature_stats,
                "suggestions": suggestions_stats,
                "combined": combined_stats,
            },
            "admin_yes_no_yes": yes_n,
            "admin_yes_no_no": no_n,
            "admin_yes_no_unset": unset_n,
            "admin_yes_no_rated": rated_n,
            "admin_yes_no_yes_pct": yes_no_yes_pct,
            "admin_yes_no_no_pct": yes_no_no_pct,
            "by_category": by_category,
            "by_category_pct": by_category_pct,
            "sla_business_hours": SUPPORT_SLA_BUSINESS_HOURS,
            "requester": requester,
        }
    finally:
        db.close()


@app.post("/api/admin/support/archive-closed")
async def admin_support_archive_closed(payload: AdminArchiveClosedSupportIn, request: Request):
    """Archive finished tickets only — active (open/pending) tickets always stay visible."""
    _require_admin(request)
    if payload.all_tickets:
        raise HTTPException(
            status_code=400,
            detail="Archive cannot include open or pending tickets. Use Delete for permanent removal.",
        )
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        q, statuses = _admin_support_archive_query(db, payload)
        rows = q.order_by(SupportThread.id.asc()).all()
        preview = _admin_support_bulk_preview(rows)
        filter_summary = _admin_support_bulk_filter_summary(payload, statuses)
        if payload.dry_run:
            return {
                "success": True,
                "dry_run": True,
                "archived_count": len(rows),
                "statuses": statuses,
                "filters": filter_summary,
                "preview": preview,
            }
        archived_ids: list[int] = []
        for t in rows:
            t.archived_at = now
            t.updated_at = now
            archived_ids.append(int(t.id))
        db.commit()
        _record_admin_action(
            request,
            action="support.tickets.archive_closed",
            target_type="support_thread",
            target_id=None,
            params={
                **filter_summary,
                "archived_count": len(archived_ids),
            },
            result={"archived_thread_ids": archived_ids[:100]},
        )
        return {
            "success": True,
            "dry_run": False,
            "archived_count": len(archived_ids),
            "statuses": statuses,
            "filters": filter_summary,
            "preview": preview,
        }
    finally:
        db.close()


@app.post("/api/admin/support/unarchive")
async def admin_support_unarchive(payload: AdminSupportUnarchiveIn, request: Request):
    """Restore archived tickets to the active inbox (users can see them again)."""
    _require_admin(request)
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        if payload.all_archived:
            q = db.query(SupportThread).filter(SupportThread.archived_at.isnot(None))
            statuses = list(SUPPORT_STATUSES)
        else:
            q, statuses = _admin_support_bulk_filter_query(db, payload, archived_mode="only")
        rows = q.order_by(SupportThread.id.asc()).all()
        preview = _admin_support_bulk_preview(rows)
        filter_summary = _admin_support_bulk_filter_summary(payload, statuses)
        filter_summary["all_archived"] = payload.all_archived
        if payload.dry_run:
            return {
                "success": True,
                "dry_run": True,
                "unarchived_count": len(rows),
                "statuses": statuses,
                "filters": filter_summary,
                "preview": preview,
            }
        restored_ids: list[int] = []
        for t in rows:
            t.archived_at = None
            t.updated_at = now
            restored_ids.append(int(t.id))
        db.commit()
        _record_admin_action(
            request,
            action="support.tickets.unarchive",
            target_type="support_thread",
            target_id=None,
            params={**filter_summary, "unarchived_count": len(restored_ids)},
            result={"restored_thread_ids": restored_ids[:100]},
        )
        return {
            "success": True,
            "dry_run": False,
            "unarchived_count": len(restored_ids),
            "statuses": statuses,
            "filters": filter_summary,
            "preview": preview,
        }
    finally:
        db.close()


@app.post("/api/admin/support/delete-bulk")
async def admin_support_delete_bulk(payload: AdminSupportDeleteBulkIn, request: Request):
    """Permanently delete support tickets matching filters (messages + attachments removed)."""
    _require_admin(request)
    db = SessionLocal()
    try:
        q, statuses = _admin_support_bulk_filter_query(db, payload, archived_mode="any")
        rows = q.order_by(SupportThread.id.asc()).all()
        preview = _admin_support_bulk_preview(rows)
        filter_summary = _admin_support_bulk_filter_summary(payload, statuses)
        if payload.dry_run:
            return {
                "success": True,
                "dry_run": True,
                "deleted_count": len(rows),
                "statuses": statuses,
                "filters": filter_summary,
                "preview": preview,
            }
        deleted_count = _admin_support_delete_threads(db, rows)
        db.commit()
        _record_admin_action(
            request,
            action="support.tickets.delete_bulk",
            target_type="support_thread",
            target_id=None,
            params={**filter_summary, "deleted_count": deleted_count},
            result={"deleted_thread_ids": [t.id for t in rows[:100]]},
        )
        return {
            "success": True,
            "dry_run": False,
            "deleted_count": deleted_count,
            "statuses": statuses,
            "filters": filter_summary,
            "preview": preview,
        }
    finally:
        db.close()


@app.get("/api/admin/support/user-ticket-audit")
async def admin_support_user_ticket_audit(request: Request, user_id: int | None = None):
    """Compare user-visible tickets vs archived; list tickets that need import (unarchive)."""
    _require_admin(request)
    db = SessionLocal()
    try:
        healed = _support_heal_archived_active_tickets(db)
        user_visible_q = _support_exclude_archived(db.query(SupportThread))
        archived_q = db.query(SupportThread).filter(SupportThread.archived_at.isnot(None))
        import_q = _support_import_candidates_query(db, user_id)
        if user_id is not None:
            user_visible_q = user_visible_q.filter(SupportThread.user_id == int(user_id))
            archived_q = archived_q.filter(SupportThread.user_id == int(user_id))
        user_visible_total = user_visible_q.count()
        archived_total = archived_q.count()
        import_rows = import_q.order_by(SupportThread.last_message_at.desc().nullslast(), SupportThread.id.desc()).limit(500).all()
        import_count = import_q.count()
        by_user_rows = (
            db.query(
                User.id,
                User.name,
                User.email,
                func.sum(case((SupportThread.archived_at.is_(None), 1), else_=0)).label("visible_count"),
                func.sum(case((SupportThread.archived_at.isnot(None), 1), else_=0)).label("archived_count"),
            )
            .join(SupportThread, SupportThread.user_id == User.id)
            .group_by(User.id, User.name, User.email)
            .order_by(func.sum(case((SupportThread.archived_at.is_(None), 1), else_=0)).desc())
        )
        if user_id is not None:
            by_user_rows = by_user_rows.filter(User.id == int(user_id))
        by_user = []
        for r in by_user_rows.limit(200).all():
            uid = int(r.id)
            need_import = _support_import_candidates_query(db, uid).count()
            by_user.append(
                {
                    "user_id": uid,
                    "name": r.name,
                    "email": r.email,
                    "visible_count": int(r.visible_count or 0),
                    "archived_count": int(r.archived_count or 0),
                    "import_needed": need_import,
                }
            )
        return {
            "success": True,
            "healed_active_on_load": healed,
            "user_visible_total": user_visible_total,
            "archived_total": archived_total,
            "import_needed_count": import_count,
            "import_candidates": [_support_import_preview_row(db, t) for t in import_rows],
            "by_user": by_user,
            "user_id_filter": user_id,
        }
    finally:
        db.close()


@app.post("/api/admin/support/import-user-tickets")
async def admin_support_import_user_tickets(payload: AdminSupportImportUserTicketsIn, request: Request):
    """Restore archived tickets back to admin + user inbox (clear archived_at)."""
    _require_admin(request)
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        rows = _support_import_candidates_query(db, payload.user_id).order_by(SupportThread.id.asc()).all()
        preview = [_support_import_preview_row(db, t) for t in rows[:100]]
        if payload.dry_run:
            return {
                "success": True,
                "dry_run": True,
                "imported_count": len(rows),
                "preview": preview,
            }
        restored_ids: list[int] = []
        for t in rows:
            t.archived_at = None
            t.updated_at = now
            restored_ids.append(int(t.id))
        db.commit()
        _record_admin_action(
            request,
            action="support.tickets.import_user_visible",
            target_type="support_thread",
            target_id=None,
            params={"user_id": payload.user_id, "imported_count": len(restored_ids)},
            result={"restored_thread_ids": restored_ids[:100]},
        )
        return {
            "success": True,
            "dry_run": False,
            "imported_count": len(restored_ids),
            "preview": preview,
        }
    finally:
        db.close()


@app.post("/api/admin/support/import-from-export")
async def admin_support_import_from_export(request: Request):
    """Restore tickets listed in a user-export JSON file (clears archived_at)."""
    _require_admin(request)
    ct = (request.headers.get("content-type") or "").lower()
    dry_run = False
    export_payload: dict | None = None
    if "multipart/form-data" in ct:
        form = await request.form()
        dry_run = str(form.get("dry_run") or "").lower() in ("1", "true", "yes", "on")
        up = form.get("file")
        if up is None or not hasattr(up, "read"):
            raise HTTPException(status_code=400, detail="Upload a JSON export file from the user support page")
        raw = await up.read()
        try:
            export_payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=400, detail="Invalid JSON export file") from exc
    else:
        try:
            raw = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid JSON body") from exc
        body = AdminSupportImportExportIn(**raw)
        dry_run = bool(body.dry_run)
        export_payload = body.export
    if not isinstance(export_payload, dict):
        raise HTTPException(status_code=400, detail="Export payload must be a JSON object")
    if export_payload.get("format") and export_payload.get("format") != "talaria-support-export":
        raise HTTPException(status_code=400, detail="Unrecognized export format")
    thread_ids, meta = _support_import_ids_from_export(export_payload)
    if not thread_ids:
        raise HTTPException(status_code=400, detail="No ticket ids found in export file")
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        restored: list[dict] = []
        not_found: list[int] = []
        wrong_user: list[dict] = []
        export_user_id = meta.get("export_user_id")
        for tid in thread_ids:
            t = db.query(SupportThread).filter(SupportThread.id == int(tid)).first()
            if not t:
                not_found.append(int(tid))
                continue
            if export_user_id is not None and int(t.user_id) != int(export_user_id):
                wrong_user.append(
                    {
                        "id": int(t.id),
                        "ticket_ref": _support_ticket_ref(t.id),
                        "expected_user_id": int(export_user_id),
                        "actual_user_id": int(t.user_id),
                    }
                )
                continue
            was_archived = _support_thread_archived(t)
            if not dry_run:
                t.archived_at = None
                t.updated_at = now
            restored.append(
                {
                    "id": int(t.id),
                    "ticket_ref": _support_ticket_ref(t.id),
                    "subject": (t.subject or "")[:120],
                    "status": t.status,
                    "was_archived": was_archived,
                }
            )
        if not dry_run and restored:
            db.commit()
            _record_admin_action(
                request,
                action="support.tickets.import_from_export",
                target_type="support_thread",
                target_id=None,
                params={
                    "export_user_id": export_user_id,
                    "export_user_email": meta.get("export_user_email"),
                    "imported_count": len(restored),
                },
                result={"restored_thread_ids": [r["id"] for r in restored[:100]]},
            )
        return {
            "success": True,
            "dry_run": dry_run,
            "imported_count": len(restored),
            "not_found_count": len(not_found),
            "not_found_ids": not_found[:50],
            "wrong_user_count": len(wrong_user),
            "wrong_user": wrong_user[:20],
            "export_user_email": meta.get("export_user_email"),
            "preview": restored[:100],
        }
    finally:
        db.close()


@app.get("/api/admin/support/export")
async def admin_support_export(
    request: Request,
    category: str | None = None,
    status: str | None = None,
):
    """CSV export for product backlog (e.g. suggestions)."""
    _require_admin(request)
    db = SessionLocal()
    try:
        query = _support_exclude_archived(db.query(SupportThread))
        if category:
            query = query.filter(SupportThread.category == _support_validate_category(category))
        if status:
            query = query.filter(SupportThread.status == _support_validate_status(status))
        rows = query.order_by(SupportThread.created_at.desc()).limit(5000).all()
        import io

        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(
            [
                "ticket_ref",
                "id",
                "subject",
                "category",
                "status",
                "priority",
                "user_email",
                "created_at",
                "last_message_at",
                "csat_rating",
                "tags",
                "url",
            ]
        )
        for t in rows:
            u = db.query(User).filter(User.id == t.user_id).first()
            w.writerow(
                [
                    _support_ticket_ref(t.id),
                    t.id,
                    (t.subject or "")[:500],
                    t.category,
                    t.status,
                    t.priority,
                    u.email if u else "",
                    t.created_at.isoformat() if t.created_at else "",
                    t.last_message_at.isoformat() if t.last_message_at else "",
                    getattr(t, "csat_rating", None) or "",
                    ",".join(_support_load_tags(t)),
                    _support_ticket_url(t.id),
                ]
            )
        body = buf.getvalue()
        fname = f"support-export-{category or 'all'}-{datetime.utcnow().strftime('%Y%m%d')}.csv"
        return Response(
            content=body,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    finally:
        db.close()


@app.get("/api/admin/support/agents")
async def admin_support_agents(request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        rows = db.query(User).filter(User.role == "admin", User.is_active == True).order_by(User.name).all()
        return {
            "agents": [
                {"id": u.id, "name": u.name, "email": u.email}
                for u in rows
            ]
        }
    finally:
        db.close()


@app.get("/api/admin/support/requesters")
async def admin_support_requesters(request: Request):
    """Distinct users who have submitted support tickets (for inbox filter)."""
    _require_admin(request)
    db = SessionLocal()
    try:
        rows = (
            db.query(
                User.id,
                User.name,
                User.email,
                func.count(SupportThread.id).label("ticket_count"),
            )
            .join(SupportThread, SupportThread.user_id == User.id)
            .group_by(User.id, User.name, User.email)
            .order_by(func.count(SupportThread.id).desc(), User.name.asc(), User.email.asc())
            .limit(1000)
            .all()
        )
        return {
            "requesters": [
                {
                    "id": r.id,
                    "name": r.name,
                    "email": r.email,
                    "ticket_count": int(r.ticket_count or 0),
                }
                for r in rows
            ]
        }
    finally:
        db.close()


@app.get("/api/admin/support/threads")
async def admin_support_list_threads(
    request: Request,
    status: str | None = None,
    exclude_status: str | None = None,
    priority: str | None = None,
    category: str | None = None,
    assigned_to: int | None = None,
    assigned_to_me: bool = False,
    user_id: int | None = None,
    needs_reply: bool = False,
    sort: str = "activity",
    q: str | None = None,
    sla_overdue: bool = False,
    include_archived: bool = True,
    limit: int = Query(2000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    admin = _require_admin(request)
    db = SessionLocal()
    try:
        _support_heal_archived_active_tickets(db)
        assignee_filter = assigned_to
        if assigned_to_me:
            assignee_filter = int(admin.id)
        total, rows = _admin_support_query_threads(
            db,
            status=status,
            exclude_status=exclude_status,
            priority=priority,
            category=category,
            assigned_to=assignee_filter,
            user_id=user_id,
            q=q,
            sla_overdue=sla_overdue,
            needs_reply=needs_reply,
            sort=sort,
            limit=limit,
            offset=offset,
            include_archived=include_archived,
        )
        out = []
        for t in rows:
            last = (
                db.query(SupportMessage)
                .filter(SupportMessage.thread_id == t.id, SupportMessage.is_internal == False)
                .order_by(SupportMessage.id.desc())
                .first()
            )
            preview = (last.body[:160] + "…") if last and len(last.body or "") > 160 else (last.body if last else None)
            out.append(_support_thread_dict(db, t, last_preview=preview, viewer=admin))
        return {"threads": out, "total": total, "limit": limit, "offset": offset}
    finally:
        db.close()


@app.patch("/api/admin/support/threads/{thread_id}")
async def admin_support_patch_thread(
    thread_id: int,
    payload: SupportAdminPatchThreadIn,
    request: Request,
):
    admin = _require_admin(request)
    db = SessionLocal()
    try:
        t = db.query(SupportThread).filter(SupportThread.id == thread_id).first()
        if not t:
            raise HTTPException(status_code=404, detail="Thread not found")
        now = datetime.utcnow()
        changes: dict = {}
        if payload.status is not None:
            old = t.status
            st = _support_validate_status(payload.status)
            _support_apply_status_timestamps(t, st, now)
            changes["status"] = {"from": old, "to": st}
            if st in ("resolved", "closed"):
                _support_email_user_on_status(db, t, st)
        if payload.priority is not None:
            old_p = t.priority
            t.priority = _support_validate_priority(payload.priority)
            t.updated_at = now
            changes["priority"] = {"from": old_p, "to": t.priority}
        if payload.assigned_to_user_id is not None:
            old_a = t.assigned_to_user_id
            if payload.assigned_to_user_id == 0:
                t.assigned_to_user_id = None
            else:
                agent = db.query(User).filter(
                    User.id == payload.assigned_to_user_id,
                    User.role == "admin",
                    User.is_active == True,
                ).first()
                if not agent:
                    raise HTTPException(status_code=400, detail="Invalid assignee")
                t.assigned_to_user_id = int(agent.id)
            t.updated_at = now
            changes["assigned_to_user_id"] = {"from": old_a, "to": t.assigned_to_user_id}
        if payload.category is not None:
            old_c = t.category
            t.category = _support_validate_category(payload.category)
            t.updated_at = now
            changes["category"] = {"from": old_c, "to": t.category}
            if payload.priority is None:
                t.priority = _support_priority_for_category(t.category)
                changes["priority"] = {"auto": t.priority}
        if payload.tags is not None:
            old_tags = _support_load_tags(t)
            new_tags = _support_validate_tags(payload.tags)
            t.tags_json = json.dumps(new_tags) if new_tags else None
            t.updated_at = now
            changes["tags"] = {"from": old_tags, "to": new_tags}
        if payload.related_thread_id is not None:
            old_rel = getattr(t, "related_thread_id", None)
            rel = int(payload.related_thread_id)
            if rel == 0:
                t.related_thread_id = None
            else:
                other = db.query(SupportThread).filter(SupportThread.id == rel).first()
                if not other or other.id == t.id:
                    raise HTTPException(status_code=400, detail="Invalid related ticket")
                t.related_thread_id = rel
            t.updated_at = now
            changes["related_thread_id"] = {"from": old_rel, "to": t.related_thread_id}
        if payload.admin_yes_no is not None:
            old_v = getattr(t, "admin_yes_no", None)
            t.admin_yes_no = _support_validate_admin_yes_no(payload.admin_yes_no)
            t.updated_at = now
            changes["admin_yes_no"] = {"from": old_v, "to": t.admin_yes_no}
        db.commit()
        db.refresh(t)
        if changes:
            action = "support.ticket.update"
            if "assigned_to_user_id" in changes and len(changes) == 1:
                action = "support.ticket.assign"
            elif "status" in changes and len(changes) == 1:
                action = "support.ticket.status"
            _record_admin_action(
                request,
                action=action,
                target_type="support_thread",
                target_id=t.id,
                params=changes,
            )
        return {"thread": _support_thread_dict(db, t, viewer=admin)}
    finally:
        db.close()


@app.post("/api/admin/support/threads/{thread_id}/messages")
async def admin_support_post_message(
    thread_id: int,
    request: Request,
):
    admin = _require_admin(request)
    file_tuple: tuple[bytes, str, str | None] | None = None
    is_internal = False
    ct = (request.headers.get("content-type") or "").lower()
    if "multipart/form-data" in ct:
        form = await request.form()
        body_raw = (form.get("body") or "").strip()
        is_internal = str(form.get("is_internal") or "").lower() in ("1", "true", "yes", "on")
        up = form.get("file")
        if up is not None and hasattr(up, "read") and not is_internal:
            file_tuple = await _support_consume_upload_attachment(up)
        body = body_raw
        if not body and file_tuple:
            body = "[Attachment]"
        elif not body and not file_tuple:
            raise HTTPException(status_code=400, detail="Message text or a file is required")
    else:
        try:
            raw = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        payload = SupportAdminAppendMessageIn(**raw)
        body = payload.body.strip()
        is_internal = bool(payload.is_internal)
        if not body:
            raise HTTPException(status_code=400, detail="Message is required")
    body = body.strip()[:SUPPORT_BODY_MAX]
    db = SessionLocal()
    try:
        t = db.query(SupportThread).filter(SupportThread.id == thread_id).first()
        if not t:
            raise HTTPException(status_code=404, detail="Thread not found")
        if t.status == "closed":
            raise HTTPException(status_code=400, detail="Ticket is closed")
        now = datetime.utcnow()
        m = SupportMessage(
            thread_id=t.id,
            sender_user_id=admin.id,
            body=body,
            is_internal=is_internal,
        )
        db.add(m)
        t.last_message_at = now
        t.updated_at = now
        if not is_internal:
            _support_admin_on_public_reply(db, t, admin, now)
        db.commit()
        db.refresh(m)
        if file_tuple and not is_internal:
            data, mime, orig = file_tuple
            _support_add_attachment(db, m.id, int(admin.id), data, mime, orig)
            db.commit()
        recipients = _notify_support_recipients(db, t, m, admin)
        db.commit()
        if not is_internal:
            _support_email_user_on_admin_reply(db, t, body)
        _record_admin_action(
            request,
            action="support.ticket.note" if is_internal else "support.ticket.reply",
            target_type="support_thread",
            target_id=t.id,
            params={"is_internal": is_internal, "message_id": m.id},
        )
        req_upto, stf_upto = _support_read_watermarks(db, t)
        msg_dict = _support_msg_dict_with_read(db, m, t, req_upto, stf_upto)
        await support_ws_manager.broadcast(
            t.id,
            {"type": "message", "thread_id": t.id, "message": msg_dict},
        )
        await _push_inbox_notification_pings(recipients, t.id, m.id)
        return {"message": msg_dict, "thread": _support_thread_dict(db, t, viewer=admin)}
    finally:
        db.close()


@app.get("/api/admin/support/canned-replies")
async def admin_support_canned_list(request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        rows = (
            db.query(SupportCannedReply)
            .order_by(SupportCannedReply.sort_order.asc(), SupportCannedReply.id.asc())
            .all()
        )
        return {
            "replies": [
                {
                    "id": r.id,
                    "title": r.title,
                    "body": r.body,
                    "category": r.category,
                    "is_active": r.is_active,
                    "sort_order": r.sort_order,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ]
        }
    finally:
        db.close()


@app.post("/api/admin/support/canned-replies")
async def admin_support_canned_create(payload: SupportCannedReplyIn, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        cat = None
        if payload.category:
            cat = _support_validate_category(payload.category)
        row = SupportCannedReply(
            title=payload.title.strip()[:200],
            body=payload.body.strip()[:SUPPORT_BODY_MAX],
            category=cat,
            is_active=bool(payload.is_active),
            sort_order=int(payload.sort_order or 0),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        _record_admin_action(
            request,
            action="support.ticket.canned_create",
            target_type="support_canned_reply",
            target_id=row.id,
            params={"title": row.title},
        )
        return {"reply": {"id": row.id, "title": row.title}}
    finally:
        db.close()


@app.patch("/api/admin/support/canned-replies/{reply_id}")
async def admin_support_canned_patch(
    reply_id: int,
    payload: SupportCannedReplyPatchIn,
    request: Request,
):
    _require_admin(request)
    db = SessionLocal()
    try:
        row = db.query(SupportCannedReply).filter(SupportCannedReply.id == reply_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        if payload.title is not None:
            row.title = payload.title.strip()[:200]
        if payload.body is not None:
            row.body = payload.body.strip()[:SUPPORT_BODY_MAX]
        if payload.category is not None:
            row.category = _support_validate_category(payload.category) if payload.category else None
        if payload.is_active is not None:
            row.is_active = bool(payload.is_active)
        if payload.sort_order is not None:
            row.sort_order = int(payload.sort_order)
        db.commit()
        _record_admin_action(
            request,
            action="support.ticket.canned_update",
            target_type="support_canned_reply",
            target_id=row.id,
        )
        return {"ok": True}
    finally:
        db.close()


@app.delete("/api/admin/support/canned-replies/{reply_id}")
async def admin_support_canned_delete(reply_id: int, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        row = db.query(SupportCannedReply).filter(SupportCannedReply.id == reply_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        db.delete(row)
        db.commit()
        _record_admin_action(
            request,
            action="support.ticket.canned_delete",
            target_type="support_canned_reply",
            target_id=reply_id,
        )
        return {"ok": True}
    finally:
        db.close()


@app.get("/api/notifications")
async def notifications_list(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    unread_only: bool = False,
):
    user = _require_user(request)
    db = SessionLocal()
    try:
        q = db.query(Notification).filter(Notification.user_id == user.id)
        if unread_only:
            q = q.filter(Notification.read_at.is_(None))
        rows = q.order_by(Notification.id.desc()).limit(limit).all()
        archived_thread_ids: set[int] = set()
        if user.role != "admin":
            archived_thread_ids = {
                int(r[0])
                for r in db.query(SupportThread.id)
                .filter(SupportThread.archived_at.isnot(None))
                .all()
            }
            rows = [n for n in rows if not (n.thread_id and int(n.thread_id) in archived_thread_ids)]
        unread_q = db.query(Notification).filter(
            Notification.user_id == user.id, Notification.read_at.is_(None)
        )
        if archived_thread_ids:
            unread_q = unread_q.filter(
                or_(
                    Notification.thread_id.is_(None),
                    ~Notification.thread_id.in_(archived_thread_ids),
                )
            )
        unread = unread_q.count()
        return {
            "notifications": [
                {
                    "id": n.id,
                    "type": n.type,
                    "thread_id": n.thread_id,
                    "message_id": n.message_id,
                    "title": n.title,
                    "body": n.body,
                    "read_at": n.read_at.isoformat() if n.read_at else None,
                    "created_at": n.created_at.isoformat() if n.created_at else None,
                }
                for n in rows
            ],
            "unread_count": unread,
        }
    finally:
        db.close()


@app.patch("/api/notifications/read")
async def notifications_mark_read(payload: NotificationsReadIn, request: Request):
    user = _require_user(request)
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        if payload.all:
            db.query(Notification).filter(Notification.user_id == user.id, Notification.read_at.is_(None)).update(
                {Notification.read_at: now}, synchronize_session=False
            )
        elif payload.ids:
            for nid in payload.ids:
                n = (
                    db.query(Notification)
                    .filter(Notification.id == nid, Notification.user_id == user.id)
                    .first()
                )
                if n and n.read_at is None:
                    n.read_at = now
        else:
            raise HTTPException(status_code=400, detail="Specify ids or all: true")
        db.commit()
        return {"success": True}
    finally:
        db.close()


@app.websocket("/ws/support")
async def ws_support(websocket: WebSocket):
    await websocket.accept()
    user = _get_user_from_websocket(websocket)
    if user is None:
        await websocket.close(code=4401)
        return
    subscribed_tid: int | None = None
    inbox_subscribed = False
    uid = int(user.id)
    try:
        while True:
            data = await websocket.receive_json()
            mt = data.get("type", "")
            if mt == "ping":
                await websocket.send_json({"type": "pong"})
            elif mt == "subscribe_inbox":
                inbox_ws_manager.subscribe(websocket, uid)
                inbox_subscribed = True
                await websocket.send_json({"type": "subscribed_inbox"})
            elif mt == "subscribe":
                try:
                    tid = int(data.get("thread_id", 0))
                except (TypeError, ValueError):
                    await websocket.send_json({"type": "error", "detail": "Invalid thread_id"})
                    continue
                db = SessionLocal()
                try:
                    t = db.query(SupportThread).filter(SupportThread.id == tid).first()
                    if not t or not _support_user_can_access_thread(user, t):
                        await websocket.send_json({"type": "error", "detail": "Forbidden"})
                        continue
                finally:
                    db.close()
                if subscribed_tid is not None and subscribed_tid != tid:
                    support_ws_manager.disconnect(websocket, subscribed_tid)
                support_ws_manager.subscribe(websocket, tid)
                subscribed_tid = tid
                await websocket.send_json({"type": "subscribed", "thread_id": tid})
            elif mt == "unsubscribe":
                try:
                    tid = int(data.get("thread_id", 0))
                except (TypeError, ValueError):
                    continue
                if subscribed_tid is not None and subscribed_tid == tid:
                    support_ws_manager.disconnect(websocket, tid)
                    subscribed_tid = None
                    await websocket.send_json({"type": "unsubscribed", "thread_id": tid})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if subscribed_tid is not None:
            support_ws_manager.disconnect(websocket, subscribed_tid)
        if inbox_subscribed:
            inbox_ws_manager.disconnect(websocket, uid)


@app.get("/api/admin/users")
async def admin_list_users(request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        try:
            users = db.query(User).order_by(User.created_at.desc()).all()
        except Exception as exc:
            _apply_entitlements_schema_migrations(engine)
            db.rollback()
            try:
                users = db.query(User).order_by(User.created_at.desc()).all()
            except Exception as exc2:
                raise HTTPException(status_code=500, detail=f"Failed to load users: {exc2}") from exc2
        sessions = db.query(
            UserSession.user_id,
            func.count(UserSession.id).label("cnt"),
            func.max(UserSession.last_active_at).label("last_active"),
        ).group_by(UserSession.user_id).all()
        session_map = {s.user_id: {"count": s.cnt, "last_active": s.last_active} for s in sessions}
        ts_rows = (
            db.query(TradingSession.user_id, func.count(TradingSession.id).label("cnt"))
            .group_by(TradingSession.user_id)
            .all()
        )
        trading_count_map = {int(row[0]): int(row[1]) for row in ts_rows}
        result = []
        now = datetime.utcnow()
        for u in users:
            d = _user_public_dict(u, db)
            info = session_map.get(u.id, {})
            d["session_count"] = info.get("count", 0)
            d["trading_sessions_count"] = trading_count_map.get(int(u.id), 0)
            la = info.get("last_active")
            d["last_active_at"] = la.isoformat() if la else None
            expired = u.access_expires_at and u.access_expires_at < now
            d["status"] = "banned" if not u.is_active else ("expired" if expired else "active")
            result.append(d)
        return {"users": result}
    finally:
        db.close()


def _journal_dicts_from_journal_trade_rows(rows) -> list:
    """Build journal-style trade dicts from ORM rows (for analytics)."""
    out = []
    for r in rows or []:
        try:
            p = json.loads(r.payload_json) if getattr(r, "payload_json", None) else {}
            if isinstance(p, dict):
                out.append(p)
        except Exception:
            pass
    return out


def _replay_dashboard_from_state_json(state_json: str | None, max_bytes: int = 2_000_000) -> dict | None:
    """Extract replay.dashboard from session state (bounded parse)."""
    if not state_json or len(state_json) > max_bytes:
        return None
    try:
        state = json.loads(state_json)
    except Exception:
        return None
    if not isinstance(state, dict):
        return None
    replay = state.get("replay")
    if not isinstance(replay, dict):
        return None
    dash = replay.get("dashboard")
    if not isinstance(dash, dict) or not dash:
        return None
    keep = (
        "elapsed_days",
        "progress_pct",
        "furthest_replay_ts",
        "configured_start_ts",
        "configured_end_ts",
        "updated_at",
    )
    slim = {k: dash.get(k) for k in keep if k in dash}
    return _sanitize_for_json(slim) if slim else None


@app.get("/api/admin/users/{user_id}/monitor")
async def admin_user_monitor(user_id: int, request: Request):
    """
    Admin-only: full user monitor — chart connections (UserSession), all trading sessions,
    journal trade counts, replay/backtest progress from state, and combined + per-session analytics.
    """
    _require_admin(request)
    MAX_CHART_CONN = 120
    MAX_TRADING_SESSIONS = 50
    MAX_TRADES_PER_SESSION = 1200
    MAX_COMBINED_TRADES = 3000

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user_dict = _user_public_dict(user, db)

        conns = (
            db.query(UserSession)
            .filter(UserSession.user_id == user_id)
            .order_by(UserSession.last_active_at.desc())
            .limit(MAX_CHART_CONN)
            .all()
        )
        last_chart_activity = None
        chart_connections = []
        for c in conns:
            la = c.last_active_at
            if la and (last_chart_activity is None or la > last_chart_activity):
                last_chart_activity = la
            chart_connections.append(
                {
                    "id": c.id,
                    "ip_address": c.ip_address,
                    "device": c.device,
                    "last_active_at": la.isoformat() if la else None,
                }
            )

        total_journal_trades = int(
            db.query(func.count(TradingSessionJournalTrade.id))
            .filter(TradingSessionJournalTrade.user_id == user_id)
            .scalar()
            or 0
        )

        total_trading_sessions = int(
            db.query(func.count(TradingSession.id)).filter(TradingSession.user_id == user_id).scalar() or 0
        )

        ts_list = (
            db.query(TradingSession)
            .filter(TradingSession.user_id == user_id)
            .order_by(TradingSession.updated_at.desc())
            .limit(MAX_TRADING_SESSIONS)
            .all()
        )
        sid_list = [int(s.id) for s in ts_list]
        state_by_sid: dict[int, TradingSessionState] = {}
        if sid_list:
            for st in db.query(TradingSessionState).filter(TradingSessionState.session_id.in_(sid_list)).all():
                state_by_sid[int(st.session_id)] = st

        tc_map: dict[int, int] = {}
        if sid_list:
            for sid, cnt in (
                db.query(TradingSessionJournalTrade.session_id, func.count(TradingSessionJournalTrade.id))
                .filter(
                    TradingSessionJournalTrade.user_id == user_id,
                    TradingSessionJournalTrade.session_id.in_(sid_list),
                )
                .group_by(TradingSessionJournalTrade.session_id)
                .all()
            ):
                tc_map[int(sid)] = int(cnt)

        trading_sessions_out = []
        total_replay_elapsed_days = 0.0
        replay_sessions_counted = 0
        for s in ts_list:
            pub = _session_public_dict(s)
            st = state_by_sid.get(int(s.id))
            trades_count = tc_map.get(int(s.id), 0)
            replay_dash = None
            state_updated = st.updated_at.isoformat() if st and st.updated_at else None
            if st and st.state_json:
                replay_dash = _replay_dashboard_from_state_json(st.state_json)
                if replay_dash and replay_dash.get("elapsed_days") is not None:
                    try:
                        ed = float(replay_dash["elapsed_days"])
                        if math.isfinite(ed) and ed > 0:
                            total_replay_elapsed_days += ed
                            replay_sessions_counted += 1
                    except (TypeError, ValueError):
                        pass

            session_kpis = None
            session_analytics = None
            if st:
                rows = (
                    db.query(TradingSessionJournalTrade)
                    .filter(
                        TradingSessionJournalTrade.session_id == int(s.id),
                        TradingSessionJournalTrade.user_id == user_id,
                    )
                    .order_by(TradingSessionJournalTrade.updated_at.asc())
                    .limit(MAX_TRADES_PER_SESSION)
                    .all()
                )
                journal = _journal_dicts_from_journal_trade_rows(rows)
                if journal:
                    try:
                        session_analytics = _sanitize_for_json(_compute_session_analytics(pub, journal))
                        session_kpis = session_analytics.get("kpis") if isinstance(session_analytics, dict) else None
                    except Exception:
                        session_analytics = None
                        session_kpis = None

            trading_sessions_out.append(
                {
                    **pub,
                    "trades_count": trades_count,
                    "state_updated_at": state_updated,
                    "replay_dashboard": replay_dash,
                    "kpis": session_kpis,
                    "analytics": session_analytics,
                }
            )

        comb_rows = (
            db.query(TradingSessionJournalTrade)
            .filter(TradingSessionJournalTrade.user_id == user_id)
            .order_by(TradingSessionJournalTrade.updated_at.desc())
            .limit(MAX_COMBINED_TRADES)
            .all()
        )
        comb_rows = list(reversed(comb_rows))
        combined_journal = _journal_dicts_from_journal_trade_rows(comb_rows)
        combined_analytics = None
        if combined_journal:
            try:
                agg_session = {
                    "id": None,
                    "name": "Combined (recent trades)",
                    "session_type": "aggregate",
                    "start_balance": None,
                }
                combined_analytics = _sanitize_for_json(_compute_session_analytics(agg_session, combined_journal))
            except Exception:
                combined_analytics = None

        payments_rows = (
            db.query(Payment)
            .filter(Payment.user_id == user_id)
            .order_by(Payment.created_at.desc())
            .limit(8)
            .all()
        )
        recent_payments = [
            {
                "id": p.id,
                "amount": float(p.amount) if p.amount is not None else None,
                "currency": p.currency,
                "status": p.status,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "description": (p.description or "")[:200],
            }
            for p in payments_rows
        ]

        out = {
            "user": user_dict,
            "summary": {
                "chart_connections": len(chart_connections),
                "last_chart_activity_at": last_chart_activity.isoformat() if last_chart_activity else None,
                "trading_sessions_total": total_trading_sessions,
                "trading_sessions_shown": len(ts_list),
                "trading_sessions_list_cap": MAX_TRADING_SESSIONS,
                "journal_trades_total": total_journal_trades,
                "replay_elapsed_days_sum": round(total_replay_elapsed_days, 2) if total_replay_elapsed_days else 0.0,
                "replay_sessions_with_elapsed": replay_sessions_counted,
                "note": "last_chart_activity_at is max(UserSession.last_active_at). trading_sessions_total counts all TradingSession rows (same as dashboard). trading_sessions_shown is capped for this response. Replay elapsed_days summed from replay.dashboard where present.",
            },
            "chart_connections": chart_connections,
            "trading_sessions": trading_sessions_out,
            "combined_analytics": combined_analytics,
            "recent_payments": recent_payments,
        }
        _record_admin_action(
            request,
            action="user_monitor_view",
            status="ok",
            status_code=200,
            target_type="user",
            target_id=user_id,
            params={"cap_sessions": MAX_TRADING_SESSIONS, "cap_connections": MAX_CHART_CONN},
        )
        return out
    finally:
        db.close()


def _timeline_iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    return dt.isoformat() + "Z"


def _timeline_sort_key(at: str | None) -> float:
    if not at:
        return 0.0
    try:
        s = at[:-1] + "+00:00" if at.endswith("Z") else at
        return datetime.fromisoformat(s).timestamp()
    except Exception:
        return 0.0


@app.get("/api/admin/users/{user_id}/timeline")
async def admin_user_timeline(user_id: int, request: Request, limit: int = 200):
    """
    Admin-only: merged chronological activity for a user (sessions, payments,
    support, subscriptions, chart connections, affiliate events, admin audit rows).
    """
    _require_admin(request)
    limit = max(20, min(500, int(limit or 200)))
    uid = int(user_id)
    uid_s = str(uid)
    user_path = f"/api/admin/users/{uid}"

    db = SessionLocal()
    events: list[dict] = []
    try:
        user = db.query(User).filter(User.id == uid).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if user.created_at:
            events.append(
                {
                    "at": _timeline_iso(user.created_at),
                    "kind": "account",
                    "label": "Account created",
                    "detail": None,
                    "ref": {"type": "user", "id": uid},
                }
            )

        for sub in (
            db.query(Subscription)
            .filter(Subscription.user_id == uid)
            .order_by(Subscription.updated_at.desc())
            .limit(20)
            .all()
        ):
            st = (sub.status or "")[:64]
            if sub.created_at:
                events.append(
                    {
                        "at": _timeline_iso(sub.created_at),
                        "kind": "subscription",
                        "label": f"Subscription #{sub.id} created",
                        "detail": st or None,
                        "ref": {"type": "subscription", "id": sub.id},
                    }
                )
            if sub.updated_at and sub.created_at and sub.updated_at != sub.created_at:
                events.append(
                    {
                        "at": _timeline_iso(sub.updated_at),
                        "kind": "subscription",
                        "label": f"Subscription #{sub.id} updated",
                        "detail": st or None,
                        "ref": {"type": "subscription", "id": sub.id},
                    }
                )
            if sub.cancelled_at:
                events.append(
                    {
                        "at": _timeline_iso(sub.cancelled_at),
                        "kind": "subscription",
                        "label": f"Subscription #{sub.id} cancelled",
                        "detail": st or None,
                        "ref": {"type": "subscription", "id": sub.id},
                    }
                )

        for p in (
            db.query(Payment)
            .filter(Payment.user_id == uid)
            .order_by(Payment.created_at.desc())
            .limit(30)
            .all()
        ):
            if p.created_at:
                amt = float(p.amount) if p.amount is not None else None
                cur = (p.currency or "").upper()
                amt_s = f"{amt:.2f} {cur}".strip() if amt is not None else ""
                events.append(
                    {
                        "at": _timeline_iso(p.created_at),
                        "kind": "payment",
                        "label": f"Payment · {p.status or 'unknown'}" + (f" · {amt_s}" if amt_s else ""),
                        "detail": ((p.description or "")[:160] or None),
                        "ref": {"type": "payment", "id": p.id},
                    }
                )

        for t in (
            db.query(SupportThread)
            .filter(SupportThread.user_id == uid)
            .order_by(SupportThread.updated_at.desc())
            .limit(25)
            .all()
        ):
            subj = (t.subject or "")[:120]
            if t.created_at:
                events.append(
                    {
                        "at": _timeline_iso(t.created_at),
                        "kind": "support",
                        "label": f"Support thread opened · {subj}" if subj else f"Support thread #{t.id} opened",
                        "detail": f"#{t.id} · {t.category} · {t.status}",
                        "ref": {"type": "support_thread", "id": t.id},
                    }
                )
            if t.last_message_at and (not t.created_at or t.last_message_at != t.created_at):
                events.append(
                    {
                        "at": _timeline_iso(t.last_message_at),
                        "kind": "support",
                        "label": f"Support activity · thread #{t.id}",
                        "detail": subj or None,
                        "ref": {"type": "support_thread", "id": t.id},
                    }
                )

        for s in (
            db.query(TradingSession)
            .filter(TradingSession.user_id == uid)
            .order_by(TradingSession.updated_at.desc())
            .limit(45)
            .all()
        ):
            nm = (s.name or "Session")[:100]
            if s.created_at:
                events.append(
                    {
                        "at": _timeline_iso(s.created_at),
                        "kind": "trading_session",
                        "label": f"Backtest session created · {nm}",
                        "detail": f"#{s.id} · {s.session_type}",
                        "ref": {"type": "trading_session", "id": s.id},
                    }
                )
            if s.updated_at and (not s.created_at or s.updated_at != s.created_at):
                events.append(
                    {
                        "at": _timeline_iso(s.updated_at),
                        "kind": "trading_session",
                        "label": f"Backtest session updated · {nm}",
                        "detail": f"#{s.id}",
                        "ref": {"type": "trading_session", "id": s.id},
                    }
                )

        for c in (
            db.query(UserSession)
            .filter(UserSession.user_id == uid)
            .order_by(UserSession.last_active_at.desc())
            .limit(35)
            .all()
        ):
            if c.last_active_at:
                dip = (c.ip_address or "")[:48]
                dev = (c.device or "")[:100]
                events.append(
                    {
                        "at": _timeline_iso(c.last_active_at),
                        "kind": "chart_connection",
                        "label": "Chart / device activity",
                        "detail": " · ".join(x for x in (dip, dev) if x) or None,
                        "ref": {"type": "user_session", "id": c.id},
                    }
                )

        for ev in (
            db.query(AffiliateEvent)
            .filter(AffiliateEvent.user_id == uid)
            .order_by(AffiliateEvent.created_at.desc())
            .limit(35)
            .all()
        ):
            if ev.created_at:
                events.append(
                    {
                        "at": _timeline_iso(ev.created_at),
                        "kind": "affiliate",
                        "label": f"Affiliate · {ev.event_type or 'event'}",
                        "detail": f"affiliate #{ev.affiliate_id}",
                        "ref": {"type": "affiliate_event", "id": ev.id},
                    }
                )

        for r in (
            db.query(AdminAuditLog)
            .filter(
                or_(
                    and_(AdminAuditLog.target_type == "user", AdminAuditLog.target_id == uid_s),
                    AdminAuditLog.path.like(f"{user_path}/%"),
                    AdminAuditLog.path == user_path,
                )
            )
            .order_by(AdminAuditLog.created_at.desc())
            .limit(100)
            .all()
        ):
            if not r.created_at:
                continue
            events.append(
                {
                    "at": _timeline_iso(r.created_at),
                    "kind": "admin_audit",
                    "label": (r.action or "admin_action")[:120],
                    "detail": f"{r.method or ''} {(r.path or '')[:200]} · {r.status or ''}".strip(),
                    "ref": {"type": "admin_audit_log", "id": r.id},
                    "meta": {
                        "admin_email": r.admin_email,
                        "status_code": r.status_code,
                    },
                }
            )

        events.sort(key=lambda e: _timeline_sort_key(e.get("at")), reverse=True)
        events = events[:limit]
        return {"success": True, "user_id": uid, "events": events, "limit": limit}
    finally:
        db.close()


class _CreateUserIn(BaseModel):
    name: str
    email: str
    password: str
    role: str = "user"
    access_days: int | None = None
    access_expires_at: str | None = None
    max_sessions: int = 1
    max_trading_sessions: int = 5
    max_tickers_per_session: int = 5
    max_supporting_tickers_per_session: int = 5


@app.post("/api/admin/users")
async def admin_create_user(payload: _CreateUserIn, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == payload.email.strip().lower()).first()
        if existing:
            raise HTTPException(status_code=409, detail="Email already exists")
        expires = None
        if payload.access_expires_at:
            try:
                expires = datetime.fromisoformat(payload.access_expires_at.replace("Z", "+00:00")).replace(tzinfo=None)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid access_expires_at format")
        elif payload.access_days and payload.access_days > 0:
            expires = datetime.utcnow() + timedelta(days=payload.access_days)
        user = User(
            name=payload.name.strip(),
            email=payload.email.strip().lower(),
            password_hash=_hash_password(payload.password),
            role=payload.role.strip().lower() if payload.role in ("user", "admin") else "user",
            is_active=True,
            access_expires_at=expires,
            max_sessions=max(1, payload.max_sessions) if payload.max_sessions else 1,
            max_trading_sessions=max(0, payload.max_trading_sessions if payload.max_trading_sessions is not None else 5),
            max_tickers_per_session=max(0, payload.max_tickers_per_session if payload.max_tickers_per_session is not None else 5),
            max_supporting_tickers_per_session=max(
                0,
                payload.max_supporting_tickers_per_session
                if payload.max_supporting_tickers_per_session is not None
                else 5,
            ),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return {"user": _user_public_dict(user)}
    finally:
        db.close()


class _UpdateUserIn(BaseModel):
    name: str | None = None
    email: str | None = None
    role: str | None = None
    is_active: bool | None = None
    has_journal_access: bool | None = None
    dashboard_module_grants: dict | None = None
    access_expires_at: str | None = None
    access_days: int | None = None
    password: str | None = None
    max_sessions: int | None = None
    max_trading_sessions: int | None = None
    max_tickers_per_session: int | None = None
    max_supporting_tickers_per_session: int | None = None


@app.put("/api/admin/users/{user_id}")
async def admin_update_user(user_id: int, payload: _UpdateUserIn, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if payload.name is not None:
            user.name = payload.name.strip()
        if payload.email is not None:
            dup = db.query(User).filter(User.email == payload.email.strip().lower(), User.id != user_id).first()
            if dup:
                raise HTTPException(status_code=409, detail="Email already taken")
            user.email = payload.email.strip().lower()
        if payload.role is not None and payload.role in ("user", "admin"):
            user.role = payload.role
        if payload.is_active is not None:
            user.is_active = payload.is_active
        if payload.password:
            user.password_hash = _hash_password(payload.password)
        if payload.max_sessions is not None:
            user.max_sessions = max(1, payload.max_sessions)
        if payload.max_trading_sessions is not None:
            user.max_trading_sessions = max(0, payload.max_trading_sessions)
        if payload.max_tickers_per_session is not None:
            user.max_tickers_per_session = max(0, payload.max_tickers_per_session)
        if payload.max_supporting_tickers_per_session is not None:
            user.max_supporting_tickers_per_session = max(0, payload.max_supporting_tickers_per_session)
        if any(
            x is not None
            for x in (
                payload.max_trading_sessions,
                payload.max_tickers_per_session,
                payload.max_supporting_tickers_per_session,
            )
        ):
            pe.apply_admin_override(user)
            _apply_admin_override_chart(db, user)
        if payload.access_expires_at is not None:
            if payload.access_expires_at == "" or payload.access_expires_at.lower() == "null":
                user.access_expires_at = None
            else:
                try:
                    user.access_expires_at = datetime.fromisoformat(
                        payload.access_expires_at.replace("Z", "+00:00")
                    ).replace(tzinfo=None)
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid date format")
        elif payload.access_days is not None:
            if payload.access_days <= 0:
                user.access_expires_at = None
            else:
                user.access_expires_at = datetime.utcnow() + timedelta(days=payload.access_days)
        if payload.has_journal_access is not None:
            user.has_journal_access = bool(payload.has_journal_access)
            if user.has_journal_access:
                user.dashboard_module_grants = None
        if payload.dashboard_module_grants is not None:
            _set_user_module_grants(user, payload.dashboard_module_grants)
            if normalize_module_grants(payload.dashboard_module_grants):
                user.has_journal_access = False
        db.commit()
        db.refresh(user)
        return {"user": _user_public_dict(user, db=db)}
    finally:
        db.close()


@app.get("/api/admin/dashboard-modules")
async def admin_dashboard_modules_catalog(request: Request):
    _require_admin(request)
    return {"modules": modules_catalog()}


@app.delete("/api/admin/users/{user_id}")
async def admin_delete_user(user_id: int, request: Request):
    admin = _require_admin(request)
    if admin.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        db.query(UserSession).filter(UserSession.user_id == user_id).delete()
        db.delete(user)
        db.commit()
        return {"success": True}
    finally:
        db.close()


@app.post("/api/admin/users/{user_id}/kick")
async def admin_kick_user(user_id: int, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        count = db.query(UserSession).filter(UserSession.user_id == user_id).delete()
        db.commit()
        return {"success": True, "sessions_removed": count}
    finally:
        db.close()


@app.post("/api/admin/users/{user_id}/ban")
async def admin_ban_user(user_id: int, request: Request):
    admin = _require_admin(request)
    if admin.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot ban yourself")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user.is_active = False
        db.query(UserSession).filter(UserSession.user_id == user_id).delete()
        db.commit()
        return {"success": True}
    finally:
        db.close()


@app.post("/api/admin/users/{user_id}/unban")
async def admin_unban_user(user_id: int, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user.is_active = True
        db.commit()
        return {"success": True}
    finally:
        db.close()


class _ExtendAccessIn(BaseModel):
    days: int | None = None
    expires_at: str | None = None


@app.post("/api/admin/users/{user_id}/extend")
async def admin_extend_access(user_id: int, payload: _ExtendAccessIn, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if payload.expires_at:
            try:
                user.access_expires_at = datetime.fromisoformat(
                    payload.expires_at.replace("Z", "+00:00")
                ).replace(tzinfo=None)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format")
        elif payload.days and payload.days > 0:
            base = user.access_expires_at if (user.access_expires_at and user.access_expires_at > datetime.utcnow()) else datetime.utcnow()
            user.access_expires_at = base + timedelta(days=payload.days)
        else:
            user.access_expires_at = None
        db.commit()
        db.refresh(user)
        return {"user": _user_public_dict(user)}
    finally:
        db.close()


@app.get("/api/admin/sessions")
async def admin_list_sessions(request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        sessions = db.query(UserSession).order_by(UserSession.last_active_at.desc()).all()
        user_ids = list({s.user_id for s in sessions})
        users_map = {}
        if user_ids:
            users = db.query(User).filter(User.id.in_(user_ids)).all()
            users_map = {u.id: u for u in users}
        result = []
        for s in sessions:
            u = users_map.get(s.user_id)
            result.append({
                "id": s.id,
                "user_id": s.user_id,
                "user_name": u.name if u else "Unknown",
                "user_email": u.email if u else "Unknown",
                "user_role": u.role if u else "user",
                "ip_address": s.ip_address,
                "device": s.device,
                "last_active_at": s.last_active_at.isoformat() if s.last_active_at else None,
            })
        return {"sessions": result}
    finally:
        db.close()


@app.delete("/api/admin/sessions/{session_id}")
async def admin_kill_session(session_id: str, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        count = db.query(UserSession).filter(UserSession.id == session_id).delete()
        db.commit()
        return {"success": True, "deleted": count}
    finally:
        db.close()


@app.get("/api/admin/datasets")
async def admin_list_datasets(request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        files = db.query(CSVFile).order_by(CSVFile.upload_date.desc()).all()
        aggs = db.query(CSVAggregate).all()
        settings_rows = db.query(DatasetSettings).all()
        jobs = db.query(BinaryBuildJob).order_by(BinaryBuildJob.created_at.desc(), BinaryBuildJob.id.desc()).all()

        aggs_by_file: dict[int, dict[str, CSVAggregate]] = {}
        for agg in aggs:
            aggs_by_file.setdefault(int(agg.file_id), {})[agg.timeframe] = agg

        settings_by_file = {int(s.file_id): s for s in settings_rows}
        latest_job_by_file: dict[int, BinaryBuildJob] = {}
        for job in jobs:
            fid = int(job.file_id)
            if fid not in latest_job_by_file:
                latest_job_by_file[fid] = job

        datasets = []
        for f in files:
            file_aggs = aggs_by_file.get(int(f.id), {})
            latest_job = latest_job_by_file.get(int(f.id))
            job_status = str(latest_job.status or "").lower() if latest_job else ""
            tf_info = {}
            ready_count = 0
            for tf in DATASET_TIMEFRAMES:
                agg = file_aggs.get(tf)
                agg_filename = agg.agg_filename if agg and agg.agg_filename else f"bin_{f.id}_{tf}.bin"
                bin_path = BIN_DIR / agg_filename
                if agg:
                    status = agg.status
                elif bin_path.exists():
                    status = "ready"
                elif job_status in {"queued", "processing"}:
                    status = "pending"
                elif job_status == "failed":
                    status = "failed"
                else:
                    status = "missing"
                if status == "ready":
                    ready_count += 1
                tf_info[tf] = {
                    "status": status,
                    "row_count": int(agg.row_count or 0) if agg else 0,
                    "start_ts": agg.start_ts if agg else None,
                    "end_ts": agg.end_ts if agg else None,
                    "bin_exists": bin_path.exists(),
                    "filename": agg_filename,
                }

            ds_settings = settings_by_file.get(int(f.id))
            datasets.append({
                "id": f.id,
                "filename": f.filename,
                "original_name": f.original_name,
                "row_count": int(f.row_count or 0),
                "upload_date": f.upload_date.isoformat() if f.upload_date else None,
                "settings": _dataset_settings_public_dict(ds_settings, f),
                "timeframes": tf_info,
                "ready_timeframes": ready_count,
                "total_timeframes": len(DATASET_TIMEFRAMES),
                "build_job": {
                    "id": int(latest_job.id),
                    "status": job_status,
                    "attempt_count": int(latest_job.attempt_count or 0),
                    "error": latest_job.error,
                } if latest_job else None,
            })

        return {
            "datasets": datasets,
            "timeframes": DATASET_TIMEFRAMES,
        }
    finally:
        db.close()


@app.get("/api/admin/datasets/overview")
async def admin_datasets_overview(request: Request):
    """Full-disk and health snapshot for every dataset (admin registry view)."""
    _require_admin(request)
    db = SessionLocal()
    try:
        files = db.query(CSVFile).order_by(CSVFile.upload_date.desc()).all()
        settings_rows = db.query(DatasetSettings).all()
        settings_by_file = {int(s.file_id): s for s in settings_rows}
        jobs = db.query(BinaryBuildJob).order_by(BinaryBuildJob.created_at.desc(), BinaryBuildJob.id.desc()).all()
        latest_job_by_file: dict[int, BinaryBuildJob] = {}
        for job in jobs:
            fid = int(job.file_id)
            if fid not in latest_job_by_file:
                latest_job_by_file[fid] = job

        qdb_counts = questdb_store.all_file_1m_counts() if questdb_store.questdb_enabled() else {}

        entries = []
        for f in files:
            sid = int(f.id)
            st = settings_by_file.get(sid)
            j = latest_job_by_file.get(sid)
            entry = _dataset_overview_entry(db, f, st, j)
            exp_1m = 0
            cov = entry.get("coverage") or {}
            if cov.get("candle_count_1m"):
                exp_1m = int(cov["candle_count_1m"])
            elif entry.get("csv_storage_rows_stored"):
                exp_1m = int(entry["csv_storage_rows_stored"])
            else:
                for tf in entry.get("timeframes") or []:
                    if tf.get("timeframe") == "1m" and tf.get("row_count"):
                        exp_1m = int(tf["row_count"])
                        break
            entry["questdb"] = questdb_store.classify_coverage(
                sid, qdb_counts.get(sid, 0), exp_1m or None
            )
            entries.append(entry)

        total_disk = sum(int(x.get("total_storage_bytes") or 0) for x in entries)
        healthy_n = sum(1 for x in entries if x.get("health") == "healthy")
        qdb_synced = sum(1 for x in entries if (x.get("questdb") or {}).get("status") == "synced")
        qdb_partial = sum(1 for x in entries if (x.get("questdb") or {}).get("status") == "partial")
        qdb_missing = sum(1 for x in entries if (x.get("questdb") or {}).get("status") == "missing")
        return {
            "success": True,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "summary": {
                "dataset_count": len(entries),
                "total_storage_bytes": total_disk,
                "total_storage_human": _human_bytes(total_disk),
                "healthy_count": healthy_n,
                "needs_attention_count": len(entries) - healthy_n,
                "questdb_enabled": questdb_store.questdb_enabled(),
                "questdb_read_primary": questdb_store.questdb_read_primary(),
                "questdb_synced_count": qdb_synced,
                "questdb_partial_count": qdb_partial,
                "questdb_missing_count": qdb_missing,
            },
            "datasets": entries,
            "timeframes": list(DATASET_TIMEFRAMES),
        }
    finally:
        db.close()


@app.get("/api/admin/datasets/{file_id}/analytics")
async def admin_dataset_analytics(file_id: int, request: Request):
    """
    Disk usage, row counts per timeframe, coverage dates, and pipeline summary for one dataset.
    """
    _require_admin(request)
    db = SessionLocal()
    try:
        db_file = db.query(CSVFile).filter(CSVFile.id == file_id).first()
        if not db_file:
            raise HTTPException(status_code=404, detail="Dataset not found")

        csv_path = _resolve_dataset_csv_for_file(db_file)
        csv_exists = csv_path.exists()
        csv_bytes = _path_disk_bytes(csv_path) if csv_exists else 0

        aggs_list = db.query(CSVAggregate).filter(CSVAggregate.file_id == file_id).all()
        agg_by_tf = {str(a.timeframe): a for a in aggs_list}

        tiles_root = TILES_DIR / str(file_id)
        tiles_bytes = _path_disk_bytes(tiles_root) if tiles_root.exists() else 0

        bin_total = 0
        ready_tf = 0
        timeframes_detail: list[dict] = []
        for tf in DATASET_TIMEFRAMES:
            agg = agg_by_tf.get(tf)
            fname = agg.agg_filename if agg and agg.agg_filename else f"bin_{file_id}_{tf}.bin"
            bp = BIN_DIR / fname
            bsz = int(bp.stat().st_size) if bp.exists() else 0
            bin_total += bsz
            st = str(agg.status or "") if agg else ""
            if not agg and bp.exists():
                st = "ready"
            elif not agg:
                st = "missing"
            if st == "ready":
                ready_tf += 1

            rc = int(agg.row_count or 0) if agg else 0
            timeframes_detail.append(
                {
                    "timeframe": tf,
                    "status": st,
                    "row_count": rc,
                    "binary_filename": fname,
                    "binary_bytes": bsz,
                    "binary_human": _human_bytes(bsz),
                    "binary_exists": bp.exists(),
                    "start_ts_ms": float(agg.start_ts) if agg and agg.start_ts is not None else None,
                    "end_ts_ms": float(agg.end_ts) if agg and agg.end_ts is not None else None,
                    "start_iso": _epoch_ms_to_iso_utc(float(agg.start_ts)) if agg and agg.start_ts is not None else None,
                    "end_iso": _epoch_ms_to_iso_utc(float(agg.end_ts)) if agg and agg.end_ts is not None else None,
                }
            )

        total_storage = csv_bytes + bin_total + tiles_bytes

        one_m = agg_by_tf.get("1m")
        coverage = None
        if one_m and one_m.start_ts is not None and one_m.end_ts is not None:
            span_ms = float(one_m.end_ts) - float(one_m.start_ts)
            coverage = {
                "start_iso": _epoch_ms_to_iso_utc(float(one_m.start_ts)),
                "end_iso": _epoch_ms_to_iso_utc(float(one_m.end_ts)),
                "span_days": round(span_ms / 86400000.0, 4),
                "candle_count_1m": int(one_m.row_count or 0),
            }

        ok, integrity_issues = _dataset_binary_integrity(db, file_id)

        jobs = (
            db.query(BinaryBuildJob)
            .filter(BinaryBuildJob.file_id == file_id)
            .order_by(BinaryBuildJob.id.desc())
            .limit(8)
            .all()
        )
        recent_build_jobs = [
            {
                "id": int(j.id),
                "status": str(j.status or ""),
                "trigger": str(j.trigger or ""),
                "attempt_count": int(j.attempt_count or 0),
                "error": (j.error or "")[:500] if j.error else None,
                "created_at": j.created_at.isoformat() if j.created_at else None,
                "finished_at": j.finished_at.isoformat() if j.finished_at else None,
            }
            for j in jobs
        ]

        chart_storage = [{"timeframe": x["timeframe"], "bytes": x["binary_bytes"]} for x in timeframes_detail]
        chart_rows = [{"timeframe": x["timeframe"], "rows": x["row_count"]} for x in timeframes_detail]

        return {
            "success": True,
            "file_id": file_id,
            "original_name": db_file.original_name,
            "description": db_file.description,
            "upload_date": db_file.upload_date.isoformat() if db_file.upload_date else None,
            "csv_storage_rows_stored": int(db_file.row_count or 0),
            "csv": {
                "filename": db_file.filename,
                "resolved_path_hint": csv_path.name,
                "exists": csv_exists,
                "bytes": csv_bytes,
                "human": _human_bytes(csv_bytes),
            },
            "binaries_total_bytes": bin_total,
            "binaries_total_human": _human_bytes(bin_total),
            "tiles_total_bytes": tiles_bytes,
            "tiles_total_human": _human_bytes(tiles_bytes),
            "tiles_path_hint": f"tiles/{file_id}/",
            "total_storage_bytes": total_storage,
            "total_storage_human": _human_bytes(total_storage),
            "ready_timeframes": ready_tf,
            "total_timeframes": len(DATASET_TIMEFRAMES),
            "coverage": coverage,
            "integrity_ok": ok,
            "integrity_issues": integrity_issues,
            "timeframes": timeframes_detail,
            "chart_storage_bytes": chart_storage,
            "chart_rows": chart_rows,
            "recent_build_jobs": recent_build_jobs,
            "pipeline": {
                "format": "Each candle is 6 × float64 (time, O, H, L, C, V) = 48 bytes in .bin files.",
                "steps": [
                    "CSV ingested under uploads/ (then optionally archived after all timeframes are ready).",
                    "Rows parsed once; 1m series is the canonical bucket; higher TFs are aggregated.",
                    "Per-timeframe binaries live under uploads/bin/; chart tiles under uploads/tiles/{id}/{tf}/.",
                    "The chart reads binaries/tiles — not the CSV at runtime — for speed.",
                ],
            },
        }
    finally:
        db.close()


@app.post("/api/admin/datasets/upload")
async def admin_upload_dataset(request: Request, csvFile: UploadFile = File(...)):
    _require_admin(request)
    return await upload_csv(request, csvFile)

@app.get("/api/admin/datasets/dukascopy-instruments")
async def admin_dukascopy_instruments(request: Request):
    """
    Curated instrument groups for the admin Dukascopy picker (indices, energy, forex).
    These are Dukascopy symbols (CFD / cash index), not crypto or CME futures contracts.
    """
    _require_admin(request)
    return {
        "success": True,
        "groups": {k: list(v) for k, v in DUKASCOPY_INSTRUMENT_GROUPS.items()},
        "note": (
            "Dukascopy lists cash index and commodity CFDs (e.g. usa500idxusd, lightcmdusd). "
            "They track major benchmarks but are not the same instruments as CME ES/NQ/CL futures."
        ),
    }


@app.post("/api/admin/datasets/fetch-dukascopy")
async def admin_fetch_dataset_from_dukascopy(payload: AdminDukascopyFetchIn, request: Request):
    _require_admin(request)

    instrument = _normalize_dukascopy_instrument(payload.instrument)
    from_dt = _parse_iso_date(payload.from_date, "from_date")
    to_dt = _parse_iso_date(payload.to_date, "to_date")

    if from_dt > to_dt:
        raise HTTPException(status_code=400, detail="from_date must be earlier than or equal to to_date")

    range_days = (to_dt - from_dt).days + 1
    if range_days > DUKASCOPY_MAX_TOTAL_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"Date range too large ({range_days} days). Max allowed per request is {DUKASCOPY_MAX_TOTAL_DAYS} days.",
        )

    if not DUKASCOPY_SCRIPT_PATH.exists():
        raise HTTPException(status_code=500, detail=f"Dukascopy script not found: {DUKASCOPY_SCRIPT_PATH}")

    node_binary = shutil.which("node")
    if not node_binary:
        raise HTTPException(status_code=500, detail="Node.js is not installed on the server")

    _dukascopy_cleanup_jobs()
    return _start_dukascopy_fetch_job(
        instrument=instrument,
        from_dt=from_dt,
        to_dt=to_dt,
        node_binary=node_binary,
    )

@app.get("/api/admin/datasets/fetch-dukascopy/{job_id}/status")
async def admin_fetch_dataset_from_dukascopy_status(job_id: str, request: Request):
    _require_admin(request)
    _dukascopy_cleanup_jobs()
    state = _dukascopy_read_job(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Dukascopy job not found or expired")
    out = dict(state)
    out["state"] = state.get("status")
    return out


@app.post("/api/admin/datasets/firstrate-fx/sync")
async def admin_firstrate_fx_sync(payload: AdminFirstrateFxSyncIn, request: Request):
    """
    Download FirstRate FX bundle (ZIP of CSVs), normalize to canonical OHLCV, register each pair as a dataset,
    and queue binary tile builds — same pipeline as CSV upload.

    Requires env FIrstrate_USERID. Optionally wipes all existing datasets first (see purge_confirmation).
    """
    _require_admin(request)
    period = (payload.period or "week").strip().lower()
    timeframe = (payload.timeframe or "1min").strip().lower()
    it = (payload.instrument_type or "fx").strip().lower()
    valid_p = {"full", "month", "week", "day"}
    valid_tf = {"1min", "5min", "30min", "1hour", "1day"}
    if period not in valid_p:
        raise HTTPException(status_code=400, detail=f"period must be one of {sorted(valid_p)}")
    if timeframe not in valid_tf:
        raise HTTPException(status_code=400, detail=f"timeframe must be one of {sorted(valid_tf)}")
    if it not in VALID_INSTRUMENT_TYPES:
        raise HTTPException(status_code=400, detail=f"instrument_type must be one of {sorted(VALID_INSTRUMENT_TYPES)}")
    adj_in = payload.adjustment
    adj_s: str | None = None
    if adj_in is not None and str(adj_in).strip():
        adj_s = str(adj_in).strip()
        if it not in {"stock", "etf"}:
            raise HTTPException(status_code=400, detail="adjustment is only valid for stock and etf")
        if adj_s not in VALID_STOCK_ADJUSTMENTS:
            raise HTTPException(
                status_code=400,
                detail=f"adjustment must be one of {sorted(VALID_STOCK_ADJUSTMENTS)}",
            )
    pair_list = list(payload.pairs) if payload.pairs else []
    return _start_firstrate_fx_import_job(
        period=period,
        timeframe=timeframe,
        instrument_type=it,
        adjustment=adj_s,
        delete_existing_first=bool(payload.delete_existing_first),
        purge_confirmation=payload.purge_confirmation,
        ticker_range=payload.ticker_range,
        download_timeout_sec=payload.download_timeout_sec,
        upsert_existing=bool(payload.upsert_existing),
        trigger="manual",
        pairs=pair_list,
        skip_fresh_existing=bool(payload.skip_fresh_existing),
        skip_all_existing=bool(payload.skip_all_existing),
    )


@app.get("/api/admin/datasets/firstrate-fx/pair-check")
async def admin_firstrate_fx_pair_check(
    request: Request,
    instrument_type: str = Query("fx"),
    pairs: str = Query("", description="Comma-separated tickers to check"),
    skip_fresh: bool = Query(True),
    skip_all_existing: bool = Query(False),
):
    """
    Compare a ticker list against the dataset registry before import.
    Returns which symbols would be downloaded vs skipped (fresh / already present).
    """
    _require_admin(request)
    it = (instrument_type or "fx").strip().lower()
    if it not in VALID_INSTRUMENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"instrument_type must be one of {sorted(VALID_INSTRUMENT_TYPES)}",
        )
    raw_pairs = [p.strip() for p in re.split(r"[\s,;]+", pairs or "") if p.strip()]
    plan = _firstrate_plan_pair_import(
        it,
        raw_pairs,
        skip_fresh=bool(skip_fresh),
        skip_all_existing=bool(skip_all_existing),
    )
    return {"success": True, "plan": plan}


@app.get("/api/admin/datasets/firstrate-fx/live-status")
async def admin_firstrate_fx_live_status(request: Request):
    """
    Poll for active FirstRate import jobs + recent completions (for admin dashboard live progress).
    """
    _require_admin(request)
    _firstrate_cleanup_jobs()
    active: list[dict] = []
    recent: list[dict] = []
    paths = sorted(FIrstrate_JOBS_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True)
    for p in paths[:80]:
        try:
            with open(p, "r", encoding="utf-8") as f:
                st = json.load(f)
            st["job_file"] = p.name
            st["_mtime"] = p.stat().st_mtime
            st_status = str(st.get("status") or "")
            if st_status in ("queued", "running"):
                active.append(st)
            elif st_status in ("done", "failed"):
                recent.append(st)
        except Exception:
            continue
    active.sort(key=lambda x: str(x.get("updated_at") or ""), reverse=True)
    recent = sorted(recent, key=lambda x: float(x.get("_mtime") or 0), reverse=True)[:8]
    sch = _load_firstrate_schedule()
    primary = active[0] if active else None
    if primary and str(primary.get("status")) == "running":
        prog_raw = primary.get("last_files_done_at") or primary.get("created_at")
        prog_at = _firstrate_parse_job_utc(str(prog_raw) if prog_raw else None)
        if prog_at:
            file_elapsed = (datetime.utcnow() - prog_at).total_seconds()
            primary["seconds_since_file_progress"] = int(max(0, file_elapsed))
        hb_raw = primary.get("heartbeat_at") or primary.get("updated_at")
        hb_at = _firstrate_parse_job_utc(str(hb_raw) if hb_raw else None)
        if hb_at:
            primary["seconds_since_heartbeat"] = int(
                max(0, (datetime.utcnow() - hb_at).total_seconds())
            )
        try:
            phase = str(primary.get("phase") or "").lower()
            file_elapsed = float(primary.get("seconds_since_file_progress") or 0)
            stuck_file_min = max(30, int(os.getenv("FIrstrate_STUCK_FILE_MINUTES", "90")))
            if phase in ("normalize", "binary") and file_elapsed > stuck_file_min * 60:
                cur = primary.get("current_file") or "?"
                done = int(primary.get("files_done") or 0)
                total = int(primary.get("files_total") or 0)
                primary["likely_stuck"] = True
                primary["stuck_hint"] = (
                    f"No file progress for {int(file_elapsed / 60)} min "
                    f"({done}/{total} files, on {cur}) — will auto-fail at "
                    f"{stuck_file_min} min; merge may be skipped on timeout after deploy."
                )
            elif phase in ("normalize", "binary") and file_elapsed > 20 * 60:
                primary["slow_but_active"] = True
        except Exception:
            pass
    return {
        "success": True,
        "has_firstrate_userid": bool(get_firstrate_userid()),
        "active_jobs": active,
        "recent_jobs": recent,
        "primary_job": primary,
        "schedule": sch,
    }


def _sync_1m_aggregate_end_ts_from_csv(file_id: int, csv_path: Path) -> bool:
    """
    After a CSV merge, update the 1m aggregate last-bar from disk immediately.

    Chart binaries are queued async (`defer_binary_build`); without this, nightly
    health keeps showing Friday's `end_ts` until the worker finishes (hours).
    """
    disk_ts = _tail_csv_last_timestamp_ms(csv_path)
    if disk_ts is None:
        return False
    db = SessionLocal()
    try:
        agg = (
            db.query(CSVAggregate)
            .filter(CSVAggregate.file_id == int(file_id), CSVAggregate.timeframe == "1m")
            .first()
        )
        if agg is None:
            return False
        agg.end_ts = float(disk_ts)
        try:
            agg.row_count = int(count_csv_rows(str(csv_path)))
        except Exception:
            pass
        db.commit()
        return True
    except Exception:
        return False
    finally:
        db.close()


def _tail_csv_last_timestamp_ms(path: Path) -> float | None:
    """
    Cheaply read the last non-empty data row from a CSV and parse its first
    column as a UTC timestamp. Used by the nightly-health Refresh button when
    `?rescan=1` is set, so an admin can force a live disk check instead of
    trusting the cached CSVAggregate.end_ts.

    Returns epoch ms or None. Reads at most the final 64 KB of the file, which
    is always enough for 1m data (avg row ~40 bytes → ~1600 rows tail).
    """
    try:
        sz = path.stat().st_size
    except Exception:
        return None
    if sz <= 0:
        return None
    try:
        with open(path, "rb") as fh:
            fh.seek(max(0, sz - 65536))
            chunk = fh.read()
    except Exception:
        return None
    try:
        text = chunk.decode("utf-8", errors="replace")
    except Exception:
        return None
    for ln in reversed(text.splitlines()):
        s = ln.strip()
        if not s:
            continue
        first = s.split(",", 1)[0].strip().strip('"').strip("'")
        if not first or first.lower() in {"timestamp", "datetime", "date", "time"}:
            continue
        # Numeric epoch (seconds or ms)
        try:
            n = float(first)
            if n > 1e12:          # already ms
                return n
            if n > 1e9:           # seconds → ms
                return n * 1000.0
        except ValueError:
            pass
        # ISO / "YYYY-MM-DD HH:MM[:SS]"
        try:
            iso = first.replace("Z", "+00:00").replace(" ", "T", 1)
            dt = datetime.fromisoformat(iso)
            if dt.tzinfo is not None:
                dt = dt.astimezone(tz=None).replace(tzinfo=None)
            return dt.timestamp() * 1000.0
        except Exception:
            return None
    return None


@app.get("/api/admin/datasets/firstrate-fx/nightly-health")
async def admin_firstrate_fx_nightly_health(request: Request, rescan: int = 0):
    """
    Per-asset visualization of the nightly auto-sync outcome.

    For every FirstRate-classified dataset in the registry, reports:
      * canonical ticker + asset class
      * latest 1m-bar timestamp (from the CSVAggregate row — no CSV scan)
      * staleness in hours vs. now (UTC)
      * most recent scheduled import job touching the dataset's asset class,
        and the per-ticker merge stats recorded by that job

    Also aggregates per-asset-class summary counts (fresh / stale / missing)
    so the admin UI can render badge totals without re-bucketing client-side.

    "fresh"   = staleness ≤ 48 h  (a nightly job ran recently and merged bars)
    "stale"   = 48 h < staleness ≤ 7 d
    "missing" = staleness > 7 d or no 1m coverage at all

    When `rescan=1`, each dataset's raw 1m CSV is tail-read from disk and the
    resulting last-bar timestamp is compared against (and overrides) the cached
    aggregate. The aggregate row is also updated opportunistically so the next
    non-rescan request sees the fresh value.
    """
    _require_admin(request)
    now = datetime.utcnow()
    now_ms = now.timestamp() * 1000.0
    cfg = _load_firstrate_schedule()
    force_rescan = bool(rescan)

    # --- Index the most recent FirstRate jobs per instrument_type. ----------
    # We only care about the job files that went through `_firstrate_write_job`
    # so they all carry `instrument_type`, `trigger`, and (now) `merge_summary`.
    latest_job_by_type: dict[str, dict] = {}
    try:
        job_paths = sorted(
            FIrstrate_JOBS_DIR.glob("*.json"),
            key=lambda x: x.stat().st_mtime,
            reverse=True,
        )
    except Exception:
        job_paths = []
    for jp in job_paths[:200]:
        try:
            with open(jp, "r", encoding="utf-8") as f:
                st = json.load(f)
        except Exception:
            continue
        it = str(st.get("instrument_type") or "").strip().lower()
        if not it:
            continue
        if it in latest_job_by_type:
            continue  # paths are pre-sorted newest-first
        latest_job_by_type[it] = st

    # --- Walk the dataset registry and join against 1m aggregates. ----------
    db = SessionLocal()
    try:
        files = db.query(CSVFile).all()
        aggs = (
            db.query(CSVAggregate)
            .filter(CSVAggregate.timeframe == "1m")
            .all()
        )
    finally:
        db.close()
    agg_by_file = {int(a.file_id): a for a in aggs}

    datasets: list[dict] = []
    unclassified: list[dict] = []
    rescan_updates = 0  # count of aggregates refreshed from disk this call
    for f in files:
        ticker = _firstrate_extract_ticker_from_filename(f.original_name or "")
        asset_class = _firstrate_classify_ticker(ticker) if ticker else None
        if not asset_class:
            unclassified.append({
                "id": int(f.id),
                "original_name": f.original_name or "",
                "filename": f.filename or "",
                "row_count": int(f.row_count or 0),
                "upload_date": f.upload_date.isoformat() if f.upload_date else None,
                "extracted_ticker": ticker or None,
            })
            continue

        agg = agg_by_file.get(int(f.id))
        last_ts = None
        row_count_1m = 0
        last_ts_source = "aggregate"
        if agg is not None and agg.end_ts is not None:
            try:
                last_ts = float(agg.end_ts)
                row_count_1m = int(agg.row_count or 0)
            except (TypeError, ValueError):
                last_ts = None

        # Rescan mode: tail the raw CSV to get the authoritative last bar and
        # opportunistically heal the CSVAggregate if it has drifted.
        if force_rescan and f.filename:
            csv_path = UPLOAD_DIR / f.filename
            disk_ts = _tail_csv_last_timestamp_ms(csv_path)
            if disk_ts is not None:
                last_ts_source = "disk"
                prev_ts = last_ts
                last_ts = disk_ts
                # Only persist if we meaningfully drifted (> 30s) and the
                # aggregate row exists. We don't create new aggregate rows from
                # here — that's the import pipeline's job.
                if agg is not None and (prev_ts is None or abs(disk_ts - (prev_ts or 0)) > 30_000):
                    try:
                        db2 = SessionLocal()
                        try:
                            live = db2.query(CSVAggregate).filter(CSVAggregate.id == agg.id).first()
                            if live is not None:
                                live.end_ts = disk_ts
                                db2.commit()
                                rescan_updates += 1
                        finally:
                            db2.close()
                    except Exception:
                        pass

        staleness_hours: float | None = None
        if last_ts is not None:
            staleness_hours = max(0.0, (now_ms - last_ts) / 3_600_000.0)

        # Freshness bucket (see docstring above).
        if staleness_hours is None or staleness_hours > 24 * 7:
            freshness = "missing"
        elif staleness_hours > 48:
            freshness = "stale"
        else:
            freshness = "fresh"

        # Pull merge stats for this dataset out of the latest matching job.
        job = latest_job_by_type.get(asset_class)
        merge_info = None
        if job and isinstance(job.get("merge_summary"), dict):
            # Jobs key merge rows by `<ticker>_<timeframe>.csv`; scan for any
            # entry that matches the dataset's original_name or ticker stem.
            target_name = (f.original_name or "").lower()
            for k, v in job["merge_summary"].items():
                if not isinstance(v, dict):
                    continue
                if str(k).lower() == target_name or (
                    v.get("ticker") and str(v["ticker"]).lower() == ticker.lower()
                ):
                    merge_info = v
                    break

        datasets.append({
            "id": int(f.id),
            "ticker": ticker,
            "asset_class": asset_class,
            "original_name": f.original_name,
            "row_count": int(f.row_count or 0),
            "row_count_1m": row_count_1m,
            "last_bar_iso": _epoch_ms_to_iso_utc(last_ts) if last_ts is not None else None,
            "last_bar_ms": last_ts,
            "last_bar_source": last_ts_source,
            "staleness_hours": round(staleness_hours, 2) if staleness_hours is not None else None,
            "freshness": freshness,
            "last_job": (
                {
                    "job_id": job.get("job_id"),
                    "status": job.get("status"),
                    "trigger": job.get("trigger"),
                    "updated_at": job.get("updated_at"),
                    "period": job.get("period"),
                    "timeframe": job.get("timeframe"),
                    "message": (job.get("message") or "")[:300],
                    "error": (job.get("error") or "")[:300] or None,
                }
                if job else None
            ),
            "merge": merge_info,
        })

    # Sort so unhealthy rows float to the top of each class.
    freshness_rank = {"missing": 0, "stale": 1, "fresh": 2}
    datasets.sort(key=lambda d: (d["asset_class"], freshness_rank.get(d["freshness"], 3), d["ticker"]))

    # --- Per-class summary. --------------------------------------------------
    classes: dict[str, dict] = {}
    for d in datasets:
        c = d["asset_class"]
        slot = classes.setdefault(c, {
            "asset_class": c,
            "ticker_count": 0,
            "fresh_count": 0,
            "stale_count": 0,
            "missing_count": 0,
            "total_new_rows_last_run": 0,
            "last_job": None,
        })
        slot["ticker_count"] += 1
        slot[f"{d['freshness']}_count"] += 1
        if d.get("merge"):
            slot["total_new_rows_last_run"] += int(d["merge"].get("new_rows_added") or 0)
        if slot["last_job"] is None and d.get("last_job"):
            slot["last_job"] = d["last_job"]

    return {
        "success": True,
        "generated_at": now.isoformat() + "Z",
        "rescanned": force_rescan,
        "rescan_updates": rescan_updates,
        "schedule": {
            "enabled": bool(cfg.get("enabled")),
            "mode": cfg.get("mode"),
            "nightly_utc_hour": cfg.get("nightly_utc_hour"),
            "auto_all_types": cfg.get("auto_all_types"),
            "last_run_date": cfg.get("last_run_date"),
            "last_run_types_today": cfg.get("last_run_types_today") or [],
            "last_run_started_at": cfg.get("last_run_started_at"),
            "last_run_finished_at": cfg.get("last_run_finished_at"),
            "last_status": cfg.get("last_status"),
            "last_error": cfg.get("last_error"),
        },
        "summary": {
            # Rows in this panel (FirstRate-bucketable instruments only).
            "dataset_count": len(datasets),
            # Every CSV in `csv_files` — matches Dataset registry card "Datasets".
            "registry_csv_total": len(files),
            # Datasets omitted here: filename/ticker did not map to fx|crypto|futures|stock
            # (manual uploads, Dukascopy-only names, exotic symbols, etc.).
            "excluded_not_classified_count": max(0, len(files) - len(datasets)),
            "fresh_count": sum(c["fresh_count"] for c in classes.values()),
            "stale_count": sum(c["stale_count"] for c in classes.values()),
            "missing_count": sum(c["missing_count"] for c in classes.values()),
            "asset_class_count": len(classes),
        },
        "classes": sorted(classes.values(), key=lambda c: c["asset_class"]),
        "datasets": datasets,
        "unclassified": sorted(unclassified, key=lambda u: (u["original_name"] or "").lower()),
    }


@app.get("/api/admin/datasets/firstrate-fx/schedule")
async def admin_firstrate_fx_schedule_get(request: Request):
    """
    Read auto-sync settings (VPS). File: uploads/firstrate_schedule.json

    Also returns a `nightly_preview` summary so the admin UI can show what the
    next nightly run will pull (bucketed tickers per asset class) without
    having to call the vendor.
    """
    _require_admin(request)
    cfg = _load_firstrate_schedule()
    buckets = _firstrate_classify_existing_datasets()
    total_tickers = sum(len(v) for v in buckets.values())
    return {
        "success": True,
        "schedule": cfg,
        "has_firstrate_userid": bool(get_firstrate_userid()),
        "nightly_preview": {
            "buckets": buckets,                 # {"fx": [...], "crypto": [...], ...}
            "type_count": len(buckets),
            "ticker_count": total_tickers,
        },
    }


@app.put("/api/admin/datasets/firstrate-fx/schedule")
async def admin_firstrate_fx_schedule_put(payload: AdminFirstrateScheduleIn, request: Request):
    """Update auto-sync; changes apply on the next scheduler tick (within ~1 minute)."""
    _require_admin(request)
    valid_p = {"full", "month", "week", "day"}
    valid_tf = {"1min", "5min", "30min", "1hour", "1day"}
    cur = _load_firstrate_schedule()
    p = payload
    if p.enabled is not None:
        cur["enabled"] = bool(p.enabled)
    if p.mode is not None:
        m = str(p.mode).strip().lower()
        if m not in {"nightly", "interval"}:
            raise HTTPException(status_code=400, detail="mode must be 'nightly' or 'interval'")
        cur["mode"] = m
    if p.nightly_utc_hour is not None:
        cur["nightly_utc_hour"] = int(p.nightly_utc_hour)
    if p.auto_all_types is not None:
        cur["auto_all_types"] = bool(p.auto_all_types)
    if p.interval_minutes is not None:
        cur["interval_minutes"] = int(p.interval_minutes)
    if p.period is not None:
        pl = p.period.strip().lower()
        if pl not in valid_p:
            raise HTTPException(status_code=400, detail=f"period must be one of {sorted(valid_p)}")
        cur["period"] = pl
    if p.timeframe is not None:
        tf = p.timeframe.strip().lower()
        if tf not in valid_tf:
            raise HTTPException(status_code=400, detail=f"timeframe must be one of {sorted(valid_tf)}")
        cur["timeframe"] = tf
    if p.adaptive_period is not None:
        cur["adaptive_period"] = bool(p.adaptive_period)
    if p.auto_repair is not None:
        cur["auto_repair"] = bool(p.auto_repair)
    if p.instrument_type is not None:
        il = p.instrument_type.strip().lower()
        if il not in VALID_INSTRUMENT_TYPES:
            raise HTTPException(status_code=400, detail=f"instrument_type must be one of {sorted(VALID_INSTRUMENT_TYPES)}")
        cur["instrument_type"] = il
    if p.adjustment is not None:
        raw_adj = str(p.adjustment).strip()
        if not raw_adj:
            cur["adjustment"] = None
        else:
            il2 = str(cur.get("instrument_type") or "fx").strip().lower()
            if il2 not in {"stock", "etf"}:
                raise HTTPException(status_code=400, detail="adjustment is only stored for stock and etf schedules")
            if raw_adj not in VALID_STOCK_ADJUSTMENTS:
                raise HTTPException(
                    status_code=400,
                    detail=f"adjustment must be one of {sorted(VALID_STOCK_ADJUSTMENTS)}",
                )
            cur["adjustment"] = raw_adj
    if p.upsert_existing is not None:
        cur["upsert_existing"] = bool(p.upsert_existing)
    if p.delete_existing_first is not None:
        cur["delete_existing_first"] = bool(p.delete_existing_first)
    if p.purge_confirmation is not None:
        cur["purge_confirmation"] = p.purge_confirmation.strip() or None
    if p.ticker_range is not None:
        tr = p.ticker_range.strip()
        cur["ticker_range"] = tr[:1].upper() if tr else None
    if p.download_timeout_sec is not None:
        cur["download_timeout_sec"] = float(p.download_timeout_sec)
    if p.pairs is not None:
        cur["pairs"] = [str(x).strip() for x in p.pairs if str(x).strip()]
    if p.excluded_types is not None:
        cur["excluded_types"] = [str(x).strip().lower() for x in p.excluded_types if str(x).strip()]
    if cur.get("delete_existing_first") and not (cur.get("purge_confirmation") or "").strip():
        raise HTTPException(
            status_code=400,
            detail="delete_existing_first in the schedule requires a stored purge_confirmation; set it in this request.",
        )
    if str(cur.get("instrument_type") or "fx").strip().lower() not in {"stock", "etf"}:
        cur["adjustment"] = None
    _save_firstrate_schedule(cur)
    return {"success": True, "schedule": cur}


@app.get("/api/admin/datasets/firstrate-fx/ticker-listing")
async def admin_firstrate_fx_ticker_listing(request: Request, instrument_type: str = "stock"):
    """
    Proxy FirstRate `ticker_listing` (CSV) → JSON for the admin UI.
    Official docs list stock + etf; other types may error at the vendor.
    """
    _require_admin(request)
    uid = get_firstrate_userid()
    if not uid:
        raise HTTPException(status_code=503, detail="FIrstrate_USERID is not configured on this server.")
    it = (instrument_type or "stock").strip().lower()
    if it not in VALID_INSTRUMENT_TYPES:
        raise HTTPException(status_code=400, detail=f"instrument_type must be one of {sorted(VALID_INSTRUMENT_TYPES)}")
    try:
        rows = fetch_firstrate_ticker_listing_rows(userid=uid, instrument_type=it)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    total = len(rows)
    capped = rows[:MAX_TICKER_LISTING_RETURN]
    return {
        "success": True,
        "instrument_type": it,
        "count": total,
        "returned": len(capped),
        "truncated": total > len(capped),
        "rows": capped,
    }


@app.get("/api/admin/datasets/firstrate-fx/connection-status")
async def admin_firstrate_connection_status(
    request: Request,
    instrument_type: str = Query("fx", description="fx, crypto, stock, etf, futures, index"),
    period: str = Query("month", description="day, week, month, or full — used for download probe only"),
    timeframe: str = Query("1min"),
    ticker_range: str | None = Query(None, description="A–Z letter for stock/etf full bundles"),
    adjustment: str | None = Query(None, description="Required for futures; optional for stock/etf"),
    download_probe: bool = Query(True, description="Peek first KB of a data_file ZIP (validates download auth)"),
):
    """
    Admin diagnostics: confirm FIrstrate_USERID, reachability of FirstRate APIs, and
    whether `data_file` returns a ZIP for the chosen bundle parameters.
    """
    _require_admin(request)
    uid = get_firstrate_userid()
    tr = (ticker_range or "").strip().upper()[:1] or None
    adj = (adjustment or "").strip() or None
    try:
        report = run_firstrate_connection_checks(
            userid=uid,
            instrument_type=instrument_type,
            period=period,
            timeframe=timeframe,
            ticker_range=tr,
            adjustment=adj,
            include_download_probe=bool(download_probe),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"success": True, **report}


@app.get("/api/admin/datasets/pipeline-diagnostics")
async def admin_pipeline_diagnostics(request: Request):
    """
    VPS-style snapshot: active FirstRate import, binary queue depth, datasets stuck
    in Building, disk space, and reclaim counts for stuck jobs.
    """
    _require_admin(request)
    return {"success": True, **_collect_pipeline_diagnostics()}


@app.post("/api/admin/datasets/pipeline-unstick")
async def admin_pipeline_unstick(request: Request):
    """Force-fail active imports (no 60 min wait), reclaim binaries, clear repair cooldowns."""
    _require_admin(request)
    import_r = _firstrate_force_fail_running_import_jobs(
        "Admin Unstick: import cancelled so stale repair can run"
    )
    import_r += _firstrate_reclaim_stuck_import_jobs()
    binary_r = _reclaim_stale_binary_build_jobs(stale_minutes=30)
    redundant_r = _sweep_redundant_binary_jobs()
    try:
        cfg = _load_firstrate_schedule()
        cfg["type_failure_cooldown_until"] = {}
        cfg["last_error"] = None
        cfg["last_message"] = "Unstick: import lock cleared — stale-only auto-sync will resume"
        _save_firstrate_schedule(cfg)
        repair_queued = _firstrate_try_queue_auto_repair(cfg)
    except Exception:
        repair_queued = False
    diag = _collect_pipeline_diagnostics()
    return {
        "success": True,
        "reclaimed": {
            "firstrate_import_jobs": import_r,
            "binary_build_jobs": binary_r,
            "redundant_binary_jobs_cleared": redundant_r,
        },
        "stale_repair_queued": bool(repair_queued),
        **diag,
    }


@app.post("/api/admin/datasets/firstrate-fx/repair-stale-now")
async def admin_firstrate_repair_stale_now(
    request: Request,
    prefer_class: str | None = None,
):
    """
    Clear import lock, then queue one stale-only repair job (highest-priority asset class).
    Use when auto-sync appears stuck or Fix issues returns 'import already running'.
    """
    _require_admin(request)
    if not get_firstrate_userid():
        raise HTTPException(
            status_code=400,
            detail="Set FIrstrate_USERID on the trading-chart container.",
        )
    forced = _firstrate_force_fail_running_import_jobs(
        "Repair stale now: cancelled blocking import"
    )
    _firstrate_reclaim_stuck_import_jobs()
    cfg = _load_firstrate_schedule()
    cfg["type_failure_cooldown_until"] = {}
    cfg["auto_repair"] = True
    _save_firstrate_schedule(cfg)
    if _firstrate_has_active_import_job():
        raise HTTPException(
            status_code=409,
            detail=(
                "Import still marked active after force-cancel. "
                "Restart trading-chart: docker compose restart trading-chart"
            ),
        )
    prefer = (prefer_class or "").strip().lower()
    queued = False
    if prefer and prefer in VALID_INSTRUMENT_TYPES:
        pair_list, stats, stale_only = _firstrate_auto_repair_pair_list(prefer)
        if pair_list and not _firstrate_has_active_import_job():
            period = _firstrate_period_for_repair_stats(
                stats, trigger="stale_auto", stale_only_job=stale_only
            )
            _firstrate_queue_scheduled_import_for_type(
                cfg=cfg,
                next_type=prefer,
                pair_list=pair_list,
                adjustment=_firstrate_default_adjustment_for(prefer),
                period_override=period,
                trigger="stale_auto",
                force_download=True,
            )
            cfg["last_auto_repair_class"] = prefer
            _save_firstrate_schedule(cfg)
            queued = True
    if not queued:
        queued = _firstrate_try_queue_auto_repair(cfg)
    if not queued:
        detail = "No stale/missing tickers to repair, or all classes are in cooldown."
        if not cfg.get("enabled"):
            detail += " Enable automatic schedule + 24/7 stale-only auto-sync."
        raise HTTPException(status_code=400, detail=detail)
    cfg2 = _load_firstrate_schedule()
    return {
        "success": True,
        "forced_cancelled_imports": forced,
        "queued": True,
        "message": cfg2.get("last_message") or "Stale-only repair queued",
    }


@app.get("/api/admin/datasets/firstrate-fx/last-update")
async def admin_firstrate_last_update(
    request: Request,
    instrument_type: str = Query("crypto", description="stock, etf, futures, crypto, index, or fx"),
    is_full_update: bool = Query(False, description="True → date of last full-history rebuild; False → rolling update bundles"),
):
    """
    Proxy FirstRate `last_update` so the admin UI can check whether a fresh
    download is worth making before kicking off an import. Returns the vendor's
    raw date plus an ISO-normalized version when parseable.

    Docs: https://firstratedata.com/about/api-docs  (section "Last Update")
    Example: /api/admin/datasets/firstrate-fx/last-update?instrument_type=crypto
    """
    _require_admin(request)
    uid = get_firstrate_userid()
    if not uid:
        raise HTTPException(status_code=503, detail="FIrstrate_USERID is not configured on this server.")
    try:
        info = fetch_firstrate_last_update(
            userid=uid,
            instrument_type=instrument_type,
            is_full_update=bool(is_full_update),
        )
    except ValueError as e:
        # Bad `type` → client error; vendor errors → upstream bad-gateway.
        msg = str(e)
        if msg.startswith("type must be"):
            raise HTTPException(status_code=400, detail=msg) from e
        raise HTTPException(status_code=502, detail=msg) from e
    return {"success": True, **info}


@app.get("/api/admin/datasets/firstrate-fx/{job_id}/status")
async def admin_firstrate_fx_job_status(job_id: str, request: Request):
    _require_admin(request)
    _firstrate_cleanup_jobs()
    state = _firstrate_read_job(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="FirstRate job not found or expired")
    out = dict(state)
    out["state"] = state.get("status")
    return out


@app.post("/api/admin/datasets/purge-all")
async def admin_purge_all_datasets(payload: AdminPurgeDatasetsIn, request: Request):
    """
    Delete every dataset from the registry (same as deleting each csv_files row). Useful before a full FirstRate re-import.
    """
    _require_admin(request)
    expected = (DATASET_PURGE_CONFIRMATION or "").strip()
    if (payload.confirmation or "").strip() != expected:
        raise HTTPException(
            status_code=400,
            detail=f"confirmation must exactly equal {expected!r}",
        )
    summary = _purge_all_chart_datasets()
    summary["success"] = True
    return summary


@app.get("/api/admin/datasets/binance-symbols")
async def admin_binance_exchange_symbols(request: Request, asset_class: str = Query("spot")):
    """
    List tradable symbols for the given Binance asset class (spot / um / cm).
    Uses the same source as binance-historical-data (Binance public exchangeInfo). Cached briefly.
    """
    _require_admin(request)
    ac = (asset_class or "spot").strip().lower()
    if ac not in ("spot", "um", "cm"):
        raise HTTPException(status_code=400, detail="asset_class must be spot, um, or cm")
    now = time.time()
    cached = _BINANCE_SYMBOLS_CACHE.get(ac)
    if cached and (now - cached[0]) < BINANCE_SYMBOLS_CACHE_TTL:
        return {"success": True, "asset_class": ac, "symbols": cached[1], "cached": True}

    try:
        from binance_historical_data import BinanceDataDumper

        dumper = BinanceDataDumper(
            path_dir_where_to_dump=str(UPLOAD_DIR.resolve()),
            asset_class=ac,
            data_type="klines",
            data_frequency="1m",
        )
        raw = dumper.get_list_all_trading_pairs()
        symbols = sorted({str(s).strip().upper() for s in (raw or []) if s})
        _BINANCE_SYMBOLS_CACHE[ac] = (now, symbols)
        return {"success": True, "asset_class": ac, "symbols": symbols, "cached": False}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not load Binance symbols: {exc}") from exc


@app.post("/api/admin/datasets/fetch-binance")
async def admin_fetch_dataset_from_binance(payload: AdminBinanceFetchIn, request: Request):
    _require_admin(request)

    tickers = _normalize_binance_tickers_required(payload.tickers)
    asset_class = (payload.asset_class or "spot").strip().lower()
    if asset_class not in ("spot", "um", "cm"):
        raise HTTPException(status_code=400, detail="asset_class must be spot, um, or cm")
    data_frequency = (payload.data_frequency or "1m").strip()
    if data_frequency not in BINANCE_ALLOWED_FREQUENCIES:
        raise HTTPException(status_code=400, detail=f"Unsupported data_frequency: {data_frequency}")

    data_type = (payload.data_type or "klines").strip() or "klines"
    if asset_class == "spot":
        if data_type not in BINANCE_FETCH_DATA_TYPES_SPOT:
            raise HTTPException(
                status_code=400,
                detail="For spot, data_type must be klines (futures series are not available on spot).",
            )
    else:
        if data_type not in BINANCE_FETCH_DATA_TYPES_FUTURES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid data_type for futures: {data_type}. "
                f"Use one of: {', '.join(sorted(BINANCE_FETCH_DATA_TYPES_FUTURES))}.",
            )

    from_dt = _parse_iso_date(payload.from_date, "from_date")
    to_dt = _parse_iso_date(payload.to_date, "to_date")
    if from_dt > to_dt:
        raise HTTPException(status_code=400, detail="from_date must be earlier than or equal to to_date")

    range_days = (to_dt - from_dt).days + 1
    if range_days > BINANCE_MAX_TOTAL_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"Date range too large ({range_days} days). Max allowed per request is {BINANCE_MAX_TOTAL_DAYS} days.",
        )

    excl = _normalize_binance_exclude_tickers(payload.tickers_to_exclude)
    _binance_cleanup_jobs()
    return _start_binance_fetch_job(
        tickers=tickers,
        asset_class=asset_class,
        data_frequency=data_frequency,
        data_type=data_type,
        from_dt=from_dt,
        to_dt=to_dt,
        is_to_update_existing=bool(payload.is_to_update_existing),
        tickers_to_exclude=excl,
    )


@app.get("/api/admin/datasets/fetch-binance/{job_id}/status")
async def admin_fetch_binance_status(job_id: str, request: Request):
    _require_admin(request)
    _binance_cleanup_jobs()
    state = _binance_read_job(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Binance job not found or expired")
    out = dict(state)
    out["state"] = state.get("status")
    return out


@app.get("/api/admin/datasets/yahoo-cme-instruments")
async def admin_yahoo_cme_instruments(request: Request):
    """
    Curated Yahoo Finance tickers for CME-style continuous futures (=F).
    Data is from Yahoo/ICE/Barchart aggregation — not CME DataMine tape.
    """
    _require_admin(request)
    return {
        "success": True,
        "groups": {k: list(v) for k, v in YAHOO_CME_INSTRUMENT_GROUPS.items()},
        "allowed_intervals": sorted(YAHOO_CME_ALLOWED_INTERVALS),
        "note": (
            "Symbols ending in =F are Yahoo continuous futures (rolled). "
            "Downloads are split into small date windows with pauses between requests (like Dukascopy forex chunking); "
            "tune YAHOO_CME_CHUNK_DAYS_* / YAHOO_CME_CHUNK_SLEEP_SECONDS if Yahoo still rate-limits."
        ),
    }


@app.get("/api/admin/datasets/yahoo-cme/active")
async def admin_yahoo_cme_active_job(request: Request):
    """
    Latest in-progress Yahoo job so the dashboard can resume status polling after a page reload.
    """
    _require_admin(request)
    job = _yahoo_cme_find_latest_active_job()
    return {"success": True, "job": job}


@app.post("/api/admin/datasets/fetch-yahoo-cme")
async def admin_fetch_yahoo_cme(payload: AdminYahooCmeFetchIn, request: Request):
    """
    Download historical OHLC for a Yahoo CME continuous future into the normal dataset pipeline.
    """
    _require_admin(request)

    ticker = _normalize_yahoo_cme_ticker(payload.ticker)
    interval = _normalize_yahoo_cme_interval(payload.interval)
    from_dt = _parse_iso_date(payload.from_date, "from_date")
    to_dt = _parse_iso_date(payload.to_date, "to_date")

    if from_dt > to_dt:
        raise HTTPException(status_code=400, detail="from_date must be earlier than or equal to to_date")

    range_days = (to_dt - from_dt).days + 1
    if range_days > YAHOO_CME_MAX_TOTAL_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"Date range too large ({range_days} days). Max allowed per request is {YAHOO_CME_MAX_TOTAL_DAYS} days.",
        )

    try:
        import pandas  # noqa: F401 — ensure stack matches requirements before starting background job
        import yfinance  # noqa: F401
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail="yfinance/pandas are required for Yahoo futures download. Install chart requirements.txt.",
        ) from exc

    pending = _yahoo_cme_find_latest_active_job()
    if pending and pending.get("status") in ("queued", "running"):
        raise HTTPException(
            status_code=409,
            detail=(
                "A Yahoo futures download is already running on the server. "
                "Reload this page to reconnect to live progress without starting a second job."
            ),
        )

    _yahoo_cme_cleanup_jobs()
    return _start_yahoo_cme_fetch_job(ticker=ticker, from_dt=from_dt, to_dt=to_dt, interval=interval)


@app.get("/api/admin/datasets/fetch-yahoo-cme/{job_id}/status")
async def admin_fetch_yahoo_cme_status(job_id: str, request: Request):
    _require_admin(request)
    _yahoo_cme_cleanup_jobs()
    state = _yahoo_cme_read_job(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Yahoo futures job not found or expired")
    out = dict(state)
    out["state"] = state.get("status")
    return out


@app.patch("/api/admin/datasets/{file_id}/settings")
async def admin_update_dataset_settings(file_id: int, payload: AdminDatasetSettingsIn, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        db_file = db.query(CSVFile).filter(CSVFile.id == file_id).first()
        if not db_file:
            raise HTTPException(status_code=404, detail="File not found")

        settings = db.query(DatasetSettings).filter(DatasetSettings.file_id == file_id).first()
        if not settings:
            settings = DatasetSettings(file_id=file_id)
            db.add(settings)

        if payload.display_name is not None:
            settings.display_name = payload.display_name.strip() or None

        if payload.csv_delimiter is not None:
            delim = payload.csv_delimiter.strip()
            if delim == "\\t":
                delim = "\t"
            if len(delim) != 1:
                raise HTTPException(status_code=400, detail="csv_delimiter must be a single character (or \\t)")
            settings.csv_delimiter = delim

        if payload.datetime_format is not None:
            settings.datetime_format = payload.datetime_format.strip() or None

        if payload.csv_timezone is not None:
            settings.csv_timezone = payload.csv_timezone.strip() or "UTC"

        if payload.csv_has_header is not None:
            settings.csv_has_header = bool(payload.csv_has_header)

        if payload.is_active is not None:
            settings.is_active = bool(payload.is_active)

        if payload.notes is not None:
            settings.notes = payload.notes.strip() or None

        db.commit()
        db.refresh(settings)

        return {
            "success": True,
            "file_id": file_id,
            "settings": _dataset_settings_public_dict(settings, db_file),
        }
    finally:
        db.close()

@app.post("/api/admin/datasets/{file_id}/rebuild-binary")
async def admin_rebuild_dataset_binary(file_id: int, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        db_file = db.query(CSVFile).filter(CSVFile.id == file_id).first()
        if not db_file:
            raise HTTPException(status_code=404, detail="File not found")

        file_path = _resolve_dataset_csv_for_file(db_file)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")

        db.query(CSVAggregate).filter(CSVAggregate.file_id == file_id).update({"status": "pending"})
        db.commit()

        build_binary_for_file(
            file_id,
            file_path,
            db_file.original_name,
            trigger="admin_rebuild",
            force=True,
        )

        return {
            "success": True,
            "message": "Binary rebuild started in background",
            "file_id": file_id,
        }
    finally:
        db.close()


@app.post("/api/admin/datasets/{file_id}/questdb-sync")
async def admin_questdb_sync_dataset(file_id: int, request: Request, force: bool = False):
    _require_admin(request)
    db = SessionLocal()
    try:
        db_file = db.query(CSVFile).filter(CSVFile.id == file_id).first()
        if not db_file:
            raise HTTPException(status_code=404, detail="File not found")
        result = _questdb_sync_file_from_csv(db_file, force=force)
        return {"success": True, **result}
    finally:
        db.close()

# ═══════════════════════════════════════════════════════════════════
#  ADMIN — FirstRate duplicate cleanup
#
# Two endpoints powering the admin-side dedup tool:
#
#   GET  /api/admin/datasets/duplicates
#         Read-only scan. Groups FirstRate-imported `csv_files` rows by
#         (canonical_ticker, asset_class) and returns groups with ≥2 members
#         along with a suggested winner per group (the densest row). The
#         caller (admin UI) renders this as a per-group decision form.
#
#   POST /api/admin/datasets/duplicates/consolidate
#         Body: {
#           groups: [{ ticker, asset_class, winner_id, loser_ids: [...] }, ...],
#           dry_run: bool,
#           confirmation: str   # required when dry_run=false
#         }
#         When `dry_run=true`: simulates each merge in a temp dir and reports
#         projected row counts. No disk/DB changes.
#         When `dry_run=false` AND `confirmation == DATASET_PURGE_CONFIRMATION`:
#         pre-merge-backs-up each winner CSV under
#         `uploads/_quarantine/<consolidation_id>/groups/<class>_<ticker>/winners_pre_merge/`,
#         merges every loser CSV into the winner via
#         `_merge_canonical_ohlcv_csvs`, rebuilds the winner's binaries, and
#         then quarantines (moves) every loser's CSV + binaries + tile dir
#         under the same quarantine subtree before deleting the loser DB
#         rows. The big historical dataset is always the winner — losers are
#         the smaller/newer duplicates created when older imports landed
#         under different filename shapes.
# ═══════════════════════════════════════════════════════════════════


@app.get("/api/admin/datasets/duplicates")
async def admin_dataset_duplicates(request: Request):
    """
    Read-only scan for FirstRate duplicate dataset rows. Returns groups keyed
    by `(canonical_ticker, asset_class)` with ≥2 members. The admin UI uses
    this to render a manual winner-selection form.

    Also surfaces the currently-configured `DATASET_PURGE_CONFIRMATION` value
    in the response so the admin UI can pre-fill the consolidate phrase
    without forcing the operator to retype a long string. This is safe to
    expose to admin-authenticated callers because they can already invoke
    the destructive consolidate endpoint with that same phrase — knowing
    the value here grants no additional capability beyond what the same
    request already has via `_require_admin`.
    """
    _require_admin(request)
    groups = _collect_firstrate_duplicate_groups()
    duplicate_row_count = sum(max(0, len(g["rows"]) - 1) for g in groups)
    return {
        "success": True,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "groups": groups,
        "summary": {
            "duplicate_group_count": len(groups),
            "duplicate_row_count": duplicate_row_count,
            "total_firstrate_rows_in_groups": sum(len(g["rows"]) for g in groups),
        },
        "policy": {
            "confirmation_phrase": (DATASET_PURGE_CONFIRMATION or "").strip(),
            "quarantine_root": str(QUARANTINE_DIR),
        },
    }


class _ConsolidateGroupIn(BaseModel):
    ticker: str
    asset_class: str
    winner_id: int
    loser_ids: list[int]


class _ConsolidateDuplicatesIn(BaseModel):
    groups: list[_ConsolidateGroupIn]
    dry_run: bool = True
    confirmation: str | None = None


@app.post("/api/admin/datasets/duplicates/consolidate")
async def admin_dataset_duplicates_consolidate(
    payload: _ConsolidateDuplicatesIn, request: Request
):
    """
    Consolidate one or more FirstRate duplicate groups. Always supports
    dry-run; when `dry_run=False`, the request is rejected unless
    `confirmation` matches `DATASET_PURGE_CONFIRMATION`. Per-group failures
    do NOT abort the whole call — each group reports its own outcome so a
    partial run can be retried surgically.
    """
    _require_admin(request)

    if not payload.groups:
        raise HTTPException(status_code=400, detail="`groups` must be a non-empty list")

    if not payload.dry_run:
        expected = (DATASET_PURGE_CONFIRMATION or "").strip()
        if (payload.confirmation or "").strip() != expected:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Destructive consolidate requires `confirmation` to exactly equal "
                    f"{expected!r} (set via DATASET_PURGE_CONFIRMATION env var). "
                    "Re-issue with that phrase, or pass `dry_run: true` to preview."
                ),
            )

    # Group key includes a tag so the admin can correlate quarantine dirs back
    # to the originating call (timestamp + 6 hex chars is unique enough for
    # human inspection).
    consolidation_id = (
        datetime.utcnow().strftime("%Y%m%d%H%M%S") + "_" + secrets.token_hex(3)
    )

    results: list[dict] = []
    for g in payload.groups:
        try:
            res = _consolidate_duplicate_group(
                winner_id=int(g.winner_id),
                loser_ids=[int(x) for x in (g.loser_ids or [])],
                expected_ticker=str(g.ticker or "").upper(),
                expected_class=str(g.asset_class or "").lower(),
                consolidation_id=consolidation_id,
                dry_run=bool(payload.dry_run),
            )
            res["ticker"] = g.ticker
            res["asset_class"] = g.asset_class
            res["status"] = "ok"
            results.append(res)
        except Exception as e:
            results.append({
                "ticker": g.ticker,
                "asset_class": g.asset_class,
                "winner_id": int(g.winner_id),
                "loser_ids": list(g.loser_ids or []),
                "status": "error",
                "error": str(e)[:1500],
                "dry_run": bool(payload.dry_run),
            })

    return {
        "success": True,
        "dry_run": bool(payload.dry_run),
        "consolidation_id": consolidation_id,
        "quarantine_dir": str(QUARANTINE_DIR / consolidation_id) if not payload.dry_run else None,
        "groups": results,
        "ok_count": sum(1 for r in results if r["status"] == "ok"),
        "error_count": sum(1 for r in results if r["status"] == "error"),
    }


def _collect_all_duplicate_groups() -> list[dict]:
    """
    Like `_collect_firstrate_duplicate_groups` but scans ALL datasets regardless
    of import source. Groups by (canonical_ticker, asset_class) so Dukascopy +
    FirstRate + manual upload duplicates are all caught.
    """
    db = SessionLocal()
    try:
        files = db.query(CSVFile).all()
    finally:
        db.close()

    grouped: dict[tuple[str, str], list[dict]] = {}
    for f in files:
        ticker = (
            _firstrate_extract_ticker_from_filename(f.original_name or "") or ""
        ).upper()
        if not ticker:
            continue
        asset_class = _firstrate_classify_ticker(ticker) or ""
        if not asset_class:
            continue
        key = (ticker, asset_class)
        grouped.setdefault(key, []).append({
            "id": int(f.id),
            "original_name": f.original_name,
            "filename": f.filename,
            "row_count": int(f.row_count or 0),
        })

    out: list[dict] = []
    for (ticker, asset_class), rows in grouped.items():
        if len(rows) < 2:
            continue
        rows.sort(key=lambda r: int(r["row_count"] or 0), reverse=True)
        out.append({
            "ticker": ticker,
            "asset_class": asset_class,
            "rows": rows,
        })
    out.sort(key=lambda g: (g["asset_class"], g["ticker"]))
    return out


_CLEANUP_JOB_PATH = UPLOAD_DIR / "_cleanup_job.json"


def _write_cleanup_job(state: dict) -> None:
    state["updated_at"] = datetime.utcnow().isoformat() + "Z"
    tmp = _CLEANUP_JOB_PATH.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f)
    tmp.replace(_CLEANUP_JOB_PATH)


def _read_cleanup_job() -> dict | None:
    if not _CLEANUP_JOB_PATH.exists():
        return None
    try:
        with open(_CLEANUP_JOB_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _firstrate_queue_auto_duplicate_cleanup(*, trigger: str = "schedule") -> bool:
    """Background duplicate merge/quarantine when enabled and no other heavy job runs."""
    try:
        cfg = _load_firstrate_schedule()
        if not bool(cfg.get("auto_duplicate_cleanup", True)):
            return False
    except Exception:
        pass
    if _firstrate_has_active_import_job():
        return False
    existing = _read_cleanup_job()
    if existing and str(existing.get("status") or "") in ("running", "queued"):
        return False
    state = {
        "status": "queued",
        "phase": "scanning",
        "message": f"Auto duplicate cleanup ({trigger})…",
        "trigger": trigger,
        "started_at": datetime.utcnow().isoformat() + "Z",
        "tickers_total": 0,
        "tickers_done": 0,
        "cleaned": 0,
        "current_ticker": None,
        "current_class": None,
        "ticker_results": [],
        "errors": [],
    }
    _write_cleanup_job(state)
    threading.Thread(
        target=_run_cleanup_job_background,
        daemon=True,
        name="cleanup-duplicates-auto",
    ).start()
    return True


def _run_cleanup_job_background() -> None:
    """Background thread: runs the duplicate cleanup and writes per-ticker progress."""
    state = _read_cleanup_job()
    if not state:
        return
    try:
        groups = _collect_all_duplicate_groups()
        if not groups:
            state["status"] = "done"
            state["message"] = "No duplicates found — all clean!"
            state["tickers_total"] = 0
            state["tickers_done"] = 0
            _write_cleanup_job(state)
            return

        state["status"] = "running"
        state["tickers_total"] = len(groups)
        state["tickers_done"] = 0
        state["cleaned"] = 0
        state["ticker_results"] = []
        state["errors"] = []
        _write_cleanup_job(state)

        db = SessionLocal()
        try:
            for idx, g in enumerate(groups):
                ticker = g.get("ticker", "?")
                asset_class = g.get("asset_class", "?")
                rows = g.get("rows") or []
                state["current_ticker"] = ticker
                state["current_class"] = asset_class
                state["phase"] = f"Merging {ticker} ({asset_class})"
                _write_cleanup_job(state)

                if len(rows) < 2:
                    state["ticker_results"].append({
                        "ticker": ticker, "class": asset_class,
                        "status": "skipped", "reason": "only 1 entry"
                    })
                    state["tickers_done"] = idx + 1
                    _write_cleanup_job(state)
                    continue

                winner_row = max(rows, key=lambda r: int(r.get("row_count") or 0))
                winner_id = int(winner_row["id"])
                loser_ids = [int(r["id"]) for r in rows if int(r["id"]) != winner_id]

                winner_file = db.query(CSVFile).filter(CSVFile.id == winner_id).first()
                if not winner_file:
                    state["errors"].append({"ticker": ticker, "error": "winner not found in DB"})
                    state["ticker_results"].append({
                        "ticker": ticker, "class": asset_class,
                        "status": "error", "reason": "winner not found"
                    })
                    state["tickers_done"] = idx + 1
                    _write_cleanup_job(state)
                    continue

                winner_path = _resolve_dataset_csv_for_file(winner_file)
                merged_count = 0
                for lid in loser_ids:
                    loser_file = db.query(CSVFile).filter(CSVFile.id == lid).first()
                    if not loser_file:
                        continue
                    loser_path = _resolve_dataset_csv_for_file(loser_file)
                    try:
                        if loser_path.exists() and winner_path.exists():
                            _merge_canonical_ohlcv_csvs(
                                existing=winner_path,
                                incoming=loser_path,
                                dest=winner_path,
                            )
                    except Exception:
                        pass
                    _purge_dataset_rows(db, loser_file)
                    merged_count += 1

                winner_file.row_count = count_csv_rows(str(winner_path)) if winner_path.exists() else winner_file.row_count
                db.commit()
                build_binary_for_file(winner_file.id, winner_path, winner_file.original_name)

                state["cleaned"] = int(state.get("cleaned") or 0) + merged_count
                state["tickers_done"] = idx + 1
                state["ticker_results"].append({
                    "ticker": ticker, "class": asset_class,
                    "status": "done",
                    "kept_rows": int(winner_file.row_count or 0),
                    "removed": merged_count,
                })
                _write_cleanup_job(state)
        finally:
            db.close()

        state["status"] = "done"
        state["phase"] = "complete"
        state["current_ticker"] = None
        state["message"] = (
            f"Done — cleaned {state.get('cleaned', 0)} duplicate(s) "
            f"across {state.get('tickers_done', 0)} ticker(s). Big datasets preserved."
        )
        _write_cleanup_job(state)

    except Exception as e:
        state["status"] = "failed"
        state["phase"] = "failed"
        state["message"] = str(e)[:1000]
        state["error"] = str(e)[:2000]
        _write_cleanup_job(state)


@app.post("/api/admin/datasets/duplicates/auto-cleanup")
async def admin_dataset_duplicates_auto_cleanup(request: Request):
    """
    Start a background duplicate cleanup job. Returns immediately with a job
    status — poll GET /api/admin/datasets/duplicates/auto-cleanup/status for
    live per-ticker progress.
    """
    _require_admin(request)
    existing = _read_cleanup_job()
    if existing and existing.get("status") in ("running", "queued"):
        return {"success": True, "already_running": True, "job": existing}

    state = {
        "status": "queued",
        "phase": "scanning",
        "message": "Starting duplicate scan…",
        "started_at": datetime.utcnow().isoformat() + "Z",
        "tickers_total": 0,
        "tickers_done": 0,
        "cleaned": 0,
        "current_ticker": None,
        "current_class": None,
        "ticker_results": [],
        "errors": [],
    }
    _write_cleanup_job(state)
    threading.Thread(target=_run_cleanup_job_background, daemon=True, name="cleanup-duplicates").start()
    return {"success": True, "job": state}


@app.get("/api/admin/datasets/duplicates/auto-cleanup/status")
async def admin_dataset_duplicates_auto_cleanup_status(request: Request):
    """Poll live progress of the duplicate cleanup job."""
    _require_admin(request)
    state = _read_cleanup_job()
    if not state:
        return {"success": True, "job": None, "message": "No cleanup job found"}
    return {"success": True, "job": state}


@app.delete("/api/admin/datasets/{file_id}")
async def admin_delete_dataset(file_id: int, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        db_file = db.query(CSVFile).filter(CSVFile.id == file_id).first()

        if not db_file:
            raise HTTPException(status_code=404, detail="File not found")

        _purge_dataset_rows(db, db_file)
        db.commit()

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

# ═══════════════════════════════════════════════════════════════════
#  ADMIN — Subscription Plans
# ═══════════════════════════════════════════════════════════════════

def _log_plan_entitlement_audit(db, plan_id: int | None, admin_user, action: str, payload: dict | None = None) -> None:
    try:
        db.add(
            PlanEntitlementAuditLog(
                plan_id=plan_id,
                admin_user_id=getattr(admin_user, "id", None),
                action=action,
                payload_json=json.dumps(payload or {}, separators=(",", ":")),
            )
        )
    except Exception:
        pass


def _plan_public_dict(p, db=None):
    feats = []
    if p.features:
        if isinstance(p.features, list):
            feats = p.features
        elif isinstance(p.features, str):
            try:
                parsed = json.loads(p.features)
                feats = parsed if isinstance(parsed, list) else []
            except (json.JSONDecodeError, TypeError):
                feats = [s.strip() for s in p.features.split(',') if s.strip()]
    extra = _plan_extra_columns_from_db(db, p.id) if db is not None else {}
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "price_monthly": p.price_monthly or p.price or 0,
        "price_yearly": p.price_yearly or 0,
        "interval": p.interval or "month",
        "stripe_price_id": p.stripe_price_id,
        "stripe_price_id_yearly": p.stripe_price_id_yearly,
        "stripe_product_id": p.stripe_product_id,
        "features": feats,
        "trial_days": p.trial_days or 0,
        "max_trading_sessions": extra.get("max_trading_sessions", getattr(p, "max_trading_sessions", None)),
        "max_tickers_per_session": extra.get("max_tickers_per_session"),
        "max_supporting_tickers_per_session": extra.get("max_supporting_tickers_per_session"),
        "tier_rank": int(extra.get("tier_rank") or 0),
        "entitlements_json": extra.get("entitlements_json"),
        "is_active": bool(p.is_active),
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }

@app.get("/api/admin/subscriptions/plan-templates")
async def admin_plan_templates(request: Request):
    """Ready-made entitlement presets for the admin plan modal."""
    _require_admin(request)
    return {"templates": pe.plan_templates()}


@app.get("/api/admin/subscriptions/plans")
async def admin_list_plans(request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        plans = db.query(SubscriptionPlan).order_by(SubscriptionPlan.id).all()
        result = []
        for p in plans:
            d = _plan_public_dict(p, db)
            d["subscriber_count"] = db.query(Subscription).filter(
                Subscription.plan_id == p.id,
                Subscription.status.in_(["active", "trialing"])
            ).count()
            result.append(d)
        return {"plans": result}
    finally:
        db.close()

class _CreatePlanIn(BaseModel):
    name: str
    description: str | None = None
    price_monthly: float = 0
    price_yearly: float = 0
    interval: str = "month"
    stripe_price_id: str | None = None
    stripe_price_id_yearly: str | None = None
    stripe_product_id: str | None = None
    features: list | None = None
    trial_days: int = 0
    max_trading_sessions: int | None = None
    max_tickers_per_session: int | None = None
    max_supporting_tickers_per_session: int | None = None
    tier_rank: int = 0
    entitlements_json: str | None = None
    is_active: bool = True

@app.post("/api/admin/subscriptions/plans")
async def admin_create_plan(payload: _CreatePlanIn, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        plan = SubscriptionPlan(
            name=payload.name,
            description=payload.description,
            price=payload.price_monthly,
            price_monthly=payload.price_monthly,
            price_yearly=payload.price_yearly,
            interval=payload.interval,
            stripe_price_id=payload.stripe_price_id,
            stripe_price_id_yearly=payload.stripe_price_id_yearly,
            stripe_product_id=payload.stripe_product_id,
            features=json.dumps(payload.features or []),
            trial_days=payload.trial_days,
            max_trading_sessions=payload.max_trading_sessions,
            is_active=payload.is_active,
        )
        db.add(plan)
        db.flush()
        _update_plan_entitlement_columns_db(
            db,
            plan.id,
            {
                "max_trading_sessions": payload.max_trading_sessions,
                "max_tickers_per_session": payload.max_tickers_per_session,
                "max_supporting_tickers_per_session": payload.max_supporting_tickers_per_session,
                "tier_rank": payload.tier_rank,
                "entitlements_json": payload.entitlements_json,
            },
        )
        db.commit()
        db.refresh(plan)
        return {"plan": _plan_public_dict(plan, db)}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

class _UpdatePlanIn(BaseModel):
    name: str | None = None
    description: str | None = None
    price_monthly: float | None = None
    price_yearly: float | None = None
    interval: str | None = None
    stripe_price_id: str | None = None
    stripe_price_id_yearly: str | None = None
    stripe_product_id: str | None = None
    features: list | None = None
    trial_days: int | None = None
    max_trading_sessions: int | None = None
    max_tickers_per_session: int | None = None
    max_supporting_tickers_per_session: int | None = None
    tier_rank: int | None = None
    entitlements_json: str | None = None
    is_active: bool | None = None

@app.put("/api/admin/subscriptions/plans/{plan_id}")
async def admin_update_plan(plan_id: int, payload: _UpdatePlanIn, request: Request):
    admin_user = _require_admin(request)
    db = SessionLocal()
    try:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")
        if payload.name is not None: plan.name = payload.name
        if payload.description is not None: plan.description = payload.description
        if payload.price_monthly is not None:
            plan.price_monthly = payload.price_monthly
            plan.price = payload.price_monthly
        if payload.price_yearly is not None: plan.price_yearly = payload.price_yearly
        if payload.interval is not None: plan.interval = payload.interval
        if payload.stripe_price_id is not None: plan.stripe_price_id = payload.stripe_price_id
        if payload.stripe_price_id_yearly is not None: plan.stripe_price_id_yearly = payload.stripe_price_id_yearly
        if payload.stripe_product_id is not None: plan.stripe_product_id = payload.stripe_product_id
        if payload.features is not None: plan.features = json.dumps(payload.features)
        if payload.trial_days is not None: plan.trial_days = payload.trial_days
        if payload.max_trading_sessions is not None:
            plan.max_trading_sessions = max(0, int(payload.max_trading_sessions))
        if payload.is_active is not None:
            plan.is_active = payload.is_active
        _update_plan_entitlement_columns_db(
            db,
            plan_id,
            {
                "max_trading_sessions": payload.max_trading_sessions,
                "max_tickers_per_session": payload.max_tickers_per_session,
                "max_supporting_tickers_per_session": payload.max_supporting_tickers_per_session,
                "tier_rank": payload.tier_rank,
                "entitlements_json": payload.entitlements_json,
            },
        )
        _log_plan_entitlement_audit(db, plan_id, admin_user, "plan_update", payload.model_dump(exclude_none=True))
        db.commit()
        return {"plan": _plan_public_dict(plan, db), "sync_required": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/api/admin/subscriptions/plans/{plan_id}/sync-entitlements")
async def admin_sync_plan_entitlements(plan_id: int, request: Request):
    """Push current plan caps to all active/trialing subscribers (skips admin overrides)."""
    admin_user = _require_admin(request)
    db = SessionLocal()
    try:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")
        subs = (
            db.query(Subscription)
            .filter(
                Subscription.plan_id == plan_id,
                Subscription.status.in_(["active", "trialing"]),
            )
            .all()
        )
        synced = 0
        skipped_override = 0
        for sub in subs:
            user = db.query(User).filter(User.id == sub.user_id).first()
            if not user:
                continue
            if _user_entitlements_override_db(db, user.id):
                skipped_override += 1
                continue
            _apply_plan_entitlements_chart(db, user, plan)
            synced += 1
        _log_plan_entitlement_audit(
            db,
            plan_id,
            admin_user,
            "sync_entitlements",
            {"synced": synced, "skipped_override": skipped_override, "total_subscribers": len(subs)},
        )
        db.commit()
        return {
            "success": True,
            "plan_id": plan_id,
            "synced": synced,
            "skipped_override": skipped_override,
            "total_subscribers": len(subs),
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.delete("/api/admin/subscriptions/plans/{plan_id}")
async def admin_delete_plan(plan_id: int, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")
        active_subs = db.query(Subscription).filter(
            Subscription.plan_id == plan_id,
            Subscription.status.in_(["active", "trialing"])
        ).count()
        if active_subs > 0:
            raise HTTPException(status_code=400, detail=f"Cannot delete plan with {active_subs} active subscribers")
        db.delete(plan)
        db.commit()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

# ═══════════════════════════════════════════════════════════════════
#  ADMIN — Subscriptions
# ═══════════════════════════════════════════════════════════════════

def _user_entitles_journal_db(db, user: User) -> bool:
    """Align with journal-backend: active/trialing, admin extension window, or manual (no Stripe)."""
    if not user:
        return False
    if (user.role or "") == "admin":
        return True
    if user.access_expires_at and datetime.utcnow() < user.access_expires_at:
        return True
    if (
        db.query(Subscription)
        .filter(
            Subscription.user_id == user.id,
            Subscription.status.in_(["active", "trialing"]),
        )
        .first()
    ):
        return True
    if user.has_journal_access:
        return True
    return False


def _chart_user_has_module(user: User, module: str) -> bool:
    """Full entitlement or per-module admin grant."""
    if not user:
        return False
    if _user_has_chart_journal_access(user):
        return True
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == user.id).first()
        if not u:
            return False
        grants = _parse_user_module_grants(u)
        subscription_entitled = (
            db.query(Subscription)
            .filter(
                Subscription.user_id == u.id,
                Subscription.status.in_(["active", "trialing"]),
            )
            .first()
            is not None
        )
        full_modules = user_has_full_dashboard_modules(
            u, subscription_entitled=subscription_entitled, grants_override=grants
        )
        return user_has_dashboard_module(
            u, module, fully_entitled=full_modules, grants_override=grants
        )
    finally:
        db.close()


def _user_has_chart_journal_access(user: User) -> bool:
    """Chart middleware / session checks (uses a fresh read from DB)."""
    if not user:
        return False
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == user.id).first()
        if not u:
            return False
        return _user_entitles_journal_db(db, u)
    finally:
        db.close()


def _sub_public_dict(s, db):
    user = db.query(User).filter(User.id == s.user_id).first()
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == s.plan_id).first() if s.plan_id else None
    period_end = s.current_period_end or s.ends_at
    st = (s.status or "").lower()
    needs_payment = st in ("past_due", "unpaid")
    ext_active = bool(
        user and user.access_expires_at and datetime.utcnow() < user.access_expires_at
    )
    journal_ok = _user_entitles_journal_db(db, user) if user else False
    return {
        "id": s.id,
        "user_id": s.user_id,
        "user_name": user.name if user else "Unknown",
        "user_email": user.email if user else "",
        "plan_id": s.plan_id,
        "plan_name": plan.name if plan else ("Manual" if s.is_manual else "—"),
        "stripe_subscription_id": s.stripe_subscription_id,
        "user_stripe_customer_id": (user.stripe_customer_id or None) if user else None,
        "status": s.status,
        "is_manual": bool(s.is_manual),
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "current_period_end": period_end.isoformat() if period_end else None,
        "cancel_at_period_end": bool(s.cancel_at_period_end),
        "cancelled_at": s.cancelled_at.isoformat() if s.cancelled_at else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "needs_payment": needs_payment,
        "access_expires_at": user.access_expires_at.isoformat() if user and user.access_expires_at else None,
        "admin_extension_active": ext_active,
        "journal_access_effective": journal_ok,
    }

@app.get("/api/admin/subscriptions")
async def admin_list_subscriptions(request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        subs = db.query(Subscription).order_by(Subscription.created_at.desc()).all()
        return {"subscriptions": [_sub_public_dict(s, db) for s in subs]}
    finally:
        db.close()

class _ManualSubIn(BaseModel):
    plan_id: int | None = None
    status: str = "active"
    days: int | None = None

@app.post("/api/admin/users/{user_id}/subscription")
async def admin_assign_subscription(user_id: int, payload: _ManualSubIn, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        now = datetime.utcnow()
        ends = now + timedelta(days=payload.days) if payload.days and payload.days > 0 else None

        sub = Subscription(
            user_id=user_id,
            plan_id=payload.plan_id,
            status=payload.status,
            is_manual=True,
            started_at=now,
            current_period_start=now,
            ends_at=ends,
            current_period_end=ends,
        )
        db.add(sub)
        db.flush()

        if payload.plan_id:
            plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == payload.plan_id).first()
            if plan:
                _apply_plan_entitlements_chart(db, user, plan)

        if ends:
            user.access_expires_at = ends

        db.commit()
        db.refresh(sub)
        return {"success": True, "subscription": _sub_public_dict(sub, db)}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


class _AdminCancelSubIn(BaseModel):
    """Cancel a subscription in our DB and optionally in Stripe."""

    sync_stripe: bool = True
    cancel_at_period_end: bool = False
    notify_user: bool = True
    notify_title: str | None = Field(None, max_length=300)
    notify_body: str | None = Field(None, max_length=4000)


class _AdminStripePortalIn(BaseModel):
    return_url: str | None = Field(None, max_length=2000)


class _AdminNotifyPayIn(BaseModel):
    title: str | None = Field(None, max_length=300)
    body: str | None = Field(None, max_length=4000)


def _chart_stripe_return_origins() -> set[str]:
    raw: list[str] = []
    fu = (os.environ.get("FRONTEND_URL") or "").strip()
    if fu:
        raw.append(fu)
    for x in (os.environ.get("STRIPE_REDIRECT_ALLOWED_ORIGINS") or "").split(","):
        x = x.strip()
        if x:
            raw.append(x)
    raw.extend(
        [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
            "https://localhost:3000",
            "https://127.0.0.1:3000",
            "https://localhost:3001",
            "https://127.0.0.1:3001",
        ]
    )
    out: set[str] = set()
    for r in raw:
        s = r.strip()
        if not s:
            continue
        if "://" not in s:
            s = "https://" + s
        p = urlparse(s)
        if p.scheme in ("http", "https") and p.netloc:
            out.add(f"{p.scheme.lower()}://{p.netloc.lower()}")
    return out


def _chart_is_loopback_stripe_return_url(p) -> bool:
    """True if URL points at loopback (any port). Used for dev/staging when origin is not in the env allowlist."""
    if p.scheme not in ("http", "https") or not p.hostname:
        return False
    h = (p.hostname or "").lower().strip("[]")
    if h in ("localhost", "::1"):
        return True
    if h.startswith("127."):
        parts = h.split(".")
        if len(parts) == 4:
            try:
                return int(parts[0]) == 127 and all(0 <= int(x) <= 255 for x in parts[1:])
            except ValueError:
                return False
    return False


def _chart_is_allowed_stripe_return_url(url: str) -> bool:
    if not url or not isinstance(url, str):
        return False
    p = urlparse(url.strip())
    if p.scheme not in ("http", "https") or not p.netloc:
        return False
    origin = f"{p.scheme.lower()}://{p.netloc.lower()}"
    allowed = _chart_stripe_return_origins()
    env = (os.environ.get("ENV") or os.environ.get("NODE_ENV") or "").lower()
    if origin not in allowed:
        # Any port on loopback (e.g. Next on 5173 or `next start` with NODE_ENV=production on :5555).
        if not _chart_is_loopback_stripe_return_url(p):
            return False
    if env == "production":
        host = (p.hostname or "").lower()
        local = host in ("localhost", "127.0.0.1", "::1") or host.startswith("127.")
        if not local and p.scheme != "https":
            return False
    return True


def _stripe_ts_to_utc(v) -> datetime | None:
    if v is None:
        return None
    try:
        iv = int(v)
        if iv <= 0:
            return None
        return datetime.utcfromtimestamp(iv)
    except Exception:
        return None


def _stripe_subscription_fields_from_object(ss) -> dict:
    """Map Stripe Subscription object/dict to chart `Subscription` columns."""
    if isinstance(ss, dict):
        status = ss.get("status") or "active"
        catpe = bool(ss.get("cancel_at_period_end", False))
        cps = ss.get("current_period_start")
        cpe = ss.get("current_period_end")
        c_at = ss.get("canceled_at")
    else:
        status = getattr(ss, "status", None) or "active"
        catpe = bool(getattr(ss, "cancel_at_period_end", False))
        cps = getattr(ss, "current_period_start", None)
        cpe = getattr(ss, "current_period_end", None)
        c_at = getattr(ss, "canceled_at", None)
    out: dict = {
        "status": str(status)[:32],
        "cancel_at_period_end": catpe,
        "current_period_start": _stripe_ts_to_utc(cps),
        "current_period_end": _stripe_ts_to_utc(cpe),
    }
    ct = _stripe_ts_to_utc(c_at)
    if ct is not None:
        out["cancelled_at"] = ct
    return out


def _apply_stripe_subscription_fields(sub: Subscription, patch: dict) -> None:
    st = patch.get("status")
    if st:
        sub.status = str(st)[:32]
    if patch.get("current_period_start") is not None:
        sub.current_period_start = patch["current_period_start"]
    if patch.get("current_period_end") is not None:
        sub.current_period_end = patch["current_period_end"]
        sub.ends_at = patch["current_period_end"]
    if "cancel_at_period_end" in patch:
        sub.cancel_at_period_end = bool(patch["cancel_at_period_end"])
    if patch.get("cancelled_at") is not None:
        sub.cancelled_at = patch["cancelled_at"]


@app.post("/api/admin/subscriptions/{sub_id}/cancel")
async def admin_cancel_subscription(sub_id: int, request: Request):
    _require_admin(request)
    try:
        raw = await request.json()
    except Exception:
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    payload = _AdminCancelSubIn(**raw)

    db = SessionLocal()
    try:
        sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
        if not sub:
            raise HTTPException(status_code=404, detail="Subscription not found")

        stripe_meta: dict = {
            "sync_stripe": payload.sync_stripe,
            "cancel_at_period_end": payload.cancel_at_period_end,
            "notify_user": payload.notify_user,
        }
        sid = (sub.stripe_subscription_id or "").strip()
        applied_stripe = False

        if payload.sync_stripe and sid and not sub.is_manual:
            _stripe = _stripe_client()
            if not _stripe:
                raise HTTPException(status_code=503, detail="Stripe not configured (set STRIPE_SECRET_KEY)")
            try:
                if payload.cancel_at_period_end:
                    ss = _stripe.Subscription.modify(sid, cancel_at_period_end=True)
                else:
                    cancel_fn = getattr(_stripe.Subscription, "cancel", None) or getattr(
                        _stripe.Subscription, "delete", None
                    )
                    if cancel_fn is None:
                        raise HTTPException(status_code=500, detail="Stripe SDK missing Subscription.cancel/delete")
                    ss = cancel_fn(sid)
                patch = _stripe_subscription_fields_from_object(ss)
                _apply_stripe_subscription_fields(sub, patch)
                applied_stripe = True
            except HTTPException:
                raise
            except Exception as e:
                import stripe as _stripe_mod

                if isinstance(e, _stripe_mod.error.StripeError):
                    raise HTTPException(status_code=400, detail=(getattr(e, "user_message", None) or str(e))[:500])
                raise HTTPException(status_code=400, detail=str(e)[:500])
        elif payload.sync_stripe and not sid and not sub.is_manual:
            stripe_meta["stripe_skipped"] = "no_stripe_subscription_id"

        if not applied_stripe:
            sub.status = "canceled"
            sub.cancelled_at = datetime.utcnow()
            sub.cancel_at_period_end = False

        user = db.query(User).filter(User.id == sub.user_id).first()
        if payload.notify_user and user:
            title = (payload.notify_title or "Your subscription was updated").strip()[:300]
            body = (
                payload.notify_body
                or (
                    "Your subscription has been updated by support. "
                    "If your access changed, sign in and open billing to renew or update your payment method."
                )
            ).strip()[:4000]
            db.add(
                Notification(
                    user_id=int(user.id),
                    type="subscription_admin",
                    thread_id=None,
                    message_id=None,
                    title=title,
                    body=body,
                )
            )

        db.commit()
        db.refresh(sub)
        _record_admin_action(
            request,
            action="subscription_cancel",
            target_type="subscription",
            target_id=str(sub_id),
            params=stripe_meta,
            status="ok",
        )
        return {"success": True, "subscription": _sub_public_dict(sub, db), "stripe": stripe_meta}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/api/admin/subscriptions/{sub_id}/sync-from-stripe")
async def admin_sync_subscription_from_stripe(sub_id: int, request: Request):
    """Pull latest status/period from Stripe into the local `subscriptions` row."""
    _require_admin(request)
    db = SessionLocal()
    try:
        sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
        if not sub:
            raise HTTPException(status_code=404, detail="Subscription not found")
        sid = (sub.stripe_subscription_id or "").strip()
        if not sid or sub.is_manual:
            raise HTTPException(status_code=400, detail="Subscription has no Stripe subscription id")
        _stripe = _stripe_client()
        if not _stripe:
            raise HTTPException(status_code=503, detail="Stripe not configured (set STRIPE_SECRET_KEY)")
        try:
            ss = _stripe.Subscription.retrieve(sid)
        except Exception as e:
            import stripe as _stripe_mod

            if isinstance(e, _stripe_mod.error.StripeError):
                raise HTTPException(status_code=400, detail=(getattr(e, "user_message", None) or str(e))[:500])
            raise HTTPException(status_code=400, detail=str(e)[:500])
        patch = _stripe_subscription_fields_from_object(ss)
        _apply_stripe_subscription_fields(sub, patch)
        db.commit()
        db.refresh(sub)
        _record_admin_action(
            request,
            action="subscription_sync_stripe",
            target_type="subscription",
            target_id=str(sub_id),
            params={"stripe_subscription_id": sid[:40]},
            status="ok",
        )
        return {"success": True, "subscription": _sub_public_dict(sub, db)}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/api/admin/subscriptions/{sub_id}/reactivate-stripe")
async def admin_reactivate_stripe_subscription(sub_id: int, request: Request):
    """Clear cancel-at-period-end in Stripe (user keeps billing after an accidental cancel schedule)."""
    _require_admin(request)
    db = SessionLocal()
    try:
        sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
        if not sub:
            raise HTTPException(status_code=404, detail="Subscription not found")
        sid = (sub.stripe_subscription_id or "").strip()
        if not sid or sub.is_manual:
            raise HTTPException(status_code=400, detail="No Stripe subscription linked")
        _stripe = _stripe_client()
        if not _stripe:
            raise HTTPException(status_code=503, detail="Stripe not configured (set STRIPE_SECRET_KEY)")
        try:
            ss = _stripe.Subscription.modify(sid, cancel_at_period_end=False)
        except Exception as e:
            import stripe as _stripe_mod

            if isinstance(e, _stripe_mod.error.StripeError):
                raise HTTPException(status_code=400, detail=(getattr(e, "user_message", None) or str(e))[:500])
            raise HTTPException(status_code=400, detail=str(e)[:500])
        patch = _stripe_subscription_fields_from_object(ss)
        _apply_stripe_subscription_fields(sub, patch)
        db.commit()
        db.refresh(sub)
        _record_admin_action(
            request,
            action="subscription_reactivate_stripe",
            target_type="subscription",
            target_id=str(sub_id),
            status="ok",
        )
        return {"success": True, "subscription": _sub_public_dict(sub, db)}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/api/admin/subscriptions/{sub_id}/notify-payment-reminder")
async def admin_notify_subscription_payment_reminder(sub_id: int, request: Request):
    """Send an in-app notification asking the user to fix payment / renew (no Stripe call)."""
    _require_admin(request)
    try:
        raw = await request.json()
    except Exception:
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    payload = _AdminNotifyPayIn(**raw)
    db = SessionLocal()
    try:
        sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
        if not sub:
            raise HTTPException(status_code=404, detail="Subscription not found")
        user = db.query(User).filter(User.id == sub.user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        title = (payload.title or "Action needed: subscription payment").strip()[:300]
        body = (
            payload.body
            or (
                "We could not keep your subscription active without a successful payment. "
                "Please open your account billing page and update your payment method, or renew your plan."
            )
        ).strip()[:4000]
        db.add(
            Notification(
                user_id=int(user.id),
                type="subscription_payment_reminder",
                thread_id=None,
                message_id=None,
                title=title,
                body=body,
            )
        )
        db.commit()
        _record_admin_action(
            request,
            action="subscription_notify_pay",
            target_type="subscription",
            target_id=str(sub_id),
            status="ok",
        )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/api/admin/users/{user_id}/stripe/customer-portal")
async def admin_stripe_customer_portal(user_id: int, request: Request):
    """Create a Stripe Billing Portal session for a user (admin may copy URL to the user)."""
    _require_admin(request)
    try:
        raw = await request.json()
    except Exception:
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    payload = _AdminStripePortalIn(**raw)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        cust = (user.stripe_customer_id or "").strip()
        if not cust:
            raise HTTPException(status_code=400, detail="User has no stripe_customer_id")
        base = (os.environ.get("FRONTEND_URL") or "http://localhost:3000").rstrip("/")
        return_url = (payload.return_url or (base + "/settings")).strip()
        if not _chart_is_allowed_stripe_return_url(return_url):
            raise HTTPException(
                status_code=400,
                detail="return_url origin not allowed; set FRONTEND_URL or STRIPE_REDIRECT_ALLOWED_ORIGINS",
            )
        _stripe = _stripe_client()
        if not _stripe:
            raise HTTPException(status_code=503, detail="Stripe not configured (set STRIPE_SECRET_KEY)")
        try:
            session = _stripe.billing_portal.Session.create(customer=cust, return_url=return_url)
        except Exception as e:
            import stripe as _stripe_mod

            if isinstance(e, _stripe_mod.error.StripeError):
                raise HTTPException(status_code=400, detail=(getattr(e, "user_message", None) or str(e))[:500])
            raise HTTPException(status_code=400, detail=str(e)[:500])
        url = getattr(session, "url", None) or (session.get("url") if isinstance(session, dict) else None)
        if not url:
            raise HTTPException(status_code=500, detail="Stripe returned no portal URL")
        _record_admin_action(
            request,
            action="stripe_billing_portal",
            target_type="user",
            target_id=str(user_id),
            params={"return_url_host": urlparse(return_url).netloc[:120]},
            status="ok",
        )
        return {"success": True, "url": url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


def _stripe_invoice_to_admin_dict(inv) -> dict:
    """Normalize Stripe Invoice object or dict for admin JSON (no secrets)."""
    if isinstance(inv, dict):
        cust = inv.get("customer")
        if isinstance(cust, dict):
            cust = cust.get("id")
        return {
            "id": inv.get("id"),
            "number": inv.get("number"),
            "status": inv.get("status"),
            "total": inv.get("total"),
            "amount_due": inv.get("amount_due"),
            "currency": inv.get("currency"),
            "created": inv.get("created"),
            "customer": cust,
            "customer_email": inv.get("customer_email"),
            "hosted_invoice_url": inv.get("hosted_invoice_url"),
            "invoice_pdf": inv.get("invoice_pdf"),
        }
    cust = getattr(inv, "customer", None)
    if cust is not None and not isinstance(cust, str):
        cust = getattr(cust, "id", None)
    cr = getattr(inv, "created", None)
    try:
        created_int = int(cr) if cr is not None else None
    except Exception:
        created_int = None
    return {
        "id": getattr(inv, "id", None),
        "number": getattr(inv, "number", None),
        "status": getattr(inv, "status", None),
        "total": getattr(inv, "total", None),
        "amount_due": getattr(inv, "amount_due", None),
        "currency": getattr(inv, "currency", None),
        "created": created_int,
        "customer": cust,
        "customer_email": getattr(inv, "customer_email", None),
        "hosted_invoice_url": getattr(inv, "hosted_invoice_url", None),
        "invoice_pdf": getattr(inv, "invoice_pdf", None),
    }


def _enrich_invoice_rows_with_users(db, rows: list[dict]) -> None:
    """Attach local user id/name/email when `stripe_customer_id` matches."""
    ids = list({(r.get("customer") or "").strip() for r in rows if r.get("customer")})
    if not ids:
        return
    um: dict[str, dict] = {}
    for u in db.query(User).filter(User.stripe_customer_id.in_(ids)).all():
        sc = (u.stripe_customer_id or "").strip()
        if sc:
            um[sc] = {"user_id": int(u.id), "user_name": u.name or "", "user_email": u.email or ""}
    for r in rows:
        m = um.get((r.get("customer") or "").strip())
        if m:
            r["user_id"] = m["user_id"]
            r["user_name"] = m["user_name"]
            r["user_email"] = m["user_email"]


@app.get("/api/admin/stripe/invoices")
async def admin_stripe_invoices_global(
    request: Request,
    limit: int = 40,
    starting_after: str | None = None,
    status: str | None = None,
    customer: str | None = None,
):
    """
    List Stripe invoices (newest first). Paginate with `starting_after` = last invoice `id` from previous page.
    Optional `status`: draft | open | paid | uncollectible | void
    Optional `customer`: Stripe customer id (cus_…)
    """
    _require_admin(request)
    limit = max(1, min(100, int(limit or 40)))
    _stripe = _stripe_client()
    if not _stripe:
        raise HTTPException(status_code=503, detail="Stripe not configured (set STRIPE_SECRET_KEY)")
    kw: dict = {"limit": limit}
    if starting_after and starting_after.strip():
        kw["starting_after"] = starting_after.strip()[:120]
    if customer and customer.strip():
        kw["customer"] = customer.strip()[:120]
    st = (status or "").strip().lower()
    if st in ("draft", "open", "paid", "uncollectible", "void"):
        kw["status"] = st
    try:
        lst = _stripe.Invoice.list(**kw)
    except Exception as e:
        import stripe as _stripe_mod

        if isinstance(e, _stripe_mod.error.StripeError):
            raise HTTPException(status_code=400, detail=(getattr(e, "user_message", None) or str(e))[:500])
        raise HTTPException(status_code=400, detail=str(e)[:500])
    data = getattr(lst, "data", None) or []
    rows = [_stripe_invoice_to_admin_dict(inv) for inv in data]
    has_more = bool(getattr(lst, "has_more", False))
    next_after = rows[-1]["id"] if rows and has_more else None

    db = SessionLocal()
    try:
        _enrich_invoice_rows_with_users(db, rows)
    finally:
        db.close()

    return {
        "success": True,
        "invoices": rows,
        "has_more": has_more,
        "next_starting_after": next_after,
    }


@app.get("/api/admin/users/{user_id}/stripe/invoices")
async def admin_stripe_invoices(user_id: int, request: Request, limit: int = 25):
    """List recent Stripe invoices for the user's customer id (read-only)."""
    _require_admin(request)
    limit = max(1, min(100, int(limit or 25)))
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        cust = (user.stripe_customer_id or "").strip()
        if not cust:
            return {"success": True, "invoices": [], "message": "No stripe_customer_id on user"}
        _stripe = _stripe_client()
        if not _stripe:
            raise HTTPException(status_code=503, detail="Stripe not configured (set STRIPE_SECRET_KEY)")
        try:
            lst = _stripe.Invoice.list(customer=cust, limit=limit)
        except Exception as e:
            import stripe as _stripe_mod

            if isinstance(e, _stripe_mod.error.StripeError):
                raise HTTPException(status_code=400, detail=(getattr(e, "user_message", None) or str(e))[:500])
            raise HTTPException(status_code=400, detail=str(e)[:500])
        stream = getattr(lst, "data", None) or []
        rows = [_stripe_invoice_to_admin_dict(inv) for inv in stream]
        _enrich_invoice_rows_with_users(db, rows)
        return {"success": True, "invoices": rows}
    finally:
        db.close()


@app.post("/api/admin/users/{user_id}/grant-access-extension")
async def admin_grant_access_extension(user_id: int, request: Request):
    """Temporary journal login (shared DB with journal-backend). Stackable from current extension end."""
    _require_admin(request)
    try:
        body = await request.json()
    except Exception:
        body = {}
    days = int(body.get("days", 7))
    if days < 1 or days > 366:
        raise HTTPException(status_code=400, detail="days must be 1–366")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        base = datetime.utcnow()
        if user.access_expires_at and user.access_expires_at > base:
            base = user.access_expires_at
        user.access_expires_at = base + timedelta(days=days)
        db.commit()
        return {
            "success": True,
            "access_expires_at": user.access_expires_at.isoformat(),
            "has_journal_access": _user_entitles_journal_db(db, user),
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/api/admin/users/{user_id}/clear-access-extension")
async def admin_clear_access_extension(user_id: int, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user.access_expires_at = None
        db.commit()
        return {
            "success": True,
            "access_expires_at": None,
            "has_journal_access": _user_entitles_journal_db(db, user),
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════
#  ADMIN — Coupons & Promo Codes (Stripe direct)
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/admin/subscriptions/coupons")
async def admin_list_coupons(request: Request):
    _require_admin(request)
    try:
        import stripe as _stripe
        _stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
        if not _stripe.api_key:
            return {"coupons": [], "message": "Stripe not configured"}

        coupons = _stripe.Coupon.list(limit=100)
        promo_codes = _stripe.PromotionCode.list(limit=100)
        coupon_promos = {}
        for pc in promo_codes.data:
            promo = getattr(pc, 'promotion', None)
            cid = promo.coupon if promo else (pc.coupon.id if hasattr(pc, 'coupon') and pc.coupon else None)
            if cid:
                coupon_promos.setdefault(cid, []).append(pc.code)

        return {"coupons": [{
            "id": c.id,
            "name": c.name,
            "percent_off": c.percent_off,
            "amount_off": c.amount_off,
            "duration": c.duration,
            "duration_in_months": c.duration_in_months,
            "max_redemptions": c.max_redemptions,
            "times_redeemed": c.times_redeemed,
            "valid": c.valid,
            "promotion_codes": coupon_promos.get(c.id, []),
        } for c in coupons.data]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/admin/subscriptions/coupons")
async def admin_create_coupon(request: Request):
    _require_admin(request)
    try:
        import stripe as _stripe
        _stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
        if not _stripe.api_key:
            raise HTTPException(status_code=503, detail="Stripe not configured")

        body = await request.json()
        coupon_params = {"name": body.get("name", "Discount"), "duration": body.get("duration", "once")}

        if body.get("percent_off"):
            coupon_params["percent_off"] = body["percent_off"]
        elif body.get("amount_off"):
            coupon_params["amount_off"] = int(float(body["amount_off"]) * 100)
            coupon_params["currency"] = "usd"
        else:
            raise HTTPException(status_code=400, detail="Must provide percent_off or amount_off")

        if body.get("duration_in_months"):
            coupon_params["duration_in_months"] = body["duration_in_months"]
        if body.get("max_redemptions"):
            coupon_params["max_redemptions"] = body["max_redemptions"]

        coupon = _stripe.Coupon.create(**coupon_params)

        promo_code_str = (body.get("code") or "").strip().upper()
        promo = None
        if promo_code_str:
            extra = {"max_redemptions": body["max_redemptions"]} if body.get("max_redemptions") else {}
            try:
                promo = _stripe.PromotionCode.create(
                    promotion={"type": "coupon", "coupon": coupon.id},
                    code=promo_code_str, **extra)
            except Exception:
                promo = _stripe.PromotionCode.create(
                    coupon=coupon.id, code=promo_code_str, **extra)

        return {
            "success": True,
            "coupon": {"id": coupon.id, "name": coupon.name},
            "promotion_code": {"id": promo.id, "code": promo.code} if promo else None
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/admin/subscriptions/coupons/{coupon_id}")
async def admin_delete_coupon(coupon_id: str, request: Request):
    _require_admin(request)
    try:
        import stripe as _stripe
        _stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
        if not _stripe.api_key:
            raise HTTPException(status_code=503, detail="Stripe not configured")

        _stripe.Coupon.delete(coupon_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════
#  ADMIN — Affiliates (promo code + login / purchase tracking)
# ═══════════════════════════════════════════════════════════════════


def _stripe_client():
    import stripe as _stripe

    key = (os.environ.get("STRIPE_SECRET_KEY") or "").strip()
    if not key:
        return None
    _stripe.api_key = key
    return _stripe


def _stripe_all_active_promotion_codes_to_coupon_ids() -> dict[str, str]:
    """Map UPPERCASE promo code -> Stripe Coupon id for all active promotion codes."""
    _stripe = _stripe_client()
    if not _stripe:
        return {}
    out: dict[str, str] = {}
    try:
        lst = _stripe.PromotionCode.list(active=True, limit=100)
        stream = lst.auto_paging_iter() if hasattr(lst, "auto_paging_iter") else lst.data
        for pc in stream:
            c = (getattr(pc, "code", None) or "").strip().upper()
            if not c:
                continue
            promo = getattr(pc, "promotion", None)
            cid = promo.coupon if promo else (pc.coupon.id if hasattr(pc, "coupon") and pc.coupon else None)
            if cid:
                out[c] = cid
    except Exception:
        pass
    return out


def _stripe_lookup_promotion_by_code(code: str) -> dict | None:
    """If an active Stripe Promotion Code exists for `code`, return coupon_id + metadata."""
    _stripe = _stripe_client()
    if not _stripe:
        return None
    try:
        lst = _stripe.PromotionCode.list(code=code, active=True, limit=1)
        if not lst.data:
            return None
        pc = lst.data[0]
        promo = getattr(pc, "promotion", None)
        cid = promo.coupon if promo else (pc.coupon.id if hasattr(pc, "coupon") and pc.coupon else None)
        if not cid:
            return None
        return {
            "coupon_id": cid,
            "promotion_code_id": pc.id,
            "code": getattr(pc, "code", None) or code,
        }
    except Exception:
        return None


def _stripe_create_coupon_and_promo(
    promo_code: str,
    display_name: str,
    *,
    percent_off: float | None = None,
    amount_off_usd: float | None = None,
    duration: str = "once",
    duration_in_months: int | None = None,
    max_redemptions: int | None = None,
) -> dict:
    """Create Stripe Coupon + customer-facing Promotion Code (checkout accepts this code)."""
    _stripe = _stripe_client()
    if not _stripe:
        raise HTTPException(status_code=503, detail="Stripe not configured (set STRIPE_SECRET_KEY)")
    coupon_params: dict = {"name": (display_name or promo_code)[:80], "duration": duration or "once"}
    if percent_off is not None:
        coupon_params["percent_off"] = float(percent_off)
    elif amount_off_usd is not None:
        coupon_params["amount_off"] = int(round(float(amount_off_usd) * 100))
        coupon_params["currency"] = "usd"
    else:
        raise HTTPException(status_code=400, detail="percent_off or amount_off_usd required to create a Stripe coupon")
    if duration_in_months:
        coupon_params["duration_in_months"] = int(duration_in_months)
    if max_redemptions:
        coupon_params["max_redemptions"] = int(max_redemptions)
    coupon = _stripe.Coupon.create(**coupon_params)
    extra = {"max_redemptions": int(max_redemptions)} if max_redemptions else {}
    try:
        promo = _stripe.PromotionCode.create(
            promotion={"type": "coupon", "coupon": coupon.id},
            code=promo_code,
            **extra,
        )
    except Exception:
        promo = _stripe.PromotionCode.create(coupon=coupon.id, code=promo_code, **extra)
    return {"coupon_id": coupon.id, "promotion_code_id": promo.id, "code": getattr(promo, "code", None) or promo_code}


def _affiliate_link_stripe_if_possible(db, a: Affiliate) -> bool:
    """Set stripe_coupon_id from Stripe API if a promotion code exists for a.promo_code."""
    if a.stripe_coupon_id:
        return True
    found = _stripe_lookup_promotion_by_code(a.promo_code)
    if not found:
        return False
    a.stripe_coupon_id = found["coupon_id"]
    a.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(a)
    return True


class AffiliateCreateIn(BaseModel):
    name: str = Field(..., max_length=200)
    promo_code: str = Field(..., max_length=64)
    stripe_coupon_id: str | None = Field(None, max_length=100)
    contact_email: str | None = Field(None, max_length=255)
    notes: str | None = None
    is_active: bool = True
    # Optional: create Stripe Coupon + Promotion Code in one step (checkout will accept this code).
    stripe_discount_percent: float | None = Field(None, ge=0, le=100)
    stripe_discount_amount_usd: float | None = Field(None, ge=0)
    stripe_coupon_duration: str = Field(default="once")
    stripe_duration_in_months: int | None = Field(None, ge=1)
    stripe_max_redemptions: int | None = Field(None, ge=0)


class AffiliateUpdateIn(BaseModel):
    name: str | None = Field(None, max_length=200)
    stripe_coupon_id: str | None = Field(None, max_length=100)
    contact_email: str | None = Field(None, max_length=255)
    notes: str | None = None
    is_active: bool | None = None


def _affiliate_row_dict(db, a: Affiliate) -> dict:
    aid = int(a.id)
    signups = (
        db.query(AffiliateEvent)
        .filter(AffiliateEvent.affiliate_id == aid, AffiliateEvent.event_type == "signup")
        .count()
    )
    logins = (
        db.query(AffiliateEvent)
        .filter(AffiliateEvent.affiliate_id == aid, AffiliateEvent.event_type == "login")
        .count()
    )
    purchases = (
        db.query(AffiliateEvent)
        .filter(AffiliateEvent.affiliate_id == aid, AffiliateEvent.event_type == "purchase")
        .count()
    )
    rev = (
        db.query(func.coalesce(func.sum(AffiliateEvent.amount), 0))
        .filter(AffiliateEvent.affiliate_id == aid, AffiliateEvent.event_type == "purchase")
        .scalar()
        or 0
    )
    users_attributed = db.query(AffiliateAttribution).filter(AffiliateAttribution.affiliate_id == aid).count()
    return {
        "id": a.id,
        "name": a.name,
        "contact_email": a.contact_email,
        "promo_code": a.promo_code,
        "stripe_coupon_id": a.stripe_coupon_id,
        "notes": a.notes,
        "is_active": bool(a.is_active),
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
        "stats": {
            "users_attributed": users_attributed,
            "signups": signups,
            "logins": logins,
            "purchases": purchases,
            "revenue": round(float(rev), 2),
        },
        # True once we have stored the Stripe Coupon id (see Sync / create discount below).
        "checkout_ready": bool(a.stripe_coupon_id),
    }


@app.get("/api/admin/affiliates")
async def admin_list_affiliates(
    request: Request,
    auto_link_stripe: bool = Query(
        True,
        description="Match promo_code to active Stripe promotion codes (same as Coupons) and store stripe_coupon_id.",
    ),
):
    _require_admin(request)
    db = SessionLocal()
    try:
        rows = db.query(Affiliate).order_by(Affiliate.id.desc()).all()
        if auto_link_stripe and _stripe_client():
            pmap = _stripe_all_active_promotion_codes_to_coupon_ids()
            changed = False
            for a in rows:
                if a.stripe_coupon_id:
                    continue
                key = (a.promo_code or "").strip().upper()
                if key and key in pmap:
                    a.stripe_coupon_id = pmap[key]
                    a.updated_at = datetime.utcnow()
                    changed = True
            if changed:
                db.commit()
                rows = db.query(Affiliate).order_by(Affiliate.id.desc()).all()
        return {"affiliates": [_affiliate_row_dict(db, a) for a in rows]}
    finally:
        db.close()


@app.post("/api/admin/affiliates")
async def admin_create_affiliate(payload: AffiliateCreateIn, request: Request):
    _require_admin(request)
    code = _normalize_affiliate_code(payload.promo_code)
    if not code:
        raise HTTPException(status_code=400, detail="Invalid promo code (use letters, numbers, - or _)")
    if payload.stripe_discount_percent is not None and payload.stripe_discount_amount_usd is not None:
        raise HTTPException(status_code=400, detail="Choose either percent off or amount off for Stripe, not both")
    db = SessionLocal()
    try:
        clash = db.query(Affiliate).filter(Affiliate.promo_code == code).first()
        if clash:
            raise HTTPException(status_code=400, detail="Promo code already in use")
        manual_sid = (payload.stripe_coupon_id or "").strip() or None
        a = Affiliate(
            name=payload.name.strip(),
            contact_email=(payload.contact_email or "").strip() or None,
            promo_code=code,
            stripe_coupon_id=manual_sid,
            notes=payload.notes,
            is_active=payload.is_active,
        )
        db.add(a)
        db.commit()
        db.refresh(a)

        if not manual_sid and (
            payload.stripe_discount_percent is not None or payload.stripe_discount_amount_usd is not None
        ):
            try:
                r = _stripe_create_coupon_and_promo(
                    code,
                    payload.name.strip(),
                    percent_off=payload.stripe_discount_percent,
                    amount_off_usd=payload.stripe_discount_amount_usd,
                    duration=payload.stripe_coupon_duration or "once",
                    duration_in_months=payload.stripe_duration_in_months,
                    max_redemptions=payload.stripe_max_redemptions,
                )
                a.stripe_coupon_id = r["coupon_id"]
                a.updated_at = datetime.utcnow()
                db.commit()
                db.refresh(a)
            except HTTPException:
                raise
            except Exception as e:
                found = _stripe_lookup_promotion_by_code(code)
                if found:
                    a.stripe_coupon_id = found["coupon_id"]
                    a.updated_at = datetime.utcnow()
                    db.commit()
                    db.refresh(a)
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Could not create this code in Stripe (it may already exist). "
                            f"Create it under Coupons first, then use Sync, or fix the error: {e!s}"
                        ),
                    )
        elif not a.stripe_coupon_id:
            found = _stripe_lookup_promotion_by_code(code)
            if found:
                a.stripe_coupon_id = found["coupon_id"]
                a.updated_at = datetime.utcnow()
                db.commit()
                db.refresh(a)

        return {"affiliate": _affiliate_row_dict(db, a)}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.patch("/api/admin/affiliates/{affiliate_id}")
async def admin_update_affiliate(affiliate_id: int, payload: AffiliateUpdateIn, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        a = db.query(Affiliate).filter(Affiliate.id == affiliate_id).first()
        if not a:
            raise HTTPException(status_code=404, detail="Affiliate not found")
        if payload.name is not None:
            a.name = payload.name.strip()
        if payload.stripe_coupon_id is not None:
            a.stripe_coupon_id = payload.stripe_coupon_id.strip() or None
        if payload.contact_email is not None:
            a.contact_email = payload.contact_email.strip() or None
        if payload.notes is not None:
            a.notes = payload.notes
        if payload.is_active is not None:
            a.is_active = payload.is_active
        a.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(a)
        return {"affiliate": _affiliate_row_dict(db, a)}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/api/admin/affiliates/{affiliate_id}/sync-stripe")
async def admin_affiliate_sync_stripe(affiliate_id: int, request: Request):
    """Look up promo_code in Stripe and store stripe_coupon_id so checkout can match this affiliate."""
    _require_admin(request)
    db = SessionLocal()
    try:
        a = db.query(Affiliate).filter(Affiliate.id == affiliate_id).first()
        if not a:
            raise HTTPException(status_code=404, detail="Affiliate not found")
        if not _stripe_client():
            raise HTTPException(status_code=503, detail="Stripe not configured (set STRIPE_SECRET_KEY)")
        found = _stripe_lookup_promotion_by_code(a.promo_code)
        if not found:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"No active Stripe promotion code matches '{a.promo_code}'. "
                    "Create it in Subscriptions → New Coupon (same code), or add a discount when creating the affiliate."
                ),
            )
        a.stripe_coupon_id = found["coupon_id"]
        a.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(a)
        return {"affiliate": _affiliate_row_dict(db, a), "stripe": found}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.get("/api/admin/affiliates/{affiliate_id}/events")
async def admin_affiliate_events(
    affiliate_id: int,
    request: Request,
    limit: int = Query(100, ge=1, le=500),
):
    _require_admin(request)
    db = SessionLocal()
    try:
        a = db.query(Affiliate).filter(Affiliate.id == affiliate_id).first()
        if not a:
            raise HTTPException(status_code=404, detail="Affiliate not found")
        evs = (
            db.query(AffiliateEvent)
            .filter(AffiliateEvent.affiliate_id == affiliate_id)
            .order_by(AffiliateEvent.id.desc())
            .limit(limit)
            .all()
        )
        out = []
        for e in evs:
            u = db.query(User).filter(User.id == e.user_id).first()
            out.append(
                {
                    "id": e.id,
                    "event_type": e.event_type,
                    "user_id": e.user_id,
                    "user_email": u.email if u else None,
                    "user_name": u.name if u else None,
                    "payment_id": e.payment_id,
                    "amount": e.amount,
                    "currency": e.currency,
                    "created_at": e.created_at.isoformat() if e.created_at else None,
                }
            )
        return {"events": out}
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════
#  ADMIN — Payments & Revenue
# ═══════════════════════════════════════════════════════════════════

def _payment_public_dict(p, db):
    user = db.query(User).filter(User.id == p.user_id).first() if p.user_id else None
    return {
        "id": p.id,
        "user_id": p.user_id,
        "user_name": user.name if user else "Unknown",
        "user_email": user.email if user else "",
        "subscription_id": p.subscription_id,
        "provider": p.provider or "stripe",
        "amount": p.amount,
        "currency": (p.currency or "usd").upper(),
        "status": p.status,
        "description": p.description,
        "invoice_url": p.invoice_url,
        "stripe_payment_id": p.stripe_payment_id,
        "refunded": bool(p.refunded),
        "refund_amount": p.refund_amount,
        "refunded_at": p.refunded_at.isoformat() if p.refunded_at else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }

@app.get("/api/admin/payments")
async def admin_list_payments(request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        payments = db.query(Payment).order_by(Payment.created_at.desc()).limit(200).all()
        return {"payments": [_payment_public_dict(p, db) for p in payments]}
    finally:
        db.close()

@app.post("/api/admin/payments/{payment_id}/refund")
async def admin_refund_payment(payment_id: int, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        pay = db.query(Payment).filter(Payment.id == payment_id).first()
        if not pay:
            raise HTTPException(status_code=404, detail="Payment not found")
        if pay.refunded:
            raise HTTPException(status_code=400, detail="Already refunded")
        pay.refunded = True
        pay.refund_amount = pay.amount
        pay.refunded_at = datetime.utcnow()
        pay.status = "refunded"
        db.commit()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════
#  ADMIN — Bulk email (DOMAIN_EMAIL_* / GMAIL_* or SMTP_* env names)
# ═══════════════════════════════════════════════════════════════════

_bulk_email_rate: dict[int, deque] = {}
_BULK_EMAIL_RATE_MAX = 5
_BULK_EMAIL_RATE_WINDOW_SEC = 60.0


def _bulk_email_smtp_params():
    """Resolve SMTP settings; supports journal-style DOMAIN_EMAIL_* and common SMTP_* names."""
    server = (
        os.environ.get("DOMAIN_EMAIL_SMTP_SERVER")
        or os.environ.get("SMTP_HOST")
        or "smtp.gmail.com"
    ).strip()
    port_raw = (
        os.environ.get("DOMAIN_EMAIL_SMTP_PORT")
        or os.environ.get("SMTP_PORT")
        or "587"
    ).strip()
    port = int(port_raw or "587")
    use_tls = (
        os.environ.get("DOMAIN_EMAIL_USE_TLS") or os.environ.get("SMTP_USE_TLS") or "true"
    ).lower() in {"1", "true", "yes", "on"}
    use_ssl = (
        os.environ.get("DOMAIN_EMAIL_USE_SSL") or os.environ.get("SMTP_USE_SSL") or "false"
    ).lower() in {"1", "true", "yes", "on"}
    username = (
        os.environ.get("DOMAIN_EMAIL_USERNAME")
        or os.environ.get("GMAIL_USERNAME")
        or os.environ.get("SMTP_USER")
        or ""
    ).strip()
    password = (
        os.environ.get("DOMAIN_EMAIL_PASSWORD")
        or os.environ.get("GMAIL_APP_PASSWORD")
        or os.environ.get("SMTP_PASSWORD")
        or ""
    ).strip()
    envelope_from = (
        os.environ.get("SMTP_FROM_EMAIL")
        or os.environ.get("MAIL_FROM")
        or username
        or (os.environ.get("ADMIN_ALERT_EMAIL") or "").strip()
    )
    return server, port, use_tls, use_ssl, username, password, envelope_from


def _bulk_email_rate_ok(admin_user_id: int) -> bool:
    now = time.time()
    dq = _bulk_email_rate.setdefault(admin_user_id, deque())
    while dq and dq[0] < now - _BULK_EMAIL_RATE_WINDOW_SEC:
        dq.popleft()
    if len(dq) >= _BULK_EMAIL_RATE_MAX:
        return False
    dq.append(now)
    return True


def _build_bulk_mime_message(to_addr: str, subject: str, html_body: str, envelope_from: str) -> str:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Talaria <{envelope_from}>"
    msg["To"] = to_addr
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    return msg.as_string()


def _run_bulk_smtp_session(
    unique_emails: list[str],
    subject: str,
    html_body: str,
) -> tuple[int, list[dict[str, str]]]:
    """One SMTP connection, EHLO→STARTTLS→EHLO→LOGIN (Office 365–friendly), then send each message."""
    server, port, use_tls, use_ssl, username, password, envelope_from = _bulk_email_smtp_params()
    if not password or not username:
        raise HTTPException(
            status_code=503,
            detail=(
                "Email not configured: set SMTP_USER + SMTP_PASSWORD + SMTP_HOST (or DOMAIN_EMAIL_*), "
                "and optional SMTP_FROM_EMAIL for the visible From address"
            ),
        )

    if (os.environ.get("SMTP_FROM_SAME_AS_USER", "").lower() in {"1", "true", "yes", "on"}):
        envelope_from = username

    timeout = int((os.environ.get("SMTP_TIMEOUT_SECONDS") or "60").strip() or "60")
    debug_smtp = (os.environ.get("SMTP_DEBUG", "").lower() in {"1", "true", "yes", "on"})

    sent_count = 0
    failed_emails: list[dict[str, str]] = []

    try:
        if use_ssl:
            context = ssl_module.create_default_context()
            smtp = smtplib.SMTP_SSL(server, port, context=context, timeout=timeout)
        else:
            smtp = smtplib.SMTP(server, port, timeout=timeout)

        with smtp:
            if debug_smtp:
                smtp.set_debuglevel(1)
            smtp.ehlo()
            if not use_ssl and use_tls:
                smtp.starttls(context=ssl_module.create_default_context())
                smtp.ehlo()
            smtp.login(username, password)

            for to_addr in unique_emails:
                try:
                    raw = _build_bulk_mime_message(to_addr, subject, html_body, envelope_from)
                    smtp.sendmail(envelope_from, [to_addr], raw)
                    sent_count += 1
                except Exception as e:  # noqa: BLE001 — per-recipient
                    failed_emails.append({"email": to_addr, "error": str(e)})
    except HTTPException:
        raise
    except smtplib.SMTPAuthenticationError as e:
        raise HTTPException(
            status_code=502,
            detail=(
                "SMTP authentication failed. For Microsoft 365: enable SMTP AUTH for this mailbox, "
                "use an app password if required, and ensure SMTP_USER/SMTP_PASSWORD are correct. "
                f"Details: {e}"
            ),
        )
    except (smtplib.SMTPException, OSError, TimeoutError) as e:
        raise HTTPException(
            status_code=502,
            detail=f"SMTP connection error: {e}",
        )

    return sent_count, failed_emails


class _BulkEmailIn(BaseModel):
    emails: list[str] = Field(..., max_length=500)
    subject: str = Field(..., min_length=1, max_length=500)
    content: str = Field(..., min_length=1, max_length=500_000)


@app.post("/api/admin/send-bulk-email")
async def admin_send_bulk_email(payload: _BulkEmailIn, request: Request):
    """Send HTML email to many recipients (admin session auth). Uses DOMAIN_EMAIL_* or SMTP_* env."""
    admin_user = _require_admin(request)
    if not _bulk_email_rate_ok(int(admin_user.id)):
        raise HTTPException(status_code=429, detail="Too many bulk send requests; try again in a minute")

    max_n = int(os.environ.get("BULK_EMAIL_MAX_RECIPIENTS", "500"))
    raw_emails = payload.emails or []
    unique_emails = list(dict.fromkeys([e.lower().strip() for e in raw_emails if e and isinstance(e, str) and "@" in e]))
    if not unique_emails:
        raise HTTPException(status_code=400, detail="No valid email addresses provided")
    if len(unique_emails) > max_n:
        raise HTTPException(status_code=400, detail=f"Too many recipients (max {max_n})")

    subject = payload.subject.strip()
    content = payload.content.strip()
    if not subject or not content:
        raise HTTPException(status_code=400, detail="Subject and content are required")

    sent_count, failed_emails = _run_bulk_smtp_session(unique_emails, subject, content)

    return {
        "success": True,
        "sent": sent_count,
        "total": len(unique_emails),
        "failed": len(failed_emails),
        "failed_emails": failed_emails[:25],
    }


@app.get("/api/admin/subscriptions/stats")
async def admin_subscription_stats(request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        total_subs = db.query(Subscription).count()
        active_subs = db.query(Subscription).filter(Subscription.status.in_(["active", "trialing"])).count()
        canceled_subs = db.query(Subscription).filter(Subscription.status == "canceled").count()
        manual_subs = db.query(Subscription).filter(Subscription.is_manual == True).count()

        total_revenue = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.status == "succeeded", Payment.refunded == False
        ).scalar() or 0
        total_refunded = db.query(func.coalesce(func.sum(Payment.refund_amount), 0)).filter(
            Payment.refunded == True
        ).scalar() or 0
        payment_count = db.query(Payment).filter(Payment.status == "succeeded").count()

        now = datetime.utcnow()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        mrr_payments = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.status == "succeeded",
            Payment.refunded == False,
            Payment.created_at >= month_start
        ).scalar() or 0

        plan_count = db.query(SubscriptionPlan).filter(SubscriptionPlan.is_active == True).count()
        journal_users = db.query(User).filter(User.has_journal_access == True).count()
        needs_payment_count = db.query(Subscription).filter(
            Subscription.status.in_(["past_due", "unpaid"])
        ).count()
        admin_extension_active_count = db.query(User).filter(
            User.access_expires_at.isnot(None),
            User.access_expires_at > datetime.utcnow(),
        ).count()

        return {
            "total_subscriptions": total_subs,
            "active_subscriptions": active_subs,
            "canceled_subscriptions": canceled_subs,
            "manual_subscriptions": manual_subs,
            "total_revenue": round(float(total_revenue), 2),
            "total_refunded": round(float(total_refunded), 2),
            "payment_count": payment_count,
            "mrr": round(float(mrr_payments), 2),
            "active_plans": plan_count,
            "journal_access_users": journal_users,
            "needs_payment_count": needs_payment_count,
            "admin_extension_active_count": admin_extension_active_count,
        }
    finally:
        db.close()


def _admin_collect_top_processes(limit: int = 8) -> dict:
    """Top CPU/memory processes on this host (helps explain high load vs low API CPU)."""
    if psutil is None:
        return {"by_cpu": [], "by_memory": []}
    limit = max(1, min(20, int(limit or 8)))
    rows: list[dict] = []
    for proc in psutil.process_iter(["pid", "name", "username"]):
        try:
            with proc.oneshot():
                mem = proc.memory_info()
                rows.append(
                    {
                        "pid": int(proc.pid),
                        "name": (proc.info.get("name") or "?")[:64],
                        "username": (proc.info.get("username") or "")[:32],
                        "cpu_percent": round(float(proc.cpu_percent(interval=0) or 0), 2),
                        "memory_percent": round(float(proc.memory_percent() or 0), 2),
                        "rss": int(mem.rss),
                        "rss_human": _human_bytes(int(mem.rss)),
                    }
                )
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
    by_cpu = sorted(rows, key=lambda r: r["cpu_percent"], reverse=True)[:limit]
    by_memory = sorted(rows, key=lambda r: r["memory_percent"], reverse=True)[:limit]
    return {"by_cpu": by_cpu, "by_memory": by_memory}


def _admin_interpret_load(load_average: dict | None, logical_cores: int) -> dict | None:
    if not load_average or not logical_cores:
        return None
    l1 = float(load_average.get("1m") or 0)
    l5 = float(load_average.get("5m") or 0)
    l15 = float(load_average.get("15m") or 0)
    ratio = l15 / max(1, logical_cores)
    if ratio >= 1.5:
        status = "critical"
        summary = (
            f"Load average {l15:.2f} on {logical_cores} cores — the CPU queue is backed up. "
            "Check top processes below (tile builds, Python workers, or brute-force traffic)."
        )
    elif ratio >= 1.0:
        status = "warning"
        summary = (
            f"Load average {l15:.2f} is above core count ({logical_cores}). "
            "Sustained load — inspect top processes and recent security events."
        )
    elif ratio >= 0.7:
        status = "elevated"
        summary = f"Load average {l15:.2f} is elevated for {logical_cores} cores — monitor if it keeps rising."
    else:
        status = "ok"
        summary = f"Load average {l15:.2f} is normal for {logical_cores} cores."
    return {
        "status": status,
        "ratio_15m": round(ratio, 3),
        "summary": summary,
        "cores_logical": int(logical_cores),
    }


def _admin_build_system_diagnostics(
    *,
    cpu_pct: float,
    load_health: dict | None,
    top_processes: dict,
    process_block: dict | None,
) -> list[dict]:
    out: list[dict] = []
    if load_health and load_health.get("status") in ("warning", "critical", "elevated"):
        out.append({"level": load_health["status"], "text": load_health.get("summary") or ""})
    top_cpu = (top_processes or {}).get("by_cpu") or []
    if top_cpu and float(top_cpu[0].get("cpu_percent") or 0) >= 25:
        p0 = top_cpu[0]
        out.append(
            {
                "level": "info",
                "text": (
                    f"Highest CPU: {p0.get('name')} (pid {p0.get('pid')}) "
                    f"at {p0.get('cpu_percent')}% — likely driver of system load."
                ),
            }
        )
    if process_block and cpu_pct >= 40 and float(process_block.get("cpu_percent") or 0) < 5:
        out.append(
            {
                "level": "info",
                "text": (
                    "System CPU is high but this API process is low — load is probably from "
                    "other containers/processes on the host (see Top processes)."
                ),
            }
        )
    top_mem = (top_processes or {}).get("by_memory") or []
    if top_mem and float(top_mem[0].get("memory_percent") or 0) >= 15:
        m0 = top_mem[0]
        out.append(
            {
                "level": "info",
                "text": (
                    f"Highest memory: {m0.get('name')} (pid {m0.get('pid')}) "
                    f"using {m0.get('memory_percent')}% RAM ({m0.get('rss_human')})."
                ),
            }
        )
    if not out:
        out.append({"level": "ok", "text": "No resource pressure detected in this snapshot."})
    return out


def _admin_docker_stats_snapshot() -> dict | None:
    """Optional docker stats when CLI is available (host or mounted socket)."""
    try:
        proc = subprocess.run(
            ["docker", "stats", "--no-stream", "--format", "{{json .}}"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0 or not (proc.stdout or "").strip():
        return None
    containers: list[dict] = []
    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        containers.append(
            {
                "name": row.get("Name") or row.get("Container") or "?",
                "cpu": row.get("CPUPerc") or row.get("CPU") or "",
                "mem_usage": row.get("MemUsage") or "",
                "mem_pct": row.get("MemPerc") or "",
                "net_io": row.get("NetIO") or "",
                "block_io": row.get("BlockIO") or "",
            }
        )
    return {"containers": containers[:20], "count": len(containers)} if containers else None


def _admin_system_metrics_payload() -> dict:
    """CPU, memory, disks, and network totals for the VPS hosting this API (requires psutil)."""
    if psutil is None:
        return {
            "success": True,
            "agent_available": False,
            "message": "Install psutil on the server to enable system metrics.",
        }

    cpu_pct = float(psutil.cpu_percent(interval=1.0))
    cpu_logical = psutil.cpu_count(logical=True) or 1
    cpu_physical = psutil.cpu_count(logical=False)

    try:
        la1, la5, la15 = os.getloadavg()
        load_average = {"1m": round(la1, 3), "5m": round(la5, 3), "15m": round(la15, 3)}
    except (OSError, AttributeError):
        load_average = None

    vm = psutil.virtual_memory()
    sw = psutil.swap_memory()

    disks_out: list[dict] = []
    seen_resolve: set[str] = set()
    disk_candidates = [
        ("Root", "/"),
        ("Data (uploads: CSV, bin, tiles)", UPLOAD_DIR.resolve()),
        ("App (this install)", _CHART_DIR.resolve()),
    ]
    for label, raw in disk_candidates:
        try:
            path = Path(raw).resolve()
        except Exception:
            continue
        key = str(path)
        if key in seen_resolve:
            continue
        try:
            usage = psutil.disk_usage(str(path))
        except (PermissionError, OSError):
            continue
        seen_resolve.add(key)
        disks_out.append(
            {
                "label": label,
                "path": key,
                "total": int(usage.total),
                "used": int(usage.used),
                "free": int(usage.free),
                "percent": round(float(usage.percent), 2),
                "total_human": _human_bytes(int(usage.total)),
                "used_human": _human_bytes(int(usage.used)),
                "free_human": _human_bytes(int(usage.free)),
            }
        )

    proc = psutil.Process()
    try:
        proc_mem = proc.memory_info()
        proc_cpu = float(proc.cpu_percent(interval=None))
    except Exception:
        proc_mem = None
        proc_cpu = None

    net_io = None
    try:
        n = psutil.net_io_counters()
        if n:
            net_io = {
                "bytes_sent": int(n.bytes_sent),
                "bytes_recv": int(n.bytes_recv),
                "packets_sent": int(n.packets_sent),
                "packets_recv": int(n.packets_recv),
                "errin": int(n.errin),
                "errout": int(n.errout),
            }
    except Exception:
        pass

    boot_t = psutil.boot_time()
    try:
        boot_iso = datetime.utcfromtimestamp(boot_t).strftime("%Y-%m-%d %H:%M:%S") + " UTC"
    except Exception:
        boot_iso = None
    uptime_s = max(0.0, time.time() - float(boot_t))

    top_processes = _admin_collect_top_processes()
    load_health = _admin_interpret_load(load_average, cpu_logical)
    proc_block = {
        "pid": proc.pid,
        "cpu_percent": round(proc_cpu, 2) if proc_cpu is not None else None,
        "rss": int(proc_mem.rss) if proc_mem else None,
        "rss_human": _human_bytes(int(proc_mem.rss)) if proc_mem else None,
        "threads": proc.num_threads() if hasattr(proc, "num_threads") else None,
    }
    diagnostics = _admin_build_system_diagnostics(
        cpu_pct=cpu_pct,
        load_health=load_health,
        top_processes=top_processes,
        process_block=proc_block,
    )
    docker_stats = _admin_docker_stats_snapshot()

    return {
        "success": True,
        "agent_available": True,
        "server_time_utc": datetime.utcnow().isoformat() + "Z",
        "hostname": _py_platform.node() or None,
        "platform": _py_platform.platform(),
        "python_version": _py_platform.python_version(),
        "boot_time_iso": boot_iso,
        "uptime_seconds": round(uptime_s, 2),
        "cpu": {
            "percent": round(cpu_pct, 2),
            "logical_cores": int(cpu_logical),
            "physical_cores": int(cpu_physical) if cpu_physical else None,
        },
        "load_average": load_average,
        "load_health": load_health,
        "memory": {
            "total": int(vm.total),
            "available": int(vm.available),
            "used": int(vm.used),
            "percent": round(float(vm.percent), 2),
            "total_human": _human_bytes(int(vm.total)),
            "available_human": _human_bytes(int(vm.available)),
            "used_human": _human_bytes(int(vm.used)),
        },
        "swap": {
            "total": int(sw.total),
            "used": int(sw.used),
            "free": int(sw.free),
            "percent": round(float(sw.percent), 2),
            "total_human": _human_bytes(int(sw.total)),
            "used_human": _human_bytes(int(sw.used)),
        },
        "disks": disks_out,
        "process": proc_block,
        "top_processes": top_processes,
        "diagnostics": diagnostics,
        "docker_stats": docker_stats,
        "network_total": net_io,
    }


@app.get("/api/admin/system/metrics")
async def admin_system_metrics(request: Request):
    _require_admin(request)
    return _admin_system_metrics_payload()


def _dir_size_bytes(path: Path, *, max_depth: int = 6) -> int:
    """
    Sum file sizes under `path` without following symlinks. Cheap enough for
    the 200 GB VPS (uploads/ is the biggest tree and walks in <1 s). Capped
    depth so a symlinked /proc can't take us down.
    """
    total = 0
    try:
        root_depth = len(path.parts)
        for root, _dirs, files in os.walk(path, followlinks=False):
            rp = Path(root)
            if len(rp.parts) - root_depth > max_depth:
                _dirs[:] = []
                continue
            for fn in files:
                try:
                    total += (rp / fn).stat(follow_symlinks=False).st_size
                except Exception:
                    continue
    except Exception:
        return total
    return total


@app.get("/api/admin/system/disk-health")
async def admin_system_disk_health(request: Request, sample_limit: int = 10):
    """
    Application-level disk health — complements `/metrics` which reports the
    raw filesystem view. Lets an admin answer:
      * What subdirs of `uploads/` are eating space? (FirstRate bundles, binary
        tiles, session archives, support attachments, job JSONs.)
      * Which trading-session states are close to the soft/hard caps?
      * Are there large / ancient support attachments worth pruning?

    READ-ONLY. Never deletes or mutates anything. Purely diagnostic so you can
    decide whether to run the archive / retention endpoints manually.

    `sample_limit` caps how many "largest N" rows are returned per category so
    the response stays bounded for a very large registry.
    """
    _require_admin(request)
    sample_limit = max(1, min(100, int(sample_limit or 10)))

    # --- Filesystem rollup of the uploads tree, bucketed by subdir. -------
    uploads_breakdown = []
    if UPLOAD_DIR.exists():
        for child in sorted(UPLOAD_DIR.iterdir(), key=lambda p: p.name):
            try:
                if child.is_symlink():
                    continue
                size = _dir_size_bytes(child) if child.is_dir() else child.stat().st_size
            except Exception:
                size = 0
            uploads_breakdown.append({
                "name": child.name,
                "is_dir": child.is_dir(),
                "bytes": size,
                "human": _human_bytes(size),
            })
    uploads_total = sum(row["bytes"] for row in uploads_breakdown)
    uploads_breakdown.sort(key=lambda r: r["bytes"], reverse=True)

    # --- Filesystem usage for the volume that holds `uploads/`. -----------
    try:
        du = shutil.disk_usage(str(UPLOAD_DIR.resolve()))
        disk = {
            "total": int(du.total), "used": int(du.used), "free": int(du.free),
            "percent": round(du.used / du.total * 100.0, 2) if du.total else 0.0,
            "total_human": _human_bytes(int(du.total)),
            "used_human": _human_bytes(int(du.used)),
            "free_human": _human_bytes(int(du.free)),
        }
    except Exception:
        disk = None

    # --- Session-state hotspots + journal-trade row counts. ---------------
    db = SessionLocal()
    top_session_states: list[dict] = []
    oversize_soft = 0
    oversize_hard = 0
    total_state_bytes = 0
    state_count = 0
    journal_trade_rows = 0
    attachments_total_bytes = 0
    attachments_count = 0
    oldest_attachment_iso = None
    top_attachments: list[dict] = []
    try:
        # state_json size distribution — use Postgres `octet_length` so we
        # don't pull every row into Python. Falls back to SQLite LENGTH() if
        # the app happens to run on SQLite (dev only).
        try:
            rows = db.execute(text(
                "SELECT session_id, user_id, octet_length(state_json) AS sz, updated_at "
                "FROM trading_session_states"
            )).fetchall()
        except Exception:
            rows = db.execute(text(
                "SELECT session_id, user_id, LENGTH(state_json) AS sz, updated_at "
                "FROM trading_session_states"
            )).fetchall()
        state_count = len(rows)
        for r in rows:
            sz = int(r[2] or 0)
            total_state_bytes += sz
            if sz > SESSION_STATE_HARD_LIMIT_BYTES:
                oversize_hard += 1
            elif sz > SESSION_STATE_SOFT_LIMIT_BYTES:
                oversize_soft += 1
        # Top-N largest rows
        rows_sorted = sorted(rows, key=lambda r: int(r[2] or 0), reverse=True)[:sample_limit]
        for r in rows_sorted:
            sz = int(r[2] or 0)
            top_session_states.append({
                "session_id": int(r[0]),
                "user_id": int(r[1]),
                "bytes": sz,
                "human": _human_bytes(sz),
                "updated_at": r[3].isoformat() + "Z" if r[3] else None,
                "bucket": "hard" if sz > SESSION_STATE_HARD_LIMIT_BYTES
                          else "soft" if sz > SESSION_STATE_SOFT_LIMIT_BYTES
                          else "ok",
            })

        # Journal-trade mirror row count (informational; expected to scale
        # linearly with users × trades-per-session).
        try:
            journal_trade_rows = int(db.execute(text(
                "SELECT COUNT(*) FROM trading_session_journal_trades"
            )).scalar() or 0)
        except Exception:
            journal_trade_rows = 0

        # Support attachments — bytes + count + oldest + top-N.
        try:
            atts = db.query(SupportAttachment).all()
            attachments_count = len(atts)
            attachments_total_bytes = sum(int(a.size_bytes or 0) for a in atts)
            if atts:
                oldest = min((a.created_at for a in atts if a.created_at), default=None)
                if oldest is not None:
                    oldest_attachment_iso = oldest.isoformat() + "Z"
            atts_sorted = sorted(atts, key=lambda a: int(a.size_bytes or 0), reverse=True)[:sample_limit]
            for a in atts_sorted:
                top_attachments.append({
                    "id": int(a.id),
                    "user_id": int(a.user_id),
                    "bytes": int(a.size_bytes or 0),
                    "human": _human_bytes(int(a.size_bytes or 0)),
                    "mime_type": a.mime_type,
                    "created_at": a.created_at.isoformat() + "Z" if a.created_at else None,
                })
        except Exception:
            pass
    finally:
        db.close()

    # --- Alert flags — easy booleans for UI / monitoring cron. ------------
    alerts = {
        "disk_over_80pct": bool(disk and disk["percent"] >= 80.0),
        "disk_over_90pct": bool(disk and disk["percent"] >= 90.0),
        "session_state_hard_breaches": oversize_hard,
        "session_state_soft_breaches": oversize_soft,
    }

    return {
        "success": True,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "limits": {
            "session_state_soft_bytes": SESSION_STATE_SOFT_LIMIT_BYTES,
            "session_state_hard_bytes": SESSION_STATE_HARD_LIMIT_BYTES,
        },
        "disk": disk,
        "uploads": {
            "path": str(UPLOAD_DIR.resolve()),
            "total_bytes": uploads_total,
            "total_human": _human_bytes(uploads_total),
            "breakdown": uploads_breakdown,
        },
        "session_states": {
            "row_count": state_count,
            "total_bytes": total_state_bytes,
            "total_human": _human_bytes(total_state_bytes),
            "avg_bytes": int(total_state_bytes / state_count) if state_count else 0,
            "soft_breach_count": oversize_soft,
            "hard_breach_count": oversize_hard,
            "top": top_session_states,
        },
        "journal_trade_rows": journal_trade_rows,
        "support_attachments": {
            "count": attachments_count,
            "total_bytes": attachments_total_bytes,
            "total_human": _human_bytes(attachments_total_bytes),
            "oldest": oldest_attachment_iso,
            "top": top_attachments,
        },
        "alerts": alerts,
    }


def _session_archive_path(session_id: int) -> Path:
    return SESSION_ARCHIVE_DIR / f"session_{int(session_id)}_state.json.gz"


class AdminArchiveStaleSessionsIn(BaseModel):
    """
    Controls for `/api/admin/system/archive-stale-sessions`.

    `older_than_days` — only archive sessions whose `TradingSessionState.updated_at`
    is older than this many days (default 90).
    `min_state_bytes` — skip sessions whose state_json is smaller than this
    (no point compressing 2 KB rows; default 256 KB).
    `dry_run` — when true, computes what *would* be archived and returns the
    plan without touching the DB or filesystem. Always the safe first call.
    `limit` — bound the number of rows processed in one call so the worst-case
    DB write storm is predictable (default 200).
    """
    older_than_days: int = Field(default=90, ge=1, le=3650)
    min_state_bytes: int = Field(default=256 * 1024, ge=1024, le=64 * 1024 * 1024)
    dry_run: bool = True
    limit: int = Field(default=200, ge=1, le=5000)


@app.post("/api/admin/system/archive-stale-sessions")
async def admin_archive_stale_sessions(payload: AdminArchiveStaleSessionsIn, request: Request):
    """
    Move `TradingSessionState.state_json` for stale, large sessions into
    gzip'd files on disk (`uploads/session_archive/`) and null out the DB
    column. The `TradingSession` row itself is **not** deleted — the user
    still sees the session in their list and can restore it on demand via
    `/api/admin/system/restore-archived-session`.

    Why this exists: a single backtest session accumulates drawings + journal
    entries in the `state_json` column indefinitely. At 10 MB × 1000 stale
    sessions that's 10 GB of Postgres bloat on a 200 GB VPS. Gzipped on disk
    those same blobs shrink ~10× and leave the hot DB table small.

    Always run `dry_run=true` first (default) — you'll get back the exact
    list of sessions that would be touched and the reclaimed-bytes total.
    """
    _require_admin(request)
    cutoff = datetime.utcnow() - timedelta(days=int(payload.older_than_days))

    db = SessionLocal()
    plan: list[dict] = []
    archived_bytes = 0
    errors: list[dict] = []
    try:
        # Join state ↔ session so we can include user/name in the report.
        try:
            rows = db.execute(text(
                "SELECT st.session_id, st.user_id, st.updated_at, "
                "       octet_length(st.state_json) AS sz, s.name "
                "FROM trading_session_states st "
                "JOIN trading_sessions s ON s.id = st.session_id "
                "WHERE st.updated_at < :cutoff "
                "  AND octet_length(st.state_json) >= :min_sz "
                "ORDER BY octet_length(st.state_json) DESC "
                "LIMIT :lim"
            ), {
                "cutoff": cutoff,
                "min_sz": int(payload.min_state_bytes),
                "lim": int(payload.limit),
            }).fetchall()
        except Exception:
            # SQLite fallback for local dev
            rows = db.execute(text(
                "SELECT st.session_id, st.user_id, st.updated_at, "
                "       LENGTH(st.state_json) AS sz, s.name "
                "FROM trading_session_states st "
                "JOIN trading_sessions s ON s.id = st.session_id "
                "WHERE st.updated_at < :cutoff "
                "  AND LENGTH(st.state_json) >= :min_sz "
                "ORDER BY LENGTH(st.state_json) DESC "
                "LIMIT :lim"
            ), {
                "cutoff": cutoff,
                "min_sz": int(payload.min_state_bytes),
                "lim": int(payload.limit),
            }).fetchall()

        for r in rows:
            sid = int(r[0])
            plan.append({
                "session_id": sid,
                "user_id": int(r[1]),
                "updated_at": r[2].isoformat() + "Z" if r[2] else None,
                "bytes": int(r[3] or 0),
                "human": _human_bytes(int(r[3] or 0)),
                "name": r[4],
            })

        if payload.dry_run:
            resp = {
                "success": True,
                "dry_run": True,
                "cutoff_utc": cutoff.isoformat() + "Z",
                "would_archive_count": len(plan),
                "would_reclaim_bytes": sum(p["bytes"] for p in plan),
                "would_reclaim_human": _human_bytes(sum(p["bytes"] for p in plan)),
                "sample": plan[:25],
            }
            _record_admin_action(
                request,
                action="archive_stale_sessions",
                status="dry_run",
                status_code=200,
                target_type="trading_session_state",
                params={
                    "older_than_days": payload.older_than_days,
                    "min_state_bytes": payload.min_state_bytes,
                    "limit": payload.limit,
                },
                result={
                    "would_archive_count": resp["would_archive_count"],
                    "would_reclaim_bytes": resp["would_reclaim_bytes"],
                },
            )
            return resp

        # Not a dry run — actually archive. We do one session at a time with
        # per-row commits so a later failure doesn't lose earlier progress.
        #
        # Concurrency guard: between listing the plan and processing each row
        # the user may have re-opened the session and saved fresh drawings.
        # If `updated_at` has moved past our cutoff we SKIP — the row is no
        # longer stale and archiving it would clobber the user's latest work
        # (the gzip would hold it, but the DB row would go back to "{}").
        for p in plan:
            sid = p["session_id"]
            try:
                st = db.query(TradingSessionState).filter(
                    TradingSessionState.session_id == sid
                ).first()
                if not st or not st.state_json:
                    continue
                if st.updated_at is not None and st.updated_at >= cutoff:
                    errors.append({
                        "session_id": sid,
                        "error": "skipped: session was updated after dry-run cutoff",
                    })
                    continue
                archive_path = _session_archive_path(sid)
                # Don't clobber an existing archive — suffix with timestamp so
                # admin can re-run without losing earlier snapshots.
                if archive_path.exists():
                    archive_path = SESSION_ARCHIVE_DIR / (
                        f"session_{sid}_state_{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}.json.gz"
                    )
                with gzip.open(archive_path, "wb") as fh:
                    fh.write(st.state_json.encode("utf-8"))
                reclaimed = len(st.state_json.encode("utf-8"))
                # Replace with empty object so the app still gets a valid row.
                st.state_json = "{}"
                st.updated_at = datetime.utcnow()
                db.commit()
                archived_bytes += reclaimed
            except Exception as exc:
                db.rollback()
                errors.append({"session_id": sid, "error": str(exc)[:300]})
    finally:
        db.close()

    resp = {
        "success": True,
        "dry_run": False,
        "cutoff_utc": cutoff.isoformat() + "Z",
        "archived_count": len(plan) - len(errors),
        "reclaimed_bytes": archived_bytes,
        "reclaimed_human": _human_bytes(archived_bytes),
        "archive_dir": str(SESSION_ARCHIVE_DIR.resolve()),
        "errors": errors,
    }
    _record_admin_action(
        request,
        action="archive_stale_sessions",
        status="error" if errors and archived_bytes == 0 else "ok",
        status_code=200,
        target_type="trading_session_state",
        params={
            "older_than_days": payload.older_than_days,
            "min_state_bytes": payload.min_state_bytes,
            "limit": payload.limit,
            "dry_run": False,
        },
        result={
            "archived_count": resp["archived_count"],
            "reclaimed_bytes": resp["reclaimed_bytes"],
            "error_count": len(errors),
            "archived_session_ids": [p["session_id"] for p in plan][:50],
        },
        error=("; ".join(e.get("error", "") for e in errors[:5]) if errors else None),
    )
    return resp


class AdminPruneAttachmentsIn(BaseModel):
    """
    Controls for `/api/admin/system/prune-support-attachments`.

    `older_than_days` — only target attachments attached to support messages
    older than this (default 180). Joins `support_messages.created_at` so a
    recently-uploaded image on an old thread is still protected.
    `closed_threads_only` — when true (default), skip attachments whose thread
    is still `open`. Prevents surprising an active user.
    `dry_run` — when true (default), reports what would be deleted and stops.
    `limit` — max attachments touched per call (default 500).
    """
    older_than_days: int = Field(default=180, ge=30, le=3650)
    closed_threads_only: bool = True
    dry_run: bool = True
    limit: int = Field(default=500, ge=1, le=10000)


@app.post("/api/admin/system/prune-support-attachments")
async def admin_prune_support_attachments(payload: AdminPruneAttachmentsIn, request: Request):
    """
    Delete old support-thread image attachments from disk + DB to reclaim
    space. Dry-run by default.

    What gets targeted:
      * Attachment rows where the parent `SupportMessage.created_at` is older
        than `older_than_days`.
      * If `closed_threads_only` is on, the parent `SupportThread.status`
        must be 'closed' as well.

    The parent `SupportMessage` / `SupportThread` are **not** deleted — the
    text conversation stays intact for audit. Only the image payload + its
    DB attachment row are removed.

    Run dry-run first and eyeball the sample before setting `dry_run=false`.
    """
    _require_admin(request)
    cutoff = datetime.utcnow() - timedelta(days=int(payload.older_than_days))

    db = SessionLocal()
    plan: list[dict] = []
    deleted_count = 0
    reclaimed_bytes = 0
    errors: list[dict] = []
    try:
        # Join attachments ↔ messages ↔ threads so we can filter on message
        # age + thread status in one query.
        q = (
            db.query(SupportAttachment, SupportMessage, SupportThread)
            .join(SupportMessage, SupportAttachment.message_id == SupportMessage.id)
            .join(SupportThread, SupportMessage.thread_id == SupportThread.id)
            .filter(SupportMessage.created_at < cutoff)
        )
        if payload.closed_threads_only:
            q = q.filter(SupportThread.status == "closed")
        q = q.order_by(SupportMessage.created_at.asc()).limit(int(payload.limit))
        rows = q.all()

        for att, msg, thr in rows:
            plan.append({
                "attachment_id": int(att.id),
                "message_id": int(msg.id),
                "thread_id": int(thr.id),
                "user_id": int(att.user_id),
                "bytes": int(att.size_bytes or 0),
                "human": _human_bytes(int(att.size_bytes or 0)),
                "mime_type": att.mime_type,
                "thread_status": thr.status,
                "message_created_at": msg.created_at.isoformat() + "Z" if msg.created_at else None,
            })

        if payload.dry_run:
            resp = {
                "success": True,
                "dry_run": True,
                "cutoff_utc": cutoff.isoformat() + "Z",
                "closed_threads_only": bool(payload.closed_threads_only),
                "would_delete_count": len(plan),
                "would_reclaim_bytes": sum(p["bytes"] for p in plan),
                "would_reclaim_human": _human_bytes(sum(p["bytes"] for p in plan)),
                "sample": plan[:25],
            }
            _record_admin_action(
                request,
                action="prune_support_attachments",
                status="dry_run",
                status_code=200,
                target_type="support_attachment",
                params={
                    "older_than_days": payload.older_than_days,
                    "closed_threads_only": bool(payload.closed_threads_only),
                    "limit": payload.limit,
                },
                result={
                    "would_delete_count": resp["would_delete_count"],
                    "would_reclaim_bytes": resp["would_reclaim_bytes"],
                },
            )
            return resp

        # Live mode — walk the same list, unlink file + delete DB row.
        # Defense-in-depth: even though `stored_name` is server-generated via
        # `secrets.token_urlsafe` (see _support_write_image_file), we verify
        # the resolved path is still inside SUPPORT_UPLOAD_DIR before unlink.
        # Cheap, and survives future refactors that might accept user input.
        support_root = SUPPORT_UPLOAD_DIR.resolve()
        for att, _msg, _thr in rows:
            try:
                stored = (att.stored_name or "").strip()
                if not stored or "/" in stored or "\\" in stored or stored.startswith("."):
                    errors.append({"attachment_id": int(att.id), "error": "suspicious stored_name; skipped"})
                    continue
                fpath = (SUPPORT_UPLOAD_DIR / stored).resolve()
                try:
                    fpath.relative_to(support_root)
                except ValueError:
                    errors.append({"attachment_id": int(att.id), "error": "path escaped support dir; skipped"})
                    continue
                size = int(att.size_bytes or 0)
                if fpath.is_file():
                    fpath.unlink()
                db.delete(att)
                db.commit()
                deleted_count += 1
                reclaimed_bytes += size
            except Exception as exc:
                db.rollback()
                errors.append({"attachment_id": int(att.id), "error": str(exc)[:300]})
    finally:
        db.close()

    resp = {
        "success": True,
        "dry_run": False,
        "cutoff_utc": cutoff.isoformat() + "Z",
        "deleted_count": deleted_count,
        "reclaimed_bytes": reclaimed_bytes,
        "reclaimed_human": _human_bytes(reclaimed_bytes),
        "errors": errors,
    }
    _record_admin_action(
        request,
        action="prune_support_attachments",
        status="error" if errors and deleted_count == 0 else "ok",
        status_code=200,
        target_type="support_attachment",
        params={
            "older_than_days": payload.older_than_days,
            "closed_threads_only": bool(payload.closed_threads_only),
            "limit": payload.limit,
            "dry_run": False,
        },
        result={
            "deleted_count": deleted_count,
            "reclaimed_bytes": reclaimed_bytes,
            "error_count": len(errors),
        },
        error=("; ".join(e.get("error", "") for e in errors[:5]) if errors else None),
    )
    return resp


@app.post("/api/admin/system/restore-archived-session/{session_id}")
async def admin_restore_archived_session(session_id: int, request: Request):
    """
    Reverse of `/archive-stale-sessions`: pull the gzipped state back from
    `uploads/session_archive/` into `TradingSessionState.state_json` so the
    session is hot again. Skips if the session is already populated (> 2
    bytes — beyond the default `{}`), so we never clobber fresh user edits.
    """
    _require_admin(request)
    archive_path = _session_archive_path(session_id)
    if not archive_path.exists():
        # Fall back to timestamped snapshots if the canonical path was renamed.
        candidates = sorted(SESSION_ARCHIVE_DIR.glob(f"session_{int(session_id)}_state*.json.gz"))
        if not candidates:
            raise HTTPException(status_code=404, detail="No archive for this session")
        archive_path = candidates[-1]  # most recent timestamped one

    try:
        with gzip.open(archive_path, "rb") as fh:
            raw = fh.read().decode("utf-8")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read archive: {exc}")

    db = SessionLocal()
    try:
        st = db.query(TradingSessionState).filter(
            TradingSessionState.session_id == int(session_id)
        ).first()
        if not st:
            raise HTTPException(status_code=404, detail="Session state row missing")
        # Guard: don't overwrite a state that has meaningful content (> 64 B
        # leaves room for `{}` + whitespace but catches any real payload).
        current = (st.state_json or "").strip()
        if len(current.encode("utf-8")) > 64:
            raise HTTPException(
                status_code=409,
                detail="Session already has live state; archive left on disk (not restored)",
            )
        st.state_json = raw
        st.updated_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()

    resp = {
        "success": True,
        "session_id": int(session_id),
        "restored_bytes": len(raw.encode("utf-8")),
        "restored_human": _human_bytes(len(raw.encode("utf-8"))),
        "archive_path": str(archive_path.resolve()),
    }
    _record_admin_action(
        request,
        action="restore_archived_session",
        status="ok",
        status_code=200,
        target_type="trading_session_state",
        target_id=int(session_id),
        params={"session_id": int(session_id)},
        result={"restored_bytes": resp["restored_bytes"]},
    )
    return resp


# ───────────────────────────────────────────────────────────────────────
# Admin audit-log read API
# ───────────────────────────────────────────────────────────────────────

@app.get("/api/admin/audit-log")
async def admin_audit_log_list(
    request: Request,
    limit: int = 200,
    offset: int = 0,
    action: str | None = None,
    admin_user_id: int | None = None,
    status: str | None = None,
    since_days: int | None = None,
    q: str | None = None,
    target_user_id: int | None = None,
):
    """
    Paginated, filterable view of `admin_audit_log`. Admin-only.

    Query params:
      * `limit`         — rows per page, clamped to [1, 500]
      * `offset`        — row offset for pagination
      * `action`        — substring match on `action` column
      * `admin_user_id` — exact match
      * `status`        — ok | error | denied | dry_run
      * `since_days`    — only rows created within the last N days
      * `q`             — free-text substring across path + params + result
      * `target_user_id` — rows that concern this user (structured target or path under `/api/admin/users/{id}/`)

    The list itself is read-only; the middleware will not log this call
    because GET isn't in `_AUDIT_MUTATING_METHODS` (no self-referential noise).
    """
    _require_admin(request)
    limit = max(1, min(500, int(limit or 200)))
    offset = max(0, int(offset or 0))

    db = SessionLocal()
    try:
        qry = db.query(AdminAuditLog)
        if action:
            qry = qry.filter(AdminAuditLog.action.ilike(f"%{action[:64]}%"))
        if admin_user_id:
            qry = qry.filter(AdminAuditLog.admin_user_id == int(admin_user_id))
        if status:
            qry = qry.filter(AdminAuditLog.status == status[:16])
        if since_days:
            cutoff = datetime.utcnow() - timedelta(days=max(1, int(since_days)))
            qry = qry.filter(AdminAuditLog.created_at >= cutoff)
        if q:
            needle = f"%{q[:200]}%"
            qry = qry.filter(
                (AdminAuditLog.path.ilike(needle))
                | (AdminAuditLog.params_json.ilike(needle))
                | (AdminAuditLog.result_json.ilike(needle))
                | (AdminAuditLog.error_message.ilike(needle))
            )
        if target_user_id is not None:
            tid = int(target_user_id)
            tid_s = str(tid)
            user_path = f"/api/admin/users/{tid}"
            qry = qry.filter(
                or_(
                    and_(AdminAuditLog.target_type == "user", AdminAuditLog.target_id == tid_s),
                    AdminAuditLog.path.like(f"{user_path}/%"),
                    AdminAuditLog.path == user_path,
                )
            )
        total = qry.count()
        rows = (
            qry.order_by(AdminAuditLog.created_at.desc())
               .offset(offset).limit(limit).all()
        )
        return {
            "success": True,
            "total": int(total),
            "limit": limit,
            "offset": offset,
            "entries": [{
                "id": int(r.id),
                "created_at": r.created_at.isoformat() + "Z" if r.created_at else None,
                "admin_user_id": r.admin_user_id,
                "admin_email": r.admin_email,
                "action": r.action,
                "method": r.method,
                "path": r.path,
                "target_type": r.target_type,
                "target_id": r.target_id,
                "status": r.status,
                "status_code": r.status_code,
                "params": r.params_json,
                "result": r.result_json,
                "error": r.error_message,
                "ip_address": r.ip_address,
                "user_agent": r.user_agent,
            } for r in rows],
        }
    finally:
        db.close()


class AdminAuditLogPruneIn(BaseModel):
    """
    Retention for `admin_audit_log`. Default keeps one year. Dry-run by
    default — shows you how many rows would be dropped before you commit.
    """
    older_than_days: int = Field(default=365, ge=30, le=3650)
    dry_run: bool = True


@app.post("/api/admin/audit-log/prune")
async def admin_audit_log_prune(payload: AdminAuditLogPruneIn, request: Request):
    """
    Delete audit-log entries older than N days. Recommended to run rarely
    (once a quarter) so you retain a long forensic tail.
    """
    _require_admin(request)
    cutoff = datetime.utcnow() - timedelta(days=int(payload.older_than_days))
    db = SessionLocal()
    try:
        qry = db.query(AdminAuditLog).filter(AdminAuditLog.created_at < cutoff)
        total = qry.count()
        if payload.dry_run:
            _record_admin_action(
                request,
                action="audit_log_prune",
                status="dry_run",
                status_code=200,
                target_type="admin_audit_log",
                params={"older_than_days": payload.older_than_days},
                result={"would_delete": int(total)},
            )
            return {"success": True, "dry_run": True, "would_delete": int(total), "cutoff_utc": cutoff.isoformat() + "Z"}
        deleted = qry.delete(synchronize_session=False)
        db.commit()
        _record_admin_action(
            request,
            action="audit_log_prune",
            status="ok",
            status_code=200,
            target_type="admin_audit_log",
            params={"older_than_days": payload.older_than_days, "dry_run": False},
            result={"deleted": int(deleted or 0)},
        )
        return {"success": True, "dry_run": False, "deleted": int(deleted or 0), "cutoff_utc": cutoff.isoformat() + "Z"}
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════

@app.get("/api/sessions")
async def list_trading_sessions(request: Request):
    user = _require_paid_journal_user(request)
    db = SessionLocal()
    try:
        q = db.query(TradingSession).filter(TradingSession.user_id == user.id)
        sessions = q.order_by(TradingSession.created_at.desc()).all()
        ids = [s.id for s in sessions]
        state_by_sid: dict = {}
        if ids:
            for st in (
                db.query(TradingSessionState)
                .filter(TradingSessionState.session_id.in_(ids))
                .all()
            ):
                state_by_sid[int(st.session_id)] = st
        out = []
        for s in sessions:
            row = _session_public_dict(s)
            st = state_by_sid.get(int(s.id))
            if st:
                try:
                    state = _parse_json_dict(st.state_json)
                    replay = state.get("replay") if isinstance(state.get("replay"), dict) else {}
                    dash = replay.get("dashboard") if isinstance(replay.get("dashboard"), dict) else {}
                    if dash:
                        row["replay_dashboard"] = _sanitize_for_json(dash)
                except Exception:
                    pass
            out.append(row)
        return {"sessions": out}
    finally:
        db.close()


@app.get("/api/sessions/kpis")
async def list_all_sessions_kpis(request: Request):
    """Dashboard batch: one request instead of N× GET /api/sessions/{id}/analytics.

    Cached per-user in Redis (versioned, invalidated on any journal/session write) so
    repeated dashboard loads and view switches don't recompute analytics for every
    session on every request. Falls back to live computation when Redis is unavailable.
    """
    user = _require_paid_journal_user(request)

    version = chart_redis.dashboard_get_version(user.id)
    cached = chart_redis.dashboard_kpis_get_cache(user.id, version)
    if isinstance(cached, dict) and isinstance(cached.get("kpis_by_session_id"), dict):
        return cached

    db = SessionLocal()
    try:
        sessions = (
            db.query(TradingSession)
            .filter(TradingSession.user_id == user.id)
            .order_by(TradingSession.created_at.desc())
            .all()
        )
        kpis_by_id: dict = {}
        for s in sessions:
            st = _get_or_create_trading_session_state(db, session_id=s.id, user_id=s.user_id)
            state = _parse_json_dict(st.state_json)
            journal = sjs.resolve_session_journal(
                db,
                s.id,
                s.user_id,
                state,
                journal_trade_model=TradingSessionJournalTrade,
                sync_fn=_sync_trading_session_journal_trades,
            )
            session_public = _session_public_dict(s)
            analytics = _compute_session_analytics(session_public, journal)
            sanitized = _sanitize_for_json(analytics)
            k = sanitized.get("kpis") if isinstance(sanitized.get("kpis"), dict) else {}
            kpis_by_id[str(s.id)] = k
        payload = {"kpis_by_session_id": kpis_by_id}
        chart_redis.dashboard_kpis_set_cache(user.id, version, payload, ttl_sec=300)
        return payload
    finally:
        db.close()


@app.get("/api/strategies")
async def list_strategies_chart_shim(request: Request):
    """Journal strategies live on Flask at /journal/api/strategies (nginx). When that route is missing,
    return an empty list so SPAs do not 404 this URL."""
    _require_user(request)
    return {"strategies": []}


@app.post("/api/sessions")
async def create_trading_session(payload: TradingSessionCreateIn, request: Request):
    user = _require_paid_journal_user(request)
    name = (payload.name or "").strip()
    session_type = (payload.session_type or "").strip().lower()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if session_type not in {"personal", "propfirm"}:
        raise HTTPException(status_code=400, detail="Invalid session_type")

    try:
        cfg_json = json.dumps(payload.config or {}, separators=(",", ":"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid config")

    db = SessionLocal()
    try:
        effective_user = _enforce_backtest_limits(db, user, payload.config or {}, is_create=True)
        s = TradingSession(user_id=user.id, name=name, session_type=session_type, config_json=cfg_json)
        db.add(s)
        db.flush()
        _verify_session_count_after_flush(db, effective_user)
        db.commit()
        db.refresh(s)
        chart_redis.dashboard_bump_version(s.user_id)
        return {"session": _session_public_dict(s)}
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

@app.get("/api/sessions/{session_id}")
async def get_trading_session(session_id: int, request: Request):
    user = _require_paid_journal_user(request)
    db = SessionLocal()
    try:
        s = db.query(TradingSession).filter(TradingSession.id == session_id).first()
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")
        if not _can_access_trading_session(user, s):
            raise HTTPException(status_code=403, detail="Forbidden")
        return {"session": _session_public_dict(s)}
    finally:
        db.close()

@app.get("/api/sessions/{session_id}/state")
async def get_trading_session_state(session_id: int, request: Request):
    user = _require_paid_journal_user(request)
    db = SessionLocal()
    try:
        s = db.query(TradingSession).filter(TradingSession.id == session_id).first()
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")
        if not _can_access_trading_session(user, s):
            raise HTTPException(status_code=403, detail="Forbidden")

        st = _get_or_create_trading_session_state(db, session_id=s.id, user_id=s.user_id)
        state = _parse_json_dict(st.state_json)
        journal = sjs.resolve_session_journal(
            db,
            s.id,
            s.user_id,
            state,
            journal_trade_model=TradingSessionJournalTrade,
            sync_fn=_sync_trading_session_journal_trades,
        )
        sjs.apply_journal_to_state_for_response(state, journal)
        # Drawings canonical store: chart_drawings table (per symbol/session). Legacy blob stripped from API.
        if isinstance(state.get('drawings'), list):
            state.pop('drawings', None)
        return {
            "state": {
                "drawings": [],
                "drawings_source": "chart_drawings_api",
                "journal": state.get("journal") if isinstance(state.get("journal"), list) else [],
                "journal_by_ticker": state.get("journal_by_ticker")
                if isinstance(state.get("journal_by_ticker"), dict)
                else {},
                "per_instrument_stats": state.get("per_instrument_stats")
                if isinstance(state.get("per_instrument_stats"), dict)
                else {},
                "pending_orders": state.get("pending_orders") if isinstance(state.get("pending_orders"), list) else [],
                "open_positions": state.get("open_positions") if isinstance(state.get("open_positions"), list) else [],
                "closed_positions": state.get("closed_positions") if isinstance(state.get("closed_positions"), list) else [],
                "account_runtime": state.get("account_runtime") if isinstance(state.get("account_runtime"), dict) else {},
                "order_counters": state.get("order_counters") if isinstance(state.get("order_counters"), dict) else {},
                "replay": state.get("replay") if isinstance(state.get("replay"), dict) else {},
                "chartView": state.get("chartView") if isinstance(state.get("chartView"), dict) else {},
                "chartSettings": state.get("chartSettings") if isinstance(state.get("chartSettings"), dict) else {},
                "toolDefaults": state.get("toolDefaults") if isinstance(state.get("toolDefaults"), dict) else {},
                "indicators": state.get("indicators") if isinstance(state.get("indicators"), list) else [],
                "propfirm_challenge": state.get("propfirm_challenge") if isinstance(state.get("propfirm_challenge"), dict) else {},
                "updated_at": st.updated_at.isoformat() if st.updated_at else None,
            }
        }
    finally:
        db.close()


@app.post("/api/sessions/{session_id}/journal/import-csv")
async def import_trading_session_journal_csv(
    session_id: int,
    request: Request,
    mode: str = Query("replace"),
    start_balance: float | None = Query(None, description="When set, writes session.config startBalance for return % metrics."),
    file: UploadFile = File(...),
):
    """Replace or append `state.journal` from a UTF-8 CSV (see `analytics_core.csv_journal`)."""
    user = _require_paid_journal_user(request)
    mode_clean = (mode or "replace").strip().lower()
    if mode_clean not in {"replace", "append"}:
        raise HTTPException(status_code=400, detail="mode must be replace or append")

    raw = await file.read()
    if len(raw) > 12 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="CSV file too large (max 12 MB)")

    parsed = parse_trades_csv_bytes(raw)
    errs = parsed.get("errors") or []
    if errs:
        raise HTTPException(
            status_code=400,
            detail={"message": "CSV parse errors", "errors": errs[:80]},
        )
    new_trades = parsed.get("trades") or []
    if not new_trades:
        raise HTTPException(status_code=400, detail="No trades parsed from CSV")

    db = SessionLocal()
    try:
        s = db.query(TradingSession).filter(TradingSession.id == session_id).first()
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")
        if not _can_access_trading_session(user, s):
            raise HTTPException(status_code=403, detail="Forbidden")

        if start_balance is not None and math.isfinite(float(start_balance)) and float(start_balance) > 0:
            try:
                cfg = json.loads(s.config_json or "{}")
            except Exception:
                cfg = {}
            if not isinstance(cfg, dict):
                cfg = {}
            cfg["startBalance"] = float(start_balance)
            s.config_json = json.dumps(cfg, separators=(",", ":"))

        st = _get_or_create_trading_session_state(db, session_id=s.id, user_id=s.user_id)
        state = _parse_json_dict(st.state_json)
        existing = sjs.resolve_session_journal(
            db,
            s.id,
            s.user_id,
            state,
            journal_trade_model=TradingSessionJournalTrade,
            sync_fn=_sync_trading_session_journal_trades,
        )
        if mode_clean == "append":
            merged = list(existing) + list(new_trades)
        else:
            merged = list(new_trades)
        try:
            sjs.enforce_journal_trade_limit(merged)
        except sjs.JournalTradeLimitExceeded as exc:
            raise HTTPException(status_code=413, detail=str(exc)) from exc
        _sync_trading_session_journal_trades(db, session_id=s.id, user_id=s.user_id, journal=merged)
        if sjs.strip_journal_from_state_json_enabled():
            sjs.strip_journal_from_persisted_state(state)
        else:
            state["journal"] = merged

        new_state_json = json.dumps(state, separators=(",", ":"))
        new_size = len(new_state_json.encode("utf-8"))
        prev_size = len((st.state_json or "").encode("utf-8"))
        if new_size > SESSION_STATE_HARD_LIMIT_BYTES and new_size > prev_size:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"Session state too large after import "
                    f"({new_size / 1_048_576:.1f} MB; hard limit "
                    f"{SESSION_STATE_HARD_LIMIT_BYTES / 1_048_576:.0f} MB)."
                ),
            )

        st.state_json = new_state_json
        db.commit()
        db.refresh(st)
        chart_redis.dashboard_bump_version(s.user_id)
        journal_len = len(merged)
        warning = None
        if new_size > SESSION_STATE_SOFT_LIMIT_BYTES:
            warning = (
                f"Session state is {new_size / 1_048_576:.1f} MB (soft limit "
                f"{SESSION_STATE_SOFT_LIMIT_BYTES / 1_048_576:.0f} MB)."
            )
        return {
            "imported": len(new_trades),
            "mode": mode_clean,
            "journal_len": journal_len,
            "warnings": list(parsed.get("warnings") or []),
            "warning": warning,
        }
    finally:
        db.close()


@app.get("/api/sessions/seed-demo-trades/scenarios")
async def list_seed_demo_trade_scenarios(request: Request):
    """QA helper: scenario presets for session-aligned demo trade seeding."""
    _require_paid_journal_user(request)
    return {"scenarios": seed_scenario_catalog()}


@app.post("/api/sessions/{session_id}/seed-demo-trades")
async def seed_trading_session_demo_trades(
    session_id: int,
    request: Request,
    count: int = Query(200, ge=1, le=2000),
    mode: str = Query("replace", description="replace or append seeded trades"),
    scenario: str = Query("balanced", description="realistic | balanced | extreme | stress | losing | winning"),
):
    """QA helper: generate trades aligned to session tickers, date range, risk, and market bars."""
    user = _require_paid_journal_user(request)
    mode_clean = (mode or "replace").strip().lower()
    if mode_clean not in {"replace", "append"}:
        raise HTTPException(status_code=400, detail="mode must be replace or append")

    db = SessionLocal()
    try:
        s = db.query(TradingSession).filter(TradingSession.id == session_id).first()
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")
        if not _can_access_trading_session(user, s):
            raise HTTPException(status_code=403, detail="Forbidden")

        session_public = _session_public_dict(s)
        contract = extract_session_contract(session_public)
        if not contract.get("tickers"):
            raise HTTPException(status_code=400, detail="Session has no tickers configured")

        file_cache: dict[int, CSVFile] = {}

        def _bars_loader(file_id: int, from_ms: int, to_ms: int, resolution: str) -> list:
            db_file = file_cache.get(file_id)
            if db_file is None:
                db_file = db.query(CSVFile).filter(CSVFile.id == file_id).first()
                if db_file:
                    file_cache[file_id] = db_file
            if not db_file:
                return []
            payload = _build_bars_payload(
                file_id,
                db_file,
                from_ms=from_ms,
                to_ms=to_ms,
                resolution=resolution,
                limit=2500,
            )
            return payload.get("bars") or []

        bars_by_ticker = load_bars_for_contract(contract, _bars_loader, limit=2500)
        scenario_key = normalize_seed_scenario(scenario)
        generated = generate_session_seed_trades(
            session_public,
            count=count,
            seed=int(session_id) * 1000 + count,
            bars_by_ticker=bars_by_ticker,
            scenario=scenario_key,
        )
        errs = generated.get("errors") or []
        if errs:
            raise HTTPException(status_code=400, detail={"message": "Seed failed", "errors": errs[:20]})
        new_trades = generated.get("trades") or []
        if not new_trades:
            raise HTTPException(status_code=400, detail="No trades generated")

        st = _get_or_create_trading_session_state(db, session_id=s.id, user_id=s.user_id)
        state = _parse_json_dict(st.state_json)
        existing = sjs.resolve_session_journal(
            db,
            s.id,
            s.user_id,
            state,
            journal_trade_model=TradingSessionJournalTrade,
            sync_fn=_sync_trading_session_journal_trades,
        )
        merged = list(existing) + list(new_trades) if mode_clean == "append" else list(new_trades)
        try:
            sjs.enforce_journal_trade_limit(merged)
        except sjs.JournalTradeLimitExceeded as exc:
            raise HTTPException(status_code=413, detail=str(exc)) from exc
        _sync_trading_session_journal_trades(db, session_id=s.id, user_id=s.user_id, journal=merged)
        if sjs.strip_journal_from_state_json_enabled():
            sjs.strip_journal_from_persisted_state(state)
        else:
            state["journal"] = merged

        new_state_json = json.dumps(state, separators=(",", ":"))
        new_size = len(new_state_json.encode("utf-8"))
        prev_size = len((st.state_json or "").encode("utf-8"))
        if new_size > SESSION_STATE_HARD_LIMIT_BYTES and new_size > prev_size:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"Session state too large after seed "
                    f"({new_size / 1_048_576:.1f} MB; hard limit "
                    f"{SESSION_STATE_HARD_LIMIT_BYTES / 1_048_576:.0f} MB)."
                ),
            )

        st.state_json = new_state_json
        db.commit()
        db.refresh(st)
        chart_redis.dashboard_bump_version(s.user_id)
        warning = None
        if new_size > SESSION_STATE_SOFT_LIMIT_BYTES:
            warning = (
                f"Session state is {new_size / 1_048_576:.1f} MB (soft limit "
                f"{SESSION_STATE_SOFT_LIMIT_BYTES / 1_048_576:.0f} MB)."
            )
        return {
            "seeded": len(new_trades),
            "mode": mode_clean,
            "scenario": scenario_key,
            "scenario_label": (generated.get("contract") or {}).get("scenario_label"),
            "scenario_counts": (generated.get("contract") or {}).get("scenario_counts"),
            "journal_len": len(merged),
            "warnings": list(generated.get("warnings") or []),
            "warning": warning,
            "contract": generated.get("contract") or {},
        }
    finally:
        db.close()


_LIST_USER_JOURNAL_TRADES_MAX = 5000


@app.get("/api/journal-trades")
async def list_user_journal_trades(
    request: Request,
    session_id: int | None = Query(None),
    limit: int = Query(3000, ge=1, le=_LIST_USER_JOURNAL_TRADES_MAX),
    offset: int = Query(0, ge=0),
):
    """All backtest session journal trades for the signed-in user (same fields as per-session journal)."""
    user = _require_paid_journal_user(request, module="backtest")
    db = SessionLocal()
    try:
        q = db.query(TradingSessionJournalTrade).filter(
            TradingSessionJournalTrade.user_id == user.id
        )
        if session_id is not None:
            s = db.query(TradingSession).filter(TradingSession.id == session_id).first()
            if not s:
                raise HTTPException(status_code=404, detail="Session not found")
            if not _can_access_trading_session(user, s):
                raise HTTPException(status_code=403, detail="Forbidden")
            q = q.filter(TradingSessionJournalTrade.session_id == session_id)
        total = q.count()
        rows = (
            q.order_by(TradingSessionJournalTrade.updated_at.desc())
            .offset(offset)
            .limit(min(limit, _LIST_USER_JOURNAL_TRADES_MAX))
            .all()
        )
        session_names: dict[int, str] = {}
        sid_set = {int(r.session_id) for r in rows if r.session_id is not None}
        if sid_set:
            for sid, name in (
                db.query(TradingSession.id, TradingSession.name)
                .filter(TradingSession.id.in_(sid_set))
                .all()
            ):
                session_names[int(sid)] = name or ""
        out = []
        for r in rows:
            try:
                payload = json.loads(r.payload_json) if r.payload_json else {}
            except Exception:
                payload = {}
            if not isinstance(payload, dict):
                payload = {}
            out.append(
                {
                    "journal_trade_id": r.id,
                    "session_id": r.session_id,
                    "session_name": session_names.get(int(r.session_id), ""),
                    "client_trade_id": r.client_trade_id,
                    "payload": payload,
                    "updated_at": r.updated_at.isoformat() if r.updated_at else None,
                }
            )
        return {
            "trades": out,
            "count": len(out),
            "total": total,
            "offset": offset,
            "limit": limit,
            "truncated": (offset + len(out)) < total,
        }
    finally:
        db.close()


@app.get("/api/sessions/{session_id}/journal-trades")
async def list_trading_session_journal_trades(session_id: int, request: Request):
    """Queryable copy of chart journal trades (one row per trade); same data as state.journal, scoped per user."""
    user = _require_paid_journal_user(request)
    db = SessionLocal()
    try:
        s = db.query(TradingSession).filter(TradingSession.id == session_id).first()
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")
        if not _can_access_trading_session(user, s):
            raise HTTPException(status_code=403, detail="Forbidden")
        rows = (
            db.query(TradingSessionJournalTrade)
            .filter(TradingSessionJournalTrade.session_id == session_id)
            .order_by(TradingSessionJournalTrade.updated_at.desc())
            .all()
        )
        out = []
        for r in rows:
            try:
                payload = json.loads(r.payload_json) if r.payload_json else {}
            except Exception:
                payload = {}
            out.append(
                {
                    "journal_trade_id": r.id,
                    "session_id": session_id,
                    "client_trade_id": r.client_trade_id,
                    "payload": payload,
                    "updated_at": r.updated_at.isoformat() if r.updated_at else None,
                }
            )
        return {"session_id": session_id, "trades": out, "count": len(out)}
    finally:
        db.close()


@app.post("/api/sessions/{session_id}/journal-trades")
async def upsert_trading_session_journal_trade(
    session_id: int,
    payload: JournalTradeUpsertIn,
    request: Request,
):
    """Upsert one manual/dashboard trade into the session journal (same SQL rows as chart trades)."""
    user = _require_paid_journal_user(request, module="backtest")
    _enforce_backtest_user_rate(user, "journal_trade_upsert")
    if not isinstance(payload.trade, dict):
        raise HTTPException(status_code=400, detail="trade must be an object")
    try:
        trade = sjs.normalize_manual_trade_payload(payload.trade)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db = SessionLocal()
    try:
        s = db.query(TradingSession).filter(TradingSession.id == session_id).first()
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")
        if not _can_access_trading_session(user, s):
            raise HTTPException(status_code=403, detail="Forbidden")

        st = _get_or_create_trading_session_state(db, session_id=s.id, user_id=s.user_id)
        state = _parse_json_dict(st.state_json)
        existing = sjs.resolve_session_journal(
            db,
            s.id,
            s.user_id,
            state,
            journal_trade_model=TradingSessionJournalTrade,
            sync_fn=_sync_trading_session_journal_trades,
        )
        merged = sjs.upsert_trade_in_journal(existing, trade)
        try:
            sjs.enforce_journal_trade_limit(merged)
        except sjs.JournalTradeLimitExceeded as exc:
            raise HTTPException(status_code=413, detail=str(exc)) from exc

        _sync_trading_session_journal_trades(db, session_id=s.id, user_id=s.user_id, journal=merged)
        if sjs.strip_journal_from_state_json_enabled():
            sjs.strip_journal_from_persisted_state(state)
        else:
            state["journal"] = merged

        st.state_json = json.dumps(state, separators=(",", ":"))
        db.commit()
        chart_redis.dashboard_bump_version(s.user_id)
        client_trade_id = sjs.journal_trade_client_id(trade)
        sql_row = (
            db.query(TradingSessionJournalTrade)
            .filter(
                TradingSessionJournalTrade.session_id == session_id,
                TradingSessionJournalTrade.client_trade_id == client_trade_id,
            )
            .first()
        )
        journal_trade_id = int(sql_row.id) if sql_row and sql_row.id is not None else None
        if journal_trade_id is not None:
            trade = sjs.enrich_journal_trade_from_sql_row(trade, sql_row, session_id)
        return {
            "session_id": session_id,
            "client_trade_id": client_trade_id,
            "journal_trade_id": journal_trade_id,
            "trade": trade,
            "journal_len": len(merged),
            "upserted": True,
        }
    finally:
        db.close()


@app.patch("/api/sessions/{session_id}/state")
async def patch_trading_session_state(session_id: int, request: Request):
    # IMPORTANT: We deliberately DO NOT declare `payload: TradingSessionStateUpdateIn`
    # in the signature — if we did, FastAPI would eagerly read + JSON-parse the
    # body before entering this function, defeating the Content-Length guard.
    # nginx allows up to 100 MB, so a malicious caller can POST a huge JSON
    # that would otherwise burn RAM/CPU before our 16 MB limit rejects it.
    try:
        cl = int(request.headers.get("content-length", "0") or 0)
    except Exception:
        cl = 0
    # Allow some headroom over the hard limit for JSON overhead / re-encoding.
    _state_max_body = max(SESSION_STATE_HARD_LIMIT_BYTES * 2, 32 * 1024 * 1024)
    if cl > _state_max_body:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Request body too large ({cl / 1_048_576:.1f} MB). "
                f"Session state is capped at {SESSION_STATE_HARD_LIMIT_BYTES / 1_048_576:.0f} MB."
            ),
        )
    # Read the body now that we know it's within a sane bound. If the client
    # lied about Content-Length and streams more, we also truncate-check here.
    raw = await request.body()
    if len(raw) > _state_max_body:
        raise HTTPException(status_code=413, detail="Request body too large")
    try:
        body_dict = json.loads(raw or b"{}")
        if not isinstance(body_dict, dict):
            raise ValueError("payload must be a JSON object")
        payload = TradingSessionStateUpdateIn(**body_dict)
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    user = _require_paid_journal_user(request)
    _enforce_backtest_user_rate(user, "session_patch")
    db = SessionLocal()
    try:
        s = db.query(TradingSession).filter(TradingSession.id == session_id).first()
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")
        if not _can_access_trading_session(user, s):
            raise HTTPException(status_code=403, detail="Forbidden")

        st = _get_or_create_trading_session_state(db, session_id=s.id, user_id=s.user_id)
        state = _parse_json_dict(st.state_json)

        if payload.drawings is not None:
            # Legacy: drawings live in chart_drawings (per symbol). Drop from state_json to save space.
            state.pop("drawings", None)
        if payload.journal is not None:
            try:
                sjs.enforce_journal_trade_limit(payload.journal)
            except sjs.JournalTradeLimitExceeded as exc:
                raise HTTPException(status_code=413, detail=str(exc)) from exc
            _sync_trading_session_journal_trades(db, session_id=s.id, user_id=s.user_id, journal=payload.journal)
            if sjs.strip_journal_from_state_json_enabled():
                sjs.strip_journal_from_persisted_state(state)
            else:
                state["journal"] = payload.journal
        if payload.journal_by_ticker is not None:
            state["journal_by_ticker"] = payload.journal_by_ticker
        if payload.per_instrument_stats is not None:
            state["per_instrument_stats"] = payload.per_instrument_stats
        if payload.pending_orders is not None:
            state["pending_orders"] = payload.pending_orders
        if payload.open_positions is not None:
            state["open_positions"] = payload.open_positions
        if payload.account_runtime is not None:
            state["account_runtime"] = payload.account_runtime
        if payload.order_counters is not None:
            state["order_counters"] = payload.order_counters
        if payload.replay is not None:
            prev_r = state.get("replay") if isinstance(state.get("replay"), dict) else {}
            incoming_r = payload.replay if isinstance(payload.replay, dict) else {}
            merged_r = {**prev_r, **incoming_r}
            pd = prev_r.get("dashboard") if isinstance(prev_r.get("dashboard"), dict) else {}
            idb = incoming_r.get("dashboard") if isinstance(incoming_r.get("dashboard"), dict) else {}
            if pd or idb:
                merged_r["dashboard"] = {**pd, **idb}
            state["replay"] = merged_r
        if payload.chartView is not None:
            state["chartView"] = payload.chartView
        if payload.chartSettings is not None:
            state["chartSettings"] = payload.chartSettings
        if payload.toolDefaults is not None:
            state["toolDefaults"] = payload.toolDefaults
        if payload.indicators is not None:
            state["indicators"] = payload.indicators
        if payload.propfirm_challenge is not None:
            state["propfirm_challenge"] = payload.propfirm_challenge

        # Size guard: `TradingSessionState.state_json` is the only per-user row
        # that can grow unbounded (drawings + journal + per-instrument stats all
        # live inside it). Without a cap a single user with thousands of
        # drawings can balloon the row to tens of MB and eventually push
        # Postgres / our 200 GB VPS disk over the edge. We enforce:
        #   * HARD cap — reject any write that both exceeds the hard limit AND
        #     grows the payload (shrinking saves always pass so a user who is
        #     already over the line isn't locked out and can recover by
        #     deleting drawings / trades).
        #   * SOFT cap — pass-through, but surface `warning` in the response
        #     so the UI can nudge the user before they hit the hard wall.
        new_state_json = json.dumps(state, separators=(",", ":"))
        new_size = len(new_state_json.encode("utf-8"))
        prev_size = len((st.state_json or "").encode("utf-8"))
        warning = None
        if new_size > SESSION_STATE_HARD_LIMIT_BYTES and new_size > prev_size:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"Session state too large "
                    f"({new_size / 1_048_576:.1f} MB; hard limit "
                    f"{SESSION_STATE_HARD_LIMIT_BYTES / 1_048_576:.0f} MB). "
                    "Remove some drawings or archive old trades, then try again."
                ),
            )
        if new_size > SESSION_STATE_SOFT_LIMIT_BYTES:
            warning = (
                f"Session state is {new_size / 1_048_576:.1f} MB. "
                f"Soft limit is {SESSION_STATE_SOFT_LIMIT_BYTES / 1_048_576:.0f} MB — "
                "consider archiving old trades or pruning drawings to stay fast."
            )

        st.state_json = new_state_json
        db.commit()
        db.refresh(st)
        chart_redis.dashboard_bump_version(s.user_id)
        resp = {"success": True, "size_bytes": new_size}
        if warning:
            resp["warning"] = warning
        return resp
    finally:
        db.close()

@app.patch("/api/sessions/{session_id}")
async def update_trading_session(session_id: int, payload: TradingSessionUpdateIn, request: Request):
    user = _require_paid_journal_user(request)
    db = SessionLocal()
    try:
        s = db.query(TradingSession).filter(TradingSession.id == session_id).first()
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")
        if not _can_access_trading_session(user, s):
            raise HTTPException(status_code=403, detail="Forbidden")

        if payload.name is not None:
            name = payload.name.strip()
            if not name:
                raise HTTPException(status_code=400, detail="Name is required")
            s.name = name

        if payload.config is not None:
            try:
                merged = payload.config or {}
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid config")
            _enforce_backtest_limits(db, user, merged, is_create=False)
            try:
                s.config_json = json.dumps(merged, separators=(",", ":"))
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid config")

        db.commit()
        db.refresh(s)
        return {"session": _session_public_dict(s)}
    finally:
        db.close()

def _purge_trading_session_rows(db, session_id: int) -> bool:
    """Delete SQL rows for a backtest session (state, journal trades, session). Returns False if session missing."""
    sid = int(session_id)

    try:
        db.query(TradingSessionJournalTrade).filter(
            TradingSessionJournalTrade.session_id == sid
        ).delete(synchronize_session=False)
    except Exception:
        db.rollback()
        try:
            db.execute(
                text("DELETE FROM trading_session_journal_trades WHERE session_id = :sid"),
                {"sid": sid},
            )
        except Exception:
            db.rollback()

    db.query(TradingSessionState).filter(
        TradingSessionState.session_id == sid
    ).delete(synchronize_session=False)

    deleted = (
        db.query(TradingSession)
        .filter(TradingSession.id == sid)
        .delete(synchronize_session=False)
    )
    if not deleted:
        db.rollback()
        return False

    db.commit()

    for tbl in ("chart_drawings", "chart_settings"):
        try:
            db.execute(text(f"DELETE FROM {tbl} WHERE session_id = :sid"), {"sid": str(sid)})
            db.commit()
        except Exception:
            db.rollback()

    return True


@app.delete("/api/sessions/{session_id}")
async def delete_trading_session(session_id: int, request: Request):
    user = _require_paid_journal_user(request)
    db = SessionLocal()
    try:
        s = db.query(TradingSession).filter(TradingSession.id == session_id).first()
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")
        if not _can_access_trading_session(user, s):
            raise HTTPException(status_code=403, detail="Forbidden")
        owner_id = s.user_id
        if not _purge_trading_session_rows(db, session_id):
            raise HTTPException(status_code=404, detail="Session not found")
        chart_redis.dashboard_bump_version(owner_id)
        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        import logging as _logging

        _logging.exception("delete_trading_session failed session_id=%s", session_id)
        raise HTTPException(status_code=500, detail=f"Failed to delete session: {exc}") from exc
    finally:
        db.close()

@app.post("/api/bootcamp/register")
async def bootcamp_register(payload: BootcampRegistrationIn):
    if not payload.full_name.strip():
        raise HTTPException(status_code=400, detail="Full name is required")
    if not payload.email.strip() or "@" not in payload.email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if not payload.country.strip():
        raise HTTPException(status_code=400, detail="Country is required")
    if payload.age is None or int(payload.age) <= 0:
        raise HTTPException(status_code=400, detail="Valid age is required")
    if not payload.discord.strip():
        raise HTTPException(status_code=400, detail="Discord is required")
    if not payload.agree_rules:
        raise HTTPException(status_code=400, detail="Bootcamp rules must be accepted")
    if not payload.agree_terms:
        raise HTTPException(status_code=400, detail="Terms must be accepted")

    try:
        _append_bootcamp_registration_to_google_sheet(payload)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to save registration")
    return {"success": True}

@app.post("/api/upload")
async def upload_csv(request: Request, csvFile: UploadFile = File(...)):
    """Upload a CSV file — admin only"""
    _require_admin(request)
    
    # Validate file type
    if not csvFile.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")
    
    # Generate unique filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_filename = f"{timestamp}_{csvFile.filename}"
    file_path = UPLOAD_DIR / unique_filename
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(csvFile.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    return _store_dataset_file(
        file_path=file_path,
        original_name=csvFile.filename,
        description=f"Uploaded on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    )

@app.get("/api/files")
async def get_files(
    session_ready: bool = Query(
        False,
        description=(
            "When true, only datasets that match admin overview usable state: "
            "health is 'healthy' or 'partial' (≥1 ready TF, integrity OK, not building/failed). "
            "Each row includes `health` and `ready_timeframes`."
        ),
    ),
):
    """
    Get list of all uploaded CSV files (same registry as `/api/admin/datasets`).

    Default: fast list for generic pickers (multichart, legacy HTML).

    `?session_ready=1`: session / backtest symbol pickers — same eligibility as admin
    datasets marked chart-usable (healthy or partial only).
    """
    db = next(get_db())
    try:
        files = db.query(CSVFile).order_by(CSVFile.upload_date.desc()).all()
        if not session_ready:
            out_files = []
            for f in files:
                ticker, asset_class = _dataset_file_symbol_fields(f.original_name or "")
                out_files.append(
                    {
                        "id": f.id,
                        "original_name": f.original_name,
                        "upload_date": f.upload_date.isoformat(),
                        "row_count": f.row_count,
                        "description": f.description,
                        "ticker": ticker,
                        "asset_class": asset_class,
                    }
                )
            return {"files": out_files}

        if not files:
            return {"files": []}

        file_ids = [int(f.id) for f in files]
        all_aggs = db.query(CSVAggregate).filter(CSVAggregate.file_id.in_(file_ids)).all()
        aggs_by_file: dict[int, dict[str, CSVAggregate]] = {}
        for agg in all_aggs:
            aggs_by_file.setdefault(int(agg.file_id), {})[str(agg.timeframe)] = agg

        jobs = (
            db.query(BinaryBuildJob)
            .order_by(BinaryBuildJob.created_at.desc(), BinaryBuildJob.id.desc())
            .all()
        )
        latest_job_by_file: dict[int, BinaryBuildJob] = {}
        for job in jobs:
            fid = int(job.file_id)
            if fid not in latest_job_by_file:
                latest_job_by_file[fid] = job

        out_files = []
        for f in files:
            fid = int(f.id)
            ticker, asset_class = _dataset_file_symbol_fields(f.original_name or "")
            health, ready_tf = _dataset_file_health_for_session(
                db,
                fid,
                aggs_by_file.get(fid, {}),
                latest_job_by_file.get(fid),
            )
            if health not in ("healthy", "partial"):
                continue
            row = {
                "id": f.id,
                "original_name": f.original_name,
                "upload_date": f.upload_date.isoformat(),
                "row_count": f.row_count,
                "description": f.description,
                "ticker": ticker,
                "asset_class": asset_class,
                "health": health,
                "ready_timeframes": ready_tf,
            }
            coverage = _dataset_coverage_span(aggs_by_file.get(fid, {}))
            if coverage:
                row.update(coverage)
            out_files.append(row)
        return {"files": out_files}
    finally:
        db.close()

@app.get("/api/file/{file_id}")
async def get_file(file_id: int, offset: int = 0, limit: int = 10000):
    """Get specific CSV file data with pagination"""
    db = next(get_db())
    try:
        db_file = db.query(CSVFile).filter(CSVFile.id == file_id).first()
        
        if not db_file:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_path = _resolve_dataset_csv_for_file(db_file)
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")
        
        # Read with pagination for large files
        lines = []
        with open(file_path, 'r') as f:
            header = f.readline()  # Always include header
            lines.append(header.strip())
            
            # Skip to offset
            for _ in range(offset):
                try:
                    f.readline()
                except:
                    break
            
            # Read limited lines
            count = 0
            for line in f:
                if count >= limit:
                    break
                lines.append(line.strip())
                count += 1
        
        return {
            "data": "\n".join(lines),
            "offset": offset,
            "limit": limit,
            "returned": len(lines) - 1,  # Exclude header
            "total": db_file.row_count,
            "has_more": offset + count < db_file.row_count
        }
    finally:
        db.close()

@app.get("/api/file/{file_id}/smart")
async def get_file_smart(
    file_id: int,
    request: Request,
    timeframe: str = "1m",
    limit: int = 5000,
    start_ts: int = None,
    end_ts: int = None,
    anchor: str = "end",
    response_format: str = "csv",
    resolution: str | None = Query(None, description="When 'auto', use bar-budget /bars logic"),
):
    """
    Viewport-based data loading using binary files (like TradingView).
    O(1) seek + O(n) read. No CSV parsing.
    Returns last N candles at the exact requested timeframe.
    """
    from io import StringIO
    import time as _time
    t0 = _time.monotonic()

    limit = min(limit, 100000)

    user = _get_user_from_request(request)
    if user is not None:
        _enforce_backtest_user_rate(user, "smart")

    db = next(get_db())
    try:
        db_file = db.query(CSVFile).filter(CSVFile.id == file_id).first()
        if not db_file:
            raise HTTPException(status_code=404, detail="File not found")

        smart_cache_key = bar_window_cache.smart_cache_key(
            file_id,
            timeframe=timeframe,
            limit=limit,
            start_ts=start_ts,
            end_ts=end_ts,
            anchor=anchor,
            response_format=response_format,
            resolution=resolution,
        )
        cached_smart = bar_window_cache.get_smart(smart_cache_key)
        if cached_smart is not None:
            return cached_smart

        use_auto = resolution and str(resolution).lower() in ("auto", "")
        if questdb_store.questdb_read_primary() or use_auto:
            res_for_bars = "auto" if use_auto else timeframe
            q_from, q_to, q_limit = _smart_questdb_window(
                timeframe if not use_auto else "1m",
                limit=limit,
                anchor=anchor,
                start_ts=start_ts,
                end_ts=end_ts,
            )
            if use_auto:
                q_from, q_to = start_ts, end_ts
            payload = _build_bars_payload(
                file_id, db_file,
                from_ms=q_from, to_ms=q_to,
                resolution=res_for_bars, limit=q_limit,
            )
            smart_resp = _bars_to_smart_candles_response(
                payload,
                response_format=response_format,
                start_ts=start_ts,
                end_ts=end_ts,
            )
            if smart_resp and (payload.get("bars") or not questdb_store.questdb_tiles_fallback()):
                bar_window_cache.set_smart(smart_cache_key, smart_resp, timeframe=timeframe)
                return smart_resp

        # ── Find binary file for this timeframe ──
        bin_path = BIN_DIR / f"bin_{file_id}_{timeframe}.bin"
        source = "binary"

        agg = db.query(CSVAggregate).filter(
            CSVAggregate.file_id == file_id,
            CSVAggregate.timeframe == timeframe
        ).first()
        binary_ready = bool(agg and agg.status == "ready")
        # Keep serving existing tiles while a rebuild is queued/processing (status pending).
        tile_meta = _load_tile_meta(file_id, timeframe)

        if tile_meta is not None:
            # ── Fast path: tile-based reads via mmap (OS page-cached) ──
            source = "tiles"
            candles, total_candles, has_more_left, has_more_right = _tiles_read_window(
                file_id, timeframe, tile_meta,
                limit=limit, anchor=anchor,
                start_ts=start_ts, end_ts=end_ts
            )
        elif binary_ready and bin_path.exists():
            # ── Legacy path: single .bin file via mmap ──
            total_candles = _mmap_total(bin_path)

            if start_ts is not None or end_ts is not None:
                si = _mmap_bisect(bin_path, start_ts) if start_ts else 0
                ei = _mmap_bisect(bin_path, end_ts + 1) if end_ts else total_candles
                range_count = ei - si
                if range_count > limit:
                    if anchor == "start":
                        candles = _mmap_read_range(bin_path, si, limit)
                        has_more_left = si > 0
                        has_more_right = True
                    else:
                        start = ei - limit
                        candles = _mmap_read_range(bin_path, start, limit)
                        has_more_left = start > 0
                        has_more_right = ei < total_candles
                else:
                    candles = _mmap_read_range(bin_path, si, range_count)
                    has_more_left = si > 0
                    has_more_right = ei < total_candles
                total_candles = range_count
            else:
                if total_candles > limit:
                    if anchor == "start":
                        candles = _mmap_read_range(bin_path, 0, limit)
                        has_more_left = False
                        has_more_right = True
                    else:
                        start = total_candles - limit
                        candles = _mmap_read_range(bin_path, start, limit)
                        has_more_left = True
                        has_more_right = False
                else:
                    candles = _mmap_read_range(bin_path, 0, total_candles)
                    has_more_left = False
                    has_more_right = False
        else:
            # ── Fast path for custom TF: resample from 1m binary on-the-fly ──
            tile_meta_1m = _load_tile_meta(file_id, '1m')
            if tile_meta_1m is not None and not (
                questdb_store.questdb_enabled() and questdb_store.questdb_read_primary()
            ):
                source = "custom-tf-resample"
                raw_1m, _, _, _ = _tiles_read_window(
                    file_id, '1m', tile_meta_1m,
                    limit=500_000, anchor='end',
                    start_ts=start_ts, end_ts=end_ts
                )
                if timeframe.endswith('mo'):
                    candles = _resample_candles_monthly(raw_1m)
                elif timeframe != '1m':
                    candles = _resample_candles(raw_1m, _parse_tf_ms(timeframe))
                else:
                    candles = raw_1m
                if start_ts is not None or end_ts is not None:
                    candles = [c for c in candles
                               if (start_ts is None or c['t'] >= start_ts) and
                                  (end_ts is None or c['t'] <= end_ts)]
                total_candles = len(candles)
                has_more_left = False
                has_more_right = False
                if total_candles > limit:
                    if anchor == 'start':
                        candles = candles[:limit]
                        has_more_right = True
                    else:
                        candles = candles[-limit:]
                        has_more_left = True
            else:
                # ── Fallback: CSV parsing (binary not built yet) ──
                if BINARY_ONLY_RUNTIME:
                    raise HTTPException(status_code=503, detail="Binary data not ready for requested timeframe")
                source = "csv-fallback"
                file_path = _resolve_dataset_csv_for_file(db_file)
                if not file_path.exists():
                    raise HTTPException(status_code=404, detail="File not found on disk")

                candles = _parse_candles_from_csv(file_path, original_name=db_file.original_name)
                if timeframe == "1mo":
                    candles = _resample_candles_monthly(candles)
                elif timeframe != "1m":
                    candles = _resample_candles(candles, _parse_tf_ms(timeframe))
            if start_ts is not None or end_ts is not None:
                candles = [c for c in candles
                           if (start_ts is None or c['t'] >= start_ts) and
                              (end_ts is None or c['t'] <= end_ts)]
            total_candles = len(candles)
            has_more_left = False
            has_more_right = False
            if total_candles > limit:
                if anchor == "start":
                    candles = candles[:limit]
                    has_more_right = True
                else:
                    candles = candles[-limit:]
                    has_more_left = True

        raw_first_cursor = str(candles[0]['t']) if candles else None
        raw_last_cursor = str(candles[-1]['t']) if candles else None

        candles = _apply_dataset_filters(candles, original_name=db_file.original_name)

        # Append merged CSV tail onto 1m windows only (cheap tail read; never replace full series).
        if timeframe == "1m" and candles and source in {"tiles", "binary"}:
            try:
                candles = _merge_csv_tail_onto_1m_candles(file_id, db_file, candles)
            except Exception:
                pass

        # Recovery: empty tile/bin window even though canonical CSV still has data.
        if not candles and source in {"tiles", "binary", "custom-tf-resample"}:
            try:
                if not BINARY_ONLY_RUNTIME:
                    csv_candles, csv_total, csv_has_more_left, csv_has_more_right = _smart_load_from_csv(
                        db_file,
                        timeframe,
                        limit=limit,
                        anchor=anchor,
                        start_ts=start_ts,
                        end_ts=end_ts,
                    )
                    csv_candles = _apply_dataset_filters(csv_candles, original_name=db_file.original_name)
                    if csv_candles:
                        candles = csv_candles
                        total_candles = csv_total
                        has_more_left = csv_has_more_left
                        has_more_right = csv_has_more_right
                        source = f"{source}+csv-recover"
            except Exception:
                pass

        # Recompute cursors after weekend/spike filtering and any recovery path.
        raw_first_cursor = str(candles[0]['t']) if candles else None
        raw_last_cursor = str(candles[-1]['t']) if candles else None

        # ── Build cursors ──
        first_cursor = raw_first_cursor
        last_cursor = raw_last_cursor

        elapsed_ms = round((_time.monotonic() - t0) * 1000, 1)

        base = {
            "timeframe": timeframe,
            "total": total_candles,
            "returned": len(candles),
            "has_more_left": has_more_left,
            "has_more_right": has_more_right,
            "first_cursor": first_cursor,
            "last_cursor": last_cursor,
            "source": source,
            "elapsed_ms": elapsed_ms,
        }
        rf = (response_format or "csv").lower().strip()
        if rf == "candles":
            base["candles"] = candles
            if candles:
                bar_window_cache.set_smart(smart_cache_key, base, timeframe=timeframe)
            return base

        # ── Legacy: CSV string in JSON (extra stringify + client parse) ──
        output = StringIO()
        output.write("time,open,high,low,close,volume\n")
        for c in candles:
            output.write(f"{c['t']},{c['o']},{c['h']},{c['l']},{c['c']},{c['v']}\n")
        base["data"] = output.getvalue()
        if candles:
            bar_window_cache.set_smart(smart_cache_key, base, timeframe=timeframe)
        return base
    finally:
        db.close()

@app.get("/api/file/{file_id}/candles")
async def get_file_candles(
    file_id: int,
    timeframe: str = "1m",
    limit: int = 3000,
    cursor: str = None,
    direction: str = "backward"
):
    """
    Binary cursor-based candle pagination for pan loading.
    O(log N) binary search + O(n) read. No CSV parsing.
    """
    import time as _time
    t0 = _time.monotonic()

    limit = min(limit, 10000)

    cursor_ts = None
    if cursor:
        try:
            cursor_ts = int(cursor)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid cursor")

    db = next(get_db())
    try:
        db_file = db.query(CSVFile).filter(CSVFile.id == file_id).first()
        if not db_file:
            raise HTTPException(status_code=404, detail="File not found")

        if questdb_store.questdb_read_primary() and questdb_store.questdb_enabled():
            try:
                questdb_store.ensure_schema()
                tf = bar_budget.normalize_resolution(timeframe)
                if tf not in bar_budget.RESOLUTION_TO_TABLE:
                    tf = "1m"
                q_limit = min(limit, bar_budget.MAX_BARS)
                candles, has_more_left, has_more_right = questdb_store.query_bars_cursor(
                    file_id, tf,
                    cursor_ts=cursor_ts,
                    direction=direction,
                    limit=q_limit,
                )
                candles = _apply_dataset_filters(candles, original_name=db_file.original_name)
                if candles or not questdb_store.questdb_tiles_fallback():
                    prev_cursor = str(candles[0]["t"]) if candles else None
                    next_cursor = str(candles[-1]["t"]) if candles else None
                    elapsed_ms = round((_time.monotonic() - t0) * 1000, 1)
                    return {
                        "timeframe": tf,
                        "data": {
                            "t": [c["t"] for c in candles],
                            "o": [c["o"] for c in candles],
                            "h": [c["h"] for c in candles],
                            "l": [c["l"] for c in candles],
                            "c": [c["c"] for c in candles],
                            "v": [c["v"] for c in candles],
                        },
                        "returned": len(candles),
                        "has_more_left": has_more_left,
                        "has_more_right": has_more_right,
                        "next_cursor": next_cursor,
                        "prev_cursor": prev_cursor,
                        "elapsed_ms": elapsed_ms,
                        "source": "questdb",
                    }
            except Exception:
                pass

        bin_path = BIN_DIR / f"bin_{file_id}_{timeframe}.bin"

        agg = db.query(CSVAggregate).filter(
            CSVAggregate.file_id == file_id,
            CSVAggregate.timeframe == timeframe
        ).first()
        binary_ready = bool(agg and agg.status == "ready")
        tile_meta = _load_tile_meta(file_id, timeframe)

        if tile_meta is not None and cursor_ts is not None:
            # ── Fast path: tile-based cursor pan via mmap ──
            # Use cursor-optimized reader to avoid scanning full remaining ranges.
            candles, has_more_left, has_more_right = _tiles_read_cursor_window(
                file_id, timeframe, tile_meta,
                limit=limit,
                cursor_ts=cursor_ts,
                direction=direction
            )
            if direction == "backward":
                has_more_right = True
            else:
                has_more_left = True
            total = tile_meta["total"]
        elif tile_meta is not None and cursor_ts is None:
            candles, _, has_more_left, has_more_right = _tiles_read_window(
                file_id, timeframe, tile_meta, limit=limit, anchor="end"
            )
            total = tile_meta["total"]
        elif binary_ready and bin_path.exists() and cursor_ts is not None:
            # ── Legacy path: mmap on single .bin ──
            total = _mmap_total(bin_path)
            cursor_idx = _mmap_bisect(bin_path, cursor_ts)

            if direction == "backward":
                start = max(0, cursor_idx - limit)
                count = cursor_idx - start
                candles = _mmap_read_range(bin_path, start, count)
                has_more_left = start > 0
                has_more_right = cursor_idx < total
            else:
                start = cursor_idx + 1 if cursor_idx < total else total
                if cursor_idx < total:
                    check = _mmap_read_range(bin_path, cursor_idx, 1)
                    if check and check[0]['t'] == cursor_ts:
                        start = cursor_idx + 1
                    else:
                        start = cursor_idx
                count = min(limit, total - start)
                candles = _mmap_read_range(bin_path, start, count)
                has_more_left = True
                has_more_right = (start + count) < total
        else:
            # Fallback to CSV-based reading
            if BINARY_ONLY_RUNTIME:
                raise HTTPException(status_code=503, detail="Binary data not ready for requested timeframe")
            file_path = _resolve_dataset_csv_for_file(db_file)
            if not file_path.exists():
                raise HTTPException(status_code=404, detail="File not found on disk")
            raw = _parse_candles_from_csv(file_path, original_name=db_file.original_name)
            if timeframe == "1mo":
                candles = _resample_candles_monthly(raw)
            elif timeframe != "1m":
                candles = _resample_candles(raw, _parse_tf_ms(timeframe))
            else:
                candles = raw
            if cursor_ts:
                if direction == "backward":
                    candles = [c for c in candles if c['t'] < cursor_ts][-limit:]
                else:
                    candles = [c for c in candles if c['t'] > cursor_ts][:limit]
            has_more_left = cursor_ts is not None
            has_more_right = len(candles) == limit

        raw_prev_cursor = str(candles[0]['t']) if candles else None
        raw_next_cursor = str(candles[-1]['t']) if candles else None

        candles = _apply_dataset_filters(candles, original_name=db_file.original_name)

        if timeframe == "1m" and candles and tile_meta is not None:
            try:
                candles = _merge_csv_tail_onto_1m_candles(file_id, db_file, candles)
            except Exception:
                pass

        # Same recovery as /smart: empty tile/bin window vs canonical CSV on disk.
        if not candles and (tile_meta is not None or (binary_ready and bin_path.exists())):
            try:
                file_path = _resolve_dataset_csv_for_file(db_file)
                if file_path.exists() and not BINARY_ONLY_RUNTIME:
                    raw = _parse_candles_from_csv(file_path, original_name=db_file.original_name)
                    if timeframe == "1mo":
                        recovered = _resample_candles_monthly(raw)
                    elif timeframe != "1m":
                        recovered = _resample_candles(raw, _parse_tf_ms(timeframe))
                    else:
                        recovered = raw

                    if cursor_ts is not None:
                        if direction == "backward":
                            recovered = [c for c in recovered if c['t'] < cursor_ts][-limit:]
                        else:
                            recovered = [c for c in recovered if c['t'] > cursor_ts][:limit]
                    elif len(recovered) > limit:
                        recovered = recovered[-limit:]

                    recovered = _apply_dataset_filters(recovered, original_name=db_file.original_name)
                    if recovered:
                        candles = recovered
            except Exception:
                pass

        raw_prev_cursor = str(candles[0]['t']) if candles else None
        raw_next_cursor = str(candles[-1]['t']) if candles else None

        prev_cursor = raw_prev_cursor
        next_cursor = raw_next_cursor

        result_data = {
            "t": [c['t'] for c in candles],
            "o": [c['o'] for c in candles],
            "h": [c['h'] for c in candles],
            "l": [c['l'] for c in candles],
            "c": [c['c'] for c in candles],
            "v": [c['v'] for c in candles]
        }

        elapsed_ms = round((_time.monotonic() - t0) * 1000, 1)

        return {
            "timeframe": timeframe,
            "data": result_data,
            "returned": len(candles),
            "has_more_left": has_more_left,
            "has_more_right": has_more_right,
            "next_cursor": next_cursor,
            "prev_cursor": prev_cursor,
            "elapsed_ms": elapsed_ms
        }
    finally:
        db.close()

# After a FirstRate merge, CSV/aggregate can extend past tiles/bin until rebuild finishes.
_CSV_AHEAD_OF_BINARY_SLACK_MS = 60_000


def _chart_binary_last_ts_ms(file_id: int, timeframe: str = "1m") -> float | None:
    """Last candle timestamp currently stored in chart tiles or legacy .bin."""
    tile_meta = _load_tile_meta(file_id, timeframe)
    if tile_meta is not None:
        tiles = tile_meta.get("tiles") or []
        if tiles:
            try:
                return float(_normalize_epoch_ms(tiles[-1]["end_ts"]))
            except Exception:
                pass
    bin_path = BIN_DIR / f"bin_{file_id}_{timeframe}.bin"
    if bin_path.exists():
        try:
            total = _mmap_total(bin_path)
            if total > 0:
                last = _mmap_read_range(bin_path, total - 1, 1)
                if last:
                    return float(_normalize_epoch_ms(last[0]["t"]))
        except Exception:
            pass
    return None


def _dataset_csv_tail_end_ms(db_file: CSVFile) -> float | None:
    try:
        csv_path = _resolve_dataset_csv_for_file(db_file)
        return _tail_csv_last_timestamp_ms(csv_path)
    except Exception:
        return None


def _csv_ahead_of_chart_binary(
    file_id: int,
    db_file: CSVFile,
    *,
    served_last_ts: float | None = None,
    slack_ms: float = _CSV_AHEAD_OF_BINARY_SLACK_MS,
) -> bool:
    """True when canonical CSV on disk extends past what chart binaries would serve."""
    csv_end = _dataset_csv_tail_end_ms(db_file)
    if csv_end is None:
        return False
    bin_end = served_last_ts
    if bin_end is None:
        bin_end = _chart_binary_last_ts_ms(file_id, "1m")
    if bin_end is None:
        return False
    return float(csv_end) > float(bin_end) + float(slack_ms)


def _parse_tail_csv_lines_to_candles(tail_lines: list[str]) -> list:
    """Parse tail CSV data lines (no header) into candle dicts."""
    out = []
    for ln in tail_lines:
        parts = [p.strip().strip('"').strip("'") for p in ln.split(",")]
        if len(parts) < 5:
            continue
        t = _parse_timestamp_value(parts[0])
        if t is None:
            continue
        try:
            rec = {
                "t": t,
                "o": float(parts[1]),
                "h": float(parts[2]),
                "l": float(parts[3]),
                "c": float(parts[4]),
                "v": float(parts[5]) if len(parts) > 5 else 0.0,
            }
        except Exception:
            continue
        norm = _sanitize_candle_record(rec)
        if norm is not None:
            out.append(norm)
    return out


def _merge_csv_tail_onto_1m_candles(
    file_id: int,
    db_file: CSVFile,
    candles: list,
) -> list:
    """
    When a FirstRate merge extended the CSV past stale 1m tiles, append only the
    new tail rows (fast tail read). Never replaces the existing binary window.
    """
    if not candles:
        return candles
    last_ts = float(candles[-1]["t"])
    # Only relevant when the served window actually reaches the binary's tail
    # (i.e. the user is viewing the most recent bars and a FirstRate merge left
    # the CSV ahead of stale tiles). For backward pans into old history,
    # `last_ts` is far below the binary's end — appending the recent CSV tail
    # would be WRONG (it dumps the newest bars onto an old window, e.g. a 2019
    # window came back with `returned: 26524` instead of the requested ~1500)
    # AND it costs a 25k-line CSV read on every pan request (~4.5s). Skip it.
    bin_last = _chart_binary_last_ts_ms(int(file_id), "1m")
    if bin_last is not None and last_ts < float(bin_last) - _CSV_AHEAD_OF_BINARY_SLACK_MS:
        return candles
    if not _csv_ahead_of_chart_binary(int(file_id), db_file, served_last_ts=last_ts):
        return candles
    csv_path = _resolve_dataset_csv_for_file(db_file)
    if not csv_path.exists():
        return candles
    _header, tail_lines = _tail_read_csv(str(csv_path), 25000)
    extra = [c for c in _parse_tail_csv_lines_to_candles(tail_lines) if float(c["t"]) > last_ts]
    if not extra:
        return candles
    by_t = {int(c["t"]): c for c in candles}
    for c in extra:
        by_t[int(c["t"])] = c
    merged = sorted(by_t.values(), key=lambda x: x["t"])
    result = _apply_dataset_filters(merged, original_name=db_file.original_name, apply_spike=False)
    if questdb_store.questdb_enabled() and extra:
        try:
            questdb_store.ensure_schema()
            questdb_store.append_1m_bars(int(file_id), extra)
        except Exception:
            pass
    return result


def _questdb_sync_file_from_csv(db_file: CSVFile, force: bool = False) -> dict:
    """Load canonical CSV and sync into QuestDB (admin / migration helper)."""
    if not questdb_store.questdb_enabled():
        raise HTTPException(status_code=503, detail="QuestDB is not enabled")
    file_id = int(db_file.id)
    if not force and questdb_store.count_bars(file_id) > 0:
        return {"file_id": file_id, "status": "skipped", "existing": questdb_store.count_bars(file_id)}
    csv_path = _resolve_dataset_csv_for_file(db_file)
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="CSV not found on disk")
    candles = _parse_candles_from_csv(csv_path, original_name=db_file.original_name)
    if not candles:
        raise HTTPException(status_code=400, detail="CSV produced no candles")
    questdb_store.ensure_schema()
    out = questdb_store.sync_file_candles(file_id, candles)
    return {"file_id": file_id, "status": "synced", "rows_1m": len(candles), **out}


def _read_legacy_window_candles(
    file_id: int,
    db_file: CSVFile,
    timeframe: str,
    *,
    limit: int,
    start_ts: int | None,
    end_ts: int | None,
    anchor: str = "start",
) -> list:
    """Tile/binary/CSV window read for /bars fallback."""
    tile_meta = _load_tile_meta(file_id, timeframe)
    if tile_meta is not None:
        candles, _, _, _ = _tiles_read_window(
            file_id, timeframe, tile_meta,
            limit=limit, anchor=anchor,
            start_ts=start_ts, end_ts=end_ts,
        )
        return candles
    bin_path = BIN_DIR / f"bin_{file_id}_{timeframe}.bin"
    if bin_path.exists():
        total = _mmap_total(bin_path)
        if start_ts is not None or end_ts is not None:
            si = _mmap_bisect(bin_path, start_ts) if start_ts else 0
            ei = _mmap_bisect(bin_path, end_ts + 1) if end_ts else total
            range_count = ei - si
            if range_count > limit:
                if anchor == "start":
                    return _mmap_read_range(bin_path, si, limit)
                return _mmap_read_range(bin_path, ei - limit, limit)
            return _mmap_read_range(bin_path, si, range_count)
        if total > limit:
            if anchor == "start":
                return _mmap_read_range(bin_path, 0, limit)
            return _mmap_read_range(bin_path, total - limit, limit)
        return _mmap_read_range(bin_path, 0, total)
    candles, _, _, _ = _smart_load_from_csv(
        db_file, timeframe, limit=limit, anchor=anchor,
        start_ts=start_ts, end_ts=end_ts,
    )
    return candles


def _build_bars_payload(
    file_id: int,
    db_file: CSVFile,
    *,
    from_ms: int | None,
    to_ms: int | None,
    resolution: str = "auto",
    limit: int = 2000,
) -> dict:
    """Bar-budget response — QuestDB primary, tile/CSV fallback."""
    import time as _time

    limit = max(1, min(int(limit), bar_budget.MAX_BARS))
    bars_cache_key = bar_window_cache.bars_cache_key(
        file_id,
        from_ms=from_ms,
        to_ms=to_ms,
        resolution=resolution,
        limit=limit,
    )
    cached_bars = bar_window_cache.get_bars(bars_cache_key)
    if cached_bars is not None:
        return cached_bars
    now_ms = int(_time.time() * 1000)
    window_from = int(from_ms) if from_ms is not None else 0
    window_to = int(to_ms) if to_ms is not None else now_ms
    if window_to <= window_from:
        window_to = window_from + 60_000

    chosen = bar_budget.choose_resolution(window_from, window_to, resolution)
    source = "questdb"

    bars: list = []
    # Only read from QuestDB when it is the designated read path. Previously this also
    # used QuestDB whenever count_bars > 0, which meant every bars request ran a count()
    # PLUS a runtime SAMPLE BY over the PARTITION BY YEAR table — multichart (many
    # tickers × timeframes at once) turned that into a QuestDB CPU storm. With
    # READ_PRIMARY=false we serve from the fast binary tiles below instead.
    if questdb_store.questdb_enabled() and questdb_store.questdb_read_primary():
        try:
            questdb_store.ensure_schema()
            bars = questdb_store.query_bars(file_id, chosen, from_ms, to_ms, limit=limit)
        except Exception as exc:
            print(f"[questdb] query_bars failed file_id={file_id} resolution={chosen}: {exc}")
            bars = []

    if not bars and questdb_store.questdb_tiles_fallback():
        source = "tiles"
        bars = _read_legacy_window_candles(
            file_id, db_file, chosen,
            limit=limit, start_ts=from_ms, end_ts=to_ms, anchor="start",
        )

    bars = _apply_dataset_filters(bars, original_name=db_file.original_name)
    has_more_left = False
    has_more_right = False
    if bars:
        first_t = int(bars[0]["t"])
        last_t = int(bars[-1]["t"])
        if questdb_store.questdb_enabled() and source == "questdb":
            has_more_left = questdb_store.has_bars_before(file_id, chosen, first_t)
            has_more_right = questdb_store.has_bars_after(file_id, chosen, last_t)
        else:
            has_more_left = (
                len(bars) >= limit
                or (from_ms is not None and first_t > int(from_ms))
            )
            has_more_right = (
                len(bars) >= limit
                or (to_ms is not None and last_t < int(to_ms))
            )
    result = {
        "file_id": file_id,
        "resolution": chosen,
        "bars": bars,
        "returned": len(bars),
        "has_more_left": has_more_left,
        "has_more_right": has_more_right,
        "source": source,
    }
    if bars:
        bar_window_cache.set_bars(bars_cache_key, result)
    return result


def _bars_to_smart_candles_response(
    payload: dict,
    *,
    response_format: str,
    start_ts: int | None = None,
    end_ts: int | None = None,
) -> dict | None:
    """Convert /bars payload to /smart candles JSON shape."""
    bars = payload.get("bars") or []
    if not bars:
        return None
    tf = payload.get("resolution") or "1m"
    first_t = bars[0]["t"]
    last_t = bars[-1]["t"]
    has_more_left = start_ts is None or first_t > start_ts
    has_more_right = end_ts is None or last_t < end_ts
    if response_format == "candles":
        return {
            "timeframe": tf,
            "resolution": tf,
            "total": len(bars),
            "returned": len(bars),
            "has_more_left": has_more_left,
            "has_more_right": has_more_right,
            "first_cursor": str(first_t),
            "last_cursor": str(last_t),
            "candles": bars,
            "source": payload.get("source"),
        }
    return payload


def _smart_questdb_window(
    timeframe: str,
    *,
    limit: int,
    anchor: str,
    start_ts: int | None,
    end_ts: int | None,
) -> tuple[int | None, int | None, int]:
    """End-anchored backtest windows: last N bars at timeframe before end_ts."""
    effective_limit = max(1, min(int(limit), bar_budget.MAX_BARS))
    q_from = start_ts
    q_to = end_ts
    if q_to is not None and q_from is None and anchor == "end":
        try:
            tf_ms = _parse_tf_ms(timeframe)
            q_from = max(0, int(q_to) - effective_limit * tf_ms)
        except Exception:
            q_from = None
    return q_from, q_to, effective_limit


@app.get("/api/file/{file_id}/bars")
async def get_file_bars(
    file_id: int,
    request: Request,
    from_: int | None = Query(None, alias="from"),
    to: int | None = Query(None, alias="to"),
    resolution: str = Query("auto", description="auto or 1m,5m,15m,1h,4h,1d,1w"),
    limit: int = Query(2000, ge=1, le=2000),
):
    """Bounded OHLC range with bar-budget resolution selection."""
    user = _get_user_from_request(request)
    if user is not None:
        _enforce_backtest_user_rate(user, "smart")

    db = next(get_db())
    try:
        db_file = db.query(CSVFile).filter(CSVFile.id == file_id).first()
        if not db_file:
            raise HTTPException(status_code=404, detail="File not found")
        return _build_bars_payload(
            file_id, db_file,
            from_ms=from_, to_ms=to, resolution=resolution, limit=limit,
        )
    finally:
        db.close()


def _smart_load_from_csv(
    db_file: CSVFile,
    timeframe: str,
    *,
    limit: int,
    anchor: str = "end",
    start_ts: int | None = None,
    end_ts: int | None = None,
) -> tuple[list, int, bool, bool]:
    """Load a smart-window slice from the canonical CSV (merge source of truth)."""
    file_path = _resolve_dataset_csv_for_file(db_file)
    if not file_path.exists():
        return [], 0, False, False

    candles = _parse_candles_from_csv(file_path, original_name=db_file.original_name)
    if timeframe == "1mo":
        candles = _resample_candles_monthly(candles)
    elif timeframe != "1m":
        candles = _resample_candles(candles, _parse_tf_ms(timeframe))

    if start_ts is not None or end_ts is not None:
        candles = [
            c for c in candles
            if (start_ts is None or c["t"] >= start_ts)
            and (end_ts is None or c["t"] <= end_ts)
        ]
    total_candles = len(candles)
    has_more_left = False
    has_more_right = False
    if total_candles > limit:
        if anchor == "start":
            candles = candles[:limit]
            has_more_right = True
        else:
            candles = candles[-limit:]
            has_more_left = True
    return candles, total_candles, has_more_left, has_more_right


def _dataset_authoritative_ts_bounds(
    file_id: int, db_file: CSVFile, aggs: list
) -> tuple[float | None, float | None, float | None]:
    """
    Best available [start_ms, end_ms] for UI date pickers.

    After a FirstRate CSV merge, `end_ts` on the 1m aggregate (and the CSV on disk)
    can be newer than `bin_{id}_1m.bin` until the binary worker rebuilds. The old
    meta endpoint only read the binary file, so backtest showed Friday while admin
  showed fresh.
    """
    starts: list[float] = []
    ends: list[float] = []
    bin_end: float | None = None
    bin_1m = BIN_DIR / f"bin_{file_id}_1m.bin"
    if bin_1m.exists():
        total = _bin_total_candles(bin_1m)
        if total > 0:
            first = _read_bin_range(bin_1m, 0, 1)
            last = _read_bin_range(bin_1m, total - 1, 1)
            if first:
                starts.append(float(_normalize_epoch_ms(first[0]["t"])))
            if last:
                bin_end = float(_normalize_epoch_ms(last[0]["t"]))
                ends.append(bin_end)
    agg_1m = next((a for a in aggs if getattr(a, "timeframe", None) == "1m"), None)
    if agg_1m is not None:
        if agg_1m.start_ts is not None:
            starts.append(float(_normalize_epoch_ms(agg_1m.start_ts)))
        if agg_1m.end_ts is not None:
            ends.append(float(_normalize_epoch_ms(agg_1m.end_ts)))
    try:
        csv_path = _resolve_dataset_csv_for_file(db_file)
        disk_end = _tail_csv_last_timestamp_ms(csv_path)
        if disk_end is not None:
            ends.append(float(disk_end))
    except Exception:
        pass
    start_ms = min(starts) if starts else None
    end_ms = max(ends) if ends else None
    return start_ms, end_ms, bin_end


@app.get("/api/file/{file_id}/meta")
async def get_file_meta(file_id: int):
    """
    Return metadata about a file: available timeframes, date range,
    row counts, and binary conversion status.
    """
    db = next(get_db())
    try:
        db_file = db.query(CSVFile).filter(CSVFile.id == file_id).first()
        if not db_file:
            raise HTTPException(status_code=404, detail="File not found")

        # Get aggregation/binary status for all timeframes
        aggs = db.query(CSVAggregate).filter(CSVAggregate.file_id == file_id).all()
        timeframes = {}

        raw_start_ts, raw_end_ts, bin_end_ts = _dataset_authoritative_ts_bounds(
            file_id, db_file, aggs
        )
        if (
            raw_end_ts is not None
            and bin_end_ts is not None
            and float(raw_end_ts) > float(bin_end_ts) + 60_000
        ):
            try:
                csv_path = _resolve_dataset_csv_for_file(db_file)
                build_binary_for_file(
                    file_id,
                    csv_path,
                    db_file.original_name or "",
                    run_async=True,
                    trigger="meta_csv_ahead",
                )
            except Exception:
                pass

        for agg in aggs:
            timeframes[agg.timeframe] = {
                "status": agg.status,
                "row_count": agg.row_count,
                "start_ts": agg.start_ts,
                "end_ts": agg.end_ts,
                "source": "precomputed" if agg.status == "ready" else "pending"
            }

        return {
            "file_id": file_id,
            "original_name": db_file.original_name,
            "raw_row_count": db_file.row_count,
            "start_ts": raw_start_ts,
            "end_ts": raw_end_ts,
            "timeframes": timeframes
        }
    finally:
        db.close()

@app.delete("/api/file/{file_id}")
async def delete_file(file_id: int):
    """Delete a CSV file and its pre-aggregated derivatives"""
    db = next(get_db())
    try:
        db_file = db.query(CSVFile).filter(CSVFile.id == file_id).first()
        
        if not db_file:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Delete raw source file from disk (hot uploads + archive)
        _delete_dataset_source_csv(db_file.filename)
        
        # Delete binary + aggregate files from disk and DB
        aggs = db.query(CSVAggregate).filter(CSVAggregate.file_id == file_id).all()
        for agg in aggs:
            # Check both BIN_DIR and AGG_DIR
            for d in [BIN_DIR, AGG_DIR]:
                p = d / agg.agg_filename
                if p.exists():
                    p.unlink()
            db.delete(agg)

        # Remove known timeframe binaries even if aggregate rows are missing.
        for tf in DATASET_TIMEFRAMES:
            p = BIN_DIR / f"bin_{file_id}_{tf}.bin"
            if p.exists():
                p.unlink()

        # Remove tile directory for this file
        tile_file_dir = TILES_DIR / str(file_id)
        if tile_file_dir.exists():
            for tp in tile_file_dir.rglob("tile_*.bin"):
                _mmap_cache.invalidate(tp)
            import shutil as _shutil2
            _shutil2.rmtree(tile_file_dir, ignore_errors=True)
        
        # Delete from database
        db.query(BinaryBuildJob).filter(BinaryBuildJob.file_id == file_id).delete()
        db.delete(db_file)
        db.commit()
        
        return {"success": True}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

# ── WebSocket connection manager for incremental candle streaming ──
class ChartConnectionManager:
    """Manages WebSocket connections grouped by file_id and timeframe."""
    def __init__(self):
        # Key: (file_id, timeframe) -> set of WebSocket connections
        self.active: dict[tuple, set] = {}

    async def connect(self, ws: WebSocket, file_id: int, timeframe: str):
        await ws.accept()
        key = (file_id, timeframe)
        if key not in self.active:
            self.active[key] = set()
        self.active[key].add(ws)

    def disconnect(self, ws: WebSocket, file_id: int, timeframe: str):
        key = (file_id, timeframe)
        if key in self.active:
            self.active[key].discard(ws)
            if not self.active[key]:
                del self.active[key]

    async def broadcast(self, file_id: int, timeframe: str, message: dict):
        key = (file_id, timeframe)
        if key not in self.active:
            return
        dead = []
        for ws in self.active[key]:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active[key].discard(ws)

chart_ws_manager = ChartConnectionManager()

@app.websocket("/ws/chart/{file_id}/{timeframe}")
async def ws_chart_stream(ws: WebSocket, file_id: int, timeframe: str):
    """
    WebSocket endpoint for incremental candle updates.
    
    Client connects and receives:
      - {"type": "candle_update", "candle": {...}}  (current open candle changed)
      - {"type": "candle_close",  "candle": {...}}  (new candle closed, append)
    
    Client can send:
      - {"type": "ping"}  -> receives {"type": "pong"}
      - {"type": "subscribe", "timeframe": "5m"}  -> switch timeframe
    """
    await chart_ws_manager.connect(ws, file_id, timeframe)
    current_tf = timeframe
    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type", "")
            
            if msg_type == "ping":
                await ws.send_json({"type": "pong"})
            elif msg_type == "subscribe":
                new_tf = data.get("timeframe", current_tf)
                if new_tf != current_tf:
                    chart_ws_manager.disconnect(ws, file_id, current_tf)
                    current_tf = new_tf
                    await chart_ws_manager.connect(ws, file_id, current_tf)
                    await ws.send_json({"type": "subscribed", "timeframe": current_tf})
    except WebSocketDisconnect:
        chart_ws_manager.disconnect(ws, file_id, current_tf)
    except Exception:
        chart_ws_manager.disconnect(ws, file_id, current_tf)

@app.get("/api/file/{file_id}/candles.msgpack")
async def get_file_candles_msgpack(
    file_id: int,
    timeframe: str = "1m",
    start_ts: int = None,
    end_ts: int = None,
    limit: int = 5000,
    cursor: str = None,
    direction: str = "forward"
):
    """
    Binary (MessagePack) variant of the /candles endpoint.
    Returns the same data structure but encoded as MessagePack for ~40-60% smaller
    payloads and faster decode on the client (via msgpack-lite or @msgpack/msgpack).
    """
    import time as _time
    t0 = _time.monotonic()

    # Reuse the JSON endpoint logic to get the result dict
    result = await get_file_candles(
        file_id=file_id,
        timeframe=timeframe,
        start_ts=start_ts,
        end_ts=end_ts,
        limit=limit,
        cursor=cursor,
        direction=direction
    )

    try:
        import msgpack
        packed = msgpack.packb(result, use_bin_type=True)
        elapsed_ms = round((_time.monotonic() - t0) * 1000, 1)
        return Response(
            content=packed,
            media_type="application/x-msgpack",
            headers={
                "X-Elapsed-Ms": str(elapsed_ms),
                "X-Format": "msgpack"
            }
        )
    except ImportError:
        # Fallback: return JSON if msgpack not installed
        return result

@app.post("/api/file/{file_id}/candle_push")
async def push_candle_update(file_id: int, request: Request):
    """
    HTTP endpoint to push a candle update to all connected WebSocket clients.
    Used by replay system or external data feeds.
    Body: {"type": "candle_update"|"candle_close", "timeframe": "1m", "candle": {...}}
    """
    body = await request.json()
    msg_type = body.get("type", "candle_update")
    timeframe = body.get("timeframe", "1m")
    candle = body.get("candle")
    
    if not candle:
        raise HTTPException(status_code=400, detail="candle is required")
    
    await chart_ws_manager.broadcast(file_id, timeframe, {
        "type": msg_type,
        "candle": candle
    })
    
    return {"pushed": True, "timeframe": timeframe}

@app.get("/forbidden")
@app.get("/forbidden/")
async def forbidden_oops_page():
    return _serve_oops_page(403)


# Serve homepage (Next.js static export)
@app.get("/")
async def root():
    index_path = Path("homepage/out/index.html")
    if index_path.exists():
        return FileResponse(str(index_path))
    return RedirectResponse(url="/chart/")

@app.get("/login/")
async def login_page():
    return file_response_if_exists("homepage/out/login/index.html")

@app.get("/bootcamp")
async def bootcamp_redirect():
    return RedirectResponse(url="/bootcamp/")

@app.get("/bootcamp/")
async def bootcamp_page():
    return file_response_if_exists("homepage/out/bootcamp/index.html")

@app.get("/ninjatrader")
async def ninjatrader_redirect():
    return RedirectResponse(url="/ninjatrader/")

@app.get("/ninjatrader/")
async def ninjatrader_page():
    return file_response_if_exists("homepage/out/ninjatrader/index.html")

@app.get("/terms")
async def terms_redirect():
    return RedirectResponse(url="/terms/")

@app.get("/terms/")
async def terms_page():
    return file_response_if_exists("homepage/out/terms/index.html")

@app.get("/privacy")
async def privacy_redirect():
    return RedirectResponse(url="/privacy/")

@app.get("/privacy/")
async def privacy_page():
    return file_response_if_exists("homepage/out/privacy/index.html")

@app.get("/refunds")
async def refunds_redirect():
    return RedirectResponse(url="/refunds/")

@app.get("/refunds/")
async def refunds_page():
    return file_response_if_exists("homepage/out/refunds/index.html")

@app.get("/disclaimer")
async def disclaimer_redirect():
    return RedirectResponse(url="/disclaimer/")

@app.get("/disclaimer/")
async def disclaimer_page():
    return file_response_if_exists("homepage/out/disclaimer/index.html")

# Serve homepage logo files
@app.get("/logo-04.png")
async def logo04():
    return file_response_if_exists("homepage/out/logo-04.png")

@app.get("/logo-05.png")
async def logo05():
    return file_response_if_exists("homepage/out/logo-05.png")

@app.get("/logo-08.png")
async def logo08():
    return file_response_if_exists("homepage/out/logo-08.png")

@app.get("/talaria-chart.png")
async def talaria_chart_image():
    dashed = Path("homepage/out/talaria-chart.png")
    spaced = Path("homepage/out/talaria chart.png")
    if dashed.exists():
        return FileResponse(str(dashed))
    if spaced.exists():
        return FileResponse(str(spaced))
    raise HTTPException(status_code=404, detail="Not found")

@app.get("/talaria chart.png")
async def talaria_chart_image_with_space():
    return file_response_if_exists("homepage/out/talaria chart.png")

@app.get("/dashboard/sessions/{session_id}/analytics")
@app.get("/dashboard/sessions/{session_id}/analytics/")
async def dashboard_session_analytics_redirect(session_id: int):
    return RedirectResponse(url=f"/dashboard/?sessionId={session_id}")

@app.get("/chart/admin_dashboard.html")
async def admin_dashboard_underscore_redirect():
    return RedirectResponse(url="/chart/admin-dashboard.html", status_code=302)


@app.get("/dashboard/admin")
@app.get("/dashboard/admin/")
@app.get("/chart/admin-dashboard.html")
async def admin_dashboard_page(request: Request):
    _require_admin(request)
    return file_response_if_exists("admin-dashboard.html")

@app.get("/dashboard/admin/datasets")
@app.get("/dashboard/admin/datasets/")
@app.get("/chart/admin-datasets.html")
async def dashboard_admin_datasets_redirect(request: Request):
    _require_admin(request)
    return RedirectResponse(url="/chart/admin-dashboard.html#datasets")

@app.get("/dashboard/admin/users")
@app.get("/dashboard/admin/users/")
@app.get("/chart/admin-users.html")
async def dashboard_admin_users_redirect(request: Request):
    _require_admin(request)
    return RedirectResponse(url="/chart/admin-dashboard.html#users")

# Mount Next.js static assets (_next folder)
next_static_dir = Path("homepage/out/_next")
if next_static_dir.exists():
    app.mount("/_next", StaticFiles(directory=str(next_static_dir)), name="next_static")

# Chart UI (static HTML/JS/CSS) served under /chart
CHART_ROOT_FILES = {
    "index.html",
    # Full legacy monolithic chart (60k+ lines). Prefer editing V9 + dist-v9; see /chart/index.html stub.
    "legacy-index.html",
    "index.v9.html",  # redirect stub → legacy-index.html (no second monolith)
    "backtesting.html",
    "propfirm-backtest.html",
    "admin-dashboard.html",
    "styles.css",
    "propfirm-styles.css",
    "chart.js",
    "chart-main.js",
    "chart.module.js",
    "propfirm-script.js",
    "sw.js",
    "manifest.webmanifest",
    "pwa-install.js",
}

@app.get("/chart")
@app.get("/chart/")
async def chart_root_redirect():
    return RedirectResponse(url="/chart/index.html")

# Resolve build dirs relative to this file (not CWD).
#
# Two parallel builds write to different folders:
#   - dist/      : legacy minified bundle (chart-app-part1.min.js + ...).
#                  Built by `npm run build:chart-client` during docker build.
#                  Used to be the only thing served at /chart/index.html.
#   - dist-v9/   : NEW React/V9 build (TalariaV8bLive.jsx + chart.js wired).
#                  Built by `npm run build:live` in talaria-design/.
#                  When present, takes precedence over dist/ for /chart/index.html.
_CHART_ROOT_PATH    = Path(__file__).resolve().parent
_DIST_V9_INDEX_PATH = _CHART_ROOT_PATH / "dist-v9" / "index.html"
_DIST_V9_DIR_PATH   = _CHART_ROOT_PATH / "dist-v9"
_DIST_LEGACY_INDEX  = _CHART_ROOT_PATH / "dist" / "index.html"
_DIST_LEGACY_DIR    = _CHART_ROOT_PATH / "dist"

@app.get("/chart/{file_name}")
async def chart_root_files(file_name: str):
    if file_name not in CHART_ROOT_FILES:
        raise HTTPException(status_code=404, detail="Not found")
    # Preference order for /chart/index.html:
    #   1. dist-v9/index.html  (new V9 React build — canonical live UI)
    #   2. dist/index.html     (legacy minified bundle)
    #   3. chart/index.html    (stub pointer doc only — legacy source is legacy-index.html)
    if file_name == "index.html":
        if _DIST_V9_INDEX_PATH.is_file():
            return FileResponse(str(_DIST_V9_INDEX_PATH))
        if _DIST_LEGACY_INDEX.is_file():
            return FileResponse(str(_DIST_LEGACY_INDEX))
    legacy_path = _CHART_ROOT_PATH / file_name
    if file_name == "manifest.webmanifest":
        return FileResponse(str(legacy_path), media_type="application/manifest+json")
    if file_name == "sw.js":
        return FileResponse(str(legacy_path), media_type="application/javascript")
    if file_name == "pwa-install.js":
        return FileResponse(str(legacy_path), media_type="application/javascript")
    return FileResponse(str(legacy_path))

@app.get("/replay-system.js")
async def replay_system_root_file():
    return FileResponse(str(_CHART_ROOT_PATH / "modules" / "replay-system.js"))

@app.get("/order-manager.js")
async def order_manager_root_file():
    return FileResponse(str(_CHART_ROOT_PATH / "modules" / "order-manager.js"))

@app.get("/drawing-tools-manager.js")
async def drawing_tools_manager_root_file():
    return FileResponse(str(_CHART_ROOT_PATH / "modules" / "drawing-tools-manager.js"))

# Mount V9 build assets at /chart/dist-v9/ so the entry HTML's
# <script src="/chart/dist-v9/assets/index-XXX.js"> tag resolves.
if _DIST_V9_DIR_PATH.is_dir():
    app.mount("/chart/dist-v9", StaticFiles(directory=str(_DIST_V9_DIR_PATH)), name="chart_dist_v9")
    print(f"✅ V9 build detected at {_DIST_V9_DIR_PATH}; /chart/index.html will serve V9.")
else:
    print(f"ℹ️ No V9 build at {_DIST_V9_DIR_PATH}; falling back to legacy.")

# Keep the legacy dist/ mount for the old minified bundle.
if _DIST_LEGACY_DIR.is_dir():
    app.mount("/chart/dist", StaticFiles(directory=str(_DIST_LEGACY_DIR)), name="chart_dist")

app.mount("/chart/modules", StaticFiles(directory=str(_CHART_ROOT_PATH / "modules")), name="chart_modules")
_CHART_PWA_DIR_PATH = _CHART_ROOT_PATH / "pwa"
if _CHART_PWA_DIR_PATH.is_dir():
    app.mount("/chart/pwa", StaticFiles(directory=str(_CHART_PWA_DIR_PATH)), name="chart_pwa")
_INDICATORS_DIR_PATH = _CHART_ROOT_PATH / "indicators"
_INDICATORS_DIR_PATH.mkdir(exist_ok=True)
app.mount("/chart/indicators", StaticFiles(directory=str(_INDICATORS_DIR_PATH)), name="chart_indicators")
app.mount("/chart/image", StaticFiles(directory=str(_CHART_ROOT_PATH / "image")), name="chart_image")

_STATIC_OOPS_DIR = _CHART_ROOT_PATH / "static"
if _STATIC_OOPS_DIR.is_dir():
    app.mount("/chart/static", StaticFiles(directory=str(_STATIC_OOPS_DIR)), name="chart_static_oops")

# Multichart sandbox (multi_chart_rebuild_roadmap.md verification rig).
# Static files only — sandbox HTML/JS/CSS that load `chart.js` in iframes
# and orchestrate sync between them via postMessage. Same pattern as the
# /chart/modules and /chart/image mounts above.
_MULTICHART_DIR_PATH = _CHART_ROOT_PATH / "multichart"
if _MULTICHART_DIR_PATH.is_dir():
    app.mount("/chart/multichart", StaticFiles(directory=str(_MULTICHART_DIR_PATH), html=True), name="chart_multichart")
    print(f"✅ Multichart sandbox mounted at /chart/multichart/ from {_MULTICHART_DIR_PATH}")

# Multichart PRODUCTION foundation (Phase 7.2.1).
# Static asset mount only — no entry route. The bridge files in this folder
# (engine-api-guards.js, sync-bridge.js, multichart-manager.js, embed-bridge.js)
# are loaded by the dist-v9/index.html shim ONLY when the iframe URL contains
# ?multichart=1, and the only thing that creates such iframes is the future
# <MultichartGrid> React component (Phase 7.2.2). Until then, this mount sits
# dormant and serves no traffic.
_MULTICHART_PROD_DIR_PATH = _CHART_ROOT_PATH / "multichart-prod"
if _MULTICHART_PROD_DIR_PATH.is_dir():
    app.mount(
        "/chart/multichart-prod",
        StaticFiles(directory=str(_MULTICHART_PROD_DIR_PATH)),
        name="chart_multichart_prod",
    )
    print(f"✅ Multichart prod foundation mounted at /chart/multichart-prod/ from {_MULTICHART_PROD_DIR_PATH}")


# NinjaTrader landing page assets (served from repo files)
ninjatrader_assets_dir = Path("homepage/ninjatrader/Landing-Page-Text-Images")
if ninjatrader_assets_dir.exists():
    app.mount(
        "/assets/ninjatrader",
        StaticFiles(directory=str(ninjatrader_assets_dir)),
        name="ninjatrader_assets",
    )

# Mount homepage export at root
homepage_dir = Path("homepage/out")
if homepage_dir.exists():
    app.mount("/", StaticFiles(directory=str(homepage_dir), html=True), name="homepage")

@app.on_event("startup")
async def _firstrate_scheduler_app_startup():
    """Background thread: QuestDB schema (+ FirstRate scheduler on worker role only)."""
    def _bootstrap() -> None:
        if questdb_store.questdb_enabled():
            try:
                questdb_store.ensure_schema()
                print("✅ QuestDB schema ready")
            except Exception as exc:
                print(f"⚠️ QuestDB schema init failed: {exc}")
        if APP_ROLE == "worker":
            _start_firstrate_scheduler_thread()

    threading.Thread(target=_bootstrap, daemon=True, name="app-startup").start()


if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Trading Chart API Server...")
    print("📊 API Docs: http://localhost:8000/docs")
    print("🌐 API Base: http://localhost:8000/api")
    uvicorn.run("api_server:app", host="0.0.0.0", port=8000, reload=True)