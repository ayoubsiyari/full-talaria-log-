"""
FirstRate Data bundle download + FX CSV normalization for the chart pipeline.

Env (set in the host or .env next to api_server.py):
  FIrstrate_USERID   — required for API calls (from your customer download page)
  FIrstrate_API_BASE — optional, default https://firstratedata.com/api/data_file

API reference: https://firstratedata.com/about/api-docs
FX format readme: https://firstratedata.com/_readme/fx.txt
"""
from __future__ import annotations

import csv
import io
import os
from collections.abc import Callable
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

# FirstRate documents FX timestamps in US Eastern (see _readme/fx.txt).
# Stock/ETF/index/futures/options readmes: US Eastern. Crypto often documented as UTC.
_FX_TZ = ZoneInfo("America/New_York")
_UTC_TZ = ZoneInfo("UTC")

_FIrestratE_DEFAULT_BASE = "https://firstratedata.com/api/data_file"
_FIrestratE_TICKER_LISTING = "https://firstratedata.com/api/ticker_listing"

# Parsed row cap (admin JSON); full CSV can be larger.
MAX_TICKER_LISTING_RETURN = 50_000

VALID_PERIODS = frozenset({"full", "month", "week", "day"})
VALID_TIMEFRAMES = frozenset({"1min", "5min", "30min", "1hour", "1day"})
VALID_INSTRUMENT_TYPES = frozenset({"stock", "etf", "futures", "crypto", "index", "fx", "options"})
# Stock/ETF historical data_file requests support `adjustment` (see FirstRate API docs).
VALID_STOCK_ADJUSTMENTS = frozenset({"adj_split", "adj_splitdiv", "UNADJUSTED"})
# Futures historical data_file requests REQUIRE `adjustment` — the three continuous-contract series
# FirstRate publishes (see https://firstratedata.com/about/api-docs and the Futures Adjustment Info Page).
VALID_FUTURES_ADJUSTMENTS = frozenset({"contin_UNadj", "contin_adj_ratio", "contin_adj_absolute"})
# Default adjustment applied when caller omits it for futures (raw unadjusted continuous series).
DEFAULT_FUTURES_ADJUSTMENT = "contin_UNadj"


def get_firstrate_userid() -> str:
    return (os.getenv("FIrstrate_USERID") or os.getenv("FIRSTRATE_USERID") or "").strip()


def _parse_ticker_listing_csv(text: str) -> list[dict[str, str]]:
    """
    FirstRate ticker_listing body: CSV {ticker},{name},{startDate},{endDate}
    Docs: https://firstratedata.com/about/api-docs (ticker listing; supported types vary by subscription)
    """
    raw = (text or "").strip()
    if not raw:
        return []
    head_snip = raw[:800].lower()
    if "<html" in head_snip or "<!doctype" in head_snip:
        raise ValueError(
            "FirstRate returned HTML instead of CSV — check FIrstrate_USERID, subscription, or type parameter."
        )
    buf = io.StringIO(raw)
    reader = csv.reader(buf)
    rows_raw = list(reader)
    if not rows_raw:
        return []
    start_i = 0
    join0 = ",".join(rows_raw[0]).lower()
    if "ticker" in join0 or join0.startswith("symbol"):
        start_i = 1
    out: list[dict[str, str]] = []
    for row in rows_raw[start_i:]:
        if not row:
            continue
        sym = (row[0] or "").strip()
        if not sym or sym.lower() in ("ticker", "symbol"):
            continue
        name = (row[1] or "").strip() if len(row) > 1 else ""
        sd = (row[2] or "").strip() if len(row) > 2 else ""
        ed = (row[3] or "").strip() if len(row) > 3 else ""
        out.append({"ticker": sym, "name": name, "start_date": sd, "end_date": ed})
    return out


