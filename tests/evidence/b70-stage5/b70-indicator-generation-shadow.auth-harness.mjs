#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import puppeteer from '../../../chart v 1.4/chart/multichart-prod/harness/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { evaluateBounded, pollExternally } from './puppeteer-external-poll.mjs';
import { deriveSessionAssignments, readBackPanelPassports } from './session-assignment-contract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const modulesDir = path.join(here, '..', '..', '..', 'chart v 1.4', 'chart', 'modules');
const origin = String(process.env.TEST_VPS_URL || '').replace(/\/$/, '');
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;
const sessionId = process.env.B70_SESSION_ID || '849';
const expectedBuild = process.env.B70_EXPECTED_BUILD || '20260725b70';
const baselineBuild = process.env.B70_BASELINE_BUILD || '20260725b70';
const workloadIterations = 12;
const evaluationTimeoutMs = Number(process.env.B70_EVALUATION_TIMEOUT_MS || 60_000);
if (!origin || !email || !password) throw new Error('TEST_VPS_URL/TEST_EMAIL/TEST_PASSWORD required');

const indicatorSource = fs.readFileSync(path.join(modulesDir, 'chart-indicators-full.js'), 'utf8');
const replaySource = fs.readFileSync(path.join(modulesDir, 'replay-system.js'), 'utf8');
const moduleFor = (url) => {
  const pathname = new URL(url).pathname;
  if (pathname.endsWith('/modules/chart-indicators-full.js')) return indicatorSource;
  if (pathname.endsWith('/modules/replay-system.js')) return replaySource;
  return null;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const closeBounded = async (target, timeoutMs = 2_000) => {
  let timer;
  try {
    await Promise.race([
      target.close(),
      new Promise((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch (_) {
    // Diagnostic cleanup must never replace the primary result.
  } finally {
    clearTimeout(timer);
  }
};

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  protocolTimeout: evaluationTimeoutMs + 30_000,
  defaultViewport: { width: 1440, height: 900 },
});

async function login() {
  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const result = await page.evaluate(async ({ email: e, password: p }) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: e, password: p }),
    });
    return { ok: response.ok, status: response.status };
  }, { email, password });
  if (!result.ok) throw new Error(`authentication failed: ${result.status}`);
  await page.close();
}

