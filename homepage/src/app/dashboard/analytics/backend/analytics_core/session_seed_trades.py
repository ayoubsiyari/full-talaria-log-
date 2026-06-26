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
CLOSE_TYPES = ["TP", "SL", "Manual", "Trailing SL", "BE", "Partial", "Time Stop", "Gap Exit"]

SEED_SCENARIO_PROFILES: dict[str, dict[str, Any]] = {
    "realistic": {
        "label": "Realistic",
        "win_rate": 0.54,
        "tail_pct": 0.05,
        "hint": "Stable win rate, almost no outliers.",
    },
    "balanced": {
        "label": "Balanced",
        "win_rate": 0.52,
        "tail_pct": 0.20,
        "hint": "~80% normal trades, ~20% tail cases.",
    },
    "extreme": {
        "label": "Extreme tails",
        "win_rate": 0.46,
        "tail_pct": 0.50,
        "hint": "Heavy tails: mega wins/losses, gaps, oversizing.",
    },
    "stress": {
        "label": "Stress / all scenarios",
        "win_rate": 0.50,
        "tail_pct": 0.35,
        "cycle_all": True,
        "hint": "Cycles through every scenario type for QA coverage.",
    },
    "losing": {
        "label": "Losing period",
        "win_rate": 0.30,
        "tail_pct": 0.12,
        "hint": "Drawdown-style session with mostly losses.",
    },
    "winning": {
        "label": "Winning streak",
        "win_rate": 0.70,
        "tail_pct": 0.10,
        "hint": "Strong equity curve with controlled outliers.",
    },
}

NORMAL_SCENARIOS = [
    "win_tp", "loss_sl", "win_manual", "loss_manual", "breakeven",
    "partial_win", "trailing_win", "small_loss", "planned_rr_hit",
]
TAIL_SCENARIOS = [
    "mega_win", "mega_loss", "left_on_table", "survived_drawdown",
    "oversized_lot", "micro_lot", "gap_loss", "news_spike_win",
    "multi_day_hold", "split_entry", "scaled_in", "zero_pnl",
    "rule_break", "time_stop", "partial_loss",
]
ALL_SCENARIOS = NORMAL_SCENARIOS + TAIL_SCENARIOS


def normalize_seed_scenario(value: Any) -> str:
    key = str(value or "balanced").strip().lower().replace(" ", "_")
    aliases = {
        "normal": "realistic",
        "realistic": "realistic",
        "mixed": "balanced",
        "default": "balanced",
        "extreme_tails": "extreme",
        "extremes": "extreme",
        "all": "stress",
        "comprehensive": "stress",
        "full": "stress",
    }
    key = aliases.get(key, key)
    return key if key in SEED_SCENARIO_PROFILES else "balanced"


def seed_scenario_catalog() -> list[dict[str, str]]:
    return [
        {"id": k, "label": v["label"], "hint": v["hint"]}
        for k, v in SEED_SCENARIO_PROFILES.items()
    ]


def _pick_trade_scenario(rng: random.Random, profile: dict[str, Any], index: int, count: int) -> str:
    if profile.get("cycle_all"):
        return ALL_SCENARIOS[index % len(ALL_SCENARIOS)]
    tail_pct = float(profile.get("tail_pct") or 0.2)
    is_tail = rng.random() < tail_pct
    if is_tail:
        return rng.choice(TAIL_SCENARIOS + NORMAL_SCENARIOS[:2])
    return rng.choice(NORMAL_SCENARIOS)


