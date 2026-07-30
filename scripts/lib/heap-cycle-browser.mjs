/**
 * Live browser driver for HEAP-CYCLE-MEMORY-V1 + HEAP-GROWTH-CENSUS-V1.
 *
 * Default surface: React MultichartGrid / dist-v9 (PO-approved). Thin harness
 * host.html under-reads (~20 MB/cycle vs PO ~50) and is opt-in only.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer as startHarnessServer } from '../../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import fs from 'node:fs';

import {
  installBuiltProductBoot,
  reactPanelLoadFile,
  reactParityUrlWithLayout,
} from '../../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';
import { chartTarget } from '../../chart v 1.4/chart/multichart-prod/harness/interactive-helpers.mjs';
import {
  assessDatasetDistinctness,
  buildDatasetPlan,
  HEAP_CYCLE_DATASET_MODE_DISTINCT,
  HEAP_CYCLE_DISTINCT_TIMEFRAMES,
  summarizeDatasetConfig,
} from './heap-cycle-dataset-config.mjs';
import { countDetachedDivsFromHeapSnapshot } from './heap-snapshot-detached.mjs';
import {
  aggregateHeapSnapshotByConstructor,
  aggregatesToObject,
} from './heap-snapshot-aggregates.mjs';
import {
  assessGrowthCensusCalibration,
  buildGrowthCensus,
  formatGrowthCensusSummary,
  HEAP_GROWTH_CENSUS_SIGNATURE,
} from './heap-growth-census.mjs';
import {
  aggregateRetainerPaths,
  formatRetainerPathsSummary,
  HEAP_RETAINER_DEFAULT_TARGETS,
  HEAP_RETAINER_PATHS_SIGNATURE,
} from './heap-retainer-paths.mjs';
import {
  HEAP_CYCLE_COUNT,
  HEAP_CYCLE_DISTINCT_FILE_IDS,
  HEAP_CYCLE_PANEL_IDS,
  HEAP_CYCLE_SIGNATURE,
  HEAP_INSTRUMENT_SCOPE_MAIN_FRAME,
} from './heap-cycle-memory.mjs';
import {
  HEAP_FOOTPRINT_NON_GRADING,
  HEAP_METRIC_USED_JS_HEAP_SIZE,
} from './heap-memory-instrument.mjs';
import {
  armHeapCyclePoWorkload,
  assessPoHandHeapShape,
} from './heap-cycle-po-workload.mjs';
import {
  installCdpWorkerTargetTracker,
  installWorkerCensusOnPage,
  snapshotCdpWorkerTargets,
  snapshotWorkerCensus,
  summarizeWorkerCycleDeltas,
} from './heap-cycle-worker-census.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_PKG = path.resolve(
  __dirname,
  '../../chart v 1.4/chart/multichart-prod/harness/package.json',
);
const DIST_INDEX = path.resolve(__dirname, '../../chart v 1.4/chart/dist-v9/index.html');
const require = createRequire(HARNESS_PKG);

const PANEL_PEER_IDS = HEAP_CYCLE_PANEL_IDS.filter((id) => id !== 'A');
export const HEAP_CYCLE_SURFACE_DIST_V9 = 'dist-v9';
export const HEAP_CYCLE_SURFACE_THIN_HOST = 'thin-host';
export const HEAP_CYCLE_SURFACE_DEPLOYED = 'deployed';
const DEFAULT_DEPLOYED_ORIGIN = 'http://31.97.192.82:3000';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logHeapCycle(...args) {
  console.error(`[heap-cycle ${new Date().toISOString()}]`, ...args);
}

export async function loadPuppeteer() {
  try {
    return require('puppeteer');
  } catch (error) {
    throw new Error(`puppeteer unavailable under harness package: ${error?.message || error}`);
  }
}

async function takeHeapSnapshotObject(cdp, { timeoutMs = 180_000, dumpPath = null } = {}) {
  // Buffer chunks — string concat hits V8 max string length (~512MB) under PO workload.
  const chunks = [];
  let partialBytes = 0;
  const onChunk = ({ chunk }) => {
    const buf = Buffer.from(chunk);
    chunks.push(buf);
    partialBytes += buf.length;
  };
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  try {
    const take = cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    const timed = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(
        `HeapProfiler.takeHeapSnapshot exceeded ${timeoutMs}ms `
        + `(partialBytes=${partialBytes})`,
      )), timeoutMs);
    });
    await Promise.race([take, timed]);
  } finally {
    cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
  }
  const payload = Buffer.concat(chunks);
  logHeapCycle(`snapshot bytes=${payload.length}`);
  if (dumpPath) {
    // Write the raw buffer: no string is materialized, so this survives snapshots
    // that JSON.parse cannot handle, and allows repeat analysis without re-running.
    fs.writeFileSync(dumpPath, payload);
    logHeapCycle(`snapshot written to ${dumpPath}`);
  }
  // JSON.parse(Buffer) avoids materializing one giant JS string.
  return JSON.parse(payload);
}

async function sampleHeapFloor(page, cdp, {
  label = 'floor',
  /** PO hand samples performance.memory without double+js GC. */
  poHandSample = false,
  /** One CDP collectGarbage (baseline only under PO-hand). */
  softGc = false,
} = {}) {
  let didCdpGc = false;
  if (poHandSample) {
    // Mid-cycle soft GC under-reads vs PO (~7.5); raw hot overshoots (~21).
    // Baseline softGc×1 anchors near PO ~75MB start.
    if (softGc) {
      logHeapCycle(`${label}: usedJSHeapSize (PO-hand soft GC ×1)`);
      await cdp.send('HeapProfiler.collectGarbage');
      await sleep(400);
      didCdpGc = true;
    } else {
      logHeapCycle(`${label}: usedJSHeapSize (PO-hand, no forced GC)`);
      await sleep(500);
    }
  } else {
    logHeapCycle(`${label}: collectGarbage + usedJSHeapSize (no snapshot)`);
    await cdp.send('HeapProfiler.collectGarbage');
    await sleep(200);
    await cdp.send('HeapProfiler.collectGarbage');
    await sleep(200);
    didCdpGc = true;
  }
  const forcePageGc = !poHandSample;
  const jsHeap = await page.evaluate((forceGc) => {
    const mem = performance && performance.memory;
    const gcAvailable = typeof gc === 'function';
    if (forceGc) {
      try { if (gcAvailable) gc(); } catch (_) {}
    }
    return {
      exposed: !!(mem && Number.isFinite(mem.usedJSHeapSize)),
      metric: 'usedJSHeapSize',
      usedJSHeapSize: mem ? Number(mem.usedJSHeapSize) || 0 : null,
      totalJSHeapSize: mem ? Number(mem.totalJSHeapSize) || 0 : null,
      jsHeapSizeLimit: mem ? Number(mem.jsHeapSizeLimit) || 0 : null,
      forcedGcAttempted: forceGc === true,
      forcedGcAvailable: gcAvailable || true,
    };
  }, forcePageGc);
  logHeapCycle(
    `${label}: usedJSHeapSizeMB=${
      jsHeap.usedJSHeapSize != null
        ? (jsHeap.usedJSHeapSize / (1024 * 1024)).toFixed(2)
        : 'n/a'
    }`,
  );
  return {
    ...jsHeap,
    cdpCollectGarbage: didCdpGc,
    metric: HEAP_METRIC_USED_JS_HEAP_SIZE,
    detachedDivCount: null,
    htmlDivElementCount: null,
    detachednessField: null,
    snapshotNodeCount: null,
    constructorAggregates: null,
    constructorAggregateObject: null,
    floorOnly: true,
    poHandSample: poHandSample === true,
    softGc: softGc === true,
  };
}

