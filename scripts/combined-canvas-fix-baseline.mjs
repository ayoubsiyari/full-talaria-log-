/**
 * COMBINED-CANVAS-FIX-BASELINE-V1
 *
 * Director: E's two canvas reclaims measured 61.52 MB (indicator layer / pair switch)
 * and 53.72 MB (linked-pane) independently around different events. Do NOT add them —
 * measure both landed, once, on one build.
 *
 * One harness session:
 *   peak  = indicator layers allocated + one linked pane per panel
 *   after = linked panes removed + all panels pair-switched (ind-layer release path)
 *   quote = totalPrivate peak→after on that single pair (forced GC at each sample)
 *
 * Reuses E's harness surface (host.html) and the same operation helpers' shapes from
 * arena-reclaim-measure / ind-layer-arena-measure. Does not invent a third arena tool.
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

function delta(a, b) {
  return (a == null || b == null) ? null : +(Number(b) - Number(a)).toFixed(3);
}

function log(...args) {
  console.error(`[combined-fix ${new Date().toISOString()}]`, ...args);
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
    nodes: get('Nodes'),
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
    }));
    const gpuPrivateMB = +processes.filter((p) => /gpu/i.test(p.type))
      .reduce((s, p) => s + (Number(p.privateMB) || 0), 0).toFixed(3);
    const rendererPrivateMB = +processes.filter((p) => /renderer/i.test(p.type))
      .reduce((s, p) => s + (Number(p.privateMB) || 0), 0).toFixed(3);
    const totalPrivateMB = +processes.reduce((s, p) => s + (Number(p.privateMB) || 0), 0).toFixed(3);
    return { processes, gpuPrivateMB, rendererPrivateMB, totalPrivateMB };
  } finally {
    await bcdp.detach().catch(() => {});
  }
}

async function countState(page) {
  const frames = chartFrames(page);
  const rows = [];
  for (const frame of frames) {
    rows.push(await frame.evaluate(() => {
      const ch = window.chart;
      const canvases = [...document.querySelectorAll('canvas')];
      const linked = canvases.filter((c) => /^linkedPane_/.test(c.id || ''));
      const backing = (c) => ((c.width || 0) * (c.height || 0) * 4) / 1048576;
      return {
        hasIndLayer: !!ch?._indLayerCanvas,
        indBackingMB: ch?._indLayerCanvas ? +backing(ch._indLayerCanvas).toFixed(3) : 0,
        linkedPaneCount: Array.isArray(ch?.compareOverlay?.linkedPanes) ? ch.compareOverlay.linkedPanes.length : 0,
        linkedPaneCanvasCount: linked.length,
        linkedBackingMB: +linked.reduce((s, c) => s + backing(c), 0).toFixed(3),
        canvasCount: canvases.length,
        canvasBackingMB: +canvases.reduce((s, c) => s + backing(c), 0).toFixed(3),
      };
    }).catch((e) => ({ error: String(e?.message || e) })));
  }
  const sum = (k) => +rows.reduce((s, r) => s + (Number(r[k]) || 0), 0).toFixed(3);
  return {
    perFrame: rows,
    indLayerCount: rows.filter((r) => r.hasIndLayer).length,
    indLayerBackingMB: sum('indBackingMB'),
    linkedPaneCount: sum('linkedPaneCount'),
    linkedPaneCanvasCount: sum('linkedPaneCanvasCount'),
    linkedBackingMB: sum('linkedBackingMB'),
    canvasCount: sum('canvasCount'),
    canvasBackingMB: sum('canvasBackingMB'),
  };
}

async function sample(label, { page, cdp, browser, browserCdp }) {
  await collectGarbage(page, cdp);
  const [perf, process, state] = await Promise.all([
    readPerf(cdp),
    readProcesses(browser),
    countState(page),
  ]);
  const detailMap = await collectAllocatorDetail(browserCdp, { settleMs: 1500 }).catch(() => null);
  const heaviest = detailMap ? pickHeaviestDetail(detailMap) : null;
  return {
    label,
    at: new Date().toISOString(),
    perf,
    process: {
      totalPrivateMB: process.totalPrivateMB,
      rendererPrivateMB: process.rendererPrivateMB,
      gpuPrivateMB: process.gpuPrivateMB,
    },
    state,
    allocatorDetail: heaviest ? { pid: heaviest.pid, detail: heaviest.detail } : null,
  };
}

async function ensureCompareOverlay(page) {
  const rows = [];
  for (const frame of chartFrames(page)) {
    rows.push(await frame.evaluate(async () => {
      const chart = window.chart;
      if (!chart) return { ok: false, reason: 'no chart' };
      if (chart.compareOverlay?.renderLinkedPanes) return { ok: true, alreadyPresent: true };
      if (typeof window.CompareOverlay !== 'function') {
        try {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = '/chart/modules/compare-overlay.js';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('load failed'));
            document.head.appendChild(s);
          });
        } catch (e) {
          return { ok: false, reason: String(e?.message || e) };
        }
      }
      if (typeof window.CompareOverlay !== 'function') return { ok: false, reason: 'CompareOverlay undefined' };
      try { chart.compareOverlay = new window.CompareOverlay(chart); } catch (e) {
        return { ok: false, reason: String(e?.message || e) };
      }
      return { ok: !!(chart.compareOverlay?.renderLinkedPanes) };
    }).catch((e) => ({ ok: false, reason: String(e?.message || e) })));
  }
  return rows;
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
        backingMB: ch._indLayerCanvas
          ? +((ch._indLayerCanvas.width * ch._indLayerCanvas.height * 4) / 1048576).toFixed(3)
          : 0,
      };
    }).catch((e) => ({ ok: false, reason: String(e?.message || e) })));
  }
  return rows;
}

async function addLinkedPanes(page) {
  const frames = chartFrames(page);
  const rows = [];
  for (let i = 0; i < frames.length; i++) {
    rows.push(await frames[i].evaluate((panelIndex) => {
      const chart = window.chart;
      const overlay = chart && chart.compareOverlay;
      if (!overlay?.renderLinkedPanes) return { ok: false, reason: 'missing renderLinkedPanes' };
      overlay.linkedPanes = [];
      overlay.setupLinkedPanesContainer();
      const src = Array.isArray(chart.data) && chart.data.length ? chart.data : [];
      const data = src.slice(-600).map((bar, idx) => ({
        t: bar.t || bar.time || idx,
        o: Number(bar.o ?? bar.open ?? 1) + panelIndex * 0.01,
        h: Number(bar.h ?? bar.high ?? 1.001) + panelIndex * 0.01,
        l: Number(bar.l ?? bar.low ?? 0.999) + panelIndex * 0.01,
        c: Number(bar.c ?? bar.close ?? 1) + panelIndex * 0.01,
        v: Number(bar.v ?? bar.volume ?? 100),
      }));
      const pane = {
        id: Date.now() + panelIndex,
        fileId: 9000 + panelIndex,
        symbol: `COMB${panelIndex}`,
        color: overlay.colors[panelIndex % overlay.colors.length],
        rawData: data,
        rawFetchTf: chart.currentTimeframe || '1m',
        nativeBarMs: 60000,
        data,
        visible: true,
        height: '50%',
        yMin: Math.min(...data.map((b) => b.l)),
        yMax: Math.max(...data.map((b) => b.h)),
        priceZoom: 1,
        priceOffset: 0,
        autoScale: true,
        displayType: 'candles',
        upColor: '#089981',
        downColor: '#f23645',
        showBody: true,
        showBorder: true,
        showWick: true,
        showPriceLine: true,
      };
      overlay.linkedPanes.push(pane);
      overlay.renderLinkedPanes();
      return {
        ok: true,
        linkedPaneCount: overlay.linkedPanes.length,
        linkedPaneCanvasCount: document.querySelectorAll('canvas[id^="linkedPane_"]').length,
      };
    }, i).catch((e) => ({ ok: false, reason: String(e?.message || e) })));
  }
  await sleep(1000);
  return rows;
}

async function removeLinkedPanes(page) {
  const rows = [];
  for (const frame of chartFrames(page)) {
    rows.push(await frame.evaluate(() => {
      const overlay = window.chart && window.chart.compareOverlay;
      if (!overlay?.removeLinkedPane) return { ok: false, reason: 'missing removeLinkedPane' };
      const panes = Array.isArray(overlay.linkedPanes) ? overlay.linkedPanes.slice() : [];
      for (const pane of panes) overlay.removeLinkedPane(pane.id);
      return {
        ok: true,
        removed: panes.length,
        linkedPaneCount: overlay.linkedPanes.length,
        linkedPaneCanvasCount: document.querySelectorAll('canvas[id^="linkedPane_"]').length,
      };
    }).catch((e) => ({ ok: false, reason: String(e?.message || e) })));
  }
  await sleep(1000);
  return rows;
}

async function installNoReleaseControl(page) {
  const rows = [];
  for (const frame of chartFrames(page)) {
    rows.push(await frame.evaluate(() => {
      const ch = window.chart;
      const overlay = ch && ch.compareOverlay;
      const row = {
        ok: true,
        indicatorHookPatched: false,
        linkedHookPatched: false,
        reason: null,
      };
      if (!ch) {
        row.ok = false;
        row.reason = 'no chart';
        return row;
      }

      // Control arm: execute the same user-visible operations, but remove the
      // release behavior so peak->after drift is not credited to the fixes.
      ch._releaseIndicatorLayerCanvas = function _combinedFixControlNoReleaseIndicatorLayer() {
        this._indLayerCacheKey = null;
      };
      row.indicatorHookPatched = true;

      if (!overlay || typeof overlay._releaseLinkedPaneResources !== 'function') {
        row.ok = false;
        row.reason = 'missing linked-pane release hook';
        return row;
      }
      overlay._releaseLinkedPaneResources = function _combinedFixControlNoReleaseLinkedPane(paneId) {
        const wrapper = document.getElementById(`linkedPaneWrapper_${paneId}`);
        if (wrapper) wrapper.remove();
        if (!Array.isArray(this.linkedPanes) || this.linkedPanes.length === 0) {
          const containerId = `linkedPanesContainer_${this.scopeKey}`;
          const container = document.getElementById(containerId);
          if (container) container.remove();
        }
      };
      row.linkedHookPatched = true;
      return row;
    }).catch((e) => ({ ok: false, reason: String(e?.message || e) })));
  }
  return rows;
}

async function switchAllPanels(page, targetFileId) {
  const rows = [];
  for (const frame of chartFrames(page)) {
    rows.push(await frame.evaluate(async (fid) => {
      const ch = window.chart;
      if (!ch?.loadFileData) return { ok: false, reason: 'missing loadFileData' };
      const beforeLayer = !!ch._indLayerCanvas;
      await ch.loadFileData(String(fid));
      await new Promise((r) => setTimeout(r, 800));
      return {
        ok: true,
        before: ch.currentFileId != null ? String(ch.currentFileId) : null,
        after: ch.currentFileId != null ? String(ch.currentFileId) : null,
        beforeLayer,
        afterLayer: !!ch._indLayerCanvas,
      };
    }, targetFileId).catch((e) => ({ ok: false, reason: String(e?.message || e) })));
  }
  return rows;
}

async function main() {
  const out = path.resolve(argOf('out', path.join(__dirname, '..', '_evidence', 'manager-C', `combined-canvas-fix-${Date.now()}.json`)));
  const hostFile = argOf('host-file', '25');
  const targetFileId = argOf('target-file', '27');
  const arm = String(argOf('arm', 'release')).toLowerCase();
  const peakSettleMs = Number(argOf('peak-settle-ms', '3000'));
  const afterSettleMs = Number(argOf('after-settle-ms', '5000'));
  if (!['release', 'no-release-control'].includes(arm)) {
    throw new Error('--arm must be release or no-release-control');
  }
  const report = {
    signature: 'COMBINED-CANVAS-FIX-BASELINE-V2',
    at: new Date().toISOString(),
    question: arm === 'release'
      ? 'What is the combined reclaim of indicator-layer + linked-pane fixes, measured once on one build?'
      : 'What is the same-session same-duration drift when both release hooks are disabled?',
    method: {
      surface: 'E harness host.html, four panels, forced GC at each sample',
      peak: 'allocate indicator layers + one linked pane per panel',
      after: arm === 'release'
        ? 'remove linked panes + pair-switch all panels (release hooks active)'
        : 'remove linked panes + pair-switch all panels after runtime patching both release hooks to no-release controls',
      settle: { peakSettleMs, afterSettleMs },
      forbidden: 'Do not add 61.52 + 53.72. Quote only this artifact\'s peak→after totalPrivate.',
      priorIndependent: { indicatorLayerTotalPrivateMB: 61.52, linkedPaneTotalPrivateMB: 53.72 },
    },
    inputs: { hostFile, targetFileId, panels: 4, arm, peakSettleMs, afterSettleMs },
    operations: {},
    samples: {},
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
    log(`browser ${report.browser.version}`);

    const boot = await bootLayout(browser, srv, {
      pair: 'same', panels: 4, tf: '1m', hostFile: Number(hostFile) || 25,
    });
    const { page } = boot;
    const cdp = await page.createCDPSession();
    const browserCdp = await browser.target().createCDPSession();
    await cdp.send('HeapProfiler.enable').catch(() => {});
    await cdp.send('Runtime.enable').catch(() => {});
    await cdp.send('Performance.enable').catch(() => {});
    await sleep(1000);

    report.samples.before = await sample('before', { page, cdp, browser, browserCdp });
    save('before');

    report.operations.ensureCompareOverlay = await ensureCompareOverlay(page);
    report.operations.allocateIndicatorLayers = await allocateIndicatorLayers(page);
    report.operations.addLinkedPanes = await addLinkedPanes(page);
    // Settle so GPU/compositor catch the peak before the forced-GC sample.
    await sleep(peakSettleMs);
    report.samples.peak = await sample('peak', { page, cdp, browser, browserCdp });
    save('peak');
    log(`peak totalPrivate=${report.samples.peak.process.totalPrivateMB}`);

    if (arm === 'no-release-control') {
      report.operations.installNoReleaseControl = await installNoReleaseControl(page);
      save('control-installed');
    }
    report.operations.removeLinkedPanes = await removeLinkedPanes(page);
    report.operations.switchAllPanels = await switchAllPanels(page, targetFileId);
    // Pair-switch load allocates; wait for release paths + GC to win before measuring after.
    await sleep(afterSettleMs);
    report.samples.after = await sample('after', { page, cdp, browser, browserCdp });
    save('after');

    const peak = report.samples.peak;
    const after = report.samples.after;
    const before = report.samples.before;
    report.summary = {
      // The quotable combined number:
      totalPrivatePeakMB: peak.process.totalPrivateMB,
      totalPrivateAfterMB: after.process.totalPrivateMB,
      totalPrivateReclaimedMB: delta(after.process.totalPrivateMB, peak.process.totalPrivateMB) != null
        ? +(-delta(after.process.totalPrivateMB, peak.process.totalPrivateMB)).toFixed(3)
        : null,
      // Same form as E's independent quotes, for composition check only:
      gpuPrivateReclaimedMB: delta(after.process.gpuPrivateMB, peak.process.gpuPrivateMB) != null
        ? +(-delta(after.process.gpuPrivateMB, peak.process.gpuPrivateMB)).toFixed(3)
        : null,
      rendererPrivateReclaimedMB: delta(after.process.rendererPrivateMB, peak.process.rendererPrivateMB) != null
        ? +(-delta(after.process.rendererPrivateMB, peak.process.rendererPrivateMB)).toFixed(3)
        : null,
      residualVsBeforeTotalPrivateMB: delta(before.process.totalPrivateMB, after.process.totalPrivateMB),
      indLayerCountPeak: peak.state.indLayerCount,
      indLayerCountAfter: after.state.indLayerCount,
      linkedPaneCanvasPeak: peak.state.linkedPaneCanvasCount,
      linkedPaneCanvasAfter: after.state.linkedPaneCanvasCount,
      allocatorRootDeltas: peak.allocatorDetail && after.allocatorDetail
        ? diffAllocatorDetail(peak.allocatorDetail.detail, after.allocatorDetail.detail).rootDeltas
        : null,
      independentSumWouldHaveBeenMB: +(61.52 + 53.72).toFixed(2),
      doNotQuoteIndependentSum: true,
      arm,
      form: arm === 'release'
        ? 'ONE session, BOTH fixes landed, peak→after totalPrivate after forced GC. Not 61.52+53.72.'
        : 'ONE session, SAME operations/duration, both release hooks runtime-disabled before after sample. This is drift/control, not fix reclaim.',
    };
    // Fix reclaim sign: peak - after = reclaimed (positive when memory fell)
    report.summary.totalPrivateReclaimedMB = (peak.process.totalPrivateMB != null && after.process.totalPrivateMB != null)
      ? +(peak.process.totalPrivateMB - after.process.totalPrivateMB).toFixed(3)
      : null;
    report.summary.gpuPrivateReclaimedMB = (peak.process.gpuPrivateMB != null && after.process.gpuPrivateMB != null)
      ? +(peak.process.gpuPrivateMB - after.process.gpuPrivateMB).toFixed(3)
      : null;
    report.summary.rendererPrivateReclaimedMB = (peak.process.rendererPrivateMB != null && after.process.rendererPrivateMB != null)
      ? +(peak.process.rendererPrivateMB - after.process.rendererPrivateMB).toFixed(3)
      : null;

    report.verdict = report.summary.totalPrivateReclaimedMB != null ? 'MEASURED' : 'VOID';
    report.partial = null;
    save(null);
    log(`COMBINED reclaim totalPrivate=${report.summary.totalPrivateReclaimedMB} MB `
      + `(independent sum would have been ${report.summary.independentSumWouldHaveBeenMB} — NOT quoted)`);

    await browserCdp.detach().catch(() => {});
    await cdp.detach().catch(() => {});
    await boot.close();
  } catch (error) {
    report.error = String(error && error.stack || error);
    report.verdict = 'ERROR';
    process.exitCode = 1;
    log(`ERROR ${report.error}`);
    save('error');
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
