"""Generate journal trades aligned to a backtest session contract (QA / dashboard seeding)."""

from __future__ import annotations

import bisect
import math
import random
from datetime import datetime, timezone
from typing import Any, Callable

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
CLOSE_TYPES = ["TP", "SL", "Manual", "Trailing SL", "BE"]

_FALLBACK_INSTRUMENTS: dict[str, dict[str, float | str]] = {
    "EURUSD": {"market": "Forex", "pip": 0.0001, "base": 1.085, "pip_value": 10.0, "spread": 0.8},
    "GBPUSD": {"market": "Forex", "pip": 0.0001, "base": 1.265, "pip_value": 10.0, "spread": 1.2},
    "USDJPY": {"market": "Forex", "pip": 0.01, "base": 148.5, "pip_value": 9.2, "spread": 0.9},
    "XAUUSD": {"market": "Commodity", "pip": 0.01, "base": 2035.0, "pip_value": 1.0, "spread": 2.5},
    "NAS100": {"market": "Indices", "pip": 1.0, "base": 16850.0, "pip_value": 1.0, "spread": 1.5},
    "BTCUSD": {"market": "Crypto", "pip": 1.0, "base": 52000.0, "pip_value": 1.0, "spread": 12.0},
    "ES": {"market": "Futures", "pip": 0.25, "base": 5280.0, "pip_value": 12.5, "spread": 0.5},
    "NQ": {"market": "Futures", "pip": 0.25, "base": 18450.0, "pip_value": 5.0, "spread": 0.75},
}


def _norm_sym(value: Any) -> str:
    return str(value or "").replace("/", "").upper().strip()


def _to_float(value: Any, default: float | None = None) -> float | None:
    if value is None or value == "":
        return default
    try:
        n = float(value)
        return n if math.isfinite(n) else default
    except (TypeError, ValueError):
        return default


def _parse_date_ms(value: Any, *, end_of_day: bool = False) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        v = float(value)
        if v > 1e12:
            return int(v)
        if v > 1e9:
            return int(v * 1000)
        return int(v * 1000)
    text = str(value).strip()
    if not text:
        return None
    try:
        if len(text) == 10 and text[4] == "-":
            dt = datetime.strptime(text, "%Y-%m-%d")
        else:
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if end_of_day and len(text) == 10:
            dt = dt.replace(hour=23, minute=59, second=59)
        return int(dt.timestamp() * 1000)
    except ValueError:
        return None


def _price_fmt(value: float, pip: float) -> float:
    if pip >= 1:
        return round(value, 2)
    if pip >= 0.01:
        return round(value, 3 if pip == 0.01 else 5)
    return round(value, 5)