async function sampleHeap(page, cdp, {
  includeAggregates = true,
  keepSnapshot = false,
  label = 'sample',
  snapshot = true,
  poHandSample = false,
  softGc = false,
  snapshotDumpPath = null,
} = {}) {
  if (snapshot === false) {
    return sampleHeapFloor(page, cdp, { label, poHandSample, softGc });
  }
  logHeapCycle(`${label}: collectGarbage + usedJSHeapSize`);
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
      forcedGcAvailable: gcAvailable || true,
      cdpCollectGarbage: true,
    };
  });
  logHeapCycle(
    `${label}: usedJSHeapSizeMB=${
      jsHeap.usedJSHeapSize != null
        ? (jsHeap.usedJSHeapSize / (1024 * 1024)).toFixed(2)
        : 'n/a'
    }`,
  );

  logHeapCycle(`${label}: takeHeapSnapshot aggregates=${includeAggregates}`);
  const snap = await takeHeapSnapshotObject(cdp, { dumpPath: snapshotDumpPath });
  const detached = countDetachedDivsFromHeapSnapshot(snap);
  const aggregates = includeAggregates
    ? aggregateHeapSnapshotByConstructor(snap)
    : null;
  logHeapCycle(
    `${label}: detachedDiv=${detached.detachedDivCount} `
    + `htmlDiv=${detached.htmlDivElementCount} nodes=${detached.nodeCount}`,
  );
  return {
    ...jsHeap,
    metric: HEAP_METRIC_USED_JS_HEAP_SIZE,
    detachedDivCount: detached.detachedDivCount,
    htmlDivElementCount: detached.htmlDivElementCount,
    detachednessField: detached.detachednessField,
    snapshotNodeCount: detached.nodeCount,
    constructorAggregates: aggregates,
    constructorAggregateObject: aggregates ? aggregatesToObject(aggregates) : null,
    ...(keepSnapshot ? { _snapshot: snap } : {}),
  };
}

function buildRetainerReport(snapshot) {
  if (!snapshot) {
    return {
      signature: HEAP_RETAINER_PATHS_SIGNATURE,
      ok: false,
      error: 'no snapshot for retainer path aggregation',
    };
  }
  try {
    const report = aggregateRetainerPaths(snapshot, {
      constructors: HEAP_RETAINER_DEFAULT_TARGETS.slice(),
      topPaths: 40,
      samplePerCtor: 20_000,
    });
    return {
      ...report,
      ok: true,
      summaryText: formatRetainerPathsSummary(report),
    };
  } catch (error) {
    return {
      signature: HEAP_RETAINER_PATHS_SIGNATURE,
      ok: false,
      error: String(error?.message || error),
    };
  }
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

export async function waitForDistV9SingleReady(page, timeoutMs = 180_000) {
  // Poll evaluate — waitForFunction throws "frame got detached" across layout swaps.
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ready = await page.evaluate(() => (
      !!(window.chart && Array.isArray(window.chart.data) && window.chart.data.length > 200)
    )).catch(() => false);
    if (ready) return;
    await sleep(150);
  }
  throw new Error('timeout waiting for dist-v9 single-chart ready');
}

/** Open Layouts utility (if needed) and click panel-count tile (n, li). */
export async function applyDistV9LayoutViaUi(page, n, li = 0) {
  logHeapCycle(`layout UI → ${n} (li=${li})`);
  const utility = await page.$('[data-v9-utility="layout"]');
  if (!utility) throw new Error('dist-v9: missing [data-v9-utility="layout"]');

  // Utility toggles: only click when Layouts panel is not already open.
  const alreadyOpen = await page.evaluate(
    () => /Layouts/.test(document.body.innerText || ''),
  ).catch(() => false);
  if (!alreadyOpen) {
    await page.evaluate(() => {
      const btn = document.querySelector('[data-v9-utility="layout"]');
      if (!btn) throw new Error('layout utility missing');
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    });
    const openStarted = Date.now();
    while (Date.now() - openStarted < 15_000) {
      const open = await page.evaluate(
        () => /Layouts/.test(document.body.innerText || ''),
      ).catch(() => false);
      if (open) break;
      await sleep(100);
    }
  }

  const clicked = await page.evaluate((panelN, panelLi) => {
    const labels = Array.from(document.querySelectorAll('div')).filter((el) => {
      if (el.childElementCount !== 0) return false;
      if (String(el.textContent || '').trim() !== String(panelN)) return false;
      const next = el.nextElementSibling;
      return !!(next && next.querySelector && next.querySelector('svg'));
    });
    for (const label of labels) {
      const flex = label.nextElementSibling;
      const tile = flex && flex.children ? flex.children[panelLi] : null;
      if (tile) {
        tile.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
        }));
        return { ok: true, tiles: flex.children.length };
      }
    }
    return {
      ok: false,
      reason: `layout tile n=${panelN} li=${panelLi} not found`,
      hasLayouts: /Layouts/.test(document.body.innerText || ''),
    };
  }, n, li);

  if (!clicked?.ok) {
    throw new Error(`dist-v9 layout apply failed: ${clicked?.reason || 'unknown'}`);
  }
  await sleep(500);
}

async function waitForDistV9GridGone(page, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const gone = await page.evaluate(() => !window.__multichartGrid).catch(() => false);
    if (gone) return;
    await sleep(100);
  }
  throw new Error('timeout waiting for MultichartGrid unmount (return-to-single)');
}

async function waitForDistV9FourReady(page, timeoutMs = 120_000) {
  // Poll only — avoid react-parity waitForFunction (frame-detach across layout swaps).
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await page.evaluate(() => {
      if (!window.__multichartGrid) return false;
      const frames = Array.from(document.querySelectorAll('iframe'));
      const ids = new Set();
      for (const el of frames) {
        try {
          const u = new URL(el.src, location.href);
          const pid = u.searchParams.get('panelId');
          if (pid) ids.add(pid);
        } catch (_) {}
      }
      return ids.has('B') && ids.has('C') && ids.has('D');
    }).catch(() => false);
    if (ok) return;
    await sleep(150);
  }
  throw new Error('timeout waiting for MultichartGrid peer iframes B/C/D');
}

async function expandFourPanelsWithRetry(page, {
  attempts = 3,
  recoverPage = null,
} = {}) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const hasLayout = await page.$('[data-v9-utility="layout"]');
      if (!hasLayout && typeof recoverPage === 'function') {
        logHeapCycle('layout utility missing — recovering page');
        await recoverPage();
      }
      await applyDistV9LayoutViaUi(page, 4, 0);
      await waitForDistV9FourReady(page, 120_000);
      return;
    } catch (error) {
      lastError = error;
      logHeapCycle(`expand-4 attempt ${i + 1}/${attempts} failed: ${error?.message || error}`);
      if (/missing \[data-v9-utility="layout"\]/i.test(String(error?.message || error))
        && typeof recoverPage === 'function') {
        try { await recoverPage(); } catch (_) {}
      } else {
        try {
          await applyDistV9LayoutViaUi(page, 1, 0);
          await waitForDistV9GridGone(page, 30_000);
        } catch (_) {}
      }
      await sleep(800);
    }
  }
  throw lastError || new Error('expand-4 failed');
}

function panelTarget(page, panelId) {
  if (panelId === 'A') return page.mainFrame();
  return chartTarget(page, panelId) || null;
}

