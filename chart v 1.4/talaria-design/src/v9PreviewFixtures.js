/**
 * Local/preview fixture data for empty chrome surfaces.
 * Enable: localhost / 127.0.0.1, ?v9Mockups=1, or window.__V9_CHROME_MOCKUPS__ = true
 * Disable: ?v9Mockups=0 or window.__V9_CHROME_MOCKUPS__ = false
 */

export function v9PreviewFixturesEnabled() {
  try {
    if (typeof window === "undefined") return false;
    if (window.__V9_CHROME_MOCKUPS__ === true) return true;
    if (window.__V9_CHROME_MOCKUPS__ === false) return false;
    const q = new URLSearchParams(window.location.search);
    if (q.get("v9Mockups") === "1") return true;
    if (q.get("v9Mockups") === "0") return false;
    const h = window.location.hostname || "";
    return h === "localhost" || h === "127.0.0.1";
  } catch {
    return false;
  }
}

/** Preview PRE/POST variable defs when Strategies Lab has none — same shape as session*ToTagDefs. */
export function v9FixturePreTagDefs() {
  return [
    { id: "fx_style", label: "Style", type: "multi", options: ["Trend", "Fade", "Breakout", "News", "Scalp"] },
    { id: "fx_grade", label: "Grade", type: "multi", options: ["A+", "A", "B", "C"] },
    { id: "fx_session", label: "Session", type: "multi", options: ["London", "NY", "Asia"] },
    { id: "fx_confluence", label: "Confluence", type: "bool", options: [] },
  ];
}

export function v9FixturePostTagDefs() {
  return [
    { id: "fx_outcome", label: "Outcome", type: "multi", options: ["Plan", "Early exit", "Held too long", "BE scratch"] },
    { id: "fx_emotion", label: "Emotion", type: "multi", options: ["Calm", "FOMO", "Revenge", "Tilt"] },
    { id: "fx_review", label: "Review done", type: "bool", options: [] },
    { id: "fx_news", label: "News", type: "multi", options: ["NFP", "FOMC", "CPI", "None"] },
  ];
}

/** Synthetic R-path for path-cloud preview (in-trade + short post-exit). */
function v9FixtureRPath(win, seed = 0) {
  const n = 14;
  const inPts = [];
  let r = 0;
  for (let i = 0; i < n; i += 1) {
    const drift = win ? 0.12 : -0.1;
    const wobble = Math.sin((i + seed) * 0.9) * 0.18 + ((seed % 5) - 2) * 0.02;
    r += drift + wobble * 0.35;
    inPts.push(Number(r.toFixed(3)));
  }
  if (win && inPts[inPts.length - 1] < 0.2) inPts[inPts.length - 1] = 0.85;
  if (!win && inPts[inPts.length - 1] > -0.2) inPts[inPts.length - 1] = -0.9;
  const exit = inPts[inPts.length - 1];
  const post = [exit, exit + (win ? -0.15 : 0.12), exit + (win ? -0.08 : 0.05)];
  return { bar_close_r: inPts, post_exit_bar_close_r: post };
}

/**
 * Journal-analytics payload shaped like buildJournalAnalyticsFromOrderManager,
 * derived from closed fixture rows so Analytics has a real preview composition.
 */
