from analytics_core.normalization import filter_by_instrument, normalize_trades
from analytics_core.simulation import simulate_equity_curve, simulate_trade
from analytics_core.heatmap import build_expectancy_heatmap, build_histogram
from analytics_core.stats import (
    compute_equity_summary,
    compute_per_instrument_summary,
    compute_playbook_breakdown,
    compute_recent_trades,
    compute_stats,
)
from analytics_core.session_series import (
    compute_balance_equity_metrics,
    compute_monthly_net_pnl,
    compute_session_dashboard_extras,
    compute_sharpe_sortino,
    compute_weekday_win_rate,
)
from analytics_core.csv_journal import parse_trades_csv_text
from datetime import datetime, timezone


def _utc_ts(y, m, d, hour=12):
    return datetime(y, m, d, hour, 0, 0, tzinfo=timezone.utc).timestamp()


def _sample_raw_trades():
    return [
        {
            "tradeId": "t1",
            "ticker": "EUR/USD",
            "direction": "BUY",
            "setup": "Breakout",
            "closeTime": 1000,
            "netPnL": 100,
            "rMultiple": 2.0,
            "mae_r": -0.5,
            "mfe_r": 2.5,
            "quantity": 1.0,
            "spread_pips_at_entry": 1.0,
            "commission_at_entry": 2.0,
            "pip_value_at_entry": 10.0,
            "riskAmount": 50,
        },
        {
            "tradeId": "t2",
            "ticker": "GBPUSD",
            "direction": "SELL",
            "setup": "Pullback",
            "closeTime": 2000,
            "netPnL": -40,
            "rMultiple": -1.0,
            "mae_r": -1.5,
            "mfe_r": 0.7,
            "quantity": 1.0,
            "spread_pips_at_entry": 1.2,
            "commission_at_entry": 2.5,
            "pip_value_at_entry": 10.0,
            "riskAmount": 40,
        },
    ]


def test_normalize_and_filter_instrument():
    trades = normalize_trades(_sample_raw_trades())
    assert len(trades) == 2
    assert trades[0].ticker == "EURUSD"
    assert trades[1].ticker == "GBPUSD"

    eur = filter_by_instrument(trades, "EURUSD")
    assert len(eur) == 1
    assert eur[0].trade_id == "t1"


def test_normalize_falls_back_to_instrument_settings_when_flats_missing():
    """Older / alternate journal rows may only store instrument_settings; no duplicate flat fields."""
    raw = [
        {
            "tradeId": "legacy1",
            "ticker": "EURUSD",
            "direction": "BUY",
            "closeTime": 500,
            "netPnL": 10,
            "rMultiple": 1.0,
            "mae_r": 0.0,
            "mfe_r": 1.0,
            "quantity": 1.0,
            "riskAmount": 10,
            "instrument_settings": {
                "spread_pips": 1.5,
                "commission_per_lot_per_side": 3.0,
                "pip_value_per_lot": 10.0,
            },
        }
    ]
    trades = normalize_trades(raw)
    assert len(trades) == 1
    t = trades[0]
    assert t.spread_pips_at_entry == 1.5
    assert t.commission_at_entry == 3.0
    assert t.pip_value_at_entry == 10.0


def test_simulation_and_equity_curve():
    trades = normalize_trades(_sample_raw_trades())
    one = simulate_trade(trades[0], tp_r=1.5, sl_r=1.0)
    assert "sim_net_usd" in one
    assert "sim_net_r" in one

    curve = simulate_equity_curve(trades, tp_r=1.5, sl_r=1.0)
    assert len(curve) == 2
    assert curve[0]["index"] == 1
    assert curve[1]["index"] == 2
    assert curve[0]["close_ts"] <= curve[1]["close_ts"]


def test_heatmap_and_histogram():
    trades = normalize_trades(_sample_raw_trades())
    heatmap = build_expectancy_heatmap(trades, tp_levels=[1.0, 1.5], sl_levels=[0.5, 1.0])
    assert heatmap["best"] is not None
    assert len(heatmap["tp_levels"]) == 2
    assert len(heatmap["sl_levels"]) == 2
    assert len(heatmap["flat"]) == 4
    assert len(heatmap["matrix"]) == 2

    hist = build_histogram([t.mae_r for t in trades], bucket_size=0.5)
    assert len(hist) > 0
    assert sum(bin_row["count"] for bin_row in hist) == len(trades)


