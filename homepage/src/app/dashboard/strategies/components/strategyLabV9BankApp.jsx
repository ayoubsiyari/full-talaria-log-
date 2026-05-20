"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  buildNodesFromTemplate,
  buildInitialSections,
  TemplatePickerModal,
  StrategyBuilderModal,
  MKT_CAT_OPTS,
} from "./strategyBuilderModule.jsx";
import { useStrategyLabV9Data } from "@/app/dashboard/strategies/useStrategyLabV9Data";
import { getToken, loginUrlWithNext } from "@/app/dashboard/strategies/strategyLabV9Auth";
import { syncJournalTokenFromSession } from "@/lib/journalApi";
import {
  bankStrategyToApiBody,
  DEFAULT_COMMUNITY_PUBLISH_OPTIONS,
  buildBacktestSnapshotFromSession,
  pickBestBacktestSession,
} from "@/app/dashboard/strategies/strategyLabV9Mappers";
import { collectStrategyImageStats } from "@/app/dashboard/strategies/strategyLabV9Images";
import { useOptionalBacktestNewSession } from "@/app/dashboard/BacktestNewSessionContext";

const Z = 1.05;
const F = "'Exo 2',sans-serif";
const c = {
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
};

const NAV = [
  { id: "dashboard", href: "/dashboard/", label: "Dashboard", icon: "dash" },
  { id: "journal", href: "/dashboard/journal/", label: "Journal", icon: "journal" },
  { id: "backtest", href: "/dashboard/backtest/", label: "Backtest", icon: "backtest" },
  { id: "cot", href: "/dashboard/cot/", label: "COT", icon: "cot" },
  { id: "strategies", href: "/dashboard/strategies/", label: "Strategies", icon: "stratlab" },
  { id: "resources", href: "/bootcamp/", label: "Resources", icon: "resources" },
  { id: "support", href: "/dashboard/profile/?tab=support", label: "Support", icon: "support" },
];

function LabNavPanel({ pathname, hov, setHov }) {
  const icon = (kind) => {
    if (kind === "dash") return (
      <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="13" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="3" y="13" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="13" y="13" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg>
    );
    if (kind === "journal") return (
      <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="15" height="18" rx="1" stroke="currentColor" strokeWidth="1.5"/><line x1="7" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="7" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="7" y1="16" x2="11" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
    );
    if (kind === "backtest") return (
      <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><polyline points="3,20 3,4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><polyline points="3,15 8,11 12,14 18,7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><polygon points="20,10 23,13 20,16" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
    );
    if (kind === "cot") return (
      <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="3" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><rect x="8" y="8" width="3" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><rect x="13" y="5" width="3" height="15" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><rect x="18" y="9" width="3" height="11" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><line x1="3" y1="3" x2="21" y2="3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="2 2"/></svg>
    );
    if (kind === "stratlab") return (
      <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="3" y="2" width="14" height="20" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="8" y="1" width="4" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="7" cy="9" r="1.2" fill="currentColor" opacity="0.8"/><circle cx="13" cy="9" r="1.2" fill="currentColor" opacity="0.8"/><circle cx="10" cy="14" r="1.2" fill="currentColor" opacity="0.8"/><path d="M7 9c0 3 3 3 3 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M13 9c-1 2-1 3-3 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="8.5" y1="19" x2="11.5" y2="19" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
    );
    if (kind === "strat") return (
      <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><path d="M7 3.5h11.5c.8 0 1.5.7 1.5 1.5v11.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" opacity="0.45"/><path d="M5 5.5h11.5c.8 0 1.5.7 1.5 1.5v11.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" opacity="0.7"/><rect x="3" y="7.5" width="13.5" height="13" rx="1.2" stroke="currentColor" strokeWidth="1.45"/><circle cx="7" cy="11.2" r="1.25" fill="currentColor"/><circle cx="12.5" cy="11.2" r="1.25" fill="currentColor"/><circle cx="9.8" cy="16.6" r="1.25" fill="currentColor"/><path d="M7 11.2c0 2.8 2.8 2.7 2.8 5.4M12.5 11.2c-.7 2.2-.8 3.2-2.7 5.4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/></svg>
    );
    if (kind === "support") return (
      <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="currentColor" strokeWidth="1"/></svg>
    );
    return (
      <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="2" y="16.5" width="20" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><line x1="5.5" y1="16.5" x2="5.5" y2="20" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><rect x="3.5" y="12" width="17" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><line x1="7" y1="12" x2="7" y2="15.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><rect x="5" y="7.5" width="14" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><line x1="8.5" y1="7.5" x2="8.5" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
    );
  };
  return (
    <div style={{ width: 64, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0 6px", background: c.el, gap: 1, boxShadow: "4px 0 20px rgba(0,0,0,0.45)", zIndex: 1 }}>
      {NAV.map(({ id, href, label, icon: ic }) => {
        const active =
          pathname === href ||
          (id === "strategies" && pathname.startsWith("/dashboard/strategies"));
        const isHn = hov === "snav_" + id;
        const rail = active ? { position: "absolute", left: 0, top: "20%", bottom: "20%", width: 2, background: "linear-gradient(180deg,transparent," + c.acL + ",transparent)", boxShadow: "0 0 6px " + c.acG } : null;
        return (
          <Link key={id} href={href}
            onMouseEnter={() => setHov("snav_" + id)} onMouseLeave={() => setHov(null)}
            style={{ width: "100%", height: 56, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "default", position: "relative", textDecoration: "none", background: active ? c.acD : isHn ? "rgba(255,255,255,0.07)" : "transparent", transition: "background 0.12s", color: active ? c.acL : isHn ? c.tx : c.ts }}>
            {active && <div style={rail} />}
            {icon(ic)}
            <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: F }}>{label}</span>
          </Link>
        );
      })}
      <div style={{ flex: 1 }} />
      <Link href="/dashboard/profile/" onMouseEnter={() => setHov("snav_profile")} onMouseLeave={() => setHov(null)}
        style={{ width: "100%", height: 56, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "default", textDecoration: "none", background: hov === "snav_profile" ? "rgba(255,255,255,0.07)" : "transparent", transition: "background 0.12s", color: hov === "snav_profile" ? c.tx : c.ts }}>
        <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: F }}>Profile</span>
      </Link>
    </div>
  );
}

