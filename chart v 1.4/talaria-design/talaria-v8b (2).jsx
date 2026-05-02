import { useState } from "react";

const TalariaV8b = () => {
  const [tool, setTool] = useState("trendline");
  const [hov, setHov] = useState(null);
  const [dropdown, setDropdown] = useState("trendline");
  const [toolPinned, setToolPinned] = useState(["Trend Line","Horizontal Line","Fib Retracement","Rectangle","Text"]); // start open so user can see it
  const [dialog, setDialog] = useState(false);
  const [dlgTab, setDlgTab] = useState("style");
  const [tickCandle, setTickCandle] = useState("candle");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const [buySell, setBuySell] = useState("buy");
  const [orderType, setOrderType] = useState("market");
  const [btmTab, setBtmTab] = useState("positions");
  const [tf, setTf] = useState("1m");
  const [sizeMode, setSizeMode] = useState("$");
  const [advOpen, setAdvOpen] = useState(true);
  const [advMode, setAdvMode] = useState("breakeven");
  const [logoMenu, setLogoMenu] = useState(false);
  const [replayOpts, setReplayOpts] = useState(false);
  const [replayMode, setReplayMode] = useState("candle");
  const [rollback, setRollback] = useState(true);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoTab, setGotoTab] = useState("pinned");
  const [gotoItems, setGotoItems] = useState([
    {id:1,type:"datetime",label:"09 Jan 2009 07:00",pinned:true},
    {id:2,type:"daily",label:"NY Open",time:"08:00",pinned:true},
    {id:3,type:"daily",label:"London Open",time:"02:00",pinned:false},
    {id:4,type:"price",label:"126.500",pinned:true},
    {id:5,type:"daily",label:"Asian Open",time:"19:00",pinned:false},
  ]);
  const [ddPos, setDdPos] = useState({ top: 60, left: 40 }); // position for dropdown
  const [symbolOpen, setSymbolOpen] = useState(false);
  const [symbol, setSymbol] = useState("EUR/JPY");
  const [symbolSearch, setSymbolSearch] = useState("");
  const [chartTypeOpen, setChartTypeOpen] = useState(false);
  const [chartType, setChartType] = useState("candles");
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState("account");
  const [profileLang, setProfileLang] = useState("english");
  const [profileCat, setProfileCat] = useState("account");
  const [profilePos, setProfilePos] = useState({ x: 0, y: 0 });
  const [darkMode, setDarkMode] = useState(true);
  const [faqOpen, setFaqOpen] = useState(false);
  const [faqCat, setFaqCat] = useState("faq");
  const [faqPos, setFaqPos] = useState({ x: 0, y: 0 });
  const [faqExpand, setFaqExpand] = useState(null);
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [orderPanelOpen, setOrderPanelOpen] = useState(true);
  const [rightPanel, setRightPanel] = useState(null);
  const [screenshotPos, setScreenshotPos] = useState({ x: 0, y: 0 });
  const [layersOpen, setLayersOpen] = useState(false);
  const [layersPos, setLayersPos] = useState({ x: 0, y: 0 });
  const [layersCat, setLayersCat] = useState("drawings");
  const [newsOpen, setNewsOpen] = useState(false);
  const [newsPos, setNewsPos] = useState({ x: 0, y: 0 });
  const [newsTab, setNewsTab] = useState("upcoming");
  const [newsSearch, setNewsSearch] = useState("");
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [layoutPos, setLayoutPos] = useState({ x: 0, y: 0 });
  const [layoutPanels, setLayoutPanels] = useState({n:1,li:0});
  const [layoutSync, setLayoutSync] = useState({ crosshair: true, time: true, drawings: true, symbol: false, interval: false, dateRange: false, indicators: false, chartType: false });
  const [settingsTab, setSettingsTab] = useState("chart");
  const [sDrop, setSDrop] = useState(null); // which settings dropdown is open
  const [colorPicker, setColorPicker] = useState(null);
  const [cpPos, setCpPos] = useState({ top: 300, left: 500 }); // {key, x, y} for which color is being edited
  const [settings, setSettings] = useState({
    theme: "Talaria Dark", chartType: "candlestick", precision: "0.00000", timezone: "UTC",
    textColor: "#8CA0FF", background: "#07080E", gridLines: "None", crosshairStyle: "Dashed", crosshairThickness: 1.5, gridColor: "rgba(140,160,255,0.15)", crosshairColor: "rgba(255,255,255,0.4)",
    priceLine: true, priceLineColor: "#FF5068",
    scaleTextColor: "rgba(255,255,255,0.25)", scaleLineColor: "rgba(140,160,255,0.12)",
    bullBody: "#00D4A1", bullBorder: "#00D4A1", bullWick: "#00D4A1",
    bearBody: "#FF5068", bearBorder: "#FF5068", bearWick: "#FF5068", unifiedBarColor: true, unifiedBarColorVal: "#00D4A1",
    orderPlacement: "instant", showOrderHistory: true, showOpenOrders: true, timeFormat: "24h",
  });

  const c = {
    ac: "#2643F7", acL: "#4A6AFF", acD: "rgba(38,67,247,0.08)", acB: "rgba(38,67,247,0.22)", acG: "rgba(38,67,247,0.12)",
    gold: "#C9A84C",
    bg: "#07080E", sf: "#0A0C14", el: "#0F1119", well: "#060710",
    br: "rgba(140,160,255,0.05)", brL: "rgba(140,160,255,0.08)", brH: "rgba(140,160,255,0.12)",
    tx: "rgba(255,255,255,0.88)", ts: "rgba(255,255,255,0.55)", tm: "rgba(255,255,255,0.30)",
    gn: "#00D4A1", gnD: "rgba(0,212,161,0.07)", gnB: "rgba(0,212,161,0.18)",
    rd: "#FF5068", rdD: "rgba(255,80,104,0.07)", rdB: "rgba(255,80,104,0.18)",
    axTx: "rgba(255,255,255,0.25)", grid: "rgba(140,160,255,0.025)",
  };
  const F = "'Exo 2',sans-serif";

  const catColors = {trend:c.acL, momentum:"#E8820A", volatility:"#C9A84C", volume:c.gn, sessions:"#FF5068", others:c.ts};
  const updateSetting = (key, val) => setSettings(prev => ({...prev, [key]: val}));
  const indicatorData = [
    {id:"SMA",name:"Simple Moving Average",abbr:"SMA",cat:"trend",desc:"Average over N periods"},
    {id:"EMA",name:"Exponential Moving Average",abbr:"EMA",cat:"trend",desc:"Weighted recent average"},
    {id:"BB",name:"Bollinger Bands",abbr:"BB",cat:"volatility",desc:"Std deviation bands"},
    {id:"RSI",name:"Relative Strength Index",abbr:"RSI",cat:"momentum",desc:"Overbought/oversold"},
    {id:"MACD",name:"MACD",abbr:"MACD",cat:"momentum",desc:"Trend momentum"},
    {id:"ATR",name:"Average True Range",abbr:"ATR",cat:"volatility",desc:"Volatility measure"},
    {id:"VWAP",name:"VWAP",abbr:"VWAP",cat:"volume",desc:"Volume weighted avg"},
    {id:"STOCH",name:"Stochastic",abbr:"STOCH",cat:"momentum",desc:"Momentum oscillator"},
    {id:"OBV",name:"On Balance Volume",abbr:"OBV",cat:"volume",desc:"Volume flow"},
    {id:"PIVOT",name:"Pivot Points",abbr:"PIVOT",cat:"others",desc:"S/R levels"},
    {id:"SESS",name:"Session Boxes",abbr:"SESS",cat:"sessions",desc:"Session highlights"},
  ];

  const indFiltered = indicatorData
    .filter(i => indCat === "all" ? true : indCat === "pinned" ? indPinned.includes(i.id) : indCat === "active" ? indActive.includes(i.id) : i.cat === indCat)
    .filter(i => i.name.toLowerCase().includes(indSearch.toLowerCase()) || i.abbr.toLowerCase().includes(indSearch.toLowerCase()));

  const I = ({ n, s = 17, cl = "currentColor", w = 1.5 }) => {
    const p = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: cl, strokeWidth: w, strokeLinecap: "round", strokeLinejoin: "round" };
    const icons = {
      crosshair: <svg {...p}><circle cx="12" cy="12" r="7"/><line x1="12" y1="3" x2="12" y2="7"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="3" y1="12" x2="7" y2="12"/><line x1="17" y1="12" x2="21" y2="12"/></svg>,
      trendline: <svg {...p}><line x1="5" y1="19" x2="19" y2="5"/><circle cx="5" cy="19" r="1.5" fill={cl} stroke="none"/><circle cx="19" cy="5" r="1.5" fill={cl} stroke="none"/></svg>,
      hline: <svg {...p}><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="10" x2="3" y2="14"/><line x1="21" y1="10" x2="21" y2="14"/></svg>,
      channel: <svg {...p}><line x1="4" y1="17" x2="20" y2="7"/><line x1="4" y1="21" x2="20" y2="11"/></svg>,
      fib: <svg {...p}><line x1="4" y1="4" x2="20" y2="4"/><line x1="4" y1="9.5" x2="20" y2="9.5"/><line x1="4" y1="14" x2="20" y2="14"/><line x1="4" y1="20" x2="20" y2="20"/></svg>,
      rect: <svg {...p}><rect x="4" y="6" width="16" height="12" rx="1"/></svg>,
      text: <svg {...p}><polyline points="5 7 5 4 19 4 19 7"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="9" y1="20" x2="15" y2="20"/></svg>,
      brush: <svg {...p}><path d="M18 4L10 12"/><path d="M10 12C8 14 6 14 4 16C3 17 4 20 6 20C8 20 9 18 10 16C11 14 12 12 10 12Z"/></svg>,
      pattern: <svg {...p}><polyline points="4 18 8 10 12 14 16 6 20 12"/></svg>,
      indicator: <svg {...p}><path d="M3 18L7 12L11 15L15 7L21 11"/><circle cx="7" cy="12" r="1.5" fill={cl} stroke="none"/><circle cx="15" cy="7" r="1.5" fill={cl} stroke="none"/></svg>,
      eye: <svg {...p}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>,
      palette: <svg {...p}><circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="1.5" fill={cl} stroke="none"/><circle cx="15" cy="9" r="1.5" fill={cl} stroke="none"/><circle cx="8" cy="13.5" r="1.5" fill={cl} stroke="none"/></svg>,
      trash: <svg {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
      undo: <svg {...p}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
      redo: <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>,
      magnet: <svg {...p}><path d="M6 2v6a6 6 0 0 0 12 0V2"/></svg>,
      lock: <svg {...p}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>,
      measure: <svg {...p}><path d="M4 20L20 4"/><path d="M4 20l3.5-1-2.5-2.5z" fill={cl} stroke="none"/><path d="M20 4l-3.5 1 2.5 2.5z" fill={cl} stroke="none"/></svg>,
      play: <svg width={s} height={s} viewBox="0 0 24 24" fill={cl} stroke="none"><polygon points="7,4 20,12 7,20"/></svg>,
      pause: <svg width={s} height={s} viewBox="0 0 24 24" fill={cl} stroke="none"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>,
      skipBack: <svg width={s} height={s} viewBox="0 0 24 24" fill={cl} stroke="none"><polygon points="12,5 3,12 12,19"/><rect x="1" y="5" width="2" height="14"/></svg>,
      skipFwd: <svg width={s} height={s} viewBox="0 0 24 24" fill={cl} stroke="none"><polygon points="12,5 21,12 12,19"/><rect x="21" y="5" width="2" height="14"/></svg>,
      stepBack: <svg {...p}><polyline points="15 18 9 12 15 6"/></svg>,
      stepFwd: <svg {...p}><polyline points="9 6 15 12 9 18"/></svg>,
      settings: <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>,
      plus: <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
      minus: <svg {...p}><line x1="5" y1="12" x2="19" y2="12"/></svg>,
      x: <svg {...p}><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>,
      check: <svg {...p} strokeWidth={2}><polyline points="4 12 9 17 20 6"/></svg>,
      chevDown: <svg {...p}><polyline points="6 9 12 15 18 9"/></svg>,
      chevRight: <svg {...p} strokeWidth={2}><polyline points="9 6 15 12 9 18"/></svg>,
      user: <svg {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 12 0v1"/></svg>,
      tree: <svg {...p}><line x1="6" y1="3" x2="6" y2="21"/><line x1="6" y1="6" x2="18" y2="6"/><line x1="6" y1="12" x2="15" y2="12"/><line x1="6" y1="18" x2="12" y2="18"/></svg>,
      news: <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="14" y2="12"/><line x1="7" y1="16" x2="11" y2="16"/></svg>,
      config: <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="9 10 12 13 15 10"/></svg>,
      goto: <svg {...p}><circle cx="12" cy="12" r="9"/><polyline points="12 8 12 12 15 14"/></svg>,
      rollback: <svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 2 3 8 9 8"/></svg>,
      hray: <svg {...p}><line x1="3" y1="12" x2="21" y2="12"/><polyline points="17 8 21 12 17 16"/></svg>,
      vline: <svg {...p}><line x1="12" y1="3" x2="12" y2="21"/></svg>,
      polyline: <svg {...p}><polyline points="4 18 8 10 14 14 20 6"/></svg>,
      candle: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth={w} strokeLinecap="round"><line x1="8" y1="2" x2="8" y2="6"/><rect x="5" y="6" width="6" height="7" fill={cl} rx="0.5"/><line x1="8" y1="13" x2="8" y2="17"/><line x1="17" y1="7" x2="17" y2="11"/><rect x="14" y="11" width="6" height="5" rx="0.5"/><line x1="17" y1="16" x2="17" y2="22"/></svg>,
      tick: <svg {...p}><line x1="4" y1="12" x2="8" y2="12"/><line x1="8" y1="8" x2="12" y2="8"/><line x1="12" y1="15" x2="16" y2="15"/><line x1="16" y1="10" x2="20" y2="10"/></svg>,
      expand: <svg {...p}><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>,
      bell: <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg>,
      link: <svg {...p}><path d="M15 7h3a5 5 0 0 1 0 10h-3m-6 0H6A5 5 0 0 1 6 7h3"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
      layout: <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="12" y1="9" x2="12" y2="21"/></svg>,
      screenshot: <svg {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
      help: <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M9.5 9a3 3 0 0 1 5 1c0 2-3 2.5-3 4.5"/><circle cx="12" cy="17.5" r="0.5" fill={cl} stroke="none"/></svg>,
      hollowCandle: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth={w} strokeLinecap="round"><line x1="8" y1="2" x2="8" y2="6"/><rect x="5" y="6" width="6" height="7" rx="0.5"/><line x1="8" y1="13" x2="8" y2="17"/><line x1="17" y1="7" x2="17" y2="11"/><rect x="14" y="11" width="6" height="5" rx="0.5"/><line x1="17" y1="16" x2="17" y2="22"/></svg>,
      heikinAshi: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth={w} strokeLinecap="round"><line x1="7" y1="3" x2="7" y2="7"/><rect x="4.5" y="7" width="5" height="6" fill={cl} rx="0.5"/><line x1="7" y1="13" x2="7" y2="15"/><line x1="17" y1="9" x2="17" y2="12"/><rect x="14.5" y="12" width="5" height="5" fill={cl} rx="0.5"/><line x1="17" y1="17" x2="17" y2="21"/></svg>,
      bars: <svg {...p}><line x1="6" y1="4" x2="6" y2="16"/><line x1="3" y1="7" x2="6" y2="7"/><line x1="6" y1="13" x2="9" y2="13"/><line x1="13" y1="8" x2="13" y2="20"/><line x1="10" y1="11" x2="13" y2="11"/><line x1="13" y1="17" x2="16" y2="17"/><line x1="20" y1="5" x2="20" y2="17"/><line x1="17" y1="8" x2="20" y2="8"/><line x1="20" y1="14" x2="23" y2="14"/></svg>,
      lineChart: <svg {...p}><polyline points="3 17 8 11 13 14 18 7 22 10"/></svg>,
      area: <svg {...p}><path d="M3 20 L3 17 L8 11 L13 14 L18 7 L22 10 L22 20 Z" fill={cl} opacity="0.15"/><polyline points="3 17 8 11 13 14 18 7 22 10"/></svg>,
      baseline: <svg {...p}><line x1="2" y1="14" x2="22" y2="14" strokeDasharray="2 2" opacity="0.4"/><polyline points="3 12 7 8 11 11 15 6 19 10 22 12"/><polyline points="3 16 7 19 11 17 15 20 19 18 22 16"/></svg>,
      search: <svg {...p}><circle cx="10" cy="10" r="7"/><line x1="15" y1="15" x2="21" y2="21"/></svg>,
      star: <svg {...p}><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>,
      starFill: <svg width={s} height={s} viewBox="0 0 24 24" fill={cl} stroke="none"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>,
      pin: <svg {...p}><path d="M12 2L12 5"/><path d="M7 5H17L15.5 11H8.5L7 5Z"/><path d="M9 11L7 14"/><path d="M15 11L17 14"/><path d="M12 11V22"/></svg>,
      pinFill: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L12 5" stroke={cl} strokeWidth={w}/><path d="M7 5H17L15.5 11H8.5L7 5Z" fill={cl} stroke={cl} strokeWidth={w}/><path d="M9 11L7 14" stroke={cl} strokeWidth={w}/><path d="M15 11L17 14" stroke={cl} strokeWidth={w}/><path d="M12 11V22" stroke={cl} strokeWidth={w}/></svg>,
    };
    return icons[n] || null;
  };

  // Button component
  const B = ({ children, onClick, primary, small, sx = {} }) => (
    <button onClick={onClick} style={{ padding: small ? "3px 8px" : "5px 14px", background: primary ? `linear-gradient(135deg,${c.ac},${c.acL})` : c.well, border: primary ? "none" : `1px solid ${c.br}`, color: primary ? "#fff" : c.ts, fontSize: small ? 8 : 10, fontWeight: primary ? 800 : 600, fontFamily: F, cursor: "pointer", boxShadow: primary ? `0 2px 8px ${c.acG}` : "inset 0 1px 2px rgba(0,0,0,0.2)", ...sx }}>{children}</button>
  );

  const Sel = ({ children, w }) => (
    <select style={{ background: c.well, border: `1px solid ${c.br}`, color: c.tx, padding: "3px 6px", fontSize: 9, fontFamily: F, outline: "none", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)", width: w }}>{children}</select>
  );

  const Toggle = ({ on, onClick, color }) => {
    const tC = color || c.acL;
    return <div onClick={onClick} style={{ width: 28, height: 14, borderRadius: 7, background: on ? `${tC}33` : c.well, border: `1px solid ${on ? tC+"66" : c.br}`, position: "relative", cursor: "pointer", transition: "all 0.15s ease" }}><div style={{ width: 10, height: 10, borderRadius: 5, background: on ? tC : c.ts, position: "absolute", top: 1.5, left: on ? 15 : 2, transition: "all 0.15s ease" }}/></div>;
  };

  const MiniIn = ({ val, w = 36, pre }) => (
    <div style={{ display: "inline-flex", alignItems: "center", background: c.well, border: `1px solid ${c.br}`, padding: "2px 4px", width: w }}>
      {pre && <span style={{ color: c.tm, fontSize: 8, marginRight: 2 }}>{pre}</span>}
      <span style={{ flex: 1, textAlign: "right", fontSize: 9, fontWeight: 700, fontFamily: F, fontVariantNumeric: "tabular-nums" }}>{val}</span>
    </div>
  );

  // Tool definitions - reorganized by function
  const toolGroups = [
    // Group 1 - Cursor
    [{ id: "crosshair", icon: "crosshair", label: "Cursor", dd: [
      {h:"CURSOR"},{icon:"crosshair",label:"Cross"},{icon:"crosshair",label:"Dot"},{icon:"crosshair",label:"Arrow"},{icon:"brush",label:"Eraser"}
    ]}],
    // Group 2 - Brushes
    [{ id: "brush2", icon: "brush", label: "Brushes", dd: [
      {h:"BRUSHES"},{icon:"brush",label:"Brush"},{icon:"brush",label:"Highlighter"}
    ]}],
    // Group 3 - Lines
    [{ id: "trendline", icon: "trendline", label: "Lines", dd: [
      {h:"LINES"},{icon:"trendline",label:"Trend Line"},{icon:"hray",label:"Horizontal Ray"},{icon:"hline",label:"Horizontal Line"},{icon:"vline",label:"Vertical Line"},{icon:"trendline",label:"Ray"},{icon:"trendline",label:"Extended Line"},{icon:"crosshair",label:"Cross Line"},{icon:"polyline",label:"Polyline"},{icon:"polyline",label:"Path"},{icon:"polyline",label:"Curve"},{icon:"polyline",label:"Double Curve"}
    ]}],
    // Group 4 - Shapes
    [{ id: "rect", icon: "rect", label: "Shapes", dd: [
      {h:"SHAPES"},{icon:"rect",label:"Triangle"},{icon:"rect",label:"Rectangle"},{icon:"rect",label:"Arc"},{icon:"rect",label:"Ellipse"},{icon:"rect",label:"Circle"},
      {h:"ARROWS"},{icon:"trendline",label:"Arrow Marker"},{icon:"trendline",label:"Arrow"},{icon:"trendline",label:"Arrow Mark Up"},{icon:"trendline",label:"Arrow Mark Down"}
    ]}],
    // Group 5 - Channels & Pitchforks
    [{ id: "channel", icon: "channel", label: "Channels", dd: [
      {h:"CHANNELS"},{icon:"channel",label:"Parallel Channel"},{icon:"channel",label:"Regression Channel"},{icon:"channel",label:"Flat Top/Bottom"},{icon:"channel",label:"Disjoint Channel"},
      {h:"PITCHFORKS"},{icon:"channel",label:"Pitchfork"}
    ]}],
    // Group 6 - Fibonacci & Gann
    [{ id: "fib", icon: "fib", label: "Fibonacci & Gann", dd: [
      {h:"FIBONACCI"},{icon:"fib",label:"Fib Retracement"},{icon:"fib",label:"Trend-Based Fib Extension"},{icon:"fib",label:"Fib Channel"},{icon:"fib",label:"Fib Time Zone"},{icon:"fib",label:"Fib Speed Resistance Fan"},{icon:"fib",label:"Trend-Based Fib Time"},{icon:"fib",label:"Fib Circles"},{icon:"fib",label:"Fib Spiral"},{icon:"fib",label:"Fib Speed Resistance Arcs"},{icon:"fib",label:"Fib Wedge"},
      {h:"GANN"},{icon:"fib",label:"Gann Box"},{icon:"fib",label:"Gann Square Fixed"},{icon:"fib",label:"Gann Fan"}
    ]}],
    // Group 6 - Text & Labels
    [{ id: "text", icon: "text", label: "Text & Labels", dd: [
      {h:"TEXT"},{icon:"text",label:"Text"},{icon:"text",label:"Note"},{icon:"text",label:"Price Note"},{icon:"text",label:"Callout"},{icon:"text",label:"Comment"},
      {h:"LABELS"},{icon:"text",label:"Pin"},{icon:"text",label:"Price Label"},{icon:"text",label:"Signpost"},{icon:"text",label:"Flag Mark"},{icon:"text",label:"Image"},
      {h:"EMOJIS"},{icon:"text",label:"Emojis & Stickers"}
    ]}],
    // Group 7 - Patterns & Waves
    [{ id: "pattern", icon: "pattern", label: "Patterns & Waves", dd: [
      {h:"ELLIOTT WAVES"},{icon:"pattern",label:"Elliott Impulse (12345)"},{icon:"pattern",label:"Elliott Correction (ABC)"},{icon:"pattern",label:"Elliott Triangle (ABCDE)"},{icon:"pattern",label:"Elliott Double Combo (WXY)"},{icon:"pattern",label:"Elliott Triple Combo (WXYXZ)"},
      {h:"PATTERNS"},{icon:"pattern",label:"XABCD Pattern"},{icon:"pattern",label:"Head and Shoulders"},{icon:"pattern",label:"ABCD Pattern"},{icon:"pattern",label:"Triangle Pattern"},{icon:"pattern",label:"Three Drives Pattern"}
    ]}],
    // Group 8 - Projections
    [{ id: "measure", icon: "measure", label: "Projections", dd: [
      {h:"PROJECTIONS"},{icon:"rect",label:"Short Position"},{icon:"rect",label:"Long Position"},{icon:"measure",label:"Range Tool"}
    ]}],
    // Group 9 - Volume Tools
    [{ id: "brush", icon: "brush", label: "Volume Tools", dd: [
      {h:"VOLUME-BASED"},{icon:"brush",label:"Anchored VWAP"},{icon:"brush",label:"Fixed Range Volume Profile"},{icon:"brush",label:"Anchored Volume Profile"}
    ]}],
    // Group 10 - Utilities
    [
      { id: "eye", icon: "eye", label: "Visibility", dd: [
        {h:"VISIBILITY"},{icon:"eye",label:"Show/Hide All Drawings"},{icon:"eye",label:"Show/Hide Indicators"},{icon:"eye",label:"Show/Hide Positions"}
      ]},
      { id: "magnet", icon: "magnet", label: "Magnet", dd: [
        {h:"MAGNET STRENGTH"},{icon:"magnet",label:"Off"},{icon:"magnet",label:"Weak"},{icon:"magnet",label:"Strong"}
      ]},
      { id: "lock", icon: "lock", label: "Lock" },
    ],
  ];
  // Group 11 - Actions
  const actionTools = [
    { id: "trash", icon: "trash", label: "Delete", danger: true, dd: [
      {h:"DELETE"},{icon:"trash",label:"Delete All Drawings"},{icon:"trash",label:"Delete All Indicators"},{icon:"trash",label:"Delete All Objects"}
    ]},
    { id: "undo", icon: "undo", label: "Undo" },
    { id: "redo", icon: "redo", label: "Redo" },
  ];

  const priceLabels = ["127.100","127.000","126.900","126.800","126.700","126.600","126.500","126.400","126.300","126.200"];
  const timeLabels = ["16:36","16:46","16:56","17:01","17:06","17:11","17:16","17:21","17:26","17:31","17:36","17:41","17:46","17:51"];

  const closeWindows = () => { setDropdown(null); setLogoMenu(false); setSettingsOpen(false); setProfileOpen(false); setFaqOpen(false); setNewsOpen(false); setLayoutOpen(false); setIndOpen(false); setIndSearch(""); setSDrop(null); setColorPicker(null); setScreenshotOpen(false); setLayersOpen(false); };
  const closeAll = () => { setDropdown(null); setLogoMenu(false); setReplayOpts(false); setGotoOpen(false); setSymbolOpen(false); setChartTypeOpen(false); setSymbolSearch(""); setTfOpen(false); setTfCat(null); setTfUnitOpen(false); closeWindows(); };

  // Render a tool button
  const renderTB = (t, ref) => {
    const act = tool === t.id;
    const h = hov === t.id;
    const ddOpen = dropdown === t.id;
    let col = c.ts;
    if (act) col = c.acL;
    else if (h && t.danger) col = c.rd;
    else if (h) col = c.tx;

    return (
      <div key={t.id} style={{ position: "relative", width: "100%" }}
        onMouseEnter={() => setHov(t.id)} onMouseLeave={() => setHov(null)}>
        <button
          ref={ref}
          onClick={(e) => {
            e.stopPropagation();
            setTool(t.id);
            if (t.dd) {
              const rect = e.currentTarget.getBoundingClientRect();
              setDdPos({ top: rect.top, left: 38 });
              const opening = ddOpen ? null : t.id;
              // Close everything else first
              setLogoMenu(false); setReplayOpts(false); setGotoOpen(false); setSymbolOpen(false); setChartTypeOpen(false); setIndOpen(false); setTfOpen(false); setTfUnitOpen(false);
              setDropdown(opening);
            } else {
              setDropdown(null);
            }
          }}
          style={{
            width: "100%", height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none", cursor: "pointer", color: col, padding: 0,
            transition: "all 0.15s ease", position: "relative", fontFamily: F,
          }}>
          <I n={t.icon} s={15} cl={col}/>
          {t.dd && <div style={{ position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)" }}>
            <I n="chevRight" s={7} cl={act ? c.acL : c.tm} w={2}/>
          </div>}
          {act && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2, background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)`, boxShadow: `0 0 6px ${c.acG}` }}/>}
          {h && !act && <div style={{ position: "absolute", bottom: 0, left: "25%", right: "25%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
        </button>
        {h && !ddOpen && !t.dd && <div style={{ position: "absolute", left: "calc(100% + 10px)", top: "50%", transform: "translateY(-50%)", background: c.el, border: `1px solid ${c.brH}`, padding: "4px 10px", fontSize: 10, fontWeight: 600, fontFamily: F, color: c.tx, whiteSpace: "nowrap", zIndex: 100, boxShadow: "0 4px 16px rgba(0,0,0,0.6)", borderLeft: `2px solid ${act ? c.acL : c.brH}` }}>{t.label}</div>}
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

  return (
    <div style={{ width: "100%", height: "100vh", background: c.bg, fontFamily: F, color: c.tx, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}
      onClick={closeAll}>

      {dropdown && ddItems && (
        <div onClick={(e) => e.stopPropagation()} style={{
          position: "fixed", top: ddPos.top, left: ddPos.left, zIndex: 9000,
          background: c.sf, border: `1px solid ${c.brH}`,
          boxShadow: `0 8px 32px rgba(0,0,0,0.7), 0 0 16px ${c.acG}`,
          minWidth: 190, fontFamily: F,
        }}>
          <div style={{ position: "sticky", top: 0, height: 2, background: `linear-gradient(90deg, ${c.ac}, ${c.acL}, ${c.ac})`, zIndex: 1 }}/>
          <div style={{ padding: "4px 0" }}>
            {ddItems.map((item, i) => {
              if (item.h) return (
                <div key={i} style={{ padding: "6px 14px 3px", fontSize: 7, fontWeight: 700, color: c.tm, letterSpacing: "0.06em" }}>{item.h}
                  {i > 0 && <div style={{ height: 1, marginTop: 3, marginBottom: -3, background: `linear-gradient(90deg, transparent, ${c.br}, transparent)` }}/>}
                </div>
              );
              const firstInGroup = i > 0 && ddItems[i-1]?.h;
              const isPinned = toolPinned.includes(item.label);
              const rowHov = hov===`dd-${i}` || hov===`ddpin-${i}`;
              return (
                <div key={i}
                  onMouseEnter={() => setHov(`dd-${i}`)} onMouseLeave={() => setHov(null)}
                  style={{
                    display: "flex", alignItems: "center", padding: "4px 8px 4px 14px",
                    background: firstInGroup ? c.acD : rowHov ? "rgba(255,255,255,0.03)" : "transparent",
                    position: "relative",
                  }}>
                  <button
                    onClick={() => { setTool(dropdown); setDropdown(null); }}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "2px 0",
                      background: "transparent", border: "none", cursor: "pointer",
                      color: firstInGroup ? c.acL : rowHov ? c.tx : c.ts,
                      fontSize: 10, fontWeight: firstInGroup ? 700 : 500, fontFamily: F,
                    }}>
                    <I n={item.icon} s={13} cl={firstInGroup ? c.acL : rowHov ? c.tx : c.ts}/>
                    {item.label}
                  </button>
                  <div onClick={(e) => {
                    e.stopPropagation();
                    setToolPinned(prev => isPinned ? prev.filter(x => x !== item.label) : [...prev, item.label]);
                  }}
                    onMouseEnter={() => setHov(`ddpin-${i}`)} onMouseLeave={() => setHov(`dd-${i}`)}
                    style={{
                      padding: 3, cursor: "pointer", marginLeft: 4, flexShrink: 0,
                      opacity: isPinned ? 1 : hov===`ddpin-${i}` ? 1 : rowHov ? 0.7 : 0.8,
                      transform: hov===`ddpin-${i}` && !isPinned ? "rotate(-25deg) scale(1.15)" : "none",
                      transition: "all 0.15s",
                    }}>
                    <I n={isPinned ? "pinFill" : "pin"} s={9} cl={isPinned ? c.gold : hov===`ddpin-${i}` ? c.gold : c.ts}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}


      {indOpen && (
        <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",top:`calc(50% + ${indPos.y}px)`,left:`calc(50% + ${indPos.x}px)`,transform:"translate(-50%,-50%)",width:360,height:340,zIndex:9001,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 24px 64px rgba(0,0,0,0.8), 0 0 24px ${c.acG}`,fontFamily:F,display:"flex",flexDirection:"column"}}>
          <div style={{height:3,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
          <div onMouseDown={(e)=>{e.preventDefault();setDragging({target:"ind",startX:e.clientX,startY:e.clientY,ox:indPos.x,oy:indPos.y});}} style={{display:"flex",alignItems:"center",padding:"8px 14px",borderBottom:`1px solid ${c.br}`,cursor:"move",userSelect:"none"}}>
            <I n="indicator" s={13} cl={c.acL}/><span style={{fontSize:12,fontWeight:700,marginLeft:6,flex:1}}>Indicators</span>
            <div onMouseDown={(e)=>e.stopPropagation()} onClick={()=>{setIndOpen(false);setIndSearch("");}} style={{cursor:"pointer",padding:4}}><I n="x" s={12} cl={c.ts}/></div>
          </div>
          <div style={{padding:"6px 14px",borderBottom:`1px solid ${c.br}`}}>
            <div style={{display:"flex",alignItems:"center",background:c.well,border:`1px solid ${c.br}`,padding:"3px 6px"}}><I n="search" s={10} cl={c.tm}/><input type="text" placeholder="Search..." value={indSearch} onChange={(e)=>setIndSearch(e.target.value)} style={{flex:1,background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:9,fontFamily:F,padding:"0 4px"}}/></div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"4px 0"}}>
            {indFiltered.map(ind=>{const isAct=indActive.includes(ind.id);const isPinned=indPinned.includes(ind.id);return(
              <div key={ind.id} onMouseEnter={()=>setHov(`ind-${ind.id}`)} onMouseLeave={()=>setHov(null)} style={{display:"flex",alignItems:"center",padding:"4px 14px",background:hov===`ind-${ind.id}`?"rgba(255,255,255,0.02)":"transparent",cursor:"pointer"}} onClick={()=>setIndActive(prev=>isAct?prev.filter(x=>x!==ind.id):[...prev,ind.id])}>
                {isAct && <div style={{position:"absolute",left:0,width:2,height:16,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`}}/>}
                <div style={{width:4,height:4,borderRadius:"50%",background:catColors[ind.cat]||c.acL,marginRight:8}}/>
                <span style={{fontSize:9,fontWeight:600,color:isAct?c.acL:c.ts,flex:1}}>{ind.abbr}</span>
                <span style={{fontSize:8.5,color:c.ts,flex:2}}>{ind.name}</span>
                <div onClick={(e)=>{e.stopPropagation();setIndPinned(prev=>isPinned?prev.filter(x=>x!==ind.id):[...prev,ind.id]);}} style={{padding:2,opacity:isPinned?1:0.5,cursor:"pointer"}}>
                  <I n={isPinned?"pinFill":"pin"} s={9} cl={isPinned?c.gold:c.ts}/>
                </div>
                <div style={{marginLeft:4,width:16,textAlign:"center"}}>{isAct ? <I n="check" s={9} cl={c.acL}/> : <I n="plus" s={9} cl={c.ts}/>}</div>
              </div>
            );})}
          </div>
          <div style={{padding:"6px 14px",borderTop:`1px solid ${c.br}`,display:"flex",justifyContent:"flex-end",gap:4}}><B onClick={()=>{setIndOpen(false);setIndSearch("");}}>Cancel</B><B primary onClick={()=>{setIndOpen(false);setIndSearch("");}}>OK</B></div>
        </div>
      )}
      {settingsOpen && <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:300,zIndex:9002,background:c.sf,border:`1px solid ${c.brH}`,padding:12,fontFamily:F}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontSize:12,fontWeight:700}}>Settings</span><div onClick={()=>setSettingsOpen(false)} style={{cursor:"pointer"}}><I n="x" s={12} cl={c.ts}/></div></div><div style={{fontSize:9,color:c.ts}}>Settings panel (compact mode)</div></div>}
      {profileOpen && <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",top:`calc(50% + ${profilePos.y}px)`,left:`calc(50% + ${profilePos.x}px)`,transform:"translate(-50%,-50%)",width:340,zIndex:9002,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 24px 64px rgba(0,0,0,0.8)`,fontFamily:F}}><div style={{height:3,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/><div onMouseDown={(e)=>{e.preventDefault();setDragging({target:"profile",startX:e.clientX,startY:e.clientY,ox:profilePos.x,oy:profilePos.y});}} style={{display:"flex",alignItems:"center",padding:"8px 14px",borderBottom:`1px solid ${c.br}`,cursor:"move"}}><span style={{fontSize:12,fontWeight:700,flex:1}}>Profile</span><div onMouseDown={(e)=>e.stopPropagation()} onClick={()=>setProfileOpen(false)} style={{cursor:"pointer",padding:4}}><I n="x" s={12} cl={c.ts}/></div></div><div style={{padding:14}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${c.gold},${c.ac})`,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:14,fontWeight:800,color:"#fff"}}>T</span></div><div><div style={{fontSize:11,fontWeight:700}}>Trader</div><div style={{fontSize:8,color:c.ts}}>trader@email.com</div></div><span style={{marginLeft:"auto",padding:"1px 6px",background:c.acD,border:`1px solid ${c.acB}`,fontSize:7,fontWeight:800,color:c.acL}}>PRO</span></div><div style={{display:"flex",justifyContent:"flex-end",gap:4}}><B small>Log Out</B></div></div></div>}
      {faqOpen && <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:380,zIndex:9002,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 24px 64px rgba(0,0,0,0.8)`,fontFamily:F,padding:14}}><div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,marginBottom:8}}/><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontSize:12,fontWeight:700}}>Help & Support</span><div onClick={()=>setFaqOpen(false)} style={{cursor:"pointer"}}><I n="x" s={12} cl={c.ts}/></div></div><div style={{padding:10}}>{[{q:"What file formats are supported?",a:"CSV files with OHLCV data."},{q:"How do I take a screenshot?",a:"Click the camera icon in the toolbar."},{q:"Can I use custom indicators?",a:"Open the Indicators panel and add from the list."},{q:"How does replay mode work?",a:"Navigate to a past date, use play/pause and step controls."}].map((item,i)=><div key={i} style={{marginBottom:4,padding:"6px 8px",background:c.well,border:`1px solid ${c.br}`}}><div onClick={()=>setFaqExpand(faqExpand===i?null:i)} style={{cursor:"pointer",display:"flex",alignItems:"center"}}><span style={{flex:1,fontSize:9.5,fontWeight:700,color:c.acL}}>{item.q}</span><I n="chevDown" s={8} cl={c.tm}/></div>{faqExpand===i && <div style={{fontSize:9,color:c.ts,marginTop:4}}>{item.a}</div>}</div>)}</div></div>}
      {screenshotOpen && <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:400,zIndex:9002,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 24px 64px rgba(0,0,0,0.8)`,fontFamily:F,padding:14}}><div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,marginBottom:8}}/><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontSize:12,fontWeight:700}}>Screenshot Preview</span><div onClick={()=>setScreenshotOpen(false)} style={{cursor:"pointer"}}><I n="x" s={12} cl={c.ts}/></div></div><div style={{background:c.bg,border:`1px solid ${c.br}`,height:180,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:c.tm,fontSize:10}}>Chart snapshot</span></div><div style={{display:"flex",justifyContent:"flex-end",gap:4,marginTop:8}}><B primary small>Download</B><B small>Copy</B></div></div>}

      {logoMenu && (
        <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",top:42,left:10,zIndex:9000,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 8px 32px rgba(0,0,0,0.7)`,minWidth:130}}>
          <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
          {[{icon:"settings",label:"Settings"},{icon:"user",label:"Profile"},{icon:"news",label:"FAQ"}].map((item,i)=>(
            <button key={i} onClick={()=>{setLogoMenu(false);if(item.label==="Settings"){closeWindows();setSettingsOpen(true);}if(item.label==="Profile"){closeWindows();setProfileOpen(true);}if(item.label==="FAQ"){closeWindows();setFaqOpen(true);}}} style={{width:"100%",display:"flex",alignItems:"center",gap:6,padding:"6px 12px",background:"transparent",border:"none",cursor:"pointer",color:c.ts,fontSize:10,fontFamily:F,borderBottom:`1px solid ${c.br}`}}><I n={item.icon} s={12} cl={c.ts}/>{item.label}</button>
          ))}
        </div>
      )}
      {symbolOpen && (
        <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",top:42,left:50,zIndex:9000,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 8px 32px rgba(0,0,0,0.7)`,minWidth:160,fontFamily:F}}>
          <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
          <div style={{padding:"6px 8px",borderBottom:`1px solid ${c.br}`}}><div style={{display:"flex",alignItems:"center",background:c.well,border:`1px solid ${c.br}`,padding:"3px 6px"}}><input type="text" placeholder="Search..." value={symbolSearch} onChange={(e)=>setSymbolSearch(e.target.value)} style={{flex:1,background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:9,fontFamily:F,padding:0}}/></div></div>
          {["EUR/JPY","EUR/USD","GBP/USD","USD/JPY","AUD/USD","USD/CAD"].filter(s=>!symbolSearch||s.toLowerCase().includes(symbolSearch.toLowerCase())).map(s=>(
            <button key={s} onClick={()=>{setSymbol(s);setSymbolOpen(false);setSymbolSearch("");}} style={{width:"100%",padding:"5px 10px",background:symbol===s?c.acD:"transparent",border:"none",cursor:"pointer",color:symbol===s?c.acL:c.ts,fontSize:9.5,fontWeight:symbol===s?700:500,fontFamily:F,textAlign:"left"}}>{s}</button>
          ))}
        </div>
      )}
      {chartTypeOpen && (
        <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",top:42,left:140,zIndex:9000,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 8px 32px rgba(0,0,0,0.7)`,minWidth:130,fontFamily:F}}>
          <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
          {["Candles","Hollow Candles","Heikin Ashi","Bars","Line","Area"].map(t=>(
            <button key={t} onClick={()=>{setChartType(t);setChartTypeOpen(false);}} style={{width:"100%",padding:"5px 10px",background:chartType===t?c.acD:"transparent",border:"none",cursor:"pointer",color:chartType===t?c.acL:c.ts,fontSize:9.5,fontWeight:chartType===t?700:500,fontFamily:F,textAlign:"left"}}>{t}</button>
          ))}
        </div>
      )}
      <div style={{ height: 36, flexShrink: 0, background: c.sf, borderBottom: `1px solid ${c.br}`, display: "flex", alignItems: "center", padding: "0 10px", gap: 4 }}>
        <div onClick={(e) => { e.stopPropagation(); closeAll(); setLogoMenu(prev => !prev); }}
          onMouseEnter={() => setHov("logo-btn")} onMouseLeave={() => setHov(null)}
          style={{ width: 24, height: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            filter: logoMenu ? `drop-shadow(0 0 6px ${c.acL})` : hov==="logo-btn" ? `drop-shadow(0 0 4px ${c.acL})` : "none",
            opacity: logoMenu ? 1 : hov==="logo-btn" ? 0.9 : 0.7,
            transform: hov==="logo-btn" ? "scale(1.08)" : "none", transition: "all 0.15s" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#2643F7"/><stop offset="100%" stopColor="#4A6AFF"/></linearGradient></defs>
            <path d="M4 6h12l4 3H8L4 6z" fill="url(#lg)"/>
            <path d="M4 11h12l4 3H8L4 11z" fill="url(#lg)" opacity="0.85"/>
            <path d="M8 14v4l-4-3v-4l4 3z" fill="url(#lg)" opacity="0.7"/>
          </svg>
        </div>
        <div style={{ width: 1, height: 16, margin: "0 3px", background: c.br }}/>
        <button onClick={(e) => { e.stopPropagation(); closeAll(); setSymbolOpen(prev => !prev); }} onMouseEnter={() => setHov("symbol")} onMouseLeave={() => setHov(null)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", background: "transparent", border: "none", color: c.tx, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: F, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <Flag code={currentSymbol.base} s={11}/>
            <div style={{ marginLeft: -2 }}><Flag code={currentSymbol.quote} s={11}/></div>
          </div>
          {symbol}
          <I n="chevDown" s={9} cl={symbolOpen ? c.acL : c.tm}/>
          {hov==="symbol" && !symbolOpen && <div style={{ position: "absolute", bottom: -1, left: "15%", right: "15%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
          {symbolOpen && <div style={{ position: "absolute", bottom: -1, left: "15%", right: "15%", height: 2, background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)`, boxShadow: `0 0 6px ${c.acG}` }}/>}
        </button>
        <div style={{ width: 1, height: 16, margin: "0 2px", background: c.br }}/>
        <button onClick={(e) => { e.stopPropagation(); closeAll(); setChartTypeOpen(prev => !prev); }} onMouseEnter={() => setHov("chartType")} onMouseLeave={() => setHov(null)}
          style={{ padding: "3px 7px", display: "flex", alignItems: "center", gap: 4, position: "relative", background: "transparent", border: "none", fontFamily: F, color: chartTypeOpen ? c.acL : hov==="chartType" ? c.tx : c.ts, fontSize: 9.5, fontWeight: 600, cursor: "pointer" }}>
          <I n={currentChartType.icon} s={12} cl={chartTypeOpen ? c.acL : hov==="chartType" ? c.tx : c.ts}/>{currentChartType.label}
          <I n="chevDown" s={8} cl={chartTypeOpen ? c.acL : c.tm}/>
          {chartTypeOpen && <div style={{ position: "absolute", bottom: -1, left: "10%", right: "10%", height: 2, background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)`, boxShadow: `0 0 6px ${c.acG}` }}/>}
          {hov==="chartType" && !chartTypeOpen && <div style={{ position: "absolute", bottom: -1, left: "15%", right: "15%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
        </button>
        <div style={{ width: 1, height: 16, margin: "0 2px", background: c.br }}/>
        <button onClick={(e) => { e.stopPropagation(); closeWindows(); setIndOpen(true); }} onMouseEnter={() => setHov("indicators")} onMouseLeave={() => setHov(null)}
          style={{ padding: "3px 8px", display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", fontFamily: F, color: hov==="indicators" ? c.tx : c.ts, fontSize: 9.5, fontWeight: 600, cursor: "pointer", position: "relative" }}>
          <I n="indicator" s={13} cl={hov==="indicators" ? c.tx : c.ts}/>Indicators
          {hov==="indicators" && <div style={{ position: "absolute", bottom: -1, left: "15%", right: "15%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
        </button>
        <div style={{ width: 1, height: 16, margin: "0 4px", background: c.br }}/>
        <div style={{ display: "flex", gap: 0, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <button onClick={(e) => { e.stopPropagation(); closeAll(); setTfOpen(prev => !prev); setTfEditMode(false); }} onMouseEnter={() => setHov("tf-more")} onMouseLeave={() => setHov(null)}
              style={{ padding: "4px 5px", position: "relative", background: "transparent", border: "none", fontFamily: F, cursor: "pointer", display: "flex", alignItems: "center" }}>
              <I n="chevDown" s={10} cl={tfOpen ? c.acL : hov==="tf-more" ? c.tx : c.tm}/>
              {tfOpen && <div style={{ position: "absolute", bottom: -1, left: "15%", right: "15%", height: 2, background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)`, boxShadow: `0 0 6px ${c.acG}` }}/>}
              {hov==="tf-more" && !tfOpen && <div style={{ position: "absolute", bottom: -1, left: "15%", right: "15%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
            </button>
            {tfOpen && (
        <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",top:42,left:300,zIndex:9000,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 8px 32px rgba(0,0,0,0.7)`,minWidth:120,fontFamily:F}}>
          <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
          <div style={{padding:"4px 0"}}>
            {["1m","5m","15m","30m","1H","4H","12H","1D","1W","1M"].map(t=>{const isPinned=tfPinned.includes(t);return(
              <div key={t} onMouseEnter={()=>setHov(`tf-${t}`)} onMouseLeave={()=>setHov(null)} style={{display:"flex",alignItems:"center",padding:"4px 10px",background:tf===t?c.acD:hov===`tf-${t}`?"rgba(255,255,255,0.02)":"transparent"}}>
                <button onClick={()=>{setTf(t);setTfOpen(false);}} style={{flex:1,background:"transparent",border:"none",cursor:"pointer",color:tf===t?c.acL:c.ts,fontSize:9.5,fontWeight:tf===t?700:500,fontFamily:F,textAlign:"left",padding:0}}>{t}</button>
                <div onClick={(e)=>{e.stopPropagation();setTfPinned(prev=>isPinned?prev.filter(x=>x!==t):[...prev,t]);}} style={{padding:2,opacity:isPinned?1:0.5,cursor:"pointer"}}><I n={isPinned?"pinFill":"pin"} s={9} cl={isPinned?c.gold:c.ts}/></div>
              </div>
            );})}
          </div>
        </div>
      )}
          </div>
          {tfPinned.map((t) => (
            <button key={t} onClick={() => setTf(t)} onMouseEnter={() => setHov(`tf-${t}`)} onMouseLeave={() => setHov(null)}
              style={{ padding: "4px 7px", position: "relative", background: "transparent", border: "none", fontFamily: F, color: tf===t ? c.acL : hov===`tf-${t}` ? c.tx : c.ts, fontSize: 10, fontWeight: tf===t ? 700 : 600, cursor: "pointer" }}>
              {t}
              {tf===t && <div style={{ position: "absolute", bottom: -1, left: "20%", right: "20%", height: 2, background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)`, boxShadow: `0 0 6px ${c.acG}` }}/>}
              {hov===`tf-${t}` && tf!==t && <div style={{ position: "absolute", bottom: -1, left: "25%", right: "25%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }}/>
        <button onClick={(e) => { e.stopPropagation(); setRightPanel(null); setOrderPanelOpen(prev => !prev); }}
          onMouseEnter={() => setHov("place-order")} onMouseLeave={() => setHov(null)}
          style={{
            display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", marginRight: 6,
            background: hov==="place-order" ? `linear-gradient(135deg,${c.acL},#6B8AFF)` : `linear-gradient(135deg,${c.ac},${c.acL})`,
            border: "none", cursor: "pointer", fontFamily: F,
            boxShadow: orderPanelOpen && !rightPanel ? `0 2px 10px ${c.acL}44` : hov==="place-order" ? `0 3px 10px ${c.acG}` : `0 2px 6px ${c.acG}`,
            transform: hov==="place-order" ? "translateY(-1px)" : "none", transition: "all 0.12s",
            opacity: orderPanelOpen && !rightPanel ? 1 : 0.75,
          }}>
          <I n="plus" s={10} cl="#fff" w={2}/>
          <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>Place Order</span>
        </button>
        <div style={{ width: 1, height: 16, margin: "0 2px", background: c.br }}/>
        {[{id:"layout",icon:"layout",label:"Layout"},{id:"layers",icon:"tree",label:"Objects Tree"},{id:"news",icon:"news",label:"News"},{id:"screenshot",icon:"screenshot",label:"Screenshot"},{id:"expand",icon:"expand",label:"Fullscreen"}].map(({id,icon,label}) => (
          <button key={id} onClick={(e) => { if(id==="news"){ e.stopPropagation(); if(rightPanel==="news"){setRightPanel(null);}else{setRightPanel("news");setOrderPanelOpen(false);} } if(id==="layout"){ e.stopPropagation(); if(rightPanel==="layout"){setRightPanel(null);}else{setRightPanel("layout");setOrderPanelOpen(false);} } if(id==="screenshot"){ e.stopPropagation(); closeWindows(); setScreenshotOpen(true); } if(id==="layers"){ e.stopPropagation(); if(rightPanel==="layers"){setRightPanel(null);}else{setRightPanel("layers");setOrderPanelOpen(false);} }}} onMouseEnter={() => setHov(`u-${id}`)} onMouseLeave={() => setHov(null)}
            style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", position: "relative" }}>
            {(() => { const isActive = (id==="news"&&rightPanel==="news") || (id==="layers"&&rightPanel==="layers") || (id==="layout"&&rightPanel==="layout"); return <>
              <I n={icon} s={14} cl={isActive ? c.acL : hov===`u-${id}` ? c.tx : c.ts}/>
              {isActive && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2, background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)`, boxShadow: `0 0 6px ${c.acG}` }}/>}
              {hov===`u-${id}` && !isActive && <div style={{ position: "absolute", bottom: 0, left: "25%", right: "25%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
              {hov===`u-${id}` && <div style={{ position: "absolute", top: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)", background: c.el, border: `1px solid ${c.brH}`, padding: "3px 8px", fontSize: 9, fontWeight: 600, fontFamily: F, color: c.tx, whiteSpace: "nowrap", zIndex: 100, boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>{label}</div>}
            </>; })()}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: 36, flexShrink: 0, background: c.sf, borderRight: `1px solid ${c.br}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 2, overflowY: "auto", overflowX: "hidden" }}>
          {toolGroups.map((group, gi) => (
            <div key={gi}>
              {group.map(t => renderTB(t))}
              {gi < toolGroups.length - 1 && <div style={{ height: 1, margin: "1px 8px", background: `linear-gradient(90deg, transparent, ${c.br}, transparent)` }}/>}
            </div>
          ))}
          <div style={{ flex: 1 }}/>
          <div style={{ height: 1, margin: "1px 8px", background: `linear-gradient(90deg, transparent, ${c.br}, transparent)` }}/>
          {actionTools.map(t => renderTB(t))}
          <div style={{ height: 3 }}/>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, position: "relative", background: c.bg, display: "flex" }}>
            <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
              {priceLabels.map((_, i) => <div key={`h${i}`} style={{ position: "absolute", left: 0, right: 0, top: `${(i/(priceLabels.length-1))*100}%`, height: 1, background: c.grid }}/>)}
              {timeLabels.map((_, i) => <div key={`v${i}`} style={{ position: "absolute", top: 0, bottom: 0, left: `${(i/(timeLabels.length-1))*100}%`, width: 1, background: c.grid }}/>)}
              <div style={{ position: "absolute", left: 0, right: 0, top: "28%", height: 1, background: c.ac, opacity: 0.3 }}>
                <div style={{ position: "absolute", right: 0, top: -9, background: `linear-gradient(135deg,${c.ac},${c.acL})`, color: "#fff", fontSize: 9, fontWeight: 700, fontFamily: F, padding: "2px 8px", fontVariantNumeric: "tabular-nums" }}>126.895</div>
              </div>
              <div style={{ position: "absolute", left: 0, right: 0, top: "58%", height: 1, borderTop: `1px dashed ${c.rd}44` }}/>
              <div style={{ position: "absolute", top: 8, left: 10, zIndex: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{symbol}</span>
                  <span style={{ fontSize: 9, color: c.tm }}>? 1m</span>
                  <div onClick={(e) => { e.stopPropagation(); setRollback(!rollback); }} style={{ cursor: "pointer", opacity: rollback ? 1 : 0.4, display: "flex", alignItems: "center", gap: 3 }}>
                    <I n="rollback" s={11} cl={rollback ? c.gn : c.rd}/>
                    <span style={{ fontSize: 7.5, color: rollback ? c.gn : c.rd, fontWeight: 700 }}>{rollback ? "RB" : "LOCKED"}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, fontSize: 9.5 }}>
                  {[["O","126,680",c.gn],["H","126,745",c.gn],["L","126,675",c.rd],["C","126,730",c.gn]].map(([k,v,col]) => (
                    <span key={k} style={{ color: c.tm, fontWeight: 600 }}>{k} <span style={{ color: col, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</span></span>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ width: 65, flexShrink: 0, background: c.sf, borderLeft: `1px solid ${c.br}`, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "6px 0" }}>
              {priceLabels.map((p, i) => <span key={i} style={{ fontSize: 9, fontWeight: 600, color: c.axTx, textAlign: "right", paddingRight: 8, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{p}</span>)}
            </div>
          </div>
          <div style={{ height: 18, flexShrink: 0, background: c.sf, borderTop: `1px solid ${c.br}`, display: "flex", alignItems: "center", paddingRight: 65 }}>
            <div style={{ flex: 1, display: "flex", justifyContent: "space-between", padding: "0 8px", marginLeft: 36 }}>
              {timeLabels.map((t, i) => <span key={i} style={{ fontSize: 8, fontWeight: 600, color: c.axTx, fontVariantNumeric: "tabular-nums" }}>{t}</span>)}
            </div>
          </div>
          <div style={{ height: 30, flexShrink: 0, background: c.sf, borderTop: `1px solid ${c.br}`, display: "flex", alignItems: "center", padding: "0 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 9, fontVariantNumeric: "tabular-nums" }}>
              <span style={{ color: c.ts, fontWeight: 600 }}><I n="eye" s={10} cl={c.ts}/></span>
              <span style={{ color: c.ts }}>Balance <span style={{ fontWeight: 700, color: c.tx }}>10,000</span></span>
              <span style={{ color: c.ts }}>Equity <span style={{ fontWeight: 700, color: c.tx }}>10,000</span></span>
              <span style={{ color: c.ts }}>PnL <span style={{ fontWeight: 700, color: c.gn }}>0</span></span>
            </div>

            <div style={{ flex: 1 }}/>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ position: "relative" }}>
                <button onClick={(e) => { e.stopPropagation(); setReplayOpts(!replayOpts); }}
                  onMouseEnter={() => setHov("rp-mode")} onMouseLeave={() => setHov(null)}
                  style={{ height: 22, padding: "0 8px", display: "flex", alignItems: "center", position: "relative", background: "transparent", border: "none", cursor: "pointer", fontFamily: F }}>
                  <I n="settings" s={13} cl={replayOpts ? c.acL : hov==="rp-mode" ? c.tx : c.ts}/>
                  {replayOpts && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2, background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)`, boxShadow: `0 0 6px ${c.acG}` }}/>}
                  {hov==="rp-mode" && !replayOpts && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
                </button>
                {replayOpts && <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", bottom: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)", zIndex: 9000, background: c.sf, border: `1px solid ${c.brH}`, boxShadow: `0 8px 24px rgba(0,0,0,0.6), 0 0 12px ${c.acG}`, minWidth: 140 }}>
                  <div style={{ height: 2, background: `linear-gradient(90deg, ${c.ac}, ${c.acL}, ${c.ac})` }}/>
                  <div style={{ padding: "5px 10px 2px", fontSize: 7, fontWeight: 700, color: c.tm, letterSpacing: "0.06em" }}>MODE</div>
                  {[{id:"tick",l:"Tick by Tick"},{id:"candle",l:"Candle by Candle"}].map(({id,l}) => (
                    <button key={id} onClick={() => { setReplayMode(id); setReplayOpts(false); }}
                      style={{ width: "100%", padding: "5px 10px", background: replayMode===id ? c.acD : "transparent", border: "none", cursor: "pointer", color: replayMode===id ? c.acL : c.ts, fontSize: 9, fontWeight: replayMode===id ? 700 : 500, fontFamily: F, textAlign: "left" }}>{l}</button>
                  ))}
                  <div style={{ height: 1, margin: "2px 10px", background: `linear-gradient(90deg, transparent, ${c.br}, transparent)` }}/>
                  <div style={{ padding: "4px 10px 2px", fontSize: 7, fontWeight: 700, color: c.tm, letterSpacing: "0.06em" }}>INTERVAL</div>
                  <div style={{ padding: "3px 10px 6px", display: "flex", gap: 2, flexWrap: "wrap" }}>
                    {["Auto","1m","5m","15m","30m"].map(t => {
                      const isA = replayMode===t.toLowerCase() || replayMode===t;
                      return <button key={t} onClick={() => { setReplayMode(t==="Auto"?"auto":t); setReplayOpts(false); }}
                        style={{ padding: "3px 7px", background: isA ? c.acD : c.well, border: `1px solid ${isA ? c.acB : c.br}`, color: isA ? c.acL : c.ts, fontSize: 8, fontWeight: 700, fontFamily: F, cursor: "pointer" }}>{t}</button>;
                    })}
                  </div>
                </div>}
              </div>
              <button onClick={() => setPlaying(!playing)}
                onMouseEnter={() => setHov("rp-play")} onMouseLeave={() => setHov(null)}
                style={{
                  width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none",
                  background: playing ? `linear-gradient(135deg,#E8820A,#F5A623)` : hov==="rp-play" ? `linear-gradient(135deg,#00C896,${c.gn})` : `linear-gradient(135deg,${c.gn},#00B88A)`,
                  boxShadow: playing ? `0 0 8px rgba(232,130,10,0.3)` : hov==="rp-play" ? `0 0 8px rgba(0,212,161,0.3)` : `0 1px 4px rgba(0,212,161,0.15)`,
                  transform: hov==="rp-play" ? "scale(1.05)" : "none", transition: "all 0.12s",
                }}>
                <I n={playing ? "pause" : "play"} s={9} cl="#fff"/>
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: c.acL, fontVariantNumeric: "tabular-nums", minWidth: 24, textAlign: "right" }}>{speed}x</span>
                <div style={{ position: "relative", width: 80, height: 22, display: "flex", alignItems: "center" }}>
                  <div style={{ position: "absolute", left: 0, right: 0, height: 3, background: c.el, top: "50%", transform: "translateY(-50%)", borderRadius: 1.5 }}>
                    <div style={{ width: `${speed}%`, height: "100%", background: `linear-gradient(90deg, ${c.ac}, ${c.acL})`, borderRadius: 1.5, boxShadow: `0 0 4px ${c.acG}` }}/>
                  </div>
                  <div style={{ position: "absolute", left: `calc(${speed}% - 5px)`, top: "50%", transform: "translateY(-50%)", width: 10, height: 10, borderRadius: "50%", background: `linear-gradient(135deg, #fff, ${c.acL})`, border: `1.5px solid ${c.acL}`, boxShadow: `0 0 5px ${c.acG}, 0 1px 3px rgba(0,0,0,0.4)`, pointerEvents: "none" }}/>
                  <input type="range" min="1" max="100" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
                    style={{ position: "absolute", left: 0, right: 0, width: "100%", height: 22, opacity: 0, cursor: "pointer", margin: 0 }}/>
                </div>
              </div>
              <button onMouseEnter={() => setHov("rp-next")} onMouseLeave={() => setHov(null)}
                style={{ height: 22, padding: "0 8px", display: "flex", alignItems: "center", position: "relative", background: "transparent", border: "none", cursor: "pointer" }}>
                <I n="stepFwd" s={13} cl={hov==="rp-next" ? c.tx : c.ts}/>
                {hov==="rp-next" && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
              </button>
              <button onClick={() => setRollback(!rollback)}
                onMouseEnter={() => setHov("rp-rb")} onMouseLeave={() => setHov(null)}
                style={{ height: 22, padding: "0 8px", display: "flex", alignItems: "center", position: "relative", background: "transparent", border: "none", cursor: "pointer" }}>
                <I n="rollback" s={13} cl={rollback ? c.gn : hov==="rp-rb" ? c.tx : c.ts}/>
                {rollback && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2, background: `linear-gradient(90deg, transparent, ${c.gn}, transparent)`, boxShadow: `0 0 6px rgba(0,212,161,0.2)` }}/>}
                {hov==="rp-rb" && !rollback && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
              </button>
              <div style={{ position: "relative" }}>
                <button onClick={(e) => { e.stopPropagation(); if(!gotoOpen) setGotoTab("pinned"); setGotoOpen(!gotoOpen); }}
                  onMouseEnter={() => setHov("rp-goto")} onMouseLeave={() => setHov(null)}
                  style={{ height: 22, padding: "0 8px", display: "flex", alignItems: "center", position: "relative", background: "transparent", border: "none", cursor: "pointer" }}>
                  <I n="goto" s={13} cl={gotoOpen ? c.acL : hov==="rp-goto" ? c.tx : c.ts}/>
                  {gotoOpen && <div onClick={(e)=>e.stopPropagation()} style={{position:"absolute",bottom:"calc(100% + 4px)",right:-20,zIndex:9000,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 8px 24px rgba(0,0,0,0.6)`,width:220,padding:10,fontFamily:F}}><div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,marginBottom:6}}/><div style={{display:"flex",gap:3,alignItems:"center"}}><div style={{flex:1,background:c.well,border:`1px solid ${c.br}`,padding:"3px 6px"}}><span style={{fontSize:9,color:c.tx,fontVariantNumeric:"tabular-nums"}}>2009-01-09</span></div><div style={{width:50,background:c.well,border:`1px solid ${c.br}`,padding:"3px 6px"}}><span style={{fontSize:9,color:c.tx}}>07:00</span></div><B primary small>Go</B></div></div>}
                  {hov==="rp-goto" && !gotoOpen && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
                </button>
                {gotoOpen && <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", bottom: "calc(100% + 4px)", right: -40, zIndex: 9000, background: c.sf, border: `1px solid ${c.brH}`, boxShadow: `0 12px 40px rgba(0,0,0,0.7), 0 0 16px ${c.acG}`, width: 280, height: 340, fontFamily: F, display: "flex", flexDirection: "column" }}>
                  <div style={{ height: 2, background: `linear-gradient(90deg, ${c.ac}, ${c.acL}, ${c.ac})` }}/>
                  <div style={{ display: "flex", borderBottom: `1px solid ${c.br}`, flexShrink: 0 }}>
                    {[{id:"pinned",l:"Pinned"},{id:"all",l:"All"},{id:"add",l:"+ New"}].map(tab => (
                      <button key={tab.id} onClick={() => setGotoTab(tab.id)}
                        onMouseEnter={() => setHov(`gt-${tab.id}`)} onMouseLeave={() => setHov(null)}
                        style={{ flex: 1, padding: "6px 0", border: "none", position: "relative", background: "transparent", fontFamily: F, cursor: "pointer",
                          color: tab.id==="add" ? (gotoTab==="add" ? c.gn : hov===`gt-add` ? c.gn : c.ts) : gotoTab===tab.id ? c.acL : hov===`gt-${tab.id}` ? c.tx : c.ts,
                          fontSize: 8, fontWeight: gotoTab===tab.id ? 700 : 500 }}>
                        {tab.l}
                        {gotoTab===tab.id && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2, background: `linear-gradient(90deg, transparent, ${tab.id==="add" ? c.gn : c.acL}, transparent)`, boxShadow: `0 0 6px ${tab.id==="add" ? "rgba(0,212,161,0.2)" : c.acG}` }}/>}
                      </button>
                    ))}
                  </div>
                  <div style={{ flex: 1, overflowY: "auto" }}>
                    {gotoTab==="pinned" && (<div style={{ padding: "6px 8px" }}>
                      {gotoItems.filter(x=>x.pinned).length === 0 && <div style={{ textAlign: "center", padding: "30px 0" }}><I n="pin" s={18} cl={c.tm}/><div style={{ fontSize: 9, color: c.tm, marginTop: 6 }}>No pinned items</div><div style={{ fontSize: 8, color: c.tm, marginTop: 2 }}>Pin items from the All tab</div></div>}
                      {gotoItems.filter(x=>x.pinned).map(item => (
                        <div key={item.id} onMouseEnter={() => setHov(`gi-${item.id}`)} onMouseLeave={() => setHov(null)}
                          style={{ display: "flex", alignItems: "center", padding: "6px 8px", marginBottom: 2, background: hov===`gi-${item.id}` ? "rgba(255,255,255,0.03)" : c.well, border: `1px solid ${hov===`gi-${item.id}` ? c.brL : c.br}`, cursor: "pointer", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)" }}>
                          <div style={{ width: 5, height: 5, borderRadius: "50%", marginRight: 6, background: item.type==="datetime" ? c.acL : item.type==="daily" ? c.gn : c.gold }}/>
                          <span style={{ flex: 1, fontSize: 9, fontWeight: 600, color: hov===`gi-${item.id}` ? c.tx : c.ts }}>{item.label}</span>
                          {item.type==="daily" && <span style={{ fontSize: 7.5, color: c.tm, marginRight: 4, fontVariantNumeric: "tabular-nums" }}>{item.time} daily</span>}
                          {item.type==="price" && <span style={{ fontSize: 7.5, color: c.tm, marginRight: 4 }}>price</span>}
                          {item.type==="datetime" && <span style={{ fontSize: 7.5, color: c.tm, marginRight: 4 }}>once</span>}
                          <B primary small sx={{ padding: "2px 6px", fontSize: 7 }}>Go</B>
                        </div>
                      ))}
                    </div>)}
                    {gotoTab==="all" && (<div style={{ padding: "6px 8px" }}>
                      {gotoItems.length === 0 && <div style={{ textAlign: "center", padding: "30px 0" }}><div style={{ fontSize: 9, color: c.tm }}>No items yet</div></div>}
                      {gotoItems.map(item => (
                        <div key={item.id} onMouseEnter={() => setHov(`ga-${item.id}`)} onMouseLeave={() => setHov(null)}
                          style={{ display: "flex", alignItems: "center", padding: "5px 8px", marginBottom: 2, background: hov===`ga-${item.id}` ? "rgba(255,255,255,0.03)" : c.well, border: `1px solid ${hov===`ga-${item.id}` ? c.brL : c.br}`, boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)" }}>
                          <div style={{ width: 5, height: 5, borderRadius: "50%", marginRight: 6, background: item.type==="datetime" ? c.acL : item.type==="daily" ? c.gn : c.gold }}/>
                          <span style={{ flex: 1, fontSize: 9, fontWeight: 600, color: hov===`ga-${item.id}` ? c.tx : c.ts }}>{item.label}</span>
                          {item.type==="daily" && <span style={{ fontSize: 7, color: c.tm, marginRight: 4, fontVariantNumeric: "tabular-nums" }}>{item.time}</span>}
                          <div onClick={(e) => { e.stopPropagation(); setGotoItems(prev => prev.map(x => x.id===item.id ? {...x, pinned: !x.pinned} : x)); }}
                            onMouseEnter={() => setHov(`gap-${item.id}`)} onMouseLeave={() => setHov(`ga-${item.id}`)}
                            style={{ padding: 2, cursor: "pointer", marginRight: 2, opacity: item.pinned ? 1 : hov===`gap-${item.id}` ? 0.9 : 0.5, transform: hov===`gap-${item.id}` && !item.pinned ? "rotate(-25deg) scale(1.15)" : "none", transition: "all 0.15s" }}>
                            <I n={item.pinned ? "pinFill" : "pin"} s={9} cl={item.pinned ? c.gold : hov===`gap-${item.id}` ? c.gold : c.ts}/>
                          </div>
                          <div onClick={(e) => { e.stopPropagation(); setGotoItems(prev => prev.filter(x => x.id !== item.id)); }}
                            onMouseEnter={() => setHov(`gad-${item.id}`)} onMouseLeave={() => setHov(`ga-${item.id}`)}
                            style={{ padding: 2, cursor: "pointer", opacity: hov===`gad-${item.id}` ? 1 : 0.5 }}>
                            <I n="x" s={8} cl={hov===`gad-${item.id}` ? c.rd : c.ts}/>
                          </div>
                        </div>
                      ))}
                    </div>)}
                    {gotoTab==="add" && (<div style={{ padding: "8px 10px" }}>
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 7.5, fontWeight: 700, color: c.tm, letterSpacing: "0.06em", marginBottom: 5 }}>GO TO DATE & TIME <span style={{ color: c.acL, fontWeight: 500, letterSpacing: 0 }}>once</span></div>
                        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                          <div style={{ flex: 1, display: "flex", alignItems: "center", background: c.well, border: `1px solid ${c.br}`, padding: "4px 6px", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)" }}>
                            <span style={{ fontSize: 9, fontWeight: 600, color: c.tx, fontVariantNumeric: "tabular-nums", flex: 1 }}>2009-01-09</span>
                          </div>
                          <div style={{ width: 52, display: "flex", alignItems: "center", background: c.well, border: `1px solid ${c.br}`, padding: "4px 6px", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)" }}>
                            <span style={{ fontSize: 9, fontWeight: 600, color: c.tx, fontVariantNumeric: "tabular-nums" }}>07:00</span>
                          </div>
                          <button onClick={() => { setGotoItems(prev => [...prev, {id: gotoNextId(), type: "datetime", label: "09 Jan 2009 07:00", pinned: false}]); setGotoTab("all"); }}
                            onMouseEnter={() => setHov("gt-add1")} onMouseLeave={() => setHov(null)}
                            style={{ padding: "4px 8px", background: hov==="gt-add1" ? `linear-gradient(135deg,${c.acL},#6B8AFF)` : `linear-gradient(135deg,${c.ac},${c.acL})`, border: "none", color: "#fff", fontSize: 8, fontWeight: 700, fontFamily: F, cursor: "pointer" }}>Add</button>
                        </div>
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 7.5, fontWeight: 700, color: c.tm, letterSpacing: "0.06em", marginBottom: 5 }}>GO TO TIME <span style={{ color: c.gn, fontWeight: 500, letterSpacing: 0 }}>every day</span></div>
                        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                          <div style={{ flex: 1, display: "flex", alignItems: "center", background: c.well, border: `1px solid ${c.br}`, padding: "4px 6px", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)" }}>
                            <span style={{ fontSize: 9, fontWeight: 600, color: c.tx, fontVariantNumeric: "tabular-nums", flex: 1 }}>Custom Label</span>
                          </div>
                          <div style={{ width: 52, display: "flex", alignItems: "center", background: c.well, border: `1px solid ${c.br}`, padding: "4px 6px", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)" }}>
                            <span style={{ fontSize: 9, fontWeight: 600, color: c.tx, fontVariantNumeric: "tabular-nums" }}>08:00</span>
                          </div>
                          <button onClick={() => { setGotoItems(prev => [...prev, {id: gotoNextId(), type: "daily", label: "Custom Label", time: "08:00", pinned: false}]); setGotoTab("all"); }}
                            onMouseEnter={() => setHov("gt-add2")} onMouseLeave={() => setHov(null)}
                            style={{ padding: "4px 8px", background: hov==="gt-add2" ? `linear-gradient(135deg,${c.acL},#6B8AFF)` : `linear-gradient(135deg,${c.ac},${c.acL})`, border: "none", color: "#fff", fontSize: 8, fontWeight: 700, fontFamily: F, cursor: "pointer" }}>Add</button>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 7.5, fontWeight: 700, color: c.tm, letterSpacing: "0.06em", marginBottom: 5 }}>GO TO PRICE <span style={{ color: c.gold, fontWeight: 500, letterSpacing: 0 }}>once</span></div>
                        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                          <div style={{ flex: 1, display: "flex", alignItems: "center", background: c.well, border: `1px solid ${c.br}`, padding: "4px 6px", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)" }}>
                            <span style={{ fontSize: 9, color: c.tm }}>Enter price...</span>
                          </div>
                          <button onClick={() => { setGotoItems(prev => [...prev, {id: gotoNextId(), type: "price", label: "127.000", pinned: false}]); setGotoTab("all"); }}
                            onMouseEnter={() => setHov("gt-add3")} onMouseLeave={() => setHov(null)}
                            style={{ padding: "4px 8px", background: hov==="gt-add3" ? `linear-gradient(135deg,${c.acL},#6B8AFF)` : `linear-gradient(135deg,${c.ac},${c.acL})`, border: "none", color: "#fff", fontSize: 8, fontWeight: 700, fontFamily: F, cursor: "pointer" }}>Add</button>
                        </div>
                      </div>
                    </div>)}

                  </div>
                </div>}

            </div>

            <div style={{ flex: 1 }}/>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9 }}>
              <I n="goto" s={10} cl={c.ts}/>
              <span style={{ fontWeight: 600, color: c.ts, fontVariantNumeric: "tabular-nums" }}>(Fri) 2009-01-09 02:21:00</span>
            </div>

          </div>
          <div style={{ height: 110, flexShrink: 0, background: c.sf, borderTop: `1px solid ${c.br}`, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", height: 26, padding: "0 10px", borderBottom: `1px solid ${c.br}` }}>
              {["Positions (3)","Open Orders (0)","History"].map((t) => {
                const id = t.split(" ")[0].toLowerCase();
                return <button key={t} onClick={() => setBtmTab(id)} style={{ padding: "5px 12px", position: "relative", background: "transparent", border: "none", color: btmTab===id ? c.acL : c.ts, fontSize: 10, fontWeight: btmTab===id ? 700 : 600, cursor: "pointer", fontFamily: F }}>{t}{btmTab===id && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2, background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)` }}/>}</button>;
              })}
            </div>
            <div style={{ flex: 1, padding: "0 10px", overflow: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.5fr 1fr 1fr 0.8fr 0.5fr", fontSize: 8, color: c.tm, fontWeight: 700, letterSpacing: "0.06em", padding: "5px 0 3px", borderBottom: `1px solid ${c.br}` }}>
                <span>SYMBOL</span><span>SIZE</span><span>ENTRY</span><span>MARK</span><span>PNL</span><span></span>
              </div>
              {[{ sym: "EUR/JPY", side: "LONG", sz: "0.50", entry: "126,100", mark: "126,745", pnl: "+$1,090", pc: c.gn }].map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1.3fr 0.5fr 1fr 1fr 0.8fr 0.5fr", fontSize: 10, fontWeight: 600, padding: "4px 0", alignItems: "center", fontVariantNumeric: "tabular-nums", borderBottom: `1px solid ${c.br}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>{r.sym}<span style={{ padding: "0 3px", fontSize: 7, fontWeight: 800, background: c.gnD, color: c.gn, border: `1px solid ${c.gnB}` }}>{r.side}</span></div>
                  <span style={{ color: c.ts }}>{r.sz}</span><span style={{ color: c.ts }}>{r.entry}</span><span>{r.mark}</span>
                  <span style={{ color: r.pc, fontWeight: 700 }}>{r.pnl}</span>
                  <B small>Close</B>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ width: (rightPanel || orderPanelOpen) ? 280 : 0, flexShrink: 0, overflow: "hidden", transition: "width 0.2s ease" }}>
        {rightPanel ? (
        <div style={{ width: 280, height: "100%", background: c.sf, borderLeft: `1px solid ${c.br}`, display: "flex", flexDirection: "column", fontFamily: F }}>
          <div style={{ padding: "6px 10px", borderBottom: `1px solid ${c.br}`, display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, flex: 1 }}>{rightPanel==="news"?"News":rightPanel==="layers"?"Objects Tree":"Layout"}</span>
            <div onClick={() => setRightPanel(null)} style={{ cursor: "pointer", padding: 2 }}><I n="x" s={10} cl={c.ts}/></div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px", fontSize: 9 }}>
            {rightPanel==="news" && [
              {time:"12:30",n:"Core PPI m/m",co:"US",fc:"0.2%",pv:"0.5%",pc:c.gn},
              {time:"12:30",n:"Retail Sales",co:"US",fc:"0.8%",pv:"-1.1%",pc:c.rd},
              {time:"14:00",n:"Unemployment",co:"US",fc:"218K",pv:"217K",pc:c.ts},
              {time:"08:00",n:"ECB Rate",co:"EU",fc:"4.50%",pv:"4.50%",pc:c.ts},
            ].map((ev,i)=><div key={i} style={{padding:"5px 0",borderBottom:`1px solid ${c.br}`}}>
              <div style={{display:"flex",gap:4,marginBottom:2}}><span style={{fontWeight:700}}>{ev.time}</span><span style={{color:c.ts}}>{ev.co}</span><span style={{fontWeight:600}}>{ev.n}</span></div>
              <div style={{display:"flex",gap:6,fontSize:8}}><span style={{color:c.tm}}>Fcst: <span style={{color:c.tx}}>{ev.fc}</span></span><span style={{color:c.tm}}>Prev: <span style={{color:ev.pc}}>{ev.pv}</span></span></div>
            </div>)}
            {rightPanel==="layers" && <div style={{padding:"20px 0",textAlign:"center",color:c.tm}}>
              <div style={{marginBottom:4}}>1 Drawing</div>
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0"}}><div style={{width:5,height:5,borderRadius:"50%",background:c.acL}}/><span style={{color:c.ts}}>Trend Line</span></div>
            </div>}
            {rightPanel==="layout" && <div style={{padding:"6px 0"}}>
              {[1,2,3,4].map(n=><div key={n} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 0"}}>
                <span style={{fontSize:9,fontWeight:700,color:c.ts,width:14}}>{n}</span>
                <div onClick={()=>setLayoutPanels({n,li:0})} style={{width:24,height:16,display:"flex",gap:1,padding:1,cursor:"pointer",background:layoutPanels.n===n?c.acD:c.well,border:`1px solid ${layoutPanels.n===n?c.acB:c.br}`}}>{Array.from({length:n}).map((_,i)=><div key={i} style={{flex:1,background:layoutPanels.n===n?`${c.acL}44`:"rgba(255,255,255,0.12)"}}/>)}</div>
              </div>)}
            </div>}
          </div>
        </div>
        ) : orderPanelOpen ? (
        <div style={{ width: 280, background: c.sf, borderLeft: `1px solid ${c.br}`, display: "flex", flexDirection: "column", fontSize: 10, height: "100%" }}>
          <div style={{ padding: "6px 10px", borderBottom: `1px solid ${c.br}`, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>Place Order</span>
            <span style={{ padding: "0 5px", fontSize: 7.5, fontWeight: 800, color: c.acL, background: c.acD, border: `1px solid ${c.acB}` }}>{symbol}</span>
          </div>
          <div style={{ padding: "3px 10px", borderBottom: `1px solid ${c.br}`, fontSize: 8, color: c.tm }}>Spread: <span style={{ color: c.ts }}>0.00</span> ? Comm: <span style={{ color: c.ts }}>$0.00</span></div>
          <div style={{ padding: "4px 10px", borderBottom: `1px solid ${c.br}`, display: "flex", gap: 3 }}><Sel><option>- Select -</option></Sel><B small>Load</B><B small>Save</B><B small>Del</B></div>
          <div style={{ padding: "4px 10px 0", borderBottom: `1px solid ${c.br}` }}>
            <div style={{ display: "flex", marginBottom: 3 }}>
              {["BUY","SELL"].map((s) => { const a = buySell===s.toLowerCase(); const col = s==="BUY" ? c.gn : c.rd; return (
                <button key={s} onClick={() => setBuySell(s.toLowerCase())} style={{ flex: 1, padding: "5px 0", border: "none", position: "relative", background: a ? (s==="BUY" ? c.gnD : c.rdD) : "transparent", color: a ? col : c.ts, fontSize: 10, fontWeight: 800, fontFamily: F, cursor: "pointer" }}>
                  {s}{a && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2, background: `linear-gradient(90deg, transparent, ${col}, transparent)` }}/>}
                </button>);
              })}
            </div>
            <div style={{ display: "flex", paddingBottom: 2 }}>
              {["Market","Limit","Stop"].map((t) => { const a = orderType===t.toLowerCase(); return <button key={t} onClick={() => setOrderType(t.toLowerCase())} style={{ padding: "5px 12px", position: "relative", background: "transparent", border: "none", color: a ? c.acL : c.ts, fontSize: 10, fontWeight: a ? 700 : 600, fontFamily: F, cursor: "pointer" }}>{t}{a && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2, background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)` }}/>}</button>; })}
            </div>
          </div>
          <div style={{ padding: "4px 10px", borderBottom: `1px solid ${c.br}`, display: "flex", alignItems: "center", gap: 3 }}>
            {["$","%","#"].map((m) => { const a = sizeMode===m; return <button key={m} onClick={() => setSizeMode(m)} style={{ width: 20, height: 18, background: a ? c.well : "transparent", border: `1px solid ${a ? c.acB : "transparent"}`, color: a ? c.acL : c.tm, fontSize: 9, fontWeight: 800, fontFamily: F, cursor: "pointer" }}>{m}</button>; })}
            <div style={{ flex: 1, display: "flex", alignItems: "center", background: c.well, border: `1px solid ${c.br}`, padding: "2px 5px" }}><span style={{ color: c.tm, fontSize: 8 }}>$</span><span style={{ flex: 1, textAlign: "right", fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>100</span></div>
            <B small sx={{ padding: "2px 3px" }}><I n="minus" s={8}/></B><B small sx={{ padding: "2px 3px" }}><I n="plus" s={8}/></B>
          </div>
          <div style={{ padding: "4px 10px", borderBottom: `1px solid ${c.br}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 9, fontWeight: 800 }}>ENTRY</span>
              <div style={{ display: "flex", gap: 3, alignItems: "center" }}><span style={{ padding: "0 4px", fontSize: 7, fontWeight: 800, color: c.acL, background: c.acD }}>SINGLE</span><span style={{ fontSize: 7.5, fontWeight: 800, color: c.rd }}>? STOP LOSS</span></div>
            </div>
            <div style={{ padding: "4px 6px", background: c.well, border: `1px solid ${c.br}`, fontSize: 14, fontWeight: 800, textAlign: "right", fontVariantNumeric: "tabular-nums", marginBottom: 4 }}>126,530</div>
            {[{q:"1",r:"50",p:"50%",l:"0.32"},{q:"1",r:"50",p:"50%",l:"0.19"}].map((row,i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 2 }}>
                <MiniIn val={row.q} w={18}/><B small sx={{padding:"1px 2px"}}><I n="minus" s={6}/></B><B small sx={{padding:"1px 2px"}}><I n="plus" s={6}/></B>
                <MiniIn val={row.r} w={36} pre="$"/><B small sx={{padding:"1px 2px"}}><I n="minus" s={6}/></B><B small sx={{padding:"1px 2px"}}><I n="plus" s={6}/></B>
                <button style={{ width: 14, height: 16, background: c.rdD, border: `1px solid ${c.rdB}`, color: c.rd, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><I n="x" s={6} cl={c.rd}/></button>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, padding: "2px 5px", background: c.well, border: `1px solid ${c.br}`, marginTop: 3 }}>
              <span><span style={{ color: c.tm }}>Avg </span><span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>126.778</span></span>
              <span><span style={{ color: c.acL }}>Qty </span><span style={{ fontWeight: 700 }}>0.51 Lots</span></span>
            </div>
          </div>
          <div style={{ padding: "4px 10px", borderBottom: `1px solid ${c.br}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 5, height: 5, background: c.gold, transform: "rotate(45deg)" }}/>PROFIT TARGET</span>
              <span style={{ padding: "0 4px", fontSize: 7, fontWeight: 800, color: c.gn, background: c.gnD }}>SINGLE</span>
            </div>
            {[{p:"0",r:"-",pr:"0.00"},{p:"0",r:"-",pr:"0.00"}].map((_,i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 9, padding: "2px 0", borderBottom: `1px solid ${c.br}`, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ background: c.well, border: `1px solid ${c.br}`, padding: "1px 4px", fontSize: 8.5, width: 60 }}>0</span>
                <span style={{ color: c.ts }}>-</span><span style={{ color: c.gn, fontWeight: 700 }}>0.00</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5, marginTop: 2 }}><span style={{ color: c.tm }}>Blended</span><span style={{ fontWeight: 800, color: c.gn }}>0.0R ? +$0.00</span></div>
            <div style={{ height: 2.5, background: c.rd, marginTop: 3, opacity: 0.6 }}/><div style={{ height: 2.5, background: `repeating-linear-gradient(90deg,${c.gn} 0,${c.gn} 4px,transparent 4px,transparent 8px)`, opacity: 0.35, marginTop: 1 }}/>
          </div>
          <div style={{ padding: "4px 10px", borderBottom: `1px solid ${c.br}`, display: "flex", alignItems: "center", gap: 6 }}>
            <Toggle on={advOpen} onClick={() => setAdvOpen(!advOpen)} color={c.gold}/><span style={{ fontSize: 9, fontWeight: 600, color: advOpen ? c.tx : c.ts }}>Advanced</span>
          </div>
          {advOpen && <div style={{ borderBottom: `1px solid ${c.br}` }}>
            <div style={{ display: "flex" }}>
              {["breakeven","trailing"].map((m) => <button key={m} onClick={() => setAdvMode(m)} style={{ flex: 1, padding: "4px 0", background: advMode===m ? c.acD : "transparent", border: "none", borderBottom: advMode===m ? `2px solid ${c.gn}` : "2px solid transparent", color: advMode===m ? c.gn : c.ts, fontSize: 8.5, fontWeight: 700, fontFamily: F, cursor: "pointer" }}>{m==="breakeven" ? "Breakeven" : "Trailing SL"}</button>)}
            </div>
            <div style={{ padding: "5px 10px" }}>
              {advMode==="breakeven" ? (
                <div style={{ display: "flex", gap: 3, alignItems: "center", fontSize: 8, flexWrap: "wrap" }}>
                  <span style={{ color: c.tm }}>After</span><MiniIn val="0.5" w={28}/><span style={{ color: c.tm }}>R ? entry +</span><MiniIn val="0" w={24}/><span style={{ color: c.tm }}>pts</span>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 3, alignItems: "center", fontSize: 8, flexWrap: "wrap" }}>
                  <span style={{ color: c.tm }}>After</span><MiniIn val="1" w={22}/><span style={{ color: c.tm }}>R trail</span><MiniIn val="0.5" w={26}/><span style={{ color: c.tm }}>every</span><MiniIn val="0.25" w={28}/><span style={{ color: c.tm }}>R</span>
                </div>
              )}
            </div>
          </div>}
          <div style={{ padding: "4px 10px", marginTop: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5 }}><span style={{ color: c.gn, fontWeight: 700 }}>Reward</span><span style={{ color: c.gn }}><I n="link" s={9} cl={c.gn}/></span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5 }}><span style={{ color: c.rd, fontWeight: 700 }}>Risk</span><span style={{ color: c.rd, fontWeight: 700 }}>$100.00</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5 }}><span style={{ color: c.tm }}>Margin</span><span style={{ color: c.gn, fontWeight: 700 }}>5882%</span></div>
          </div>
          <div style={{ padding: "6px 10px" }}>
            <button style={{ width: "100%", padding: "10px 0", background: buySell==="buy" ? `linear-gradient(135deg,${c.gn},#00B88A)` : `linear-gradient(135deg,${c.rd},#E8405A)`, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 3px 12px ${buySell==="buy" ? "rgba(0,212,161,0.20)" : "rgba(255,80,104,0.20)"}`, clipPath: "polygon(4px 0,calc(100% - 4px) 0,100% 4px,100% calc(100% - 4px),calc(100% - 4px) 100%,4px 100%,0 calc(100% - 4px),0 4px)" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#fff", letterSpacing: "0.06em" }}>{buySell==="buy" ? "Buy" : "Sell"} 0.51 {symbol}</span>
            </button>
          </div>
        </div>
        ) : null}
        </div>
      </div>
      <div style={{ height: 14, flexShrink: 0, background: c.sf, borderTop: `1px solid ${c.br}` }}/>
      {dragging && (
        <div
          onMouseMove={(e) => {
            const dx = e.clientX - dragging.startX;
            const dy = e.clientY - dragging.startY;
            if (dragging.target === "settings") setSettingsPos({ x: dragging.ox + dx, y: dragging.oy + dy });
            else if (dragging.target === "ind") setIndPos({ x: dragging.ox + dx, y: dragging.oy + dy });
            else if (dragging.target === "profile") setProfilePos({ x: dragging.ox + dx, y: dragging.oy + dy });
            else if (dragging.target === "faq") setFaqPos({ x: dragging.ox + dx, y: dragging.oy + dy });
            else if (dragging.target === "news") setNewsPos({ x: dragging.ox + dx, y: dragging.oy + dy });
            else if (dragging.target === "screenshot") setScreenshotPos({ x: dragging.ox + dx, y: dragging.oy + dy });
            else if (dragging.target === "layers") setLayersPos({ x: dragging.ox + dx, y: dragging.oy + dy });
            else if (dragging.target === "layout") setLayoutPos({ x: dragging.ox + dx, y: dragging.oy + dy });
          }}
          onMouseUp={() => setDragging(null)}
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99998, cursor: "move" }}
        />
      )}
    </div>
  );
};

export default TalariaV8b;