def fetch_firstrate_ticker_listing_rows(
    *,
    userid: str,
    instrument_type: str,
    timeout_sec: float = 120,
) -> list[dict[str, str]]:
    """GET ticker_listing from FirstRate; returns parsed rows (may be large)."""
    if not userid:
        raise ValueError("userid is required")
    t = (instrument_type or "").strip().lower()
    if t not in VALID_INSTRUMENT_TYPES:
        raise ValueError(f"type must be one of {sorted(VALID_INSTRUMENT_TYPES)}")
    url = f"{_FIrestratE_TICKER_LISTING}?{urlencode({'type': t, 'userid': userid, 'html': 'false'})}"
    req = Request(url, headers={"User-Agent": "TalariaFirstrateImporter/1.0"})
    try:
        with urlopen(req, timeout=timeout_sec) as resp:
            body = resp.read().decode("utf-8-sig", errors="replace")
    except HTTPError as e:
        tail = e.read().decode("utf-8", errors="replace")[:2500]
        raise ValueError(f"FirstRate HTTP {e.code}: {tail}") from e
    return _parse_ticker_listing_csv(body)


def build_firstrate_data_file_url(
    *,
    userid: str,
    instrument_type: str = "fx",
    period: str = "week",
    timeframe: str = "1min",
    ticker_range: str | None = None,
    adjustment: str | None = None,
) -> str:
    if not userid:
        raise ValueError("userid is required")
    p = (period or "").strip().lower()
    tf = (timeframe or "").strip().lower()
    t = (instrument_type or "").strip().lower()
    if p not in VALID_PERIODS:
        raise ValueError(f"period must be one of {sorted(VALID_PERIODS)}")
    if tf not in VALID_TIMEFRAMES:
        raise ValueError(f"timeframe must be one of {sorted(VALID_TIMEFRAMES)}")
    if t not in VALID_INSTRUMENT_TYPES:
        raise ValueError(f"type must be one of {sorted(VALID_INSTRUMENT_TYPES)}")
    base = (os.getenv("FIrstrate_API_BASE") or _FIrestratE_DEFAULT_BASE).strip().rstrip("/")
    q: dict[str, str] = {
        "type": t,
        "period": p,
        "timeframe": tf,
        "userid": userid,
    }
    # Futures use continuous-contract bundles, not alphabetical letter splits. Ignore any stray
    # letter the caller may have supplied to avoid sending a param FirstRate doesn't accept here.
    if ticker_range and t != "futures":
        tr = ticker_range.strip().upper()
        if len(tr) != 1 or tr not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
            raise ValueError("ticker_range must be a single letter A-Z")
        q["ticker_range"] = tr
    if t in {"stock", "etf"}:
        if adjustment:
            adj = str(adjustment).strip()
            if adj not in VALID_STOCK_ADJUSTMENTS:
                raise ValueError(f"adjustment must be one of {sorted(VALID_STOCK_ADJUSTMENTS)}")
            q["adjustment"] = adj
    elif t == "futures":
        # FirstRate REQUIRES a continuous-adjustment value for futures data_file calls. Without it
        # the vendor returns HTML "no datafile found" regardless of period/timeframe.
        adj = (str(adjustment).strip() if adjustment else DEFAULT_FUTURES_ADJUSTMENT)
        if adj not in VALID_FUTURES_ADJUSTMENTS:
            raise ValueError(
                f"adjustment for futures must be one of {sorted(VALID_FUTURES_ADJUSTMENTS)} "
                f"(see FirstRate API docs — continuous contract stitching)"
            )
        q["adjustment"] = adj
    return f"{base}?{urlencode(q)}"


