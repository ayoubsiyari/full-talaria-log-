/**
 * CONF01-SESSION-V1 — boot and PROVE the reference configuration.
 *
 * CONF-01: four panels, four different symbols, four different timeframes,
 * indicators loaded, orders open. Same-pair measurements carry no acceptance
 * weight, so an instrument that cannot prove which configuration it measured
 * cannot publish a number. This module boots the configuration and returns a
 * compliance verdict that every C-owned instrument must attach to its report.
 *
 * The verdict is not cosmetic. A host timeframe pick fans out to every panel when
 * Interval sync is on, which silently collapses four datasets back to one — the
 * exact way a "distinct" harness can end up measuring the cheap path. Observed
 * per-panel (fileId, timeframe) pairs are read back from the product and graded
 * against the plan.
 */
import {
  applyDatasetPlan,
  applyDistV9LayoutViaUi,
  dismissCookieBanner,
  loadPuppeteer,
  readPanelDatasets,
  resolveDeployedFileIds,
  uiLoginDeployed,
  waitForDistV9SingleReady,
} from './heap-cycle-browser.mjs';
import {
  HEAP_CYCLE_DATASET_MODE_DISTINCT,
  HEAP_CYCLE_DISTINCT_TIMEFRAMES,
  buildDatasetPlan,
} from './heap-cycle-dataset-config.mjs';
import { armHeapCyclePoWorkload } from './heap-cycle-po-workload.mjs';
import { reactParityUrlWithLayout } from '../../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';

export const CONF01_SIGNATURE = 'CONF01-SESSION-V1';
export const CONF01_PANEL_IDS = Object.freeze(['A', 'B', 'C', 'D']);
const DEFAULT_ORIGIN = 'http://31.97.192.82:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Read CONF-01 state from the product itself, twice, so playback is judged by the
 * replay index ADVANCING rather than by an `isPlaying` flag that lags the `play()`
 * call by two animation frames. Arming self-reports are not evidence.
 */
export async function readConf01State(page, { advanceWindowMs = 4_000 } = {}) {
  const read = async () => {
    const rows = [];
    for (const frame of page.frames()) {
      const got = await frame.evaluate(() => {
        const ch = window.chart;
        if (!ch) return null;
        const rs = ch.replaySystem;
        const svc = (ch.orderManager || window.orderManager)?.orderService;
        const active = (ch.indicators && Array.isArray(ch.indicators.active))
          ? ch.indicators.active.length
          : (Array.isArray(ch.activeIndicators) ? ch.activeIndicators.length : null);
        return {
          fileId: ch.currentFileId != null ? String(ch.currentFileId) : null,
          timeframe: ch.currentTimeframe != null ? String(ch.currentTimeframe) : null,
          symbol: String(ch.currentSymbol || ch.symbol || ch.ticker || ch.currentTicker || '') || null,
          bars: Array.isArray(ch.data) ? ch.data.length : null,
          rawBars: Array.isArray(ch.rawData) ? ch.rawData.length : null,
          panelFullRawBars: Array.isArray(ch._panelFullRawData) ? ch._panelFullRawData.length : null,
          replayActive: !!(rs && rs.isActive),
          replayPlaying: !!(rs && rs.isPlaying),
          replayIndex: rs && rs.currentIndex != null ? Number(rs.currentIndex) : null,
          // The continuous playhead. A 1h-timeframe panel at 60x closes a bar once
          // a minute, so a bar-index test cannot tell a slow panel from a stalled
          // one; simulated time can.
          replayTimestamp: rs && Number.isFinite(Number(rs.replayTimestamp))
            ? Number(rs.replayTimestamp) : null,
          indicators: active,
          openPositions: svc && Array.isArray(svc.openPositions) ? svc.openPositions.length : null,
          orders: svc && Array.isArray(svc.orders) ? svc.orders.length : null,
          closedTrades: svc && Array.isArray(svc.closedTrades) ? svc.closedTrades.length : null,
          isHost: window.top === window,
        };
      }).catch(() => null);
      if (got) rows.push(got);
    }
    return rows;
  };
  const first = await read();
  await sleep(advanceWindowMs);
  const second = await read();
  const byKey = (rows) => new Map(rows.map((r, i) => [`${r.fileId}@${r.timeframe}#${i}`, r]));
  const firstMap = byKey(first);
  const panels = second.map((r, i) => {
    const key = `${r.fileId}@${r.timeframe}#${i}`;
    const was = firstMap.get(key);
    const advancedBars = was && r.bars != null && was.bars != null ? r.bars - was.bars : null;
    const advancedIndex = was && r.replayIndex != null && was.replayIndex != null
      ? r.replayIndex - was.replayIndex : null;
    const advancedSimMs = was && r.replayTimestamp != null && was.replayTimestamp != null
      ? r.replayTimestamp - was.replayTimestamp : null;
    return {
      ...r,
      advancedBars,
      advancedIndex,
      advancedSimMs,
      advancing: (advancedSimMs || 0) > 0 || (advancedIndex || 0) > 0 || (advancedBars || 0) > 0,
    };
  });
  return {
    panels,
    charts: panels.length,
    advancingPanels: panels.filter((p) => p.advancing).length,
    advanceWindowMs,
    simMsPerPanel: panels.map((p) => p.advancedSimMs),
    playingFlagPanels: panels.filter((p) => p.replayPlaying).length,
    distinctFileIds: [...new Set(panels.map((p) => p.fileId).filter(Boolean))],
    distinctTimeframes: [...new Set(panels.map((p) => p.timeframe).filter(Boolean))],
    indicatorsPerPanel: panels.map((p) => p.indicators),
    ordersTotal: panels.reduce((s, p) => s + (p.orders || 0), 0),
    openPositionsTotal: panels.reduce((s, p) => s + (p.openPositions || 0), 0),
    totalBars: panels.reduce((s, p) => s + (p.bars || 0), 0),
    totalPanelFullRawBars: panels.reduce((s, p) => s + (p.panelFullRawBars || 0), 0),
  };
}

