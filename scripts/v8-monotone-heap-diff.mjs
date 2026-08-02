/**
 * V8-MONOTONE-HEAP-DIFF-30M
 *
 * Same page/renderer, two forced-GC heap snapshots separated by a steady-state
 * wait. Diff by constructor, then summarize retainer paths for the growers.
 */
import fs from 'node:fs';
import path from 'node:path';

import { startServer } from '../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import { embedFrames, sleep } from '../chart v 1.4/chart/multichart-prod/harness/harness-lib.mjs';
import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';
import { aggregateHeapSnapshotByConstructor, compareConstructorAggregates } from './lib/heap-snapshot-aggregates.mjs';
import { aggregateRetainerPaths } from './lib/heap-retainer-paths.mjs';
import { takeEndOfArmSnapshot } from './lib/end-of-arm-snapshot.mjs';

const MB = 1024 * 1024;
const OUT_DIR = arg('outDir', '_evidence/manager-E/v8-monotone-heap-diff-20260802');
const WAIT_MIN = Number(arg('waitMin', '30'));
const SNAP_CAP_MB = Number(arg('snapCapMB', '3072'));
const TOP_N = Number(arg('topN', '25'));

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function log(...args) {
  console.error(`[v8-heap-diff ${new Date().toISOString()}]`, ...args);
}

function mb(bytes) {
  return +(Number(bytes || 0) / MB).toFixed(3);
}

function save(report) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
}

async function forceCollect(page) {
  const cdp = await page.target().createCDPSession();
  try {
    await cdp.send('HeapProfiler.enable').catch(() => {});
    await cdp.send('Runtime.enable').catch(() => {});
    for (let i = 0; i < 3; i += 1) {
      await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
      await cdp.send('Runtime.collectGarbage').catch(() => {});
      await page.evaluate(() => {
        const visit = (w) => { try { if (typeof w.gc === 'function') w.gc(); } catch (_) {} };
        visit(window);
        for (let j = 0; j < window.frames.length; j += 1) {
          try { visit(window.frames[j]); } catch (_) {}
        }
      }).catch(() => {});
      await sleep(500);
    }
    await sleep(1500);
  } finally {
    await cdp.detach().catch(() => {});
  }
}

async function metrics(page, label) {
  const cdp = await page.target().createCDPSession();
  try {
    await cdp.send('Performance.enable').catch(() => {});
    const { metrics: rows } = await cdp.send('Performance.getMetrics');
    const get = (name) => {
      const row = rows.find((m) => m.name === name);
      return row ? Number(row.value) : null;
    };
    return {
      label,
      at: new Date().toISOString(),
      jsHeapUsedMB: mb(get('JSHeapUsedSize')),
      jsHeapTotalMB: mb(get('JSHeapTotalSize')),
      documents: get('Documents'),
      frames: get('Frames'),
      nodes: get('Nodes'),
      jsEventListeners: get('JSEventListeners'),
      detachedDomNodes: get('DetachedDomNodes'),
    };
  } finally {
    await cdp.detach().catch(() => {});
  }
}

