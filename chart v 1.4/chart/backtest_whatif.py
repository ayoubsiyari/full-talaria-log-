"""
Backtest what-if analytics: compute, Redis job queue, and result cache.
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
from datetime import datetime
from typing import Any

import chart_redis
from analytics_engine import (
    build_expectancy_heatmap,
    build_histogram,
    compute_equity_summary,
    compute_per_instrument_summary,
    compute_playbook_breakdown,
    compute_recent_trades,
    compute_session_dashboard_extras,
    compute_stats,
    filter_by_instrument,
    normalize_trades,
    simulate_equity_curve,
)

WHATIF_ASYNC_ENABLED = os.getenv("BACKTEST_WHATIF_ASYNC", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
WHATIF_CACHE_TTL_SEC = max(60, int(os.getenv("BACKTEST_WHATIF_CACHE_TTL_SEC", "900")))
WHATIF_JOB_TTL_SEC = max(120, int(os.getenv("BACKTEST_WHATIF_JOB_TTL_SEC", "900")))
WHATIF_MAX_RESULT_BYTES = max(256_000, int(os.getenv("BACKTEST_WHATIF_MAX_RESULT_BYTES", "4000000")))


def whatif_async_available() -> bool:
    return WHATIF_ASYNC_ENABLED and chart_redis.get_client() is not None


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


def filter_journal_raw_trades(
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


def session_strategy_id_from_config(cfg: dict) -> int | None:
    try:
        raw_sid = cfg.get("strategy_id") or cfg.get("strategyId")
        if raw_sid is not None:
            return int(raw_sid)
    except Exception:
        pass
    return None


def build_whatif_cache_key(
    *,
    session_id: int,
    pair_filter: str,
    playbook_filter: str,
    strategy_filter: str,
    outcome_filter: str,
    heatmap_pair: str,
    tp_r: float,
    sl_r: float,
    journal_version: str,
) -> str:
    raw = json.dumps(
        {
            "session_id": int(session_id),
            "pair_filter": pair_filter,
            "playbook_filter": playbook_filter,
            "strategy_filter": strategy_filter,
            "outcome_filter": outcome_filter,
            "heatmap_pair": heatmap_pair,
            "tp_r": round(float(tp_r), 4),
            "sl_r": round(float(sl_r), 4),
            "journal_version": journal_version,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:40]


def journal_version_token(updated_at: datetime | None) -> str:
    if updated_at is None:
        return "0"
    try:
        return updated_at.isoformat()
    except Exception:
        return str(updated_at)


def compute_backtest_whatif_payload(
    *,
    session_id: int,
    journal: list,
    session_public: dict,
    sess_strategy_id: int | None,
    pair_filter: str,
    playbook_filter: str,
    strategy_filter: str,
    outcome_filter: str,
    heatmap_pair: str,
    tp_r: float,
    sl_r: float,
    start_balance: float | None,
) -> dict[str, Any]:
    pair_filter = str(pair_filter or "ALL").strip().upper().replace("/", "")
    playbook_filter = str(playbook_filter or "ALL").strip()
    strategy_filter = str(strategy_filter or "ALL").strip()
    outcome_filter = str(outcome_filter or "ALL").strip().upper()
    heatmap_scope = str(heatmap_pair or "ALL").strip().upper().replace("/", "")

    filtered_raw = filter_journal_raw_trades(
        journal,
        pair_filter,
        playbook_filter,
        outcome_filter,
        strategy_filter,
        session_strategy_id=sess_strategy_id,
    )

    normalized = normalize_trades(filtered_raw)
    tp_r = max(0.1, float(tp_r))
    sl_r = max(0.1, float(sl_r))

    equity_curve = simulate_equity_curve(normalized, tp_r=tp_r, sl_r=sl_r)
    heatmap_trades = filter_by_instrument(normalized, heatmap_scope)
    heatmap = build_expectancy_heatmap(heatmap_trades)
    per_instrument = compute_per_instrument_summary(normalized)
    mae_distribution = build_histogram([t.mae_r for t in normalized], bucket_size=0.5)
    mfe_distribution = build_histogram([t.mfe_r for t in normalized], bucket_size=0.5)
    stats = compute_stats(normalized)
    playbook_breakdown = compute_playbook_breakdown(normalized)
    recent_trades = compute_recent_trades(normalized, limit=15)
    equity_summary = compute_equity_summary(equity_curve)
    session_analytics = compute_session_dashboard_extras(normalized, start_balance)

    return {
        "meta": {
            "session_id": session_id,
            "pair_filter": pair_filter,
            "playbook_filter": playbook_filter,
            "strategy_filter": strategy_filter,
            "outcome_filter": outcome_filter,
            "heatmap_pair": heatmap_scope,
            "tp_r": tp_r,
            "sl_r": sl_r,
            "trades_in_scope": len(normalized),
            "heatmap_trades_in_scope": len(heatmap_trades),
        },
        "equity_curve": equity_curve,
        "heatmap": heatmap,
        "per_instrument": per_instrument,
        "mae_distribution": mae_distribution,
        "mfe_distribution": mfe_distribution,
        "stats": stats,
        "playbook_breakdown": playbook_breakdown,
        "recent_trades": recent_trades,
        "equity_summary": equity_summary,
        "session_analytics": session_analytics,
    }


def new_job_id() -> str:
    return secrets.token_urlsafe(18)


def enqueue_whatif_job(job: dict) -> bool:
    return chart_redis.whatif_enqueue_job(job)


def get_cached_whatif(cache_key: str) -> dict | None:
    return chart_redis.whatif_get_cache(cache_key)


def set_cached_whatif(cache_key: str, result: dict) -> None:
    chart_redis.whatif_set_cache(cache_key, result, WHATIF_CACHE_TTL_SEC)


def get_whatif_job(job_id: str) -> dict | None:
    return chart_redis.whatif_get_job(job_id)


def set_whatif_job(job_id: str, data: dict) -> None:
    chart_redis.whatif_set_job(job_id, data, WHATIF_JOB_TTL_SEC)


def claim_next_whatif_job_id(timeout_sec: float) -> str | None:
    return chart_redis.whatif_brpop_job(timeout_sec)
