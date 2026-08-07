/**
 * Maps chart.orderManager state → bottom-panel trade rows (shared by TalariaV8b + TalariaV8bLive).
 */

export function tradeDurationNormV1Enabled() {
  return typeof window === "undefined" || !window.__TALARIA_DISABLE_TRADE_DURATION_NORM_V1;
}

export function mcReplayPnlHostAggV1Enabled() {
  return typeof window === "undefined" || window.__TALARIA_MC_REPLAY_PNL_HOST_AGG_V1 !== false;
}

/** Match legacy dock normalizeEpochMs (order-manager cross-instrument dock). */
export function normalizeEpochMs(value, fallback = NaN) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return raw < 1e12 ? raw * 1000 : raw;
}

function dedupeOrdersById(list) {
  const out = [];
  const seen = new Set();
  (list || []).forEach((o) => {
    if (!o || o.id == null) return;
    const k = String(o.id);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(o);
  });
  return out;
}

/** Merge host + iframe panel snapshots for multichart trades rail (INT-8). */
export function mergeOrderManagerForMultichartTrades(hostOm, panelSnapshots) {
  if (!hostOm) return null;
  if (!mcReplayPnlHostAggV1Enabled() || !Array.isArray(panelSnapshots) || !panelSnapshots.length) {
    return hostOm;
  }
  const pending = dedupeOrdersById([
    ...(hostOm.pendingOrders || []),
    ...panelSnapshots.flatMap((s) => s.pendingOrders || []),
  ]);
  const open = dedupeOrdersById([
    ...(hostOm.openPositions || []),
    ...panelSnapshots.flatMap((s) => s.openPositions || []),
  ]);
  return Object.assign(Object.create(Object.getPrototypeOf(hostOm)), hostOm, {
    pendingOrders: pending,
    openPositions: open,
  });
}

export function resolveOrderManagerForTradesPanel(hostOm) {
  if (!hostOm || typeof window === "undefined") return hostOm;
  const grid = window.__multichartGrid;
  if (!grid || typeof grid.isMounted !== "function" || !grid.isMounted()) return hostOm;
  const snaps = window.__TALARIA_MC_ORDER_PANEL_SNAPSHOTS;
  return mergeOrderManagerForMultichartTrades(hostOm, snaps);
}

function resolveTradeRowNowMs(om, panelSnapshots) {
  let rowNowMs = NaN;
  const includeReplayClock = (value) => {
    const ts = normalizeEpochMs(value, NaN);
    if (Number.isFinite(ts) && (!Number.isFinite(rowNowMs) || ts > rowNowMs)) rowNowMs = ts;
  };
  if (tradeDurationNormV1Enabled()) {
    includeReplayClock(om?.orderService?.multiInstrumentSession?.current_time);
    includeReplayClock(om?.replaySystem?.replayTimestamp);
    includeReplayClock(om?.chart?.replaySystem?.replayTimestamp);
    try {
      includeReplayClock(om?._playbackReplaySystem?.()?.replayTimestamp);
    } catch (_) {}
  }
  includeReplayClock(
    typeof window !== "undefined" ? window.chart?.replaySystem?.replayTimestamp : NaN
  );
  if (mcReplayPnlHostAggV1Enabled() && Array.isArray(panelSnapshots)) {
    panelSnapshots.forEach((s) => {
      includeReplayClock(s?.replayTimestamp);
    });
  }
  if (!Number.isFinite(rowNowMs)) rowNowMs = Date.now();
  return rowNowMs;
}