async function runExternalSeekLifecycle(page, diagnostics) {
  const frameEventsBefore = diagnostics.frameEvents.length;
  const issued = await evaluateBounded(() => page.evaluate(() => {
    const c = window.chart;
    const panels = Array.from(document.querySelectorAll('iframe')).map((frame) => {
      try { return frame.contentWindow?.chart || null; } catch (_) { return null; }
    }).filter(Boolean);
    const replay = c.replaySystem;
    const seekFrom = Number.isSafeInteger(replay?.currentIndex) ? replay.currentIndex : null;
    const seekTo = seekFrom == null || !Array.isArray(replay.fullRawData)
      ? null : Math.max(replay.sessionStartIndex || 0, seekFrom - 1);
    const actualSeekIssued = seekTo != null && seekTo !== seekFrom
      && typeof replay.seekTo === 'function';
    const beforePanelCalculations = panels.map((panel) =>
      panel._b70IndicatorGenerationShadow?.metrics?.calculationStarts ?? null);
    const preSeekGenerationIds = panels.map((panel) =>
      panel._b70IndicatorGenerationShadow?.currentEnvelope?.metadata?.generationId || null);
    window.__b70ExternalHeartbeat = 0;
    clearInterval(window.__b70ExternalHeartbeatTimer);
    window.__b70ExternalHeartbeatTimer = setInterval(() => {
      window.__b70ExternalHeartbeat++;
    }, 20);
    for (const panel of panels) {
      panel.replaySystem.isPlaying = false;
      panel.recalculateIndicators();
      panel.replaySystem.isPlaying = true;
      panel.recalculateIndicators();
    }
    const afterPauseResumePanelCalculations = panels.map((panel) =>
      panel._b70IndicatorGenerationShadow?.metrics?.calculationStarts ?? null);
    if (actualSeekIssued) replay.seekTo(seekTo);
    else c._b70ShadowInvalidateIndicatorGeneration('timeline-seek');
    for (const panel of panels) {
      panel.data = structuredClone(c.data);
      panel.rawData = structuredClone(c.rawData || c.data);
      panel.dataVersion = c.dataVersion;
      panel.currentTimeframe = c.currentTimeframe;
      panel.currentSymbol = c.currentSymbol;
      panel.currentFileId = c.currentFileId;
      panel.masterGeneration = c.masterGeneration;
      panel._b70ShadowInvalidateIndicatorGeneration('timeline-seek');
      window.__TALARIA_B70_CONNECT_INDICATOR_PANEL_V1(panel, c);
      panel.recalculateIndicators();
    }
    c.recalculateIndicators();
    window.__b70ExternalSeekProbe = {
      actualSeekIssued,
      seekFrom,
      seekTo,
      beforePanelCalculations,
      afterPauseResumePanelCalculations,
      preSeekGenerationIds,
      issuedAt: performance.now(),
    };
    return window.__b70ExternalSeekProbe;
  }), 15_000, 'synchronous seek dispatch');

  let poll;
  try {
    poll = await pollExternally({
      timeoutMs: 8_000,
      evaluate: () => page.evaluate(() => {
        const c = window.chart;
        const probe = window.__b70ExternalSeekProbe;
        const panels = Array.from(document.querySelectorAll('iframe')).map((frame) => {
          try {
            const panel = frame.contentWindow?.chart;
            return panel ? {
              connected: frame.isConnected,
              committed: !!panel._b70HasCommittedIndicatorGeneration?.(),
              generationId:
                panel._b70IndicatorGenerationShadow?.currentEnvelope?.metadata?.generationId || null,
              calculations:
                panel._b70IndicatorGenerationShadow?.metrics?.calculationStarts ?? null,
              valueParity: JSON.stringify(Object.values(panel.indicators?.data || {}))
                === JSON.stringify(Object.values(c.indicators?.data || {})),
            } : null;
          } catch (error) {
            return { connected: frame.isConnected, accessError: String(error) };
          }
        }).filter(Boolean);
        return {
          buildId: window.__TALARIA_CHART_BUILD_ID || null,
          heartbeat: window.__b70ExternalHeartbeat || 0,
          workerBusy: !!c?._indicatorWorkerBusy,
          currentIndex: c?.replaySystem?.currentIndex ?? null,
          panels,
          terminal: !c?._indicatorWorkerBusy && panels.length > 0
            && panels.every((panel) => panel.committed),
          generationFresh: panels.length > 0 && panels.every((panel, index) =>
            panel.generationId != null
              && panel.generationId !== probe?.preSeekGenerationIds?.[index]),
        };
      }),
      isTerminal: (value) => value.terminal && value.generationFresh,
    });
  } catch (error) {
    diagnostics.externalSeek = {
      issued,
      observations: error.observations || [],
      frameEvents: diagnostics.frameEvents.slice(frameEventsBefore),
      error: String(error?.message || error),
    };
    const prefix = diagnostics.preflight.buildId === baselineBuild
      ? 'NOT_APPLICABLE_B70_POST_SEEK_EVENT_LOOP_BLOCKED'
      : 'CANDIDATE_POST_SEEK_TERMINAL_FRESHNESS_FAILED';
    throw new Error(`${prefix}: external product-state polling found no terminal freshness witness`,
      { cause: error });
  } finally {
    page.evaluate(() => clearInterval(window.__b70ExternalHeartbeatTimer)).catch(() => {});
  }
  const terminal = poll.value;
  diagnostics.externalSeek = {
    issued,
    observations: poll.observations,
    contextErrors: poll.contextErrors,
    frameEvents: diagnostics.frameEvents.slice(frameEventsBefore),
  };
  return {
    pauseResumePanelCalculationsStable: issued.afterPauseResumePanelCalculations.every(
      (value, index) => value === issued.beforePanelCalculations[index]),
    actualSeekIssued: issued.actualSeekIssued,
    seekFrom: issued.seekFrom,
    seekTo: issued.seekTo,
    seekCommitted: terminal.panels.every((panel) => panel.committed),
    seekValueParity: terminal.panels.every((panel) => panel.valueParity),
    terminalTimedOut: false,
    terminalCommitted: terminal.panels.map((panel) => panel.committed),
    terminalGenerationFresh: terminal.generationFresh,
    preSeekGenerationIds: issued.preSeekGenerationIds,
    terminalGenerationIds: terminal.panels.map((panel) => panel.generationId),
    externalObservationCount: poll.observations.length,
    inPageTimerProgressed: terminal.heartbeat > 0,
    executionContextErrors: poll.contextErrors,
  };
}

