/** Dashboard metric helpers used by Returns & Growth and snapshot KPIs. */

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const tradePnl = (trade) => num(
  trade?.pnl ?? trade?.netPnl ?? trade?.net_pnl ?? trade?.profit ?? trade?.result ?? trade?.p_l ?? 0
);

const tradeR = (trade) => {
  const raw = trade?.rMultiple ?? trade?.r ?? trade?.actualR ?? trade?.actual_r ?? trade?.actualRR ?? trade?.actual_rr_net;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

const tradeDate = (trade) => String(
  trade?.date
  || trade?.calendar
  || trade?.closeDate
  || trade?.close_date
  || trade?.exitDate
  || trade?.exit_date
  || trade?.exitTime
  || trade?.exit_time
  || trade?.entryDate
  || trade?.entry_date
  || trade?.entryTime
  || trade?.entry_time
  || ""
).slice(0, 10);

const isoDay = (value) => {
  if (!value) return null;
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10) || null;
  return d.toISOString().slice(0, 10);
};

const weekKey = (value) => {
  const day = isoDay(value);
  if (!day) return null;
  const d = new Date(`${day}T00:00:00.000Z`);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - dow + 1);
  return d.toISOString().slice(0, 10);
};

const monthKey = (value) => {
  const day = isoDay(value);
  return day ? day.slice(0, 7) : null;
};

const optionsRollingWindow = (values, windowSize) => {
  const slice = values.slice(-Math.max(1, windowSize));
  return slice.length ? slice.reduce((s, v) => s + v, 0) / slice.length : 0;
};

const sortTrades = (trades) => [...(trades || [])].sort((a, b) => {
  const da = tradeDate(a);
  const db = tradeDate(b);
  if (da !== db) return da.localeCompare(db);
  return String(a?.id ?? a?.trade_id ?? "").localeCompare(String(b?.id ?? b?.trade_id ?? ""));
});

export function clampReturnDistributionConfidence(value) {
  const n = Math.round(num(value, 95));
  return Math.max(50, Math.min(99, n));
}

export function computeCostTotals(rows, capital, { commissionModel = "" } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const explicitCostTotal = list.reduce(
    (sum, t) => sum + num(t?.cost ?? t?.costs ?? t?.fees ?? t?.commissionCost ?? 0),
    0
  );
  const model = String(commissionModel || "").toLowerCase();
  const estimatedCostTotal = explicitCostTotal || (
    model && !["none", "no costs", "off"].includes(model)
      ? list.length * Math.max(1000, num(capital, 10000)) * (model.includes("spread") ? 0.00008 : 0.00006)
      : 0
  );
  const totalPnl = list.reduce((sum, t) => sum + tradePnl(t), 0);
  const grossBeforeCosts = totalPnl + Math.max(0, estimatedCostTotal);
  const costDragPct = grossBeforeCosts > 0 ? Math.max(0, estimatedCostTotal) / grossBeforeCosts * 100 : null;
  return {
    costDragDollars: estimatedCostTotal,
    costDragTotalCost: estimatedCostTotal,
    costDragGrossPnl: grossBeforeCosts,
    grossBeforeCosts,
    costDragNetPnl: totalPnl,
    costDragPct,
  };
}

