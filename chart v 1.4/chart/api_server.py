from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse, RedirectResponse
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, ForeignKey, Text, Float
from sqlalchemy.orm import sessionmaker, declarative_base
from datetime import datetime, timedelta
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
from pydantic import BaseModel
from passlib.context import CryptContext
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from urllib.parse import quote, urlparse

import math

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
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)

# Single Base so FK references between models resolve correctly.
# The users table is owned by journal-backend — we declare it here for FK resolution
# but exclude it from create_all (see CHART_TABLES below).
Base = declarative_base()

# Upload directory
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

DUKASCOPY_SCRIPT_PATH = _APP_DIR / "download" / "fetch-data.js"
DUKASCOPY_DEFAULT_TIMEFRAME = "m1"
DUKASCOPY_MAX_RANGE_DAYS = int(os.getenv("DUKASCOPY_MAX_RANGE_DAYS", "365"))
DUKASCOPY_MAX_TOTAL_DAYS = int(os.getenv("DUKASCOPY_MAX_TOTAL_DAYS", "7300"))
DUKASCOPY_JOB_TTL_SECONDS = int(os.getenv("DUKASCOPY_JOB_TTL_SECONDS", "21600"))
DUKASCOPY_JOBS_DIR = UPLOAD_DIR / "dukascopy_jobs"
DUKASCOPY_JOBS_DIR.mkdir(exist_ok=True)

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

    session_id = Column(Integer, ForeignKey("trading_sessions.id"), primary_key=True)
    user_id = Column(Integer, index=True, nullable=False)  # no FK — users table is managed by journal-backend
    state_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# Create chart-specific tables only — exclude 'users' (managed by journal-backend).
_CHART_TABLES = [
    CSVFile.__table__,
    CSVAggregate.__table__,
    DatasetSettings.__table__,
    UserSession.__table__,
    TradingSession.__table__,
    TradingSessionState.__table__,
]
Base.metadata.create_all(bind=engine, tables=_CHART_TABLES)

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
        sess.last_active_at = datetime.utcnow()
        db.commit()
        return user
    except Exception:
        db.rollback()
        return None
    finally:
        db.close()

@app.get("/api/sessions/{session_id}/analytics")
async def get_trading_session_analytics(session_id: int, request: Request):
    user = _require_user(request)
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
        session_public = _session_public_dict(s)
        analytics = _compute_session_analytics(session_public, journal)
        return {"analytics": _sanitize_for_json(analytics)}
    finally:
        db.close()


@app.get("/api/sessions/{session_id}/trades/{trade_id}/screenshot")
async def get_trading_session_trade_screenshot(session_id: int, trade_id: str, kind: str = "entry", request: Request = None):
    user = _require_user(request)
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
    if path in {"/index.html", "/sessions.html", "/backtesting.html"}:
        protected = True
    if path.startswith("/api/") and not (path == "/api/status" or path.startswith("/api/auth/")):
        protected = True

    if not protected:
        return await call_next(request)

    user = _get_user_from_request(request)
    if user is not None:
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

                fpath = UPLOAD_DIR / f.filename
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
                    build_binary_for_file(f.id, fpath, f.original_name)
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
    """Count rows in CSV file"""
    try:
        with open(file_path, 'r') as f:
            return len(f.readlines()) - 1  # Exclude header
    except:
        return 0

def _dataset_file_public_dict(db_file: CSVFile) -> dict:
    return {
        "id": db_file.id,
        "filename": db_file.original_name,
        "rowCount": int(db_file.row_count or 0),
        "uploadDate": db_file.upload_date.isoformat() if db_file.upload_date else None,
    }

def _store_dataset_file(file_path: Path, original_name: str, description: str | None = None):
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

        # Kick off background binary conversion for all timeframes
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
    if not re.fullmatch(r"[a-z0-9]{3,20}", instrument):
        raise HTTPException(status_code=400, detail="instrument must contain only letters/numbers (3-20 chars)")
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

