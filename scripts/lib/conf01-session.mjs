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