/**
 * Grade a booted session against CONF-01. Every requirement is reported
 * separately so a partial boot is never rounded up to compliant, and each one is
 * judged from the product's own state rather than from the arming call's return.
 */
export function assessConf01Compliance({
  panelCount, fileChoice, datasetAssessment, workload, state,
}) {
  const minIndicators = 3;
  const indicatorCounts = state?.indicatorsPerPanel || [];
  const requirements = {
    fourPanels: (state?.charts ?? panelCount) >= 4,
    fourDistinctSymbols: (fileChoice?.distinctSymbols || 0) >= 4
      && (state?.distinctFileIds?.length || 0) >= 4,
    fourDistinctTimeframes: (state?.distinctTimeframes?.length
      || new Set((datasetAssessment?.observed || []).map((r) => String(r.timeframe))).size) >= 4,
    plannedAssignmentLanded: datasetAssessment?.ok === true
      && (datasetAssessment?.mismatches?.length || 0) === 0,
    indicatorsLoaded: indicatorCounts.length >= 4
      && indicatorCounts.every((c) => Number(c) >= minIndicators),
    ordersOpen: ((state?.openPositionsTotal || 0) + (state?.ordersTotal || 0)) >= 1,
    // Judged by the replay index moving, not by the flag or the arming report.
    playbackAdvancing: (state?.advancingPanels || 0) >= 4,
  };
  const failed = Object.entries(requirements).filter(([, ok]) => !ok).map(([k]) => k);
  return {
    signature: CONF01_SIGNATURE,
    compliant: failed.length === 0,
    requirements,
    failed,
    // Spelled out on every report: a same-pair or partial run is a diagnostic,
    // never an acceptance.
    acceptanceWeight: failed.length === 0 ? 'CONF-01 compliant: carries acceptance weight' : 'DIAGNOSTIC ONLY: not CONF-01 compliant',
    observedDatasets: (datasetAssessment?.observed || []).map((r) => ({
      panelId: r.panelId, fileId: r.fileId, timeframe: r.timeframe, bars: r.bars ?? null,
    })),
    symbols: fileChoice?.symbols || [],
    productState: state ? {
      charts: state.charts,
      advancingPanels: state.advancingPanels,
      playingFlagPanels: state.playingFlagPanels,
      indicatorsPerPanel: state.indicatorsPerPanel,
      ordersTotal: state.ordersTotal,
      openPositionsTotal: state.openPositionsTotal,
      distinctTimeframes: state.distinctTimeframes,
      distinctFileIds: state.distinctFileIds,
      totalBars: state.totalBars,
      totalPanelFullRawBars: state.totalPanelFullRawBars,
    } : null,
  };
}

/**
 * Wait until every frame that has a chart also has replay and enough bars to arm.
 * Reports what was outstanding on failure rather than only that it failed — a late
 * panel in this configuration is usually waiting on its own /bars request.
 */
