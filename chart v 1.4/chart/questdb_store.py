"""
QuestDB OHLC storage — time-indexed reads + ILP bulk ingest.
"""
from __future__ import annotations

import os
import re
import socket
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from bar_budget import RESOLUTION_TO_TABLE, resolution_table

# Tables managed by this module (1m base + pre-aggregated).
OHLCV_TABLES: list[str] = list(RESOLUTION_TO_TABLE.values())

# QuestDB SAMPLE BY intervals for aggregate rebuild (table → SAMPLE BY clause).
AGG_SAMPLE_BY: dict[str, str] = {
    "ohlcv_5m": "5m",
    "ohlcv_15m": "15m",
    "ohlcv_1h": "1h",
    "ohlcv_4h": "4h",
    "ohlcv_1d": "1d",
    "ohlcv_1w": "1w",
}

_schema_lock = threading.Lock()
_schema_ready = False

_OHLCV_DDL = """
    file_id SYMBOL,
    ts TIMESTAMP,
    o DOUBLE,
    h DOUBLE,
    l DOUBLE,
    c DOUBLE,
    v DOUBLE
) TIMESTAMP(ts) PARTITION BY YEAR;
"""


def _safe_file_id(file_id: int | str) -> str:
    fid = str(int(file_id))
    if not re.fullmatch(r"[0-9]+", fid):
        raise ValueError(f"Invalid file_id: {file_id!r}")
    return fid


def _create_ohlcv_table(table: str) -> None:
    _exec_sql(f"CREATE TABLE IF NOT EXISTS {table} ({_OHLCV_DDL}")


def questdb_enabled() -> bool:
    return os.getenv("QUESTDB_ENABLED", "false").lower() in ("1", "true", "yes")


def questdb_read_primary() -> bool:
    return questdb_enabled() and os.getenv("QUESTDB_READ_PRIMARY", "false").lower() in (
        "1",
        "true",
        "yes",
    )


def questdb_tiles_fallback() -> bool:
    if not questdb_enabled():
        return True
    return os.getenv("QUESTDB_TILES_FALLBACK", "true").lower() in ("1", "true", "yes")


def _pg_url() -> str | None:
    url = (os.getenv("QUESTDB_PG_URL") or "").strip()
    return url or None


def _ilp_host() -> str:
    return (os.getenv("QUESTDB_ILP_HOST") or "127.0.0.1").strip()


def _ilp_port() -> int:
    try:
        return int(os.getenv("QUESTDB_ILP_PORT", "9009"))
    except ValueError:
        return 9009


def ping_ok() -> bool | None:
    """True=ok, False=down, None=not configured."""
    if not questdb_enabled():
        return None
    url = _pg_url()
    if not url:
        return None
    try:
        with _pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return True
    except Exception:
        return False


@contextmanager
def _pg_conn():
    import psycopg2

    url = _pg_url()
    if not url:
        raise RuntimeError("QUESTDB_PG_URL not configured")
    conn = psycopg2.connect(
        url,
        gssencmode="disable",
        sslmode="disable",
    )
    try:
        conn.autocommit = True
        yield conn
    finally:
        conn.close()


def _exec_sql(sql: str, params: tuple | None = None) -> None:
    with _pg_conn() as conn:
        with conn.cursor() as cur:
            if params:
                cur.execute(sql, params)
            else:
                cur.execute(sql)


def _fetch_all(sql: str, params: tuple) -> list[tuple]:
    with _pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()


def _fetch_one(sql: str, params: tuple) -> tuple | None:
    rows = _fetch_all(sql, params)
    return rows[0] if rows else None


def ensure_schema() -> None:
    global _schema_ready
    if _schema_ready or not questdb_enabled():
        return
    with _schema_lock:
        if _schema_ready:
            return
        ddl = """
        CREATE TABLE IF NOT EXISTS ohlcv_1m (
            file_id SYMBOL,
            ts TIMESTAMP,
            o DOUBLE,
            h DOUBLE,
            l DOUBLE,
            c DOUBLE,
            v DOUBLE
        ) TIMESTAMP(ts) PARTITION BY YEAR;
        """
        _exec_sql(ddl)
        for table in AGG_SAMPLE_BY:
            _create_ohlcv_table(table)
        _schema_ready = True


def _table_row_count(table: str) -> int:
    row = _fetch_one(f"SELECT count() FROM {table}", ())
    return int(row[0]) if row else 0