/** Read what each panel is *actually* holding — never trust the commands. */
async function readPanelDatasets(page, panelIds = HEAP_CYCLE_PANEL_IDS) {
  const rows = [];
  for (const panelId of panelIds) {
    const target = panelTarget(page, panelId);
    if (!target) {
      rows.push({ panelId, fileId: null, timeframe: null, bars: null, reason: 'no frame' });
      continue;
    }
    const row = await target.evaluate(() => {
      const ch = window.chart;
      if (!ch) return { fileId: null, timeframe: null, bars: null, reason: 'no chart' };
      return {
        fileId: ch.currentFileId != null ? String(ch.currentFileId) : null,
        timeframe: ch.currentTimeframe != null ? String(ch.currentTimeframe) : null,
        bars: Array.isArray(ch.data) ? ch.data.length : null,
        rawBars: Array.isArray(ch.rawData) ? ch.rawData.length : null,
      };
    }).catch((error) => ({
      fileId: null, timeframe: null, bars: null, reason: String(error?.message || error),
    }));
    rows.push({ panelId, ...row });
  }
  return rows;
}

async function panelRunCommand(page, panelId, cmd, args) {
  return page.evaluate(async (pid, c, a) => {
    const grid = window.__multichartGrid;
    if (!grid || typeof grid.runCommand !== 'function') return false;
    try {
      await grid.runCommand(c, a, { panelId: pid });
      return true;
    } catch (_) {
      return false;
    }
  }, panelId, cmd, args).catch(() => false);
}

async function applyHostDataset(page, { fileId, timeframe }) {
  return page.evaluate(async (fid, tf) => {
    const ch = window.chart;
    if (!ch) return { loaded: false, tfSet: false };
    let loaded = false;
    if (typeof ch.loadFile === 'function') {
      try { await ch.loadFile(fid); loaded = true; } catch (_) {}
    }
    if (!loaded && typeof ch.setFileId === 'function') {
      try { ch.setFileId(fid); loaded = true; } catch (_) {}
    }
    if (!loaded) { try { ch.currentFileId = fid; } catch (_) {} }
    let tfSet = false;
    if (tf && typeof ch.setTimeframe === 'function' && ch.currentTimeframe !== tf) {
      try { await ch.setTimeframe(tf); tfSet = true; } catch (_) {}
    } else if (tf && ch.currentTimeframe === tf) {
      tfSet = true;
    }
    return { loaded, tfSet };
  }, fileId, timeframe).catch(() => ({ loaded: false, tfSet: false }));
}

/**
 * Drive every panel onto its planned (symbol, timeframe) dataset, then wait for
 * the product to converge and report the datasets it observably holds.
 *
 * Host A is driven first: with Interval sync on, a host timeframe pick fans out
 * to every peer, so the per-panel sets must land after it to survive.
 */
async function applyDatasetPlan(page, plan, { settleMs = 800, timeoutMs = 45_000 } = {}) {
  const hostPlan = plan.panels.find((p) => p.panelId === 'A');
  if (hostPlan) await applyHostDataset(page, hostPlan);

  for (const panel of plan.panels) {
    try {
      await reactPanelLoadFile(page, panel.panelId, panel.fileId);
    } catch (_) { /* peer may still be mounting; convergence wait below decides */ }
    if (panel.panelId !== 'A') {
      await panelRunCommand(page, panel.panelId, 'setTimeframe', { tf: panel.timeframe });
    }
  }

  const deadline = Date.now() + timeoutMs;
  let observed = await readPanelDatasets(page, plan.panels.map((p) => p.panelId));
  let assessment = assessDatasetDistinctness(plan, observed);
  // Converge on the *planned* assignment, not merely on a distinct-enough count:
  // four timeframes of one symbol also counts as four datasets, which would hide
  // a per-panel loadFile that never landed.
  while ((!assessment.ok || assessment.mismatches.length > 0) && Date.now() < deadline) {
    await sleep(500);
    // Re-assert any panel that drifted (late fan-out can steal a timeframe).
    for (const miss of assessment.mismatches) {
      const want = plan.panels.find((p) => p.panelId === miss.panelId);
      if (!want) continue;
      if (String(miss.gotFileId) !== String(want.fileId)) {
        await reactPanelLoadFile(page, want.panelId, want.fileId).catch(() => {});
      }
      if (String(miss.gotTimeframe) !== String(want.timeframe)) {
        if (want.panelId === 'A') await applyHostDataset(page, want);
        else await panelRunCommand(page, want.panelId, 'setTimeframe', { tf: want.timeframe });
      }
    }
    observed = await readPanelDatasets(page, plan.panels.map((p) => p.panelId));
    assessment = assessDatasetDistinctness(plan, observed);
  }

  await sleep(settleMs);
  observed = await readPanelDatasets(page, plan.panels.map((p) => p.panelId));
  assessment = assessDatasetDistinctness(plan, observed);
  logHeapCycle(
    `datasets mode=${plan.mode} observed=${assessment.observedDistinctDatasets}/`
    + `${assessment.expectedDistinctDatasets} `
    + `[${observed.map((r) => `${r.panelId}:${r.fileId}@${r.timeframe}(${r.bars ?? 'n/a'})`).join(' ')}]`,
  );
  return { plan, observed, assessment };
}

// ─── thin-host path (legacy; opt-in) ───────────────────────────────────────

