"""Parse CSV files into chart `journal` trade dicts (camelCase fields)."""

from __future__ import annotations

import csv
import io
import json
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


def _pick_float(row: dict[str, str], *keys: str) -> float | None:
    raw = _pick(row, *keys)
    return _cell_to_float(raw) if raw else None


def _row_cell(row: dict[str, str], column: str) -> str:
    """Read a CSV cell by exact or normalized header name."""
    if not column:
        return ""
    for k, v in row.items():
        if k == column or _norm_header(k) == _norm_header(column):
            return str(v).strip() if v is not None else ""
    return ""


def _pick_field(
    row: dict[str, str],
    field: str,
    mapping: dict[str, str] | None,
    *aliases: str,
) -> str:
    if mapping:
        mapped = mapping.get(field)
        if mapped:
            return _row_cell(row, mapped)
    return _pick(row, *aliases)


def _pick_float_field(
    row: dict[str, str],
    field: str,
    mapping: dict[str, str] | None,
    *aliases: str,
) -> float | None:
    raw = _pick_field(row, field, mapping, *aliases)
    return _cell_to_float(raw) if raw else None


# Dashboard CSV export column aliases (TalariaV16 exportDashboardTradesCsv round-trip).
_PNL_ALIASES = (
    "netPnL",
    "net_pnl",
    "pnl_currency_net",
    "pnl_dollars_net",
    "realizedPnL",
    "realized_pnl",
    "pnl",
    "profit",
    "net_profit",
)
_R_ALIASES = (
    "rMultiple",
    "r_multiple",
    "actual_rr_net",
    "actualRR",
    "actual_rr",
    "rr",
    "r",
)
_PLANNED_RR_ALIASES = (
    "plannedRR",
    "planned_rr",
    "plannedRRAtEntry",
    "planned_rr_at_entry",
    "rewardToRiskRatio",
    "actualRisk",
)
_CLOSE_TIME_ALIASES = (
    "closeTime",
    "close_time",
    "exitTime",
    "exit_time",
    "close_ts",
    "exit_ts",
    "exitDate",
    "exit_date",
)
_OPEN_TIME_ALIASES = (
    "openTime",
    "open_time",
    "entryTime",
    "entry_time",
    "entryDate",
    "entry_date",
    "open_ts",
    "entry_ts",
    "date",
)
_TRADE_ID_ALIASES = (
    "tradeId",
    "trade_id",
    "journal_trade_id",
    "client_trade_id",
    "id",
    "n",
)
_TICKER_ALIASES = ("ticker", "symbol", "instrument", "pair", "asset")
_DIRECTION_ALIASES = ("direction", "side", "type", "position", "buy/sell")
_SETUP_ALIASES = ("setup", "playbook", "strategy", "strategyName", "strategy_label")
_QUANTITY_ALIASES = ("quantity", "qty", "position_size", "positionSize", "size", "lots", "volume")
_RISK_ALIASES = ("riskAmount", "risk_amount", "risk_usd", "risk", "riskPerTrade", "originalRisk", "planned_risk_amount")
_MAE_ALIASES = ("mae_r", "mae_R", "total_mae_r", "totalMaeR", "mae")
_MFE_ALIASES = ("mfe_r", "mfe_R", "total_mfe_r", "totalMfeR", "mfe")
_MAE_POINTS_ALIASES = ("mae_points", "maePoints", "mae_price", "mae_pips", "mae_dollars", "mae_pts", "total_mae")
_MFE_POINTS_ALIASES = ("mfe_points", "mfePoints", "mfe_price", "mfe_pips", "mfe_dollars", "mfe_pts", "total_mfe")
_HIGHEST_PRICE_ALIASES = ("highestPrice", "highest_price", "high_price", "high_during_trade")
_LOWEST_PRICE_ALIASES = ("lowestPrice", "lowest_price", "low_price", "low_during_trade")
_COMMISSION_ALIASES = ("commission_at_entry", "commission", "commission_per_lot", "commission_total", "commissionCost")
_SPREAD_ALIASES = ("spread_pips_at_entry", "spread_pips", "spread")
_PIP_VALUE_ALIASES = ("pip_value_at_entry", "pip_value", "pipValue")
_STATUS_ALIASES = ("status", "tradeStatus", "state")
_ENTRY_PRICE_ALIASES = ("entryPrice", "entry", "openPrice", "open_price", "array_base_price")
_EXIT_PRICE_ALIASES = ("exitPrice", "exit", "closePrice", "close_price")
_STOP_ALIASES = ("stopLoss", "planned_sl", "sl", "initial_sl", "stop_loss")
_TARGET_ALIASES = ("takeProfit", "target", "targetPrice", "tp", "initial_takeProfit")
_CLOSE_TYPE_ALIASES = ("closeType", "exit_reason", "reason", "hitType")
_DURATION_ALIASES = ("duration", "durationMinutes", "timeHeldMinutes")

