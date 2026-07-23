/**
 * M19-G real-browser acceptance: one panel, ~90 days of retained 1m data,
 * 1D candle replay at 100x, one active order whose SL/TP cannot be hit.
 *
 * Run:
 *   node m19-g-browser-resource-probe.mjs
 */
import { startServer } from './serve.mjs';
import { bootLayout, launchBrowser, sleep } from './harness-lib.mjs';

const MIB = 1024 * 1024;
const TIMEOUT_MS = 20_000;
const ORDER_KIND = String(process.env.M19_G_ORDER_KIND || 'active').toLowerCase() === 'pending'
  ? 'pending'
  : 'active';

function metric(metrics, name) {
  const value = Number(metrics?.[name]);
  return Number.isFinite(value) ? value : 0;
}

async function collectGarbage(client) {
  try {
    await client.send('HeapProfiler.enable');
    await client.send('HeapProfiler.collectGarbage');
  } catch (_) {}
}

async function setupThreeMonthOrderReplay(page, orderKind) {
  return page.evaluate(async (kind) => {
    const first = await fetch(
      '/api/file/25/smart?timeframe=1m&limit=100000&anchor=start&response_format=candles',
    ).then((r) => r.json());
    const firstBars = Array.isArray(first.candles) ? first.candles : [];
    if (!firstBars.length) return { ok: false, reason: 'first 1m chunk empty' };
    const nextStart = Number(firstBars[firstBars.length - 1].t) + 60_000;
    const second = await fetch(
      `/api/file/25/smart?timeframe=1m&limit=100000&anchor=start&response_format=candles&start_ts=${nextStart}`,
    ).then((r) => r.json());
    const fine = firstBars.concat(Array.isArray(second.candles) ? second.candles : []);

    const chart = window.chart;
    const replay = chart && chart.replaySystem;
    const om = chart && chart.orderManager;
    if (!chart || !replay || !om) {
      return { ok: false, reason: 'missing chart/replay/order manager' };
    }

    try {
      if (replay.isPlaying && typeof replay.pause === 'function') replay.pause();
    } catch (_) {}

    chart.currentTimeframe = '1m';
    chart.rawData = fine;
    chart.data = fine;
    if (typeof chart.bumpDataVersion === 'function') chart.bumpDataVersion();

    replay.isActive = true;
    replay.isPlaying = false;
    replay.autoScrollEnabled = true;
    replay.userHasPanned = false;
    replay.playbackMode = 'candle';
    replay.stepTimeframeOverride = null;
    replay.fullRawData = fine;
    replay.fullData = fine;
    replay.rawTimeframe = '1m';
    replay.currentIndex = 0;
    replay.sessionStartIndex = 0;
    replay.replayTimestamp = Number(fine[0].t);
    replay.replayStartTimestamp = Number(fine[0].t);
    replay.replayEndTimestamp = Number(fine[fine.length - 1].t);
    replay.tickElapsedMs = 0;
    replay._persistedPlayheadApplied = true;
    replay.buildTickPathCache();

    const firstFine = fine[0];
    const far = 100;
    const order = {
      id: 990019,
      status: 'OPEN',
      type: 'BUY',
      direction: 'BUY',
      orderType: 'market',
      ticker: chart.currentSymbol,
      symbol: chart.currentSymbol,
      sourceFileId: chart.currentFileId != null ? String(chart.currentFileId) : null,
      quantity: 0.01,
      originalQuantity: 0.01,
      openPrice: Number(firstFine.c),
      openTime: Number(firstFine.t),
      entryMarkerTimeMs: Number(firstFine.t),
      stopLoss: Number(firstFine.c) - far,
      takeProfit: Number(firstFine.c) + far,
      initialStopLoss: Number(firstFine.c) - far,
      initial_sl: Number(firstFine.c) - far,
      array_base_price: Number(firstFine.c),
      highestPrice: Number(firstFine.c),
      lowestPrice: Number(firstFine.c),
      riskAmount: 100,
      originalRiskAmount: 100,
      unrealizedPnL: 0,
      autoBreakeven: false,
      trailingStop: null,
      tpTargets: [{
        id: 'm19-g-tp',
        price: Number(firstFine.c) + far,
        percentage: 100,
        hit: false,
      }],
      partialCloses: [],
      partialClosePnL: 0,
      sl_modifications: [],
      trail_sl_path: [],
      bar_close_r: [],
      bar_high_r: [],
      bar_low_r: [],
      post_exit_bar_close_r: [],
      post_exit_bar_high_r: [],
      post_exit_bar_low_r: [],
    };
    const moneyRecord = kind === 'pending'
      ? {
        ...order,
        status: 'PENDING',
        orderType: 'limit',
        direction: 'BUY',
        entryPrice: Number(firstFine.c) - far,
        stopLoss: Number(firstFine.c) - far - 1,
        takeProfit: Number(firstFine.c) + far,
        openTime: undefined,
        entryMarkerTimeMs: undefined,
        _noFillBeforeTime: Number(firstFine.t),
        _noFillBeforeTick: -1,
      }
      : order;
    om.pendingOrders = kind === 'pending' ? [moneyRecord] : [];
    om.openPositions = kind === 'pending' ? [] : [moneyRecord];
    om.orders = kind === 'pending' ? [] : [moneyRecord];
    om.mfeMaeTrackingPositions = [];
    if (typeof om._seedOrderLifecycleEvent === 'function') {
      om._seedOrderLifecycleEvent(moneyRecord, firstFine);
    }
    if (typeof om._retainCurrentOrderExecutionSeries === 'function') {
      om._retainCurrentOrderExecutionSeries();
    }

    const daily = chart.resampleData(fine, '1d');
    chart.currentTimeframe = '1d';
    replay.fullRawData = daily;
    replay.fullData = daily;
    replay.rawTimeframe = '1d';
    replay.currentIndex = 0;
    replay.sessionStartIndex = 0;
    replay.replayTimestamp = Number(fine[0].t);
    replay.replayStartTimestamp = Number(fine[0].t);
    replay.replayEndTimestamp = Number(daily[daily.length - 1].t);
    chart.rawData = daily.slice(0, 1);
    chart.data = chart.resampleData(chart.rawData, '1d');
    if (typeof chart.bumpDataVersion === 'function') chart.bumpDataVersion();

    // Count only the per-minute messages implicated in DevTools retention.
    const originalLog = console.log;
    window.__m19gHotLogCount = 0;
    console.log = (...args) => {
      const text = typeof args[0] === 'string' ? args[0] : '';
      if (/Checking .*TP targets|Target \d+:|Total Unrealized P&L|BUY #990019/.test(text)) {
        window.__m19gHotLogCount += 1;
        return;
      }
      return originalLog.apply(console, args);
    };

    replay.updateChartData(false);
    replay.speed = 100;
    if (typeof replay.updateSpeedButtonUI === 'function') replay.updateSpeedButtonUI(100);
    const cadence = replay.getCandlePlaybackCadence();
    const originalCadence = replay.getCandlePlaybackCadence.bind(replay);
    window.__m19gSawMoneyPath = false;
    window.__m19gMaxMoneyPathSteps = 0;
    replay.getCandlePlaybackCadence = function m19gObservedCadence() {
      const next = originalCadence();
      if (next?.orderMoneyPath === true) {
        window.__m19gSawMoneyPath = true;
        window.__m19gMaxMoneyPathSteps = Math.max(
          Number(window.__m19gMaxMoneyPathSteps) || 0,
          Number(next.stepsPerTick) || 0,
        );
      }
      return next;
    };
    window.__m19gTargetTs = Number(daily[daily.length - 1].t);
    window.__m19gFineCount = fine.length;
    window.__m19gOrder = moneyRecord;

    return {
      ok: true,
      orderKind: kind,
      buildId: window.__TALARIA_CHART_BUILD_ID || null,
      fineCount: fine.length,
      dailyCount: daily.length,
      startTs: Number(fine[0].t),
      targetTs: window.__m19gTargetTs,
      tickCacheAtStart: Object.keys(replay.tickPathCache || {}).length,
      executionCadenceMs: om.getOrderExecutionCadenceMs(),
      pausedCadence: cadence,
    };
  }, orderKind);
}