def _canonicalize_candles(candles):
    """Normalize candles into ascending timestamp order and merge duplicate timestamps."""
    if not candles:
        return []

    cleaned = []
    for c in candles:
        try:
            cleaned.append({
                't': int(float(c['t'])),
                'o': float(c['o']),
                'h': float(c['h']),
                'l': float(c['l']),
                'c': float(c['c']),
                'v': float(c.get('v', 0) or 0)
            })
        except Exception:
            continue

    if not cleaned:
        return []

    cleaned.sort(key=lambda x: x['t'])
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
    return merged

def _parse_candles_from_csv(file_path):
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
    return _canonicalize_candles(candles)

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
            current_candle = {'t': bucket, 'o': c['o'], 'h': c['h'], 'l': c['l'], 'c': c['c'], 'v': c['v']}
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
            current_candle = {'t': bucket_ts, 'o': c['o'], 'h': c['h'], 'l': c['l'], 'c': c['c'], 'v': c['v']}
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

def build_binary_for_file(file_id: int, file_path, original_filename: str):
    """
    Background job: parse CSV once, write binary (.bin) files for 1m + all TFs.
    Binary format: 48 bytes per candle (6 x float64: t,o,h,l,c,v).
    This replaces the old CSV aggregation — binary is 100x faster to read.
    """
    import threading

    def _run():
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
            candles = _parse_candles_from_csv(file_path)
            if not candles:
                db.query(CSVAggregate).filter(
                    CSVAggregate.file_id == file_id
                ).update({"status": "failed"})
                db.commit()
                return

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
                    print(f"  ⚠️ {tf} failed: {exc}")
                    db.query(CSVAggregate).filter(
                        CSVAggregate.file_id == file_id,
                        CSVAggregate.timeframe == tf
                    ).update({"status": "failed"})
                    db.commit()

            print(f"✅ Binary conversion complete for file {file_id} ({original_filename})")
        except Exception as exc:
            print(f"❌ Binary pipeline error for file {file_id}: {exc}")
        finally:
            db.close()

    t = threading.Thread(target=_run, daemon=True)
    t.start()

# Run backfill on startup (all helpers are now defined)
_backfill_binaries()

# API Endpoints

@app.get("/api/status")
async def api_status():
    return {"message": "Trading Chart API is running", "version": "1.0"}


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
            return {"status": "pending", "progress": 0, "timeframes": {}}
        total = len(aggs)
        ready = sum(1 for a in aggs if a.status == "ready")
        failed = sum(1 for a in aggs if a.status == "failed")
        overall = "ready" if ready == total else ("failed" if failed == total else "processing")
        return {
            "status": overall,
            "progress": round(ready / total * 100),
            "ready": ready,
            "total": total,
            "timeframes": {a.timeframe: a.status for a in aggs},
        }
    finally:
        db.close()

class SignUpIn(BaseModel):
    name: str
    email: str
    password: str

class LoginIn(BaseModel):
    email: str
    password: str

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
    replay: dict | None = None
    chartView: dict | None = None
    chartSettings: dict | None = None
    toolDefaults: dict | None = None
    indicators: list | None = None

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

def _require_admin(request: Request):
    if not AUTH_ENABLED:
        return _ANON_USER
    user = _require_user(request)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    return user

def _can_access_trading_session(user: User, session: TradingSession) -> bool:
    if user.role == "admin":
        return True
    return int(session.user_id) == int(user.id)

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
        "symbol": cfg.get("symbol"),
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

def _compute_session_analytics(session_public: dict, journal: list):
    trades = [t for t in journal if isinstance(t, dict)]
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

def _user_public_dict(user: User):
    created = getattr(user, 'created_at', None)
    updated = getattr(user, 'updated_at', created)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "timezone": getattr(user, 'timezone', 'UTC'),
        "base_currency": getattr(user, 'base_currency', 'USD'),
        "is_active": bool(user.is_active),
        "created_at": created.isoformat() if created else None,
        "updated_at": updated.isoformat() if updated else None,
    }

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
async def auth_signup(payload: SignUpIn):
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
        db.commit()
        db.refresh(user)
        return {"success": True, "user": _user_public_dict(user)}
    finally:
        db.close()