export default function StrategyLabV9BankApp({ registerDashboardOpenBuilder }) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const backtestNewSession = useOptionalBacktestNewSession();
  const [hov, setHov] = useState(null);

  const {
    myStrategies,
    setMyStrategies,
    strategiesLoading,
    strategiesError,
    reviewSessions,
    sessionsLoading,
    reloadSessions,
    persistStrategy,
    deleteStrategyRemote,
    duplicateStrategyRemote,
    communityStrategies,
    communityLoading,
    communityError,
    myPublicId,
    submitStrategyToCommunity,
    cloneCommunityTemplate,
  } = useStrategyLabV9Data();

  const strategyReviewSessions = useMemo(() => reviewSessions || [], [reviewSessions]);

  /* ── Strategies page state ── */
  const [stratTab, setStratTab] = useState("mine");
  const [stratSearch, setStratSearch] = useState("");
  const [stratSearchFocus, setStratSearchFocus] = useState(false);
  const [stratSort, setStratSort] = useState("name");
  const [stratSortDir, setStratSortDir] = useState("asc");
  const [stratSortOpen, setStratSortOpen] = useState(false);
  const [stratStyleFilter, setStratStyleFilter] = useState("All");
  const [stratLayoutMode, setStratLayoutMode] = useState("cards");
  const [stratBuilderOpen, setStratBuilderOpen] = useState(false);
  /** null | 'saving' | 'success' — drives builder overlay + footer button while POST runs */
  const [stratBuilderSavePhase, setStratBuilderSavePhase] = useState(null);
  const [stratBuilderSaveProgress, setStratBuilderSaveProgress] = useState(null);
  /** Sync guard — blocks double-clicks before React re-renders disabled state */
  const stratBuilderSaveInFlightRef = useRef(false);
  const [stratTemplatePickerOpen, setStratTemplatePickerOpen] = useState(false);
  const [stratEditId, setStratEditId] = useState(null);
  const [savedCommunityIds, setSavedCommunityIds] = useState(new Set());
  const [savedCommunityStrats, setSavedCommunityStrats] = useState([]);
  const [stratBName, setStratBName] = useState("");
  const [stratBStyle, setStratBStyle] = useState("Trend Following");
  const [stratBDesc, setStratBDesc] = useState("");
  const [stratBInstruments, setStratBInstruments] = useState([]);
  const [stratBInstInput, setStratBInstInput] = useState("");
  const [stratBTimeframes, setStratBTimeframes] = useState(["1m","5m","15m","30m","1H","4H","1D","1W","1M"]);
  const [stratBTagInput, setStratBTagInput] = useState("");
  const [stratBTags, setStratBTags] = useState([]);
  const [stratBComplexity, setStratBComplexity] = useState("Medium");
  const [stratWizardStep, setStratWizardStep] = useState(1);
  const [stratBDirection, setStratBDirection] = useState("both");
  const [stratBMarkets, setStratBMarkets] = useState([]);
  const [stratBConditions, setStratBConditions] = useState([]);
  const [stratBVariables, setStratBVariables] = useState([]);
  const [stratBImages, setStratBImages] = useState([]);
  const [stratBSupportInst, setStratBSupportInst] = useState([]);
  const [stratBLogoEmoji, setStratBLogoEmoji] = useState("");
  const [stratBLogoMenuOpen, setStratBLogoMenuOpen] = useState(false);
  const [stratBLogoMenuMode, setStratBLogoMenuMode] = useState(null);
  const [stratBLogoMenuPos, setStratBLogoMenuPos] = useState({top:0,left:0});
  const [stratBInstDropOpen, setStratBInstDropOpen] = useState(false);
  const [stratBInstSearch, setStratBInstSearch] = useState("");
  const [stratBInstDropPos, setStratBInstDropPos] = useState({top:0,left:0,width:0});
  const [stratBMktDropOpen, setStratBMktDropOpen] = useState(false);
  const [stratBMktDropPos, setStratBMktDropPos] = useState({top:0,left:0,width:0});
  const [stratBTfDropOpen, setStratBTfDropOpen] = useState(false);
  const [stratBTfDropPos, setStratBTfDropPos] = useState({top:0,left:0,width:0});
  const [stratBCustomTfs, setStratBCustomTfs] = useState([]);
  const [stratBCustomTfVal, setStratBCustomTfVal] = useState("");
  const [stratBCustomTfUnit, setStratBCustomTfUnit] = useState("m");
  const [stratBTfUnitOpen, setStratBTfUnitOpen] = useState(false);
  const [stratBTree, setStratBTree] = useState([]);
  const [stratBTreeViewMode, setStratBTreeViewMode] = useState("tree");
  const [stratBTreeSearch, setStratBTreeSearch] = useState("");
  const [stratBTreeEditing, setStratBTreeEditing] = useState(null);
  const [stratBTreeCollapsed, setStratBTreeCollapsed] = useState({});
  const [stratBTreeValidation, setStratBTreeValidation] = useState([]);
  const [canvasNodes, setCanvasNodes] = useState([]);
  const [canvasEdges, setCanvasEdges] = useState([]);
  const [canvasMiniMap, setCanvasMiniMap] = useState(true);
  const [canvasPaletteCollapsed, setCanvasPaletteCollapsed] = useState(false);
  const [canvasInspectorCollapsed, setCanvasInspectorCollapsed] = useState(false);
  const [stratPerfStrat, setStratPerfStrat] = useState(null);
  const [stratShareStrat, setStratShareStrat] = useState(null);
  const [stratShareBusy, setStratShareBusy] = useState(false);
  const [stratShareErr, setStratShareErr] = useState(null);
  const [stratShareOpts, setStratShareOpts] = useState(() => ({ ...DEFAULT_COMMUNITY_PUBLISH_OPTIONS }));
  const [stratCardHov, setStratCardHov] = useState(null);
  const [stratActMenu, setStratActMenu] = useState(null);

  const stratOpenBuilderLatestRef = useRef(() => {});
  useEffect(() => {
    if (!registerDashboardOpenBuilder) return;
    const run = () => stratOpenBuilderLatestRef.current();
    registerDashboardOpenBuilder(run);
    return () => registerDashboardOpenBuilder(null);
  }, [registerDashboardOpenBuilder]);

  const navPanel = <LabNavPanel pathname={pathname} hov={hov} setHov={setHov} />;

  const STYLES = ["All","Trend Following","Mean Reversion","Scalping","Breakout","Price Action","Swing","Algorithmic","News Trading","Other"];
  const TFS = ["1m","2m","3m","5m","10m","15m","30m","1H","2H","4H","1D","1W"];
  const complexityColor={Easy:c.gn,Medium:c.gold,Hard:c.rd};

  const RollbackBadge = ({ allowed, compact }) => (
    <span
      title={allowed ? "Backtest run with rollback enabled" : "Backtest run without rollback"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: compact ? 16 : 18,
        padding: compact ? "0 6px" : "0 7px",
        fontSize: compact ? 7 : 8,
        fontWeight: 800,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        fontFamily: F,
        color: allowed ? c.gn : c.tm,
        background: allowed ? c.gnD : "rgba(255,255,255,0.04)",
        border: `1px solid ${allowed ? c.gnB : c.brH}`,
        flexShrink: 0,
      }}
    >
      {allowed ? "Rollback" : "No rollback"}
    </span>
  );

  const openShareToCommunity = (strat) => {
    if (!strat) return;
    setStratShareOpts({ ...DEFAULT_COMMUNITY_PUBLISH_OPTIONS });
    setStratShareErr(null);
    setStratShareStrat(strat);
  };

  const toggleShareOpt = (key) => {
    setStratShareOpts((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const communityPool = communityStrategies;

  const normalizeStrategyBankName = value => String(value||'')
    .replace(/\s*\((my version|copy)\)\s*/ig,' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,' ')
    .trim();
  const sessionsForStrategyName = name => {
    const key = normalizeStrategyBankName(name);
    if (!key) return [];
    return (strategyReviewSessions||[])
      .filter(sess=>{
        const sessKey = normalizeStrategyBankName(sess.strategyName);
        const hasBeenUsed = (sess.progress||0)>0 || (sess.trades||0)>0 || sess.pnl!=null || sess.winRate!=null;
        return sessKey && hasBeenUsed && (sessKey===key || sessKey.includes(key) || key.includes(sessKey));
      })
      .sort((a,b)=>new Date(b.createdAt||b.endDate||0)-new Date(a.createdAt||a.endDate||0));
  };

  /* ─── Filter + sort community ─── */
  const filteredCommunity = communityPool
    .filter(s => {
      const q = stratSearch.toLowerCase();
      return !q || s.name.toLowerCase().includes(q) || (s.author||"").toLowerCase().includes(q) || (s.authorPublicId||"").toLowerCase().includes(q) || (s.tags||[]).some(t=>t.toLowerCase().includes(q));
    })
    .sort((a,b)=>{
      let av=a[stratSort]??0, bv=b[stratSort]??0;
      if(stratSort==="name"||stratSort==="author"){av=av.toLowerCase();bv=bv.toLowerCase();}
      if(av<bv) return stratSortDir==="asc"?-1:1;
      if(av>bv) return stratSortDir==="asc"?1:-1;
      return 0;
    });

  /* ─── Filter + sort my strategies (journal API only — no built-in template rows) ─── */
  const userStrategySource = myStrategies
    .filter(s => typeof s.id === "number" && Number.isFinite(s.id) && s.id > 0)
    .map(s => ({ ...s, backtestSessions: s.backtestSessions || sessionsForStrategyName(s.name) }));
  const mineSource = userStrategySource;
  const filteredMine = mineSource
    .filter(s=>{
      const q=stratSearch.toLowerCase();
      return !q||s.name.toLowerCase().includes(q)||(s.tags||[]).some(t=>t.toLowerCase().includes(q));
    });
  const isLoadingMyStrategies = Boolean(getToken()) && strategiesLoading;
  const filteredSavedCommunity = savedCommunityStrats.filter(s=>{
    const q=stratSearch.toLowerCase();
    return !q||s.name.toLowerCase().includes(q)||(s.author||"").toLowerCase().includes(q)||(s.authorPublicId||"").toLowerCase().includes(q)||(s.tags||[]).some(t=>t.toLowerCase().includes(q));
  });

  /* ─── Strategy card (shared) ─── */
  const StratCard = ({strat,isMine,inSavedTab,onEdit,onDelete,onSave,onRemove,isSaved,onDuplicate,onPerf,onUseTemplate}) => {
    const isH=stratCardHov===strat.id;
    const cardIcon = strat.icon || strat.template?.icon || "◎";
    const marketItems = (strat.markets||[]).length
      ? (strat.markets||[]).map(m=>(MKT_CAT_OPTS.find(x=>x.id===m)?.label||m))
      : (strat.instruments||[]);
    const cardIsSaved = typeof isSaved === "function" ? isSaved(strat.id) : !!isSaved;
    const backtestSessions = strat.backtestSessions || [];
    const backtestCompleted = backtestSessions.filter(s=>(s.progress||0)===100).length;
    const backtestTrades = backtestSessions.reduce((sum,s)=>sum+(s.trades||0),0);
    const backtestPnlKnown = backtestSessions.filter(s=>s.pnl!=null);
    const backtestPnl = backtestPnlKnown.length ? backtestPnlKnown.reduce((sum,s)=>sum+(s.pnl||0),0) : null;
    const backtestWinKnown = backtestSessions.filter(s=>s.winRate!=null);
    const backtestWin = backtestWinKnown.length ? Math.round(backtestWinKnown.reduce((sum,s)=>sum+s.winRate,0)/backtestWinKnown.length) : null;
    const backtestMoney = value => value==null ? "—" : `${value>=0?"+":"-"}$${Math.abs(value).toLocaleString()}`;
    const openEditableStrategy = e => {
      e.stopPropagation();
      if (strat.templatePreview && !isMine) return;
      if (strat.templatePreview && onUseTemplate) onUseTemplate(strat.template);
      else if (isMine && onEdit) onEdit(strat);
    };
    const FieldLabel = ({children}) => (
      <div style={{fontSize:8,fontWeight:900,color:c.tm,letterSpacing:"0.08em",textTransform:"uppercase",lineHeight:1,fontFamily:F}}>
        {children}
      </div>
    );
    const Pill = ({children,accent=false,keyName}) => (
      <span key={keyName||children} style={{position:"relative",display:"inline-flex",alignItems:"center",height:18,padding:"0 3px 4px",fontSize:9.5,fontWeight:790,color:accent?c.acL:c.ts,background:"transparent",border:"none",letterSpacing:"0.01em",fontFamily:F,textTransform:"uppercase",whiteSpace:"nowrap",maxWidth:"100%"}}>
        {children}
        <span style={{position:"absolute",left:0,right:0,bottom:0,height:1.2,background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 5px ${c.acG}`,opacity:accent?0.95:0.7,pointerEvents:"none"}}/>
      </span>
    );
    const BacktestMetric = ({label,value,color=c.ts}) => (
      <div style={{minWidth:0}}>
        <div style={{fontSize:7,fontWeight:850,color:c.tm,letterSpacing:"0.07em",textTransform:"uppercase",fontFamily:F,lineHeight:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</div>
        <div style={{display:"inline-flex",marginTop:4,fontSize:10.2,fontWeight:900,color,fontFamily:F,fontVariantNumeric:"tabular-nums",lineHeight:1}}>
          {value}
        </div>
      </div>
    );
    return (
      <div onMouseEnter={()=>setStratCardHov(strat.id)} onMouseLeave={()=>setStratCardHov(null)}
        onDoubleClick={openEditableStrategy}
        style={{position:"relative",width:"100%",minWidth:0,height:342,minHeight:342,maxHeight:342,padding:0,overflow:"hidden",background:isH?"rgba(140,160,255,0.045)":c.sf,border:`1px solid ${isH?c.brH:c.br}`,cursor:"default",userSelect:"none",boxShadow:isH?"0 8px 22px rgba(0,0,0,0.32)":"none",transition:"background 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease",display:"flex",flexDirection:"column",boxSizing:"border-box",alignSelf:"stretch"}}>
        <div style={{height:2,background:c.acL,boxShadow:`0 0 6px ${c.acG}`,flexShrink:0}}/>
        <div style={{padding:"12px 14px 12px",flex:1,display:"flex",flexDirection:"column",gap:9}}>
          <div style={{display:"grid",gridTemplateColumns:"26px minmax(0,1fr) 32px",alignItems:"center",gap:9}}>
            <div style={{width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",background:c.hv2,border:`1px solid ${isH?c.acB:c.brH}`,color:c.acL,boxSizing:"border-box",transition:"border-color 0.14s ease, background 0.14s ease"}}>
              <span style={{fontSize:18,lineHeight:1,filter:"saturate(1.08)"}}>{cardIcon}</span>
            </div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:14,fontWeight:850,color:c.tx,lineHeight:1.12,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{strat.name}</div>
              {!isMine && strat.authorPublicId ? (
                <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3,flexWrap:"wrap"}}>
                  <div style={{fontSize:8,fontWeight:750,color:c.acL,fontFamily:F,letterSpacing:"0.04em"}} title={`Posted by ${strat.author||"Community"}`}>
                    {strat.authorPublicId}
                  </div>
                  {strat.showRollbackBadge ? <RollbackBadge allowed={!!strat.rollbackAllowed} compact /> : null}
                </div>
              ) : null}
            </div>
            <div role="button" tabIndex={0} aria-label={`Open actions for ${strat.name}`}
              onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setStratActMenu(stratActMenu?.id===strat.id?null:{id:strat.id,strat,isMine,inSavedTab,inCommunityTab:stratTab==="community",x:r.right/Z,y:r.bottom/Z});}}
              onDoubleClick={e=>e.stopPropagation()}
              style={{width:32,height:26,display:"flex",alignItems:"center",justifyContent:"center",cursor:"default",color:stratActMenu?.id===strat.id?c.acL:c.ts,background:"transparent",transition:"background 0.12s, color 0.12s, transform 0.08s"}}
              onMouseEnter={e=>{e.currentTarget.style.color=stratActMenu?.id===strat.id?c.acL:c.tx;e.currentTarget.style.background="rgba(255,255,255,0.08)";}}
              onMouseLeave={e=>{e.currentTarget.style.color=stratActMenu?.id===strat.id?c.acL:c.ts;e.currentTarget.style.background="transparent";e.currentTarget.style.transform="scale(1)";}}
              onMouseDown={e=>e.currentTarget.style.transform="scale(0.94)"}
              onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}>
              <svg width={17} height={17} viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="2.1" fill="currentColor"/><circle cx="12" cy="12" r="2.1" fill="currentColor"/><circle cx="19" cy="12" r="2.1" fill="currentColor"/></svg>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5,height:74,flexShrink:0,overflow:"hidden"}}>
            <FieldLabel>Description</FieldLabel>
            <div style={{fontSize:10.4,fontWeight:560,color:c.ts,fontFamily:F,lineHeight:1.35,display:"-webkit-box",WebkitLineClamp:4,WebkitBoxOrient:"vertical",overflow:"hidden",height:57}}>
              {strat.desc||"No description added."}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,height:47,flexShrink:0,overflow:"hidden"}}>
            <div style={{display:"flex",flexDirection:"column",gap:5,minWidth:0,overflow:"hidden"}}>
              <FieldLabel>Markets</FieldLabel>
              <div style={{display:"flex",flexWrap:"wrap",columnGap:7,rowGap:2,maxHeight:34,overflow:"hidden"}}>
                {marketItems.length?marketItems.map(ins=><Pill key={`i-${ins}`}>{ins}</Pill>):<Pill keyName="markets-empty">None</Pill>}
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5,minWidth:0,overflow:"hidden"}}>
              <FieldLabel>Time Frames</FieldLabel>
              <div style={{display:"flex",flexWrap:"wrap",columnGap:7,rowGap:2,maxHeight:34,overflow:"hidden"}}>
                {(strat.timeframes||[]).length?(strat.timeframes||[]).map(tf=><Pill key={`tf-${tf}`}>{tf}</Pill>):<Pill keyName="timeframes-empty">None</Pill>}
              </div>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5,height:58,flexShrink:0,overflow:"hidden"}}>
            <FieldLabel>Strategy Tags</FieldLabel>
            <div style={{display:"flex",flexWrap:"wrap",columnGap:7,rowGap:2,maxHeight:42,overflow:"hidden"}}>
              {(strat.tags||[]).length?(strat.tags||[]).slice(0,10).map(tag=><Pill key={tag}>{tag}</Pill>):<Pill keyName="tags-empty">None</Pill>}
            </div>
          </div>
          <div style={{marginTop:"auto",height:60,flexShrink:0,paddingTop:7,borderTop:`1px solid ${c.brH}`,display:"flex",flexDirection:"column",gap:6,overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
              <FieldLabel>Backtested</FieldLabel>
              <span style={{fontSize:9,fontWeight:850,color:backtestSessions.length?c.acL:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,lineHeight:1,whiteSpace:"nowrap"}}>
                {backtestSessions.length>0?`Sessions: ${backtestSessions.length}`:"Not tested"}
              </span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:7}}>
              <BacktestMetric label="Completed" value={backtestSessions.length?`${backtestCompleted}/${backtestSessions.length}`:"—"} color={backtestSessions.length?c.gn:c.tm}/>
              <BacktestMetric label="Total Trades" value={backtestSessions.length?backtestTrades.toLocaleString():"—"} color={backtestSessions.length?c.acL:c.tm}/>
              <BacktestMetric label="Net P&L" value={backtestSessions.length?backtestMoney(backtestPnl):"—"} color={!backtestSessions.length||backtestPnl==null?c.tm:(backtestPnl>=0?c.gn:c.rd)}/>
              <BacktestMetric label="Avg Win Rate" value={backtestSessions.length?(backtestWin==null?"—":`${backtestWin}%`):"—"} color={!backtestSessions.length||backtestWin==null?c.tm:(backtestWin>=50?c.gn:c.rd)}/>
            </div>
          </div>
        </div>
        {/* action bar */}
        <div style={{display:"none",gap:0,borderTop:`1px solid ${c.brL}`,flexShrink:0}}>
          {strat.templatePreview?(
            <>
              <div onClick={()=>onSave&&onSave(strat)}
                style={{flex:1,height:34,display:"flex",alignItems:"center",justifyContent:"center",gap:6,background:c.sf,cursor:"default",fontSize:9,fontWeight:760,color:c.ts,transition:"filter 0.12s, background 0.12s",borderRight:`1px solid ${c.brL}`,fontFamily:F,letterSpacing:"0.04em",textTransform:"uppercase"}}
                onMouseEnter={e=>{e.currentTarget.style.filter="brightness(1.12)";e.currentTarget.style.background="rgba(255,255,255,0.045)";}}
                onMouseLeave={e=>{e.currentTarget.style.filter="brightness(1)";e.currentTarget.style.background=c.sf;}}>
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2"/></svg>
                Save Reference
              </div>
              <div onClick={()=>onUseTemplate&&onUseTemplate(strat.template)}
                style={{flex:1,height:34,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",fontSize:9,fontWeight:850,color:"rgba(255,255,255,0.96)",letterSpacing:"0.07em",transition:"filter 0.12s, transform 0.08s",fontFamily:F,textTransform:"uppercase"}}
                onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"}
                onMouseLeave={e=>{e.currentTarget.style.filter="brightness(1)";e.currentTarget.style.transform="scale(1)";}}
                onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
                onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}>
                Build From This
              </div>
            </>
          ):isMine?(
            <>
              <div onClick={()=>onEdit&&onEdit(strat)}
                style={{flex:1,height:32,display:"flex",alignItems:"center",justifyContent:"center",background:c.sf,cursor:"default",fontSize:9,fontWeight:700,color:c.ts,transition:"filter 0.12s",borderRight:`1px solid ${c.brL}`,fontFamily:F,gap:5}}
                onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.15)"}
                onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                Edit
              </div>
              <div title="Duplicate" onClick={()=>onDuplicate&&onDuplicate(strat)}
                style={{width:36,height:32,display:"flex",alignItems:"center",justifyContent:"center",background:c.sf,cursor:"default",color:c.ts,transition:"filter 0.12s",borderRight:`1px solid ${c.brL}`}}
                onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.2)"}
                onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="1" stroke="currentColor" strokeWidth="1.8"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              </div>
              <div title="Performance" onClick={()=>onPerf&&onPerf(strat)}
                style={{width:36,height:32,display:"flex",alignItems:"center",justifyContent:"center",background:c.sf,cursor:"default",color:c.acL,transition:"filter 0.12s",borderRight:`1px solid ${c.brL}`}}
                onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.2)"}
                onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none"><path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </div>
              <div title="Delete" onClick={()=>onDelete&&onDelete(strat.id)}
                style={{width:36,height:32,display:"flex",alignItems:"center",justifyContent:"center",background:c.sf,cursor:"default",color:c.rd,transition:"filter 0.12s"}}
                onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.25)"}
                onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M9 6V4h6v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </div>
            </>
          ):inSavedTab?(
            <>
              <div onClick={()=>{onRemove&&onRemove(strat);}}
                style={{flex:1,height:32,display:"flex",alignItems:"center",justifyContent:"center",gap:5,background:c.sf,cursor:"default",fontSize:9,fontWeight:700,color:c.rd,transition:"filter 0.12s",borderRight:`1px solid ${c.brL}`,fontFamily:F}}
                onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.15)"}
                onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={c.rd} strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                Remove
              </div>
              <div style={{flex:1,height:32,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.96)",letterSpacing:"0.06em",transition:"filter 0.12s",fontFamily:F}}
                onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"}
                onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                Use Strategy
              </div>
            </>
          ):(
            <>
              <div onClick={()=>{onSave&&onSave(strat);}}
                style={{flex:1,height:32,display:"flex",alignItems:"center",justifyContent:"center",gap:5,background:cardIsSaved?"rgba(74,106,255,0.12)":c.sf,cursor:"default",fontSize:9,fontWeight:700,color:cardIsSaved?c.acL:c.ts,transition:"filter 0.12s, background 0.15s",borderRight:`1px solid ${c.brL}`,fontFamily:F}}
                onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"}
                onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                <svg width={10} height={10} viewBox="0 0 24 24" fill={cardIsSaved?c.acL:"none"} stroke={cardIsSaved?c.acL:c.ts} strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                {cardIsSaved?"Saved":"Save"}
              </div>
              <div style={{flex:1,height:32,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.96)",letterSpacing:"0.06em",transition:"filter 0.12s",fontFamily:F}}
                onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"}
                onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                Use Strategy
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  /** Icon + name share first column (same total width as old 44+190) — tight gap like sessions row. */
  const STRAT_ROW_COLS = "234px 330px 285px 135px 110px 150px 44px";
  const STRAT_ROW_COLS_COMMUNITY = "200px 108px 252px 285px 135px 110px 150px 44px";
  const stratMarkets = strat => (strat.markets||[]).length
    ? (strat.markets||[]).map(m=>(MKT_CAT_OPTS.find(x=>x.id===m)?.label||m))
    : (strat.instruments||[]);
  const GlowText = ({children,accent=false,keyName}) => (
    <span key={keyName||children} style={{position:"relative",display:"inline-flex",alignItems:"center",height:17,padding:"0 3px 4px",fontSize:9.5,fontWeight:790,color:accent?c.acL:c.ts,letterSpacing:"0.01em",textTransform:"uppercase",whiteSpace:"nowrap",fontFamily:F}}>
      {children}
      <span style={{position:"absolute",left:0,right:0,bottom:0,height:1.2,background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 5px ${c.acG}`,opacity:accent?0.95:0.7,pointerEvents:"none"}}/>
    </span>
  );
  const RowItems = ({items,accent=false}) => (
    <div style={{display:"flex",flexWrap:"wrap",columnGap:7,rowGap:2,alignContent:"flex-start",maxHeight:38,overflow:"hidden"}}>
      {(items||[]).length ? items.map(item=><GlowText keyName={item} key={item} accent={accent}>{item}</GlowText>) : <span style={{fontSize:9.5,fontWeight:650,color:c.tm,fontFamily:F}}>—</span>}
    </div>
  );
  const RowMetricValue = ({label,children,color=c.acL}) => (
    <span style={{display:"inline-flex",alignItems:"baseline",gap:5,minWidth:0,fontFamily:F,whiteSpace:"nowrap",lineHeight:1}}>
      <span style={{fontSize:7,fontWeight:850,color:c.tm,letterSpacing:"0.07em",textTransform:"uppercase",flexShrink:0}}>{label}</span>
      <span style={{fontSize:9.5,fontWeight:850,color,fontVariantNumeric:"tabular-nums",overflow:"hidden",textOverflow:"ellipsis"}}>{children}</span>
    </span>
  );
  const RowBacktestResults = ({sessions=[]}) => {
    if(!sessions.length) return <span style={{fontSize:9.5,fontWeight:650,color:c.tm,fontFamily:F}}>Not tested</span>;
    const trades = sessions.reduce((sum,s)=>sum+(s.trades||0),0);
    const pnlKnown = sessions.filter(s=>s.pnl!=null);
    const pnl = pnlKnown.length ? pnlKnown.reduce((sum,s)=>sum+(s.pnl||0),0) : null;
    const winKnown = sessions.filter(s=>s.winRate!=null);
    const win = winKnown.length ? Math.round(winKnown.reduce((sum,s)=>sum+s.winRate,0)/winKnown.length) : null;
    const pnlColor = pnl==null ? c.tm : (pnl>=0 ? c.gn : c.rd);
    const money = pnl==null ? "—" : `${pnl>=0?"+":"-"}$${Math.abs(pnl).toLocaleString()}`;
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:4,minWidth:0}}>
        <RowMetricValue label="Sessions" color={c.acL}>{sessions.length}</RowMetricValue>
        <RowMetricValue label="Net P&L" color={pnlColor}>{money}</RowMetricValue>
        <RowMetricValue label="Total Trades" color={c.ts}>{trades.toLocaleString()}</RowMetricValue>
        <RowMetricValue label="Avg Win Rate" color={win==null?c.tm:(win>=50?c.gn:c.rd)}>{win==null?"—":`${win}%`}</RowMetricValue>
      </div>
    );
  };
  const StrategyRowAction = ({strat,isMine,inSavedTab,isSaved,onEdit,onRemove,onSave,onUseTemplate}) => {
    const actionColor = strat.templatePreview ? c.acL : inSavedTab ? c.rd : isSaved ? c.acL : c.ts;
    const handleClick = e => {
      e.stopPropagation();
      if (strat.templatePreview) onUseTemplate&&onUseTemplate(strat.template);
      else if (isMine) onEdit&&onEdit(strat);
      else if (inSavedTab) onRemove&&onRemove(strat);
      else onSave&&onSave(strat);
    };
    return (
      <div onClick={handleClick}
        title={strat.templatePreview?"Build from this":isMine?"Edit":inSavedTab?"Remove":"Save"}
        style={{width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",color:actionColor,cursor:"default",transition:"background 0.12s, color 0.12s, transform 0.08s"}}
        onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.075)"}
        onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.transform="scale(1)";}}
        onMouseDown={e=>e.currentTarget.style.transform="scale(0.94)"}
        onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}>
        {strat.templatePreview?(
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/></svg>
        ):isMine?(
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        ):inSavedTab?(
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M9 6V4h6v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        ):(
          <svg width={13} height={13} viewBox="0 0 24 24" fill={isSaved?c.acL:"none"}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2"/></svg>
        )}
      </div>
    );
  };
  const StrategyRows = ({items,isMine=false,inSavedTab=false,showPublicId=false,onEdit,onDelete,onSave,onRemove,isSaved,onDuplicate,onPerf,onUseTemplate}) => {
    const rowCols = showPublicId ? STRAT_ROW_COLS_COMMUNITY : STRAT_ROW_COLS;
    const headers = showPublicId
      ? ["Strategy","Public ID","Description","Strategy Tags","Markets","Time Frames","Backtesting Results",""]
      : ["Strategy","Description","Strategy Tags","Markets","Time Frames","Backtesting Results",""];
    return (
    <div style={{width:1288,margin:"0 auto",display:"flex",flexDirection:"column",padding:"0 0 24px"}}>
      <div style={{display:"grid",gridTemplateColumns:rowCols,alignItems:"center",height:26,borderBottom:`1px solid ${c.brH}`}}>
        {headers.map((label,i)=>{
          const pad = i === headers.length - 1 ? "0 8px" : i >= (showPublicId ? 3 : 2) ? "8px 10px" : "0 10px";
          return (
          <div key={label||"_icon"} style={{fontSize:8,fontWeight:850,color:c.tm,textTransform:"uppercase",letterSpacing:"0.08em",whiteSpace:"nowrap",fontFamily:F,textAlign:label?"left":"center",padding:pad,display:"flex",alignItems:"center",justifyContent:label?"flex-start":"center",boxSizing:"border-box",minWidth:0}}>
            {label}
          </div>
        );})}
      </div>
      {items.map((strat,idx)=>{
        const isH=stratCardHov===strat.id;
        const icon = strat.icon || strat.template?.icon || "◎";
        const markets = stratMarkets(strat);
        const tfs = strat.timeframes||[];
        const tags = (strat.tags||[]).slice(0,10);
        const backtests = strat.backtestSessions||[];
        const openEditableStrategy = e => {
          e.stopPropagation();
          if (strat.templatePreview && !isMine) return;
          if (strat.templatePreview && onUseTemplate) onUseTemplate(strat.template);
          else if (isMine && onEdit) onEdit(strat);
        };
        return (
          <div key={strat.id}
            onMouseEnter={()=>setStratCardHov(strat.id)}
            onMouseLeave={()=>setStratCardHov(null)}
            onDoubleClick={openEditableStrategy}
            style={{display:"grid",gridTemplateColumns:rowCols,alignItems:"stretch",height:80,minHeight:80,maxHeight:80,borderTop:`1px solid ${isH?c.acB:c.brH}`,borderRight:`1px solid ${isH?c.acB:c.brH}`,borderBottom:`1px solid ${isH?c.acB:c.brH}`,borderLeft:`3px solid ${c.acL}`,background:isH?"rgba(140,160,255,0.045)":c.sf,cursor:"default",transition:"box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease",boxShadow:isH?`0 0 0 1px ${c.acB}, 0 4px 24px rgba(0,0,0,0.6), 0 0 18px rgba(38,67,247,0.15)`:"0 3px 12px rgba(0,0,0,0.5)",marginTop:idx===0?0:6,overflow:"hidden",boxSizing:"border-box"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0,padding:"0 10px",overflow:"hidden",boxSizing:"border-box"}}>
              <div style={{width:24,height:24,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:c.hv2,border:`1px solid ${isH?c.acB:c.brH}`,boxSizing:"border-box"}}>
                <span style={{fontSize:17,lineHeight:1,filter:"saturate(1.08)"}}>{icon}</span>
              </div>
              <div style={{fontSize:12,fontWeight:850,color:c.tx,lineHeight:1.25,fontFamily:F,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{strat.name}</div>
            </div>
            {showPublicId ? (
              <div style={{display:"flex",flexDirection:"column",justifyContent:"center",minWidth:0,padding:"0 10px",gap:2}}>
                <div style={{fontSize:10,fontWeight:800,color:c.acL,fontFamily:F,letterSpacing:"0.04em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={strat.authorPublicId||""}>
                  {strat.authorPublicId || "—"}
                </div>
                <div style={{fontSize:8,fontWeight:600,color:c.tm,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={strat.author||""}>
                  {strat.author || ""}
                </div>
                {strat.showRollbackBadge ? <RollbackBadge allowed={!!strat.rollbackAllowed} compact /> : null}
              </div>
            ) : null}
            <div style={{display:"flex",alignItems:"center",minWidth:0,padding:"0 10px"}}>
              <div style={{fontSize:10.5,fontWeight:560,color:c.ts,fontFamily:F,lineHeight:1.35,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
                {strat.desc||"No description added."}
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",minWidth:0,padding:"8px 10px"}}>
              <RowItems items={tags}/>
            </div>
            <div style={{display:"flex",alignItems:"center",minWidth:0,padding:"8px 10px"}}>
              <RowItems items={markets}/>
            </div>
            <div style={{display:"flex",alignItems:"center",minWidth:0,padding:"8px 10px"}}>
              <RowItems items={tfs}/>
            </div>
            <div style={{display:"flex",alignItems:"center",minWidth:0,padding:"8px 10px"}}>
              <RowBacktestResults sessions={backtests}/>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"0 8px"}}>
              <div role="button" tabIndex={0} aria-label={`Open actions for ${strat.name}`}
                title="Actions" onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setStratActMenu(stratActMenu?.id===strat.id?null:{id:strat.id,strat,isMine,inSavedTab,inCommunityTab:stratTab==="community",x:r.right/Z,y:r.bottom/Z});}}
                onDoubleClick={e=>e.stopPropagation()}
                style={{width:32,height:26,display:"flex",alignItems:"center",justifyContent:"center",cursor:"default",color:stratActMenu?.id===strat.id?c.acL:c.ts,background:"transparent",transition:"background 0.12s, color 0.12s, transform 0.08s"}}
                onMouseEnter={e=>{e.currentTarget.style.color=stratActMenu?.id===strat.id?c.acL:c.tx;e.currentTarget.style.background="rgba(255,255,255,0.08)";}}
                onMouseLeave={e=>{e.currentTarget.style.color=stratActMenu?.id===strat.id?c.acL:c.ts;e.currentTarget.style.background="transparent";e.currentTarget.style.transform="scale(1)";}}
                onMouseDown={e=>e.currentTarget.style.transform="scale(0.94)"}
                onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}>
                <svg width={17} height={17} viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="2.1" fill="currentColor"/><circle cx="12" cy="12" r="2.1" fill="currentColor"/><circle cx="19" cy="12" r="2.1" fill="currentColor"/></svg>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
  };

  /* ─── Builder modal open/close helper ─── */
  const openBuilder = async (editStrat=null) => {
    const token = (await syncJournalTokenFromSession()) || getToken();
    if (!token) {
      window.location.href = loginUrlWithNext();
      return;
    }
    if(editStrat){
      setStratEditId(editStrat.id);
      setStratBName(editStrat.name);
      setStratBStyle(editStrat.style||"Trend Following");
      setStratBDesc(editStrat.desc||"");
      setStratBInstruments(editStrat.instruments||[]);
      setStratBTimeframes(editStrat.timeframes||[]);
      setStratBTags(editStrat.tags||[]);
      setStratBComplexity(editStrat.complexity||"Medium");
      setStratBDirection(editStrat.direction||"both");
      setStratBMarkets(editStrat.markets||[]);
      setStratBConditions(editStrat.conditions||[]);
      setStratBVariables(editStrat.variables||[{type:"divider",id:"div0"}]);
      setStratBImages(editStrat.images||[]);
      setStratBSupportInst(editStrat.supportInst||[]);
    } else {
      setStratEditId(null);
      setStratBName(""); setStratBStyle("Trend Following"); setStratBDesc("");
      setStratBInstruments([]); setStratBTimeframes([]); setStratBTags([]);
      setStratBComplexity("Medium"); setStratBDirection("both"); setStratBMarkets([]);
      setStratBConditions([]); setStratBVariables([{type:"divider",id:"div0"}]);
      setStratBImages([]); setStratBSupportInst([]);
    }
    setStratBLogoEmoji(editStrat ? (editStrat.icon||"") : ""); setStratBLogoMenuOpen(false); setStratBLogoMenuMode(null);
    setStratBInstInput(""); setStratBTagInput("");
    setStratBInstDropOpen(false); setStratBInstSearch("");
    setStratBTfDropOpen(false);
    setStratBCustomTfs([]); setStratBCustomTfVal(""); setStratBCustomTfUnit("m"); setStratBTfUnitOpen(false);
    setStratBMktDropOpen(false);
    setStratWizardStep(1);
    stratBuilderSaveInFlightRef.current = false;
    setStratBuilderSavePhase(null);
    setCanvasNodes(editStrat ? (editStrat.canvasNodes||[]) : []);
    setCanvasEdges(editStrat ? (editStrat.canvasEdges||[]) : []);
    if (editStrat) {
      setStratBuilderOpen(true);
    } else {
      let dismissed = false;
      try { dismissed = localStorage.getItem('talaria_template_picker_dismissed') === '1'; } catch {}
      if (dismissed) {
        setStratBuilderOpen(true);
      } else {
        setStratTemplatePickerOpen(true);
      }
    }
  };

  stratOpenBuilderLatestRef.current = openBuilder;

  const applyTemplateToBuilder = async (tpl) => {
    if (!tpl) return;
    const token = (await syncJournalTokenFromSession()) || getToken();
    if (!token) {
      window.location.href = loginUrlWithNext();
      return;
    }
    setStratEditId(null);
    setStratBName(`${tpl.name} (my version)`);
    setStratBStyle((tpl.tags||[]).find(t=>STYLES.includes(t)) || (tpl.tags||[])[0] || "Trend Following");
    setStratBDesc(tpl.description || "");
    setStratBInstruments([]);
    setStratBTimeframes(tpl.timeframes || []);
    setStratBTags(tpl.tags || []);
    setStratBComplexity((tpl.tags||[]).some(t=>/advanced/i.test(t))?"Hard":(tpl.tags||[]).some(t=>/beginner/i.test(t))?"Easy":"Medium");
    setStratBDirection("both");
    setStratBMarkets(tpl.markets || []);
    setStratBConditions([]);
    setStratBVariables([{type:"divider",id:"div0"}]);
    setStratBImages([]);
    setStratBSupportInst([]);
    setStratBLogoEmoji(tpl.icon || "");
    setCanvasNodes(buildNodesFromTemplate(tpl));
    setCanvasEdges([]);
    setStratWizardStep(1);
    stratBuilderSaveInFlightRef.current = false;
    setStratBuilderSavePhase(null);
    setStratBuilderOpen(true);
  };

  const strategyCopyName = (name, existing) => {
    const clean = String(name||"Untitled Strategy").replace(/\s*\(copy(?:\s+\d+)?\)\s*$/i,"").trim() || "Untitled Strategy";
    const used = new Set((existing||[]).map(s=>String(s.name||"").toLowerCase()));
    let next = `${clean} (copy)`;
    let n = 2;
    while (used.has(next.toLowerCase())) next = `${clean} (copy ${n++})`;
    return next;
  };
  const cloneStrategyData = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const copyStrategyIntoBank = (source) => {
    if (!source) return;
    const tpl = source.templatePreview ? source.template : null;
    setMyStrategies(prev=>{
      const id = `m${Date.now()}_${prev.length}`;
      const createdAt = new Date().toISOString();
      if (tpl) {
        return [{
          id,
          name:strategyCopyName(tpl.name,prev),
          icon:tpl.icon,
          style:source.style || (tpl.tags||[]).find(t=>STYLES.includes(t)) || "Trend Following",
          desc:tpl.description || "",
          instruments:[],
          timeframes:[...(tpl.timeframes || [])],
          tags:[...(tpl.tags || [])],
          complexity:source.complexity || ((tpl.tags||[]).some(t=>/advanced/i.test(t))?"Hard":(tpl.tags||[]).some(t=>/beginner/i.test(t))?"Easy":"Medium"),
          direction:"both",
          markets:[...(tpl.markets || [])],
          conditions:[],
          variables:[{type:"divider",id:"div0"}],
          images:cloneStrategyData(tpl.images),
          canvasNodes:buildNodesFromTemplate(tpl),
          canvasEdges:[],
          createdAt,
        },...prev];
      }
      const copy = cloneStrategyData(source);
      delete copy.backtestSessions;
      delete copy.templatePreview;
      delete copy.template;
      delete copy.accent;
      delete copy.author;
      delete copy.authorBadge;
      delete copy.saves;
      delete copy.winRate;
      delete copy.rr;
      delete copy.trades;
      delete copy.pnl;
      return [{
        ...copy,
        id,
        name:strategyCopyName(source.name,prev),
        createdAt,
      },...prev];
    });
  };
  const duplicateStrategy = async (source) => {
    if (!source) return;
    if (source.templatePreview && source.templateId) {
      if (source.allowClone === false) {
        window.alert("The author disabled copying for this strategy.");
        return;
      }
      try {
        await cloneCommunityTemplate(Number(source.templateId));
        void reloadSessions();
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Copy failed");
      }
      return;
    }
    if (typeof source.id === "number" && source.id > 0 && !source.templatePreview) {
      try {
        await duplicateStrategyRemote(source.id);
        void reloadSessions();
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Duplicate failed");
      }
      return;
    }
    copyStrategyIntoBank(source);
  };
  const deleteStrategyFromBank = async (source) => {
    if (!source || source.id == null) return;
    const sid = source.id;
    const isServer = typeof sid === "number" && Number.isFinite(sid) && sid > 0;
    if (isServer) {
      if (!window.confirm("Delete this strategy from your account?")) return;
      try {
        await deleteStrategyRemote(sid);
        void reloadSessions();
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Delete failed");
        return;
      }
    } else {
      setMyStrategies(prev=>prev.filter(s=>s.id!==sid));
    }
    if (stratPerfStrat?.id === source.id) setStratPerfStrat(null);
    if (stratShareStrat?.id === source.id) setStratShareStrat(null);
    if (stratEditId === source.id) {
      setStratBuilderOpen(false);
      setStratEditId(null);
    }
  };

  const saveBuilder = async () => {
    if (stratBuilderSaveInFlightRef.current) return;
    stratBuilderSaveInFlightRef.current = true;
    const strat = {
      name: stratBName.trim()||"Untitled Strategy",
      icon: stratBLogoEmoji || "",
      style: stratBStyle,
      desc: stratBDesc.trim(),
      instruments: stratBInstruments,
      timeframes: stratBTimeframes,
      tags: stratBTags,
      complexity: stratBComplexity,
      direction: stratBDirection,
      markets: stratBMarkets,
      conditions: stratBConditions,
      tree: stratBTree,
      variables: stratBVariables,
      images: (stratBImages||[]).length ? stratBImages : undefined,
      supportInst: (stratBSupportInst||[]).length ? stratBSupportInst : undefined,
      canvasNodes: canvasNodes,
      canvasEdges: canvasEdges,
      createdAt: stratEditId ? (myStrategies.find(s=>s.id===stratEditId)?.createdAt||new Date().toISOString()) : new Date().toISOString(),
    };
    const imageStats = collectStrategyImageStats(canvasNodes, stratBImages);
    setStratBuilderSavePhase("saving");
    setStratBuilderSaveProgress({ pct: 8, ...imageStats, payloadBytes: 0 });
    let saveTick = null;
    try {
      const body = bankStrategyToApiBody(strat);
      const payloadBytes = new TextEncoder().encode(JSON.stringify(body)).length;
      setStratBuilderSaveProgress((p) => (p ? { ...p, pct: 22, payloadBytes } : p));
      saveTick = setInterval(() => {
        setStratBuilderSaveProgress((p) => (p && p.pct < 88 ? { ...p, pct: p.pct + 4 } : p));
      }, 400);
      await persistStrategy(strat, stratEditId);
      setStratBuilderSaveProgress((p) => (p ? { ...p, pct: 100 } : p));
      setStratBuilderSavePhase("success");
      void reloadSessions();
      await new Promise((r) => setTimeout(r, 900));
      setStratBuilderOpen(false);
      setStratEditId(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "DUPLICATE_SAVE") return;
      if (msg === "Not signed in") window.location.href = loginUrlWithNext();
      else window.alert(msg);
    } finally {
      if (saveTick) clearInterval(saveTick);
      stratBuilderSaveInFlightRef.current = false;
      setStratBuilderSavePhase(null);
      setStratBuilderSaveProgress(null);
    }
  };

  const saveCommunity = (strat) => {
    const already = savedCommunityIds.has(strat.id);
    if(already){
      setSavedCommunityIds(prev=>{const n=new Set(prev);n.delete(strat.id);return n;});
      setSavedCommunityStrats(prev=>prev.filter(s=>s.id!==strat.id));
    } else {
      setSavedCommunityIds(prev=>new Set([...prev,strat.id]));
      setSavedCommunityStrats(prev=>[strat,...prev]);
    }
  };

  const SORT_OPTIONS=[{k:"name",l:"Name"},{k:"winRate",l:"Win Rate"},{k:"rr",l:"Avg R:R"},{k:"saves",l:"Most Saved"},{k:"pnl",l:"Net P&L"}];

  return (
    <div style={{position:"fixed",inset:0,zIndex:99998,background:c.bg,fontFamily:F,display:"flex",flexDirection:"column"}} onClick={()=>{}}>
      <style>{`@keyframes tlrBankSpin{to{transform:rotate(360deg)}}.tlr-bank-spin{animation:tlrBankSpin .75s linear infinite}`}</style>
      {/* ─ Header ─ */}
      <div style={{height:64,flexShrink:0,display:"flex",alignItems:"center",gap:0,background:c.el,boxShadow:"0 2px 18px rgba(0,0,0,0.5)",zIndex:2}}>
        <div style={{width:64,flexShrink:0,height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <img src="/LOGO-07.png" style={{width:52,height:52,objectFit:"contain"}} alt=""/>
        </div>
        <div style={{display:"flex",alignItems:"center",flexShrink:0,padding:"0 12px 0 0"}}>
          <div style={{fontSize:17,fontWeight:700,color:c.tx,letterSpacing:"0.04em",fontFamily:F,marginRight:14}}>Talaria-Log</div>
          <div style={{width:1.5,height:36,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acL}`,marginRight:14}}/>
          <div style={{fontSize:13,fontWeight:700,color:c.ts,letterSpacing:"0.06em",fontFamily:F}}>Strategy Bank</div>
        </div>
        <div style={{flex:1}}/>
        {myPublicId ? (
          <div style={{marginRight:16,fontSize:9,fontWeight:700,color:c.tm,fontFamily:F,letterSpacing:"0.06em",textTransform:"uppercase",flexShrink:0}}>
            Your Public ID{" "}
            <span style={{color:c.acL,fontWeight:850,letterSpacing:"0.04em"}}>{myPublicId}</span>
          </div>
        ) : null}
        {/* Build Strategy button */}
        <div role="button" tabIndex={0} aria-label="Build strategy" onClick={()=>openBuilder()}
          style={{width:160,height:36,padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"center",gap:7,background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",fontSize:12.5,fontWeight:800,color:"rgba(255,255,255,0.96)",letterSpacing:"0.08em",boxShadow:"0 2px 10px rgba(38,67,247,0.35)",marginRight:20,fontFamily:F,transition:"filter 0.12s, transform 0.08s",flexShrink:0,boxSizing:"border-box",whiteSpace:"nowrap"}}
          onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"}
          onMouseLeave={e=>{e.currentTarget.style.filter="brightness(1)";e.currentTarget.style.transform="scale(1)";}}
          onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
          onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none"><line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
          Build Strategy
        </div>
      </div>

      {/* ─ Body ─ */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {navPanel}
        <div className="tlr-scroll" style={{flex:1,display:"flex",flexDirection:"column",overflow:"auto",scrollbarGutter:"stable"}}>
        {/* ─ Filter/search bar ─ */}
        <div style={{flexShrink:0,background:c.bg,padding:"0 32px",position:"sticky",top:0,zIndex:3}}>
          {strategiesError ? (
            <div style={{width:1288,margin:"0 auto",padding:"8px 0 0",fontSize:9,fontFamily:F,color:c.rd}}>
              {strategiesError}
            </div>
          ) : null}
          <div style={{width:1288,margin:"0 auto",display:"flex",alignItems:"flex-end",height:40,gap:5,borderBottom:`1px solid ${c.brH}`,boxSizing:"border-box"}}>
            <div style={{display:"flex",alignItems:"flex-end",height:"100%",gap:5,flexShrink:0}}>
              {[{k:"mine",l:"My Strategies",ct:mineSource.length},{k:"community",l:"Community",ct:communityPool.length}].map(({k,l,ct,disabled})=>{
                const isA=stratTab===k&&!disabled;
                const tabCol=isA?c.acL:(disabled?c.tm:c.ts);
                const tabBg=isA?c.acD:"transparent";
                const badgeBg=isA?"rgba(74,106,255,0.2)":"rgba(255,255,255,0.07)";
                return(
                  <div key={k} role="button" tabIndex={disabled?-1:0} aria-disabled={disabled?"true":"false"} onClick={()=>{if(!disabled){setStratTab(k);if(k==="community")setStratLayoutMode("cards");}}}
                    style={{height:26,display:"flex",alignItems:"flex-end",padding:"0 12px",cursor:"default",transition:"color 0.12s, background 0.12s, opacity 0.12s, transform 0.08s",background:tabBg,color:tabCol,opacity:disabled?0.42:1,flexShrink:0,userSelect:"none"}}
                    onMouseEnter={e=>{if(!disabled&&!isA){e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.color=c.tx;}}}
                    onMouseLeave={e=>{if(!disabled&&!isA){e.currentTarget.style.background="transparent";e.currentTarget.style.color=c.ts;}e.currentTarget.style.transform="scale(1)";}}
                    onMouseDown={e=>{if(!disabled)e.currentTarget.style.transform="scale(0.98)";}}
                    onMouseUp={e=>{e.currentTarget.style.transform="scale(1)";}}>
                    <div style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:9,fontWeight:800,letterSpacing:"0.07em",textTransform:"uppercase",fontFamily:F,paddingBottom:4,borderBottom:isA?`3px solid ${c.acL}`:"3px solid transparent",boxSizing:"border-box"}}>
                      {l}
                      <span style={{fontSize:8,fontWeight:700,background:badgeBg,color:isA?c.ts:tabCol,padding:"2px 6px",minWidth:18,textAlign:"center",fontVariantNumeric:"tabular-nums"}}>{ct}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{flex:1}}/>
            <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,alignSelf:"center"}}>
            <div style={{display:"flex",gap:4,flexShrink:0}}>
              {[
                {mode:"cards",label:"Cards",icon:(
                  <svg width={13} height={13} viewBox="0 0 14 14" fill="none">
                    <rect x="0" y="0" width="6" height="6" rx="0.5" fill="currentColor"/>
                    <rect x="8" y="0" width="6" height="6" rx="0.5" fill="currentColor"/>
                    <rect x="0" y="8" width="6" height="6" rx="0.5" fill="currentColor"/>
                    <rect x="8" y="8" width="6" height="6" rx="0.5" fill="currentColor"/>
                  </svg>
                )},
                {mode:"rows",label:"Rows",icon:(
                  <svg width={13} height={13} viewBox="0 0 14 14" fill="none">
                    <rect x="0" y="0" width="14" height="3" rx="0.5" fill="currentColor"/>
                    <rect x="0" y="5" width="14" height="3" rx="0.5" fill="currentColor"/>
                    <rect x="0" y="10" width="14" height="3" rx="0.5" fill="currentColor"/>
                  </svg>
                )},
              ].map(({mode,label,icon})=>{
                const isA=stratLayoutMode===mode;
                return(
                  <div key={mode} role="button" tabIndex={0} aria-label={`Show strategies as ${label.toLowerCase()}`} title={label} onClick={()=>setStratLayoutMode(mode)}
                    style={{width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",cursor:"default",background:isA?"rgba(74,106,255,0.08)":"transparent",color:isA?c.acL:c.ts,transition:"background 0.12s,color 0.12s,transform 0.08s"}}
                    onMouseEnter={e=>{if(!isA){e.currentTarget.style.background="rgba(255,255,255,0.05)";e.currentTarget.style.color=c.tx;}}}
                    onMouseLeave={e=>{if(!isA){e.currentTarget.style.background="transparent";e.currentTarget.style.color=c.ts;}e.currentTarget.style.transform="scale(1)";}}
                    onMouseDown={e=>e.currentTarget.style.transform="scale(0.94)"}
                    onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}>
                    {icon}
                    {isA&&<div style={{position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",width:"70%",height:2,background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acL}`,pointerEvents:"none"}}/>}
                  </div>
                );
              })}
            </div>
            {/* search */}
            <div style={{display:"flex",alignItems:"center",gap:6,background:c.el,border:`1px solid ${stratSearchFocus?c.acB:c.brH}`,padding:"0 10px",width:210,height:28,boxSizing:"border-box",flexShrink:0,transition:"border-color 0.12s, background 0.12s"}}>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" style={{color:c.tm,flexShrink:0}}><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              <input value={stratSearch} onChange={e=>setStratSearch(e.target.value)} placeholder={stratTab==="mine"?"Search my strategies…":stratTab==="saved"?"Search saved…":"Search community…"}
                onFocus={()=>setStratSearchFocus(true)} onBlur={()=>setStratSearchFocus(false)}
                style={{flex:1,background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:9,fontWeight:600,fontFamily:F,padding:0}}/>
              {stratSearch&&<div role="button" tabIndex={0} aria-label="Clear strategy search" onClick={()=>setStratSearch("")}
                style={{width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",color:c.tm,cursor:"default",fontSize:12,lineHeight:1,transition:"color 0.12s, background 0.12s"}}
                onMouseEnter={e=>{e.currentTarget.style.color=c.tx;e.currentTarget.style.background="rgba(255,255,255,0.06)";}}
                onMouseLeave={e=>{e.currentTarget.style.color=c.tm;e.currentTarget.style.background="transparent";}}>×</div>}
            </div>
            {/* sort dropdown (community tab only) */}
            {stratTab==="community"&&(
              <div style={{position:"relative",flexShrink:0}}>
                <div onClick={e=>{e.stopPropagation();setStratSortOpen(p=>!p);}}
                  style={{display:"flex",alignItems:"center",gap:6,background:c.el,border:`1px solid ${c.brH}`,padding:"0 10px",height:28,cursor:"default",fontFamily:F}}>
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" style={{color:c.tm}}><path d="M3 6h18M6 12h12M9 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  <span style={{fontSize:9,fontWeight:600,color:c.ts}}>{SORT_OPTIONS.find(o=>o.k===stratSort)?.l||"Sort"}</span>
                  <svg width={8} height={8} viewBox="0 0 24 24" fill="none" style={{color:c.tm}}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </div>
                {stratSortOpen&&(
                  <>
                    <div style={{position:"fixed",inset:0,zIndex:99990}} onClick={()=>setStratSortOpen(false)}/>
                    <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,zIndex:99991,width:160,background:c.el,border:`1px solid ${c.brH}`,boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}>
                      {SORT_OPTIONS.map(o=>{
                        const isA=stratSort===o.k;
                        return(
                          <div key={o.k} onClick={()=>{if(isA)setStratSortDir(d=>d==="asc"?"desc":"asc");else{setStratSort(o.k);setStratSortDir("desc");}setStratSortOpen(false);}}
                            style={{padding:"8px 12px",fontSize:10,fontWeight:isA?700:500,color:isA?c.tx:c.ts,cursor:"default",display:"flex",alignItems:"center",justifyContent:"space-between",borderLeft:isA?`2px solid ${c.acL}`:"2px solid transparent",transition:"background 0.1s",fontFamily:F}}
                            onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
                            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            {o.l}
                            {isA&&<span style={{fontSize:9,color:c.acL}}>{stratSortDir==="asc"?"↑":"↓"}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
            </div>
          </div>
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",padding:"0 32px 24px",minHeight:0}}>

          {/* MY STRATEGIES */}
          {stratTab==="mine"&&(
            isLoadingMyStrategies?(
              <div
                role="status"
                aria-live="polite"
                style={{
                  flex:1,
                  display:"flex",
                  flexDirection:"column",
                  alignItems:"center",
                  justifyContent:"center",
                  gap:14,
                  width:"100%",
                  minHeight:0,
                }}
              >
                <div
                  className="tlr-bank-spin"
                  aria-hidden
                  style={{
                    width:36,
                    height:36,
                    border:`2px solid ${c.brH}`,
                    borderTopColor:c.acL,
                    borderRadius:"50%",
                    flexShrink:0,
                  }}
                />
                <div style={{fontSize:12,fontWeight:700,color:c.ts,fontFamily:F}}>Loading strategies…</div>
                {sessionsLoading ? (
                  <div style={{fontSize:9,fontWeight:600,color:c.tm,fontFamily:F}}>Loading backtest sessions…</div>
                ) : null}
              </div>
            ):filteredMine.length===0?(
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,minHeight:0}}>
                <svg width={52} height={52} viewBox="0 0 24 24" fill="none" style={{color:c.tm,opacity:0.5}}><rect x="3" y="3" width="18" height="18" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M9 12h6M12 9v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                <div style={{fontSize:13,fontWeight:700,color:c.ts,fontFamily:F}}>{stratSearch?"No strategies match":"No strategies yet"}</div>
                <div style={{fontSize:10,color:c.tm,fontFamily:F,textAlign:"center",maxWidth:320}}>{stratSearch?"Try adjusting your search.":"Build your first strategy to keep track of your trading rules, instruments, and tags."}</div>
                {!stratSearch?(
                  <div role="button" tabIndex={0} aria-label="Build strategy" onClick={()=>openBuilder()}
                    style={{width:160,height:36,padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"center",gap:7,background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",fontFamily:F,marginTop:4,transition:"filter 0.12s, transform 0.08s",boxSizing:"border-box"}}
                    onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"}
                    onMouseLeave={e=>{e.currentTarget.style.filter="brightness(1)";e.currentTarget.style.transform="scale(1)";}}
                    onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
                    onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}>
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none"><line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
                    <span style={{fontSize:12.5,fontWeight:800,color:"rgba(255,255,255,0.95)",letterSpacing:"0.08em",whiteSpace:"nowrap"}}>Build Strategy</span>
                  </div>
                ):null}
              </div>
            ):(
              stratLayoutMode==="rows"?(
                <StrategyRows items={filteredMine} isMine
                  onEdit={s=>openBuilder(s)}
                  onDelete={id=>deleteStrategyFromBank({id})}
                  onDuplicate={duplicateStrategy}
                  onPerf={s=>setStratPerfStrat(s)}/>
              ):(
                <div style={{width:1288,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,padding:"4px 0 24px"}}>
                  {filteredMine.map(strat=>(
                    <StratCard key={strat.id} strat={strat} isMine
                      onEdit={s=>openBuilder(s)}
                      onDelete={id=>deleteStrategyFromBank({id})}
                      onDuplicate={duplicateStrategy}
                      onPerf={s=>setStratPerfStrat(s)}/>
                  ))}
                </div>
              )
            )
          )}

          {/* SAVED FROM COMMUNITY */}
          {stratTab==="saved"&&(
            savedCommunityStrats.length===0?(
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,height:340}}>
                <svg width={52} height={52} viewBox="0 0 24 24" fill="none" style={{color:c.tm,opacity:0.5}}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.2"/></svg>
                <div style={{fontSize:13,fontWeight:700,color:c.ts,fontFamily:F}}>No saved strategies yet</div>
                <div style={{fontSize:10,color:c.tm,fontFamily:F,textAlign:"center",maxWidth:320}}>Browse the Community tab and save strategies you want to reference later.</div>
                <div role="button" tabIndex={0} aria-label="Browse community strategies" onClick={()=>setStratTab("community")}
                  style={{display:"flex",alignItems:"center",gap:6,height:32,padding:"0 18px",background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",fontFamily:F,marginTop:4,transition:"filter 0.12s, transform 0.08s"}}
                  onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"}
                  onMouseLeave={e=>{e.currentTarget.style.filter="brightness(1)";e.currentTarget.style.transform="scale(1)";}}
                  onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
                  onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}>
                  <span style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.95)",letterSpacing:"0.06em"}}>Browse Community</span>
                </div>
              </div>
            ):filteredSavedCommunity.length===0?(
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,height:340}}>
                <svg width={48} height={48} viewBox="0 0 24 24" fill="none" style={{color:c.tm,opacity:0.5}}><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                <div style={{fontSize:13,fontWeight:700,color:c.ts,fontFamily:F}}>No results</div>
                <div style={{fontSize:10,color:c.tm,fontFamily:F}}>Try adjusting your search.</div>
              </div>
            ):(
              stratLayoutMode==="rows"?(
                <StrategyRows items={filteredSavedCommunity} isMine={false} inSavedTab={true}
                  onRemove={s=>saveCommunity(s)}/>
              ):(
                <div style={{width:1288,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,padding:"4px 0 24px"}}>
                  {filteredSavedCommunity.map(strat=>(
                    <StratCard key={strat.id} strat={strat} isMine={false} inSavedTab={true}
                      onRemove={s=>saveCommunity(s)}/>
                  ))}
                </div>
              )
            )
          )}

          {/* COMMUNITY */}
          {stratTab==="community"&&(
            communityError ? (
              <div style={{width:1288,margin:"0 auto",padding:"12px 0",fontSize:9,fontFamily:F,color:c.rd}}>{communityError}</div>
            ) : communityLoading ? (
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:340,fontSize:11,color:c.tm,fontFamily:F}}>Loading community strategies…</div>
            ) : filteredCommunity.length===0?(
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,height:340}}>
                <svg width={48} height={48} viewBox="0 0 24 24" fill="none" style={{color:c.tm,opacity:0.5}}><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                <div style={{fontSize:13,fontWeight:700,color:c.ts,fontFamily:F}}>No community strategies yet</div>
                <div style={{fontSize:10,color:c.tm,fontFamily:F}}>Published strategies show the author&apos;s Public ID (TLR-########).</div>
              </div>
            ):(
              stratLayoutMode==="rows"?(
                <StrategyRows items={filteredCommunity} isMine={false} showPublicId
                  isSaved={id=>savedCommunityIds.has(id)}
                  onSave={s=>saveCommunity(s)}/>
              ):(
                <div style={{width:1288,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,padding:"4px 0 24px"}}>
                  {filteredCommunity.map(strat=>(
                    <StratCard key={strat.id} strat={strat} isMine={false}
                      isSaved={savedCommunityIds.has(strat.id)}
                      onSave={s=>saveCommunity(s)}/>
                  ))}
                </div>
              )
            )
          )}

        </div>
        </div>
      </div>{/* end body */}

      {/* ─ Strategy card action dropdown ─ */}
      {stratActMenu&&(()=>{
        const ms=stratActMenu.strat;
        if(!ms)return null;
        const isTemplate=!!ms.templatePreview;
        const isCommunityView=!!stratActMenu.inCommunityTab||(isTemplate&&!stratActMenu.isMine);
        const isMineMenu=!!stratActMenu.isMine&&!isTemplate;
        const isSavedMenu=!!stratActMenu.inSavedTab;
        const isSavedNow=savedCommunityIds.has(ms.id);
        const menuW=126;
        const menuH=isMineMenu?158:isCommunityView?52:isSavedMenu?52:104;
        const vpW=window.innerWidth/Z, vpH=window.innerHeight/Z;
        const menuLeft=Math.max(8,Math.min(stratActMenu.x-menuW,vpW-menuW-8));
        const menuTop=Math.max(8,Math.min(stratActMenu.y+2,vpH-menuH-8));
        const closeMenu=()=>setStratActMenu(null);
        const run=fn=>e=>{e.stopPropagation();fn&&fn();closeMenu();};
        const startStrategy=()=>{
          const journalId=typeof ms.id==="number"&&ms.id>0&&!ms.templatePreview?ms.id:undefined;
          if(backtestNewSession){
            backtestNewSession.openNewSession({ strategyId:journalId, strategyName:ms.name||"" });
            return;
          }
          router.push("/dashboard/backtest/");
        };
        const openStrategyDashboard=()=>{
          const journalId=typeof ms.id==="number"&&ms.id>0&&!ms.templatePreview?ms.id:null;
          if(journalId){
            router.push(`/dashboard/?strategy=strategy:${encodeURIComponent(String(journalId))}`);
            return;
          }
          if(ms.name){
            router.push(`/dashboard/?strategy=${encodeURIComponent(ms.name)}`);
            return;
          }
          router.push("/dashboard/");
        };
        const runDuplicateStrategy=()=>{ void duplicateStrategy(ms); };
        const deleteStrategy=()=>deleteStrategyFromBank(ms);
        const communityCopyAction=ms.allowClone === false
          ? {label:"Copy disabled",handler:()=>window.alert("The author disabled copying for this strategy."),col:c.tm,icon:<svg width={14} height={14} viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="13" height="13" stroke="currentColor" strokeWidth="1.7"/><path d="M3 16V3h13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>}
          : {label:"Copy to My Strategies",handler:runDuplicateStrategy,col:c.ts,icon:<svg width={14} height={14} viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="13" height="13" stroke="currentColor" strokeWidth="1.7"/><path d="M3 16V3h13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>};
        const actions=isMineMenu?[
          {label:"New Session",handler:startStrategy,col:c.acL,icon:<svg width={14} height={14} viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>},
          {label:"Dashboard",handler:openStrategyDashboard,col:c.ts,icon:<svg width={14} height={14} viewBox="0 0 20 20" fill="none"><rect x="1" y="1" width="8" height="8" fill="currentColor"/><rect x="11" y="1" width="8" height="8" fill="currentColor"/><rect x="1" y="11" width="8" height="8" fill="currentColor"/><rect x="11" y="11" width="8" height="8" fill="currentColor"/></svg>},
          {label:"divider"},
          {label:"Edit",handler:()=>openBuilder(ms),col:c.ts,icon:<svg width={14} height={14} viewBox="0 0 24 24" fill="none"><path d="M4 20h4l11-11-4-4L4 16v4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>},
          {label:"Share to Community",handler:()=>openShareToCommunity(ms),col:c.gold,icon:<svg width={14} height={14} viewBox="0 0 24 24" fill="none"><circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.8"/><circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/><circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>},
          {label:"Copy",handler:runDuplicateStrategy,col:c.ts,icon:<svg width={14} height={14} viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="13" height="13" stroke="currentColor" strokeWidth="1.7"/><path d="M3 16V3h13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>},
          {label:"Delete",handler:deleteStrategy,col:c.rd,danger:true,icon:<svg width={14} height={14} viewBox="0 0 24 24" fill="none"><polyline points="3,6 5,6 21,6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M19,6l-1,14H6L5,6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M10,11v6M14,11v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M9,6V4h6v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>},
        ]:isCommunityView?[
          communityCopyAction,
          {label:isSavedNow?"Saved":"Save",handler:()=>saveCommunity(ms),col:isSavedNow?c.acL:c.ts,icon:<svg width={14} height={14} viewBox="0 0 24 24" fill={isSavedNow?c.acL:"none"}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.7"/></svg>},
        ]:isSavedMenu?[
            {label:"Remove",handler:()=>saveCommunity(ms),col:c.rd,danger:true,icon:<svg width={14} height={14} viewBox="0 0 24 24" fill="none"><polyline points="3,6 5,6 21,6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M19,6l-1,14H6L5,6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M10,11v6M14,11v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M9,6V4h6v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>},
        ]:[communityCopyAction],
        ];
        return(<>
          <div style={{position:"fixed",inset:0,zIndex:100000}} onClick={e=>{e.stopPropagation();closeMenu();}}/>
          <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:menuTop,left:menuLeft,zIndex:100001,width:menuW,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:"0 12px 40px rgba(0,0,0,0.8)",fontFamily:F}}>
            <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
            {actions.map(({label,handler,col,danger,icon})=>{
              if(label==="divider")return <div key="div" style={{height:1,background:c.br,margin:"2px 0"}}/>;
              return(
                <div key={label} onClick={run(handler)}
                  style={{position:"relative",padding:"7px 9px",fontSize:10,fontWeight:650,color:col,cursor:"default",transition:"background 0.1s, transform 0.08s",display:"flex",alignItems:"center",gap:7,fontFamily:F}}
                  onMouseEnter={e=>{e.currentTarget.style.background=danger?"rgba(255,80,104,0.09)":"rgba(255,255,255,0.04)";const s=e.currentTarget.querySelector(".sam-stripe");if(s)s.style.opacity="1";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.transform="translateY(0)";const s=e.currentTarget.querySelector(".sam-stripe");if(s)s.style.opacity="0";}}
                  onMouseDown={e=>{e.currentTarget.style.transform="translateY(1px)";}}
                  onMouseUp={e=>{e.currentTarget.style.transform="translateY(0)";}}>
                  <div className="sam-stripe" style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,opacity:0,background:`linear-gradient(180deg,transparent,${col},transparent)`,transition:"opacity 0.1s"}}/>
                  <span style={{flexShrink:0,display:"flex"}}>{icon}</span>
                  {label}
                </div>
              );
            })}
          </div>
        </>);
      })()}

      {/* ─ Pre-builder Template Picker ─ */}
      <TemplatePickerModal open={stratTemplatePickerOpen} c={c} F={F} hasExistingGroups={false}
        onPick={(tpl)=>{
          setStratTemplatePickerOpen(false);
          if (tpl) {
            setCanvasNodes(buildNodesFromTemplate(tpl));
            setCanvasEdges([]);
            if (!stratBName || !stratBName.trim()) setStratBName(`${tpl.name} (my version)`);
            if (tpl.description) setStratBDesc(tpl.description);
            if (tpl.markets && tpl.markets.length) setStratBMarkets(tpl.markets);
            if (tpl.timeframes && tpl.timeframes.length) setStratBTimeframes(tpl.timeframes);
            if (tpl.tags && tpl.tags.length) setStratBTags(tpl.tags);
          } else {
            setCanvasNodes(buildInitialSections());
            setCanvasEdges([]);
          }
          setStratBuilderOpen(true);
        }}
        onCancel={()=>setStratTemplatePickerOpen(false)}/>

      {/* ─ Strategy Builder Canvas ─ */}
      {stratBuilderOpen&&(
        <StrategyBuilderModal
          c={c} F={F}
          stratWizardStep={stratWizardStep} setStratWizardStep={setStratWizardStep}
          stratBName={stratBName} setStratBName={setStratBName}
          stratBDesc={stratBDesc} setStratBDesc={setStratBDesc}
          stratBStyle={stratBStyle} setStratBStyle={setStratBStyle}
          stratBDirection={stratBDirection} setStratBDirection={setStratBDirection}
          stratBComplexity={stratBComplexity} setStratBComplexity={setStratBComplexity}
          stratBMarkets={stratBMarkets} setStratBMarkets={setStratBMarkets}
          stratBTimeframes={stratBTimeframes} setStratBTimeframes={setStratBTimeframes}
          stratBInstruments={stratBInstruments} setStratBInstruments={setStratBInstruments}
          stratBTags={stratBTags} setStratBTags={setStratBTags}
          stratBVariables={stratBVariables} setStratBVariables={setStratBVariables}
          stratBImages={stratBImages} setStratBImages={setStratBImages}
          stratBSupportInst={stratBSupportInst} setStratBSupportInst={setStratBSupportInst}
          stratBLogoEmoji={stratBLogoEmoji} setStratBLogoEmoji={setStratBLogoEmoji}
          canvasNodes={canvasNodes} setCanvasNodes={setCanvasNodes}
          canvasEdges={canvasEdges} setCanvasEdges={setCanvasEdges}
          canvasMiniMap={canvasMiniMap} setCanvasMiniMap={setCanvasMiniMap}
          canvasPaletteCollapsed={canvasPaletteCollapsed} setCanvasPaletteCollapsed={setCanvasPaletteCollapsed}
          canvasInspectorCollapsed={canvasInspectorCollapsed} setCanvasInspectorCollapsed={setCanvasInspectorCollapsed}
          stratEditId={stratEditId}
          sessions={strategyReviewSessions}
          builderSavePhase={stratBuilderSavePhase}
          builderSaveProgress={stratBuilderSaveProgress}
          onSave={saveBuilder}
          onClose={()=>{ if (!stratBuilderSaveInFlightRef.current) { setStratBuilderOpen(false); setStratEditId(null); } }}
          onOpenTemplates={()=>setStratTemplatePickerOpen(true)}
        />
      )}

      {/* ─ Performance Dashboard Overlay ─ */}
      {stratPerfStrat&&(
        <div style={{position:"fixed",inset:0,zIndex:100001,background:"rgba(4,5,15,0.85)",display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={e=>{if(e.target===e.currentTarget)setStratPerfStrat(null);}}>
          <div style={{width:"min(700px,94vw)",maxHeight:"85vh",background:c.el,border:`1px solid ${c.brH}`,boxShadow:"0 24px 60px rgba(0,0,0,0.75)",display:"flex",flexDirection:"column",overflowY:"auto"}} className="tlr-scroll" onClick={e=>e.stopPropagation()}>
            <div style={{height:52,flexShrink:0,display:"flex",alignItems:"center",gap:12,padding:"0 20px",borderBottom:`1px solid ${c.brH}`}}>
              <div style={{width:36,height:36,borderRadius:4,background:"rgba(74,106,255,0.18)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{color:c.acL}}><path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:800,color:c.tx,fontFamily:F}}>{stratPerfStrat.name}</div>
                <div style={{fontSize:8,fontWeight:600,color:c.tm,fontFamily:F}}>Strategy performance · journal trades linked to this strategy</div>
              </div>
              <div onClick={()=>setStratPerfStrat(null)} style={{width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",cursor:"default",color:c.tm,fontSize:16,transition:"color 0.12s"}}
                onMouseEnter={e=>e.currentTarget.style.color=c.tx} onMouseLeave={e=>e.currentTarget.style.color=c.tm}>×</div>
            </div>
            <div style={{padding:"24px 20px"}}>
              {/* 6 metric tiles */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
                {[
                  {l:"Total Trades",v:"0",sub:"Closed trades linked to this strategy",accent:c.acL,bg:"rgba(74,106,255,0.07)"},
                  {l:"Win Rate",v:"—",sub:"Winning trades ÷ total",accent:"#06B6D4",bg:"rgba(6,182,212,0.07)"},
                  {l:"Total P&L",v:"—",sub:"Sum of P&L on linked trades",accent:c.gn,bg:"rgba(0,212,161,0.07)"},
                  {l:"Profit Factor",v:"—",sub:"Gross profit ÷ gross loss",accent:"#A855F7",bg:"rgba(168,85,247,0.07)"},
                  {l:"Avg Win",v:"—",sub:"Average of winning trades",accent:c.gn,bg:"rgba(0,212,161,0.06)"},
                  {l:"Avg Loss",v:"—",sub:"Average of losing trades",accent:c.rd,bg:"rgba(255,80,104,0.07)"},
                ].map(({l,v,sub,accent,bg})=>(
                  <div key={l} style={{padding:"14px 16px",border:`1px solid ${accent}33`,background:bg}}>
                    <div style={{fontSize:7,fontWeight:800,color:c.tm,textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:F,marginBottom:8}}>{l}</div>
                    <div style={{fontSize:22,fontWeight:800,color:c.tx,fontFamily:F,fontVariantNumeric:"tabular-nums",marginBottom:5}}>{v}</div>
                    <div style={{fontSize:7,fontWeight:500,color:c.tm,fontFamily:F}}>{sub}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:"20px 0",border:`1px dashed ${c.br}`,background:"rgba(255,255,255,0.01)"}}>
                <svg width={40} height={40} viewBox="0 0 24 24" fill="none" style={{color:c.tm,opacity:0.5}}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.2"/><path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                <div style={{fontSize:11,fontWeight:700,color:c.ts,fontFamily:F}}>No trades yet</div>
                <div style={{fontSize:9,fontWeight:500,color:c.tm,fontFamily:F,textAlign:"center",maxWidth:320}}>Tag journal trades with this strategy. When trades exist, win rate, P&L, and profit factor will populate here.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─ Share to Community Modal ─ */}
      {stratShareStrat&&(
        <div style={{position:"fixed",inset:0,zIndex:100002,background:"rgba(4,5,15,0.88)",display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={e=>{if(e.target===e.currentTarget)setStratShareStrat(null);}}>
          <div style={{width:"min(480px,92vw)",background:c.el,border:`1px solid ${c.brH}`,boxShadow:"0 20px 60px rgba(0,0,0,0.75)",display:"flex",flexDirection:"column",overflow:"hidden"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{height:48,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 18px",borderBottom:`1px solid ${c.brH}`}}>
              <div style={{fontSize:11,fontWeight:800,color:c.tx,fontFamily:F}}>Share to Community</div>
              <div onClick={()=>setStratShareStrat(null)} style={{width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",cursor:"default",color:c.tm,fontSize:16,transition:"color 0.12s"}}
                onMouseEnter={e=>e.currentTarget.style.color=c.tx} onMouseLeave={e=>e.currentTarget.style.color=c.tm}>×</div>
            </div>
            <div style={{padding:"18px"}}>
              <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:18}}>
                <div style={{width:42,height:42,background:"rgba(201,168,76,0.12)",border:`1px solid ${c.gold}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" style={{color:c.gold}}><circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.8"/><circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/><circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:c.tx,fontFamily:F,marginBottom:3}}>{stratShareStrat.name}</div>
                  <div style={{fontSize:8,fontWeight:600,color:c.tm,fontFamily:F}}>{stratShareStrat.style} · {stratShareStrat.complexity}</div>
                </div>
              </div>
              <div style={{fontSize:8,fontWeight:800,color:c.tm,textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:F,marginBottom:8}}>What to show publicly</div>
              <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
                {[
                  ["include_description","Description","Strategy summary text"],
                  ["include_strategy_details","Strategy details","Markets, timeframes, tags, style"],
                  ["include_conditions","Conditions & checklist","Decision tree / builder logic"],
                  ["include_variables","Trade tags","Pre/post-trade tag definitions"],
                  ["include_backtest_stats","Backtest results","Win rate, P&L, trades from your latest backtest session"],
                ].map(([key,l,sub])=>{
                  const on=!!stratShareOpts[key];
                  return(
                    <div key={key} role="button" tabIndex={0} onClick={()=>toggleShareOpt(key)}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:on?"rgba(74,106,255,0.06)":"rgba(255,255,255,0.02)",border:`1px solid ${on?c.acB:c.brH}`,cursor:"default"}}>
                      <div style={{width:14,height:14,border:`1px solid ${on?c.acL:c.br}`,background:on?c.acD:"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        {on?<svg width={8} height={8} viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke={c.acL} strokeWidth="1.5" strokeLinecap="round"/></svg>:null}
                      </div>
                      <div>
                        <div style={{fontSize:9,fontWeight:700,color:c.ts,fontFamily:F}}>{l}</div>
                        <div style={{fontSize:7,fontWeight:500,color:c.tm,fontFamily:F}}>{sub}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{fontSize:8,fontWeight:800,color:c.tm,textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:F,marginBottom:8}}>Permissions</div>
              <div role="button" tabIndex={0} onClick={()=>toggleShareOpt("allow_clone")}
                style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",marginBottom:12,background:stratShareOpts.allow_clone?"rgba(74,106,255,0.06)":"rgba(255,255,255,0.02)",border:`1px solid ${stratShareOpts.allow_clone?c.acB:c.brH}`,cursor:"default"}}>
                <div style={{width:14,height:14,border:`1px solid ${stratShareOpts.allow_clone?c.acL:c.br}`,background:stratShareOpts.allow_clone?c.acD:"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {stratShareOpts.allow_clone?<svg width={8} height={8} viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke={c.acL} strokeWidth="1.5" strokeLinecap="round"/></svg>:null}
                </div>
                <div>
                  <div style={{fontSize:9,fontWeight:700,color:c.ts,fontFamily:F}}>Allow others to copy</div>
                  <div style={{fontSize:7,fontWeight:500,color:c.tm,fontFamily:F}}>When off, members can view only — no duplicate into their bank</div>
                </div>
              </div>
              {stratShareOpts.include_backtest_stats ? (()=>{
                const sess=pickBestBacktestSession(stratShareStrat?.backtestSessions);
                return sess ? (
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:12,padding:"8px 10px",background:"rgba(255,255,255,0.03)",border:`1px solid ${c.brH}`}}>
                    <div style={{fontSize:8,fontWeight:600,color:c.tm,fontFamily:F,lineHeight:1.5}}>
                      Backtest: <span style={{color:c.ts}}>{sess.name}</span>
                      {sess.trades!=null?` · ${sess.trades} trades`:null}
                    </div>
                    <RollbackBadge allowed={!!sess.rollbackAllowed} compact />
                  </div>
                ) : (
                  <div style={{fontSize:8,color:c.tm,fontFamily:F,marginBottom:12}}>No backtest session linked yet — run a backtest to show results & rollback badge.</div>
                );
              })() : null}
              <div style={{fontSize:8,fontWeight:500,color:c.tm,fontFamily:F,marginBottom:10,lineHeight:1.6}}>Published immediately to Community for all members with access. Your Public ID is shown on the listing.</div>
              {myPublicId ? (
                <div style={{fontSize:9,fontWeight:700,color:c.ts,fontFamily:F,marginBottom:12,padding:"8px 10px",background:"rgba(74,106,255,0.08)",border:`1px solid ${c.brH}`}}>
                  Your Public ID: <span style={{color:c.acL}}>{myPublicId}</span>
                </div>
              ) : null}
              {stratShareErr ? (
                <div style={{fontSize:9,color:c.rd,fontFamily:F,marginBottom:10}}>{stratShareErr}</div>
              ) : null}
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <div onClick={()=>{if(!stratShareBusy){setStratShareStrat(null);setStratShareErr(null);}}}
                  style={{height:32,padding:"0 16px",display:"flex",alignItems:"center",fontSize:9,fontWeight:700,color:c.ts,border:`1px solid ${c.br}`,cursor:"default",fontFamily:F,transition:"all 0.12s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=c.brH;e.currentTarget.style.color=c.tx;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=c.br;e.currentTarget.style.color=c.ts;}}>
                  Cancel
                </div>
                <div onClick={()=>{
                  if(stratShareBusy) return;
                  const sid = typeof stratShareStrat?.id === "number" ? stratShareStrat.id : Number(stratShareStrat?.id);
                  if(!Number.isFinite(sid) || sid <= 0){
                    setStratShareErr("Save this strategy first, then share it to Community.");
                    return;
                  }
                  setStratShareBusy(true);
                  setStratShareErr(null);
                  const sess=pickBestBacktestSession(stratShareStrat?.backtestSessions);
                  const payload={
                    ...stratShareOpts,
                    backtest_snapshot:stratShareOpts.include_backtest_stats
                      ? buildBacktestSnapshotFromSession(sess)
                      : null,
                  };
                  void submitStrategyToCommunity(sid, payload)
                    .then(()=>{ setStratShareStrat(null); setStratTab("community"); })
                    .catch(err=>{ setStratShareErr(err instanceof Error ? err.message : "Could not post to community"); })
                    .finally(()=>{ setStratShareBusy(false); });
                }}
                  style={{height:32,padding:"0 20px",display:"flex",alignItems:"center",gap:6,fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.95)",background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",fontFamily:F,letterSpacing:"0.05em",transition:"filter 0.12s",opacity:stratShareBusy?0.65:1}}
                  onMouseEnter={e=>{if(!stratShareBusy)e.currentTarget.style.filter="brightness(1.12)";}}
                  onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none"><circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  {stratShareBusy ? "Posting…" : "Post to Community"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}



    </div>
  );

}