def _drop_and_recreate_table(table: str) -> None:
    _exec_sql(f"DROP TABLE {table}")
    _create_ohlcv_table(table)


def _replace_table_excluding_file(table: str, fid: str) -> None:
    """QuestDB has no DELETE — copy rows for other file_ids into a new table."""
    tmp = f"_tmp_{table}_{fid}_{int(time.time() * 1000)}"
    _exec_sql(f"CREATE TABLE {tmp} AS (SELECT * FROM {table} WHERE file_id != '{fid}')")
    _exec_sql(f"DROP TABLE {table}")
    _exec_sql(f"RENAME TABLE {tmp} TO {table}")


def delete_file_data(file_id: int) -> None:
    """Remove all OHLC rows for one dataset (QuestDB-compatible, no DELETE)."""
    ensure_schema()
    fid = _safe_file_id(file_id)
    for table in OHLCV_TABLES:
        n = count_bars(file_id, table)
        if n <= 0:
            continue
        total = _table_row_count(table)
        if n >= total:
            _drop_and_recreate_table(table)
        else:
            _replace_table_excluding_file(table, fid)


def count_bars(file_id: int, table: str = "ohlcv_1m") -> int:
    ensure_schema()
    if table not in OHLCV_TABLES:
        raise ValueError(f"Unknown table: {table}")
    row = _fetch_one(
        f"SELECT count() FROM {table} WHERE file_id = %s",
        (_safe_file_id(file_id),),
    )
    return int(row[0]) if row else 0


def _ilp_send(lines: list[str]) -> None:
    if not lines:
        return
    payload = "".join(lines).encode("utf-8")
    host = _ilp_host()
    port = _ilp_port()
    with socket.create_connection((host, port), timeout=120) as sock:
        sock.sendall(payload)
        sock.shutdown(socket.SHUT_WR)
        sock.settimeout(5)
        try:
            sock.recv(4096)
        except socket.timeout:
            pass


def insert_1m_bars(file_id: int, candles: list[dict], batch_size: int = 5000) -> int:
    """Bulk insert 1m candles via ILP. Returns rows sent."""
    ensure_schema()
    if not candles:
        return 0
    fid = _safe_file_id(file_id)
    sent = 0
    buf: list[str] = []
    for c in candles:
        ts_us = int(c["t"]) * 1000
        line = (
            f"ohlcv_1m,file_id={fid} "
            f"o={float(c['o'])},h={float(c['h'])},l={float(c['l'])},"
            f"c={float(c['c'])},v={float(c.get('v') or 0)} {ts_us}\n"
        )
        buf.append(line)
        if len(buf) >= batch_size:
            _ilp_send(buf)
            sent += len(buf)
            buf = []
    if buf:
        _ilp_send(buf)
        sent += len(buf)
    # Allow ILP flush before aggregate rebuild
    time.sleep(0.05)
    return sent


def _rebuild_aggregate_table_for_file(table: str, sample: str, fid: str) -> None:
    """Replace one file_id's aggregate rows (QuestDB has no DELETE)."""
    tmp = f"_tmp_{table}_{fid}_{int(time.time() * 1000)}"
    _exec_sql(
        f"""
        CREATE TABLE {tmp} AS (
            SELECT * FROM {table} WHERE file_id != '{fid}'
            UNION ALL
            SELECT file_id, ts, first(o), max(h), min(l), last(c), sum(v)
            FROM ohlcv_1m
            WHERE file_id = '{fid}'
            SAMPLE BY {sample} ALIGN TO CALENDAR
        )
        """
    )
    _exec_sql(f"DROP TABLE {table}")
    _exec_sql(f"RENAME TABLE {tmp} TO {table}")


def rebuild_aggregates(file_id: int) -> dict[str, int]:
    """Rebuild all higher-TF tables for one file_id from ohlcv_1m."""
    ensure_schema()
    fid = _safe_file_id(file_id)
    counts: dict[str, int] = {}
    if count_bars(file_id, "ohlcv_1m") <= 0:
        for table in AGG_SAMPLE_BY:
            n = count_bars(file_id, table)
            if n > 0:
                total = _table_row_count(table)
                if n >= total:
                    _drop_and_recreate_table(table)
                else:
                    _replace_table_excluding_file(table, fid)
            counts[table] = 0
        return counts
    for table, sample in AGG_SAMPLE_BY.items():
        _rebuild_aggregate_table_for_file(table, sample, fid)
        counts[table] = count_bars(file_id, table)
    return counts


