from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import Trade, TradingSession, User
from ..schemas import SessionCreateIn, SessionPublic

router = APIRouter(prefix="/api", tags=["sessions"])


@router.get("/sessions")
def list_sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sessions = (
        db.execute(select(TradingSession).where(TradingSession.user_id == user.id).order_by(TradingSession.created_at.desc()))
        .scalars()
        .all()
    )
    return {"sessions": [SessionPublic.model_validate(s, from_attributes=True) for s in sessions]}


@router.post("/sessions")
def create_session(payload: SessionCreateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    st = payload.session_type.strip().lower()
    if st not in {"personal", "propfirm"}:
        raise HTTPException(status_code=400, detail="Invalid session_type")
    s = TradingSession(
        user_id=user.id,
        name=payload.name.strip(),
        session_type=st,
        start_balance=payload.start_balance,
        start_date=payload.start_date,
        end_date=payload.end_date,
        symbol=(payload.symbol.strip() if payload.symbol else None),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"session": SessionPublic.model_validate(s, from_attributes=True)}


@router.delete("/sessions/{session_id}")
def delete_session(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.get(TradingSession, session_id)
    if not s or s.user_id != user.id:
        raise HTTPException(status_code=404, detail="not_found")
    db.delete(s)
    db.commit()
    return {"ok": True}


@router.get("/sessions/{session_id}/analytics")
def analytics(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.get(TradingSession, session_id)
    if not s or s.user_id != user.id:
        raise HTTPException(status_code=404, detail="not_found")

    trades = (
        db.execute(select(Trade).where(Trade.session_id == session_id).order_by(Trade.date.desc().nullslast(), Trade.id.desc()))
        .scalars()
        .all()
    )

    pnls = [float(t.pnl or 0.0) for t in trades]
    wins = sum(1 for p in pnls if p > 0)
    losses = sum(1 for p in pnls if p < 0)
    breakeven = sum(1 for p in pnls if p == 0)
    n = len(pnls)

    net_pnl = sum(pnls)
    gross_profit = sum(p for p in pnls if p > 0)
    gross_loss = sum(p for p in pnls if p < 0)

    profit_factor = None
    if gross_loss != 0:
        profit_factor = gross_profit / abs(gross_loss)

    win_rate = None
    if n > 0:
        win_rate = wins / n

    avg_pnl = None
    if n > 0:
        avg_pnl = net_pnl / n

    avg_win = None
    if wins > 0:
        avg_win = gross_profit / wins

    avg_loss = None
    if losses > 0:
        avg_loss = gross_loss / losses

    equity = []
    cumulative = 0.0
    for t in reversed(trades):
        cumulative += float(t.pnl or 0.0)
        x = (t.date or datetime.utcnow()).isoformat()
        equity.append({"x": x, "y": cumulative})

    peak = 0.0
    drawdown = []
    for p in equity:
        peak = max(peak, float(p["y"]))
        dd = float(p["y"]) - peak
        drawdown.append({"x": p["x"], "y": dd})

    monthly_map: dict[str, float] = {}
    weekday_map: dict[str, list[float]] = {}

    for t in trades:
        d = t.date
        if d:
            key = f"{d.year:04d}-{d.month:02d}"
            monthly_map[key] = monthly_map.get(key, 0.0) + float(t.pnl or 0.0)
            wd = d.strftime("%a")
            weekday_map.setdefault(wd, []).append(float(t.pnl or 0.0))

    monthly_pnl = [{"x": k, "y": monthly_map[k]} for k in sorted(monthly_map.keys())]
    weekday_winrate = []
    for wd in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]:
        arr = weekday_map.get(wd, [])
        if not arr:
            continue
        wn = sum(1 for p in arr if p > 0)
        weekday_winrate.append({"x": wd, "y": wn / len(arr), "n": len(arr)})

    max_drawdown = None
    if drawdown:
        max_drawdown = min(float(p["y"]) for p in drawdown)

    analytics_obj = {
        "session": {"id": s.id, "name": s.name, "session_type": s.session_type},
        "kpis": {
            "trades": n,
            "wins": wins,
            "losses": losses,
            "breakeven": breakeven,
            "net_pnl": net_pnl,
            "gross_profit": gross_profit,
            "gross_loss": gross_loss,
            "profit_factor": profit_factor,
            "win_rate": win_rate,
            "avg_pnl": avg_pnl,
            "avg_win": avg_win,
            "avg_loss": avg_loss,
            "expectancy_r": None,
            "sharpe": None,
            "sortino": None,
            "max_drawdown": max_drawdown,
            "max_drawdown_pct": None,
            "recovery_factor": None,
            "start_balance": (float(s.start_balance) if s.start_balance is not None else None),
        },
        "series": {
            "equity": equity,
            "drawdown": drawdown,
            "monthly_pnl": monthly_pnl,
            "weekday_winrate": weekday_winrate,
        },
        "recent_trades": [
            {
                "trade_id": t.trade_id,
                "date": (t.date.isoformat() if t.date else None),
                "symbol": t.symbol,
                "side": t.side,
                "entry": t.entry,
                "exit": t.exit,
                "pnl": float(t.pnl or 0.0),
                "status": ("win" if (t.pnl or 0.0) > 0 else "loss" if (t.pnl or 0.0) < 0 else "breakeven"),
                "stop_loss": t.stop_loss,
                "take_profit": t.take_profit,
                "risk_amount": t.risk_amount,
                "rr_planned": t.rr_planned,
                "rr_actual": t.rr_actual,
                "r_multiple": t.r_multiple,
                "price_move_pips": t.price_move_pips,
                "quantity": t.quantity,
                "close_type": t.close_type,
                "holding_time_hours": t.holding_time_hours,
                "entry_time": (t.entry_time.isoformat() if t.entry_time else None),
                "exit_time": (t.exit_time.isoformat() if t.exit_time else None),
                "day_of_week": t.day_of_week,
                "month": t.month,
                "year": t.year,
                "hour_of_entry": t.hour_of_entry,
                "hour_of_exit": t.hour_of_exit,
                "mfe": t.mfe,
                "mae": t.mae,
                "highest_price": t.highest_price,
                "lowest_price": t.lowest_price,
                "pre_trade_notes": t.pre_trade_notes,
                "post_trade_notes": t.post_trade_notes,
                "has_entry_screenshot": bool(t.entry_screenshot),
                "has_exit_screenshot": bool(t.exit_screenshot),
            }
            for t in trades[:50]
        ],
    }

    return {"analytics": analytics_obj}


@router.get("/sessions/{session_id}/trades/{trade_id}/screenshot")
def trade_screenshot(
    session_id: int,
    trade_id: str,
    kind: str = Query(default="entry"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s = db.get(TradingSession, session_id)
    if not s or s.user_id != user.id:
        raise HTTPException(status_code=404, detail="not_found")

    t = (
        db.execute(select(Trade).where(Trade.session_id == session_id, Trade.trade_id == trade_id).order_by(Trade.id.desc()))
        .scalars()
        .first()
    )
    if not t:
        return Response(status_code=204)

    if kind == "exit":
        raw = t.exit_screenshot
        mime = t.exit_screenshot_mime
    else:
        raw = t.entry_screenshot
        mime = t.entry_screenshot_mime

    if not raw:
        return Response(status_code=204)

    return Response(content=raw, media_type=mime or "image/png")
