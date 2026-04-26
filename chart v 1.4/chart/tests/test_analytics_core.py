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