export function v9FixtureJournalAnalytics(theme = {}) {
  const rows = v9FixtureTradeRows(theme).filter((r) => r.status === "closed");
  const initial = 10000;
  const list = rows.map((r, i) => {
    const pnl = parseFloat(String(r.pnl).replace(/[$,+]/g, ""));
    const win = Number.isFinite(pnl) && pnl >= 0;
    const path = v9FixtureRPath(win, i + 1);
    const preTags = Array.isArray(r.preTags) ? r.preTags.slice() : [];
    const postTags = Array.isArray(r.postTags) ? r.postTags.slice() : [];
    return {
      trade_id: r.omId,
      symbol: r.sym,
      pnl: Number.isFinite(pnl) ? pnl : 0,
      date: new Date(r._sortMs || Date.now()).toISOString(),
      close_time: new Date(r._sortMs || Date.now()).toISOString(),
      strategy: preTags[0] || "Other",
      preTags,
      postTags,
      ...path,
      mfe_r: win ? 1.4 : 0.35,
      mae_r: win ? -0.4 : -1.2,
      rMultiple: win ? 1.1 : -0.9,
      _fixture: true,
    };
  });
  const pnls = list.map((e) => e.pnl);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const total_pnl = pnls.reduce((s, p) => s + p, 0);
  const grossProfit = wins.reduce((s, p) => s + p, 0);
  const grossLossAbs = Math.abs(losses.reduce((s, p) => s + p, 0));
  const denom = wins.length + losses.length;
  const symMap = new Map();
  const bucketTags = (which) => {
    const mm = new Map();
    for (const e of list) {
      const tags = which === "post" ? e.postTags : e.preTags;
      const seen = new Set();
      for (const raw of tags || []) {
        const tag = String(raw || "").trim();
        if (!tag || seen.has(tag)) continue;
        seen.add(tag);
        if (!mm.has(tag)) mm.set(tag, { tag, pnls: [] });
        mm.get(tag).pnls.push(e.pnl);
      }
    }
    return [...mm.values()]
      .map((b) => {
        const w = b.pnls.filter((p) => p > 0).length;
        const l = b.pnls.filter((p) => p < 0).length;
        const d = w + l;
        return {
          tag: b.tag,
          total_trades: b.pnls.length,
          win_rate: d > 0 ? (w / d) * 100 : null,
          total_pnl: b.pnls.reduce((s, p) => s + p, 0),
        };
      })
      .sort((a, b) => Math.abs(b.total_pnl) - Math.abs(a.total_pnl));
  };
  for (const e of list) {
    const sym = String(e.symbol || "").replace(/\//g, "").toUpperCase();
    if (!symMap.has(sym)) symMap.set(sym, { symbol: sym, total_trades: 0, total_pnl: 0 });
    const sb = symMap.get(sym);
    sb.total_trades += 1;
    sb.total_pnl += e.pnl;
  }
  const preTags = bucketTags("pre");
  const postTags = bucketTags("post");
  return {
    stats: {
      total_trades: list.length,
      winning_trades: wins.length,
      losing_trades: losses.length,
      total_pnl,
      avg_win: wins.length ? grossProfit / wins.length : null,
      avg_loss: losses.length ? grossLossAbs / losses.length : null,
      win_rate: denom > 0 ? (wins.length / denom) * 100 : null,
      profit_factor: grossLossAbs > 0 ? grossProfit / grossLossAbs : grossProfit > 0 ? Infinity : null,
      balance: initial + total_pnl,
      equity: initial + total_pnl,
      initial_balance: initial,
    },
    symbols: [...symMap.values()].sort((a, b) => Math.abs(b.total_pnl) - Math.abs(a.total_pnl)),
    preTags,
    postTags,
    strategies: preTags.map((b) => ({
      strategy: b.tag,
      total_trades: b.total_trades,
      win_rate: b.win_rate,
      total_pnl: b.total_pnl,
    })),
    list,
    source: "fixture",
  };
}

/** Rows shaped like buildLiveTradeRowsFromOrderManager output. */
export function v9FixtureTradeRows(theme = {}) {
  const gn = theme.gn || "#00D4A1";
  const rd = theme.rd || "#E53935";
  const tm = theme.tm || "rgba(255,255,255,0.45)";
  const now = Date.now();
  const mk = (partial) => ({
    userTradeId: null,
    journalTradeId: null,
    tp: "—",
    sl: "—",
    preTags: [],
    postTags: [],
    _fixture: true,
    ...partial,
  });
  // TIME matches live v9FormatTradeTime: "Aug 6 22:04" (compact — fits the TIME track).
  return [
    mk({
      id: "#1842",
      omId: 1842,
      _sortMs: now - 3600e3,
      _openMs: now - 4320e3,
      time: "Aug 6 22:04",
      status: "open",
      sym: "EUR/JPY",
      side: "LONG",
      sz: "0.40",
      type: "Market",
      entry: "178.420",
      exit: "—",
      pnl: "+86.40",
      pc: gn,
      dur: "1h 12m",
      preTags: ["Trend", "A+"],
      postTags: [],
    }),
    mk({
      id: "#1841",
      omId: 1841,
      _sortMs: now - 7200e3,
      _openMs: now - 7200e3,
      time: "Aug 6 21:18",
      status: "open",
      sym: "GBP/USD",
      side: "SHORT",
      sz: "0.25",
      type: "Market",
      entry: "1.27480",
      exit: "—",
      pnl: "-22.10",
      pc: rd,
      dur: "1h 58m",
      preTags: ["Fade", "London"],
      postTags: [],
    }),
    mk({
      id: "#1840",
      omId: 1840,
      _sortMs: now - 9000e3,
      _openMs: now - 9000e3,
      time: "Aug 6 20:55",
      status: "pending",
      sym: "XAU/USD",
      side: "LONG",
      sz: "0.10",
      type: "Limit",
      entry: "2388.40",
      exit: "—",
      pnl: "—",
      pc: tm,
      dur: "—",
      preTags: ["Breakout"],
      postTags: [],
    }),
    mk({
      id: "#1839",
      omId: 1839,
      _sortMs: now - 10800e3,
      _openMs: now - 10800e3,
      time: "Aug 6 19:42",
      status: "pending",
      sym: "USD/JPY",
      side: "LONG",
      sz: "0.50",
      type: "Stop",
      entry: "147.820",
      exit: "—",
      pnl: "—",
      pc: tm,
      dur: "—",
      preTags: ["News", "NY"],
      postTags: [],
    }),
    mk({
      id: "#1838",
      omId: 1838,
      _sortMs: now - 14400e3,
      _openMs: now - 16920e3,
      time: "Aug 6 18:10",
      status: "closed",
      sym: "EUR/USD",
      side: "SHORT",
      sz: "0.30",
      type: "Market",
      /** Weighted avg of the three entry legs below. */
      entry: "1.08422",
      exit: "1.08265",
      pnl: "+46.50",
      pc: gn,
      dur: "42m",
      tp: "1.08147",
      sl: "1.08510",
      preTags: ["News", "Confluence"],
      postTags: ["Plan", "NFP", "Calm"],
      mae: "1.08495",
      mfe: "1.08180",
      maeR: "-0.55R",
      mfeR: "+1.65R",
      commission: "-$2.10",
      spread: "0.8 pips",
      /** Multi-entry demo — legs + Avg entry footer on the trade card. */
      entries: [
        { price: "1.08450", qty: "0.10", filled: true },
        { price: "1.08420", qty: "0.12", filled: true },
        { price: "1.08390", qty: "0.08", filled: true },
      ],
      /** Multi-TP demo — TP1/TP2 hit, TP3 still open; Avg TP + Hit avg footers. */
      targets: [
        { label: "TP1", price: "1.08280", pct: "40%", profit: "+$18.60", hit: true },
        { label: "TP2", price: "1.08140", pct: "35%", profit: "+$22.40", hit: true },
        { label: "TP3", price: "1.08020", pct: "25%", profit: "+$12.80", hit: false },
      ],
      targetsTotalProfit: "+$41.00",
      targetsTotalIsRealized: true,
      targetsPlannedProfit: "+$53.80",
      avgMetrics: {
        showAvgRow: true,
        plannedAvgEntry: "1.08422",
        plannedAvgTarget: "1.08147",
        actualAvgEntry: "1.08422",
        actualAvgTarget: "1.08215",
        filledCount: 3,
        entryCount: 3,
        hitCount: 2,
        targetCount: 3,
        showActualAvg: true,
      },
    }),
    mk({
      id: "#1837",
      omId: 1837,
      _sortMs: now - 21600e3,
      _openMs: now - 25560e3,
      time: "Aug 6 16:03",
      status: "closed",
      sym: "NAS100",
      side: "LONG",
      sz: "1.00",
      type: "Market",
      entry: "19842.5",
      exit: "19791.0",
      pnl: "-128.00",
      pc: rd,
      dur: "1h 06m",
      tp: "19920.0",
      sl: "19780.0",
      preTags: ["Breakout"],
      postTags: ["Held too long", "FOMO"],
      mae: "19772.5",
      mfe: "19888.0",
      maeR: "-1.12R",
      mfeR: "+0.73R",
      commission: "-$4.00",
      spread: "1.0 pts",
    }),
    mk({
      id: "#1836",
      omId: 1836,
      _sortMs: now - 28800e3,
      _openMs: now - 36840e3,
      time: "Aug 6 14:28",
      status: "closed",
      sym: "EUR/JPY",
      side: "LONG",
      sz: "0.40",
      type: "Market",
      entry: "177.910",
      exit: "178.340",
      pnl: "+172.00",
      pc: gn,
      dur: "2h 14m",
      tp: "178.420",
      sl: "177.620",
      preTags: ["Trend", "A+", "London"],
      postTags: ["Plan", "Review done"],
      mae: "177.780",
      mfe: "178.410",
      maeR: "-0.45R",
      mfeR: "+1.72R",
      commission: "-$2.80",
      spread: "1.2 pips",
    }),
    mk({
      id: "#1835",
      omId: 1835,
      _sortMs: now - 39600e3,
      _openMs: now - 41280e3,
      time: "Aug 6 11:05",
      status: "closed",
      sym: "GBP/JPY",
      side: "SHORT",
      sz: "0.20",
      type: "Market",
      entry: "192.640",
      exit: "192.510",
      pnl: "+34.80",
      pc: gn,
      dur: "28m",
      tp: "—",
      sl: "—",
      preTags: ["Scalp"],
      postTags: ["BE scratch"],
      mae: "192.780",
      mfe: "192.420",
      maeR: "-0.38R",
      mfeR: "+0.92R",
      commission: "-$1.40",
      spread: "1.5 pips",
    }),
  ];
}

export function v9FixtureSupportThreads() {
  const uid = 1;
  return [
    {
      id: "fx-t1",
      subject: "Chart freezes after switching to 1W",
      category: "bug",
      status: "open",
      user_id: uid,
      last_message_preview: "Thanks — we can reproduce on EUR/JPY…",
      last_message_at: new Date(Date.now() - 20 * 60e3).toISOString(),
      _fixture: true,
    },
    {
      id: "fx-t2",
      subject: "Billing receipt for July",
      category: "billing",
      status: "open",
      user_id: uid,
      last_message_preview: "Invoice PDF attached.",
      last_message_at: new Date(Date.now() - 26 * 3600e3).toISOString(),
      _fixture: true,
    },
    {
      id: "fx-t3",
      subject: "Request: sync drawings across layouts",
      category: "feature",
      status: "open",
      user_id: uid,
      last_message_preview: "Noted — scoping against multi-panel.",
      last_message_at: new Date(Date.now() - 2 * 86400e3).toISOString(),
      _fixture: true,
    },
    {
      id: "fx-t4",
      subject: "Login loop on embedded multichart",
      category: "access",
      status: "closed",
      user_id: uid,
      last_message_preview: "Fixed in the embed auth soft-fail.",
      last_message_at: new Date(Date.now() - 3 * 86400e3).toISOString(),
      _fixture: true,
    },
  ];
}

export function v9FixtureSupportMessages(threadId) {
  const uid = 1;
  const agent = 99;
  if (threadId === "fx-t1") {
    return [
      {
        id: "fx-m1",
        sender_user_id: uid,
        body: "After I switch EUR/JPY to 1W the chart freezes for ~8s, then redraws.",
        created_at: new Date(Date.now() - 90 * 60e3).toISOString(),
        read_by_counterparty: true,
      },
      {
        id: "fx-m2",
        sender_user_id: agent,
        body: "Got it — can you attach a screenshot of the frozen state?",
        created_at: new Date(Date.now() - 70 * 60e3).toISOString(),
      },
      {
        id: "fx-m3",
        sender_user_id: uid,
        body: "Attached. Indicators were closed; Objects had EMA 21 + RSI.",
        created_at: new Date(Date.now() - 40 * 60e3).toISOString(),
        read_by_counterparty: true,
      },
      {
        id: "fx-m4",
        sender_user_id: agent,
        body: "Thanks — we can reproduce on EUR/JPY. Next step is a console capture around the freeze.",
        created_at: new Date(Date.now() - 20 * 60e3).toISOString(),
      },
    ];
  }
  return [
    {
      id: "fx-m0",
      sender_user_id: uid,
      body: "Thanks for opening this thread.",
      created_at: new Date(Date.now() - 3600e3).toISOString(),
      read_by_counterparty: true,
    },
    {
      id: "fx-m0b",
      sender_user_id: agent,
      body: "We’re on it — reply here anytime.",
      created_at: new Date(Date.now() - 1800e3).toISOString(),
    },
  ];
}

/** Objects tree rows when the chart has no drawings (preview only). */
export function v9FixtureLayersItems() {
  // Newest → oldest (shared indicator icon; drawings keep tool-specific icons).
  return [
    { id: "fx-hl", icon: "hline", name: "Daily open", _visible: false, _tfVisibleOnChart: true, _locked: false, _fixture: true, _sortMs: 9005 },
    { id: "fx-note", icon: "note", name: "Breakout note", _visible: true, _tfVisibleOnChart: true, _locked: false, _fixture: true, _sortMs: 9004 },
    { id: "fx-fib", icon: "fib", name: "Fib retracement", _visible: true, _tfVisibleOnChart: true, _locked: false, _fixture: true, _sortMs: 9003 },
    { id: "fx-zone", icon: "rect", name: "Supply zone", _visible: true, _tfVisibleOnChart: true, _locked: false, _fixture: true, _sortMs: 9002 },
    { id: "fx-tl", icon: "trendline", name: "Trendline 1", _visible: true, _tfVisibleOnChart: true, _locked: false, _fixture: true, _sortMs: 9001 },
    { id: "fx-vol", icon: "indicator", name: "Volume", _visible: false, _tfVisibleOnChart: true, _locked: false, _fixture: true, _sortMs: 8004 },
    { id: "fx-macd", icon: "indicator", name: "MACD", _visible: true, _tfVisibleOnChart: true, _locked: false, _fixture: true, _sortMs: 8003 },
    { id: "fx-rsi", icon: "indicator", name: "RSI 14", _visible: true, _tfVisibleOnChart: true, _locked: false, _fixture: true, _sortMs: 8002 },
    { id: "fx-ema", icon: "indicator", name: "EMA 21", _visible: true, _tfVisibleOnChart: true, _locked: false, _fixture: true, _sortMs: 8001 },
  ];
}

/**
 * News list rows matching the mapped shape in TalariaV8bLive news panel.
 */
export function v9FixtureNewsRows() {
  return [
    // Previous — clear Act vs Fcst examples (miss / in-line / beat).
    {
      id: "fx-nfp",
      time: "14:30",
      countdown: null,
      country: "US",
      impact: "high",
      title: "Nonfarm Payrolls",
      date: "Thu 6 Aug",
      actual: "175K",
      forecast: "185K",
      previous: "206K",
      snippet: "",
      source: "",
      url: "",
      kind: "calendar",
      tab: "previous",
    },
    {
      id: "fx-unemp",
      time: "14:30",
      countdown: null,
      country: "US",
      impact: "high",
      title: "Unemployment Rate",
      date: "Thu 6 Aug",
      actual: "4.2%",
      forecast: "4.2%",
      previous: "4.1%",
      snippet: "",
      source: "",
      url: "",
      kind: "calendar",
      tab: "previous",
    },
    {
      id: "fx-ecb",
      time: "12:00",
      countdown: null,
      country: "EU",
      impact: "med",
      title: "ECB Deposit Facility Rate",
      date: "Thu 6 Aug",
      actual: "3.75%",
      forecast: "3.75%",
      previous: "4.00%",
      snippet: "",
      source: "",
      url: "",
      kind: "calendar",
      tab: "previous",
    },
    {
      id: "fx-gdp",
      time: "09:15",
      countdown: null,
      country: "GB",
      impact: "med",
      title: "GDP m/m",
      date: "Thu 6 Aug",
      actual: "0.2%",
      forecast: "0.1%",
      previous: "0.0%",
      snippet: "",
      source: "",
      url: "",
      kind: "calendar",
      tab: "previous",
    },
    {
      id: "fx-cpi",
      time: "08:30",
      countdown: null,
      country: "US",
      impact: "high",
      title: "Core CPI m/m",
      date: "Thu 6 Aug",
      actual: "0.3%",
      forecast: "0.2%",
      previous: "0.2%",
      snippet: "",
      source: "",
      url: "",
      kind: "calendar",
      tab: "previous",
    },
    {
      id: "fx-retail",
      time: "08:00",
      countdown: null,
      country: "EU",
      impact: "med",
      title: "Retail Sales m/m",
      date: "Thu 6 Aug",
      actual: "-0.4%",
      forecast: "0.1%",
      previous: "0.0%",
      snippet: "",
      source: "",
      url: "",
      kind: "calendar",
      tab: "previous",
    },
    {
      id: "fx-head1",
      time: "07:42",
      countdown: null,
      country: "US",
      impact: "low",
      title: "Dollar steadies ahead of NFP as yields hold range",
      date: "Thu 6 Aug",
      actual: "",
      forecast: "",
      previous: "",
      snippet: "Markets price a cooler payroll print; DXY firm near session highs.",
      source: "Reuters",
      url: "",
      kind: "headline",
      tab: "previous",
    },
    {
      id: "fx-head2",
      time: "06:05",
      countdown: null,
      country: "JP",
      impact: "low",
      title: "Yen softens after BoJ members keep gradual-tightening tone",
      date: "Thu 6 Aug",
      actual: "",
      forecast: "",
      previous: "",
      snippet: "USD/JPY probes resistance as risk appetite stabilizes in Asia.",
      source: "Bloomberg",
      url: "",
      kind: "headline",
      tab: "previous",
    },
    // Upcoming — forecast/previous only (no actual yet).
    {
      id: "fx-up-nfp",
      time: "14:30",
      countdown: "in 2h 12m",
      country: "US",
      impact: "high",
      title: "Nonfarm Payrolls",
      date: "Fri 7 Aug",
      actual: "",
      forecast: "190K",
      previous: "175K",
      snippet: "",
      source: "",
      url: "",
      kind: "calendar",
      tab: "upcoming",
    },
    {
      id: "fx-up-unemp",
      time: "14:30",
      countdown: "in 2h 12m",
      country: "US",
      impact: "high",
      title: "Unemployment Rate",
      date: "Fri 7 Aug",
      actual: "",
      forecast: "4.2%",
      previous: "4.2%",
      snippet: "",
      source: "",
      url: "",
      kind: "calendar",
      tab: "upcoming",
    },
  ];
}