export function computeProfitConcentration(rows, totalPnl, options = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const topPct = num(options.profitConcentrationTopPct, 0.05);
  const secondPct = num(options.profitRobustnessSecondTopPct, 0.10);
  const thresholdPct = num(options.profitConcentrationThresholdPct, 50);
  const floorPct = num(options.profitRobustnessFloorPct, 50);
  const winners = list
    .map((row, index) => ({ row, pnl: num(row?.pnl ?? row?.value), index }))
    .filter(item => item.pnl > 0)
    .sort((a, b) => b.pnl - a.pnl);
  const countFor = (pct) => winners.length ? Math.max(1, Math.ceil(list.length * pct)) : 0;
  const topN = countFor(topPct);
  const top10N = countFor(Math.max(topPct, secondPct));
  const top20N = countFor(Math.max(secondPct, 0.20));
  const topProfit = winners.slice(0, topN).reduce((sum, item) => sum + item.pnl, 0);
  const top10Profit = winners.slice(0, top10N).reduce((sum, item) => sum + item.pnl, 0);
  const top20Profit = winners.slice(0, top20N).reduce((sum, item) => sum + item.pnl, 0);
  const grossProfit = winners.reduce((sum, item) => sum + item.pnl, 0);
  const share = (value) => (grossProfit > 0 ? value / grossProfit * 100 : null);
  const topShare = share(topProfit);
  const top10Share = share(top10Profit);
  const top20Share = share(top20Profit);
  const netTotal = num(totalPnl);
  const netWithoutTop = netTotal - topProfit;
  const netWithoutTop10 = netTotal - top10Profit;
  const holdPct = netTotal > 0 ? Math.max(0, netWithoutTop10) / Math.max(1, netTotal) * 100 : null;
  const cumulative = [];
  let running = 0;
  winners.forEach((item, index) => {
    running += item.pnl;
    cumulative.push({
      index: index + 1,
      xPct: winners.length ? (index + 1) / winners.length * 100 : 0,
      yPct: grossProfit > 0 ? running / grossProfit * 100 : 0,
      pnl: item.pnl,
    });
  });
  const gini = (() => {
    if (!winners.length || grossProfit <= 0) return null;
    const values = winners.map(item => item.pnl);
    const mean = grossProfit / values.length;
    if (!mean) return null;
    let numSum = 0;
    for (let i = 0; i < values.length; i += 1) {
      for (let j = 0; j < values.length; j += 1) {
        numSum += Math.abs(values[i] - values[j]);
      }
    }
    return numSum / (2 * values.length * values.length * mean);
  })();
  const verdict = top10Share == null ? "No winners" : top10Share >= thresholdPct ? "Concentrated" : top10Share >= thresholdPct * 0.6 ? "Moderate" : "Distributed";
  const topPoint = cumulative.find(point => point.xPct >= topPct * 100) || cumulative[cumulative.length - 1] || null;
  return {
    top5Profit: topProfit,
    top10Profit,
    top5ProfitShare: topShare,
    top10ProfitShare: top10Share,
    profitConcentrationTopN: topN,
    profitConcentrationTop10N: top10N,
    profitConcentrationTop20N: top20N,
    profitConcentrationTop10Share: top10Share,
    profitConcentrationTop20Share: top20Share,
    profitConcentrationTop10Profit: top10Profit,
    profitConcentrationTop20Profit: top20Profit,
    profitConcentrationWinnerCount: winners.length,
    profitConcentrationTopPoint: topPoint,
    profitConcentrationCurve: [{ xPct: 0, yPct: 0 }, ...cumulative],
    profitConcentrationGini: gini,
    profitConcentrationGiniDistributedMax: 0.25,
    profitConcentrationGiniConcentratedMin: 0.45,
    profitConcentrationVerdict: verdict,
    profitRobustnessHoldPct: holdPct,
    profitRobustnessClearsFloor: holdPct != null && holdPct >= floorPct,
    netWithoutTop5Profit: netWithoutTop,
    netWithoutTop10Profit: netWithoutTop10,
    grossProfitForConcentration: grossProfit,
  };
}