async function collapseToSingleThin(page) {
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

async function expandDistinctThin(page, fileIds) {
  await page.evaluate((peerIds, ids) => {
    const mgr = window.__harnessManager || window.__multichartManagerRef;
    if (!mgr || typeof mgr.addChart !== 'function') throw new Error('manager missing addChart');
    const grid = document.getElementById('grid');
    if (grid) {
      grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
      grid.style.gridTemplateRows = 'repeat(2, 1fr)';
    }
    const mapping = { A: ids[0], B: ids[1], C: ids[2], D: ids[3] };
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

function buildCensusFromSamples(baseline, cycleRows, {
  poWorkloadArmed = false,
  poHandShapeOk = false,
  snapshotPolicy = 'every-return',
} = {}) {
  // Under PO workload, mid-run CDP snapshots ~500MB destabilize Chromium.
  // Floor-primary mode keeps baseline + final aggregates only.
  let snaps;
  if (snapshotPolicy === 'baseline-and-final') {
    const last = cycleRows[cycleRows.length - 1]?.returnSingle?.constructorAggregates;
    snaps = [baseline.constructorAggregates, last];
  } else {
    snaps = [
      baseline.constructorAggregates,
      ...cycleRows.map((row) => row.returnSingle.constructorAggregates),
    ];
  }
  if (snaps.some((s) => !s)) {
    return {
      signature: HEAP_GROWTH_CENSUS_SIGNATURE,
      ok: false,
      error: 'missing constructor aggregates on baseline or return-to-single samples',
      snapshotPolicy,
    };
  }
  const census = buildGrowthCensus(snaps);
  const floors = cycleRows.map((row) => Number(row.returnSingle?.usedJSHeapSize));
  const baselineHeap = Number(baseline.usedJSHeapSize);
  const heapDeltas = floors.map((floor, index) => {
    const prev = index === 0 ? baselineHeap : floors[index - 1];
    if (!Number.isFinite(floor) || !Number.isFinite(prev)) return null;
    return floor - prev;
  });
  const meanHeap = heapDeltas.every((v) => v != null)
    ? heapDeltas.reduce((a, b) => a + b, 0) / heapDeltas.length
    : null;
  const detachedDeltas = cycleRows.map((row) => Number(row.detachedDivDelta));
  const meanDetached = detachedDeltas.every((v) => Number.isFinite(v))
    ? detachedDeltas.reduce((a, b) => a + b, 0) / detachedDeltas.length
    : null;
  const calibration = assessGrowthCensusCalibration(census, {
    meanHeapFloorDeltaBytes: meanHeap,
    meanDetachedDivDelta: meanDetached,
    poWorkloadArmed,
    poHandShapeOk,
  });
  return {
    ...census,
    ok: true,
    calibration,
    summaryText: formatGrowthCensusSummary(census, calibration),
  };
}

async function runDistV9Session({
  cycles,
  timeoutMs,
  settleMs,
  puppeteer,
  datasetMode = HEAP_CYCLE_DATASET_MODE_DISTINCT,
  timeframes = HEAP_CYCLE_DISTINCT_TIMEFRAMES,
}) {
  if (!fs.existsSync(DIST_INDEX)) {
    throw new Error(`dist-v9 missing at ${DIST_INDEX} — run npm run build:live in talaria-design`);
  }

  const harness = await startHarnessServer(0);
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: Math.max(300_000, timeoutMs),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
    ],
    defaultViewport: { width: 1440, height: 960 },
  });

  const startedAt = new Date().toISOString();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(Math.min(180_000, timeoutMs));
    // Required: seeds u1_backtestingSession so mode=backtest loads bars.
    await installBuiltProductBoot(page, {});
    const baseUrl = `${harness.url}/chart/dist-v9/index.html?mode=backtest`;
    const url = reactParityUrlWithLayout(baseUrl, '1');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await waitForDistV9SingleReady(page, 180_000);

    const cdp = await page.createCDPSession();
    await cdp.send('HeapProfiler.enable');
    await cdp.send('Performance.enable');

    const {
      growthCensus,
      retainerPaths,
      baselineOut,
      cycleRows,
      poWorkload,
      poHandShape,
      datasetConfig,
    } = await runMultichartCycles({
      page,
      cdp,
      cycles,
      settleMs,
      // Residue tracks distinct (symbol, timeframe) datasets, not panel count.
      fileIdsForCycle: () => HEAP_CYCLE_DISTINCT_FILE_IDS.slice(0, 4),
      datasetMode,
      timeframes,
      poWorkload: true,
    });

    return {
      signature: HEAP_CYCLE_SIGNATURE,
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      meta: {
        cycles,
        surface: HEAP_CYCLE_SURFACE_DIST_V9,
        memoryInstrument: 'usedJSHeapSize+forcedGc',
        instrumentScope: HEAP_INSTRUMENT_SCOPE_MAIN_FRAME,
        footprintNonGrading: HEAP_FOOTPRINT_NON_GRADING,
        detachedGateMandatory: true,
        growthCensus: true,
        retainerPaths: true,
        poWorkload: true,
        datasetMode: datasetConfig?.mode || datasetMode,
        harnessUrl: url,
      },
      baseline: baselineOut,
      cycles: cycleRows,
      growthCensus,
      retainerPaths,
      poWorkload,
      poHandShape,
      datasetConfig,
    };
  } finally {
    await browser.close().catch(() => {});
    await harness.close().catch(() => {});
  }
}

/**
 * Shared expand/collapse + PO workload + census + retainer aggregation.
 * Used by local dist-v9 and deployed authenticated surfaces.
 *
 * PO calibration requires: 4 panels + indicators + open order + live replay
 * playing each cycle (layout-only cycles under-read ~20× vs PO hand).
 */
