# journal-backend/dashboard/queries.py
"""
SQL-aggregation helpers for dashboard metrics.

Key idea (vs. the legacy analytics.py): we NEVER load all rows into Python and loop.
We reuse the existing filtered/group-aware query and aggregate inside the database with
COUNT / SUM / AVG / CASE / GROUP BY, returning small result sets.

These helpers operate on a base SQLAlchemy query of `JournalEntry` (already scoped to the
user/profile and standard filters), so all access-control logic is reused unchanged.
"""

from sqlalchemy import func, case
from models import JournalEntry


def _round(value, ndigits=2):
    return round(value, ndigits) if value is not None else None


def aggregate_basic_stats(base_query):
    """
    Compute the same fields as analytics.calculate_basic_stats, but in ONE SQL pass.

    `base_query` must be a query of JournalEntry rows already scoped + filtered
    (e.g. build_group_aware_query(...) then apply_standard_filters(...)).
    """
    # Clear any ORDER BY so the aggregate query is valid across databases.
    q = base_query.order_by(None)

    row = q.with_entities(
        func.count().label("total"),
        func.coalesce(func.sum(JournalEntry.pnl), 0.0).label("total_pnl"),
        func.coalesce(
            func.sum(case((JournalEntry.pnl > 0, 1), else_=0)), 0
        ).label("wins"),
        func.coalesce(
            func.sum(case((JournalEntry.pnl < 0, 1), else_=0)), 0
        ).label("losses"),
        func.coalesce(
            func.sum(case((JournalEntry.pnl == 0, 1), else_=0)), 0
        ).label("breakeven"),
        func.coalesce(
            func.sum(case((JournalEntry.pnl > 0, JournalEntry.pnl), else_=0.0)), 0.0
        ).label("gross_win"),
        func.coalesce(
            func.sum(case((JournalEntry.pnl < 0, JournalEntry.pnl), else_=0.0)), 0.0
        ).label("gross_loss"),
        func.max(JournalEntry.pnl).label("largest_win"),
        func.min(JournalEntry.pnl).label("largest_loss"),
        func.avg(JournalEntry.rr).label("avg_rr"),
        func.min(JournalEntry.date).label("first_date"),
        func.max(JournalEntry.date).label("last_date"),
    ).one()

    total = int(row.total or 0)
    if total == 0:
        return {
            "total_trades": 0,
            "winning_trades": 0,
            "losing_trades": 0,
            "breakeven_trades": 0,
            "win_rate": 0,
            "total_pnl": 0,
            "avg_pnl": 0,
            "profit_factor": None,
            "avg_win": 0,
            "avg_loss": 0,
            "largest_win": 0,
            "largest_loss": 0,
            "avg_rr": 0,
            "total_wins": 0,
            "total_losses": 0,
        }

    wins = int(row.wins or 0)
    losses = int(row.losses or 0)
    gross_win = float(row.gross_win or 0.0)
    gross_loss = abs(float(row.gross_loss or 0.0))
    total_pnl = float(row.total_pnl or 0.0)

    profit_factor = (
        gross_win / gross_loss
        if gross_loss > 0
        else (gross_win if gross_win > 0 else None)
    )

    result = {
        "total_trades": total,
        "winning_trades": wins,
        "losing_trades": losses,
        "breakeven_trades": int(row.breakeven or 0),
        "win_rate": _round(wins / total * 100),
        "total_pnl": _round(total_pnl),
        "avg_pnl": _round(total_pnl / total),
        "profit_factor": _round(profit_factor),
        "avg_win": _round(gross_win / wins) if wins else 0,
        "avg_loss": _round(gross_loss / losses) if losses else 0,
        "largest_win": _round(float(row.largest_win or 0.0)),
        "largest_loss": _round(float(row.largest_loss or 0.0)),
        "avg_rr": _round(float(row.avg_rr or 0.0)),
        "total_wins": _round(gross_win),
        "total_losses": _round(gross_loss),
    }
    if row.first_date:
        result["first_trade_date"] = row.first_date.isoformat()
    if row.last_date:
        result["last_trade_date"] = row.last_date.isoformat()
    return result


def aggregate_grouped(base_query, group_column):
    """
    GROUP BY a column (e.g. JournalEntry.strategy or JournalEntry.symbol) and return
    per-group stats — all computed in SQL, sorted by profit factor desc.
    """
    q = base_query.order_by(None)
    rows = q.with_entities(
        group_column.label("group"),
        func.count().label("total"),
        func.coalesce(func.sum(JournalEntry.pnl), 0.0).label("total_pnl"),
        func.coalesce(func.sum(case((JournalEntry.pnl > 0, 1), else_=0)), 0).label("wins"),
        func.coalesce(
            func.sum(case((JournalEntry.pnl > 0, JournalEntry.pnl), else_=0.0)), 0.0
        ).label("gross_win"),
        func.coalesce(
            func.sum(case((JournalEntry.pnl < 0, JournalEntry.pnl), else_=0.0)), 0.0
        ).label("gross_loss"),
    ).group_by(group_column).all()

    out = []
    for r in rows:
        total = int(r.total or 0)
        wins = int(r.wins or 0)
        gross_win = float(r.gross_win or 0.0)
        gross_loss = abs(float(r.gross_loss or 0.0))
        pf = gross_win / gross_loss if gross_loss > 0 else (gross_win if gross_win > 0 else None)
        out.append(
            {
                "group": r.group if r.group is not None else "—",
                "total_trades": total,
                "total_pnl": _round(float(r.total_pnl or 0.0)),
                "win_rate": _round(wins / total * 100) if total else 0,
                "profit_factor": _round(pf),
            }
        )
    out.sort(key=lambda x: x["profit_factor"] if x["profit_factor"] is not None else 0, reverse=True)
    return out


def paginate_trades(base_query, limit=100, offset=0):
    """
    Return one page of trades + the total count, instead of every row.
    `limit` is clamped to a sane maximum to protect the server.
    """
    limit = max(1, min(int(limit or 100), 500))
    offset = max(0, int(offset or 0))

    total = base_query.order_by(None).with_entities(func.count()).scalar() or 0
    page = (
        base_query.order_by(JournalEntry.date.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    return page, int(total), limit, offset