function aggregateTradeBuckets(trades, aggregation) {
  const sorted = sortTrades(trades);
  if (aggregation === "trades") {
    let balance = 0;
    let cumPnl = 0;
    let peak = 0;
    const rolling = [];
    const rows = [{ key: "start", balance: 0, cumPnl: 0, returnPct: 0, rollingR: 0, peak: 0, pnl: 0, rEquity: 0, label: "Start" }];
    sorted.forEach((trade, index) => {
      const pnl = tradePnl(trade);
      const r = tradeR(trade);
      balance += pnl;
      cumPnl += pnl;
      peak = Math.max(peak, balance);
      rolling.push(r);
      const rollingWindow = optionsRollingWindow(rolling, 20);
      rows.push({
        key: `trade-${index}`,
        trade,
        balance,
        cumPnl,
        returnPct: 0,
        rollingR: rollingWindow,
        peak,
        pnl,
        rEquity: rolling.reduce((s, v) => s + v, 0),
        date: tradeDate(trade),
        firstDateIso: trade?.entryTime || trade?.entry_time || trade?.date,
        label: String(trade?.id ?? trade?.trade_id ?? index + 1),
      });
    });
    return rows;
  }
  const groups = new Map();
  sorted.forEach((trade, index) => {
    const date = tradeDate(trade);
    const key = aggregation === "daily" ? isoDay(date) : aggregation === "weekly" ? weekKey(date) : monthKey(date);
    if (!key) return;
    if (!groups.has(key)) {
      groups.set(key, { key, date: key, pnl: 0, rSum: 0, trades: [], firstDateIso: date, label: key });
    }
    const group = groups.get(key);
    group.pnl += tradePnl(trade);
    group.rSum += tradeR(trade);
    group.trades.push(trade);
  });
  let balance = 0;
  let peak = 0;
  let cumPnl = 0;
  const rolling = [];
  return [
    { key: "start", balance: 0, cumPnl: 0, returnPct: 0, rollingR: 0, peak: 0, pnl: 0, rEquity: 0, label: "Start", date: null },
    ...[...groups.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((group) => {
      const prevBalance = balance;
      balance += group.pnl;
      cumPnl += group.pnl;
      peak = Math.max(peak, balance);
      rolling.push(group.rSum);
      const rollingR = rolling.length ? rolling.reduce((s, v) => s + v, 0) / rolling.length : 0;
      return {
        ...group,
        balance,
        cumPnl,
        returnPct: prevBalance ? (group.pnl / Math.abs(prevBalance || 1)) * 100 : 0,
        rollingR,
        peak,
        rEquity: rolling.reduce((s, v) => s + v, 0),
      };
    }),
  ];
}

export function computeReturnsGrowthEquityCurve(trades, capital, options = {}) {
  const baseCapital = Math.max(0, num(capital));
  const aggregation = options.aggregation || "daily";
  const rows = aggregateTradeBuckets(trades, aggregation);
  let peak = baseCapital;
  return rows.map((row, index) => {
    if (index === 0) {
      return {
        ...row,
        balance: baseCapital,
        peak: baseCapital,
        cumPnl: 0,
        returnPct: 0,
      };
    }
    const offset = baseCapital + num(row.balance);
    peak = Math.max(peak, offset);
    return {
      ...row,
      balance: offset,
      peak,
      cumPnl: num(row.cumPnl),
      returnPct: baseCapital ? ((offset - baseCapital) / baseCapital) * 100 : 0,
    };
  });
}

export function computeReturnsGrowthMetricStrip(trades, capital, { dailyCurve = [] } = {}) {
  const baseCapital = Math.max(1, num(capital, 1));
  const sorted = sortTrades(trades);
  const totalReturnDollars = sorted.reduce((sum, t) => sum + tradePnl(t), 0);
  const totalReturnPct = totalReturnDollars / baseCapital * 100;
  const totalRCaptured = sorted.reduce((sum, t) => sum + tradeR(t), 0);
  const curve = (dailyCurve?.length ? dailyCurve : computeReturnsGrowthEquityCurve(trades, capital, { aggregation: "daily" }))
    .filter(row => row?.key !== "start");
  let priorPeak = baseCapital;
  let aboveCount = 0;
  let newHighCount = 0;
  let longestFlat = 0;
  let flatRun = 0;
  let lastHighIndex = 0;
  curve.forEach((row, index) => {
    const bal = num(row.balance, baseCapital);
    if (bal >= priorPeak) {
      if (bal > priorPeak) newHighCount += 1;
      priorPeak = bal;
      longestFlat = Math.max(longestFlat, flatRun);
      flatRun = 0;
      lastHighIndex = index;
    } else {
      flatRun += 1;
    }
    if (bal >= priorPeak) aboveCount += 1;
  });
  longestFlat = Math.max(longestFlat, flatRun, curve.length ? indexGapDays(curve, lastHighIndex) : 0);
  const first = curve[0];
  const last = curve[curve.length - 1];
  let annualizedReturnPct = null;
  if (first && last) {
    const startBal = num(first.balance, baseCapital);
    const endBal = num(last.balance, baseCapital);
    const startDate = new Date(`${isoDay(first.date) || "1970-01-01"}T00:00:00.000Z`);
    const endDate = new Date(`${isoDay(last.date) || isoDay(last.label) || "1970-01-01"}T00:00:00.000Z`);
    const days = Math.max(1, Math.round((endDate - startDate) / 86400000) + 1);
    if (startBal > 0 && endBal > 0) {
      annualizedReturnPct = (Math.pow(endBal / startBal, 365.25 / days) - 1) * 100;
    }
  }
  const timeAboveWaterPct = curve.length ? aboveCount / curve.length * 100 : 0;
  return {
    annualizedReturnPct,
    totalReturnDollars,
    totalReturnPct,
    timeAboveWaterPct,
    newHighCount,
    totalRCaptured,
    longestFlatStretchDays: longestFlat,
  };
}

function indexGapDays(curve, fromIndex) {
  if (!curve.length) return 0;
  const start = curve[fromIndex]?.date || curve[fromIndex]?.label;
  const end = curve[curve.length - 1]?.date || curve[curve.length - 1]?.label;
  const a = new Date(`${isoDay(start) || "1970-01-01"}T00:00:00.000Z`);
  const b = new Date(`${isoDay(end) || "1970-01-01"}T00:00:00.000Z`);
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function computeMovingAverageRegime(seriesInput, period) {
  const periodN = Math.max(1, Math.round(num(period, 20)));
  const values = (seriesInput || []).map(row => (row?.value == null ? null : num(row.value)));
  const maSeries = values.map((value, index) => {
    const window = values.slice(Math.max(0, index - periodN + 1), index + 1).filter(v => v != null);
    const ma = window.length ? window.reduce((s, v) => s + v, 0) / window.length : null;
    return { value, ma };
  });
  const comparable = maSeries.filter(row => row.value != null && row.ma != null);
  const belowCount = comparable.filter(row => row.value < row.ma).length;
  const latest = comparable[comparable.length - 1];
  let latestState = "insufficient";
  if (comparable.length >= periodN && latest) {
    latestState = latest.value < latest.ma ? "below" : "above";
  }
  return {
    maSeries,
    latestState,
    percentBelow: comparable.length ? belowCount / comparable.length * 100 : 0,
  };
}

export function computePeriodBreakdown(periodRows, grain) {
  const rows = Array.isArray(periodRows) ? periodRows : [];
  const winningRows = rows.filter(row => num(row?.pnl) > 0);
  const losingRows = rows.filter(row => num(row?.pnl) < 0);
  const flatRows = rows.filter(row => num(row?.pnl) === 0);
  const count = rows.length;
  return {
    rows,
    winningRows,
    losingRows,
    flatRows,
    winningCount: winningRows.length,
    losingCount: losingRows.length,
    flatCount: flatRows.length,
    count,
    winRatePct: count ? winningRows.length / count * 100 : 0,
    lossRatePct: count ? losingRows.length / count * 100 : 0,
    flatRatePct: count ? flatRows.length / count * 100 : 0,
    grain,
  };
}

export function computeEmpiricalReturnDistribution(modeKey, values, options = {}) {
  const list = (values || []).filter(v => Number.isFinite(Number(v))).map(Number);
  const ciLevel = clampReturnDistributionConfidence(options.ciLevel ?? 95);
  const bucketCount = Math.max(3, Math.min(24, Math.round(num(options.bucketCount, 12))));
  if (!list.length) {
    return {
      min: 0,
      max: 1,
      mean: 0,
      median: 0,
      buckets: [],
      maxCount: 0,
      winPct: 0,
      count: 0,
      outcomeBand: { low: 0, high: 0 },
      meanCi: { low: 0, high: 0 },
    };
  }
  const sorted = [...list].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  const span = Math.max(1e-9, max - min);
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const start = min + (span / bucketCount) * index;
    const end = index === bucketCount - 1 ? max : min + (span / bucketCount) * (index + 1);
    const count = sorted.filter(v => v >= start && (index === bucketCount - 1 ? v <= end : v < end)).length;
    return { start, end, count, mid: (start + end) / 2 };
  });
  const maxCount = Math.max(1, ...buckets.map(b => b.count));
  const winPct = sorted.filter(v => v > 0).length / sorted.length * 100;
  const alpha = (100 - ciLevel) / 100;
  const lowIdx = Math.floor(sorted.length * (alpha / 2));
  const highIdx = Math.ceil(sorted.length * (1 - alpha / 2)) - 1;
  const variance = sorted.length > 1
    ? sorted.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (sorted.length - 1)
    : 0;
  const stderr = Math.sqrt(variance) / Math.sqrt(sorted.length);
  const z = ciLevel >= 99 ? 2.576 : ciLevel >= 95 ? 1.96 : 1.645;
  return {
    min,
    max,
    mean,
    median,
    buckets,
    maxCount,
    winPct,
    count: sorted.length,
    outcomeBand: { low: sorted[Math.max(0, lowIdx)], high: sorted[Math.min(sorted.length - 1, highIdx)] },
    meanCi: { low: mean - z * stderr, high: mean + z * stderr },
  };
}