def _scenario_trade_outcome(
    rng: random.Random,
    scenario: str,
    *,
    win_rate: float,
    planned_rr: float,
) -> dict[str, Any]:
    """Map named scenario to win/loss, R multiple, and close type."""
    win = rng.random() < win_rate
    close_type = rng.choice(CLOSE_TYPES)
    r_mult = 0.0
    rules_followed = True
    has_partial = False
    is_split = scenario == "split_entry"
    is_scaled = scenario == "scaled_in"

    if scenario == "mega_win":
        win, close_type, r_mult = True, "TP", rng.uniform(5.0, 10.0)
    elif scenario == "mega_loss":
        win, close_type, r_mult = False, "SL", -rng.uniform(2.5, 5.5)
    elif scenario == "news_spike_win":
        win, close_type, r_mult = True, "TP", rng.uniform(3.0, 6.5)
    elif scenario == "gap_loss":
        win, close_type, r_mult = False, "Gap Exit", -rng.uniform(1.5, 3.5)
    elif scenario == "left_on_table":
        win, close_type, r_mult = False, "Manual", -rng.uniform(0.15, 0.5)
    elif scenario == "survived_drawdown":
        win, close_type, r_mult = True, "Trailing SL", rng.uniform(0.4, 1.2)
    elif scenario == "breakeven" or scenario == "zero_pnl":
        win, close_type, r_mult = False, "BE", 0.0
    elif scenario == "partial_win":
        win, close_type, r_mult, has_partial = True, "Partial", rng.uniform(0.5, 1.3), True
    elif scenario == "partial_loss":
        win, close_type, r_mult, has_partial = False, "Partial", -rng.uniform(0.3, 0.9), True
    elif scenario == "rule_break":
        win, close_type, r_mult, rules_followed = rng.random() < 0.4, "Manual", rng.uniform(-1.2, 0.8), False
    elif scenario == "oversized_lot":
        win, close_type, r_mult = rng.random() < 0.35, rng.choice(["SL", "TP"]), rng.uniform(-2.5, 2.5)
    elif scenario == "micro_lot":
        win, close_type, r_mult = win, "Manual", rng.uniform(-0.3, 0.5)
    elif scenario == "multi_day_hold":
        win, close_type, r_mult = win, "Time Stop", rng.uniform(-0.8, 2.0)
    elif scenario == "time_stop":
        win, close_type, r_mult = win, "Time Stop", rng.uniform(-0.5, 1.0)
    elif scenario == "win_tp":
        win, close_type, r_mult = True, "TP", rng.uniform(0.5, min(planned_rr, 2.5))
    elif scenario == "loss_sl":
        win, close_type, r_mult = False, "SL", -rng.uniform(0.85, 1.05)
    elif scenario == "win_manual":
        win, close_type, r_mult = True, "Manual", rng.uniform(0.35, 1.8)
    elif scenario == "loss_manual":
        win, close_type, r_mult = False, "Manual", -rng.uniform(0.2, 0.95)
    elif scenario == "trailing_win":
        win, close_type, r_mult = True, "Trailing SL", rng.uniform(0.6, 2.2)
    elif scenario == "small_loss":
        win, close_type, r_mult = False, "Manual", -rng.uniform(0.15, 0.45)
    elif scenario == "planned_rr_hit":
        win, close_type, r_mult = True, "TP", planned_rr * rng.uniform(0.85, 1.05)
    else:
        if win:
            r_mult = rng.uniform(0.35, min(planned_rr * 1.05, 3.0))
            close_type = rng.choice(["TP", "Manual", "Trailing SL"])
        else:
            r_mult = -rng.uniform(0.25, 1.0)
            close_type = rng.choice(["SL", "Manual", "BE"])

    return {
        "win": win,
        "close_type": close_type,
        "r_mult": r_mult,
        "rules_followed": rules_followed,
        "has_partial": has_partial,
        "is_split": is_split,
        "is_scaled": is_scaled,
        "scenario": scenario,
        "would_have_won": scenario == "left_on_table",
    }

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

    pre_var_defs, post_var_defs = _strategy_variable_defs(cfg)
    mfe_mae = cfg.get("mfe_mae") if isinstance(cfg.get("mfe_mae"), dict) else {}
    post_exit_candles = int(
        _to_float(
            cfg.get("post_exit_tracking_candles")
            or mfe_mae.get("post_exit_candles")
            or cfg.get("postExitTrackingCandles"),
            50,
        )
        or 50
    )
    strategy_id = cfg.get("strategy_id") or cfg.get("strategyId")
    try:
        strategy_id = int(strategy_id) if strategy_id is not None else None
    except (TypeError, ValueError):
        strategy_id = None

    return {
        "session_id": session_public.get("id"),
        "session_name": str(session_public.get("name") or cfg.get("sessionName") or "Session"),
        "session_type": str(session_public.get("session_type") or cfg.get("type") or "personal"),
        "trading_mode": str(cfg.get("trading_mode") or cfg.get("tradingMode") or "standard"),
        "timeframe": str(cfg.get("timeframe") or "1H"),
        "strategy": str(cfg.get("strategy_name") or cfg.get("playbook_display") or cfg.get("playbook") or "General"),
        "strategy_id": strategy_id,
        "pre_var_defs": pre_var_defs,
        "post_var_defs": post_var_defs,
        "post_exit_candles": max(5, min(post_exit_candles, 120)),
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


def _bars_in_range(bars: list[dict[str, Any]], start_ms: int, end_ms: int) -> list[dict[str, Any]]:
    if not bars:
        return []
    times = [int(b["t"]) for b in bars]
    lo = bisect.bisect_left(times, start_ms)
    hi = bisect.bisect_right(times, end_ms)
    return bars[lo:hi]


def _bars_after(bars: list[dict[str, Any]], from_ms: int, count: int) -> list[dict[str, Any]]:
    if not bars or count <= 0:
        return []
    times = [int(b["t"]) for b in bars]
    idx = bisect.bisect_right(times, from_ms)
    return bars[idx : idx + count]


def _excursion_r_values(
    direction: str,
    array_base: float,
    initial_sl: float,
    candle: dict[str, Any],
) -> dict[str, float] | None:
    planned_risk = abs(array_base - initial_sl)
    if not (planned_risk > 0):
        return None
    try:
        high = float(candle.get("h") or candle.get("high"))
        low = float(candle.get("l") or candle.get("low"))
        close = float(candle.get("c") or candle.get("close"))
    except (TypeError, ValueError):
        return None
    if direction == "BUY":
        return {
            "bar_high_r": (high - array_base) / planned_risk,
            "bar_low_r": (array_base - low) / planned_risk,
            "bar_close_r": (close - array_base) / planned_risk,
        }
    return {
        "bar_high_r": (array_base - low) / planned_risk,
        "bar_low_r": (high - array_base) / planned_risk,
        "bar_close_r": (array_base - close) / planned_risk,
    }


def _build_trade_path_arrays(
    bars: list[dict[str, Any]],
    *,
    entry_ms: int,
    exit_ms: int,
    direction: str,
    array_base: float,
    initial_sl: float,
    post_exit_candles: int,
) -> dict[str, Any]:
    in_trade = _bars_in_range(bars, entry_ms, exit_ms)
    if not in_trade and bars:
        anchor = _bar_at_or_before(bars, entry_ms)
        if anchor:
            idx = bars.index(anchor)
            in_trade = bars[idx : min(idx + 8, len(bars))]

    bar_close_r: list[float] = []
    bar_high_r: list[float] = []
    bar_low_r: list[float] = []
    for bar in in_trade:
        r_vals = _excursion_r_values(direction, array_base, initial_sl, bar)
        if not r_vals:
            continue
        bar_close_r.append(round(r_vals["bar_close_r"], 4))
        bar_high_r.append(round(r_vals["bar_high_r"], 4))
        bar_low_r.append(round(r_vals["bar_low_r"], 4))

    post_exit = _bars_after(bars, exit_ms, post_exit_candles)
    post_exit_bar_close_r: list[float] = []
    post_exit_bar_high_r: list[float] = []
    post_exit_bar_low_r: list[float] = []
    for bar in post_exit:
        r_vals = _excursion_r_values(direction, array_base, initial_sl, bar)
        if not r_vals:
            continue
        post_exit_bar_close_r.append(round(r_vals["bar_close_r"], 4))
        post_exit_bar_high_r.append(round(r_vals["bar_high_r"], 4))
        post_exit_bar_low_r.append(round(r_vals["bar_low_r"], 4))

    return {
        "bar_close_r": bar_close_r,
        "bar_high_r": bar_high_r,
        "bar_low_r": bar_low_r,
        "post_exit_bar_close_r": post_exit_bar_close_r,
        "post_exit_bar_high_r": post_exit_bar_high_r,
        "post_exit_bar_low_r": post_exit_bar_low_r,
        "post_exit_anchor_time": float(exit_ms),
        "final_exit_bar": len(bar_close_r) if bar_close_r else 0,
    }


def _strategy_variable_defs(cfg: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    raw = cfg.get("strategy_variables") or cfg.get("strategyVariables") or []
    if not isinstance(raw, list):
        return [], []
    pre: list[dict[str, Any]] = []
    post: list[dict[str, Any]] = []
    for row in raw:
        if not isinstance(row, dict) or row.get("type") == "divider":
            continue
        timing = str(row.get("timing") or "pre").lower()
        if timing == "post":
            post.append(row)
        else:
            pre.append(row)
    return pre, post


def _sample_strategy_variable_values(
    defs: list[dict[str, Any]],
    rng: random.Random,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for d in defs:
        vtype = str(d.get("vtype") or "yesno").lower()
        if vtype == "multi":
            opts = [str(o) for o in (d.get("options") or []) if str(o).strip()]
            value = rng.choice(opts) if opts else "Yes"
        else:
            value = rng.choice(["Yes", "No"])
        out.append(
            {
                "id": str(d.get("id") or d.get("name") or ""),
                "name": str(d.get("name") or d.get("id") or ""),
                "vtype": "multi" if vtype == "multi" else "yesno",
                "value": value,
            }
        )
    return out


def _tags_from_strategy_variables(vars_: list[dict[str, Any]]) -> list[str]:
    tags: list[str] = []
    for v in vars_:
        name = str(v.get("name") or v.get("id") or "").strip()
        val = str(v.get("value") or "").strip()
        if name and val:
            tags.append(f"{name}: {val}")
        elif name:
            tags.append(name)
        elif val:
            tags.append(val)
    return tags


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
    scenario: str = "balanced",
) -> dict[str, Any]:
    contract = extract_session_contract(session_public)
    warnings: list[str] = []
    if not contract["tickers"]:
        return {"trades": [], "errors": ["Session has no tickers configured"], "warnings": warnings, "contract": contract}

    scenario_key = normalize_seed_scenario(scenario)
    profile = SEED_SCENARIO_PROFILES[scenario_key]
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
    win_rate = float(profile.get("win_rate") or 0.52)
    if contract["trading_mode"] == "prop":
        win_rate = min(win_rate, 0.50)

    for ticker in tickers:
        if ticker not in bars_by_ticker or not bars_by_ticker[ticker]:
            warnings.append(f"No market bars loaded for {ticker}; using fallback prices from session defaults.")

    trades: list[dict[str, Any]] = []
    scenario_counts: dict[str, int] = {}

    for i in range(count):
        ticker = tickers[i % len(tickers)]
        inst = contract["instruments"].get(ticker) or {}
        pip = float(inst.get("pip") or 0.0001)
        spread = float(inst.get("spread") or 1.0)
        pip_value = float(inst.get("pip_value") or 10.0)
        commission = float(inst.get("commission") or 0.0)
        market = str(inst.get("market") or "Forex")
        bars = bars_by_ticker.get(ticker) or []

        trade_scenario = _pick_trade_scenario(rng, profile, i, count)
        scenario_counts[trade_scenario] = scenario_counts.get(trade_scenario, 0) + 1

        entry_ms = start_ms + int((i + rng.random()) / max(count, 1) * span)
        entry_ms = min(max(entry_ms, start_ms), end_ms - 60_000)
        hold_ms, hold_minutes = _hold_range_ms(contract["timeframe"], rng)
        if trade_scenario == "multi_day_hold":
            hold_ms = rng.randint(2, 7) * 24 * 3600 * 1000
            hold_minutes = hold_ms // 60000
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
        if trade_scenario in ("mega_win", "mega_loss", "gap_loss"):
            sl_dist = max(pip * rng.uniform(3, 10), sl_dist * 0.5)
        planned_rr = rng.choice([1.0, 1.5, 2.0, 2.5, 3.0])
        if trade_scenario in ("mega_win", "news_spike_win"):
            planned_rr = rng.uniform(4.0, 7.0)
        if direction == "BUY":
            stop = _price_fmt(entry - sl_dist, pip)
            target = _price_fmt(entry + sl_dist * planned_rr, pip)
        else:
            stop = _price_fmt(entry + sl_dist, pip)
            target = _price_fmt(entry - sl_dist * planned_rr, pip)

        outcome = _scenario_trade_outcome(rng, trade_scenario, win_rate=win_rate, planned_rr=planned_rr)
        r_mult = float(outcome["r_mult"])
        close_type = str(outcome["close_type"])
        if outcome["close_type"] == "SL":
            exit_price = stop
        elif outcome["close_type"] == "TP":
            exit_price = target
        elif outcome["close_type"] == "BE" or trade_scenario == "zero_pnl":
            exit_price = entry
        elif exit_bar:
            exit_price = _price_fmt(float(exit_bar.get("c") or entry), pip)
        else:
            move = sl_dist * abs(r_mult)
            if direction == "BUY":
                exit_price = _price_fmt(entry + move if r_mult >= 0 else entry - move, pip)
            else:
                exit_price = _price_fmt(entry - move if r_mult >= 0 else entry + move, pip)

        if risk_mode == "fixed":
            risk_amount = max(risk_pct, 10.0)
        else:
            risk_amount = balance * (risk_pct / 100.0)
        if trade_scenario == "oversized_lot":
            risk_amount *= rng.uniform(2.0, 4.0)
        elif trade_scenario == "micro_lot":
            risk_amount *= rng.uniform(0.05, 0.2)
        risk_amount = max(risk_amount, 10.0)
        pnl = round(r_mult * risk_amount, 2)
        if trade_scenario == "zero_pnl":
            pnl = 0.0
            r_mult = 0.0
        balance_after = round(balance + pnl, 2)
        balance = balance_after

        mae_r = abs(rng.uniform(0.05, 1.2 if not outcome["win"] else 0.85))
        mfe_r = abs(rng.uniform(0.1, max(0.25, abs(r_mult) + 0.5)))
        if trade_scenario == "left_on_table":
            mfe_r = rng.uniform(2.0, 5.5)
            mae_r = rng.uniform(0.7, 1.4)
        if outcome["win"]:
            mae_r = min(mae_r, max(abs(r_mult), 0.2))
        else:
            mfe_r = min(mfe_r, 1.3)
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

        pre_vars = _sample_strategy_variable_values(contract.get("pre_var_defs") or [], rng)
        post_vars = _sample_strategy_variable_values(contract.get("post_var_defs") or [], rng)
        pre_tags = _tags_from_strategy_variables(pre_vars)
        post_tags = _tags_from_strategy_variables(post_vars)
        if not pre_tags:
            pre_tags = [strategy]
        if not post_tags:
            post_tags = [post_tag]
        else:
            post_tags = list(dict.fromkeys(post_tags + [post_tag]))

        array_base = entry
        path = _build_trade_path_arrays(
            bars,
            entry_ms=entry_ms,
            exit_ms=exit_ms,
            direction=direction,
            array_base=array_base,
            initial_sl=stop,
            post_exit_candles=int(contract.get("post_exit_candles") or 50),
        )
        capture_ratio = round(abs(r_mult) / mfe_r, 4) if mfe_r else 0.0
        commission_total = round(commission * 2, 2) if commission else round(rng.uniform(0, 3.5), 2)

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
            "active_sl_at_exit": stop,
            "active_tps_at_exit": [{"price": target, "percentage": 100, "hit": close_type == "TP"}],
            "array_base_price": array_base,
            "netPnL": pnl,
            "pnl": pnl,
            "realizedPnL": pnl,
            "finalClosePnL": pnl,
            "rMultiple": round(r_mult, 4),
            "actual_rr_net": round(abs(r_mult), 4),
            "actualRR": round(abs(r_mult), 4),
            "actual_rr_gross": round(abs(r_mult), 4),
            "actual_risk_r": 1.0,
            "rewardToRiskRatio": planned_rr,
            "plannedRR": planned_rr,
            "plannedRRAtEntry": round(planned_rr, 4),
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
            "total_mfe_r": round(mfe_r, 4),
            "highestPrice": highest,
            "lowestPrice": lowest,
            "spread_pips_at_entry": spread,
            "commission_at_entry": commission,
            "commission_total": commission_total,
            "pip_value_at_entry": pip_value,
            "setup": strategy,
            "tag": strategy,
            "strategy_id": contract.get("strategy_id"),
            "strategy_variables": pre_vars or None,
            "post_strategy_variables": post_vars or None,
            "market": market,
            "dayOfWeek": DAYS[entry_dt.weekday()],
            "month": MONTHS[entry_dt.month - 1],
            "year": entry_dt.year,
            "hourOfEntry": entry_dt.hour,
            "hourOfExit": datetime.fromtimestamp(exit_ms / 1000.0, tz=timezone.utc).hour,
            "entryMarkerTimeMs": float(entry_ms),
            "mfeTime": float(entry_ms + rng.randint(1000, max(2000, (exit_ms - entry_ms) // 2))),
            "maeTime": float(exit_ms - rng.randint(1000, min(600000, max(2000, (exit_ms - entry_ms) // 3)))),
            "sourceSessionName": session_name,
            "sourceSessionId": session_id,
            "trading_session_id": session_id,
            "sourceKey": f"session:{session_id}",
            "sourceFilterKey": f"session:{session_id}",
            "sourceLabel": session_name,
            "sourceType": "backtest",
            "seedSource": "session-demo-seed",
            "seedScenario": trade_scenario,
            "seedProfile": scenario_key,
            "rulesFollowed": outcome["rules_followed"],
            "hasPartialCloses": outcome["has_partial"],
            "partialClosePnL": round(pnl * 0.5, 2) if outcome["has_partial"] else 0,
            "partialCloses": [{"pct": 50, "pnl": round(pnl * 0.5, 2)}] if outcome["has_partial"] else [],
            "isSplitEntry": outcome["is_split"],
            "isScaledTrade": outcome["is_scaled"],
            "would_have_won": outcome["would_have_won"],
            "preTags": pre_tags,
            "postTags": post_tags,
            "tags": list(dict.fromkeys(pre_tags + post_tags)),
            "postTradeNotes": {
                "seed": True,
                "alignedToSession": True,
                "scenario": trade_scenario,
                "profile": scenario_key,
                "postStrategyVariables": post_vars or None,
            },
            "balance_at_creation": round(balance - pnl, 2),
            "balance_at_exit": balance_after,
            "capture_ratio": capture_ratio,
            "exit_confirmed": True,
            "exit_timing_gap": round(mfe_r - abs(r_mult), 4),
            "entry_offset_r": 0.0,
            "bar_close_r": path["bar_close_r"],
            "bar_high_r": path["bar_high_r"],
            "bar_low_r": path["bar_low_r"],
            "post_exit_bar_close_r": path["post_exit_bar_close_r"],
            "post_exit_bar_high_r": path["post_exit_bar_high_r"],
            "post_exit_bar_low_r": path["post_exit_bar_low_r"],
            "post_exit_anchor_time": path["post_exit_anchor_time"],
            "final_exit_bar": path["final_exit_bar"],
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
            "scenario": scenario_key,
            "scenario_label": profile["label"],
            "scenario_counts": scenario_counts,
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
