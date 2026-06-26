#!/usr/bin/env python3
"""
Seed 10 diverse Strategy Builder strategies for usability testing.
Uses journal API (login + POST /strategies) with full builder fields except real screenshots.
"""
from __future__ import annotations

import argparse
import base64
import json
import sys
import time
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import quote, urlparse

# Canvas layout constants (match TalariaV16.jsx)
COND_W, COND_H, COND_COLS = 220, 275, 6
STRIP_W = 200
SEC_W, SEC_H, SEC_GAP, SEC_X = 1400, 325, 72, 0

SECTION_COLOR_CYCLE = [
    {"ac": "rgba(38,67,247,0.9)", "bd": "rgba(38,67,247,0.25)", "bg": "rgba(38,67,247,0.035)", "hdr": "rgba(38,67,247,0.07)"},
    {"ac": "rgba(6,182,212,0.9)", "bd": "rgba(6,182,212,0.25)", "bg": "rgba(6,182,212,0.035)", "hdr": "rgba(6,182,212,0.07)"},
    {"ac": "rgba(34,197,94,0.9)", "bd": "rgba(34,197,94,0.25)", "bg": "rgba(34,197,94,0.035)", "hdr": "rgba(34,197,94,0.07)"},
    {"ac": "rgba(201,168,76,0.9)", "bd": "rgba(201,168,76,0.25)", "bg": "rgba(201,168,76,0.035)", "hdr": "rgba(201,168,76,0.07)"},
    {"ac": "rgba(168,85,247,0.9)", "bd": "rgba(168,85,247,0.25)", "bg": "rgba(168,85,247,0.035)", "hdr": "rgba(168,85,247,0.07)"},
]