export async function waitConf01PanelsReady(page, { timeoutMs = 150_000, want = 4 } = {}) {
  const started = Date.now();
  let perFrame = [];
  while (Date.now() - started < timeoutMs) {
    perFrame = [];
    for (const frame of page.frames()) {
      const got = await frame.evaluate(() => {
        const ch = window.chart;
        if (!ch) return null;
        return {
          fileId: ch.currentFileId != null ? String(ch.currentFileId) : null,
          timeframe: ch.currentTimeframe != null ? String(ch.currentTimeframe) : null,
          bars: Array.isArray(ch.data) ? ch.data.length : 0,
          hasReplay: !!ch.replaySystem,
        };
      }).catch(() => null);
      if (got) perFrame.push(got);
    }
    const ready = perFrame.filter((r) => r.hasReplay && r.bars > 20);
    if (ready.length >= want) {
      return { allReady: true, waitedMs: Date.now() - started, perFrame, inFlight: page.__conf01InFlight ? [...page.__conf01InFlight] : [] };
    }
    await sleep(1_000);
  }
  return {
    allReady: false,
    waitedMs: Date.now() - started,
    perFrame,
    inFlight: page.__conf01InFlight ? [...page.__conf01InFlight] : [],
  };
}

export async function bootConf01Session({
  replaySpeed = 60,
  headless = true,
  timeframes = HEAP_CYCLE_DISTINCT_TIMEFRAMES,
  settleMs = 10_000,
  extraArgs = [],
  disableFlags = [],
} = {}) {
  const origin = String(process.env.TEST_VPS_URL || DEFAULT_ORIGIN).replace(/\/$/, '');
  const email = String(process.env.TEST_EMAIL || '').trim();
  const password = String(process.env.TEST_PASSWORD || '').trim();
  if (!email || !password) throw new Error('CONF-01 session requires TEST_EMAIL and TEST_PASSWORD');

  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    headless,
    protocolTimeout: 300_000,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-precise-memory-info',
      // Unattended multi-hour runs must not be throttled for being unfocused,
      // or the instrument measures a paused chart and calls it flat.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      ...extraArgs,
    ],
    defaultViewport: headless ? { width: 1600, height: 1000 } : null,
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  // A request that never returns is the difference between "slow panel" and "the
  // window-claim hang again", so track what is outstanding at all times.
  const inFlight = new Map();
  page.__conf01InFlight = [];
  const refreshInFlight = () => {
    const now = Date.now();
    page.__conf01InFlight = [...inFlight.entries()]
      .map(([url, at]) => ({ url, pendingMs: now - at }))
      .filter((r) => r.pendingMs > 3_000)
      .sort((a, b) => b.pendingMs - a.pendingMs)
      .slice(0, 8);
  };
  page.on('request', (req) => { inFlight.set(req.url(), Date.now()); refreshInFlight(); });
  page.on('requestfinished', (req) => { inFlight.delete(req.url()); refreshInFlight(); });
  page.on('requestfailed', (req) => { inFlight.delete(req.url()); refreshInFlight(); });
  const browserCdp = await browser.target().createCDPSession();
  await uiLoginDeployed(page, origin, email, password);
  await page.evaluate(() => {
    localStorage.setItem('_uid', '1');
    if (!localStorage.getItem('u1_backtestingSession')) {
      localStorage.setItem('u1_backtestingSession', JSON.stringify({
        type: 'standard',
        startBalance: 10000,
        session_id: `conf01-${Date.now()}`,
        instruments: { EURUSD: { ticker: 'EURUSD', fileId: 25 } },
      }));
    }
  });

  const url = reactParityUrlWithLayout(`${origin}/chart/dist-v9/index.html?mode=backtest`, '1');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  if (/\/login\/?/i.test(new URL(page.url()).pathname)) {
    await dismissCookieBanner(page);
    await uiLoginDeployed(page, origin, email, password);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  }
  await dismissCookieBanner(page).catch(() => {});
  await waitForDistV9SingleReady(page, 180_000);
  if (disableFlags.length) {
    await page.evaluate((names) => {
      for (const n of names) { try { window[n] = true; } catch (_) {} }
    }, disableFlags);
  }
  const buildId = await page.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null).catch(() => null);

  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');

  // Four panels, then four symbols at four timeframes, then indicators/orders/play.
  await applyDistV9LayoutViaUi(page, 4, 0);
  await sleep(settleMs);
  const fileChoice = await resolveDeployedFileIds(page);
  const plan = buildDatasetPlan({
    mode: HEAP_CYCLE_DATASET_MODE_DISTINCT,
    panelIds: CONF01_PANEL_IDS,
    fileIds: fileChoice.fileIds,
    timeframes,
  });
  const datasets = await applyDatasetPlan(page, plan, { timeoutMs: 90_000 });

  // A panel that is still fetching its own base series is not ready to arm, and in
  // the four-symbol configuration nothing is shared so every panel pays that wait
  // separately. Wait for all four here rather than letting the arming time out.
  const readiness = await waitConf01PanelsReady(page, { timeoutMs: 150_000 });
  if (!readiness.allReady) {
    console.error(`[conf01] panels not ready after ${readiness.waitedMs}ms: ${JSON.stringify(readiness.perFrame)} inFlight=${JSON.stringify(readiness.inFlight)}`);
  }
  let workload;
  try {
    workload = await armHeapCyclePoWorkload(page, {
      panelIds: CONF01_PANEL_IDS,
      replaySpeed,
      playHoldMs: 8_000,
      retainIndicators: true,
    });
  } catch (error) {
    // One retry after a longer wait; a failed arm is graded, never thrown, so the
    // run still reports which requirement was missed.
    console.error(`[conf01] arm failed (${String(error?.message || error)}); retrying after extra wait`);
    await waitConf01PanelsReady(page, { timeoutMs: 120_000 });
    workload = await armHeapCyclePoWorkload(page, {
      panelIds: CONF01_PANEL_IDS,
      replaySpeed,
      playHoldMs: 8_000,
      retainIndicators: true,
    }).catch((retryError) => ({
      armed: false,
      indicatorsOk: false,
      order: { ok: false },
      observedPlaying: 0,
      armError: String(retryError?.message || retryError),
    }));
  }
  await sleep(settleMs);

  const observed = await readPanelDatasets(page, CONF01_PANEL_IDS).catch(() => []);
  let state = await readConf01State(page);
  // Peers cannot follow a host replay master when the symbols differ (the sixteen
  // same-pair guards all return false), so each panel must be armed in its own
  // right. One re-arm pass before grading, then the verdict stands as measured.
  if (state.advancingPanels < 4) {
    await keepConf01Playing(page, replaySpeed);
    await sleep(4_000);
    state = await readConf01State(page);
  }
  const compliance = assessConf01Compliance({
    panelCount: observed.length || CONF01_PANEL_IDS.length,
    fileChoice,
    datasetAssessment: { ...datasets.assessment, observed: observed.length ? observed : datasets.observed },
    workload,
    state,
  });

  return {
    browser, page, cdp, browserCdp, url, origin,
    conf01: {
      ...compliance,
      buildId,
      replaySpeed,
      fileIds: fileChoice.fileIds,
      workloadSummary: {
        indicatorsOk: workload.indicatorsOk,
        panels: workload.panels,
        order: workload.order,
        observedPlaying: workload.observedPlaying,
        armed: workload.armed,
      },
    },
  };
}

