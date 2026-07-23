/**
 * M19-H real-browser acceptance: replay stays responsive while a loaded chart
 * with drawings, indicators, and an active order repeatedly changes timeframe.
 *
 * Run:
 *   node m19-h-browser-stress-probe.mjs
 */
import { startServer } from './serve.mjs';
import { bootLayout, launchBrowser, sleep } from './harness-lib.mjs';

const MIB = 1024 * 1024;
const SWITCH_COUNT = Math.max(4, Number(process.env.M19_H_SWITCH_COUNT) || 20);
const DRAWING_COUNT = Math.max(0, Number(process.env.M19_H_DRAWING_COUNT) || 100);
const DISABLE_FIX = String(process.env.M19_H_DISABLE_FIX || '').trim() === '1';
const CPU_PROFILE = String(process.env.M19_H_CPU_PROFILE || '').trim() === '1';
const TRACE_STATES = String(process.env.M19_H_TRACE_STATES || '').trim() === '1';
const SWITCH_SEQUENCE = ['15m', '1h', '5m', '1m', '5m'];

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

async function setupScenario(page) {
  return page.evaluate(async ({ drawingCount, disableFix }) => {
    window.__TALARIA_DISABLE_M19_H_TF_COALESCE_V1 = disableFix;
    const first = await fetch(
      '/api/file/25/smart?timeframe=1m&limit=100000&anchor=start&response_format=candles',
    ).then((response) => response.json());
    const firstBars = Array.isArray(first.candles) ? first.candles : [];
    if (!firstBars.length) return { ok: false, reason: 'first 1m chunk empty' };
    const nextStart = Number(firstBars[firstBars.length - 1].t) + 60_000;
    const second = await fetch(
      `/api/file/25/smart?timeframe=1m&limit=100000&anchor=start&response_format=candles&start_ts=${nextStart}`,
    ).then((response) => response.json());
    const fine = firstBars.concat(Array.isArray(second.candles) ? second.candles : []);

    const chart = window.chart;
    const replay = chart?.replaySystem;
    const dm = chart?.drawingManager;
    const om = chart?.orderManager;
    if (!chart || !replay || !dm || !om) {
      return { ok: false, reason: 'missing chart runtime managers' };
    }

    try {
      if (replay.isPlaying && typeof replay.pause === 'function') replay.pause();
    } catch (_) {}

    const startIndex = Math.max(1000, Math.min(fine.length - 5000, 90_000));
    chart.isBacktestMode = false;
    chart.currentFileId = null;
    chart._nativeRawFetchTf = '1m';
    chart.currentTimeframe = '5m';
    replay.isActive = true;
    replay.isPlaying = false;
    replay.autoScrollEnabled = true;
    replay.userHasPanned = false;
    replay.playbackMode = 'candle';
    replay.stepTimeframeOverride = null;
    replay.fullRawData = fine;
    replay.fullData = fine;
    replay.rawTimeframe = '1m';
    replay.currentIndex = startIndex;
    replay.sessionStartIndex = 0;
    replay.replayTimestamp = Number(fine[startIndex].t);
    replay.replayStartTimestamp = Number(fine[0].t);
    replay.replayEndTimestamp = Number(fine[fine.length - 1].t);
    replay.tickElapsedMs = 0;
    replay._persistedPlayheadApplied = true;
    replay.buildTickPathCache();
    replay.updateChartData(false);

    const firstFine = fine[startIndex];
    const far = 100;
    const order = {
      id: 990020,
      status: 'OPEN',
      type: 'BUY',
      direction: 'BUY',
      orderType: 'market',
      ticker: chart.currentSymbol,
      symbol: chart.currentSymbol,
      sourceFileId: null,
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
        id: 'm19-h-tp',
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
    om.pendingOrders = [];
    om.openPositions = [order];
    om.orders = [order];
    om.mfeMaeTrackingPositions = [];
    if (typeof om._seedOrderLifecycleEvent === 'function') {
      om._seedOrderLifecycleEvent(order, firstFine);
    }
    if (typeof om._retainCurrentOrderExecutionSeries === 'function') {
      om._retainCurrentOrderExecutionSeries();
    }

    const trendInfo = dm.toolRegistry?.trendline;
    if (!trendInfo?.class) return { ok: false, reason: 'trendline tool missing' };
    const oldSave = dm.saveDrawings;
    const oldRenderDrawing = dm.renderDrawing;
    dm.saveDrawings = () => {};
    dm.renderDrawing = () => {};
    try {
      const data = chart.data;
      const last = data.length - 1;
      for (let i = 0; i < drawingCount; i++) {
        const right = Math.max(2, last - (i % 180));
        const left = Math.max(0, right - 12 - (i % 20));
        const p1 = Number(data[left]?.c);
        const p2 = Number(data[right]?.c);
        const drawing = new trendInfo.class([
          { x: left, y: p1 },
          { x: right, y: p2 },
        ], {});
        drawing.type = 'trendline';
        drawing.id = `m19-h-line-${i}`;
        drawing.chart = chart;
        dm.addDrawing(drawing);
      }
    } finally {
      dm.saveDrawings = oldSave;
      dm.renderDrawing = oldRenderDrawing;
    }
    dm.refreshDrawingsForTimeframe({ syncOnly: true });
    dm.redrawAll({ forceFull: true });

    const indicatorSpecs = [
      ['sma', { period: 20 }],
      ['ema', { period: 50 }],
      ['rsi', { period: 14 }],
      ['macd', { fast: 12, slow: 26, signal: 9 }],
      ['bollinger', { period: 20, stdDev: 2 }],
      ['atr', { period: 14 }],
      ['stochastic', { period: 14, smoothK: 3, smoothD: 3 }],
      ['adx', { period: 14 }],
    ];
    for (const [type, params] of indicatorSpecs) {
      try { chart.addIndicator(type, params); } catch (_) {}
    }

    const counters = {
      renders: 0,
      resamples: 0,
      drawingResyncs: 0,
      drawingRefreshes: 0,
      drawingRedraws: 0,
      syncIndicatorCalcs: 0,
      asyncIndicatorCalcs: 0,
      workerCommits: 0,
      freezeCaptures: 0,
      updateChartData: 0,
      replayTfChanges: 0,
      drawingSaves: 0,
      playCalls: 0,
      pauseCalls: 0,
      playbackEnds: 0,
      deferredPlayCancels: 0,
    };
    const wrap = (owner, key, counter) => {
      if (!owner || typeof owner[key] !== 'function') return;
      const original = owner[key];
      owner[key] = function m19hObservedMethod(...args) {
        counters[counter] += 1;
        let modeKey = null;
        if (counter === 'drawingRedraws') {
          const opts = args[0] || {};
          const mode = opts.forceFull
            ? 'ForceFull'
            : (opts.timeframeReuse ? 'TimeframeReuse' : (opts.panFast ? 'PanFast' : 'Plain'));
          modeKey = `drawingRedraw${mode}`;
          counters[modeKey] = (Number(counters[modeKey]) || 0) + 1;
          if (mode === 'Plain' && CPU_PROFILE) {
            if (!Array.isArray(counters.drawingRedrawPlainStacks)) {
              counters.drawingRedrawPlainStacks = [];
            }
            if (counters.drawingRedrawPlainStacks.length < 12) {
              counters.drawingRedrawPlainStacks.push(
                String(new Error().stack || '').split('\n').slice(2, 8),
              );
            }
          }
        }
        const started = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          const timingKey = `${counter}Ms`;
          counters[timingKey] = (Number(counters[timingKey]) || 0)
            + (performance.now() - started);
          if (modeKey) {
            const modeTimingKey = `${modeKey}Ms`;
            counters[modeTimingKey] = (Number(counters[modeTimingKey]) || 0)
              + (performance.now() - started);
          }
        }
      };
    };
    wrap(chart, 'render', 'renders');
    wrap(chart, 'resampleData', 'resamples');
    wrap(chart, 'recalculateIndicators', 'syncIndicatorCalcs');
    wrap(chart, 'recalculateIndicatorsAsync', 'asyncIndicatorCalcs');
    wrap(chart, '_applyIndicatorWorkerResults', 'workerCommits');
    wrap(chart, '_captureFreezeOverlay', 'freezeCaptures');
    wrap(dm, 'resyncDrawingsAfterReplayTimeframeChange', 'drawingResyncs');
    wrap(dm, 'refreshDrawingsForTimeframe', 'drawingRefreshes');
    wrap(dm, 'redrawAll', 'drawingRedraws');
    wrap(dm, 'saveDrawings', 'drawingSaves');
    wrap(replay, 'updateChartData', 'updateChartData');
    wrap(replay, 'onTimeframeChange', 'replayTfChanges');
    wrap(replay, 'play', 'playCalls');
    wrap(replay, 'pause', 'pauseCalls');
    wrap(replay, '_finishPlaybackAtSessionEnd', 'playbackEnds');
    wrap(replay, '_cancelDeferredPlayStart', 'deferredPlayCancels');
    dm._m19hReplayPatchStats = { patched: 0, fallback: 0, skippedFrames: 0, fullFrames: 0 };
    window.__m19hCounters = counters;
    window.__m19hStartTimestamp = replay.replayTimestamp;

    replay.speed = 100;
    if (typeof replay.updateSpeedButtonUI === 'function') replay.updateSpeedButtonUI(100);
    replay.play();

    return {
      ok: true,
      buildId: window.__TALARIA_CHART_BUILD_ID || null,
      fineCount: fine.length,
      displayBars: chart.data.length,
      drawingCount: dm.drawings.length,
      indicatorCount: chart.indicators?.active?.length || 0,
      startTimestamp: replay.replayTimestamp,
    };
  }, { drawingCount: DRAWING_COUNT, disableFix: DISABLE_FIX });
}