async function runMultichartCycles({
  page,
  cdp,
  browser = null,
  cycles,
  settleMs,
  fileIdsForCycle,
  /** Dataset count, not panel count, governs residue — see dataset-config. */
  datasetMode = HEAP_CYCLE_DATASET_MODE_DISTINCT,
  timeframes = HEAP_CYCLE_DISTINCT_TIMEFRAMES,
  poWorkload = true,
  playHoldMs = 6_000,
  replaySpeed = 60,
  recoverPage = null,
  /** Match PO hand: longer soak; baseline soft GC; cycle samples without GC. */
  poHandSample = false,
  /** Take one heap snapshot after the final floor so retainers can be named. */
  finalRetainerSnapshot = false,
  /** Write that raw snapshot here for repeat offline analysis. */
  snapshotOutPath = null,
} = {}) {
  // PO workload: CDP heap snapshots grow past V8's ~512MB string limit and also
  // detach the React shell mid-run. Floor calibration uses usedJSHeapSize only.
  const snapshotPolicy = poWorkload ? 'floor-only' : 'every-return';
  const effectivePlayHold = poHandSample
    ? Math.max(playHoldMs, 20_000)
    : playHoldMs;
  await installWorkerCensusOnPage(page).catch(() => []);
  let cdpWorkerTracker = null;
  try {
    cdpWorkerTracker = await installCdpWorkerTargetTracker(page);
  } catch (error) {
    logHeapCycle(`CDP worker tracker unavailable: ${error?.message || error}`);
  }
  await sleep(settleMs);
  logHeapCycle(
    `baseline sample policy=${snapshotPolicy} poHandSample=${poHandSample} `
    + `playHoldMs=${effectivePlayHold}`,
  );
  const baseline = await sampleHeap(page, cdp, {
    // Naming the growing mass needs a baseline to diff the final snapshot against;
    // the absolute top of a single snapshot is dominated by static script text.
    snapshot: snapshotPolicy !== 'floor-only' || finalRetainerSnapshot,
    poHandSample: snapshotPolicy === 'floor-only' && poHandSample,
    softGc: snapshotPolicy === 'floor-only' && poHandSample,
    label: 'baseline',
  });
  const workerSnapshots = [];
  const pushWorkerSnap = async (label) => {
    await installWorkerCensusOnPage(page).catch(() => []);
    const snap = await snapshotWorkerCensus(page);
    let cdpCount = null;
    let cdpCreatedTotal = null;
    let cdpDestroyedTotal = null;
    let cdpSurviving = null;
    let cdpByUrl = null;
    try {
      const cdpSnap = await snapshotCdpWorkerTargets(browser, cdpWorkerTracker);
      cdpCount = cdpSnap.count;
      cdpCreatedTotal = cdpSnap.createdTotal;
      cdpDestroyedTotal = cdpSnap.destroyedTotal;
      cdpSurviving = cdpSnap.survivingNeverDestroyed;
      cdpByUrl = cdpSnap.createdByUrl || null;
      snap.cdp = cdpSnap;
    } catch (_) {
      cdpCount = null;
    }
    const row = {
      label,
      liveTotal: snap.liveTotal,
      createdTotal: snap.createdTotal,
      terminatedTotal: snap.terminatedTotal,
      surviving: snap.surviving,
      cdpCount,
      cdpCreatedTotal,
      cdpDestroyedTotal,
      cdpSurviving,
      cdpByUrl,
      byScript: snap.byScript,
      perFrame: snap.perFrame,
    };
    workerSnapshots.push(row);
    logHeapCycle(
      `${label}: workers live=${row.liveTotal} created=${row.createdTotal} `
      + `terminated=${row.terminatedTotal} cdpLive=${cdpCount ?? 'n/a'} `
      + `cdpCreated=${cdpCreatedTotal ?? 'n/a'} cdpDestroyed=${cdpDestroyedTotal ?? 'n/a'}`,
    );
    return row;
  };
  await pushWorkerSnap('baseline');
  const cycleRows = [];
  let prevDetached = baseline.detachedDivCount;
  let lastSnapshot = null;
  let finalAggregates = null;
  const workloadArms = [];

  const datasetAssessments = [];
  for (let index = 0; index < cycles; index += 1) {
    const rotated = fileIdsForCycle(index);
    const plan = buildDatasetPlan({
      mode: datasetMode,
      panelIds: HEAP_CYCLE_PANEL_IDS,
      fileIds: rotated,
      timeframes,
    });
    logHeapCycle(
      `cycle ${index + 1}/${cycles}: expand 4-panel mode=${plan.mode} `
      + `datasets=${plan.panels.map((p) => `${p.fileId}@${p.timeframe}`).join(',')}`,
    );
    await expandFourPanelsWithRetry(page, { attempts: 3, recoverPage });
    await installWorkerCensusOnPage(page).catch(() => []);
    logHeapCycle(`cycle ${index + 1}: four panels ready`);
    const datasetConfig = await applyDatasetPlan(page, plan, { settleMs: 800 });
    datasetAssessments.push({ cycle: index + 1, ...datasetConfig.assessment });

    let workload = { armed: false, skipped: !poWorkload };
    if (poWorkload) {
      logHeapCycle(`cycle ${index + 1}: arm PO workload`);
      workload = await armHeapCyclePoWorkload(page, {
        playHoldMs: effectivePlayHold,
        replaySpeed,
        retainIndicators: poHandSample === true,
      });
      workloadArms.push({ cycle: index + 1, ...workload });
      if (!workload.armed) {
        throw new Error(
          `HEAP-CYCLE PO workload not armed on cycle ${index + 1}: `
          + `indicatorsOk=${workload.indicatorsOk} replayOk=${workload.replayOk} `
          + `order=${workload.order?.ok} playing=${workload.observedPlaying} `
          + `(GATE-01: layout-only cycles cannot grade)`,
        );
      }
      logHeapCycle(`cycle ${index + 1}: PO workload armed playing=${workload.observedPlaying}`);
    } else {
      await sleep(settleMs);
    }

    const fourPeak = await sampleHeap(page, cdp, {
      snapshot: false,
      poHandSample,
      softGc: false,
      label: `cycle${index + 1}-fourPeak`,
    });
    const workersAtPeak = await pushWorkerSnap(`cycle${index + 1}-fourPeak`);

    logHeapCycle(`cycle ${index + 1}: collapse to single`);
    try {
      await applyDistV9LayoutViaUi(page, 1, 0);
      await waitForDistV9GridGone(page, 60_000);
    } catch (error) {
      if (typeof recoverPage === 'function') {
        logHeapCycle(`collapse failed (${error?.message || error}); recovering`);
        await recoverPage();
        await installWorkerCensusOnPage(page).catch(() => []);
      } else {
        throw error;
      }
    }
    // PO-hand: short settle, no GC — match DevTools/console read timing.
    await sleep(poHandSample ? Math.min(settleMs, 800) : settleMs);
    const isFinal = index === cycles - 1;
    const takeSnap = snapshotPolicy === 'every-return';
    const returnSingle = await sampleHeap(page, cdp, {
      snapshot: takeSnap,
      keepSnapshot: isFinal && takeSnap,
      poHandSample: !takeSnap && poHandSample,
      softGc: false,
      label: `cycle${index + 1}-returnSingle`,
    });
    const workersAtReturn = await pushWorkerSnap(`cycle${index + 1}-returnSingle`);
    logHeapCycle(
      `cycle ${index + 1}: floorMB=${
        returnSingle.usedJSHeapSize != null
          ? (returnSingle.usedJSHeapSize / (1024 * 1024)).toFixed(2)
          : 'n/a'
      } workersLive=${workersAtReturn.liveTotal}`,
    );
    if (isFinal && returnSingle._snapshot) {
      lastSnapshot = returnSingle._snapshot || null;
      delete returnSingle._snapshot;
    }
    // Floor-only runs skip snapshots because a ~500MB mid-run CDP snapshot
    // destabilizes the React shell. One snapshot *after* the last floor is
    // measured costs nothing that still matters, and it is the only way to name
    // what the distinct-dataset configuration is retaining.
    if (isFinal && !takeSnap && finalRetainerSnapshot) {
      logHeapCycle('final cycle: taking end-of-run snapshot for retainer paths');
      try {
        const retainerSample = await sampleHeap(page, cdp, {
          snapshot: true,
          keepSnapshot: true,
          label: 'final-retainer-snapshot',
          snapshotDumpPath: snapshotOutPath,
        });
        lastSnapshot = retainerSample._snapshot || null;
        finalAggregates = retainerSample.constructorAggregates || null;
        logHeapCycle(`end-of-run snapshot captured: nodes=${lastSnapshot?.nodes?.length ?? 'n/a'}`);
      } catch (error) {
        const message = String(error?.message || error);
        logHeapCycle(`end-of-run snapshot failed: ${message}`);
        if (/string longer than/i.test(message)) {
          // A snapshot serializes to roughly 2.3x usedJSHeapSize, so heaps much
          // over ~220MB exceed V8's max string length when parsed. Growth here is
          // monotonic from cycle 1, so fewer cycles retains the same structure at
          // a parseable size.
          logHeapCycle(
            'snapshot exceeded V8 max string length — rerun with fewer --cycles '
            + 'to keep the heap under ~220MB at snapshot time',
          );
        }
      }
    }

    const detachedDivDelta = (returnSingle.detachedDivCount != null && prevDetached != null)
      ? returnSingle.detachedDivCount - prevDetached
      : null;
    const prevHtml = index === 0
      ? baseline.htmlDivElementCount
      : cycleRows[index - 1].returnSingle.htmlDivElementCount;
    const retainedHtmlDivDelta = (returnSingle.htmlDivElementCount != null && prevHtml != null)
      ? returnSingle.htmlDivElementCount - prevHtml
      : null;
    if (returnSingle.detachedDivCount != null) prevDetached = returnSingle.detachedDivCount;

    const stripMaps = (sample) => {
      if (!sample) return sample;
      const { constructorAggregates, _snapshot, ...rest } = sample;
      return {
        ...rest,
        hasConstructorAggregates: !!constructorAggregates,
      };
    };

    cycleRows.push({
      index: index + 1,
      fileIds: rotated,
      datasetConfig: {
        mode: plan.mode,
        expectedDistinctDatasets: datasetConfig.assessment.expectedDistinctDatasets,
        observedDistinctDatasets: datasetConfig.assessment.observedDistinctDatasets,
        observedDistinctTimeframes: datasetConfig.assessment.observedDistinctTimeframes,
        datasets: datasetConfig.assessment.datasets,
        ok: datasetConfig.assessment.ok,
        panels: datasetConfig.observed,
      },
      poWorkload: {
        armed: workload.armed === true,
        indicatorsOk: workload.indicatorsOk === true,
        orderOk: workload.order?.ok === true,
        observedPlaying: workload.observedPlaying ?? 0,
      },
      fourPeak: stripMaps(fourPeak),
      returnSingle: {
        ...stripMaps(returnSingle),
        constructorAggregates: returnSingle.constructorAggregates,
        constructorAggregateObject: returnSingle.constructorAggregateObject,
      },
      detachedDivCount: returnSingle.detachedDivCount,
      detachedDivDelta,
      htmlDivElementCount: returnSingle.htmlDivElementCount,
      retainedHtmlDivDelta,
      fourPeakDetachedDivCount: fourPeak.detachedDivCount,
      workers: {
        atPeak: {
          live: workersAtPeak.liveTotal,
          created: workersAtPeak.createdTotal,
          terminated: workersAtPeak.terminatedTotal,
          cdp: workersAtPeak.cdpCount,
        },
        atReturn: {
          live: workersAtReturn.liveTotal,
          created: workersAtReturn.createdTotal,
          terminated: workersAtReturn.terminatedTotal,
          cdp: workersAtReturn.cdpCount,
        },
      },
    });
  }

  const floors = cycleRows.map((row) => row.returnSingle?.usedJSHeapSize);
  const poHandShape = assessPoHandHeapShape({
    baselineBytes: baseline.usedJSHeapSize,
    floorBytes: floors,
  });
  const workloadSummary = {
    required: poWorkload === true,
    armedEveryCycle: poWorkload
      ? workloadArms.length === cycles && workloadArms.every((w) => w.armed === true)
      : false,
    arms: workloadArms.map((w) => ({
      cycle: w.cycle,
      armed: w.armed,
      indicatorsOk: w.indicatorsOk,
      orderOk: w.order?.ok,
      observedPlaying: w.observedPlaying,
      panels: w.panels,
    })),
  };
  let growthCensus;
  if (snapshotPolicy === 'floor-only' && baseline.constructorAggregates && finalAggregates) {
    // Floor-only run with an end-of-run snapshot: diff baseline vs final so the
    // per-constructor growth is attributable even though mid-run snapshots are off.
    growthCensus = buildGrowthCensus([baseline.constructorAggregates, finalAggregates]);
    growthCensus.snapshotPolicy = 'baseline-and-final';
    growthCensus.note = 'baseline vs end-of-run snapshot (mid-run snapshots disabled under PO workload)';
  } else if (snapshotPolicy === 'floor-only') {
    growthCensus = {
      signature: HEAP_GROWTH_CENSUS_SIGNATURE,
      ok: false,
      snapshotPolicy,
      error: 'CDP heap snapshots disabled under PO workload (V8 string limit / shell detach); '
        + 'floor calibration uses usedJSHeapSize only',
      monotonicHoarders: [],
      topBySizeDelta: [],
      cycleComparisons: [],
      calibration: (() => {
        const floorsLocal = cycleRows.map((r) => Number(r.returnSingle?.usedJSHeapSize));
        const base = Number(baseline.usedJSHeapSize);
        if (!Number.isFinite(base) || floorsLocal.some((f) => !Number.isFinite(f))) {
          return assessGrowthCensusCalibration(
            { cycleComparisons: [{ rows: [] }] },
            {
              meanHeapFloorDeltaBytes: null,
              maxHeapFloorDeltaBytes: null,
              meanDetachedDivDelta: null,
              poWorkloadArmed: workloadSummary.armedEveryCycle,
              poHandShapeOk: poHandShape.ok === true,
            },
          );
        }
        const deltas = floorsLocal.map((f, i) => f - (i === 0 ? base : floorsLocal[i - 1]));
        return assessGrowthCensusCalibration(
          { cycleComparisons: [{ rows: [] }] },
          {
            meanHeapFloorDeltaBytes: deltas.reduce((a, b) => a + b, 0) / deltas.length,
            maxHeapFloorDeltaBytes: Math.max(...deltas),
            meanDetachedDivDelta: null,
            poWorkloadArmed: workloadSummary.armedEveryCycle,
            poHandShapeOk: poHandShape.ok === true,
          },
        );
      })(),
    };
  } else {
    growthCensus = buildCensusFromSamples(baseline, cycleRows, {
      poWorkloadArmed: workloadSummary.armedEveryCycle,
      poHandShapeOk: poHandShape.ok === true,
      snapshotPolicy,
    });
    if (growthCensus && typeof growthCensus === 'object') {
      growthCensus.snapshotPolicy = snapshotPolicy;
    }
  }
  const retainerPaths = (snapshotPolicy === 'floor-only' && !lastSnapshot)
    ? {
      signature: HEAP_RETAINER_PATHS_SIGNATURE,
      ok: false,
      error: 'retainers skipped under floor-only PO snapshot policy',
    }
    : buildRetainerReport(lastSnapshot);

  const baselineOut = {
    ...baseline,
    constructorAggregates: undefined,
    hasConstructorAggregates: !!baseline.constructorAggregates,
  };
  for (const row of cycleRows) {
    if (row.returnSingle) delete row.returnSingle.constructorAggregates;
  }

  const returnSnaps = workerSnapshots.filter((s) => /returnSingle$|^baseline$/.test(s.label));
  const peakSnaps = workerSnapshots.filter((s) => /fourPeak$|^baseline$/.test(s.label));
  const cdpCreatedSeries = returnSnaps.map((s) => s.cdpCreatedTotal).filter((n) => Number.isFinite(n));
  const cdpCreatedDeltas = [];
  for (let i = 1; i < cdpCreatedSeries.length; i += 1) {
    cdpCreatedDeltas.push(cdpCreatedSeries[i] - cdpCreatedSeries[i - 1]);
  }
  const meanCdpCreatedDelta = cdpCreatedDeltas.length
    ? cdpCreatedDeltas.reduce((a, b) => a + b, 0) / cdpCreatedDeltas.length
    : null;
  const workerCensus = {
    ...summarizeWorkerCycleDeltas(returnSnaps),
    peakDeltas: summarizeWorkerCycleDeltas(peakSnaps),
    cdpCreatedDeltas,
    meanCdpCreatedDeltaPerReturn: meanCdpCreatedDelta,
    plusOneCreatedPerCycle: meanCdpCreatedDelta != null && meanCdpCreatedDelta >= 0.9,
    snapshots: workerSnapshots,
    attribution: {
      script: '/chart/workers/indicator-worker.js',
      createSite: 'chart-indicators-full.js::_getIndicatorWorker (module singleton per JS realm)',
      whySurvives: 'terminate() never called; peer iframe teardown drops the document but '
        + 'CDP cumulative createdTotal grades whether worker targets accumulate across cycles',
    },
    note: 'Workers hold private heaps invisible to main usedJSHeapSize. '
      + 'Grade CDP createdΔ (survives iframe teardown); in-page live counts reset with frames.',
  };
  if (cdpWorkerTracker) {
    await cdpWorkerTracker.dispose().catch(() => {});
  }

  return {
    growthCensus,
    retainerPaths,
    baselineOut,
    cycleRows,
    poWorkload: workloadSummary,
    poHandShape,
    snapshotPolicy,
    workerCensus,
    datasetConfig: summarizeDatasetConfig(datasetAssessments),
  };
}