/**
 * Re-arm playback on every panel; returns how many are playing.
 *
 * A panel parked at the last bar of its resident data cannot play, and in the
 * four-symbol configuration the peers arrive there within seconds — they exhaust
 * their window and stop while the host keeps its 60x cadence. Playing on requires
 * seeking such a panel back into its data, so the re-arm does that and counts it.
 * The count is evidence, not housekeeping: a workload that needs re-seeding to stay
 * alive is a workload whose product does not play.
 */
export async function keepConf01Playing(page, replaySpeed = 60, { reseekFraction = 0.2 } = {}) {
  let playing = 0;
  let reseeks = 0;
  const perPanel = [];
  for (const frame of page.frames()) {
    const got = await frame.evaluate(async (speed, fraction) => {
      const chart = window.chart;
      const rs = chart && chart.replaySystem;
      if (!rs) return null;
      const bars = Array.isArray(chart.data) ? chart.data.length : 0;
      const atEnd = bars > 0 && rs.currentIndex != null && Number(rs.currentIndex) >= bars - 2;
      let reseeked = false;
      try {
        if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
          rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
        }
        if (typeof rs.setSpeed === 'function') { try { rs.setSpeed(speed); } catch (_) {} }
        if (atEnd && typeof rs.goToReplayTimestamp === 'function' && bars > 50) {
          const target = chart.data[Math.floor(bars * fraction)];
          if (target && target.t != null) {
            rs.goToReplayTimestamp(Number(target.t));
            reseeked = true;
          }
        }
        if (!rs.isPlaying) {
          if (typeof rs.play === 'function') rs.play();
          else if (typeof rs.togglePlay === 'function') rs.togglePlay();
        }
        // play() completes across two animation frames, so isPlaying lags the call.
        const started = Date.now();
        while (Date.now() - started < 4_000 && !rs.isPlaying) {
          await new Promise((r) => setTimeout(r, 100));
        }
        return {
          playing: !!rs.isPlaying,
          active: !!rs.isActive,
          idx: rs.currentIndex,
          bars,
          timeframe: chart.currentTimeframe || null,
          atEndBeforeReseek: atEnd,
          reseeked,
        };
      } catch (_) { return null; }
    }, replaySpeed, reseekFraction).catch(() => null);
    if (got) {
      perPanel.push(got);
      if (got.playing) playing += 1;
      if (got.reseeked) reseeks += 1;
    }
  }
  return { playing, reseeks, perPanel, count: playing };
}