async function boot(page, url) {
  await page.goto(`${url}/harness/host.html?pair=same&panels=4&tf=1m&hostFile=25`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  const deadline = Date.now() + 45000;
  let state = null;
  while (Date.now() < deadline) {
    state = {
      hostChart: await page.evaluate(() => !!window.chart).catch(() => false),
      iframeCharts: 0,
      iframeCount: embedFrames(page).length,
      urls: [page.mainFrame(), ...embedFrames(page)].map((f) => f.url()).slice(0, 8),
    };
    for (const f of embedFrames(page)) {
      if (await f.evaluate(() => !!window.chart).catch(() => false)) state.iframeCharts += 1;
    }
    if (state.hostChart && state.iframeCharts >= 3) return state;
    await sleep(250);
  }
  return state;
}

async function startSteadyReplay(page) {
  return page.evaluate(() => {
    const rows = [];
    const visit = (w, realm) => {
      try {
        const chart = w.chart || null;
        const rs = chart?.replaySystem || w.replaySystem || null;
        if (!rs) {
          rows.push({ realm, ok: false, reason: 'missing replaySystem' });
          return;
        }
        if (typeof rs.setSpeed === 'function') {
          try { rs.setSpeed(10); } catch (_) {}
        }
        if (typeof rs.play === 'function') {
          if (!rs.isPlaying) rs.play();
        } else if (typeof rs.togglePlayPause === 'function' && !rs.isPlaying) {
          rs.togglePlayPause();
        }
        rows.push({
          realm,
          ok: true,
          isPlaying: !!rs.isPlaying,
          currentIndex: Number.isFinite(rs.currentIndex) ? rs.currentIndex : null,
          replayTimestamp: Number.isFinite(rs.replayTimestamp) ? rs.replayTimestamp : null,
        });
      } catch (e) {
        rows.push({ realm, ok: false, reason: String(e?.message || e) });
      }
    };
    visit(window, 'host');
    for (let i = 0; i < window.frames.length; i += 1) {
      try { visit(window.frames[i], `frame-${i}`); } catch (e) {
        rows.push({ realm: `frame-${i}`, ok: false, reason: String(e?.message || e) });
      }
    }
    return rows;
  }).catch((e) => [{ ok: false, reason: String(e?.message || e) }]);
}

async function readPlayhead(page) {
  return page.evaluate(() => {
    const rows = [];
    const visit = (w, realm) => {
      try {
        const rs = w.chart?.replaySystem || w.replaySystem || null;
        rows.push({
          realm,
          isPlaying: !!rs?.isPlaying,
          currentIndex: Number.isFinite(rs?.currentIndex) ? rs.currentIndex : null,
          replayTimestamp: Number.isFinite(rs?.replayTimestamp) ? rs.replayTimestamp : null,
          dataLength: Array.isArray(w.chart?.data) ? w.chart.data.length : null,
          rawLength: Array.isArray(w.chart?.rawData) ? w.chart.rawData.length : null,
        });
      } catch (e) {
        rows.push({ realm, error: String(e?.message || e) });
      }
    };
    visit(window, 'host');
    for (let i = 0; i < window.frames.length; i += 1) {
      try { visit(window.frames[i], `frame-${i}`); } catch (_) {}
    }
    return rows;
  }).catch((e) => [{ error: String(e?.message || e) }]);
}

async function waitWithHeartbeats(ms, report) {
  const start = Date.now();
  let next = start + 5 * 60_000;
  while (Date.now() - start < ms) {
    const remaining = ms - (Date.now() - start);
    await sleep(Math.min(30_000, Math.max(0, remaining)));
    if (Date.now() >= next || Date.now() - start >= ms) {
      report.heartbeats.push({
        at: new Date().toISOString(),
        elapsedMin: +((Date.now() - start) / 60_000).toFixed(2),
      });
      save(report);
      log(`heartbeat elapsed=${report.heartbeats.at(-1).elapsedMin}min`);
      next += 5 * 60_000;
    }
  }
}

async function takeMoment(label, page, report) {
  log(`${label}: force collecting`);
  await forceCollect(page);
  const beforeMetrics = await metrics(page, `${label}-post-gc`);
  const playhead = await readPlayhead(page);
  const snapFile = path.join(OUT_DIR, `${label}.heapsnapshot`);
  log(`${label}: snapshot -> ${snapFile}`);
  const snapMeta = await takeEndOfArmSnapshot(page, {
    outFile: snapFile,
    capMB: SNAP_CAP_MB,
    requireFreeMB: SNAP_CAP_MB + 4096,
    timeoutMs: 900_000,
  });
  report.moments[label] = { at: new Date().toISOString(), metrics: beforeMetrics, playhead, snapMeta };
  save(report);
  return report.moments[label];
}

function loadSnapshot(file) {
  return JSON.parse(fs.readFileSync(file));
}

function formatGrowers(rows) {
  return rows.slice(0, TOP_N).map((r) => ({
    constructor: r.constructor,
    countBefore: r.countBefore,
    countAfter: r.countAfter,
    countDelta: r.countDelta,
    sizeBeforeMB: mb(r.sizeBefore),
    sizeAfterMB: mb(r.sizeAfter),
    sizeDeltaMB: mb(r.sizeDelta),
  }));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    signature: 'V8-MONOTONE-HEAP-DIFF-30M',
    startedAt: new Date().toISOString(),
    condition: {
      surface: 'thin-host four-panel harness',
      hostFile: 25,
      pairSwitches: 0,
      waitMin: WAIT_MIN,
      snapshotCapMB: SNAP_CAP_MB,
      topN: TOP_N,
      note: 'Two snapshots are captured from one persistent page target after forced collection. This is a V8 attribution run, not a soak verdict.',
    },
    moments: {},
    heartbeats: [],
  };
  save(report);

  let srv;
  let browser;
  try {
    srv = await startServer(0);
    const puppeteer = await loadPuppeteer();
    browser = await puppeteer.launch({
      headless: true,
      protocolTimeout: 1_200_000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--enable-precise-memory-info',
        '--js-flags=--expose-gc',
      ],
      defaultViewport: { width: 1440, height: 960 },
    });
    const page = await browser.newPage();
    report.boot = await boot(page, srv.url);
    report.replayStart = await startSteadyReplay(page);
    report.preAPlayhead = await readPlayhead(page);
    save(report);

    const a = await takeMoment('A', page, report);
    if (!a.snapMeta?.ok) throw new Error(`A snapshot failed: ${a.snapMeta?.failedWhy || a.snapMeta?.skippedWhy || 'unknown'}`);

    report.replayResumeAfterA = await startSteadyReplay(page);
    save(report);
    log(`waiting ${WAIT_MIN} minutes before B`);
    await waitWithHeartbeats(WAIT_MIN * 60_000, report);

    const b = await takeMoment('B', page, report);
    if (!b.snapMeta?.ok) throw new Error(`B snapshot failed: ${b.snapMeta?.failedWhy || b.snapMeta?.skippedWhy || 'unknown'}`);

    log('parsing snapshots and diffing constructors');
    const snapA = loadSnapshot(a.snapMeta.file);
    const aggA = aggregateHeapSnapshotByConstructor(snapA);
    const snapB = loadSnapshot(b.snapMeta.file);
    const aggB = aggregateHeapSnapshotByConstructor(snapB);
    const rows = compareConstructorAggregates(aggA, aggB)
      .filter((r) => r.sizeDelta !== 0 || r.countDelta !== 0)
      .sort((x, y) => y.sizeDelta - x.sizeDelta || y.countDelta - x.countDelta);
    report.constructorGrowth = {
      totalPositiveSizeDeltaMB: mb(rows.filter((r) => r.sizeDelta > 0).reduce((s, r) => s + r.sizeDelta, 0)),
      totalNetSizeDeltaMB: mb(rows.reduce((s, r) => s + r.sizeDelta, 0)),
      topGrowers: formatGrowers(rows.filter((r) => r.sizeDelta > 0)),
      topShrinking: formatGrowers(rows.slice().sort((x, y) => x.sizeDelta - y.sizeDelta).filter((r) => r.sizeDelta < 0)),
    };
    const targets = report.constructorGrowth.topGrowers.slice(0, Math.min(8, TOP_N)).map((r) => r.constructor);
    log(`retainers for ${targets.join(', ')}`);
    report.retainerPaths = aggregateRetainerPaths(snapB, {
      constructors: targets,
      topPaths: 12,
      maxDepth: 16,
      samplePerCtor: 3000,
    });
    report.verdict = 'CAPTURED';
    save(report);
    log(`artifact -> ${path.join(OUT_DIR, 'report.json')}`);
  } catch (e) {
    report.verdict = 'ERROR';
    report.error = String(e?.stack || e).slice(0, 3000);
    save(report);
    log(`ERROR ${String(e?.message || e)}`);
    process.exitCode = 1;
  } finally {
    try { await browser?.close(); } catch (_) {}
    try { await srv?.close?.(); } catch (_) {}
  }
}

await main();
