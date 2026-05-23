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

from bar_budget import RESOLUTION_TO_TABLE, normalize_resolution, resolution_table

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

_MINUTES_PER_RES: dict[str, int] = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "1h": 60,
    "4h": 240,
    "1d": 1440,
    "1w": 10080,
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
        connect_timeout=int(os.getenv("QUESTDB_PG_CONNECT_TIMEOUT", "15")),
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


def preagg_is_incomplete(file_id: int, resolution: str) -> bool:
    """True when stored aggregate rows are far below what ohlcv_1m implies."""
    res = normalize_resolution(resolution)
    if res == "1m":
        return False
    table = resolution_table(res)
    n1m = count_bars(file_id, "ohlcv_1m")
    nagg = count_bars(file_id, table)
    if n1m <= 0:
        return nagg <= 0
    mins = _MINUTES_PER_RES.get(res, 1)
    expected_floor = max(10, n1m // (mins * 10))
    return nagg < expected_floor


def dataset_stats(file_id: int) -> dict[str, Any]:
    """Row counts per table + whether pre-aggregates look incomplete."""
    ensure_schema()
    stats: dict[str, Any] = {"file_id": file_id, "tables": {}, "preagg_incomplete": {}}
    for table in OHLCV_TABLES:
        n = count_bars(file_id, table)
        stats["tables"][table] = n
    for tf in ("5m", "15m", "1h", "4h", "1d", "1w"):
        stats["preagg_incomplete"][tf] = preagg_is_incomplete(file_id, tf)
    stats["read_path"] = {
        tf: ("ohlcv_1m_sample" if preagg_is_incomplete(file_id, tf) else resolution_table(tf))
        for tf in ("1m", "5m", "15m", "1h", "4h", "1d", "1w")
    }
    return stats


def _sample_for_resolution(resolution: str) -> str | None:
    table = resolution_table(normalize_resolution(resolution))
    return AGG_SAMPLE_BY.get(table)


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


def _wait_1m_ingest_visible(file_id: int, expected: int, timeout: float = 180.0) -> None:
    """Poll until ILP-written 1m rows are visible via PG (aggregate rebuild needs this)."""
    if expected <= 0:
        return
    deadline = time.monotonic() + timeout
    target = max(1, int(expected * 0.995))
    last_log = 0.0
    while time.monotonic() < deadline:
        visible = count_bars(file_id, "ohlcv_1m")
        if visible >= target:
            print(f"  ✅ QuestDB visible: {visible:,} / {expected:,} rows", flush=True)
            time.sleep(0.25)
            return
        now = time.monotonic()
        if now - last_log >= 15.0:
            print(f"  … waiting for ILP flush: {visible:,} / {target:,} visible", flush=True)
            last_log = now
        time.sleep(0.5)
    visible = count_bars(file_id, "ohlcv_1m")
    print(f"  ⚠️ ILP flush timeout: {visible:,} / {target:,} visible after {int(timeout)}s", flush=True)


def insert_1m_bars(file_id: int, candles: list[dict], batch_size: int = 5000) -> int:
    """Bulk insert 1m candles via ILP. Returns rows sent."""
    ensure_schema()
    if not candles:
        return 0
    fid = _safe_file_id(file_id)
    sent = 0
    buf: list[str] = []
    batches = 0
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
            batches += 1
            if batches % 20 == 0:
                print(f"  … ILP sent {sent:,} rows to QuestDB", flush=True)
            buf = []
    if buf:
        _ilp_send(buf)
        sent += len(buf)
    print(f"  ✅ ILP complete: {sent:,} rows sent", flush=True)
    return sent


def _rebuild_aggregate_table_for_file(table: str, sample: str, fid: str) -> None:
    """Replace one file_id's aggregate rows via INSERT … SAMPLE BY (not CREATE TABLE AS UNION)."""
    file_id = int(fid)
    n = count_bars(file_id, table)
    if n > 0:
        total = _table_row_count(table)
        if n >= total:
            _drop_and_recreate_table(table)
        else:
            _replace_table_excluding_file(table, fid)
    _exec_sql(
        f"""
        INSERT INTO {table}
        SELECT file_id, ts, first(o), max(h), min(l), last(c), sum(v)
        FROM ohlcv_1m
        WHERE file_id = '{fid}'
        SAMPLE BY {sample} ALIGN TO CALENDAR
        """
    )


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


def _ingest_wait_timeout(expected: int) -> float:
    if expected >= 2_000_000:
        return 900.0
    if expected >= 500_000:
        return 600.0
    if expected >= 50_000:
        return 300.0
    return 180.0


def _should_rebuild_aggregates(explicit: bool | None) -> bool:
    if explicit is not None:
        return explicit
    return os.getenv("QUESTDB_REBUILD_AGGREGATES", "false").lower() in ("1", "true", "yes")


def sync_file_candles(
    file_id: int,
    candles: list[dict],
    *,
    rebuild_agg: bool | None = None,
) -> dict[str, Any]:
    """Full replace: delete existing rows, insert 1m; optional aggregate rebuild."""
    do_rebuild = _should_rebuild_aggregates(rebuild_agg)
    delete_file_data(file_id)
    inserted = insert_1m_bars(file_id, candles)
    _wait_1m_ingest_visible(
        file_id,
        len(candles),
        timeout=_ingest_wait_timeout(len(candles)),
    )
    visible = count_bars(file_id, "ohlcv_1m")
    agg: dict[str, int] = {}
    if do_rebuild:
        agg = rebuild_aggregates(file_id)
    return {
        "inserted_1m": inserted,
        "visible_1m": visible,
        "aggregates": agg,
        "rebuild_aggregates": do_rebuild,
    }


def append_1m_bars(
    file_id: int,
    candles: list[dict],
    *,
    rebuild_agg: bool | None = None,
) -> dict[str, Any]:
    """Append new 1m rows; optional aggregate rebuild."""
    if not candles:
        return {"appended": 0}
    do_rebuild = _should_rebuild_aggregates(rebuild_agg)
    appended = insert_1m_bars(file_id, candles)
    expected = count_bars(file_id, "ohlcv_1m")
    _wait_1m_ingest_visible(file_id, expected, timeout=_ingest_wait_timeout(expected))
    agg: dict[str, int] = {}
    if do_rebuild:
        agg = rebuild_aggregates(file_id)
    return {"appended": appended, "visible_1m": count_bars(file_id, "ohlcv_1m"), "aggregates": agg}


def _ms_to_questdb_ts(ms: int) -> str:
    dt = datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _query_bars_from_table(
    file_id: int,
    table: str,
    from_ms: int | None,
    to_ms: int | None,
    limit: int,
) -> list[dict]:
    fid = _safe_file_id(file_id)
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
    return _rows_to_bars(_fetch_all(sql, tuple(params)))


def _query_bars_via_1m_sample(
    file_id: int,
    sample: str,
    from_ms: int | None,
    to_ms: int | None,
    limit: int,
    *,
    order: str = "ASC",
) -> list[dict]:
    """Runtime SAMPLE BY on ohlcv_1m — correct even when pre-agg tables are stale."""
    fid = _safe_file_id(file_id)
    clauses = ["file_id = %s"]
    params: list[Any] = [fid]
    if from_ms is not None:
        clauses.append("ts >= %s")
        params.append(_ms_to_questdb_ts(int(from_ms)))
    if to_ms is not None:
        clauses.append("ts <= %s")
        params.append(_ms_to_questdb_ts(int(to_ms)))
    where = " AND ".join(clauses)
    order_sql = "DESC" if order.upper() == "DESC" else "ASC"
    sql = f"""
        SELECT ts, first(o), max(h), min(l), last(c), sum(v)
        FROM ohlcv_1m
        WHERE {where}
        SAMPLE BY {sample} ALIGN TO CALENDAR
        ORDER BY ts {order_sql}
        LIMIT {limit}
    """
    rows = _fetch_all(sql, tuple(params))
    if order_sql == "DESC":
        rows = list(reversed(rows))
    return _rows_to_bars(rows)


def query_bars(
    file_id: int,
    resolution: str,
    from_ms: int | None,
    to_ms: int | None,
    limit: int = 2000,
) -> list[dict]:
    """Bounded range query against QuestDB."""
    ensure_schema()
    res = normalize_resolution(resolution)
    limit = max(1, min(int(limit), 2000))

    if res == "1m":
        return _query_bars_from_table(file_id, "ohlcv_1m", from_ms, to_ms, limit)

    sample = _sample_for_resolution(res)
    if not sample:
        table = resolution_table(res)
        return _query_bars_from_table(file_id, table, from_ms, to_ms, limit)

    if preagg_is_incomplete(file_id, res):
        return _query_bars_via_1m_sample(file_id, sample, from_ms, to_ms, limit)

    table = resolution_table(res)
    bars = _query_bars_from_table(file_id, table, from_ms, to_ms, limit)
    if bars:
        return bars
    return _query_bars_via_1m_sample(file_id, sample, from_ms, to_ms, limit)


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
    res = normalize_resolution(resolution)
    limit = max(1, min(int(limit), 2000))
    fid = _safe_file_id(file_id)
    direction = (direction or "backward").lower().strip()
    sample = _sample_for_resolution(res)
    use_sample = res != "1m" and sample and preagg_is_incomplete(file_id, res)

    if use_sample and sample:
        return _query_bars_cursor_via_1m_sample(
            file_id, sample, cursor_ts=cursor_ts, direction=direction, limit=limit
        )

    table = resolution_table(res)

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


def _query_bars_cursor_via_1m_sample(
    file_id: int,
    sample: str,
    *,
    cursor_ts: int | None,
    direction: str,
    limit: int,
) -> tuple[list[dict], bool, bool]:
    fid = _safe_file_id(file_id)
    direction = (direction or "backward").lower().strip()

    if cursor_ts is None:
        bars = _query_bars_via_1m_sample(
            file_id, sample, None, None, limit, order="DESC"
        )
        has_more_left = len(bars) >= limit
        return bars, has_more_left, False

    cur = _ms_to_questdb_ts(int(cursor_ts))
    if direction == "forward":
        clauses = ["file_id = %s", "ts > %s"]
        params: list[Any] = [fid, cur]
        where = " AND ".join(clauses)
        sql = f"""
            SELECT ts, first(o), max(h), min(l), last(c), sum(v)
            FROM ohlcv_1m
            WHERE {where}
            SAMPLE BY {sample} ALIGN TO CALENDAR
            ORDER BY ts ASC
            LIMIT {limit}
        """
        bars = _rows_to_bars(_fetch_all(sql, tuple(params)))
        return bars, True, len(bars) >= limit

    clauses = ["file_id = %s", "ts < %s"]
    params = [fid, cur]
    where = " AND ".join(clauses)
    sql = f"""
        SELECT ts, first(o), max(h), min(l), last(c), sum(v)
        FROM ohlcv_1m
        WHERE {where}
        SAMPLE BY {sample} ALIGN TO CALENDAR
        ORDER BY ts DESC
        LIMIT {limit}
    """
    rows = list(reversed(_fetch_all(sql, tuple(params))))
    bars = _rows_to_bars(rows)
    return bars, len(bars) >= limit, True
