// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import FlagSvg from "./backtestModal/FlagSvg";
import { currencyCountry } from "./backtestModal/FlagSvg";

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

export type BacktestNewSessionInitialState = {
  playbook?: string;
  sessionName?: string;
};

export type BacktestNewSessionModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
  initialState?: BacktestNewSessionInitialState | null;
};

export function BacktestNewSessionModal({ open, onClose, onSaved, initialState }: BacktestNewSessionModalProps) {
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
  const [newSessMarketOpen, setNewSessMarketOpen] = useState(false);
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

  const availFiles = [
    { id: "f1", name: "EURUSD_M1_2020-2024.csv", ticker: "EURUSD", tf: "1m", from: "2020-01-02", to: "2024-12-31", size: "4.2 GB", asset: "Forex" },
    { id: "f2", name: "GBPUSD_M5_2018-2024.csv", ticker: "GBPUSD", tf: "5m", from: "2018-03-01", to: "2024-12-31", size: "1.8 GB", asset: "Forex" },
    { id: "f3", name: "NQ_M1_2019-2024.csv", ticker: "NQ", tf: "1m", from: "2019-01-02", to: "2024-12-31", size: "6.1 GB", asset: "Futures" },
    { id: "f4", name: "ES_M5_2017-2024.csv", ticker: "ES", tf: "5m", from: "2017-06-01", to: "2024-12-31", size: "2.3 GB", asset: "Futures" },
    { id: "f5", name: "XAUUSD_H1_2015-2024.csv", ticker: "XAUUSD", tf: "1H", from: "2015-01-05", to: "2024-12-31", size: "820 MB", asset: "Forex" },
    { id: "f6", name: "BTCUSD_M15_2020-2024.csv", ticker: "BTCUSD", tf: "15m", from: "2020-01-01", to: "2024-12-31", size: "1.1 GB", asset: "Crypto" },
    { id: "f7", name: "USDJPY_M1_2021-2024.csv", ticker: "USDJPY", tf: "1m", from: "2021-01-04", to: "2024-12-31", size: "2.9 GB", asset: "Forex" },
  ];

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
    setNewSessMarketOpen(false);
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
    if (open && !prevOpen.current) {
      resetFormToDefaults();
      if (initialState?.sessionName) setNewSessName(initialState.sessionName);
      if (initialState?.playbook) setNewSessPlaybook(initialState.playbook);
    }
    prevOpen.current = open;
  }, [open, resetFormToDefaults, initialState]);

  const closeNewSess = () => {
    setNewSessFilePickerOpen(false);
    setNewSessTickerInput("");
    setNewSessTickerFocus(false);
    setNewSessStratDropOpen(false);
    setNewSessSymDropOpen(false);
    setNewSessAssetDropOpen(false);
    setNewSessMarketOpen(false);
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

  const sessInfoDone = !!newSessName.trim();
  const sessSettingsDone = sessInfoDone && newSessTickers.length > 0 && !!newSessStart && !!newSessEnd;
  const lockedBox = { opacity: 0.35, pointerEvents: "none" as const, userSelect: "none" as const };
  const activeBox = {};
  const isValid2 = !!(newSessName && newSessTickers.length > 0 && newSessStart && newSessEnd && newSessCapital);

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

  function normSessionSym(t: string) {
    return String(t || "").replace(/[\/\s_.-]/g, "").toUpperCase();
  }

  async function resolveInstrumentsForTickers(tickers: string[]) {
    const unique = [...new Set(tickers.map((t) => String(t || "").trim()).filter(Boolean))];
    if (!unique.length) {
      return {
        instruments: {} as Record<string, Record<string, unknown>>,
        files: [] as { id: string | number; name: string }[],
        primaryFileId: null as string | number | null,
        fileName: null as string | null,
        missing: [] as string[],
      };
    }

    const res = await fetch("/api/files?session_ready=1", { credentials: "include" });
    if (!res.ok) {
      throw new Error("Could not load your chart datasets. Check that you are logged in.");
    }
    const payload = await res.json();
    const apiFiles = Array.isArray(payload?.files) ? payload.files : [];

    const instruments: Record<string, Record<string, unknown>> = {};
    const files: { id: string | number; name: string }[] = [];
    const missing: string[] = [];

    unique.forEach((sym) => {
      const key = normSessionSym(sym);
      const match = apiFiles.find((f: Record<string, unknown>) => {
        const ft = normSessionSym(String(f.ticker || ""));
        const fromName = normSessionSym(String(f.original_name || f.name || "").replace(/\.csv$/i, ""));
        return ft === key || fromName === key || fromName.startsWith(key) || key.startsWith(ft);
      });
      if (!match) {
        missing.push(sym);
        return;
      }
      const assetKey =
        String(match.asset_class || newSessAssetClass || "Forex").includes("Future") ? "Futures"
        : String(match.asset_class || "").includes("Crypto") ? "Crypto"
        : String(match.asset_class || "").includes("Stock") ? "Stocks"
        : "Forex";
      const def = instrDefaults[assetKey] || instrDefaults.Forex;
      const rowKey = normSessionSym(sym);
      const row: Record<string, unknown> = {
        ticker: sym,
        symbol: sym,
        fileId: match.id,
        fileName: match.original_name || match.name,
        asset: assetKey,
        asset_class: assetKey,
        ...def,
      };
      instruments[rowKey] = row;
      files.push({
        id: match.id as string | number,
        name: String(match.original_name || match.name || sym),
      });
    });

    return {
      instruments,
      files,
      primaryFileId: files[0]?.id ?? null,
      fileName: files[0]?.name ?? null,
      missing,
    };
  }

  async function buildChartConfig(): Promise<Record<string, unknown>> {
    const primary = newSessTickers[0] || newSessSymbol || "NQ";
    const sessionName = newSessName.trim() || "Backtest Session";
    const startDate = (newSessStart || "").split("T")[0] || "";
    const endDate = (newSessEnd || "").split("T")[0] || "";
    const modeType = sessTradingMode === "prop" ? "propfirm" : "standard";
    const tickers = newSessTickers.length > 0 ? [...newSessTickers] : [primary];

    const resolved = await resolveInstrumentsForTickers(tickers);
    if (!resolved.primaryFileId) {
      const miss = resolved.missing.length ? resolved.missing.join(", ") : tickers.join(", ");
      throw new Error(
        `No chart data file found for ${miss}. Upload a CSV dataset for these symbols first (Chart → Data), then start the session again.`
      );
    }
    if (resolved.missing.length > 0) {
      throw new Error(
        `Missing chart data for: ${resolved.missing.join(", ")}. Upload datasets for every selected symbol or remove them from the session.`
      );
    }

    const instruments = Object.fromEntries(
      Object.entries(resolved.instruments).map(([k, row]) => {
        if (!newSessTradingCostsEnabled) {
          return [k, { ...row, spread: 0, commission: 0 }];
        }
        return [k, row];
      })
    );

    return {
      type: modeType,
      sessionName,
      description: newSessDescription,
      playbook: newSessPlaybook || "",
      strategy_name: newSessPlaybook || "",
      tickers: newSessTickers,
      supporting_tickers: newSessSupportTickers,
      asset_class: newSessAssetClass,
      trading_mode: sessTradingMode,
      symbol: newSessTickers.length === 1 ? newSessTickers[0] : newSessTickers.length > 1 ? `${newSessTickers.length} symbols` : primary,
      fileId: resolved.primaryFileId,
      fileName: resolved.fileName,
      files: resolved.files,
      instruments,
      symbols: tickers.map((sym) => ({
        symbolName: sym,
        fileId: instruments[normSessionSym(sym)]?.fileId,
      })),
      startDate,
      endDate,
      startBalance: String(newSessCapital || "10000"),
      account_currency: newSessCurrency,
      leverage: sessLeverage,
      margin_call_level: parseFloat(newSessMarginCall || "100"),
      stop_out_level: parseFloat(newSessStopOut || "50"),
      max_risk_per_trade_pct: parseFloat(newSessMaxRisk || "0") || null,
      timeframe: newSessTf,
      defaultRiskType: sessRiskMode,
      defaultRisk: parseFloat(sessRiskVal || "1") || 1,
      allowBackNavigation: newSessRollback,
      protectionPreset: newSessProtect,
      // Legacy `sessCommission` defaults to "none" — must not be written when Real-World Trading Costs is on.
      commission: newSessTradingCostsEnabled ? "Per Lot" : "None",
      trading_costs_enabled: newSessTradingCostsEnabled,
      rollback_allowed: newSessRollback,
      replayMode: sessReplayMode,
      replaySpeed: sessReplaySpeed,
      timezone: newSessTimezone,
      dst: newSessDST,
      advanced_order: newSessAdvancedOrder,
      trading_costs: newSessTradingCostsEnabled
        ? {
            costs: newSessCosts,
            spreads: (() => {
              const defaultSpreads: Record<string, string> = {
                EURUSD: "0.8", GBPUSD: "1.0", USDJPY: "0.8", USDCHF: "1.1", AUDUSD: "0.8",
                NZDUSD: "1.2", USDCAD: "1.1", EURGBP: "1.1", EURJPY: "1.3", GBPJPY: "1.9",
                XAUUSD: "0.30", XAGUSD: "0.03", USDSEK: "3.0", USDNOK: "3.5",
                NQ: "1", ES: "1", YM: "1", RTY: "1", CL: "1", GC: "1", SI: "1", NG: "1",
                MNQ: "1", MES: "1", MYM: "1", M2K: "1", MGC: "1", MCL: "1",
                AAPL: "0.01", TSLA: "0.01", NVDA: "0.01", MSFT: "0.01", AMZN: "0.01", GOOG: "0.02",
                BTCUSD: "0.01", ETHUSD: "0.01", BNBUSD: "0.03", SOLUSD: "0.04", ADAUSD: "0.08",
              };
              const merged: Record<string, string> = {};
              [...newSessTickers, ...newSessSupportTickers].forEach((sym) => {
                const k = normSessionSym(sym);
                const v = newSessSymbolSpreads[k] ?? defaultSpreads[k];
                if (v != null && v !== "") merged[k] = String(v);
              });
              return merged;
            })(),
            futuresMargins: newSessFuturesData,
          }
        : null,
      prop_rules: sessTradingMode === "prop" ? {
        numPhases: sessNumPhases,
        challengeType: sessChallengeType,
        p1Pct: { dl: sessP1DailyLossPct, dd: sessP1TotalDDPct, pt: sessP1ProfitTargetPct },
        p2Pct: { dl: sessP2DailyLossPct, dd: sessP2TotalDDPct, pt: sessP2ProfitTargetPct },
        p1Amt: { dl: sessP1DailyLossAmt, dd: sessP1MaxDDAmt, pt: sessP1ProfitTargetAmt },
        p2Amt: { dl: sessP2DailyLossAmt, dd: sessP2MaxDDAmt, pt: sessP2ProfitTargetAmt },
      } : null,
    };
  }

  async function persistSession(): Promise<number | null> {
    const sessionName = newSessName.trim() || "Backtest Session";
    const session_type = sessTradingMode === "prop" ? "propfirm" : "personal";
    const config = await buildChartConfig();
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
      const cfg = await buildChartConfig();
      const sessionName = newSessName.trim() || "Backtest Session";
      const session_type = sessTradingMode === "prop" ? "propfirm" : "personal";
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: sessionName, session_type, config: cfg }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ? String(body.detail) : `HTTP ${res.status}`);
      }
      const payload = await res.json();
      const id = payload?.session?.id != null ? Number(payload.session.id) : null;
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
      const mode = sessTradingMode === "prop" ? "propfirm" : "backtest";
      const q = id != null ? `?mode=${encodeURIComponent(mode)}&sessionId=${encodeURIComponent(String(id))}` : `?mode=${encodeURIComponent(mode)}`;
      window.location.href = `/chart/index.html${q}`;
    } catch (e: any) {
      window.alert(`Failed to start session: ${e?.message || e}`);
    }
  };

  return (
    <>