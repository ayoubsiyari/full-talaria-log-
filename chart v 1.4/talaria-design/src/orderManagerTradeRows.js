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
  if (members.length <= 1) return null;
  members.sort((a, b) => (a.splitIndex || 0) - (b.splitIndex || 0));
  return members;
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
    const t = group.reduce((s, o) => s + (Number(o.quantity) || 0), 0);
    if (t > 0) return t;
  }
  const q = Number(order?.originalQuantity ?? order?.quantity ?? journal?.quantity);
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

/**
 * Entry legs for trade card / journal UI: { price, qty?, filled? }[].
 * Returns null when only a single entry should be shown (caller uses row.entry).
 */
function buildTradeEntryLegs(om, order, journal, fmtPx, fmtQty) {
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
  const group = order ? collectSplitGroupOrders(om, order) : null;
  if (group) {
    return group.map((o) => ({
      price: fmtPx(o.openPrice ?? o.entryPrice),
      qty: fmtQty(o.quantity),
      filled: o.status === "OPEN" || o.status === "closed" || !!o.openTime,
    }));
  }
  return null;
}

/**
 * TP legs for trade card: { price, hit?, pct?, profit?, profitUsd? }[].
 * Returns null when only a single TP should be shown (caller uses row.tp).
 */
function buildTradeTargetLegs(order, journal, fmtPx, om, row) {
  const snap = journal?.multiTpSnapshot || journal?.active_tps_at_exit;
  let tpList = Array.isArray(snap) && snap.length > 0 ? snap : null;
  if (!tpList && Array.isArray(order?.tpTargets) && order.tpTargets.length > 0) {
    tpList = order.tpTargets;
  }
  if (!tpList || tpList.length <= 1) {
    if (!(journal?.hasMultipleTakeProfits && tpList?.length === 1)) return null;
  }
  if (!tpList || tpList.length <= 1) return null;

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
    const isRealized = !!(isClosed && br && ((Number(br.lotsClosed) || 0) > 0 || Math.abs(Number(br.pnl) || 0) > 1e-8));
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
  const entries = buildTradeEntryLegs(om, resolvedOrder, journal, fmtPx, fmtQty);
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
      }
    }
  }
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
  const frozen = Number.parseFloat(journal?.plannedRRAtEntry ?? order?.plannedRRAtEntry);
  if (Number.isFinite(frozen)) return frozen;

  const side = resolveTradeSide(order, journal, row);
  const isLong = side !== "SELL" && side !== "SHORT";
  const entryPx = resolveTradeEntryPxForTpMath(om, order, journal, row);
  const sl = Number.parseFloat(
    journal?.initial_sl ?? order?.initial_sl ?? journal?.stopLoss ?? order?.stopLoss ?? row?.sl
  );
  const qty = resolveTradeQtyForTpMath(om, order, journal, row);
  const riskUsd = Number.parseFloat(
    journal?.originalRiskAmount ?? journal?.riskAmount
      ?? order?.originalRiskAmount ?? order?.riskAmount ?? row?.riskAmount
  );
  if (!Number.isFinite(entryPx) || !(entryPx > 0) || !Number.isFinite(sl)) return null;

  const tpList =
    journal?.plannedTpSnapshot
    || order?.plannedTpSnapshot
    || (Array.isArray(journal?.multiTpSnapshot) && journal.multiTpSnapshot.length > 1
      ? journal.multiTpSnapshot
      : null)
    || (Array.isArray(order?.tpTargets) && order.tpTargets.length > 1 ? order.tpTargets : null);

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
    if (rewardUsd > 0) return rewardUsd / riskUsd;
  }

  const tp = Number.parseFloat(
    journal?.initial_takeProfit ?? order?.initial_takeProfit
      ?? journal?.takeProfit ?? order?.takeProfit ?? row?.tp
  );
  return computePlannedRRFromPrices(entryPx, sl, tp);
}