@app.post("/api/auth/login")
async def auth_login(payload: LoginIn, request: Request, response: Response):
    email = payload.email.strip().lower()

    if not payload.password:
        raise HTTPException(status_code=400, detail="Invalid input")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not _verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")

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

        _set_session_cookie(response, session_id, request=request)
        return {"success": True, "user": _user_public_dict(user)}
    finally:
        db.close()

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

@app.get("/api/auth/me")
async def auth_me(request: Request):
    if not AUTH_ENABLED:
        return {"user": {"id": 0, "email": "anonymous@local", "name": "Trader", "role": "admin"}}
    user = _get_user_from_request(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user": _user_public_dict(user)}

@app.get("/api/admin/users")
async def admin_list_users(request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        users = db.query(User).order_by(User.created_at.desc()).all()
        return {"users": [_user_public_dict(u) for u in users]}
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

        aggs_by_file: dict[int, dict[str, CSVAggregate]] = {}
        for agg in aggs:
            aggs_by_file.setdefault(int(agg.file_id), {})[agg.timeframe] = agg

        settings_by_file = {int(s.file_id): s for s in settings_rows}

        datasets = []
        for f in files:
            file_aggs = aggs_by_file.get(int(f.id), {})
            tf_info = {}
            ready_count = 0
            for tf in DATASET_TIMEFRAMES:
                agg = file_aggs.get(tf)
                agg_filename = agg.agg_filename if agg and agg.agg_filename else f"bin_{f.id}_{tf}.bin"
                bin_path = BIN_DIR / agg_filename
                status = agg.status if agg else ("ready" if bin_path.exists() else "missing")
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
            })

        return {
            "datasets": datasets,
            "timeframes": DATASET_TIMEFRAMES,
        }
    finally:
        db.close()

@app.post("/api/admin/datasets/upload")
async def admin_upload_dataset(request: Request, csvFile: UploadFile = File(...)):
    _require_admin(request)
    return await upload_csv(request, csvFile)

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
    return state

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

        file_path = UPLOAD_DIR / db_file.filename
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")

        db.query(CSVAggregate).filter(CSVAggregate.file_id == file_id).update({"status": "pending"})
        db.commit()

        build_binary_for_file(file_id, file_path, db_file.original_name)

        return {
            "success": True,
            "message": "Binary rebuild started in background",
            "file_id": file_id,
        }
    finally:
        db.close()

@app.delete("/api/admin/datasets/{file_id}")
async def admin_delete_dataset(file_id: int, request: Request):
    _require_admin(request)
    db = SessionLocal()
    try:
        db_file = db.query(CSVFile).filter(CSVFile.id == file_id).first()

        if not db_file:
            raise HTTPException(status_code=404, detail="File not found")

        file_path = UPLOAD_DIR / db_file.filename
        if file_path.exists():
            file_path.unlink()

        aggs = db.query(CSVAggregate).filter(CSVAggregate.file_id == file_id).all()
        for agg in aggs:
            for d in [BIN_DIR, AGG_DIR]:
                p = d / agg.agg_filename
                if p.exists():
                    p.unlink()
            db.delete(agg)

        # Remove any known timeframe binaries even if aggregate rows are missing.
        for tf in DATASET_TIMEFRAMES:
            p = BIN_DIR / f"bin_{file_id}_{tf}.bin"
            if p.exists():
                p.unlink()

        # Remove tile directory for this file (also invalidate mmap handles for those tiles)
        tile_file_dir = TILES_DIR / str(file_id)
        if tile_file_dir.exists():
            for tp in tile_file_dir.rglob("tile_*.bin"):
                _mmap_cache.invalidate(tp)
            import shutil as _shutil
            _shutil.rmtree(tile_file_dir, ignore_errors=True)

        db.query(DatasetSettings).filter(DatasetSettings.file_id == file_id).delete()
        db.delete(db_file)
        db.commit()

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.get("/api/sessions")
async def list_trading_sessions(request: Request):
    user = _require_user(request)
    db = SessionLocal()
    try:
        q = db.query(TradingSession)
        if user.role != "admin":
            q = q.filter(TradingSession.user_id == user.id)
        sessions = q.order_by(TradingSession.created_at.desc()).all()
        return {"sessions": [_session_public_dict(s) for s in sessions]}
    finally:
        db.close()