# Fields exposed in the import mapper UI (key -> alias tuple used for auto-detect).
MAPPABLE_FIELDS: dict[str, tuple[str, ...]] = {
    "netPnL": _PNL_ALIASES,
    "closeTime": _CLOSE_TIME_ALIASES,
    "openTime": _OPEN_TIME_ALIASES,
    "tradeId": _TRADE_ID_ALIASES,
    "ticker": _TICKER_ALIASES,
    "direction": _DIRECTION_ALIASES,
    "setup": _SETUP_ALIASES,
    "rMultiple": _R_ALIASES,
    "quantity": _QUANTITY_ALIASES,
    "riskAmount": _RISK_ALIASES,
    "mae_r": _MAE_ALIASES,
    "mfe_r": _MFE_ALIASES,
    "mae_points": _MAE_POINTS_ALIASES,
    "mfe_points": _MFE_POINTS_ALIASES,
    "highestPrice": _HIGHEST_PRICE_ALIASES,
    "lowestPrice": _LOWEST_PRICE_ALIASES,
    "plannedRR": _PLANNED_RR_ALIASES,
    "entryPrice": _ENTRY_PRICE_ALIASES,
    "exitPrice": _EXIT_PRICE_ALIASES,
    "stopLoss": _STOP_ALIASES,
    "takeProfit": _TARGET_ALIASES,
    "commission_at_entry": _COMMISSION_ALIASES,
    "spread_pips_at_entry": _SPREAD_ALIASES,
    "pip_value_at_entry": _PIP_VALUE_ALIASES,
    "closeType": _CLOSE_TYPE_ALIASES,
    "durationMinutes": _DURATION_ALIASES,
    "status": _STATUS_ALIASES,
}

_FIELD_LABELS: dict[str, str] = {
    "netPnL": "Net profit / loss",
    "closeTime": "Close / exit time",
    "openTime": "Open / entry time",
    "tradeId": "Trade ID",
    "ticker": "Symbol / ticker",
    "direction": "Direction (long/short)",
    "setup": "Strategy / setup",
    "rMultiple": "R-multiple",
    "quantity": "Position size",
    "riskAmount": "Risk amount ($)",
    "mae_r": "MAE (R-multiple)",
    "mfe_r": "MFE (R-multiple)",
    "mae_points": "MAE (price / points / pips)",
    "mfe_points": "MFE (price / points / pips)",
    "highestPrice": "Highest price during trade",
    "lowestPrice": "Lowest price during trade",
    "plannedRR": "Planned R:R",
    "entryPrice": "Entry price",
    "exitPrice": "Exit price",
    "stopLoss": "Stop loss",
    "takeProfit": "Take profit",
    "commission_at_entry": "Commission",
    "spread_pips_at_entry": "Spread (pips)",
    "pip_value_at_entry": "Pip value",
    "closeType": "Close type / reason",
    "durationMinutes": "Duration (minutes)",
    "status": "Status (open/closed)",
}

_REQUIRED_IMPORT_FIELDS = frozenset({"netPnL", "closeTime"})


def import_field_catalog() -> list[dict[str, Any]]:
    """Metadata for the CSV column-mapping UI."""
    return [
        {
            "key": key,
            "label": _FIELD_LABELS.get(key, key),
            "required": key in _REQUIRED_IMPORT_FIELDS,
        }
        for key in MAPPABLE_FIELDS
    ]


