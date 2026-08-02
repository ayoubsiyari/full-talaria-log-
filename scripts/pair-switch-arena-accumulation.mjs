#!/usr/bin/env node
/**
 * PAIR-SWITCH-ARENA-ACCUMULATION-V1
 *
 * N consecutive pair switches with a settled full arena vector after each one.
 * This tests whether the renderer-private growth seen in a single pair switch is
 * cumulative slope or decommit/settle lag that returns to baseline.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import { bootLayout, embedFrames, sleep } from '../chart v 1.4/chart/multichart-prod/harness/harness-lib.mjs';
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
  console.error(`[pair-switch-accum ${new Date().toISOString()}]`, ...args);
}

function chartFrames(page) {
  return [page.mainFrame(), ...embedFrames(page)];
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

async function readPerf(cdp) {
  const got = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
  const get = (name) => {
    const row = got.metrics.find((m) => m.name === name);
    return row ? Number(row.value) : null;
  };
  return {
    jsHeapUsedMB: mb(get('JSHeapUsedSize')),
    jsHeapTotalMB: mb(get('JSHeapTotalSize')),
    nodes: get('Nodes'),
    listeners: get('JSEventListeners'),
    documents: get('Documents'),
    frames: get('Frames'),
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
    const sumWhere = (re) => +processes
      .filter((p) => re.test(p.type))
      .reduce((s, p) => s + (Number(p.privateMB) || 0), 0).toFixed(3);
    return {
      processes,
      totalPrivateMB: +processes.reduce((s, p) => s + (Number(p.privateMB) || 0), 0).toFixed(3),
      rendererPrivateMB: sumWhere(/renderer/i),
      gpuPrivateMB: sumWhere(/gpu/i),
    };
  } finally {
    await bcdp.detach().catch(() => {});
  }
}

async function chartState(page) {
  const rows = [];
  for (const frame of chartFrames(page)) {
    rows.push(await frame.evaluate(() => {
      const ch = window.chart;
      const canvases = [...document.querySelectorAll('canvas')];
      const backing = (c) => ((c.width || 0) * (c.height || 0) * 4) / 1048576;
      return {
        hasChart: !!ch,
        fileId: ch?.currentFileId != null ? String(ch.currentFileId) : null,
        symbol: ch?.currentSymbol || null,
        timeframe: ch?.currentTimeframe || null,
        dataBars: Array.isArray(ch?.data) ? ch.data.length : null,
        rawBars: Array.isArray(ch?.rawData) ? ch.rawData.length : null,
        hasIndLayer: !!ch?._indLayerCanvas,
        indLayerBackingMB: ch?._indLayerCanvas ? +backing(ch._indLayerCanvas).toFixed(3) : 0,
        canvasCount: canvases.length,
        canvasBackingMB: +canvases.reduce((s, c) => s + backing(c), 0).toFixed(3),
      };
    }).catch((e) => ({ error: String(e?.message || e) })));
  }
  const sum = (k) => +rows.reduce((s, r) => s + (Number(r[k]) || 0), 0).toFixed(3);
  return {
    frames: rows.length,
    indLayerCount: rows.filter((r) => r.hasIndLayer).length,
    indLayerBackingMB: sum('indLayerBackingMB'),
    canvasCount: sum('canvasCount'),
    canvasBackingMB: sum('canvasBackingMB'),
    perFrame: rows,
  };
}

async function sample(label, { page, cdp, browser, browserCdp, settleMs }) {
  if (settleMs > 0) await sleep(settleMs);
  await collectGarbage(page, cdp);
  const [perf, process, state] = await Promise.all([
    readPerf(cdp),
    readProcesses(browser),
    chartState(page),
  ]);
  const detailMap = await collectAllocatorDetail(browserCdp, { settleMs: 1500 }).catch(() => null);
  const heaviest = detailMap ? pickHeaviestDetail(detailMap) : null;
  const row = {
    label,
    at: new Date().toISOString(),
    settleMs,
    perf,
    process: {
      totalPrivateMB: process.totalPrivateMB,
      rendererPrivateMB: process.rendererPrivateMB,
      gpuPrivateMB: process.gpuPrivateMB,
      processPrivateMB: process.processes.map((p) => ({
        pid: p.pid,
        type: p.type,
        privateMB: p.privateMB,
        workingSetMB: p.workingSetMB,
      })),
    },
    state,
    allocatorDetail: heaviest ? { pid: heaviest.pid, detail: heaviest.detail } : null,
  };
  log(`sample ${label} total=${row.process.totalPrivateMB} renderer=${row.process.rendererPrivateMB} gpu=${row.process.gpuPrivateMB} indLayers=${state.indLayerCount}`);
  return row;
}

async function switchAllPanels(page, targetFileId) {
  const rows = [];
  for (const frame of chartFrames(page)) {
    rows.push(await frame.evaluate(async (fid) => {
      const ch = window.chart;
      if (!ch || typeof ch.loadFileData !== 'function') return { ok: false, reason: 'missing loadFileData' };
      const before = ch.currentFileId != null ? String(ch.currentFileId) : null;
      await ch.loadFileData(String(fid));
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return {
        ok: true,
        before,
        after: ch.currentFileId != null ? String(ch.currentFileId) : null,
        hasIndLayer: !!ch._indLayerCanvas,
      };
    }, targetFileId).catch((e) => ({ ok: false, reason: String(e?.message || e) })));
  }
  await sleep(800);
  return rows;
}

function summarise(samples) {
  const baseline = samples[0];
  const last = samples[samples.length - 1];
  const perSwitch = samples.slice(1).map((s, i) => ({
    switchNo: i + 1,
    targetFileId: s.targetFileId,
    totalPrivateDeltaFromBaselineMB: +(s.process.totalPrivateMB - baseline.process.totalPrivateMB).toFixed(3),
    rendererPrivateDeltaFromBaselineMB: +(s.process.rendererPrivateMB - baseline.process.rendererPrivateMB).toFixed(3),
    gpuPrivateDeltaFromBaselineMB: +(s.process.gpuPrivateMB - baseline.process.gpuPrivateMB).toFixed(3),
  }));
  const allocatorRootDeltas = baseline.allocatorDetail && last.allocatorDetail
    ? diffAllocatorDetail(baseline.allocatorDetail.detail, last.allocatorDetail.detail).rootDeltas
    : null;
  const rendererDelta = +(last.process.rendererPrivateMB - baseline.process.rendererPrivateMB).toFixed(3);
  const maxRendererDelta = Math.max(...perSwitch.map((s) => s.rendererPrivateDeltaFromBaselineMB));
  return {
    baselineLabel: baseline.label,
    lastLabel: last.label,
    switches: samples.length - 1,
    totalPrivateDeltaMB: +(last.process.totalPrivateMB - baseline.process.totalPrivateMB).toFixed(3),
    rendererPrivateDeltaMB: rendererDelta,
    gpuPrivateDeltaMB: +(last.process.gpuPrivateMB - baseline.process.gpuPrivateMB).toFixed(3),
    maxRendererPrivateDeltaFromBaselineMB: +maxRendererDelta.toFixed(3),
    rendererPrivateDeltaPerSwitchMB: samples.length > 1 ? +(rendererDelta / (samples.length - 1)).toFixed(3) : null,
    perSwitch,
    allocatorRootDeltas,
    verdict: rendererDelta > 0 && rendererDelta > maxRendererDelta * 0.75
      ? 'PERSISTENT_RENDERER_GROWTH'
      : 'RETURNS_TOWARD_BASELINE_OR_NO_MONOTONIC_SLOPE',
  };
}

async function main() {
  const switches = Math.max(1, Number(argOf('switches', '10')) || 10);
  const settleMs = Math.max(0, Number(argOf('settle', '20000')) || 0);
  const hostFile = String(argOf('host-file', '25'));
  const targetFile = String(argOf('target-file', '27'));
  const out = path.resolve(argOf('out', path.join(__dirname, '..', '_evidence', 'manager-D', `pair-switch-arena-accumulation-${Date.now()}.json`)));
  const report = {
    signature: 'PAIR-SWITCH-ARENA-ACCUMULATION-V1',
    at: new Date().toISOString(),
    question: 'Do consecutive pair switches accumulate renderer-private memory, or return toward baseline after settle?',
    method: {
      surface: 'local harness host.html, four panels',
      operation: `alternate chart.loadFileData() across all panels between file ${hostFile} and ${targetFile}`,
      readings: 'settle before every reading, forced CDP GC, OS process private vector, heaviest-renderer allocator detail',
      switches,
      settleMs,
    },
    inputs: { hostFile, targetFile, switches, settleMs },
    operations: [],
    samples: [],
    summary: null,
  };
  const save = (phase) => {
    report.partial = phase || null;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    log(`wrote ${phase || 'done'} ${out}`);
  };

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
    const boot = await bootLayout(browser, srv, {
      pair: 'same',
      panels: 4,
      tf: '1m',
      hostFile: Number(hostFile) || 25,
    });
    const { page } = boot;
    const cdp = await page.createCDPSession();
    const browserCdp = await browser.target().createCDPSession();
    await cdp.send('HeapProfiler.enable').catch(() => {});
    await cdp.send('Runtime.enable').catch(() => {});
    await cdp.send('Performance.enable').catch(() => {});

    report.samples.push(await sample('baseline', { page, cdp, browser, browserCdp, settleMs }));
    save('baseline');

    for (let i = 1; i <= switches; i++) {
      const target = (i % 2 === 1) ? targetFile : hostFile;
      const op = await switchAllPanels(page, target);
      report.operations.push({ switchNo: i, targetFileId: target, rows: op });
      const s = await sample(`switch-${i}`, { page, cdp, browser, browserCdp, settleMs });
      s.targetFileId = target;
      report.samples.push(s);
      report.summary = summarise(report.samples);
      save(`switch-${i}`);
    }

    report.summary = summarise(report.samples);
    report.verdict = report.summary.verdict;
    report.partial = null;
    save(null);
    await browserCdp.detach().catch(() => {});
    await cdp.detach().catch(() => {});
    await boot.close();
  } catch (error) {
    report.error = String(error && error.stack || error);
    report.verdict = 'ERROR';
    process.exitCode = 1;
    save('error');
    log(`ERROR ${report.error}`);
  } finally {
    try { await browser?.close?.(); } catch (_) {}
    try { await srv.close?.(); } catch (_) {}
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      artifact: out,
      verdict: report.verdict,
      error: report.error || null,
      summary: report.summary,
    }, null, 2));
  }
}

await main();
