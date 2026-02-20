import argparse
import json
import math
import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


def _sqlite_path_from_database_url(database_url: str) -> str | None:
    if not database_url.startswith("sqlite"):
        return None
    if database_url.startswith("sqlite:////"):
        return "/" + database_url.replace("sqlite:////", "", 1)
    if database_url.startswith("sqlite:///"):
        return database_url.replace("sqlite:///", "", 1)
    return None


def _default_db_path() -> str:
    env = os.getenv("DATABASE_URL", "sqlite:////app/db/chart_data.db")
    p = _sqlite_path_from_database_url(env)
    if p:
        return p
    return "/app/db/chart_data.db"


def _json_loads(s: str | None, default: Any) -> Any:
    if not s:
        return default
    try:
        return json.loads(s)
    except Exception:
        return default


def _parse_dt(v: Any) -> datetime | None:
    if not v:
        return None
    if isinstance(v, (int, float)):
        try:
            return datetime.fromtimestamp(float(v) / 1000.0)
        except Exception:
            return None
    if isinstance(v, str):
        txt = v.strip()
        if not txt:
            return None
        for fmt in (
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
        ):
            try:
                return datetime.strptime(txt, fmt)
            except Exception:
                pass
        try:
            return datetime.fromisoformat(txt.replace("Z", "+00:00"))
        except Exception:
            return None
    return None


def _trade_pnl(trade: dict) -> float:
    for k in ("netPnL", "pnl", "net_pnl", "net", "profit"):
        v = trade.get(k)
        if isinstance(v, (int, float)):
            return float(v)
    return 0.0


def _trade_r_multiple(trade: dict) -> float | None:
    for k in ("rMultiple", "r_multiple", "r"):
        v = trade.get(k)
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            try:
                return float(v)
            except Exception:
                pass
    return None


def _trade_risk_amount(trade: dict) -> float | None:
    for k in ("riskAmount", "risk_amount", "riskPerTrade", "risk"):
        v = trade.get(k)
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            try:
                return float(v)
            except Exception:
                pass
    return None


def _screenshot_bytes_estimate(s: Any) -> int:
    if not isinstance(s, str) or not s:
        return 0
    txt = s
    if txt.startswith("data:"):
        comma = txt.find(",")
        if comma != -1:
            txt = txt[comma + 1 :]
    txt = "".join(txt.split())
    if not txt:
        return 0
    return int(len(txt) * 3 / 4)


@dataclass
class SessionMetrics:
    session_id: int
    session_name: str
    session_type: str
    user_id: int
    user_email: str | None
    start_balance: float | None
    trades: int
    wins: int
    losses: int
    breakeven: int
    net_pnl: float
    gross_profit: float
    gross_loss: float
    profit_factor: float | None
    win_rate: float | None
    avg_pnl: float | None
    avg_win: float | None
    avg_loss: float | None
    expectancy_r: float | None
    max_drawdown: float | None
    max_drawdown_pct: float | None
    screenshots_bytes: int


def _compute_metrics(
    session_id: int,
    session_name: str,
    session_type: str,
    user_id: int,
    user_email: str | None,
    start_balance: float | None,
    journal: list,
) -> SessionMetrics:
    pnls: list[float] = []
    r_mults: list[float] = []
    screenshots_bytes = 0

    for t in journal:
        if not isinstance(t, dict):
            continue
        pnls.append(_trade_pnl(t))
        r = _trade_r_multiple(t)
        if r is not None and math.isfinite(r):
            r_mults.append(r)

        screenshots_bytes += _screenshot_bytes_estimate(t.get("entryScreenshot"))
        screenshots_bytes += _screenshot_bytes_estimate(t.get("exitScreenshot"))
        if isinstance(t.get("entryScreenshots"), list):
            for x in t.get("entryScreenshots"):
                screenshots_bytes += _screenshot_bytes_estimate(x)

    trades = len(pnls)
    wins = sum(1 for p in pnls if p > 0)
    losses = sum(1 for p in pnls if p < 0)
    breakeven = trades - wins - losses

    net_pnl = float(sum(pnls))
    gross_profit = float(sum(p for p in pnls if p > 0))
    gross_loss = float(sum(p for p in pnls if p < 0))

    profit_factor = None
    if gross_loss != 0:
        profit_factor = gross_profit / abs(gross_loss)
    elif gross_profit > 0:
        profit_factor = float("inf")

    win_rate = (wins / trades) if trades else None
    avg_pnl = (net_pnl / trades) if trades else None
    avg_win = (gross_profit / wins) if wins else None
    avg_loss = (gross_loss / losses) if losses else None

    expectancy_r = (sum(r_mults) / len(r_mults)) if r_mults else None

    max_drawdown = None
    max_drawdown_pct = None
    if trades and start_balance is not None:
        equity = float(start_balance)
        peak = equity
        dd = 0.0
        dd_pct = 0.0
        for p in pnls:
            equity += float(p)
            if equity > peak:
                peak = equity
            if peak > 0:
                cur_dd = peak - equity
                if cur_dd > dd:
                    dd = cur_dd
                    dd_pct = cur_dd / peak
        max_drawdown = dd
        max_drawdown_pct = dd_pct

    return SessionMetrics(
        session_id=session_id,
        session_name=session_name,
        session_type=session_type,
        user_id=user_id,
        user_email=user_email,
        start_balance=start_balance,
        trades=trades,
        wins=wins,
        losses=losses,
        breakeven=breakeven,
        net_pnl=net_pnl,
        gross_profit=gross_profit,
        gross_loss=gross_loss,
        profit_factor=profit_factor,
        win_rate=win_rate,
        avg_pnl=avg_pnl,
        avg_win=avg_win,
        avg_loss=avg_loss,
        expectancy_r=expectancy_r,
        max_drawdown=max_drawdown,
        max_drawdown_pct=max_drawdown_pct,
        screenshots_bytes=screenshots_bytes,
    )