def sync_file_candles(file_id: int, candles: list[dict]) -> dict[str, Any]:
    """Full replace: delete existing rows, insert 1m, rebuild aggregates."""
    delete_file_data(file_id)
    inserted = insert_1m_bars(file_id, candles)
    agg = rebuild_aggregates(file_id)
    return {"inserted_1m": inserted, "aggregates": agg}


def append_1m_bars(file_id: int, candles: list[dict]) -> dict[str, Any]:
    """Append new 1m rows and rebuild aggregates for the file (incremental ingest)."""
    if not candles:
        return {"appended": 0}
    appended = insert_1m_bars(file_id, candles)
    agg = rebuild_aggregates(file_id)
    return {"appended": appended, "aggregates": agg}


def _ms_to_questdb_ts(ms: int) -> str:
    dt = datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def query_bars(
    file_id: int,
    resolution: str,
    from_ms: int | None,
    to_ms: int | None,
    limit: int = 2000,
) -> list[dict]:
    """Bounded range query against QuestDB."""
    ensure_schema()
    table = resolution_table(resolution)
    limit = max(1, min(int(limit), 2000))
    fid = str(file_id)

    clauses = ["file_id = %s"]
    params: list[Any] = [fid]

    if from_ms is not None:
        clauses.append("ts >= %s")
        params.append(_ms_to_questdb_ts(int(from_ms)))
    if to_ms is not None:
        clauses.append("ts <= %s")
        params.append(_ms_to_questdb_ts(int(to_ms)))

    where = " AND ".join(clauses)
    sql = f"""
        SELECT ts, o, h, l, c, v
        FROM {table}
        WHERE {where}
        ORDER BY ts ASC
        LIMIT {limit}
    """
    rows = _fetch_all(sql, tuple(params))
    out: list[dict] = []
    for ts, o, h, l, c, v in rows:
        if ts is None:
            continue
        t_ms = int(ts.timestamp() * 1000) if hasattr(ts, "timestamp") else int(ts)
        out.append(
            {
                "t": t_ms,
                "o": float(o),
                "h": float(h),
                "l": float(l),
                "c": float(c),
                "v": float(v or 0),
            }
        )
    return out


def query_bars_cursor(
    file_id: int,
    resolution: str,
    *,
    cursor_ts: int | None,
    direction: str,
    limit: int = 2000,
) -> tuple[list[dict], bool, bool]:
    """Cursor pagination for pan/replay loads (newest-first when cursor is None)."""
    ensure_schema()
    table = resolution_table(resolution)
    limit = max(1, min(int(limit), 2000))
    fid = str(file_id)
    direction = (direction or "backward").lower().strip()

    def _rows_to_bars(rows: list) -> list[dict]:
        out: list[dict] = []
        for ts, o, h, l, c, v in rows:
            if ts is None:
                continue
            t_ms = int(ts.timestamp() * 1000) if hasattr(ts, "timestamp") else int(ts)
            out.append(
                {
                    "t": t_ms,
                    "o": float(o),
                    "h": float(h),
                    "l": float(l),
                    "c": float(c),
                    "v": float(v or 0),
                }
            )
        return out

    if cursor_ts is None:
        sql = f"""
            SELECT ts, o, h, l, c, v
            FROM {table}
            WHERE file_id = %s
            ORDER BY ts DESC
            LIMIT {limit}
        """
        rows = list(reversed(_fetch_all(sql, (fid,))))
        bars = _rows_to_bars(rows)
        has_more_left = len(bars) >= limit
        has_more_right = False
        return bars, has_more_left, has_more_right

    cur = _ms_to_questdb_ts(int(cursor_ts))
    if direction == "forward":
        sql = f"""
            SELECT ts, o, h, l, c, v
            FROM {table}
            WHERE file_id = %s AND ts > %s
            ORDER BY ts ASC
            LIMIT {limit}
        """
        rows = _fetch_all(sql, (fid, cur))
        bars = _rows_to_bars(rows)
        has_more_left = True
        has_more_right = len(bars) >= limit
        return bars, has_more_left, has_more_right

    sql = f"""
        SELECT ts, o, h, l, c, v
        FROM {table}
        WHERE file_id = %s AND ts < %s
        ORDER BY ts DESC
        LIMIT {limit}
    """
    rows = list(reversed(_fetch_all(sql, (fid, cur))))
    bars = _rows_to_bars(rows)
    has_more_left = len(bars) >= limit
    has_more_right = True
    return bars, has_more_left, has_more_right