def suggest_column_mapping(headers: list[str]) -> dict[str, str | None]:
    """Best-effort auto-map from CSV headers to internal trade fields."""
    by_norm = {_norm_header(h): h for h in headers if h}
    out: dict[str, str | None] = {key: None for key in MAPPABLE_FIELDS}
    used: set[str] = set()
    for field, aliases in MAPPABLE_FIELDS.items():
        for alias in aliases:
            norm = _norm_header(alias)
            header = by_norm.get(norm)
            if header and header not in used:
                out[field] = header
                used.add(header)
                break
    return out


def _detect_csv_dialect(text: str) -> csv.Dialect:
    sample = (text or "")[:8192]
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        return csv.excel


def _csv_dict_reader(text: str, dialect: csv.Dialect | None = None) -> csv.DictReader:
    raw = _strip_bom(text or "")
    if dialect is None:
        dialect = _detect_csv_dialect(raw)
    return csv.DictReader(io.StringIO(raw), dialect=dialect)


def preview_trades_csv_text(text: str, *, max_sample_rows: int = 5) -> dict[str, Any]:
    """
    Inspect a CSV for the column-mapping step: headers, sample rows, suggested mapping.
    Does not import trades.
    """
    raw = _strip_bom(text or "")
    if not raw.strip():
        return {"headers": [], "sample_rows": [], "suggested_mapping": {}, "fields": import_field_catalog(), "errors": ["CSV is empty"]}

    dialect = _detect_csv_dialect(raw)
    reader = _csv_dict_reader(raw, dialect)
    headers = [h for h in (reader.fieldnames or []) if h]
    if not headers:
        return {"headers": [], "sample_rows": [], "suggested_mapping": {}, "fields": import_field_catalog(), "errors": ["Missing header row"]}

    sample_rows: list[dict[str, str]] = []
    row_estimate = 0
    for row in reader:
        if not any((v or "").strip() for v in row.values()):
            continue
        row_estimate += 1
        if len(sample_rows) < max_sample_rows:
            sample_rows.append({k: str(v) if v is not None else "" for k, v in row.items()})

    suggested = suggest_column_mapping(headers)
    missing_required = [f for f in _REQUIRED_IMPORT_FIELDS if not suggested.get(f)]

    return {
        "headers": headers,
        "sample_rows": sample_rows,
        "suggested_mapping": suggested,
        "fields": import_field_catalog(),
        "delimiter": getattr(dialect, "delimiter", ","),
        "row_count_estimate": row_estimate,
        "missing_required": list(missing_required),
        "errors": [],
    }


def preview_trades_csv_bytes(data: bytes, *, max_sample_rows: int = 5) -> dict[str, Any]:
    if len(data) > 12 * 1024 * 1024:
        return {"headers": [], "sample_rows": [], "suggested_mapping": {}, "fields": import_field_catalog(), "errors": ["CSV file too large (max 12 MB)"]}
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("utf-8", errors="replace")
        out = preview_trades_csv_text(text, max_sample_rows=max_sample_rows)
        w = list(out.get("warnings") or [])
        w.append("Non-UTF8 bytes replaced (invalid UTF-8).")
        return {**out, "warnings": w}
    return preview_trades_csv_text(text, max_sample_rows=max_sample_rows)


_PASSTHROUGH_SCALAR_KEYS = (
    "entryPrice",
    "entry",
    "openPrice",
    "exitPrice",
    "exit",
    "closePrice",
    "stopLoss",
    "sl",
    "planned_sl",
    "takeProfit",
    "tp",
    "target",
    "targetPrice",
    "closeType",
    "exit_reason",
    "reason",
    "hitType",
    "duration",
    "durationMinutes",
    "timeHeldMinutes",
    "strategyName",
    "strategy",
    "setup_tag",
    "sourceSessionName",
    "sessionName",
    "sourceName",
    "status",
    "tradeStatus",
    "state",
    "orderType",
    "order_type",
    "position_size",
    "positionSize",
    "size",
    "originalRisk",
    "planned_risk_amount",
    "riskPerTrade",
    "plannedRisk",
    "riskPct",
    "risk_pct",
    "commission_total",
    "commissionCost",
    "spread",
    "slippage",
    "cost_friction_total",
    "mfe",
    "mae",
    "total_mfe_r",
    "total_mae_r",
    "highestPrice",
    "lowestPrice",
    "array_base_price",
    "open_price",
    "close_price",
    "initial_takeProfit",
    "initial_sl",
    "stop_loss",
)
_JSON_COLLECTION_KEYS = (
    "entries",
    "entryRows",
    "fills",
    "targets",
    "planned_targets",
    "targetRows",
    "takeProfits",
    "exits",
    "partial_exits",
    "exitRows",
    "partialCloses",
    "actual_exits",
)