async function readState(page) {
  return page.evaluate(() => {
    const chart = window.chart;
    const replay = chart?.replaySystem;
    const dm = chart?.drawingManager;
    const visibleGroups = dm?.drawings?.filter((drawing) => {
      if (!drawing || drawing.visible === false || drawing.hidden === true) return false;
      return !!drawing.group;
    }).length ?? null;
    return {
      timeframe: chart?.currentTimeframe || null,
      replayTimestamp: Number(replay?.replayTimestamp),
      currentIndex: Number(replay?.currentIndex),
      endIndex: Array.isArray(replay?.fullRawData) ? replay.fullRawData.length - 1 : null,
      playing: !!replay?.isPlaying,
      playStarting: !!replay?.isPlayStarting,
      timeframeSwitching: !!chart?._timeframeSwitching,
      replayTimeframeChanging: !!replay?._timeframeChanging,
      drawingCount: dm?.drawings?.length ?? null,
      visibleGroups,
      indicatorCount: chart?.indicators?.active?.length ?? null,
      tickCache: replay ? Object.keys(replay.tickPathCache || {}).length : null,
      drawingPatchStats: { ...(dm?._m19hReplayPatchStats || {}) },
      counters: { ...(window.__m19hCounters || {}) },
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

    const setup = await setupScenario(page);
    if (!setup?.ok) throw new Error(setup?.reason || 'setup failed');
    await sleep(250);
    await collectGarbage(client);
    const before = await page.metrics();
    if (CPU_PROFILE) {
      await client.send('Profiler.enable');
      await client.send('Profiler.start');
    }
    let peakHeap = metric(before, 'JSHeapUsedSize');
    let monotonic = true;
    let previousTimestamp = Number(setup.startTimestamp);
    const switchDurationsMs = [];
    const switchStates = [];
    const started = Date.now();

    for (let i = 0; i < SWITCH_COUNT; i++) {
      const timeframe = SWITCH_SEQUENCE[i % SWITCH_SEQUENCE.length];
      const switchStarted = Date.now();
      await page.evaluate((tf) => window.chart?.setTimeframe?.(tf), timeframe);
      await sleep(25);
      const state = await readState(page);
      switchStates.push({
        timeframe,
        playing: state.playing,
        playStarting: state.playStarting,
        currentIndex: state.currentIndex,
        replayTimestamp: state.replayTimestamp,
      });
      switchDurationsMs.push(Date.now() - switchStarted);
      if (Number.isFinite(previousTimestamp)
        && Number.isFinite(state.replayTimestamp)
        && state.replayTimestamp < previousTimestamp) {
        monotonic = false;
      }
      previousTimestamp = state.replayTimestamp;
      const metrics = await page.metrics();
      peakHeap = Math.max(peakHeap, metric(metrics, 'JSHeapUsedSize'));
    }

    await sleep(750);
    const prePauseState = await readState(page);
    await page.evaluate(() => window.chart?.replaySystem?.pause?.());
    let cpuHotspots = null;
    if (CPU_PROFILE) {
      const stopped = await client.send('Profiler.stop');
      const profile = stopped?.profile;
      const samplesByNode = new Map();
      for (const nodeId of profile?.samples || []) {
        samplesByNode.set(nodeId, (samplesByNode.get(nodeId) || 0) + 1);
      }
      cpuHotspots = (profile?.nodes || [])
        .map((node) => ({
          function: node.callFrame?.functionName || '(anonymous)',
          url: node.callFrame?.url || '',
          line: (node.callFrame?.lineNumber ?? -1) + 1,
          samples: samplesByNode.get(node.id) || 0,
        }))
        .filter((entry) => entry.samples > 0)
        .sort((a, b) => b.samples - a.samples)
        .slice(0, 20);
    }
    const beforeGc = await page.metrics();
    await collectGarbage(client);
    const afterGc = await page.metrics();
    const state = await readState(page);
    const elapsedMs = Date.now() - started;
    const sortedDurations = switchDurationsMs.slice().sort((a, b) => a - b);
    const p95Duration = sortedDurations[Math.min(
      sortedDurations.length - 1,
      Math.floor(sortedDurations.length * 0.95),
    )] || 0;

    const result = {
      ticket: 'M19-H',
      scenario: `one panel / 90-day 1m feed / 100x replay / active order / ${DRAWING_COUNT} drawings / 8 indicators / ${SWITCH_COUNT} TF switches`,
      fixDisabled: DISABLE_FIX,
      setup,
      elapsedMs,
      monotonic,
      switchDurationsMs,
      ...(TRACE_STATES ? { switchStates } : {}),
      p95SwitchMs: p95Duration,
      prePauseState,
      state,
      cpuHotspots,
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

    const counters = state.counters || {};
    result.pass = !DISABLE_FIX
      && setup.fineCount >= 129_000
      && setup.drawingCount >= DRAWING_COUNT
      && setup.indicatorCount >= 8
      && monotonic
      && prePauseState.playing === true
      && prePauseState.playStarting === false
      && state.timeframe === SWITCH_SEQUENCE[(SWITCH_COUNT - 1) % SWITCH_SEQUENCE.length]
      && state.timeframeSwitching === false
      && state.replayTimeframeChanging === false
      && state.drawingCount >= DRAWING_COUNT
      && state.visibleGroups >= DRAWING_COUNT
      && state.tickCache <= 512
      && counters.drawingResyncs <= SWITCH_COUNT * 2 + 2
      && counters.drawingRefreshes <= SWITCH_COUNT + 2
      && p95Duration <= 1500
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