/**
 * CONF-02 workload: open and close trades so CLOSED positions accumulate. A closed
 * trade keeps doing per-candle work (order-manager.js `updatePositions`, wired to
 * `replaySystem.onUpdate`), so a measurement taken with a handful of fresh orders
 * measures the cheap configuration a second time.
 *
 * Closing goes through closePositionAtPrice rather than closePosition, because the
 * latter is the path a confirm modal calls and would stall an unattended run.
 */
export async function cycleTrades(page, { open = 1, close = 1, holdMs = 0 } = {}) {
  return page.evaluate(async (toOpen, toClose, hold) => {
    try { window.alert = () => {}; } catch (_) {}
    try { window.confirm = () => true; } catch (_) {}
    const chart = window.chart;
    const om = chart && (chart.orderManager || window.orderManager);
    const svc = om && om.orderService;
    const candle = chart && Array.isArray(chart.data) && chart.data.length
      ? chart.data[chart.data.length - 1] : null;
    const price = candle && Number(candle.c);
    const out = { opened: 0, closed: 0, errors: [] };
    if (!om || !Number.isFinite(price)) return { ...out, reason: 'no orderManager or price' };

    for (let i = 0; i < toOpen; i += 1) {
      try {
        const dir = i % 2 ? 'SELL' : 'BUY';
        const sl = dir === 'SELL' ? price * 1.01 : price * 0.99;
        // openPrice/array_base_price and initialStopLoss are what
        // _calculateExcursionRValues reads (order-manager.js:3913). Without them
        // plannedRiskPrice is NaN, sampling returns null, and a harness would
        // accumulate closed trades that cost nothing - measuring the cheap
        // configuration for a third time.
        const r = svc && typeof svc.submitOrder === 'function' ? svc.submitOrder({
          orderType: 'market', direction: dir, side: dir, type: dir,
          quantity: 1, entryPrice: price, openPrice: price, array_base_price: price,
          timestamp: candle.t != null ? Number(candle.t) : Date.now(),
          stopLoss: sl, initialStopLoss: sl,
          takeProfit: dir === 'SELL' ? price * 0.99 : price * 1.01,
        }) : null;
        if (r && r.id) out.opened += 1;
      } catch (error) { out.errors.push(String(error?.message || error)); }
    }

    // A trade closed in the same bar it opened accumulates NO excursion samples, so
    // measuring per-tick cost against such trades tests nothing. Hold them open
    // across bar closes first.
    if (hold > 0) await new Promise((r) => setTimeout(r, hold));

    const openList = (Array.isArray(om.openPositions) && om.openPositions.length ? om.openPositions
      : (svc && Array.isArray(svc.openPositions) ? svc.openPositions : []));
    for (let i = 0; i < toClose && openList.length; i += 1) {
      const pos = openList[0];
      if (!pos || pos.id == null) break;
      try {
        if (typeof om.closePositionAtPrice === 'function') {
          om.closePositionAtPrice(pos.id, price, 'MANUAL');
        } else if (typeof om.closePosition === 'function') {
          om.closePosition(pos.id);
        } else break;
        out.closed += 1;
      } catch (error) { out.errors.push(String(error?.message || error)); break; }
    }

    // Closing a position surfaces the trade-details modal, which stops replay and
    // would silently void every subsequent measurement. Dismiss it the way the user
    // does, and report what was dismissed rather than hiding the interaction.
    out.dismissed = [];
    const closeBtn = document.getElementById('closeTradeDetails');
    if (closeBtn) {
      try { closeBtn.click(); out.dismissed.push('#closeTradeDetails'); } catch (_) {}
    }
    for (const sel of ['#tradeDetailsModal', '.trade-details-modal', '.modal-overlay']) {
      for (const el of document.querySelectorAll(sel)) {
        try { el.remove(); out.dismissed.push(sel); } catch (_) {}
      }
    }
    const rs = chart && chart.replaySystem;
    out.replayAfter = rs ? { isActive: !!rs.isActive, isPlaying: !!rs.isPlaying, idx: rs.currentIndex } : null;
    return out;
  }, open, close, holdMs).catch((error) => ({ opened: 0, closed: 0, errors: [String(error?.message || error)] }));
}