async function runCell(enabled, indicatorCount = 1) {
  const page = await browser.newPage();
  const diagnostics = {
    cell: { enabled, indicatorCount },
    console: [],
    pageErrors: [],
    frameEvents: [],
    lastStage: null,
    preflight: null,
    timeout: null,
  };
  await page.evaluateOnNewDocument((on) => {
    if (on) window.__TALARIA_ENABLE_B70_SINGLE_INDICATOR_OWNER_V1 = true;
    window.__b70IndicatorWorkerPosts = 0;
    if (typeof Worker === 'function' && Worker.prototype?.postMessage) {
      const originalPostMessage = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function b70ObservedPostMessage(message, ...rest) {
        if (message?.type === 'CALCULATE_ALL' || message?.type === 'CALCULATE_TAIL') {
          window.__b70IndicatorWorkerPosts++;
        }
        return originalPostMessage.call(this, message, ...rest);
      };
    }
  }, enabled);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const body = moduleFor(request.url());
    if (body == null) request.continue().catch(() => {});
    else request.respond({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      body,
    }).catch(() => {});
  });
  const errors = [];
  page.on('console', (message) => {
    const row = { type: message.type(), text: message.text() };
    diagnostics.console.push(row);
    if (row.text.startsWith('[b70-stage] ')) {
      try { diagnostics.lastStage = JSON.parse(row.text.slice(12)); } catch (_) {}
    }
  });
  page.on('pageerror', (error) => {
    const text = String(error?.stack || error);
    errors.push(text);
    diagnostics.pageErrors.push(text);
  });
  page.on('framenavigated', (frame) => diagnostics.frameEvents.push({
    event: 'navigated',
    url: frame.url(),
    parentUrl: frame.parentFrame()?.url() || null,
  }));
  page.on('framedetached', (frame) => diagnostics.frameEvents.push({
    event: 'detached',
    url: frame.url(),
  }));
  await page.goto(`${origin}/login/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const sessionPayload = await page.evaluate(async (id) => {
    const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`session lookup failed: ${response.status}`);
    return response.json();
  }, sessionId);
  const assignments = deriveSessionAssignments(sessionPayload?.session || sessionPayload);
  await page.evaluate(({ id, rows }) => {
    const panelState = {
      layout: '3v',
      selectedPanelIndex: 0,
      sessionId: id,
      panels: rows.map((row, index) => ({
        index,
        isMainChart: index === 0,
        timeframe: row.timeframe,
        fileId: row.fileId,
        symbol: row.ticker,
        offsetX: 0,
        candleWidth: 6,
      })),
    };
    localStorage.setItem('chart_panel_state', JSON.stringify(panelState));
    localStorage.setItem('active_trading_session_id', id);
  }, { id: sessionId, rows: assignments });
  const url = `${origin}/chart/dist-v9/index.html?mode=backtest&mcLayout=3v&sessionId=${encodeURIComponent(sessionId)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction((build) => window.__TALARIA_CHART_BUILD_ID === build,
    { timeout: 60_000 }, expectedBuild);
  await page.waitForFunction(() => window.chart && Array.isArray(chart.data) && chart.data.length > 0,
    { timeout: 120_000 });
  try {
    await page.waitForFunction(() => {
      const frames = Array.from(document.querySelectorAll('iframe'));
      return frames.filter((frame) => {
        try {
          const chart = frame.contentWindow?.chart;
          return chart && Array.isArray(chart.data) && chart.data.length > 0;
        } catch (_) {
          return false;
        }
      }).length === 2;
    }, { timeout: 120_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const frames = Array.from(document.querySelectorAll('iframe')).slice(0, 8);
      return frames.map((frame) => {
        let chartReady = false;
        let dataLength = null;
        try {
          chartReady = !!frame.contentWindow?.chart;
          dataLength = frame.contentWindow?.chart?.data?.length ?? null;
        } catch (_) {}
        return { chartReady, dataLength };
      });
    });
    throw new Error(`authenticated iframe readiness timeout: ${JSON.stringify(diagnostic)}`,
      { cause: error });
  }
  await sleep(3000);

  diagnostics.preflight = await page.evaluate(() => {
    const inspectChart = (chart) => ({
      present: !!chart,
      dataLength: Array.isArray(chart?.data) ? chart.data.length : null,
      recalculateIndicators: typeof chart?.recalculateIndicators,
      scheduleReplayIndicatorRecalc: typeof chart?.scheduleReplayIndicatorRecalc,
      invalidateGeneration: typeof chart?._b70ShadowInvalidateIndicatorGeneration,
      hasCommittedGeneration: typeof chart?._b70HasCommittedIndicatorGeneration,
      stage5RegisterPanelBridge: typeof chart?._b70Stage5RegisterPanelBridge,
      replay: {
        present: !!chart?.replaySystem,
        seekTo: typeof chart?.replaySystem?.seekTo,
        seekToArity: chart?.replaySystem?.seekTo?.length ?? null,
        currentIndex: chart?.replaySystem?.currentIndex ?? null,
        sessionStartIndex: chart?.replaySystem?.sessionStartIndex ?? null,
        fullRawDataLength: Array.isArray(chart?.replaySystem?.fullRawData)
          ? chart.replaySystem.fullRawData.length : null,
        isActive: chart?.replaySystem?.isActive ?? null,
        isPlaying: chart?.replaySystem?.isPlaying ?? null,
      },
    });
    const frames = Array.from(document.querySelectorAll('iframe')).map((frame) => {
      let sameOrigin = false;
      let readyState = null;
      let chart = null;
      let accessError = null;
      try {
        readyState = frame.contentDocument?.readyState || null;
        chart = frame.contentWindow?.chart;
        sameOrigin = true;
      } catch (error) {
        accessError = String(error);
      }
      return {
        src: frame.src || null,
        documentUrl: sameOrigin ? frame.contentDocument?.URL || null : null,
        readyState,
        sameOrigin,
        accessError,
        chart: inspectChart(chart),
        buildId: sameOrigin ? frame.contentWindow?.__TALARIA_CHART_BUILD_ID || null : null,
        syncBridgeVersion: sameOrigin
          ? frame.contentWindow?.__MULTICHART_SYNC_BRIDGE_VERSION || null : null,
      };
    });
    return {
      url: location.href,
      readyState: document.readyState,
      buildId: window.__TALARIA_CHART_BUILD_ID || null,
      syncBridgeVersion: window.__MULTICHART_SYNC_BRIDGE_VERSION || null,
      connector: typeof window.__TALARIA_B70_CONNECT_INDICATOR_PANEL_V1,
      host: inspectChart(window.chart),
      frames,
    };
  });
  diagnostics.preflight.passports = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('chart_panel_state') || 'null'));
  readBackPanelPassports(diagnostics.preflight.passports, assignments);
  const readyFrames = diagnostics.preflight.frames.filter((frame) =>
    frame.sameOrigin && frame.chart.present);
  const missing = [];
  if (diagnostics.preflight.connector !== 'function') missing.push('Stage5 connector');
  if (diagnostics.preflight.host.stage5RegisterPanelBridge !== 'function') {
    missing.push('host Stage5 bridge registration');
  }
  if (diagnostics.preflight.host.replay.seekTo !== 'function') missing.push('replay.seekTo');
  if (readyFrames.length !== 2) missing.push('exactly two same-origin product iframe charts');
  if (enabled && missing.length > 0) {
    if (diagnostics.preflight.buildId !== baselineBuild) {
      throw new Error(
        `CANDIDATE_STAGE5_PREREQUISITE_MISSING: build ${diagnostics.preflight.buildId}; `
        + `missing ${missing.join(', ')}`
      );
    }
    await page.close();
    return {
      verdict: 'NOT-APPLICABLE',
      prerequisite: `baseline ${baselineBuild}: candidate execution required; `
        + `missing ${missing.join(', ')}`,
      diagnostics,
      errors,
    };
  }

  const evaluation = page.evaluate(async ({ on, count, workloadIterations: iterations }) => {
    const mark = (stage, detail = {}) => {
      const value = { stage, detail, at: performance.now() };
      window.__b70EvaluationStage = value;
      console.info(`[b70-stage] ${JSON.stringify(value)}`);
    };
    const bounded = async (stage, operation, timeoutMs = 15_000) => {
      mark(`${stage}:start`);
      let timer;
      try {
        const value = await Promise.race([
          Promise.resolve().then(operation),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(
              `${stage} timed out after ${timeoutMs}ms`
            )), timeoutMs);
          }),
        ]);
        mark(`${stage}:done`);
        return value;
      } finally {
        clearTimeout(timer);
      }
    };
    mark('evaluation:start', { on, count, iterations });
    const c = window.chart;
    if (count > 1) {
      const base = c.indicators?.active?.[0];
      if (!base) throw new Error('authenticated chart has no indicator fixture');
      c.indicators.active = Array.from({ length: count }, (_, index) => ({
        ...base,
        id: `b70-stage3-${index + 1}`,
        type: 'tema',
        name: `TEMA(${base.params?.period || 20})`,
        params: { ...(base.params || {}), period: base.params?.period || 20 },
        style: { ...(base.style || {}) },
      }));
      c.indicators.data = {};
      c.recalculateIndicators();
    }
    await bounded('initial-worker-drain', async () => {
      for (let i = 0; i < 500 && c._indicatorWorkerBusy; i++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      if (c._indicatorWorkerBusy) throw new Error('initial worker remained busy');
    });
    await bounded('initial-animation-frames', () => new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const calculationPayload = () => JSON.stringify(Object.values(c.indicators?.data || {}));
    const paintedLagBars = () => {
      const active = c.indicators?.active || [];
      let worst = 0;
      for (const indicator of active) {
        const value = c.indicators?.data?.[indicator.id];
        const series = Array.isArray(value)
          ? [value]
          : Object.values(value || {}).filter(Array.isArray);
        for (const points of series) {
          let endpoint = points.length - 1;
          while (endpoint >= 0 && points[endpoint] == null) endpoint--;
          worst = Math.max(worst, Math.max(0, c.data.length - 1 - endpoint));
        }
      }
      return worst;
    };
    const ownBefore = Object.keys(c).sort();
    const dataBefore = JSON.stringify(c.data[c.data.length - 1] || null);
    const fullDataBefore = JSON.stringify(c.data);
    const indicatorDataBefore = calculationPayload();
    const renderBefore = Number(c._renderCount || c.renderCount || 0);
    const indicatorVersionBefore = Number(c._indicatorRenderVersion || 0);
    const workerPostsBefore = Number(window.__b70IndicatorWorkerPosts || 0);
    let syncEntries = 0;
    let syncPublicationVersionBumps = 0;
    const hadOwnSync = Object.prototype.hasOwnProperty.call(c, 'recalculateIndicators');
    const originalSync = c.recalculateIndicators;
    c.recalculateIndicators = function b70ObservedSyncEntry(...args) {
      syncEntries++;
      const before = Number(this._indicatorRenderVersion || 0);
      const value = originalSync.apply(this, args);
      syncPublicationVersionBumps +=
        Number(this._indicatorRenderVersion || 0) - before;
      return value;
    };
    const initialShadow = c._b70IndicatorGenerationShadow;
    if (on && initialShadow) {
      initialShadow.registry.clear();
      initialShadow.ownerTickets.clear();
      initialShadow.latestByInstance.clear();
      initialShadow.fallbackGenerations.clear();
      initialShadow.nextClaimSeq = 0;
      initialShadow.currentEnvelope = null;
      initialShadow.retiredEnvelope = null;
      initialShadow.lastVersionGenerationId = null;
      initialShadow.lastKey = null;
      for (const key of Object.keys(initialShadow.metrics)) {
        const value = initialShadow.metrics[key];
        if (typeof value === 'number') initialShadow.metrics[key] = 0;
        else if (value && typeof value === 'object') {
          for (const nested of Object.keys(value)) value[nested] = 0;
        }
      }
    }
    const panelFrames = Array.from(document.querySelectorAll('iframe')).filter((frame) => {
      try {
        return !!frame.contentWindow?.chart;
      } catch (_) {
        return false;
      }
    });
    const panels = (on ? panelFrames : Array.from({ length: panelFrames.length }))
      .map((frame, index) => {
      if (!on) {
        const panel = Object.create(Object.getPrototypeOf(c));
        panel.multichartPanelId = `b70-auth-baseline-panel-${index + 1}`;
        panel.data = c.data;
        panel.rawData = c.rawData || c.data;
        panel.dataVersion = c.dataVersion;
        panel.currentTimeframe = c.currentTimeframe;
        panel.currentSymbol = c.currentSymbol;
        panel.currentFileId = c.currentFileId;
        panel.masterGeneration = c.masterGeneration;
        panel.indicators = {
          active: (c.indicators?.active || []).map((indicator) => ({
            ...indicator,
            params: { ...(indicator.params || {}) },
            style: { ...(indicator.style || {}) },
          })),
          data: structuredClone(c.indicators?.data || {}),
        };
        panel.replaySystem = { isActive: false, isPlaying: false };
        panel.updateOHLCIndicators = () => {};
        panel.scheduleRender = () => {
          panel.__b70RenderCount = (panel.__b70RenderCount || 0) + 1;
        };
        panel._setAllIndicatorsCalculating = () => {};
        panel._markIndicatorRecalcComplete = () => {};
        panel._clearIndicatorCalculatingFlags = () => {};
        const originalPanelSync = panel.recalculateIndicators;
        panel.__b70CalculationEntries = 0;
        panel.recalculateIndicators = function(...args) {
          panel.__b70CalculationEntries++;
          return originalPanelSync.apply(this, args);
        };
        return panel;
      }
      const panel = frame.contentWindow.chart;
      panel.multichartPanelId = panel.multichartPanelId
        || frame.dataset?.panelId
        || frame.closest?.('[data-panel-id]')?.dataset?.panelId
        || `b70-auth-iframe-panel-${index + 1}`;
      panel.data = structuredClone(c.data);
      panel.rawData = structuredClone(c.rawData || c.data);
      panel.dataVersion = c.dataVersion;
      panel.currentTimeframe = c.currentTimeframe;
      panel.currentSymbol = c.currentSymbol;
      panel.currentFileId = c.currentFileId;
      panel.masterGeneration = c.masterGeneration;
      panel.indicators = panel.indicators || {};
      panel.indicators.active = (c.indicators?.active || []).map((indicator) => ({
        ...indicator,
        params: { ...(indicator.params || {}) },
        style: { ...(indicator.style || {}) },
      }));
      panel.indicators.data = structuredClone(c.indicators?.data || {});
      const originalPanelSync = panel.recalculateIndicators.bind(panel);
      panel.__b70CalculationEntries = 0;
      panel.recalculateIndicators = function(...args) {
        panel.__b70CalculationEntries++;
        return originalPanelSync(...args);
      };
      return panel;
      });
    if (panels.length !== 2) {
      throw new Error('expected exactly two authenticated product iframe charts');
    }
    if (on) {
      mark('stage5-connect:start', { panels: panels.length });
      if (typeof window.__TALARIA_B70_CONNECT_INDICATOR_PANEL_V1 !== 'function') {
        throw new Error('Stage 5 panel connector unavailable');
      }
      for (const panel of panels) {
        if (!window.__TALARIA_B70_CONNECT_INDICATOR_PANEL_V1(panel, c)) {
          throw new Error(`Stage 5 panel connect failed: ${panel.multichartPanelId}`);
        }
      }
      mark('stage5-connect:done');
    }
    const started = performance.now();
    let workMs = 0;
    mark('workload:start');
    for (let i = 0; i < iterations; i++) {
      mark('workload:iteration', { iteration: i });
      const workStarted = performance.now();
      if (typeof c.scheduleReplayIndicatorRecalc === 'function') {
        c.scheduleReplayIndicatorRecalc(true);
      }
      if (typeof c.recalculateIndicators === 'function') c.recalculateIndicators();
      for (const panel of panels) panel.recalculateIndicators();
      if (typeof c.drawIndicatorsOptimized === 'function') c.drawIndicatorsOptimized();
      if (typeof c.bumpIndicatorRenderVersion === 'function') c.bumpIndicatorRenderVersion();
      workMs += performance.now() - workStarted;
      await bounded(`workload-raf-${i}`, () =>
        new Promise((resolve) => requestAnimationFrame(resolve)), 5_000);
    }
    mark('workload:done');
    const elapsedMs = performance.now() - started;
    const indicatorVersionDeltaBeforeLifecycle =
      Number(c._indicatorRenderVersion || 0) - indicatorVersionBefore;
    const workerPostsDeltaBeforeLifecycle =
      Number(window.__b70IndicatorWorkerPosts || 0) - workerPostsBefore;
    if (hadOwnSync) c.recalculateIndicators = originalSync;
    else delete c.recalculateIndicators;
    const ownAfter = Object.keys(c).sort();
    const shadow = c._b70IndicatorGenerationShadow;
    const canvases = [...document.querySelectorAll('canvas')].map((canvas) => {
      try { return canvas.toDataURL(); } catch (_) { return 'unreadable'; }
    });
    const primaryCanvases = [...document.querySelectorAll('canvas')]
      .filter((canvas) => canvas.width > 0 && canvas.height > 0)
      .sort((a, b) => (b.width * b.height) - (a.width * a.height))
      .slice(0, 1);
    const blackCanvasCount = primaryCanvases.filter((canvas) => {
      try {
        const probe = document.createElement('canvas');
        probe.width = 64;
        probe.height = 40;
        const ctx = probe.getContext('2d', { willReadFrequently: true });
        if (!ctx) return true;
        ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
        const sample = ctx.getImageData(0, 0, probe.width, probe.height).data;
        for (let i = 0; i < sample.length; i += 16) {
          if (sample[i + 3] > 0
            && sample[i] + sample[i + 1] + sample[i + 2] > 0) return false;
        }
        return true;
      } catch (_) { return true; }
    }).length;
    let indicatorLayerPayload = null;
    try {
      indicatorLayerPayload = c._indLayerCanvas?.toDataURL() || null;
    } catch (_) {}
    const panelResults = panels.map((panel) => ({
      id: panel.multichartPanelId,
      calculations: panel._b70IndicatorGenerationShadow?.metrics?.calculationStarts
        ?? panel.__b70CalculationEntries,
      callEntries: panel.__b70CalculationEntries,
      renders: panel.__b70RenderCount || 0,
      indicatorVersion: panel._indicatorRenderVersion || 0,
      dataPayload: JSON.stringify(Object.values(panel.indicators?.data || {})),
      metrics: panel._b70IndicatorGenerationShadow
        ? JSON.parse(JSON.stringify(panel._b70IndicatorGenerationShadow.metrics))
        : null,
    }));
    const metricsSnapshot = shadow ? JSON.parse(JSON.stringify(shadow.metrics)) : null;
    const registryRowsSnapshot = shadow ? [...shadow.registry.values()].map((row) => ({
      chart: 'host',
      generationId: row.key.id,
      requests: row.requests,
      calculations: row.calculations,
      wouldBeOwner: row.wouldBeOwner,
      sources: row.sources,
    })) : null;
    const workloadFullDataAfter = JSON.stringify(c.data);
    const workloadTailDataAfter = JSON.stringify(c.data[c.data.length - 1] || null);
    const workloadIndicatorDataAfter = calculationPayload();
    const workloadPaintedLagBars = paintedLagBars();
    const lifecycle = null;
    mark('evaluation:return');
    return {
      enabled: on,
      requestedInstanceCount: Array.isArray(c.indicators?.active)
        ? c.indicators.active.length : 0,
      elapsedMs,
      workMs,
      build: window.__TALARIA_CHART_BUILD_ID,
      dataStable: workloadTailDataAfter === dataBefore,
      fullDataStable: workloadFullDataAfter === fullDataBefore,
      indicatorDataBefore,
      indicatorDataAfter: workloadIndicatorDataAfter,
      paintedLagBars: workloadPaintedLagBars,
      tailDataAfter: workloadTailDataAfter,
      authenticatedProductIframeCount: panelFrames.length,
      canvasPayloads: canvases,
      blackCanvasCount,
      indicatorLayerPayload,
      panelResults,
      renderDelta: Number(c._renderCount || c.renderCount || 0) - renderBefore,
      indicatorVersionDelta:
        indicatorVersionDeltaBeforeLifecycle,
      addedFields: ownAfter.filter((key) => !ownBefore.includes(key)),
      causal: {
        syncEntries,
        syncPublicationVersionBumps,
        indicatorWorkerPosts: workerPostsDeltaBeforeLifecycle,
      },
      shadowPresent: !!shadow,
      metrics: metricsSnapshot,
      registryRows: registryRowsSnapshot,
      lifecycle,
    };
  }, { on: enabled, count: indicatorCount, workloadIterations });
  let timeout;
  try {
    const result = await Promise.race([
      evaluation,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(
          `browser evaluation exceeded ${evaluationTimeoutMs}ms`
        )), evaluationTimeoutMs);
      }),
    ]);
    clearTimeout(timeout);
    if (enabled) result.lifecycle = await runExternalSeekLifecycle(page, diagnostics);
    await page.close();
    return { ...result, diagnostics, errors };
  } catch (error) {
    clearTimeout(timeout);
    diagnostics.timeout = {
      limitMs: evaluationTimeoutMs,
      message: String(error?.message || error),
      lastStage: diagnostics.lastStage,
      pendingOperation: diagnostics.lastStage?.stage || 'evaluation-dispatch',
    };
    await closeBounded(page);
    error.b70Diagnostics = diagnostics;
    throw error;
  }
}

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const summarize = (cell) => {
  if (cell.verdict === 'NOT-APPLICABLE') return cell;
  const canvasSha256 = cell.canvasPayloads.map(digest);
  const registryRows = cell.registryRows?.map((row) => ({
    ...row,
    generationIdSha256: digest(row.generationId),
    generationId: undefined,
  })) || cell.registryRows;
  return {
    ...cell,
    panelResults: cell.panelResults?.map((panel) => ({
      ...panel,
      dataPayloadSha256: digest(panel.dataPayload),
      dataPayload: undefined,
    })),
    registryRows,
    indicatorDataBeforeSha256: digest(cell.indicatorDataBefore),
    indicatorDataAfterSha256: digest(cell.indicatorDataAfter),
    tailDataSha256: digest(cell.tailDataAfter),
    canvasSha256,
    indicatorLayerSha256: digest(cell.indicatorLayerPayload),
    canvasPayloads: undefined,
    indicatorLayerPayload: undefined,
    indicatorDataBefore: undefined,
    indicatorDataAfter: undefined,
    tailDataAfter: undefined,
  };
};