function v9FormatTradeTime(ms) {
  if (!ms || !Number.isFinite(ms)) return "— — —";
  // Match chart axis / HUD: wall-clock in settings timezone (convertToTimezone → getUTC*).
  const tm = typeof window !== "undefined" ? window.timezoneManager : null;
  const d =
    tm && typeof tm.convertToTimezone === "function" ? tm.convertToTimezone(ms) : new Date(ms);
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

function v9ClosedTradeDuration(openMs, closeMs, nowMs = Date.now()) {
  if (!tradeDurationNormV1Enabled()) return v9TradeDuration(openMs, closeMs, nowMs);
  if (!Number.isFinite(openMs) || !Number.isFinite(closeMs)) return "—";
  return v9TradeDuration(openMs, closeMs);
}

function v9UsdPnLParts(n) {
  if (!Number.isFinite(n)) return { text: "—", pc: null };
  const sign = n >= 0 ? "+" : "-";
  const abs = Math.abs(n);
  const text = `${sign}$${abs.toFixed(2)}`;
  return { text, pc: n >= 0 ? "gn" : "rd" };
}

/** Open-leg P&L for display: realized partial closes + mark-to-market on remaining size. */
export function extractOpenPositionDisplayPnL(position) {
  if (!position || typeof position !== "object") return NaN;
  const partial = Number.parseFloat(position.partialClosePnL);
  const unrealized = Number.parseFloat(position.unrealizedPnL);
  const partialN = Number.isFinite(partial) ? partial : 0;
  const unrealizedN = Number.isFinite(unrealized) ? unrealized : 0;
  if (partialN !== 0 || unrealizedN !== 0) return partialN + unrealizedN;
  if (Array.isArray(position.partialCloses) && position.partialCloses.length) {
    const sum = position.partialCloses.reduce(
      (s, pc) => s + (Number.parseFloat(pc?.pnl) || 0),
      0
    );
    if (Math.abs(sum) > 1e-8) return sum + unrealizedN;
  }
  return unrealizedN;
}

/** Sum P&L from a journal row or closed position (same fields the trade table uses). */
export function extractOrderManagerTradePnl(trade, om) {
  if (!trade || typeof trade !== "object") return 0;
  const direct = Number.parseFloat(
    trade.netPnL ?? trade.realizedPnL ?? trade.pnl ?? trade.net_pnl ?? trade.profit ?? 0
  );
  if (Number.isFinite(direct) && Math.abs(direct) > 0.00001) return direct;
  const entry = Number.parseFloat(trade.entryPrice ?? trade.openPrice);
  const exit = Number.parseFloat(trade.exitPrice ?? trade.closePrice);
  const qty = Number.parseFloat(trade.quantity);
  if (Number.isFinite(entry) && Number.isFinite(exit) && Number.isFinite(qty) && qty > 0
      && om && typeof om._enginePnL === "function") {
    const dir = String(trade.direction ?? trade.type ?? "BUY").toUpperCase();
    try {
      const computed = om._enginePnL(
        dir,
        entry,
        exit,
        qty,
        exit,
        trade.ticker || trade.symbol,
        trade.instrument_settings || null
      );
      if (Number.isFinite(computed)) return computed;
    } catch (_) {}
  }
  return Number.isFinite(direct) ? direct : 0;
}

/** Balance / equity from journal + closedPositions + open unrealized — matches the trades table. */
export function computeV9AccountSummaryFromOrderManager(om) {
  if (!om) return null;
  const base = Number.parseFloat(om.initialBalance);
  const startingBalance = Number.isFinite(base) ? base : 10000;
  const journalIds = new Set();
  let realized = 0;
  (om.tradeJournal || []).forEach((t) => {
    const id = t?.tradeId ?? t?.id;
    if (id != null && id !== "") journalIds.add(String(id));
    realized += extractOrderManagerTradePnl(t, om);
  });
  (om.closedPositions || []).forEach((p) => {
    if (p?.id != null && journalIds.has(String(p.id))) return;
    realized += extractOrderManagerTradePnl(p, om);
  });
  let unrealized = 0;
  (om.openPositions || []).forEach((p) => {
    const u = Number.parseFloat(p?.unrealizedPnL);
    if (Number.isFinite(u)) unrealized += u;
  });
  const balance = startingBalance + realized;
  const equity = balance + unrealized;
  return { balance, equity, realizedPnL: realized, unrealizedPnL: unrealized, startingBalance };
}

/** Push ledger-derived balance onto orderManager (HUD + sizing read om.balance). */
export function syncOrderManagerBalanceFromLedger(om) {
  const s = computeV9AccountSummaryFromOrderManager(om);
  if (!om || !s) return s;
  om.balance = s.balance;
  om.equity = s.equity;
  om.realizedPnL = s.realizedPnL;
  om.unrealizedPnL = s.unrealizedPnL;
  if (om.orderService) {
    om.orderService.balance = s.balance;
    om.orderService.equity = s.equity;
    if (Number.isFinite(s.startingBalance)) om.orderService.initialBalance = s.startingBalance;
  }
  try {
    if (om.eventBus && typeof om.eventBus.emit === "function") {
      om.eventBus.emit("account:updated", {
        balance: s.balance,
        equity: s.equity,
        realizedPnL: s.realizedPnL,
      });
    }
  } catch (_) {}
  return s;
}

function resolvePositionOrderType(o) {
  if (!o) return "market";
  const raw = o.orderType ?? o._fillOrderType;
  if (raw != null && String(raw).trim()) {
    const t = String(raw).toLowerCase();
    if (t === "limit" || t === "stop" || t === "market") return t;
  }
  if (o.wasLimitOrder) return "limit";
  if (o.wasStopOrder) return "stop";
  return "market";
}

function findJournalEntry(om, tradeId) {
  const id = Number(tradeId);
  if (!Number.isFinite(id) || !Array.isArray(om?.tradeJournal)) return null;
  return om.tradeJournal.find((t) => Number(t.tradeId ?? t.id) === id) || null;
}

/**
 * Display ID for chart All Trade / History — per-user sequence (#1, #2… across that
 * user's sessions). Never the global SQL journal_trade_id shared by all users.
 */
function resolveChartDisplayTradeId(om, orderOrJournal, omId) {
  const fromObj = (obj) => {
    if (!obj || typeof obj !== "object") return null;
    const jid = obj.journal_trade_id ?? obj.journalTradeId;
    // Prefer per-user sequence (stable if sessions are merged later).
    for (const key of ["user_trade_id", "userTradeId", "display_trade_id"]) {
      const v = obj[key];
      if (v == null || String(v).trim() === "") continue;
      const s = String(v).trim();
      if (jid != null && String(jid) === s) continue;
      return s;
    }
    // Fallback: session-local chart order id until SQL assigns user_trade_id.
    const cid = obj.client_trade_id ?? obj.clientTradeId ?? obj.tradeId ?? obj.id;
    if (cid == null || String(cid).trim() === "") return null;
    const s = String(cid).trim();
    if (jid != null && String(jid) === s) return null;
    return s;
  };
  const direct = fromObj(orderOrJournal);
  if (direct) return `#${direct.replace(/^#/, "")}`;
  const journal = findJournalEntry(om, omId);
  const fromJournal = fromObj(journal);
  if (fromJournal) return `#${fromJournal.replace(/^#/, "")}`;
  if (omId != null && String(omId).trim() !== "") return `#${String(omId).trim().replace(/^#/, "")}`;
  return "—";
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
      // Strategies Lab bool YES uses pill tokens that include the variable label; NO must omit it.
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
  attachTradeMetricsToRow(om, row, order, j);
  attachMultiLegDisplayToRow(om, row, order, j);
}

/** All pending/open/closed legs sharing a split-entry group id. */
function collectSplitGroupOrders(om, order) {
  if (!order?.splitGroupId || !om) return null;
  const gid = order.splitGroupId;
  const match = (o) => o && o.splitGroupId === gid;
  const members = [];
  const seen = new Set();
  for (const list of [om.pendingOrders, om.openPositions, om.closedPositions]) {
    if (!Array.isArray(list)) continue;
    for (const o of list) {
      if (!match(o)) continue;
      const id = o.id;
      if (id == null || seen.has(id)) continue;
      seen.add(id);
      members.push(o);
    }
  }
  if (members.length === 0) return null;
  members.sort((a, b) => (a.splitIndex || 0) - (b.splitIndex || 0));
  return members;
}

function resolvePlannedEntrySnapshot(order, journal) {
  const snap =
    journal?.plannedEntrySnapshot
    || order?.plannedEntrySnapshot
    || null;
  return Array.isArray(snap) && snap.length > 1 ? snap : null;
}

function resolveFilledEntryLegMap(group, journal) {
  const map = new Map();
  if (group) {
    for (const o of group) {
      const idx = Number(o.splitIndex) || 0;
      if (idx > 0) map.set(idx, o);
    }
  }
  if (Array.isArray(journal?.splitEntries)) {
    journal.splitEntries.forEach((e, i) => {
      const idx = Number(e.splitIndex) || i + 1;
      map.set(idx, e);
    });
  }
  return map;
}

function isPlannedEntryLegFilled(leg, idx, filledMap) {
  const si = Number(leg?.splitIndex) || idx + 1;
  const hit = filledMap.get(si);
  if (!hit) return false;
  if (hit.openPrice != null || hit.openTime != null || hit.closePrice != null) return true;
  return isSplitLegFilled(hit);
}

function resolveTpListForDisplay(order, journal, row) {
  const isActive = row?.status === "open" || row?.status === "pending";
  if (isActive && Array.isArray(order?.tpTargets) && order.tpTargets.length > 1) {
    return order.tpTargets;
  }
  const candidates = [
    journal?.plannedTpSnapshot,
    order?.plannedTpSnapshot,
    journal?.multiTpSnapshot,
    journal?.active_tps_at_exit,
    order?.tpTargets,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 1) return c;
  }
  const multiFlag =
    journal?.hasMultipleTakeProfits
    || order?.hasMultipleTakeProfits;
  if (multiFlag) {
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 0) return c;
    }
  }
  return null;
}

function mergeTpHitFlags(tpList, journal, order) {
  const hitById = new Map();
  const hitByPrice = new Map();
  const active = journal?.active_tps_at_exit || order?.tpTargets;
  if (Array.isArray(active)) {
    active.forEach((t) => {
      if (t?.hit) {
        if (t.id != null) hitById.set(String(t.id), true);
        if (t.targetId != null) hitById.set(String(t.targetId), true);
        const px = Number.parseFloat(t.price);
        if (Number.isFinite(px)) hitByPrice.set(px.toFixed(8), true);
      }
    });
  }
  if (Array.isArray(journal?.tpRealizedBreakdown)) {
    journal.tpRealizedBreakdown.forEach((b) => {
      const lots = Number(b.lotsClosed) || 0;
      const gp = Number(b.pnl) || 0;
      if (lots > 0 || Math.abs(gp) > 1e-8) {
        if (b.targetId != null) hitById.set(String(b.targetId), true);
      }
    });
  }
  return tpList.map((t) => {
    const px = Number.parseFloat(t.price);
    const idHit = t.id != null && hitById.get(String(t.id));
    const pxHit = Number.isFinite(px) && hitByPrice.get(px.toFixed(8));
    return { ...t, hit: !!(t.hit || idHit || pxHit) };
  });
}

function formatTpPctLabel(pct) {
  if (pct == null) return null;
  const x = Number(pct);
  if (!Number.isFinite(x)) return null;
  return (x <= 1 ? (x * 100).toFixed(0) : x.toFixed(0)) + "%";
}