@app.post("/api/sessions")
async def create_trading_session(payload: TradingSessionCreateIn, request: Request):
    user = _require_user(request)
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
        s = TradingSession(user_id=user.id, name=name, session_type=session_type, config_json=cfg_json)
        db.add(s)
        db.commit()
        db.refresh(s)
        return {"session": _session_public_dict(s)}
    finally:
        db.close()

@app.get("/api/sessions/{session_id}")
async def get_trading_session(session_id: int, request: Request):
    user = _require_user(request)
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
    user = _require_user(request)
    db = SessionLocal()
    try:
        s = db.query(TradingSession).filter(TradingSession.id == session_id).first()
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")
        if not _can_access_trading_session(user, s):
            raise HTTPException(status_code=403, detail="Forbidden")

        st = _get_or_create_trading_session_state(db, session_id=s.id, user_id=s.user_id)
        state = _parse_json_dict(st.state_json)
        return {
            "state": {
                "drawings": state.get("drawings") if isinstance(state.get("drawings"), list) else [],
                "journal": state.get("journal") if isinstance(state.get("journal"), list) else [],
                "replay": state.get("replay") if isinstance(state.get("replay"), dict) else {},
                "chartView": state.get("chartView") if isinstance(state.get("chartView"), dict) else {},
                "chartSettings": state.get("chartSettings") if isinstance(state.get("chartSettings"), dict) else {},
                "toolDefaults": state.get("toolDefaults") if isinstance(state.get("toolDefaults"), dict) else {},
                "indicators": state.get("indicators") if isinstance(state.get("indicators"), list) else [],
                "updated_at": st.updated_at.isoformat() if st.updated_at else None,
            }
        }
    finally:
        db.close()

@app.patch("/api/sessions/{session_id}/state")
async def patch_trading_session_state(session_id: int, payload: TradingSessionStateUpdateIn, request: Request):
    user = _require_user(request)
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
            state["drawings"] = payload.drawings
        if payload.journal is not None:
            state["journal"] = payload.journal
        if payload.replay is not None:
            state["replay"] = payload.replay
        if payload.chartView is not None:
            state["chartView"] = payload.chartView
        if payload.chartSettings is not None:
            state["chartSettings"] = payload.chartSettings
        if payload.toolDefaults is not None:
            state["toolDefaults"] = payload.toolDefaults
        if payload.indicators is not None:
            state["indicators"] = payload.indicators

        st.state_json = json.dumps(state, separators=(",", ":"))
        db.commit()
        db.refresh(st)
        return {"success": True}
    finally:
        db.close()

@app.patch("/api/sessions/{session_id}")
async def update_trading_session(session_id: int, payload: TradingSessionUpdateIn, request: Request):
    user = _require_user(request)
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
                s.config_json = json.dumps(payload.config or {}, separators=(",", ":"))
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid config")

        db.commit()
        db.refresh(s)
        return {"session": _session_public_dict(s)}
    finally:
        db.close()