def _iso_z(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def extract_session_contract(session_public: dict[str, Any]) -> dict[str, Any]:
    cfg = session_public.get("config") if isinstance(session_public.get("config"), dict) else {}
    instruments_raw = cfg.get("instruments") if isinstance(cfg.get("instruments"), dict) else {}

    tickers: list[str] = []
    for raw in cfg.get("tickers") or []:
        sym = _norm_sym(raw)
        if sym and sym not in tickers:
            tickers.append(sym)
    if not tickers and instruments_raw:
        for key in instruments_raw.keys():
            sym = _norm_sym(key)
            if sym and sym not in tickers:
                tickers.append(sym)
    if not tickers:
        sym = _norm_sym(cfg.get("symbol"))
        if sym and not sym.endswith("SYMBOLS") and " " not in sym:
            tickers = [sym]

    start_ms = _parse_date_ms(cfg.get("startDate") or session_public.get("start_date"))
    end_ms = _parse_date_ms(cfg.get("endDate") or session_public.get("end_date"), end_of_day=True)
    if start_ms is None:
        start_ms = int(datetime(2024, 1, 2, tzinfo=timezone.utc).timestamp() * 1000)
    if end_ms is None or end_ms <= start_ms:
        end_ms = start_ms + 90 * 24 * 3600 * 1000

    balance = _to_float(cfg.get("startBalance") or session_public.get("start_balance"), 10000.0) or 10000.0
    risk_mode = str(cfg.get("defaultRiskType") or cfg.get("risk_mode") or "pct").lower()
    risk_val = _to_float(cfg.get("defaultRisk") or cfg.get("default_risk") or cfg.get("riskVal"), 1.0) or 1.0

    instruments: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        row = instruments_raw.get(ticker) or instruments_raw.get(ticker.replace("USD", "/USD")) or {}
        fallback = _FALLBACK_INSTRUMENTS.get(ticker, _FALLBACK_INSTRUMENTS["EURUSD"])
        pip = _to_float(row.get("pip_size") or row.get("pipSize") or row.get("pip"), float(fallback["pip"])) or float(fallback["pip"])
        spread = _to_float(row.get("spread_pips") or row.get("spreadPips") or row.get("spread"), float(fallback["spread"])) or float(fallback["spread"])
        pip_value = _to_float(
            row.get("pip_value_per_lot") or row.get("pipValuePerLot") or row.get("pip_value"),
            float(fallback["pip_value"]),
        ) or float(fallback["pip_value"])
        commission = _to_float(
            row.get("commission_per_lot_per_side") or row.get("commissionPerLotPerSide") or row.get("commission"),
            0.0,
        ) or 0.0
        file_id = row.get("fileId") or row.get("file_id")
        try:
            file_id = int(file_id) if file_id is not None else None
        except (TypeError, ValueError):
            file_id = None
        instruments[ticker] = {
            "ticker": ticker,
            "file_id": file_id,
            "pip": pip,
            "spread": spread,
            "pip_value": pip_value,
            "commission": commission,
            "market": str(row.get("asset_class") or row.get("assetClass") or fallback["market"]),
            "base": _to_float(row.get("reference_price") or row.get("base_price"), float(fallback["base"])) or float(fallback["base"]),
        }

    return {
        "session_id": session_public.get("id"),
        "session_name": str(session_public.get("name") or cfg.get("sessionName") or "Session"),
        "session_type": str(session_public.get("session_type") or cfg.get("type") or "personal"),
        "trading_mode": str(cfg.get("trading_mode") or cfg.get("tradingMode") or "standard"),
        "timeframe": str(cfg.get("timeframe") or "1H"),
        "strategy": str(cfg.get("strategy_name") or cfg.get("playbook") or "General"),
        "tickers": tickers,
        "instruments": instruments,
        "start_ms": start_ms,
        "end_ms": end_ms,
        "balance": balance,
        "risk_mode": risk_mode,
        "risk_val": risk_val,
        "currency": str(cfg.get("account_currency") or "USD"),
    }


def _bar_at_or_before(bars: list[dict[str, Any]], ts_ms: int) -> dict[str, Any] | None:
    if not bars:
        return None
    times = [int(b["t"]) for b in bars]
    idx = bisect.bisect_right(times, ts_ms) - 1
    if idx < 0:
        return bars[0]
    return bars[idx]


def _bar_at_or_after(bars: list[dict[str, Any]], ts_ms: int) -> dict[str, Any] | None:
    if not bars:
        return None
    times = [int(b["t"]) for b in bars]
    idx = bisect.bisect_left(times, ts_ms)
    if idx >= len(bars):
        return bars[-1]
    return bars[idx]


def _hold_range_ms(timeframe: str, rng: random.Random) -> tuple[int, int]:
    tf = str(timeframe or "1H").lower()
    if tf.endswith("m"):
        mins = int("".join(ch for ch in tf if ch.isdigit()) or "5")
        hold = rng.randint(max(mins, 5), max(mins * 12, 60))
    elif tf.endswith("h"):
        hrs = int("".join(ch for ch in tf if ch.isdigit()) or "1")
        hold = rng.randint(max(hrs * 30, 30), max(hrs * 480, 120))
    elif tf.endswith("d"):
        hold = rng.randint(360, 4320)
    else:
        hold = rng.randint(30, 480)
    return hold * 60 * 1000, hold


def generate_session_seed_trades(
    session_public: dict[str, Any],
    *,
    count: int = 200,
    seed: int | None = None,
    bars_by_ticker: dict[str, list[dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    contract = extract_session_contract(session_public)
    warnings: list[str] = []
    if not contract["tickers"]:
        return {"trades": [], "errors": ["Session has no tickers configured"], "warnings": warnings, "contract": contract}

    rng = random.Random(seed if seed is not None else int(contract["session_id"] or 0) + count)
    bars_by_ticker = bars_by_ticker or {}
    tickers = contract["tickers"]
    start_ms = int(contract["start_ms"])
    end_ms = int(contract["end_ms"])
    span = max(end_ms - start_ms, 3600_000)
    balance = float(contract["balance"])
    risk_mode = contract["risk_mode"]
    risk_pct = float(contract["risk_val"])
    strategy = contract["strategy"]
    session_id = contract["session_id"]
    session_name = contract["session_name"]

    for ticker in tickers:
        if ticker not in bars_by_ticker or not bars_by_ticker[ticker]:
            warnings.append(f"No market bars loaded for {ticker}; using fallback prices from session defaults.")

    trades: list[dict[str, Any]] = []
    win_rate = 0.52 if contract["trading_mode"] != "prop" else 0.48

    for i in range(count):
        ticker = tickers[i % len(tickers)]
        inst = contract["instruments"].get(ticker) or {}
        pip = float(inst.get("pip") or 0.0001)
        spread = float(inst.get("spread") or 1.0)
        pip_value = float(inst.get("pip_value") or 10.0)
        commission = float(inst.get("commission") or 0.0)
        market = str(inst.get("market") or "Forex")
        bars = bars_by_ticker.get(ticker) or []

        entry_ms = start_ms + int((i + rng.random()) / max(count, 1) * span)
        entry_ms = min(max(entry_ms, start_ms), end_ms - 60_000)
        hold_ms, hold_minutes = _hold_range_ms(contract["timeframe"], rng)
        exit_ms = min(entry_ms + hold_ms, end_ms)
        if exit_ms <= entry_ms:
            exit_ms = min(entry_ms + 3600_000, end_ms)

        entry_bar = _bar_at_or_before(bars, entry_ms) if bars else None
        exit_bar = _bar_at_or_after(bars, exit_ms) if bars else None

        if entry_bar:
            entry = float(entry_bar.get("c") or entry_bar.get("o") or inst.get("base"))
        else:
            base = float(inst.get("base") or 1.0)
            entry = base * (1 + rng.uniform(-0.02, 0.02))
        entry = _price_fmt(entry, pip)

        direction = rng.choice(["BUY", "SELL"])
        bar_range = 0.0
        if entry_bar:
            hi = float(entry_bar.get("h") or entry)
            lo = float(entry_bar.get("l") or entry)
            bar_range = max(abs(hi - lo), pip * 5)
        sl_dist = max(bar_range * rng.uniform(0.8, 1.6), pip * rng.uniform(8, 25))
        planned_rr = rng.choice([1.0, 1.5, 2.0, 2.5])
        if direction == "BUY":
            stop = _price_fmt(entry - sl_dist, pip)
            target = _price_fmt(entry + sl_dist * planned_rr, pip)
        else:
            stop = _price_fmt(entry + sl_dist, pip)
            target = _price_fmt(entry - sl_dist * planned_rr, pip)

        win = rng.random() < win_rate
        if win:
            r_mult = rng.uniform(0.35, min(planned_rr * 1.05, 3.0))
            close_type = rng.choice(["TP", "Manual", "Trailing SL"])
            if exit_bar:
                exit_price = float(exit_bar.get("c") or exit_bar.get("o") or entry)
                if direction == "BUY" and exit_price < entry:
                    exit_price = _price_fmt(entry + sl_dist * r_mult, pip)
                elif direction == "SELL" and exit_price > entry:
                    exit_price = _price_fmt(entry - sl_dist * r_mult, pip)
                else:
                    exit_price = _price_fmt(exit_price, pip)
            else:
                move = sl_dist * r_mult
                exit_price = _price_fmt(entry + move if direction == "BUY" else entry - move, pip)
        else:
            r_mult = -rng.uniform(0.25, 1.0)
            close_type = rng.choice(["SL", "Manual", "BE"])
            if close_type == "SL":
                exit_price = stop
            elif exit_bar:
                exit_price = _price_fmt(float(exit_bar.get("c") or entry), pip)
            else:
                move = sl_dist * abs(r_mult)
                exit_price = _price_fmt(entry - move if direction == "BUY" else entry + move, pip)

        if risk_mode == "fixed":
            risk_amount = max(risk_pct, 10.0)
        else:
            risk_amount = balance * (risk_pct / 100.0)
        risk_amount = max(risk_amount, 10.0)
        pnl = round(r_mult * risk_amount, 2)
        balance_after = round(balance + pnl, 2)
        balance = balance_after

        mae_r = abs(rng.uniform(0.05, 0.9 if win else 1.1))
        mfe_r = abs(rng.uniform(0.1, max(0.2, abs(r_mult) + 0.4)))
        if direction == "BUY":
            mfe_price = _price_fmt(entry + mfe_r * sl_dist, pip)
            mae_price = _price_fmt(entry - mae_r * sl_dist, pip)
            highest = _price_fmt(max(entry, exit_price, mfe_price), pip)
            lowest = _price_fmt(min(entry, exit_price, mae_price), pip)
        else:
            mfe_price = _price_fmt(entry - mfe_r * sl_dist, pip)
            mae_price = _price_fmt(entry + mae_r * sl_dist, pip)
            highest = _price_fmt(max(entry, exit_price, mae_price), pip)
            lowest = _price_fmt(min(entry, exit_price, mfe_price), pip)

        entry_dt = datetime.fromtimestamp(entry_ms / 1000.0, tz=timezone.utc)
        trade_id = f"seed-{session_id}-{i + 1}"
        side = "Long" if direction == "BUY" else "Short"
        post_tag = "Win" if pnl > 0 else "Loss" if pnl < 0 else "BE"

        trades.append({
            "tradeId": trade_id,
            "client_trade_id": str(i + 1),
            "ticker": ticker,
            "symbol": ticker,
            "direction": direction,
            "side": side,
            "type": direction,
            "orderType": "market",
            "quantity": round(max(0.01, risk_amount / max(pip_value * (sl_dist / pip), 1)), 2),
            "status": "closed",
            "entryTime": float(entry_ms),
            "openTime": float(entry_ms),
            "exitTime": float(exit_ms),
            "closeTime": float(exit_ms),
            "entryDate": _iso_z(entry_ms),
            "date": entry_dt.strftime("%Y-%m-%d"),
            "exitDate": _iso_z(exit_ms),
            "entryPrice": entry,
            "openPrice": entry,
            "exitPrice": exit_price,
            "closePrice": exit_price,
            "stopLoss": stop,
            "takeProfit": target,
            "initial_sl": stop,
            "initial_takeProfit": target,
            "netPnL": pnl,
            "pnl": pnl,
            "realizedPnL": pnl,
            "rMultiple": round(r_mult, 4),
            "actual_rr_net": round(abs(r_mult), 4),
            "actualRR": round(abs(r_mult), 4),
            "rewardToRiskRatio": planned_rr,
            "plannedRR": planned_rr,
            "riskAmount": round(risk_amount, 2),
            "riskPerTrade": round(risk_amount, 2),
            "originalRiskAmount": round(risk_amount, 2),
            "planned_risk_pct": risk_pct if risk_mode != "fixed" else None,
            "duration": max(1, hold_minutes),
            "holdingTimeMs": exit_ms - entry_ms,
            "holdingTimeHours": round((exit_ms - entry_ms) / 3600000, 4),
            "holdingTimeDays": round((exit_ms - entry_ms) / 86400000, 4),
            "closeType": close_type,
            "mfe": mfe_price,
            "mae": mae_price,
            "mfe_r": round(mfe_r, 4),
            "mae_r": round(mae_r, 4),
            "highestPrice": highest,
            "lowestPrice": lowest,
            "spread_pips_at_entry": spread,
            "commission_at_entry": commission,
            "pip_value_at_entry": pip_value,
            "setup": strategy,
            "tag": strategy,
            "market": market,
            "dayOfWeek": DAYS[entry_dt.weekday()],
            "month": MONTHS[entry_dt.month - 1],
            "year": entry_dt.year,
            "hourOfEntry": entry_dt.hour,
            "hourOfExit": datetime.fromtimestamp(exit_ms / 1000.0, tz=timezone.utc).hour,
            "sourceSessionName": session_name,
            "sourceSessionId": session_id,
            "trading_session_id": session_id,
            "sourceKey": f"session:{session_id}",
            "sourceFilterKey": f"session:{session_id}",
            "sourceLabel": session_name,
            "sourceType": "backtest",
            "seedSource": "session-demo-seed",
            "rulesFollowed": True,
            "preTags": [strategy],
            "postTags": [post_tag],
            "postTradeNotes": {"seed": True, "alignedToSession": True},
            "balance_at_creation": round(balance - pnl, 2),
            "balance_at_exit": balance_after,
            "n": i + 1,
            "chart_trade_id": i + 1,
        })

    trades.sort(key=lambda t: (float(t["entryTime"]), str(t["tradeId"])))
    for idx, trade in enumerate(trades, start=1):
        trade["n"] = idx
        trade["chart_trade_id"] = idx

    return {
        "trades": trades,
        "errors": [],
        "warnings": warnings,
        "contract": {
            "tickers": tickers,
            "start_ms": start_ms,
            "end_ms": end_ms,
            "count": count,
            "used_real_bars": sum(1 for t in tickers if bars_by_ticker.get(t)),
        },
    }


BarsLoader = Callable[[int, int, int, str], list[dict[str, Any]]]


def load_bars_for_contract(
    contract: dict[str, Any],
    loader: BarsLoader,
    *,
    limit: int = 2500,
) -> dict[str, list[dict[str, Any]]]:
    """Load OHLC bars for each ticker in the contract using an injected loader(file_id, from_ms, to_ms, resolution)."""
    out: dict[str, list[dict[str, Any]]] = {}
    start_ms = int(contract["start_ms"])
    end_ms = int(contract["end_ms"])
    resolution = str(contract.get("timeframe") or "1H")
    if resolution.lower().endswith("h") and not resolution.lower().endswith("mh"):
        resolution = "1h"
    elif resolution.lower().endswith("m"):
        resolution = resolution.lower()
    else:
        resolution = "1h"

    for ticker, inst in (contract.get("instruments") or {}).items():
        file_id = inst.get("file_id")
        if not file_id:
            continue
        try:
            bars = loader(int(file_id), start_ms, end_ms, resolution)
            if bars:
                out[ticker] = sorted(bars, key=lambda b: int(b["t"]))
        except Exception:
            continue
    return out