/** Open and closed trade counts, wherever the product keeps them. */
export async function readTradeState(page) {
  return page.evaluate(() => {
    const chart = window.chart;
    const om = chart && (chart.orderManager || window.orderManager);
    const svc = om && om.orderService;
    const len = (v) => (Array.isArray(v) ? v.length : null);
    return {
      managerOpen: len(om?.openPositions),
      managerClosed: len(om?.closedPositions),
      managerJournal: len(om?.tradeJournal),
      serviceOpen: len(svc?.openPositions),
      serviceClosed: len(svc?.closedPositions),
      serviceOrders: len(svc?.orders),
    };
  }).catch(() => ({}));
}

/**
 * Retained bytes of screenshot / base64 style fields across open and closed
 * positions. Decides whether the third term in the 15:55 finding is a real term or
 * a footnote, so it counts characters on the actual rows rather than estimating.
 */
export async function measureHeavyFieldBytes(page) {
  return page.evaluate(() => {
    const HEAVY = ['screenshot', 'screenshotBase64', 'image', 'chartImage', 'thumbnail', 'preview', 'screenshots', 'entryScreenshots'];
    const chart = window.chart;
    const om = chart && (chart.orderManager || window.orderManager);
    const svc = om && om.orderService;
    const lists = [
      ['managerOpen', om?.openPositions], ['managerClosed', om?.closedPositions],
      ['managerJournal', om?.tradeJournal], ['serviceOpen', svc?.openPositions],
      ['serviceClosed', svc?.closedPositions],
    ];
    const isHeavyKey = (k) => HEAVY.includes(k);
    const measure = (value, depth = 0) => {
      if (value == null || depth > 3) return 0;
      if (typeof value === 'string') return value.length;
      if (Array.isArray(value)) return value.reduce((s, v) => s + measure(v, depth + 1), 0);
      if (typeof value === 'object') {
        let total = 0;
        for (const [k, v] of Object.entries(value)) {
          if (isHeavyKey(k) || typeof v === 'object') total += measure(v, depth + 1);
        }
        return total;
      }
      return 0;
    };
    const out = { perList: {}, totalChars: 0, rows: 0, rowsWithHeavy: 0, excursionSamples: 0 };
    // The five lists overlap: closedPositions, tradeJournal and the service mirror
    // are the SAME objects, so summing across lists counts one position's arrays
    // three times. Retained bytes are a property of the object, not of how many
    // lists point at it, so the deduped figures are the ones to quote.
    const seen = new Set();
    const dedup = { rows: 0, chars: 0, rowsWithHeavy: 0, excursionSamples: 0 };
    for (const [name, list] of lists) {
      if (!Array.isArray(list)) continue;
      let chars = 0;
      let withHeavy = 0;
      let samples = 0;
      for (const row of list) {
        if (!row || typeof row !== 'object') continue;
        let rowChars = 0;
        for (const key of HEAVY) {
          if (row[key] != null) rowChars += measure(row[key], 1);
        }
        let rowSamples = 0;
        for (const k of ['bar_close_r', 'bar_high_r', 'bar_low_r', 'post_exit_bar_close_r']) {
          if (Array.isArray(row[k])) rowSamples += row[k].length;
        }
        if (rowChars > 0) withHeavy += 1;
        chars += rowChars;
        samples += rowSamples;
        if (!seen.has(row)) {
          seen.add(row);
          dedup.rows += 1;
          dedup.chars += rowChars;
          dedup.excursionSamples += rowSamples;
          if (rowChars > 0) dedup.rowsWithHeavy += 1;
        }
      }
      out.perList[name] = { rows: list.length, heavyChars: chars, rowsWithHeavy: withHeavy, excursionSamples: samples };
      out.totalChars += chars;
      out.rows += list.length;
      out.rowsWithHeavy += withHeavy;
      out.excursionSamples += samples;
    }
    out.heavyMB = +(out.totalChars / 1048576).toFixed(3);
    out.heavyCharsPerRow = out.rows ? Math.round(out.totalChars / out.rows) : 0;
    out.deduped = {
      rows: dedup.rows,
      rowsWithHeavy: dedup.rowsWithHeavy,
      totalChars: dedup.chars,
      heavyMB: +(dedup.chars / 1048576).toFixed(3),
      excursionSamples: dedup.excursionSamples,
      listAliasFactor: dedup.excursionSamples ? +(out.excursionSamples / dedup.excursionSamples).toFixed(2) : null,
    };
    return out;
  }).catch(() => null);
}

