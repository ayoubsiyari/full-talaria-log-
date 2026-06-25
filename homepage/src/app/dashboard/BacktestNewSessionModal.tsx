// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FlagSvg from "./backtestModal/FlagSvg";
import { currencyCountry } from "./backtestModal/FlagSvg";
import { SessionDateCalendar } from "./backtestModal/SessionDateCalendar";
import { computeOverlapRange, isoToDisplay, spanFromApiFile, clampIso } from "./backtestModal/dateRangeUtils";
import { compareSymbolsByPopularity } from "./backtestModal/symbolPopularity";
import {
  displaySessionSymbol,
  extractTickerStemFromDatasetName,
  findDatasetFileForSymbol,
  normSymbolKey,
} from "./backtestModal/symbolMatch";
import { JOURNAL_API_BASE, journalAuthHeaders } from "@/lib/journalApi";
import { apiStrategyToBankRow, extractStrategyVariablesFromDefinition } from "./strategies/strategyLabV9Mappers";

import { type SessionLimitGateData } from "./sessionLimitGate";

const F = "'Exo 2', sans-serif";

const normalizeSearchQuery = (raw: string) => String(raw ?? "").trim().toLowerCase();

const STARTING_BALANCE_MAX_DIGITS = 6;
function sanitizeStartingBalanceInput(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, STARTING_BALANCE_MAX_DIGITS);
}
function parseStartingBalanceInput(raw: string): number | null {
  const digits = sanitizeStartingBalanceInput(raw);
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function sanitizeNonNegativeNumericInput(raw: string): string {
  const s = String(raw ?? "").trim().replace(/-/g, "");
  if (!s || s === ".") return s;
  const n = Number.parseFloat(s);
  if (Number.isFinite(n) && n < 0) return "0";
  return s;
}

function finalizeNonNegativeNumericInput(raw: string, fallback = "0"): string {
  const s = sanitizeNonNegativeNumericInput(raw);
  if (!s || s === ".") return fallback;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? s : fallback;
}

function clampNonNegativeCostNumber(raw: unknown, fallback = 0): number {
  const n = Number.parseFloat(String(raw ?? ""));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

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
  tradingMode?: "standard" | "prop";
  editSession?: {
    id: number | string;
    name?: string;
    session_type?: string;
    config?: Record<string, unknown>;
    startDate?: string;
    endDate?: string;
    capital?: number;
    tradingMode?: string;
    tickers?: string[];
    timeframe?: string;
    strategyName?: string;
    strategyDesc?: string;
    leverage?: string;
    riskVal?: string;
    riskMode?: string;
    replayMode?: string;
    replaySpeed?: number;
    rollbackAllowed?: boolean;
  };
};

export type BacktestNewSessionModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
  initialState?: BacktestNewSessionInitialState | null;
  onSessionLimitReached?: (data: SessionLimitGateData) => void;
};

