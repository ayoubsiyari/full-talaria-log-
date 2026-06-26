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


def _enrich_imported_trade(trade: dict[str, Any], row: dict[str, str]) -> dict[str, Any]:
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

    planned_rr = _pick_float(row, *_PLANNED_RR_ALIASES)
    if planned_rr is not None and planned_rr > 0:
        trade["plannedRR"] = float(planned_rr)
        trade["planned_rr"] = float(planned_rr)
        trade["rewardToRiskRatio"] = float(planned_rr)

    for key in _PASSTHROUGH_SCALAR_KEYS:
        raw = _pick(row, key)
        if not raw:
            continue
        if key in {
            "duration",
            "durationMinutes",
            "timeHeldMinutes",
            "riskPct",
            "risk_pct",
            "plannedRisk",
            "originalRisk",
            "planned_risk_amount",
            "riskPerTrade",
            "mfe",
            "mae",
            "total_mfe_r",
            "total_mae_r",
            "commission_total",
            "commissionCost",
            "spread",
            "slippage",
            "cost_friction_total",
        }:
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

        pnl_s = _pick(row, *_PNL_ALIASES)
        close_s = _pick(row, *_CLOSE_TIME_ALIASES)

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

        open_s = _pick(row, *_OPEN_TIME_ALIASES)
        open_ms = _cell_to_epoch_ms(open_s) if open_s else None
        if open_ms is None:
            open_ms = close_ms - 4 * 3600 * 1000
            if open_ms <= 0:
                open_ms = close_ms - 3600 * 1000

        tid = _pick(row, *_TRADE_ID_ALIASES) or f"csv-{i-2}"
        ticker = (_pick(row, "ticker", "symbol", "instrument") or "EURUSD").replace("/", "").upper()
        direction = (_pick(row, "direction", "side", "type") or "BUY").upper()
        setup = _pick(row, "setup", "playbook", "strategy", "strategyName", "strategy_label") or "CSV"

        r_m = _pick_float(row, *_R_ALIASES)
        mae = _cell_to_float(_pick(row, "mae_r", "mae", "mae_R", "total_mae_r"))
        mfe = _cell_to_float(_pick(row, "mfe_r", "mfe", "mfe_R", "total_mfe_r"))
        qty = _cell_to_float(_pick(row, "quantity", "qty", "position_size", "positionSize", "size")) or 1.0
        risk = _cell_to_float(_pick(row, "riskAmount", "risk_amount", "risk_usd", "risk", "riskPerTrade", "originalRisk"))
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
        out.append(_enrich_imported_trade(trade, row))

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
