#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../multichart-prod/harness/serve.mjs';
import {
  bootLayout,
  launchBrowser,
  sleep,
} from '../multichart-prod/harness/harness-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.join(here, 'b70-stage5-review-artifacts');
const mode = String(process.env.B70_STAGE5_MODE || 'local').toLowerCase();
const outPath = process.env.B70_STAGE5_EVIDENCE
  ? path.resolve(process.env.B70_STAGE5_EVIDENCE)
  : path.join(evidenceDir, `real-iframe-${mode}.json`);

function writeEvidence(body) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    verdict: body.verdict,
    evidenceClass: body.evidenceClass,
    evidencePath: outPath,
    prerequisites: body.prerequisites || [],
  }, null, 2)}\n`);
}

async function login(page, origin) {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  if (!origin || !email || !password) {
    throw new Error('TEST_VPS_URL, TEST_EMAIL and TEST_PASSWORD are required');
  }
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const auth = await page.evaluate(async ({ email: e, password: p }) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: e, password: p }),
    });
    return { ok: response.ok, status: response.status };
  }, { email, password });
  if (!auth.ok) throw new Error(`authentication failed with HTTP ${auth.status}`);
}

async function authenticatedPreflight(browser) {
  const origin = String(process.env.TEST_VPS_URL || '').replace(/\/$/, '');
  const page = await browser.newPage();
  await login(page, origin);
  const sessionId = String(process.env.B70_SESSION_ID || '827');
  await page.goto(`${origin}/chart/dist-v9/index.html?mode=backtest&mcLayout=2&sessionId=${encodeURIComponent(sessionId)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  let chartReady = true;
  try {
    await page.waitForFunction(() => window.chart, { timeout: 30_000 });
  } catch (_) {
    chartReady = false;
  }
  const observed = await page.evaluate(() => ({
    buildId: window.__TALARIA_CHART_BUILD_ID || null,
    managerPresent: !!window.__harnessManager || !!window.MultichartManager,
    iframePanels: Array.from(document.querySelectorAll('iframe')).filter((frame) => {
      try { return !!frame.contentWindow?.chart; } catch (_) { return false; }
    }).length,
    b70RuntimePresent:
      typeof window.__TALARIA_B70_CONNECT_INDICATOR_PANEL_V1 === 'function',
  }));
  observed.chartReady = chartReady;
  await page.close();
  const candidateBase = String(process.env.B70_AUTH_CANDIDATE_BASE_URL || '').trim();
  const usable = observed.managerPresent
    && observed.iframePanels > 0 && observed.b70RuntimePresent && candidateBase;
  return {
    verdict: usable ? 'READY' : 'BLOCK',
    evidenceClass: 'authenticated-production-preflight',
    authenticated: true,
    observed,
    prerequisites: usable ? [] : [
      'Deploy or expose the candidate chart tree at B70_AUTH_CANDIDATE_BASE_URL.',
      'Expose the real product multichart route with same-origin iframe panels to the QA account.',
      'Re-run with B70_STAGE5_MODE=authenticated after that route serves the candidate.',
    ],
  };
}

function installFlags(on) {
  window.__TALARIA_ENABLE_B70_SINGLE_INDICATOR_OWNER_V1 = on;
  window.__TALARIA_B70_DEV_FREEZE_ENVELOPES = true;
  window.__TALARIA_B70_BRIDGE_TIMEOUT_MS = 5000;
  window.__b70WorkerPosts = 0;
  if (typeof Worker === 'function' && Worker.prototype?.postMessage) {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function b70ObservedPost(message, ...rest) {
      if (message?.type === 'CALCULATE_ALL' || message?.type === 'CALCULATE_TAIL') {
        window.__b70WorkerPosts++;
      }
      return original.call(this, message, ...rest);
    };
  }
}

