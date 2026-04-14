"""
Forex news for replay/backtest: fetch third-party JSON server-side (API keys stay off the client).
Primary: Finnhub market news (forex category). Fallback: deterministic demo items for UI/dev.
"""
from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests

FINNHUB_NEWS_URL = "https://finnhub.io/api/v1/news"


def _normalize_item(raw: Dict[str, Any], demo: bool = False) -> Dict[str, Any]:
    ts = raw.get("datetime")
    try:
        ts_int = int(ts)
    except (TypeError, ValueError):
        ts_int = 0
    iso = ""
    if ts_int > 0:
        iso = datetime.fromtimestamp(ts_int, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "id": raw.get("id"),
        "datetime": ts_int,
        "datetime_iso": iso,
        "headline": (raw.get("headline") or "")[:500],
        "summary": (raw.get("summary") or "")[:2000],
        "source": raw.get("source") or "",
        "url": raw.get("url") or "",
        "related": raw.get("related") or "",
        "demo": demo,
    }


def _symbol_keywords(symbol: str) -> List[str]:
    s = (symbol or "").upper().replace("/", "").replace("-", "").strip()
    if len(s) >= 6 and s.isalpha():
        return [s[:3], s[3:6]]
    return []


def _item_matches_symbol(item: Dict[str, Any], symbol: str) -> bool:
    keys = _symbol_keywords(symbol)
    if not keys:
        return True
    rel = (item.get("related") or "").upper()
    head = (item.get("headline") or "").upper()
    blob = f"{rel} {head}"
    return any(k in blob for k in keys)


def fetch_finnhub_forex_window(
    start_sec: int,
    end_sec: int,
    token: str,
    symbol: str = "",
    max_pages: int = 12,
) -> List[Dict[str, Any]]:
    """Paginate Finnhub forex news and return items whose unix time lies in [start_sec, end_sec]."""
    if not token or not start_sec or not end_sec or end_sec < start_sec:
        return []

    out: List[Dict[str, Any]] = []
    min_id: Optional[int] = None
    seen_ids = set()

    for _ in range(max_pages):
        params: Dict[str, Any] = {"category": "forex", "token": token}
        if min_id is not None:
            params["minId"] = min_id
        try:
            r = requests.get(FINNHUB_NEWS_URL, params=params, timeout=18)
        except requests.RequestException:
            break
        if r.status_code != 200:
            break
        data = r.json()
        if not isinstance(data, list) or not data:
            break
        batch_ids = []
        for it in data:
            if not isinstance(it, dict):
                continue
            iid = it.get("id")
            if iid in seen_ids:
                continue
            seen_ids.add(iid)
            batch_ids.append(iid)
            ts = it.get("datetime")
            try:
                ts_int = int(ts)
            except (TypeError, ValueError):
                continue
            if start_sec <= ts_int <= end_sec:
                norm = _normalize_item(it, demo=False)
                if _item_matches_symbol(norm, symbol):
                    out.append(norm)
        if not batch_ids:
            break
        next_min = max(int(x) for x in batch_ids if x is not None)
        if min_id is not None and next_min <= min_id:
            break
        min_id = next_min
        # Heuristic stop: if entire batch is older than window start, further pages may not help
        times = [int(x["datetime"]) for x in data if isinstance(x, dict) and x.get("datetime") is not None]
        if times and max(times) < start_sec:
            break

    # Newest first in UI
    out.sort(key=lambda x: x.get("datetime", 0), reverse=True)
    return out[:100]


def build_demo_news(
    start_ms: int,
    end_ms: int,
    symbol: str = "",
) -> List[Dict[str, Any]]:
    """
    Deterministic demo headlines per UTC day so backtests feel stable without API keys.
    """
    pair = (symbol or "EURUSD").upper().replace("/", "").replace("-", "")[:6] or "EURUSD"
    if len(pair) < 6:
        pair = (pair + "USDXXX")[:6]

    start_sec = int(start_ms // 1000)
    end_sec = int(end_ms // 1000)
    day_key = datetime.utcfromtimestamp((start_sec + end_sec) // 2).strftime("%Y-%m-%d")
    h = hashlib.sha256(f"{day_key}:{pair}".encode()).hexdigest()

    seeds = [int(h[i : i + 8], 16) for i in range(0, 32, 8)]
    templates = [
        "FX focus: {pair} positioning into the London fix",
        "Rate expectations drive {pair} as data flow crosses the tape",
        "Liquidity pockets and session flows around {pair}",
        "Cross-asset moves spill into {pair} spot",
        "Central bank rhetoric keeps {pair} two-way",
    ]
    items = []
    base = start_sec + max(0, (end_sec - start_sec) // 6)
    for i, tmpl in enumerate(templates):
        ts = min(max(base + (seeds[i % len(seeds)] % 3600) - 1800, start_sec), end_sec)
        headline = tmpl.format(pair=pair[:3] + "/" + pair[3:6])
        raw = {
            "id": f"demo-{day_key}-{i}",
            "datetime": ts,
            "headline": headline,
            "summary": "Demo headline for replay — set FINNHUB_API_KEY on the server for live forex news.",
            "source": "Talaria (demo)",
            "url": "",
            "related": f"{pair[:3]},{pair[3:6]}",
        }
        items.append(_normalize_item(raw, demo=True))
    items.sort(key=lambda x: x.get("datetime", 0), reverse=True)
    return items


def get_replay_news_payload(
    start_ms: int,
    end_ms: int,
    symbol: str = "",
) -> Dict[str, Any]:
    """
    Returns { success, items, source, message }.
    Max window 31 days; requests beyond that are clamped with a warning message.
    """
    MAX_MS = 31 * 24 * 60 * 60 * 1000
    msg_parts: List[str] = []

    if end_ms <= start_ms:
        return {
            "success": False,
            "items": [],
            "source": "none",
            "message": "end_ts must be greater than start_ts",
        }

    span = end_ms - start_ms
    if span > MAX_MS:
        end_ms = start_ms + MAX_MS
        msg_parts.append("Window limited to 31 days per request.")

    start_sec = int(start_ms // 1000)
    end_sec = int(end_ms // 1000)

    token = (os.environ.get("FINNHUB_API_KEY") or os.environ.get("FINNHUB_API_TOKEN") or "").strip()
    items: List[Dict[str, Any]] = []
    source = "none"

    if token:
        items = fetch_finnhub_forex_window(start_sec, end_sec, token, symbol=symbol)
        if not items and symbol:
            items = fetch_finnhub_forex_window(start_sec, end_sec, token, symbol="")
        if items:
            source = "finnhub"
        else:
            msg_parts.append(
                "No Finnhub forex headlines in this time range (coverage is often recent-only). "
                "Showing deterministic demo lines for replay."
            )

    if not items:
        items = build_demo_news(start_ms, end_ms, symbol=symbol)
        if source == "none":
            source = "demo"
            msg_parts.append(
                "Live news: set FINNHUB_API_KEY in journal-backend environment (Finnhub forex category)."
            )
        else:
            source = "demo_fallback"

    return {
        "success": True,
        "items": items,
        "source": source,
        "message": " ".join(msg_parts) if msg_parts else None,
        "window": {"start_ts": start_ms, "end_ts": end_ms},
    }