def test_stats_playbook_recent_and_equity_summary():
    trades = normalize_trades(_sample_raw_trades())

    stats = compute_stats(trades)
    assert stats["total"] == 2
    assert stats["wins"] == 1
    assert stats["losses"] == 1

    playbooks = compute_playbook_breakdown(trades)
    assert len(playbooks) == 2
    assert {p["setup"] for p in playbooks} == {"Breakout", "Pullback"}

    per_instrument = compute_per_instrument_summary(trades)
    assert len(per_instrument) == 2
    assert {p["ticker"] for p in per_instrument} == {"EURUSD", "GBPUSD"}

    recent = compute_recent_trades(trades, limit=1)
    assert len(recent) == 1
    assert recent[0]["trade_id"] == "t2"

    curve = simulate_equity_curve(trades, tp_r=1.5, sl_r=1.0)
    eq = compute_equity_summary(curve)
    assert "actual_final" in eq
    assert "simulated_final" in eq
    assert "delta_final" in eq


def test_sharpe_sortino_two_trades():
    pnls = [100.0, -40.0]
    m = compute_sharpe_sortino(pnls)
    assert m["sharpe"] is not None
    assert m["sortino"] is not None


def test_monthly_and_weekday_from_timestamps():
    raw = [
        {
            "tradeId": "a",
            "ticker": "EURUSD",
            "direction": "BUY",
            "closeTime": _utc_ts(2024, 1, 2, 10),
            "netPnL": 50,
            "rMultiple": 1.0,
            "mae_r": 0.0,
            "mfe_r": 1.0,
            "quantity": 1.0,
            "riskAmount": 50,
        },
        {
            "tradeId": "b",
            "ticker": "EURUSD",
            "direction": "BUY",
            "closeTime": _utc_ts(2024, 1, 9, 14),
            "netPnL": -30,
            "rMultiple": -0.5,
            "mae_r": -0.5,
            "mfe_r": 0.2,
            "quantity": 1.0,
            "riskAmount": 60,
        },
        {
            "tradeId": "c",
            "ticker": "EURUSD",
            "direction": "BUY",
            "closeTime": _utc_ts(2024, 2, 1, 9),
            "netPnL": 20,
            "rMultiple": 0.4,
            "mae_r": 0.0,
            "mfe_r": 0.5,
            "quantity": 1.0,
            "riskAmount": 50,
        },
    ]
    trades = normalize_trades(raw)
    monthly = compute_monthly_net_pnl(trades)
    assert len(monthly) == 2
    assert monthly[0]["x"] == "2024-01"
    assert monthly[0]["y"] == 20.0
    assert monthly[1]["x"] == "2024-02"
    wd = compute_weekday_win_rate(trades)
    assert len(wd) == 7
    tue = next(x for x in wd if x["x"] == "Tue")
    assert tue["n"] == 2


def test_balance_equity_drawdown():
    raw = [
        {
            "tradeId": "1",
            "ticker": "EURUSD",
            "direction": "BUY",
            "closeTime": _utc_ts(2024, 3, 1),
            "netPnL": -200,
            "rMultiple": -1.0,
            "mae_r": -1.0,
            "mfe_r": 0.1,
            "quantity": 1.0,
            "riskAmount": 200,
        },
        {
            "tradeId": "2",
            "ticker": "EURUSD",
            "direction": "BUY",
            "closeTime": _utc_ts(2024, 3, 2),
            "netPnL": 100,
            "rMultiple": 0.5,
            "mae_r": -0.2,
            "mfe_r": 0.6,
            "quantity": 1.0,
            "riskAmount": 200,
        },
    ]
    trades = normalize_trades(raw)
    bal = compute_balance_equity_metrics(trades, 10_000.0)
    assert bal["start_balance"] == 10_000.0
    assert bal["net_pnl"] == -100.0
    assert len(bal["equity"]) == 2
    assert bal["max_drawdown"] is not None
    assert bal["max_drawdown"] > 0
    assert bal["recovery_factor"] is not None