export function computeSnapshotMetricCore(rows, capital, options = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const baseCapital = Math.max(1000, num(capital, 10000));
  const totalPnl = list.reduce((sum, t) => sum + tradePnl(t), 0);
  const wins = list.filter(t => tradePnl(t) > 0).length;
  const losses = list.filter(t => tradePnl(t) < 0).length;
  const winRate = list.length ? wins / list.length * 100 : 0;
  const grossWin = list.filter(t => tradePnl(t) > 0).reduce((s, t) => s + tradePnl(t), 0);
  const grossLoss = list.filter(t => tradePnl(t) < 0).reduce((s, t) => s + Math.abs(tradePnl(t)), 0);
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null;
  const avgR = list.length ? list.reduce((s, t) => s + tradeR(t), 0) / list.length : 0;
  const concentration = computeProfitConcentration(list, totalPnl, options);
  const costs = computeCostTotals(list, baseCapital, { commissionModel: options.commissionModel });
  return {
    totalPnl,
    returnPct: baseCapital ? totalPnl / baseCapital * 100 : 0,
    winRate,
    wins,
    losses,
    profitFactor,
    avgR,
    expectancyR: avgR,
    sampleSize: list.length,
    startingBalance: baseCapital,
    endingBalance: baseCapital + totalPnl,
    ...concentration,
    ...costs,
  };
}
