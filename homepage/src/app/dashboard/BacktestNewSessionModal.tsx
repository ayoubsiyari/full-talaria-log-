// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import FlagSvg from "./backtestModal/FlagSvg";
import { currencyCountry } from "./backtestModal/FlagSvg";
import { JOURNAL_API_BASE } from "@/lib/journalApi";

const F = "'Exo 2', sans-serif";

function IconI({ n, s = 18, cl = "currentColor" }: { n: string; s?: number; cl?: string }) {
  if (n === "x") {
    return (
      <svg width={s} height={s} viewBox="0 -960 960 960" fill={cl}>
        <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
      </svg>
    );
  }
  if (n === "trashDraw") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <line x1="3" y1="7" x2="21" y2="7" stroke={cl} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M9 7V5h6v2" stroke={cl} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.5 7l1 15h13l1-15" stroke={cl} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="8.5" y1="20" x2="15.5" y2="11" stroke={cl} strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.7" />
        <circle cx="8.5" cy="20" r="1.1" fill={cl} fillOpacity="0.7" />
      </svg>
    );
  }
  return null;
}

export type BacktestNewSessionModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
};

export function BacktestNewSessionModal({ open, onClose, onSaved }: BacktestNewSessionModalProps) {
  const c = {
    ac: "#2643F7", acL: "#4A6AFF", acD: "rgba(38,67,247,0.08)", acB: "rgba(38,67,247,0.22)", acG: "rgba(74,106,255,0.35)",
    gold: "#C9A84C",
    bg: "#07080E", sf: "#0A0C14", el: "#0F1119", well: "#060710",
    br: "rgba(140,160,255,0.05)", brH: "rgba(140,160,255,0.12)",
    tx: "rgba(255,255,255,0.92)", ts: "rgba(255,255,255,0.70)", tm: "rgba(255,255,255,0.50)",
    gn: "#00D4A1", rd: "#FF5068",
  };

  const [newSessName, setNewSessName] = useState("");
  const [newSessSymbol, setNewSessSymbol] = useState("NQ");
  const [newSessTf, setNewSessTf] = useState("1H");
  const [newSessStart, setNewSessStart] = useState("");
  const [newSessEnd, setNewSessEnd] = useState("");
  const [newSessCapital, setNewSessCapital] = useState("10000");
  const [newSessCurrency, setNewSessCurrency] = useState("USD");
  const [sessDateMode, setSessDateMode] = useState("range");
  const [sessNBars, setSessNBars] = useState("5000");
  const [sessQuickDate, setSessQuickDate] = useState<any>(null);
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
  const [newSessFiles, setNewSessFiles] = useState<any[]>([]);
  const [newSessMarginCall, setNewSessMarginCall] = useState("100");
  const [newSessStopOut, setNewSessStopOut] = useState("50");
  const [newSessMaxRisk, setNewSessMaxRisk] = useState("");
  const [newSessProtect, setNewSessProtect] = useState("none");
  const [newSessNavEnabled, setNewSessNavEnabled] = useState(true);
  const [newSessFilePickerOpen, setNewSessFilePickerOpen] = useState(false);
  const [editSessId, setEditSessId] = useState<any>(null);
  const [newSessTickers, setNewSessTickers] = useState<string[]>([]);
  const [newSessTickerInput, setNewSessTickerInput] = useState("");
  const [newSessTickerFocus, setNewSessTickerFocus] = useState(false);
  const [newSessAssetClass, setNewSessAssetClass] = useState("Forex");
  const [newSessAdvancedOrder, setNewSessAdvancedOrder] = useState(false);
  const [newSessRollback, setNewSessRollback] = useState(false);
  const [newSessTradingStyle, setNewSessTradingStyle] = useState("");
  const [newSessStratDropOpen, setNewSessStratDropOpen] = useState(false);
  const [newSessStratHov, setNewSessStratHov] = useState<any>(null);
  const [newSessSymDropOpen, setNewSessSymDropOpen] = useState(false);
  const [newSessAssetDropOpen, setNewSessAssetDropOpen] = useState(false);
  const [newSessAssetHov, setNewSessAssetHov] = useState<any>(null);
  const [newSessSupportTickers, setNewSessSupportTickers] = useState<string[]>([]);
  const [newSessSupportAssetClass, setNewSessSupportAssetClass] = useState("Forex");
  const [newSessSupportInput, setNewSessSupportInput] = useState("");
  const [newSessSupportFocus, setNewSessSupportFocus] = useState(false);
  const [newSessSupportDropOpen, setNewSessSupportDropOpen] = useState(false);
  const [newSessInfoHov, setNewSessInfoHov] = useState<any>(null);
  const [newSessSupportEnabled, setNewSessSupportEnabled] = useState(false);
  const [newSessCalOpen, setNewSessCalOpen] = useState(false);
  const [newSessCalTarget, setNewSessCalTarget] = useState("start");
  const [newSessCalPos, setNewSessCalPos] = useState({ top: 0, left: 0 });
  const [newSessCalViewY, setNewSessCalViewY] = useState(2020);
  const [newSessCalViewM, setNewSessCalViewM] = useState(0);
  const [newSessCalMode, setNewSessCalMode] = useState("days");
  const [newSessCalYearBase, setNewSessCalYearBase] = useState(2016);
  const [newSessStartInput, setNewSessStartInput] = useState("");
  const [newSessEndInput, setNewSessEndInput] = useState("");
  const [newSessRandomCount, setNewSessRandomCount] = useState(3);
  const [newSessRandRangeVal, setNewSessRandRangeVal] = useState(3);
  const [newSessRandRangeUnit, setNewSessRandRangeUnit] = useState("M");
  const [newSessActivePreset, setNewSessActivePreset] = useState<any>(null);
  const [newSessSymPickerOpen, setNewSessSymPickerOpen] = useState(false);
  const [newSessSymPickerSearch, setNewSessSymPickerSearch] = useState("");
  const [newSessSymPickerPos, setNewSessSymPickerPos] = useState({ top: 0, left: 0 });
  const [newSessSupPickerOpen, setNewSessSupPickerOpen] = useState(false);
  const [newSessSupPickerSearch, setNewSessSupPickerSearch] = useState("");
  const [newSessSupPickerPos, setNewSessSupPickerPos] = useState({ top: 0, left: 0 });
  const [newSessSupPickerCat, setNewSessSupPickerCat] = useState("Forex");
  const [newSessTradingCostsEnabled, setNewSessTradingCostsEnabled] = useState(false);
  const [newSessCosts, setNewSessCosts] = useState({
    Forex: { commission: "7.00", leverage: "1:500" },
    Futures: { commission: "2.10", leverage: "1:20" },
    Stocks: { commission: "0.02", leverage: "1:5" },
    Crypto: { commission: "0.05", leverage: "1:20" },
  });
  const [newSessSymbolSpreads, setNewSessSymbolSpreads] = useState<Record<string, string>>({});
  const [newSessFuturesData, setNewSessFuturesData] = useState<Record<string, any>>({});
  const [hov, setHov] = useState<any>(null);
  const [dropdown, setDropdown] = useState<any>(null);
  const [ddAnchor, setDdAnchor] = useState<any>(null);

  const Z = 1.05;
  const I = IconI;

  const sep = <div style={{ margin: "12px 0", height: 1, background: `linear-gradient(90deg,transparent,${c.br} 20%,${c.br} 80%,transparent)` }} />;

  const lbl = (t: string) => {
    const isReq = t.endsWith(" *");
    const text = isReq ? t.slice(0, -2) : t;
    return (
      <div style={{ fontSize: 9, fontWeight: 700, color: c.tm, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
        {text}{isReq && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,80,104,0.9)", flexShrink: 0, display: "inline-block" }} />}
      </div>
    );
  };

  const secH = (t: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, fontWeight: 800, color: c.tm, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
      <div style={{ width: 2, height: 9, background: c.acL, flexShrink: 0, boxShadow: `0 0 4px ${c.acG}` }} />
      {t}
    </div>
  );

  const inp = (extra: any = {}) => ({
    background: c.el, border: `1px solid ${c.brH}`, color: c.tx, fontSize: 11, fontWeight: 600,
    padding: "0 8px", height: 27, fontFamily: F, outline: "none", width: "100%", boxSizing: "border-box", ...extra,
  });

  type AvailFile = {
    id: string;
    name: string;
    ticker: string;
    tf: string;
    from: string;
    to: string;
    size: string;
    asset: "Forex" | "Futures" | "Crypto" | "Stocks";
  };

  type StrategyOption = {
    value: string;
    label: string;
    variables: unknown[];
  };

  const [availFiles, setAvailFiles] = useState<AvailFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [fileMetaLoaded, setFileMetaLoaded] = useState<Record<string, boolean>>({});
  const [myStrategies, setMyStrategies] = useState<StrategyOption[]>([]);

  useEffect(() => {
    if (!open || filesLoading || availFiles.length > 0) return;
    setFilesLoading(true);
    setFilesError(null);

    const symCat: Record<string, AvailFile["asset"]> = {
      EURUSD: "Forex", GBPUSD: "Forex", USDJPY: "Forex", USDCHF: "Forex", AUDUSD: "Forex", NZDUSD: "Forex",
      USDCAD: "Forex", EURGBP: "Forex", EURJPY: "Forex", GBPJPY: "Forex", XAUUSD: "Forex", XAGUSD: "Forex",
      BTCUSD: "Crypto", ETHUSD: "Crypto", BNBUSD: "Crypto", SOLUSD: "Crypto", ADAUSD: "Crypto", XRPUSD: "Crypto", DOGEUSD: "Crypto",
      NQ: "Futures", ES: "Futures", YM: "Futures", RTY: "Futures", MNQ: "Futures", MES: "Futures",
      MYM: "Futures", M2K: "Futures", MGC: "Futures", MCL: "Futures", CL: "Futures", GC: "Futures", SI: "Futures", NG: "Futures",
      AAPL: "Stocks", TSLA: "Stocks", NVDA: "Stocks", MSFT: "Stocks", AMZN: "Stocks", GOOG: "Stocks",
    };
    const inferAsset = (name: string, ticker: string): AvailFile["asset"] => {
      const n = String(name || "").toUpperCase();
      const t = String(ticker || "").toUpperCase();
      if (symCat[t]) return symCat[t];
      if (/(BTC|ETH|BNB|SOL|ADA|XRP|DOGE|CRYPTO|USDT|USDC)/.test(t) || /(CRYPTO|USDT|USDC)/.test(n)) return "Crypto";
      if (/(NQ|ES|YM|RTY|MNQ|MES|MYM|M2K|MGC|MCL|CL|GC|SI|NG|FUTURE)/.test(t) || /(FUTURE|CME|CBOT|NYMEX|COMEX)/.test(n)) return "Futures";
      if (/^[A-Z]{3}[A-Z]{3}$/.test(t) || /(FOREX|FX)/.test(n)) return "Forex";
      if (/(STOCK|NASDAQ|NYSE)/.test(n) || /^[A-Z]{1,5}$/.test(t)) return "Stocks";
      return "Forex";
    };

    const guessTicker = (name: string) => {
      const base = name.replace(/\\.csv$/i, "");
      const first = base.split(/[ _-]/)[0];
      if (first && /^[A-Z0-9]{2,10}$/.test(first)) return first;
      const six = base.slice(0, 6);
      if (/^[A-Z]{3}[A-Z]{3}$/.test(six)) return six;
      return base.toUpperCase();
    };

    const guessTf = (name: string) => {
      const m = name.match(/_(M\\d+|H\\d+|D\\d+|W\\d+|1m|5m|15m|30m|1H|4H|1D)/i);
      if (!m) return "1m";
      const t = m[1].toUpperCase();
      if (t === "1M") return "1m";
      if (t === "M5") return "5m";
      if (t === "M15") return "15m";
      if (t === "M30") return "30m";
      if (t === "H1" || t === "1H") return "1H";
      if (t === "H4" || t === "4H") return "4H";
      if (t === "D1" || t === "1D") return "1D";
      return t;
    };

    void fetch("/api/files", { credentials: "include" })
      .then(res => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<{ files: { id: number; original_name: string; row_count: number; description?: string | null }[] }>;
      })
      .then(payload => {
        const next: AvailFile[] = (payload.files || []).map(f => {
          const name = f.original_name || `File ${f.id}`;
          const ticker = guessTicker(name);
          const asset = inferAsset(name, ticker);
          const tf = guessTf(name);
          const approxSize = f.row_count ? `${(f.row_count / 1_000_000).toFixed(2)}M rows` : "rows";
          return {
            id: String(f.id),
            name,
            ticker,
            tf,
            from: "",
            to: "",
            size: approxSize,
            asset,
          };
        });
        setAvailFiles(next);
      })
      .catch(err => {
        console.error("Failed to load /api/files", err);
        setFilesError("Failed to load datasets. Start the backtest server first.");
      })
      .finally(() => {
        setFilesLoading(false);
      });
  }, [open, filesLoading, availFiles.length]);

  useEffect(() => {
    if (!open || availFiles.length === 0 || newSessFiles.length === 0) return;
    const pending = newSessFiles.filter(fid => !fileMetaLoaded[fid]);
    if (pending.length === 0) return;

    const toIsoDate = (ts: number | null | undefined) => {
      if (!ts || !Number.isFinite(ts)) return "";
      return new Date(ts).toISOString().slice(0, 10);
    };
    const pickBestTf = (timeframes: Record<string, { status?: string }> | undefined) => {
      if (!timeframes) return "";
      const prefer = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];
      const keys = Object.keys(timeframes).filter(k => timeframes[k]?.status === "ready");
      if (!keys.length) return "";
      for (const tf of prefer) {
        const hit = keys.find(k => k.toLowerCase() === tf);
        if (hit) return hit;
      }
      return keys[0];
    };

    pending.forEach(fid => {
      void fetch(`/api/file/${encodeURIComponent(fid)}/meta`, { credentials: "include" })
        .then(r => (r.ok ? r.json() : null))
        .then((meta: any) => {
          if (!meta) return;
          setAvailFiles(prev => prev.map(f => {
            if (f.id !== fid) return f;
            const from = toIsoDate(meta.start_ts) || f.from;
            const to = toIsoDate(meta.end_ts) || f.to;
            const tf = pickBestTf(meta.timeframes) || f.tf;
            return { ...f, from, to, tf };
          }));
        })
        .catch(() => {
          // Keep UI usable even when per-file metadata endpoint fails.
        })
        .finally(() => {
          setFileMetaLoaded(prev => ({ ...prev, [fid]: true }));
        });
    });
  }, [open, availFiles, newSessFiles, fileMetaLoaded]);

  useEffect(() => {
    if (!open || myStrategies.length > 0) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const strategyHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (token) strategyHeaders.Authorization = `Bearer ${token}`;
    const endpoints = [
      { url: `${JOURNAL_API_BASE}/strategies`, init: { headers: strategyHeaders } },
      { url: "/journal/api/strategies", init: { credentials: "include" as const } },
      { url: "/api/strategies", init: { credentials: "include" as const } },
    ];

    void Promise.any(
      endpoints.map((ep) =>
        fetch(ep.url, ep.init).then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        }),
      ),
    )
      .then((payload: any) => {
        const list = Array.isArray(payload?.strategies)
          ? payload.strategies
          : Array.isArray(payload?.data?.strategies)
            ? payload.data.strategies
            : [];
        const options = list
          .map((s: any) => {
            const id = s?.id;
            const name = String(s?.name || "").trim();
            if (!id || !name) return null;
            const vars = Array.isArray(s?.strategy_definition?.variables) ? s.strategy_definition.variables : [];
            return { value: `strategy:${id}`, label: name, variables: vars } as StrategyOption;
          })
          .filter((x: StrategyOption | null): x is StrategyOption => !!x);
        setMyStrategies(options);
      })
      .catch(() => {
        // Keep modal usable if strategy service is unavailable; dropdown will show no strategies.
      });
  }, [open, myStrategies.length]);

  const instrDefaults: Record<string, any> = {
    Forex: { spread: "1.2", commission: "0", pipSize: "0.0001", pipVal: "10", contractSize: "100000", minLot: "0.01", lotStep: "0.01" },
    Futures: { spread: "0.25", commission: "2.50", pipSize: "0.25", pipVal: "12.50", contractSize: "1", minLot: "1", lotStep: "1" },
    Crypto: { spread: "15", commission: "0", pipSize: "1", pipVal: "1", contractSize: "1", minLot: "0.001", lotStep: "0.001" },
  };

  const instrRows = newSessFiles.map((fid: string) => {
    const f = availFiles.find(a => a.id === fid);
    if (!f) return null;
    const def = instrDefaults[f.asset] || instrDefaults.Forex;
    return { ...f, ...def };
  }).filter(Boolean);

  const selectedFiles = availFiles.filter(f => newSessFiles.includes(f.id));
  const strategyMap = myStrategies.reduce((acc: Record<string, StrategyOption>, s) => {
    acc[s.value] = s;
    return acc;
  }, {});
  const selectedStrategy = strategyMap[newSessPlaybook] || null;
  const availableStartIso = selectedFiles
    .map(f => f.from)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || "";
  const availableEndIso = selectedFiles
    .map(f => f.to)
    .filter(Boolean)
    .sort()
    .slice(0, 1)[0] || "";

  const resetFormToDefaults = useCallback(() => {
    setNewSessName("");
    setNewSessSymbol("NQ");
    setNewSessTf("1H");
    setNewSessStart("");
    setNewSessEnd("");
    setNewSessCapital("10000");
    setSessTradingMode("standard");
    setNewSessDescription("");
    setNewSessPlaybook("");
    setNewSessMarginCall("100");
    setNewSessStopOut("50");
    setNewSessProtect("none");
    setNewSessNavEnabled(true);
    setNewSessFilePickerOpen(false);
    setNewSessTickers([]);
    setNewSessTickerInput("");
    setNewSessTickerFocus(false);
    setNewSessAssetClass("Forex");
    setNewSessAdvancedOrder(false);
    setNewSessRollback(false);
    setNewSessTradingStyle("");
    setNewSessSupportTickers([]);
    setNewSessSupportAssetClass("Forex");
    setNewSessSupportInput("");
    setNewSessSupportFocus(false);
    setNewSessSupportEnabled(false);
    setNewSessFiles([]);
    setEditSessId(null);
    setNewSessStartInput("");
    setNewSessEndInput("");
    setDropdown(null);
    setDdAnchor(null);
    setNewSessStratDropOpen(false);
    setNewSessSymDropOpen(false);
    setNewSessAssetDropOpen(false);
    setNewSessSymPickerOpen(false);
    setNewSessSupPickerOpen(false);
    setNewSessTradingCostsEnabled(false);
    setNewSessSymbolSpreads({});
    setNewSessFuturesData({});
    setNewSessCosts({
      Forex: { commission: "7.00", leverage: "1:500" },
      Futures: { commission: "2.10", leverage: "1:20" },
      Stocks: { commission: "0.02", leverage: "1:5" },
      Crypto: { commission: "0.05", leverage: "1:20" },
    });
  }, []);

  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) resetFormToDefaults();
    prevOpen.current = open;
  }, [open, resetFormToDefaults]);

  const closeNewSess = () => {
    setNewSessFilePickerOpen(false);
    setNewSessTickerInput("");
    setNewSessTickerFocus(false);
    setNewSessStratDropOpen(false);
    setNewSessSymDropOpen(false);
    setNewSessAssetDropOpen(false);
    setNewSessSupportInput("");
    setNewSessSupportFocus(false);
    setNewSessSupportDropOpen(false);
    setNewSessSymPickerOpen(false);
    setNewSessSupPickerOpen(false);
    setDropdown(null);
    setDdAnchor(null);
    setEditSessId(null);
    onClose();
  };

  const selectedFilesForSession = availFiles.filter(f => newSessFiles.includes(f.id));
  const fallbackFilesByTicker = newSessTickers
    .map(t => availFiles.find(f => (f.ticker || "").toUpperCase() === String(t || "").toUpperCase()))
    .filter((f): f is AvailFile => !!f);
  const effectiveFiles = selectedFilesForSession.length > 0 ? selectedFilesForSession : fallbackFilesByTicker;
  const primaryEffectiveFile = effectiveFiles[0] || null;

  const sessInfoDone = !!newSessName.trim();
  const sessSettingsDone = sessInfoDone && newSessTickers.length > 0 && !!newSessStart && !!newSessEnd;
  const lockedBox = { opacity: 0.35, pointerEvents: "none" as const, userSelect: "none" as const };
  const activeBox = {};
  const isValid2 = !!(newSessName && newSessTickers.length > 0 && newSessStart && newSessEnd && newSessCapital && primaryEffectiveFile);

  const TlChk = (on: boolean, hKey: string, label: string | null, toggle: any, accent?: string) => {
    const ac = accent || c.acL;
    const acGhost = accent ? accent.replace(/[\d.]+\)$/,"0.35)") : "rgba(74,106,255,0.35)";
    const isH = hov === hKey;
    const bCol = on ? ac : isH ? c.tx : c.ts;
    const indicator = (
      <svg width={10} height={10} style={{ display: "block", overflow: "visible", flexShrink: 0 }}>
        <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={bCol} strokeWidth={1.3} fill="none" strokeLinecap="square" />
        <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={bCol} strokeWidth={1.3} fill="none" strokeLinecap="square" />
        {!on && isH && <>
          <path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={acGhost} strokeWidth={1} fill="none" strokeLinecap="square" />
          <path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={acGhost} strokeWidth={1} fill="none" strokeLinecap="square" />
        </>}
        {on && <>
          <path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={ac} strokeWidth={1.3} fill="none" strokeLinecap="square" />
          <path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={ac} strokeWidth={1.3} fill="none" strokeLinecap="square" />
          <circle cx={5} cy={5} r={2.8} fill={ac} opacity={0.12} />
          <circle cx={5} cy={5} r={1.6} fill={ac} />
        </>}
      </svg>
    );
    return (
      <div onClick={toggle} onMouseEnter={() => setHov(hKey)} onMouseLeave={() => setHov(null)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "default", userSelect: "none", opacity: on && isH ? 0.65 : 1, transition: "opacity 0.12s" }}>
        <div style={{ width: 10, height: 10, flexShrink: 0 }}>{indicator}</div>
        {label ? <span style={{ fontSize: 12, fontWeight: 500, color: on ? ac : isH ? c.tx : c.ts, transition: "color 0.12s", whiteSpace: "nowrap" }}>{label}</span> : null}
      </div>
    );
  };

  function buildChartConfig(): Record<string, unknown> {
    const selectedFilesArray = effectiveFiles;
    const primaryFile = primaryEffectiveFile;
    const primary = newSessTickers[0] || newSessSymbol || "NQ";
    const sessionName = newSessName.trim() || "Backtest Session";
    const startDate = (newSessStart || "").split("T")[0] || "";
    const endDate = (newSessEnd || "").split("T")[0] || "";
    const modeType = sessTradingMode === "prop" ? "propfirm" : "standard";
    const strategy_id =
      typeof newSessPlaybook === "string" && newSessPlaybook.startsWith("strategy:")
        ? parseInt(newSessPlaybook.split(":")[1] || "", 10) || null
        : null;
    const strategy_variables = selectedStrategy?.variables || [];
    const strategy_name = selectedStrategy?.label || (newSessPlaybook || "General");
    const playbook_display = strategy_name;
    const startBalance = String(newSessCapital || "10000");
    const accountCurrency = newSessCurrency || "USD";
    const fileId = primaryFile ? Number(primaryFile.id) : null;
    const fileName = primaryFile?.name || "";
    const symbols = newSessTickers.map(sym => {
      const match = selectedFilesArray.find(f => (f.ticker || "").toUpperCase() === String(sym || "").toUpperCase());
      const resolvedFileId = match ? Number(match.id) : fileId;
      return { symbolName: sym, fileId: resolvedFileId };
    });
    const instrumentsByTicker = instrRows.reduce((acc: Record<string, unknown>, row: any) => {
      const fileRef = selectedFilesArray.find(
        f => (f.ticker || "").toUpperCase() === String(row.ticker || "").toUpperCase() || String(f.id) === String(row.id),
      );
      acc[row.ticker] = {
        fileId: fileRef ? Number(fileRef.id) : fileId,
        ticker: row.ticker,
        timeframe: row.tf,
        spread: row.spread,
        commission: row.commission,
        pip_size: parseFloat(row.pipSize || row.pip_size || "0"),
        pip_value_per_lot: parseFloat(row.pipVal || row.pip_value_per_lot || "0"),
        contract_size: parseFloat(row.contractSize || row.contract_size || "0"),
        min_lot: parseFloat(row.minLot || row.min_lot || "0"),
        lot_step: parseFloat(row.lotStep || row.lot_step || "0"),
      };
      return acc;
    }, {});

    if (Object.keys(instrumentsByTicker).length === 0) {
      newSessTickers.forEach((ticker) => {
        const fileRef = selectedFilesArray.find(f => (f.ticker || "").toUpperCase() === String(ticker || "").toUpperCase()) || primaryFile;
        if (!fileRef) return;
        const def = instrDefaults[fileRef.asset] || instrDefaults.Forex;
        instrumentsByTicker[ticker] = {
          fileId: Number(fileRef.id),
          ticker,
          timeframe: fileRef.tf || newSessTf,
          spread: def.spread,
          commission: def.commission,
          pip_size: parseFloat(def.pipSize || "0"),
          pip_value_per_lot: parseFloat(def.pipVal || "0"),
          contract_size: parseFloat(def.contractSize || "0"),
          min_lot: parseFloat(def.minLot || "0"),
          lot_step: parseFloat(def.lotStep || "0"),
        };
      });
    }

    const p1DailyLossPct = parseFloat(sessP1DailyLossPct || "0") || 0;
    const p1TotalDdPct = parseFloat(sessP1TotalDDPct || "0") || 0;
    const p1ProfitTargetPct = parseFloat(sessP1ProfitTargetPct || "0") || 0;
    const p1DailyLossAmt = parseFloat(sessP1DailyLossAmt || "0") || 0;
    const p1TotalDdAmt = parseFloat(sessP1MaxDDAmt || "0") || 0;
    const p1ProfitTargetAmt = parseFloat(sessP1ProfitTargetAmt || "0") || 0;
    const p2DailyLossPct = parseFloat(sessP2DailyLossPct || "0") || 0;
    const p2TotalDdPct = parseFloat(sessP2TotalDDPct || "0") || 0;
    const p2ProfitTargetPct = parseFloat(sessP2ProfitTargetPct || "0") || 0;
    const p2DailyLossAmt = parseFloat(sessP2DailyLossAmt || "0") || 0;
    const p2TotalDdAmt = parseFloat(sessP2MaxDDAmt || "0") || 0;
    const p2ProfitTargetAmt = parseFloat(sessP2ProfitTargetAmt || "0") || 0;
    const minTradingDays = sessP1MinDaysEnabled ? (parseInt(sessP1MinDays || "0", 10) || 0) : 0;
    const leverageNumber = parseFloat(String(sessLeverage || "").split(":")[1] || String(sessLeverage || "0")) || 0;

    return {
      type: modeType,
      name: sessionName,
      sessionName,
      projectName: sessionName,
      description: newSessDescription,
      playbook: newSessPlaybook || "",
      playbook_display,
      strategy_id,
      strategy_variables,
      strategy_name,
      fileId,
      fileName,
      files: selectedFilesArray,
      tickers: newSessTickers,
      supporting_tickers: newSessSupportTickers,
      asset_class: newSessAssetClass,
      trading_mode: sessTradingMode,
      symbol: newSessTickers.length === 1 ? newSessTickers[0] : newSessTickers.length > 1 ? `${newSessTickers.length} symbols` : primary,
      symbols,
      selectedSymbols: symbols,
      activeFileIndex: 0,
      instruments: instrumentsByTicker,
      startDate,
      endDate,
      startBalance,
      capital: parseFloat(startBalance) || 0,
      created: new Date().toISOString(),
      timeframe: newSessTf,
      account_currency: accountCurrency,
      accountCurrency,
      leverage: sessLeverage,
      margin_call_level: parseFloat(newSessMarginCall || "100"),
      stop_out_level: parseFloat(newSessStopOut || "50"),
      max_risk_per_trade_pct: parseFloat(newSessMaxRisk || "0") || null,
      marketType: [String(newSessAssetClass || "Forex").toLowerCase()],
      defaultRiskType: sessRiskMode,
      defaultRisk: parseFloat(sessRiskVal || "1") || 1,
      allowBackNavigation: newSessRollback,
      forwardTestingOnly: sessTradingMode === "prop",
      protectionPreset: newSessProtect,
      commission: newSessTradingCostsEnabled ? (sessCommission || "Per Lot") : "None",
      rollback_allowed: newSessRollback,
      replayMode: sessReplayMode,
      replaySpeed: sessReplaySpeed,
      timezone: newSessTimezone,
      dst: newSessDST,
      advanced_order: newSessAdvancedOrder,
      trading_costs: newSessTradingCostsEnabled ? { costs: newSessCosts, spreads: newSessSymbolSpreads, futuresMargins: newSessFuturesData } : null,
      prop_rules: sessTradingMode === "prop" ? {
        numPhases: sessNumPhases,
        challengeType: sessChallengeType,
        propCategory: sessPropCat,
        propFirm: sessPropFirm,
        leverage: sessLeverage,
        leverageNumber,
        p1Pct: { dl: p1DailyLossPct, dd: p1TotalDdPct, pt: p1ProfitTargetPct },
        p2Pct: { dl: p2DailyLossPct, dd: p2TotalDdPct, pt: p2ProfitTargetPct },
        p1Amt: { dl: p1DailyLossAmt, dd: p1TotalDdAmt, pt: p1ProfitTargetAmt },
        p2Amt: { dl: p2DailyLossAmt, dd: p2TotalDdAmt, pt: p2ProfitTargetAmt },
        p1MinDays: sessP1MinDaysEnabled ? (parseInt(sessP1MinDays || "0", 10) || 0) : 0,
        p2MinDays: sessP2MinDaysEnabled ? (parseInt(sessP2MinDays || "0", 10) || 0) : 0,
        minTradingDays,
        maxPosition: parseFloat(sessMaxLotSize || sessMaxContracts || "0") || 0,
        maxPositionEnabled: sessMaxPosEnabled || sessMaxContractsEnabled,
        maxPositionUnit: sessMaxPosUnit,
        maxContracts: parseInt(sessMaxContracts || "0", 10) || 0,
        maxContractsEnabled: sessMaxContractsEnabled,
        consistencyRule: sessConsistencyRule,
        consistencyPct: parseFloat(sessConsistencyPct || "0") || 0,
        weekendHold: sessWeekendHold,
        trailingDrawdown: sessTrailingDrawdown,
        dailyLossEnabled: sessDailyLossEnabled,
      } : null,
      challenge: sessTradingMode === "prop",
      challengeType: sessChallengeType,
      minTradingDays,
      minTradingDaysEnabled: sessP1MinDaysEnabled,
      maxDailyLoss: {
        percent: p1DailyLossPct,
        dollar: p1DailyLossAmt,
      },
      maxTotalLoss: {
        percent: p1TotalDdPct,
        dollar: p1TotalDdAmt,
      },
      profitTarget: p1ProfitTargetPct,
      profitTargetUsd: p1ProfitTargetAmt,
      maxDailyLossPercent: p1DailyLossPct,
      maxDailyLossDollar: p1DailyLossAmt,
      maxTotalLossPercent: p1TotalDdPct,
      maxTotalLossDollar: p1TotalDdAmt,
      leverageNumber,
      maxPosition: parseFloat(sessMaxLotSize || sessMaxContracts || "0") || 0,
      maxPositionEnabled: sessMaxPosEnabled || sessMaxContractsEnabled,
      maxPositionUnit: sessMaxPosUnit,
      maxContracts: parseInt(sessMaxContracts || "0", 10) || 0,
      maxContractsEnabled: sessMaxContractsEnabled,
      consistencyRule: sessConsistencyRule,
      consistencyPct: parseFloat(sessConsistencyPct || "0") || 0,
      weekendHold: sessWeekendHold,
      trailingDrawdown: sessTrailingDrawdown,
      dailyLossEnabled: sessDailyLossEnabled,
      futMinDays: parseInt(sessFutMinDays || "0", 10) || 0,
      futMinDaysEnabled: sessFutMinDaysEnabled,
      daylightSavingTime: newSessDST ? "enabled" : "disabled",
    };
  }

  async function persistSession(): Promise<number | null> {
    const sessionName = newSessName.trim() || "Backtest Session";
    const session_type = sessTradingMode === "prop" ? "propfirm" : "personal";
    const config = buildChartConfig();
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: sessionName, session_type, config }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.detail ? String(body.detail) : `HTTP ${res.status}`);
    }
    const payload = await res.json();
    const id = payload?.session?.id;
    return id != null ? Number(id) : null;
  }

  const saveNewSession = async () => {
    if (!isValid2) return;
    try {
      await persistSession();
      await onSaved?.();
      closeNewSess();
    } catch (e: any) {
      window.alert(`Failed to save session: ${e?.message || e}`);
    }
  };

  const startNewSession = async () => {
    if (!isValid2) return;
    try {
      const id = await persistSession();
      const cfg = buildChartConfig();
      try {
        localStorage.setItem("backtestingSession", JSON.stringify(cfg));
        if (id != null) {
          localStorage.setItem("active_trading_session_id", String(id));
          const uid = localStorage.getItem("_uid");
          if (uid) localStorage.setItem(`u${uid}_active_trading_session_id`, String(id));
        }
      } catch { /* ignore */ }
      await onSaved?.();
      closeNewSess();
      if (sessTradingMode === "prop") {
        const mode = "propfirm";
        const q = id != null ? `?mode=${encodeURIComponent(mode)}&sessionId=${encodeURIComponent(String(id))}` : `?mode=${encodeURIComponent(mode)}`;
        window.location.href = `/chart/index.html${q}`;
      } else {
        const mode = "backtest";
        const q = id != null ? `?mode=${encodeURIComponent(mode)}&sessionId=${encodeURIComponent(String(id))}` : `?mode=${encodeURIComponent(mode)}`;
        window.location.href = `/chart/index.html${q}`;
      }
    } catch (e: any) {
      window.alert(`Failed to start session: ${e?.message || e}`);
    }
  };

  return (
    <>
            {/* ── NEW SESSION MODAL overlay ── */}
            {open && (
              <div style={{position:"fixed",inset:0,zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",visibility:"visible"}} onClick={closeNewSess}>
                {/* Backdrop */}
                <div style={{position:"absolute",inset:0,background:"rgba(4,5,10,0.72)",backdropFilter:"blur(3px)"}}/>
                {/* Panel */}
                <div onClick={e=>e.stopPropagation()}
                  style={{position:"relative",width:"min(680px,90vw)",height:"min(88vh,660px)",background:c.sf,border:`1px solid ${c.brH}`,display:"flex",flexDirection:"column",animation:"tlrPopIn 0.18s ease",boxShadow:"0 24px 72px rgba(0,0,0,0.9)",fontFamily:F}}>
                  {/* Top accent */}
                  <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,flexShrink:0}}/>
                  {/* Modal header */}
                  <div style={{height:44,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",borderBottom:`1px solid ${c.br}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      <img src="/LOGO-07.png" style={{width:22,height:22,objectFit:"contain"}} alt=""/>
                      <div style={{fontSize:12,fontWeight:700,color:c.tx,letterSpacing:"0.04em",fontFamily:F}}>{editSessId?"Edit Session":"New Backtest Session"}</div>
                    </div>
                    <div onClick={closeNewSess}
                      onMouseEnter={()=>setHov("newSessX")} onMouseLeave={()=>setHov(null)}
                      style={{width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",cursor:"default",background:hov==="newSessX"?"rgba(255,80,80,0.07)":"transparent",transition:"background 0.12s"}}>
                      <I n="x" s={18} cl={hov==="newSessX"?c.rd:c.ts}/>
                    </div>
                  </div>

                  {/* Scrollable form body */}
                  <div style={{flex:1,overflowY:"auto",padding:"16px 20px 68px"}} className="tlr-scroll" onScroll={()=>{setNewSessCalOpen(false);setNewSessStratDropOpen(false);setNewSessSymPickerOpen(false);setNewSessSupPickerOpen(false);setDropdown(null);setDdAnchor(null);}} onClick={()=>{setNewSessStratDropOpen(false);setNewSessSymDropOpen(false);setNewSessAssetDropOpen(false);setNewSessCalOpen(false);setNewSessSymPickerOpen(false);setNewSessSupPickerOpen(false);setDropdown(null);setDdAnchor(null);}}>
                    <div style={{maxWidth:"100%",display:"flex",flexDirection:"column",gap:8}}>

                      {/* § Session Info */}
                      <div style={{border:`1px solid ${c.brH}`,padding:"12px 14px"}}>
                      {secH("Session Info")}
                      {(()=>{
                        const allGroups:[string, StrategyOption[]][]=[["My Strategies",myStrategies]];
                        return(<>
                          {/* Session name + strategy: left 50% column, New Strategy button beside it */}
                          <div style={{display:"flex",gap:8,alignItems:"flex-end",marginBottom:10}}>
                            {/* 50% container — session name and strategy dropdown both full width here */}
                            <div style={{width:"50%",flexShrink:0,display:"flex",flexDirection:"column",gap:8}}>
                              {/* Row 1: session name */}
                              <div>
                                {lbl("Session name *")}
                                <input value={newSessName} onChange={e=>setNewSessName(e.target.value)} placeholder="e.g. EURUSD Test" style={{...inp()}}/>
                              </div>
                              {/* Row 2: strategy dropdown – same full width */}
                              <div style={{position:"relative"}}>
                                {lbl("Strategy")}
                                <div onClick={(e)=>{e.stopPropagation();if(newSessStratDropOpen){setNewSessStratDropOpen(false);setDdAnchor(null);}else{const r=e.currentTarget.getBoundingClientRect();setDdAnchor({top:r.bottom/Z+3,left:r.left/Z,width:r.width/Z});setNewSessStratDropOpen(true);setDropdown(null);}}}
                                  style={{...inp({padding:"0 24px 0 8px",cursor:"default"}),display:"flex",alignItems:"center",border:`1px solid ${newSessStratDropOpen?c.acB:c.brH}`,position:"relative",userSelect:"none"}}>
                                  <span style={{flex:1,color:newSessPlaybook?c.tx:c.tm,fontSize:11,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                    {selectedStrategy?.label || newSessPlaybook || "— None —"}
                                  </span>
                                  <svg style={{position:"absolute",right:7,top:"50%",transform:`translateY(-50%) rotate(${newSessStratDropOpen?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                                {newSessStratDropOpen&&ddAnchor&&(
                                  <><div style={{position:"fixed",inset:0,zIndex:199}} onClick={()=>{setNewSessStratDropOpen(false);setDdAnchor(null);}}/><div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,width:ddAnchor.width,background:c.sf,border:"1px solid rgba(140,160,255,0.22)",boxShadow:"0 8px 28px rgba(0,0,0,0.7)",zIndex:200}}>
                                    <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,flexShrink:0}}/>
                                    {(()=>{const isAct=newSessPlaybook==="";const isH=newSessStratHov==="__none";return(
                                      <div onClick={()=>{setNewSessPlaybook("");setNewSessStratDropOpen(false);}} onMouseEnter={()=>setNewSessStratHov("__none")} onMouseLeave={()=>setNewSessStratHov(null)}
                                        style={{display:"flex",alignItems:"center",padding:"5px 10px",cursor:"default",position:"relative",background:isAct?c.acD:isH?"rgba(255,255,255,0.03)":"transparent",transition:"background 0.1s"}}>
                                        {isAct&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
                                        <span style={{fontSize:11,fontWeight:isAct?700:400,color:isAct?c.acL:isH?c.tx:c.tm,fontFamily:F,fontStyle:"italic"}}>— None —</span>
                                      </div>
                                    );})()}
                                    {allGroups.map(([groupLabel,items])=>(
                                      <div key={groupLabel}>
                                        <div style={{padding:"5px 10px 3px",fontSize:9,fontWeight:800,color:c.tm,letterSpacing:"0.08em",textTransform:"uppercase",borderTop:"1px solid rgba(140,160,255,0.08)"}}>{groupLabel}</div>
                                        {items.length===0&&(
                                          <div style={{padding:"6px 10px 8px",fontSize:10,color:c.tm,fontFamily:F}}>
                                            No strategies found. Create one in Strategy Builder.
                                          </div>
                                        )}
                                        {items.map(s=>{const isAct=newSessPlaybook===s.value;const isH=newSessStratHov===s.value;return(
                                          <div key={s.value} onClick={()=>{setNewSessPlaybook(s.value);setNewSessStratDropOpen(false);}} onMouseEnter={()=>setNewSessStratHov(s.value)} onMouseLeave={()=>setNewSessStratHov(null)}
                                            style={{display:"flex",alignItems:"center",padding:"5px 10px 5px 14px",cursor:"default",position:"relative",background:isAct?c.acD:isH?"rgba(255,255,255,0.03)":"transparent",transition:"background 0.1s"}}>
                                            {isAct&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
                                            <span style={{fontSize:11,fontWeight:isAct?700:500,color:isAct?c.acL:isH?c.tx:c.ts,fontFamily:F}}>{s.label}</span>
                                          </div>
                                        );})}
                                      </div>
                                    ))}
                                  </div></>
                                )}
                              </div>
                            </div>
                            {/* New Strategy button – bottom-aligned beside the 50% block */}
                            <div onClick={()=>{window.location.href="/strategies-lab/";}}
                              style={{flexShrink:0,height:27,width:110,justifyContent:"center",display:"flex",alignItems:"center",gap:5,background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.96)",letterSpacing:"0.05em",boxShadow:"0 2px 8px rgba(38,67,247,0.35)",fontFamily:F,whiteSpace:"nowrap",transition:"filter 0.12s"}}
                              onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"}
                              onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                              <svg width={8} height={8} viewBox="0 0 12 12" fill="none"><line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                              New Strategy
                            </div>
                          </div>
                          {/* Row 2: description */}
                          {lbl("Description")}
                          <textarea value={newSessDescription} onChange={e=>setNewSessDescription(e.target.value)}
                            placeholder="Optional notes about this session"
                            style={{...inp({height:"auto",padding:"5px 8px",resize:"vertical",minHeight:40,lineHeight:1.5})}}/>
                        </>);
                      })()}
                      </div>

                      {/* § Session Settings — compact trigger + sub-window */}
                      <div style={{border:`1px solid ${sessInfoDone?c.brH:c.br}`,padding:"12px 14px",transition:"opacity 0.2s,border-color 0.2s",...(sessInfoDone?activeBox:lockedBox)}}>
                      {secH("Session Settings")}
                      {(()=>{
                        const staticSymbols=[
                          {sym:"EURUSD",cat:"Forex"},{sym:"GBPUSD",cat:"Forex"},{sym:"USDJPY",cat:"Forex"},{sym:"USDCHF",cat:"Forex"},{sym:"AUDUSD",cat:"Forex"},
                          {sym:"NZDUSD",cat:"Forex"},{sym:"USDCAD",cat:"Forex"},{sym:"EURGBP",cat:"Forex"},{sym:"EURJPY",cat:"Forex"},{sym:"GBPJPY",cat:"Forex"},
                          {sym:"XAUUSD",cat:"Forex"},{sym:"XAGUSD",cat:"Forex"},{sym:"USDSEK",cat:"Forex"},{sym:"USDNOK",cat:"Forex"},
                          {sym:"NQ",cat:"Futures"},{sym:"ES",cat:"Futures"},{sym:"YM",cat:"Futures"},{sym:"RTY",cat:"Futures"},
                          {sym:"CL",cat:"Futures"},{sym:"GC",cat:"Futures"},{sym:"SI",cat:"Futures"},{sym:"NG",cat:"Futures"},
                          {sym:"MNQ",cat:"Futures"},{sym:"MES",cat:"Futures"},{sym:"MYM",cat:"Futures"},{sym:"M2K",cat:"Futures"},
                          {sym:"MGC",cat:"Futures"},{sym:"MCL",cat:"Futures"},
                          {sym:"AAPL",cat:"Equities"},{sym:"TSLA",cat:"Equities"},{sym:"NVDA",cat:"Equities"},{sym:"MSFT",cat:"Equities"},{sym:"AMZN",cat:"Equities"},{sym:"GOOG",cat:"Equities"},
                        ];
                        const fileSymbols = availFiles
                          .filter(f=>f.ticker)
                          .map(f=>({sym:String(f.ticker).toUpperCase(),cat:f.asset==="Stocks"?"Equities":f.asset}));
                        const allSymbols = [...staticSymbols, ...fileSymbols].reduce<{sym:string;cat:string}[]>((acc, cur)=>{
                          if (!acc.some(x=>x.sym===cur.sym)) acc.push(cur);
                          return acc;
                        }, []);
                        const catMap={"Forex":"Forex","Futures":"Futures","Crypto":"Crypto","Stocks":"Equities"};
                        const catOf=sym=>allSymbols.find(s=>s.sym===sym)?.cat||"";
                        const assetLabel=cat=>({"Forex":"Forex","Futures":"Futures","Crypto":"Crypto","Equities":"Stocks"}[cat]||cat);
                        const totalSelected=newSessTickers.length+newSessSupportTickers.length;
                        const pairInfo=sym=>{if(sym.length===6){const b=sym.slice(0,3),q=sym.slice(3,6);if(currencyCountry[b]&&currencyCountry[q])return{b,q};}return null;};
                        const mkFlags=(sym,sz=11)=>{
                          const pr=pairInfo(sym);const fw=Math.round(sz*15/11),fh=sz;
                          if(pr){return(<div style={{position:"relative",width:Math.round(sz*22/11),height:fh,flexShrink:0}}><div style={{position:"absolute",left:0,top:0,borderRadius:1,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.7)",zIndex:2}}><FlagSvg code={pr.b} w={fw} h={fh}/></div><div style={{position:"absolute",left:Math.round(sz*7/11),top:0,borderRadius:1,overflow:"hidden",boxShadow:"0 1px 2px rgba(0,0,0,0.5)",zIndex:1}}><FlagSvg code={pr.q} w={fw} h={fh}/></div></div>);}
                          const metalMap={XAUUSD:{bg:"#2B2200",fg:"#FFD700",label:"Au"},XAGUSD:{bg:"#1C2028",fg:"#C8D4E0",label:"Ag"},GC:{bg:"#2B2200",fg:"#FFD700",label:"Au"},SI:{bg:"#1C2028",fg:"#C8D4E0",label:"Ag"},CL:{bg:"#0D1A12",fg:"#4CAF50",label:"CL"},NG:{bg:"#0A1020",fg:"#64B5F6",label:"NG"}};
                          if(metalMap[sym]){const m=metalMap[sym];return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:1,boxShadow:"0 1px 3px rgba(0,0,0,0.6)"}}><rect width={fw} height={fh} fill={m.bg}/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill={m.fg} fontSize={fh*0.52} fontWeight="800" fontFamily="'Exo 2',sans-serif">{m.label}</text></svg>);}
                          const cryptoMap={BTCUSD:{bg:"#E8820C",fg:"#fff",label:"₿"},ETHUSD:{bg:"#3D4FC4",fg:"#fff",label:"Ξ"},BNBUSD:{bg:"#C99800",fg:"#000",label:"B"},SOLUSD:{bg:"#7B3FBE",fg:"#fff",label:"S"},ADAUSD:{bg:"#0033AD",fg:"#fff",label:"A"}};
                          if(cryptoMap[sym]){const cr=cryptoMap[sym];return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:Math.round(fh*0.35),boxShadow:"0 1px 3px rgba(0,0,0,0.6)"}}><rect width={fw} height={fh} rx={Math.round(fh*0.35)} fill={cr.bg}/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill={cr.fg} fontSize={fh*0.58} fontWeight="900" fontFamily="'Exo 2',sans-serif">{cr.label}</text></svg>);}
                          const genericLabel=(sym||"").replace(/USDT|USDC|USD$/,"").replace(/[^A-Z0-9]/g,"").slice(0,3)||"?";
                          return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:Math.round(fh*0.35),boxShadow:"0 1px 3px rgba(0,0,0,0.6)"}}><rect width={fw} height={fh} rx={Math.round(fh*0.35)} fill="#22324A"/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill="#D7E6FF" fontSize={fh*0.45} fontWeight="800" fontFamily="'Exo 2',sans-serif">{genericLabel}</text></svg>);
                        };
                        const mkCell=(t,onDel)=>(<div key={t} style={{display:"flex",alignItems:"center",padding:"2px 4px 2px 3px",background:c.sf,border:`1px solid ${c.brH}`,gap:3,minWidth:0}}>{mkFlags(t,10)}<span style={{fontSize:10,fontWeight:700,color:c.tx,fontFamily:F,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t}</span><span onClick={onDel} style={{fontSize:13,lineHeight:1,color:c.tm,cursor:"default",flexShrink:0,marginLeft:5,transition:"color 0.1s"}} onMouseEnter={e=>e.currentTarget.style.color=c.rd} onMouseLeave={e=>e.currentTarget.style.color=c.tm}>×</span></div>);
                        /* ── date helpers (shared with grid below) ── */
                        const MON_D=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                        const MONS_D=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
                        const fmtD=iso=>{if(!iso)return "";const d=new Date(iso.split("T")[0]+"T00:00:00");return `${String(d.getDate()).padStart(2,"0")}-${MON_D[d.getMonth()]}-${d.getFullYear()}`;};
                        const applyD=(raw,setter)=>{
                          const s=raw.trim();
                          const todayIso=new Date().toISOString().slice(0,10);
                          const minIso=availableStartIso||"1990-01-01";
                          const maxIso=(availableEndIso&&availableEndIso<todayIso)?availableEndIso:todayIso;
                          const clamp=iso=>iso<minIso?minIso:iso>maxIso?maxIso:iso;
                          // DD-Mon-YYYY
                          const m1=s.match(/^(\d{1,2})-([a-zA-Z]{3})-(\d{1,4})$/);
                          if(m1){const moIdx=MONS_D.indexOf(m1[2].toLowerCase());if(moIdx<0)return;const y=parseInt(m1[3]),dy=Math.min(parseInt(m1[1]),new Date(y,moIdx+1,0).getDate());if(y<1990||y>new Date().getFullYear())return;setter(clamp(`${y}-${String(moIdx+1).padStart(2,"0")}-${String(dy).padStart(2,"0")}`));return;}
                          // YYYY-MM-DD
                          const m2=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
                          if(m2){const y=parseInt(m2[1]),mo=parseInt(m2[2])-1,dy=Math.min(parseInt(m2[3]),new Date(y,mo+1,0).getDate());if(mo<0||mo>11||y<1990||y>new Date().getFullYear())return;setter(clamp(`${y}-${String(mo+1).padStart(2,"0")}-${String(dy).padStart(2,"0")}`));return;}
                          // MM/DD/YYYY
                          const m3=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                          if(m3){const y=parseInt(m3[3]),mo=parseInt(m3[1])-1,dy=Math.min(parseInt(m3[2]),new Date(y,mo+1,0).getDate());if(mo<0||mo>11||y<1990||y>new Date().getFullYear())return;setter(clamp(`${y}-${String(mo+1).padStart(2,"0")}-${String(dy).padStart(2,"0")}`));return;}
                        };
                        const openCal=(e,target,currentIso)=>{const r=e.currentTarget.parentElement.getBoundingClientRect();const w=r.width/Z,calH=260;const rawL=r.left/Z,rawB=r.bottom/Z,rawTop=r.top/Z;const spaceBelow=window.innerHeight/Z-rawB-calH-8;const top=spaceBelow>=0?rawB+4:Math.max(8,rawTop-calH-4);setNewSessCalPos({top,left:Math.max(8,Math.min(rawL,window.innerWidth/Z-w-8)),width:w});setNewSessCalTarget(target);const d=currentIso?new Date(currentIso.split("T")[0]+"T00:00:00"):new Date(2020,0,1);setNewSessCalViewY(d.getFullYear());setNewSessCalViewM(d.getMonth());setNewSessCalMode("days");setNewSessCalOpen(true);};
                        const inpSx={flex:1,background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:12,fontWeight:600,padding:"5px 7px",fontFamily:F,fontVariantNumeric:"tabular-nums",cursor:"text",minWidth:0};
                        const chvSx={padding:"0 6px",cursor:"default",display:"flex",alignItems:"center",color:c.ts,borderLeft:`1px solid ${c.br}`,alignSelf:"stretch"};
                        const ChevD=({open})=>(<svg width={8} height={8} viewBox="0 0 8 8" fill="none"><path d={open?"M1,5 L4,2 L7,5":"M1,3 L4,6 L7,3"} stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"/></svg>);
                        const applyPreset=(months,years)=>{const end=new Date(),start=new Date();if(months)start.setMonth(start.getMonth()-months);if(years)start.setFullYear(start.getFullYear()-years);const fi=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;const fd=d=>`${String(d.getDate()).padStart(2,"0")}-${MON_D[d.getMonth()]}-${d.getFullYear()}`;setNewSessStart(fi(start));setNewSessStartInput(fd(start));setNewSessEnd(fi(end));setNewSessEndInput(fd(end));};
                        const presets=[{l:"1M",months:1},{l:"3M",months:3},{l:"6M",months:6},{l:"1Y",years:1},{l:"2Y",years:2},{l:"3Y",years:3},{l:"5Y",years:5},{l:"10Y",years:10}];
                        const unitMax={D:3650,M:120,Y:10};
                        const randomRange=()=>{const today=new Date();today.setHours(0,0,0,0);let lenDays=newSessRandRangeUnit==="D"?newSessRandRangeVal:newSessRandRangeUnit==="M"?Math.round(newSessRandRangeVal*30.4375):Math.round(newSessRandRangeVal*365.25);const earliest=availableStartIso?new Date(availableStartIso+"T00:00:00"):new Date(today.getTime()-20*365*86400000);const maxEnd=availableEndIso?new Date(availableEndIso+"T00:00:00"):today;const latest=new Date(maxEnd.getTime()-lenDays*86400000);if(latest<=earliest)return;const s=new Date(earliest.getTime()+Math.random()*(latest.getTime()-earliest.getTime()));const e2=new Date(s.getTime()+lenDays*86400000);const fi=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;const fd=d=>`${String(d.getDate()).padStart(2,"0")}-${MON_D[d.getMonth()]}-${d.getFullYear()}`;setNewSessStart(fi(s));setNewSessStartInput(fd(s));setNewSessEnd(fi(e2));setNewSessEndInput(fd(e2));setNewSessActivePreset(null);};
                        return(<>
                          {/* ─── Market + Random row ─── */}
                          <div style={{marginBottom:8,display:"flex",alignItems:"flex-end",gap:8}}>
                            {/* Market dropdown — width matches Strategy */}
                            <div style={{width:"50%",flexShrink:0}}>
                              {lbl("Markets & Instruments *")}
                              <div style={{position:"relative"}}>
                                <div onClick={e=>{e.stopPropagation();if(newSessAssetDropOpen){setNewSessAssetDropOpen(false);setDdAnchor(null);}else{const r=e.currentTarget.getBoundingClientRect();setDdAnchor({top:r.bottom/Z+3,left:r.left/Z,width:r.width/Z});setNewSessAssetDropOpen(true);setDropdown(null);setNewSessStratDropOpen(false);}}}
                                  style={{...inp({padding:"0 24px 0 8px",cursor:"default"}),display:"flex",alignItems:"center",border:`1px solid ${newSessAssetDropOpen?c.acB:c.brH}`,position:"relative",userSelect:"none"}}>
                                  <span style={{flex:1,fontSize:11,fontWeight:600,color:c.tx,fontFamily:F}}>{newSessAssetClass}</span>
                                  <svg style={{position:"absolute",right:7,top:"50%",transform:`translateY(-50%) rotate(${newSessAssetDropOpen?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                                {newSessAssetDropOpen&&ddAnchor&&(<>
                                  <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setNewSessAssetDropOpen(false);setDdAnchor(null);}}/>
                                  <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,width:ddAnchor.width,background:c.sf,border:"1px solid rgba(140,160,255,0.22)",boxShadow:"0 8px 28px rgba(0,0,0,0.7)",zIndex:9999}}>
                                    <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                                    {["Forex","Futures","Crypto","Stocks"].map(a=>{
                                      const isA=newSessAssetClass===a;const hk="asDrop_"+a;const isH=hov===hk;
                                      return(
                                        <div key={a} onClick={()=>{setNewSessAssetClass(a);setNewSessTickerInput("");setNewSessTickers([]);setNewSessAssetDropOpen(false);setDdAnchor(null);if(a==="Stocks"||a==="Crypto")setSessTradingMode("standard");if(a==="Futures"&&sessTradingMode==="prop"){setNewSessCapital("50000");setSessP1DailyLossAmt("1000");setSessP1MaxDDAmt("2000");setSessP1ProfitTargetAmt("3000");}}}
                                          onMouseEnter={()=>setHov(hk)} onMouseLeave={()=>setHov(null)}
                                          style={{display:"flex",alignItems:"center",padding:"5px 12px",cursor:"default",position:"relative",background:isA?c.acD:isH?"rgba(255,255,255,0.03)":"transparent",transition:"background 0.1s"}}>
                                          {isA&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
                                          <span style={{fontSize:11,fontWeight:isA?700:500,color:isA?c.acL:isH?c.tx:c.ts,fontFamily:F}}>{a}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </>)}
                              </div>
                            </div>
                            {/* Random button — aligned to bottom of Market button */}
                            <div style={{display:"flex",alignItems:"center",gap:4,paddingBottom:1}}>
                              <div onClick={()=>{
                                  const cats=["Forex","Futures","Crypto","Stocks"];
                                  const randomCat=cats[Math.floor(Math.random()*cats.length)];
                                  const catKey=catMap[randomCat]||randomCat;
                                  const pool=allSymbols.filter(s=>s.cat===catKey);
                                  const picks=[...pool].sort(()=>Math.random()-0.5).slice(0,Math.min(newSessRandomCount,10)).map(s=>s.sym);
                                  setNewSessAssetClass(randomCat);
                                  if(randomCat==="Stocks"||randomCat==="Crypto")setSessTradingMode("standard");
                                  setNewSessTickers(picks);
                                }}
                                onMouseEnter={()=>setHov("rndBtnTop")} onMouseLeave={()=>setHov(null)}
                                style={{padding:"0 10px",height:27,display:"flex",alignItems:"center",gap:6,background:c.el,border:`1px solid ${hov==="rndBtnTop"?c.acB:c.brH}`,cursor:"default",fontSize:10,fontWeight:700,color:hov==="rndBtnTop"?c.acL:c.ts,letterSpacing:"0.06em",fontFamily:F,flexShrink:0,whiteSpace:"nowrap",transition:"color 0.12s,border-color 0.12s"}}>
                                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
                                  <polyline points="16,3 21,3 21,8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                                  <polyline points="21,16 21,21 16,21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                                  <line x1="4" y1="20" x2="21" y2="3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                                  <line x1="4" y1="4" x2="9" y2="9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                                  <line x1="15" y1="15" x2="21" y2="21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                                </svg>
                                Random
                              </div>
                              <div style={{position:"relative",width:49,height:27,background:c.el,border:`1px solid ${c.brH}`,boxSizing:"border-box",flexShrink:0}}>
                                <input type="number" min={1} max={10} value={newSessRandomCount}
                                  onChange={e=>setNewSessRandomCount(Math.min(10,Math.max(1,parseInt(e.target.value)||1)))}
                                  onClick={e=>e.stopPropagation()}
                                  className="tlr-nospinner"
                                  style={{position:"absolute",left:0,right:18,top:0,bottom:0,width:"calc(100% - 18px)",height:"100%",background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:11,fontWeight:600,fontFamily:F,fontVariantNumeric:"tabular-nums",textAlign:"center",padding:0,boxSizing:"border-box"}}/>
                                <div style={{position:"absolute",right:0,top:0,bottom:0,width:18,display:"flex",flexDirection:"column",borderLeft:`1px solid ${c.br}`}}>
                                  {[[1,"▲"],[-1,"▼"]].map(([delta,chr],i)=>(
                                    <button key={i} onClick={e=>{e.stopPropagation();setNewSessRandomCount(v=>Math.min(10,Math.max(1,v+delta)));}}
                                      onMouseEnter={e=>e.currentTarget.style.color=c.acL} onMouseLeave={e=>e.currentTarget.style.color=c.ts}
                                      style={{flex:1,width:18,background:"transparent",border:"none",color:c.ts,cursor:"default",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,lineHeight:1,fontFamily:F,padding:0,borderBottom:i===0?`1px solid ${c.br}`:"none",transition:"color 0.1s"}}>
                                      {chr}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* ─── Instruments + Date Range ─── */}
                          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:4}}>
                            {/* ── Full-width symbol display rectangle ── */}
                            <div style={{background:c.el,border:`1px solid ${c.brH}`,display:"flex",flexDirection:"column",cursor:"default",transition:"border-color 0.12s",width:"100%",boxSizing:"border-box"}}>
                              {/* TRADING section */}
                              <div style={{padding:"5px 10px 0"}}>
                                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                                    <div style={{width:2,height:8,background:c.acL,flexShrink:0,boxShadow:`0 0 4px ${c.acG}`}}/>
                                    <span style={{fontSize:10,fontWeight:800,color:c.ts,letterSpacing:"0.1em",fontFamily:F}}>TRADING</span>
                                    <div style={{position:"relative",display:"inline-flex",alignItems:"center"}}
                                      onMouseEnter={e=>{e.stopPropagation();setNewSessInfoHov("trading");}}
                                      onMouseLeave={()=>setNewSessInfoHov(null)}
                                      onClick={e=>e.stopPropagation()}>
                                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={c.tm} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block",cursor:"default",flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                      {newSessInfoHov==="trading"&&(
                                        <div style={{position:"absolute",left:0,bottom:"calc(100% + 6px)",background:c.el,border:`1px solid ${c.br}`,zIndex:10,whiteSpace:"nowrap",pointerEvents:"none"}}>
                                          <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                                          <div style={{padding:"5px 10px",fontSize:10,fontWeight:600,color:c.tx,fontFamily:F}}>Instruments you will actively trade in this session</div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                                    {newSessTickers.length>0&&(
                                      <div onClick={e=>{e.stopPropagation();setNewSessTickers([]);}}
                                        onMouseEnter={e=>{e.stopPropagation();setHov("prvTrdClr");}} onMouseLeave={()=>setHov(null)}
                                        style={{display:"flex",alignItems:"center",cursor:"default",color:hov==="prvTrdClr"?c.rd:c.tm,transition:"color 0.1s"}}>
                                        <I n="trashDraw" s={10} cl={hov==="prvTrdClr"?c.rd:c.tm}/>
                                      </div>
                                    )}
                                    <span style={{fontSize:10,fontWeight:700,color:c.tm,fontFamily:F}}>{newSessTickers.length||"—"}</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{padding:"4px 8px 6px",display:"flex",gap:5,alignItems:"flex-start"}}>
                                {/* Plus button — tall (2 tag rows) */}
                                <div style={{position:"relative",flexShrink:0}}>
                                  <div onClick={e=>{e.stopPropagation();if(newSessSymPickerOpen){setNewSessSymPickerOpen(false);}else{const r=e.currentTarget.getBoundingClientRect();setNewSessSymPickerPos({top:r.bottom/Z+2,left:r.left/Z});setNewSessSymPickerSearch("");setNewSessSymPickerOpen(true);}}}
                                    onMouseEnter={e=>{e.stopPropagation();setHov("symPickBtn");e.currentTarget.style.filter="brightness(1.12)";}}
                                    onMouseLeave={e=>{setHov(null);e.currentTarget.style.filter="brightness(1)";}}
                                    style={{width:26,height:40,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",transition:"filter 0.12s",flexShrink:0,boxShadow:"0 2px 8px rgba(38,67,247,0.35)"}}>
                                    <svg width={11} height={11} viewBox="0 0 12 12" fill="none">
                                      <line x1="6" y1="1" x2="6" y2="11" stroke="rgba(255,255,255,0.96)" strokeWidth="1.8" strokeLinecap="round"/>
                                      <line x1="1" y1="6" x2="11" y2="6" stroke="rgba(255,255,255,0.96)" strokeWidth="1.8" strokeLinecap="round"/>
                                    </svg>
                                  </div>
                                  {newSessSymPickerOpen&&(<>
                                    <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setNewSessSymPickerOpen(false);}}/>
                                    <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:newSessSymPickerPos.top,left:newSessSymPickerPos.left,width:160,maxHeight:240,display:"flex",flexDirection:"column",background:c.sf,border:"1px solid rgba(140,160,255,0.22)",boxShadow:"0 8px 28px rgba(0,0,0,0.7)",zIndex:9999}}>
                                      <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,flexShrink:0}}/>
                                      <div style={{padding:"5px 8px",borderBottom:`1px solid ${c.br}`,flexShrink:0}}>
                                        <input autoFocus value={newSessSymPickerSearch} onChange={e=>setNewSessSymPickerSearch(e.target.value)}
                                          placeholder="Search symbols…"
                                          style={{width:"100%",background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:10,fontWeight:600,fontFamily:F,padding:0,boxSizing:"border-box"}}/>
                                      </div>
                                      <div className="tlr-scroll" style={{overflowY:"auto",flex:1}}>
                                        {(()=>{
                                          const catKey=catMap[newSessAssetClass]||newSessAssetClass;
                                          const pool=allSymbols.filter(s=>s.cat===catKey&&(!newSessSymPickerSearch||s.sym.toLowerCase().includes(newSessSymPickerSearch.toLowerCase())));
                                          if(pool.length===0)return <div style={{padding:"8px 10px",fontSize:10,color:c.tm,fontFamily:F}}>No results</div>;
                                          return pool.map(s=>{
                                            const isChk=newSessTickers.includes(s.sym);
                                            const hk="spick_"+s.sym;const isH=hov===hk;
                                            const bCol=isChk?c.acL:isH?c.tx:c.ts;
                                            return(
                                              <div key={s.sym} onClick={()=>{if(isChk){setNewSessTickers(p=>p.filter(x=>x!==s.sym));}else if(newSessTickers.length<10){setNewSessTickers(p=>[...p,s.sym]);}}}
                                                onMouseEnter={()=>setHov(hk)} onMouseLeave={()=>setHov(null)}
                                                style={{display:"flex",alignItems:"center",padding:"4px 8px",gap:6,cursor:"default",opacity:!isChk&&newSessTickers.length>=10?0.35:1,background:isH&&(isChk||newSessTickers.length<10)?"rgba(255,255,255,0.04)":"transparent",transition:"background 0.08s,opacity 0.1s"}}>
                                                {/* TlChk-style bracket checkbox */}
                                                <svg width={10} height={10} style={{display:"block",overflow:"visible",flexShrink:0}}>
                                                  <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={bCol} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                                  <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={bCol} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                                  {!isChk&&isH&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.acL} strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.5}/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.acL} strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.5}/></>}
                                                  {isChk&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/><circle cx={5} cy={5} r={2.8} fill={c.acL} opacity={0.12}/><circle cx={5} cy={5} r={1.6} fill={c.acL}/></>}
                                                </svg>
                                                {mkFlags(s.sym,10)}
                                                <span style={{fontSize:10,fontWeight:isChk?700:500,color:isChk?c.acL:isH?c.tx:c.ts,fontFamily:F}}>{s.sym}</span>
                                              </div>
                                            );
                                          });
                                        })()}
                                      </div>
                                    </div>
                                  </>)}
                                </div>
                                {/* Tags — 5 per row, max 2 rows (10 symbols) */}
                                <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:3,alignContent:"flex-start"}}>
                                  {newSessTickers.length>0
                                    ?newSessTickers.slice(0,10).map(t=>mkCell(t,e=>{e.stopPropagation();setNewSessTickers(p=>p.filter(x=>x!==t));}))
                                    :<span style={{fontSize:9,color:c.tm,fontFamily:F,gridColumn:"1/-1",lineHeight:"40px"}}>—</span>
                                  }
                                </div>
                              </div>
                              {/* Divider */}
                              <div style={{height:1,background:c.brH}}/>
                              {/* SUPPORTING section */}
                              <div style={{padding:"5px 10px 0"}}>
                                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                                    <div style={{width:2,height:8,background:"rgba(232,194,82,0.8)",flexShrink:0,boxShadow:`0 0 4px rgba(232,194,82,0.3)`}}/>
                                    <div onClick={e=>{e.stopPropagation();setNewSessSupportEnabled(v=>!v);}}>
                                      {TlChk(newSessSupportEnabled,"supEnabledChk","",()=>{},"rgba(232,194,82,0.9)")}
                                    </div>
                                    <span style={{fontSize:10,fontWeight:800,color:c.ts,letterSpacing:"0.1em",fontFamily:F}}>SUPPORTING</span>
                                    <div style={{position:"relative",display:"inline-flex",alignItems:"center"}}
                                      onMouseEnter={e=>{e.stopPropagation();setNewSessInfoHov("supporting");}}
                                      onMouseLeave={()=>setNewSessInfoHov(null)}
                                      onClick={e=>e.stopPropagation()}>
                                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={c.tm} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block",cursor:"default",flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                      {newSessInfoHov==="supporting"&&(
                                        <div style={{position:"absolute",left:0,top:"calc(100% + 6px)",background:c.el,border:`1px solid ${c.br}`,zIndex:10,whiteSpace:"nowrap",pointerEvents:"none"}}>
                                          <div style={{height:2,background:`linear-gradient(90deg,rgba(232,194,82,0.3),rgba(232,194,82,0.8),rgba(232,194,82,0.3))`}}/>
                                          <div style={{padding:"5px 10px",fontSize:10,fontWeight:600,color:c.tx,fontFamily:F}}>View-only instruments for analysis — not tradeable</div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                                    {newSessSupportTickers.length>0&&(
                                      <div onClick={e=>{e.stopPropagation();setNewSessSupportTickers([]);}}
                                        onMouseEnter={e=>{e.stopPropagation();setHov("prvSupClr");}} onMouseLeave={()=>setHov(null)}
                                        style={{display:"flex",alignItems:"center",cursor:"default",color:hov==="prvSupClr"?c.rd:c.tm,transition:"color 0.1s"}}>
                                        <I n="trashDraw" s={10} cl={hov==="prvSupClr"?c.rd:c.tm}/>
                                      </div>
                                    )}
                                    <span style={{fontSize:10,fontWeight:700,color:c.tm,fontFamily:F}}>{newSessSupportTickers.length||"—"}</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{padding:"4px 8px 6px",display:"flex",gap:5,alignItems:"flex-start",opacity:newSessSupportEnabled?1:0.35,pointerEvents:newSessSupportEnabled?"auto":"none",transition:"opacity 0.15s"}}>
                                {/* Plus button — tall (2 tag rows) */}
                                <div style={{position:"relative",flexShrink:0}}>
                                  <div onClick={e=>{e.stopPropagation();if(newSessSupPickerOpen){setNewSessSupPickerOpen(false);}else{const r=e.currentTarget.getBoundingClientRect();setNewSessSupPickerPos({top:r.bottom/Z+2,left:r.left/Z});setNewSessSupPickerSearch("");setNewSessSymPickerOpen(false);setNewSessSupPickerOpen(true);}}}
                                    onMouseEnter={e=>{e.stopPropagation();e.currentTarget.style.filter="brightness(1.12)";}} onMouseLeave={e=>{e.currentTarget.style.filter="brightness(1)";}}
                                    style={{width:26,height:40,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#a07000,#e8c252)",cursor:"default",transition:"filter 0.12s",flexShrink:0,boxShadow:"0 2px 8px rgba(200,150,0,0.35)"}}>
                                    <svg width={11} height={11} viewBox="0 0 12 12" fill="none">
                                      <line x1="6" y1="1" x2="6" y2="11" stroke="rgba(255,255,255,0.96)" strokeWidth="1.8" strokeLinecap="round"/>
                                      <line x1="1" y1="6" x2="11" y2="6" stroke="rgba(255,255,255,0.96)" strokeWidth="1.8" strokeLinecap="round"/>
                                    </svg>
                                  </div>
                                  {newSessSupPickerOpen&&(<>
                                    <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setNewSessSupPickerOpen(false);}}/>
                                    <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:newSessSupPickerPos.top,left:newSessSupPickerPos.left,width:170,maxHeight:280,display:"flex",flexDirection:"column",background:c.sf,border:"1px solid rgba(232,194,82,0.22)",boxShadow:"0 8px 28px rgba(0,0,0,0.7)",zIndex:9999}}>
                                      <div style={{height:2,background:"linear-gradient(90deg,rgba(232,194,82,0.3),rgba(232,194,82,0.8),rgba(232,194,82,0.3))",flexShrink:0}}/>
                                      {/* Category tabs */}
                                      <div style={{display:"flex",borderBottom:`1px solid ${c.br}`,flexShrink:0}}>
                                        {["Forex","Futures","Crypto","Stocks"].map(cat=>{
                                          const isA=newSessSupPickerCat===cat;
                                          const hk="supCatTab_"+cat;const isH=hov===hk;
                                          return(
                                            <div key={cat} onClick={()=>{setNewSessSupPickerCat(cat);setNewSessSupPickerSearch("");}}
                                              onMouseEnter={()=>setHov(hk)} onMouseLeave={()=>setHov(null)}
                                              style={{flex:1,padding:"4px 0",textAlign:"center",fontSize:8,fontWeight:isA?700:500,color:isA?"rgba(232,194,82,0.9)":isH?c.tx:c.tm,cursor:"default",transition:"color 0.1s",position:"relative",fontFamily:F,letterSpacing:"0.04em"}}>
                                              {cat}
                                              {isA&&<div style={{position:"absolute",bottom:0,left:"10%",right:"10%",height:1,background:"linear-gradient(90deg,transparent,rgba(232,194,82,0.8),transparent)"}}/>}
                                            </div>
                                          );
                                        })}
                                      </div>
                                      <div style={{padding:"5px 8px",borderBottom:`1px solid ${c.br}`,flexShrink:0}}>
                                        <input autoFocus value={newSessSupPickerSearch} onChange={e=>setNewSessSupPickerSearch(e.target.value)}
                                          placeholder="Search symbols…"
                                          style={{width:"100%",background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:10,fontWeight:600,fontFamily:F,padding:0,boxSizing:"border-box"}}/>
                                      </div>
                                      <div className="tlr-scroll" style={{overflowY:"auto",flex:1}}>
                                        {(()=>{
                                          const catKey=catMap[newSessSupPickerCat]||newSessSupPickerCat;
                                          const pool=allSymbols.filter(s=>s.cat===catKey&&(!newSessSupPickerSearch||s.sym.toLowerCase().includes(newSessSupPickerSearch.toLowerCase())));
                                          if(pool.length===0)return <div style={{padding:"8px 10px",fontSize:10,color:c.tm,fontFamily:F}}>No results</div>;
                                          return pool.map(s=>{
                                            const isChk=newSessSupportTickers.includes(s.sym);
                                            const hk="suppick_"+s.sym;const isH=hov===hk;
                                            const bCol=isChk?"rgba(232,194,82,0.9)":isH?c.tx:c.ts;
                                            return(
                                              <div key={s.sym} onClick={()=>{if(isChk){setNewSessSupportTickers(p=>p.filter(x=>x!==s.sym));}else if(newSessSupportTickers.length<10){setNewSessSupportTickers(p=>[...p,s.sym]);}}}
                                                onMouseEnter={()=>setHov(hk)} onMouseLeave={()=>setHov(null)}
                                                style={{display:"flex",alignItems:"center",padding:"4px 8px",gap:6,cursor:"default",opacity:!isChk&&newSessSupportTickers.length>=10?0.35:1,background:isH&&(isChk||newSessSupportTickers.length<10)?"rgba(255,255,255,0.04)":"transparent",transition:"background 0.08s,opacity 0.1s"}}>
                                                <svg width={10} height={10} style={{display:"block",overflow:"visible",flexShrink:0}}>
                                                  <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={bCol} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                                  <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={bCol} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                                  {!isChk&&isH&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke="rgba(232,194,82,0.5)" strokeWidth={1} fill="none" strokeLinecap="square"/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke="rgba(232,194,82,0.5)" strokeWidth={1} fill="none" strokeLinecap="square"/></>}
                                                  {isChk&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke="rgba(232,194,82,0.9)" strokeWidth={1.3} fill="none" strokeLinecap="square"/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke="rgba(232,194,82,0.9)" strokeWidth={1.3} fill="none" strokeLinecap="square"/><circle cx={5} cy={5} r={2.8} fill="rgba(232,194,82,0.85)" opacity={0.15}/><circle cx={5} cy={5} r={1.6} fill="rgba(232,194,82,0.85)"/></>}
                                                </svg>
                                                {mkFlags(s.sym,10)}
                                                <span style={{fontSize:10,fontWeight:isChk?700:500,color:isChk?"rgba(232,194,82,0.9)":isH?c.tx:c.ts,fontFamily:F}}>{s.sym}</span>
                                              </div>
                                            );
                                          });
                                        })()}
                                      </div>
                                    </div>
                                  </>)}
                                </div>
                                {/* Tags — 5 per row, max 2 rows (10 symbols) */}
                                <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:3,alignContent:"flex-start"}}>
                                  {newSessSupportTickers.length>0
                                    ?newSessSupportTickers.slice(0,10).map(t=>mkCell(t,e=>{e.stopPropagation();setNewSessSupportTickers(p=>p.filter(x=>x!==t));}))
                                    :<span style={{fontSize:9,color:c.tm,fontFamily:F,gridColumn:"1/-1",lineHeight:"40px"}}>—</span>
                                  }
                                </div>
                              </div>
                            </div>
                            {/* ── Date Range row ── */}
                            <div>
                              {lbl("Date Range *")}
                              <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                                {/* Date inputs — 50% width matches market dropdown above */}
                                <div style={{width:"50%",flexShrink:0,display:"flex",gap:6}}>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontSize:9,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4,fontFamily:F}}>Start</div>
                                    <div style={{display:"flex",alignItems:"center",background:c.well,border:`1px solid ${newSessCalOpen&&newSessCalTarget==="start"?c.acL:c.brH}`,transition:"border-color 0.12s"}}>
                                      <input value={newSessStartInput} placeholder="DD-Mon-YYYY" onClick={e=>e.stopPropagation()}
                                        onChange={e=>{setNewSessStartInput(e.target.value);applyD(e.target.value,setNewSessStart);setNewSessActivePreset(null);}}
                                        onBlur={()=>{if(newSessStart)setNewSessStartInput(fmtD(newSessStart));}}
                                        style={inpSx}/>
                                      <div onClick={e=>{e.stopPropagation();if(newSessCalOpen&&newSessCalTarget==="start"){setNewSessCalOpen(false);}else{openCal(e,"start",newSessStart);}}} style={chvSx}>
                                        <ChevD open={newSessCalOpen&&newSessCalTarget==="start"}/>
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontSize:9,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4,fontFamily:F}}>End</div>
                                    <div style={{display:"flex",alignItems:"center",background:c.well,border:`1px solid ${newSessCalOpen&&newSessCalTarget==="end"?c.acL:(newSessEnd&&newSessStart&&newSessEnd<newSessStart?c.rd:c.brH)}`,transition:"border-color 0.12s"}}>
                                      <input value={newSessEndInput} placeholder="DD-Mon-YYYY" onClick={e=>e.stopPropagation()}
                                        onChange={e=>{setNewSessEndInput(e.target.value);applyD(e.target.value,v=>{if(!newSessStart||v>=newSessStart)setNewSessEnd(v);});setNewSessActivePreset(null);}}
                                        onBlur={()=>{if(newSessEnd&&newSessStart&&newSessEnd<newSessStart){setNewSessEnd("");setNewSessEndInput("");}else if(newSessEnd){setNewSessEndInput(fmtD(newSessEnd));}}}
                                        style={inpSx}/>
                                      <div onClick={e=>{e.stopPropagation();if(newSessCalOpen&&newSessCalTarget==="end"){setNewSessCalOpen(false);}else{openCal(e,"end",newSessEnd);}}} style={chvSx}>
                                        <ChevD open={newSessCalOpen&&newSessCalTarget==="end"}/>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                {/* Right section aligned with Markets row right section */}
                                <div style={{display:"flex",alignItems:"center",gap:4}}>
                                  {/* Date Random button */}
                                  <div onClick={e=>{e.stopPropagation();randomRange();}}
                                    onMouseEnter={()=>setHov("drndBtn")} onMouseLeave={()=>setHov(null)}
                                    style={{padding:"0 10px",height:27,display:"flex",alignItems:"center",gap:6,background:c.el,border:`1px solid ${hov==="drndBtn"?c.acB:c.brH}`,cursor:"default",fontSize:10,fontWeight:700,color:hov==="drndBtn"?c.acL:c.ts,letterSpacing:"0.06em",fontFamily:F,flexShrink:0,whiteSpace:"nowrap",transition:"color 0.12s,border-color 0.12s"}}>
                                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
                                      <polyline points="16,3 21,3 21,8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                                      <polyline points="21,16 21,21 16,21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                                      <line x1="4" y1="20" x2="21" y2="3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                                      <line x1="4" y1="4" x2="9" y2="9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                                      <line x1="15" y1="15" x2="21" y2="21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                                    </svg>
                                    Random
                                  </div>
                                  {/* Range count spinner */}
                                  <div style={{position:"relative",width:49,height:27,background:c.el,border:`1px solid ${c.brH}`,boxSizing:"border-box",flexShrink:0}}>
                                    <input type="number" min={1} max={unitMax[newSessRandRangeUnit]} value={newSessRandRangeVal}
                                      onChange={e=>setNewSessRandRangeVal(Math.min(unitMax[newSessRandRangeUnit],Math.max(1,parseInt(e.target.value)||1)))}
                                      onClick={e=>e.stopPropagation()}
                                      className="tlr-nospinner"
                                      style={{position:"absolute",left:0,right:18,top:0,bottom:0,width:"calc(100% - 18px)",height:"100%",background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:11,fontWeight:600,fontFamily:F,fontVariantNumeric:"tabular-nums",textAlign:"center",padding:0,boxSizing:"border-box"}}/>
                                    <div style={{position:"absolute",right:0,top:0,bottom:0,width:18,display:"flex",flexDirection:"column",borderLeft:`1px solid ${c.br}`}}>
                                      {[[1,"▲"],[-1,"▼"]].map(([delta,chr],i)=>(
                                        <button key={i} onClick={e=>{e.stopPropagation();setNewSessRandRangeVal(v=>Math.min(unitMax[newSessRandRangeUnit],Math.max(1,v+delta)));}}
                                          onMouseEnter={e=>e.currentTarget.style.color=c.acL} onMouseLeave={e=>e.currentTarget.style.color=c.ts}
                                          style={{flex:1,width:18,background:"transparent",border:"none",color:c.ts,cursor:"default",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,lineHeight:1,fontFamily:F,padding:0,borderBottom:i===0?`1px solid ${c.br}`:"none",transition:"color 0.1s"}}>
                                          {chr}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  {/* Unit dropdown — Days / Months / Years */}
                                  {(()=>{
                                    const UNITS=[["D","Days"],["M","Months"],["Y","Years"]];
                                    const curLabel=UNITS.find(([u])=>u===newSessRandRangeUnit)?.[1]||"Months";
                                    const ddKey="randUnitDrop";
                                    return(
                                      <div style={{position:"relative",width:88,flexShrink:0}}>
                                        <div onClick={e=>{e.stopPropagation();if(dropdown===ddKey){setDropdown(null);setDdAnchor(null);}else{const r=e.currentTarget.getBoundingClientRect();setDdAnchor({top:r.bottom/Z+2,left:r.left/Z,width:r.width/Z});setDropdown(ddKey);}}}
                                          style={{height:27,display:"flex",alignItems:"center",padding:"0 22px 0 8px",position:"relative",background:c.el,border:`1px solid ${dropdown===ddKey?c.acB:c.brH}`,cursor:"default",userSelect:"none",boxSizing:"border-box",transition:"border-color 0.12s"}}>
                                          <span style={{fontSize:10,fontWeight:600,color:c.tx,fontFamily:F}}>{curLabel}</span>
                                          <svg style={{position:"absolute",right:6,top:"50%",transform:`translateY(-50%) rotate(${dropdown===ddKey?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        </div>
                                        {dropdown===ddKey&&ddAnchor&&(<>
                                          <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setDropdown(null);setDdAnchor(null);}}/>
                                          <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,width:ddAnchor.width,zIndex:9999,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:"0 8px 24px rgba(0,0,0,0.6)"}}>
                                            <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                                            {UNITS.map(([u,label])=>{
                                              const isA=newSessRandRangeUnit===u;const isH=hov==="ruOpt_"+u;
                                              return(
                                                <div key={u} onClick={e=>{e.stopPropagation();setNewSessRandRangeUnit(u);setNewSessRandRangeVal(v=>Math.min(unitMax[u],Math.max(1,v)));setDropdown(null);setDdAnchor(null);}}
                                                  onMouseEnter={()=>setHov("ruOpt_"+u)} onMouseLeave={()=>setHov(null)}
                                                  style={{display:"flex",alignItems:"center",padding:"4px 10px",cursor:"default",position:"relative",background:isA?c.acD:isH?"rgba(255,255,255,0.03)":"transparent",transition:"background 0.1s"}}>
                                                  {isA&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
                                                  <span style={{fontSize:10,fontWeight:isA?700:500,color:isA?c.acL:isH?c.tx:c.ts,fontFamily:F}}>{label}</span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </>)}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>{/* end date range wrapper */}

                            {/* ── Preset chips ── */}
                            <div style={{display:"flex",gap:4}}>
                              {presets.map(p=>{
                                const isA=newSessActivePreset===p.l;const hk="preset_"+p.l;const isH=hov===hk;
                                return(
                                  <div key={p.l} onClick={e=>{e.stopPropagation();applyPreset(p.months,p.years);setNewSessCalOpen(false);setNewSessActivePreset(p.l);}}
                                    onMouseEnter={()=>setHov(hk)} onMouseLeave={()=>setHov(null)}
                                    style={{height:27,padding:"0 10px",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",
                                      fontSize:10,fontWeight:isA?700:600,letterSpacing:"0.03em",fontFamily:F,
                                      color:isA?c.acL:isH?c.tx:c.ts,
                                      background:isA?"rgba(74,106,255,0.08)":isH?"rgba(255,255,255,0.05)":"transparent",
                                      cursor:"default",transition:"background 0.12s,color 0.12s"}}>
                                    {p.l}
                                    {isA&&<div style={{position:"absolute",bottom:0,left:"20%",right:"20%",height:2,background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`,pointerEvents:"none"}}/>}
                                    {!isA&&isH&&<div style={{position:"absolute",bottom:0,left:"25%",right:"25%",height:1,background:`linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)`,pointerEvents:"none"}}/>}
                                  </div>
                                );
                              })}
                            </div>
                            <div style={{marginTop:6,fontSize:9,color:c.tm,fontFamily:F}}>
                              {filesLoading
                                ? "Loading dataset metadata..."
                                : filesError
                                  ? filesError
                                  : (availableStartIso && availableEndIso)
                                    ? `Available from selected datasets: ${availableStartIso} -> ${availableEndIso}`
                                    : "Select at least one dataset to enable real date bounds."}
                            </div>
                            {!primaryEffectiveFile && (
                              <div style={{marginTop:4,fontSize:9,color:c.rd,fontFamily:F}}>
                                No dataset linked to selected trading pair(s). Use the + picker to select datasets.
                              </div>
                            )}
                          </div>
                          {/* ─── Timezone row ─── */}
                          {(()=>{
                            const TZ_OPTS=[
                              {val:"UTC",          label:"UTC / GMT"},
                              {val:"America/New_York",   label:"New York (ET)"},
                              {val:"America/Chicago",    label:"Chicago (CT)"},
                              {val:"America/Los_Angeles",label:"Los Angeles (PT)"},
                              {val:"Europe/London",      label:"London (GMT/BST)"},
                              {val:"Europe/Berlin",      label:"Frankfurt (CET/CEST)"},
                              {val:"Asia/Tokyo",         label:"Tokyo (JST)"},
                              {val:"Asia/Shanghai",      label:"Shanghai (CST)"},
                              {val:"Australia/Sydney",   label:"Sydney (AEST/AEDT)"},
                              {val:"Pacific/Auckland",   label:"Auckland (NZST/NZDT)"},
                            ];
                            const tzLabel=TZ_OPTS.find(o=>o.val===newSessTimezone)?.label||newSessTimezone;
                            const tzDdKey="sessTimezDrop";
                            return(
                              <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                                {/* Timezone row */}
                                <div style={{height:27,display:"flex",alignItems:"center",gap:10}}>
                                  <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap",flexShrink:0,width:130}}>Time Zone</span>
                                  <div style={{position:"relative",width:170}}>
                                    <div onClick={e=>{e.stopPropagation();if(dropdown===tzDdKey){setDropdown(null);setDdAnchor(null);}else{const r=e.currentTarget.getBoundingClientRect();setDdAnchor({top:r.bottom/Z+2,left:r.left/Z,width:Math.max(r.width/Z,200)});setDropdown(tzDdKey);}}}
                                      style={{height:27,display:"flex",alignItems:"center",padding:"0 24px 0 8px",position:"relative",background:c.el,border:`1px solid ${dropdown===tzDdKey?c.acB:c.brH}`,cursor:"default",userSelect:"none",boxSizing:"border-box",transition:"border-color 0.12s"}}>
                                      <span style={{fontSize:10,fontWeight:600,color:c.tx,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tzLabel}</span>
                                      <svg style={{position:"absolute",right:7,top:"50%",transform:`translateY(-50%) rotate(${dropdown===tzDdKey?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    </div>
                                    {dropdown===tzDdKey&&ddAnchor&&(<>
                                      <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setDropdown(null);setDdAnchor(null);}}/>
                                      <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,width:ddAnchor.width,zIndex:9999,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:"0 8px 28px rgba(0,0,0,0.7)"}}>
                                        <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                                        {TZ_OPTS.map(({val,label})=>{
                                          const isA=newSessTimezone===val;const isH=hov==="tzOpt_"+val;
                                          return(
                                            <div key={val} onClick={e=>{e.stopPropagation();setNewSessTimezone(val);setDropdown(null);setDdAnchor(null);}}
                                              onMouseEnter={()=>setHov("tzOpt_"+val)} onMouseLeave={()=>setHov(null)}
                                              style={{display:"flex",alignItems:"center",padding:"4px 10px",cursor:"default",position:"relative",background:isA?c.acD:isH?"rgba(255,255,255,0.03)":"transparent",transition:"background 0.1s"}}>
                                              {isA&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
                                              <span style={{fontSize:10,fontWeight:isA?700:500,color:isA?c.acL:isH?c.tx:c.ts,fontFamily:F}}>{label}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </>)}
                                  </div>
                                </div>
                                {/* DST toggle */}
                                <div style={{height:27,display:"flex",alignItems:"center",gap:8,cursor:"default"}} onClick={()=>setNewSessDST(v=>!v)}>
                                  {TlChk(newSessDST,"chk_dst","",null)}
                                  <span style={{fontSize:10,fontWeight:600,color:newSessDST?c.ts:c.tm,fontFamily:F,transition:"color 0.12s",whiteSpace:"nowrap"}}>Daylight Saving</span>
                                </div>
                              </div>
                            );
                          })()}
                        </>);
                      })()}
                      </div>

                      {/* § Options */}
                      <div style={{border:`1px solid ${sessSettingsDone?c.brH:c.br}`,padding:"12px 14px",transition:"opacity 0.2s,border-color 0.2s",...(sessSettingsDone?activeBox:lockedBox)}}>
                      {secH("Options")}
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        <div style={{height:27,display:"flex",alignItems:"center",gap:8,cursor:"default"}} onClick={()=>setNewSessAdvancedOrder(v=>!v)}>
                          {TlChk(newSessAdvancedOrder,"chk_advOrd","",null)}
                          <span style={{fontSize:10,fontWeight:600,color:newSessAdvancedOrder?c.ts:c.tm,fontFamily:F,transition:"color 0.12s"}}>Advanced order</span>
                          <span style={{fontSize:9,color:c.tm,fontFamily:F}}>— multiple entries, auto move-to-BE, trailing stop</span>
                        </div>
                        <div style={{height:27,display:"flex",alignItems:"center",gap:8,cursor:"default"}} onClick={()=>setNewSessRollback(v=>!v)}>
                          {TlChk(newSessRollback,"chk_rollback","",null)}
                          <span style={{fontSize:10,fontWeight:600,color:newSessRollback?c.ts:c.tm,fontFamily:F,transition:"color 0.12s"}}>Roll back</span>
                          <span style={{fontSize:9,color:c.tm,fontFamily:F}}>— step backward through bars during replay</span>
                        </div>
                        <div>
                          <div style={{height:27,display:"flex",alignItems:"center",gap:8,cursor:"default"}} onClick={()=>setNewSessTradingCostsEnabled(v=>!v)}>
                            {TlChk(newSessTradingCostsEnabled,"tcToggle2","",null)}
                            <span style={{fontSize:10,fontWeight:600,color:newSessTradingCostsEnabled?c.ts:c.tm,fontFamily:F,transition:"color 0.12s"}}>Real-World Trading Costs</span>
                            <span style={{fontSize:9,color:c.tm,fontFamily:F}}>— spreads & commissions</span>
                            <div style={{position:"relative",flexShrink:0}} onMouseEnter={()=>setHov("tcInfo2")} onMouseLeave={()=>setHov(null)}>
                              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={hov==="tcInfo2"?c.acL:c.tm} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block",cursor:"default",transition:"stroke 0.12s"}}>
                                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                              </svg>
                              {hov==="tcInfo2"&&(
                                <div style={{position:"absolute",left:"calc(100% + 8px)",top:"50%",transform:"translateY(-50%)",width:260,background:c.el,border:`1px solid ${c.br}`,zIndex:9999,pointerEvents:"none",whiteSpace:"normal"}}>
                                  <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                                  <div style={{padding:"7px 10px",display:"flex",flexDirection:"column",gap:4}}>
                                    <span style={{fontSize:9,fontWeight:600,color:c.tx,fontFamily:F,lineHeight:1.45}}>Applies spread, commission, and leverage to every simulated trade.</span>
                                    <span style={{fontSize:9,color:c.ts,fontFamily:F,lineHeight:1.5}}>Values are typical — real spreads during high-impact news can be wider than configured.</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          {newSessTradingCostsEnabled&&(()=>{
                            const symCat={EURUSD:"Forex",GBPUSD:"Forex",USDJPY:"Forex",USDCHF:"Forex",AUDUSD:"Forex",NZDUSD:"Forex",USDCAD:"Forex",EURGBP:"Forex",EURJPY:"Forex",GBPJPY:"Forex",XAUUSD:"Forex",XAGUSD:"Forex",USDSEK:"Forex",USDNOK:"Forex",NQ:"Futures",ES:"Futures",YM:"Futures",RTY:"Futures",CL:"Futures",GC:"Futures",SI:"Futures",NG:"Futures",MNQ:"Futures",MES:"Futures",MYM:"Futures",M2K:"Futures",MGC:"Futures",MCL:"Futures",BTCUSD:"Crypto",ETHUSD:"Crypto",BNBUSD:"Crypto",SOLUSD:"Crypto",ADAUSD:"Crypto",XRPUSD:"Crypto",DOGEUSD:"Crypto",AAPL:"Stocks",TSLA:"Stocks",NVDA:"Stocks",MSFT:"Stocks",AMZN:"Stocks",GOOG:"Stocks"};
                            const assetOf=cat=>({"Equities":"Stocks"}[cat]||cat);
                            const catOf2=sym=>assetOf(symCat[sym] || availFiles.find(f=>f.ticker===sym)?.asset || "");
                            const pairInfo2=sym=>{if(sym.length===6){const b=sym.slice(0,3),q=sym.slice(3,6);if(currencyCountry[b]&&currencyCountry[q])return{b,q};}return null;};
                            const mkFlags2=sym=>{
                              const sz=10,fw=Math.round(sz*15/11),fh=sz;
                              const pr=pairInfo2(sym);
                              if(pr)return(<div style={{position:"relative",width:Math.round(sz*22/11),height:fh,flexShrink:0}}><div style={{position:"absolute",left:0,top:0,borderRadius:1,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.7)",zIndex:2}}><FlagSvg code={pr.b} w={fw} h={fh}/></div><div style={{position:"absolute",left:Math.round(sz*7/11),top:0,borderRadius:1,overflow:"hidden",boxShadow:"0 1px 2px rgba(0,0,0,0.5)",zIndex:1}}><FlagSvg code={pr.q} w={fw} h={fh}/></div></div>);
                              const metalMap={XAUUSD:{bg:"#2B2200",fg:"#FFD700",label:"Au"},XAGUSD:{bg:"#1C2028",fg:"#C8D4E0",label:"Ag"},GC:{bg:"#2B2200",fg:"#FFD700",label:"GC"},SI:{bg:"#1C2028",fg:"#C8D4E0",label:"SI"},CL:{bg:"#0D1A12",fg:"#4CAF50",label:"CL"},NG:{bg:"#0A1020",fg:"#64B5F6",label:"NG"},MGC:{bg:"#1A1200",fg:"#FFBA00",label:"mGC"},MCL:{bg:"#071510",fg:"#33CC66",label:"mCL"}};
                              if(metalMap[sym]){const m=metalMap[sym];return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:1,boxShadow:"0 1px 3px rgba(0,0,0,0.6)"}}><rect width={fw} height={fh} fill={m.bg}/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill={m.fg} fontSize={fh*0.52} fontWeight="800" fontFamily={F}>{m.label}</text></svg>);}
                              const cryptoMap={BTCUSD:{bg:"#E8820C",fg:"#fff",label:"₿"},ETHUSD:{bg:"#3D4FC4",fg:"#fff",label:"Ξ"},BNBUSD:{bg:"#C99800",fg:"#000",label:"B"},SOLUSD:{bg:"#7B3FBE",fg:"#fff",label:"S"},ADAUSD:{bg:"#0033AD",fg:"#fff",label:"A"}};
                              if(cryptoMap[sym]){const cr=cryptoMap[sym];return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:Math.round(fh*0.35),boxShadow:"0 1px 3px rgba(0,0,0,0.6)"}}><rect width={fw} height={fh} rx={Math.round(fh*0.35)} fill={cr.bg}/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill={cr.fg} fontSize={fh*0.58} fontWeight="900" fontFamily={F}>{cr.label}</text></svg>);}
                              const genericLabel=(sym||"").replace(/USDT|USDC|USD$/,"").replace(/[^A-Z0-9]/g,"").slice(0,3)||"?";
                              return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:Math.round(fh*0.35),boxShadow:"0 1px 3px rgba(0,0,0,0.6)"}}><rect width={fw} height={fh} rx={Math.round(fh*0.35)} fill="#22324A"/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill="#D7E6FF" fontSize={fh*0.45} fontWeight="800" fontFamily={F}>{genericLabel}</text></svg>);
                            };
                            const mkArrows=(onUp,onDown)=>(
                              <div style={{position:"absolute",right:0,top:0,bottom:0,width:16,display:"flex",flexDirection:"column",borderLeft:`1px solid ${c.br}`}}>
                                {[[onUp,"▲"],[onDown,"▼"]].map(([fn,ch],ii)=>(
                                  <button key={ii} onClick={fn}
                                    onMouseEnter={e=>e.currentTarget.style.color=c.acL} onMouseLeave={e=>e.currentTarget.style.color=c.ts}
                                    style={{flex:1,width:16,background:"transparent",border:"none",color:c.ts,cursor:"default",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,lineHeight:1,fontFamily:F,padding:0,borderBottom:ii===0?`1px solid ${c.br}`:"none",transition:"color 0.1s"}}>
                                    {ch}
                                  </button>
                                ))}
                              </div>
                            );
                            const numCell=(val,onChange,step,w=52)=>(
                              <div style={{position:"relative",width:w,height:20,flexShrink:0,background:c.bg,border:`1px solid ${c.brH}`,boxSizing:"border-box"}}>
                                <input type="number" min={0} step={step} value={val} onChange={onChange} onClick={e=>e.stopPropagation()} className="tlr-nospinner"
                                  style={{position:"absolute",left:0,right:16,top:0,bottom:0,width:`calc(100% - 16px)`,height:"100%",background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:10,fontWeight:700,fontFamily:F,fontVariantNumeric:"tabular-nums",textAlign:"center",padding:0,boxSizing:"border-box"}}/>
                                {mkArrows(
                                  ()=>onChange({target:{value:String(Math.max(0,Math.round((parseFloat(val||0)+step)*1e6)/1e6))}}),
                                  ()=>onChange({target:{value:String(Math.max(0,Math.round((parseFloat(val||0)-step)*1e6)/1e6))}})
                                )}
                              </div>
                            );
                            const costMeta={
                              Forex:   {color:c.ts,label:"FOREX",   spreadUnit:"pips",   commUnit:"$/lot RT",commLabel:"Commission",spreadStep:0.1, commStep:0.5,  levOpts:["1:1","1:10","1:30","1:50","1:100","1:200","1:500"],defLev:"1:500",perSymComm:false},
                              Futures: {color:c.ts,label:"FUTURES",spreadUnit:"ticks",  commUnit:"$/RT",   commLabel:"Commission",spreadStep:1,   commStep:0.01, levOpts:[],                                                 defLev:"1:20", perSymComm:true, hideLev:true},
                              Stocks:  {color:c.ts,label:"STOCKS", spreadUnit:"$/share",commUnit:"$/share",commLabel:"Commission",spreadStep:0.01,commStep:0.001,levOpts:["1:1","1:2","1:3","1:5","1:10"],                   defLev:"1:5",  perSymComm:false,hideLev:true},
                              Crypto:  {color:c.ts,label:"CRYPTO", spreadUnit:"%",      commUnit:"%",      commLabel:"Taker Fee",  spreadStep:0.001,commStep:0.01,levOpts:["1:1","1:2","1:5","1:10","1:20","1:25","1:50","1:75","1:100","1:125"],defLev:"1:20",perSymComm:false},
                            };
                            const defaultComms={Forex:"7.00",Futures:"2.10",Stocks:"0.005",Crypto:"0.05"};
                            const defaultLevs={Forex:"1:500",Futures:"1:20",Stocks:"1:5",Crypto:"1:20"};
                            const defFut={NQ:{commission:"2.10",dayMargin:"1000",overnightMargin:"20680"},ES:{commission:"2.10",dayMargin:"500",overnightMargin:"13970"},YM:{commission:"2.10",dayMargin:"500",overnightMargin:"9075"},RTY:{commission:"2.10",dayMargin:"500",overnightMargin:"6600"},CL:{commission:"2.10",dayMargin:"1000",overnightMargin:"6000"},GC:{commission:"2.10",dayMargin:"1500",overnightMargin:"10000"},SI:{commission:"2.10",dayMargin:"2000",overnightMargin:"14000"},NG:{commission:"2.10",dayMargin:"500",overnightMargin:"2000"},MNQ:{commission:"2.10",dayMargin:"100",overnightMargin:"2068"},MES:{commission:"2.10",dayMargin:"50",overnightMargin:"1397"},MYM:{commission:"2.10",dayMargin:"50",overnightMargin:"908"},M2K:{commission:"2.10",dayMargin:"50",overnightMargin:"660"},MGC:{commission:"2.10",dayMargin:"150",overnightMargin:"1000"},MCL:{commission:"2.10",dayMargin:"100",overnightMargin:"600"}};
                            const getFd=sym=>({...(defFut[sym]||{commission:"2.10",dayMargin:"500",overnightMargin:"5000"}),...(newSessFuturesData[sym]||{})});
                            const setFd=(sym,key,val)=>setNewSessFuturesData(p=>({...p,[sym]:{...getFd(sym),[key]:val}}));
                            const tickSpec={NQ:{sz:"0.25 pt",val:"$5.00"},ES:{sz:"0.25 pt",val:"$12.50"},YM:{sz:"1 pt",val:"$5.00"},RTY:{sz:"0.10 pt",val:"$5.00"},CL:{sz:"$0.01",val:"$10.00"},GC:{sz:"$0.10",val:"$10.00"},SI:{sz:"$0.005",val:"$25.00"},NG:{sz:"$0.001",val:"$10.00"},MNQ:{sz:"0.25 pt",val:"$0.50"},MES:{sz:"0.25 pt",val:"$1.25"},MYM:{sz:"1 pt",val:"$0.50"},M2K:{sz:"0.10 pt",val:"$0.50"},MGC:{sz:"$0.10",val:"$1.00"},MCL:{sz:"$0.01",val:"$1.00"}};
                            const catOrder=["Forex","Futures","Stocks","Crypto"];
                            const activeCostCats=[...new Set([...newSessTickers.map(catOf2),...newSessSupportTickers.map(catOf2)])].filter(a=>costMeta[a]).sort((a,b)=>catOrder.indexOf(a)-catOrder.indexOf(b));
                            const defaultSpread={EURUSD:"0.8",GBPUSD:"1.0",USDJPY:"0.8",USDCHF:"1.1",AUDUSD:"0.8",NZDUSD:"1.2",USDCAD:"1.1",EURGBP:"1.1",EURJPY:"1.3",GBPJPY:"1.9",XAUUSD:"0.30",XAGUSD:"0.03",USDSEK:"3.0",USDNOK:"3.5",NQ:"1",ES:"1",YM:"1",RTY:"1",CL:"1",GC:"1",SI:"1",NG:"1",MNQ:"1",MES:"1",MYM:"1",M2K:"1",MGC:"1",MCL:"1",AAPL:"0.01",TSLA:"0.01",NVDA:"0.01",MSFT:"0.01",AMZN:"0.01",GOOG:"0.02",BTCUSD:"0.01",ETHUSD:"0.01",BNBUSD:"0.03",SOLUSD:"0.04",ADAUSD:"0.08"};
                            const getSpread=sym=>newSessSymbolSpreads[sym]??defaultSpread[sym]??"0";
                            const setSpread=(sym,val)=>setNewSessSymbolSpreads(p=>({...p,[sym]:val}));
                            if(activeCostCats.length===0){return(<div style={{background:c.el,border:`1px solid ${c.br}`,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c.tm} strokeWidth="1.5"/><line x1="12" y1="8" x2="12" y2="12" stroke={c.tm} strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="16" r="1" fill={c.tm}/></svg><span style={{fontSize:9,color:c.tm,fontFamily:F}}>Select instruments above to configure trading costs</span></div>);}
                            return(
                              <div style={{background:c.el,border:`1px solid ${c.br}`}}>
                                <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                                {activeCostCats.map((asset,i)=>{
                                  const meta=costMeta[asset];
                                  const row=newSessCosts[asset]||{commission:defaultComms[asset],leverage:meta.defLev};
                                  const setComm=val=>setNewSessCosts(p=>({...p,[asset]:{...p[asset],commission:val}}));
                                  const setLev=val=>setNewSessCosts(p=>({...p,[asset]:{...p[asset],leverage:val}}));
                                  const assetSyms=[...new Set([...newSessTickers.filter(t=>catOf2(t)===asset),...newSessSupportTickers.filter(t=>catOf2(t)===asset)])];
                                  const showCommRow=!meta.perSymComm||!meta.hideLev;
                                  return(
                                    <div key={asset} style={{padding:"8px 12px",borderBottom:i<activeCostCats.length-1?`1px solid ${c.br}`:"none"}}>
                                      <div style={{display:"flex",alignItems:"center",marginBottom:showCommRow?5:assetSyms.length>0?6:0}}>
                                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                                          <div style={{width:2,height:9,background:c.acL,flexShrink:0,boxShadow:`0 0 4px ${c.acG}`}}/>
                                          <span style={{fontSize:10,fontWeight:800,color:c.acL,letterSpacing:"0.09em",fontFamily:F}}>{meta.label}</span>
                                        </div>
                                        <div onClick={e=>{e.stopPropagation();setComm(defaultComms[asset]);setLev(defaultLevs[asset]);setNewSessSymbolSpreads(p=>{const n={...p};assetSyms.forEach(s=>delete n[s]);return n;});if(asset==="Futures")setNewSessFuturesData(p=>{const n={...p};assetSyms.forEach(s=>delete n[s]);return n;});}}
                                          onMouseEnter={()=>setHov("tcReset_"+asset)} onMouseLeave={()=>setHov(null)}
                                          onMouseDown={e=>{e.currentTarget.style.transform="scale(0.88)";e.currentTarget.style.opacity="0.6";}}
                                          onMouseUp={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.opacity="1";}}
                                          style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4,cursor:"default",color:hov==="tcReset_"+asset?c.acL:c.tm,transition:"color 0.12s,opacity 0.1s",padding:"1px 4px"}}>
                                          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                          <span style={{fontSize:9,fontWeight:600,fontFamily:F,letterSpacing:"0.03em"}}>Reset defaults</span>
                                        </div>
                                      </div>
                                      {showCommRow&&(
                                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:assetSyms.length>0?6:0,flexWrap:"wrap"}}>
                                          {!meta.perSymComm&&(<><span style={{fontSize:10,color:c.tm,fontFamily:F,whiteSpace:"nowrap"}}>{meta.commLabel}:</span>{numCell(row.commission,e=>setComm(e.target.value),meta.commStep,58)}<span style={{fontSize:10,color:c.tm,fontFamily:F,whiteSpace:"nowrap",marginLeft:-4}}>{meta.commUnit}</span></>)}
                                          {!meta.hideLev&&(<><span style={{fontSize:10,color:c.tm,fontFamily:F,whiteSpace:"nowrap"}}>Leverage:</span>
                                            <div style={{position:"relative",width:62,height:22,flexShrink:0}}>
                                              <div onClick={e=>{e.stopPropagation();if(dropdown==="lev_"+asset){setDropdown(null);setDdAnchor(null);}else{const r=e.currentTarget.getBoundingClientRect();setDdAnchor({top:r.bottom/Z+2,left:r.left/Z,minWidth:r.width/Z});setDropdown("lev_"+asset);setNewSessStratDropOpen(false);}}}
                                                style={{height:22,display:"flex",alignItems:"center",padding:"0 18px 0 8px",position:"relative",background:c.el,border:`1px solid ${dropdown==="lev_"+asset?c.acB:c.brH}`,cursor:"default",userSelect:"none",boxSizing:"border-box",transition:"border-color 0.12s"}}>
                                                <span style={{fontSize:10,fontWeight:700,color:c.tx,fontFamily:F}}>{row.leverage||meta.defLev}</span>
                                                <svg style={{position:"absolute",right:7,top:"50%",transform:`translateY(-50%) rotate(${dropdown==="lev_"+asset?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                              </div>
                                              {dropdown==="lev_"+asset&&ddAnchor&&(
                                                <><div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setDropdown(null);setDdAnchor(null);}}/>
                                                <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,minWidth:ddAnchor.minWidth,zIndex:9999,background:c.sf,border:"1px solid rgba(140,160,255,0.22)",boxShadow:"0 4px 16px rgba(0,0,0,0.5)"}}>
                                                  <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                                                  {meta.levOpts.map(v=>{const isAct=v===(row.leverage||meta.defLev);const isHv=hov==="levOpt_"+asset+"_"+v;return(<div key={v} onClick={e=>{e.stopPropagation();setLev(v);setDropdown(null);setDdAnchor(null);}} onMouseEnter={()=>setHov("levOpt_"+asset+"_"+v)} onMouseLeave={()=>setHov(null)} style={{display:"flex",alignItems:"center",padding:"4px 10px",cursor:"default",position:"relative",background:isAct?c.acD:isHv?"rgba(255,255,255,0.03)":"transparent",transition:"background 0.1s"}}>{isAct&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}<span style={{fontSize:10,fontWeight:isAct?700:500,color:isAct?c.acL:isHv?c.tx:c.ts,fontFamily:F}}>{v}</span></div>);})}
                                                </div></>
                                              )}
                                            </div>
                                          </>)}
                                        </div>
                                      )}
                                      {asset==="Futures"?(
                                        <div>
                                          <div style={{display:"grid",gridTemplateColumns:"52px 52px 52px 50px 54px 62px 72px",gap:7,paddingBottom:4,marginBottom:4,borderBottom:`1px solid ${c.br}`}}>
                                            {[["Symbol","","left"],["Tick","size","center"],["Tick","value","center"],["Spread","ticks","center"],["Comm","$/RT","center"],["Day","margin","center"],["Night","margin","center"]].map(([h,u,k])=>(<div key={h+u} style={{textAlign:k,lineHeight:1.2}}><div style={{fontSize:9,fontWeight:700,color:c.tm,fontFamily:F,letterSpacing:"0.03em",whiteSpace:"nowrap"}}>{h}{u&&<span style={{fontSize:8,fontWeight:500,fontStyle:"italic",opacity:0.75,marginLeft:2}}>{u}</span>}</div></div>))}
                                          </div>
                                          {assetSyms.map(sym=>{const fd=getFd(sym);const spd=getSpread(sym);const ts=tickSpec[sym]||{sz:"—",val:"—"};return(<div key={sym} style={{display:"grid",gridTemplateColumns:"52px 52px 52px 50px 54px 62px 72px",gap:7,marginBottom:4,alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:4}}>{mkFlags2(sym)}<span style={{fontSize:10,fontWeight:700,color:c.ts,fontFamily:F}}>{sym}</span></div><div style={{textAlign:"center",fontSize:9,fontWeight:600,color:c.tm,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{ts.sz}</div><div style={{textAlign:"center",fontSize:9,fontWeight:600,color:c.tm,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{ts.val}</div>{numCell(spd,e=>setSpread(sym,e.target.value),meta.spreadStep,50)}{numCell(fd.commission,e=>setFd(sym,"commission",e.target.value),0.01,54)}{numCell(fd.dayMargin,e=>setFd(sym,"dayMargin",e.target.value),50,62)}{numCell(fd.overnightMargin,e=>setFd(sym,"overnightMargin",e.target.value),50,72)}</div>);})}
                                        </div>
                                      ):(assetSyms.length>0&&(
                                        <div>
                                          <div style={{marginBottom:5,paddingBottom:4,borderBottom:`1px solid ${c.br}`}}><span style={{fontSize:9,fontWeight:700,color:c.tm,fontFamily:F,letterSpacing:"0.03em"}}>SPREAD</span><span style={{fontSize:8,fontWeight:500,fontStyle:"italic",color:c.tm,opacity:0.75,marginLeft:4,fontFamily:F}}>{meta.spreadUnit}</span></div>
                                          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4}}>
                                            {assetSyms.map(sym=>(<div key={sym} style={{display:"grid",gridTemplateColumns:"14px 1fr 48px",alignItems:"center",columnGap:3,background:c.bg,padding:"2px 5px",border:`1px solid ${c.br}`,height:24,boxSizing:"border-box",minWidth:0}}>{(()=>{const sz=8,fw=Math.round(sz*15/11),fh=sz;const pr=pairInfo2(sym);if(pr)return(<div style={{position:"relative",width:Math.round(sz*22/11),height:fh,flexShrink:0}}><div style={{position:"absolute",left:0,top:0,borderRadius:1,overflow:"hidden",zIndex:2}}><FlagSvg code={pr.b} w={fw} h={fh}/></div><div style={{position:"absolute",left:Math.round(sz*7/11),top:0,borderRadius:1,overflow:"hidden",zIndex:1}}><FlagSvg code={pr.q} w={fw} h={fh}/></div></div>);const metalMap={XAUUSD:{bg:"#2B2200",fg:"#FFD700",label:"Au"},XAGUSD:{bg:"#1C2028",fg:"#C8D4E0",label:"Ag"},GC:{bg:"#2B2200",fg:"#FFD700",label:"GC"},SI:{bg:"#1C2028",fg:"#C8D4E0",label:"SI"},CL:{bg:"#0D1A12",fg:"#4CAF50",label:"CL"},NG:{bg:"#0A1020",fg:"#64B5F6",label:"NG"},MGC:{bg:"#1A1200",fg:"#FFBA00",label:"mGC"},MCL:{bg:"#071510",fg:"#33CC66",label:"mCL"}};if(metalMap[sym]){const m=metalMap[sym];return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:1}}><rect width={fw} height={fh} fill={m.bg}/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill={m.fg} fontSize={fh*0.52} fontWeight="800" fontFamily={F}>{m.label}</text></svg>);}const cryptoMap={BTCUSD:{bg:"#E8820C",fg:"#fff",label:"₿"},ETHUSD:{bg:"#3D4FC4",fg:"#fff",label:"Ξ"},BNBUSD:{bg:"#C99800",fg:"#000",label:"B"},SOLUSD:{bg:"#7B3FBE",fg:"#fff",label:"S"},ADAUSD:{bg:"#0033AD",fg:"#fff",label:"A"}};if(cryptoMap[sym]){const cr=cryptoMap[sym];return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:Math.round(fh*0.35)}}><rect width={fw} height={fh} rx={Math.round(fh*0.35)} fill={cr.bg}/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill={cr.fg} fontSize={fh*0.58} fontWeight="900" fontFamily={F}>{cr.label}</text></svg>);}const genericLabel=(sym||"").replace(/USDT|USDC|USD$/,"").replace(/[^A-Z0-9]/g,"").slice(0,3)||"?";return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:Math.round(fh*0.35)}}><rect width={fw} height={fh} rx={Math.round(fh*0.35)} fill="#22324A"/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill="#D7E6FF" fontSize={fh*0.45} fontWeight="800" fontFamily={F}>{genericLabel}</text></svg>);})()}<span style={{fontSize:9,fontWeight:700,color:c.ts,fontFamily:F,letterSpacing:"0.02em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{sym}</span>{numCell(getSpread(sym),e=>setSpread(sym,e.target.value),meta.spreadStep,48)}</div>))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      </div>

                      {/* § Account Settings */}
                      <div style={{border:`1px solid ${sessSettingsDone?c.brH:c.br}`,padding:"12px 14px",transition:"opacity 0.2s,border-color 0.2s",...(sessSettingsDone?activeBox:lockedBox)}}>
                      {secH("Account Settings")}

                      {/* Standard / Prop Firm mode toggle — standard tab style */}
                      {(()=>{
                        const propUnavailable=newSessAssetClass==="Stocks"||newSessAssetClass==="Crypto";
                        return(
                          <div style={{display:"flex",gap:0,marginBottom:14,borderBottom:`1px solid ${c.br}`}}>
                            {[["standard","Standard","Free backtest — Trade your personal account",false],["prop","Prop Firm","Trade under prop firm challenge rules",true]].map(([v,l,desc,isPropTab])=>{
                              const disabled=isPropTab&&propUnavailable;
                              const isA=sessTradingMode===v&&!disabled;const hk="sessMode_"+v;const isH=hov===hk&&!disabled;
                              const acColor=isPropTab?c.gold:c.acL;const acGlow=isPropTab?"rgba(200,150,0,0.4)":c.acG;
                              return(
                                <div key={v}
                                  onClick={disabled?undefined:()=>{setSessTradingMode(v);if(v==="prop"&&newSessAssetClass==="Futures"){setNewSessCapital("50000");setSessP1DailyLossAmt("1000");setSessP1MaxDDAmt("2000");setSessP1ProfitTargetAmt("3000");}}}
                                  onMouseEnter={disabled?undefined:()=>setHov(hk)} onMouseLeave={disabled?undefined:()=>setHov(null)}
                                  style={{flex:1,padding:"6px 10px 8px",display:"flex",flexDirection:"column",gap:2,
                                    cursor:"default",transition:"all 0.15s",position:"relative",textAlign:"center",
                                    opacity:disabled?0.35:1,
                                    background:isA?(isPropTab?"rgba(200,150,0,0.07)":"rgba(74,106,255,0.07)"):isH?"rgba(255,255,255,0.03)":"transparent"}}>
                                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                                    <span style={{fontSize:11,fontWeight:700,color:isA?acColor:isH?c.tx:c.ts,fontFamily:F,transition:"color 0.12s"}}>{l}</span>
                                    {isPropTab&&(
                                      <div style={{position:"relative",flexShrink:0}}
                                        onMouseEnter={e=>{e.stopPropagation();setHov("propInfoTip");}} onMouseLeave={()=>setHov(null)}>
                                        <svg width={11} height={11} viewBox="0 0 24 24" fill="none"
                                          stroke={hov==="propInfoTip"?c.gold:c.tm} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                          style={{display:"block",cursor:"default",transition:"stroke 0.12s"}}>
                                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                                        </svg>
                                        {hov==="propInfoTip"&&(
                                          <div style={{position:"absolute",bottom:"calc(100% + 7px)",left:"50%",transform:"translateX(-50%)",width:180,background:c.el,border:`1px solid ${c.brH}`,zIndex:9999,pointerEvents:"none",whiteSpace:"normal"}}>
                                            <div style={{height:2,background:`linear-gradient(90deg,${c.gold},rgba(232,194,82,0.4),${c.gold})`}}/>
                                            <div style={{padding:"6px 9px",fontSize:10,fontWeight:600,color:c.ts,fontFamily:F,lineHeight:1.45,textAlign:"left",textTransform:"none",letterSpacing:0}}>
                                              Available for <b style={{color:c.acL}}>Forex</b> and <b style={{color:c.acL}}>Futures</b> only
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <span style={{fontSize:9,color:isA?c.ts:c.tm,fontFamily:F,transition:"color 0.12s"}}>{desc}</span>
                                  {isA&&<div style={{position:"absolute",bottom:-1,left:"15%",right:"15%",height:2,background:`linear-gradient(90deg,transparent,${acColor},transparent)`,boxShadow:`0 0 6px ${acGlow}`,pointerEvents:"none"}}/>}
                                  {!isA&&isH&&<div style={{position:"absolute",bottom:-1,left:"25%",right:"25%",height:1,background:`linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)`,pointerEvents:"none"}}/>}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* Starting balance / Account size */}
                      <div style={{marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap",flexShrink:0,width:130,display:"flex",alignItems:"center",gap:4}}>
                          {sessTradingMode==="prop"?"Account size":"Starting balance"}
                          <span style={{width:4,height:4,borderRadius:"50%",background:"rgba(255,80,104,0.9)",flexShrink:0,display:"inline-block"}}/>
                        </span>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <div style={{position:"relative",width:130,flexShrink:0}}>
                            <span style={{position:"absolute",left:0,top:0,bottom:0,width:24,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:c.ts,fontWeight:700,borderRight:`1px solid ${c.br}`,pointerEvents:"none",fontFamily:F}}>
                              {{"USD":"$","EUR":"€","GBP":"£","JPY":"¥","CHF":"₣","AUD":"A$","CAD":"C$"}[newSessCurrency]||"$"}
                            </span>
                            <input type="number" value={newSessCapital} onChange={e=>setNewSessCapital(e.target.value)} className="tlr-nospinner" style={{...inp({fontSize:11,fontWeight:800,paddingLeft:26,fontVariantNumeric:"tabular-nums"})}}/>
                          </div>
                          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                            {(()=>{
                              const ftmoSizes=[["5K","5000"],["10K","10000"],["25K","25000"],["50K","50000"],["100K","100000"],["200K","200000"],["300K","300000"]];
                              const futuresSizes=[["25K","25000"],["50K","50000"],["100K","100000"],["150K","150000"]];
                              const genericSizes=[["5K","5000"],["10K","10000"],["25K","25000"],["50K","50000"],["100K","100000"],["200K","200000"],["300K","300000"]];
                              const chips=sessTradingMode==="prop"?(newSessAssetClass==="Futures"?futuresSizes:ftmoSizes):genericSizes;
                              const isProp=sessTradingMode==="prop";
                              const chipAc=isProp?c.gold:c.acL;
                              const chipGlow=isProp?"rgba(200,150,0,0.4)":c.acG;
                              const chipBg=isProp?"rgba(200,150,0,0.08)":"rgba(74,106,255,0.08)";
                              const futPresetsMap={"25000":{dl:"500",dd:"1000",pt:"1500"},"50000":{dl:"1000",dd:"2000",pt:"3000"},"100000":{dl:"1500",dd:"3000",pt:"6000"},"150000":{dl:"2250",dd:"4500",pt:"9000"}};
                              return chips.map(([label,val])=>{
                                const isA=newSessCapital===val;const hk="bal_"+val;const isH=hov===hk;
                                return(
                                  <div key={label} onClick={()=>{setNewSessCapital(val);if(newSessAssetClass==="Futures"&&sessTradingMode==="prop"&&futPresetsMap[val]){const p=futPresetsMap[val];setSessP1DailyLossAmt(p.dl);setSessP1MaxDDAmt(p.dd);setSessP1ProfitTargetAmt(p.pt);}}}
                                    onMouseEnter={()=>setHov(hk)} onMouseLeave={()=>setHov(null)}
                                    style={{padding:"4px 9px",fontSize:10,fontWeight:isA?700:500,color:isA?chipAc:isH?c.tx:c.ts,background:isA?chipBg:isH?"rgba(255,255,255,0.05)":"transparent",cursor:"default",transition:"background 0.12s,color 0.12s",position:"relative",fontFamily:F,fontVariantNumeric:"tabular-nums"}}>
                                    {label}
                                    {isA&&<div style={{position:"absolute",bottom:0,left:"15%",right:"15%",height:2,background:`linear-gradient(90deg,transparent,${chipAc},transparent)`,boxShadow:`0 0 6px ${chipGlow}`,pointerEvents:"none"}}/>}
                                    {!isA&&isH&&<div style={{position:"absolute",bottom:0,left:"20%",right:"20%",height:1,background:`linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)`,pointerEvents:"none"}}/>}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Challenge Type row — only in prop mode */}
                      {sessTradingMode==="prop"&&newSessAssetClass!=="Futures"&&(
                        <div style={{height:27,display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                          <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap",flexShrink:0,width:130}}>Challenge Type</span>
                          <div style={{position:"relative",width:130,flexShrink:0}}>
                            <div onClick={e=>{e.stopPropagation();if(dropdown==="challTypeDrop"){setDropdown(null);setDdAnchor(null);}else{const r=e.currentTarget.getBoundingClientRect();setDdAnchor({top:r.bottom/Z+2,left:r.left/Z,width:r.width/Z});setDropdown("challTypeDrop");}}}
                              style={{height:27,display:"flex",alignItems:"center",padding:"0 24px 0 8px",position:"relative",background:c.el,border:`1px solid ${dropdown==="challTypeDrop"?"rgba(232,194,82,0.5)":c.brH}`,cursor:"default",userSelect:"none",boxSizing:"border-box",transition:"border-color 0.12s"}}>
                              <span style={{fontSize:10,fontWeight:600,color:c.tx,fontFamily:F}}>{sessNumPhases===1?"1 Phase":"2 Phase"}</span>
                              <svg style={{position:"absolute",right:7,top:"50%",transform:`translateY(-50%) rotate(${dropdown==="challTypeDrop"?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </div>
                            {dropdown==="challTypeDrop"&&ddAnchor&&(<>
                              <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setDropdown(null);setDdAnchor(null);}}/>
                              <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,width:ddAnchor.width,zIndex:9999,background:c.sf,border:`1px solid rgba(232,194,82,0.2)`,boxShadow:"0 4px 20px rgba(0,0,0,0.6)"}}>
                                <div style={{height:2,background:`linear-gradient(90deg,transparent,${c.gold},transparent)`}}/>
                                {[[1,"1 Phase"],[2,"2 Phase"]].map(([val,label])=>{
                                  const isA=sessNumPhases===val;const isH=hov==="ctOpt_"+val;
                                  return(
                                    <div key={val} onClick={e=>{e.stopPropagation();setSessNumPhases(val);setDropdown(null);setDdAnchor(null);}}
                                      onMouseEnter={()=>setHov("ctOpt_"+val)} onMouseLeave={()=>setHov(null)}
                                      style={{display:"flex",alignItems:"center",padding:"5px 10px",cursor:"default",position:"relative",background:isA?"rgba(232,194,82,0.08)":isH?"rgba(255,255,255,0.04)":"transparent",transition:"background 0.1s"}}>
                                      {isA&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.gold},transparent)`,boxShadow:"0 0 6px rgba(232,194,82,0.4)"}}/>}
                                      <span style={{fontSize:10,fontWeight:isA?700:500,color:isA?c.gold:isH?c.tx:c.ts,fontFamily:F}}>{label}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </>)}
                          </div>
                        </div>
                      )}

                      {/* Prop Firm rules — only shown in prop mode */}
                      {sessTradingMode==="prop"&&(()=>{
                        const cap=parseFloat(newSessCapital)||10000;
                        const fieldLbl=(text)=><div style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,marginBottom:3}}>{text}</div>;
                        const pctArrows=(val,setter,step=0.1)=>(
                          <div style={{position:"absolute",right:0,top:0,bottom:0,width:14,display:"flex",flexDirection:"column",borderLeft:`1px solid ${c.br}`}}>
                            {[[()=>setter(v=>String(Math.min(100,Math.round(((parseFloat(v)||0)+step)*10)/10))),"▲"],[()=>setter(v=>String(Math.max(0,Math.round(((parseFloat(v)||0)-step)*10)/10))),"▼"]].map(([fn,ch],ii)=>(
                              <button key={ii} onClick={fn}
                                onMouseEnter={e=>e.currentTarget.style.color=c.gold} onMouseLeave={e=>e.currentTarget.style.color=c.ts}
                                style={{flex:1,background:"transparent",border:"none",color:c.ts,cursor:"default",display:"flex",alignItems:"center",justifyContent:"center",fontSize:6,lineHeight:1,fontFamily:F,padding:0,borderBottom:ii===0?`1px solid ${c.br}`:"none",transition:"color 0.1s"}}>
                                {ch}
                              </button>
                            ))}
                          </div>
                        );
                        const mkPctCell=(val,setter,color,cap2)=>{
                          const amt=Math.round(cap2*(parseFloat(val)||0)/100);
                          return(
                            <div style={{display:"flex",alignItems:"center",gap:5}}>
                              <div style={{position:"relative",width:60,height:27,background:c.el,border:`1px solid ${c.brH}`,flexShrink:0}}>
                                <input type="number" min={0} max={100} step={0.5} value={val} onChange={e=>setter(e.target.value)} className="tlr-nospinner"
                                  style={{position:"absolute",left:0,top:0,bottom:0,width:"calc(100% - 14px)",background:"transparent",border:"none",outline:"none",color,fontSize:11,fontWeight:700,fontFamily:F,fontVariantNumeric:"tabular-nums",textAlign:"left",padding:"0 0 0 4px",boxSizing:"border-box"}}/>
                                <span style={{position:"absolute",right:16,top:"50%",transform:"translateY(-50%)",fontSize:9,fontWeight:600,color:c.tm,fontFamily:F,pointerEvents:"none"}}>%</span>
                                {pctArrows(val,setter)}
                              </div>
                              <span style={{fontSize:8,color:c.tm,fontFamily:F,fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap",minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>≈ ${amt.toLocaleString()}</span>
                            </div>
                          );
                        };
                        const mkMinDaysCell=(val,setter,enabled,setEnabled,hkey)=>(
                          <div style={{display:"flex",alignItems:"center",gap:5}}>
                            <div style={{position:"relative",width:44,height:24,background:c.well,border:`1px solid ${c.brH}`,flexShrink:0,opacity:enabled?1:0.4}}>
                              <input type="number" min={1} value={val} onChange={e=>setter(e.target.value)} disabled={!enabled} className="tlr-nospinner"
                                style={{position:"absolute",left:0,top:0,bottom:0,width:"calc(100% - 14px)",background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:10,fontWeight:700,fontFamily:F,fontVariantNumeric:"tabular-nums",textAlign:"right",padding:"0 3px 0 4px",boxSizing:"border-box",cursor:enabled?"text":"not-allowed"}}/>
                              <div style={{position:"absolute",right:0,top:0,bottom:0,width:14,display:"flex",flexDirection:"column",borderLeft:`1px solid ${c.br}`}}>
                                {[[()=>setter(v=>String(Math.max(1,parseInt(v||1)+1))),"▲"],[()=>setter(v=>String(Math.max(1,parseInt(v||1)-1))),"▼"]].map(([fn,ch],ii)=>(
                                  <button key={ii} onClick={enabled?fn:undefined}
                                    onMouseEnter={e=>{if(enabled)e.currentTarget.style.color=c.acL;}} onMouseLeave={e=>e.currentTarget.style.color=c.ts}
                                    style={{flex:1,background:"transparent",border:"none",color:c.ts,cursor:enabled?"pointer":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",fontSize:6,lineHeight:1,fontFamily:F,padding:0,borderBottom:ii===0?`1px solid ${c.br}`:"none",transition:"color 0.1s"}}>
                                    {ch}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:3,cursor:"default"}} onClick={()=>setEnabled(v=>!v)}>
                              {TlChk(enabled,hkey,"",()=>setEnabled(v=>!v))}
                              <span style={{fontSize:8,color:enabled?c.ts:c.tm,fontFamily:F,transition:"color 0.12s"}}>enabled</span>
                            </div>
                          </div>
                        );
                        const mkPhaseRow=(phLabel,dlPct,setDl,ddPct,setDd,ptPct,setPt)=>(
                          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                            <div style={{display:"flex",alignItems:"center",justifyContent:"center",width:14,flexShrink:0}}>
                              <span style={{fontSize:7,fontWeight:800,color:c.gold,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:F,writingMode:"vertical-rl",transform:"rotate(180deg)",whiteSpace:"nowrap"}}>{phLabel}</span>
                            </div>
                            <div style={{width:1,alignSelf:"stretch",background:`linear-gradient(180deg,transparent,rgba(232,194,82,0.4),transparent)`,flexShrink:0}}/>
                            <div style={{display:"grid",gridTemplateColumns:"repeat(3,130px)",gap:8,alignItems:"center"}}>
                              {mkPctCell(dlPct,setDl,c.rd,cap)}
                              {mkPctCell(ddPct,setDd,c.rd,cap)}
                              {mkPctCell(ptPct,setPt,c.gn,cap)}
                            </div>
                          </div>
                        );
                        const isFutures=newSessAssetClass==="Futures";
                        const intArrows=(val,setter,min=0,max=999999,enabled=true)=>(
                          <div style={{position:"absolute",right:0,top:0,bottom:0,width:18,display:"flex",flexDirection:"column",borderLeft:`1px solid ${c.br}`}}>
                            {[[()=>setter(v=>String(Math.min(max,parseInt(v||min)+1))),"▲"],[()=>setter(v=>String(Math.max(min,parseInt(v||min)-1))),"▼"]].map(([fn,ch],ii)=>(
                              <button key={ii} onClick={enabled?fn:undefined}
                                onMouseEnter={e=>{if(enabled)e.currentTarget.style.color=c.gold;}} onMouseLeave={e=>e.currentTarget.style.color=c.ts}
                                style={{flex:1,background:"transparent",border:"none",color:c.ts,cursor:"default",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,lineHeight:1,fontFamily:F,padding:0,borderBottom:ii===0?`1px solid ${c.br}`:"none",transition:"color 0.1s"}}>
                                {ch}
                              </button>
                            ))}
                          </div>
                        );
                        const chkRowCommon=(checked,hkey,setter,label)=>(
                          <div style={{height:27,display:"flex",alignItems:"center",gap:8,cursor:"default"}} onClick={()=>setter(v=>!v)}>
                            {TlChk(checked,hkey,"",null,"rgba(232,194,82,0.9)")}
                            <span style={{fontSize:9,fontWeight:600,color:checked?c.ts:c.tm,fontFamily:F,transition:"color 0.12s"}}>{label}</span>
                          </div>
                        );
                        const commonMinDaysRow=(
                          <div style={{height:27,display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:130,flexShrink:0,display:"flex",alignItems:"center",gap:6,cursor:"default"}} onClick={()=>setSessP1MinDaysEnabled(v=>!v)}>
                              {TlChk(sessP1MinDaysEnabled,"chk_minDays","",null,"rgba(232,194,82,0.9)")}
                              <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap"}}>Min trading days</span>
                            </div>
                            <div style={{position:"relative",width:50,flexShrink:0,opacity:sessP1MinDaysEnabled?1:0.45}}>
                              <input type="number" min={1} value={sessP1MinDays} onChange={e=>setSessP1MinDays(e.target.value)} disabled={!sessP1MinDaysEnabled} className="tlr-nospinner"
                                style={{...inp({fontWeight:700,fontVariantNumeric:"tabular-nums",textAlign:"left",padding:"0 0 0 6px",cursor:sessP1MinDaysEnabled?"text":"not-allowed",width:"100%"})}}/>
                              {intArrows(sessP1MinDays,setSessP1MinDays,1,999,sessP1MinDaysEnabled)}
                            </div>
                            <span style={{fontSize:9,fontWeight:600,color:c.tm,fontFamily:F}}>days</span>
                          </div>
                        );
                        const commonConsistencyRow=(
                          <div style={{height:27,display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:130,flexShrink:0,display:"flex",alignItems:"center",gap:6,cursor:"default"}} onClick={()=>setSessConsistencyRule(v=>!v)}>
                              {TlChk(sessConsistencyRule,"chk_consistency","",null,"rgba(232,194,82,0.9)")}
                              <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap"}}>Consistency rules</span>
                            </div>
                            <div style={{position:"relative",width:50,flexShrink:0,opacity:sessConsistencyRule?1:0.4}}>
                              <input type="number" min={0} max={100} value={sessConsistencyPct} onChange={e=>setSessConsistencyPct(e.target.value)} disabled={!sessConsistencyRule} className="tlr-nospinner"
                                style={{...inp({fontWeight:700,fontVariantNumeric:"tabular-nums",textAlign:"left",padding:"0 0 0 6px",cursor:sessConsistencyRule?"text":"not-allowed",width:"100%"})}}/>
                              {intArrows(sessConsistencyPct,setSessConsistencyPct,0,100,sessConsistencyRule)}
                            </div>
                            <span style={{fontSize:9,fontWeight:600,color:c.tm,fontFamily:F,opacity:sessConsistencyRule?1:0.4}}>%</span>
                          </div>
                        );
                        if(isFutures){
                          const mkAmtCell=(val,setter,color)=>(
                            <div style={{position:"relative",width:100,height:27,background:c.el,border:`1px solid ${c.brH}`,flexShrink:0}}>
                              <span style={{position:"absolute",left:6,top:"50%",transform:"translateY(-50%)",fontSize:9,fontWeight:600,color:c.tm,fontFamily:F,pointerEvents:"none"}}>$</span>
                              <input type="number" min={0} step={100} value={val} onChange={e=>setter(e.target.value)} className="tlr-nospinner"
                                style={{position:"absolute",left:14,top:0,bottom:0,width:"calc(100% - 32px)",background:"transparent",border:"none",outline:"none",color,fontSize:11,fontWeight:700,fontFamily:F,fontVariantNumeric:"tabular-nums",textAlign:"left",padding:0,boxSizing:"border-box"}}/>
                              <div style={{position:"absolute",right:0,top:0,bottom:0,width:18,display:"flex",flexDirection:"column",borderLeft:`1px solid ${c.br}`}}>
                                {[[()=>setter(v=>String(Math.max(0,parseInt(v||0)+100))),"▲"],[()=>setter(v=>String(Math.max(0,parseInt(v||0)-100))),"▼"]].map(([fn,ch],ii)=>(
                                  <button key={ii} onClick={fn}
                                    onMouseEnter={e=>e.currentTarget.style.color=c.acL} onMouseLeave={e=>e.currentTarget.style.color=c.ts}
                                    style={{flex:1,background:"transparent",border:"none",color:c.ts,cursor:"default",display:"flex",alignItems:"center",justifyContent:"center",fontSize:6,lineHeight:1,fontFamily:F,padding:0,borderBottom:ii===0?`1px solid ${c.br}`:"none",transition:"color 0.1s"}}>
                                    {ch}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                          const mkFutPhaseRow=(phLabel,dlAmt,setDl,ddAmt,setDd,ptAmt,setPt)=>(
                            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"center",width:14,flexShrink:0}}>
                                <span style={{fontSize:7,fontWeight:800,color:c.gold,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:F,writingMode:"vertical-rl",transform:"rotate(180deg)",whiteSpace:"nowrap"}}>{phLabel}</span>
                              </div>
                              <div style={{width:1,alignSelf:"stretch",background:`linear-gradient(180deg,transparent,rgba(232,194,82,0.4),transparent)`,flexShrink:0}}/>
                              <div style={{display:"grid",gridTemplateColumns:"repeat(3,100px)",gap:8,alignItems:"center"}}>
                                {mkAmtCell(dlAmt,setDl,c.rd)}
                                {mkAmtCell(ddAmt,setDd,c.rd)}
                                {mkAmtCell(ptAmt,setPt,c.gn)}
                              </div>
                            </div>
                          );
                          const futMinDaysRow=(
                            <div style={{height:27,display:"flex",alignItems:"center",gap:10}}>
                              <div style={{width:130,flexShrink:0,display:"flex",alignItems:"center",gap:6,cursor:"default"}} onClick={()=>setSessFutMinDaysEnabled(v=>!v)}>
                                {TlChk(sessFutMinDaysEnabled,"chk_futMinDays","",null,"rgba(232,194,82,0.9)")}
                                <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap"}}>Min trading days</span>
                              </div>
                              <div style={{position:"relative",width:50,flexShrink:0,opacity:sessFutMinDaysEnabled?1:0.45}}>
                                <input type="number" min={1} value={sessFutMinDays} onChange={e=>setSessFutMinDays(e.target.value)} disabled={!sessFutMinDaysEnabled} className="tlr-nospinner"
                                  style={{...inp({fontWeight:700,fontVariantNumeric:"tabular-nums",textAlign:"left",padding:"0 0 0 6px",cursor:sessFutMinDaysEnabled?"text":"not-allowed",width:"100%"})}}/>
                                {intArrows(sessFutMinDays,setSessFutMinDays,1,999,sessFutMinDaysEnabled)}
                              </div>
                              <span style={{fontSize:9,fontWeight:600,color:c.tm,fontFamily:F}}>days</span>
                            </div>
                          );
                          return(<>
                            {/* Drawdown type dropdown */}
                            <div style={{height:27,display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                              <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap",flexShrink:0,width:130}}>Drawdown Type</span>
                              <div style={{position:"relative",width:130,flexShrink:0}}>
                                <div onClick={e=>{e.stopPropagation();if(dropdown==="ddTypeDrop"){setDropdown(null);setDdAnchor(null);}else{const r=e.currentTarget.getBoundingClientRect();setDdAnchor({top:r.bottom/Z+2,left:r.left/Z,width:r.width/Z});setDropdown("ddTypeDrop");}}}
                                  style={{height:27,display:"flex",alignItems:"center",padding:"0 24px 0 8px",position:"relative",background:c.el,border:`1px solid ${dropdown==="ddTypeDrop"?"rgba(232,194,82,0.5)":c.brH}`,cursor:"default",userSelect:"none",boxSizing:"border-box",transition:"border-color 0.12s"}}>
                                  <span style={{fontSize:10,fontWeight:600,color:c.tx,fontFamily:F}}>{sessTrailingDrawdown?"Trailing":"EOD"}</span>
                                  <svg style={{position:"absolute",right:7,top:"50%",transform:`translateY(-50%) rotate(${dropdown==="ddTypeDrop"?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                                {dropdown==="ddTypeDrop"&&ddAnchor&&(<>
                                  <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setDropdown(null);setDdAnchor(null);}}/>
                                  <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,width:ddAnchor.width,zIndex:9999,background:c.sf,border:`1px solid rgba(232,194,82,0.2)`,boxShadow:"0 4px 20px rgba(0,0,0,0.6)"}}>
                                    <div style={{height:2,background:`linear-gradient(90deg,transparent,${c.gold},transparent)`}}/>
                                    {[[true,"Trailing"],[false,"EOD"]].map(([val,label])=>{
                                      const isA=sessTrailingDrawdown===val;const isH=hov==="ddtOpt_"+label;
                                      return(
                                        <div key={label} onClick={e=>{e.stopPropagation();setSessTrailingDrawdown(val);setDropdown(null);setDdAnchor(null);}}
                                          onMouseEnter={()=>setHov("ddtOpt_"+label)} onMouseLeave={()=>setHov(null)}
                                          style={{display:"flex",alignItems:"center",padding:"5px 10px",cursor:"default",position:"relative",background:isA?"rgba(232,194,82,0.08)":isH?"rgba(255,255,255,0.04)":"transparent",transition:"background 0.1s"}}>
                                          {isA&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.gold},transparent)`,boxShadow:"0 0 6px rgba(232,194,82,0.4)"}}/>}
                                          <span style={{fontSize:10,fontWeight:isA?700:500,color:isA?c.gold:isH?c.tx:c.ts,fontFamily:F}}>{label}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </>)}
                              </div>
                            </div>
                            {/* Column headers — daily loss has gold checkbox to enable/disable it */}
                            <div style={{display:"grid",gridTemplateColumns:"repeat(3,100px)",gap:8,marginBottom:8}}>
                              <div style={{display:"flex",alignItems:"center",gap:5,cursor:"default",marginTop:3}} onClick={()=>setSessDailyLossEnabled(v=>!v)}>
                                {TlChk(sessDailyLossEnabled,"chk_futDl","",null,"rgba(232,194,82,0.9)")}
                                <span style={{fontSize:8,fontWeight:700,color:sessDailyLossEnabled?c.ts:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap",transition:"color 0.12s"}}>Daily loss</span>
                              </div>
                              {["Max drawdown","Profit target"].map(t=>(
                                <div key={t} style={{paddingLeft:16}}><span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap"}}>{t}</span></div>
                              ))}
                            </div>
                            {/* Single phase row — no phase label */}
                            <div style={{display:"grid",gridTemplateColumns:"repeat(3,100px)",gap:8,marginBottom:12}}>
                              <div style={{opacity:sessDailyLossEnabled?1:0.4,transition:"opacity 0.12s",pointerEvents:sessDailyLossEnabled?"auto":"none"}}>
                                {mkAmtCell(sessP1DailyLossAmt,setSessP1DailyLossAmt,c.rd)}
                              </div>
                              {mkAmtCell(sessP1MaxDDAmt,setSessP1MaxDDAmt,c.rd)}
                              {mkAmtCell(sessP1ProfitTargetAmt,setSessP1ProfitTargetAmt,c.gn)}
                            </div>
                            {/* Futures common rules */}
                            <div style={{display:"flex",flexDirection:"column",gap:14,marginTop:16,marginBottom:14}}>
                              {/* Max contracts */}
                              <div style={{height:27,display:"flex",alignItems:"center",gap:10}}>
                                <div style={{width:130,flexShrink:0,display:"flex",alignItems:"center",gap:6,cursor:"default"}} onClick={()=>setSessMaxContractsEnabled(v=>!v)}>
                                  {TlChk(sessMaxContractsEnabled,"chk_maxCon","",null,"rgba(232,194,82,0.9)")}
                                  <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap"}}>Max contracts</span>
                                </div>
                                <div style={{position:"relative",width:50,flexShrink:0,opacity:sessMaxContractsEnabled?1:0.4}}>
                                  <input type="number" min={1} step={1} value={sessMaxContracts} onChange={e=>setSessMaxContracts(e.target.value)} disabled={!sessMaxContractsEnabled} className="tlr-nospinner"
                                    style={{...inp({fontWeight:700,fontVariantNumeric:"tabular-nums",textAlign:"left",padding:"0 0 0 6px",width:"100%",cursor:sessMaxContractsEnabled?"text":"not-allowed"})}}/>
                                  {intArrows(sessMaxContracts,setSessMaxContracts,1,999,sessMaxContractsEnabled)}
                                </div>
                                <span style={{fontSize:9,fontWeight:600,color:c.tm,fontFamily:F,opacity:sessMaxContractsEnabled?1:0.4}}>contracts</span>
                              </div>
                              {futMinDaysRow}
                              {commonConsistencyRow}
                            </div>
                            {sep}
                          </>);
                        }
                        return(<>
                          {/* Column headers — shown once */}
                          <div style={{display:"grid",gridTemplateColumns:"repeat(3,130px)",gap:8,marginBottom:8,paddingLeft:31}}>
                            {["Daily loss","Max drawdown","Profit target"].map(t=>(
                              <div key={t}>
                                <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap"}}>{t}</span>
                              </div>
                            ))}
                          </div>
                          {/* Phase rows */}
                          {mkPhaseRow(
                            sessNumPhases===2?"PHASE 1":"",
                            sessP1DailyLossPct,setSessP1DailyLossPct,
                            sessP1TotalDDPct,setSessP1TotalDDPct,
                            sessP1ProfitTargetPct,setSessP1ProfitTargetPct
                          )}
                          {sessNumPhases===2&&mkPhaseRow(
                            "PHASE 2",
                            sessP2DailyLossPct,setSessP2DailyLossPct,
                            sessP2TotalDDPct,setSessP2TotalDDPct,
                            sessP2ProfitTargetPct,setSessP2ProfitTargetPct
                          )}
                          {/* Common rules — settings rows */}
                          <div style={{display:"flex",flexDirection:"column",gap:14,marginTop:16,marginBottom:14}}>
                            {/* Leverage — custom dropdown */}
                            <div style={{height:27,display:"flex",alignItems:"center",gap:10}}>
                              <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap",flexShrink:0,width:130}}>Leverage</span>
                              <div style={{position:"relative",width:130,flexShrink:0}}>
                                <div onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();if(dropdown==="sessLevDrop"){setDropdown(null);setDdAnchor(null);}else{setDdAnchor({top:r.bottom/Z+2,left:r.left/Z,width:r.width/Z});setDropdown("sessLevDrop");}}}
                                  style={{...inp({padding:"0 24px 0 8px"}),display:"flex",alignItems:"center",border:`1px solid ${dropdown==="sessLevDrop"?"rgba(232,194,82,0.5)":c.brH}`,cursor:"default",userSelect:"none",position:"relative",transition:"border-color 0.12s",boxSizing:"border-box"}}>
                                  <span style={{fontSize:11,fontWeight:700,color:c.tx,fontFamily:F}}>{sessLeverage}</span>
                                  <svg style={{position:"absolute",right:7,top:"50%",transform:`translateY(-50%) rotate(${dropdown==="sessLevDrop"?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                                {dropdown==="sessLevDrop"&&ddAnchor&&(
                                  <><div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setDropdown(null);setDdAnchor(null);}}/>
                                  <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,width:ddAnchor.width,zIndex:9999,background:c.sf,border:"1px solid rgba(232,194,82,0.2)",boxShadow:"0 4px 20px rgba(0,0,0,0.6)"}}>
                                    <div style={{height:2,background:`linear-gradient(90deg,transparent,${c.gold},transparent)`}}/>
                                    {["1:1","1:2","1:5","1:10","1:20","1:30","1:50","1:100","1:200","1:500"].map(v=>{
                                      const isAct=v===sessLeverage;const isHv=hov==="levOpt_"+v;
                                      return(
                                        <div key={v} onClick={e=>{e.stopPropagation();setSessLeverage(v);setDropdown(null);setDdAnchor(null);}}
                                          onMouseEnter={()=>setHov("levOpt_"+v)} onMouseLeave={()=>setHov(null)}
                                          style={{display:"flex",alignItems:"center",padding:"4px 10px",cursor:"default",position:"relative",background:isAct?"rgba(232,194,82,0.08)":isHv?"rgba(255,255,255,0.04)":"transparent",transition:"background 0.1s"}}>
                                          {isAct&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.gold},transparent)`,boxShadow:"0 0 6px rgba(232,194,82,0.4)"}}/>}
                                          <span style={{fontSize:11,fontWeight:isAct?700:500,color:isAct?c.gold:isHv?c.tx:c.ts,fontFamily:F}}>{v}</span>
                                        </div>
                                      );
                                    })}
                                  </div></>
                                )}
                              </div>
                            </div>
                            {/* Max position with Lots/% toggle */}
                            <div style={{height:27,display:"flex",alignItems:"center",gap:10}}>
                              <div style={{width:130,flexShrink:0,display:"flex",alignItems:"center",gap:6,cursor:"default"}} onClick={()=>setSessMaxPosEnabled(v=>!v)}>
                                {TlChk(sessMaxPosEnabled,"chk_maxPos","",null,"rgba(232,194,82,0.9)")}
                                <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap"}}>Max position</span>
                              </div>
                              <div style={{position:"relative",width:50,flexShrink:0,opacity:sessMaxPosEnabled?1:0.4}}>
                                <input type="number" min={0} step={1} value={sessMaxLotSize} onChange={e=>setSessMaxLotSize(e.target.value)} disabled={!sessMaxPosEnabled} placeholder="—" className="tlr-nospinner"
                                  style={{...inp({fontWeight:700,fontVariantNumeric:"tabular-nums",textAlign:"left",padding:"0 0 0 6px",width:"100%",cursor:sessMaxPosEnabled?"text":"not-allowed"})}}/>
                                {intArrows(sessMaxLotSize,setSessMaxLotSize,0,999,sessMaxPosEnabled)}
                              </div>
                              {(()=>{
                                const mpuKey="maxPosUnitDrop";
                                const MPU_OPTS=[["lots","Lots"],["%","%"]];
                                return(
                                  <div style={{position:"relative",width:72,flexShrink:0}}>
                                    <div onClick={e=>{e.stopPropagation();if(dropdown===mpuKey){setDropdown(null);setDdAnchor(null);}else{const r=e.currentTarget.getBoundingClientRect();setDdAnchor({top:r.bottom/Z+2,left:r.left/Z,width:r.width/Z});setDropdown(mpuKey);}}}
                                      style={{height:27,display:"flex",alignItems:"center",padding:"0 22px 0 8px",position:"relative",background:c.el,border:`1px solid ${dropdown===mpuKey?"rgba(232,194,82,0.5)":c.brH}`,cursor:"default",userSelect:"none",boxSizing:"border-box",transition:"border-color 0.12s",opacity:sessMaxPosEnabled?1:0.4}}>
                                      <span style={{fontSize:10,fontWeight:600,color:c.tx,fontFamily:F}}>{MPU_OPTS.find(([u])=>u===sessMaxPosUnit)?.[1]||"Lots"}</span>
                                      <svg style={{position:"absolute",right:6,top:"50%",transform:`translateY(-50%) rotate(${dropdown===mpuKey?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    </div>
                                    {dropdown===mpuKey&&ddAnchor&&sessMaxPosEnabled&&(<>
                                      <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setDropdown(null);setDdAnchor(null);}}/>
                                      <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,width:ddAnchor.width,zIndex:9999,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:"0 8px 24px rgba(0,0,0,0.6)"}}>
                                        <div style={{height:2,background:`linear-gradient(90deg,rgba(232,194,82,0.4),rgba(232,194,82,0.9),rgba(232,194,82,0.4))`}}/>
                                        {MPU_OPTS.map(([u,ulbl])=>{const isA=sessMaxPosUnit===u;const isH=hov==="mpuOpt_"+u;return(<div key={u} onClick={e=>{e.stopPropagation();setSessMaxPosUnit(u);setDropdown(null);setDdAnchor(null);}} onMouseEnter={()=>setHov("mpuOpt_"+u)} onMouseLeave={()=>setHov(null)} style={{display:"flex",alignItems:"center",padding:"5px 10px",cursor:"default",position:"relative",background:isA?"rgba(232,194,82,0.08)":isH?"rgba(255,255,255,0.03)":"transparent",transition:"background 0.1s"}}>{isA&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,rgba(232,194,82,0.9),transparent)`,boxShadow:"0 0 6px rgba(232,194,82,0.4)"}}/>}<span style={{fontSize:10,fontWeight:isA?700:500,color:isA?"rgba(232,194,82,0.9)":isH?c.tx:c.ts,fontFamily:F}}>{ulbl}</span></div>);})}
                                      </div>
                                    </>)}
                                  </div>
                                );
                              })()}
                            </div>
                            {commonMinDaysRow}
                            {commonConsistencyRow}
                            {chkRowCommon(sessWeekendHold,"chk_weekendHold",setSessWeekendHold,"Hold positions over weekends")}
                          </div>
                        </>);
                      })()}
                      </div>

                    </div>
                  </div>
                  {/* Sticky bottom bar */}
                  <div style={{height:46,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",borderTop:`1px solid ${c.brH}`,background:c.el,gap:10,boxShadow:"0 -4px 20px rgba(0,0,0,0.5)"}}>
                    <div style={{flex:1,display:"flex",alignItems:"center",gap:0,overflow:"hidden",fontFamily:F}}>
                      {[
                        [newSessAssetClass||"—",c.ts],
                        [sessTradingMode==="prop"?"Prop Firm":"Standard",sessTradingMode==="prop"?c.gold:c.ts],
                        [(()=>{const sym={"USD":"$","EUR":"€","GBP":"£","JPY":"¥"};return`${sym[newSessCurrency]||"$"}${(parseFloat(newSessCapital)||0).toLocaleString()}`;})(),c.ts],
                        [newSessStart&&newSessEnd?`${newSessStart.split("T")[0]} → ${newSessEnd.split("T")[0]}`:"No date set",newSessStart&&newSessEnd?c.ts:c.tm],
                      ].map(([val,col],i,arr)=>(
                        <span key={i} style={{display:"flex",alignItems:"center",gap:0,overflow:"hidden",minWidth:0,flexShrink:i===arr.length-1?1:0}}>
                          <b style={{fontSize:10,fontWeight:700,color:col,fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{val}</b>
                          {i<arr.length-1&&<span style={{fontSize:10,color:c.tm,margin:"0 6px",flexShrink:0}}>·</span>}
                        </span>
                      ))}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                      <div onClick={closeNewSess}
                        onMouseEnter={()=>setHov("sessCancel")} onMouseLeave={()=>setHov(null)}
                        style={{height:27,padding:"0 14px",display:"flex",alignItems:"center",border:`1px solid ${hov==="sessCancel"?c.brH:c.br}`,background:"transparent",cursor:"default",fontSize:10,fontWeight:600,color:hov==="sessCancel"?c.tx:c.ts,letterSpacing:"0.04em",fontFamily:F,transition:"all 0.12s"}}>
                        Cancel
                      </div>
                      <div onClick={isValid2?saveNewSession:undefined}
                        onMouseEnter={()=>setHov("sessSave")} onMouseLeave={()=>setHov(null)}
                        style={{height:27,padding:"0 14px",display:"flex",alignItems:"center",gap:5,border:`1px solid ${isValid2?(hov==="sessSave"?c.brH:c.br):"rgba(255,255,255,0.06)"}`,background:"transparent",cursor:isValid2?"default":"not-allowed",fontSize:10,fontWeight:600,color:isValid2?(hov==="sessSave"?c.tx:c.ts):"rgba(255,255,255,0.2)",letterSpacing:"0.04em",fontFamily:F,transition:"all 0.12s"}}>
                        <svg width={10} height={10} viewBox="0 0 20 20" fill="none"><path d="M4 2h9l3 3v13H4V2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><rect x="7" y="2" width="6" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.3"/><rect x="6" y="12" width="8" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.3"/></svg>
                        Save
                      </div>
                      <div onClick={isValid2?()=>{void startNewSession();}:undefined}
                        onMouseEnter={()=>setHov("sessStart")} onMouseLeave={()=>setHov(null)}
                        style={{height:27,padding:"0 16px",display:"flex",alignItems:"center",gap:6,background:isValid2?`linear-gradient(135deg,${c.ac},${c.acL})`:"rgba(38,67,247,0.15)",cursor:isValid2?"default":"not-allowed",fontSize:10,fontWeight:700,color:isValid2?"#fff":"rgba(255,255,255,0.25)",letterSpacing:"0.05em",boxShadow:isValid2?"0 2px 10px rgba(38,67,247,0.35)":"none",filter:hov==="sessStart"&&isValid2?"brightness(1.12)":"brightness(1)",transition:"all 0.12s",flexShrink:0,fontFamily:F}}>
                        <svg width={8} height={8} viewBox="0 0 12 12" fill="none"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>
                        Start Session
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
      <style>{`
        @keyframes tlrPopIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
