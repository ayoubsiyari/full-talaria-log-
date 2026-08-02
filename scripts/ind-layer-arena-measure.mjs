#!/usr/bin/env node
/**
 * IND-LAYER-ARENA-MEASURE-V1
 *
 * Four-panel harness measurement for the indicator-layer canvas arena.
 * It deliberately reports GPU/process private memory and memory-infra allocator
 * roots; JS heap/node counts are secondary because the arena is mostly native.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import { embedFrames, sleep } from '../chart v 1.4/chart/multichart-prod/harness/harness-lib.mjs';
import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';
import { readOsFootprints } from './process-memory-census.mjs';
import {
  collectAllocatorDetail,
  diffAllocatorDetail,
  pickHeaviestDetail,
} from './lib/blink-allocator-detail.mjs';

const MB = 1048576;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function argOf(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function mb(bytes) {
  return bytes == null ? null : +(Number(bytes) / MB).toFixed(3);
}

function log(...args) {
  console.error(`[ind-layer-arena ${new Date().toISOString()}]`, ...args);
}

async function bootArenaLayout(browser, srv, { hostFile, panels = 4, tf = '1m' } = {}) {
  const params = new URLSearchParams();
  params.set('pair', 'same');
  params.set('panels', String(panels));
  params.set('tf', tf);
  params.set('hostFile', String(hostFile || 25));
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String((err && err.stack) || err));
  });
  await page.goto(`${srv.url}/harness/host.html?${params.toString()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  const deadline = Date.now() + 45_000;
  let state = null;
  while (Date.now() < deadline) {
    state = {
      hostReady: await page.evaluate(() => !!window.__harnessHostReady).catch(() => false),
      hostChart: await page.evaluate(() => !!window.chart).catch(() => false),
      iframeCharts: 0,
      iframeCount: embedFrames(page).length,
      bootError: await page.evaluate(() => window.__harnessBootError || null).catch(() => null),
    };
    for (const frame of embedFrames(page)) {
      if (await frame.evaluate(() => !!window.chart).catch(() => false)) state.iframeCharts += 1;
    }
    if (state.hostChart && state.iframeCharts >= panels - 1) break;
    await sleep(250);
  }
  return {
    page,
    consoleErrors,
    pageErrors,
    bootState: state,
    close: () => page.close().catch(() => {}),
  };
}

async function collectGarbage(page, cdp) {
  for (let i = 0; i < 3; i++) {
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    await cdp.send('Runtime.collectGarbage').catch(() => {});
    await page.evaluate(() => { try { if (typeof gc === 'function') gc(); } catch (_) {} }).catch(() => {});
    await sleep(300);
  }
  await sleep(1000);
}

function chartFrames(page) {
  return [page.mainFrame(), ...embedFrames(page)];
}

async function allocateIndicatorLayers(page) {
  const rows = [];
  for (const frame of chartFrames(page)) {
    rows.push(await frame.evaluate(() => {
      const ch = window.chart;
      if (!ch || typeof ch._syncIndicatorLayerCanvasSize !== 'function') {
        return { ok: false, reason: 'missing _syncIndicatorLayerCanvasSize' };
      }
      const size = ch._syncIndicatorLayerCanvasSize();
      try {
        const ctx = ch._indLayerCtx;
        if (ctx) {
          ctx.fillStyle = 'rgba(90,160,255,0.20)';
          ctx.fillRect(0, 0, size.cssW, size.cssH);
        }
      } catch (_) {}
      return {
        ok: true,
        fileId: ch.currentFileId != null ? String(ch.currentFileId) : null,
        w: ch._indLayerCanvas ? ch._indLayerCanvas.width : 0,
        h: ch._indLayerCanvas ? ch._indLayerCanvas.height : 0,
        backingMB: ch._indLayerCanvas
          ? +((ch._indLayerCanvas.width * ch._indLayerCanvas.height * 4) / 1048576).toFixed(3)
          : 0,
      };
    }).catch((error) => ({ ok: false, reason: String(error?.message || error) })));
  }
  return rows;
}

async function switchAllPanels(page, targetFileId) {
  const rows = [];
  for (const frame of chartFrames(page)) {
    rows.push(await frame.evaluate(async (fid) => {
      const ch = window.chart;
      if (!ch || typeof ch.loadFileData !== 'function') return { ok: false, reason: 'missing loadFileData' };
      const before = ch.currentFileId != null ? String(ch.currentFileId) : null;
      const beforeLayer = !!ch._indLayerCanvas;
      const beforeBackingMB = ch._indLayerCanvas
        ? +((ch._indLayerCanvas.width * ch._indLayerCanvas.height * 4) / 1048576).toFixed(3)
        : 0;
      await ch.loadFileData(String(fid));
      await new Promise((resolve) => setTimeout(resolve, 800));
      return {
        ok: true,
        before,
        after: ch.currentFileId != null ? String(ch.currentFileId) : null,
        beforeLayer,
        afterLayer: !!ch._indLayerCanvas,
        beforeBackingMB,
        afterBackingMB: ch._indLayerCanvas
          ? +((ch._indLayerCanvas.width * ch._indLayerCanvas.height * 4) / 1048576).toFixed(3)
          : 0,
      };
    }, targetFileId).catch((error) => ({ ok: false, reason: String(error?.message || error) })));
  }
  return rows;
}

async function countLayers(page) {
  const rows = [];
  for (const frame of chartFrames(page)) {
    rows.push(await frame.evaluate(() => {
      const ch = window.chart;
      const canvas = ch && ch._indLayerCanvas;
      return {
        fileId: ch && ch.currentFileId != null ? String(ch.currentFileId) : null,
        hasLayer: !!canvas,
        backingMB: canvas ? +((canvas.width * canvas.height * 4) / 1048576).toFixed(3) : 0,
        canvasCount: document.querySelectorAll('canvas').length,
      };
    }).catch((error) => ({ error: String(error?.message || error) })));
  }
  return {
    perFrame: rows,
    indLayerBackingMB: +rows.reduce((sum, r) => sum + (Number(r.backingMB) || 0), 0).toFixed(3),
    layerCount: rows.filter((r) => r.hasLayer).length,
  };
}

async function readPerf(cdp) {
  const got = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
  const get = (name) => {
    const row = got.metrics.find((m) => m.name === name);
    return row ? Number(row.value) : null;
  };
  return {
    jsHeapUsedMB: mb(get('JSHeapUsedSize')),
    nodes: get('Nodes'),
    documents: get('Documents'),
    frames: get('Frames'),
    listeners: get('JSEventListeners'),
  };
}

async function readProcesses(browser) {
  const bcdp = await browser.target().createCDPSession();
  try {
    const info = await bcdp.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] }));
    const processInfo = info.processInfo || [];
    const footprints = await readOsFootprints(processInfo.map((p) => p.id)).catch(() => ({}));
    const processes = processInfo.map((p) => ({
      pid: p.id,
      type: p.type,
      privateMB: footprints[p.id]?.privateMB ?? null,
      workingSetMB: footprints[p.id]?.workingSetMB ?? null,
    }));
    const gpuPrivateMB = +processes
      .filter((p) => /gpu/i.test(p.type))
      .reduce((sum, p) => sum + (Number(p.privateMB) || 0), 0).toFixed(3);
    const rendererPrivateMB = +processes
      .filter((p) => /renderer/i.test(p.type))
      .reduce((sum, p) => sum + (Number(p.privateMB) || 0), 0).toFixed(3);
    const totalPrivateMB = +processes
      .reduce((sum, p) => sum + (Number(p.privateMB) || 0), 0).toFixed(3);
    return { processes, gpuPrivateMB, rendererPrivateMB, totalPrivateMB };
  } finally {
    await bcdp.detach().catch(() => {});
  }
}

async function sample(label, { page, cdp, browser, browserCdp, allocator = false }) {
  await collectGarbage(page, cdp);
  const [perf, process, layers] = await Promise.all([
    readPerf(cdp),
    readProcesses(browser),
    countLayers(page),
  ]);
  let allocatorDetail = null;
  if (allocator) {
    const detail = await collectAllocatorDetail(browserCdp, { settleMs: 1500 }).catch((error) => {
      log(`allocator detail failed: ${error?.message || error}`);
      return null;
    });
    const heaviest = detail ? pickHeaviestDetail(detail) : null;
    allocatorDetail = heaviest ? {
      pid: heaviest.pid,
      score: +heaviest.score.toFixed(3),
      detail: heaviest.detail,
    } : null;
  }
  return {
    label,
    at: new Date().toISOString(),
    perf,
    process: {
      gpuPrivateMB: process.gpuPrivateMB,
      rendererPrivateMB: process.rendererPrivateMB,
      totalPrivateMB: process.totalPrivateMB,
      processes: process.processes,
    },
    layers,
    allocatorDetail,
  };
}

function delta(a, b) {
  return (a == null || b == null) ? null : +(Number(b) - Number(a)).toFixed(3);
}

async function main() {
  const out = path.resolve(argOf('out', path.join(__dirname, '..', '_evidence', 'manager-E', `ind-layer-arena-${Date.now()}.json`)));
  const targetFileId = argOf('target-file', '27');
  const hostFile = argOf('host-file', '25');
  const report = {
    signature: 'IND-LAYER-ARENA-MEASURE-V1',
    at: new Date().toISOString(),
    method: {
      surface: 'harness host.html four panels, forced GC, OS private memory plus memory-infra allocator detail',
      action: 'allocate indicator layer canvases on all panels, switch all panels to target file, verify layers are released',
      targetFileId,
      hostFile,
    },
    operations: {},
    samples: {},
  };
  const save = (phase) => {
    report.partial = phase || null;
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    log(`wrote ${phase || 'done'} ${out}`);
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const srv = await startServer(0);
  let browser = null;
  try {
    const puppeteer = await loadPuppeteer();
    browser = await puppeteer.launch({
      headless: true,
      protocolTimeout: 240_000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--enable-precise-memory-info',
        '--js-flags=--expose-gc',
      ],
      defaultViewport: { width: 1440, height: 960 },
    });
    report.browser = { version: await browser.version(), serverUrl: srv.url };
    log(`browser ${report.browser.version} server ${srv.url}`);
    const boot = await bootArenaLayout(browser, srv, {
      panels: 4,
      tf: '1m',
      hostFile,
    });
    report.bootState = boot.bootState;
    report.consoleErrors = boot.consoleErrors;
    report.pageErrors = boot.pageErrors;
    const page = boot.page;
    const cdp = await page.createCDPSession();
    const browserCdp = await browser.target().createCDPSession();
    await cdp.send('HeapProfiler.enable').catch(() => {});
    await cdp.send('Runtime.enable').catch(() => {});
    await cdp.send('Performance.enable').catch(() => {});

    report.samples.boot = await sample('boot', { page, cdp, browser, browserCdp, allocator: true });
    save('boot');

    report.operations.allocateIndicatorLayers = await allocateIndicatorLayers(page);
    report.samples.beforeSwitch = await sample('beforeSwitch', { page, cdp, browser, browserCdp, allocator: true });
    save('beforeSwitch');

    report.operations.switchAllPanels = await switchAllPanels(page, targetFileId);
    report.samples.afterSwitch = await sample('afterSwitch', { page, cdp, browser, browserCdp, allocator: true });

    const before = report.samples.beforeSwitch;
    const after = report.samples.afterSwitch;
    report.summary = {
      gpuPrivateBeforeMB: before.process.gpuPrivateMB,
      gpuPrivateAfterMB: after.process.gpuPrivateMB,
      gpuPrivateDeltaMB: delta(before.process.gpuPrivateMB, after.process.gpuPrivateMB),
      rendererPrivateBeforeMB: before.process.rendererPrivateMB,
      rendererPrivateAfterMB: after.process.rendererPrivateMB,
      rendererPrivateDeltaMB: delta(before.process.rendererPrivateMB, after.process.rendererPrivateMB),
      totalPrivateBeforeMB: before.process.totalPrivateMB,
      totalPrivateAfterMB: after.process.totalPrivateMB,
      totalPrivateDeltaMB: delta(before.process.totalPrivateMB, after.process.totalPrivateMB),
      jsHeapBeforeMB: before.perf.jsHeapUsedMB,
      jsHeapAfterMB: after.perf.jsHeapUsedMB,
      indLayerBackingBeforeMB: before.layers.indLayerBackingMB,
      indLayerBackingAfterMB: after.layers.indLayerBackingMB,
      releasedLayerCount: before.layers.layerCount - after.layers.layerCount,
      allocatorRootDeltas: before.allocatorDetail && after.allocatorDetail
        ? diffAllocatorDetail(before.allocatorDetail.detail, after.allocatorDetail.detail).rootDeltas
        : null,
      allocatorChildDeltas: before.allocatorDetail && after.allocatorDetail
        ? diffAllocatorDetail(before.allocatorDetail.detail, after.allocatorDetail.detail).childDeltas
        : null,
    };
    report.partial = null;
    save(null);
    await browserCdp.detach().catch(() => {});
    await cdp.detach().catch(() => {});
    await boot.close();
  } catch (error) {
    report.error = String(error && error.stack || error);
    process.exitCode = 1;
    save('error');
  } finally {
    try { await browser?.close?.(); } catch (_) {}
    try { await srv.close?.(); } catch (_) {}
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      artifact: out,
      error: report.error || null,
      summary: report.summary || null,
      operations: report.operations,
    }, null, 2));
  }
}

await main();