function formatUsdProfit(n) {
  if (!Number.isFinite(n)) return null;
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function resolveTradeSide(order, journal, row) {
  const raw = String(
    order?.type || order?.direction || journal?.type || journal?.direction
      || (row?.side === "SHORT" ? "SELL" : "BUY")
  ).toUpperCase();
  return raw === "SELL" || raw === "SHORT" ? "SELL" : "BUY";
}

/** Weighted avg entry for multi-TP $ math (matches order panel reward calc). */
function resolveTradeEntryPxForTpMath(om, order, journal, row) {
  const group = order ? collectSplitGroupOrders(om, order) : null;
  if (group && group.length > 1) {
    let sum = 0;
    let qSum = 0;
    for (const o of group) {
      const q = Number(o.quantity) || 0;
      const px = Number(o.openPrice ?? o.entryPrice) || 0;
      if (q > 0 && px > 0) {
        sum += px * q;
        qSum += q;
      }
    }
    if (qSum > 0) return sum / qSum;
  }
  if (journal?.splitEntries?.length > 1) {
    let sum = 0;
    let qSum = 0;
    for (const e of journal.splitEntries) {
      const q = Number(e.lotSize ?? e.quantity) || 0;
      const px = Number(e.openPrice ?? e.entryPrice ?? e.price) || 0;
      if (q > 0 && px > 0) {
        sum += px * q;
        qSum += q;
      }
    }
    if (qSum > 0) return sum / qSum;
  }
  const px = Number(order?.openPrice ?? order?.entryPrice ?? journal?.entryPrice ?? journal?.openPrice);
  if (Number.isFinite(px) && px > 0) return px;
  const parsed = Number.parseFloat(String(row?.entry ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function resolveTradeQtyForTpMath(om, order, journal, row) {
  const group = order ? collectSplitGroupOrders(om, order) : null;
  if (group && group.length > 1) {
    const t = group.reduce(
      (s, o) => s + (Number(o.originalQuantity ?? o.quantity) || 0),
      0
    );
    if (t > 0) return t;
  }
  if (journal?.splitEntries?.length > 1) {
    const t = journal.splitEntries.reduce(
      (s, e) => s + (Number(e.lotSize ?? e.quantity) || 0),
      0
    );
    if (t > 0) return t;
  }
  if (journal?.scaledEntries?.length > 1) {
    const t = journal.scaledEntries.reduce(
      (s, e) => s + (Number(e.quantity ?? e.lotSize) || 0),
      0
    );
    if (t > 0) return t;
  }
  const q = Number(
    order?.originalQuantity ?? order?.quantity ?? journal?.quantity
  );
  if (Number.isFinite(q) && q > 0) return q;
  const parsed = Number.parseFloat(row?.sz);
  return Number.isFinite(parsed) ? parsed : 0;
}

function findTpBreakdownRow(breakdown, target, index) {
  if (!Array.isArray(breakdown) || !breakdown.length) return null;
  if (target?.id != null) {
    const byId = breakdown.find((b) => b.targetId != null && String(b.targetId) === String(target.id));
    if (byId) return byId;
  }
  return breakdown[index] || null;
}

/** Build or reuse per-TP realized rows from journal / closed position partial closes. */
function resolveTpRealizedBreakdown(om, order, journal) {
  if (Array.isArray(journal?.tpRealizedBreakdown) && journal.tpRealizedBreakdown.length) {
    return journal.tpRealizedBreakdown;
  }
  const partials = Array.isArray(journal?.partialCloses) && journal.partialCloses.length
    ? journal.partialCloses
    : Array.isArray(order?.partialCloses) && order.partialCloses.length
      ? order.partialCloses
      : null;
  if (!partials?.length || !om || typeof om._buildTpRealizedBreakdown !== "function") return null;
  const snap =
    journal?.multiTpSnapshot
    || journal?.active_tps_at_exit
    || order?.multiTpSnapshot
    || order?.tpTargets
    || null;
  try {
    return om._buildTpRealizedBreakdown(partials, snap);
  } catch (_) {
    return null;
  }
}

function resolveOrderForTpChartMetrics(om, order, journal, row, tpList, side) {
  if (order) return order;
  const qty = resolveTradeQtyForTpMath(om, order, journal, row);
  const entryPx = resolveTradeEntryPxForTpMath(om, order, journal, row);
  if (!(qty > 0) || !(entryPx > 0)) return null;
  return {
    type: side,
    openPrice: entryPx,
    entryPrice: entryPx,
    quantity: qty,
    originalQuantity: qty,
    tpTargets: tpList,
    ticker: journal?.ticker || journal?.symbol || null,
    instrument_settings: journal?.instrument_settings || null,
    status: journal?.status || row?.status || "closed",
  };
}

function resolveTpChartMetricsMode(order, row) {
  const st = String(order?.status || row?.status || "").toLowerCase();
  if (st === "pending") return "pending";
  return "open";
}

function isSplitLegFilled(o) {
  if (!o) return false;
  const st = String(o.status || "").toUpperCase();
  return st === "OPEN" || st === "CLOSED" || !!o.openTime;
}

function weightedAvgPrice(legs, getPx, getWeight) {
  let sum = 0;
  let wSum = 0;
  for (const leg of legs) {
    const px = Number(getPx(leg));
    const w = Number(getWeight(leg)) || 0;
    if (Number.isFinite(px) && px > 0 && w > 0) {
      sum += px * w;
      wSum += w;
    }
  }
  return wSum > 0 ? sum / wSum : null;
}

function fmtTradePx(om, px) {
  const x = Number(px);
  if (!Number.isFinite(x)) return null;
  try {
    return typeof om?.formatPrice === "function" ? om.formatPrice(x) : x.toFixed(2);
  } catch (_) {
    return String(x);
  }
}

/**
 * Entry legs for trade card / journal UI: { price, qty?, filled? }[].
 * Returns null when only a single entry should be shown (caller uses row.entry).
 */
function buildTradeEntryLegs(om, order, journal, fmtPx, fmtQty, row) {
  const group = order ? collectSplitGroupOrders(om, order) : null;
  const plannedSnap = resolvePlannedEntrySnapshot(order, journal);
  const filledMap = resolveFilledEntryLegMap(group, journal);

  if (plannedSnap) {
    return plannedSnap.map((leg, idx) => ({
      price: fmtPx(leg.price ?? leg.openPrice ?? leg.entryPrice),
      qty: fmtQty(leg.quantity ?? leg.qty ?? leg.lotSize),
      filled: isPlannedEntryLegFilled(leg, idx, filledMap),
    }));
  }

  if (group && group.length > 1) {
    return group.map((o) => {
      const st = String(o.status || "").toUpperCase();
      return {
        price: fmtPx(o.openPrice ?? o.entryPrice),
        qty: fmtQty(o.quantity ?? o.placedQuantity),
        filled: st !== "PENDING" && isSplitLegFilled(o),
      };
    });
  }
  if (journal?.splitEntries?.length > 1) {
    return journal.splitEntries.map((e) => ({
      price: fmtPx(e.openPrice ?? e.entryPrice ?? e.price),
      qty: fmtQty(e.lotSize ?? e.quantity),
      filled: true,
    }));
  }
  if (journal?.scaledEntries?.length > 1) {
    return journal.scaledEntries.map((e) => ({
      price: fmtPx(e.openPrice ?? e.price ?? e.entryPrice),
      qty: fmtQty(e.quantity ?? e.lotSize),
      filled: true,
    }));
  }
  return null;
}

/**
 * TP legs for trade card: { price, hit?, pct?, profit?, profitUsd? }[].
 * Returns null when only a single TP should be shown (caller uses row.tp).
 */
function buildTradeTargetLegs(order, journal, fmtPx, om, row) {
  let tpList = resolveTpListForDisplay(order, journal, row);
  if (!tpList || tpList.length <= 1) {
    const multiFlag = journal?.hasMultipleTakeProfits || order?.hasMultipleTakeProfits;
    if (!(multiFlag && tpList?.length === 1)) return null;
  }
  if (!tpList || tpList.length <= 1) return null;

  tpList = mergeTpHitFlags(tpList, journal, order);

  const side = resolveTradeSide(order, journal, row);
  const breakdown = resolveTpRealizedBreakdown(om, order, journal);
  const isClosed = row?.status === "closed";
  const metricsOrder = resolveOrderForTpChartMetrics(om, order, journal, row, tpList, side);
  const metricsMode = resolveTpChartMetricsMode(metricsOrder || order, row);

  let ePcts = null;
  if (om && metricsOrder && typeof om._computeEffectiveTPPercentages === "function") {
    const entryPx = Number(metricsOrder.openPrice ?? metricsOrder.entryPrice) || 0;
    const qty = Number(metricsOrder.originalQuantity ?? metricsOrder.quantity) || 0;
    if (entryPx > 0 && qty > 0) {
      try {
        ePcts = om._computeEffectiveTPPercentages(entryPx, qty, side, { tpTargets: tpList });
      } catch (_) {
        ePcts = null;
      }
    }
  }

  return tpList.map((t, i) => {
    let profitUsd = null;
    let lotsClosed = null;

    const br = findTpBreakdownRow(breakdown, t, i);
    if (br) {
      lotsClosed = Number(br.lotsClosed) || 0;
      const gp = Number(br.pnl);
      if (Number.isFinite(gp) && (lotsClosed > 0 || Math.abs(gp) > 1e-8)) {
        profitUsd = gp;
      }
    }

    if (profitUsd == null && om && metricsOrder && typeof om._multiTpTargetChartMetrics === "function") {
      try {
        const chartMode = isClosed && !br ? "pending" : metricsMode;
        const { pnl, lots } = om._multiTpTargetChartMetrics(metricsOrder, t, i, chartMode);
        if (Number.isFinite(pnl) && pnl !== 0) profitUsd = pnl;
        if (lotsClosed == null && Number.isFinite(lots) && lots > 0) lotsClosed = lots;
      } catch (_) {}
    }

    const pctSource = ePcts ? ePcts[i] : t.percentage;
    const isRealized = !!(
      br && ((Number(br.lotsClosed) || 0) > 0 || Math.abs(Number(br.pnl) || 0) > 1e-8)
    );
    return {
      price: fmtPx(t.price),
      hit: !!(t.hit || isRealized),
      pct: formatTpPctLabel(pctSource),
      profit: formatUsdProfit(profitUsd),
      profitUsd: Number.isFinite(profitUsd) ? profitUsd : null,
      label: `TP${i + 1}`,
      isRealized,
    };
  });
}

function computeTargetsTotalProfit(targets, journal, order, row, om) {
  if (!targets?.length) return { total: null, isRealized: false };
  const isClosed = row?.status === "closed";
  const breakdown = resolveTpRealizedBreakdown(om, order, journal);

  if (isClosed) {
    const net = extractOrderManagerTradePnl(journal || order, om);
    if (Number.isFinite(net) && Math.abs(net) > 1e-8) {
      return { total: net, isRealized: true };
    }
    if (breakdown?.length) {
      let sum = 0;
      let hasRealized = false;
      breakdown.forEach((b) => {
        const gp = Number(b.pnl);
        const lots = Number(b.lotsClosed) || 0;
        if (Number.isFinite(gp) && (lots > 0 || Math.abs(gp) > 1e-8)) {
          sum += gp;
          hasRealized = true;
        }
      });
      const fin = Number(journal?.finalClosePnL ?? order?.finalClosePnL);
      if (Number.isFinite(fin) && Math.abs(fin) > 1e-8) sum += fin;
      if (hasRealized || Math.abs(sum) > 1e-8) return { total: sum, isRealized: true };
    }
  }

  const partialPnL = Number.parseFloat(order?.partialClosePnL);
  const hasPartials =
    (breakdown?.length > 0)
    || (Number.isFinite(partialPnL) && Math.abs(partialPnL) > 1e-8);
  if (hasPartials) {
    let realized = 0;
    if (breakdown?.length) {
      breakdown.forEach((b) => {
        const gp = Number(b.pnl);
        const lots = Number(b.lotsClosed) || 0;
        if (Number.isFinite(gp) && (lots > 0 || Math.abs(gp) > 1e-8)) realized += gp;
      });
    } else if (Number.isFinite(partialPnL)) {
      realized = partialPnL;
    }
    const u = Number.parseFloat(order?.unrealizedPnL);
    const unrealized = Number.isFinite(u) ? u : 0;
    const total = realized + unrealized;
    if (Math.abs(total) > 1e-8) return { total, isRealized: true };
  }

  const planned = targets.reduce((s, t) => s + (Number.isFinite(t.profitUsd) ? t.profitUsd : 0), 0);
  return { total: planned > 0 ? planned : null, isRealized: false };
}

function attachMultiLegDisplayToRow(om, row, order, journal) {
  const resolvedOrder =
    order
    || (om && row?.omId != null
      ? (om.closedPositions || []).find((o) => Number(o.id) === Number(row.omId))
        || (om.openPositions || []).find((o) => Number(o.id) === Number(row.omId))
        || (om.pendingOrders || []).find((o) => Number(o.id) === Number(row.omId))
      : null);
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
    if (!Number.isFinite(x)) return undefined;
    try {
      return typeof om.formatQuantity === "function" ? om.formatQuantity(x) : x.toFixed(2);
    } catch (_) {
      return x.toFixed(2);
    }
  };
  const entries = buildTradeEntryLegs(om, resolvedOrder, journal, fmtPx, fmtQty, row);
  if (entries?.length > 1) row.entries = entries;
  const targets = buildTradeTargetLegs(resolvedOrder, journal, fmtPx, om, row);
  if (targets?.length > 1) {
    row.targets = targets;
    const { total: totalUsd, isRealized } = computeTargetsTotalProfit(
      targets,
      journal,
      resolvedOrder,
      row,
      om
    );
    if (totalUsd != null && Number.isFinite(totalUsd)) {
      row.targetsTotalProfit = formatUsdProfit(totalUsd);
      row.targetsTotalProfitUsd = totalUsd;
      row.targetsTotalIsRealized = isRealized;
      if (isRealized && row.status === "closed") {
        const plannedOnly = targets
          .filter((t) => !t.isRealized)
          .reduce((s, t) => s + (Number.isFinite(t.profitUsd) ? t.profitUsd : 0), 0);
        if (plannedOnly > 0 && Math.abs(totalUsd - plannedOnly) > 0.05) {
          row.targetsPlannedProfit = formatUsdProfit(plannedOnly);
        }
      } else if (row.status === "open" && isRealized) {
        const plannedOnly = targets.reduce(
          (s, t) => s + (Number.isFinite(t.profitUsd) ? t.profitUsd : 0),
          0
        );
        if (plannedOnly > 0 && Math.abs(totalUsd - plannedOnly) > 0.05) {
          row.targetsPlannedProfit = formatUsdProfit(plannedOnly);
        }
      }
    }
  }
  if ((entries?.length > 1) || (targets?.length > 1)) {
    row.avgMetrics = computeTradeCardAvgMetrics(entries, targets, om);
  }
  const journalRef =
    journal
    || (om && row?.omId != null ? findJournalEntry(om, row.omId) : null);
  const displayQty = resolveTradeQtyForTpMath(om, resolvedOrder, journalRef, row);
  if (displayQty > 0) {
    const szTxt = fmtQty(displayQty);
    if (szTxt) row.sz = szTxt;
  }
}

/**
 * Planned + actual weighted averages for multi-entry / multi-TP trade cards and panels.
 */
export function computeTradeCardAvgMetrics(entries, targets, om) {
  const ent = Array.isArray(entries) ? entries : [];
  const tgt = Array.isArray(targets) ? targets : [];
  const multiEntry = ent.length > 1;
  const multiTp = tgt.length > 1;
  if (!multiEntry && !multiTp) return { showAvgRow: false };

  const filled = ent.filter((e) => e.filled === true);
  const hit = tgt.filter((t) => t.hit === true);

  const plannedAvgEntry = multiEntry
    ? fmtTradePx(om, weightedAvgPrice(ent, (e) => parseFloat(e.price), (e) => parseFloat(e.qty) || 1))
    : null;

  const plannedAvgTarget = multiTp
    ? fmtTradePx(om, weightedAvgPrice(tgt, (t) => parseFloat(t.price), () => 1))
    : null;

  const actualAvgEntry = filled.length > 0 && multiEntry
    ? fmtTradePx(om, weightedAvgPrice(filled, (e) => parseFloat(e.price), (e) => parseFloat(e.qty) || 1))
    : null;

  const actualAvgTarget = hit.length > 0 && multiTp
    ? fmtTradePx(om, weightedAvgPrice(hit, (t) => parseFloat(t.price), (t) => {
      const pct = parseFloat(String(t.pct || "").replace("%", ""));
      return Number.isFinite(pct) && pct > 0 ? pct : 1;
    }))
    : null;

  return {
    showAvgRow: true,
    plannedAvgEntry,
    plannedAvgTarget,
    actualAvgEntry,
    actualAvgTarget,
    filledCount: filled.length,
    entryCount: ent.length,
    hitCount: hit.length,
    targetCount: tgt.length,
    showActualAvg: (filled.length > 0 && multiEntry) || (hit.length > 0 && multiTp),
  };
}

/**
 * Live ACTUAL AVG for the order panel while a split-group trade is open (partial fills / TP hits).
 */
export function computeOrderPanelActualAvgFromOm(om) {
  if (!om) return null;
  const openLegs = (om.openPositions || []).filter((p) => p?.isSplitEntry && p.splitGroupId);
  if (!openLegs.length) return null;

  const gid = openLegs[0].splitGroupId;
  const filled = (om.openPositions || []).filter((p) => p.splitGroupId === gid);
  const pending = (om.pendingOrders || []).filter((p) => p.splitGroupId === gid);
  const totalEntry = filled.length + pending.length;
  if (totalEntry <= 1) return null;

  const actualEntryPx = weightedAvgPrice(
    filled,
    (p) => p.openPrice ?? p.entryPrice,
    (p) => p.quantity
  );

  const ref = filled[0] || pending[0];
  const tpTargets = Array.isArray(ref?.tpTargets) ? ref.tpTargets : [];
  const hitTps = tpTargets.filter((t) => t?.hit);
  const totalTp = tpTargets.length;

  let actualTpPx = null;
  if (hitTps.length > 0 && typeof om._weightedAvgTPFromPricedTargets === "function") {
    try {
      actualTpPx = om._weightedAvgTPFromPricedTargets(hitTps, "open", ref);
    } catch (_) {}
  }
  if (actualTpPx == null && hitTps.length > 0) {
    actualTpPx = weightedAvgPrice(hitTps, (t) => t.price, (t) => t.percentage || 1);
  }

  const filledCount = filled.length;
  const hitCount = hitTps.length;

  return {
    actualAvgEntry: fmtTradePx(om, actualEntryPx),
    actualAvgTarget: fmtTradePx(om, actualTpPx),
    filledCount,
    entryCount: totalEntry,
    hitCount,
    targetCount: totalTp,
    showActualAvg: filledCount > 0 || hitCount > 0,
  };
}

function computePlannedRRFromPrices(entry, sl, tp) {
  const e = Number.parseFloat(entry);
  const s = Number.parseFloat(sl);
  const t = Number.parseFloat(tp);
  if (!Number.isFinite(e) || !Number.isFinite(s) || !Number.isFinite(t)) return null;
  const risk = Math.abs(e - s);
  const reward = Math.abs(t - e);
  if (!(risk > 0)) return null;
  return reward / risk;
}

/**
 * Planned R:R for trade card — matches order panel multi-TP reward / risk USD when possible.
 */
export function computePlannedRRForTrade(om, order, journal, row) {
  const side = resolveTradeSide(order, journal, row);
  const isLong = side !== "SELL" && side !== "SHORT";
  const entryPx = resolveTradeEntryPxForTpMath(om, order, journal, row);
  const sl = Number.parseFloat(order?.stopLoss ?? journal?.stopLoss ?? row?.sl);
  const qty = resolveTradeQtyForTpMath(om, order, journal, row);
  if (!Number.isFinite(entryPx) || !(entryPx > 0) || !Number.isFinite(sl)) return null;

  const riskUsd = Number.parseFloat(
    journal?.originalRiskAmount ?? journal?.riskAmount ?? journal?.riskPerTrade
      ?? order?.originalRiskAmount ?? order?.riskAmount ?? row?.riskAmount
  );

  const tpList =
    (Array.isArray(journal?.multiTpSnapshot) && journal.multiTpSnapshot.length > 1
      ? journal.multiTpSnapshot
      : null)
    || (Array.isArray(journal?.active_tps_at_exit) && journal.active_tps_at_exit.length > 1
      ? journal.active_tps_at_exit
      : null)
    || (Array.isArray(order?.tpTargets) && order.tpTargets.length > 1 ? order.tpTargets : null);

  if (tpList?.length > 1 && om) {
    let ePcts = null;
    try {
      ePcts = om._computeEffectiveTPPercentages(entryPx, qty, side, { tpTargets: tpList });
    } catch (_) {
      ePcts = null;
    }
    if (riskUsd > 0 && qty > 0) {
      let rewardUsd = 0;
      const sym = order?.ticker || order?.symbol || journal?.ticker || journal?.symbol || null;
      tpList.forEach((t, i) => {
        const tpPx = Number.parseFloat(t.price);
        const ePct = ePcts ? ePcts[i] : Number(t.percentage) || 0;
        if (!(tpPx > 0) || !(ePct > 0)) return;
        const partialQty = qty * (ePct / 100);
        const priceDiff = isLong ? tpPx - entryPx : entryPx - tpPx;
        if (priceDiff > 0 && typeof om.estimatePnLForPriceLevel === "function") {
          rewardUsd += Math.max(0, om.estimatePnLForPriceLevel(side, entryPx, tpPx, partialQty, sym));
        }
      });
      if (rewardUsd > 0) return rewardUsd / riskUsd;
    }
    const riskPx = Math.abs(entryPx - sl);
    if (!(riskPx > 0)) return null;
    let weightedRewardPx = 0;
    tpList.forEach((t, i) => {
      const tpPx = Number.parseFloat(t.price);
      const pct = (ePcts ? ePcts[i] : Number(t.percentage) || 0) / 100;
      if (!(tpPx > 0) || !(pct > 0)) return;
      const diff = isLong ? tpPx - entryPx : entryPx - tpPx;
      if (diff > 0) weightedRewardPx += diff * pct;
    });
    if (weightedRewardPx > 0) return weightedRewardPx / riskPx;
  }

  const tp = Number.parseFloat(order?.takeProfit ?? journal?.takeProfit ?? row?.tp);
  return computePlannedRRFromPrices(entryPx, sl, tp);
}

/**
 * Frozen planned R at entry (initial SL + original TP). Uses journal field when present,
 * else reconstructs from initial_sl + plannedTpSnapshot.
 */
export function computePlannedRRAtEntryFromSources(om, order, journal, row) {
  const side = resolveTradeSide(order, journal, row);
  const isLong = side !== "SELL" && side !== "SHORT";
  const entryPx = resolveTradeEntryPxForTpMath(om, order, journal, row);
  const sl = Number.parseFloat(
    journal?.initial_sl ?? order?.initial_sl ?? journal?.stopLoss ?? order?.stopLoss ?? row?.slPx ?? row?.sl
  );
  const qty = resolveTradeQtyForTpMath(om, order, journal, row);
  const riskUsd = Number.parseFloat(
    journal?.originalRiskAmount ?? journal?.riskAmount
      ?? order?.originalRiskAmount ?? order?.riskAmount ?? row?.riskAmount
  );
  if (!Number.isFinite(entryPx) || !(entryPx > 0) || !Number.isFinite(sl)) {
    const frozenOnly = Number.parseFloat(journal?.plannedRRAtEntry ?? order?.plannedRRAtEntry);
    return Number.isFinite(frozenOnly) ? frozenOnly : null;
  }

  const tpList =
    journal?.plannedTpSnapshot
    || order?.plannedTpSnapshot
    || (Array.isArray(journal?.multiTpSnapshot) && journal.multiTpSnapshot.length > 1
      ? journal.multiTpSnapshot
      : null)
    || (Array.isArray(order?.tpTargets) && order.tpTargets.length > 1 ? order.tpTargets : null);

  let recomputed = null;
  if (tpList?.length > 1 && om && riskUsd > 0 && qty > 0) {
    let ePcts = null;
    try {
      ePcts = om._computeEffectiveTPPercentages(entryPx, qty, side, { tpTargets: tpList });
    } catch (_) {
      ePcts = null;
    }
    let rewardUsd = 0;
    const sym = order?.ticker || order?.symbol || journal?.ticker || journal?.symbol || null;
    tpList.forEach((t, i) => {
      const tpPx = Number.parseFloat(t.price);
      const ePct = ePcts ? ePcts[i] : Number(t.percentage) || 0;
      if (!(tpPx > 0) || !(ePct > 0)) return;
      const partialQty = qty * (ePct / 100);
      const priceDiff = isLong ? tpPx - entryPx : entryPx - tpPx;
      if (priceDiff > 0 && typeof om.estimatePnLForPriceLevel === "function") {
        rewardUsd += Math.max(0, om.estimatePnLForPriceLevel(side, entryPx, tpPx, partialQty, sym));
      }
    });
    if (rewardUsd > 0) recomputed = rewardUsd / riskUsd;
  }

  if (recomputed == null) {
    const tp = Number.parseFloat(
      journal?.initial_takeProfit ?? order?.initial_takeProfit
        ?? journal?.takeProfit ?? order?.takeProfit ?? row?.tpPx ?? row?.tp
    );
    recomputed = computePlannedRRFromPrices(entryPx, sl, tp);
  }

  const frozen = Number.parseFloat(journal?.plannedRRAtEntry ?? order?.plannedRRAtEntry);
  // Prefer frozen when sane; reject absurd values (e.g. reward-$ stored as R when risk was ~$1).
  if (Number.isFinite(frozen)) {
    if (
      recomputed == null
      || !Number.isFinite(recomputed)
      || (Math.abs(frozen) <= 50 && Math.abs(frozen - recomputed) <= 5)
      || Math.abs(frozen / (recomputed || 1)) <= 3
    ) {
      return frozen;
    }
  }
  return recomputed;
}

/** Hero R:R for trade card modal (planned when open, realized when closed). */
export function resolveTradeCardRR(row, theme) {
  const isLong = row?.side === "LONG";
  const entryP = Number.parseFloat(row?.plannedEntryPx ?? row?.entryPx ?? row?.entry);
  const slP = Number.parseFloat(row?.slPx ?? row?.sl);
  const tpP = Number.parseFloat(row?.tpPx ?? row?.tp);
  const exitP = row?.exit && row.exit !== "—"
    ? Number.parseFloat(row?.exitPx ?? row.exit)
    : NaN;
  const riskPx = Math.abs(entryP - slP);
  const rrReward = Math.abs(tpP - entryP);
  const pipSize = Number.parseFloat(row?.pipSize);
  const unit = Number.isFinite(pipSize) && pipSize > 0 ? pipSize : null;
  // Instrument units for the STOP LOSS distance label (pips/ticks), not raw price delta.
  const rrRisk = unit && riskPx > 0 ? riskPx / unit : riskPx;
  const plannedRR = Number.isFinite(row?.plannedRR)
    ? row.plannedRR
    : riskPx > 0 && Number.isFinite(rrReward)
      ? rrReward / riskPx
      : null;

  let rrVal = null;
  if (row?.status === "closed") {
    const riskUsd = Number.parseFloat(row?.riskAmount);
    const pnlFromHero = Number.parseFloat(String(row?.pnl || "").replace(/[^0-9.-]/g, ""));
    const pnlUsd = Number.parseFloat(row?.targetsTotalProfitUsd);
    const pnlRef = Number.isFinite(pnlFromHero) ? pnlFromHero : pnlUsd;
    const fromPx =
      riskPx > 0 && Number.isFinite(exitP)
        ? (isLong ? (exitP - entryP) / riskPx : (entryP - exitP) / riskPx)
        : null;
    if (Number.isFinite(riskUsd) && riskUsd > 0 && Number.isFinite(pnlRef)) {
      const fromUsd = pnlRef / riskUsd;
      // Guard: risk≈$1 (or similar) makes R mirror raw $ PnL; prefer price-based R when sane.
      const looksLikeRawPnl =
        Number.isFinite(fromPx)
        && Math.abs(fromUsd) > 10
        && Math.abs(fromPx) <= 10
        && Math.abs(Math.abs(fromUsd) - Math.abs(pnlRef)) <= Math.max(1, 0.05 * Math.abs(pnlRef));
      rrVal = looksLikeRawPnl ? fromPx : fromUsd;
    } else {
      const stored = Number.parseFloat(row?.rMultiple);
      if (Number.isFinite(stored)) {
        const looksLikeRawStored =
          Number.isFinite(fromPx)
          && Number.isFinite(pnlRef)
          && Math.abs(stored) > 10
          && Math.abs(fromPx) <= 10
          && Math.abs(Math.abs(stored) - Math.abs(pnlRef)) <= Math.max(1, 0.05 * Math.abs(pnlRef));
        rrVal = looksLikeRawStored ? fromPx : stored;
      } else if (fromPx != null) {
        rrVal = fromPx;
      }
    }
    if (Number.isFinite(rrVal) && Number.isFinite(pnlRef) && pnlRef !== 0 && rrVal * pnlRef < 0) {
      rrVal = -Math.abs(rrVal);
    }
  } else {
    rrVal = plannedRR;
  }

  const gn = theme?.gn || "#22c55e";
  const rd = theme?.rd || "#ef4444";
  const tm = theme?.tm || "#888";
  const rrStr =
    rrVal == null || !Number.isFinite(rrVal) ? "—" : `${rrVal >= 0 ? "+" : ""}${rrVal.toFixed(2)}R`;
  const plannedAtEntry =
    Number.isFinite(row?.plannedRRAtEntry) ? row.plannedRRAtEntry : plannedRR;
  const plannedAtEntryStr =
    plannedAtEntry != null && Number.isFinite(plannedAtEntry)
      ? `${plannedAtEntry >= 0 ? "+" : ""}${plannedAtEntry.toFixed(2)}R`
      : null;
  const showPlannedAtEntry =
    row?.status === "closed"
    && plannedAtEntryStr
    && (rrVal == null || !Number.isFinite(rrVal) || Math.abs(plannedAtEntry - rrVal) > 0.05);
  const rrCol =
    row?.status === "closed"
      ? rrVal == null || !Number.isFinite(rrVal)
        ? tm
        : rrVal > 0
          ? gn
          : rrVal < 0
            ? rd
            : tm
      : plannedRR != null && riskPx > 0
        ? plannedRR >= 1
          ? gn
          : rd
        : tm;
  const rrRiskUnit = unit
    ? (row?.sym && String(row.sym).includes("/") ? "pips" : "pts")
    : "pts";
  return { rrVal, rrStr, rrCol, rrRisk, rrRiskUnit, plannedRR, plannedAtEntryStr, showPlannedAtEntry };
}

/** Signed realized R-multiple (negative when the trade lost). */
export function extractRealizedRMultiple(trade, om, sideHint) {
  if (!trade || typeof trade !== "object") return null;
  const riskUsd = Number.parseFloat(
    trade.originalRiskAmount ?? trade.riskAmount ?? trade.riskPerTrade
  );
  const pnl = extractOrderManagerTradePnl(trade, om);
  // Always prefer pnl / original risk — stored rMultiple is often raw $ pnl when risk was wrong.
  if (riskUsd > 0 && Number.isFinite(pnl)) {
    return pnl / riskUsd;
  }
  const stored = Number.parseFloat(trade.rMultiple ?? trade.actual_rr_net);
  if (Number.isFinite(stored)) return stored;
  const entry = Number.parseFloat(trade.entryPrice ?? trade.openPrice);
  const exit = Number.parseFloat(trade.exitPrice ?? trade.closePrice);
  const sl = Number.parseFloat(trade.initial_sl ?? trade.initialStopLoss ?? trade.stopLoss);
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || !Number.isFinite(sl)) return null;
  const riskPx = Math.abs(entry - sl);
  if (!(riskPx > 0)) return null;
  const dir = String(trade.type ?? trade.direction ?? sideHint ?? "BUY").toUpperCase();
  const isLong = dir !== "SELL" && dir !== "SHORT";
  const move = isLong ? exit - entry : entry - exit;
  return move / riskPx;
}

function resolveRowPipSize(om, order, journal) {
  const candidates = [
    order?.instrument_settings?.pip_size,
    order?.instrument_settings?.pipSize,
    journal?.instrument_settings?.pip_size,
    journal?.instrument_settings?.pipSize,
    typeof om?._getPositionPipSize === "function" ? om._getPositionPipSize(order || journal) : null,
    om?.pipSize,
  ];
  for (const c of candidates) {
    const n = Number.parseFloat(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const sym = String(order?.ticker || order?.symbol || journal?.ticker || journal?.symbol || rowSymHint(journal) || "");
  if (/JPY/i.test(sym)) return 0.01;
  if (/\//.test(sym) || /^[A-Z]{6}$/.test(sym.replace("/", ""))) return 0.0001;
  return null;
}

function rowSymHint(journal) {
  return journal?.symbol || journal?.ticker || "";
}

function fmtTradeMoney(n) {
  if (!Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  const body = abs >= 100 ? abs.toFixed(0) : abs.toFixed(2);
  if (n < 0) return `-$${body}`;
  return `$${body}`;
}

function fmtTradeRMultiple(n) {
  if (!Number.isFinite(n)) return null;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}R`;
}

function fmtTradePipsOrPts(n, unit) {
  if (!Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  const body = abs >= 10 ? abs.toFixed(1) : abs.toFixed(2);
  const u = unit || "pips";
  if (n < 0) return `-${body} ${u}`;
  if (n > 0) return `${body} ${u}`;
  return `0 ${u}`;
}

/**
 * Surface execution economics on the trade row for the trade card.
 * Slots stay reserved even when a value is missing (card shows "—").
 */
function attachExecutionEconomicsToRow(om, row, order, journal) {
  const src = journal || order || {};
  const fmtPx =
    typeof om?._formatPrice === "function"
      ? (px) => {
          try { return om._formatPrice(px); } catch (_) { return String(px); }
        }
      : (px) => {
          const n = Number.parseFloat(px);
          if (!Number.isFinite(n)) return null;
          return String(n);
        };

  const maePx = Number.parseFloat(src.mae ?? order?.mae ?? journal?.mae);
  const mfePx = Number.parseFloat(src.mfe ?? order?.mfe ?? journal?.mfe);
  if (Number.isFinite(maePx) && !row.mae) row.mae = fmtPx(maePx);
  if (Number.isFinite(mfePx) && !row.mfe) row.mfe = fmtPx(mfePx);

  const maeR = Number.parseFloat(src.mae_r ?? src.maeR ?? order?.mae_r ?? journal?.mae_r);
  const mfeR = Number.parseFloat(src.mfe_r ?? src.mfeR ?? order?.mfe_r ?? journal?.mfe_r);
  if (Number.isFinite(maeR)) row.maeR = fmtTradeRMultiple(maeR);
  if (Number.isFinite(mfeR)) row.mfeR = fmtTradeRMultiple(mfeR);

  let commission = Number.parseFloat(
    src.commission_total ?? src.commissionTotal ?? src.finalCommission
      ?? order?.commission_total ?? order?.finalCommission
      ?? journal?.commission_total ?? journal?.commission
  );
  if (!Number.isFinite(commission) && om && order && typeof om._getRoundTripCommissionUsd === "function") {
    try {
      const est = om._getRoundTripCommissionUsd(order);
      if (Number.isFinite(est) && est > 0) commission = est;
    } catch (_) { /* ignore */ }
  }
  if (Number.isFinite(commission) && commission !== 0) {
    // Commission is a cost — store absolute debit display.
    row.commission = fmtTradeMoney(-Math.abs(commission));
    row.commissionN = -Math.abs(commission);
  }

  let slippage = Number.parseFloat(
    src.slippage ?? src.slippage_pips ?? src.slippagePips
      ?? order?.slippage ?? order?.slippage_pips ?? journal?.slippage
  );
  const slipUnitRaw = src.slippage_unit ?? order?.slippage_unit ?? journal?.slippage_unit;
  const slipUnit = slipUnitRaw === "pts" || slipUnitRaw === "ticks" ? slipUnitRaw : "pips";
  if (Number.isFinite(slippage)) {
    row.slippage = fmtTradePipsOrPts(slippage, slipUnit);
    row.slippageN = slippage;
  }

  let spread = Number.parseFloat(
    src.spread_pips ?? src.spreadPips ?? src.spread
      ?? order?.spread_pips ?? order?.spreadPips
      ?? journal?.spread_pips
  );
  if (!Number.isFinite(spread) && om && order && typeof om._getSpreadPipsForPosition === "function") {
    try {
      const s = om._getSpreadPipsForPosition(order);
      if (Number.isFinite(s) && s > 0) spread = s;
    } catch (_) { /* ignore */ }
  }
  if (Number.isFinite(spread) && spread > 0) {
    row.spread = fmtTradePipsOrPts(spread, "pips");
    row.spreadN = spread;
  }

  const swap = Number.parseFloat(
    src.swap ?? src.swap_cost ?? src.swapCost
      ?? order?.swap ?? journal?.swap
  );
  if (Number.isFinite(swap) && swap !== 0) {
    row.swap = fmtTradeMoney(swap);
    row.swapN = swap;
  }
}

function attachTradeMetricsToRow(om, row, order, journal) {
  const src = journal || order;
  if (!src) return;
  const entryPx = resolveTradeEntryPxForTpMath(om, order, journal, row);
  if (Number.isFinite(entryPx) && entryPx > 0) row.plannedEntryPx = entryPx;
  const plannedAtEntry = computePlannedRRAtEntryFromSources(om, order, journal, row);
  if (plannedAtEntry != null && Number.isFinite(plannedAtEntry)) {
    row.plannedRRAtEntry = plannedAtEntry;
  }
  const planned =
    row.status === "closed" && plannedAtEntry != null
      ? plannedAtEntry
      : computePlannedRRForTrade(om, order, journal, row);
  if (planned != null && Number.isFinite(planned)) row.plannedRR = planned;
  const riskUsd = Number.parseFloat(
    journal?.originalRiskAmount ?? journal?.riskAmount ?? journal?.riskPerTrade
      ?? order?.originalRiskAmount ?? order?.riskAmount
  );
  if (Number.isFinite(riskUsd) && riskUsd > 0) row.riskAmount = riskUsd;
  const pip = resolveRowPipSize(om, order, journal);
  if (pip != null) row.pipSize = pip;
  if (row.status === "closed") {
    const sideHint = row.side === "SHORT" ? "SELL" : "BUY";
    const realized = extractRealizedRMultiple(journal || order, om, sideHint);
    if (realized != null && Number.isFinite(realized)) row.rMultiple = realized;
  }
  attachExecutionEconomicsToRow(om, row, order, journal);
}

function coalesceTimeMs(...vals) {
  for (const v of vals) {
    if (tradeDurationNormV1Enabled()) {
      const normalized = normalizeEpochMs(v, NaN);
      if (Number.isFinite(normalized)) return normalized;
    }
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
    const openMs = Number.isFinite(tOpen) ? tOpen : sortMs;
    const pnlN = extractOrderManagerTradePnl(j, om);
    const { text: pnlText, pc } = v9UsdPnLParts(pnlN);

    const tpTxt =
      j.takeProfit != null && Number.isFinite(Number.parseFloat(j.takeProfit))
        ? fmtPx(j.takeProfit)
        : "—";
    const slTxt =
      j.stopLoss != null && Number.isFinite(Number.parseFloat(j.stopLoss)) ? fmtPx(j.stopLoss) : "—";
    const ot = typeLabel(resolvePositionOrderType(j));

    const displayId = resolveChartDisplayTradeId(om, j, tid);
    const row = {
      id: displayId,
      omId: tid,
      userTradeId: j.user_trade_id ?? j.userTradeId ?? j.display_trade_id ?? null,
      journalTradeId: j.journal_trade_id ?? j.journalTradeId ?? null,
      _sortMs: sortMs,
      _openMs: openMs,
      time: v9FormatTradeTime(openMs),
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
      dur: v9ClosedTradeDuration(tOpen, tClose, rowNowMs),
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
    };
    attachTradeMetricsToRow(om, row, null, j);
    attachMultiLegDisplayToRow(om, row, null, j);
    rows.push(row);
  });
}

/**
 * @param {object|null} om - window.chart.orderManager
 * @param {{ gn: string, rd: string, tm: string }} theme - palette fragment `c`
 */
export function buildLiveTradeRowsFromOrderManager(om, theme, opts = {}) {
  if (!om) return [];
  const panelSnapshots = opts.panelSnapshots || null;
  const rowNowMs = resolveTradeRowNowMs(om, panelSnapshots);
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

  const attachRawPx = (row, o, { entry, exit } = {}) => {
    const entryN = Number.parseFloat(entry ?? o.openPrice ?? o.entryPrice);
    const slN = Number.parseFloat(o.stopLoss);
    const tpN = Number.parseFloat(o.takeProfit);
    const exitN = Number.parseFloat(exit ?? o.closePrice);
    if (Number.isFinite(entryN)) row.entryPx = entryN;
    if (Number.isFinite(slN)) row.slPx = slN;
    if (Number.isFinite(tpN)) row.tpPx = tpN;
    if (Number.isFinite(exitN)) row.exitPx = exitN;
  };

  pend.forEach((o) => {
    const tMs = o.placedTime || o.openTime || Date.now();
    const tpTxt = o.takeProfit != null && Number.isFinite(Number.parseFloat(o.takeProfit)) ? fmtPx(o.takeProfit) : "—";
    const slTxt = o.stopLoss != null && Number.isFinite(Number.parseFloat(o.stopLoss)) ? fmtPx(o.stopLoss) : "—";
    const jPend = findJournalEntry(om, o.id);
    const displayId = resolveChartDisplayTradeId(om, o, o.id);
    const row = {
      id: displayId,
      omId: o.id,
      userTradeId: o.user_trade_id ?? o.userTradeId ?? jPend?.user_trade_id ?? jPend?.display_trade_id ?? null,
      journalTradeId: o.journal_trade_id ?? o.journalTradeId ?? jPend?.journal_trade_id ?? null,
      _sortMs: tMs,
      _openMs: tMs,
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
    attachRawPx(row, o, { entry: o.entryPrice });
    attachJournalTagsToRow(om, row, o);
    rows.push(row);
  });

  open.forEach((o) => {
    const rawOpenMs = tradeDurationNormV1Enabled()
      ? normalizeEpochMs(o.openTime, rowNowMs)
      : (o.openTime || rowNowMs);
    const tMs = Number.isFinite(rawOpenMs) ? rawOpenMs : rowNowMs;
    const pnlN = extractOpenPositionDisplayPnL(o);
    const { text: pnlText, pc } = v9UsdPnLParts(pnlN);
    const tpTxt = o.takeProfit != null && Number.isFinite(Number.parseFloat(o.takeProfit)) ? fmtPx(o.takeProfit) : "—";
    const slTxt = o.stopLoss != null && Number.isFinite(Number.parseFloat(o.stopLoss)) ? fmtPx(o.stopLoss) : "—";
    const ot = typeLabel(resolvePositionOrderType(o));
    const jOpen = findJournalEntry(om, o.id);
    const displayId = resolveChartDisplayTradeId(om, o, o.id);
    const row = {
      id: displayId,
      omId: o.id,
      userTradeId: o.user_trade_id ?? o.userTradeId ?? jOpen?.user_trade_id ?? jOpen?.display_trade_id ?? null,
      journalTradeId: o.journal_trade_id ?? o.journalTradeId ?? jOpen?.journal_trade_id ?? null,
      _sortMs: tMs,
      _openMs: tMs,
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
    attachRawPx(row, o, { entry: o.openPrice });
    attachJournalTagsToRow(om, row, o);
    rows.push(row);
  });

  closed.forEach((o) => {
    const tOpen = tradeDurationNormV1Enabled()
      ? normalizeEpochMs(o.openTime, NaN)
      : o.openTime;
    const tClose = tradeDurationNormV1Enabled()
      ? normalizeEpochMs(o.closeTime, NaN)
      : o.closeTime;
    const sortMs = Number.isFinite(tClose) ? tClose : tOpen || 0;
    const openMs = Number.isFinite(tOpen) ? tOpen : sortMs;
    const pnlN = extractOrderManagerTradePnl(o, om);
    const { text: pnlText, pc } = v9UsdPnLParts(pnlN);
    const tpTxt = o.takeProfit != null && Number.isFinite(Number.parseFloat(o.takeProfit)) ? fmtPx(o.takeProfit) : "—";
    const slTxt = o.stopLoss != null && Number.isFinite(Number.parseFloat(o.stopLoss)) ? fmtPx(o.stopLoss) : "—";
    const ot = typeLabel(resolvePositionOrderType(o));
    const jClosed = findJournalEntry(om, o.id);
    const displayId = resolveChartDisplayTradeId(om, o, o.id);
    const row = {
      id: displayId,
      omId: o.id,
      userTradeId: o.user_trade_id ?? o.userTradeId ?? jClosed?.user_trade_id ?? jClosed?.display_trade_id ?? null,
      journalTradeId: o.journal_trade_id ?? o.journalTradeId ?? jClosed?.journal_trade_id ?? null,
      _sortMs: sortMs,
      _openMs: openMs,
      time: v9FormatTradeTime(openMs),
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
      dur: v9ClosedTradeDuration(tOpen, tClose, rowNowMs),
      preTags: [],
      postTags: [],
      mae: o.mae != null && Number.isFinite(Number.parseFloat(o.mae)) ? fmtPx(o.mae) : undefined,
      mfe: o.mfe != null && Number.isFinite(Number.parseFloat(o.mfe)) ? fmtPx(o.mfe) : undefined,
    };
    attachRawPx(row, o, { entry: o.openPrice, exit: o.closePrice });
    attachJournalTagsToRow(om, row, o);
    rows.push(row);
  });

  appendJournalOnlyClosedRows(om, rows, theme, { fmtPx, fmtQty, sideStr, typeLabel, rowNowMs });

  // Default: per-user trade id ascending when present, else session order id.
  rows.sort((a, b) => {
    const parseDisplay = (r) => {
      const fromUser = Number(r.userTradeId);
      if (Number.isFinite(fromUser) && fromUser > 0) return fromUser;
      const fromText = parseInt(String(r.id || "").replace(/\D/g, ""), 10);
      if (Number.isFinite(fromText) && fromText > 0) return fromText;
      return Number(r.omId) || 0;
    };
    const na = parseDisplay(a);
    const nb = parseDisplay(b);
    if (na !== nb) return na - nb;
    return (a._openMs || a._sortMs || 0) - (b._openMs || b._sortMs || 0);
  });
  return rows;
}

function csvEscapeCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Filter bottom-panel trade rows to match the active tab (all / pending / open / history). */
export function filterTradePanelRowsByTab(rows, btmTab) {
  if (btmTab === "all") return rows;
  if (btmTab === "analytics") return [];
  return rows.filter((r) =>
    btmTab === "pending"
      ? r.status === "pending"
      : btmTab === "open"
        ? r.status === "open"
        : btmTab === "history"
          ? r.status === "closed"
          : false
  );
}

/** Download visible trade-table rows as UTF-8 CSV (matches bottom-panel columns). */
export function exportTradePanelRowsToCsv(rows, btmTab = "all") {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const headers = [
    "ID",
    "Time",
    "Symbol",
    "Side",
    "Status",
    "Size",
    "Type",
    "Entry",
    "Exit",
    "P&L",
    "Duration",
    "Take Profit",
    "Stop Loss",
    "Pre Tags",
    "Post Tags",
    "MAE",
    "MFE",
  ];
  const lines = [headers.map(csvEscapeCell).join(",")];
  rows.forEach((r) => {
    lines.push(
      [
        r.id,
        r.time,
        r.sym,
        r.side,
        r.status,
        r.sz,
        r.type,
        r.entry,
        r.exit,
        r.pnl,
        r.dur,
        r.tp ?? "",
        r.sl ?? "",
        (r.preTags || []).join("; "),
        (r.postTags || []).join("; "),
        r.mae ?? "",
        r.mfe ?? "",
      ]
        .map(csvEscapeCell)
        .join(",")
    );
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const tabSlug =
    btmTab === "all"
      ? "all-trades"
      : btmTab === "pending"
        ? "pending"
        : btmTab === "open"
          ? "open-positions"
          : btmTab === "history"
            ? "history"
            : "trades";
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `talaria-${tabSlug}-${stamp}.csv`;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}