/** Hero R:R for trade card modal (planned when open, realized when closed). */
export function resolveTradeCardRR(row, theme) {
  const isLong = row?.side === "LONG";
  const entryP = Number.parseFloat(row?.plannedEntryPx ?? row?.entry);
  const slP = Number.parseFloat(row?.sl);
  const tpP = Number.parseFloat(row?.tp);
  const exitP = row?.exit && row.exit !== "—" ? Number.parseFloat(row.exit) : NaN;
  const rrRisk = Math.abs(entryP - slP);
  const rrReward = Math.abs(tpP - entryP);
  const plannedRR = Number.isFinite(row?.plannedRR)
    ? row.plannedRR
    : rrRisk > 0 && Number.isFinite(rrReward)
      ? rrReward / rrRisk
      : null;

  let rrVal = null;
  if (row?.status === "closed") {
    const stored = Number.parseFloat(row?.rMultiple);
    if (Number.isFinite(stored)) {
      rrVal = stored;
    } else if (rrRisk > 0 && Number.isFinite(exitP)) {
      rrVal = isLong ? (exitP - entryP) / rrRisk : (entryP - exitP) / rrRisk;
    }
    const pnlUsd = Number.parseFloat(row?.targetsTotalProfitUsd);
    const pnlFromHero = Number.parseFloat(String(row?.pnl || "").replace(/[^0-9.-]/g, ""));
    const pnlRef = Number.isFinite(pnlFromHero) ? pnlFromHero : pnlUsd;
    if (Number.isFinite(rrVal) && Number.isFinite(pnlRef) && pnlRef !== 0 && rrVal * pnlRef < 0) {
      rrVal = -Math.abs(rrVal);
    } else if (!Number.isFinite(rrVal) && Number.isFinite(row?.riskAmount) && row.riskAmount > 0) {
      const pnl = Number.parseFloat(String(row?.pnl || "").replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(pnl)) rrVal = pnl / row.riskAmount;
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
      : plannedRR != null && rrRisk > 0
        ? plannedRR >= 1
          ? gn
          : rd
        : tm;
  return { rrVal, rrStr, rrCol, rrRisk, plannedRR, plannedAtEntryStr, showPlannedAtEntry };
}

/** Signed realized R-multiple (negative when the trade lost). */
export function extractRealizedRMultiple(trade, om, sideHint) {
  if (!trade || typeof trade !== "object") return null;
  const riskUsd = Number.parseFloat(
    trade.originalRiskAmount ?? trade.riskAmount ?? trade.riskPerTrade
  );
  const pnl = extractOrderManagerTradePnl(trade, om);
  if (riskUsd > 0 && Number.isFinite(pnl)) {
    const computed = pnl / riskUsd;
    const stored = Number.parseFloat(trade.rMultiple ?? trade.actual_rr_net);
    if (Number.isFinite(stored)) {
      if (pnl * stored < 0 && Math.abs(pnl) > 1e-8) return computed;
      return stored;
    }
    return computed;
  }
  const stored = Number.parseFloat(trade.rMultiple ?? trade.actual_rr_net);
  if (Number.isFinite(stored)) return stored;
  const entry = Number.parseFloat(trade.entryPrice ?? trade.openPrice);
  const exit = Number.parseFloat(trade.exitPrice ?? trade.closePrice);
  const sl = Number.parseFloat(trade.stopLoss);
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || !Number.isFinite(sl)) return null;
  const riskPx = Math.abs(entry - sl);
  if (!(riskPx > 0)) return null;
  const dir = String(trade.type ?? trade.direction ?? sideHint ?? "BUY").toUpperCase();
  const isLong = dir !== "SELL" && dir !== "SHORT";
  const move = isLong ? exit - entry : entry - exit;
  return move / riskPx;
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
  if (row.status === "closed") {
    const sideHint = row.side === "SHORT" ? "SELL" : "BUY";
    const realized = extractRealizedRMultiple(journal || order, om, sideHint);
    if (realized != null && Number.isFinite(realized)) row.rMultiple = realized;
  }
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
    const pnlN = extractOrderManagerTradePnl(j, om);
    const { text: pnlText, pc } = v9UsdPnLParts(pnlN);

    const tpTxt =
      j.takeProfit != null && Number.isFinite(Number.parseFloat(j.takeProfit))
        ? fmtPx(j.takeProfit)
        : "—";
    const slTxt =
      j.stopLoss != null && Number.isFinite(Number.parseFloat(j.stopLoss)) ? fmtPx(j.stopLoss) : "—";
    const ot = typeLabel(resolvePositionOrderType(j));

    const row = {
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
    const ot = typeLabel(resolvePositionOrderType(o));
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
    const pnlN = extractOrderManagerTradePnl(o, om);
    const { text: pnlText, pc } = v9UsdPnLParts(pnlN);
    const tpTxt = o.takeProfit != null && Number.isFinite(Number.parseFloat(o.takeProfit)) ? fmtPx(o.takeProfit) : "—";
    const slTxt = o.stopLoss != null && Number.isFinite(Number.parseFloat(o.stopLoss)) ? fmtPx(o.stopLoss) : "—";
    const ot = typeLabel(resolvePositionOrderType(o));
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

