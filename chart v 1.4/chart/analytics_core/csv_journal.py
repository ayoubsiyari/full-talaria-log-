"""Parse CSV files into chart `journal` trade dicts (camelCase fields)."""

from __future__ import annotations

import csv
import io
import math
import re
from datetime import datetime, timezone
from typing import Any

_MAX_ROWS = 2000
def _strip_bom(s: str) -> str:
    if s.startswith("\ufeff"):
        return s[1:]
    return s


def _norm_header(h: str) -> str:
    return re.sub(r"[\s\-]+", "_", (h or "").strip().lower())


def _cell_to_epoch_ms(cell: str) -> float | None:
    s = (cell or "").strip()
    if not s:
        return None
    try:
        v = float(s)
        if not math.isfinite(v):
            return None
        if v > 1e15:
            return None
        if v > 1e12:
            return v
        if v > 1e9:
            return v * 1000.0
        if v > 1e5:
            return v * 1000.0
    except ValueError:
        pass
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp() * 1000.0
    except ValueError:
        return None


def _cell_to_float(cell: str) -> float | None:
    s = (cell or "").strip()
    if not s:
        return None
    try:
        v = float(s)
        return v if math.isfinite(v) else None
    except ValueError:
        return None


def _pick(row: dict[str, str], *keys: str) -> str:
    nk = {_norm_header(k): v for k, v in row.items()}
    for k in keys:
        key = _norm_header(k)
        if key in nk and str(nk[key]).strip() != "":
            return str(nk[key]).strip()
    return ""


def parse_trades_csv_text(text: str, *, max_rows: int = _MAX_ROWS) -> dict[str, Any]:
    """
    Parse CSV with header row into journal-compatible trade dicts.

    Required (any alias): net PnL column, close time column.
    Aliases are matched case-insensitively with spaces/dashes as underscores.

    Close / open time: ISO-8601 string, or Unix seconds, or Unix milliseconds.
    """
    errors: list[str] = []
    warnings: list[str] = []
    raw = _strip_bom(text or "")
    if not raw.strip():
        return {"trades": [], "errors": ["CSV is empty"], "warnings": []}

    reader = csv.DictReader(io.StringIO(raw))
    if not reader.fieldnames:
        return {"trades": [], "errors": ["Missing header row"], "warnings": []}

    out: list[dict[str, Any]] = []

    for i, row in enumerate(reader, start=2):
        if i - 2 >= max_rows:
            warnings.append(f"Truncated at {max_rows} rows (limit).")
            break
        if not any((v or "").strip() for v in row.values()):
            continue

        pnl_s = _pick(row, "netPnL", "net_pnl", "pnl", "profit", "net_profit")
        close_s = _pick(row, "closeTime", "close_time", "exitTime", "exit_time", "close_ts", "exit_ts")

        if not pnl_s:
            errors.append(f"Row {i}: missing net PnL (netPnL / pnl / …)")
            continue
        pnl = _cell_to_float(pnl_s)
        if pnl is None:
            errors.append(f"Row {i}: invalid net PnL {pnl_s!r}")
            continue

        close_ms = _cell_to_epoch_ms(close_s) if close_s else None
        if close_ms is None:
            errors.append(f"Row {i}: missing or invalid close time (closeTime / exitTime / ISO)")
            continue

        open_s = _pick(row, "openTime", "open_time", "entryTime", "entry_time", "open_ts")
        open_ms = _cell_to_epoch_ms(open_s) if open_s else None
        if open_ms is None:
            open_ms = close_ms - 4 * 3600 * 1000
            if open_ms <= 0:
                open_ms = close_ms - 3600 * 1000

        tid = _pick(row, "tradeId", "trade_id", "id") or f"csv-{i-2}"
        ticker = (_pick(row, "ticker", "symbol", "instrument") or "EURUSD").replace("/", "").upper()
        direction = (_pick(row, "direction", "side", "type") or "BUY").upper()
        setup = _pick(row, "setup", "playbook", "strategy") or "CSV"

        r_m = _cell_to_float(_pick(row, "rMultiple", "r_multiple", "r", "rr"))
        mae = _cell_to_float(_pick(row, "mae_r", "mae", "mae_R"))
        mfe = _cell_to_float(_pick(row, "mfe_r", "mfe", "mfe_R"))
        qty = _cell_to_float(_pick(row, "quantity", "qty", "size")) or 1.0
        risk = _cell_to_float(_pick(row, "riskAmount", "risk_amount", "risk_usd", "risk"))
        spread = _cell_to_float(_pick(row, "spread_pips_at_entry", "spread_pips", "spread")) or 1.0
        comm = _cell_to_float(_pick(row, "commission_at_entry", "commission", "commission_per_lot")) or 2.0
        pipv = _cell_to_float(_pick(row, "pip_value_at_entry", "pip_value", "pipValue")) or 10.0

        if r_m is None:
            r_m = 0.0
        if mae is None:
            mae = min(0.0, -0.1 if pnl < 0 else -0.05)
        if mfe is None:
            mfe = max(0.0, 0.1 if pnl > 0 else 0.05)
        if risk is None or risk <= 0:
            risk = max(50.0, abs(pnl) * 2 if abs(pnl) > 1e-6 else 100.0)

        trade: dict[str, Any] = {
            "tradeId": str(tid),
            "ticker": ticker,
            "direction": direction if direction in {"BUY", "SELL", "LONG", "SHORT"} else "BUY",
            "netPnL": float(pnl),
            "openTime": float(open_ms),
            "closeTime": float(close_ms),
            "rMultiple": float(r_m),
            "mae_r": float(mae),
            "mfe_r": float(mfe),
            "quantity": float(qty),
            "riskAmount": float(risk),
            "spread_pips_at_entry": float(spread),
            "commission_at_entry": float(comm),
            "pip_value_at_entry": float(pipv),
            "setup": setup,
            "preTradeNotes": {"setup": setup},
        }
        out.append(trade)

    if not out and not errors:
        errors.append("No data rows after header.")

    return {"trades": out, "errors": errors, "warnings": warnings}


def parse_trades_csv_bytes(data: bytes, *, max_rows: int = _MAX_ROWS) -> dict[str, Any]:
    if len(data) > 12 * 1024 * 1024:
        return {"trades": [], "errors": ["CSV file too large (max 12 MB)"], "warnings": []}
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("utf-8", errors="replace")
        out = parse_trades_csv_text(text, max_rows=max_rows)
        w = list(out.get("warnings") or [])
        w.append("Non-UTF8 bytes replaced (invalid UTF-8).")
        return {**out, "warnings": w}
    return parse_trades_csv_text(text, max_rows=max_rows)