async function runLocalCell(browser, server, enabled, indicatorCount) {
  const layout = await bootLayout(browser, server, {
    pair: 'same',
    panels: 4,
    tf: '1m',
    preDocument: { fn: installFlags, args: [enabled] },
  });
  const { page } = layout;
  const result = await page.evaluate(async ({ on, count }) => {
    const manager = window.__harnessManager;
    const entries = Array.from(manager.charts.values());
    const charts = entries.map((entry) => entry.host
      ? window.chart : entry.frame?.contentWindow?.chart).filter(Boolean);
    if (charts.length !== 4) throw new Error(`expected four real charts, got ${charts.length}`);

    const active = Array.from({ length: count }, (_, index) => ({
      id: `b70-real-${index + 1}`,
      type: 'tema',
      name: `TEMA(${20 + index})`,
      params: { period: 20 + index },
      style: { color: '#4da3ff', lineWidth: 1 },
    }));
    for (const chart of charts) {
      chart.data = chart.data.slice(-600).map((bar) => ({ ...bar }));
      chart.dataVersion = 7000 + count;
      chart.indicators = chart.indicators || {};
      chart.indicators.active = active.map((indicator) => ({
        ...indicator,
        params: { ...indicator.params },
        style: { ...indicator.style },
      }));
      chart.indicators.data = {};
      chart._indicatorRenderVersion = 0;
      chart.__b70ExternalStarts = 0;
      const original = chart.recalculateIndicators.bind(chart);
      chart.recalculateIndicators = function observedB70Recalc(...args) {
        chart.__b70ExternalStarts++;
        return original(...args);
      };
    }

    const host = charts[0];
    const panels = charts.slice(1);
    let lastEnvelope = null;
    let targetLastEnvelope = null;
    let faultPlan = null;
    if (on) {
      const originalRegister = host._b70Stage5RegisterPanelBridge;
      host._b70Stage5RegisterPanelBridge = function observedRegister(panel, receiver) {
        return originalRegister.call(host, panel, (message) => {
          lastEnvelope = structuredClone(message);
          if (faultPlan && faultPlan.panel === panel && !faultPlan.result) {
            const altered = structuredClone(message);
            if (faultPlan.kind === 'malformedAuthority') {
              altered.ownerTickets[0].claimSeq = 'malformed';
            } else if (faultPlan.kind === 'duplicateAuthority') {
              altered.ownerTickets[1] = structuredClone(altered.ownerTickets[0]);
            } else if (faultPlan.kind === 'foreign') {
              altered.hostChartId = 'foreign-chart';
            } else if (faultPlan.kind === 'nan') {
              const firstId = altered.requestedSet.instanceIds[0];
              altered.payload[firstId][altered.payload[firstId].length - 1] = NaN;
            }
            const metrics = panel._b70IndicatorGenerationShadow.metrics;
            const before = {
              duplicateAuthority: metrics.bridgeDuplicateAuthorityRejects,
              malformedAuthority: metrics.bridgeMalformedAuthorityRejects,
              foreign: metrics.bridgeForeignRejects,
              schema: metrics.bridgeSchemaRejects,
              order: metrics.bridgeOrderRejects,
              stale: metrics.bridgeStaleRejects,
              partial: metrics.bridgePartialRejects,
              late: metrics.bridgeLateRejects,
              total: metrics.bridgeRejects,
            };
            const accepted = receiver(altered);
            const after = {
              duplicateAuthority: metrics.bridgeDuplicateAuthorityRejects,
              malformedAuthority: metrics.bridgeMalformedAuthorityRejects,
              foreign: metrics.bridgeForeignRejects,
              schema: metrics.bridgeSchemaRejects,
              order: metrics.bridgeOrderRejects,
              stale: metrics.bridgeStaleRejects,
              partial: metrics.bridgePartialRejects,
              late: metrics.bridgeLateRejects,
              total: metrics.bridgeRejects,
            };
            faultPlan.result = { accepted, before, after };
            return accepted;
          }
          if (panel === panels[0]) targetLastEnvelope = structuredClone(message);
          return receiver(message);
        });
      };
    }

    const started = performance.now();
    for (let iteration = 0; iteration < 60; iteration++) {
      if (on) {
        for (const panel of panels) panel.recalculateIndicators();
        host.recalculateIndicators();
      } else {
        for (const chart of charts) chart.recalculateIndicators();
      }
      for (const chart of charts) {
        chart.renderPending = true;
        chart.render();
      }
    }
    for (let spin = 0; spin < 1000
      && charts.some((chart) => chart._indicatorWorkerBusy); spin++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const elapsedMs = performance.now() - started;

    const stableString = (value) => JSON.stringify(value, (_key, item) =>
      typeof item === 'number' && Object.is(item, -0) ? 0 : item);
    const hostPayload = stableString(host.indicators.data);
    const payloadParity = panels.every((panel) =>
      stableString(panel.indicators.data) === hostPayload);
    const lastFinite = (value) => {
      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i--) {
          if (Number.isFinite(value[i])) return value[i];
        }
      }
      return null;
    };
    const endpoints = charts.map((chart) => active.map((indicator) =>
      lastFinite(chart.indicators.data[indicator.id])));
    const valueParity = endpoints.slice(1).every((row) =>
      stableString(row) === stableString(endpoints[0]));
    const yWitnesses = charts.map((chart, chartIndex) => {
      const range = typeof chart.yScale?.range === 'function'
        ? chart.yScale.range() : null;
      return endpoints[chartIndex].map((value) => {
        if (typeof chart.yScale !== 'function' || !Number.isFinite(value)
          || !Array.isArray(range) || range.length < 2 || range[1] === range[0]) return null;
        const pixelY = chart.yScale(value);
        return {
          pixelY,
          normalizedY: (pixelY - range[0]) / (range[1] - range[0]),
        };
      });
    });
    const yParity = yWitnesses.slice(1).every((row) =>
      row.every((witness, index) => {
        const hostWitness = yWitnesses[0][index];
        return witness && hostWitness
          && Math.abs(witness.normalizedY - hostWitness.normalizedY) <= 1e-12;
      }));
    const layerParity = panels.every((panel) =>
      panel._indicatorRenderVersion === host._indicatorRenderVersion);
    const blackPanels = charts.filter((chart) => {
      const canvas = Array.from(chart.canvas?.ownerDocument?.querySelectorAll('canvas') || [])
        .filter((item) => item.width > 0 && item.height > 0)
        .sort((a, b) => b.width * b.height - a.width * a.height)[0];
      if (!canvas || !canvas.width || !canvas.height) return true;
      const ctx = canvas.getContext('2d');
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const stride = Math.max(4, Math.floor(pixels.length / 16384 / 4) * 4);
      for (let i = 0; i < pixels.length; i += stride) {
        if (pixels[i] || pixels[i + 1] || pixels[i + 2]) return false;
      }
      return true;
    }).length;

    const mainGenerationMetrics = on ? {
      host: structuredClone(host._b70IndicatorGenerationShadow?.metrics || {}),
      panels: panels.map((panel) =>
        structuredClone(panel._b70IndicatorGenerationShadow?.metrics || {})),
    } : null;
    const faults = {};
    if (on && lastEnvelope) {
      const target = panels[0];
      const expectedMetric = {
        malformedAuthority: 'malformedAuthority',
        duplicateAuthority: 'duplicateAuthority',
        foreign: 'foreign',
        nan: 'schema',
      };
      const runFault = async (kind) => {
        for (const chart of charts) {
          chart.dataVersion++;
          chart._b70ShadowInvalidateIndicatorGeneration?.('timeline-seek');
        }
        window.__TALARIA_B70_CONNECT_INDICATOR_PANEL_V1(target, host);
        faultPlan = { kind, panel: target, result: null };
        target.recalculateIndicators();
        for (let spin = 0; spin < 1000
          && (!faultPlan.result || host._indicatorWorkerBusy); spin++) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        const result = faultPlan.result;
        faultPlan = null;
        const metric = expectedMetric[kind];
        const exact = !!result
          && result.after[metric] === result.before[metric] + 1
          && result.after.total === result.before.total + 1
          && Object.keys(result.before).filter((name) =>
            name !== metric && name !== 'total').every((name) =>
            result.after[name] === result.before[name]);
        return { kind, exactGate: metric, exact, result };
      };
      faults.malformedTicket = await runFault('malformedAuthority');
      if (count > 1) {
        faults.duplicateTicket = await runFault('duplicateAuthority');
      } else {
        faults.duplicateTicket = {
          kind: 'duplicateAuthority',
          notApplicable: 'requires at least two requested instances',
          exact: true,
        };
      }
      faults.foreign = await runFault('foreign');
      faults.nan = await runFault('nan');

      for (const chart of charts) {
        chart.dataVersion++;
        chart._b70ShadowInvalidateIndicatorGeneration?.('timeline-seek');
      }
      window.__TALARIA_B70_CONNECT_INDICATOR_PANEL_V1(target, host);
      target.recalculateIndicators();
      for (let spin = 0; spin < 1000
        && (host._indicatorWorkerBusy
          || !target._b70HasCommittedIndicatorGeneration?.()); spin++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const acceptedEnvelope = structuredClone(targetLastEnvelope);
      const orderBefore =
        target._b70IndicatorGenerationShadow.metrics.bridgeOrderRejects;
      const totalBefore =
        target._b70IndicatorGenerationShadow.metrics.bridgeRejects;
      const duplicateAccepted =
        target._b70Stage5AcceptIndicatorEnvelope(acceptedEnvelope);
      faults.duplicate = {
        kind: 'duplicateEnvelope',
        exactGate: 'order',
        exact: duplicateAccepted === false
          && target._b70IndicatorGenerationShadow.metrics.bridgeOrderRejects
            === orderBefore + 1
          && target._b70IndicatorGenerationShadow.metrics.bridgeRejects
            === totalBefore + 1,
      };
    }

    const metricSnapshot = (chart) => {
      const metrics = chart._b70IndicatorGenerationShadow?.metrics || {};
      return {
        calculations: metrics.calculationStarts || 0,
        publications: metrics.bridgePublications || 0,
        accepts: metrics.bridgeAccepts || 0,
        paintCalculations: metrics.paintCalculations || 0,
        paintPublications: metrics.paintPublications || 0,
        paintVersionBumps: metrics.paintVersionBumps || 0,
        paintRenderSchedules: metrics.paintRenderSchedules || 0,
      };
    };
    const drain = async (label) => {
      const deadline = performance.now() + 10_000;
      while (charts.some((chart) => chart._indicatorWorkerBusy)) {
        if (performance.now() >= deadline) throw new Error(`${label}: worker drain timeout`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await new Promise((resolve) => requestAnimationFrame(() =>
        requestAnimationFrame(resolve)));
    };
    const replay = host.replaySystem;
    const beforePause = on ? {
      host: metricSnapshot(host),
      panels: panels.map(metricSnapshot),
    } : null;
    let paused = true;
    let resumed = true;
    if (replay && typeof replay.pause === 'function') {
      replay.pause();
      await drain('pause');
      paused = replay.isPlaying === false;
    }
    const afterPause = on ? {
      host: metricSnapshot(host),
      panels: panels.map(metricSnapshot),
    } : null;
    if (replay && typeof replay.play === 'function') {
      const priorActive = replay.isActive;
      const originalTickStart = replay.startTickAnimation;
      const originalCandleStart = replay.startCandleByCandle;
      let boundedLoopStarted = false;
      replay.startTickAnimation = function boundedTickResume() {
        boundedLoopStarted = true;
      };
      replay.startCandleByCandle = function boundedCandleResume() {
        boundedLoopStarted = true;
      };
      replay.isActive = true;
      replay.play();
      for (let spin = 0; spin < 100 && !replay.isPlaying; spin++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      resumed = replay.isPlaying === true && boundedLoopStarted;
      replay.pause();
      replay.isActive = priorActive;
      replay.startTickAnimation = originalTickStart;
      replay.startCandleByCandle = originalCandleStart;
      await drain('resume-pause');
    }
    if (on) {
      for (const chart of charts) {
        const last = chart.data[chart.data.length - 1];
        if (last) last.c = Number(last.c) + 0.000001;
        chart.dataVersion++;
        chart._b70ShadowInvalidateIndicatorGeneration?.('timeline-seek');
      }
      for (const panel of panels) {
        window.__TALARIA_B70_CONNECT_INDICATOR_PANEL_V1(panel, host);
        panel.recalculateIndicators();
      }
      if (typeof host.scheduleReplayIndicatorRecalc === 'function') {
        host.scheduleReplayIndicatorRecalc(true);
      } else {
        host.recalculateIndicators();
      }
      await drain('resumed-generation');
    }
    const afterResume = on ? {
      host: metricSnapshot(host),
      panels: panels.map(metricSnapshot),
    } : null;
    const pauseExact = !on || (
      afterPause.host.calculations === beforePause.host.calculations
      && afterPause.host.publications === beforePause.host.publications
      && afterPause.panels.every((metrics, index) =>
        metrics.calculations === beforePause.panels[index].calculations
        && metrics.accepts === beforePause.panels[index].accepts)
    );
    const panelCalculationExact = !on || afterResume.panels.every((metrics, index) =>
      metrics.calculations === beforePause.panels[index].calculations);
    const publicationExact = !on || (
      afterResume.host.calculations === beforePause.host.calculations + 1
      && afterResume.host.publications === beforePause.host.publications + 1
      && afterResume.panels.every((metrics, index) =>
        metrics.accepts === beforePause.panels[index].accepts + 1)
    );
    const paintExact = !on || [afterResume.host, ...afterResume.panels]
      .every((metrics, index) => {
        const before = index === 0 ? beforePause.host : beforePause.panels[index - 1];
        return metrics.paintCalculations === before.paintCalculations
          && metrics.paintPublications === before.paintPublications
          && metrics.paintVersionBumps === before.paintVersionBumps
          && metrics.paintRenderSchedules === before.paintRenderSchedules;
      });
    const terminalFresh = !on || (
      charts.every((chart) => chart._b70HasCommittedIndicatorGeneration?.())
      && panels.every((panel) =>
        stableString(panel.indicators.data) === stableString(host.indicators.data))
    );
    const lifecycle = {
      paused,
      resumed,
      pauseExact,
      panelCalculationExact,
      publicationExact,
      paintExact,
      terminalFresh,
      beforePause,
      afterPause,
      afterResume,
    };

    manager.removeChart('B');
    const removed = !manager.charts.has('B');
    const grid = document.getElementById('grid');
    const mount = document.createElement('div');
    mount.className = 'chart-cell';
    grid.appendChild(mount);
    manager.addChart({ id: 'B', tf: '1m', fileId: '25' }, mount);
    let readdedChart = null;
    for (let spin = 0; spin < 1000 && !readdedChart; spin++) {
      const entry = manager.charts.get('B');
      readdedChart = entry?.ready && entry.frame?.contentWindow?.chart || null;
      if (!readdedChart) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (readdedChart) {
      readdedChart.data = host.data.map((bar) => ({ ...bar }));
      readdedChart.dataVersion = host.dataVersion;
      readdedChart.indicators.active = active.map((indicator) => ({
        ...indicator,
        params: { ...indicator.params },
        style: { ...indicator.style },
      }));
      readdedChart.indicators.data = {};
      readdedChart.recalculateIndicators();
      for (let spin = 0; spin < 1000
        && !readdedChart._b70HasCommittedIndicatorGeneration?.(); spin++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    return {
      enabled: on,
      indicatorCount: count,
      realIframeCount: entries.filter((entry) => !entry.host).length,
      elapsedMs,
      starts: charts.map((chart) => chart.__b70ExternalStarts),
      workerPosts: charts.map((chart) => chart.ownerDocument?.defaultView?.__b70WorkerPosts || 0),
      payloadParity,
      valueParity,
      yParity,
      yWitnesses,
      layerParity,
      blackPanels,
      faults,
      lifecycle,
      panelRemoval: removed,
      panelReadd: !!readdedChart && (on
        ? !!readdedChart._b70HasCommittedIndicatorGeneration?.() : true),
      mainGenerationMetrics,
      metrics: host._b70IndicatorGenerationShadow?.metrics || null,
    };
  }, { on: enabled, count: indicatorCount });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => {
    const manager = window.__harnessManager;
    return window.__harnessHostReady && manager && manager.charts.size === 4
      && Array.from(manager.charts.values()).every((entry) => entry.ready);
  }, { timeout: 60_000 });
  result.reload = await page.evaluate(async (on) => {
    const manager = window.__harnessManager;
    const charts = Array.from(manager.charts.values()).map((entry) => entry.host
      ? window.chart : entry.frame?.contentWindow?.chart).filter(Boolean);
    if (!on) return { ready: charts.length === 4, bridged: null };
    const active = [{
      id: 'b70-reload-1',
      type: 'tema',
      name: 'TEMA(20)',
      params: { period: 20 },
      style: { color: '#4da3ff', lineWidth: 1 },
    }];
    for (const chart of charts) {
      chart.data = chart.data.slice(-300).map((bar) => ({ ...bar }));
      chart.dataVersion = 9001;
      chart.indicators.active = active.map((indicator) => ({
        ...indicator,
        params: { ...indicator.params },
        style: { ...indicator.style },
      }));
      chart.indicators.data = {};
    }
    charts[1].recalculateIndicators();
    for (let spin = 0; spin < 1000
      && !charts[1]._b70HasCommittedIndicatorGeneration?.(); spin++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return {
      ready: charts.length === 4,
      bridged: charts[1]._b70IndicatorGenerationShadow?.metrics?.bridgeAccepts === 1
        && charts[1]._b70IndicatorGenerationShadow?.metrics?.calculationStarts === 0,
    };
  }, enabled);
  await sleep(500);
  result.pageErrors = layout.pageErrors;
  result.consoleErrors = layout.consoleErrors;
  await layout.close();
  return result;
}

async function main() {
  const browser = await launchBrowser();
  try {
    if (mode === 'authenticated') {
      const evidence = await authenticatedPreflight(browser);
      writeEvidence(evidence);
      process.exitCode = evidence.verdict === 'READY' ? 0 : 2;
      return;
    }
    const server = await startServer(0);
    try {
      const cells = [];
      for (const count of [1, 4]) {
        const off = await runLocalCell(browser, server, false, count);
        const on = await runLocalCell(browser, server, true, count);
        cells.push({
          count,
          off,
          on,
          throughputRatio: on.elapsedMs / Math.max(0.001, off.elapsedMs),
        });
      }
      const green = cells.every(({ on }) =>
        on.realIframeCount === 3
        && on.payloadParity && on.valueParity && on.yParity && on.layerParity
        && on.blackPanels === 0 && on.panelRemoval && on.panelReadd
        && on.reload.ready && on.reload.bridged
        && on.lifecycle.paused && on.lifecycle.resumed
        && on.lifecycle.pauseExact
        && on.lifecycle.panelCalculationExact
        && on.lifecycle.publicationExact
        && on.lifecycle.paintExact
        && on.lifecycle.terminalFresh
        && Object.values(on.faults).every((fault) => fault.exact === true)
        && on.mainGenerationMetrics.host.calculationStarts === 1
        && on.mainGenerationMetrics.panels.every((metrics) =>
          metrics.calculationStarts === 0 && metrics.bridgeAccepts === 1)
        && on.pageErrors.length === 0);
      writeEvidence({
        verdict: green ? 'GREEN' : 'FAIL',
        evidenceClass: 'hermetic-local-real-product-iframes',
        authenticated: false,
        productionEvidence: false,
        generatedAt: new Date().toISOString(),
        cells,
      });
      process.exitCode = green ? 0 : 1;
    } finally {
      await server.close();
    }
  } finally {
    try {
      await browser.close();
    } catch (error) {
      process.stderr.write(`[b70-real-iframe] browser cleanup warning: ${
        error?.code || error?.message || error
      }\n`);
    }
  }
}

await main();