export function BacktestNewSessionModal({ open, onClose, onSaved, initialState, onSessionLimitReached }: BacktestNewSessionModalProps) {
  const router = useRouter();
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
  const [editSessOriginalTradingMode, setEditSessOriginalTradingMode] = useState<"standard" | "prop" | null>(null);
  const [savingSession, setSavingSession] = useState(false);
  const [newSessTickers, setNewSessTickers] = useState<string[]>([]);
  const [newSessTickerInput, setNewSessTickerInput] = useState("");
  const [newSessTickerFocus, setNewSessTickerFocus] = useState(false);
  const [newSessAssetClass, setNewSessAssetClass] = useState("Forex");
  const [newSessAdvancedOrder, setNewSessAdvancedOrder] = useState(false);
  const [newSessRollback, setNewSessRollback] = useState(false);
  const [newSessMfeMaeEnabled, setNewSessMfeMaeEnabled] = useState(true);
  const [newSessMfeMaeHours, setNewSessMfeMaeHours] = useState("4");
  const [newSessPostExitMode, setNewSessPostExitMode] = useState<"hours" | "candles">("hours");
  const [newSessPostExitCandles, setNewSessPostExitCandles] = useState("50");
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
  const [userLimits, setUserLimits] = useState({
    maxTradingSessions: 5,
    maxTickers: 5,
    maxSupporting: 5,
    tradingSessionsCount: 0,
    isAdmin: false,
    planName: null as string | null,
    planId: null as number | null,
    subscriptionStatus: null as string | null,
    isManualPlan: false,
    hasActiveSubscription: false,
    hasStripeCustomer: false,
  });
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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const u = data?.user || {};
        const sub = u.subscription || {};
        const status = String(sub.status || "").toLowerCase();
        if (cancelled) return;
        setUserLimits({
          maxTradingSessions: u.max_trading_sessions ?? 5,
          maxTickers: u.max_tickers_per_session ?? 5,
          maxSupporting: u.max_supporting_tickers_per_session ?? 5,
          tradingSessionsCount: u.trading_sessions_count ?? 0,
          isAdmin: u.role === "admin",
          planName: sub.plan_name?.trim() || null,
          planId: typeof sub.plan_id === "number" ? sub.plan_id : null,
          subscriptionStatus: sub.status || null,
          isManualPlan: Boolean(sub.is_manual),
          hasActiveSubscription: Boolean(sub && ["active", "trialing"].includes(status)),
          hasStripeCustomer: Boolean(String(u.stripe_customer_id || "").trim()),
        });
      } catch {
        /* keep defaults */
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Viewport-fixed dropdowns use getBoundingClientRect() — must not scale (was 1.05 for design mockup zoom).
  const Z = 1;
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
    Stocks: { spread: "0.02", commission: "0.02", pipSize: "0.01", pipVal: "1", contractSize: "1", minLot: "1", lotStep: "1" },
  };

  const [sessionApiFiles, setSessionApiFiles] = useState<Record<string, unknown>[]>([]);
  const [sessionFilesLoading, setSessionFilesLoading] = useState(false);
  const [stratRows, setStratRows] = useState<any[]>([]);

  function normSessionSym(t: string) {
    return String(t || "").replace(/[\/\s_.-]/g, "").toUpperCase();
  }

  const SESSION_SYM_CAT: Record<string, string> = {
    EURUSD: "Forex", GBPUSD: "Forex", USDJPY: "Forex", USDCHF: "Forex", AUDUSD: "Forex",
    NZDUSD: "Forex", USDCAD: "Forex", EURGBP: "Forex", EURJPY: "Forex", GBPJPY: "Forex",
    XAUUSD: "Forex", XAGUSD: "Forex", USDSEK: "Forex", USDNOK: "Forex",
    NQ: "Futures", ES: "Futures", YM: "Futures", RTY: "Futures", CL: "Futures", GC: "Futures",
    SI: "Futures", NG: "Futures", MNQ: "Futures", MES: "Futures", MYM: "Futures", M2K: "Futures",
    MGC: "Futures", MCL: "Futures",
    BTCUSD: "Crypto", ETHUSD: "Crypto", BNBUSD: "Crypto", SOLUSD: "Crypto", ADAUSD: "Crypto",
    AAPL: "Stocks", TSLA: "Stocks", NVDA: "Stocks", MSFT: "Stocks", AMZN: "Stocks", GOOG: "Stocks",
  };

  function sessionAssetOf(sym: string) {
    const cat = SESSION_SYM_CAT[normSessionSym(sym)] || "";
    return cat === "Equities" ? "Stocks" : cat || "Forex";
  }

  const DEFAULT_SYMBOL_SPREADS: Record<string, string> = {
    EURUSD: "0.8", GBPUSD: "1.0", USDJPY: "0.8", USDCHF: "1.1", AUDUSD: "0.8",
    NZDUSD: "1.2", USDCAD: "1.1", EURGBP: "1.1", EURJPY: "1.3", GBPJPY: "1.9",
    XAUUSD: "0.30", XAGUSD: "0.03", USDSEK: "3.0", USDNOK: "3.5",
    NQ: "1", ES: "1", YM: "1", RTY: "1", CL: "1", GC: "1", SI: "1", NG: "1",
    MNQ: "1", MES: "1", MYM: "1", M2K: "1", MGC: "1", MCL: "1",
    AAPL: "0.01", TSLA: "0.01", NVDA: "0.01", MSFT: "0.01", AMZN: "0.01", GOOG: "0.02",
    BTCUSD: "0.01", ETHUSD: "0.01", BNBUSD: "0.03", SOLUSD: "0.04", ADAUSD: "0.08",
  };

  function resolveSessionLeverage(
    tradingMode: string,
    primarySym: string,
    tickers: string[],
    costs: typeof newSessCosts,
    propLeverage: string,
  ) {
    if (tradingMode === "prop") return propLeverage;
    const syms = [primarySym, ...tickers];
    for (const sym of syms) {
      const asset = sessionAssetOf(sym);
      const lev = costs[asset as keyof typeof costs]?.leverage;
      if (lev) return String(lev);
    }
    return propLeverage;
  }

  function assetClassToPickerCat(assetClass: string) {
    const a = String(assetClass || "").toLowerCase();
    if (a.includes("future")) return "Futures";
    if (a.includes("crypto")) return "Crypto";
    if (a.includes("stock") || a.includes("equit")) return "Equities";
    return "Forex";
  }

  function findApiFileForSymbol(sym: string, apiFiles: Record<string, unknown>[]) {
    return findDatasetFileForSymbol(sym, apiFiles);
  }

  const sessionDatasetSymbols = useMemo(() => {
    const seen = new Set<string>();
    const out: { sym: string; cat: string }[] = [];
    sessionApiFiles.forEach((f) => {
      const stem =
        normSymbolKey(String(f.ticker || "")) ||
        extractTickerStemFromDatasetName(String(f.original_name || f.name || ""));
      const sym = displaySessionSymbol(stem);
      if (!sym || seen.has(sym)) return;
      seen.add(sym);
      out.push({ sym, cat: assetClassToPickerCat(String(f.asset_class || "")) });
    });
    return out.sort(compareSymbolsByPopularity);
  }, [sessionApiFiles]);

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
    setNewSessMfeMaeEnabled(true);
    setNewSessMfeMaeHours("4");
    setNewSessPostExitMode("hours");
    setNewSessPostExitCandles("50");
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

  const applySessionToForm = useCallback((sess: NonNullable<BacktestNewSessionInitialState["editSession"]>) => {
    const cfg = sess.config && typeof sess.config === "object" ? sess.config : {};
    const tickers = Array.isArray(sess.tickers) && sess.tickers.length
      ? sess.tickers
      : Array.isArray(cfg.tickers)
        ? (cfg.tickers as string[])
        : cfg.symbol
          ? [String(cfg.symbol)]
          : [];
    const startDate = String(
      sess.startDate || cfg.startDate || cfg.start_date || ""
    ).slice(0, 10);
    const endDate = String(sess.endDate || cfg.endDate || cfg.end_date || "").slice(0, 10);
    const capital = String(
      sess.capital ?? cfg.startBalance ?? cfg.start_balance ?? cfg.capital ?? "10000"
    );
    const tradingModeRaw = String(
      sess.tradingMode || cfg.trading_mode || cfg.tradingMode || "standard"
    ).toLowerCase();
    const isProp = tradingModeRaw.includes("prop");
    const playbook = String(cfg.playbook || cfg.strategy_name || sess.strategyName || "");
    const tf = String(sess.timeframe || cfg.timeframe || cfg.tf || "1H");

    setEditSessId(sess.id);
    setNewSessName(sess.name || String(cfg.sessionName || cfg.session_name || "Backtest Session"));
    setNewSessPlaybook(playbook);
    setNewSessDescription(String(cfg.description || sess.strategyDesc || ""));
    setNewSessTickers(tickers.filter(Boolean));
    setNewSessSymbol(tickers[0] || "NQ");
    setNewSessTf(tf);
    setNewSessStart(startDate);
    setNewSessEnd(endDate);
    setNewSessStartInput(startDate);
    setNewSessEndInput(endDate);
    setNewSessCapital(sanitizeStartingBalanceInput(capital));
    setNewSessCurrency(String(cfg.account_currency || cfg.currency || "USD"));
    setNewSessAssetClass(String(cfg.asset_class || cfg.assetClass || "Forex"));
    setSessTradingMode(isProp ? "prop" : "standard");
    setSessLeverage(String(sess.leverage || cfg.leverage || "1:100"));
    setSessRiskVal(String(sess.riskVal || cfg.defaultRisk || cfg.risk_val || "1"));
    setSessRiskMode(String(sess.riskMode || cfg.defaultRiskType || cfg.risk_mode || "pct"));
    setSessReplayMode(String(sess.replayMode || cfg.replayMode || cfg.replay_mode || "candle").toLowerCase());
    setSessReplaySpeed(Number(sess.replaySpeed ?? cfg.replaySpeed ?? cfg.replay_speed ?? 30) || 30);
    setNewSessRollback(!!(sess.rollbackAllowed ?? cfg.allowBackNavigation ?? cfg.rollback_allowed));
    setNewSessTradingCostsEnabled(
      !!(cfg.trading_costs_enabled ?? (cfg.commission && cfg.commission !== "None"))
    );
    const tc = cfg.trading_costs && typeof cfg.trading_costs === "object"
      ? (cfg.trading_costs as Record<string, unknown>)
      : null;
    if (tc?.costs && typeof tc.costs === "object") {
      setNewSessCosts((prev) => ({ ...prev, ...(tc.costs as typeof prev) }));
    }
    if (tc?.spreads && typeof tc.spreads === "object") {
      setNewSessSymbolSpreads(tc.spreads as Record<string, string>);
    }
    if (tc?.futuresMargins && typeof tc.futuresMargins === "object") {
      setNewSessFuturesData(tc.futuresMargins as Record<string, unknown>);
    }
    const mfe = cfg.mfe_mae && typeof cfg.mfe_mae === "object"
      ? (cfg.mfe_mae as Record<string, unknown>)
      : null;
    if (cfg.mfe_mae_enabled === false || mfe?.enabled === false) {
      setNewSessMfeMaeEnabled(false);
    } else if (cfg.mfe_mae_enabled === true || mfe?.enabled === true) {
      setNewSessMfeMaeEnabled(true);
    }
    const mfeHours = cfg.mfe_mae_tracking_hours ?? mfe?.tracking_hours ?? mfe?.hours;
    if (mfeHours != null && mfeHours !== "") setNewSessMfeMaeHours(String(mfeHours));
    const postMode = cfg.post_exit_tracking_mode ?? mfe?.post_exit_mode ?? mfe?.mode;
    if (postMode === "candles" || postMode === "hours") {
      setNewSessPostExitMode(postMode);
    }
    const postCandles = cfg.post_exit_tracking_candles ?? mfe?.post_exit_candles ?? mfe?.candles;
    if (postCandles != null && postCandles !== "") {
      setNewSessPostExitCandles(String(postCandles));
    }
    if (cfg.margin_call_level != null) setNewSessMarginCall(String(cfg.margin_call_level));
    if (cfg.stop_out_level != null) setNewSessStopOut(String(cfg.stop_out_level));
    setNewSessTimezone(String(cfg.timezone || "America/New_York"));
    setNewSessDST(cfg.dst !== false);
    setNewSessProtect(String(cfg.protectionPreset || cfg.protection_preset || "none"));
    if (Array.isArray(cfg.supporting_tickers)) {
      setNewSessSupportTickers(cfg.supporting_tickers as string[]);
      setNewSessSupportEnabled((cfg.supporting_tickers as string[]).length > 0);
    }
  }, []);

  useEffect(() => {
    if (open && !prevOpen.current) {
      resetFormToDefaults();
      if (initialState?.editSession) {
        applySessionToForm(initialState.editSession);
      } else {
        if (initialState?.sessionName) setNewSessName(initialState.sessionName);
        if (initialState?.playbook) setNewSessPlaybook(initialState.playbook);
        if (initialState?.tradingMode === "prop") setSessTradingMode("prop");
        else if (initialState?.tradingMode === "standard") setSessTradingMode("standard");
      }
    }
    prevOpen.current = open;
  }, [open, resetFormToDefaults, initialState, applySessionToForm]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSessionFilesLoading(true);
    fetch("/api/files?session_ready=1", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { files: [] }))
      .then((payload) => {
        if (!cancelled) {
          setSessionApiFiles(Array.isArray(payload?.files) ? payload.files : []);
        }
      })
      .catch(() => {
        if (!cancelled) setSessionApiFiles([]);
      })
      .finally(() => {
        if (!cancelled) setSessionFilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || sessionFilesLoading || !sessionDatasetSymbols.length) return;
    const catToMarket: Record<string, string> = { Forex: "Forex", Futures: "Futures", Crypto: "Crypto", Equities: "Stocks" };
    const markets = [...new Set(sessionDatasetSymbols.map((s) => catToMarket[s.cat] || "Forex"))];
    if (!markets.includes(newSessAssetClass)) {
      setNewSessAssetClass(markets[0] || "Forex");
    }
    const avail = new Set(sessionDatasetSymbols.map((s) => s.sym));
    setNewSessTickers((prev) => prev.filter((t) => avail.has(t)));
    setNewSessSupportTickers((prev) => prev.filter((t) => avail.has(t)));
  }, [open, sessionFilesLoading, sessionDatasetSymbols]);

  useEffect(() => {
    if (!open) return;
    const fromBoot =
      typeof window !== "undefined" && Array.isArray(window.__TALARIA_V16_BOOT__?.strategyBank)
        ? window.__TALARIA_V16_BOOT__!.strategyBank!
        : null;
    if (fromBoot?.length) {
      setStratRows(fromBoot);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${JOURNAL_API_BASE}/strategies`, {
          credentials: "include",
          headers: journalAuthHeaders(),
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          setStratRows((data?.strategies || []).map((s: any) => apiStrategyToBankRow(s)));
        }
      } catch {
        if (!cancelled) setStratRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const playbookDisplay = useMemo(() => {
    const pb = newSessPlaybook || "";
    if (pb.startsWith("strategy:")) {
      const id = Number(pb.slice("strategy:".length));
      const row = stratRows.find((s) => Number(s.id) === id);
      return row?.name || pb;
    }
    return pb;
  }, [newSessPlaybook, stratRows]);

  async function loadSessionApiFiles() {
    if (sessionApiFiles.length) return sessionApiFiles;
    const res = await fetch("/api/files?session_ready=1", { credentials: "include" });
    if (!res.ok) {
      throw new Error("Could not load your chart datasets. Check that you are logged in.");
    }
    const payload = await res.json();
    const files = Array.isArray(payload?.files) ? payload.files : [];
    setSessionApiFiles(files);
    return files;
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

    const apiFiles = await loadSessionApiFiles();
    const instruments: Record<string, Record<string, unknown>> = {};
    const files: { id: string | number; name: string }[] = [];
    const missing: string[] = [];

    unique.forEach((sym) => {
      const match = findApiFileForSymbol(sym, apiFiles);
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
        asset_class: assetKey,
        ticker: sym,
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

  const newSessPanelRef = React.useRef<HTMLDivElement>(null);
  const newSessBackdropDismissRef = React.useRef(false);
  const handleNewSessOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    newSessBackdropDismissRef.current = !newSessPanelRef.current?.contains(e.target as Node);
  };
  const handleNewSessOverlayPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!newSessBackdropDismissRef.current) return;
    if (newSessPanelRef.current?.contains(e.target as Node)) {
      newSessBackdropDismissRef.current = false;
      return;
    }
    newSessBackdropDismissRef.current = false;
    closeNewSess();
  };
  const handleNewSessPanelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    newSessBackdropDismissRef.current = false;
    e.stopPropagation();
  };

  const openNewStrategyLab = () => {
    closeNewSess();
    router.push("/dashboard/?view=stratbank&create=1");
  };

  const maxTickersCap = userLimits.isAdmin ? 100 : Math.max(1, userLimits.maxTickers || 5);
  const maxSupportingCap = userLimits.isAdmin ? 100 : Math.max(0, userLimits.maxSupporting ?? 5);
  const atSessionCap =
    !userLimits.isAdmin &&
    editSessId == null &&
    userLimits.maxTradingSessions > 0 &&
    userLimits.tradingSessionsCount >= userLimits.maxTradingSessions;

  const sessInfoDone = !!newSessName.trim();
  const sessSettingsDone = sessInfoDone && newSessTickers.length > 0 && !!newSessStart && !!newSessEnd;
  const lockedBox = { opacity: 0.35, pointerEvents: "none" as const, userSelect: "none" as const };
  const activeBox = {};
  const isValid2 = !!(newSessName && newSessTickers.length > 0 && newSessStart && newSessEnd && parseStartingBalanceInput(newSessCapital) && !atSessionCap);

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

    const supportResolved = newSessSupportTickers.length
      ? await resolveInstrumentsForTickers(newSessSupportTickers)
      : {
          instruments: {} as Record<string, Record<string, unknown>>,
          files: [] as { id: string | number; name: string }[],
          missing: [] as string[],
        };

    if (supportResolved.missing.length > 0) {
      throw new Error(
        `Missing chart data for supporting symbols: ${supportResolved.missing.join(", ")}. Upload datasets for every supporting symbol or remove them.`
      );
    }

    const tradableInstruments = Object.fromEntries(
      Object.entries(resolved.instruments).map(([k, row]) => {
        if (!newSessTradingCostsEnabled) {
          return [k, { ...row, spread: 0, commission: 0 }];
        }
        const sym = String(row.ticker || k);
        const asset = sessionAssetOf(sym);
        const spread = clampNonNegativeCostNumber(
          newSessSymbolSpreads[k] ??
          newSessSymbolSpreads[sym] ??
          DEFAULT_SYMBOL_SPREADS[k] ??
          DEFAULT_SYMBOL_SPREADS[sym] ??
          row.spread,
          0
        );
        let commission = clampNonNegativeCostNumber(
          newSessCosts[asset as keyof typeof newSessCosts]?.commission ?? row.commission,
          0
        );
        if (asset === "Futures") {
          const fd = newSessFuturesData[sym];
          if (fd?.commission != null && fd.commission !== "") {
            commission = clampNonNegativeCostNumber(fd.commission, 0);
          }
        }
        return [k, { ...row, spread, commission }];
      })
    );

    const supportInstruments = Object.fromEntries(
      Object.entries(supportResolved.instruments).map(([k, row]) => [
        k,
        { ...row, view_only: true, tradable: false, spread: 0, commission: 0 },
      ])
    );

    const instruments = { ...tradableInstruments, ...supportInstruments };

    const seenFileIds = new Set(resolved.files.map((f) => String(f.id)));
    const allFiles = [...resolved.files];
    supportResolved.files.forEach((f) => {
      const fid = String(f.id);
      if (!seenFileIds.has(fid)) {
        allFiles.push({ ...f, view_only: true });
        seenFileIds.add(fid);
      }
    });

    const sessionLeverage = resolveSessionLeverage(
      sessTradingMode,
      primary,
      tickers,
      newSessCosts,
      sessLeverage,
    );

    const resolvedStrategyId = (() => {
      const pb = newSessPlaybook || "";
      if (pb.startsWith("strategy:")) {
        const id = Number(pb.slice("strategy:".length));
        return Number.isFinite(id) && id > 0 ? id : null;
      }
      return null;
    })();
    const linkedStrategy =
      resolvedStrategyId != null
        ? stratRows.find((s) => Number(s.id) === resolvedStrategyId)
        : null;
    const strategyDisplayName =
      linkedStrategy?.name ||
      (newSessPlaybook && !newSessPlaybook.startsWith("strategy:") ? newSessPlaybook : "") ||
      playbookDisplay ||
      "";
    const strategyVariables = linkedStrategy
      ? extractStrategyVariablesFromDefinition(
          (linkedStrategy.strategy_definition as Record<string, unknown> | undefined) || undefined
        ).filter(
          (item: { type?: string; name?: string; label?: string }) =>
            item?.type === "variable" ||
            (item?.type !== "divider" && String(item?.name || item?.label || "").trim())
        )
      : [];

    return {
      type: modeType,
      sessionName,
      description: newSessDescription,
      playbook: newSessPlaybook || "",
      playbook_display: strategyDisplayName,
      strategy_name: strategyDisplayName,
      strategy_id: resolvedStrategyId,
      ...(strategyVariables.length ? { strategy_variables: strategyVariables } : {}),
      tickers: newSessTickers,
      supporting_tickers: newSessSupportTickers,
      asset_class: newSessAssetClass,
      trading_mode: sessTradingMode,
      symbol: newSessTickers.length === 1 ? newSessTickers[0] : newSessTickers.length > 1 ? `${newSessTickers.length} symbols` : primary,
      fileId: resolved.primaryFileId,
      fileName: resolved.fileName,
      files: allFiles,
      instruments,
      symbols: [
        ...tickers.map((sym) => ({
          symbolName: sym,
          fileId: instruments[normSessionSym(sym)]?.fileId,
          tradable: true,
        })),
        ...newSessSupportTickers.map((sym) => ({
          symbolName: sym,
          fileId: instruments[normSessionSym(sym)]?.fileId,
          view_only: true,
          tradable: false,
        })),
      ],
      startDate,
      endDate,
      startBalance: String(parseStartingBalanceInput(newSessCapital) || "10000"),
      account_currency: newSessCurrency,
      leverage: sessionLeverage,
      margin_call_level: parseFloat(newSessMarginCall || "100"),
      stop_out_level: parseFloat(newSessStopOut || "50"),
      max_risk_per_trade_pct: parseFloat(newSessMaxRisk || "0") || null,
      timeframe: newSessTf,
      defaultRiskType: sessRiskMode,
      defaultRisk: parseFloat(sessRiskVal || "1") || 1,
      allowBackNavigation: newSessRollback,
      protectionPreset: newSessProtect,
      commission: newSessTradingCostsEnabled ? "Per Lot" : "None",
      trading_costs_enabled: newSessTradingCostsEnabled,
      rollback_allowed: newSessRollback,
      replayMode: sessReplayMode,
      replaySpeed: sessReplaySpeed,
      timezone: newSessTimezone,
      dst: newSessDST,
      advanced_order: newSessAdvancedOrder,
      mfe_mae_enabled: newSessMfeMaeEnabled,
      mfe_mae_tracking_hours: parseFloat(newSessMfeMaeHours) || 4,
      post_exit_tracking_mode: newSessPostExitMode,
      post_exit_tracking_candles: parseInt(newSessPostExitCandles, 10) || 50,
      mfe_mae: {
        enabled: newSessMfeMaeEnabled,
        tracking_hours: parseFloat(newSessMfeMaeHours) || 4,
        post_exit_mode: newSessPostExitMode,
        post_exit_candles: parseInt(newSessPostExitCandles, 10) || 50,
      },
      trading_costs: newSessTradingCostsEnabled
        ? {
            costs: newSessCosts,
            spreads: (() => {
              const merged: Record<string, string> = {};
              newSessTickers.forEach((sym) => {
                const k = normSessionSym(sym);
                const v = newSessSymbolSpreads[k] ?? DEFAULT_SYMBOL_SPREADS[k];
                if (v != null && v !== "") merged[k] = finalizeNonNegativeNumericInput(String(v), "0");
              });
              return merged;
            })(),
            futuresMargins: newSessFuturesData,
            /** Session spread input = distance from mid to bid OR ask (not full bid↔ask width). */
            spread_semantics: "mid_to_side",
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

  async function persistSessionWithConfig(config: Record<string, unknown>): Promise<number | null> {
    const sessionName = newSessName.trim() || "Backtest Session";
    const session_type = sessTradingMode === "prop" ? "propfirm" : "personal";
    if (editSessId != null) {
      const res = await fetch(`/api/sessions/${encodeURIComponent(String(editSessId))}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: sessionName, config }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ? String(body.detail) : `HTTP ${res.status}`);
      }
      return Number(editSessId);
    }
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

  async function persistSession(): Promise<number | null> {
    const config = await buildChartConfig();
    return persistSessionWithConfig(config);
  }

  const saveNewSession = async () => {
    if (!isValid2 || savingSession) return;
    if (atSessionCap) {
      onSessionLimitReached?.({
        count: userLimits.tradingSessionsCount,
        cap: userLimits.maxTradingSessions,
        planName: userLimits.planName,
        planId: userLimits.planId,
        subscriptionStatus: userLimits.subscriptionStatus,
        isManualPlan: userLimits.isManualPlan,
        hasActiveSubscription: userLimits.hasActiveSubscription,
        hasStripeCustomer: userLimits.hasStripeCustomer,
      });
      return;
    }
    setSavingSession(true);
    try {
      await persistSession();
      await onSaved?.();
      closeNewSess();
    } catch (e: any) {
      const msg = String(e?.message || e || "");
      if (/session limit reached/i.test(msg) && onSessionLimitReached) {
        onSessionLimitReached({
          count: userLimits.tradingSessionsCount,
          cap: userLimits.maxTradingSessions,
          planName: userLimits.planName,
          planId: userLimits.planId,
          subscriptionStatus: userLimits.subscriptionStatus,
          isManualPlan: userLimits.isManualPlan,
          hasActiveSubscription: userLimits.hasActiveSubscription,
          hasStripeCustomer: userLimits.hasStripeCustomer,
        });
        return;
      }
      window.alert(`Failed to save session: ${msg}`);
    } finally {
      setSavingSession(false);
    }
  };

  const MON_D = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function datesFromSessionFile(f: Record<string, unknown> | null, sym: string) {
    const span = spanFromApiFile(f);
    if (span) return span;
    const name = f ? String(f.original_name || f.name || "") : "";
    if (name) {
      const m4 = name.match(/(\d{4})[-_](\d{4})/);
      if (m4) return { from: `${m4[1]}-01-01`, to: `${m4[2]}-12-31` };
    }
    const mock = availFiles.find(a => normSessionSym(a.ticker) === normSessionSym(sym));
    return mock ? { from: mock.from, to: mock.to } : null;
  }

  const sessDateOverlap = useMemo(() => {
    const tickers = newSessTickers.length ? newSessTickers : (newSessSymbol ? [newSessSymbol] : []);
    if (!tickers.length) return { start: "", end: "", hasOverlap: false };
    const files = tickers.map((t, i) => {
      const span = datesFromSessionFile(findApiFileForSymbol(t, sessionApiFiles), t);
      if (!span) return null;
      return { id: String(i), ticker: t, from: span.from, to: span.to };
    }).filter(Boolean);
    if (!files.length) return { start: "", end: "", hasOverlap: false };
    if (tickers.length > 1 && files.length !== tickers.length) {
      return { start: "", end: "", hasOverlap: false };
    }
    return computeOverlapRange(files);
  }, [newSessTickers, newSessSymbol, sessionApiFiles]);

  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const calMinIso = useMemo(() => {
    const base = sessDateOverlap.hasOverlap ? sessDateOverlap.start : "1990-01-01";
    if (newSessCalTarget === "end" && newSessStart && newSessStart > base) return newSessStart;
    return base;
  }, [sessDateOverlap, newSessCalTarget, newSessStart]);

  const calMaxIso = useMemo(() => (sessDateOverlap.hasOverlap ? sessDateOverlap.end : todayIso), [sessDateOverlap, todayIso]);

  useEffect(() => {
    if (!sessDateOverlap.hasOverlap) return;
    const { start, end } = sessDateOverlap;
    if (newSessStart && (newSessStart < start || newSessStart > end)) {
      setNewSessStart("");
      setNewSessStartInput("");
    }
    if (newSessEnd && (newSessEnd < start || newSessEnd > end || (newSessStart && newSessEnd < newSessStart))) {
      setNewSessEnd("");
      setNewSessEndInput("");
    }
  }, [sessDateOverlap.start, sessDateOverlap.end, sessDateOverlap.hasOverlap, newSessStart, newSessEnd]);

  const handleSessCalSelect = useCallback((iso: string) => {
    const label = isoToDisplay(iso, MON_D);
    if (newSessCalTarget === "start") {
      setNewSessStart(iso);
      setNewSessStartInput(label);
      if (newSessEnd && newSessEnd < iso) {
        setNewSessEnd("");
        setNewSessEndInput("");
      }
    } else if (!newSessStart || iso >= newSessStart) {
      setNewSessEnd(iso);
      setNewSessEndInput(label);
    }
    setNewSessActivePreset(null);
  }, [newSessCalTarget, newSessStart, newSessEnd]);

  const startNewSession = async () => {
    if (!isValid2 || savingSession) return;
    setSavingSession(true);
    try {
      const cfg = await buildChartConfig();
      const id = await persistSessionWithConfig(cfg);
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
    } finally {
      setSavingSession(false);
    }
  };

  return (
    <>
            {/* ── NEW SESSION MODAL overlay ── */}
            {open && (
              <div style={{position:"fixed",inset:0,zIndex:500000,display:"flex",alignItems:"center",justifyContent:"center",visibility:"visible"}} onPointerDown={handleNewSessOverlayPointerDown} onPointerUp={handleNewSessOverlayPointerUp}>
                {/* Backdrop */}
                <div style={{position:"absolute",inset:0,background:"rgba(4,5,10,0.72)",backdropFilter:"blur(3px)"}}/>
                {/* Panel */}
                <div ref={newSessPanelRef} onPointerDown={handleNewSessPanelPointerDown}
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
                  {atSessionCap && (
                    <div style={{flexShrink:0,padding:"8px 16px",background:"rgba(255,80,104,0.08)",borderBottom:`1px solid rgba(255,80,104,0.2)`,fontSize:11,color:c.rd,fontFamily:F,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                      <span>
                        Backtest session limit reached ({userLimits.tradingSessionsCount}/{userLimits.maxTradingSessions}).
                        {userLimits.planName ? ` Plan: ${userLimits.planName}.` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSessionLimitReached?.({
                          count: userLimits.tradingSessionsCount,
                          cap: userLimits.maxTradingSessions,
                          planName: userLimits.planName,
                          planId: userLimits.planId,
                          subscriptionStatus: userLimits.subscriptionStatus,
                          isManualPlan: userLimits.isManualPlan,
                          hasActiveSubscription: userLimits.hasActiveSubscription,
                          hasStripeCustomer: userLimits.hasStripeCustomer,
                        })}
                        style={{
                          flexShrink: 0,
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "1px solid rgba(255,80,104,0.35)",
                          background: "rgba(255,80,104,0.12)",
                          color: c.rd,
                          fontFamily: F,
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: "default",
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                        }}
                      >
                        Upgrade
                      </button>
                    </div>
                  )}

                  {/* Scrollable form body */}
                  <div style={{flex:1,overflowY:"auto",padding:"16px 20px 68px"}} className="tlr-scroll" onScroll={()=>{setNewSessCalOpen(false);setNewSessStratDropOpen(false);setNewSessSymPickerOpen(false);setNewSessSupPickerOpen(false);setDropdown(null);setDdAnchor(null);}} onClick={()=>{setNewSessStratDropOpen(false);setNewSessSymDropOpen(false);setNewSessAssetDropOpen(false);setNewSessCalOpen(false);setNewSessSymPickerOpen(false);setNewSessSupPickerOpen(false);setDropdown(null);setDdAnchor(null);}}>
                    <div style={{maxWidth:"100%",display:"flex",flexDirection:"column",gap:8}}>

                      {/* § Session Info */}
                      <div style={{border:`1px solid ${c.brH}`,padding:"12px 14px"}}>
                      {secH("Session Info")}
                      {(()=>{
                        const stratItems = stratRows.filter(s => s?.name);
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
                                  <span style={{flex:1,color:playbookDisplay?c.tx:c.tm,fontSize:11,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                    {playbookDisplay||"— None —"}
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
                                    {stratItems.length ? (
                                      <div>
                                        <div style={{padding:"5px 10px 3px",fontSize:9,fontWeight:800,color:c.tm,letterSpacing:"0.08em",textTransform:"uppercase",borderTop:"1px solid rgba(140,160,255,0.08)"}}>My Strategies</div>
                                        {stratItems.map(s=>{const pbVal=s.id!=null?`strategy:${s.id}`:String(s.name||"");const isAct=newSessPlaybook===pbVal;const isH=newSessStratHov===pbVal;return(
                                          <div key={String(s.id ?? s.name)} onClick={()=>{setNewSessPlaybook(pbVal);setNewSessStratDropOpen(false);}} onMouseEnter={()=>setNewSessStratHov(pbVal)} onMouseLeave={()=>setNewSessStratHov(null)}
                                            style={{display:"flex",alignItems:"center",padding:"5px 10px 5px 14px",cursor:"default",position:"relative",background:isAct?c.acD:isH?"rgba(255,255,255,0.03)":"transparent",transition:"background 0.1s"}}>
                                            {isAct&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
                                            <span style={{fontSize:11,fontWeight:isAct?700:500,color:isAct?c.acL:isH?c.tx:c.ts,fontFamily:F}}>{s.name}</span>
                                          </div>
                                        );})}
                                      </div>
                                    ) : (
                                      <div style={{padding:"8px 10px",fontSize:10,color:c.tm,fontFamily:F}}>No strategies yet — create one in Strategy Lab.</div>
                                    )}
                                  </div></>
                                )}
                              </div>
                            </div>
                            {/* New Strategy button – bottom-aligned beside the 50% block */}
                            <div role="button" tabIndex={0} aria-label="Create new strategy"
                              onClick={(e) => { e.stopPropagation(); openNewStrategyLab(); }}
                              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); openNewStrategyLab(); } }}
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
                        const allSymbols=sessionDatasetSymbols;
                        const catMap={"Forex":"Forex","Futures":"Futures","Crypto":"Crypto","Stocks":"Equities"};
                        const marketOptions=["Forex","Futures","Crypto","Stocks"].filter(a=>{const catKey=catMap[a]||a;return allSymbols.some(s=>s.cat===catKey);});
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
                          return(<div style={{borderRadius:1,overflow:"hidden",flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,0.6)"}}><FlagSvg code="US" w={fw} h={fh}/></div>);
                        };
                        const mkCell=(t,onDel)=>(<div key={t} style={{display:"flex",alignItems:"center",padding:"2px 4px 2px 3px",background:c.sf,border:`1px solid ${c.brH}`,gap:3,minWidth:0}}>{mkFlags(t,10)}<span style={{fontSize:10,fontWeight:700,color:c.tx,fontFamily:F,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t}</span><span onClick={onDel} style={{fontSize:13,lineHeight:1,color:c.tm,cursor:"default",flexShrink:0,marginLeft:5,transition:"color 0.1s"}} onMouseEnter={e=>e.currentTarget.style.color=c.rd} onMouseLeave={e=>e.currentTarget.style.color=c.tm}>×</span></div>);
                        /* ── date helpers (shared with grid below) ── */
                        const MON_D=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                        const MONS_D=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
                        const fmtD=iso=>{if(!iso)return "";const d=new Date(iso.split("T")[0]+"T00:00:00");return `${String(d.getDate()).padStart(2,"0")}-${MON_D[d.getMonth()]}-${d.getFullYear()}`;};
                        const applyD=(raw,setter)=>{
                          const s=raw.trim();
                          const minIso=sessDateOverlap.hasOverlap?sessDateOverlap.start:"1990-01-01";
                          const maxIso=sessDateOverlap.hasOverlap?sessDateOverlap.end:todayIso;
                          const clamp=(iso:string)=>clampIso(iso,minIso,maxIso);
                          // DD-Mon-YYYY
                          const m1=s.match(/^(\d{1,2})-([a-zA-Z]{3})-(\d{1,4})$/);
                          if(m1){const moIdx=MONS_D.indexOf(m1[2].toLowerCase());if(moIdx<0)return;const y=parseInt(m1[3]),dy=Math.min(parseInt(m1[1]),new Date(y,moIdx+1,0).getDate());if(y<1990||y>new Date().getFullYear()+1)return;setter(clamp(`${y}-${String(moIdx+1).padStart(2,"0")}-${String(dy).padStart(2,"0")}`));return;}
                          // YYYY-MM-DD
                          const m2=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
                          if(m2){const y=parseInt(m2[1]),mo=parseInt(m2[2])-1,dy=Math.min(parseInt(m2[3]),new Date(y,mo+1,0).getDate());if(mo<0||mo>11||y<1990||y>new Date().getFullYear()+1)return;setter(clamp(`${y}-${String(mo+1).padStart(2,"0")}-${String(dy).padStart(2,"0")}`));return;}
                          // MM/DD/YYYY
                          const m3=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                          if(m3){const y=parseInt(m3[3]),mo=parseInt(m3[1])-1,dy=Math.min(parseInt(m3[2]),new Date(y,mo+1,0).getDate());if(mo<0||mo>11||y<1990||y>new Date().getFullYear()+1)return;setter(clamp(`${y}-${String(mo+1).padStart(2,"0")}-${String(dy).padStart(2,"0")}`));return;}
                        };
                        const openCal=(e,target,currentIso)=>{e.stopPropagation();const r=e.currentTarget.parentElement.getBoundingClientRect();const w=r.width/Z,calH=260;const rawL=r.left/Z,rawB=r.bottom/Z,rawTop=r.top/Z;const spaceBelow=window.innerHeight/Z-rawB-calH-8;const top=spaceBelow>=0?rawB+4:Math.max(8,rawTop-calH-4);setNewSessCalPos({top,left:Math.max(8,Math.min(rawL,window.innerWidth/Z-w-8)),width:w});setNewSessCalTarget(target);const d=currentIso?new Date(currentIso.split("T")[0]+"T00:00:00"):(sessDateOverlap.hasOverlap?new Date(sessDateOverlap.start+"T00:00:00"):new Date(2020,0,1));setNewSessCalViewY(d.getFullYear());setNewSessCalViewM(d.getMonth());setNewSessCalMode("days");setNewSessCalOpen(true);};
                        const inpSx={flex:1,background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:12,fontWeight:600,padding:"5px 7px",fontFamily:F,fontVariantNumeric:"tabular-nums",cursor:"text",minWidth:0};
                        const chvSx={padding:"0 6px",cursor:"default",display:"flex",alignItems:"center",color:c.ts,borderLeft:`1px solid ${c.br}`,alignSelf:"stretch"};
                        const ChevD=({open})=>(<svg width={8} height={8} viewBox="0 0 8 8" fill="none"><path d={open?"M1,5 L4,2 L7,5":"M1,3 L4,6 L7,3"} stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"/></svg>);
                        const applyPreset=(months,years)=>{const fi=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;const fd=d=>`${String(d.getDate()).padStart(2,"0")}-${MON_D[d.getMonth()]}-${d.getFullYear()}`;let end,start;if(sessDateOverlap.hasOverlap){end=new Date(sessDateOverlap.end+"T00:00:00");start=new Date(end);if(months)start.setMonth(start.getMonth()-months);if(years)start.setFullYear(start.getFullYear()-years);const ovStart=new Date(sessDateOverlap.start+"T00:00:00");if(start<ovStart)start=ovStart;}else{end=new Date();start=new Date();if(months)start.setMonth(start.getMonth()-months);if(years)start.setFullYear(start.getFullYear()-years);}const sIso=clampIso(fi(start),sessDateOverlap.hasOverlap?sessDateOverlap.start:"1990-01-01",sessDateOverlap.hasOverlap?sessDateOverlap.end:todayIso);const eIso=clampIso(fi(end),sIso,sessDateOverlap.hasOverlap?sessDateOverlap.end:todayIso);setNewSessStart(sIso);setNewSessStartInput(fd(new Date(sIso+"T00:00:00")));setNewSessEnd(eIso);setNewSessEndInput(fd(new Date(eIso+"T00:00:00")));};
                        const presets=[{l:"1M",months:1},{l:"3M",months:3},{l:"6M",months:6},{l:"1Y",years:1},{l:"2Y",years:2},{l:"3Y",years:3},{l:"5Y",years:5},{l:"10Y",years:10}];
                        const unitMax={D:3650,M:120,Y:10};
                        const randomRange=()=>{const fi=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;const fd=d=>`${String(d.getDate()).padStart(2,"0")}-${MON_D[d.getMonth()]}-${d.getFullYear()}`;let lenDays=newSessRandRangeUnit==="D"?newSessRandRangeVal:newSessRandRangeUnit==="M"?Math.round(newSessRandRangeVal*30.4375):Math.round(newSessRandRangeVal*365.25);if(sessDateOverlap.hasOverlap){const earliest=new Date(sessDateOverlap.start+"T00:00:00");const latest=new Date(sessDateOverlap.end+"T00:00:00");const maxSpan=Math.max(1,Math.round((latest-earliest)/86400000));if(lenDays>maxSpan)lenDays=maxSpan;const rangeMs=Math.max(0,latest-earliest-lenDays*86400000);const s=rangeMs>0?new Date(earliest.getTime()+Math.random()*rangeMs):new Date(earliest);let e2=new Date(s.getTime()+lenDays*86400000);if(e2>latest)e2=new Date(latest);const sIso=clampIso(fi(s),sessDateOverlap.start,sessDateOverlap.end);const eIso=clampIso(fi(e2),sIso,sessDateOverlap.end);setNewSessStart(sIso);setNewSessStartInput(fd(new Date(sIso+"T00:00:00")));setNewSessEnd(eIso);setNewSessEndInput(fd(new Date(eIso+"T00:00:00")));setNewSessActivePreset(null);return;}const today=new Date();today.setHours(0,0,0,0);const earliest=new Date(today);earliest.setFullYear(earliest.getFullYear()-20);const latest=new Date(today.getTime()-lenDays*86400000);if(latest<=earliest)return;const s=new Date(earliest.getTime()+Math.random()*(latest.getTime()-earliest.getTime()));const e2=new Date(s.getTime()+lenDays*86400000);setNewSessStart(fi(s));setNewSessStartInput(fd(s));setNewSessEnd(fi(e2));setNewSessEndInput(fd(e2));setNewSessActivePreset(null);};
                        return(<>
                          {/* ─── Market + Random row ─── */}
                          <div style={{marginBottom:8,display:"flex",alignItems:"flex-end",gap:8}}>
                            {/* Market dropdown — width matches Strategy */}
                            <div style={{width:"50%",flexShrink:0}}>
                              {lbl("Markets & Instruments *")}
                              {sessionFilesLoading&&(
                                <div style={{fontSize:9,color:c.tm,fontFamily:F,marginBottom:6}}>Loading datasets…</div>
                              )}
                              {!sessionFilesLoading&&allSymbols.length===0&&(
                                <div style={{fontSize:9,color:c.rd,fontFamily:F,marginBottom:6,lineHeight:1.4}}>No session-ready datasets. Add healthy datasets in Admin first.</div>
                              )}
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
                                    {marketOptions.map(a=>{
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
                                  if(!marketOptions.length||!allSymbols.length)return;
                                  const randomCat=marketOptions[Math.floor(Math.random()*marketOptions.length)];
                                  const catKey=catMap[randomCat]||randomCat;
                                  const pool=allSymbols.filter(s=>s.cat===catKey);
                                  if(!pool.length)return;
                                  const picks=[...pool].sort(()=>Math.random()-0.5).slice(0,Math.min(newSessRandomCount,maxTickersCap)).map(s=>s.sym);
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
                                <input type="number" min={1} max={maxTickersCap} value={newSessRandomCount}
                                  onChange={e=>setNewSessRandomCount(Math.min(maxTickersCap,Math.max(1,parseInt(e.target.value)||1)))}
                                  onClick={e=>e.stopPropagation()}
                                  className="tlr-nospinner"
                                  style={{position:"absolute",left:0,right:18,top:0,bottom:0,width:"calc(100% - 18px)",height:"100%",background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:11,fontWeight:600,fontFamily:F,fontVariantNumeric:"tabular-nums",textAlign:"center",padding:0,boxSizing:"border-box"}}/>
                                <div style={{position:"absolute",right:0,top:0,bottom:0,width:18,display:"flex",flexDirection:"column",borderLeft:`1px solid ${c.br}`}}>
                                  {[[1,"▲"],[-1,"▼"]].map(([delta,chr],i)=>(
                                    <button key={i} onClick={e=>{e.stopPropagation();setNewSessRandomCount(v=>Math.min(maxTickersCap,Math.max(1,v+delta)));}}
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
                            <div style={{background:c.el,border:`1px solid ${(newSessSymPickerOpen||newSessSupPickerOpen)?c.acB:c.brH}`,display:"flex",flexDirection:"column",cursor:"default",transition:"border-color 0.12s",width:"100%",boxSizing:"border-box"}}>
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
                                    <span style={{fontSize:10,fontWeight:700,color:c.tm,fontFamily:F}}>{newSessTickers.length||"—"}/{maxTickersCap}</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{padding:"4px 8px 6px",display:"flex",gap:5,alignItems:"flex-start"}}>
                                {/* Plus button — tall (2 tag rows) */}
                                <div style={{position:"relative",flexShrink:0}}>
                                  <div onClick={e=>{e.stopPropagation();if(newSessSymPickerOpen){setNewSessSymPickerOpen(false);}else{const r=e.currentTarget.getBoundingClientRect();setNewSessSymPickerPos({top:r.bottom/Z+2,left:r.left/Z});setNewSessSymPickerSearch("");setNewSessSymPickerOpen(true);setNewSessSupPickerOpen(false);}}}
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
                                          const symQ=normalizeSearchQuery(newSessSymPickerSearch);
                                          const pool=allSymbols.filter(s=>s.cat===catKey&&(!symQ||s.sym.toLowerCase().includes(symQ)));
                                          if(pool.length===0)return <div style={{padding:"8px 10px",fontSize:10,color:c.tm,fontFamily:F}}>No results</div>;
                                          return pool.map(s=>{
                                            const isChk=newSessTickers.includes(s.sym);
                                            const hk="spick_"+s.sym;const isH=hov===hk;
                                            const bCol=isChk?c.acL:isH?c.tx:c.ts;
                                            return(
                                              <div key={s.sym} onClick={()=>{if(isChk){setNewSessTickers(p=>p.filter(x=>x!==s.sym));}else if(newSessTickers.length<maxTickersCap){setNewSessTickers(p=>[...p,s.sym]);}}}
                                                onMouseEnter={()=>setHov(hk)} onMouseLeave={()=>setHov(null)}
                                                style={{display:"flex",alignItems:"center",padding:"4px 8px",gap:6,cursor:"default",opacity:!isChk&&newSessTickers.length>=maxTickersCap?0.35:1,background:isH&&(isChk||newSessTickers.length<maxTickersCap)?"rgba(255,255,255,0.04)":"transparent",transition:"background 0.08s,opacity 0.1s"}}>
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
                                {/* Tags — up to admin/user cap */}
                                <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:3,alignContent:"flex-start"}}>
                                  {newSessTickers.length>0
                                    ?newSessTickers.slice(0,maxTickersCap).map(t=>mkCell(t,e=>{e.stopPropagation();setNewSessTickers(p=>p.filter(x=>x!==t));}))
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
                                    <span style={{fontSize:10,fontWeight:700,color:c.tm,fontFamily:F}}>{newSessSupportTickers.length||"—"}/{maxSupportingCap}</span>
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
                                          const supQ=normalizeSearchQuery(newSessSupPickerSearch);
                                          const pool=allSymbols.filter(s=>s.cat===catKey&&(!supQ||s.sym.toLowerCase().includes(supQ)));
                                          if(pool.length===0)return <div style={{padding:"8px 10px",fontSize:10,color:c.tm,fontFamily:F}}>No results</div>;
                                          return pool.map(s=>{
                                            const isChk=newSessSupportTickers.includes(s.sym);
                                            const hk="suppick_"+s.sym;const isH=hov===hk;
                                            const bCol=isChk?"rgba(232,194,82,0.9)":isH?c.tx:c.ts;
                                            return(
                                              <div key={s.sym} onClick={()=>{if(isChk){setNewSessSupportTickers(p=>p.filter(x=>x!==s.sym));}else if(newSessSupportTickers.length<maxSupportingCap){setNewSessSupportTickers(p=>[...p,s.sym]);}}}
                                                onMouseEnter={()=>setHov(hk)} onMouseLeave={()=>setHov(null)}
                                                style={{display:"flex",alignItems:"center",padding:"4px 8px",gap:6,cursor:"default",opacity:!isChk&&newSessSupportTickers.length>=maxSupportingCap?0.35:1,background:isH&&(isChk||newSessSupportTickers.length<maxSupportingCap)?"rgba(255,255,255,0.04)":"transparent",transition:"background 0.08s,opacity 0.1s"}}>
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
                                {/* Tags — up to admin/user cap */}
                                <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:3,alignContent:"flex-start"}}>
                                  {newSessSupportTickers.length>0
                                    ?newSessSupportTickers.slice(0,maxSupportingCap).map(t=>mkCell(t,e=>{e.stopPropagation();setNewSessSupportTickers(p=>p.filter(x=>x!==t));}))
                                    :<span style={{fontSize:9,color:c.tm,fontFamily:F,gridColumn:"1/-1",lineHeight:"40px"}}>—</span>
                                  }
                                </div>
                              </div>
                            </div>
                            {/* ── Date Range row ── */}
                            <div onClick={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}>
                              {lbl("Date Range *")}
                              {sessionFilesLoading&&newSessTickers.length>0&&(
                                <div style={{fontSize:9,color:c.tm,fontFamily:F,marginBottom:4}}>Loading ticker date ranges…</div>
                              )}
                              {!sessionFilesLoading&&sessDateOverlap.hasOverlap&&(
                                <div style={{fontSize:9,color:c.acL,fontFamily:F,marginBottom:4}}>Available data: {sessDateOverlap.start} → {sessDateOverlap.end}</div>
                              )}
                              {!sessionFilesLoading&&sessDateOverlap.conflict&&(
                                <div style={{fontSize:9,color:c.rd,fontFamily:F,marginBottom:4}}>Selected tickers have no overlapping date range.</div>
                              )}
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
                                        onChange={e=>{setNewSessEndInput(e.target.value);applyD(e.target.value,v=>{const minIso=newSessStart&&(sessDateOverlap.hasOverlap?newSessStart>sessDateOverlap.start:newSessStart>"1990-01-01")?newSessStart:(sessDateOverlap.hasOverlap?sessDateOverlap.start:"1990-01-01");const maxIso=sessDateOverlap.hasOverlap?sessDateOverlap.end:todayIso;const clamped=clampIso(v,minIso,maxIso);if(!newSessStart||clamped>=newSessStart)setNewSessEnd(clamped);});setNewSessActivePreset(null);}}
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
                          <div style={{height:27,display:"flex",alignItems:"center",gap:8,cursor:"default"}} onClick={()=>setNewSessMfeMaeEnabled(v=>!v)}>
                            {TlChk(newSessMfeMaeEnabled,"chk_mfeMae","",null)}
                            <span style={{fontSize:10,fontWeight:600,color:newSessMfeMaeEnabled?c.ts:c.tm,fontFamily:F,transition:"color 0.12s"}}>MFE/MAE tracking</span>
                            <span style={{fontSize:9,color:c.tm,fontFamily:F}}>— max favorable & adverse excursion</span>
                          </div>
                          {newSessMfeMaeEnabled&&(
                            <div style={{marginTop:8,marginLeft:22,padding:"8px 10px",border:`1px solid ${c.br}`,background:"rgba(255,255,255,0.02)",display:"flex",flexDirection:"column",gap:8}} onClick={e=>e.stopPropagation()}>
                              <div style={{display:"flex",alignItems:"center",gap:10}}>
                                <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap",width:130,flexShrink:0}}>Tracking window</span>
                                <div style={{position:"relative",width:72,flexShrink:0}}>
                                  <input type="number" min={0.5} max={168} step={0.5} value={newSessMfeMaeHours} onChange={e=>setNewSessMfeMaeHours(e.target.value)} className="tlr-nospinner"
                                    style={{...inp({width:"100%",height:24,fontSize:10,padding:"0 6px",textAlign:"center"})}}/>
                                </div>
                                <span style={{fontSize:9,color:c.tm,fontFamily:F}}>hours</span>
                              </div>
                              <div style={{display:"flex",alignItems:"center",gap:10}}>
                                <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap",width:130,flexShrink:0}}>Post-exit mode</span>
                                <div style={{position:"relative",width:170,flexShrink:0}}>
                                  {(()=>{
                                    const postExitDdKey="postExitMode";
                                    const postExitLabels={hours:"Hours window",candles:"Fixed candle count"};
                                    const postExitOpts=["hours","candles"] as const;
                                    return(<>
                                      <div onClick={e=>{e.stopPropagation();if(dropdown===postExitDdKey){setDropdown(null);setDdAnchor(null);}else{const r=e.currentTarget.getBoundingClientRect();setDdAnchor({top:r.bottom/Z+2,left:r.left/Z,minWidth:r.width/Z});setDropdown(postExitDdKey);setNewSessStratDropOpen(false);}}}
                                        style={{height:24,display:"flex",alignItems:"center",padding:"0 18px 0 8px",position:"relative",background:c.el,border:`1px solid ${dropdown===postExitDdKey?c.acB:c.brH}`,cursor:"default",userSelect:"none",boxSizing:"border-box",transition:"border-color 0.12s"}}>
                                        <span style={{fontSize:10,fontWeight:700,color:c.tx,fontFamily:F,whiteSpace:"nowrap"}}>{postExitLabels[newSessPostExitMode]}</span>
                                        <svg style={{position:"absolute",right:7,top:"50%",transform:`translateY(-50%) rotate(${dropdown===postExitDdKey?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                      </div>
                                      {dropdown===postExitDdKey&&ddAnchor&&(
                                        <><div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setDropdown(null);setDdAnchor(null);}}/>
                                        <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,minWidth:ddAnchor.minWidth,zIndex:9999,background:c.sf,border:"1px solid rgba(140,160,255,0.22)",boxShadow:"0 4px 16px rgba(0,0,0,0.5)"}}>
                                          <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                                          {postExitOpts.map(v=>{const isAct=v===newSessPostExitMode;const isHv=hov==="postExitOpt_"+v;return(<div key={v} onClick={e=>{e.stopPropagation();setNewSessPostExitMode(v);setDropdown(null);setDdAnchor(null);}} onMouseEnter={()=>setHov("postExitOpt_"+v)} onMouseLeave={()=>setHov(null)} style={{display:"flex",alignItems:"center",padding:"4px 10px",cursor:"default",position:"relative",background:isAct?c.acD:isHv?"rgba(255,255,255,0.03)":"transparent",transition:"background 0.1s"}}>{isAct&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}<span style={{fontSize:10,fontWeight:isAct?700:500,color:isAct?c.acL:isHv?c.tx:c.ts,fontFamily:F,whiteSpace:"nowrap"}}>{postExitLabels[v]}</span></div>);})}
                                        </div></>
                                      )}
                                    </>);
                                  })()}
                                </div>
                              </div>
                              {newSessPostExitMode==="candles"&&(
                                <div style={{display:"flex",alignItems:"center",gap:10}}>
                                  <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap",width:130,flexShrink:0}}>Post-exit candles</span>
                                  <div style={{position:"relative",width:72,flexShrink:0}}>
                                    <input type="number" min={1} max={5000} step={1} value={newSessPostExitCandles} onChange={e=>setNewSessPostExitCandles(e.target.value)} className="tlr-nospinner"
                                      style={{...inp({width:"100%",height:24,fontSize:10,padding:"0 6px",textAlign:"center"})}}/>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
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
                            const symCat={EURUSD:"Forex",GBPUSD:"Forex",USDJPY:"Forex",USDCHF:"Forex",AUDUSD:"Forex",NZDUSD:"Forex",USDCAD:"Forex",EURGBP:"Forex",EURJPY:"Forex",GBPJPY:"Forex",XAUUSD:"Forex",XAGUSD:"Forex",USDSEK:"Forex",USDNOK:"Forex",NQ:"Futures",ES:"Futures",YM:"Futures",RTY:"Futures",CL:"Futures",GC:"Futures",SI:"Futures",NG:"Futures",MNQ:"Futures",MES:"Futures",MYM:"Futures",M2K:"Futures",MGC:"Futures",MCL:"Futures",BTCUSD:"Crypto",ETHUSD:"Crypto",BNBUSD:"Crypto",SOLUSD:"Crypto",ADAUSD:"Crypto",AAPL:"Stocks",TSLA:"Stocks",NVDA:"Stocks",MSFT:"Stocks",AMZN:"Stocks",GOOG:"Stocks"};
                            const assetOf=cat=>({"Equities":"Stocks"}[cat]||cat);
                            const catOf2=sym=>assetOf(symCat[sym]||"");
                            const pairInfo2=sym=>{if(sym.length===6){const b=sym.slice(0,3),q=sym.slice(3,6);if(currencyCountry[b]&&currencyCountry[q])return{b,q};}return null;};
                            const mkFlags2=sym=>{
                              const sz=10,fw=Math.round(sz*15/11),fh=sz;
                              const pr=pairInfo2(sym);
                              if(pr)return(<div style={{position:"relative",width:Math.round(sz*22/11),height:fh,flexShrink:0}}><div style={{position:"absolute",left:0,top:0,borderRadius:1,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.7)",zIndex:2}}><FlagSvg code={pr.b} w={fw} h={fh}/></div><div style={{position:"absolute",left:Math.round(sz*7/11),top:0,borderRadius:1,overflow:"hidden",boxShadow:"0 1px 2px rgba(0,0,0,0.5)",zIndex:1}}><FlagSvg code={pr.q} w={fw} h={fh}/></div></div>);
                              const metalMap={XAUUSD:{bg:"#2B2200",fg:"#FFD700",label:"Au"},XAGUSD:{bg:"#1C2028",fg:"#C8D4E0",label:"Ag"},GC:{bg:"#2B2200",fg:"#FFD700",label:"GC"},SI:{bg:"#1C2028",fg:"#C8D4E0",label:"SI"},CL:{bg:"#0D1A12",fg:"#4CAF50",label:"CL"},NG:{bg:"#0A1020",fg:"#64B5F6",label:"NG"},MGC:{bg:"#1A1200",fg:"#FFBA00",label:"mGC"},MCL:{bg:"#071510",fg:"#33CC66",label:"mCL"}};
                              if(metalMap[sym]){const m=metalMap[sym];return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:1,boxShadow:"0 1px 3px rgba(0,0,0,0.6)"}}><rect width={fw} height={fh} fill={m.bg}/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill={m.fg} fontSize={fh*0.52} fontWeight="800" fontFamily={F}>{m.label}</text></svg>);}
                              const cryptoMap={BTCUSD:{bg:"#E8820C",fg:"#fff",label:"₿"},ETHUSD:{bg:"#3D4FC4",fg:"#fff",label:"Ξ"},BNBUSD:{bg:"#C99800",fg:"#000",label:"B"},SOLUSD:{bg:"#7B3FBE",fg:"#fff",label:"S"},ADAUSD:{bg:"#0033AD",fg:"#fff",label:"A"}};
                              if(cryptoMap[sym]){const cr=cryptoMap[sym];return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:Math.round(fh*0.35),boxShadow:"0 1px 3px rgba(0,0,0,0.6)"}}><rect width={fw} height={fh} rx={Math.round(fh*0.35)} fill={cr.bg}/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill={cr.fg} fontSize={fh*0.58} fontWeight="900" fontFamily={F}>{cr.label}</text></svg>);}
                              return(<div style={{borderRadius:1,overflow:"hidden",flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,0.6)"}}><FlagSvg code="US" w={fw} h={fh}/></div>);
                            };
                            const tcStepDecimals=(step)=>{const s=Number(step);if(!Number.isFinite(s)||s<=0)return 2;const p=String(s).split(".");return p[1]?p[1].length:0;};
                            const tcBumpNum=(val,step,dir)=>{const d=tcStepDecimals(step);const cur=parseFloat(val);const base=Number.isFinite(cur)?cur:0;return Math.max(0,base+dir*step).toFixed(d);};
                            const tcStepW=18;
                            const mkArrows=(onUp,onDown)=>(
                              <div style={{position:"absolute",right:0,top:0,bottom:0,width:tcStepW,display:"flex",flexDirection:"column",gap:2,padding:"1px 1px 1px 0",boxSizing:"border-box",borderLeft:`1px solid ${c.br}`}}>
                                {[[onUp,"▲","#22c55e","up"],[onDown,"▼","#ef4444","down"]].map(([fn,ch,accent,key])=>(
                                  <button key={key} type="button"
                                    onClick={e=>{e.stopPropagation();e.preventDefault();fn(e);}}
                                    onMouseDown={e=>{e.stopPropagation();e.currentTarget.style.background=accent;e.currentTarget.style.borderColor=accent;e.currentTarget.style.color="#fff";}}
                                    onMouseUp={e=>{e.currentTarget.style.background=c.el;e.currentTarget.style.borderColor=c.br;e.currentTarget.style.color=c.tm;}}
                                    onMouseLeave={e=>{e.currentTarget.style.background=c.el;e.currentTarget.style.borderColor=c.br;e.currentTarget.style.color=c.tm;}}
                                    style={{flex:1,width:"100%",minHeight:0,background:c.el,border:`1px solid ${c.br}`,borderRadius:2,color:c.tm,cursor:"default",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,lineHeight:1,fontFamily:F,padding:0,transition:"background 0.1s,color 0.1s,border-color 0.1s"}}>
                                    {ch}
                                  </button>
                                ))}
                              </div>
                            );
                            const numCell=(val,onChange,step,w=52)=>{
                              const displayVal=(()=>{const n=Number.parseFloat(String(val??""));return Number.isFinite(n)&&n<0?"0":val;})();
                              const handleChange=(nextRaw)=>{
                                onChange({target:{value:sanitizeNonNegativeNumericInput(nextRaw)}});
                              };
                              return (
                              <div style={{position:"relative",width:w,height:22,flexShrink:0,background:c.bg,border:`1px solid ${c.brH}`,boxSizing:"border-box"}}>
                                <input type="number" min={0} step={step} value={displayVal}
                                  onChange={e=>handleChange(e.target.value)}
                                  onBlur={e=>handleChange(finalizeNonNegativeNumericInput(e.target.value, displayVal || "0"))}
                                  onKeyDown={e=>{if(e.key==="-")e.preventDefault();}}
                                  onClick={e=>e.stopPropagation()} className="tlr-nospinner"
                                  style={{position:"absolute",left:0,right:tcStepW,top:0,bottom:0,width:`calc(100% - ${tcStepW}px)`,height:"100%",background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:10,fontWeight:700,fontFamily:F,fontVariantNumeric:"tabular-nums",textAlign:"center",padding:0,boxSizing:"border-box"}}/>
                                {mkArrows(
                                  ()=>handleChange(tcBumpNum(displayVal,step,1)),
                                  ()=>handleChange(tcBumpNum(displayVal,step,-1))
                                )}
                              </div>
                            );};
                            const costMeta={
                              Forex:   {color:c.ts,label:"FOREX",   spreadUnit:"pips (mid→side)",   commUnit:"$/lot RT",commLabel:"Commission",spreadStep:0.1, commStep:0.01, levOpts:["1:1","1:10","1:30","1:50","1:100","1:200","1:500"],defLev:"1:500",perSymComm:false},
                              Futures: {color:c.ts,label:"FUTURES",spreadUnit:"ticks (mid→side)",  commUnit:"$/RT",   commLabel:"Commission",spreadStep:1,   commStep:0.01, levOpts:[],                                                 defLev:"1:20", perSymComm:true, hideLev:true},
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
                            const activeCostCats=[...new Set(newSessTickers.map(catOf2))].filter(a=>costMeta[a]).sort((a,b)=>catOrder.indexOf(a)-catOrder.indexOf(b));
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
                                  const assetSyms=[...new Set(newSessTickers.filter(t=>catOf2(t)===asset))];
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
                                          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(132px, 1fr))",gap:6}}>
                                            {assetSyms.map(sym=>(<div key={sym} style={{display:"flex",alignItems:"center",gap:4,background:c.bg,padding:"2px 6px",border:`1px solid ${c.br}`,height:24,boxSizing:"border-box"}}>{(()=>{const sz=8,fw=Math.round(sz*15/11),fh=sz;const pr=pairInfo2(sym);if(pr)return(<div style={{position:"relative",width:Math.round(sz*22/11),height:fh,flexShrink:0}}><div style={{position:"absolute",left:0,top:0,borderRadius:1,overflow:"hidden",zIndex:2}}><FlagSvg code={pr.b} w={fw} h={fh}/></div><div style={{position:"absolute",left:Math.round(sz*7/11),top:0,borderRadius:1,overflow:"hidden",zIndex:1}}><FlagSvg code={pr.q} w={fw} h={fh}/></div></div>);const metalMap={XAUUSD:{bg:"#2B2200",fg:"#FFD700",label:"Au"},XAGUSD:{bg:"#1C2028",fg:"#C8D4E0",label:"Ag"},GC:{bg:"#2B2200",fg:"#FFD700",label:"GC"},SI:{bg:"#1C2028",fg:"#C8D4E0",label:"SI"},CL:{bg:"#0D1A12",fg:"#4CAF50",label:"CL"},NG:{bg:"#0A1020",fg:"#64B5F6",label:"NG"},MGC:{bg:"#1A1200",fg:"#FFBA00",label:"mGC"},MCL:{bg:"#071510",fg:"#33CC66",label:"mCL"}};if(metalMap[sym]){const m=metalMap[sym];return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:1}}><rect width={fw} height={fh} fill={m.bg}/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill={m.fg} fontSize={fh*0.52} fontWeight="800" fontFamily={F}>{m.label}</text></svg>);}const cryptoMap={BTCUSD:{bg:"#E8820C",fg:"#fff",label:"₿"},ETHUSD:{bg:"#3D4FC4",fg:"#fff",label:"Ξ"},BNBUSD:{bg:"#C99800",fg:"#000",label:"B"},SOLUSD:{bg:"#7B3FBE",fg:"#fff",label:"S"},ADAUSD:{bg:"#0033AD",fg:"#fff",label:"A"}};if(cryptoMap[sym]){const cr=cryptoMap[sym];return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:Math.round(fh*0.35)}}><rect width={fw} height={fh} rx={Math.round(fh*0.35)} fill={cr.bg}/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill={cr.fg} fontSize={fh*0.58} fontWeight="900" fontFamily={F}>{cr.label}</text></svg>);}return(<div style={{borderRadius:1,overflow:"hidden",flexShrink:0}}><FlagSvg code="US" w={fw} h={fh}/></div>);})()}<span style={{fontSize:9,fontWeight:700,color:c.ts,fontFamily:F,letterSpacing:"0.02em",whiteSpace:"nowrap",flexShrink:0}}>{sym}</span><div style={{marginLeft:"auto",flexShrink:0}}>{numCell(getSpread(sym),e=>setSpread(sym,e.target.value),meta.spreadStep,48)}</div></div>))}
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
                            <input type="text" inputMode="numeric" pattern="[0-9]*" value={newSessCapital} onChange={e=>setNewSessCapital(sanitizeStartingBalanceInput(e.target.value))} className="tlr-nospinner" style={{...inp({fontSize:11,fontWeight:800,paddingLeft:26,fontVariantNumeric:"tabular-nums"})}}/>
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
                        const cap=parseStartingBalanceInput(newSessCapital)||10000;
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
                                    style={{flex:1,background:"transparent",border:"none",color:c.ts,cursor:enabled?"default":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",fontSize:6,lineHeight:1,fontFamily:F,padding:0,borderBottom:ii===0?`1px solid ${c.br}`:"none",transition:"color 0.1s"}}>
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
                        [(()=>{const sym={"USD":"$","EUR":"€","GBP":"£","JPY":"¥"};return`${sym[newSessCurrency]||"$"}${(parseStartingBalanceInput(newSessCapital)||0).toLocaleString()}`;})(),c.ts],
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
                      <div onClick={isValid2 && !savingSession ? saveNewSession : undefined}
                        onMouseEnter={()=>setHov("sessSave")} onMouseLeave={()=>setHov(null)}
                        style={{height:27,padding:"0 14px",display:"flex",alignItems:"center",gap:5,border:`1px solid ${isValid2?(hov==="sessSave"?c.brH:c.br):"rgba(255,255,255,0.06)"}`,background:"transparent",cursor:isValid2 && !savingSession?"default":"not-allowed",fontSize:10,fontWeight:600,color:isValid2?(hov==="sessSave"?c.tx:c.ts):"rgba(255,255,255,0.2)",letterSpacing:"0.04em",fontFamily:F,transition:"all 0.12s",opacity:savingSession?0.6:1}}>
                        <svg width={10} height={10} viewBox="0 0 20 20" fill="none"><path d="M4 2h9l3 3v13H4V2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><rect x="7" y="2" width="6" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.3"/><rect x="6" y="12" width="8" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.3"/></svg>
                        {savingSession ? "Saving…" : "Save"}
                      </div>
                      <div onClick={isValid2 && !savingSession ? ()=>{void startNewSession();}:undefined}
                        onMouseEnter={()=>setHov("sessStart")} onMouseLeave={()=>setHov(null)}
                        style={{height:27,padding:"0 16px",display:"flex",alignItems:"center",gap:6,background:isValid2?`linear-gradient(135deg,${c.ac},${c.acL})`:"rgba(38,67,247,0.15)",cursor:isValid2 && !savingSession?"default":"not-allowed",fontSize:10,fontWeight:700,color:isValid2?"#fff":"rgba(255,255,255,0.25)",letterSpacing:"0.05em",boxShadow:isValid2?"0 2px 10px rgba(38,67,247,0.35)":"none",filter:hov==="sessStart"&&isValid2?"brightness(1.12)":"brightness(1)",transition:"all 0.12s",flexShrink:0,fontFamily:F,opacity:savingSession?0.6:1}}>
                        <svg width={8} height={8} viewBox="0 0 12 12" fill="none"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>
                        {savingSession ? "Starting…" : editSessId ? "Save & Start" : "Start Session"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
      <SessionDateCalendar
        open={newSessCalOpen}
        pos={newSessCalPos}
        label={newSessCalTarget === "start" ? "Start date" : "End date"}
        minIso={calMinIso}
        maxIso={calMaxIso}
        valueIso={newSessCalTarget === "start" ? newSessStart : newSessEnd}
        viewY={newSessCalViewY}
        viewM={newSessCalViewM}
        mode={newSessCalMode}
        yearBase={newSessCalYearBase}
        onViewY={setNewSessCalViewY}
        onViewM={setNewSessCalViewM}
        onMode={setNewSessCalMode}
        onYearBase={setNewSessCalYearBase}
        onSelect={handleSessCalSelect}
        onClose={() => { setNewSessCalOpen(false); setNewSessCalMode("days"); }}
        colors={c}
        fontFamily={F}
        IconClose={({ s, cl }) => <I n="x" s={s} cl={cl} />}
      />
      <style>{`
        @keyframes tlrPopIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