async function runThinHostSession({
  cycles,
  timeoutMs,
  settleMs,
  puppeteer,
}) {
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
      const rotated = [
        HEAP_CYCLE_DISTINCT_FILE_IDS[(index + 0) % 4],
        HEAP_CYCLE_DISTINCT_FILE_IDS[(index + 1) % 4],
        HEAP_CYCLE_DISTINCT_FILE_IDS[(index + 2) % 4],
        HEAP_CYCLE_DISTINCT_FILE_IDS[(index + 3) % 4],
      ];
      await expandDistinctThin(page, rotated);
      await sleep(settleMs);
      const fourPeak = await sampleHeap(page, cdp, { includeAggregates: false });
      await collapseToSingleThin(page);
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
        fourPeak: { ...fourPeak, constructorAggregates: undefined },
        returnSingle,
        detachedDivCount: returnSingle.detachedDivCount,
        detachedDivDelta,
        htmlDivElementCount: returnSingle.htmlDivElementCount,
        retainedHtmlDivDelta,
        fourPeakDetachedDivCount: fourPeak.detachedDivCount,
      });
    }

    const growthCensus = buildCensusFromSamples(baseline, cycleRows);
    const baselineOut = {
      ...baseline,
      constructorAggregates: undefined,
      hasConstructorAggregates: !!baseline.constructorAggregates,
    };
    for (const row of cycleRows) {
      if (row.returnSingle) delete row.returnSingle.constructorAggregates;
    }

    return {
      signature: HEAP_CYCLE_SIGNATURE,
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      meta: {
        cycles,
        surface: HEAP_CYCLE_SURFACE_THIN_HOST,
        memoryInstrument: 'usedJSHeapSize+forcedGc',
        instrumentScope: HEAP_INSTRUMENT_SCOPE_MAIN_FRAME,
        footprintNonGrading: HEAP_FOOTPRINT_NON_GRADING,
        detachedGateMandatory: true,
        growthCensus: true,
        harnessUrl: url,
      },
      baseline: baselineOut,
      cycles: cycleRows,
      growthCensus,
    };
  } finally {
    await browser.close().catch(() => {});
    await harness.close().catch(() => {});
  }
}