def _rows_to_metrics(db_path: str, session_id: int | None, user_email: str | None) -> list[SessionMetrics]:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    users = {}
    try:
        cur.execute("SELECT id, email FROM users")
        for r in cur.fetchall():
            users[int(r["id"])] = r["email"]
    except Exception:
        users = {}

    where = []
    params: list[Any] = []

    if session_id is not None:
        where.append("s.id = ?")
        params.append(int(session_id))

    if user_email:
        where.append("LOWER(u.email) = LOWER(?)")
        params.append(user_email)

    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    sql = (
        "SELECT s.id AS session_id, s.user_id AS user_id, s.name AS name, s.session_type AS session_type, "
        "s.config_json AS config_json, st.state_json AS state_json, u.email AS email "
        "FROM trading_sessions s "
        "LEFT JOIN trading_session_states st ON st.session_id = s.id "
        "LEFT JOIN users u ON u.id = s.user_id "
        + where_sql
        + " ORDER BY s.id ASC"
    )

    cur.execute(sql, params)

    out: list[SessionMetrics] = []
    for r in cur.fetchall():
        cfg = _json_loads(r["config_json"], {})
        state = _json_loads(r["state_json"], {})
        journal = state.get("journal") if isinstance(state, dict) else None
        if not isinstance(journal, list):
            journal = []

        sb = None
        for k in ("startBalance", "balance", "start_balance"):
            v = cfg.get(k) if isinstance(cfg, dict) else None
            if isinstance(v, (int, float)):
                sb = float(v)
                break
            if isinstance(v, str):
                try:
                    sb = float(v)
                    break
                except Exception:
                    pass

        out.append(
            _compute_metrics(
                session_id=int(r["session_id"]),
                session_name=str(r["name"] or ""),
                session_type=str(r["session_type"] or ""),
                user_id=int(r["user_id"]),
                user_email=r["email"] or users.get(int(r["user_id"])),
                start_balance=sb,
                journal=journal,
            )
        )

    con.close()
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=_default_db_path())
    ap.add_argument("--session-id", type=int, default=None)
    ap.add_argument("--user-email", default=None)
    ap.add_argument("--format", choices=["json", "text"], default="text")
    args = ap.parse_args()

    db_path = str(Path(args.db))
    metrics = _rows_to_metrics(db_path, args.session_id, args.user_email)

    if args.format == "json":
        payload = [m.__dict__ for m in metrics]
        print(json.dumps(payload, indent=2))
        return 0

    for m in metrics:
        print(f"Session {m.session_id} | {m.session_name} | {m.session_type} | user={m.user_email or m.user_id}")
        print(f"  trades={m.trades} wins={m.wins} losses={m.losses} breakeven={m.breakeven}")
        print(f"  net_pnl={m.net_pnl:.2f} gross_profit={m.gross_profit:.2f} gross_loss={m.gross_loss:.2f}")
        if m.profit_factor is not None:
            pf = "inf" if math.isinf(m.profit_factor) else f"{m.profit_factor:.2f}"
            print(f"  profit_factor={pf}")
        if m.win_rate is not None:
            print(f"  win_rate={m.win_rate*100:.2f}%")
        if m.avg_pnl is not None:
            print(f"  avg_pnl={m.avg_pnl:.2f}")
        if m.avg_win is not None:
            print(f"  avg_win={m.avg_win:.2f}")
        if m.avg_loss is not None:
            print(f"  avg_loss={m.avg_loss:.2f}")
        if m.expectancy_r is not None:
            print(f"  avg_R={m.expectancy_r:.3f}")
        if m.max_drawdown is not None and m.max_drawdown_pct is not None:
            print(f"  max_drawdown={m.max_drawdown:.2f} ({m.max_drawdown_pct*100:.2f}%)")
        if m.screenshots_bytes:
            print(f"  screenshots_est_bytes={m.screenshots_bytes}")
        print("")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
