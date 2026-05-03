/**
 * Maps chart.orderManager state → bottom-panel trade rows (shared by TalariaV8b + TalariaV8bLive).
 */

function v9FormatTradeTime(ms) {
  if (!ms || !Number.isFinite(ms)) return "— — —";
  const d = new Date(ms);
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  const day = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${mo} ${day} ${hh}:${mm}`;
}

function v9DisplaySymbol(ticker) {
  const t = String(ticker || "").toUpperCase().replace(/\//g, "");
  if (t.length === 6 && /^[A-Z]{6}$/.test(t)) return `${t.slice(0, 3)}/${t.slice(3)}`;
  return t || "—";
}

function v9TradeDuration(openMs, closeMs, nowMs = Date.now()) {
  const end = Number.isFinite(closeMs) ? closeMs : nowMs;
  const ms = end - (openMs || end);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function v9UsdPnLParts(n) {
  if (!Number.isFinite(n)) return { text: "—", pc: null };
  const sign = n >= 0 ? "+" : "-";
  const abs = Math.abs(n);
  const text = `${sign}$${abs.toFixed(2)}`;
  return { text, pc: n >= 0 ? "gn" : "rd" };
}

/**
 * @param {object|null} om - window.chart.orderManager
 * @param {{ gn: string, rd: string, tm: string }} theme - palette fragment `c`
 */
export function buildLiveTradeRowsFromOrderManager(om, theme) {
  if (!om) return [];
  const rowNowMs =
    typeof window !== "undefined" && Number.isFinite(window.chart?.replaySystem?.replayTimestamp)
      ? window.chart.replaySystem.replayTimestamp
      : Date.now();
  const fmtPx = (p) => {
    const x = Number.parseFloat(p);
    if (!Number.isFinite(x)) return "—";
    try {
      return typeof om.formatPrice === "function" ? om.formatPrice(x) : String(x);
    } catch (_) {
      return String(x);
    }
  };
  const fmtQty = (q) => {
    const x = Number.parseFloat(q);
    if (!Number.isFinite(x)) return "—";
    try {
      return typeof om.formatQuantity === "function" ? om.formatQuantity(x) : x.toFixed(2);
    } catch (_) {
      return x.toFixed(2);
    }
  };
  const sideStr = (dir) => {
    const u = String(dir || "").toUpperCase();
    return u === "SELL" ? "SHORT" : "LONG";
  };
  const typeLabel = (ot) => {
    const u = String(ot || "").toLowerCase();
    if (u === "limit") return "Limit";
    if (u === "stop") return "Stop";
    if (u === "market") return "Market";
    return ot ? String(ot).charAt(0).toUpperCase() + String(ot).slice(1).toLowerCase() : "—";
  };
  const rows = [];
  const pend = [...(om.pendingOrders || [])];
  const open = [...(om.openPositions || [])];
  const closed = [...(om.closedPositions || [])];

  pend.forEach((o) => {
    const tMs = o.placedTime || o.openTime || Date.now();
    const tpTxt = o.takeProfit != null && Number.isFinite(Number.parseFloat(o.takeProfit)) ? fmtPx(o.takeProfit) : "—";
    const slTxt = o.stopLoss != null && Number.isFinite(Number.parseFloat(o.stopLoss)) ? fmtPx(o.stopLoss) : "—";
    rows.push({
      id: `#${o.id}`,
      omId: o.id,
      _sortMs: tMs,
      time: v9FormatTradeTime(tMs),
      status: "pending",
      sym: v9DisplaySymbol(o.ticker || o.symbol),
      side: sideStr(o.direction),
      sz: fmtQty(o.quantity),
      type: typeLabel(o.orderType),
      entry: fmtPx(o.entryPrice),
      exit: "—",
      pnl: "—",
      pc: theme.tm,
      tp: tpTxt,
      sl: slTxt,
      dur: "—",
      preTags: [],
      postTags: [],
    });
  });

  open.forEach((o) => {
    const tMs = o.openTime || Date.now();
    const uPnL = Number.parseFloat(o.unrealizedPnL);
    const { text: pnlText, pc } = v9UsdPnLParts(uPnL);
    const tpTxt = o.takeProfit != null && Number.isFinite(Number.parseFloat(o.takeProfit)) ? fmtPx(o.takeProfit) : "—";
    const slTxt = o.stopLoss != null && Number.isFinite(Number.parseFloat(o.stopLoss)) ? fmtPx(o.stopLoss) : "—";
    const ot = o.orderType ? typeLabel(o.orderType) : "Market";
    rows.push({
      id: `#${o.id}`,
      omId: o.id,
      _sortMs: tMs,
      time: v9FormatTradeTime(tMs),
      status: "open",
      sym: v9DisplaySymbol(o.ticker || o.symbol),
      side: sideStr(o.type || o.direction),
      sz: fmtQty(o.quantity),
      type: ot,
      entry: fmtPx(o.openPrice),
      exit: "—",
      pnl: pc ? pnlText : "—",
      pc: pc ? theme[pc] : theme.tm,
      tp: tpTxt,
      sl: slTxt,
      dur: v9TradeDuration(tMs, null, rowNowMs),
      preTags: [],
      postTags: [],
    });
  });

  closed.forEach((o) => {
    const tOpen = o.openTime;
    const tClose = o.closeTime;
    const sortMs = Number.isFinite(tClose) ? tClose : tOpen || 0;
    const pnlN = Number.parseFloat(o.pnl);
    const { text: pnlText, pc } = v9UsdPnLParts(pnlN);
    const tpTxt = o.takeProfit != null && Number.isFinite(Number.parseFloat(o.takeProfit)) ? fmtPx(o.takeProfit) : "—";
    const slTxt = o.stopLoss != null && Number.isFinite(Number.parseFloat(o.stopLoss)) ? fmtPx(o.stopLoss) : "—";
    const ot = o.orderType ? typeLabel(o.orderType) : "Market";
    rows.push({
      id: `#${o.id}`,
      omId: o.id,
      _sortMs: sortMs,
      time: v9FormatTradeTime(tOpen || tClose),
      status: "closed",
      sym: v9DisplaySymbol(o.ticker || o.symbol),
      side: sideStr(o.type || o.direction),
      sz: fmtQty(o.quantity),
      type: ot,
      entry: fmtPx(o.openPrice),
      exit: fmtPx(o.closePrice),
      pnl: pnlText,
      pc: pc ? theme[pc] : theme.tm,
      tp: tpTxt,
      sl: slTxt,
      dur: v9TradeDuration(tOpen, tClose),
      preTags: [],
      postTags: [],
      mae: o.mae != null && Number.isFinite(Number.parseFloat(o.mae)) ? fmtPx(o.mae) : undefined,
      mfe: o.mfe != null && Number.isFinite(Number.parseFloat(o.mfe)) ? fmtPx(o.mfe) : undefined,
    });
  });

  rows.sort((a, b) => (b._sortMs || 0) - (a._sortMs || 0));
  return rows;
}