@app.delete("/api/sessions/{session_id}")
async def delete_trading_session(session_id: int, request: Request):
    user = _require_user(request)
    db = SessionLocal()
    try:
        s = db.query(TradingSession).filter(TradingSession.id == session_id).first()
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")
        if not _can_access_trading_session(user, s):
            raise HTTPException(status_code=403, detail="Forbidden")
        db.delete(s)
        db.commit()
        return {"success": True}
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
async def get_files():
    """Get list of all uploaded CSV files"""
    db = next(get_db())
    try:
        files = db.query(CSVFile).order_by(CSVFile.upload_date.desc()).all()
        return {
            "files": [
                {
                    "id": f.id,
                    "original_name": f.original_name,
                    "upload_date": f.upload_date.isoformat(),
                    "row_count": f.row_count,
                    "description": f.description
                }
                for f in files
            ]
        }
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
        
        file_path = UPLOAD_DIR / db_file.filename
        
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
    timeframe: str = "1m",
    limit: int = 5000,
    start_ts: int = None,
    end_ts: int = None,
    anchor: str = "end"
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

    db = next(get_db())
    try:
        db_file = db.query(CSVFile).filter(CSVFile.id == file_id).first()
        if not db_file:
            raise HTTPException(status_code=404, detail="File not found")

        # ── Find binary file for this timeframe ──
        bin_path = BIN_DIR / f"bin_{file_id}_{timeframe}.bin"
        source = "binary"

        agg = db.query(CSVAggregate).filter(
            CSVAggregate.file_id == file_id,
            CSVAggregate.timeframe == timeframe
        ).first()
        binary_ready = bool(agg and agg.status == "ready")

        tile_meta = _load_tile_meta(file_id, timeframe) if binary_ready else None

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
            agg_1m = db.query(CSVAggregate).filter(
                CSVAggregate.file_id == file_id,
                CSVAggregate.timeframe == '1m'
            ).first()
            if tile_meta_1m is not None and agg_1m and agg_1m.status == 'ready':
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
                source = "csv-fallback"
                file_path = UPLOAD_DIR / db_file.filename
                if not file_path.exists():
                    raise HTTPException(status_code=404, detail="File not found on disk")

                candles = _parse_candles_from_csv(file_path)
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

        # ── Build cursors ──
        first_cursor = str(candles[0]['t']) if candles else None
        last_cursor = str(candles[-1]['t']) if candles else None

        # ── Convert to CSV for frontend ──
        output = StringIO()
        output.write("time,open,high,low,close,volume\n")
        for c in candles:
            output.write(f"{c['t']},{c['o']},{c['h']},{c['l']},{c['c']},{c['v']}\n")

        elapsed_ms = round((_time.monotonic() - t0) * 1000, 1)

        return {
            "data": output.getvalue(),
            "timeframe": timeframe,
            "total": total_candles,
            "returned": len(candles),
            "has_more_left": has_more_left,
            "has_more_right": has_more_right,
            "first_cursor": first_cursor,
            "last_cursor": last_cursor,
            "source": source,
            "elapsed_ms": elapsed_ms
        }
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

        bin_path = BIN_DIR / f"bin_{file_id}_{timeframe}.bin"

        agg = db.query(CSVAggregate).filter(
            CSVAggregate.file_id == file_id,
            CSVAggregate.timeframe == timeframe
        ).first()
        binary_ready = bool(agg and agg.status == "ready")

        tile_meta = _load_tile_meta(file_id, timeframe) if binary_ready else None

        if tile_meta is not None and cursor_ts is not None:
            # ── Fast path: tile-based cursor pan via mmap ──
            if direction == "backward":
                candles, _, has_more_left, has_more_right = _tiles_read_window(
                    file_id, timeframe, tile_meta,
                    limit=limit, anchor="end", end_ts=cursor_ts - 1
                )
                has_more_right = True
            else:
                candles, _, has_more_left, has_more_right = _tiles_read_window(
                    file_id, timeframe, tile_meta,
                    limit=limit, anchor="start", start_ts=cursor_ts + 1
                )
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
            file_path = UPLOAD_DIR / db_file.filename
            raw = _parse_candles_from_csv(file_path)
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

        prev_cursor = str(candles[0]['t']) if candles else None
        next_cursor = str(candles[-1]['t']) if candles else None

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

        # Detect date range from binary 1m file (fast) or DB
        raw_start_ts = None
        raw_end_ts = None
        bin_1m = BIN_DIR / f"bin_{file_id}_1m.bin"
        if bin_1m.exists():
            total = _bin_total_candles(bin_1m)
            if total > 0:
                first = _read_bin_range(bin_1m, 0, 1)
                last = _read_bin_range(bin_1m, total - 1, 1)
                raw_start_ts = first[0]['t'] if first else None
                raw_end_ts = last[0]['t'] if last else None

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
        
        # Delete raw file from disk
        file_path = UPLOAD_DIR / db_file.filename
        if file_path.exists():
            file_path.unlink()
        
        # Delete binary + aggregate files from disk and DB
        aggs = db.query(CSVAggregate).filter(CSVAggregate.file_id == file_id).all()
        for agg in aggs:
            # Check both BIN_DIR and AGG_DIR
            for d in [BIN_DIR, AGG_DIR]:
                p = d / agg.agg_filename
                if p.exists():
                    p.unlink()
            db.delete(agg)

        # Remove tile directory for this file
        tile_file_dir = TILES_DIR / str(file_id)
        if tile_file_dir.exists():
            import shutil as _shutil2
            _shutil2.rmtree(tile_file_dir, ignore_errors=True)
        
        # Delete from database
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

