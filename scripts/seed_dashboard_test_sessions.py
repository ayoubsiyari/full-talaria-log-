#!/usr/bin/env python3
"""
Seed 20 dashboard test sources for data@talaria-log.com on VPS/staging:

  Type 1 — Standard backtest (5 sessions)
  Type 2 — Prop backtest (5 sessions)
  Type 3 — Live journal personal (5 accounts; multiple linked strategies in notes)
  Type 4 — Live journal prop (5 accounts; multiple linked strategies in notes)

Market mix (20 total): 8 Forex (4 include XAUUSD), 8 Futures (ES/NQ), 4 Crypto.
All backtests: advanced_order + trading_costs_enabled.
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import sys
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from typing import Any
from urllib.parse import quote, urlparse

ORIGIN_DEFAULT = "http://31.97.192.82:3000"
JOURNAL_API_SUFFIX = "/journal/api"
JOURNAL_PREFIX = f"{JOURNAL_API_SUFFIX}/journal"

INSTR_DEFAULTS = {
    "Forex": {"spread": "1.2", "commission": "0", "pipSize": "0.0001", "pipVal": "10", "contractSize": "100000", "minLot": "0.01", "lotStep": "0.01"},
    "Futures": {"spread": "0.25", "commission": "2.50", "pipSize": "0.25", "pipVal": "12.50", "contractSize": "1", "minLot": "1", "lotStep": "1"},
    "Crypto": {"spread": "15", "commission": "0", "pipSize": "1", "pipVal": "1", "contractSize": "1", "minLot": "0.001", "lotStep": "0.01"},
}

DEFAULT_SPREADS = {
    "EURUSD": "0.8", "GBPUSD": "1.0", "XAUUSD": "0.30",
    "ES": "1", "NQ": "1", "MES": "1", "MNQ": "1",
    "BTCUSD": "0.01", "BTCUSDT": "0.01", "ETHUSD": "0.01", "ETHUSDT": "0.01",
}

SYM_ALIASES = {
    "BTCUSDT": "BTC",
    "BTCUSD": "BTC",
    "ETHUSDT": "ETH",
    "ETHUSD": "ETH",
    "XBTUSD": "BTC",
    "XAUUSD": "GC",
    "GOLD": "GC",
}

SESSION_SPECS: list[dict[str, Any]] = [
    # Type 1 — standard backtest
    {"source_type": 1, "kind": "backtest", "name": "QA T1 · EURUSD Scalper BT", "tickers": ["EURUSD"], "strategy_id": 57, "timeframe": "5m", "capital": "10000"},
    {"source_type": 1, "kind": "backtest", "name": "QA T1 · XAUUSD Swing BT", "tickers": ["GC"], "strategy_id": 64, "timeframe": "4h", "capital": "25000", "display_gold": True},
    {"source_type": 1, "kind": "backtest", "name": "QA T1 · ES Opening Range BT", "tickers": ["ES"], "strategy_id": 60, "timeframe": "5m", "capital": "50000"},
    {"source_type": 1, "kind": "backtest", "name": "QA T1 · NQ VWAP Reclaim BT", "tickers": ["NQ"], "strategy_id": 59, "timeframe": "5m", "capital": "50000"},
    {"source_type": 1, "kind": "backtest", "name": "QA T1 · BTC Liquidity Sweep BT", "tickers": ["BTC"], "strategy_id": 62, "timeframe": "15m", "capital": "10000"},
    # Type 2 — prop backtest
    {"source_type": 2, "kind": "backtest", "name": "QA T2 · EURUSD Trend Prop BT", "tickers": ["EURUSD"], "strategy_id": 61, "timeframe": "1h", "capital": "100000", "prop": True},
    {"source_type": 2, "kind": "backtest", "name": "QA T2 · XAUUSD Fib Prop BT", "tickers": ["GC"], "strategy_id": 64, "timeframe": "4h", "capital": "100000", "prop": True, "display_gold": True},
    {"source_type": 2, "kind": "backtest", "name": "QA T2 · ES ORB Prop BT", "tickers": ["ES"], "strategy_id": 60, "timeframe": "5m", "capital": "50000", "prop": True},
    {"source_type": 2, "kind": "backtest", "name": "QA T2 · NQ Momentum Prop BT", "tickers": ["NQ"], "strategy_id": 59, "timeframe": "5m", "capital": "50000", "prop": True},
    {"source_type": 2, "kind": "backtest", "name": "QA T2 · BTC Funding Prop BT", "tickers": ["BTC"], "strategy_id": 62, "timeframe": "15m", "capital": "25000", "prop": True},
    # Type 3 — live journal personal (multiple strategies)
    {"source_type": 3, "kind": "live", "name": "QA T3 · EUR Multi-Strategy Live", "market": "Forex", "strategy_ids": [57, 58], "capital": "15000"},
    {"source_type": 3, "kind": "live", "name": "QA T3 · Gold Multi-Strategy Live", "market": "Forex", "strategy_ids": [61, 64, 66], "capital": "30000"},
    {"source_type": 3, "kind": "live", "name": "QA T3 · ES Multi-Strategy Live", "market": "Futures", "strategy_ids": [59, 60], "capital": "50000"},
    {"source_type": 3, "kind": "live", "name": "QA T3 · NQ Multi-Strategy Live", "market": "Futures", "strategy_ids": [59, 63], "capital": "50000"},
    {"source_type": 3, "kind": "live", "name": "QA T3 · Crypto Multi-Strategy Live", "market": "Crypto", "strategy_ids": [62, 63, 66], "capital": "20000"},
    # Type 4 — live journal prop (multiple strategies)
    {"source_type": 4, "kind": "live", "name": "QA T4 · EUR Prop Multi Live", "market": "Forex", "strategy_ids": [58, 61], "capital": "100000", "prop": True, "prop_firm": "FTMO"},
    {"source_type": 4, "kind": "live", "name": "QA T4 · Gold Prop Multi Live", "market": "Forex", "strategy_ids": [64, 66], "capital": "100000", "prop": True, "prop_firm": "FundedNext"},
    {"source_type": 4, "kind": "live", "name": "QA T4 · ES Prop Multi Live", "market": "Futures", "strategy_ids": [60, 65], "capital": "50000", "prop": True, "prop_firm": "Topstep"},
    {"source_type": 4, "kind": "live", "name": "QA T4 · NQ Prop Multi Live", "market": "Futures", "strategy_ids": [59, 60], "capital": "50000", "prop": True, "prop_firm": "Apex"},
    {"source_type": 4, "kind": "live", "name": "QA T4 · Crypto Prop Multi Live", "market": "Crypto", "strategy_ids": [62, 63], "capital": "25000", "prop": True, "prop_firm": "Crypto Funded"},
]


def norm_sym(raw: str) -> str:
    s = re.sub(r"[/\s_.-]", "", str(raw or "")).upper()
    return SYM_ALIASES.get(s, s)


def asset_of(sym: str) -> str:
    s = norm_sym(sym)
    if s in {"ES", "NQ", "MES", "MNQ", "YM", "RTY", "CL", "GC", "MGC", "SI", "NG"}:
        return "Futures"
    if "BTC" in s or "ETH" in s or s.endswith("USDT"):
        return "Crypto"
    return "Forex"


class Client:
    def __init__(self, origin: str):
        self.origin = origin.rstrip("/")
        self.journal_base = f"{self.origin}{JOURNAL_API_SUFFIX}"
        self.journal_journal_base = f"{self.origin}{JOURNAL_PREFIX}"
        self.jar = CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.journal_token: str | None = None
        self.csrf: str | None = None
        self.strategies_by_id: dict[int, dict[str, Any]] = {}

    def _request(
        self,
        url: str,
        method: str = "GET",
        data: dict | None = None,
        *,
        use_journal_token: bool = False,
        csrf: bool = False,
    ) -> Any:
        headers = {"Accept": "application/json"}
        body = None
        if data is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(data).encode("utf-8")
        if use_journal_token and self.journal_token:
            headers["Authorization"] = f"Bearer {self.journal_token}"
        if csrf and self.csrf:
            headers["X-CSRF-TOKEN"] = self.csrf
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with self.opener.open(req, timeout=90) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw.strip() else {}
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {e.code} {method} {url}: {err}") from e

    def login(self, email: str, password: str) -> None:
        data = self._request(
            f"{self.origin}/api/auth/login",
            "POST",
            {"email": email, "password": password},
        )
        token = data.get("journal_token") or data.get("token")
        if not token:
            raise RuntimeError(f"Login failed: {data}")
        self.journal_token = token
        try:
            payload_b64 = token.split(".")[1]
            payload_b64 += "=" * (-len(payload_b64) % 4)
            claims = json.loads(base64.urlsafe_b64decode(payload_b64))
            self.csrf = str(claims.get("csrf") or "") or None
        except Exception:
            self.csrf = None

    def load_strategies(self) -> None:
        data = self._request(f"{self.journal_base}/strategies", use_journal_token=True)
        for row in data.get("strategies") or []:
            sid = row.get("id")
            if isinstance(sid, int):
                self.strategies_by_id[sid] = row

    def load_files(self) -> list[dict[str, Any]]:
        data = self._request(f"{self.origin}/api/files?session_ready=1")
        return list(data.get("files") or [])

    def list_backtest_sessions(self) -> list[dict[str, Any]]:
        data = self._request(f"{self.origin}/api/sessions")
        return list(data.get("sessions") or [])

    def list_live_accounts(self) -> list[dict[str, Any]]:
        data = self._request(f"{self.journal_journal_base}/live-accounts", use_journal_token=True)
        return list(data.get("accounts") or [])

    def create_backtest(self, name: str, session_type: str, config: dict[str, Any]) -> dict[str, Any]:
        data = self._request(
            f"{self.origin}/api/sessions",
            "POST",
            {"name": name, "session_type": session_type, "config": config},
        )
        sess = data.get("session")
        if not sess:
            raise RuntimeError(f"Create session failed: {data}")
        return sess

    def create_live_account(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = self._request(
            f"{self.journal_journal_base}/live-accounts",
            "POST",
            payload,
            use_journal_token=True,
            csrf=True,
        )
        acc = data.get("account")
        if not acc:
            raise RuntimeError(f"Create live account failed: {data}")
        return acc


def find_file(sym: str, files: list[dict[str, Any]]) -> dict[str, Any] | None:
    want = norm_sym(sym)
    candidates = [want]
    alias = SYM_ALIASES.get(want)
    if alias:
        candidates.append(norm_sym(alias))
    # Gold: prefer GC/MGC when XAUUSD requested
    if want in {"XAUUSD", "GOLD"}:
        candidates.extend(["GC", "MGC"])
    if want in {"BTCUSDT", "BTCUSD"}:
        candidates.extend(["BTC", "BTCEUR"])
    seen = set()
    for c in candidates:
        if c in seen:
            continue
        seen.add(c)
        for f in files:
            ticker = norm_sym(str(f.get("ticker") or ""))
            name = str(f.get("original_name") or f.get("name") or "").upper()
            if ticker == c or c in name:
                return f
    return None


def date_span_from_file(f: dict[str, Any]) -> tuple[str, str]:
    for key in ("from", "start_date", "startDate"):
        start = str(f.get(key) or "")[:10]
        if start:
            break
    else:
        start = "2024-01-01"
    for key in ("to", "end_date", "endDate"):
        end = str(f.get(key) or "")[:10]
        if end:
            break
    else:
        end = "2024-06-30"
    if start > end:
        start, end = "2024-01-01", "2024-06-30"
    return start, end


def strategy_variables(client: Client, strategy_id: int) -> list[Any]:
    row = client.strategies_by_id.get(strategy_id) or {}
    defn = row.get("strategy_definition") or {}
    vars_ = defn.get("variables")
    if isinstance(vars_, list):
        return [v for v in vars_ if isinstance(v, dict) and v.get("type") != "divider"]
    return []


def strategy_name(client: Client, strategy_id: int) -> str:
    row = client.strategies_by_id.get(strategy_id) or {}
    return str(row.get("name") or f"Strategy {strategy_id}")


def build_backtest_config(
    client: Client,
    spec: dict[str, Any],
    files: list[dict[str, Any]],
) -> dict[str, Any]:
    tickers = spec["tickers"]
    primary = tickers[0]
    resolved_files: list[dict[str, Any]] = []
    instruments: dict[str, Any] = {}
    missing: list[str] = []

    for sym in tickers:
        match = find_file(sym, files)
        if not match:
            missing.append(sym)
            continue
        asset = asset_of(sym)
        key = norm_sym(sym)
        defn = INSTR_DEFAULTS[asset]
        spread = DEFAULT_SPREADS.get(key, DEFAULT_SPREADS.get(norm_sym(SYM_ALIASES.get(key, key)), defn["spread"]))
        instruments[key] = {
            "ticker": sym,
            "symbol": sym,
            "fileId": match["id"],
            "fileName": match.get("original_name") or match.get("name"),
            "asset": asset,
            "asset_class": asset,
            **defn,
            "spread": spread,
            "commission": defn["commission"] if asset != "Futures" else "2.50",
        }
        resolved_files.append(match)

    if missing:
        raise RuntimeError(f"Missing chart datasets for: {', '.join(missing)}")

    start, end = date_span_from_file(resolved_files[0])
    strategy_id = int(spec["strategy_id"])
    sname = strategy_name(client, strategy_id)
    vars_ = strategy_variables(client, strategy_id)
    asset_class = asset_of(primary)
    is_prop = bool(spec.get("prop"))
    costs = {
        "Forex": {"commission": "0", "leverage": "1:30"},
        "Futures": {"commission": "2.50", "leverage": "1:20"},
        "Crypto": {"commission": "0", "leverage": "1:5"},
        "Stocks": {"commission": "0.02", "leverage": "1:5"},
    }
    spreads = {norm_sym(sym): DEFAULT_SPREADS.get(norm_sym(sym), "1") for sym in tickers}

    cfg: dict[str, Any] = {
        "type": "propfirm" if is_prop else "standard",
        "session_mode": "prop_backtest" if is_prop else "standard_backtest",
        "sessionName": spec["name"],
        "description": f"QA dashboard seed — source type {spec['source_type']}. Strategy: {sname}.",
        "playbook": f"strategy:{strategy_id}",
        "playbook_display": sname,
        "strategy_name": sname,
        "strategy_id": strategy_id,
        "tickers": tickers,
        "supporting_tickers": [],
        "asset_class": asset_class,
        "trading_mode": "prop" if is_prop else "standard",
        "symbol": tickers[0] if len(tickers) == 1 else f"{len(tickers)} symbols",
        "fileId": resolved_files[0]["id"],
        "fileName": resolved_files[0].get("original_name") or resolved_files[0].get("name"),
        "files": [
            {
                "id": f["id"],
                "name": f.get("original_name") or f.get("name"),
                "ticker": tickers[i] if i < len(tickers) else f.get("ticker"),
                "asset_class": asset_of(tickers[i] if i < len(tickers) else str(f.get("ticker") or "")),
            }
            for i, f in enumerate(resolved_files)
        ],
        "instruments": instruments,
        "symbols": [{"symbolName": sym, "fileId": instruments[norm_sym(sym)]["fileId"], "tradable": True} for sym in tickers],
        "startDate": start,
        "endDate": end,
        "startBalance": str(spec.get("capital") or "10000"),
        "account_currency": "USD",
        "leverage": "1:10" if is_prop else costs[asset_class]["leverage"],
        "margin_call_level": 100,
        "stop_out_level": 50,
        "max_risk_per_trade_pct": None,
        "timeframe": spec.get("timeframe") or "1h",
        "defaultRiskType": "pct",
        "defaultRisk": 1,
        "allowBackNavigation": False if is_prop else True,
        "protectionPreset": "none",
        "commission": "Per Lot",
        "trading_costs_enabled": True,
        "rollback_allowed": False if is_prop else True,
        "replayMode": "Candle",
        "replaySpeed": 30,
        "timezone": "UTC",
        "dst": False,
        "advanced_order": True,
        "mfe_mae_enabled": True,
        "mfe_mae_tracking_hours": 4,
        "post_exit_tracking_mode": "candles",
        "post_exit_tracking_candles": 50,
        "mfe_mae": {
            "enabled": True,
            "tracking_hours": 4,
            "post_exit_mode": "candles",
            "post_exit_candles": 50,
        },
        "trading_costs": {
            "costs": costs,
            "spreads": spreads,
            "futuresMargins": {},
            "spread_semantics": "mid_to_side",
        },
        "source_type": spec["source_type"],
    }
    if vars_:
        cfg["strategy_variables"] = vars_
    if is_prop:
        cap = float(spec.get("capital") or 100000)
        cfg["prop_rules"] = {
            "numPhases": 2,
            "challengeType": "Evaluation",
            "p1Pct": {"dl": "5", "dd": "10", "pt": "8"},
            "p2Pct": {"dl": "5", "dd": "10", "pt": "5"},
            "p1Amt": {"dl": str(int(cap * 0.05)), "dd": str(int(cap * 0.10)), "pt": str(int(cap * 0.08))},
            "p2Amt": {"dl": str(int(cap * 0.05)), "dd": str(int(cap * 0.10)), "pt": str(int(cap * 0.05))},
        }
    return cfg


def build_live_payload(client: Client, spec: dict[str, Any]) -> dict[str, Any]:
    strategy_ids = [int(x) for x in spec.get("strategy_ids") or []]
    names = [strategy_name(client, sid) for sid in strategy_ids]
    notes = (
        f"QA dashboard seed — source type {spec['source_type']}. "
        f"Linked strategies: {', '.join(f'{n} ({sid})' for sid, n in zip(strategy_ids, names))}. "
        f"Trades to be added later."
    )
    is_prop = bool(spec.get("prop"))
    market = str(spec.get("market") or "Forex")
    payload: dict[str, Any] = {
        "name": spec["name"],
        "market": market,
        "starting_balance": str(spec.get("capital") or "10000"),
        "account_type": "prop" if is_prop else "personal",
        "account_subtype": "Challenge" if is_prop else "Live",
        "notes": notes,
    }
    if is_prop:
        payload["prop_firm"] = str(spec.get("prop_firm") or "FTMO")
        cap = float(spec.get("capital") or 100000)
        is_futures = market.lower() == "futures"
        payload["prop_rules"] = {
            "numPhases": 2 if is_prop else 1,
            "challengeType": "Evaluation",
            "currentPhase": 1,
            "limitMode": "amount" if is_futures else "percent",
            "p1Pct": {"dl": "5", "dd": "10", "pt": "8"},
            "p2Pct": {"dl": "5", "dd": "10", "pt": "5"},
            "p1Amt": {
                "dl": str(int(cap * 0.05)),
                "dd": str(int(cap * 0.10)),
                "pt": str(int(cap * 0.08)),
            },
            "p2Amt": {
                "dl": str(int(cap * 0.05)),
                "dd": str(int(cap * 0.10)),
                "pt": str(int(cap * 0.05)),
            },
            "minTradingDaysEnabled": True,
            "minTradingDays": "4",
            "consistencyEnabled": False,
            "trailingDrawdown": not is_futures,
            "dailyLossEnabled": True,
            "weekendHold": False,
        }
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed 20 dashboard test sessions/accounts")
    parser.add_argument("--origin", default=ORIGIN_DEFAULT)
    parser.add_argument("--email", default="data@talaria-log.com")
    parser.add_argument("--password", default="data@talaria-log.com")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-existing", action="store_true", default=True)
    args = parser.parse_args()

    client = Client(args.origin)
    print(f"Logging in as {args.email} ...")
    client.login(args.email, args.password)
    client.load_strategies()
    print(f"Loaded {len(client.strategies_by_id)} strategies")

    files = client.load_files()
    print(f"Loaded {len(files)} session-ready datasets")
    if not files and not args.dry_run:
        print("WARNING: no chart files — backtest sessions will fail unless datasets exist.", file=sys.stderr)

    existing_bt = {s.get("name", "").lower() for s in client.list_backtest_sessions()}
    existing_live = {a.get("name", "").lower() for a in client.list_live_accounts()}

    created = skipped = failed = 0
    for spec in SESSION_SPECS:
        name = spec["name"]
        if args.skip_existing:
            pool = existing_live if spec["kind"] == "live" else existing_bt
            if name.lower() in pool:
                print(f"  SKIP (exists): {name}")
                skipped += 1
                continue
        try:
            if spec["kind"] == "backtest":
                cfg = build_backtest_config(client, spec, files)
                if args.dry_run:
                    print(f"  DRY-RUN backtest: {name} tickers={spec['tickers']} strategy={spec['strategy_id']}")
                    continue
                sess = client.create_backtest(
                    name,
                    "propfirm" if spec.get("prop") else "personal",
                    cfg,
                )
                print(f"  CREATED backtest id={sess.get('id')}: {name}")
            else:
                payload = build_live_payload(client, spec)
                if args.dry_run:
                    print(f"  DRY-RUN live: {name} strategies={spec.get('strategy_ids')}")
                    continue
                acc = client.create_live_account(payload)
                print(f"  CREATED live journal id={acc.get('id')}: {name}")
            created += 1
        except Exception as exc:
            failed += 1
            print(f"  FAILED {name}: {exc}", file=sys.stderr)

    print(f"\nDone. Created {created}, skipped {skipped}, failed {failed}.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
