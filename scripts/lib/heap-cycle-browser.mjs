/**
 * Live browser driver for HEAP-CYCLE-MEMORY-V1.
 * Uses harness puppeteer + CDP HeapProfiler for forced GC, usedJSHeapSize,
 * and Detached <div> counts from takeHeapSnapshot.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer as startHarnessServer } from '../../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import { countDetachedDivsFromHeapSnapshot } from './heap-snapshot-detached.mjs';
import {
  HEAP_CYCLE_COUNT,
  HEAP_CYCLE_DISTINCT_FILE_IDS,
  HEAP_CYCLE_PANEL_IDS,
  HEAP_CYCLE_SIGNATURE,
} from './heap-cycle-memory.mjs';
import {
  HEAP_FOOTPRINT_NON_GRADING,
  HEAP_METRIC_USED_JS_HEAP_SIZE,
} from './heap-memory-instrument.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_PKG = path.resolve(
  __dirname,
  '../../chart v 1.4/chart/multichart-prod/harness/package.json',
);
const require = createRequire(HARNESS_PKG);

const PANEL_PEER_IDS = HEAP_CYCLE_PANEL_IDS.filter((id) => id !== 'A');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadPuppeteer() {
  try {
    return require('puppeteer');
  } catch (error) {
    throw new Error(`puppeteer unavailable under harness package: ${error?.message || error}`);
  }
}

async function takeHeapSnapshotObject(cdp) {
  let payload = '';
  const onChunk = ({ chunk }) => { payload += chunk; };
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  try {
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  } finally {
    cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
  }
  return JSON.parse(payload);
}

async function sampleHeap(page, cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(200);
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(200);

  const jsHeap = await page.evaluate(() => {
    const mem = performance && performance.memory;
    const gcAvailable = typeof gc === 'function';
    try { if (gcAvailable) gc(); } catch (_) {}
    return {
      exposed: !!(mem && Number.isFinite(mem.usedJSHeapSize)),
      metric: 'usedJSHeapSize',
      usedJSHeapSize: mem ? Number(mem.usedJSHeapSize) || 0 : null,
      totalJSHeapSize: mem ? Number(mem.totalJSHeapSize) || 0 : null,
      jsHeapSizeLimit: mem ? Number(mem.jsHeapSizeLimit) || 0 : null,
      forcedGcAttempted: true,
      forcedGcAvailable: gcAvailable || true, // CDP collectGarbage always attempted
      cdpCollectGarbage: true,
    };
  });

  const snapshot = await takeHeapSnapshotObject(cdp);
  const detached = countDetachedDivsFromHeapSnapshot(snapshot);
  return {
    ...jsHeap,
    metric: HEAP_METRIC_USED_JS_HEAP_SIZE,
    detachedDivCount: detached.detachedDivCount,
    htmlDivElementCount: detached.htmlDivElementCount,
    detachednessField: detached.detachednessField,
    snapshotNodeCount: detached.nodeCount,
  };
}

async function waitForHostReady(page, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ready = await page.evaluate(() => {
      const mgr = window.__harnessManager || window.__multichartManagerRef;
      return !!(window.__harnessHostReady
        && !window.__harnessBootError
        && window.chart
        && Array.isArray(window.chart.data)
        && window.chart.data.length > 0
        && mgr);
    }).catch(() => false);
    if (ready) return;
    await sleep(100);
  }
  throw new Error('timeout waiting for harness host ready');
}

async function collapseToSingle(page) {
  await page.evaluate((peerIds) => {
    const mgr = window.__harnessManager || window.__multichartManagerRef;
    if (!mgr || typeof mgr.removeChart !== 'function') throw new Error('manager missing removeChart');
    for (const id of peerIds) {
      if (mgr.charts && mgr.charts.has(id)) {
        try { mgr.removeChart(id); } catch (_) {}
      }
      try {
        const cell = document.querySelector(`[data-cell="${id}"]`);
        if (cell) cell.remove();
      } catch (_) {}
    }
    const grid = document.getElementById('grid');
    if (grid) {
      grid.style.gridTemplateColumns = 'repeat(1, 1fr)';
      grid.style.gridTemplateRows = 'repeat(1, 1fr)';
    }
  }, PANEL_PEER_IDS);

  const started = Date.now();
  while (Date.now() - started < 30_000) {
    const count = await page.evaluate((peerIds) => {
      const mgr = window.__harnessManager || window.__multichartManagerRef;
      return peerIds.filter((id) => mgr && mgr.charts && mgr.charts.has(id)).length;
    }, PANEL_PEER_IDS);
    if (count === 0) return;
    await sleep(100);
  }
  throw new Error('timeout collapsing to single chart');
}

async function expandDistinct(page, fileIds) {
  await page.evaluate((peerIds, ids) => {
    const mgr = window.__harnessManager || window.__multichartManagerRef;
    if (!mgr || typeof mgr.addChart !== 'function') throw new Error('manager missing addChart');
    const grid = document.getElementById('grid');
    if (grid) {
      grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
      grid.style.gridTemplateRows = 'repeat(2, 1fr)';
    }
    // Host A keeps fileIds[0]; peers B/C/D take the rest.
    const mapping = {
      A: ids[0],
      B: ids[1],
      C: ids[2],
      D: ids[3],
    };
    for (const id of peerIds) {
      if (mgr.charts && mgr.charts.has(id)) continue;
      let cell = document.querySelector(`[data-cell="${id}"]`);
      if (!cell) {
        cell = document.createElement('div');
        cell.className = 'cell';
        cell.setAttribute('data-cell', id);
        grid.appendChild(cell);
      }
      mgr.addChart({ id, tf: '1m', fileId: mapping[id] }, cell);
    }
    // Best-effort: retarget host chart fileId when API exists.
    try {
      if (window.chart && mapping.A != null && Number(window.chart.fileId) !== Number(mapping.A)) {
        if (typeof window.chart.setFileId === 'function') window.chart.setFileId(mapping.A);
        else window.chart.fileId = mapping.A;
      }
    } catch (_) {}
  }, PANEL_PEER_IDS, fileIds);

  const started = Date.now();
  while (Date.now() - started < 60_000) {
    const ok = await page.evaluate((peerIds) => {
      const mgr = window.__harnessManager || window.__multichartManagerRef;
      if (!mgr || !mgr.charts) return false;
      return peerIds.every((id) => {
        const entry = mgr.charts.get(id);
        try {
          return !!(entry && entry.frame && entry.frame.contentWindow
            && entry.frame.contentWindow.chart
            && Array.isArray(entry.frame.contentWindow.chart.data)
            && entry.frame.contentWindow.chart.data.length > 0);
        } catch (_) {
          return false;
        }
      });
    }, PANEL_PEER_IDS);
    if (ok) return;
    await sleep(150);
  }
  throw new Error('timeout expanding distinct-symbol four-panel layout');
}

export async function runHeapCycleBrowserSession({
  cycles = HEAP_CYCLE_COUNT,
  timeoutMs = 300_000,
  settleMs = 1_500,
} = {}) {
  const puppeteer = await loadPuppeteer();
  const harness = await startHarnessServer(0);
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
    ],
    defaultViewport: { width: 1280, height: 900 },
  });

  const startedAt = new Date().toISOString();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(Math.min(120_000, timeoutMs));
    const url = `${harness.url}/harness/host.html?panels=1&tf=1m&pair=same&hostFile=25`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitForHostReady(page, 60_000);

    const cdp = await page.createCDPSession();
    await cdp.send('HeapProfiler.enable');
    await cdp.send('Performance.enable');

    await sleep(settleMs);
    const baseline = await sampleHeap(page, cdp);
    const cycleRows = [];
    let prevDetached = baseline.detachedDivCount;

    for (let index = 0; index < cycles; index += 1) {
      // Rotate distinct fileId assignment per cycle so each cycle is a fresh distinct set.
      const rotated = [
        HEAP_CYCLE_DISTINCT_FILE_IDS[(index + 0) % 4],
        HEAP_CYCLE_DISTINCT_FILE_IDS[(index + 1) % 4],
        HEAP_CYCLE_DISTINCT_FILE_IDS[(index + 2) % 4],
        HEAP_CYCLE_DISTINCT_FILE_IDS[(index + 3) % 4],
      ];
      await expandDistinct(page, rotated);
      await sleep(settleMs);
      const fourPeak = await sampleHeap(page, cdp);
      await collapseToSingle(page);
      await sleep(settleMs);
      const returnSingle = await sampleHeap(page, cdp);
      const detachedDivDelta = returnSingle.detachedDivCount - prevDetached;
      const prevHtml = index === 0
        ? baseline.htmlDivElementCount
        : cycleRows[index - 1].returnSingle.htmlDivElementCount;
      const retainedHtmlDivDelta = returnSingle.htmlDivElementCount - prevHtml;
      prevDetached = returnSingle.detachedDivCount;
      cycleRows.push({
        index: index + 1,
        fileIds: rotated,
        distinctSymbols: true,
        fourPeak,
        returnSingle,
        detachedDivCount: returnSingle.detachedDivCount,
        detachedDivDelta,
        htmlDivElementCount: returnSingle.htmlDivElementCount,
        retainedHtmlDivDelta,
        fourPeakDetachedDivCount: fourPeak.detachedDivCount,
      });
    }

    return {
      signature: HEAP_CYCLE_SIGNATURE,
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      meta: {
        cycles,
        memoryInstrument: 'usedJSHeapSize+forcedGc',
        footprintNonGrading: HEAP_FOOTPRINT_NON_GRADING,
        detachedGateMandatory: true,
        harnessUrl: url,
      },
      baseline,
      cycles: cycleRows,
    };
  } finally {
    await browser.close().catch(() => {});
    await harness.close().catch(() => {});
  }
}
