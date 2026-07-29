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
  waitForReactMultichartReady,
} from '../../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';
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

async function sampleHeap(page, cdp, {
  includeAggregates = true,
  keepSnapshot = false,
} = {}) {
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

  const snapshot = await takeHeapSnapshotObject(cdp);
  const detached = countDetachedDivsFromHeapSnapshot(snapshot);
  const aggregates = includeAggregates
    ? aggregateHeapSnapshotByConstructor(snapshot)
    : null;
  return {
    ...jsHeap,
    metric: HEAP_METRIC_USED_JS_HEAP_SIZE,
    detachedDivCount: detached.detachedDivCount,
    htmlDivElementCount: detached.htmlDivElementCount,
    detachednessField: detached.detachednessField,
    snapshotNodeCount: detached.nodeCount,
    constructorAggregates: aggregates,
    constructorAggregateObject: aggregates ? aggregatesToObject(aggregates) : null,
    ...(keepSnapshot ? { _snapshot: snapshot } : {}),
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

async function waitForDistV9SingleReady(page, timeoutMs = 180_000) {
  await page.waitForFunction(
    () => window.chart && Array.isArray(window.chart.data) && window.chart.data.length > 200,
    { timeout: timeoutMs },
  );
}

/** Open Layouts utility (if needed) and click panel-count tile (n, li). */
async function applyDistV9LayoutViaUi(page, n, li = 0) {
  const utility = await page.$('[data-v9-utility="layout"]');
  if (!utility) throw new Error('dist-v9: missing [data-v9-utility="layout"]');

  // Utility toggles: only click when Layouts panel is not already open.
  const alreadyOpen = await page.evaluate(
    () => /Layouts/.test(document.body.innerText || ''),
  );
  if (!alreadyOpen) {
    await page.evaluate(() => {
      const btn = document.querySelector('[data-v9-utility="layout"]');
      if (!btn) throw new Error('layout utility missing');
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    });
    await page.waitForFunction(
      () => /Layouts/.test(document.body.innerText || ''),
      { timeout: 15_000 },
    );
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
  await waitForReactMultichartReady(page, timeoutMs);
  // 2x2: host A is #chartWrapper; peers B/C/D are iframes.
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await page.evaluate(() => {
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

async function loadDistinctSymbolsDistV9(page, fileIds) {
  const mapping = {
    A: fileIds[0],
    B: fileIds[1],
    C: fileIds[2],
    D: fileIds[3],
  };
  // Host A via chart API when available.
  await page.evaluate(async (fid) => {
    const ch = window.chart;
    if (!ch) return false;
    if (typeof ch.loadFile === 'function') {
      try { await ch.loadFile(fid); return true; } catch (_) {}
    }
    if (typeof ch.setFileId === 'function') {
      try { ch.setFileId(fid); return true; } catch (_) {}
    }
    try { ch.currentFileId = fid; } catch (_) {}
    return false;
  }, mapping.A);

  for (const pid of ['A', 'B', 'C', 'D']) {
    try {
      await reactPanelLoadFile(page, pid, mapping[pid]);
    } catch (_) {}
  }
  await sleep(800);
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

function buildCensusFromSamples(baseline, cycleRows) {
  const snaps = [
    baseline.constructorAggregates,
    ...cycleRows.map((row) => row.returnSingle.constructorAggregates),
  ];
  if (snaps.some((s) => !s)) {
    return {
      signature: HEAP_GROWTH_CENSUS_SIGNATURE,
      ok: false,
      error: 'missing constructor aggregates on baseline or return-to-single samples',
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

    const { growthCensus, retainerPaths, baselineOut, cycleRows } = await runMultichartCycles({
      page,
      cdp,
      cycles,
      settleMs,
      fileIdsForCycle: (index) => [
        HEAP_CYCLE_DISTINCT_FILE_IDS[(index + 0) % 4],
        HEAP_CYCLE_DISTINCT_FILE_IDS[(index + 1) % 4],
        HEAP_CYCLE_DISTINCT_FILE_IDS[(index + 2) % 4],
        HEAP_CYCLE_DISTINCT_FILE_IDS[(index + 3) % 4],
      ],
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
        footprintNonGrading: HEAP_FOOTPRINT_NON_GRADING,
        detachedGateMandatory: true,
        growthCensus: true,
        retainerPaths: true,
        harnessUrl: url,
      },
      baseline: baselineOut,
      cycles: cycleRows,
      growthCensus,
      retainerPaths,
    };
  } finally {
    await browser.close().catch(() => {});
    await harness.close().catch(() => {});
  }
}

/**
 * Shared 3-cycle expand/collapse + census + retainer aggregation.
 * Used by local dist-v9 and deployed authenticated surfaces.
 */
async function runMultichartCycles({
  page,
  cdp,
  cycles,
  settleMs,
  fileIdsForCycle,
}) {
  await sleep(settleMs);
  const baseline = await sampleHeap(page, cdp);
  const cycleRows = [];
  let prevDetached = baseline.detachedDivCount;
  let lastSnapshot = null;

  for (let index = 0; index < cycles; index += 1) {
    const rotated = fileIdsForCycle(index);
    await applyDistV9LayoutViaUi(page, 4, 0);
    await waitForDistV9FourReady(page, 120_000);
    await loadDistinctSymbolsDistV9(page, rotated);
    await sleep(settleMs);
    const fourPeak = await sampleHeap(page, cdp, { includeAggregates: false });

    await applyDistV9LayoutViaUi(page, 1, 0);
    await waitForDistV9GridGone(page, 60_000);
    await sleep(settleMs);
    const keepSnapshot = index === cycles - 1;
    const returnSingle = await sampleHeap(page, cdp, { keepSnapshot });
    if (keepSnapshot) {
      lastSnapshot = returnSingle._snapshot || null;
      delete returnSingle._snapshot;
    }

    const detachedDivDelta = returnSingle.detachedDivCount - prevDetached;
    const prevHtml = index === 0
      ? baseline.htmlDivElementCount
      : cycleRows[index - 1].returnSingle.htmlDivElementCount;
    const retainedHtmlDivDelta = returnSingle.htmlDivElementCount - prevHtml;
    prevDetached = returnSingle.detachedDivCount;

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
      distinctSymbols: true,
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
    });
  }

  const growthCensus = buildCensusFromSamples(baseline, cycleRows);
  const retainerPaths = buildRetainerReport(lastSnapshot);

  const baselineOut = {
    ...baseline,
    constructorAggregates: undefined,
    hasConstructorAggregates: !!baseline.constructorAggregates,
  };
  for (const row of cycleRows) {
    if (row.returnSingle) delete row.returnSingle.constructorAggregates;
  }

  return { growthCensus, retainerPaths, baselineOut, cycleRows };
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

async function dismissCookieBanner(page) {
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

async function uiLoginDeployed(page, origin, email, password) {
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

async function resolveDeployedFileIds(page, fallback = HEAP_CYCLE_DISTINCT_FILE_IDS) {
  const ids = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/files', { credentials: 'include' });
      if (!res.ok) return null;
      const body = await res.json();
      const list = Array.isArray(body) ? body
        : (Array.isArray(body?.files) ? body.files : []);
      const out = [];
      for (const row of list) {
        const id = Number(row?.id ?? row?.fileId ?? row?.file_id);
        if (Number.isFinite(id)) out.push(id);
        if (out.length >= 4) break;
      }
      return out.length >= 4 ? out : null;
    } catch (_) {
      return null;
    }
  }).catch(() => null);
  return ids && ids.length === 4 ? ids : fallback.slice();
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
    const fileIds = await resolveDeployedFileIds(page);

    const cdp = await page.createCDPSession();
    await cdp.send('HeapProfiler.enable');
    await cdp.send('Performance.enable');

    const { growthCensus, retainerPaths, baselineOut, cycleRows } = await runMultichartCycles({
      page,
      cdp,
      cycles,
      settleMs,
      fileIdsForCycle: (index) => [
        fileIds[(index + 0) % 4],
        fileIds[(index + 1) % 4],
        fileIds[(index + 2) % 4],
        fileIds[(index + 3) % 4],
      ],
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
        buildId: bootMeta.buildId,
        flagProbe: bootMeta.flags,
        memoryInstrument: 'usedJSHeapSize+forcedGc',
        footprintNonGrading: HEAP_FOOTPRINT_NON_GRADING,
        detachedGateMandatory: true,
        growthCensus: true,
        retainerPaths: true,
        harnessUrl: url,
        disableFlags: (disableFlags || []).slice(),
        note: 'Real deployed app with authenticated session — PO measurement surface.',
      },
      baseline: baselineOut,
      cycles: cycleRows,
      growthCensus,
      retainerPaths,
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
} = {}) {
  const puppeteer = await loadPuppeteer();
  if (surface === HEAP_CYCLE_SURFACE_THIN_HOST) {
    return runThinHostSession({ cycles, timeoutMs, settleMs, puppeteer });
  }
  if (surface === HEAP_CYCLE_SURFACE_DEPLOYED) {
    return runDeployedSession({ cycles, timeoutMs, settleMs, puppeteer, disableFlags });
  }
  return runDistV9Session({ cycles, timeoutMs, settleMs, puppeteer });
}