/**
 * Install a timing hook on the per-tick order loop in every frame that has one, so
 * its cost can be read as a function of accumulated closed trades.
 */
export async function installOrderLoopTimer(page) {
  const installed = [];
  for (const frame of page.frames()) {
    const got = await frame.evaluate(() => {
      const chart = window.chart;
      const om = chart && (chart.orderManager || window.orderManager);
      if (!om || typeof om.updatePositions !== 'function') return null;
      if (om.__conf02Timed) return { already: true };
      const original = om.updatePositions.bind(om);
      const state = { calls: 0, totalMs: 0, maxMs: 0, since: performance.now() };
      window.__conf02OrderLoop = state;
      om.updatePositions = function timedUpdatePositions(...args) {
        const t0 = performance.now();
        try {
          return original(...args);
        } finally {
          const dt = performance.now() - t0;
          state.calls += 1;
          state.totalMs += dt;
          if (dt > state.maxMs) state.maxMs = dt;
        }
      };
      om.__conf02Timed = true;
      return { installed: true };
    }).catch(() => null);
    if (got) installed.push(got);
  }
  return installed;
}

/** Reset and then read the order-loop timer over a fixed window. */
export async function measureOrderLoopCost(page, { windowMs = 10_000 } = {}) {
  const reset = async () => {
    for (const frame of page.frames()) {
      await frame.evaluate(() => {
        const s = window.__conf02OrderLoop;
        if (s) { s.calls = 0; s.totalMs = 0; s.maxMs = 0; s.since = performance.now(); }
      }).catch(() => {});
    }
  };
  await reset();
  await sleep(windowMs);
  const rows = [];
  for (const frame of page.frames()) {
    const got = await frame.evaluate(() => {
      const s = window.__conf02OrderLoop;
      if (!s) return null;
      const wallMs = performance.now() - s.since;
      const ch = window.chart;
      const om = ch && (ch.orderManager || window.orderManager);
      const len = (v) => (Array.isArray(v) ? v.length : 0);
      return {
        calls: s.calls,
        totalMs: +s.totalMs.toFixed(2),
        maxMs: +s.maxMs.toFixed(2),
        wallMs: Math.round(wallMs),
        msPerCall: s.calls ? +(s.totalMs / s.calls).toFixed(3) : null,
        callsPerSec: wallMs ? +(s.calls / (wallMs / 1000)).toFixed(2) : null,
        percentOfMainThread: wallMs ? +((s.totalMs / wallMs) * 100).toFixed(2) : null,
        // Which frame this is, so cost is attributed to the frame that actually
        // holds the trades: a panel with no orders ticks cheaply and would
        // otherwise be read as the cost of a loaded book.
        isHost: window.top === window,
        timeframe: ch?.currentTimeframe || null,
        closedHere: len(om?.closedPositions),
        openHere: len(om?.openPositions),
        excursionSamplesHere: (om?.closedPositions || []).concat(om?.openPositions || [])
          .reduce((t, p) => t + (Array.isArray(p?.bar_close_r) ? p.bar_close_r.length : 0), 0),
      };
    }).catch(() => null);
    if (got) rows.push(got);
  }
  // The frame with the book is the one whose cost answers the question; among
  // ticking frames prefer the one holding the most closed trades.
  const ticking = rows.filter((r) => r.calls > 0);
  const withBook = [...rows].sort((a, b) => (b.closedHere || 0) - (a.closedHere || 0))[0] || null;
  const bookAndTicking = [...ticking].sort((a, b) => (b.closedHere || 0) - (a.closedHere || 0))[0] || null;
  return {
    perFrame: rows,
    host: rows.find((r) => r.isHost) || rows[0] || null,
    bookFrame: withBook,
    measured: bookAndTicking,
    bookFrameTicking: !!(bookAndTicking && bookAndTicking.closedHere > 0),
    totalPercentOfMainThread: +rows.reduce((s, r) => s + (r.percentOfMainThread || 0), 0).toFixed(2),
  };
}

