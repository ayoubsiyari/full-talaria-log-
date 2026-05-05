import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import ColorPickerPopup from './components/ColorPickerPopup';
import Toggle from './components/Toggle';
import SymBadge from './components/SymBadge';
import FlagSvg from './components/FlagSvg';
import { SYMBOLS_DATA, EMOJI_CATS, LOAD_QUOTES } from './data/constants';
import { renderSessionPage } from './pages/SessionPage';
import { renderLoadingScreen } from './pages/LoadingScreen';
import { renderMainApp } from './pages/MainApp';

const TalariaV8b = () => {
  const navigate = useNavigate();
  const viewToPath = { sessions: '/', dashboard: '/dashboard', stratbank: '/strategies', journal: '/journal', resources: '/resources' };
  const [loading, setLoading] = useState(false);
  const [loadFading, setLoadFading] = useState(false);
  const [loadPhase, setLoadPhase] = useState("chart");
  const [loadDots, setLoadDots] = useState("");
  const [loadQuote, setLoadQuote] = useState(LOAD_QUOTES[0]);
  const [typedQuote, setTypedQuote] = useState("");
  const [sessionPage, setSessionPage] = useState(true);
  const [sessPageFading, setSessPageFading] = useState(false);
  const [sessions, setSessions] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("talaria_sessions") || "[]");
      // only restore if sessions have strategyDesc (schema v3+)
      if (saved.length > 0 && saved[0].strategyDesc !== undefined) return saved;
    } catch {}
    return [
      { id:1,  name:"NQ Momentum — Q1 2024",    strategyName:"Momentum Breakout",    strategyDesc:"Trades NQ momentum breakouts on the 5m chart using volume confirmation and ATR-based stops. Enters on breakout candle close, targets 2R minimum.",                                              tickers:["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NZDUSD","USDCAD","EURGBP","EURJPY","GBPJPY"],                          timeframe:"5m",  startDate:"2024-01-02", endDate:"2024-03-29", capital:50000,  createdAt:"2026-05-02T09:14:00Z", trades:214, pnl:8340,   winRate:58, avgRR:2.1, tradingMode:"standard", progress:100, rollbackAllowed:true,  assetClasses:["Futures"],  leverage:"1:10",  riskVal:"1",   riskMode:"pct",    commission:"Per Lot", replayMode:"Candle", replaySpeed:30 },
      { id:2,  name:"ES Mean Reversion",         strategyName:"EMA Reversion",        strategyDesc:"Fades extended moves on ES/NQ/RTY using EMA distance bands. Entries on pullback candles after price stretches >1.5 ATR from the 20 EMA.",                                                           tickers:["ES","NQ","RTY","YM","MES","MNQ","MYM","MRTY","GC","SI"],               timeframe:"15m", startDate:"2023-06-01", endDate:"2023-12-31", capital:100000, createdAt:"2024-01-15T11:32:00Z", trades:87,  pnl:-1220,  winRate:44, avgRR:1.4, tradingMode:"standard", progress:42,  rollbackAllowed:false, assetClasses:["Futures"],  leverage:"1:5",   riskVal:"2",   riskMode:"pct",    commission:"None",    replayMode:"Tick",   replaySpeed:15 },
      { id:3,  name:"FTMO Challenge — EUR/USD",  strategyName:"London Session Scalp", strategyDesc:"Scalps during the London open using key S/R levels. Targets 10–20 pips with tight 5-pip stops. Only trades the first 2 hours of the London session.",                                               tickers:["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NZDUSD","USDCAD","EURGBP","EURJPY","GBPJPY"],   timeframe:"1H",  startDate:"2024-02-01", endDate:"2024-02-29", capital:100000, createdAt:"2024-03-02T08:05:00Z", trades:31,  pnl:6750,   winRate:65, avgRR:1.8, tradingMode:"prop",     progress:100, rollbackAllowed:false, assetClasses:["Forex"],    leverage:"1:100", riskVal:"0.5", riskMode:"pct",    commission:"Spread",  replayMode:"Tick",   replaySpeed:60, propFirm:"FTMO",       dailyLoss:"500",  totalDD:"1000", profitTarget:"10000", minDays:"10" },
      { id:4,  name:"CL Breakout System",        strategyName:"Volume Breakout",      strategyDesc:"Trades range breakouts on crude oil and natural gas with volume confirmation. Requires 150% of average volume on the breakout candle to qualify.",                                                   tickers:["CL","NG","RB","HO","BZ","MCL","QM","XOP","USO","XLE"],                    timeframe:"1H",  startDate:"2023-09-01", endDate:"2024-01-31", capital:25000,  createdAt:"2024-02-10T14:20:00Z", trades:0,   pnl:null,   winRate:null, avgRR:null, tradingMode:"standard", progress:0,   rollbackAllowed:true,  assetClasses:["Futures"],  leverage:"1:10",  riskVal:"1.5", riskMode:"pct",    commission:"Per Lot", replayMode:"Candle", replaySpeed:50 },
      { id:5,  name:"GC Trend Follow — 2023",   strategyName:"Golden Cross Trend",   strategyDesc:"Long-only trend strategy using the 50/200 EMA golden cross on gold and silver. Holds trades for days to weeks; adds on pullbacks to the 50 EMA.",                                                  tickers:["GC","SI","PL","PA","HG","MGC","ZG","ZI","XAUUSD","XAGUSD"],                    timeframe:"4H",  startDate:"2023-01-01", endDate:"2023-12-31", capital:75000,  createdAt:"2024-01-05T16:44:00Z", trades:52,  pnl:12480,  winRate:71, avgRR:2.6, tradingMode:"standard", progress:85,  rollbackAllowed:true,  assetClasses:["Futures"],  leverage:"1:1",   riskVal:"2",   riskMode:"pct",    commission:"None",    replayMode:"Candle", replaySpeed:20 },
      { id:6,  name:"EUR/USD Grid 2023",         strategyName:"Grid Trading",         strategyDesc:"Places a grid of buy/sell orders every 20 pips around a central price level on EUR/USD. Profits from oscillating price action; no directional bias.",                                               tickers:["EURUSD","EURGBP","EURJPY","EURCHF","EURAUD","EURCAD","EURNZD","EURPLN","EURHUF","EURSEK"],                     timeframe:"1H",  startDate:"2023-03-01", endDate:"2023-08-31", capital:10000,  createdAt:"2023-09-10T07:30:00Z", trades:388, pnl:2210,   winRate:62, avgRR:1.2, tradingMode:"standard", progress:100, rollbackAllowed:false, assetClasses:["Forex"],    leverage:"1:50",  riskVal:"0.5", riskMode:"pct",    commission:"Spread",  replayMode:"Tick",   replaySpeed:100 },
      { id:7,  name:"Crypto Scalp 2024",         strategyName:"RSI Scalp",            strategyDesc:"RSI-based scalp strategy on BTC and ETH. Enters on RSI oversold/overbought reversals confirmed by a bullish/bearish engulfing candle. 1% risk per trade.",                                         tickers:["BTCUSD","ETHUSD","BNBUSD","SOLUSD","ADAUSD","XRPUSD","DOTUSD","LINKUSD","MATICUSD","AVAXUSD"],            timeframe:"5m",  startDate:"2024-01-01", endDate:"2024-06-30", capital:20000,  createdAt:"2024-07-01T10:00:00Z", trades:142, pnl:-3180,  winRate:41, avgRR:1.1, tradingMode:"standard", progress:23,  rollbackAllowed:false, assetClasses:["Crypto"],   leverage:"1:5",   riskVal:"1",   riskMode:"pct",    commission:"Per Lot", replayMode:"Tick",   replaySpeed:30 },
      { id:8,  name:"SPY Long Only",             strategyName:"Trend Following",      strategyDesc:"Long-only trend-following on major US ETFs using 20/50 SMA crossovers on the daily chart. Holds positions until crossover reversal; no shorts.",                                                    tickers:["SPY","QQQ","IWM","DIA","XLK","XLF","XLE","XLV","XLI","XLC"],            timeframe:"1D",  startDate:"2022-01-01", endDate:"2022-12-31", capital:50000,  createdAt:"2023-01-20T14:00:00Z", trades:24,  pnl:-5600,  winRate:37, avgRR:1.6, tradingMode:"standard", progress:100, rollbackAllowed:false, assetClasses:["Stocks"],   leverage:"1:1",   riskVal:"5",   riskMode:"pct",    commission:"Per Lot", replayMode:"Candle", replaySpeed:10 },
      { id:9,  name:"The5ers Prop Run",          strategyName:"Asian Range Breakout", strategyDesc:"Breaks out of the Asian session range during the London open on GBP pairs. Minimum R:R of 1.8 required. Stops placed at the opposite edge of the Asian range.",                                     tickers:["GBPUSD","AUDUSD","EURUSD","USDJPY","USDCHF","NZDUSD","USDCAD","GBPJPY","EURAUD","AUDNZD"],            timeframe:"15m", startDate:"2024-04-01", endDate:"2024-04-30", capital:25000,  createdAt:"2024-05-05T09:20:00Z", trades:58,  pnl:1890,   winRate:55, avgRR:1.9, tradingMode:"prop",     progress:67,  rollbackAllowed:false, assetClasses:["Forex"],    leverage:"1:30",  riskVal:"0.5", riskMode:"pct",    commission:"Spread",  replayMode:"Tick",   replaySpeed:60, propFirm:"The5ers",    dailyLoss:"250",  totalDD:"500",  profitTarget:"2500",  minDays:"5"  },
      { id:10, name:"BTC Trend 2023",            strategyName:"MA Cross",             strategyDesc:"50/200 MA crossover strategy on BTC 4H chart. Rides long-term trends with 2% account risk per trade; pyramids on strong trend continuation.",                                                       tickers:["BTCUSD","ETHUSD","BNBUSD","SOLUSD","ADAUSD","XRPUSD","LTCUSD","BCHUSD","DOTUSD","LINKUSD"],                     timeframe:"4H",  startDate:"2023-01-01", endDate:"2023-12-31", capital:30000,  createdAt:"2024-01-10T12:00:00Z", trades:38,  pnl:9450,   winRate:60, avgRR:3.1, tradingMode:"standard", progress:100, rollbackAllowed:true,  assetClasses:["Crypto"],   leverage:"1:2",   riskVal:"2",   riskMode:"pct",    commission:"None",    replayMode:"Candle", replaySpeed:40 },
      { id:11, name:"YM Scalper",                strategyName:"VWAP Bounce",          strategyDesc:"Bounces off VWAP during regular trading hours on YM and MYM. Uses 1-min confirmation candles with a volume spike filter; targets 0.5× daily ATR.",                                                 tickers:["YM","MYM","ES","MES","NQ","MNQ","RTY","MRTY","GC","MGC"],                   timeframe:"2m",  startDate:"2024-03-01", endDate:"2024-05-31", capital:10000,  createdAt:"2024-06-01T08:00:00Z", trades:0,   pnl:null,   winRate:null, avgRR:null, tradingMode:"standard", progress:0,   rollbackAllowed:true,  assetClasses:["Futures"],  leverage:"1:10",  riskVal:"1",   riskMode:"dollar", commission:"Per Lot", replayMode:"Tick",   replaySpeed:80 },
      { id:12, name:"FTMO 100K Phase 1",         strategyName:"News Trading",         strategyDesc:"Trades high-impact news events (NFP, CPI, FOMC) with breakout entries and wide initial stops. Only 3 trades per news event; no overnight holds.",                                                   tickers:["EURUSD","USDJPY","XAUUSD","GBPUSD","USDCHF","AUDUSD","NZDUSD","USDCAD","EURJPY","GBPJPY"],   timeframe:"1H",  startDate:"2024-03-01", endDate:"2024-03-31", capital:100000, createdAt:"2024-04-02T11:11:00Z", trades:22,  pnl:7200,   winRate:68, avgRR:2.0, tradingMode:"prop",     progress:88,  rollbackAllowed:false, assetClasses:["Forex"],    leverage:"1:100", riskVal:"0.5", riskMode:"pct",    commission:"Spread",  replayMode:"Tick",   replaySpeed:60, propFirm:"FTMO",       dailyLoss:"500",  totalDD:"1000", profitTarget:"10000", minDays:"10" },
      { id:13, name:"Crude Oil Seasonal",        strategyName:"Seasonal Trend",       strategyDesc:"Exploits known seasonal patterns in crude oil futures. Enters at the start of historically bullish/bearish months; low-frequency with multi-week holds.",                                             tickers:["CL","NG","RB","HO","BZ","MCL","QM","ZC","ZS","ZW"],                         timeframe:"1D",  startDate:"2022-06-01", endDate:"2022-12-31", capital:40000,  createdAt:"2023-02-14T15:30:00Z", trades:18,  pnl:5640,   winRate:67, avgRR:2.3, tradingMode:"standard", progress:100, rollbackAllowed:false, assetClasses:["Futures"],  leverage:"1:10",  riskVal:"2",   riskMode:"pct",    commission:"Per Lot", replayMode:"Candle", replaySpeed:5  },
      { id:14, name:"GBP/JPY Momentum",          strategyName:"Breakout Follow",      strategyDesc:"Momentum continuation breakouts on GBP/JPY and USD/JPY. Trend-aligned entries only; stops placed below the prior swing low. ATR trailing stop after 1R.",                                          tickers:["GBPJPY","USDJPY","EURJPY","AUDJPY","CADJPY","NZDJPY","CHFJPY","GBPUSD","EURUSD","EURGBP"],            timeframe:"30m", startDate:"2024-01-01", endDate:"2024-03-31", capital:15000,  createdAt:"2024-04-10T09:45:00Z", trades:103, pnl:2150,   winRate:51, avgRR:1.7, tradingMode:"standard", progress:51,  rollbackAllowed:true,  assetClasses:["Forex"],    leverage:"1:50",  riskVal:"1",   riskMode:"pct",    commission:"Spread",  replayMode:"Candle", replaySpeed:45 },
      { id:15, name:"Topstep 50K Futures",       strategyName:"VWAP Strategy",        strategyDesc:"Uses VWAP as dynamic support/resistance on ES and NQ. Takes trades only in the direction of the VWAP slope; avoids choppy flat-VWAP conditions.",                                                  tickers:["ES","NQ","YM","RTY","MES","MNQ","MYM","MRTY","GC","CL"],                    timeframe:"5m",  startDate:"2024-05-01", endDate:"2024-05-31", capital:50000,  createdAt:"2024-06-03T14:00:00Z", trades:41,  pnl:1620,   winRate:54, avgRR:1.6, tradingMode:"prop",     progress:34,  rollbackAllowed:false, assetClasses:["Futures"],  leverage:"1:10",  riskVal:"0.5", riskMode:"pct",    commission:"Per Lot", replayMode:"Tick",   replaySpeed:50, propFirm:"Topstep",    dailyLoss:"1000", totalDD:"2000", profitTarget:"3000",  minDays:"5"  },
      { id:16, name:"NVDA Earnings Plays",       strategyName:"Earnings Catalyst",    strategyDesc:"Trades post-earnings momentum on high-beta tech stocks. Enters on the open of the day after earnings; holds 3–5 days riding the earnings reaction move.",                                           tickers:["NVDA","AMD","INTC","QCOM","AVGO","MU","AMAT","LRCX","KLAC","TXN"],          timeframe:"1D",  startDate:"2023-01-01", endDate:"2023-12-31", capital:20000,  createdAt:"2024-01-18T10:00:00Z", trades:0,   pnl:null,   winRate:null, avgRR:null, tradingMode:"standard", progress:0,   rollbackAllowed:false, assetClasses:["Stocks"],   leverage:"1:1",   riskVal:"3",   riskMode:"pct",    commission:"Per Lot", replayMode:"Candle", replaySpeed:10 },
      { id:17, name:"GBP/USD Asian Session",     strategyName:"Asian Breakout",       strategyDesc:"Fades the Asian session range on GBP/USD. Entries 30 minutes after the London open once price re-enters the Asian range. 1:2 R:R minimum.",                                                        tickers:["GBPUSD","EURUSD","AUDUSD","NZDUSD","USDCAD","USDCHF","USDJPY","GBPJPY","EURAUD","AUDNZD"],                     timeframe:"15m", startDate:"2023-07-01", endDate:"2023-12-31", capital:10000,  createdAt:"2024-01-08T08:30:00Z", trades:169, pnl:3470,   winRate:57, avgRR:1.5, tradingMode:"standard", progress:100, rollbackAllowed:false, assetClasses:["Forex"],    leverage:"1:30",  riskVal:"0.5", riskMode:"pct",    commission:"Spread",  replayMode:"Tick",   replaySpeed:70 },
      { id:18, name:"Prop 50K — Supply & Demand",strategyName:"Supply & Demand",      strategyDesc:"Identifies major supply and demand zones on the 4H chart; takes precision entries on the 15m chart. Minimum 1:3 R:R. No trading during overlapping sessions.",                                    tickers:["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NZDUSD","USDCAD","EURGBP","EURJPY","GBPJPY"],   timeframe:"4H",  startDate:"2023-10-01", endDate:"2024-01-31", capital:50000,  createdAt:"2024-02-05T12:00:00Z", trades:28,  pnl:4800,   winRate:61, avgRR:2.2, tradingMode:"prop",     progress:100, rollbackAllowed:false, assetClasses:["Forex"],    leverage:"1:100", riskVal:"1",   riskMode:"pct",    commission:"Spread",  replayMode:"Candle", replaySpeed:20, propFirm:"MyForexFunds",dailyLoss:"500",  totalDD:"1000", profitTarget:"5000",  minDays:"10" },
      { id:19, name:"MNQ Micro Futures",         strategyName:"Order Flow",           strategyDesc:"Reads DOM and footprint charts to identify institutional order flow on micro futures. High-frequency 1-min scalps; max 10 trades per session.",                                                     tickers:["MNQ","MES","MYM","MRTY","MGC","MCL","M2K","NQ","ES","YM"],                  timeframe:"1m",  startDate:"2024-02-01", endDate:"2024-04-30", capital:5000,   createdAt:"2024-05-01T07:50:00Z", trades:312, pnl:1890,   winRate:55, avgRR:1.3, tradingMode:"standard", progress:75,  rollbackAllowed:true,  assetClasses:["Futures"],  leverage:"1:10",  riskVal:"50",  riskMode:"dollar", commission:"Per Lot", replayMode:"Tick",   replaySpeed:100},
      { id:20, name:"XAU/USD Fibonacci Swing",   strategyName:"Fibonacci Swing",      strategyDesc:"Swing trades gold using key Fibonacci retracement levels on the 4H chart. Targets the 161.8% extension; trades typically last 2–5 days.",                                                         tickers:["XAUUSD","XAGUSD","EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD","EURJPY"],                     timeframe:"4H",  startDate:"2023-04-01", endDate:"2023-09-30", capital:20000,  createdAt:"2023-10-12T11:00:00Z", trades:44,  pnl:6120,   winRate:64, avgRR:2.4, tradingMode:"standard", progress:100, rollbackAllowed:true,  assetClasses:["Forex"],    leverage:"1:20",  riskVal:"1.5", riskMode:"pct",    commission:"Spread",  replayMode:"Candle", replaySpeed:25 },
      { id:21, name:"Nasdaq Gap & Go",           strategyName:"Gap & Go",             strategyDesc:"Trades opening gaps on NQ and QQQ. Enters after the first 5-min candle confirms the gap direction with above-average volume. Closes by end of session.",                                            tickers:["NQ","QQQ","NVDA","TSLA","AMZN","GOOGL","META","MSFT","AAPL","AMD"],                   timeframe:"5m",  startDate:"2023-09-01", endDate:"2024-01-31", capital:30000,  createdAt:"2024-02-20T09:00:00Z", trades:178, pnl:5940,   winRate:59, avgRR:1.9, tradingMode:"standard", progress:90,  rollbackAllowed:false, assetClasses:["Stocks","Futures"], leverage:"1:5", riskVal:"1", riskMode:"pct", commission:"Per Lot", replayMode:"Tick", replaySpeed:60 },
      { id:22, name:"EUR/USD 2023 Full Year",    strategyName:"Seasonal Bias",        strategyDesc:"Trades EUR/USD seasonal bias with trend filters. Identifies monthly directional bias from historical data; daily chart with position reviews every Monday.",                                         tickers:["EURUSD","EURGBP","EURJPY","EURCHF","EURAUD","EURCAD","EURNZD","GBPUSD","USDJPY","USDCHF"],                     timeframe:"1D",  startDate:"2023-01-01", endDate:"2023-12-31", capital:25000,  createdAt:"2024-01-30T16:20:00Z", trades:61,  pnl:4280,   winRate:56, avgRR:1.8, tradingMode:"standard", progress:100, rollbackAllowed:false, assetClasses:["Forex"],    leverage:"1:30",  riskVal:"1",   riskMode:"pct",    commission:"Spread",  replayMode:"Candle", replaySpeed:15 },
      { id:23, name:"E8 Funding Challenge",      strategyName:"ICT Concepts",         strategyDesc:"Applies ICT methodology: Order Blocks, Fair Value Gaps, and liquidity sweeps. Trades the 15m chart; only enters after a confirmed displacement from a key level.",                                  tickers:["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NZDUSD","USDCAD","EURGBP","EURJPY","GBPJPY"],            timeframe:"15m", startDate:"2024-05-01", endDate:"2024-05-31", capital:25000,  createdAt:"2024-06-10T08:00:00Z", trades:9,   pnl:340,    winRate:56, avgRR:1.7, tradingMode:"prop",     progress:15,  rollbackAllowed:false, assetClasses:["Forex"],    leverage:"1:100", riskVal:"0.5", riskMode:"pct",    commission:"Spread",  replayMode:"Tick",   replaySpeed:60, propFirm:"E8 Funding", dailyLoss:"500",  totalDD:"1000", profitTarget:"2500",  minDays:"5"  },
      { id:24, name:"RTY Small Cap Breakout",    strategyName:"Opening Range Break",  strategyDesc:"Trades the 9:30–10:00 opening range breakout on RTY and IWM. Targets 2× the opening range extension; stops at the opposite edge of the range.",                                                   tickers:["RTY","IWM","MRTY","ES","NQ","IJR","IJH","VBR","VTWO","SCHA"],                  timeframe:"5m",  startDate:"2024-03-01", endDate:"2024-05-31", capital:15000,  createdAt:"2024-06-15T10:30:00Z", trades:0,   pnl:null,   winRate:null, avgRR:null, tradingMode:"standard", progress:0,   rollbackAllowed:true,  assetClasses:["Futures","Stocks"], leverage:"1:5", riskVal:"1", riskMode:"pct", commission:"Per Lot", replayMode:"Candle", replaySpeed:40 },
      { id:25, name:"Gold & Silver Pairs",       strategyName:"Pairs Trading",        strategyDesc:"Exploits mean-reversion between GC and SI using z-score divergence. Dollar-neutral positions; enters when z-score exceeds 2 SD, exits at reversion to mean.",                                      tickers:["GC","SI","PL","PA","HG","MGC","ZG","ZI","XAUUSD","XAGUSD"],                    timeframe:"1H",  startDate:"2022-07-01", endDate:"2022-12-31", capital:50000,  createdAt:"2023-01-25T13:45:00Z", trades:76,  pnl:8850,   winRate:66, avgRR:2.0, tradingMode:"standard", progress:100, rollbackAllowed:false, assetClasses:["Futures"],  leverage:"1:1",   riskVal:"2",   riskMode:"pct",    commission:"Per Lot", replayMode:"Candle", replaySpeed:20 },
      { id:26, name:"AUD/USD Carry Trade",       strategyName:"Carry Trade",          strategyDesc:"Long AUD/USD and NZD/USD during risk-on environments. Holds multi-day to multi-week; exits on VIX spike or risk-off sentiment shift.",                                                              tickers:["AUDUSD","NZDUSD","USDCAD","USDCHF","USDJPY","AUDNZD","AUDCAD","AUDJPY","NZDJPY","CADCHF"],            timeframe:"1D",  startDate:"2023-05-01", endDate:"2023-10-31", capital:10000,  createdAt:"2023-11-14T09:10:00Z", trades:29,  pnl:-820,   winRate:45, avgRR:1.3, tradingMode:"standard", progress:62,  rollbackAllowed:false, assetClasses:["Forex"],    leverage:"1:30",  riskVal:"1",   riskMode:"pct",    commission:"Spread",  replayMode:"Candle", replaySpeed:10 },
      { id:27, name:"Crypto DCA 2022 Bear",      strategyName:"Dollar Cost Average",  strategyDesc:"Fixed $200/month DCA into BTC, ETH, and SOL regardless of price. No stops, full position holds. Tests passive accumulation strategy through a bear market.",                                      tickers:["BTCUSD","ETHUSD","SOLUSD","ADAUSD","BNBUSD","XRPUSD","DOTUSD","AVAXUSD","LINKUSD","MATICUSD"],   timeframe:"1D",  startDate:"2022-01-01", endDate:"2022-12-31", capital:10000,  createdAt:"2023-03-05T11:00:00Z", trades:52,  pnl:-2100,  winRate:35, avgRR:0.9, tradingMode:"standard", progress:100, rollbackAllowed:false, assetClasses:["Crypto"],   leverage:"1:1",   riskVal:"200", riskMode:"dollar", commission:"None",    replayMode:"Candle", replaySpeed:5  },
      { id:28, name:"FTMO Swing 200K",           strategyName:"Weekly Bias",          strategyDesc:"Identifies weekly directional bias using COT data and institutional order flow on the 4H chart. Max 2 trades per week; no counter-trend entries.",                                                  tickers:["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NZDUSD","USDCAD","EURGBP","EURJPY","GBPJPY"],   timeframe:"4H",  startDate:"2024-06-01", endDate:"2024-08-31", capital:200000, createdAt:"2024-06-28T14:00:00Z", trades:0,   pnl:null,   winRate:null, avgRR:null, tradingMode:"prop",     progress:0,   rollbackAllowed:false, assetClasses:["Forex"],    leverage:"1:100", riskVal:"0.5", riskMode:"pct",    commission:"Spread",  replayMode:"Candle", replaySpeed:30, propFirm:"FTMO",       dailyLoss:"2000", totalDD:"4000", profitTarget:"20000", minDays:"10" },
      { id:29, name:"ZB Treasury Bonds",         strategyName:"Yield Curve Trade",    strategyDesc:"Trades the yield curve by going long ZB and short ZN/ZF during inversion periods. Holds until curve normalizes; uses duration-weighted position sizing.",                                          tickers:["ZB","ZN","ZF","ZT","ZQ","UB","TLT","IEF","SHY","TIP"],               timeframe:"1H",  startDate:"2022-09-01", endDate:"2023-03-31", capital:100000, createdAt:"2023-04-08T10:00:00Z", trades:33,  pnl:7200,   winRate:61, avgRR:2.5, tradingMode:"standard", progress:100, rollbackAllowed:false, assetClasses:["Futures"],  leverage:"1:1",   riskVal:"1",   riskMode:"pct",    commission:"Per Lot", replayMode:"Candle", replaySpeed:15 },
      { id:30, name:"Multi-Asset Diversified",   strategyName:"Diversified Trend",    strategyDesc:"Trend-follows across NQ, GC, EUR/USD, and CL simultaneously with 1% risk per instrument. Rebalances monthly; uses ATR trailing stops to ride extended moves.",                                    tickers:["NQ","ES","GC","SI","EURUSD","GBPUSD","CL","NG","BTCUSD","XAUUSD"],      timeframe:"1H",  startDate:"2024-01-01", endDate:"2024-04-30", capital:200000, createdAt:"2024-05-15T12:30:00Z", trades:89,  pnl:14200,  winRate:63, avgRR:2.3, tradingMode:"standard", progress:47,  rollbackAllowed:true,  assetClasses:["Futures","Forex"], leverage:"1:10", riskVal:"1", riskMode:"pct", commission:"Per Lot", replayMode:"Candle", replaySpeed:30 },
    ];
  });
  const [newSessName, setNewSessName] = useState("");
  const [newSessSymbol, setNewSessSymbol] = useState("NQ");
  const [newSessTf, setNewSessTf] = useState("1H");
  const [newSessStart, setNewSessStart] = useState("");
  const [newSessEnd, setNewSessEnd] = useState("");
  const [newSessCapital, setNewSessCapital] = useState("50000");
  const [sessHov, setSessHov] = useState(null);
  const [stratPopup, setStratPopup] = useState(null);
  const [symPopup, setSymPopup] = useState(null);
  const [sessView, setSessView] = useState("sessions");
  const [dashSessId, setDashSessId] = useState(null);
  const [dashHov, setDashHov] = useState(null);
  const [sessSelected, setSessSelected] = useState(null);
  const [sessSearchQ, setSessSearchQ] = useState("");
  const [sessFilter, setSessFilter] = useState("all");
  const [sessActMenu, setSessActMenu] = useState(null);
  const [sessSortBy, setSessSortBy] = useState(null);
  const [sessSortDir, setSessSortDir] = useState("asc");
  const [sessSortOpen, setSessSortOpen] = useState(false);
  const [sessSearchOpen, setSessSearchOpen] = useState(false);
  const [sessLayoutMode, setSessLayoutMode] = useState("rows");
  const [cardSortOpen, setCardSortOpen] = useState(false);
  const [newSessCurrency, setNewSessCurrency] = useState("USD");
  const [sessDateMode, setSessDateMode] = useState("range");
  const [sessNBars, setSessNBars] = useState("5000");
  const [sessQuickDate, setSessQuickDate] = useState(null);
  const [sessRiskMode, setSessRiskMode] = useState("pct");
  const [sessRiskVal, setSessRiskVal] = useState("1");
  const [sessLeverage, setSessLeverage] = useState("1:100");
  const [sessCommission, setSessCommission] = useState("none");
  const [sessCommissionVal, setSessCommissionVal] = useState("3.50");
  const [sessSlippage, setSessSlippage] = useState("1");
  const [sessTradingMode, setSessTradingMode] = useState("standard");
  const [sessPropCat, setSessPropCat] = useState("Forex");
  const [sessPropFirm, setSessPropFirm] = useState("FTMO");
  const [sessNumPhases, setSessNumPhases] = useState(1);
  const [sessChallengeType, setSessChallengeType] = useState("Evaluation");
  const [sessP1DailyLossPct, setSessP1DailyLossPct] = useState("5");
  const [sessP1TotalDDPct, setSessP1TotalDDPct] = useState("10");
  const [sessP1ProfitTargetPct, setSessP1ProfitTargetPct] = useState("10");
  const [sessP1MinDays, setSessP1MinDays] = useState("4");
  const [sessP1MinDaysEnabled, setSessP1MinDaysEnabled] = useState(true);
  const [sessP2DailyLossPct, setSessP2DailyLossPct] = useState("5");
  const [sessP2TotalDDPct, setSessP2TotalDDPct] = useState("10");
  const [sessP2ProfitTargetPct, setSessP2ProfitTargetPct] = useState("5");
  const [sessP2MinDays, setSessP2MinDays] = useState("4");
  const [sessP2MinDaysEnabled, setSessP2MinDaysEnabled] = useState(true);
  const [sessMaxLotSize, setSessMaxLotSize] = useState("");
  const [sessMaxPosUnit, setSessMaxPosUnit] = useState("lots");
  const [sessMaxPosEnabled, setSessMaxPosEnabled] = useState(false);
  const [sessConsistencyRule, setSessConsistencyRule] = useState(false);
  const [sessConsistencyPct, setSessConsistencyPct] = useState("30");
  const [sessWeekendHold, setSessWeekendHold] = useState(false);
  const [sessTrailingDrawdown, setSessTrailingDrawdown] = useState(true);
  const [sessDailyLossEnabled, setSessDailyLossEnabled] = useState(true);
  const [sessFutMinDays, setSessFutMinDays] = useState("2");
  const [sessFutMinDaysEnabled, setSessFutMinDaysEnabled] = useState(true);
  const [sessP1DailyLossAmt, setSessP1DailyLossAmt] = useState("1000");
  const [sessP1MaxDDAmt, setSessP1MaxDDAmt] = useState("2000");
  const [sessP1ProfitTargetAmt, setSessP1ProfitTargetAmt] = useState("3000");
  const [sessP2DailyLossAmt, setSessP2DailyLossAmt] = useState("1000");
  const [sessP2MaxDDAmt, setSessP2MaxDDAmt] = useState("2000");
  const [sessP2ProfitTargetAmt, setSessP2ProfitTargetAmt] = useState("2000");
  const [sessMaxContracts, setSessMaxContracts] = useState("5");
  const [sessMaxContractsEnabled, setSessMaxContractsEnabled] = useState(true);
  const [sessReplaySpeed, setSessReplaySpeed] = useState(30);
  const [sessReplayMode, setSessReplayMode] = useState("candle");
  const [newSessTimezone, setNewSessTimezone] = useState("America/New_York");
  const [newSessDST, setNewSessDST] = useState(true);
  const [newSessDescription, setNewSessDescription] = useState("");
  const [newSessPlaybook, setNewSessPlaybook] = useState("");
  const [newSessFiles, setNewSessFiles] = useState([]);
  const [newSessMarginCall, setNewSessMarginCall] = useState("100");
  const [newSessStopOut, setNewSessStopOut] = useState("50");
  const [newSessMaxRisk, setNewSessMaxRisk] = useState("");
  const [newSessProtect, setNewSessProtect] = useState("none");
  const [newSessNavEnabled, setNewSessNavEnabled] = useState(true);
  const [newSessFilePickerOpen, setNewSessFilePickerOpen] = useState(false);
  const [newSessOpen, setNewSessOpen] = useState(false);
  const [editSessId, setEditSessId] = useState(null);
  const [newSessTickers, setNewSessTickers] = useState([]);
  const [newSessTickerInput, setNewSessTickerInput] = useState("");
  const [newSessTickerFocus, setNewSessTickerFocus] = useState(false);
  const [newSessAssetClass, setNewSessAssetClass] = useState("Forex");
  const [newSessAdvancedOrder, setNewSessAdvancedOrder] = useState(false);
  const [newSessRollback, setNewSessRollback] = useState(false);
  const [newSessTradingStyle, setNewSessTradingStyle] = useState("");
  const [newSessStratDropOpen, setNewSessStratDropOpen] = useState(false);
  const [newSessStratHov, setNewSessStratHov] = useState(null);
  const [newSessSymDropOpen, setNewSessSymDropOpen] = useState(false);
  const [newSessAssetDropOpen, setNewSessAssetDropOpen] = useState(false);
  const [newSessAssetHov, setNewSessAssetHov] = useState(null);
  const [newSessMarketOpen, setNewSessMarketOpen] = useState(false);
  const [newSessSupportTickers, setNewSessSupportTickers] = useState([]);
  const [newSessSupportAssetClass, setNewSessSupportAssetClass] = useState("Forex");
  const [newSessSupportInput, setNewSessSupportInput] = useState("");
  const [newSessSupportFocus, setNewSessSupportFocus] = useState(false);
  const [newSessSupportDropOpen, setNewSessSupportDropOpen] = useState(false);
  const [newSessInfoHov, setNewSessInfoHov] = useState(null);
  const [newSessSupportEnabled, setNewSessSupportEnabled] = useState(false);
  const [newSessCalOpen, setNewSessCalOpen] = useState(false);
  const [newSessCalTarget, setNewSessCalTarget] = useState("start");
  const [newSessCalPos, setNewSessCalPos] = useState({top:0,left:0});
  const [newSessCalViewY, setNewSessCalViewY] = useState(2020);
  const [newSessCalViewM, setNewSessCalViewM] = useState(0);
  const [newSessCalMode, setNewSessCalMode] = useState("days");
  const [newSessCalYearBase, setNewSessCalYearBase] = useState(2016);
  const [newSessStartInput, setNewSessStartInput] = useState("");
  const [newSessEndInput, setNewSessEndInput] = useState("");
  const [newSessRandomCount, setNewSessRandomCount] = useState(3);
  const [newSessRandRangeVal, setNewSessRandRangeVal] = useState(3);
  const [newSessRandRangeUnit, setNewSessRandRangeUnit] = useState("M");
  const [newSessActivePreset, setNewSessActivePreset] = useState(null);
  const [newSessSymPickerOpen, setNewSessSymPickerOpen] = useState(false);
  const [newSessSymPickerSearch, setNewSessSymPickerSearch] = useState("");
  const [newSessSymPickerPos, setNewSessSymPickerPos] = useState({top:0,left:0});
  const [newSessSupPickerOpen, setNewSessSupPickerOpen] = useState(false);
  const [newSessSupPickerSearch, setNewSessSupPickerSearch] = useState("");
  const [newSessSupPickerPos, setNewSessSupPickerPos] = useState({top:0,left:0});
  const [newSessSupPickerCat, setNewSessSupPickerCat] = useState("Forex");
  const [newSessTradingCostsEnabled, setNewSessTradingCostsEnabled] = useState(false);
  const [newSessCosts, setNewSessCosts] = useState({
    Forex:   {commission:"7.00", leverage:"1:500"},
    Futures: {commission:"2.10", leverage:"1:20"},
    Stocks:  {commission:"0.02", leverage:"1:5"},
    Crypto:  {commission:"0.05", leverage:"1:20"},
  });
  const [newSessSymbolSpreads, setNewSessSymbolSpreads] = useState({});
  const [newSessFuturesData, setNewSessFuturesData] = useState({});

  /* ── Strategies page state ── */
  const [stratTab, setStratTab] = useState("mine");
  const [stratSearch, setStratSearch] = useState("");
  const [stratSort, setStratSort] = useState("name");
  const [stratSortDir, setStratSortDir] = useState("asc");
  const [stratStyleFilter, setStratStyleFilter] = useState("All");
  const [stratBuilderOpen, setStratBuilderOpen] = useState(false);
  const [stratEditId, setStratEditId] = useState(null);
  const [savedCommunityIds, setSavedCommunityIds] = useState(new Set());
  const [myStrategies, setMyStrategies] = useState([]);
  const [stratBName, setStratBName] = useState("");
  const [stratBStyle, setStratBStyle] = useState("Trend Following");
  const [stratBDesc, setStratBDesc] = useState("");
  const [stratBInstruments, setStratBInstruments] = useState([]);
  const [stratBInstInput, setStratBInstInput] = useState("");
  const [stratBTimeframes, setStratBTimeframes] = useState([]);
  const [stratBTagInput, setStratBTagInput] = useState("");
  const [stratBTags, setStratBTags] = useState([]);
  const [stratBComplexity, setStratBComplexity] = useState("Medium");
  const [stratCardHov, setStratCardHov] = useState(null);

  const [tool, setTool] = useState("trendline");
  const [hov, setHov] = useState(null);
  const [btnPressed, setBtnPressed] = useState(null);
  const [dropdown, setDropdown] = useState(null);
  const [ddAnchor, setDdAnchor] = useState(null);
  const [toolPinned, setToolPinned] = useState(["Trend Line","Horizontal Line","Fib Retracement","Rectangle","Text"]); // start open so user can see it
  const [dialog, setDialog] = useState(false);
  const [dlgTab, setDlgTab] = useState("style");
  const [tickCandle, setTickCandle] = useState("candle");
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(30);
  const [buySell, setBuySell] = useState("buy");
  const [orderType, setOrderType] = useState("market");
  const [btmTab, setBtmTab] = useState("all");
  const [btmIndPos, setBtmIndPos] = useState(null);
  const [tblSort, setTblSort] = useState(null); // {col, dir:'asc'|'desc'}
  const btmTabBarRef = useRef(null);
  const [tradeCard, setTradeCard] = useState(null);
  const [tradeCardPreTags, setTradeCardPreTags] = useState([]);
  const [tradeCardPostTags, setTradeCardPostTags] = useState([]);
  const [tradeCardNotes, setTradeCardNotes] = useState("");
  const [tradeActPopup, setTradeActPopup] = useState(null);
  const [tapJournal, setTapJournal] = useState("");
  const [tapStrategy, setTapStrategy] = useState("");
  const [tapTags, setTapTags] = useState({});
  const [tapScreenshots, setTapScreenshots] = useState([null, null]);
  const [viewingScreenshot, setViewingScreenshot] = useState(null);
  const [tapFileSlot, setTapFileSlot] = useState(null);
  const [tapTagInput, setTapTagInput] = useState("");
  const [tradeTagOverrides, setTradeTagOverrides] = useState({});
  const [tagEditInput, setTagEditInput] = useState("");
  const [selRow, setSelRow] = useState(null);
  const [tagDrop, setTagDrop] = useState(null); // {id, type:'pre'|'post'}
  const [tagDropPos, setTagDropPos] = useState({top:0, left:0});
  const [btmOpen, setBtmOpen] = useState(false);
  const [btmHeight, setBtmHeight] = useState(()=>Math.round((window.innerHeight/1.05-92)*0.25));
  const [btmResizing, setBtmResizing] = useState(false);
  const btmDragRef = useRef({startY:0, startH:0, curH:Math.round((window.innerHeight/1.05-92)*0.25)});
  const btmPanelRef = useRef(null);
  const [tf, setTf] = useState("1m");
  const [sizeMode, setSizeMode] = useState("$");
  const [riskVal, setRiskVal] = useState("100");
  const [riskBasis, setRiskBasis] = useState("balance");
  const [slEnabled, setSlEnabled] = useState(false);
  const [entryRows, setEntryRows] = useState([{ id:0, price:"0", risk:"100" }]);
  const entryScrollRef = useRef(null);
  const [slPrice, setSlPrice] = useState("0");
  const [slRows, setSlRows] = useState([{ id:0, price:"0" }]);
  const slScrollRef = useRef(null);
  const [tpRows, setTpRows] = useState([{ id:0, price:"0", qty:"100", enabled:true }]);
  const tpScrollRef = useRef(null);
  const [tagDefs] = useState([
    { id:"setup",     label:"Setup OK",    type:"bool" },
    { id:"htf",       label:"HTF Bias",    type:"bool" },
    { id:"direction", label:"Direction",   type:"multi", options:["With Trend","Counter","Range"] },
    { id:"session",   label:"Session",     type:"multi", options:["London","NY","Overlap","Asian"] },
    { id:"risk",      label:"Risk Size",   type:"multi", options:["Normal","Half","Double"] },
    { id:"news",      label:"News Risk",   type:"bool" },
  ]);
  const [postTagDefs] = useState([
    { id:"execution", label:"Execution",     type:"multi", options:["Perfect","Good","OK","Poor"] },
    { id:"followed",  label:"Followed Plan", type:"bool" },
    { id:"emotion",   label:"Emotion",       type:"multi", options:["Calm","FOMO","Fearful","Greedy"] },
    { id:"exitRsn",   label:"Exit Reason",   type:"multi", options:["TP Hit","Manual","SL Hit","Trailing"] },
  ]);
  const [tagSels, setTagSels] = useState({});
  const [tagDropOpen, setTagDropOpen] = useState(null);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [notesText, setNotesText] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [tradeNotes, setTradeNotes] = useState({});
  const [tradeScreenshots, setTradeScreenshots] = useState({});
  const [screenshots, setScreenshots] = useState([]);
  const [ssOpen, setSsOpen] = useState(true);
  const [replaceTargetId, setReplaceTargetId] = useState(null);
  const fileInputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const tipTimerRef = useRef(null);
  const [tipData, setTipData] = useState(null);
  const panelRef = useRef(null);
  const tapFileRef = useRef(null);
  const tcFileRef = useRef(null);
  const [tcSsSlot, setTcSsSlot] = useState("pre");
  const [accountBalance] = useState(10000);
  const [accountEquity] = useState(10000);
  const [slAdvMode, setSlAdvMode] = useState("none"); // "none" | "breakeven" | "trailing"
  const [slAdvDrop, setSlAdvDrop] = useState(false);
  const [slBeUnit, setSlBeUnit] = useState("rr"); // "rr" | "pips" | "dollar"
  const [slBeUnitDrop, setSlBeUnitDrop] = useState(false);
  const [slBeTrigger, setSlBeTrigger] = useState("1.5");
  const [slBeOffset, setSlBeOffset] = useState("5");
  const [slTslUnit, setSlTslUnit] = useState("rr"); // "rr" | "pips" | "dollar"
  const [slTslUnitDrop, setSlTslUnitDrop] = useState(false);
  const [slTslActivation, setSlTslActivation] = useState("1");
  const [slTslTrail, setSlTslTrail] = useState("0.5");
  const [slTslStep, setSlTslStep] = useState("0.25");
  const [logoMenu, setLogoMenu] = useState(false);
  const [replayOpts, setReplayOpts] = useState(false);
  const [replayMode, setReplayMode] = useState("candle");
  const [replayInterval, setReplayInterval] = useState("Auto");
  const [rollback, setRollback] = useState(false);
  const [rollbackLineX, setRollbackLineX] = useState(60);
  const [rbDragging, setRbDragging] = useState(false);
  const [rbPressed, setRbPressed] = useState(false);
  const rbPressTimer = useRef(null);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoItems, setGotoItems] = useState([
    {id:1,type:"datetime",label:"09 Jan 2009",time:"07:00",repeat:"none",pinned:true},
    {id:2,type:"session",label:"NY Open",time:"13:30",pinned:true},
    {id:4,type:"price",label:"126.500",pinned:true},
  ]);
  const [gotoAddType, setGotoAddType] = useState("datetime");
  const [gotoTab, setGotoTab] = useState("pinned");
  const [gotoNewDate, setGotoNewDate] = useState("2009-01-09");
  const [gotoNewTime, setGotoNewTime] = useState("07:00");
  const [gotoNewRepeat, setGotoNewRepeat] = useState("none");
  const [gotoNewPrice, setGotoNewPrice] = useState("");
  const [gotoNewName, setGotoNewName] = useState("");
  const [gotoNewColor, setGotoNewColor] = useState("#4A6AFF");
  const [gotoCalOpen, setGotoCalOpen] = useState(false);
  const [gotoCalPos,  setGotoCalPos]  = useState({top:0,left:0});
  const [gotoTimeOpen, setGotoTimeOpen] = useState(false);
  const [gotoTimePos,  setGotoTimePos]  = useState({top:0,left:0});
  const [gotoCalViewY, setGotoCalViewY] = useState(2009);
  const [gotoCalViewM, setGotoCalViewM] = useState(0);
  const [gotoCalMode,  setGotoCalMode]  = useState("days"); // "days" | "months" | "years"
  const [gotoCalYearBase, setGotoCalYearBase] = useState(2004); // start of 12-year grid
  const [gotoDateInput, setGotoDateInput] = useState("09-Jan-2009");
  const [gotoTimeInput, setGotoTimeInput] = useState("07:00");
  const [gotoPresets, setGotoPresets] = useState([
    {id:"ny",  label:"New York Open",  time:"13:30 UTC", color:"#4A6AFF"},
    {id:"lon", label:"London Open",    time:"08:00 UTC", color:"#00D4A1"},
    {id:"tok", label:"Tokyo Open",     time:"00:00 UTC", color:"#FF8C42"},
    {id:"syd", label:"Sydney Open",    time:"22:00 UTC", color:"#B06AFF"},
    {id:"fra", label:"Frankfurt Open", time:"07:00 UTC", color:"#C9A84C"},
  ]);
  const [ddPos, setDdPos] = useState({ top: 60, left: 40 }); // position for dropdown
  const [symbolOpen, setSymbolOpen] = useState(false);
  const [symbol, setSymbol] = useState("EUR/JPY");
  const [symbolSearch, setSymbolSearch] = useState("");
  const [chartTypeOpen, setChartTypeOpen] = useState(false);
  const [chartType, setChartType] = useState("Candles");
  const [chartTypeDropL, setChartTypeDropL] = useState(185);
  const [tfOpen, setTfOpen] = useState(false);
  const [tfCat, setTfCat] = useState(null);
  const [tfPinned, setTfPinned] = useState(["1m","5m","15m","1H","4H","1D"]);
  const [tfCustomVal, setTfCustomVal] = useState("");
  const [tfEditMode, setTfEditMode] = useState(false);

  const tfDefaults = {
    minutes: ["1m","5m","15m","30m"],
    hours: ["1H","4H","12H"],
    days: ["1D"],
    weeks: ["1W"],
    months: ["1M"],
  };
  const [tfCustomItems, setTfCustomItems] = useState([]);
  const tfSortItems = (items) => [...items].sort((a, b) => {
    const numA = parseInt(a) || 0;
    const numB = parseInt(b) || 0;
    return numA - numB;
  });
  const tfCategories = {
    minutes: { label: "Minutes", items: tfSortItems([...tfDefaults.minutes, ...tfCustomItems.filter(x => x.endsWith("m"))]) },
    hours: { label: "Hours", items: tfSortItems([...tfDefaults.hours, ...tfCustomItems.filter(x => x.endsWith("H"))]) },
    days: { label: "Days", items: tfSortItems([...tfDefaults.days, ...tfCustomItems.filter(x => x.endsWith("D"))]) },
    weeks: { label: "Weeks", items: tfSortItems([...tfDefaults.weeks, ...tfCustomItems.filter(x => x.endsWith("W"))]) },
    months: { label: "Months", items: tfSortItems([...tfDefaults.months, ...tfCustomItems.filter(x => x.endsWith("M") && !x.endsWith("m"))]) },
  };
  const [tfCustomUnit, setTfCustomUnit] = useState("m");
  const [tfUnitOpen, setTfUnitOpen] = useState(false);
  const [tfIndPos, setTfIndPos] = useState(null);
  const tfBarRef = useRef(null);
  const chartCanvasRef = useRef(null);
  const rollbackLineRef = useRef(null);
  const rollbackOverlayRef = useRef(null);
  const tlBarRef = useRef(null);
  const tlBarDropRef = useRef(null);
  const pinnedBarRef = useRef(null);
  const cpBarAnchorRef = useRef(null); // set when color picker is opened from the tl bar
  const closingDropdownKey = useRef(null);
  const [canvasDims, setCanvasDims] = useState({w:888,h:360});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState("account");
  const [profileLang, setProfileLang] = useState("english");
  const [profileCat, setProfileCat] = useState("account");
  const [profilePos, setProfilePos] = useState({ x: 0, y: 0 });
  const [profileName, setProfileName] = useState("Trader");
  const [profileAvatar, setProfileAvatar] = useState(null);
  const [profileNameEdit, setProfileNameEdit] = useState(false);
  const [profilePwOpen, setProfilePwOpen] = useState(false);
  const [profileCurPw, setProfileCurPw] = useState("");
  const [profileNewPw, setProfileNewPw] = useState("");
  const [profileConfirmPw, setProfileConfirmPw] = useState("");
  const [darkMode, setDarkMode] = useState(true);
  const [faqOpen, setFaqOpen] = useState(false);
  const [faqCat, setFaqCat] = useState("faq");
  const [faqPos, setFaqPos] = useState({ x: 0, y: 0 });
  const [emojiPanelOpen, setEmojiPanelOpen] = useState(false);
  const [emojiPanelPos, setEmojiPanelPos] = useState({ x: 80, y: 120 });
  const [emojiCat, setEmojiCat] = useState("smileys");
  const [emojiSearch, setEmojiSearch] = useState("");
  const [faqExpand, setFaqExpand] = useState(null);
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [scLinkOpen, setScLinkOpen] = useState(false);
  const [scLinkSearch, setScLinkSearch] = useState("");
  const [scLinkedTrade, setScLinkedTrade] = useState(null);
  const [scLinkPhase, setScLinkPhase] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pinnedBarOpen, setPinnedBarOpen] = useState(true);
  const [pinnedBarPos, setPinnedBarPos] = useState({ x: 50, y: 80 });
  const [groupSelected, setGroupSelected] = useState({});
  const [tlBarPos, setTlBarPos] = useState({ x: 130, y: 200 });
  const [tlSettOpen, setTlSettOpen] = useState(false);
  const [tlSettPos, setTlSettPos] = useState({ x: 200, y: 90 });
  const [tlName, setTlName] = useState("Trend Line");
  const [tlNameEditing, setTlNameEditing] = useState(false);
  const [tlSettTab, setTlSettTab] = useState("style");
  const [tlLocked, setTlLocked] = useState(false);
  const [rrStyle, setRrStyle] = useState({
    profitColor:"rgba(0,180,100,0.25)", lossColor:"rgba(220,50,50,0.25)", entryColor:"rgba(180,180,180,0.9)",
    labelFontSize:"11", labelColor:"#ffffff", showPriceLabels:true, showTimeLabels:false,
  });
  const [rrInputs, setRrInputs] = useState({ riskAmount:"100", qty:"1" });
  const [vwapLocked, setVwapLocked] = useState(false);
  const [vpLocked, setVpLocked] = useState(false);
  const [avLocked, setAvLocked] = useState(false);
  const [txtLocked, setTxtLocked] = useState(false);
  const [tlStyleDrop, setTlStyleDrop] = useState(null);
  const [tlInfoDropUp, setTlInfoDropUp] = useState(false);
  const [tlInfoDropAnchor, setTlInfoDropAnchor] = useState(null);
  const [tlStyleDropUp, setTlStyleDropUp] = useState(false);
  const [tlBarDrop, setTlBarDrop] = useState(null);
  const [tlTemplates, setTlTemplates] = useState([]);
  const [tlBarDropAnchor, setTlBarDropAnchor] = useState({ btnTop: 0, btnBottom: 0, left: 0, right: 0, barX: 0, barY: 0 });
  const tlLastBarDropRef = useRef("style");
  const [tlSaveAsMode, setTlSaveAsMode] = useState(false);
  const [tlNewTplName, setTlNewTplName] = useState("");
  const [tlSettTplDrop, setTlSettTplDrop] = useState(false);
  const [tlStyle, setTlStyle] = useState({
    lineColor: "#8C8C8C", bgColor: "rgba(74,106,255,0.15)", lineType: "solid", lineWidth: "2", ep1: "normal", ep2: "normal",
    extendLeft: false, extendRight: false, priceLabels: true, timeLabels: true, flatChPrices: true,
    rangeType: "Date & Price", showInfo: false, showInfoTypes: ["Price range"],
    showBorder: true, borderColor: "#8C8C8C", borderType: "dashed", borderWidth: "1",
    showBg: false, labelColor: "#ffffff", labelFontSize: "12", labelBg: true, labelBgColor: "rgba(0,0,0,0.6)",
    textSize: 14, textColor: "#ffffff", textItalic: false, textBold: false, textContent: "",
    labelLineType: "solid", labelLineWidth: "1",
    vertAlign: "top", horizAlign: "center",
    pt1Price: "126.96273", pt1Bar: "3775", pt2Price: "126.86393", pt2Bar: "3795", pt3Price: "126.76393", pt3Bar: "3815",
    pt4Price: "126.66393", pt4Bar: "3835", pt5Price: "126.56393", pt5Bar: "3855", pt6Price: "126.46393", pt6Bar: "3875",
    pt7Price: "126.36393", pt7Bar: "3895",
    visMinutes: { checked: true, min: 1, max: 60 }, visHours: { checked: true, min: 1, max: 24 },
    visDays: { checked: true, min: 1, max: 366 }, visWeeks: { checked: true, min: 1, max: 260 },
    visMonths: { checked: true, min: 1, max: 120 },
    midLine: false, midLineColor: "#8C8C8C", midLineType: "dashed", midLineWidth: "1",
    chLines: [
      { on: true, value: "1.00", color: "#2962FF", type: "solid", width: "2" },
      { on: true, value: "0.75", color: "#2962FF", type: "dashed", width: "1" },
      { on: false, value: "0.50", color: "#8C8C8C", type: "dashed", width: "1" },
      { on: true, value: "0.25", color: "#2962FF", type: "dashed", width: "1" },
      { on: true, value: "0.00", color: "#2962FF", type: "solid", width: "2" },
    ],
    regLines: [
      { on: true, label: "Middle Line", color: "#2962FF", type: "solid", width: "2" },
      { on: true, label: "Upper Line", color: "#2962FF", type: "dashed", width: "1" },
      { on: true, label: "Lower Line", color: "#2962FF", type: "dashed", width: "1" },
    ],
    regUpperBg: "rgba(74,106,255,0.15)", regLowerBg: "rgba(255,82,82,0.15)",
    source: "Close", regressionType: "Linear",
    fibTzLevels: [
      { on: true, value: "1",  color: "#787B86", type: "solid",  width: "1" },
      { on: true, value: "2",  color: "#F44336", type: "solid",  width: "1" },
      { on: true, value: "3",  color: "#FF9800", type: "solid",  width: "1" },
      { on: true, value: "5",  color: "#FFEB3B", type: "solid",  width: "1" },
      { on: true, value: "8",  color: "#4CAF50", type: "solid",  width: "1" },
      { on: true, value: "13", color: "#2196F3", type: "solid",  width: "1" },
      { on: true, value: "21", color: "#9C27B0", type: "solid",  width: "1" },
      { on: false, value: "34", color: "#787B86", type: "dashed", width: "1" },
      { on: false, value: "55", color: "#787B86", type: "dashed", width: "1" },
      { on: false, value: "89", color: "#787B86", type: "dashed", width: "1" },
    ],
    fibTrendLine: true, fibTimeTrendType: "solid", fibTimeTrendWidth: "1", fibPriceLabels: false, fibTimeLabels: false,
    fibArcsTrendLine: true, fibArcsTrendType: "solid", fibArcsTrendWidth: "1", fibArcsFullCircle: false,
    fibWedgeTrendLine: true, fibWedgeTrendType: "solid", fibWedgeTrendWidth: "1",
    fibBackground: false, fibBgOpacity: 0.5, fibReverse: false, fibPrices: true, fibSpiralCCW: false,
    fibFanTimeLevels: [
      { on: true, value: "0", color: "#787B86" },
      { on: true, value: "0.25", color: "#F44336" },
      { on: true, value: "0.5", color: "#FF9800" },
      { on: true, value: "0.75", color: "#FFEB3B" },
      { on: true, value: "1", color: "#4CAF50" },
    ],
    fibLevelsOn: true, fibLevelsMode: "Value", fibExtendLines: false, fibGrid: false,
    fibGridColor: "#787B86", fibGridType: "solid", fibGridWidth: "1",
    fibLineType: "solid", fibLineWidth: "2",
    fibLevels: [
      { on: true, value: "0", color: "#787B86" },
      { on: true, value: "0.236", color: "#F44336" },
      { on: true, value: "0.382", color: "#FF9800" },
      { on: true, value: "0.5", color: "#FFEB3B" },
      { on: true, value: "0.618", color: "#4CAF50" },
      { on: true, value: "0.786", color: "#2196F3" },
      { on: true, value: "1", color: "#787B86" },
    ],
    gannLineType: "solid", gannLineWidth: "2",
    gannBackground: false, gannBgOpacity: 0.5,
    gannPriceLevels: [
      { on: true, value: "0", color: "#787B86" },
      { on: true, value: "0.25", color: "#2196F3" },
      { on: true, value: "0.5", color: "#4CAF50" },
      { on: true, value: "0.75", color: "#FF9800" },
      { on: true, value: "1", color: "#787B86" },
    ],
    gannTimeLevels: [
      { on: true, value: "0", color: "#787B86" },
      { on: true, value: "0.25", color: "#2196F3" },
      { on: true, value: "0.382", color: "#FF9800" },
      { on: true, value: "0.5", color: "#4CAF50" },
      { on: true, value: "0.618", color: "#F44336" },
      { on: true, value: "0.75", color: "#9C27B0" },
      { on: true, value: "1", color: "#787B86" },
    ],
    gannGridLevels: [
      { on: true, value: "0", color: "#787B86" },
      { on: true, value: "0.125", color: "#2196F3" },
      { on: true, value: "0.25", color: "#4CAF50" },
      { on: true, value: "0.375", color: "#FF9800" },
      { on: true, value: "0.5", color: "#FFEB3B" },
      { on: true, value: "0.625", color: "#FF9800" },
      { on: true, value: "0.75", color: "#4CAF50" },
      { on: true, value: "0.875", color: "#2196F3" },
      { on: true, value: "1", color: "#787B86" },
    ],
    gannFanLevels: [
      { on: true, value: "1", color: "#F44336" },
      { on: true, value: "2", color: "#FF9800" },
      { on: true, value: "3", color: "#FFEB3B" },
      { on: true, value: "4", color: "#4CAF50" },
      { on: true, value: "8", color: "#2196F3" },
    ],
    gannArcLevels: [
      { on: true, value: "0", color: "#787B86" },
      { on: true, value: "0.25", color: "#2196F3" },
      { on: true, value: "0.5", color: "#4CAF50" },
      { on: true, value: "0.75", color: "#FF9800" },
      { on: true, value: "1", color: "#787B86" },
    ],
    pitchforkStyle: "Original", pfBgOpacity: 0.5,
    pfLevels: [
      { on: false, value: "0.25", color: "#FF4081" },
      { on: true, value: "0.5", color: "#2962FF" },
      { on: true, value: "0.75", color: "#00BFA5" },
      { on: false, value: "1.5", color: "#AA00FF" },
      { on: false, value: "0.382", color: "#FF6D00" },
      { on: false, value: "0.618", color: "#00BFA5" },
      { on: true, value: "1", color: "#2962FF" },
      { on: false, value: "1.75", color: "#FF4081" },
    ],
  });
  const [txtSettOpen, setTxtSettOpen] = useState(false);
  const [txtSettPos, setTxtSettPos] = useState({ x: 200, y: 90 });
  const [txtSettTab, setTxtSettTab] = useState("style");
  const [txtName, setTxtName] = useState("Text");
  const [txtNameEditing, setTxtNameEditing] = useState(false);
  const [txtSizeOpen, setTxtSizeOpen] = useState(false);
  const [txtBarSizeOpen, setTxtBarSizeOpen] = useState(false);
  const [txtBarDrop, setTxtBarDrop] = useState(null);
  const [txtTemplates, setTxtTemplates] = useState([]);
  const [txtSaveAsMode, setTxtSaveAsMode] = useState(false);
  const [txtNewTplName, setTxtNewTplName] = useState("");
  const [txtStyle, setTxtStyle] = useState({
    fontSize: 14, textColor: "#ffffff", italic: false, bold: false, content: "",
    horizAlign: "left",
    bgOn: false, bgColor: "#000000",
    borderOn: true, borderColor: "#787B86",
    wrapText: false, anchored: false,
    notePt1Price: "0.00000", notePt1Bar: "0", notePt2Price: "0.00000", notePt2Bar: "0",
    priceNotePt1Price: "0.00000", priceNotePt1Bar: "0", priceNotePt2Price: "0.00000", priceNotePt2Bar: "0",
    calloutPt1Price: "0.00000", calloutPt1Bar: "0", calloutPt2Price: "0.00000", calloutPt2Bar: "0",
    commentPt1Price: "0.00000", commentPt1Bar: "0",
    pinLabelColor: "#4A6AFF", pinPt1Price: "0.00000", pinPt1Bar: "0",
    priceLabelPt1Price: "0.00000", priceLabelPt1Bar: "0",
    signpostPt1Price: "0.00000", signpostPt1Bar: "0",
    flagPt1Price: "0.00000", flagPt1Bar: "0",
    imageDataUrl: "", imageTransparency: 0, imagePt1Price: "0.00000", imagePt1Bar: "0",
    emojiPt1Price: "0.00000", emojiPt1Bar: "0",
    visMinutes: { checked: true, min: 1, max: 60 }, visHours: { checked: true, min: 1, max: 24 },
    visDays: { checked: true, min: 1, max: 366 }, visWeeks: { checked: true, min: 1, max: 260 },
    visMonths: { checked: true, min: 1, max: 120 },
  });
  const [vwapSettOpen, setVwapSettOpen] = useState(false);
  const [vwapSettPos, setVwapSettPos] = useState({ x: 200, y: 90 });
  const [vwapSettTab, setVwapSettTab] = useState("style");
  const [vwapStyleDrop, setVwapStyleDrop] = useState(null);
  const [vwapBarPos, setVwapBarPos] = useState({ x: 130, y: 200 });
  const [vwapBarDrop, setVwapBarDrop] = useState(null);
  const [vwapStyle, setVwapStyle] = useState({
    vwapColor: "#9E9EA2", vwapLineType: "solid", vwapLineWidth: "2",
    band1On: true,  band1Color: "#26A69A", band1LineType: "dotted", band1LineWidth: "1",
    bg1On: false,   bg1Color: "rgba(38,166,154,0.15)",
    band2On: false, band2Color: "#F2C10F", band2LineType: "dotted", band2LineWidth: "1",
    bg2On: false,   bg2Color: "rgba(242,193,15,0.15)",
    band3On: false, band3Color: "#26C6DA", band3LineType: "dotted", band3LineWidth: "1",
    bg3On: false,   bg3Color: "rgba(38,198,218,0.15)",
    priceLabels: true, timeLabels: true,
    bandsCalcMode: "Std Deviation",
    mult1On: true,  mult1Val: "1.0",
    mult2On: false, mult2Val: "2.0",
    mult3On: false, mult3Val: "3.0",
    source: "(H+L+C)/3",
    anchorPrice: "0.00000", anchorBar: "0",
    visMinutes: { checked: true, min: 1, max: 60 }, visHours: { checked: true, min: 1, max: 24 },
    visDays: { checked: true, min: 1, max: 366 }, visWeeks: { checked: true, min: 1, max: 260 },
    visMonths: { checked: true, min: 1, max: 120 },
  });
  const [vpSettOpen, setVpSettOpen] = useState(false);
  const [vpSettPos, setVpSettPos] = useState({ x: 200, y: 90 });
  const [vpSettTab, setVpSettTab] = useState("style");
  const [vpStyleDrop, setVpStyleDrop] = useState(null);
  const [vpBarPos, setVpBarPos] = useState({ x: 130, y: 240 });
  const [vpBarDrop, setVpBarDrop] = useState(null);
  const [vpStyle, setVpStyle] = useState({
    valuesOn: true, valuesColor: "#9E9EA2",
    widthPct: "30",
    placement: "Left",
    zoneBgOn: true, zoneBgColor: "#1A1A2E", zoneBgAlpha: 85,
    upVolColor: "#26A69A",
    downVolColor: "#FF5068",
    valueAreaUpColor: "#26A69A",
    valueAreaDownColor: "#FF5068",
    pocOn: true, pocColor: "#E0E0E0",
    vahOn: true, vahColor: "#26A69A",
    valOn: true, valColor: "#FF5068",
    devPocOn: false, devPocColor: "#9E9EA2",
    devVAOn: false, devVAColor: "#9E9EA2",
    rowsLayout: "Number of Rows",
    rowSize: "24",
    volumeOn: true, volumeType: "Up/Down",
    valueAreaVol: "70",
    extendRight: false,
    pt1Price: "0.00000", pt1Bar: "0",
    pt2Price: "0.00000", pt2Bar: "0",
    visMinutes: { checked: true, min: 1, max: 60 }, visHours: { checked: true, min: 1, max: 24 },
    visDays: { checked: true, min: 1, max: 366 }, visWeeks: { checked: true, min: 1, max: 260 },
    visMonths: { checked: true, min: 1, max: 120 },
  });
  const [avSettOpen, setAvSettOpen] = useState(false);
  const [avSettPos, setAvSettPos] = useState({ x: 200, y: 90 });
  const [avSettTab, setAvSettTab] = useState("style");
  const [avStyleDrop, setAvStyleDrop] = useState(null);
  const [avBarPos, setAvBarPos] = useState({ x: 130, y: 280 });
  const [avBarDrop, setAvBarDrop] = useState(null);
  const [avStyle, setAvStyle] = useState({
    valuesOn: true, valuesColor: "#9E9EA2",
    widthPct: "30", placement: "Left",
    zoneBgOn: true, zoneBgColor: "#1A1A2E", zoneBgAlpha: 85,
    upVolColor: "#26A69A", downVolColor: "#FF5068",
    valueAreaUpColor: "#26A69A", valueAreaDownColor: "#FF5068",
    pocOn: true, pocColor: "#E0E0E0",
    vahOn: true, vahColor: "#26A69A",
    valOn: true, valColor: "#FF5068",
    devPocOn: false, devPocColor: "#9E9EA2",
    devVAOn: false, devVAColor: "#9E9EA2",
    rowsLayout: "Number of Rows", rowSize: "24",
    volumeOn: true, volumeType: "Up/Down",
    valueAreaVol: "70", extendRight: false,
    anchorPrice: "0.00000", anchorBar: "0",
    visMinutes: { checked: true, min: 1, max: 60 }, visHours: { checked: true, min: 1, max: 24 },
    visDays: { checked: true, min: 1, max: 366 }, visWeeks: { checked: true, min: 1, max: 260 },
    visMonths: { checked: true, min: 1, max: 120 },
  });
  const [screenshotFlash, setScreenshotFlash] = useState(false);
  const [orderPanelOpen, setOrderPanelOpen] = useState(false);
  const [opSymOpen, setOpSymOpen] = useState(false);
  const [opSymSearch, setOpSymSearch] = useState("");
  const [opSymPos, setOpSymPos] = useState({ top: 0, left: 0 });
  const [opSizeOpen, setOpSizeOpen] = useState(false);
  const [opSizePos, setOpSizePos] = useState({ top: 0, left: 0 });
  const [opTplOpen, setOpTplOpen] = useState(false);
  const [opTplPos, setOpTplPos] = useState({ top: 0, left: 0 });
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [opSaveAsMode, setOpSaveAsMode] = useState(false);
  const [opNewTplName, setOpNewTplName] = useState("");
  const [opSavedTemplates, setOpSavedTemplates] = useState([]);
  const [opDotsOpen, setOpDotsOpen] = useState(false);
  const [opDotsPos, setOpDotsPos] = useState({ top: 0, left: 0 });
  const [panelDetached, setPanelDetached] = useState(false);
  const [detachPos, setDetachPos] = useState({ x: 900, y: 80 });
  const [detachSize, setDetachSize] = useState({ w: 336, h: 560 });
  const [panelMode, setPanelMode] = useState("advanced");
  const isWide = panelDetached && detachSize.w >= 520;
  const opTemplates = ["Default","Scalp — Trend","Swing Trade","Breakout","Reversal"];
  const [rightPanel, setRightPanel] = useState(null);
  const [screenshotPos, setScreenshotPos] = useState({ x: 0, y: 0 });
  const [layersOpen, setLayersOpen] = useState(false);
  const [layersPos, setLayersPos] = useState({ x: 0, y: 0 });
  const [layersCat, setLayersCat] = useState("drawings");
  const [layersItems, setLayersItems] = useState(Array.from({length:100},(_,i)=>{
    const types=[
      {icon:"trendline",name:"Trend Line"},{icon:"hline",name:"Horizontal Line"},
      {icon:"fib",name:"Fib Retracement"},{icon:"rect",name:"Rectangle"},
      {icon:"channel",name:"Channel"},{icon:"vline",name:"Vertical Line"},
      {icon:"hray",name:"Horizontal Ray"},{icon:"polyline",name:"Polyline"},
    ];
    const t=types[i%types.length];
    return {id:`l${i+1}`,icon:t.icon,name:`${t.name} ${i+1}`,color:"#4A6AFF"};
  }));
  const [layersVis, setLayersVis] = useState({});
  const [layersSearch, setLayersSearch] = useState("");
  const [newsOpen, setNewsOpen] = useState(false);
  const [newsPos, setNewsPos] = useState({ x: 0, y: 0 });
  const [newsTab, setNewsTab] = useState("upcoming");
  const [newsSearch, setNewsSearch] = useState("");
  const [newsImpact, setNewsImpact] = useState(["high","med","low"]);
  const [newsSymbolOnly, setNewsSymbolOnly] = useState(false);
  const [newsFilterOpen, setNewsFilterOpen] = useState(false);
  const [newsFilterClosing, setNewsFilterClosing] = useState(false);
  const [newsCntSel, setNewsCntSel] = useState({US:1,EU:1,GB:1,JP:1,AU:1,CA:1,DE:1,FR:1,IT:1,CN:1,CH:1});
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [layoutPos, setLayoutPos] = useState({ x: 0, y: 0 });
  const [layoutPanels, setLayoutPanels] = useState({n:1,li:0});
  const [layoutSync, setLayoutSync] = useState({ crosshair: true, time: true, drawings: true, symbol: false, interval: false, dateRange: false, indicators: false, chartType: false });
  const [layoutTab, setLayoutTab] = useState("panels");
  const [settingsTab, setSettingsTab] = useState("chart");
  const [balVis, setBalVis] = useState(true);
  const [sDrop, setSDrop] = useState(null); // which settings dropdown is open
  const [colorPicker, setColorPicker] = useState(null);
  const [cpPos, setCpPos] = useState({ top: 300, left: 500 });
  const [swHov, setSwHov] = useState(null);
  const [settDrop, setSettDrop] = useState(null);
  const [settDropPos, setSettDropPos] = useState({ top: 0, left: 0, w: 0 });
  const [customTemplates, setCustomTemplates] = useState([]);
  const [tplNameInput, setTplNameInput] = useState("");
  const [settHdrTplDrop, setSettHdrTplDrop] = useState(false);
  const [settHdrSaveAs, setSettHdrSaveAs] = useState(false);
  const [settHdrTplName, setSettHdrTplName] = useState("");
  const [cpH, setCpH] = useState(0);
  const [cpS, setCpS] = useState(0);
  const [cpV, setCpV] = useState(1);
  const [cpA, setCpA] = useState(1);
  const [cpHex, setCpHex] = useState('ffffff');
  const [cpDragging, setCpDragging] = useState(null);
  const [cpDragRect, setCpDragRect] = useState(null);
  const [settings, setSettings] = useState({
    theme: "Talaria Dark", chartType: "candlestick", precision: "0.00000", timezone: "UTC",
    textColor: "#8CA0FF", background: "#07080E", gridColor: "rgba(140,160,255,0.15)", crosshairColor: "rgba(255,255,255,0.4)",
    priceLine: true, priceLineColor: "#FF5068",
    scaleTextColor: "rgba(255,255,255,0.25)", scaleLineColor: "rgba(140,160,255,0.12)",
    bullBody: "#00D4A1", bullBorder: "#00D4A1", bullWick: "#00D4A1",
    bearBody: "#FF5068", bearBorder: "#FF5068", bearWick: "#FF5068", unifiedBarColor: true, unifiedBarColorVal: "#00D4A1",
    orderPlacement: "instant", showOrderHistory: true, showOpenOrders: true, timeFormat: "24h",
    gridLinesOn: true, gridLineStyle: "solid", gridLineThickness: 1,
    crosshairOn: true, crosshairStyle: "dashed",
    priceLineStyle: "solid", priceLineThickness: 1,
    chartTemplate: "Dark Classic",
  });

  const [indOpen, setIndOpen] = useState(false);
  const [indPinned, setIndPinned] = useState([]);
  const [indActive, setIndActive] = useState([]);
  const [indSelected, setIndSelected] = useState(null);
  const [indSearch, setIndSearch] = useState("");
  const [indPos, setIndPos] = useState({ x: 0, y: 0 });
  const [indCat, setIndCat] = useState("all");
  const [indTplOpen, setIndTplOpen] = useState(false);
  const [indTplSaveMode, setIndTplSaveMode] = useState(false);
  const [indTplName, setIndTplName] = useState("");
  const [indTemplates, setIndTemplates] = useState([]);
  const [dragging, setDragging] = useState(null);
  const [settingsPos, setSettingsPos] = useState({ x: 0, y: 0 });
  const [closing, setClosing] = useState(new Set());
  const animClose = (setter, key) => {
    setClosing(s => new Set([...s, key]));
    setSettDrop(null);
    setTimeout(() => { setter(false); setClosing(s => { const n = new Set(s); n.delete(key); return n; }); }, 155);
  };
  // Smooth close for small dropdown/popup panels (uses tlrDropOut / tlrPopOut)
  const closePopup = (setter, key) => {
    setClosing(s => new Set([...s, key]));
    setTimeout(() => { setter(false); setClosing(s => { const n = new Set(s); n.delete(key); return n; }); }, 130);
  };
  const closeTlBarDrop = () => {
    if (!tlBarDrop) return;
    setClosing(s => new Set([...s, "tlbardrop"]));
    setTimeout(() => { setTlBarDrop(null); setTlSaveAsMode(false); setTlNewTplName(""); setClosing(s => { const n = new Set(s); n.delete("tlbardrop"); return n; }); }, 130);
  };
  const closeTlSett = () => {
    setClosing(s => new Set([...s, "tlsett"]));
    setTlSettTplDrop(false); setTlSaveAsMode(false); setTlNewTplName(""); setTlStyleDrop(null);
    setTimeout(() => { setTlSettOpen(false); setClosing(s => { const n = new Set(s); n.delete("tlsett"); return n; }); }, 155);
  };
  const closeTxtSett = () => {
    setClosing(s => new Set([...s, "txtsett"]));
    setTxtSizeOpen(false); setTxtBarSizeOpen(false); setTxtBarDrop(null);
    setTimeout(() => { setTxtSettOpen(false); setClosing(s => { const n = new Set(s); n.delete("txtsett"); return n; }); }, 155);
  };
  const closeVwapSett = () => {
    setClosing(s => new Set([...s, "vwapsett"]));
    setVwapStyleDrop(null);
    setTimeout(() => { setVwapSettOpen(false); setClosing(s => { const n = new Set(s); n.delete("vwapsett"); return n; }); }, 155);
  };
  const closeVpSett = () => {
    setClosing(s => new Set([...s, "vpsett"]));
    setVpStyleDrop(null);
    setTimeout(() => { setVpSettOpen(false); setClosing(s => { const n = new Set(s); n.delete("vpsett"); return n; }); }, 155);
  };
  const closeAvSett = () => {
    setClosing(s => new Set([...s, "avsett"]));
    setAvStyleDrop(null);
    setTimeout(() => { setAvSettOpen(false); setClosing(s => { const n = new Set(s); n.delete("avsett"); return n; }); }, 155);
  };
  const closeDropdown = () => {
    if (!dropdown) return;
    closingDropdownKey.current = dropdown;
    setClosing(s => new Set([...s, "tldrop"]));
    setDropdown(null);
    setTimeout(() => { closingDropdownKey.current = null; setClosing(s => { const n = new Set(s); n.delete("tldrop"); return n; }); }, 130);
  };
  const closeFontSizeDrop = () => {
    setClosing(s => new Set([...s, "tlFontSizeDrop"]));
    setTlStyleDrop(null);
    setTimeout(() => { setClosing(s => { const n = new Set(s); n.delete("tlFontSizeDrop"); return n; }); }, 130);
  };
  const closeTlInfoDrop = () => {
    if (tlStyleDrop !== "info" && !closing.has("tlInfoDrop")) return;
    setClosing(s => new Set([...s, "tlInfoDrop"]));
    setTlStyleDrop(null);
    setTimeout(() => { setClosing(s => { const n = new Set(s); n.delete("tlInfoDrop"); return n; }); }, 130);
  };
  const closeTlSettTplDrop = () => {
    if (!tlSettTplDrop && !closing.has("tlSettTplDrop")) return;
    setClosing(s => new Set([...s, "tlSettTplDrop"]));
    setTlSettTplDrop(false); setTlSaveAsMode(false); setTlNewTplName("");
    setTimeout(() => { setClosing(s => { const n = new Set(s); n.delete("tlSettTplDrop"); return n; }); }, 130);
  };
  const closeCP = () => {
    setClosing(s => new Set([...s, "cp"]));
    setColorPicker(null);
    setTimeout(() => { setClosing(s => { const n = new Set(s); n.delete("cp"); return n; }); }, 150);
  };

  const c = darkMode ? {
    ac: "#2643F7", acL: "#4A6AFF", acD: "rgba(38,67,247,0.08)", acB: "rgba(38,67,247,0.22)", acG: "rgba(38,67,247,0.12)",
    gold: "#C9A84C", goldD: "rgba(201,168,76,0.07)",
    bg: "#07080E", sf: "#0A0C14", el: "#0F1119", well: "#060710",
    br: "rgba(140,160,255,0.05)", brL: "rgba(140,160,255,0.08)", brH: "rgba(140,160,255,0.12)",
    tx: "rgba(255,255,255,0.92)", ts: "rgba(255,255,255,0.70)", tm: "rgba(255,255,255,0.50)",
    gn: "#00D4A1", gnD: "rgba(0,212,161,0.07)", gnB: "rgba(0,212,161,0.18)",
    rd: "#FF5068", rdD: "rgba(255,80,104,0.07)", rdB: "rgba(255,80,104,0.18)",
    axTx: "rgba(255,255,255,0.45)", grid: "rgba(140,160,255,0.04)",
    hv: "rgba(255,255,255,0.05)", hv2: "rgba(255,255,255,0.03)", trk: "rgba(255,255,255,0.18)", hvLn: "rgba(255,255,255,0.15)",
    inputScheme: "dark",
  } : {
    ac: "#2643F7", acL: "#2F55E8", acD: "rgba(38,67,247,0.10)", acB: "rgba(38,67,247,0.30)", acG: "rgba(38,67,247,0.14)",
    gold: "#9A7218", goldD: "rgba(154,114,24,0.08)",
    bg: "#D8DCE9", sf: "#DFE3F0", el: "#E8EBF6", well: "#CDD1E0",
    br: "rgba(0,5,40,0.12)", brL: "rgba(0,5,40,0.18)", brH: "rgba(0,5,40,0.26)",
    tx: "rgba(0,0,0,0.92)", ts: "rgba(0,0,0,0.88)", tm: "rgba(0,0,0,0.72)",
    gn: "#006B4F", gnD: "rgba(0,107,79,0.10)", gnB: "rgba(0,107,79,0.22)",
    rd: "#C42030", rdD: "rgba(196,32,48,0.10)", rdB: "rgba(196,32,48,0.22)",
    axTx: "rgba(0,0,0,0.78)", grid: "rgba(0,5,40,0.07)",
    hv: "rgba(0,0,0,0.05)", hv2: "rgba(0,0,0,0.032)", trk: "rgba(0,0,0,0.16)", hvLn: "rgba(0,0,0,0.22)",
    inputScheme: "light",
  };
  const chromeBr = darkMode ? "rgba(140,160,255,0.22)" : "rgba(0,5,40,0.32)";
  const F = "'Exo 2',sans-serif";

  const allSymbols = SYMBOLS_DATA.flatMap(c => c.items);
  const currentSymbol = allSymbols.find(s => s.id === symbol) || { id:symbol, type:"forex", base:symbol.split("/")[0], quote:symbol.split("/")[1] };
  const chartTypeMap = {
    "Candles": { icon: "candle", label: "Candles" },
    "Hollow Candles": { icon: "hollowCandle", label: "Hollow Candles" },
    "Heikin Ashi": { icon: "heikinAshi", label: "Heikin Ashi" },
    "Bars": { icon: "tick", label: "Bars" },
    "Line": { icon: "lineChart", label: "Line" },
    "Area": { icon: "area", label: "Area" },
    "candles": { icon: "candle", label: "Candles" },
  };
  const currentChartType = chartTypeMap[chartType] || { icon: "candle", label: chartType };
  const gotoNextId = () => Date.now() + Math.random();

  useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFSChange);
    return () => document.removeEventListener("fullscreenchange", onFSChange);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        closeWindows();
        setTlSettOpen(false);
        setTradeCard(null);
        setViewingScreenshot(null);
        setTradeActPopup(null);
        setRollback(false);
        hideTip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('.tlr-cp')) setColorPicker(null);
      if (!e.target.closest('[data-tlbar]')) { setTlBarDrop(null); setTlSaveAsMode(false); setTlNewTplName(""); setVwapBarDrop(null); }
      setTlSettTplDrop(false);
      if (e.target.closest('[data-sdrop]')) return;
      setSettDrop(null);
      setTlStyleDrop(null);
      setDropdown(null);
      setTlSettOpen(false);
    };
    const scrollHandler = () => { setSettDrop(null); setColorPicker(null); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('wheel', scrollHandler, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('wheel', scrollHandler);
    };
  }, []);

  useEffect(() => {
    if (!loading) return;
    setLoadPhase("chart");
    setLoadFading(false);
    setLoadDots("");
    const t1 = setTimeout(() => setLoadPhase("tickers"), 4000);
    const t2 = setTimeout(() => setLoadFading(true), 9700);
    const t3 = setTimeout(() => setLoading(false), 10000);
    let dotIdx = 0;
    const dotSteps = ["", ".", "..", "..."];
    const iv = setInterval(() => { dotIdx = (dotIdx + 1) % 4; setLoadDots(dotSteps[dotIdx]); }, 400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearInterval(iv); };
  }, [loading]);

  useEffect(() => {
    if (!loading) return;
    const full = loadQuote[0] || "";
    setTypedQuote("");
    let i = 0;
    const delay = setTimeout(() => {
      const iv = setInterval(() => {
        i++;
        setTypedQuote(full.slice(0, i));
        if (i >= full.length) clearInterval(iv);
      }, 38);
      return () => clearInterval(iv);
    }, 600);
    return () => clearTimeout(delay);
  }, [loading, loadQuote]);

  useEffect(() => {
    if (!document.querySelector('link[href*="Exo+2"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700;800;900&display=swap';
      document.head.appendChild(link);
    }
    {
      let style = document.getElementById('tlr-scrollbar-css');
      if (!style) { style = document.createElement('style'); style.id = 'tlr-scrollbar-css'; document.head.appendChild(style); }
      const sbC = darkMode ? "rgba(140,160,255,0.22)" : "rgba(0,5,40,0.22)";
      const sbH = darkMode ? "rgba(140,160,255,0.44)" : "rgba(0,5,40,0.40)";
      const tcBr  = darkMode ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.20)";
      const tcHov = darkMode ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.90)";
      const tcLbl = darkMode ? "rgba(255,255,255,0.5)"  : "rgba(0,0,0,0.70)";
      style.textContent = `:root{--tc-br:${tcBr};--tc-hov:${tcHov};--tc-lbl:${tcLbl}}`
        + `*{user-select:none!important;-webkit-user-select:none!important;cursor:default}input,textarea{user-select:text!important;-webkit-user-select:text!important;cursor:text}.tlr-scroll::-webkit-scrollbar{width:3px;height:3px}.tlr-scroll::-webkit-scrollbar-track{background:transparent}.tlr-scroll::-webkit-scrollbar-thumb{background:${sbC};border-radius:2px}.tlr-scroll::-webkit-scrollbar-thumb:hover{background:${sbH}}.tlr-scroll{scrollbar-width:thin;scrollbar-color:${sbC} transparent}@keyframes tlrCpIn{from{opacity:0;transform:translateY(-5px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}.tlr-cp{animation:tlrCpIn 0.15s cubic-bezier(0.16,1,0.3,1)}`;
    }
  }, [darkMode]);

  useLayoutEffect(() => {
    if (!tfBarRef.current) return;
    const btn = tfBarRef.current.querySelector(`[data-tf="${tf}"]`);
    if (btn) {
      setTfIndPos({ left: btn.offsetLeft, width: btn.offsetWidth });
    } else {
      setTfIndPos(null);
    }
  }, [tf, tfPinned]);

  useLayoutEffect(() => {
    if (!btmTabBarRef.current) return;
    const btn = btmTabBarRef.current.querySelector(`[data-btmtab="${btmTab}"]`);
    if (btn) {
      setBtmIndPos({ left: btn.offsetLeft, width: btn.offsetWidth });
    } else {
      setBtmIndPos(null);
    }
  }, [btmTab]);

  // When rollback is active, block and dismiss on any click
  useEffect(() => {
    if (!rollback) return;
    const handleClick = (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      setRollback(false);
    };
    const t = setTimeout(() => window.addEventListener('click', handleClick, true), 0);
    return () => { clearTimeout(t); window.removeEventListener('click', handleClick, true); };
  }, [rollback]);

  // Active line/shape sub-tool (icon + label)
  const tlSubTool = tool === "rect"
    ? (groupSelected.rect || { icon: "rect", label: "Rectangle" })
    : tool === "channel"
    ? (groupSelected.channel || { icon: "channel", label: "Parallel Channel" })
    : tool === "brush2"
    ? (groupSelected.brush2 || { icon: "draw", label: "Brush" })
    : tool === "fib"
    ? (groupSelected.fib || { icon: "fib", label: "Fib Retracement" })
    : tool === "pattern"
    ? (groupSelected.pattern || { icon: "elliott5", label: "Elliott Impulse (12345)" })
    : tool === "measure"
    ? (groupSelected.measure || { icon: "measure", label: "Range Tool" })
    : (groupSelected.trendline || { icon: "trendline", label: "Trend Line" });
  const tlSubToolRef = useRef(tlSubTool.label);
  const txtSubTool = groupSelected.text || { icon: "text", label: "Text" };
  const txtSubToolRef = useRef(txtSubTool.label);
  const isFibTool = tlSubTool.icon.startsWith("fib");
  const isGannTool = ["gannBox","gannSquare","gannFan"].includes(tlSubTool.icon);
  const isElliottTool = ["elliott5","elliottABC","elliottTri","elliottWXY","elliottWXYXZ"].includes(tlSubTool.icon);
  const isPatternTool = tool === "pattern";
  const isRRTool = tlSubTool.icon === "longPos" || tlSubTool.icon === "shortPos";

  useEffect(() => {
    if (tool !== "trendline" && tool !== "rect" && tool !== "channel" && tool !== "brush2" && tool !== "fib" && tool !== "pattern") { setTlSettOpen(false); setTlBarDrop(null); }
    if (tool !== "text") { setTxtSettOpen(false); setTxtSizeOpen(false); setTxtBarSizeOpen(false); setTxtBarDrop(null); }
  }, [tool]);

  // Update name when switching between sub-tools; also reset to Style tab so the
  // tab indicator never lands off-screen when the previous tab doesn't exist on the new tool
  useEffect(() => {
    if ((tool === "trendline" || tool === "rect" || tool === "channel" || tool === "brush2" || tool === "fib" || tool === "pattern" || tool === "measure") && tlSubTool.label !== tlSubToolRef.current) {
      tlSubToolRef.current = tlSubTool.label;
      setTlName(tlSubTool.label);
      setTlSettTab("style");
    }
  }, [tlSubTool.label, tool]);

  // Update txtName when switching text sub-tools (Text → Note → Callout etc.)
  useEffect(() => {
    if (tool === "text" && txtSubTool.label !== txtSubToolRef.current) {
      txtSubToolRef.current = txtSubTool.label;
      setTxtName(txtSubTool.label);
      setTxtSettTab(txtSubTool.icon === "emoji" ? "coordinates" : "style");
    }
  }, [txtSubTool.label, tool]);

  // Keep color picker anchored to its tl bar button while the bar is being dragged
  useEffect(() => {
    if ((!["tlLineColor","rr_profitColor","rr_lossColor","rr_entryColor","rr_labelColor"].includes(colorPicker)) || !cpBarAnchorRef.current) return;
    const a = cpBarAnchorRef.current;
    setCpPos({ top: a.cpTop + (tlBarPos.y - a.barY), left: a.cpLeft + (tlBarPos.x - a.barX) });
  }, [tlBarPos]);

  // Push both floating bars out of the right panel the instant it opens
  useEffect(() => {
    const panelW = (rightPanel || orderPanelOpen) ? 336 : 0;
    const vpW = window.innerWidth / Z;
    if (tlBarRef.current) {
      const barW = tlBarRef.current.getBoundingClientRect().width / Z;
      setTlBarPos(p => ({ ...p, x: Math.min(p.x, vpW - panelW - barW) }));
    }
    if (pinnedBarRef.current) {
      const barW = pinnedBarRef.current.getBoundingClientRect().width / Z;
      setPinnedBarPos(p => ({ ...p, x: Math.min(p.x, vpW - panelW - barW) }));
    }
  }, [rightPanel, orderPanelOpen]);

  // Rollback overlay — callback ref attaches native mousemove the instant the node mounts
  // (avoids useEffect timing gap when rollback first becomes true)
  const rollbackOverlayCallbackRef = (node) => {
    rollbackOverlayRef.current = node;
    if (!node) return;
    const Z = 1.05;
    // Cache rect — recomputed only on scroll/resize, never inside the hot path
    let rectLeft = 0, rectWidth = 0;
    const refreshRect = () => { const r = node.getBoundingClientRect(); rectLeft = r.left; rectWidth = r.width; };
    refreshRect();
    const onMove = (e) => {
      if (!rollbackLineRef.current) return;
      // Process every coalesced sample so the line matches the mouse's native
      // polling rate rather than the display frame rate
      const samples = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      const last = samples[samples.length - 1];
      const x = Math.min((rectWidth / Z) - 1, Math.max(0, (last.clientX - rectLeft) / Z));
      rollbackLineRef.current.style.transform = `translateX(${x}px)`;
      rollbackLineRef.current.style.opacity = '1';
    };
    node.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('resize', refreshRect, { passive: true });
    window.addEventListener('scroll', refreshRect, { passive: true });
    node._rbCleanup = () => {
      node.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', refreshRect);
      window.removeEventListener('scroll', refreshRect);
    };
  };

  const catColors = {trend:c.acL, momentum:"#E8820A", volatility:"#C9A84C", volume:c.gn, sessions:"#FF5068", others:c.ts};
  const tplWatchKeys = new Set(["bullBody","bullBorder","bullWick","bearBody","bearBorder","bearWick","background","gridColor","unifiedBarColorVal","crosshairColor","priceLineColor","textColor"]);
  const updateSetting = (key, val) => setSettings(prev => {
    const next = {...prev, [key]: val};
    if (tplWatchKeys.has(key) && prev.chartTemplate !== "CUSTOM") next.chartTemplate = "CUSTOM";
    return next;
  });
  const defaultTemplateMap = {
    "Dark Classic":   {bullBody:"#00D4A1",bullBorder:"#00D4A1",bullWick:"#00D4A1",bearBody:"#FF5068",bearBorder:"#FF5068",bearWick:"#FF5068",background:"#07080E",gridColor:"rgba(140,160,255,0.15)"},
    "Professional":   {bullBody:"#26A69A",bullBorder:"#26A69A",bullWick:"#26A69A",bearBody:"#EF5350",bearBorder:"#EF5350",bearWick:"#EF5350",background:"#131722",gridColor:"rgba(100,140,200,0.15)"},
    "Ocean Night":    {bullBody:"#00BCD4",bullBorder:"#00BCD4",bullWick:"#00BCD4",bearBody:"#FF4081",bearBorder:"#FF4081",bearWick:"#FF4081",background:"#050D18",gridColor:"rgba(0,188,212,0.12)"},
    "Amber Dusk":     {bullBody:"#FF9800",bullBorder:"#FF9800",bullWick:"#FF9800",bearBody:"#F44336",bearBorder:"#F44336",bearWick:"#F44336",background:"#0E0A05",gridColor:"rgba(255,152,0,0.12)"},
    "Forest Deep":    {bullBody:"#66BB6A",bullBorder:"#66BB6A",bullWick:"#66BB6A",bearBody:"#81C784",bearBorder:"#81C784",bearWick:"#81C784",background:"#060E06",gridColor:"rgba(102,187,106,0.12)"},
    "Midnight":       {bullBody:"#42A5F5",bullBorder:"#42A5F5",bullWick:"#42A5F5",bearBody:"#EF5350",bearBorder:"#EF5350",bearWick:"#EF5350",background:"#040812",gridColor:"rgba(66,165,245,0.12)"},
    "Crimson":        {bullBody:"#F44336",bullBorder:"#F44336",bullWick:"#F44336",bearBody:"#9C27B0",bearBorder:"#9C27B0",bearWick:"#9C27B0",background:"#0C0308",gridColor:"rgba(244,67,54,0.12)"},
    "Arctic Frost":   {bullBody:"#80DEEA",bullBorder:"#80DEEA",bullWick:"#80DEEA",bearBody:"#FFAB40",bearBorder:"#FFAB40",bearWick:"#FFAB40",background:"#05080F",gridColor:"rgba(128,222,234,0.12)"},
    "Cyber Green":    {bullBody:"#00E676",bullBorder:"#00E676",bullWick:"#00E676",bearBody:"#FF1744",bearBorder:"#FF1744",bearWick:"#FF1744",background:"#020A02",gridColor:"rgba(0,230,118,0.12)"},
    "Rose Gold":      {bullBody:"#F48FB1",bullBorder:"#F48FB1",bullWick:"#F48FB1",bearBody:"#FFB74D",bearBorder:"#FFB74D",bearWick:"#FFB74D",background:"#0E0608",gridColor:"rgba(244,143,177,0.12)"},
  };
  const applyTemplate = (name, overrideSettings) => {
    const base = overrideSettings || defaultTemplateMap[name] || {};
    setSettings(prev => ({...prev, ...base, chartTemplate: name}));
  };
  const saveCustomTemplate = () => {
    const name = tplNameInput.trim();
    if (!name) return;
    const snap = {
      n: name,
      cols: [settings.bullBody, settings.bearBody, settings.background],
      settings: {
        bullBody:settings.bullBody,bullBorder:settings.bullBorder,bullWick:settings.bullWick,
        bearBody:settings.bearBody,bearBorder:settings.bearBorder,bearWick:settings.bearWick,
        background:settings.background,gridColor:settings.gridColor,
        unifiedBarColorVal:settings.unifiedBarColorVal,
      },
    };
    setCustomTemplates(prev => [...prev.filter(t=>t.n!==name), snap]);
    setTplNameInput("");
  };
  // Bracket-style on/off indicator. Pass label to make the text part of the clickable area.
  const Chk = (on, settKey, hKey, label) => {
    const isH = swHov === hKey;
    const bCol = on ? c.acL : isH ? c.tx : c.ts;
    const indicator = (
      <svg width={10} height={10} style={{display:"block",overflow:"visible",flexShrink:0}}>
        <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={bCol} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
        <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={bCol} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
        {!on && isH && <>
          <path d="M6,0.8 L9.2,0.8 L9.2,4" stroke="rgba(74,106,255,0.35)" strokeWidth={1} fill="none" strokeLinecap="square"/>
          <path d="M0.8,6 L0.8,9.2 L4,9.2" stroke="rgba(74,106,255,0.35)" strokeWidth={1} fill="none" strokeLinecap="square"/>
        </>}
        {on && <>
          <path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
          <path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
          <circle cx={5} cy={5} r={2.8} fill={c.acL} opacity={0.12}/>
          <circle cx={5} cy={5} r={1.6} fill={c.acL}/>
        </>}
      </svg>
    );
    const shared = {onClick:()=>updateSetting(settKey,!on),onMouseEnter:()=>setSwHov(hKey),onMouseLeave:()=>setSwHov(null),style:{cursor:"default",userSelect:"none",WebkitUserSelect:"none"}};
    if (label) return <>
      <div {...shared} style={{...shared.style,display:"inline-flex",alignItems:"center",gap:6,flexShrink:0}}>
        <div style={{width:10,height:10,flexShrink:0}}>{indicator}</div>
        <span style={{fontSize:13,fontWeight:on?600:500,color:on?c.acL:isH?c.tx:c.ts,transition:"color 0.12s"}}>{label}</span>
      </div>
      <div style={{flex:1}}/>
    </>;
    return <div {...shared} style={{...shared.style,flexShrink:0,width:10,height:10}}>{indicator}</div>;
  };
  // TL-style checkbox SVG — same visual as Chk but wired to tlStyle + hov
  const TlChk = (on, hKey, label, toggle, accent) => {
    const ac = accent || c.acL;
    const acGhost = accent ? accent.replace(/[\d.]+\)$/,"0.35)") : "rgba(74,106,255,0.35)";
    const isH = hov === hKey;
    const bCol = on ? ac : isH ? c.tx : c.ts;
    const indicator = (
      <svg width={10} height={10} style={{display:"block",overflow:"visible",flexShrink:0}}>
        <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={bCol} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
        <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={bCol} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
        {!on && isH && <>
          <path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={acGhost} strokeWidth={1} fill="none" strokeLinecap="square"/>
          <path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={acGhost} strokeWidth={1} fill="none" strokeLinecap="square"/>
        </>}
        {on && <>
          <path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={ac} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
          <path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={ac} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
          <circle cx={5} cy={5} r={2.8} fill={ac} opacity={0.12}/>
          <circle cx={5} cy={5} r={1.6} fill={ac}/>
        </>}
      </svg>
    );
    return (
      <div onClick={toggle} onMouseEnter={()=>setHov(hKey)} onMouseLeave={()=>setHov(null)}
        style={{display:"inline-flex",alignItems:"center",gap:6,cursor:"default",userSelect:"none",WebkitUserSelect:"none",
                opacity: on && isH ? 0.65 : 1, transition:"opacity 0.12s"}}>
        <div style={{width:10,height:10,flexShrink:0}}>{indicator}</div>
        {label && <span style={{fontSize:12,fontWeight:500,color:on?ac:isH?c.tx:c.ts,transition:"color 0.12s",whiteSpace:"nowrap"}}>{label}</span>}
      </div>
    );
  };
  const Z = 1.05; // root zoom — divide getBoundingClientRect values by this before using as fixed CSS coords
  const cpW = 210; // color picker width
  const CP_H = 280; // color picker estimated height
  const posFromRect = (rect, popW, gapY = 6) => {
    const vpH = window.innerHeight / Z;
    const vpW = window.innerWidth / Z;
    const bBottom = rect.bottom / Z;
    const bTop = rect.top / Z;
    // flip above if not enough space below
    const t = bBottom + gapY + CP_H > vpH - 8
      ? Math.max(8, bTop - gapY - CP_H)
      : bBottom + gapY;
    const rawL = (rect.left + rect.width / 2) / Z - popW / 2;
    const l = Math.max(8, Math.min(rawL, vpW - popW - 8));
    return { top: t, left: l };
  };
  // Edge-aware position for settDrop popups
  // Returns { top, left } for below or { cssBottom, left } for above — render must handle both
  const sdPos = (r, opts = {}) => {
    const vpH = window.innerHeight / Z;
    const vpW = window.innerWidth / Z;
    const estH = opts.h || 180;
    const w = opts.w;
    const bB = r.bottom / Z, bT = r.top / Z, bL = r.left / Z, bR = r.right / Z;
    // vertical: open below, flip above if overflow — use cssBottom so actual height doesn't matter
    const flipAbove = bB + 4 + estH > vpH - 8;
    const vert = flipAbove ? { cssBottom: vpH - bT + 4 } : { top: bB + 4 };
    // horizontal
    let left;
    if (opts.rightAlign) {
      left = bR - (w || 100);
      if (left < 8) left = bL; // prevent left overflow
    } else {
      left = bL;
      if (w && left + w > vpW - 8) left = Math.max(8, bR - w); // flip left if right overflow
    }
    return { ...vert, left, ...(w ? { w } : {}) };
  };
  const openCP = (e, key, value) => {
    const val = value !== undefined ? value : settings[key];
    const p = parseColor(val || '#ffffff');
    const hsv = rgbToHsv(p.r, p.g, p.b);
    setCpH(hsv.h); setCpS(hsv.s); setCpV(hsv.v); setCpA(p.a);
    setCpHex(toHex2(p.r)+toHex2(p.g)+toHex2(p.b));
    setCpPos(posFromRect(e.currentTarget.getBoundingClientRect(), cpW));
    cpBarAnchorRef.current = null;
    setColorPicker(key);
  };
  const openGotoCP = (e) => {
    const p = parseColor(gotoNewColor || '#4A6AFF');
    const hsv = rgbToHsv(p.r, p.g, p.b);
    setCpH(hsv.h); setCpS(hsv.s); setCpV(hsv.v); setCpA(p.a);
    setCpHex(toHex2(p.r)+toHex2(p.g)+toHex2(p.b));
    setCpPos(posFromRect(e.currentTarget.getBoundingClientRect(), cpW));
    cpBarAnchorRef.current = null;
    setColorPicker("gotoNewColor");
  };
  const cpApply = (nh, ns, nv, na, key) => {
    const rgb = hsvToRgb(nh, ns, nv);
    setCpHex(toHex2(rgb.r)+toHex2(rgb.g)+toHex2(rgb.b));
    const targetKey = key || colorPicker;
    const colorVal = cpBuildColor(rgb.r, rgb.g, rgb.b, na);
    if(targetKey === "gotoNewColor") setGotoNewColor(colorVal);
    else if(targetKey === "tlLineColor") setTlStyle(s=>isFibTool ? {...s, lineColor: colorVal, fibLevels: s.fibLevels.map(l=>({...l, color: colorVal}))} : {...s, lineColor: colorVal});
    else if(targetKey === "tlBgColor") setTlStyle(s=>({...s, bgColor: colorVal}));
    else if(targetKey === "tlMidLineColor") setTlStyle(s=>({...s, midLineColor: colorVal}));
    else if(targetKey === "tlTextColor") setTlStyle(s=>({...s, textColor: colorVal}));
    else if(targetKey === "tlLabelColor") setTlStyle(s=>({...s, labelColor: colorVal}));
    else if(targetKey === "tlLabelBgColor") setTlStyle(s=>({...s, labelBgColor: colorVal}));
    else if(targetKey === "tlBorderColor") setTlStyle(s=>({...s, borderColor: colorVal}));
    else if(targetKey?.startsWith("chLine-")) { const idx=+targetKey.split("-")[1]; setTlStyle(s=>({...s, chLines: s.chLines.map((l,i)=>i===idx?{...l,color:colorVal}:l)})); }
    else if(targetKey?.startsWith("regLine-")) { const idx=+targetKey.split("-")[1]; setTlStyle(s=>({...s, regLines: s.regLines.map((l,i)=>i===idx?{...l,color:colorVal}:l)})); }
    else if(targetKey === "regUpperBg") setTlStyle(s=>({...s, regUpperBg: colorVal}));
    else if(targetKey === "regLowerBg") setTlStyle(s=>({...s, regLowerBg: colorVal}));
    else if(targetKey?.startsWith("pfLevel-")) { const idx=+targetKey.split("-")[1]; setTlStyle(s=>({...s, pfLevels: s.pfLevels.map((l,i)=>i===idx?{...l,color:colorVal}:l)})); }
    else if(targetKey?.startsWith("fibLevel-")) { const idx=+targetKey.split("-")[1]; setTlStyle(s=>({...s, fibLevels: s.fibLevels.map((l,i)=>i===idx?{...l,color:colorVal}:l)})); }
    else if(targetKey?.startsWith("fibTzLevel-")) { const idx=+targetKey.split("-")[1]; setTlStyle(s=>({...s, fibTzLevels: s.fibTzLevels.map((l,i)=>i===idx?{...l,color:colorVal}:l)})); }
    else if(targetKey === "fibTrendColor") setTlStyle(s=>({...s, lineColor: colorVal}));
    else if(targetKey?.startsWith("gannPrice-")) { const idx=+targetKey.split("-")[1]; setTlStyle(s=>({...s, gannPriceLevels: s.gannPriceLevels.map((l,i)=>i===idx?{...l,color:colorVal}:l)})); }
    else if(targetKey?.startsWith("gannTime-")) { const idx=+targetKey.split("-")[1]; setTlStyle(s=>({...s, gannTimeLevels: s.gannTimeLevels.map((l,i)=>i===idx?{...l,color:colorVal}:l)})); }
    else if(targetKey === "fibGridColor") setTlStyle(s=>({...s, fibGridColor: colorVal}));
    else if(targetKey?.startsWith("fibFanTimeLevel-")) { const idx=+targetKey.split("-")[1]; setTlStyle(s=>({...s, fibFanTimeLevels: s.fibFanTimeLevels.map((l,i)=>i===idx?{...l,color:colorVal}:l)})); }
    else if(targetKey?.startsWith("gannGrid-")) { const idx=+targetKey.split("-")[1]; setTlStyle(s=>({...s, gannGridLevels: s.gannGridLevels.map((l,i)=>i===idx?{...l,color:colorVal}:l)})); }
    else if(targetKey?.startsWith("gannFanLv-")) { const idx=+targetKey.split("-")[1]; setTlStyle(s=>({...s, gannFanLevels: s.gannFanLevels.map((l,i)=>i===idx?{...l,color:colorVal}:l)})); }
    else if(targetKey?.startsWith("gannArc-")) { const idx=+targetKey.split("-")[1]; setTlStyle(s=>({...s, gannArcLevels: s.gannArcLevels.map((l,i)=>i===idx?{...l,color:colorVal}:l)})); }
    else if(targetKey === "txtTextColor") setTxtStyle(s=>({...s, textColor: colorVal}));
    else if(targetKey === "txtBgColor") setTxtStyle(s=>({...s, bgColor: colorVal}));
    else if(targetKey === "txtBorderColor") setTxtStyle(s=>({...s, borderColor: colorVal}));
    else if(targetKey === "pinLabelColor") setTxtStyle(s=>({...s, pinLabelColor: colorVal}));
    else if(targetKey === "vwap_vwapColor")  setVwapStyle(s=>({...s, vwapColor:  colorVal}));
    else if(targetKey === "vwap_band1Color") setVwapStyle(s=>({...s, band1Color: colorVal}));
    else if(targetKey === "vwap_bg1Color")   setVwapStyle(s=>({...s, bg1Color:   colorVal}));
    else if(targetKey === "vwap_band2Color") setVwapStyle(s=>({...s, band2Color: colorVal}));
    else if(targetKey === "vwap_bg2Color")   setVwapStyle(s=>({...s, bg2Color:   colorVal}));
    else if(targetKey === "vwap_band3Color") setVwapStyle(s=>({...s, band3Color: colorVal}));
    else if(targetKey === "vwap_bg3Color")   setVwapStyle(s=>({...s, bg3Color:   colorVal}));
    else if(targetKey === "vp_valuesColor")       setVpStyle(s=>({...s, valuesColor:       colorVal}));
    else if(targetKey === "vp_zoneBgColor")        setVpStyle(s=>({...s, zoneBgColor:        colorVal}));
    else if(targetKey === "vp_upVolColor")         setVpStyle(s=>({...s, upVolColor:         colorVal}));
    else if(targetKey === "vp_downVolColor")       setVpStyle(s=>({...s, downVolColor:       colorVal}));
    else if(targetKey === "vp_valueAreaUpColor")   setVpStyle(s=>({...s, valueAreaUpColor:   colorVal}));
    else if(targetKey === "vp_valueAreaDownColor") setVpStyle(s=>({...s, valueAreaDownColor: colorVal}));
    else if(targetKey === "vp_pocColor")           setVpStyle(s=>({...s, pocColor:           colorVal}));
    else if(targetKey === "vp_vahColor")           setVpStyle(s=>({...s, vahColor:           colorVal}));
    else if(targetKey === "vp_valColor")           setVpStyle(s=>({...s, valColor:           colorVal}));
    else if(targetKey === "vp_devPocColor")        setVpStyle(s=>({...s, devPocColor:        colorVal}));
    else if(targetKey === "vp_devVAColor")         setVpStyle(s=>({...s, devVAColor:         colorVal}));
    else if(targetKey === "av_valuesColor")        setAvStyle(s=>({...s, valuesColor:        colorVal}));
    else if(targetKey === "av_zoneBgColor")        setAvStyle(s=>({...s, zoneBgColor:        colorVal}));
    else if(targetKey === "av_upVolColor")         setAvStyle(s=>({...s, upVolColor:         colorVal}));
    else if(targetKey === "av_downVolColor")       setAvStyle(s=>({...s, downVolColor:       colorVal}));
    else if(targetKey === "av_valueAreaUpColor")   setAvStyle(s=>({...s, valueAreaUpColor:   colorVal}));
    else if(targetKey === "av_valueAreaDownColor") setAvStyle(s=>({...s, valueAreaDownColor: colorVal}));
    else if(targetKey === "av_pocColor")           setAvStyle(s=>({...s, pocColor:           colorVal}));
    else if(targetKey === "av_vahColor")           setAvStyle(s=>({...s, vahColor:           colorVal}));
    else if(targetKey === "av_valColor")           setAvStyle(s=>({...s, valColor:           colorVal}));
    else if(targetKey === "av_devPocColor")        setAvStyle(s=>({...s, devPocColor:        colorVal}));
    else if(targetKey === "av_devVAColor")         setAvStyle(s=>({...s, devVAColor:         colorVal}));
    else if(targetKey === "rr_profitColor") setRrStyle(s=>({...s, profitColor: colorVal}));
    else if(targetKey === "rr_lossColor")   setRrStyle(s=>({...s, lossColor:   colorVal}));
    else if(targetKey === "rr_entryColor")  setRrStyle(s=>({...s, entryColor:  colorVal}));
    else if(targetKey === "rr_labelColor")  setRrStyle(s=>({...s, labelColor:  colorVal}));
    else updateSetting(targetKey, colorVal);
  };
  const indicatorData = [
    // Trend
    {id:"SMA",name:"Simple Moving Average",abbr:"SMA",cat:"trend",desc:"Smoothed average of closing prices over N periods"},
    {id:"EMA",name:"Exponential Moving Average",abbr:"EMA",cat:"trend",desc:"Gives more weight to recent prices"},
    {id:"WMA",name:"Weighted Moving Average",abbr:"WMA",cat:"trend",desc:"Linearly weighted average, emphasises recency"},
    {id:"DEMA",name:"Double EMA",abbr:"DEMA",cat:"trend",desc:"Reduces lag with a double-smoothed EMA"},
    {id:"TEMA",name:"Triple EMA",abbr:"TEMA",cat:"trend",desc:"Further reduces lag using triple smoothing"},
    {id:"HMA",name:"Hull Moving Average",abbr:"HMA",cat:"trend",desc:"Nearly eliminates lag while maintaining smoothness"},
    {id:"VWMA",name:"Volume Weighted MA",abbr:"VWMA",cat:"trend",desc:"MA weighted by volume at each bar"},
    {id:"ALMA",name:"Arnaud Legoux MA",abbr:"ALMA",cat:"trend",desc:"Low-noise Gaussian-weighted moving average"},
    {id:"SUPERTREND",name:"Supertrend",abbr:"ST",cat:"trend",desc:"ATR-based trend-following overlay with signals"},
    {id:"ICHIMOKU",name:"Ichimoku Cloud",abbr:"ICHI",cat:"trend",desc:"Multi-component Japanese trend & support system"},
    // Momentum
    {id:"RSI",name:"Relative Strength Index",abbr:"RSI",cat:"momentum",desc:"Oscillator measuring overbought/oversold conditions"},
    {id:"MACD",name:"MACD",abbr:"MACD",cat:"momentum",desc:"Moving average convergence/divergence histogram"},
    {id:"STOCH",name:"Stochastic",abbr:"STOCH",cat:"momentum",desc:"Compares closing price to price range over N periods"},
    {id:"CCI",name:"Commodity Channel Index",abbr:"CCI",cat:"momentum",desc:"Measures deviation from statistical mean"},
    {id:"MOM",name:"Momentum",abbr:"MOM",cat:"momentum",desc:"Raw price change over N periods"},
    {id:"ROC",name:"Rate of Change",abbr:"ROC",cat:"momentum",desc:"Percentage change in price over N periods"},
    {id:"WPR",name:"Williams %R",abbr:"%R",cat:"momentum",desc:"Overbought/oversold oscillator in -100 to 0 range"},
    {id:"TSI",name:"True Strength Index",abbr:"TSI",cat:"momentum",desc:"Double-smoothed momentum oscillator"},
    {id:"KST",name:"Know Sure Thing",abbr:"KST",cat:"momentum",desc:"Summed & smoothed rate-of-change oscillator"},
    {id:"DPO",name:"Detrended Price Oscillator",abbr:"DPO",cat:"momentum",desc:"Removes trend to isolate cycles"},
    {id:"PPO",name:"Percentage Price Oscillator",abbr:"PPO",cat:"momentum",desc:"MACD expressed as a percentage"},
    {id:"AO",name:"Awesome Oscillator",abbr:"AO",cat:"momentum",desc:"5/34 period SMA midpoint difference"},
    {id:"STOCHRSI",name:"Stochastic RSI",abbr:"StRSI",cat:"momentum",desc:"Stochastic applied to RSI values for sensitivity"},
    // Volatility
    {id:"BB",name:"Bollinger Bands",abbr:"BB",cat:"volatility",desc:"Dynamic bands 2 standard deviations from SMA"},
    {id:"ATR",name:"Average True Range",abbr:"ATR",cat:"volatility",desc:"Average of true range over N periods"},
    {id:"KC",name:"Keltner Channel",abbr:"KC",cat:"volatility",desc:"ATR-based envelope around EMA"},
    {id:"DC",name:"Donchian Channel",abbr:"DC",cat:"volatility",desc:"High/low channel over N periods"},
    {id:"ATRP",name:"ATR Percentage",abbr:"ATRP",cat:"volatility",desc:"ATR expressed as a percentage of price"},
    {id:"HV",name:"Historical Volatility",abbr:"HV",cat:"volatility",desc:"Annualised standard deviation of log returns"},
    {id:"NATR",name:"Normalized ATR",abbr:"NATR",cat:"volatility",desc:"ATR normalised by closing price"},
    {id:"VHF",name:"Vertical Horizontal Filter",abbr:"VHF",cat:"volatility",desc:"Measures trending vs ranging conditions"},
    // Volume
    {id:"VWAP",name:"VWAP",abbr:"VWAP",cat:"volume",desc:"Intraday volume-weighted average price benchmark"},
    {id:"OBV",name:"On Balance Volume",abbr:"OBV",cat:"volume",desc:"Cumulative volume direction indicator"},
    {id:"CMF",name:"Chaikin Money Flow",abbr:"CMF",cat:"volume",desc:"Money flow oscillator over N periods"},
    {id:"MFI",name:"Money Flow Index",abbr:"MFI",cat:"volume",desc:"RSI-like oscillator incorporating volume"},
    {id:"VROC",name:"Volume Rate of Change",abbr:"VROC",cat:"volume",desc:"Percentage change in volume over N periods"},
    {id:"AD",name:"Accumulation/Distribution",abbr:"A/D",cat:"volume",desc:"Cumulative money flow line"},
    {id:"PVT",name:"Price Volume Trend",abbr:"PVT",cat:"volume",desc:"Combines price change percentage with volume"},
    {id:"KLINGER",name:"Klinger Volume Oscillator",abbr:"KVO",cat:"volume",desc:"Long/short volume force oscillator"},
    // Sessions
    {id:"SESS",name:"Session Boxes",abbr:"SESS",cat:"sessions",desc:"Highlights all major trading sessions with boxes"},
    {id:"ASIA",name:"Asia Session",abbr:"ASIA",cat:"sessions",desc:"Highlights the Asian session range"},
    {id:"LON",name:"London Session",abbr:"LON",cat:"sessions",desc:"Highlights the London session range"},
    {id:"NY",name:"New York Session",abbr:"NY",cat:"sessions",desc:"Highlights the New York session range"},
    // Others
    {id:"PIVOT",name:"Pivot Points",abbr:"PIVOT",cat:"others",desc:"Daily/weekly/monthly S/R pivot levels"},
    {id:"PSAR",name:"Parabolic SAR",abbr:"PSAR",cat:"others",desc:"Trailing stop and reversal signal dots"},
    {id:"ADX",name:"Average Directional Index",abbr:"ADX",cat:"others",desc:"Measures trend strength, not direction"},
    {id:"AROON",name:"Aroon",abbr:"AROON",cat:"others",desc:"Identifies trend changes and strength"},
    {id:"ZZ",name:"Zig Zag",abbr:"ZZ",cat:"others",desc:"Filters noise to highlight significant price swings"},
    {id:"FVGBULL",name:"Bullish Fair Value Gap",abbr:"FVG+",cat:"others",desc:"Marks up-side imbalances in price action"},
    {id:"FVGBEAR",name:"Bearish Fair Value Gap",abbr:"FVG−",cat:"others",desc:"Marks down-side imbalances in price action"},
  ];

  const indFiltered = indicatorData
    .filter(i => indCat === "all" ? true : indCat === "pinned" ? indPinned.includes(i.id) : indCat === "active" ? indActive.includes(i.id) : i.cat === indCat)
    .filter(i => !indSearch || i.name.toLowerCase().includes(indSearch.toLowerCase()) || i.abbr.toLowerCase().includes(indSearch.toLowerCase()));

  const I = ({ n, s = 18, cl = "currentColor" }) => {
    const v = "0 -960 960 960";
    // stroke=c.bg with paintOrder="fill stroke" erodes the filled shape from the inside,
    // making every icon line visually thinner without changing path data
    const F = (d, fr) => <svg width={s} height={s} viewBox={v} fill={cl}><path d={d} fillRule={fr}/></svg>;
    // custom icons that need special SVG structure
    // --- Layout utility icons (stroke-based for bold, clear lines at small sizes) ---
    if (n === "layout")     return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="9" height="14" rx="1.5" stroke={cl} strokeWidth="2.1" strokeLinejoin="round"/><rect x="13" y="2" width="9" height="6" rx="1.5" stroke={cl} strokeWidth="2.1" strokeLinejoin="round"/><rect x="13" y="10" width="9" height="12" rx="1.5" stroke={cl} strokeWidth="2.1" strokeLinejoin="round"/></svg>;
    if (n === "tree")       return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><line x1="5" y1="3" x2="5" y2="21" stroke={cl} strokeWidth="2.1" strokeLinecap="round"/><line x1="5" y1="6" x2="19" y2="6" stroke={cl} strokeWidth="2.1" strokeLinecap="round"/><line x1="5" y1="12" x2="15" y2="12" stroke={cl} strokeWidth="2.1" strokeLinecap="round"/><line x1="5" y1="18" x2="11" y2="18" stroke={cl} strokeWidth="2.1" strokeLinecap="round"/></svg>;
    if (n === "screenshot") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke={cl} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="13" r="4" stroke={cl} strokeWidth="2.1"/></svg>;
    if (n === "news")       return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="2" y="3" width="20" height="18" rx="2" stroke={cl} strokeWidth="2.1" strokeLinejoin="round"/><line x1="6" y1="8" x2="18" y2="8" stroke={cl} strokeWidth="2" strokeLinecap="round"/><line x1="6" y1="12" x2="13" y2="12" stroke={cl} strokeWidth="2" strokeLinecap="round"/><line x1="6" y1="16" x2="16" y2="16" stroke={cl} strokeWidth="2" strokeLinecap="round"/></svg>;
    if (n === "expand")     return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><polyline points="15,3 21,3 21,9" stroke={cl} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="9,21 3,21 3,15" stroke={cl} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><line x1="21" y1="3" x2="14" y2="10" stroke={cl} strokeWidth="2.2" strokeLinecap="round"/><line x1="3" y1="21" x2="10" y2="14" stroke={cl} strokeWidth="2.2" strokeLinecap="round"/></svg>;
    if (n === "compress")   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><polyline points="4,14 10,14 10,20" stroke={cl} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="20,10 14,10 14,4" stroke={cl} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><line x1="10" y1="14" x2="3" y2="21" stroke={cl} strokeWidth="2.2" strokeLinecap="round"/><line x1="14" y1="10" x2="21" y2="3" stroke={cl} strokeWidth="2.2" strokeLinecap="round"/></svg>;
    // --- Cursor variants ---
    if (n === "crosshair")    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><line x1="12" y1="2" x2="12" y2="9.5" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/><line x1="12" y1="14.5" x2="12" y2="22" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/><line x1="2" y1="12" x2="9.5" y2="12" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/><line x1="14.5" y1="12" x2="22" y2="12" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="12" r="2.5" stroke={cl} strokeWidth="1.5"/></svg>;
    if (n === "cursorDot")    return <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5" fill={cl}/></svg>;
    if (n === "cursorArrow")  return <svg width={s} height={s} viewBox="0 0 24 24" fill={cl}><path d="M4,2 L4,17 L8,13 L11,20 L13.5,19 L10.5,12 L16,12 Z"/></svg>;
    // --- Line variants (standard: viewBox 0 0 17 17, stroke 1.5, circles r=2, arrowheads 4×6) ---
    if (n === "hray")         return <svg width={s} height={s} viewBox="0 0 17 17" fill="none" style={{display:"block"}}><line x1="3.5" y1="8.5" x2="13.5" y2="8.5" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/><circle cx="2" cy="8.5" r="2" fill={cl}/><polygon points="17,8.5 13,5.5 13,11.5" fill={cl}/></svg>;
    if (n === "hline")        return <svg width={s} height={s} viewBox="0 0 17 17" fill="none" style={{display:"block"}}><line x1="4" y1="8.5" x2="13" y2="8.5" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/><polygon points="0,8.5 4,5.5 4,11.5" fill={cl}/><polygon points="17,8.5 13,5.5 13,11.5" fill={cl}/></svg>;
    if (n === "extendedLine") return <svg width={s} height={s} viewBox="0 0 17 17" fill="none" style={{display:"block"}}><line x1="2" y1="15" x2="15" y2="2" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/><circle cx="6" cy="11" r="2" fill={cl}/><circle cx="11" cy="6" r="2" fill={cl}/></svg>;
    if (n === "crossLine")    return <svg width={s} height={s} viewBox="0 0 17 17" fill="none" style={{display:"block"}}><line x1="2" y1="8.5" x2="15" y2="8.5" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/><line x1="8.5" y1="2" x2="8.5" y2="15" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/></svg>;
    if (n === "ray")          return <svg width={s} height={s} viewBox="0 0 17 17" fill="none" style={{display:"block"}}><line x1="3.5" y1="13.5" x2="11" y2="6" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/><circle cx="2.5" cy="14.5" r="2" fill={cl}/><polygon points="15,2 10,3 14,7" fill={cl}/></svg>;
    if (n === "curve")        return <svg width={s} height={s} viewBox="0 0 17 17" fill="none" style={{display:"block"}}><path d="M2,14 C2,6 8,2 15,6" stroke={cl} strokeWidth="1.5" strokeLinecap="round" fill="none"/><circle cx="2" cy="14" r="2" fill={cl}/><circle cx="15" cy="6" r="2" fill={cl}/></svg>;
    if (n === "doubleCurve")  return <svg width={s} height={s} viewBox="0 0 17 17" fill="none" style={{display:"block"}}><path d="M2,14 C2,6 15,11 15,3" stroke={cl} strokeWidth="1.5" strokeLinecap="round" fill="none"/><circle cx="2" cy="14" r="2" fill={cl}/><circle cx="15" cy="3" r="2" fill={cl}/></svg>;
    if (n === "polyline")     return <svg width={s} height={s} viewBox="0 0 17 17" fill="none" style={{display:"block"}}><polygon points="2,14 6,5 11,12 15,3" fill={cl} opacity="0.08" stroke="none"/><path d="M2,14 L6,5 L11,12 L15,3" stroke={cl} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/><circle cx="2" cy="14" r="2" fill={cl}/><circle cx="6" cy="5" r="2" fill={cl}/><circle cx="11" cy="12" r="2" fill={cl}/><circle cx="15" cy="3" r="2" fill={cl}/></svg>;
    if (n === "pathTool")     return <svg width={s} height={s} viewBox="0 0 17 17" fill="none" style={{display:"block"}}><path d="M2,3 L13,3 L4,14 L12.5,14" stroke={cl} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/><circle cx="2" cy="3" r="2" fill={cl}/><polygon points="16,14 12,11 12,17" fill={cl}/></svg>;
    // --- Shape variants ---
    if (n === "arcShape")     return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.5" strokeLinecap="round"><path d="M4,18 Q12,2 20,18"/></svg>;
    if (n === "arrowLine")    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.5" strokeLinecap="round"><line x1="4" y1="20" x2="20" y2="4"/><path d="M14,4 L20,4 L20,10"/></svg>;
    if (n === "circle")       return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.5"><circle cx="12" cy="12" r="9"/></svg>;
    // --- Channel variants ---
    if (n === "regressionCh") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="round"><line x1="2" y1="22" x2="22" y2="14" strokeWidth="2"/><line x1="2" y1="10" x2="22" y2="2" strokeWidth="2"/><line x1="2" y1="16" x2="22" y2="8" strokeWidth="2" strokeDasharray="2 2" opacity="0.5"/></svg>;
    if (n === "flatChannel")  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="2" strokeLinecap="round"><line x1="2" y1="6" x2="22" y2="6"/><line x1="2" y1="20" x2="22" y2="14"/></svg>;
    if (n === "disjointCh")   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="2" strokeLinecap="round"><line x1="2" y1="7" x2="11" y2="5"/><line x1="13" y1="8" x2="22" y2="6"/><line x1="2" y1="17" x2="11" y2="15"/><line x1="13" y1="18" x2="22" y2="16"/></svg>;
    // --- Fibonacci variants ---
    if (n === "fibExtension") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="round"><line x1="2" y1="20" x2="22" y2="20" strokeWidth="1.5"/><line x1="2" y1="14" x2="22" y2="14" strokeWidth="1.2" opacity="0.7"/><line x1="2" y1="9" x2="22" y2="9" strokeWidth="1" opacity="0.5"/><line x1="2" y1="5" x2="22" y2="5" strokeWidth="0.8" opacity="0.35"/><line x1="2" y1="2" x2="22" y2="2" strokeWidth="0.8" opacity="0.2"/><path d="M4,20 L10,9 L16,14 L22,2" strokeWidth="1.5" fill="none"/></svg>;
    if (n === "fibChannel")   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="round"><line x1="2" y1="22" x2="22" y2="10" strokeWidth="1.4"/><line x1="2" y1="19" x2="22" y2="7" strokeWidth="1.4"/><line x1="2" y1="16" x2="22" y2="4" strokeWidth="1.4"/><line x1="2" y1="13" x2="22" y2="1" strokeWidth="1.4"/></svg>;
    if (n === "fibTimeZone")  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="round"><line x1="3" y1="3" x2="3" y2="21" strokeWidth="1.5"/><line x1="6" y1="3" x2="6" y2="21" strokeWidth="1.3" opacity="0.8"/><line x1="11" y1="3" x2="11" y2="21" strokeWidth="1" opacity="0.55"/><line x1="19" y1="3" x2="19" y2="21" strokeWidth="0.8" opacity="0.35"/></svg>;
    if (n === "fibFan")       return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="round"><line x1="3" y1="20" x2="22" y2="4" strokeWidth="1.5"/><line x1="3" y1="20" x2="22" y2="10" strokeWidth="1.2" opacity="0.6"/><line x1="3" y1="20" x2="22" y2="16" strokeWidth="1" opacity="0.4"/><circle cx="3" cy="20" r="1.5" fill={cl}/></svg>;
    if (n === "fibCircles")   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.2"><circle cx="12" cy="12" r="4" opacity="0.9"/><circle cx="12" cy="12" r="7" opacity="0.55"/><circle cx="12" cy="12" r="10" opacity="0.3"/></svg>;
    if (n === "fibSpiral")    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.4" strokeLinecap="round"><path d="M12,12 C12,10.3 13.3,9 15,9 C17.5,9 19,11 19,13 C19,16.3 16.5,19 13,19 C8.2,19 5,15.5 5,11 C5,5.5 9.5,2 15,2 C19,2 22,4.5 22,8"/></svg>;
    if (n === "fibArcs")      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="round"><path d="M3,20 Q3,12 12,12" strokeWidth="1.5" opacity="0.9"/><path d="M3,20 Q3,8 16,8" strokeWidth="1.2" opacity="0.55"/><path d="M3,20 Q3,4 20,4" strokeWidth="1" opacity="0.3"/><circle cx="3" cy="20" r="1.5" fill={cl}/></svg>;
    if (n === "fibWedge")     return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.5" strokeLinecap="round"><path d="M3,20 L12,4 L21,20" fill="none"/><line x1="6" y1="15" x2="18" y2="15" strokeWidth="0.8" opacity="0.5"/><line x1="8" y1="11" x2="16" y2="11" strokeWidth="0.8" opacity="0.35"/></svg>;
    if (n === "fibTime")      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="round"><path d="M3,20 L10,6 L17,14 L22,4" strokeWidth="1.5" fill="none"/><line x1="3" y1="3" x2="3" y2="21" strokeWidth="1" opacity="0.4"/><line x1="10" y1="3" x2="10" y2="21" strokeWidth="1" opacity="0.4"/><line x1="17" y1="3" x2="17" y2="21" strokeWidth="1" opacity="0.4"/></svg>;
    // --- Gann variants ---
    if (n === "gannBox")      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" strokeWidth="1.5" fill="none"/><line x1="3" y1="12" x2="21" y2="12" strokeWidth="0.8" opacity="0.5"/><line x1="12" y1="3" x2="12" y2="21" strokeWidth="0.8" opacity="0.5"/><line x1="3" y1="3" x2="21" y2="21" strokeWidth="1" opacity="0.4"/></svg>;
    if (n === "gannSquare")   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" strokeWidth="1.5" fill="none"/><line x1="3" y1="3" x2="21" y2="21" strokeWidth="1" opacity="0.5"/><line x1="21" y1="3" x2="3" y2="21" strokeWidth="1" opacity="0.5"/><line x1="3" y1="12" x2="21" y2="12" strokeWidth="0.8" opacity="0.35"/><line x1="12" y1="3" x2="12" y2="21" strokeWidth="0.8" opacity="0.35"/></svg>;
    if (n === "gannFan")      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="round"><line x1="3" y1="21" x2="21" y2="3" strokeWidth="1.5"/><line x1="3" y1="21" x2="21" y2="9" strokeWidth="1.1" opacity="0.6"/><line x1="3" y1="21" x2="21" y2="15" strokeWidth="0.9" opacity="0.4"/><line x1="3" y1="21" x2="15" y2="3" strokeWidth="1.1" opacity="0.6"/><line x1="3" y1="21" x2="9" y2="3" strokeWidth="0.9" opacity="0.4"/></svg>;
    // --- Elliott Wave variants — shared sharp wave, differentiated by first/last label ---
    if (n === "elliott5")     return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="square" strokeLinejoin="miter"><path d="M1,13 L5,3 L9,13 L14,3 L19,11 L23,5" strokeWidth="2"/><text x="1" y="23" fontSize="9" fill={cl} stroke="none" fontFamily="sans-serif" fontWeight="900">1</text><text x="23" y="23" fontSize="9" fill={cl} stroke="none" fontFamily="sans-serif" fontWeight="900" textAnchor="end">5</text></svg>;
    if (n === "elliottABC")   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="square" strokeLinejoin="miter"><path d="M1,13 L5,3 L9,13 L14,3 L19,11 L23,5" strokeWidth="2"/><text x="1" y="23" fontSize="9" fill={cl} stroke="none" fontFamily="sans-serif" fontWeight="900">A</text><text x="23" y="23" fontSize="9" fill={cl} stroke="none" fontFamily="sans-serif" fontWeight="900" textAnchor="end">C</text></svg>;
    if (n === "elliottTri")   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="square" strokeLinejoin="miter"><path d="M1,13 L5,3 L9,13 L14,3 L19,11 L23,5" strokeWidth="2"/><text x="1" y="23" fontSize="9" fill={cl} stroke="none" fontFamily="sans-serif" fontWeight="900">A</text><text x="23" y="23" fontSize="9" fill={cl} stroke="none" fontFamily="sans-serif" fontWeight="900" textAnchor="end">E</text></svg>;
    if (n === "elliottWXY")   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="square" strokeLinejoin="miter"><path d="M1,13 L5,3 L9,13 L14,3 L19,11 L23,5" strokeWidth="2"/><text x="1" y="23" fontSize="9" fill={cl} stroke="none" fontFamily="sans-serif" fontWeight="900">W</text><text x="23" y="23" fontSize="9" fill={cl} stroke="none" fontFamily="sans-serif" fontWeight="900" textAnchor="end">Y</text></svg>;
    if (n === "elliottWXYXZ") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="square" strokeLinejoin="miter"><path d="M1,13 L5,3 L9,13 L14,3 L19,11 L23,5" strokeWidth="2"/><text x="1" y="23" fontSize="9" fill={cl} stroke="none" fontFamily="sans-serif" fontWeight="900">W</text><text x="23" y="23" fontSize="9" fill={cl} stroke="none" fontFamily="sans-serif" fontWeight="900" textAnchor="end">Z</text></svg>;
    // --- Pattern variants ---
    if (n === "xabcd")        return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="square" strokeLinejoin="miter"><path d="M2,7 L7,12 L12,3 L17,11 L22,2" strokeWidth="2"/><text x="1" y="23" fontSize="9" fill={cl} stroke="none" fontFamily="sans-serif" fontWeight="900">X</text><text x="23" y="23" fontSize="9" fill={cl} stroke="none" fontFamily="sans-serif" fontWeight="900" textAnchor="end">D</text></svg>;
    if (n === "headShoulders") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2,18 L5,12 L8,16 L12,4 L16,16 L19,12 L22,18"/></svg>;
    if (n === "abcdPattern")  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="square" strokeLinejoin="miter"><path d="M2,5 L8,13 L14,4 L22,12" strokeWidth="2"/><text x="1" y="23" fontSize="9" fill={cl} stroke="none" fontFamily="sans-serif" fontWeight="900">A</text><text x="23" y="23" fontSize="9" fill={cl} stroke="none" fontFamily="sans-serif" fontWeight="900" textAnchor="end">D</text></svg>;
    if (n === "triPattern")   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="round"><line x1="1" y1="4" x2="23" y2="12" strokeWidth="1.5"/><line x1="1" y1="20" x2="23" y2="12" strokeWidth="1.5"/></svg>;
    if (n === "threeDrives")  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeLinecap="square" strokeLinejoin="miter"><path d="M2,16 L5,8 L8,14 L12,5 L16,13 L20,3 L22,8" strokeWidth="2"/></svg>;
    // --- Text/Label variants ---
    if (n === "note")         return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4,4 H20 V15 H9 L4,19 V4Z"/><line x1="8" y1="9" x2="16" y2="9" strokeWidth="1.2"/></svg>;
    if (n === "priceNote")    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4,4 H20 V15 H9 L4,19 V4Z"/><text x="12" y="11" textAnchor="middle" fontSize="7" fontWeight="700" fill={cl} stroke="none" fontFamily="sans-serif">$</text></svg>;
    if (n === "callout")      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3,4 H21 V16 H13 L8,20 V16 H3 Z"/><line x1="7" y1="8" x2="17" y2="8" strokeWidth="1"/><line x1="7" y1="12" x2="14" y2="12" strokeWidth="1"/></svg>;
    if (n === "priceLabel")   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2,9 L6,6 L22,6 L22,18 L6,18 L2,15 Z"/><line x1="9" y1="10" x2="19" y2="10" strokeWidth="1" opacity="0.5"/><line x1="9" y1="14" x2="16" y2="14" strokeWidth="1" opacity="0.5"/></svg>;
    if (n === "signpost")     return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="4" x2="8" y2="21"/><path d="M8,5 L20,5 L18,9 L20,13 L8,13"/></svg>;
    if (n === "image")        return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/><circle cx="8.5" cy="8.5" r="2" fill={cl} stroke="none"/><path d="M3,17 L8,12 L12,16 L16,11 L21,17" fill="none"/></svg>;
    if (n === "emoji")        return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.2" fill={cl} stroke="none"/><circle cx="15" cy="10" r="1.2" fill={cl} stroke="none"/><path d="M8,14.5 Q12,18 16,14.5" fill="none"/></svg>;
    // --- Volume variants ---
    if (n === "volProfile")   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><line x1="3" y1="3" x2="3" y2="21" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/><line x1="21" y1="3" x2="21" y2="21" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/><rect x="4" y="4.5" width="7" height="2" rx="0.4" fill={cl} opacity="0.4"/><rect x="4" y="8" width="11" height="2" rx="0.4" fill={cl} opacity="0.7"/><rect x="4" y="11.5" width="14" height="2" rx="0.4" fill={cl}/><rect x="4" y="15" width="10" height="2" rx="0.4" fill={cl} opacity="0.6"/><rect x="4" y="18.5" width="5" height="2" rx="0.4" fill={cl} opacity="0.35"/></svg>;
    if (n === "anchoredVol")  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="6" y="4" width="10" height="2.5" rx="0.5" fill={cl} opacity="0.4"/><rect x="4" y="7.5" width="14" height="2.5" rx="0.5" fill={cl} opacity="0.7"/><rect x="3" y="11" width="18" height="2.5" rx="0.5" fill={cl}/><rect x="5" y="14.5" width="12" height="2.5" rx="0.5" fill={cl} opacity="0.6"/><rect x="7" y="18" width="8" height="2.5" rx="0.5" fill={cl} opacity="0.35"/><line x1="3" y1="3" x2="3" y2="21" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/><circle cx="3" cy="3" r="1.5" fill={cl}/></svg>;
    if (n === "star")     return <svg width={s} height={s} viewBox={v} fill={cl}><path fillRule="evenodd" d="m354-287 126-76 126 77-33-144 111-96-146-13-58-136-58 135-146 13 111 97-33 143ZM233-120l65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Zm247-350Z"/></svg>;
    if (n === "starFill")  return F("m354-287 126-76 126 77-33-144 111-96-146-13-58-136-58 135-146 13 111 97-33 143ZM233-120l65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Zm247-350Z");
    if (n === "channel")   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="2" strokeLinecap="round"><line x1="2" y1="21" x2="22" y2="13"/><line x1="2" y1="11" x2="22" y2="3"/></svg>;
    if (n === "hollowCandle") return <svg width={s} height={s} viewBox={v} fill="none" stroke={cl} strokeWidth="55" strokeLinejoin="miter"><path d="M180-720h200v400h-200ZM280-720V-800M280-320V-220M580-620h200v400h-200ZM680-620V-700M680-220V-120"/></svg>;
    if (n === "tick")      return <svg width={s} height={s} viewBox={v} fill="none" stroke={cl} strokeWidth="60" strokeLinecap="square"><line x1="300" y1="-120" x2="300" y2="-840"/><line x1="180" y1="-680" x2="300" y2="-680"/><line x1="300" y1="-300" x2="420" y2="-300"/><line x1="660" y1="-40" x2="660" y2="-760"/><line x1="540" y1="-600" x2="660" y2="-600"/><line x1="660" y1="-220" x2="780" y2="-220"/></svg>;
    if (n === "magnet")      return F("M480-80q-117 0-198.5-81.5T200-360v-400h160v400q0 50 35 85t85 35q50 0 85-35t35-85v-400h160v400q0 117-81.5 198.5T480-80ZM360-840v240h-80v-240h80Zm160 0v240h-80v-240h80Z");
    if (n === "magnetOff")    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="3" y="0" width="8" height="2" rx="0.4" fill={cl}/><rect x="13" y="0" width="8" height="2" rx="0.4" fill={cl}/><path d="M7 1 L7 8 Q7 13 12 13 Q17 13 17 8 L17 1" stroke={cl} strokeWidth="4.5" strokeLinecap="butt" strokeLinejoin="round"/><line x1="7" y1="17" x2="17" y2="24" stroke={cl} strokeWidth="1.8" strokeLinecap="round"/><line x1="17" y1="17" x2="7" y2="24" stroke={cl} strokeWidth="1.8" strokeLinecap="round"/></svg>;
    if (n === "magnetWeak")   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="3" y="0" width="8" height="2" rx="0.4" fill={cl}/><rect x="13" y="0" width="8" height="2" rx="0.4" fill={cl}/><path d="M7 1 L7 8 Q7 13 12 13 Q17 13 17 8 L17 1" stroke={cl} strokeWidth="4.5" strokeLinecap="butt" strokeLinejoin="round"/><path d="M7 17 Q12 24 17 17" stroke={cl} strokeWidth="1.6" strokeLinecap="round" fill="none"/></svg>;
    if (n === "magnetStrong") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="3" y="0" width="8" height="2" rx="0.4" fill={cl}/><rect x="13" y="0" width="8" height="2" rx="0.4" fill={cl}/><path d="M7 1 L7 8 Q7 13 12 13 Q17 13 17 8 L17 1" stroke={cl} strokeWidth="4.5" strokeLinecap="butt" strokeLinejoin="round"/><path d="M7 16.5 Q12 21.5 17 16.5" stroke={cl} strokeWidth="1.6" strokeLinecap="round" fill="none"/><path d="M5.5 21 Q12 25 18.5 21" stroke={cl} strokeWidth="1.4" strokeLinecap="round" fill="none"/></svg>;
    if (n === "fib")       return F("M80-180v-60h800v60H80Zm0-175v-60h800v60H80Zm0-160v-60h800v60H80Zm0-205v-60h800v60H80Z");
    if (n === "vline")     return <svg width={s} height={s} viewBox="0 0 17 17" fill="none" style={{display:"block"}}><line x1="8.5" y1="4" x2="8.5" y2="13" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/><polygon points="8.5,0 5.5,4 11.5,4" fill={cl}/><polygon points="8.5,17 5.5,13 11.5,13" fill={cl}/></svg>;
    if (n === "baseline")  return F("M120-160v-520l160 120 200-280 200 160h160v520H120Zm200-120 160-220 280 218v-318H652L496-725 298-447l-98-73v144l120 96Z");
    if (n === "indicator") return <svg width={s} height={s} viewBox={v}><path d="M140-420h120v260h-120ZM390-560h120v400h-120ZM640-760h120v600h-120Z" fill={cl}/><polyline points="200,-420 450,-560 700,-760" fill="none" stroke={cl} strokeWidth="58" strokeLinecap="round" strokeLinejoin="round"/><circle cx="200" cy="-420" r="62" fill={cl}/><circle cx="450" cy="-560" r="62" fill={cl}/><circle cx="700" cy="-760" r="62" fill={cl}/></svg>;
    if (n === "pin")      return <svg width={s} height={s} viewBox={v} fill="none" stroke={cl} strokeWidth="55" strokeLinecap="round" strokeLinejoin="round"><path d="M480-880V-760"/><path d="M280-760H680L620-520H340L280-760Z"/><path d="M360-520L280-400"/><path d="M600-520L680-400"/><path d="M480-520V-80"/></svg>;
    if (n === "pinFill")  return <svg width={s} height={s} viewBox={v} fill="none" stroke={cl} strokeWidth="55" strokeLinecap="round" strokeLinejoin="round"><path d="M480-880V-760"/><path d="M280-760H680L620-520H340L280-760Z" fill={cl}/><path d="M360-520L280-400"/><path d="M600-520L680-400"/><path d="M480-520V-80"/></svg>;
    if (n === "locate")   return <svg width={s} height={s} viewBox={v} fill="none" style={{overflow:"visible"}}><g transform="rotate(30 480 -480)"><path d="M80,-120 C80,-700 200,-760 380,-760" stroke={cl} strokeWidth="92" strokeLinecap="round"/><path d="M620,-760 L380,-960 L380,-560 Z" fill={cl}/><circle cx="800" cy="-760" r="160" fill={cl}/></g></svg>;
    if (n === "rollback") return <svg width={s} height={s} viewBox={v} fill="none"><path d="M640,-480 C640,-800 80,-800 80,-480" stroke={cl} strokeWidth="76" strokeLinecap="round"/><path d="M20,-480 L180,-600 L180,-360 Z" fill={cl}/><path d="M900,-780 L640,-480" stroke={cl} strokeWidth="64" strokeLinecap="round"/><path d="M900,-180 L640,-480" stroke={cl} strokeWidth="64" strokeLinecap="round"/><circle cx="640" cy="-480" r="48" fill={cl}/></svg>;
    if (n === "trendline") return <svg width={s} height={s} viewBox="0 0 17 17" fill="none" style={{flexShrink:0,display:"block"}}><line x1="2" y1="15" x2="15" y2="2" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/><circle cx="2" cy="15" r="2" fill={cl}/><circle cx="15" cy="2" r="2" fill={cl}/></svg>;

    if (n === "cut")      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="5" cy="7.5" r="2.8" stroke={cl} strokeWidth="1.7"/><circle cx="5" cy="16.5" r="2.8" stroke={cl} strokeWidth="1.7"/><path d="M7.5,9 L21,12" stroke={cl} strokeWidth="1.7" strokeLinecap="round"/><path d="M7.5,15 L21,12" stroke={cl} strokeWidth="1.7" strokeLinecap="round"/><circle cx="14" cy="12" r="1.8" fill={cl}/></svg>;
    if (n === "grip")     return <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="9" cy="7" r="1.5" fill={cl}/><circle cx="9" cy="12" r="1.5" fill={cl}/><circle cx="9" cy="17" r="1.5" fill={cl}/><circle cx="15" cy="7" r="1.5" fill={cl}/><circle cx="15" cy="12" r="1.5" fill={cl}/><circle cx="15" cy="17" r="1.5" fill={cl}/></svg>;
    if (n === "draw")     return <svg width={s} height={s} viewBox="-20 -630 640 640" fill={cl}><path d="M240-120q-45 0-89-22t-71-58q26 0 53-20.5t27-59.5q0-50 35-85t85-35q50 0 85 35t35 85q0 66-47 113t-113 47Zm0-80q33 0 56.5-23.5T320-280q0-17-11.5-28.5T280-320q-17 0-28.5 11.5T240-280q0 23-5.5 42T220-202q5 2 10 2h10Zm230-160L360-470l386-386 110 110-386 386Zm-190 80Z"/></svg>;
    if (n === "brush")    return <svg width={s} height={s} viewBox="-20 -630 640 640" fill={cl}><path d="m544-400-52-52-52-52-200 200 104 104 200-200Zm-47-161 52 52 52 52 199-199-104-104-199 199ZM60-120l126-126-30-30v-56l257-257 216 216-257 257h-56l-30-30-26 26H60Zm353-469 283-283 216 216-283 283-216-216Z"/></svg>;
    if (n === "eraser")   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20,20 H8 L3.5,15.5 L13,6 L21,14 Z"/><line x1="6.5" y1="13" x2="11" y2="17.5"/></svg>;
    if (n === "triangle") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"><polygon points="12,3 22,20.5 2,20.5"/></svg>;
    if (n === "ellipse")  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.5"><ellipse cx="12" cy="12" rx="9.5" ry="6.5"/></svg>;
    if (n === "arrowMarker") return <svg width={s} height={s} viewBox="0 0 24 24" fill={cl}><path d="M12,1 L14,15 L18,15 L12,22 L6,15 L10,15 Z" transform="rotate(105,12,12)"/></svg>;
    if (n === "arrowUp")  return <svg width={s} height={s} viewBox="0 0 24 24" fill={cl}><path d="M12,3 L4,13 H9 V21 H15 V13 H20 Z"/></svg>;
    if (n === "arrowDn")  return <svg width={s} height={s} viewBox="0 0 24 24"><path d="M12,21 L4,11 H9 V3 H15 V11 H20 Z" fill={cl}/></svg>;
    if (n === "pitchfork") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="4" cy="12" r="1.2" fill={cl} stroke="none"/><circle cx="20" cy="4" r="1.2" fill={cl} stroke="none"/><circle cx="20" cy="20" r="1.2" fill={cl} stroke="none"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="12" y1="8" x2="20" y2="4"/><line x1="12" y1="16" x2="20" y2="20"/></svg>;
    if (n === "flag")     return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="21"/><path d="M6,3 L20,8 L6,13"/></svg>;
    if (n === "comment")  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4,4 H20 V15 H9 L4,19 V4Z"/></svg>;
    if (n === "wave")     return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2,16 L5,8 L8,14 L11,5 L14,12 L17,4 L20,10 L22,8"/></svg>;
    if (n === "longPos")  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="13" width="18" height="7" rx="1"/><path d="M12,13 V6 M9,9 L12,6 L15,9"/></svg>;
    if (n === "shortPos") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="7" rx="1"/><path d="M12,11 V18 M9,15 L12,18 L15,15"/></svg>;
    if (n === "vwap")     return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter"><circle cx="12" cy="4" r="2.2" strokeLinecap="round" strokeLinejoin="round"/><line x1="7" y1="7" x2="17" y2="7"/><line x1="12" y1="7" x2="12" y2="19"/><polyline points="4,14 8,14 8,20"/><polyline points="20,14 16,14 16,20"/><path d="M8,20 Q12,23 16,20" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    if (n === "goto")     return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="1.5" y="1.5" width="21" height="21" rx="2.5" stroke={cl} strokeWidth="1.3"/><text x="12" y="10.5" textAnchor="middle" dominantBaseline="middle" fill={cl} fontSize="11" fontWeight="900" fontFamily="sans-serif">GO</text><text x="12" y="18.5" textAnchor="middle" dominantBaseline="middle" fill={cl} fontSize="8" fontWeight="700" fontFamily="sans-serif">to</text></svg>;
    if (n === "eyeAll")   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M2 11 Q7 5 12 5 Q17 5 22 11 Q17 17 12 17 Q7 17 2 11Z" stroke={cl} strokeWidth="1.5" strokeLinejoin="round"/><circle cx="12" cy="11" r="2.8" stroke={cl} strokeWidth="1.4"/><circle cx="16.5" cy="21" r="1" fill={cl}/><circle cx="19" cy="21" r="1" fill={cl}/><circle cx="21.5" cy="21" r="1" fill={cl}/></svg>;
    if (n === "eyeInd")   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M2 11 Q7 5 12 5 Q17 5 22 11 Q17 17 12 17 Q7 17 2 11Z" stroke={cl} strokeWidth="1.5" strokeLinejoin="round"/><circle cx="12" cy="11" r="2.8" stroke={cl} strokeWidth="1.4"/><path d="M14 21 L17 19 L20 21 L23 19" stroke={cl} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    if (n === "eyePos")   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M2 11 Q7 5 12 5 Q17 5 22 11 Q17 17 12 17 Q7 17 2 11Z" stroke={cl} strokeWidth="1.5" strokeLinejoin="round"/><circle cx="12" cy="11" r="2.8" stroke={cl} strokeWidth="1.4"/><path d="M16 23 L19.5 19 L23 23" stroke={cl} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    if (n === "eyeHide")  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M2 11 Q7 5 12 5 Q17 5 22 11 Q17 17 12 17 Q7 17 2 11Z" stroke={cl} strokeWidth="1.5" strokeLinejoin="round"/><circle cx="12" cy="11" r="2.8" stroke={cl} strokeWidth="1.4"/><line x1="4" y1="19" x2="20" y2="3" stroke={cl} strokeWidth="1.4" strokeLinecap="round"/></svg>;
    if (n === "trashDraw") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><line x1="3" y1="7" x2="21" y2="7" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/><path d="M9 7V5h6v2" stroke={cl} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M4.5 7l1 15h13l1-15" stroke={cl} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><line x1="8.5" y1="20" x2="15.5" y2="11" stroke={cl} strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.7"/><circle cx="8.5" cy="20" r="1.1" fill={cl} fillOpacity="0.7"/></svg>;
    if (n === "trashInd")  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><line x1="3" y1="7" x2="21" y2="7" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/><path d="M9 7V5h6v2" stroke={cl} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M4.5 7l1 15h13l1-15" stroke={cl} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><polyline points="7.5,19.5 10,15.5 13,17.5 16.5,12.5" stroke={cl} strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.7"/></svg>;
    if (n === "measure")  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><g transform="rotate(45 12 12)"><rect x="2" y="9" width="20" height="6" rx="1" stroke={cl} strokeWidth="1.4"/><line x1="12" y1="9" x2="12" y2="13.5" stroke={cl} strokeWidth="1.2" strokeLinecap="round"/><line x1="7" y1="9" x2="7" y2="12.5" stroke={cl} strokeWidth="1.1" strokeLinecap="round"/><line x1="17" y1="9" x2="17" y2="12.5" stroke={cl} strokeWidth="1.1" strokeLinecap="round"/><line x1="4.5" y1="9" x2="4.5" y2="12" stroke={cl} strokeWidth="1" strokeLinecap="round"/><line x1="9.5" y1="9" x2="9.5" y2="12" stroke={cl} strokeWidth="1" strokeLinecap="round"/><line x1="14.5" y1="9" x2="14.5" y2="12" stroke={cl} strokeWidth="1" strokeLinecap="round"/><line x1="19.5" y1="9" x2="19.5" y2="12" stroke={cl} strokeWidth="1" strokeLinecap="round"/></g></svg>;
    const P = {
      trendline:  "m136-240-56-56 296-298 160 160 208-206H640v-80h240v240h-80v-104L536-320 376-480 136-240Z",
      rect:       "M80-160v-640h800v640H80Zm80-80h640v-480H160v480Zm0 0v-480 480Z",
      text:       "M280-160v-520H80v-120h520v120H400v520H280Zm360 0v-320H520v-120h360v120H760v320H640Z",
      brush:      "M240-120q-45 0-89-22t-71-58q26 0 53-20.5t27-59.5q0-50 35-85t85-35q50 0 85 35t35 85q0 66-47 113t-113 47Zm230-160L360-470l386-386 110 110-386 386Z",
      pattern:    "m140-220-60-60 300-300 160 160 284-320 56 56-340 384-160-160-240 240Z",
      eye:        "M607.5-372.5Q660-425 660-500t-52.5-127.5Q555-680 480-680t-127.5 52.5Q300-575 300-500t52.5 127.5Q405-320 480-320t127.5-52.5Zm-204-51Q372-455 372-500t31.5-76.5Q435-608 480-608t76.5 31.5Q588-545 588-500t-31.5 76.5Q525-392 480-392t-76.5-31.5ZM480-200q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Zm207.5-139.5Q782-399 832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280q113 0 207.5-59.5Z",
      palette:    "M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 32.5-156t88-127Q256-817 330-848.5T488-880q80 0 151 27.5t124.5 76q53.5 48.5 85 115T880-518q0 115-70 176.5T640-280h-74q-9 0-12.5 5t-3.5 11q0 12 15 34.5t15 51.5q0 50-27.5 74T480-80Zm-177-383q17-17 17-43t-17-43q-17-17-43-17t-43 17q-17 17-17 43t17 43q17 17 43 17t43-17Zm120-160q17-17 17-43t-17-43q-17-17-43-17t-43 17q-17 17-17 43t17 43q17 17 43 17t43-17Zm200 0q17-17 17-43t-17-43q-17-17-43-17t-43 17q-17 17-17 43t17 43q17 17 43 17t43-17Zm120 160q17-17 17-43t-17-43q-17-17-43-17t-43 17q-17 17-17 43t17 43q17 17 43 17t43-17ZM480-160q9 0 14.5-5t5.5-13q0-14-15-33t-15-57q0-42 29-67t71-25h70q66 0 113-38.5T800-518q0-121-92.5-201.5T488-800q-136 0-232 93t-96 227q0 133 93.5 226.5T480-160Z",
      trash:      "M200-120v-600h-40v-80h200v-40h240v40h200v80h-40v600H200Zm80-80h400v-520H280v520Zm80-80h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z",
      undo:       "M280-200v-80h284q63 0 109.5-40T720-420q0-60-46.5-100T564-560H312l104 104-56 56-200-200 200-200 56 56-104 104h252q97 0 166.5 63T800-420q0 94-69.5 157T564-200H280Z",
      redo:       "M396-200q-97 0-166.5-63T160-420q0-94 69.5-157T396-640h252L544-744l56-56 200 200-200 200-56-56 104-104H396q-63 0-109.5 40T240-420q0 60 46.5 100T396-280h284v80H396Z",
      lock:       "M160-80v-560h120v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h120v560H160Zm80-80h480v-400H240v400Zm296.5-143.5Q560-327 560-360t-23.5-56.5Q513-440 480-440t-56.5 23.5Q400-393 400-360t23.5 56.5Q447-280 480-280t56.5-23.5ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80ZM240-160v-400 400Z",
      measure:    "M80-240v-480h800v480H80Zm80-80h640v-320H680v160h-80v-160h-80v160h-80v-160h-80v160h-80v-160H160v320Z",
      play:       "M320-200v-560l440 280-440 280Z",
      pause:      "M560-200v-560h160v560H560Zm-280 0v-560h160v560H280Z",
      skipBack:   "M220-240v-480h80v480h-80Zm520 0L380-480l360-240v480Zm-80-240Zm0 90v-180l-136 90 136 90Z",
      skipFwd:    "M660-240v-480h80v480h-80Zm-440 0v-480l360 240-360 240Zm80-240Zm0 90 136-90-136-90v180Z",
      stepBack:   "M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z",
      stepFwd:    "M240-200v-560l400 280-400 280ZM700-200v-560h100v560H700Z",
      settings:   "m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z",
      plus:       "M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z",
      minus:      "M200-440v-80h560v80H200Z",
      x:          "m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z",
      check:      "M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z",
      chevDown:   "M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z",
      chevRight:  "M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z",
      user:       "M367-527q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm296.5-343.5Q560-607 560-640t-23.5-56.5Q513-720 480-720t-56.5 23.5Q400-673 400-640t23.5 56.5Q447-560 480-560t56.5-23.5ZM480-640Zm0 400Z",
      tree:       "M600-120v-120H440v-400h-80v120H80v-320h280v120h240v-120h280v320H600v-120h-80v320h80v-120h280v320H600ZM160-760v160-160Zm520 400v160-160Zm0-400v160-160Zm0 160h120v-160H680v160Zm0 400h120v-160H680v160ZM160-600h120v-160H160v160Z",
      news:       "M80-200v-520h800v520ZM160-640v360h540v-360ZM755-580v40h50v-40ZM755-480v40h50v-40ZM755-380v40h50v-40ZM430-720L310-960L370-960L490-720ZM490-720L590-960L650-960L570-720Z",
      config:     "M440-120v-240h80v80h320v80H520v80h-80Zm-320-80v-80h240v80H120Zm160-160v-80H120v-80h160v-80h80v240h-80Zm160-80v-80h400v80H440Zm160-160v-240h80v80h160v80H680v80h-80Zm-480-80v-80h400v80H120Z",
      goto:       "M200-120v-680h360l16 80h224v400H520l-16-80H280v280h-80Zm80-360h290l16 80h134v-240H510l-16-80H280v240Zm0 0Z",
      rollback:   "M480-120q-138 0-240.5-91.5T122-440h82q14 104 92.5 172T480-200q117 0 198.5-81.5T760-480q0-117-81.5-198.5T480-760q-69 0-129 32t-101 88h110v80H120v-240h80v94q51-64 124.5-99T480-840q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-480q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-120Zm112-192L440-464v-216h80v184l128 128-56 56Z",
      scissors:   "M760-120 480-400l-94 94q8 15 11 32t3 34q0 66-47 113T240-80q-66 0-113-47T80-240q0-66 47-113t113-47q17 0 34 3t32 11l94-94-94-94q-15 8-32 11t-34 3q-66 0-113-47T80-720q0-66 47-113t113-47q66 0 113 47t47 113q0 17-3 34t-11 32l494 494v40H760ZM296.5-183.5Q320-207 320-240t-23.5-56.5Q273-320 240-320t-56.5 23.5Q160-273 160-240t23.5 56.5Q207-160 240-160t56.5-23.5ZM296.5-663.5Q320-687 320-720t-23.5-56.5Q273-800 240-800t-56.5 23.5Q160-753 160-720t23.5 56.5Q207-640 240-640t56.5-23.5ZM386-654 880-160 786-66 292-560Z",
      candle:     "M240-800h80v80h60v400h-60v100h-80v-100h-60v-400h60v-80ZM640-700h80v80h60v400h-60v100h-80v-100h-60v-400h60v-80Z",
      heikinAshi: "M180-840h200v420h-60v300h-80v-300h-60v-420ZM580-760h200v420h-60v300h-80v-300h-60v-420Z",
      expand:     "M120-120v-240h80v160h160v80H120ZM840-840v240h-80v-160H600v-80h240Z",
      compress:   "M120-840v240h80v-160h160v-80H120ZM840-120v-240h-80v160H600v80h240Z",
      bell:       "M160-200v-80h80v-280q0-83 50-147.5T420-792v-88h120v88q80 20 130 84.5T720-560v280h80v80H160Zm320-300Zm0 420q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80ZM320-280h320v-280q0-66-47-113t-113-47q-66 0-113 47t-47 113v280Z",
      link:       "M440-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h160v80H280q-50 0-85 35t-35 85q0 50 35 85t85 35h160v80ZM320-440v-80h320v80H320Zm200 160v-80h160q50 0 85-35t35-85q0-50-35-85t-85-35H520v-80h160q83 0 141.5 58.5T880-480q0 83-58.5 141.5T680-280H520Z",
      layout:     "M520-600v-240h320v240H520ZM120-440v-400h320v400H120Zm400 320v-400h320v400H520Zm-400 0v-240h320v240H120Zm80-400h160v-240H200v240Zm400 320h160v-240H600v240Zm0-480h160v-80H600v80ZM200-200h160v-80H200v80Z",
      screenshot: "M480-260q75 0 127.5-52.5T660-440q0-75-52.5-127.5T480-620q-75 0-127.5 52.5T300-440q0 75 52.5 127.5T480-260Zm0-80q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM80-120v-640h206l74-80h240l74 80h206v640H80Zm80-80h640v-480H638l-73-80H395l-73 80H160v480Zm320-240Z",
      help:       "M513.5-254.5Q528-269 528-290t-14.5-35.5Q499-340 478-340t-35.5 14.5Q428-311 428-290t14.5 35.5Q457-240 478-240t35.5-14.5ZM442-394h74q0-33 7.5-52t42.5-52q26-26 41-49.5t15-56.5q0-56-41-86t-97-30q-57 0-92.5 30T342-618l66 26q5-18 22.5-39t53.5-21q32 0 48 17.5t16 38.5q0 20-12 37.5T506-526q-44 39-54 59t-10 73Zm38 314q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z",
      bars:       "M640-160v-280h160v280H640Zm-240 0v-640h160v640H400Zm-240 0v-440h160v440H160Z",
      lineChart:  "m140-220-60-60 300-300 160 160 284-320 56 56-340 384-160-160-240 240Z",
      area:       "M120-160v-520l160 120 200-280 200 160h160v520H120Zm200-120 160-220 280 218v-318H652L496-725 298-447l-98-73v144l120 96Z",
      search:     "M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z",
      edit:       "M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l585-583 167 171-582 582H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z",
      filter:     "M400-240v-80h160v80H400ZM240-440v-80h480v80H240ZM120-640v-80h720v80H120Z",
    };
    const d = P[n];
    return d ? F(d) : null;
  };

  // Button component
  const B = ({ children, onClick, primary, small, hk, sx = {} }) => {
    const isH = hk ? swHov === hk : false;
    const isP = hk ? swHov === hk + "_dn" : false;
    return (
      <button
        onClick={onClick}
        onMouseEnter={hk ? () => setSwHov(hk) : undefined}
        onMouseLeave={hk ? () => setSwHov(null) : undefined}
        onMouseDown={hk ? () => setSwHov(hk + "_dn") : undefined}
        onMouseUp={hk ? () => setSwHov(hk) : undefined}
        style={{
          padding: small ? "0 10px" : "0 14px",
          height: small ? 24 : 30,
          minWidth: small ? undefined : 64,
          display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
          background: primary
            ? isP ? c.ac : isH ? `linear-gradient(135deg,${c.acL},#6A8AFF)` : `linear-gradient(135deg,${c.ac},${c.acL})`
            : isP ? "rgba(140,160,255,0.10)" : isH ? "rgba(140,160,255,0.06)" : c.hv2,
          border: `1px solid ${primary
            ? isH || isP ? c.acL : "rgba(74,106,255,0.5)"
            : isH || isP ? "rgba(140,160,255,0.4)" : "rgba(140,160,255,0.22)"}`,
          color: primary ? "#fff" : isH || isP ? c.tx : c.ts,
          fontSize: small ? 10 : 12,
          fontWeight: primary ? 700 : 600,
          fontFamily: F,
          cursor: "default",
          boxShadow: primary
            ? isH ? `0 2px 14px rgba(38,67,247,0.5)` : `0 2px 8px rgba(38,67,247,0.25)`
            : isH ? "0 0 0 1px rgba(140,160,255,0.08)" : "none",
          transform: isP ? "scale(0.96)" : "scale(1)",
          transition: "background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, transform 0.08s ease",
          WebkitFontSmoothing: "antialiased",
          letterSpacing: "0.02em",
          ...sx
        }}
      >{children}</button>
    );
  };

  const Sel = ({ children, w }) => (
    <select style={{ background: c.well, border: `1px solid ${c.br}`, color: c.tx, padding: "3px 6px", fontSize: 11, fontFamily: F, outline: "none", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)", width: w }}>{children}</select>
  );

  const MiniIn = ({ val, w = 36, pre }) => (
    <div style={{ display: "inline-flex", alignItems: "center", background: c.hv, border: "1px solid rgba(140,160,255,0.22)", padding: "2px 4px", width: w, boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)" }}>
      {pre && <span style={{ color: c.ts, fontSize: 10, marginRight: 2 }}>{pre}</span>}
      <span style={{ flex: 1, textAlign: "right", fontSize: 11, fontWeight: 700, fontFamily: F, fontVariantNumeric: "tabular-nums", color: c.tx }}>{val}</span>
    </div>
  );

  // Tool definitions - reorganized by function
  const toolGroups = [
    // Group 1 - Cursor
    [{ id: "crosshair", icon: "crosshair", label: "Cursor", dd: [
      {h:"CURSOR"},{icon:"crosshair",label:"Cross"},{icon:"cursorDot",label:"Dot"},{icon:"cursorArrow",label:"Arrow"},{icon:"eraser",label:"Eraser"}
    ]}],
    // Group 2 - Brushes
    [{ id: "brush2", icon: "draw", label: "Brushes", dd: [
      {h:"BRUSHES"},{icon:"draw",label:"Brush"},{icon:"brush",label:"Highlighter"}
    ]}],
    // Group 3 - Lines
    [{ id: "trendline", icon: "trendline", label: "Lines", dd: [
      {h:"LINES"},{icon:"trendline",label:"Trend Line"},{icon:"hray",label:"Horizontal Ray"},{icon:"hline",label:"Horizontal Line"},{icon:"vline",label:"Vertical Line"},{icon:"ray",label:"Ray"},{icon:"extendedLine",label:"Extended Line"},{icon:"crossLine",label:"Cross Line"},{icon:"polyline",label:"Polyline"},{icon:"pathTool",label:"Path"},{icon:"curve",label:"Curve"},{icon:"doubleCurve",label:"Double Curve"}
    ]}],
    // Group 4 - Shapes
    [{ id: "rect", icon: "rect", label: "Shapes", dd: [
      {h:"SHAPES"},{icon:"triangle",label:"Triangle"},{icon:"rect",label:"Rectangle"},{icon:"arcShape",label:"Arc"},{icon:"ellipse",label:"Ellipse"},{icon:"circle",label:"Circle"},
      {h:"ARROWS"},{icon:"arrowMarker",label:"Arrow Marker"},{icon:"arrowLine",label:"Arrow"},{icon:"arrowUp",label:"Arrow Mark Up"},{icon:"arrowDn",label:"Arrow Mark Down"}
    ]}],
    // Group 5 - Channels & Pitchforks
    [{ id: "channel", icon: "channel", label: "Channels", dd: [
      {h:"CHANNELS"},{icon:"channel",label:"Parallel Channel"},{icon:"regressionCh",label:"Regression Channel"},{icon:"flatChannel",label:"Flat Top/Bottom"},{icon:"disjointCh",label:"Disjoint Channel"},
      {h:"PITCHFORKS"},{icon:"pitchfork",label:"Pitchfork"}
    ]}],
    // Group 6 - Fibonacci & Gann
    [{ id: "fib", icon: "fib", label: "Fibonacci & Gann", dd: [
      {h:"FIBONACCI"},{icon:"fib",label:"Fib Retracement"},{icon:"fibExtension",label:"Trend-Based Fib Extension"},{icon:"fibChannel",label:"Fib Channel"},{icon:"fibTimeZone",label:"Fib Time Zone"},{icon:"fibFan",label:"Fib Speed Resistance Fan"},{icon:"fibTime",label:"Trend-Based Fib Time"},{icon:"fibCircles",label:"Fib Circles"},{icon:"fibSpiral",label:"Fib Spiral"},{icon:"fibArcs",label:"Fib Speed Resistance Arcs"},{icon:"fibWedge",label:"Fib Wedge"},
      {h:"GANN"},{icon:"gannBox",label:"Gann Box"},{icon:"gannSquare",label:"Gann Square Fixed"},{icon:"gannFan",label:"Gann Fan"}
    ]}],
    // Group 7 - Text & Labels
    [{ id: "text", icon: "text", label: "Text & Labels", dd: [
      {h:"TEXT"},{icon:"text",label:"Text"},{icon:"note",label:"Note"},{icon:"priceNote",label:"Price Note"},{icon:"callout",label:"Callout"},{icon:"comment",label:"Comment"},
      {h:"LABELS"},{icon:"pin",label:"Pin"},{icon:"priceLabel",label:"Price Label"},{icon:"signpost",label:"Signpost"},{icon:"flag",label:"Flag Mark"},{icon:"image",label:"Image"},
      {h:"EMOJIS"},{icon:"emoji",label:"Emojis & Stickers"}
    ]}],
    // Group 8 - Patterns & Waves
    [{ id: "pattern", icon: "wave", label: "Patterns & Waves", dd: [
      {h:"ELLIOTT WAVES"},{icon:"elliott5",label:"Elliott Impulse (12345)"},{icon:"elliottABC",label:"Elliott Correction (ABC)"},{icon:"elliottTri",label:"Elliott Triangle (ABCDE)"},{icon:"elliottWXY",label:"Elliott Double Combo (WXY)"},{icon:"elliottWXYXZ",label:"Elliott Triple Combo (WXYXZ)"},
      {h:"PATTERNS"},{icon:"xabcd",label:"XABCD Pattern"},{icon:"headShoulders",label:"Head and Shoulders"},{icon:"abcdPattern",label:"ABCD Pattern"},{icon:"triPattern",label:"Triangle Pattern"},{icon:"threeDrives",label:"Three Drives Pattern"}
    ]}],
    // Group 9 - Projections
    [{ id: "measure", icon: "measure", label: "Projections", dd: [
      {h:"PROJECTIONS"},{icon:"shortPos",label:"Short Position"},{icon:"longPos",label:"Long Position"},{icon:"measure",label:"Range Tool"}
    ]}],
    // Group 10 - Volume Tools
    [{ id: "brush", icon: "bars", label: "Volume Tools", dd: [
      {h:"VOLUME-BASED"},{icon:"vwap",label:"Anchored VWAP"},{icon:"volProfile",label:"Fixed Range Volume Profile"},{icon:"anchoredVol",label:"Anchored Volume Profile"}
    ]}],
    // Group 11 - Utilities
    [
      { id: "eye", icon: "eye", label: "Visibility", dd: [
        {h:"VISIBILITY"},{icon:"eyeAll",label:"Hide Drawings"},{icon:"eyeInd",label:"Hide Indicators"},{icon:"eyePos",label:"Hide Positions"},{icon:"eyeHide",label:"Hide All"}
      ]},
      { id: "magnet", icon: "magnet", label: "Magnet", dd: [
        {h:"MAGNET STRENGTH"},{icon:"magnetOff",label:"Off"},{icon:"magnetWeak",label:"Weak"},{icon:"magnetStrong",label:"Strong"}
      ]},
      { id: "lock", icon: "lock", label: "Lock" },
    ],
  ];
  // Group 11 - Actions
  const actionTools = [
    { id: "trash", icon: "trash", label: "Delete", danger: true, dd: [
      {h:"DELETE"},{icon:"trashDraw",label:"Delete Drawings"},{icon:"trashInd",label:"Delete Indicators"},{icon:"trash",label:"Delete Objects"}
    ]},
    { id: "pinbar", icon: "pin", label: "Pinned Tools" },
    { id: "undo", icon: "undo", label: "Undo", action: true },
    { id: "redo", icon: "redo", label: "Redo", action: true },
  ];

  const priceLabels = ["127.100","127.000","126.900","126.800","126.700","126.600","126.500","126.400","126.300","126.200"];
  const timeLabels = ["16:36","16:46","16:56","17:01","17:06","17:11","17:16","17:21","17:26","17:31","17:36","17:41","17:46","17:51"];
  const priceAxisWidth = Math.max(50, Math.ceil(Math.max(...priceLabels.map(p=>p.length)) * 5.5 + 16));

  const closeWindows = () => { setDropdown(null); setLogoMenu(false); setSettingsOpen(false); setFaqOpen(false); setNewsOpen(false); setLayoutOpen(false); setIndOpen(false); setIndSearch(""); setIndSelected(null); setSDrop(null); setColorPicker(null); setScreenshotOpen(false); setLayersOpen(false); setSettDrop(null); setProfileOpen(false); setClosing(new Set()); };
  const launchSession = () => {
    setLoadQuote(LOAD_QUOTES[Math.floor(Math.random() * LOAD_QUOTES.length)]);
    setTypedQuote("");
    setSessPageFading(true);
    setTimeout(() => { setSessionPage(false); setSessPageFading(false); setLoading(true); navigate('/app'); }, 280);
  };
  const startNewSession = () => {
    const name = newSessName.trim() || `Session ${sessions.length + 1}`;
    const sess = {
      id: Date.now(),
      name,
      symbol: (newSessSymbol.trim() || "NQ").toUpperCase(),
      timeframe: newSessTf,
      startDate: newSessStart,
      endDate: newSessEnd,
      capital: parseFloat(newSessCapital) || 100000,
      createdAt: new Date().toISOString(),
      trades: 0,
      pnl: null,
    };
    const updated = [sess, ...sessions];
    setSessions(updated);
    try { localStorage.setItem("talaria_sessions", JSON.stringify(updated)); } catch {}
    launchSession();
  };
  const saveNewSession = () => {
    const name = newSessName.trim() || `Session ${sessions.length + 1}`;
    if (editSessId) {
      const updated = sessions.map(s => s.id === editSessId ? {
        ...s, name, timeframe: newSessTf, startDate: newSessStart, endDate: newSessEnd,
        capital: parseFloat(newSessCapital) || 100000, tickers: newSessTickers,
        assetClasses: [newSessAssetClass], rollbackAllowed: newSessRollback,
        strategyName: newSessPlaybook, strategyDesc: newSessDescription,
        tradingMode: sessTradingMode, leverage: sessLeverage, riskVal: sessRiskVal,
        riskMode: sessRiskMode, replayMode: sessReplayMode, replaySpeed: sessReplaySpeed,
        commission: newSessTradingCostsEnabled ? (sessCommission || "Per Lot") : "None",
      } : s);
      setSessions(updated);
      try { localStorage.setItem("talaria_sessions", JSON.stringify(updated)); } catch {}
      setEditSessId(null);
      closeNewSess();
    } else {
      const sess = { id: Date.now(), name, symbol: (newSessSymbol.trim() || "NQ").toUpperCase(), timeframe: newSessTf, startDate: newSessStart, endDate: newSessEnd, capital: parseFloat(newSessCapital) || 100000, createdAt: new Date().toISOString(), trades: 0, pnl: null };
      const updated = [sess, ...sessions];
      setSessions(updated);
      try { localStorage.setItem("talaria_sessions", JSON.stringify(updated)); } catch {}
      closeNewSess();
    }
  };
  const deleteSession = (e, id) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    try { localStorage.setItem("talaria_sessions", JSON.stringify(updated)); } catch {}
  };
  const duplicateSession = (e, sess) => {
    e.stopPropagation();
    const copy = { ...sess, id: Date.now(), name: `Copy of ${sess.name}`, progress: 0, trades: 0, pnl: null, winRate: null, avgRR: null, createdAt: new Date().toISOString() };
    const updated = [copy, ...sessions];
    setSessions(updated);
    try { localStorage.setItem("talaria_sessions", JSON.stringify(updated)); } catch {}
  };
  const openEditSession = (e, sess) => {
    e.stopPropagation();
    setEditSessId(sess.id);
    setNewSessName(sess.name || "");
    setNewSessTf(sess.timeframe || "1H");
    setNewSessStart(sess.startDate || "");
    setNewSessEnd(sess.endDate || "");
    setNewSessStartInput(sess.startDate ? sess.startDate.split("T")[0] : "");
    setNewSessEndInput(sess.endDate ? sess.endDate.split("T")[0] : "");
    setNewSessCapital(String(sess.capital || "50000"));
    setNewSessTickers(sess.tickers || []);
    setNewSessAssetClass((sess.assetClasses && sess.assetClasses[0]) || "Forex");
    setNewSessRollback(!!sess.rollbackAllowed);
    setNewSessPlaybook(sess.strategyName || "");
    setNewSessDescription(sess.strategyDesc || "");
    setSessTradingMode(sess.tradingMode || "standard");
    setNewSessTradingCostsEnabled(!!(sess.commission && sess.commission !== "None" && sess.commission !== "none"));
    setSessLeverage(sess.leverage || "1:100");
    setSessRiskVal(sess.riskVal || "1");
    setSessRiskMode(sess.riskMode || "pct");
    setSessReplayMode((sess.replayMode || "candle").toLowerCase());
    setSessReplaySpeed(sess.replaySpeed || 30);
    setNewSessOpen(true);
  };

  // closeAll is triggered by backdrop/outside clicks — intentionally does NOT close the indicators window
  const closeAll = () => {
    setDropdown(null); setSymbolSearch(""); setTfCat(null); setTfUnitOpen(false);
    setSDrop(null); setColorPicker(null); setSettDrop(null);
    setFaqOpen(false); setNewsOpen(false); setLayoutOpen(false); setScreenshotOpen(false); setLayersOpen(false); setProfileOpen(false);
    if(logoMenu) closePopup(setLogoMenu, "logoMenu");
    if(replayOpts) closePopup(setReplayOpts, "replayOpts");
    if(gotoOpen) closePopup(setGotoOpen, "goto");
    if(symbolOpen) closePopup(setSymbolOpen, "symbol");
    if(chartTypeOpen) closePopup(setChartTypeOpen, "chartType");
    if(tfOpen) closePopup(setTfOpen, "tf");
    setTagDrop(null); setTlStyleDrop(null); setTlBarDrop(null); setTxtBarSizeOpen(false); setTxtBarDrop(null); setEmojiPanelOpen(false);
    setOpSymOpen(false); setOpSymSearch(""); setOpSizeOpen(false);
  };

  const showTip = (label, el, side="top") => {
    clearTimeout(tipTimerRef.current);
    if (!label || !el) return;
    tipTimerRef.current = setTimeout(() => {
      const r = el.getBoundingClientRect();
      const Z2 = 1.05;
      const cx = (r.left + r.width/2) / Z2;
      const y = side === "bottom" ? r.bottom/Z2 : r.top/Z2;
      const vw = window.innerWidth / Z2;
      setTipData({ label, x: Math.max(40, Math.min(vw - 40, cx)), y, side });
    }, 250);
  };
  const hideTip = () => { clearTimeout(tipTimerRef.current); setTipData(null); };

  // Render a tool button
  const renderTB = (t, ref) => {
    const activeIcon = (t.dd && (groupSelected[t.id]?.icon || t.dd.find(x=>!x.h)?.icon)) || t.icon;
    const ddOpen = dropdown === t.id;
    const act = t.id === "pinbar" ? pinnedBarOpen : tool === t.id;
    const h = hov === t.id;
    const accentCol = t.id === "pinbar" ? c.gold : c.acL;
    const accentGlow = t.id === "pinbar" ? "rgba(201,168,76,0.4)" : c.acG;
    let col = c.ts;
    if (act) col = accentCol;
    else if (h && t.danger) col = c.rd;
    else if (h) col = c.tx;

    const openDd = (el) => {
      const rect = el.getBoundingClientRect();
      setDdPos({ top: rect.top / Z, left: 38 });
      if(logoMenu)closePopup(setLogoMenu,"logoMenu");if(replayOpts)closePopup(setReplayOpts,"replayOpts");if(gotoOpen)closePopup(setGotoOpen,"goto");if(symbolOpen)closePopup(setSymbolOpen,"symbol");if(chartTypeOpen)closePopup(setChartTypeOpen,"chartType");if(tfOpen)closePopup(setTfOpen,"tf");setTfUnitOpen(false);
      if (dropdown === t.id) { closeDropdown(); } else { setDropdown(t.id); }
    };
    const isPressed = t.action && btnPressed === t.id;
    const pressCol = isPressed ? c.acL : col;
    const hArr = hov === t.id + "-arr";
    const arrCol = act ? accentCol : hArr ? c.tx : c.tm;
    return (
      <div key={t.id} style={{ position: "relative", width: "100%", display: "flex", transform: isPressed ? "scale(0.88)" : "scale(1)", transition: "transform 0.08s ease" }}>
        {/* Icon button — selects the tool only */}
        <button
          ref={ref}
          onPointerDown={t.action ? () => setBtnPressed(t.id) : undefined}
          onPointerUp={t.action ? () => setBtnPressed(null) : undefined}
          onMouseEnter={() => setHov(t.id)}
          onMouseLeave={() => { setHov(null); setBtnPressed(null); }}
          onClick={(e) => {
            e.stopPropagation();
            if (t.id === "pinbar") { setPinnedBarOpen(v => !v); return; }
            if (t.action) return;
            if (t.id === "lock") { setTool(tool === "lock" ? "crosshair" : "lock"); setDropdown(null); return; }
            if (t.dd) { setTool(t.id); if (act) openDd(e.currentTarget.parentElement); else closeDropdown(); }
            else { setTool(t.id); setDropdown(null); }
          }}
          style={{
            width: "100%", height: 32, display: "flex", alignItems: "center", justifyContent: "flex-end",
            background: act ? "rgba(74,106,255,0.08)" : h ? c.hv : "transparent",
            border: "none", cursor: "default", color: pressCol,
            padding: 0, paddingRight: 10,
            transition: "color 0.15s ease, background 0.12s", position: "relative", fontFamily: F,
          }}>
          {t.id === "pinbar"
            ? <span style={{display:"flex",transform:h&&!act?"rotate(-25deg) scale(1.15)":"scale(1)",transition:"transform 0.15s"}}><I n={act?"pinFill":"pin"} s={17} cl={pressCol}/></span>
            : <I n={activeIcon} s={17} cl={pressCol}/>
          }
        </button>
        {act && <div style={{ position: "absolute", left: 3, top: "15%", bottom: "15%", width: 2, background: `linear-gradient(180deg, transparent, ${accentCol}, transparent)`, boxShadow: `0 0 6px ${accentGlow}`, pointerEvents: "none", zIndex: 2 }}/>}
        {h && !act && !isPressed && <div style={{ position: "absolute", left: 3, top: "25%", bottom: "25%", width: 1, background: `linear-gradient(180deg, transparent, `+c.hvLn+`, transparent)`, pointerEvents: "none", zIndex: 2 }}/>}
        {isPressed && <div style={{ position: "absolute", left: 3, top: "15%", bottom: "15%", width: 2, background: `linear-gradient(180deg, transparent, ${c.acL}, transparent)`, boxShadow: `0 0 6px ${c.acG}`, pointerEvents: "none", zIndex: 2 }}/>}
        {/* Arrow button — opens dropdown independently */}
        {t.dd && <button
          onMouseEnter={() => setHov(t.id + "-arr")}
          onMouseLeave={() => setHov(null)}
          onClick={(e) => {
            e.stopPropagation();
            setTool(t.id);
            openDd(e.currentTarget.parentElement);
          }}
          style={{
            position: "absolute", right: 0, top: 0,
            width: 8, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            background: hArr ? "rgba(255,255,255,0.06)" : "transparent",
            border: "none", cursor: "default",
            padding: 0, flexShrink: 0,
            transition: "background 0.12s", fontFamily: F,
          }}>
          <svg width={5} height={5} viewBox="320 -720 296 480" preserveAspectRatio="xMaxYMid meet" fill={arrCol} style={{transition:"fill 0.12s"}}>
            <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/>
          </svg>
        </button>}
        {h && !ddOpen && !t.dd && <div style={{ position: "absolute", left: "calc(100% + 10px)", top: "50%", transform: "translateY(-50%)", background: c.el, border: `1px solid ${c.brH}`, padding: "4px 10px", fontSize: 12, fontWeight: 600, fontFamily: F, color: c.tx, whiteSpace: "nowrap", zIndex: 100, boxShadow: "0 4px 16px rgba(0,0,0,0.6)", borderLeft: `2px solid ${act ? accentCol : c.brH}` }}>{t.label}</div>}
      </div>
    );
  };

  // Get dropdown items for current open dropdown
  const getDdItems = () => {
    const allTools = [...toolGroups.flat(), ...actionTools];
    const t = allTools.find(x => x.id === dropdown);
    if (!t || !t.dd) return null;
    if (Array.isArray(t.dd)) return t.dd;
    return [{h: t.label.toUpperCase()}, { icon: t.icon, label: t.label }];
  };

  const ddItems = getDdItems();


  const navigateToView = (view) => { setSessView(view); navigate(viewToPath[view] ?? '/'); };

  const ctx = { navigate, loading, setLoading, loadFading, setLoadFading, loadPhase, setLoadPhase, loadDots, setLoadDots, loadQuote, setLoadQuote, typedQuote, setTypedQuote, sessionPage, setSessionPage, sessPageFading, setSessPageFading, sessions, setSessions, newSessName, setNewSessName, newSessSymbol, setNewSessSymbol, newSessTf, setNewSessTf, newSessStart, setNewSessStart, newSessEnd, setNewSessEnd, newSessCapital, setNewSessCapital, sessHov, setSessHov, stratPopup, setStratPopup, symPopup, setSymPopup, sessView, setSessView, dashSessId, setDashSessId, dashHov, setDashHov, sessSelected, setSessSelected, sessSearchQ, setSessSearchQ, sessFilter, setSessFilter, sessActMenu, setSessActMenu, sessSortBy, setSessSortBy, sessSortDir, setSessSortDir, sessSortOpen, setSessSortOpen, sessSearchOpen, setSessSearchOpen, sessLayoutMode, setSessLayoutMode, cardSortOpen, setCardSortOpen, newSessCurrency, setNewSessCurrency, sessDateMode, setSessDateMode, sessNBars, setSessNBars, sessQuickDate, setSessQuickDate, sessRiskMode, setSessRiskMode, sessRiskVal, setSessRiskVal, sessLeverage, setSessLeverage, sessCommission, setSessCommission, sessCommissionVal, setSessCommissionVal, sessSlippage, setSessSlippage, sessTradingMode, setSessTradingMode, sessPropCat, setSessPropCat, sessPropFirm, setSessPropFirm, sessNumPhases, setSessNumPhases, sessChallengeType, setSessChallengeType, sessP1DailyLossPct, setSessP1DailyLossPct, sessP1TotalDDPct, setSessP1TotalDDPct, sessP1ProfitTargetPct, setSessP1ProfitTargetPct, sessP1MinDays, setSessP1MinDays, sessP1MinDaysEnabled, setSessP1MinDaysEnabled, sessP2DailyLossPct, setSessP2DailyLossPct, sessP2TotalDDPct, setSessP2TotalDDPct, sessP2ProfitTargetPct, setSessP2ProfitTargetPct, sessP2MinDays, setSessP2MinDays, sessP2MinDaysEnabled, setSessP2MinDaysEnabled, sessMaxLotSize, setSessMaxLotSize, sessMaxPosUnit, setSessMaxPosUnit, sessMaxPosEnabled, setSessMaxPosEnabled, sessConsistencyRule, setSessConsistencyRule, sessConsistencyPct, setSessConsistencyPct, sessWeekendHold, setSessWeekendHold, sessTrailingDrawdown, setSessTrailingDrawdown, sessDailyLossEnabled, setSessDailyLossEnabled, sessFutMinDays, setSessFutMinDays, sessFutMinDaysEnabled, setSessFutMinDaysEnabled, sessP1DailyLossAmt, setSessP1DailyLossAmt, sessP1MaxDDAmt, setSessP1MaxDDAmt, sessP1ProfitTargetAmt, setSessP1ProfitTargetAmt, sessP2DailyLossAmt, setSessP2DailyLossAmt, sessP2MaxDDAmt, setSessP2MaxDDAmt, sessP2ProfitTargetAmt, setSessP2ProfitTargetAmt, sessMaxContracts, setSessMaxContracts, sessMaxContractsEnabled, setSessMaxContractsEnabled, sessReplaySpeed, setSessReplaySpeed, sessReplayMode, setSessReplayMode, newSessTimezone, setNewSessTimezone, newSessDST, setNewSessDST, newSessDescription, setNewSessDescription, newSessPlaybook, setNewSessPlaybook, newSessFiles, setNewSessFiles, newSessMarginCall, setNewSessMarginCall, newSessStopOut, setNewSessStopOut, newSessMaxRisk, setNewSessMaxRisk, newSessProtect, setNewSessProtect, newSessNavEnabled, setNewSessNavEnabled, newSessFilePickerOpen, setNewSessFilePickerOpen, newSessOpen, setNewSessOpen, editSessId, setEditSessId, newSessTickers, setNewSessTickers, newSessTickerInput, setNewSessTickerInput, newSessTickerFocus, setNewSessTickerFocus, newSessAssetClass, setNewSessAssetClass, newSessAdvancedOrder, setNewSessAdvancedOrder, newSessRollback, setNewSessRollback, newSessTradingStyle, setNewSessTradingStyle, newSessStratDropOpen, setNewSessStratDropOpen, newSessStratHov, setNewSessStratHov, newSessSymDropOpen, setNewSessSymDropOpen, newSessAssetDropOpen, setNewSessAssetDropOpen, newSessAssetHov, setNewSessAssetHov, newSessMarketOpen, setNewSessMarketOpen, newSessSupportTickers, setNewSessSupportTickers, newSessSupportAssetClass, setNewSessSupportAssetClass, newSessSupportInput, setNewSessSupportInput, newSessSupportFocus, setNewSessSupportFocus, newSessSupportDropOpen, setNewSessSupportDropOpen, newSessInfoHov, setNewSessInfoHov, newSessSupportEnabled, setNewSessSupportEnabled, newSessCalOpen, setNewSessCalOpen, newSessCalTarget, setNewSessCalTarget, newSessCalPos, setNewSessCalPos, newSessCalViewY, setNewSessCalViewY, newSessCalViewM, setNewSessCalViewM, newSessCalMode, setNewSessCalMode, newSessCalYearBase, setNewSessCalYearBase, newSessStartInput, setNewSessStartInput, newSessEndInput, setNewSessEndInput, newSessRandomCount, setNewSessRandomCount, newSessRandRangeVal, setNewSessRandRangeVal, newSessRandRangeUnit, setNewSessRandRangeUnit, newSessActivePreset, setNewSessActivePreset, newSessSymPickerOpen, setNewSessSymPickerOpen, newSessSymPickerSearch, setNewSessSymPickerSearch, newSessSymPickerPos, setNewSessSymPickerPos, newSessSupPickerOpen, setNewSessSupPickerOpen, newSessSupPickerSearch, setNewSessSupPickerSearch, newSessSupPickerPos, setNewSessSupPickerPos, newSessSupPickerCat, setNewSessSupPickerCat, newSessTradingCostsEnabled, setNewSessTradingCostsEnabled, newSessCosts, setNewSessCosts, newSessSymbolSpreads, setNewSessSymbolSpreads, newSessFuturesData, setNewSessFuturesData, stratTab, setStratTab, stratSearch, setStratSearch, stratSort, setStratSort, stratSortDir, setStratSortDir, stratStyleFilter, setStratStyleFilter, stratBuilderOpen, setStratBuilderOpen, stratEditId, setStratEditId, savedCommunityIds, setSavedCommunityIds, myStrategies, setMyStrategies, stratBName, setStratBName, stratBStyle, setStratBStyle, stratBDesc, setStratBDesc, stratBInstruments, setStratBInstruments, stratBInstInput, setStratBInstInput, stratBTimeframes, setStratBTimeframes, stratBTagInput, setStratBTagInput, stratBTags, setStratBTags, stratBComplexity, setStratBComplexity, stratCardHov, setStratCardHov, tool, setTool, hov, setHov, btnPressed, setBtnPressed, dropdown, setDropdown, ddAnchor, setDdAnchor, toolPinned, setToolPinned, dialog, setDialog, dlgTab, setDlgTab, tickCandle, setTickCandle, playing, setPlaying, speed, setSpeed, buySell, setBuySell, orderType, setOrderType, btmTab, setBtmTab, btmIndPos, setBtmIndPos, tblSort, setTblSort, btmTabBarRef, tradeCard, setTradeCard, tradeCardPreTags, setTradeCardPreTags, tradeCardPostTags, setTradeCardPostTags, tradeCardNotes, setTradeCardNotes, tradeActPopup, setTradeActPopup, tapJournal, setTapJournal, tapStrategy, setTapStrategy, tapTags, setTapTags, tapScreenshots, setTapScreenshots, viewingScreenshot, setViewingScreenshot, tapFileSlot, setTapFileSlot, tapTagInput, setTapTagInput, tradeTagOverrides, setTradeTagOverrides, tagEditInput, setTagEditInput, selRow, setSelRow, tagDrop, setTagDrop, tagDropPos, setTagDropPos, btmOpen, setBtmOpen, btmHeight, setBtmHeight, btmResizing, setBtmResizing, btmDragRef, btmPanelRef, tf, setTf, sizeMode, setSizeMode, riskVal, setRiskVal, riskBasis, setRiskBasis, slEnabled, setSlEnabled, entryRows, setEntryRows, entryScrollRef, slPrice, setSlPrice, slRows, setSlRows, slScrollRef, tpRows, setTpRows, tpScrollRef, tagDefs, postTagDefs, tagSels, setTagSels, tagDropOpen, setTagDropOpen, tagsOpen, setTagsOpen, notesText, setNotesText, notesOpen, setNotesOpen, tradeNotes, setTradeNotes, tradeScreenshots, setTradeScreenshots, screenshots, setScreenshots, ssOpen, setSsOpen, replaceTargetId, setReplaceTargetId, fileInputRef, replaceInputRef, tipTimerRef, tipData, setTipData, panelRef, tapFileRef, tcFileRef, tcSsSlot, setTcSsSlot, accountBalance, accountEquity, slAdvMode, setSlAdvMode, slAdvDrop, setSlAdvDrop, slBeUnit, setSlBeUnit, slBeUnitDrop, setSlBeUnitDrop, slBeTrigger, setSlBeTrigger, slBeOffset, setSlBeOffset, slTslUnit, setSlTslUnit, slTslUnitDrop, setSlTslUnitDrop, slTslActivation, setSlTslActivation, slTslTrail, setSlTslTrail, slTslStep, setSlTslStep, logoMenu, setLogoMenu, replayOpts, setReplayOpts, replayMode, setReplayMode, replayInterval, setReplayInterval, rollback, setRollback, rollbackLineX, setRollbackLineX, rbDragging, setRbDragging, rbPressed, setRbPressed, rbPressTimer, gotoOpen, setGotoOpen, gotoItems, setGotoItems, gotoAddType, setGotoAddType, gotoTab, setGotoTab, gotoNewDate, setGotoNewDate, gotoNewTime, setGotoNewTime, gotoNewRepeat, setGotoNewRepeat, gotoNewPrice, setGotoNewPrice, gotoNewName, setGotoNewName, gotoNewColor, setGotoNewColor, gotoCalOpen, setGotoCalOpen, gotoCalPos, setGotoCalPos, gotoTimeOpen, setGotoTimeOpen, gotoTimePos, setGotoTimePos, gotoCalViewY, setGotoCalViewY, gotoCalViewM, setGotoCalViewM, gotoCalMode, setGotoCalMode, gotoCalYearBase, setGotoCalYearBase, gotoDateInput, setGotoDateInput, gotoTimeInput, setGotoTimeInput, gotoPresets, setGotoPresets, ddPos, setDdPos, symbolOpen, setSymbolOpen, symbol, setSymbol, symbolSearch, setSymbolSearch, chartTypeOpen, setChartTypeOpen, chartType, setChartType, chartTypeDropL, setChartTypeDropL, tfOpen, setTfOpen, tfCat, setTfCat, tfPinned, setTfPinned, tfCustomVal, setTfCustomVal, tfEditMode, setTfEditMode, tfDefaults, tfCustomItems, setTfCustomItems, tfSortItems, tfCategories, tfCustomUnit, setTfCustomUnit, tfUnitOpen, setTfUnitOpen, tfIndPos, setTfIndPos, tfBarRef, chartCanvasRef, rollbackLineRef, rollbackOverlayRef, tlBarRef, tlBarDropRef, pinnedBarRef, cpBarAnchorRef, closingDropdownKey, canvasDims, setCanvasDims, settingsOpen, setSettingsOpen, profileOpen, setProfileOpen, profileTab, setProfileTab, profileLang, setProfileLang, profileCat, setProfileCat, profilePos, setProfilePos, profileName, setProfileName, profileAvatar, setProfileAvatar, profileNameEdit, setProfileNameEdit, profilePwOpen, setProfilePwOpen, profileCurPw, setProfileCurPw, profileNewPw, setProfileNewPw, profileConfirmPw, setProfileConfirmPw, darkMode, setDarkMode, faqOpen, setFaqOpen, faqCat, setFaqCat, faqPos, setFaqPos, emojiPanelOpen, setEmojiPanelOpen, emojiPanelPos, setEmojiPanelPos, emojiCat, setEmojiCat, emojiSearch, setEmojiSearch, faqExpand, setFaqExpand, screenshotOpen, setScreenshotOpen, scLinkOpen, setScLinkOpen, scLinkSearch, setScLinkSearch, scLinkedTrade, setScLinkedTrade, scLinkPhase, setScLinkPhase, isFullscreen, setIsFullscreen, pinnedBarOpen, setPinnedBarOpen, pinnedBarPos, setPinnedBarPos, groupSelected, setGroupSelected, tlBarPos, setTlBarPos, tlSettOpen, setTlSettOpen, tlSettPos, setTlSettPos, tlName, setTlName, tlNameEditing, setTlNameEditing, tlSettTab, setTlSettTab, tlLocked, setTlLocked, rrStyle, setRrStyle, rrInputs, setRrInputs, vwapLocked, setVwapLocked, vpLocked, setVpLocked, avLocked, setAvLocked, txtLocked, setTxtLocked, tlStyleDrop, setTlStyleDrop, tlInfoDropUp, setTlInfoDropUp, tlInfoDropAnchor, setTlInfoDropAnchor, tlStyleDropUp, setTlStyleDropUp, tlBarDrop, setTlBarDrop, tlTemplates, setTlTemplates, tlBarDropAnchor, setTlBarDropAnchor, tlLastBarDropRef, tlSaveAsMode, setTlSaveAsMode, tlNewTplName, setTlNewTplName, tlSettTplDrop, setTlSettTplDrop, tlStyle, setTlStyle, txtSettOpen, setTxtSettOpen, txtSettPos, setTxtSettPos, txtSettTab, setTxtSettTab, txtName, setTxtName, txtNameEditing, setTxtNameEditing, txtSizeOpen, setTxtSizeOpen, txtBarSizeOpen, setTxtBarSizeOpen, txtBarDrop, setTxtBarDrop, txtTemplates, setTxtTemplates, txtSaveAsMode, setTxtSaveAsMode, txtNewTplName, setTxtNewTplName, txtStyle, setTxtStyle, vwapSettOpen, setVwapSettOpen, vwapSettPos, setVwapSettPos, vwapSettTab, setVwapSettTab, vwapStyleDrop, setVwapStyleDrop, vwapBarPos, setVwapBarPos, vwapBarDrop, setVwapBarDrop, vwapStyle, setVwapStyle, vpSettOpen, setVpSettOpen, vpSettPos, setVpSettPos, vpSettTab, setVpSettTab, vpStyleDrop, setVpStyleDrop, vpBarPos, setVpBarPos, vpBarDrop, setVpBarDrop, vpStyle, setVpStyle, avSettOpen, setAvSettOpen, avSettPos, setAvSettPos, avSettTab, setAvSettTab, avStyleDrop, setAvStyleDrop, avBarPos, setAvBarPos, avBarDrop, setAvBarDrop, avStyle, setAvStyle, screenshotFlash, setScreenshotFlash, orderPanelOpen, setOrderPanelOpen, opSymOpen, setOpSymOpen, opSymSearch, setOpSymSearch, opSymPos, setOpSymPos, opSizeOpen, setOpSizeOpen, opSizePos, setOpSizePos, opTplOpen, setOpTplOpen, opTplPos, setOpTplPos, activeTemplate, setActiveTemplate, opSaveAsMode, setOpSaveAsMode, opNewTplName, setOpNewTplName, opSavedTemplates, setOpSavedTemplates, opDotsOpen, setOpDotsOpen, opDotsPos, setOpDotsPos, panelDetached, setPanelDetached, detachPos, setDetachPos, detachSize, setDetachSize, panelMode, setPanelMode, isWide, opTemplates, rightPanel, setRightPanel, screenshotPos, setScreenshotPos, layersOpen, setLayersOpen, layersPos, setLayersPos, layersCat, setLayersCat, layersItems, setLayersItems, layersVis, setLayersVis, layersSearch, setLayersSearch, newsOpen, setNewsOpen, newsPos, setNewsPos, newsTab, setNewsTab, newsSearch, setNewsSearch, newsImpact, setNewsImpact, newsSymbolOnly, setNewsSymbolOnly, newsFilterOpen, setNewsFilterOpen, newsFilterClosing, setNewsFilterClosing, newsCntSel, setNewsCntSel, layoutOpen, setLayoutOpen, layoutPos, setLayoutPos, layoutPanels, setLayoutPanels, layoutSync, setLayoutSync, layoutTab, setLayoutTab, settingsTab, setSettingsTab, balVis, setBalVis, sDrop, setSDrop, colorPicker, setColorPicker, cpPos, setCpPos, swHov, setSwHov, settDrop, setSettDrop, settDropPos, setSettDropPos, customTemplates, setCustomTemplates, tplNameInput, setTplNameInput, settHdrTplDrop, setSettHdrTplDrop, settHdrSaveAs, setSettHdrSaveAs, settHdrTplName, setSettHdrTplName, cpH, setCpH, cpS, setCpS, cpV, setCpV, cpA, setCpA, cpHex, setCpHex, cpDragging, setCpDragging, cpDragRect, setCpDragRect, settings, setSettings, indOpen, setIndOpen, indPinned, setIndPinned, indActive, setIndActive, indSelected, setIndSelected, indSearch, setIndSearch, indPos, setIndPos, indCat, setIndCat, indTplOpen, setIndTplOpen, indTplSaveMode, setIndTplSaveMode, indTplName, setIndTplName, indTemplates, setIndTemplates, dragging, setDragging, settingsPos, setSettingsPos, closing, setClosing, animClose, closePopup, closeTlBarDrop, closeTlSett, closeTxtSett, closeVwapSett, closeVpSett, closeAvSett, closeDropdown, closeFontSizeDrop, closeTlInfoDrop, closeTlSettTplDrop, closeCP, c, chromeBr, F, allSymbols, currentSymbol, chartTypeMap, currentChartType, gotoNextId, tlSubTool, tlSubToolRef, txtSubTool, txtSubToolRef, isFibTool, isGannTool, isElliottTool, isPatternTool, isRRTool, rollbackOverlayCallbackRef, catColors, tplWatchKeys, updateSetting, defaultTemplateMap, applyTemplate, saveCustomTemplate, Chk, TlChk, Z, cpW, CP_H, posFromRect, sdPos, openCP, openGotoCP, cpApply, indicatorData, indFiltered, I, B, Sel, MiniIn, toolGroups, actionTools, priceLabels, timeLabels, priceAxisWidth, closeWindows, launchSession, startNewSession, saveNewSession, deleteSession, duplicateSession, openEditSession, closeAll, showTip, hideTip, renderTB, getDdItems, ddItems };

  ctx.setSessView = navigateToView;

  return (
    <div style={{ width: "100%", height: "calc(100dvh / 1.05)", background: c.bg, fontFamily: F, color: c.tx, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", zoom: 1.05, animation: isFullscreen ? "tlrFullscreenIn 0.3s ease forwards" : undefined }}
      onClick={closeAll}>
      <style>{`
        @keyframes tlrWinIn  { from { opacity:0; transform:translate(-50%,-50%) scale(0.97) translateY(7px); } to { opacity:1; transform:translate(-50%,-50%) scale(1) translateY(0); } }
        @keyframes tlrWinOut { from { opacity:1; transform:translate(-50%,-50%) scale(1) translateY(0); } to { opacity:0; transform:translate(-50%,-50%) scale(0.97) translateY(7px); } }
        @keyframes tlrDropIn  { from { opacity:0; transform:translateY(-6px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes tlrDropOut { from { opacity:1; transform:translateY(0) scale(1); } to { opacity:0; transform:translateY(-6px) scale(0.98); } }
        @keyframes tlrPopIn    { from { opacity:0; transform:scale(0.97) translateY(4px); } to { opacity:1; transform:scale(1) translateY(0); } }
        @keyframes tlrPopOut   { from { opacity:1; transform:scale(1) translateY(0); } to { opacity:0; transform:scale(0.96) translateY(4px); } }
        @keyframes tlrLinePulse { 0%,100% { opacity:0.25; box-shadow:0 0 3px rgba(0,212,161,0.2); } 50% { opacity:1; box-shadow:0 0 10px rgba(0,212,161,0.7); } }
        @keyframes tlrBlink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        @keyframes tlrFullscreenIn { from { opacity:0.6; transform:scale(1.015); } to { opacity:1; transform:scale(1); } }
        @keyframes tlrFlash { 0%{opacity:0.82} 60%{opacity:0.55} 100%{opacity:0} }
        @keyframes tlrPanelIn { from{opacity:0;transform:translateX(8px)} to{opacity:1;transform:translateX(0)} }
        @keyframes tlrDotPulse { 0%,100% { opacity:0.35; transform:scale(0.85); } 50% { opacity:1; transform:scale(1.3); } }
        @keyframes tlrIdPulse { 0%,100% { color:rgba(0,212,161,0.55); } 50% { color:rgba(0,212,161,1); } }
        @keyframes tlrLoadPulse { 0%,100%{opacity:0.75} 50%{opacity:1} }
        @keyframes tlrLoadRotate { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes tlrLoadBar { from{width:0%} to{width:100%} }
        @keyframes tlrTypeCursor { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes tlrLoadDots { 0%,100%{opacity:0.4} 50%{opacity:1} }
        @keyframes tlrLoadFadeIn { from{opacity:0;transform:scale(1.03)} to{opacity:1;transform:scale(1)} }
        @keyframes tlrGlowPulse { 0%,100%{opacity:0.55;transform:translate(-50%,-50%) scale(1)} 50%{opacity:1;transform:translate(-50%,-50%) scale(1.12)} }
        @keyframes tlrStarTwinkle { 0%,100%{opacity:0.15;transform:scale(0.85)} 50%{opacity:1;transform:scale(1.3)} }
        @keyframes tlrStarDrift { 0%{transform:translateY(0px)} 100%{transform:translateY(-4px)} }
        .tlr-gloss{position:relative}.tlr-gloss::after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,rgba(255,255,255,0.13) 0%,rgba(255,255,255,0.04) 45%,transparent 100%);pointer-events:none;z-index:9999;border-radius:inherit}.tlr-nospinner::-webkit-outer-spin-button,.tlr-nospinner::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
        .tlr-nospinner{-moz-appearance:textfield}
        .tlr-unit-sel{background:transparent;border:1px solid rgba(140,160,255,0.2);color:rgba(255,255,255,0.7);font-size:10px;padding:2px 4px;outline:none;cursor:default;appearance:none;-webkit-appearance:none}
        .tc-pill{padding:1px 7px;font-size:9px;cursor:default;transition:color 0.1s,background 0.1s;border:1px solid var(--tc-br)}
        .tc-pill:not(.tc-pill-act):hover{color:var(--tc-hov)!important;border-color:rgba(140,160,255,0.45)!important}
        .tc-opt{padding:1px 6px;font-size:9px;cursor:default;transition:color 0.1s,background 0.1s;border:1px solid var(--tc-br)}
        .tc-opt:not(.tc-opt-act):hover{color:var(--tc-hov)!important;border-color:rgba(140,160,255,0.45)!important}
        .tc-x:hover{background:rgba(255,80,80,0.07)!important}.tc-x:hover svg path{fill:var(--rd)!important}
        .tc-cancel:hover{color:var(--tc-hov)!important}.tc-cancel:hover .tc-cancel-line{background:linear-gradient(90deg,transparent,rgba(140,160,255,0.7),transparent)!important}
        .tc-save:hover{background:linear-gradient(135deg,#3a5af8,#5a78ff)!important;box-shadow:0 2px 14px rgba(38,67,247,0.5)!important;border-color:rgba(140,160,255,0.8)!important}
        .tc-ss-wrap:hover .tc-ss-overlay{opacity:1!important}
        .tc-ss-add:hover{background:rgba(140,160,255,0.05)!important}.tc-ss-add:hover .tc-ss-plus{stroke:rgba(140,160,255,0.8)!important}.tc-ss-add:hover .tc-ss-lbl{color:var(--tc-lbl)!important}
        .tap-ss-wrap:hover .tap-ss-overlay{opacity:1!important}
        .ss-view-btn:hover{background:rgba(255,255,255,0.18)!important}
        .ss-del-btn:hover{background:rgba(255,80,80,0.25)!important}
        .tl-drag,.tl-drag *{cursor:move!important}

      `}</style>

      {renderLoadingScreen(ctx)}

      <Routes>
        <Route path="/"           element={renderSessionPage({...ctx, sessView: 'sessions'})} />
        <Route path="/dashboard"  element={renderSessionPage({...ctx, sessView: 'dashboard'})} />
        <Route path="/strategies" element={renderSessionPage({...ctx, sessView: 'stratbank'})} />
        <Route path="/journal"    element={renderSessionPage({...ctx, sessView: 'journal'})} />
        <Route path="/resources"  element={renderSessionPage({...ctx, sessView: 'resources'})} />
        <Route path="/app"        element={renderMainApp(ctx)} />
        <Route path="*"           element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
};

export default TalariaV8b;