def test_parse_trades_csv_minimal():
    csv_text = (
        "tradeId,ticker,netPnL,openTime,closeTime,rMultiple,mae_r,mfe_r,riskAmount\n"
        "1,EURUSD,50,1700000000000,1700003600000,1,-0.5,1.2,100\n"
    )
    r = parse_trades_csv_text(csv_text)
    assert not r["errors"]
    assert len(r["trades"]) == 1
    t = r["trades"][0]
    assert t["tradeId"] == "1"
    assert t["ticker"] == "EURUSD"
    assert t["netPnL"] == 50.0
    assert t["pnl"] == 50.0
    assert t["pnl_currency_net"] == 50.0
    assert t["status"] == "closed"
    assert "closeTime" in t


def test_parse_trades_csv_dashboard_export_roundtrip():
    """Columns emitted by TalariaV16 exportDashboardTradesCsv should re-import faithfully."""
    csv_text = (
        "journal_trade_id,symbol,side,quantity,status,entryTime,exitTime,"
        "entryPrice,exitPrice,stopLoss,takeProfit,pnl_currency_net,rMultiple,"
        "plannedRR,actual_rr_net,closeType,durationMinutes\n"
        "sess-42,EURUSD,BUY,1.25,Closed,2013-05-01T08:15:00.000Z,2013-05-01T10:23:00.000Z,"
        "1.3185,1.3210,1.3160,1.3240,125.5,1.25,2.0,1.25,Target,128\n"
    )
    r = parse_trades_csv_text(csv_text)
    assert not r["errors"], r["errors"]
    t = r["trades"][0]
    assert t["tradeId"] == "sess-42"
    assert t["ticker"] == "EURUSD"
    assert t["direction"] == "BUY"
    assert t["quantity"] == 1.25
    assert t["status"] == "closed"
    assert t["pnl_currency_net"] == 125.5
    assert t["rMultiple"] == 1.25
    assert t["plannedRR"] == 2.0
    assert t["entryPrice"] == "1.3185"
    assert t["exitPrice"] == "1.3210"
    assert t["stopLoss"] == "1.3160"
    assert t["takeProfit"] == "1.3240"
    assert t["closeType"] == "Target"
    assert t["durationMinutes"] == 128.0


def test_session_dashboard_extras_bundle():
    raw = [
        {
            "tradeId": "1",
            "ticker": "EURUSD",
            "direction": "BUY",
            "closeTime": _utc_ts(2024, 4, 1),
            "netPnL": 10,
            "rMultiple": 0.2,
            "mae_r": 0.0,
            "mfe_r": 0.3,
            "quantity": 1.0,
            "riskAmount": 50,
        },
    ]
    trades = normalize_trades(raw)
    bundle = compute_session_dashboard_extras(trades, 5000.0)
    assert "sharpe_sortino" in bundle
    assert "monthly_pnl" in bundle
    assert "weekday_winrate" in bundle
    assert bundle["balance"]["start_balance"] == 5000.0
    assert "yearly_summary" in bundle
    assert bundle["yearly_summary"]["best_year"]["year"] == 2024
    assert "holding_duration" in bundle


def test_holding_duration_open_close():
    raw = [
        {
            "tradeId": "a",
            "ticker": "EURUSD",
            "direction": "BUY",
            "openTime": _utc_ts(2024, 5, 1, 10) * 1000,
            "closeTime": _utc_ts(2024, 5, 2, 10) * 1000,
            "netPnL": 5,
            "rMultiple": 0.1,
            "mae_r": 0.0,
            "mfe_r": 0.2,
            "quantity": 1.0,
            "riskAmount": 10,
        },
        {
            "tradeId": "b",
            "ticker": "EURUSD",
            "direction": "BUY",
            "openTime": _utc_ts(2024, 5, 3, 10) * 1000,
            "closeTime": _utc_ts(2024, 5, 3, 22) * 1000,
            "netPnL": -2,
            "rMultiple": -0.2,
            "mae_r": -0.3,
            "mfe_r": 0.1,
            "quantity": 1.0,
            "riskAmount": 10,
        },
    ]
    trades = normalize_trades(raw)
    h = compute_session_dashboard_extras(trades, 1000.0)["holding_duration"]
    assert h["trades_with_duration"] == 2
    assert h["avg_hours"] is not None and h["avg_hours"] > 0
    assert h["avg_win_hours"] is not None
    assert h["avg_loss_hours"] is not None

