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

function findJournalEntry(om, tradeId) {
  const id = Number(tradeId);
  if (!Number.isFinite(id) || !Array.isArray(om?.tradeJournal)) return null;
  return om.tradeJournal.find((t) => Number(t.tradeId ?? t.id) === id) || null;
}

function splitCommaTags(s) {
  if (typeof s !== "string" || !s.trim()) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

/** Legacy order-panel / strategy comma tags + "Name: value" pairs → token list for V9 pill matching. */
function legacyTokensFromCommaAndStrategy(tagsStr, strategyVars) {
  const seen = new Set();
  const out = [];
  const add = (t) => {
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  splitCommaTags(tagsStr).forEach((tok) => {
    add(tok);
    const m = tok.match(/^([^:]+):\s*(.+)$/);
    if (m) {
      const nm = m[1].trim();
      const vl = m[2].trim();
      const vLow = vl.toLowerCase();
      add(vl);
      if (vLow === "yes" || vLow === "true" || vLow === "1") add(nm);
      else if (vLow !== "no" && vLow !== "false" && vLow !== "0") add(nm);
    }
  });
  if (Array.isArray(strategyVars)) {
    strategyVars.forEach((v) => {
      const name = String(v.name || v.id || "").trim();
      const val = v.value != null ? String(v.value).trim() : "";
      if (val) add(val);
      if (name && val) add(`${name}: ${val}`);
      const vLow = val.toLowerCase();
      if (name && (vLow === "yes" || vLow === "true" || vLow === "1")) add(name);
    });
  }
  return out;
}

function extractPreTagsFromSources(journal, order) {
  if (Array.isArray(journal?.v9PreTradeTags)) return journal.v9PreTradeTags.slice();
  if (Array.isArray(order?.journalEntry?.v9PreTradeTags)) return order.journalEntry.v9PreTradeTags.slice();
  const tagsStr =
    [journal?.preTradeNotes?.tags, order?.journalEntry?.preTradeNotes?.tags].find(
      (s) => typeof s === "string" && s.trim()
    ) || "";
  const strat = order?.strategyVariables || journal?.strategy_variables;
  return legacyTokensFromCommaAndStrategy(tagsStr, strat);
}

function extractPostTagsFromSources(journal) {
  if (!journal) return [];
  if (Array.isArray(journal.v9PostTradeTags)) return journal.v9PostTradeTags.slice();
  const pt = journal.postTradeNotes;
  const tagsStr =
    typeof pt === "object" && pt && typeof pt.tags === "string"
      ? pt.tags
      : typeof pt === "string"
        ? pt
        : "";
  const out = legacyTokensFromCommaAndStrategy(tagsStr, journal.post_strategy_variables);
  if (journal.rulesFollowed === true && !out.includes("Followed Plan")) out.push("Followed Plan");
  const flatTags = journal.tags;
  if (Array.isArray(flatTags)) {
    flatTags.forEach((t) => {
      if (typeof t === "string" && t.trim()) splitCommaTags(t).forEach((x) => out.push(x));
    });
  } else if (typeof flatTags === "string" && flatTags.trim()) {
    splitCommaTags(flatTags).forEach((x) => out.push(x));
  }
  const seen = new Set();
  return out.filter((t) => {
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
}

function attachJournalTagsToRow(om, row, order) {
  const j = findJournalEntry(om, row.omId);
  row.preTags = extractPreTagsFromSources(j, order);
  row.postTags = extractPostTagsFromSources(j);
}

function coalesceTimeMs(...vals) {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Date.parse(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return NaN;
}

/** Closed trades that exist only in session-persisted `tradeJournal` (DB blob) still appear in History. */
function appendJournalOnlyClosedRows(om, rows, theme, ctx) {
  const seenIds = new Set(rows.map((r) => r.omId).filter((id) => id != null));
  const journal = Array.isArray(om?.tradeJournal) ? om.tradeJournal : [];
  const { fmtPx, fmtQty, sideStr, typeLabel, rowNowMs } = ctx;

  journal.forEach((j) => {
    const tidRaw = j.tradeId ?? j.id;
    if (tidRaw == null || tidRaw === "") return;
    const tid = typeof tidRaw === "number" ? tidRaw : Number.parseInt(String(tidRaw), 10);
    if (!Number.isFinite(tid)) return;
    if (seenIds.has(tid)) return;

    const tClose = coalesceTimeMs(j.closeTime, j.exitTime);
    const tOpen = coalesceTimeMs(j.openTime, j.entryTime, j.entryDate);
    const exitPx = j.closePrice ?? j.exitPrice;
    const entryPx = j.openPrice ?? j.entryPrice;

    const hasExit =
      (exitPx != null && Number.isFinite(Number.parseFloat(exitPx))) || Number.isFinite(tClose);
    if (!hasExit) return;

    seenIds.add(tid);

    const sortMs = Number.isFinite(tClose) ? tClose : Number.isFinite(tOpen) ? tOpen : 0;
    const pnlN = Number.parseFloat(j.netPnL ?? j.realizedPnL ?? j.pnl ?? 0);
    const { text: pnlText, pc } = v9UsdPnLParts(pnlN);

    const tpTxt =
      j.takeProfit != null && Number.isFinite(Number.parseFloat(j.takeProfit))
        ? fmtPx(j.takeProfit)
        : "—";
    const slTxt =
      j.stopLoss != null && Number.isFinite(Number.parseFloat(j.stopLoss)) ? fmtPx(j.stopLoss) : "—";
    const ot = j.orderType ? typeLabel(j.orderType) : "Market";

    rows.push({
      id: `#${tid}`,
      omId: tid,
      _sortMs: sortMs,
      time: v9FormatTradeTime(Number.isFinite(tOpen) ? tOpen : Number.isFinite(tClose) ? tClose : sortMs),
      status: "closed",
      sym: v9DisplaySymbol(j.ticker || j.symbol),
      side: sideStr(j.type || j.direction),
      sz: fmtQty(j.quantity),
      type: ot,
      entry: fmtPx(entryPx),
      exit: fmtPx(exitPx),
      pnl: pnlText,
      pc: pc ? theme[pc] : theme.tm,
      tp: tpTxt,
      sl: slTxt,
      dur: v9TradeDuration(tOpen, tClose, rowNowMs),
      preTags: extractPreTagsFromSources(j, null),
      postTags: extractPostTagsFromSources(j),
      mae:
        j.mae != null && Number.isFinite(Number.parseFloat(j.mae))
          ? fmtPx(j.mae)
          : undefined,
      mfe:
        j.mfe != null && Number.isFinite(Number.parseFloat(j.mfe))
          ? fmtPx(j.mfe)
          : undefined,
    });
  });
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
    const row = {
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
    };
    attachJournalTagsToRow(om, row, o);
    rows.push(row);
  });

  open.forEach((o) => {
    const tMs = o.openTime || Date.now();
    const uPnL = Number.parseFloat(o.unrealizedPnL);
    const { text: pnlText, pc } = v9UsdPnLParts(uPnL);
    const tpTxt = o.takeProfit != null && Number.isFinite(Number.parseFloat(o.takeProfit)) ? fmtPx(o.takeProfit) : "—";
    const slTxt = o.stopLoss != null && Number.isFinite(Number.parseFloat(o.stopLoss)) ? fmtPx(o.stopLoss) : "—";
    const ot = o.orderType ? typeLabel(o.orderType) : "Market";
    const row = {
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
    };
    attachJournalTagsToRow(om, row, o);
    rows.push(row);
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
    const row = {
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
    };
    attachJournalTagsToRow(om, row, o);
    rows.push(row);
  });

  appendJournalOnlyClosedRows(om, rows, theme, { fmtPx, fmtQty, sideStr, typeLabel, rowNowMs });

  rows.sort((a, b) => (b._sortMs || 0) - (a._sortMs || 0));
  return rows;
}