@app.get("/sessions.html")
async def sessions_page():
    return RedirectResponse(url="/chart/sessions.html")

@app.get("/dashboard/sessions/{session_id}/analytics")
@app.get("/dashboard/sessions/{session_id}/analytics/")
async def dashboard_session_analytics_redirect(session_id: int):
    return RedirectResponse(url=f"/dashboard/sessions/analytics/?id={session_id}")

@app.get("/dashboard/admin/datasets")
@app.get("/dashboard/admin/datasets/")
async def dashboard_admin_datasets_page(request: Request):
    _require_admin(request)
    return file_response_if_exists("admin-datasets.html")

@app.get("/chart/admin-datasets.html")
async def chart_admin_datasets_page(request: Request):
    _require_admin(request)
    return file_response_if_exists("admin-datasets.html")

# Mount Next.js static assets (_next folder)
next_static_dir = Path("homepage/out/_next")
if next_static_dir.exists():
    app.mount("/_next", StaticFiles(directory=str(next_static_dir)), name="next_static")

# Chart UI (static HTML/JS/CSS) served under /chart
CHART_ROOT_FILES = {
    "index.html",
    "sessions.html",
    "backtesting.html",
    "backtesting-clean.html",
    "propfirm-backtest.html",
    "styles.css",
    "propfirm-styles.css",
    "chart.js",
    "chart-main.js",
    "chart.module.js",
    "propfirm-script.js",
}

@app.get("/chart")
@app.get("/chart/")
async def chart_root_redirect():
    return RedirectResponse(url="/chart/index.html")

@app.get("/chart/{file_name}")
async def chart_root_files(file_name: str):
    if file_name not in CHART_ROOT_FILES:
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(file_name)

@app.get("/replay-system.js")
async def replay_system_root_file():
    return FileResponse("modules/replay-system.js")

@app.get("/order-manager.js")
async def order_manager_root_file():
    return FileResponse("modules/order-manager.js")

@app.get("/drawing-tools-manager.js")
async def drawing_tools_manager_root_file():
    return FileResponse("modules/drawing-tools-manager.js")

app.mount("/chart/modules", StaticFiles(directory="modules"), name="chart_modules")
app.mount("/chart/indicators", StaticFiles(directory="indicators"), name="chart_indicators")
app.mount("/chart/image", StaticFiles(directory="image"), name="chart_image")

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

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Trading Chart API Server...")
    print("📊 API Docs: http://localhost:8000/docs")
    print("🌐 API Base: http://localhost:8000/api")
    uvicorn.run("api_server:app", host="0.0.0.0", port=8000, reload=True)