export async function dismissCookieBanner(page) {
  // Deployed login shows a cookie notice that blocks the form until dismissed.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const clicked = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('button, [role="button"]')];
      for (const el of nodes) {
        const t = (el.textContent || '').trim();
        // AR "قبول الكل" / "الضرورية فقط", EN "Accept all" / "Essential only"
        if (/قبول الكل|Accept all|Accept All|الضرورية فقط|Essential only|Necessary only/i.test(t)) {
          el.click();
          return t;
        }
      }
      return null;
    }).catch(() => null);
    if (clicked) {
      await sleep(400);
      return clicked;
    }
    await sleep(300);
  }
  return null;
}

export async function uiLoginDeployed(page, origin, email, password) {
  await page.goto(`${origin}/login/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await dismissCookieBanner(page);
  await page.waitForSelector('#email', { visible: true, timeout: 90_000 });
  await dismissCookieBanner(page);
  await sleep(500);
  await page.click('#email', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('#email', email, { delay: 10 });
  const pwSel = await page.waitForSelector(
    'input[name="password"], input[type="password"], #password',
    { visible: true, timeout: 30_000 },
  );
  await pwSel.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await pwSel.type(password, { delay: 10 });
  const navPromise = page.waitForFunction(
    () => !/\/login\/?/i.test(location.pathname),
    { timeout: 90_000 },
  ).catch(() => null);
  const clicked = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button, [role="button"], input[type="submit"]')];
    for (const el of nodes) {
      const t = (el.textContent || el.value || '').trim().replace(/\s+/g, ' ');
      if (!/sign\s*in|log\s*in|continue/i.test(t)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      el.click();
      return t;
    }
    const form = document.querySelector('form');
    if (form && typeof form.requestSubmit === 'function') {
      form.requestSubmit();
      return 'form.requestSubmit';
    }
    return null;
  });
  if (!clicked) throw new Error('deployed login: Sign In / submit control not found');
  await navPromise;
  const url = page.url();
  if (!url || /\/login\/?/i.test(new URL(url).pathname)) {
    throw new Error('deployed login: stayed on /login — check non-admin QA credentials with Manager B');
  }
  return { url, submit: clicked };
}

/**
 * Pick four files, preferring four *distinct symbols*: four uploads of the same
 * symbol would share the dataset pipeline and reproduce the cheap configuration
 * even with a distinct plan.
 *
 * @returns {{ fileIds: number[], symbols: (string|null)[], distinctSymbols: number }}
 */
async function resolveDeployedFileIds(page, fallback = HEAP_CYCLE_DISTINCT_FILE_IDS) {
  const picked = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/files', { credentials: 'include' });
      if (!res.ok) return null;
      const body = await res.json();
      const list = Array.isArray(body) ? body
        : (Array.isArray(body?.files) ? body.files : []);
      const rows = [];
      for (const row of list) {
        const id = Number(row?.id ?? row?.fileId ?? row?.file_id);
        if (!Number.isFinite(id)) continue;
        const symbol = String(
          row?.symbol ?? row?.pair ?? row?.ticker ?? row?.name ?? row?.filename ?? '',
        ).trim().toUpperCase() || null;
        rows.push({ id, symbol });
      }
      const bySymbol = [];
      const seen = new Set();
      for (const row of rows) {
        const key = row.symbol || `__id${row.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        bySymbol.push(row);
        if (bySymbol.length >= 4) break;
      }
      const out = bySymbol.length >= 4 ? bySymbol : rows.slice(0, 4);
      return out.length >= 4 ? out : null;
    } catch (_) {
      return null;
    }
  }).catch(() => null);

  if (!picked || picked.length < 4) {
    return { fileIds: fallback.slice(0, 4), symbols: [null, null, null, null], distinctSymbols: 0 };
  }
  const symbols = picked.map((r) => r.symbol);
  return {
    fileIds: picked.map((r) => r.id),
    symbols,
    distinctSymbols: new Set(symbols.filter(Boolean)).size,
  };
}

/**
 * Real deployed product on 31.97.192.82 — the surface the PO measured.
 * Requires TEST_EMAIL + TEST_PASSWORD (+ optional TEST_VPS_URL).
 */
/** Kill-switches for B's b85 leak fixes (default ON; set true to disable). */
export const HEAP_CYCLE_B85_FIX_DISABLE_FLAGS = Object.freeze([
  '__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1',
  '__TALARIA_DISABLE_MC_GRID_STATE_PURGE_V1',
  '__TALARIA_DISABLE_MC_BAR_STORE_REALM_V1',
  '__TALARIA_DISABLE_MC_CLEARFILE_ON_REMOVE_V1',
]);

async function installDisableFlags(page, disableFlags = []) {
  const flags = (Array.isArray(disableFlags) ? disableFlags : [])
    .map((f) => String(f || '').trim())
    .filter(Boolean);
  if (!flags.length) return;
  await page.evaluateOnNewDocument((names) => {
    for (const name of names) {
      try { window[name] = true; } catch (_) {}
    }
  }, flags);
}