def download_url_to_file(
    url: str,
    dest: Path,
    *,
    timeout_sec: float = 7200,
    chunk_bytes: int = 1 << 20,
    progress_callback: Callable[[int, int | None], None] | None = None,
) -> int:
    """Stream download to disk. Returns bytes written.

    progress_callback(written_so_far, total_bytes_or_none) — total from Content-Length when present.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = Request(url, headers={"User-Agent": "TalariaFirstrateImporter/1.0"})
    written = 0
    with urlopen(req, timeout=timeout_sec) as resp:
        total: int | None = None
        cl = resp.headers.get("Content-Length")
        if cl:
            try:
                total = int(cl)
            except ValueError:
                total = None
        if progress_callback:
            progress_callback(0, total)
        with open(dest, "wb") as out:
            while True:
                chunk = resp.read(chunk_bytes)
                if not chunk:
                    break
                out.write(chunk)
                written += len(chunk)
                if progress_callback:
                    progress_callback(written, total)
    return written


def _looks_like_yyyymmdd(cell: str) -> bool:
    s = str(cell or "").strip()
    return len(s) == 8 and s.isdigit()


def _looks_like_date_cell(cell: str) -> bool:
    """
    True if the cell is clearly a date (or datetime) that FirstRate might emit in column 0 of a
    headerless file. Used to distinguish headerless stocklike files (`2023-01-03 09:30:00,...`) from
    header rows (`DateTime,Open,High,...`). Accepts both compact FX (`20230103`) and dashed/slashed
    forms with optional time component.
    """
    s = str(cell or "").strip()
    if not s:
        return False
    if _looks_like_yyyymmdd(s):
        return True
    head = s.split(" ", 1)[0]
    # YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD (10 chars) or MM/DD/YYYY, DD.MM.YYYY.
    if len(head) == 10 and head[4] in "-/." and head[7] in "-/.":
        return head[:4].isdigit() and head[5:7].isdigit() and head[8:10].isdigit()
    if len(head) == 10 and head[2] in "/." and head[5] in "/.":
        return head[:2].isdigit() and head[3:5].isdigit() and head[6:10].isdigit()
    return False


def _parse_fixed_cells(row: list[str]) -> tuple[str, str, str, str, str, str, str] | None:
    """First data row when there is no header; FirstRate fx.txt column order."""
    if len(row) < 7:
        return None
    return (row[0], row[1], row[2], row[3], row[4], row[5], row[6])


def _map_header_indices(header: list[str]) -> dict[str, int]:
    lower = [(i, (h or "").strip().lower()) for i, h in enumerate(header)]

    def find_one(*subs: str) -> int | None:
        for i, h in lower:
            for s in subs:
                if s in h:
                    return i
        return None

    return {
        "date": find_one("date"),
        "time": find_one("time"),
        "open": find_one("open"),
        "high": find_one("high"),
        "low": find_one("low"),
        "close": find_one("close"),
        "volume": find_one("volume", "vol"),
    }


def _epoch_ms_from_firstrate_date_time(date_cell: str, time_cell: str) -> int | None:
    return _epoch_ms_from_firstrate_date_time_tz(date_cell, time_cell, _FX_TZ)


def _epoch_ms_from_firstrate_date_time_tz(
    date_cell: str, time_cell: str, tz: ZoneInfo
) -> int | None:
    """Same as FX split date/time parsing but with an explicit timezone."""
    ds = str(date_cell or "").strip()
    ts = str(time_cell or "").strip()
    if not ds:
        return None
    year = month = day = None
    if ds.isdigit() and len(ds) == 8:
        year, month, day = int(ds[0:4]), int(ds[4:6]), int(ds[6:8])
    else:
        for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y", "%d.%m.%Y"):
            try:
                dt_naive = datetime.strptime(ds, fmt)
                year, month, day = dt_naive.year, dt_naive.month, dt_naive.day
                break
            except ValueError:
                continue
    if year is None:
        return None

    hour = minute = second = 0
    if ts:
        ts_norm = ts.replace(",", ".")
        if ":" in ts_norm:
            parts = ts_norm.split(":")
            try:
                hour = int(float(parts[0])) if parts and parts[0] else 0
                minute = int(float(parts[1])) if len(parts) > 1 and parts[1] else 0
                second = int(float(parts[2])) if len(parts) > 2 and parts[2] else 0
            except ValueError:
                return None
        else:
            digits = "".join(ch for ch in ts_norm if ch.isdigit())
            if len(digits) >= 6:
                digits = digits.zfill(6)[-6:]
                hour = int(digits[0:2])
                minute = int(digits[2:4])
                second = int(digits[4:6])

    try:
        dt_loc = datetime(year, month, day, hour, minute, second, tzinfo=tz)
        return int(dt_loc.timestamp() * 1000)
    except ValueError:
        return None


def _epoch_ms_from_combined_datetime(cell: str, tz: ZoneInfo) -> int | None:
    cell = str(cell or "").strip()
    if not cell:
        return None
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y %H:%M",
        "%d.%m.%Y %H:%M:%S",
        "%d.%m.%Y %H:%M",
    ):
        try:
            dt_naive = datetime.strptime(cell, fmt)
            return int(dt_naive.replace(tzinfo=tz).timestamp() * 1000)
        except ValueError:
            continue
    # Date-only rows
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d.%m.%Y"):
        try:
            dt_naive = datetime.strptime(cell, fmt)
            dt_loc = datetime(
                dt_naive.year, dt_naive.month, dt_naive.day, 0, 0, 0, tzinfo=tz
            )
            return int(dt_loc.timestamp() * 1000)
        except ValueError:
            continue
    return None


def _find_col_by_substrings(fieldnames: list[str], *substrs: str) -> str | None:
    for fn in fieldnames:
        low = (fn or "").strip().lower()
        for s in substrs:
            if s in low:
                return fn
    return None


def _find_exact_column(fieldnames: list[str], exact: str) -> str | None:
    el = (exact or "").strip().lower()
    for fn in fieldnames:
        if (fn or "").strip().lower() == el:
            return fn
    return None


def _firstrate_stocklike_row_to_ohlcv(row: list[str], tz: ZoneInfo) -> tuple[int, float, float, float, float, float] | None:
    """
    Parse one positional FirstRate stocklike/futures/crypto row → (t_ms, O, H, L, C, V) or None.

    Accepted shapes (per https://firstratedata.com/about/api-docs):
      6 cols: DateTime, O, H, L, C, V                 — intraday stock/etf/crypto/futures
      7 cols: DateTime, O, H, L, C, V, OpenInterest   — futures 1day (OI ignored — not modeled in the
                                                        canonical OHLCV schema)
      7 cols: Date, Time, O, H, L, C, V               — occasional legacy layout (split date/time)
    DateTime may be `YYYY-MM-DD HH:MM:SS` or date-only `YYYY-MM-DD` (1day bars).
    """
    if not row:
        return None
    cells = [str(x or "").strip() for x in row]
    n = len(cells)
    if n < 6:
        return None
    try:
        # Heuristic: if cell[1] contains a colon, it's a split "Date, Time, O, H, L, C, V" layout.
        if n >= 7 and ":" in cells[1] and any(ch.isdigit() for ch in cells[1]):
            t_ms = _epoch_ms_from_firstrate_date_time_tz(cells[0], cells[1], tz)
            o, h, l, c, v = cells[2], cells[3], cells[4], cells[5], cells[6]
        else:
            # Combined DateTime in cell[0] (optionally with an extra OI column we ignore).
            t_ms = _epoch_ms_from_combined_datetime(cells[0], tz)
            o, h, l, c, v = cells[1], cells[2], cells[3], cells[4], cells[5]
        if t_ms is None:
            return None
        return (t_ms, float(o), float(h), float(l), float(c), float(v or 0))
    except (ValueError, TypeError, IndexError):
        return None


def normalize_firstrate_stocklike_csv_to_standard(src: Path, dest: Path, *, tz: ZoneInfo) -> int:
    """
    Normalize FirstRate stock / etf / crypto / index / futures / options CSV to canonical OHLCV.

    FirstRate ships these bundles as HEADERLESS `.txt` files in CSV format. Each line is either
    `YYYY-MM-DD HH:MM:SS,O,H,L,C,V` (intraday) or `YYYY-MM-DD,O,H,L,C,V[,OpenInterest]` (1day, with
    OI for futures). A small number of files carry a human-friendly header row — we detect that
    by sniffing whether the first cell parses as a date and fall back to DictReader when it does not.
    """
    rows_out = 0
    tmp = dest.with_suffix(dest.suffix + ".tmp")

    with open(src, "r", encoding="utf-8-sig", errors="replace", newline="") as inf:
        reader = csv.reader(inf)
        first = next(reader, None)
        if not first:
            return 0

        # If the very first cell looks like YYYY[-/.]MM[-/.]DD (possibly followed by time), this file
        # has no header line — parse positionally. Otherwise treat the first row as column names.
        use_positional = _looks_like_date_cell(first[0]) if first and first[0] else False

        with open(tmp, "w", encoding="utf-8", newline="") as outf:
            w = csv.writer(outf)
            w.writerow(["timestamp", "open", "high", "low", "close", "volume"])

            if use_positional:
                # Row we already consumed IS real data — parse it, then stream the rest.
                parsed = _firstrate_stocklike_row_to_ohlcv(first, tz)
                if parsed is not None:
                    w.writerow(parsed)
                    rows_out += 1
                for row in reader:
                    if not row or all(str(x).strip() == "" for x in row):
                        continue
                    parsed = _firstrate_stocklike_row_to_ohlcv(row, tz)
                    if parsed is not None:
                        w.writerow(parsed)
                        rows_out += 1
            else:
                # Header-driven path — mirror the original DictReader logic for legacy/headered files.
                fieldnames = [str(x or "").strip() for x in first]
                dt_col_i = None
                for i, fn in enumerate(fieldnames):
                    low = fn.lower()
                    if "datetime" in low or low == "date time":
                        dt_col_i = i
                        break
                if dt_col_i is None:
                    date_col_i = next(
                        (i for i, fn in enumerate(fieldnames) if fn.lower() == "date"), None
                    )
                    time_col_i = next(
                        (i for i, fn in enumerate(fieldnames) if fn.lower() == "time"), None
                    ) if date_col_i is not None else None
                else:
                    date_col_i = None
                    time_col_i = None

                def _idx_sub(*subs: str) -> int | None:
                    for i, fn in enumerate(fieldnames):
                        low = fn.lower()
                        for s in subs:
                            if s in low:
                                return i
                    return None

                open_i = _idx_sub("open")
                high_i = _idx_sub("high")
                low_i = _idx_sub("low")
                close_i = _idx_sub("close", "adj close", "adjclose")
                vol_i = _idx_sub("volume", "vol")
                if None in (open_i, high_i, low_i, close_i):
                    raise ValueError(f"Missing OHLC columns in {src}")

                for row in reader:
                    if not row or all(str(x).strip() == "" for x in row):
                        continue
                    if dt_col_i is not None:
                        t_ms = _epoch_ms_from_combined_datetime(
                            row[dt_col_i] if dt_col_i < len(row) else "", tz
                        )
                    elif date_col_i is not None:
                        dc = row[date_col_i] if date_col_i < len(row) else ""
                        tc = row[time_col_i] if (time_col_i is not None and time_col_i < len(row)) else ""
                        if tc:
                            t_ms = _epoch_ms_from_firstrate_date_time_tz(dc, tc, tz)
                        else:
                            t_ms = _epoch_ms_from_combined_datetime(str(dc).strip(), tz)
                    else:
                        continue
                    if t_ms is None:
                        continue
                    try:
                        o = float(row[open_i] or 0)
                        h = float(row[high_i] or 0)
                        l = float(row[low_i] or 0)
                        c = float(row[close_i] or 0)
                        v = float((row[vol_i] if vol_i is not None and vol_i < len(row) else "") or 0)
                    except (ValueError, TypeError, IndexError):
                        continue
                    w.writerow([t_ms, o, h, l, c, v])
                    rows_out += 1

    tmp.replace(dest)
    return rows_out


def normalize_firstrate_csv_to_standard(src: Path, dest: Path, instrument_type: str) -> int:
    """
    Normalize FirstRate vendor CSV to canonical chart CSV (epoch-ms OHLCV).
    Dispatches by bundle type; see https://firstratedata.com/about/api-docs
    """
    t = (instrument_type or "fx").strip().lower()
    if t == "fx":
        return normalize_firstrate_fx_csv_to_standard(src, dest)
    if t == "crypto":
        return normalize_firstrate_stocklike_csv_to_standard(src, dest, tz=_UTC_TZ)
    if t in ("stock", "etf", "index", "futures", "options"):
        return normalize_firstrate_stocklike_csv_to_standard(src, dest, tz=_FX_TZ)
    return normalize_firstrate_stocklike_csv_to_standard(src, dest, tz=_FX_TZ)


def normalize_firstrate_fx_csv_to_standard(src: Path, dest: Path) -> int:
    """
    Read vendor FX CSV → write canonical rows:
      timestamp,open,high,low,close,volume
    with timestamp = Unix epoch milliseconds (UTC instant).
    """
    rows_out = 0
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    with open(src, "r", encoding="utf-8-sig", errors="replace", newline="") as inf:
        reader = csv.reader(inf)
        first = next(reader, None)
        if not first:
            return 0

        use_header = not _looks_like_yyyymmdd(first[0])
        colmap: dict[str, int] | None = None
        pending_first_data: list[str] | None = None

        if use_header:
            colmap = _map_header_indices(first)
            if colmap.get("open") is None or colmap.get("high") is None:
                raise ValueError(f"Unrecognized FX CSV header in {src}")
        else:
            pending_first_data = list(first)

        with open(tmp, "w", encoding="utf-8", newline="") as outf:
            w = csv.writer(outf)
            w.writerow(["timestamp", "open", "high", "low", "close", "volume"])

            def write_row_cells(date_c: str, time_c: str, o: str, h: str, l: str, c: str, v: str):
                nonlocal rows_out
                t_ms = _epoch_ms_from_firstrate_date_time(date_c, time_c)
                if t_ms is None:
                    return
                try:
                    fo, fh, fl, fc = float(o), float(h), float(l), float(c)
                    fv = float(v or 0)
                except ValueError:
                    return
                w.writerow([t_ms, fo, fh, fl, fc, fv])
                rows_out += 1

            if pending_first_data is not None:
                fixed = _parse_fixed_cells(pending_first_data)
                if fixed:
                    d0, t0, o0, h0, l0, c0, v0 = fixed
                    write_row_cells(d0, t0, o0, h0, l0, c0, v0)

            for row in reader:
                if not row or all(str(x).strip() == "" for x in row):
                    continue
                if colmap is not None:
                    idx_date = colmap.get("date")
                    if idx_date is None:
                        continue
                    idx_time = colmap.get("time")
                    io_open = colmap.get("open")
                    io_high = colmap.get("high")
                    io_low = colmap.get("low")
                    io_close = colmap.get("close")
                    io_vol = colmap.get("volume")
                    if io_open is None or io_high is None or io_low is None or io_close is None:
                        continue
                    date_c = row[idx_date] if idx_date < len(row) else ""
                    time_c = row[idx_time] if idx_time is not None and idx_time < len(row) else ""
                    oo = row[io_open] if io_open < len(row) else ""
                    oh = row[io_high] if io_high < len(row) else ""
                    ol = row[io_low] if io_low < len(row) else ""
                    oc = row[io_close] if io_close < len(row) else ""
                    ov = row[io_vol] if io_vol is not None and io_vol < len(row) else ""
                    write_row_cells(date_c, time_c, oo, oh, ol, oc, ov)
                else:
                    fixed = _parse_fixed_cells(row)
                    if not fixed:
                        continue
                    d0, t0, o0, h0, l0, c0, v0 = fixed
                    write_row_cells(d0, t0, o0, h0, l0, c0, v0)

    tmp.replace(dest)
    return rows_out


def iter_csv_files(root: Path) -> list[Path]:
    """
    Collect CSV-like data files from an extracted FirstRate bundle.
    FirstRate ships CSV-formatted data with `.txt` extensions (e.g. `EURUSD_day_1min.txt`),
    so both `.csv` and `.txt` are accepted. Returns a de-duplicated, sorted list.
    """
    out: list[Path] = []
    seen: set[Path] = set()
    for pattern in ("*.csv", "*.CSV", "*.txt", "*.TXT"):
        for p in sorted(root.rglob(pattern)):
            if p.is_file() and p not in seen:
                out.append(p)
                seen.add(p)
    return out


def extract_zip(zip_path: Path, dest_dir: Path, *, max_depth: int = 4) -> None:
    """
    Extract a FirstRate bundle ZIP, recursively unpacking any inner ZIPs.

    FirstRate ships some bundle types (notably crypto, and certain futures/options archives)
    as a ZIP-of-ZIPs — one inner ZIP per symbol — so a single-level ``extractall`` leaves the
    CSVs hidden inside the inner zips and ``iter_csv_files`` (which only globs ``*.csv`` / ``*.txt``)
    silently finds nothing. FX and stock/ETF bundles are already flat, so they are unaffected
    by this recursion.

    ``max_depth`` bounds the recursion to protect against pathological / malicious nesting (zip
    bombs). In practice FirstRate never nests more than two levels.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(dest_dir)

    # After the top-level extract, walk the tree; for each inner zip, extract it into a
    # sibling subfolder named after its stem, then delete the inner zip so the walker
    # doesn't try to reprocess it on the next pass.
    for _ in range(max_depth):
        inner_zips = [p for p in dest_dir.rglob("*") if p.is_file() and p.suffix.lower() == ".zip"]
        if not inner_zips:
            return
        for inner in inner_zips:
            try:
                if not zipfile.is_zipfile(inner):
                    # Sometimes FirstRate ships a `.zip`-named readme or other non-zip artifact;
                    # skip those so we don't raise for the whole bundle.
                    continue
                sub_dest = inner.parent / inner.stem
                sub_dest.mkdir(parents=True, exist_ok=True)
                with zipfile.ZipFile(inner, "r") as zf2:
                    zf2.extractall(sub_dest)
            except Exception:
                # Ignore individual inner-zip failures — the surrounding normalize/ticker filter
                # step will surface any resulting empty-dataset condition to the user.
                continue
            finally:
                try:
                    inner.unlink(missing_ok=True)
                except Exception:
                    pass


@dataclass
class FirstrateDownloadResult:
    url: str
    zip_path: Path
    bytes_written: int


def download_firstrate_bundle(
    *,
    userid: str,
    period: str,
    timeframe: str,
    instrument_type: str = "fx",
    ticker_range: str | None = None,
    adjustment: str | None = None,
    dest_zip: Path,
    timeout_sec: float = 7200,
    progress_callback: Callable[[int, int | None], None] | None = None,
) -> FirstrateDownloadResult:
    url = build_firstrate_data_file_url(
        userid=userid,
        instrument_type=instrument_type,
        period=period,
        timeframe=timeframe,
        ticker_range=ticker_range,
        adjustment=adjustment,
    )
    n = download_url_to_file(url, dest_zip, timeout_sec=timeout_sec, progress_callback=progress_callback)
    if n < 64:
        sniff = dest_zip.read_bytes()[:400] if dest_zip.exists() else b""
        txt = sniff.decode("utf-8", errors="replace").replace("\n", " ").strip()
        hint = (" Server said: " + txt[:280]) if txt else " Empty response."
        raise ValueError(
            "Download too small (< 64 bytes) — not a ZIP from FirstRate. "
            "Check FIrstrate_USERID, bundle subscription, and URL parameters "
            "(e.g. stock/etf often need `adjustment`; `period=full` often needs `ticker_range=A`–`Z`)."
            + hint
        )
    if not zipfile.is_zipfile(dest_zip):
        head = dest_zip.read_bytes()[:200]
        text_head = head.decode("utf-8", errors="replace")
        raise ValueError(
            "Download is not a zip archive. First bytes (possible HTML error page): "
            + text_head[:180].replace("\n", " ")
        )
    return FirstrateDownloadResult(url=url, zip_path=dest_zip, bytes_written=n)


def firstrate_jobs_dir(uploads_root: Path) -> Path:
    d = uploads_root / "firstrate_jobs"
    d.mkdir(parents=True, exist_ok=True)
    return d
