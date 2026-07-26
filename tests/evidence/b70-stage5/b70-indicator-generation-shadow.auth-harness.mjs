#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import puppeteer from '../../../chart v 1.4/chart/multichart-prod/harness/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const modulesDir = path.join(here, '..', '..', '..', 'chart v 1.4', 'chart', 'modules');
const origin = String(process.env.TEST_VPS_URL || '').replace(/\/$/, '');
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;
const sessionId = process.env.B70_SESSION_ID || '827';
const expectedBuild = process.env.B70_EXPECTED_BUILD || '20260725b70';
const workloadIterations = 12;
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

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  protocolTimeout: 300_000,
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

async function runCell(enabled, indicatorCount = 1) {
  const page = await browser.newPage();
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
  page.on('pageerror', (error) => errors.push(String(error?.stack || error)));
  const url = `${origin}/chart/dist-v9/index.html?mode=backtest&mcLayout=2&sessionId=${encodeURIComponent(sessionId)}`;
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
      }).length >= 1;
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

  const result = await page.evaluate(async ({ on, count, workloadIterations: iterations }) => {
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
    for (let i = 0; i < 500 && c._indicatorWorkerBusy; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await new Promise((resolve) => requestAnimationFrame(() =>
      requestAnimationFrame(resolve)));
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
    if (panels.length < 1) {
      throw new Error('expected at least one authenticated product iframe chart');
    }
    if (on) {
      if (typeof window.__TALARIA_B70_CONNECT_INDICATOR_PANEL_V1 !== 'function') {
        throw new Error('Stage 5 panel connector unavailable');
      }
      for (const panel of panels) {
        if (!window.__TALARIA_B70_CONNECT_INDICATOR_PANEL_V1(panel, c)) {
          throw new Error(`Stage 5 panel connect failed: ${panel.multichartPanelId}`);
        }
      }
    }
    const started = performance.now();
    let workMs = 0;
    for (let i = 0; i < iterations; i++) {
      const workStarted = performance.now();
      if (typeof c.scheduleReplayIndicatorRecalc === 'function') {
        c.scheduleReplayIndicatorRecalc(true);
      }
      if (typeof c.recalculateIndicators === 'function') c.recalculateIndicators();
      for (const panel of panels) panel.recalculateIndicators();
      if (typeof c.drawIndicatorsOptimized === 'function') c.drawIndicatorsOptimized();
      if (typeof c.bumpIndicatorRenderVersion === 'function') c.bumpIndicatorRenderVersion();
      workMs += performance.now() - workStarted;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
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
    let lifecycle = null;
    if (on) {
      const beforePanelCalculations = panels.map(
        (panel) => panel._b70IndicatorGenerationShadow.metrics.calculationStarts
      );
      const preSeekGenerationIds = panels.map((panel) =>
        panel._b70IndicatorGenerationShadow.currentEnvelope?.metadata?.generationId || null);
      for (const panel of panels) {
        panel.replaySystem.isPlaying = false;
        panel.recalculateIndicators();
        panel.replaySystem.isPlaying = true;
        panel.recalculateIndicators();
      }
      const replay = c.replaySystem;
      const seekFrom = Number.isSafeInteger(replay?.currentIndex)
        ? replay.currentIndex : null;
      const seekTo = seekFrom == null || !Array.isArray(replay.fullRawData)
        ? null
        : Math.max(replay.sessionStartIndex || 0, seekFrom - 1);
      const actualSeekIssued = seekTo != null && seekTo !== seekFrom
        && typeof replay.seekTo === 'function';
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
      let terminalWaitIterations = 0;
      for (; terminalWaitIterations < 500; terminalWaitIterations++) {
        const terminal = !c._indicatorWorkerBusy && panels.every((panel) =>
          panel._b70HasCommittedIndicatorGeneration());
        if (terminal) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const terminalGenerationIds = panels.map((panel) =>
        panel._b70IndicatorGenerationShadow.currentEnvelope?.metadata?.generationId || null);
      const terminalCommitted = panels.map((panel) =>
        !!panel._b70HasCommittedIndicatorGeneration());
      lifecycle = {
        pauseResumePanelCalculationsStable: panels.every((panel, index) =>
          panel._b70IndicatorGenerationShadow.metrics.calculationStarts
            === beforePanelCalculations[index]),
        seekCommitted: panels.every((panel) =>
          panel._b70HasCommittedIndicatorGeneration()),
        seekValueParity: panels.every((panel) =>
          JSON.stringify(Object.values(panel.indicators?.data || {}))
            === calculationPayload()),
        actualSeekIssued,
        seekFrom,
        seekTo,
        terminalWaitIterations,
        terminalWaitLimit: 500,
        terminalTimedOut: terminalWaitIterations === 500,
        terminalCommitted,
        terminalGenerationFresh: terminalGenerationIds.every(
          (id, index) => id != null && id !== preSeekGenerationIds[index]
        ),
        preSeekGenerationIds,
        terminalGenerationIds,
      };
    }
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
  await page.close();
  return { ...result, errors };
}

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const summarize = (cell) => {
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
    && on.panelResults.length >= 1
    && on.panelResults.every((panel) =>
      panel.metrics?.calculationStarts === 0
      && panel.metrics?.bridgeAccepts === 1
      && panel.metrics?.bridgeRejects === 0
      && panel.dataPayload === on.indicatorDataAfter)
    && on.authenticatedProductIframeCount >= 1
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

  const tema = evaluatePair(await runCell(false, 1), await runCell(true, 1));
  const fourIndicators = evaluatePair(await runCell(false, 4), await runCell(true, 4));
  const verdict = tema.green && fourIndicators.green ? 'GREEN' : 'FAIL';
  console.log(JSON.stringify({
    verdict,
    expectedBuild,
    workload: { sessionId, iterations: 60, panels: 3, resetBeforeWorkload: true },
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
  if (verdict !== 'GREEN') process.exitCode = 1;
} finally {
  await browser.close();
}