async function readState(page) {
  return page.evaluate(() => {
    const chart = window.chart;
    const replay = chart && chart.replaySystem;
    const om = chart && chart.orderManager;
    const order = (om?.openPositions || [])[0]
      || (om?.pendingOrders || [])[0]
      || window.__m19gOrder;
    return {
      replayTs: Number(replay?.replayTimestamp),
      targetTs: Number(window.__m19gTargetTs),
      playing: !!replay?.isPlaying,
      tickCache: replay ? Object.keys(replay.tickPathCache || {}).length : null,
      openCount: om?.openPositions?.length ?? null,
      pendingCount: om?.pendingOrders?.length ?? null,
      closeTail: order?.bar_close_r?.length ?? null,
      highTail: order?.bar_high_r?.length ?? null,
      lowTail: order?.bar_low_r?.length ?? null,
      sampleCount: Number(order?.bar_r_count) || 0,
      hotLogs: Number(window.__m19gHotLogCount) || 0,
      sawOrderMoneyPath: window.__m19gSawMoneyPath === true,
      maxMoneyPathSteps: Number(window.__m19gMaxMoneyPathSteps) || 0,
    };
  });
}

async function main() {
  const server = await startServer();
  const browser = await launchBrowser({ headful: false });
  let boot;
  try {
    boot = await bootLayout(browser, server, { pair: 'same', panels: 1, tf: '1m' });
    const { page } = boot;
    const client = await page.createCDPSession();
    await client.send('Performance.enable');

    const setup = await setupThreeMonthOrderReplay(page, ORDER_KIND);
    if (!setup?.ok) throw new Error(setup?.reason || 'setup failed');
    await collectGarbage(client);
    const before = await page.metrics();

    const playCadence = await page.evaluate(() => {
      const replay = window.chart?.replaySystem;
      replay?.play?.();
      return replay?.getCandlePlaybackCadence?.() || null;
    });

    const started = Date.now();
    let peakHeap = metric(before, 'JSHeapUsedSize');
    let state = await readState(page);
    while (Date.now() - started < TIMEOUT_MS) {
      await sleep(50);
      const metrics = await page.metrics();
      peakHeap = Math.max(peakHeap, metric(metrics, 'JSHeapUsedSize'));
      state = await readState(page);
      if (Number.isFinite(state.replayTs)
        && Number.isFinite(state.targetTs)
        && state.replayTs >= state.targetTs) break;
    }

    await page.evaluate(() => window.chart?.replaySystem?.pause?.());
    const beforeGc = await page.metrics();
    await collectGarbage(client);
    const afterGc = await page.metrics();
    state = await readState(page);

    const elapsedMs = Date.now() - started;
    const reachedTarget = Number.isFinite(state.replayTs)
      && Number.isFinite(state.targetTs)
      && state.replayTs >= state.targetTs;
    const result = {
      ticket: 'M19-G',
      scenario: `one-panel / 90-day 1m feed / 1D candle replay / 100x / ${ORDER_KIND} order`,
      setup,
      playCadence,
      elapsedMs,
      reachedTarget,
      state,
      memoryMiB: {
        before: +(metric(before, 'JSHeapUsedSize') / MIB).toFixed(1),
        peak: +(peakHeap / MIB).toFixed(1),
        beforeGc: +(metric(beforeGc, 'JSHeapUsedSize') / MIB).toFixed(1),
        afterGc: +(metric(afterGc, 'JSHeapUsedSize') / MIB).toFixed(1),
        retainedGrowth: +(
          (metric(afterGc, 'JSHeapUsedSize') - metric(before, 'JSHeapUsedSize')) / MIB
        ).toFixed(1),
      },
      taskDurationSeconds: +(
        metric(beforeGc, 'TaskDuration') - metric(before, 'TaskDuration')
      ).toFixed(3),
    };
    result.pass = reachedTarget
      && setup.fineCount >= 129_000
      && setup.executionCadenceMs === 60_000
      && state.sawOrderMoneyPath === true
      && state.maxMoneyPathSteps > 1
      && state.tickCache <= 512
      && (state.closeTail == null || state.closeTail <= 256)
      && (state.highTail == null || state.highTail <= 256)
      && (state.lowTail == null || state.lowTail <= 256)
      && (ORDER_KIND === 'pending' ? state.pendingCount === 1 : state.openCount === 1)
      && state.hotLogs === 0
      && result.memoryMiB.peak <= 512
      && result.memoryMiB.afterGc <= 256
      && result.memoryMiB.retainedGrowth <= 128;

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.pass) process.exitCode = 1;
  } finally {
    try { await boot?.close?.(); } catch (_) {}
    try { await browser.close(); } catch (_) {}
    try { await server.close(); } catch (_) {}
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 2;
});