try {
  await login();
  const evaluatePair = (off, on) => {
  const requestedGenerationRows = on.registryRows
    ? on.registryRows.filter((row) => row.requests > 0).length : 0;
  const duplicateStarts = on.registryRows
    ? on.registryRows.reduce((sum, row) => sum + Math.max(0, row.calculations - 1), 0) : 0;
  const exactDataParity = off.tailDataAfter === on.tailDataAfter;
  const exactIndicatorParity = off.indicatorDataAfter === on.indicatorDataAfter;
  const exactPaintParity = off.indicatorLayerPayload === on.indicatorLayerPayload;
  const green = off.build === expectedBuild
    && on.build === expectedBuild
    && !off.shadowPresent
    && off.addedFields.length === 0
    && on.shadowPresent
    && on.metrics.duplicateCalculations === 0
    && on.metrics.requestedGenerations >= workloadIterations
    && on.metrics.requestedGenerations <= workloadIterations + 2
    && on.metrics.uniqueRequestedGenerations === requestedGenerationRows
    && on.metrics.duplicateCalculations === duplicateStarts
    && on.metrics.calculationStarts === 1
    && (on.metrics.ownerClaims.sync + on.metrics.ownerClaims.worker)
      === on.requestedInstanceCount
    && (on.metrics.ownerCommits.sync + on.metrics.ownerCommits.worker)
      === on.requestedInstanceCount
    && on.metrics.ownerDenied >= (workloadIterations - 2) * on.requestedInstanceCount
    && on.metrics.lateWorkerRejects === 0
    && on.metrics.duplicateWorkerRejects === 0
    && on.causal.indicatorWorkerPosts === 1
    && on.metrics.paintCalculations === 0
    && on.metrics.paintPublications === 0
    && on.metrics.paintVersionBumps === 0
    && on.metrics.paintRenderSchedules === 0
    && on.metrics.paintReentries === 0
    && on.metrics.paintExceptions === 0
    && on.metrics.maxPaintDepth === 1
    && on.metrics.envelopeBuilds === 1
    && on.metrics.envelopeCommits === 1
    && on.metrics.envelopeRejects === 0
    && on.metrics.envelopeCopyBytes > 0
    && on.metrics.envelopeCopyTimeMs >= 0
    && on.metrics.envelopePeakRetainedBytes > 0
    && on.metrics.envelopeAliasRejects === 0
    && on.metrics.bridgePublications === 1
    && on.metrics.bridgeDeliveries === on.authenticatedProductIframeCount
    && on.metrics.bridgeDeliveryFailures === 0
    && on.panelResults.length === on.authenticatedProductIframeCount
    && on.panelResults.length === 2
    && on.panelResults.every((panel) =>
      panel.metrics?.calculationStarts === 0
      && panel.metrics?.bridgeAccepts === 1
      && panel.metrics?.bridgeRejects === 0
      && panel.dataPayload === on.indicatorDataAfter)
    && on.authenticatedProductIframeCount === 2
    && off.panelResults.every((panel) => panel.callEntries === workloadIterations)
    && on.workMs < off.workMs
    && off.blackCanvasCount === 0
    && on.blackCanvasCount === 0
    && on.lifecycle?.pauseResumePanelCalculationsStable
    && on.lifecycle?.actualSeekIssued
    && on.lifecycle?.seekCommitted
    && on.lifecycle?.seekValueParity
    && !on.lifecycle?.terminalTimedOut
    && on.lifecycle?.terminalGenerationFresh
    && on.causal.syncPublicationVersionBumps === 0
    && on.indicatorVersionDelta === 1
    && off.paintedLagBars === 0
    && on.paintedLagBars === 0
    && on.metrics.renderUnexpectedChanges === 0
    && Object.keys(on.metrics.calculationsBySource)
      .every((source) => source === 'recalculateIndicators'
        || source === 'recalculateIndicatorsAsync'
        || source === 'recalculateIndicatorsIncremental')
    && off.dataStable
    && on.dataStable
    && off.fullDataStable
    && on.fullDataStable
    && exactDataParity
    && exactIndicatorParity
    && exactPaintParity
    && off.indicatorLayerPayload != null
    && off.errors.length === 0
    && on.errors.length === 0
    ;
  return {
    green,
    parity: { exactDataParity, exactIndicatorParity, exactPaintParity },
    overhead: {
      offElapsedMs: off.elapsedMs,
      onElapsedMs: on.elapsedMs,
      deltaMs: on.elapsedMs - off.elapsedMs,
      deltaPercent: off.elapsedMs > 0 ? ((on.elapsedMs / off.elapsedMs) - 1) * 100 : null,
      offWorkMs: off.workMs,
      onWorkMs: on.workMs,
      workRatio: off.workMs > 0 ? on.workMs / off.workMs : null,
    },
    off,
    on,
  };
  };

  const runPair = async (count) => {
    const off = await runCell(false, count);
    const on = await runCell(true, count);
    if (on.verdict === 'NOT-APPLICABLE') {
      return { green: false, notApplicable: true, prerequisite: on.prerequisite, off, on };
    }
    return evaluatePair(off, on);
  };
  const tema = await runPair(1);
  const fourIndicators = tema.notApplicable
    ? { ...tema, off: { verdict: 'SKIP', reason: 'same B70 prerequisite result' } }
    : await runPair(4);
  const notApplicable = tema.notApplicable || fourIndicators.notApplicable;
  const verdict = notApplicable ? 'NOT-APPLICABLE'
    : tema.green && fourIndicators.green ? 'GREEN' : 'FAIL';
  console.log(JSON.stringify({
    verdict,
    expectedBuild,
    prerequisite: notApplicable
      ? 'B71 candidate authenticated execution is required after deployment'
      : null,
    workload: {
      sessionId,
      iterations: workloadIterations,
      panels: 'authenticated product topology',
      resetBeforeWorkload: true,
      evaluationTimeoutMs,
    },
    tema: {
      green: tema.green,
      parity: tema.parity,
      overhead: tema.overhead,
      off: summarize(tema.off),
      on: summarize(tema.on),
    },
    fourIndicators: {
      green: fourIndicators.green,
      parity: fourIndicators.parity,
      overhead: fourIndicators.overhead,
      off: summarize(fourIndicators.off),
      on: summarize(fourIndicators.on),
    },
  }, null, 2));
  if (verdict === 'NOT-APPLICABLE') process.exitCode = 2;
  else if (verdict !== 'GREEN') process.exitCode = 1;
} catch (error) {
  const notApplicable = String(error?.message || error)
    .includes('NOT_APPLICABLE_B70_POST_SEEK_EVENT_LOOP_BLOCKED');
  console.error(JSON.stringify({
    verdict: notApplicable ? 'NOT-APPLICABLE' : 'FAIL',
    stage: 'authenticated-browser-evaluation',
    error: String(error?.stack || error),
    diagnostics: error?.b70Diagnostics || null,
    prerequisite: notApplicable
      ? 'Deploy B71 candidate, then require authenticated Stage5 execution'
      : null,
  }, null, 2));
  process.exitCode = notApplicable ? 2 : 1;
} finally {
  await closeBounded(browser);
  browser.process()?.kill();
}