def _normalize_price_row(row: Any) -> dict[str, Any]:
    if isinstance(row, (int, float)) and math.isfinite(float(row)):
        return {"price": float(row)}
    if not isinstance(row, dict):
        return {}
    out = dict(row)
    price = _trade_float(
        out,
        "price",
        "entryPrice",
        "openPrice",
        "fillPrice",
        "array_base_price",
        "open_price",
        "exitPrice",
        "closePrice",
        "close_price",
        "takeProfit",
        "targetPrice",
        "target",
        "tp",
        "value",
    )
    if price is not None:
        out["price"] = price
    qty = _trade_float(out, "qty", "quantity", "size", "lots", "contracts", "positionSize", "position_size")
    if qty is not None and qty > 0:
        out["qty"] = qty
        out["quantity"] = qty
    return out if price is not None or qty is not None else {}


def _normalize_price_rows(rows: Any) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    normalized = [_normalize_price_row(row) for row in rows]
    return [row for row in normalized if row]


def _parse_json_cell(raw: str) -> Any:
    s = (raw or "").strip()
    if not s or s[0] not in "[{":
        return None
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        return None


def _trade_float(trade: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        val = trade.get(key)
        if val is None or val == "":
            continue
        try:
            num = float(val)
            if math.isfinite(num):
                return num
        except (TypeError, ValueError):
            continue
    return None


def _build_price_row(price: float, qty: float | None) -> dict[str, Any]:
    row: dict[str, Any] = {"price": price}
    if qty is not None and qty > 0:
        row["qty"] = qty
        row["quantity"] = qty
    return row


def _sync_trade_price_aliases(trade: dict[str, Any]) -> None:
    entry = _trade_float(
        trade,
        "entryPrice",
        "entry",
        "openPrice",
        "array_base_price",
        "open_price",
    )
    exit_px = _trade_float(trade, "exitPrice", "exit", "closePrice", "close_price")
    stop = _trade_float(trade, "stopLoss", "planned_sl", "sl", "initial_sl", "stop_loss")
    target = _trade_float(
        trade,
        "takeProfit",
        "target",
        "targetPrice",
        "tp",
        "initial_takeProfit",
    )
    qty = _trade_float(trade, "quantity", "position_size", "positionSize", "size")

    if entry is not None:
        trade["entryPrice"] = entry
        trade["entry"] = entry
        trade["openPrice"] = entry
        trade["array_base_price"] = entry
    if exit_px is not None:
        trade["exitPrice"] = exit_px
        trade["exit"] = exit_px
        trade["closePrice"] = exit_px
    if stop is not None:
        trade["stopLoss"] = stop
        trade["planned_sl"] = stop
        trade["sl"] = stop
        trade["initial_sl"] = stop
    if target is not None:
        trade["takeProfit"] = target
        trade["target"] = target
        trade["targetPrice"] = target
        trade["tp"] = target
        trade["initial_takeProfit"] = target
    if qty is not None and qty > 0:
        trade["quantity"] = qty
        trade["position_size"] = qty
        trade["positionSize"] = qty
        trade["size"] = qty

    if entry is not None and not isinstance(trade.get("entries"), list):
        trade["entries"] = [_build_price_row(entry, qty)]
    if target is not None and not isinstance(trade.get("targets"), list) and not isinstance(
        trade.get("planned_targets"), list
    ):
        trade["targets"] = [_build_price_row(target, qty)]
    if exit_px is not None and not isinstance(trade.get("exits"), list) and not isinstance(
        trade.get("partial_exits"), list
    ):
        trade["exits"] = [_build_price_row(exit_px, qty)]


def _ms_to_iso_day(ms: float) -> str:
    dt = datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d")


def _ms_to_hhmm(ms: float) -> str:
    dt = datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)
    return dt.strftime("%H:%M")