def dummy_image(title: str, subtitle: str, color: str = "#2643F7") -> dict[str, str]:
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="720" height="360" viewBox="0 0 720 360">
      <rect width="720" height="360" fill="#080B14"/>
      <path d="M58 282C112 244 184 214 310 142C456 78 660 28" fill="none" stroke="{color}" stroke-width="5"/>
      <rect x="28" y="24" width="310" height="64" fill="#000" opacity="0.76"/>
      <text x="46" y="50" fill="#FFFFFF" font-family="Arial" font-size="17" font-weight="700">{title}</text>
      <text x="46" y="73" fill="#A8B0C2" font-family="Arial" font-size="13">{subtitle}</text>
    </svg>"""
    return {"name": f"{title}.svg", "src": f"data:image/svg+xml;charset=utf-8,{quote(svg)}"}


def get_slot_positions(section_y: float) -> list[dict[str, float]]:
    avail_w = SEC_W - STRIP_W - 32
    full_row_w = COND_COLS * COND_W + (COND_COLS - 1) * 96
    local_start_x = STRIP_W + 16 + max(0, (avail_w - full_row_w) / 2)
    local_y = (SEC_H - COND_H) / 2
    return [
        {"x": SEC_X + local_start_x + i * (COND_W + 96), "y": section_y + local_y}
        for i in range(COND_COLS)
    ]


def build_canvas_nodes(groups: list[dict[str, Any]], stamp: int) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    for gi, group in enumerate(groups):
        color = SECTION_COLOR_CYCLE[gi % len(SECTION_COLOR_CYCLE)]
        section_id = f"sec_{stamp}_{gi}"
        section_y = gi * (SEC_H + SEC_GAP)
        conditions = (group.get("conditions") or [])[:COND_COLS]
        filled_slots = list(range(len(conditions)))
        connectors = group.get("connectors") or ["AND"] * (COND_COLS - 1)
        while len(connectors) < COND_COLS - 1:
            connectors.append("OFF")

        nodes.append({
            "id": section_id,
            "type": "section",
            "position": {"x": SEC_X, "y": section_y},
            "style": {"width": SEC_W, "height": SEC_H},
            "width": SEC_W,
            "height": SEC_H,
            "draggable": False,
            "selectable": False,
            "focusable": False,
            "data": {
                **color,
                "sectionId": section_id,
                "label": group["name"],
                "description": group.get("description", ""),
                "images": group.get("images") or [],
                "condCount": len(filled_slots),
                "filledSlots": filled_slots,
                "connectors": connectors,
            },
            "zIndex": -1,
        })

        positions = get_slot_positions(section_y)
        for ci, cond in enumerate(conditions):
            nodes.append({
                "id": f"cond_{stamp}_{gi}_{ci}",
                "type": "condition",
                "position": positions[ci],
                "style": {"width": COND_W, "height": COND_H},
                "draggable": True,
                "selectable": False,
                "dragHandle": ".tlc-drag-grip",
                "data": {
                    "label": cond["label"],
                    "description": cond.get("description", ""),
                    "images": cond.get("images") or [],
                    "sectionId": section_id,
                    "slot": ci,
                    "status": cond.get("status", "mandatory"),
                    "sectionColor": color["ac"],
                },
            })
    return nodes


def make_variable(vid: str, name: str, timing: str, vtype: str = "multi", options: list[str] | None = None) -> dict[str, Any]:
    row: dict[str, Any] = {
        "id": vid,
        "type": "variable",
        "name": name,
        "timing": timing,
        "vtype": vtype,
    }
    if vtype == "multi":
        row["options"] = options or []
    return row


def build_variables(pre_specs: list[tuple[str, str, list[str] | None]], post_specs: list[tuple[str, str, list[str] | None]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, (name, vtype, opts) in enumerate(pre_specs):
        out.append(make_variable(f"pre_{i}_{int(time.time())}", name, "pre", vtype, opts))
    out.append({"type": "divider", "id": "div0"})
    for i, (name, vtype, opts) in enumerate(post_specs):
        out.append(make_variable(f"post_{i}_{int(time.time())}", name, "post", vtype, opts))
    return out


def execution_risk_group() -> dict[str, Any]:
    return {
        "name": "EXECUTION & RISK",
        "description": "Define entry trigger, order type, stop placement, and profit targets before execution.",
        "images": [dummy_image("Execution Plan", "Entry, stop, and target rules", "#C9A84C")],
        "conditions": [
            {"status": "mandatory", "label": "Entry trigger defined", "description": "Use stop, limit, or market only after the setup confirms on the execution timeframe.", "images": [dummy_image("Entry Trigger", "Confirmed setup only", "#2643F7")]},
            {"status": "mandatory", "label": "Stop beyond invalidation", "description": "Stop sits where the trade thesis is wrong, not at an arbitrary pip count.", "images": [dummy_image("Stop Placement", "Structural invalidation", "#EF4444")]},
            {"status": "mandatory", "label": "Minimum 2R planned", "description": "Skip trades where the nearest opposing level blocks at least 2R reward.", "images": [dummy_image("Reward Target", "2R minimum", "#22C55E")]},
            {"status": "optional", "label": "Partial at 1R", "description": "Take partial profit at 1R when volatility is elevated or session is ending.", "images": []},
        ],
        "connectors": ["AND", "AND", "AND", "OFF", "OFF"],
    }


def bank_row_to_api_body(strat: dict[str, Any]) -> dict[str, Any]:
    """Mirror homepage bankStrategyToApiBody."""
    name = (strat.get("name") or "Untitled Strategy").strip() or "Untitled Strategy"
    desc = (strat.get("desc") or "").strip()
    gallery = strat.get("images") or []
    cover = gallery[0]["src"] if gallery else ""
    instruments = strat.get("instruments") or []
    markets = strat.get("markets") or []
    timeframes = strat.get("timeframes") or []

    core = {
        "instruments": instruments,
        "market_categories": markets,
        "instrument": instruments[0] if instruments else "",
        "style": strat.get("style") or "",
        "direction": strat.get("direction") or "both",
        "timeframe": timeframes[0] if timeframes else "",
        "conditions": strat.get("conditions") or [],
        "variables": strat.get("variables") or [],
        "cover_image": cover,
    }

    talaria_v9 = {
        "icon": strat.get("icon") or "",
        "tags": strat.get("tags") or [],
        "complexity": strat.get("complexity") or "Medium",
        "desc": desc,
        "tree": strat.get("tree"),
        "instruments": instruments,
        "timeframes": timeframes,
        "markets": markets,
        "conditions": strat.get("conditions") or [],
        "variables": strat.get("variables") or [],
        "images": gallery or None,
        "supportInst": strat.get("supportInst") or [],
        "canvasNodes": strat.get("canvasNodes") or [],
        "canvasEdges": strat.get("canvasEdges") or [],
    }
    # drop None images key
    if talaria_v9["images"] is None:
        del talaria_v9["images"]

    return {
        "name": name,
        "description": desc,
        "strategy_definition": {
            **core,
            "strategy_tags": strat.get("tags") or [],
            "talaria_v9": talaria_v9,
        },
    }


def build_strategies() -> list[dict[str, Any]]:
    stamp_base = int(time.time() * 1000)
    specs: list[dict[str, Any]] = []

  # 1 — ultra scalping
    s1_groups = [
        {"name": "MICRO TREND", "description": "Confirm one-sided pressure on the 1m chart before fading noise.", "images": [dummy_image("1m Trend", "Micro slope filter", "#2643F7")], "conditions": [
            {"status": "mandatory", "label": "1m EMA 9 above EMA 21 for longs", "description": "Ribbon must slope with trade direction for at least 5 candles.", "images": [dummy_image("EMA Ribbon", "1m alignment", "#2643F7")]},
            {"status": "mandatory", "label": "Spread under 0.8 pips", "description": "Skip wide-spread periods around rollovers and news.", "images": []},
            {"status": "invalidate", "label": "ATR spike > 150% average", "description": "Volatility expansion invalidates tight scalps.", "images": [dummy_image("Volatility Filter", "ATR guard", "#EF4444")]},
        ], "connectors": ["AND", "AND", "OFF", "OFF", "OFF"]},
        {"name": "TRIGGER", "description": "Enter on momentum resumption after a shallow 1m pullback.", "conditions": [
            {"status": "mandatory", "label": "Pullback holds prior swing", "description": "Shallow reset — no deep counter-trend candles.", "images": []},
            {"status": "mandatory", "label": "Break of pullback high/low", "description": "Stop entry beyond trigger candle.", "images": [dummy_image("Scalp Trigger", "Break confirmation", "#22C55E")]},
        ], "connectors": ["AND", "OFF", "OFF", "OFF", "OFF"]},
        execution_risk_group(),
    ]
    specs.append({
        "name": "1-Min Momentum Scalper",
        "icon": "⚡",
        "style": "Scalping",
        "complexity": "Hard",
        "direction": "both",
        "desc": "Ultra-short-term momentum scalps on major FX pairs during liquid sessions. Targets 5–12 pip moves with tight structural stops and strict spread filters. Only trade when the 1m ribbon aligns and volatility is contained.",
        "instruments": ["EURUSD", "GBPUSD"],
        "supportInst": ["USDJPY"],
        "markets": ["forex"],
        "timeframes": ["1m", "5m"],
        "tags": ["Scalping", "Momentum", "Forex", "Beginner-friendly"],
        "images": [dummy_image("1-Min Scalper", "Micro momentum playbook", "#06b6d4"), dummy_image("Session Window", "London/NY overlap", "#2643F7")],
        "groups": s1_groups,
        "pre": [("Session", "multi", ["London", "NY Overlap", "Asian"])],
        "post": [("Exit Quality", "multi", ["Clean", "Early", "Late", "Stopped"])],
    })

    # 2 — session scalping
    s2_groups = [
        {"name": "SESSION", "description": "Trade only during the London opening hour when liquidity is deepest.", "conditions": [
            {"status": "mandatory", "label": "Time 07:00–10:00 UTC", "description": "London open window for EUR and GBP pairs.", "images": [dummy_image("London Open", "Session filter", "#C9A84C")]},
            {"status": "mandatory", "label": "No high-impact news ±20 min", "description": "Stand aside around scheduled releases.", "images": []},
        ], "connectors": ["AND", "OFF", "OFF", "OFF", "OFF"]},
        {"name": "LIQUIDITY", "description": "Wait for a sweep of Asian session extremes.", "conditions": [
            {"status": "mandatory", "label": "Sweep of Asian high/low", "description": "Price trades through overnight extreme then rejects.", "images": [dummy_image("Liquidity Sweep", "Asian range grab", "#7C3AED")]},
            {"status": "optional", "label": "Volume above session average", "description": "Participation improves reversal follow-through.", "images": []},
        ], "connectors": ["AND", "OFF", "OFF", "OFF", "OFF"]},
        execution_risk_group(),
    ]
    specs.append({
        "name": "London Open Liquidity Scalp",
        "icon": "🌅",
        "style": "Scalping",
        "complexity": "Medium",
        "direction": "both",
        "desc": "Fade liquidity grabs at Asian session extremes during the first 90 minutes of London. Tight invalidation beyond the sweep wick; targets the Asian midpoint or opposite extreme.",
        "instruments": ["EURUSD", "GBPUSD", "EURGBP"],
        "markets": ["forex"],
        "timeframes": ["5m", "15m"],
        "tags": ["Session-based", "Liquidity", "Mean Reversion", "Forex"],
        "images": [dummy_image("Asian Range", "Overnight liquidity map", "#06b6d4")],
        "groups": s2_groups,
        "pre": [("HTF Bias", "multi", ["Bullish", "Bearish", "Neutral"]), ("Asian Range Quality", "yesno", None)],
        "post": [("Target Reached", "yesno", None), ("Exited Early", "multi", ["Yes - fear", "Yes - news", "No"])],
    })

    # 3 — intraday VWAP
    s3_groups = [
        {"name": "SESSION CONTEXT", "description": "VWAP reclaim works best in liquid regular sessions.", "conditions": [
            {"status": "mandatory", "label": "Regular session open", "description": "Avoid thin pre-market ranges.", "images": []},
            {"status": "mandatory", "label": "Instrument above avg volume", "description": "Participation required for VWAP respect.", "images": [dummy_image("Volume Filter", "Liquidity check", "#22C55E")]},
        ], "connectors": ["AND", "OFF", "OFF", "OFF", "OFF"]},
        {"name": "RECLAIM", "description": "Price must lose then reclaim VWAP with intent.", "conditions": [
            {"status": "mandatory", "label": "Deviation below VWAP", "description": "Creates trapped sellers.", "images": [dummy_image("VWAP Deviation", "Below fair value", "#2643F7")]},
            {"status": "mandatory", "label": "Close back above VWAP", "description": "Close confirmation, not wick only.", "images": []},
            {"status": "invalidate", "label": "Reclaim into major resistance", "description": "Skip if no room to target.", "images": [dummy_image("Room to Target", "Structure check", "#EF4444")]},
        ], "connectors": ["AND", "AND", "OFF", "OFF", "OFF"]},
        {"name": "ENTRY", "description": "Enter on controlled pullback to VWAP.", "conditions": [
            {"status": "mandatory", "label": "Pullback holds VWAP", "description": "VWAP flips from resistance to support.", "images": [dummy_image("VWAP Retest", "Value zone entry", "#C9A84C")]},
            {"status": "optional", "label": "Volume expands on reclaim", "description": "Improves follow-through odds.", "images": []},
        ], "connectors": ["AND", "OFF", "OFF", "OFF", "OFF"]},
        execution_risk_group(),
    ]
    specs.append({
        "name": "VWAP Reclaim Intraday",
        "icon": "📈",
        "style": "Mean Reversion",
        "complexity": "Medium",
        "direction": "long",
        "desc": "Intraday reversal playbook when price deviates below VWAP in liquid stocks and index futures, then reclaims with volume. Enter on the first controlled pullback with stop below the reclaim swing.",
        "instruments": ["ES", "NQ", "MES"],
        "supportInst": ["MNQ"],
        "markets": ["futures"],
        "timeframes": ["1m", "5m", "15m"],
        "tags": ["VWAP", "Intraday", "Reclaim", "Volume"],
        "images": [dummy_image("VWAP Reclaim", "Institutional fair value", "#2643F7"), dummy_image("Pullback Entry", "Retest zone", "#22C55E"), dummy_image("Session Map", "Regular hours only", "#06b6d4")],
        "groups": s3_groups,
        "pre": [("Market Regime", "multi", ["Trend Day", "Balance", "Unknown"]), ("Sector Confirmation", "yesno", None), ("Gap Type", "multi", ["None", "Gap Up", "Gap Down"])],
        "post": [("Capture Ratio", "multi", ["<25%", "25-50%", "50-75%", ">75%"])],
    })

    # 4 — ORB intraday
    specs.append({
        "name": "Opening Range Breakout",
        "icon": "⏱️",
        "style": "Breakout",
        "complexity": "Easy",
        "direction": "both",
        "desc": "Define the first 15-minute range, wait for a volume-backed closing break, and enter on retest or continuation. Structured rules for index futures and large-cap earnings gaps.",
        "instruments": ["ES", "NQ", "MES", "MNQ"],
        "markets": ["futures"],
        "timeframes": ["1m", "5m"],
        "tags": ["ORB", "Breakout", "Session", "Momentum", "Volume"],
        "images": [dummy_image("Opening Range", "First 15 minutes", "#2643F7")],
        "groups": [
            {"name": "RANGE", "description": "Build the opening range before breakout decisions.", "conditions": [
                {"status": "mandatory", "label": "First 15 minutes completed", "description": "Range must be fixed.", "images": []},
                {"status": "mandatory", "label": "Range not oversized vs ATR", "description": "Skip stretched opens.", "images": [dummy_image("Range Size", "ATR filter", "#C9A84C")]},
            ], "connectors": ["AND", "OFF", "OFF", "OFF", "OFF"]},
            {"name": "BREAK", "description": "Breakout needs momentum and volume.", "conditions": [
                {"status": "mandatory", "label": "Close outside opening range", "description": "Body close, not wick.", "images": [dummy_image("ORB Break", "Closing confirmation", "#22C55E")]},
                {"status": "mandatory", "label": "Volume above session average", "description": "Participation confirms move.", "images": []},
                {"status": "invalidate", "label": "Failed opposite-side break first", "description": "Avoid chop after both sides swept.", "images": [dummy_image("Chop Filter", "Both sides swept", "#EF4444")]},
            ], "connectors": ["AND", "AND", "OFF", "OFF", "OFF"]},
            execution_risk_group(),
        ],
        "pre": [
            ("Pre-Market Bias", "multi", ["Bullish", "Bearish", "Neutral"]),
            ("Economic Calendar", "multi", ["Clear", "Medium", "High Impact"]),
            ("Overnight Trend", "yesno", None),
            ("Gap Size", "multi", ["Small", "Medium", "Large"]),
        ],
        "post": [
            ("Break Quality", "multi", ["Clean", "Messy", "False"]),
            ("Retest Taken", "yesno", None),
            ("Rules Followed", "yesno", None),
        ],
    })

    # 5 — 4H trend pullback (swing)
    specs.append({
        "name": "4H Trend Pullback Swing",
        "icon": "🎯",
        "style": "Trend Following",
        "complexity": "Medium",
        "direction": "both",
        "desc": "Join established 4H trends after controlled pullbacks into the 20 EMA zone. Requires ADX confirmation, RSI reset, and a rejection candle on the 1H execution timeframe. Minimum 2R to next liquidity pool.",
        "instruments": ["EURUSD", "GBPUSD", "XAUUSD"],
        "markets": ["forex"],
        "timeframes": ["1h", "4h"],
        "tags": ["Trend Following", "Multi-Timeframe", "Pullback", "Intermediate"],
        "images": [dummy_image("4H Trend", "Higher timeframe bias", "#2643F7"), dummy_image("Pullback Zone", "20 EMA value", "#C9A84C")],
        "groups": [
            {"name": "TREND", "description": "Higher timeframe must show clear directional bias.", "images": [dummy_image("Trend Filter", "4H structure", "#2643F7")], "conditions": [
                {"status": "mandatory", "label": "Price above 200 EMA on 4H", "description": "Regime filter for longs; mirror for shorts.", "images": []},
                {"status": "mandatory", "label": "ADX > 25 on 4H", "description": "Directional strength required.", "images": [dummy_image("ADX", "Trend strength", "#22C55E")]},
                {"status": "optional", "label": "Clean HH/HL structure", "description": "Preferred but not mandatory.", "images": []},
            ], "connectors": ["AND", "AND", "OFF", "OFF", "OFF"]},
            {"name": "PULLBACK", "description": "Location must offer tight risk.", "conditions": [
                {"status": "mandatory", "label": "Pullback to 20 EMA on 1H", "description": "Controlled retrace into value.", "images": []},
                {"status": "mandatory", "label": "RSI 35-55 on 1H", "description": "Momentum reset without reversal.", "images": []},
                {"status": "invalidate", "label": "Move already >1.5R from low", "description": "Do not chase.", "images": [dummy_image("No Chase", "Late entry filter", "#EF4444")]},
            ], "connectors": ["AND", "AND", "OFF", "OFF", "OFF"]},
            {"name": "ENTRY", "description": "Trigger after rejection at value.", "conditions": [
                {"status": "mandatory", "label": "Engulfing or pin bar on 1H", "description": "Rejection at pullback zone.", "images": [dummy_image("Entry Candle", "Rejection pattern", "#2643F7")]},
                {"status": "mandatory", "label": "Close beyond prior candle", "description": "Momentum confirmation.", "images": []},
            ], "connectors": ["AND", "OFF", "OFF", "OFF", "OFF"]},
            execution_risk_group(),
        ],
        "pre": [("HTF Bias Aligned", "yesno", None), ("News Clear", "yesno", None)],
        "post": [
            ("Target Reached", "multi", ["TP1", "TP2", "Full", "None"]),
            ("Moved SL", "multi", ["BE", "Trailed", "None"]),
            ("Exited Early", "yesno", None),
            ("Emotional State", "multi", ["Calm", "Anxious", "FOMO", "Revenge"]),
            ("Would Take Again", "yesno", None),
        ],
    })

    # 6 — ICT advanced
    specs.append({
        "name": "Liquidity Sweep + FVG",
        "icon": "🌊",
        "style": "ICT/SMC",
        "complexity": "Hard",
        "direction": "both",
        "desc": "Smart-money reversal framework: confirm HTF bias, wait for a liquidity sweep at a known pool, enter on retrace into a fresh fair value gap. Tight invalidation beyond the sweep with asymmetric 3R+ targets.",
        "instruments": ["EURUSD", "GBPUSD", "BTCUSDT"],
        "markets": ["forex", "crypto"],
        "timeframes": ["5m", "15m", "4h"],
        "tags": ["ICT/SMC", "Reversal", "FVG", "Liquidity", "Advanced"],
        "images": [dummy_image("FVG Entry", "Fair value gap", "#7C3AED"), dummy_image("Sweep Map", "Liquidity pools", "#2643F7")],
        "groups": [
            {"name": "HTF BIAS", "description": "Directional filter on 4H structure.", "conditions": [
                {"status": "mandatory", "label": "4H structure bullish or bearish", "description": "Mixed structure = no trade.", "images": []},
                {"status": "mandatory", "label": "Daily open bias aligned", "description": "Open acts as magnet.", "images": [dummy_image("Daily Open", "Bias filter", "#2643F7")]},
            ], "connectors": ["AND", "OFF", "OFF", "OFF", "OFF"]},
            {"name": "LIQUIDITY SWEEP", "description": "Clean grab of resting liquidity.", "conditions": [
                {"status": "mandatory", "label": "Sweep of swing high/low on 15m", "description": "Must close back through level.", "images": [dummy_image("Sweep", "Liquidity grab", "#EF4444")]},
                {"status": "mandatory", "label": "Reclaim within 3 candles", "description": "Otherwise continuation.", "images": []},
                {"status": "invalidate", "label": "News ±15 min", "description": "News sweeps fail often.", "images": []},
            ], "connectors": ["AND", "AND", "OFF", "OFF", "OFF"]},
            {"name": "FVG ENTRY", "description": "Enter on retrace to displacement gap.", "conditions": [
                {"status": "mandatory", "label": "FVG within 10 candles of sweep", "description": "Fresh imbalance only.", "images": [dummy_image("FVG", "Displacement gap", "#22C55E")]},
                {"status": "mandatory", "label": "Price at FVG midpoint", "description": "Limit entry zone.", "images": []},
                {"status": "optional", "label": "Volume spike on sweep", "description": "Improves win rate.", "images": []},
                {"status": "invalidate", "label": "FVG >70% filled", "description": "No edge remaining.", "images": []},
            ], "connectors": ["AND", "AND", "AND", "OFF", "OFF"]},
            execution_risk_group(),
        ],
        "pre": [
            ("HTF Bias", "multi", ["Bullish", "Bearish"]),
            ("Liquidity Swept", "yesno", None),
            ("FVG Fresh", "yesno", None),
            ("Session", "multi", ["London", "NY", "Asian"]),
            ("Kill Zone", "multi", ["Yes", "No"]),
        ],
        "post": [("FVG Respected", "yesno", None), ("Partial Taken", "multi", ["1R", "2R", "None"])],
    })

    # 7 — EMA ribbon swing
    specs.append({
        "name": "EMA Ribbon Continuation",
        "icon": "🧭",
        "style": "Trend Following",
        "complexity": "Medium",
        "direction": "both",
        "desc": "Continuation strategy when the 20/50 EMA ribbon aligns and slopes with trend. Enter after shallow pullback to the 20 EMA and a momentum close away from the ribbon. Trail behind 20 EMA for runners.",
        "instruments": ["BTCUSDT", "ETHUSDT", "EURJPY"],
        "supportInst": ["SOLUSDT"],
        "markets": ["crypto", "forex"],
        "timeframes": ["15m", "1h", "4h"],
        "tags": ["EMA", "Trend", "Continuation", "Pullback"],
        "images": [dummy_image("EMA Ribbon", "20/50 alignment", "#06b6d4")],
        "groups": [
            {"name": "TREND FILTER", "description": "Ribbon alignment defines direction.", "conditions": [
                {"status": "mandatory", "label": "20 EMA above 50 EMA for longs", "description": "Mirror for shorts.", "images": []},
                {"status": "mandatory", "label": "EMAs slope with direction", "description": "Flat = chop.", "images": [dummy_image("Slope", "Trend quality", "#2643F7")]},
            ], "connectors": ["AND", "OFF", "OFF", "OFF", "OFF"]},
            {"name": "PULLBACK", "description": "Controlled reset to ribbon.", "conditions": [
                {"status": "mandatory", "label": "Touch 20 EMA zone", "description": "Dynamic support.", "images": []},
                {"status": "invalidate", "label": "Close beyond 50 EMA", "description": "Ribbon broken.", "images": [dummy_image("Invalidation", "Deep pullback", "#EF4444")]},
            ], "connectors": ["AND", "OFF", "OFF", "OFF", "OFF"]},
            {"name": "TRIGGER", "description": "Momentum resumes.", "conditions": [
                {"status": "mandatory", "label": "Strong close away from 20 EMA", "description": "Continuation candle.", "images": [dummy_image("Trigger", "Momentum return", "#22C55E")]},
                {"status": "optional", "label": "HTF agrees", "description": "Multi-TF alignment.", "images": []},
            ], "connectors": ["AND", "OFF", "OFF", "OFF", "OFF"]},
            execution_risk_group(),
        ],
        "pre": [
            ("Ribbon Aligned", "yesno", None),
            ("HTF Trend Match", "multi", ["Yes", "No", "Partial"]),
            ("Volatility", "multi", ["Low", "Normal", "High"]),
        ],
        "post": [
            ("BE Hit", "yesno", None),
            ("Trailed Out", "yesno", None),
            ("Full Target", "multi", ["2R", "3R+", "Stopped"]),
            ("Setup Quality", "multi", ["A", "B", "C"]),
        ],
    })

    # 8 — fib swing
    specs.append({
        "name": "Fibonacci Confluence Swing",
        "icon": "🌀",
        "style": "Swing Trading",
        "complexity": "Medium",
        "direction": "both",
        "desc": "Patient swing entries at 50–61.8% retracements overlapping prior structure on the daily chart. Requires clear HTF trend, confluence zone, and rejection candle on 4H. Targets prior swing extreme and fib extensions.",
        "instruments": ["EURUSD", "XAUUSD", "BTCUSD"],
        "markets": ["forex", "crypto"],
        "timeframes": ["4h", "1d"],
        "tags": ["Fibonacci", "Swing", "Confluence", "Multi-Timeframe", "Patient"],
        "images": [dummy_image("Fib Zone", "50-61.8% retracement", "#C9A84C"), dummy_image("Confluence", "Structure overlap", "#2643F7")],
        "groups": [
            {"name": "SWING CONTEXT", "description": "Clear HTF swing environment.", "conditions": [
                {"status": "mandatory", "label": "Daily trend structure clear", "description": "HH/HL or LH/LL.", "images": []},
                {"status": "mandatory", "label": "Weekly level not blocking target", "description": "Room to run.", "images": [dummy_image("Weekly Map", "Target path clear", "#7C3AED")]},
            ], "connectors": ["AND", "OFF", "OFF", "OFF", "OFF"]},
            {"name": "CONFLUENCE", "description": "Multiple tools align.", "conditions": [
                {"status": "mandatory", "label": "50-61.8% retracement", "description": "Normal trend pullback.", "images": [dummy_image("Fib Levels", "Golden zone", "#C9A84C")]},
                {"status": "mandatory", "label": "Overlaps prior structure", "description": "S/R flip confluence.", "images": []},
                {"status": "optional", "label": "Round number nearby", "description": "Psychological level.", "images": []},
            ], "connectors": ["AND", "AND", "OFF", "OFF", "OFF"]},
            {"name": "TRIGGER", "description": "Pullback ending.", "conditions": [
                {"status": "mandatory", "label": "4H rejection in zone", "description": "At confluence, not after run.", "images": []},
                {"status": "invalidate", "label": "Close beyond 78.6%", "description": "Too deep.", "images": [dummy_image("Deep Retrace", "Invalidation", "#EF4444")]},
            ], "connectors": ["AND", "OFF", "OFF", "OFF", "OFF"]},
            execution_risk_group(),
        ],
        "pre": [
            ("Daily Bias", "multi", ["Bull", "Bear"]),
            ("Fib Zone", "multi", ["50%", "61.8%", "50-61.8 overlap"]),
            ("Structure Confluence", "yesno", None),
            ("Weekly Clear", "yesno", None),
            ("Risk %", "multi", ["0.5%", "1%", "1.5%"]),
            ("Macro News Week", "multi", ["Light", "Heavy"]),
        ],
        "post": [
            ("Held Overnight", "yesno", None),
            ("Scaled Out", "multi", ["Partial", "Full", "None"]),
            ("Journal Lesson", "multi", ["Patience", "Early entry", "Good location"]),
        ],
    })

    # 9 — weekly structure swing
    specs.append({
        "name": "Weekly Structure Break Swing",
        "icon": "📊",
        "style": "Swing Trading",
        "complexity": "Hard",
        "direction": "both",
        "desc": "Trade weekly range breaks with daily confirmation. Mark the weekly high/low, wait for a daily close beyond the level, enter on retest with stop inside the prior range. Hold 3–10 days targeting measured move.",
        "instruments": ["EURUSD", "GBPUSD", "ES", "GC"],
        "markets": ["forex", "futures"],
        "timeframes": ["1d", "1w"],
        "tags": ["Weekly Levels", "Breakout", "Swing", "Structure", "Multi-Day"],
        "images": [dummy_image("Weekly Range", "Structure map", "#2643F7")],
        "groups": [
            {"name": "WEEKLY MAP", "description": "Define the weekly range.", "conditions": [
                {"status": "mandatory", "label": "Weekly high/low clearly defined", "description": "At least 2 touches each side.", "images": []},
                {"status": "mandatory", "label": "Range width meaningful vs ATR", "description": "Enough fuel for breakout.", "images": [dummy_image("Range Quality", "ATR comparison", "#06b6d4")]},
            ], "connectors": ["AND", "OFF", "OFF", "OFF", "OFF"]},
            {"name": "BREAK", "description": "Daily acceptance beyond level.", "conditions": [
                {"status": "mandatory", "label": "Daily close beyond weekly level", "description": "Body close required.", "images": [dummy_image("Weekly Break", "Daily close", "#22C55E")]},
                {"status": "mandatory", "label": "Volume above 20-day average", "description": "Participation.", "images": []},
                {"status": "invalidate", "label": "Immediate close back inside", "description": "False break.", "images": [dummy_image("False Break", "Failed acceptance", "#EF4444")]},
            ], "connectors": ["AND", "AND", "OFF", "OFF", "OFF"]},
            {"name": "RETEST", "description": "Enter on retest of broken level.", "conditions": [
                {"status": "mandatory", "label": "Retest holds within 5 daily candles", "description": "Level flips S/R.", "images": []},
                {"status": "optional", "label": "4H rejection at retest", "description": "Tighter entry.", "images": []},
            ], "connectors": ["AND", "OFF", "OFF", "OFF", "OFF"]},
            execution_risk_group(),
        ],
        "pre": [
            ("Weekly Bias", "multi", ["Bullish", "Bearish", "Range"]),
            ("Daily Close Confirm", "yesno", None),
            ("Volume Confirm", "yesno", None),
            ("Correlation Check", "multi", ["Aligned", "Mixed", "Divergent"]),
            ("COT Positioning", "multi", ["With", "Against", "Neutral"]),
            ("Holding Period Plan", "multi", ["3-5d", "5-10d", "10d+"]),
            ("Risk Budget", "multi", ["0.5R", "1R", "1.5R"]),
        ],
        "post": [
            ("Break Valid", "yesno", None),
            ("Retest Quality", "multi", ["Clean", "Messy", "Skipped"]),
            ("Partial at 1R", "yesno", None),
            ("Held Full Target", "yesno", None),
            ("Weekend Risk Managed", "yesno", None),
            ("Post-Trade Grade", "multi", ["A", "B", "C", "D"]),
        ],
    })

    # 10 — position / long swing
    specs.append({
        "name": "Monthly Trend Position Play",
        "icon": "🏔️",
        "style": "Position Trading",
        "complexity": "Hard",
        "direction": "both",
        "desc": "Long-horizon trend continuation on monthly/daily structure. Enter after monthly pullback to rising 20-month MA or key demand zone with weekly reversal pattern. Wide stops, scale-in allowed, hold weeks to months.",
        "instruments": ["XAUUSD", "BTCUSD", "EURUSD"],
        "supportInst": ["ETHUSD", "GBPUSD"],
        "markets": ["forex", "crypto"],
        "timeframes": ["1d", "1w"],
        "tags": ["Position", "Macro", "Trend", "Multi-Week", "Patient", "Advanced"],
        "images": [
            dummy_image("Monthly Trend", "Macro structure", "#2643F7"),
            dummy_image("Demand Zone", "Higher TF value", "#C9A84C"),
            dummy_image("Weekly Trigger", "Reversal pattern", "#22C55E"),
        ],
        "groups": [
            {"name": "MACRO REGIME", "description": "Monthly trend must be established.", "conditions": [
                {"status": "mandatory", "label": "Monthly structure trending", "description": "Clear HH/HL or LH/LL on monthly.", "images": [dummy_image("Monthly Chart", "Macro bias", "#2643F7")]},
                {"status": "mandatory", "label": "No major macro event this week", "description": "FOMC, CPI, NFP = stand aside for new entries.", "images": []},
                {"status": "optional", "label": "DXY alignment for FX", "description": "Dollar direction supports thesis.", "images": []},
            ], "connectors": ["AND", "AND", "OFF", "OFF", "OFF"]},
            {"name": "VALUE ZONE", "description": "Pullback to institutional value.", "conditions": [
                {"status": "mandatory", "label": "Pullback to monthly demand/supply", "description": "Prior breakout zone or 20-month MA.", "images": [dummy_image("Value Zone", "Monthly support", "#C9A84C")]},
                {"status": "mandatory", "label": "Weekly RSI reset 40-60", "description": "Not overbought for longs.", "images": []},
                {"status": "invalidate", "label": "Monthly structure break", "description": "Trend thesis dead.", "images": [dummy_image("Structure Break", "Macro invalidation", "#EF4444")]},
            ], "connectors": ["AND", "AND", "OFF", "OFF", "OFF"]},
            {"name": "WEEKLY TRIGGER", "description": "Timing entry on weekly timeframe.", "conditions": [
                {"status": "mandatory", "label": "Weekly reversal pattern at zone", "description": "Pin bar, engulfing, or morning star.", "images": [dummy_image("Weekly Candle", "Reversal signal", "#22C55E")]},
                {"status": "optional", "label": "Volume climax on pullback", "description": "Selling/buying exhaustion.", "images": []},
            ], "connectors": ["AND", "OFF", "OFF", "OFF", "OFF"]},
            execution_risk_group(),
        ],
        "pre": [
            ("Macro Bias", "multi", ["Risk-On", "Risk-Off", "Neutral"]),
            ("Monthly Trend", "multi", ["Up", "Down", "Transition"]),
            ("DXY Bias", "multi", ["Strong", "Weak", "N/A"]),
            ("Fed Cycle", "multi", ["Hawkish", "Dovish", "Unclear"]),
            ("Entry Type", "multi", ["Full", "Scale-In 1/3", "Scale-In 2/3"]),
            ("Correlation Exposure", "multi", ["Low", "Medium", "High"]),
            ("Holding Horizon", "multi", ["2-4w", "1-3m", "3m+"]),
            ("Portfolio Heat", "multi", ["<2%", "2-5%", ">5%"]),
        ],
        "post": [
            ("Thesis Intact", "yesno", None),
            ("Added to Position", "yesno", None),
            ("Reduced Exposure", "yesno", None),
            ("Macro Changed", "multi", ["Yes - exited", "Yes - held", "No"]),
            ("Emotional Discipline", "multi", ["Excellent", "Good", "Poor"]),
            ("R Multiple", "multi", ["<1R", "1-3R", "3-5R", ">5R"]),
            ("Would Repeat", "yesno", None),
            ("Key Lesson", "multi", ["Patience", "Size", "Timing", "Macro"]),
        ],
    })

    built: list[dict[str, Any]] = []
    for i, spec in enumerate(specs):
        stamp = stamp_base + i
        groups = spec.pop("groups")
        pre = spec.pop("pre")
        post = spec.pop("post")
        canvas_nodes = build_canvas_nodes(groups, stamp)
        variables = build_variables(pre, post)
        row = {
            **spec,
            "conditions": [],
            "variables": variables,
            "canvasNodes": canvas_nodes,
            "canvasEdges": [],
            "supportInst": spec.get("supportInst") or [],
        }
        built.append(row)
    return built


def csrf_from_journal_token(token: str) -> str | None:
    try:
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (-len(payload_b64) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload_b64))
        csrf = claims.get("csrf")
        return str(csrf) if csrf else None
    except Exception:
        return None


def chart_auth_origin(journal_base: str) -> str:
    """Derive chart API origin from journal API base (e.g. .../journal/api -> origin)."""
    parsed = urlparse(journal_base)
    path = parsed.path or ""
    if path.endswith("/journal/api"):
        path = path[: -len("/journal/api")]
    elif path.endswith("/journal/api/"):
        path = path[: -len("/journal/api/")]
    return f"{parsed.scheme}://{parsed.netloc}{path}".rstrip("/")


def api_request(
    url: str,
    method: str = "GET",
    data: dict | None = None,
    token: str | None = None,
    csrf: str | None = None,
) -> Any:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if csrf and method in ("POST", "PUT", "PATCH", "DELETE"):
        headers["X-CSRF-TOKEN"] = csrf
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} {method} {url}: {err_body}") from e


def login_journal_direct(base: str, email: str, password: str) -> tuple[str, str | None]:
    data = api_request(f"{base.rstrip('/')}/auth/login", "POST", {"email": email, "password": password})
    token = data.get("token")
    if not token:
        raise RuntimeError(f"Journal login failed: {data}")
    return token, csrf_from_journal_token(token)


def login_via_chart(chart_origin: str, email: str, password: str) -> tuple[str, str | None]:
    data = api_request(
        f"{chart_origin.rstrip('/')}/api/auth/login",
        "POST",
        {"email": email, "password": password},
    )
    token = data.get("journal_token") or data.get("token")
    if not token:
        raise RuntimeError(f"Chart auth login failed (no journal_token): {data}")
    return token, csrf_from_journal_token(token)


def login(base: str, email: str, password: str, chart_origin: str | None = None) -> tuple[str, str | None]:
    try:
        return login_journal_direct(base, email, password)
    except RuntimeError as direct_err:
        origin = chart_origin or chart_auth_origin(base)
        try:
            return login_via_chart(origin, email, password)
        except RuntimeError:
            raise direct_err


def list_strategies(base: str, token: str) -> list[dict[str, Any]]:
    data = api_request(f"{base.rstrip('/')}/strategies", "GET", token=token)
    return data.get("strategies") or []


def create_strategy(base: str, token: str, body: dict[str, Any], csrf: str | None = None) -> dict[str, Any]:
    data = api_request(f"{base.rstrip('/')}/strategies", "POST", body, token=token, csrf=csrf)
    if not data.get("success"):
        raise RuntimeError(f"Create failed: {data}")
    return data["strategy"]


def delete_strategy(base: str, token: str, strategy_id: int, csrf: str | None = None) -> None:
    api_request(f"{base.rstrip('/')}/strategies/{strategy_id}", "DELETE", token=token, csrf=csrf)


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed Strategy Builder test strategies")
    parser.add_argument("--base-url", default="https://www.talaria-log.com/journal/api", help="Journal API base URL")
    parser.add_argument("--email", default="data@talaria-log.com")
    parser.add_argument("--password", default="data@talaria-log.com")
    parser.add_argument("--dry-run", action="store_true", help="Print payloads only")
    parser.add_argument("--skip-existing", action="store_true", default=True, help="Skip names already in account")
    parser.add_argument("--chart-origin", default="", help="Chart API origin for /api/auth/login fallback")
    parser.add_argument("--cleanup-test", type=int, default=0, help="Delete strategy id before seeding")
    args = parser.parse_args()

    strategies = build_strategies()
    if args.dry_run:
        print(json.dumps([bank_row_to_api_body(s) for s in strategies], indent=2)[:8000])
        print(f"\n... ({len(strategies)} strategies total)")
        return 0

    print(f"Logging in as {args.email} ...")
    chart_origin = args.chart_origin.strip() or None
    token, csrf = login(args.base_url, args.email, args.password, chart_origin=chart_origin)
    if args.cleanup_test > 0:
        print(f"Deleting test strategy id={args.cleanup_test} ...")
        delete_strategy(args.base_url, token, args.cleanup_test, csrf=csrf)
    existing = {s.get("name", "").lower() for s in list_strategies(args.base_url, token)}
    print(f"Found {len(existing)} existing strategies")

    created = 0
    skipped = 0
    for row in strategies:
        name = row["name"]
        if args.skip_existing and name.lower() in existing:
            print(f"  SKIP (exists): {name}")
            skipped += 1
            continue
        body = bank_row_to_api_body(row)
        saved = create_strategy(args.base_url, token, body, csrf=csrf)
        print(f"  CREATED id={saved.get('id')}: {name}")
        created += 1
        time.sleep(0.3)

    print(f"\nDone. Created {created}, skipped {skipped}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