async function runDeployedSession({
  cycles,
  timeoutMs,
  settleMs,
  puppeteer,
  disableFlags = [],
  /** Default ON for deployed — layout-only / forced-GC under-reads vs PO ~13. */
  poHandSample = true,
  playHoldMs = 6_000,
  datasetMode = HEAP_CYCLE_DATASET_MODE_DISTINCT,
  timeframes = HEAP_CYCLE_DISTINCT_TIMEFRAMES,
  finalRetainerSnapshot = false,
  snapshotOutPath = null,
}) {
  const email = String(process.env.TEST_EMAIL || process.env.L2_M1_TEST_EMAIL || '').trim();
  const password = String(process.env.TEST_PASSWORD || process.env.L2_M1_TEST_PASSWORD || '').trim();
  const origin = String(
    process.env.TEST_VPS_URL
      || process.env.M19_DEPLOYED_ORIGIN
      || DEFAULT_DEPLOYED_ORIGIN,
  ).replace(/\/$/, '');
  if (!email || !password) {
    throw new Error(
      'deployed surface requires TEST_EMAIL and TEST_PASSWORD (non-admin QA). Coordinate with Manager B.',
    );
  }
  if (/^admin@/i.test(email) || email.toLowerCase() === 'admin@talaria.io') {
    throw new Error('deployed surface rejects admin-looking TEST_EMAIL — use dedicated non-admin QA');
  }

  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: Math.max(300_000, timeoutMs),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
    ],
    defaultViewport: { width: 1440, height: 960 },
  });

  const startedAt = new Date().toISOString();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(Math.min(180_000, timeoutMs));
    await page.setCacheEnabled(false);
    await installDisableFlags(page, disableFlags);
    // Wrap Worker before any chart script runs (host + peer iframes).
    await page.evaluateOnNewDocument(() => {
      const key = '__TALARIA_HEAP_CYCLE_WORKER_CENSUS__';
      if (window[key]?.installed) return;
      const Original = window.Worker;
      if (typeof Original !== 'function') return;
      const state = {
        installed: true,
        created: [],
        live: new Set(),
        terminated: 0,
      };
      function WrappedWorker(...args) {
        const scriptUrl = String(args[0] || '');
        const err = new Error('worker-create');
        const stack = String(err.stack || '')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(1, 8);
        const worker = new Original(...args);
        const rec = {
          scriptUrl,
          stack,
          createdAt: Date.now(),
          terminated: false,
        };
        state.created.push(rec);
        state.live.add(worker);
        const origTerm = worker.terminate.bind(worker);
        worker.terminate = function wrappedTerminate(...tArgs) {
          if (!rec.terminated) {
            rec.terminated = true;
            state.terminated += 1;
            state.live.delete(worker);
          }
          return origTerm(...tArgs);
        };
        return worker;
      }
      WrappedWorker.prototype = Original.prototype;
      WrappedWorker.__talariaHeapCycleWrapped = true;
      window.Worker = WrappedWorker;
      window[key] = state;
    });
    const login = await uiLoginDeployed(page, origin, email, password);

    // Seed a backtest session on the real product (same origin as login).
    await page.evaluate(() => {
      try {
        localStorage.setItem('_uid', '1');
        const sid = `deployed-heap-${Date.now()}`;
        const prev = localStorage.getItem('u1_backtestingSession');
        if (!prev) {
          localStorage.setItem('u1_backtestingSession', JSON.stringify({
            type: 'standard',
            startBalance: 10000,
            session_id: sid,
            instruments: { EURUSD: { ticker: 'EURUSD', fileId: 25 } },
          }));
        }
      } catch (_) {}
    });

    const url = reactParityUrlWithLayout(
      `${origin}/chart/dist-v9/index.html?mode=backtest`,
      '1',
    );
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    // Chart shells often bounce unauthenticated users back to /login.
    if (/\/login\/?/i.test(new URL(page.url()).pathname)) {
      await dismissCookieBanner(page);
      await uiLoginDeployed(page, origin, email, password);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    }
    await dismissCookieBanner(page);
    await waitForDistV9SingleReady(page, 180_000);
    // Re-assert kill-switches after navigation (some shells reset globals).
    if (disableFlags?.length) {
      await page.evaluate((names) => {
        for (const name of names) {
          try { window[name] = true; } catch (_) {}
        }
      }, disableFlags);
    }
    const bootMeta = await page.evaluate((names) => {
      const flags = {};
      for (const name of names) flags[name] = window[name] === true;
      return {
        buildId: window.__TALARIA_CHART_BUILD_ID || null,
        flags,
      };
    }, HEAP_CYCLE_B85_FIX_DISABLE_FLAGS).catch(() => ({ buildId: null, flags: {} }));
    const fileChoice = await resolveDeployedFileIds(page);
    const fileIds = fileChoice.fileIds;
    logHeapCycle(
      `deployed files: ids=${fileIds.join(',')} symbols=${
        fileChoice.symbols.map((s) => s || '?').join(',')
      } distinctSymbols=${fileChoice.distinctSymbols}`,
    );

    const cdp = await page.createCDPSession();
    await cdp.send('HeapProfiler.enable');
    await cdp.send('Performance.enable');

    const primaryFileId = fileIds[0];
    const recoverPage = async () => {
      logHeapCycle('recoverPage: reload chart shell');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
      if (/\/login\/?/i.test(new URL(page.url()).pathname)) {
        await uiLoginDeployed(page, origin, email, password);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
      }
      await dismissCookieBanner(page);
      await waitForDistV9SingleReady(page, 180_000);
    };
    const {
      growthCensus,
      retainerPaths,
      baselineOut,
      cycleRows,
      poWorkload,
      poHandShape,
      snapshotPolicy,
      workerCensus,
      datasetConfig,
    } = await runMultichartCycles({
      page,
      cdp,
      browser,
      cycles,
      settleMs,
      // Residue is governed by distinct (symbol, timeframe) dataset count: four
      // identical panels share one pipeline and under-read the PO's session.
      fileIdsForCycle: () => fileIds.slice(0, 4),
      datasetMode,
      timeframes,
      finalRetainerSnapshot,
      snapshotOutPath,
      poWorkload: true,
      playHoldMs: Number.isFinite(playHoldMs) && playHoldMs > 0 ? playHoldMs : 6_000,
      replaySpeed: 60,
      recoverPage,
      poHandSample: poHandSample === true,
    });

    return {
      signature: HEAP_CYCLE_SIGNATURE,
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      meta: {
        cycles,
        surface: HEAP_CYCLE_SURFACE_DEPLOYED,
        deployedOrigin: origin,
        loginUrl: login.url,
        fileIds,
        fileSymbols: fileChoice.symbols,
        distinctSymbolsAvailable: fileChoice.distinctSymbols,
        primaryFileId,
        buildId: bootMeta.buildId,
        flagProbe: bootMeta.flags,
        memoryInstrument: poHandSample
          ? 'usedJSHeapSize+poHand(baselineSoftGc+hotCycles)'
          : 'usedJSHeapSize+forcedGc',
        instrumentScope: HEAP_INSTRUMENT_SCOPE_MAIN_FRAME,
        footprintNonGrading: HEAP_FOOTPRINT_NON_GRADING,
        detachedGateMandatory: true,
        growthCensus: true,
        retainerPaths: true,
        poWorkload: true,
        poHandSample: poHandSample === true,
        playHoldMs: Number.isFinite(playHoldMs) && playHoldMs > 0 ? playHoldMs : 6_000,
        snapshotPolicy,
        harnessUrl: url,
        disableFlags: (disableFlags || []).slice(),
        workerCensus: true,
        datasetMode: datasetConfig?.mode || datasetMode,
        distinctDatasets: datasetConfig?.minObservedDistinctDatasets ?? null,
        note: 'Deployed auth + PO workload (4 panels, indicators, order, live replay ×6). '
          + (poHandSample
            ? 'PO-hand default: baseline soft GC×1, hot cycle floors, ≥20s play, retain indicators, Worker census.'
            : 'Snapshot policy floor-only under PO workload (CDP snaps destabilize shell).'),
      },
      baseline: baselineOut,
      cycles: cycleRows,
      growthCensus,
      retainerPaths,
      poWorkload,
      poHandShape,
      workerCensus,
      datasetConfig,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function runHeapCycleBrowserSession({
  cycles = HEAP_CYCLE_COUNT,
  timeoutMs = 300_000,
  settleMs = 1_500,
  surface = HEAP_CYCLE_SURFACE_DIST_V9,
  disableFlags = [],
  poHandSample = null,
  playHoldMs = null,
  datasetMode = HEAP_CYCLE_DATASET_MODE_DISTINCT,
  timeframes = HEAP_CYCLE_DISTINCT_TIMEFRAMES,
  finalRetainerSnapshot = false,
  snapshotOutPath = null,
} = {}) {
  const puppeteer = await loadPuppeteer();
  if (surface === HEAP_CYCLE_SURFACE_THIN_HOST) {
    return runThinHostSession({ cycles, timeoutMs, settleMs, puppeteer });
  }
  if (surface === HEAP_CYCLE_SURFACE_DEPLOYED) {
    return runDeployedSession({
      cycles,
      timeoutMs,
      settleMs,
      puppeteer,
      disableFlags,
      // Deployed defaults to PO-hand; explicit false opts out.
      poHandSample: poHandSample === null ? true : poHandSample === true,
      playHoldMs: Number.isFinite(playHoldMs) && playHoldMs > 0 ? playHoldMs : 6_000,
      datasetMode,
      timeframes,
      finalRetainerSnapshot,
      snapshotOutPath,
    });
  }
  return runDistV9Session({ cycles, timeoutMs, settleMs, puppeteer, datasetMode, timeframes });
}