def _enrich_imported_trade(
    trade: dict[str, Any],
    row: dict[str, str],
    column_mapping: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Add dashboard/chart aliases so CSV re-import matches export fields."""
    pnl = float(trade["netPnL"])
    trade["pnl"] = pnl
    trade["pnl_currency_net"] = pnl
    trade["pnl_dollars_net"] = pnl
    trade["realizedPnL"] = pnl
    trade["symbol"] = trade["ticker"]

    r_m = float(trade["rMultiple"])
    trade["rr"] = r_m
    trade["actual_rr_net"] = r_m
    trade["actualRR"] = abs(r_m) if r_m else 0.0

    planned_rr = _pick_float_field(row, "plannedRR", column_mapping, *_PLANNED_RR_ALIASES)
    if planned_rr is None:
        planned_rr = _pick_float(row, *_PLANNED_RR_ALIASES)
    if planned_rr is not None and planned_rr > 0:
        trade["plannedRR"] = float(planned_rr)
        trade["planned_rr"] = float(planned_rr)
        trade["rewardToRiskRatio"] = float(planned_rr)

    _PASSTHROUGH_TO_MAPPABLE: dict[str, str] = {
        "entryPrice": "entryPrice",
        "entry": "entryPrice",
        "openPrice": "entryPrice",
        "open_price": "entryPrice",
        "array_base_price": "entryPrice",
        "exitPrice": "exitPrice",
        "exit": "exitPrice",
        "closePrice": "exitPrice",
        "close_price": "exitPrice",
        "stopLoss": "stopLoss",
        "sl": "stopLoss",
        "planned_sl": "stopLoss",
        "stop_loss": "stopLoss",
        "takeProfit": "takeProfit",
        "tp": "takeProfit",
        "target": "takeProfit",
        "targetPrice": "takeProfit",
        "highestPrice": "highestPrice",
        "lowestPrice": "lowestPrice",
        "closeType": "closeType",
        "exit_reason": "closeType",
        "reason": "closeType",
        "durationMinutes": "durationMinutes",
        "duration": "durationMinutes",
        "timeHeldMinutes": "durationMinutes",
    }
    _FLOAT_PASSTHROUGH_KEYS = {
        "duration", "durationMinutes", "timeHeldMinutes", "riskPct", "risk_pct",
        "plannedRisk", "originalRisk", "planned_risk_amount", "riskPerTrade",
        "mfe", "mae", "total_mfe_r", "total_mae_r", "commission_total", "commissionCost",
        "spread", "slippage", "cost_friction_total",
        "entryPrice", "entry", "openPrice", "open_price", "array_base_price",
        "exitPrice", "exit", "closePrice", "close_price",
        "stopLoss", "sl", "planned_sl", "stop_loss",
        "takeProfit", "tp", "target", "targetPrice",
        "highestPrice", "lowestPrice",
    }

    for key in _PASSTHROUGH_SCALAR_KEYS:
        mappable_key = _PASSTHROUGH_TO_MAPPABLE.get(key)
        if column_mapping and mappable_key and mappable_key in MAPPABLE_FIELDS:
            raw = _pick_field(row, mappable_key, column_mapping, *MAPPABLE_FIELDS[mappable_key])
        else:
            raw = _pick(row, key)
        if not raw:
            continue
        if key in _FLOAT_PASSTHROUGH_KEYS:
            val = _cell_to_float(raw)
            if val is not None:
                trade[key] = val
        else:
            trade[key] = raw

    for key in _JSON_COLLECTION_KEYS:
        if isinstance(trade.get(key), list):
            trade[key] = _normalize_price_rows(trade.get(key))
            continue
        parsed = _parse_json_cell(_pick(row, key))
        if isinstance(parsed, list):
            trade[key] = _normalize_price_rows(parsed)
    for _raw_key, raw_val in row.items():
        if not raw_val or not str(raw_val).strip():
            continue
        norm = _norm_header(_raw_key)
        if norm in {_norm_header(k) for k in _JSON_COLLECTION_KEYS}:
            continue
        if str(raw_val).lstrip()[0:1] not in "[{":
            continue
        parsed = _parse_json_cell(str(raw_val))
        if isinstance(parsed, list) and not isinstance(trade.get(_raw_key), list):
            trade[_raw_key] = _normalize_price_rows(parsed)

    _sync_trade_price_aliases(trade)

    close_ms = float(trade["closeTime"])
    open_ms = float(trade["openTime"])
    trade["entryTime"] = open_ms
    trade["exitTime"] = close_ms
    if not trade.get("entryDate"):
        trade["entryDate"] = _ms_to_iso_day(open_ms)
    if not trade.get("exitDate"):
        trade["exitDate"] = _ms_to_iso_day(close_ms)
    if not trade.get("date"):
        trade["date"] = trade["entryDate"]

    status_raw = str(trade.get("status") or _pick(row, "status", "tradeStatus", "state")).strip().lower()
    if status_raw:
        trade["status"] = "closed" if status_raw in {"closed", "close"} or "closed" in status_raw else "open"
    else:
        trade["status"] = "closed"

    if trade["status"] == "open":
        trade["pnl"] = 0.0
        trade["netPnL"] = 0.0
        trade["pnl_currency_net"] = 0.0
        trade["realizedPnL"] = 0.0
        trade["rMultiple"] = 0.0
        trade["rr"] = 0.0
        trade["actual_rr_net"] = 0.0
        trade["actualRR"] = 0.0

    return trade


def parse_trades_csv_text(
    text: str,
    *,
    max_rows: int = _MAX_ROWS,
    column_mapping: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    Parse CSV with header row into journal-compatible trade dicts.

    Required (any alias or explicit mapping): net PnL column, close time column.
    Aliases are matched case-insensitively with spaces/dashes as underscores.
    When ``column_mapping`` is provided, keys are internal field names and values
    are the exact CSV header labels chosen by the user.

    Close / open time: ISO-8601 string, or Unix seconds, or Unix milliseconds.
    """
    errors: list[str] = []
    warnings: list[str] = []
    raw = _strip_bom(text or "")
    if not raw.strip():
        return {"trades": [], "errors": ["CSV is empty"], "warnings": []}

    dialect = _detect_csv_dialect(raw)
    reader = _csv_dict_reader(raw, dialect)
    if not reader.fieldnames:
        return {"trades": [], "errors": ["Missing header row"], "warnings": []}

    mapping = column_mapping or None
    if mapping:
        for req in _REQUIRED_IMPORT_FIELDS:
            col = mapping.get(req)
            if not col or not str(col).strip():
                errors.append(f"Missing required column mapping for {req}")
        if errors:
            return {"trades": [], "errors": errors, "warnings": warnings}

    out: list[dict[str, Any]] = []

    for i, row in enumerate(reader, start=2):
        if i - 2 >= max_rows:
            warnings.append(f"Truncated at {max_rows} rows (limit).")
            break
        if not any((v or "").strip() for v in row.values()):
            continue

        pnl_s = _pick_field(row, "netPnL", mapping, *_PNL_ALIASES)
        close_s = _pick_field(row, "closeTime", mapping, *_CLOSE_TIME_ALIASES)

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

        open_s = _pick_field(row, "openTime", mapping, *_OPEN_TIME_ALIASES)
        open_ms = _cell_to_epoch_ms(open_s) if open_s else None
        if open_ms is None:
            open_ms = close_ms - 4 * 3600 * 1000
            if open_ms <= 0:
                open_ms = close_ms - 3600 * 1000

        tid = _pick_field(row, "tradeId", mapping, *_TRADE_ID_ALIASES) or f"csv-{i-2}"
        ticker_raw = _pick_field(row, "ticker", mapping, *_TICKER_ALIASES) or "EURUSD"
        ticker = ticker_raw.replace("/", "").upper()
        direction = (_pick_field(row, "direction", mapping, *_DIRECTION_ALIASES) or "BUY").upper()
        setup = _pick_field(row, "setup", mapping, *_SETUP_ALIASES) or "CSV"

        r_m = _pick_float_field(row, "rMultiple", mapping, *_R_ALIASES)
        mae = _cell_to_float(_pick_field(row, "mae_r", mapping, *_MAE_ALIASES))
        mfe = _cell_to_float(_pick_field(row, "mfe_r", mapping, *_MFE_ALIASES))
        mae_points = _cell_to_float(_pick_field(row, "mae_points", mapping, *_MAE_POINTS_ALIASES))
        mfe_points = _cell_to_float(_pick_field(row, "mfe_points", mapping, *_MFE_POINTS_ALIASES))
        highest_price = _cell_to_float(_pick_field(row, "highestPrice", mapping, *_HIGHEST_PRICE_ALIASES))
        lowest_price = _cell_to_float(_pick_field(row, "lowestPrice", mapping, *_LOWEST_PRICE_ALIASES))
        qty = _cell_to_float(_pick_field(row, "quantity", mapping, *_QUANTITY_ALIASES)) or 1.0
        risk = _cell_to_float(_pick_field(row, "riskAmount", mapping, *_RISK_ALIASES))
        spread = _cell_to_float(_pick_field(row, "spread_pips_at_entry", mapping, *_SPREAD_ALIASES)) or 1.0
        comm = _cell_to_float(_pick_field(row, "commission_at_entry", mapping, *_COMMISSION_ALIASES)) or 2.0
        pipv = _cell_to_float(_pick_field(row, "pip_value_at_entry", mapping, *_PIP_VALUE_ALIASES)) or 10.0

        if r_m is None:
            r_m = 0.0
        if mae is None:
            mae = min(0.0, -0.1 if pnl < 0 else -0.05)
        if mfe is None:
            mfe = max(0.0, 0.1 if pnl > 0 else 0.05)
        if risk is None or risk <= 0:
            risk = max(50.0, abs(pnl) * 2 if abs(pnl) > 1e-6 else 100.0)

        entry_px = _pick_float_field(row, "entryPrice", mapping, *_ENTRY_PRICE_ALIASES)
        exit_px = _pick_float_field(row, "exitPrice", mapping, *_EXIT_PRICE_ALIASES)
        stop_px = _pick_float_field(row, "stopLoss", mapping, *_STOP_ALIASES)
        tp_px = _pick_float_field(row, "takeProfit", mapping, *_TARGET_ALIASES)

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
        if entry_px is not None:
            trade["entryPrice"] = float(entry_px)
        if exit_px is not None:
            trade["exitPrice"] = float(exit_px)
        if stop_px is not None:
            trade["stopLoss"] = float(stop_px)
        if tp_px is not None:
            trade["takeProfit"] = float(tp_px)
        if mae_points is not None:
            trade["mae_points"] = float(mae_points)
        if mfe_points is not None:
            trade["mfe_points"] = float(mfe_points)
        if highest_price is not None:
            trade["highestPrice"] = float(highest_price)
        if lowest_price is not None:
            trade["lowestPrice"] = float(lowest_price)
        out.append(_enrich_imported_trade(trade, row, column_mapping=mapping))

    if not out and not errors:
        errors.append("No data rows after header.")

    return {"trades": out, "errors": errors, "warnings": warnings}


def parse_trades_csv_bytes(
    data: bytes,
    *,
    max_rows: int = _MAX_ROWS,
    column_mapping: dict[str, str] | None = None,
) -> dict[str, Any]:
    if len(data) > 12 * 1024 * 1024:
        return {"trades": [], "errors": ["CSV file too large (max 12 MB)"], "warnings": []}
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("utf-8", errors="replace")
        out = parse_trades_csv_text(text, max_rows=max_rows, column_mapping=column_mapping)
        w = list(out.get("warnings") or [])
        w.append("Non-UTF8 bytes replaced (invalid UTF-8).")
        return {**out, "warnings": w}
    return parse_trades_csv_text(text, max_rows=max_rows, column_mapping=column_mapping)