/**
 * Measure how fast each panel's replay actually advances, against the rate its
 * timeframe and the selected speed imply. Answers whether a peer respects the
 * speed selector or races through its data at frame rate.
 */
export async function probePanelAdvanceRates(page, { windowMs = 6_000, replaySpeed = 60 } = {}) {
  const tfSeconds = (tf) => {
    const m = String(tf || '').match(/^(\d+)\s*([smhdw])$/i);
    if (!m) return null;
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    return n * ({ s: 1, m: 60, h: 3600, d: 86400, w: 604800 })[unit];
  };
  const read = async () => {
    const rows = [];
    for (const frame of page.frames()) {
      const got = await frame.evaluate(() => {
        const ch = window.chart;
        const rs = ch && ch.replaySystem;
        if (!ch || !rs) return null;
        return {
          timeframe: ch.currentTimeframe || null,
          fileId: ch.currentFileId != null ? String(ch.currentFileId) : null,
          // What the product thinks the speed is, and what it offers to set it
          // with: the harness has been asserting 60x without checking either.
          speedField: Number.isFinite(Number(rs.speed)) ? Number(rs.speed) : null,
          playbackSpeedField: Number.isFinite(Number(rs.playbackSpeed)) ? Number(rs.playbackSpeed) : null,
          speedSetters: ['setSpeed', 'setPlaybackSpeed', 'setReplaySpeed', 'changeSpeed']
            .filter((k) => typeof rs[k] === 'function'),
          idx: rs.currentIndex != null ? Number(rs.currentIndex) : null,
          bars: Array.isArray(ch.data) ? ch.data.length : null,
          ts: Number.isFinite(Number(rs.replayTimestamp)) ? Number(rs.replayTimestamp) : null,
          playing: !!rs.isPlaying,
          at: Date.now(),
        };
      }).catch(() => null);
      if (got) rows.push(got);
    }
    return rows;
  };
  // Count animation frames over the same window: if bars advance once per frame,
  // bars/second is the frame rate and the speed setting is decorative.
  // A frame that never paints never fires requestAnimationFrame, so the counter
  // needs its own deadline: zero frames is a legitimate answer, a hang is not.
  const framesPromise = Promise.all(page.frames().map((frame) => frame.evaluate((ms) => new Promise((resolve) => {
    let frames = 0;
    const t0 = performance.now();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve({ frames, wallMs: performance.now() - t0 });
    };
    setTimeout(finish, ms + 1_500);
    const tick = () => {
      frames += 1;
      if (performance.now() - t0 >= ms) finish();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), windowMs).catch(() => null)));

  const before = await read();
  await sleep(windowMs);
  const after = await read();
  const frameCounts = await framesPromise;
  return after.map((a, i) => {
    const fc = frameCounts[i];
    const fps = fc && fc.wallMs ? +(fc.frames / (fc.wallMs / 1000)).toFixed(2) : null;
    const b = before[i] || {};
    const wallSec = (a.at - (b.at || a.at)) / 1000 || windowMs / 1000;
    const barsPerSec = b.idx != null && a.idx != null ? (a.idx - b.idx) / wallSec : null;
    const tfSec = tfSeconds(a.timeframe);
    const expectedBarsPerSec = tfSec ? replaySpeed / tfSec : null;
    const simMsPerSec = b.ts != null && a.ts != null ? (a.ts - b.ts) / wallSec : null;
    return {
      timeframe: a.timeframe,
      fileId: a.fileId,
      playing: a.playing,
      speedField: a.speedField,
      playbackSpeedField: a.playbackSpeedField,
      speedSetters: a.speedSetters,
      bars: a.bars,
      idxFrom: b.idx ?? null,
      idxTo: a.idx ?? null,
      barsPerSec: barsPerSec != null ? +barsPerSec.toFixed(3) : null,
      expectedBarsPerSec: expectedBarsPerSec != null ? +expectedBarsPerSec.toFixed(3) : null,
      framesPerSec: fps,
      barsPerFrame: fps && barsPerSec != null ? +(barsPerSec / fps).toFixed(3) : null,
      rateRatio: barsPerSec != null && expectedBarsPerSec ? +(barsPerSec / expectedBarsPerSec).toFixed(2) : null,
      simSecPerWallSec: simMsPerSec != null ? +(simMsPerSec / 1000).toFixed(1) : null,
      expectedSimSecPerWallSec: replaySpeed,
      atEnd: a.bars != null && a.idx != null ? a.idx >= a.bars - 2 : null,
    };
  });
}
