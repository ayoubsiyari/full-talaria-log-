/**
 * V8-PLAYBACK-HEAP-SLOPE-90M
 *
 * CONF-01 playback attribution for renderer-scoped V8 growth:
 * - four panels, same-symbol CONF-01, real playback at 10 bars/s
 * - minimum three forced-GC heap snapshots across the run
 * - constructor diffs for each segment plus end-to-end
 * - retainer paths for sustained growers
 */
import fs from 'node:fs';
import path from 'node:path';

import { sleep } from '../chart v 1.4/chart/multichart-prod/harness/harness-lib.mjs';
import { aggregateHeapSnapshotByConstructor, compareConstructorAggregates } from './lib/heap-snapshot-aggregates.mjs';
import { aggregateRetainerPaths } from './lib/heap-retainer-paths.mjs';
import { takeEndOfArmSnapshot } from './lib/end-of-arm-snapshot.mjs';
import {
  bootConf01Session,
  keepConf01Playing,
  readConf01State,
} from './lib/conf01-session.mjs';
import { HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL } from './lib/heap-cycle-dataset-config.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';

const MB = 1024 * 1024;
const OUT_DIR = arg('outDir', '_evidence/manager-E/v8-playback-heap-slope-20260803');
const TOTAL_MIN = Number(arg('totalMin', '90'));
const SNAPSHOTS = Math.max(3, Number(arg('snapshots', '3')));
const SNAP_CAP_MB = Number(arg('snapCapMB', '3072'));
const TOP_N = Number(arg('topN', '25'));
const SPEED = Number(arg('speed', '10'));
const SNAPSHOT_INTERVAL_MS = Math.round((TOTAL_MIN * 60_000) / (SNAPSHOTS - 1));
const FORCE_OUT = process.argv.includes('--forceOut') || arg('forceOut', '0') === '1';
const LOCK_FILE = path.join(OUT_DIR, '.v8-playback-heap-slope.lock');

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function log(...args) {
  console.error(`[v8-playback-heap ${new Date().toISOString()}]`, ...args);
}

function mb(bytes) {
  return +(Number(bytes || 0) / MB).toFixed(3);
}

function save(report) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
}

function existingEvidenceNames() {
  if (!fs.existsSync(OUT_DIR)) return [];
  return fs.readdirSync(OUT_DIR)
    .filter((name) => name === 'report.json' || /\.heapsnapshot$/i.test(name));
}

function acquireOutDirLock() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!FORCE_OUT) {
    const existing = existingEvidenceNames();
    if (existing.length) {
      throw new Error(
        `OUTDIR_HAS_EXISTING_EVIDENCE: ${OUT_DIR} already contains ${existing.join(', ')}; `
        + 'archive it or pass --forceOut=1 intentionally',
      );
    }
  }
  try {
    const fd = fs.openSync(LOCK_FILE, 'wx');
    fs.writeFileSync(fd, JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString(),
      argv: process.argv.slice(2),
    }, null, 2));
    fs.closeSync(fd);
    return true;
  } catch (e) {
    if (e?.code === 'EEXIST') {
      throw new Error(`OUTDIR_LOCKED: ${LOCK_FILE} already exists; another run may be active or died without cleanup`);
    }
    throw e;
  }
}

function releaseOutDirLock(acquired) {
  if (!acquired) return;
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
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

async function playbackState(page, label, { advanceWindowMs = 6_000 } = {}) {
  const state = await readConf01State(page, { advanceWindowMs }).catch((e) => ({
    error: String(e?.message || e),
  }));
  return { label, at: new Date().toISOString(), state };
}

async function readPlayheadSnapshot(page) {
  return page.evaluate(() => {
    const rows = [];
    const visit = (w, realm) => {
      try {
        const rs = w.chart?.replaySystem || w.replaySystem || null;
        rows.push({
          realm,
          isPlaying: !!rs?.isPlaying,
          isActive: !!rs?.isActive,
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

async function waitWithHeartbeats(ms, report, page, segmentLabel) {
  const start = Date.now();
  let next = start + 5 * 60_000;
  while (Date.now() - start < ms) {
    const remaining = ms - (Date.now() - start);
    await sleep(Math.min(30_000, Math.max(0, remaining)));
    if (Date.now() >= next || Date.now() - start >= ms) {
      const keep = await keepConf01Playing(page, SPEED).catch((e) => ({
        error: String(e?.message || e),
      }));
      const playhead = await readPlayheadSnapshot(page);
      const beat = {
        at: new Date().toISOString(),
        segment: segmentLabel,
        elapsedMin: +((Date.now() - start) / 60_000).toFixed(2),
        keepPlaying: keep,
        playhead,
      };
      report.heartbeats.push(beat);
      save(report);
      log(`heartbeat ${segmentLabel} elapsed=${beat.elapsedMin}min playing=${keep?.playing ?? 'n/a'}`);
      next += 5 * 60_000;
    }
  }
}

async function takeMoment(label, page, report) {
  log(`${label}: keep playback alive before GC`);
  const keepBefore = await keepConf01Playing(page, SPEED).catch((e) => ({
    error: String(e?.message || e),
  }));
  log(`${label}: force collecting`);
  await forceCollect(page);
  const postGcMetrics = await metrics(page, `${label}-post-gc`);
  const playhead = await readPlayheadSnapshot(page);
  const advancing = await playbackState(page, `${label}-advance-check`);
  const snapFile = path.join(OUT_DIR, `${label}.heapsnapshot`);
  log(`${label}: snapshot -> ${snapFile}`);
  const snapMeta = await takeEndOfArmSnapshot(page, {
    outFile: snapFile,
    capMB: SNAP_CAP_MB,
    requireFreeMB: SNAP_CAP_MB + 4096,
    timeoutMs: 900_000,
  });
  report.moments[label] = {
    at: new Date().toISOString(),
    keepBefore,
    metrics: postGcMetrics,
    playhead,
    advancing,
    snapMeta,
  };
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

function growth(label, beforeAgg, afterAgg) {
  const rows = compareConstructorAggregates(beforeAgg, afterAgg)
    .filter((r) => r.sizeDelta !== 0 || r.countDelta !== 0)
    .sort((x, y) => y.sizeDelta - x.sizeDelta || y.countDelta - x.countDelta);
  return {
    label,
    totalPositiveSizeDeltaMB: mb(rows.filter((r) => r.sizeDelta > 0).reduce((s, r) => s + r.sizeDelta, 0)),
    totalNetSizeDeltaMB: mb(rows.reduce((s, r) => s + r.sizeDelta, 0)),
    topGrowers: formatGrowers(rows.filter((r) => r.sizeDelta > 0)),
    topShrinking: formatGrowers(rows.slice().sort((x, y) => x.sizeDelta - y.sizeDelta).filter((r) => r.sizeDelta < 0)),
  };
}

function sustainedGrowerConstructors(segmentGrowth, endToEnd) {
  const segments = segmentGrowth || [];
  const positiveEverySegment = new Set();
  for (const row of segments[0]?.topGrowers || []) {
    if (segments.every((seg) => (seg.topGrowers || []).some((g) => g.constructor === row.constructor && g.sizeDeltaMB > 0))) {
      positiveEverySegment.add(row.constructor);
    }
  }
  const endTop = (endToEnd?.topGrowers || []).map((r) => r.constructor);
  return [...new Set([...positiveEverySegment, ...endTop.slice(0, 8)])].slice(0, 12);
}

async function main() {
  let outDirLockAcquired = false;
  const report = {
    signature: 'V8-PLAYBACK-HEAP-SLOPE-90M',
    startedAt: new Date().toISOString(),
    condition: {
      surface: 'CONF-01 same-symbol four-panel dist-v9/backtest',
      datasetMode: HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL,
      requestedSpeed: SPEED,
      totalMin: TOTAL_MIN,
      snapshots: SNAPSHOTS,
      snapshotIntervalMin: +(SNAPSHOT_INTERVAL_MS / 60_000).toFixed(2),
      snapshotCapMB: SNAP_CAP_MB,
      topN: TOP_N,
      pairSwitches: 0,
      nullThreshold: 'No named sustained multi-MB constructor/retainer across adjacent segments and end-to-end means warm-up plateau/floor-story; a named sustained grower means V8 slope owner.',
    },
    moments: {},
    heartbeats: [],
  };

  let session = null;
  try {
    outDirLockAcquired = acquireOutDirLock();
    save(report);

    const indicators = loadConf05Indicators().pairs;
    log(`booting CONF-01 same-symbol playback speed=${SPEED}`);
    session = await bootConf01Session({
      indicators,
      replaySpeed: SPEED,
      placeOrder: false,
      datasetMode: HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL,
      requireDeliveringPanels: 4,
      label: 'v8-playback-heap-slope',
    });
    const { page, browser } = session;
    report.conf01 = session.conf01;
    report.bootPlaybackState = await playbackState(page, 'boot');
    report.bootMetrics = await metrics(page, 'boot');
    save(report);

    const labels = Array.from({ length: SNAPSHOTS }, (_, i) => String.fromCharCode('A'.charCodeAt(0) + i));
    for (let i = 0; i < labels.length; i += 1) {
      const label = labels[i];
      await takeMoment(label, page, report);
      if (i < labels.length - 1) {
        const segmentLabel = `${label}-${labels[i + 1]}`;
        log(`waiting ${+(SNAPSHOT_INTERVAL_MS / 60_000).toFixed(2)} minutes for ${segmentLabel}`);
        await keepConf01Playing(page, SPEED).catch(() => null);
        await waitWithHeartbeats(SNAPSHOT_INTERVAL_MS, report, page, segmentLabel);
      }
    }

    log('parsing snapshots and diffing constructors');
    const snapshots = {};
    const aggregates = {};
    for (const label of labels) {
      const meta = report.moments[label]?.snapMeta;
      if (!meta?.ok || !meta.file) throw new Error(`${label} snapshot failed: ${meta?.failedWhy || meta?.skippedWhy || 'unknown'}`);
      snapshots[label] = loadSnapshot(meta.file);
      aggregates[label] = aggregateHeapSnapshotByConstructor(snapshots[label]);
    }

    const segmentGrowth = [];
    for (let i = 0; i < labels.length - 1; i += 1) {
      segmentGrowth.push(growth(`${labels[i]}-${labels[i + 1]}`, aggregates[labels[i]], aggregates[labels[i + 1]]));
    }
    const endToEnd = growth(`${labels[0]}-${labels.at(-1)}`, aggregates[labels[0]], aggregates[labels.at(-1)]);
    report.constructorGrowth = { segments: segmentGrowth, endToEnd };

    const targets = sustainedGrowerConstructors(segmentGrowth, endToEnd);
    log(`retainers for ${targets.join(', ') || '(none)'}`);
    report.retainerTargets = targets;
    report.retainerPaths = targets.length
      ? aggregateRetainerPaths(snapshots[labels.at(-1)], {
        constructors: targets,
        topPaths: 12,
        maxDepth: 16,
        samplePerCtor: 3000,
      })
      : null;
    report.finalPlaybackState = await playbackState(page, 'final');
    report.finalMetrics = await metrics(page, 'final');
    report.verdict = 'CAPTURED';
    save(report);
    log(`artifact -> ${path.join(OUT_DIR, 'report.json')}`);

    try { await browser.close(); } catch (_) {}
  } catch (e) {
    report.verdict = 'ERROR';
    report.error = String(e?.stack || e).slice(0, 3000);
    if (outDirLockAcquired) save(report);
    log(`ERROR ${String(e?.message || e)}`);
    process.exitCode = 1;
  } finally {
    try { await session?.browser?.close(); } catch (_) {}
    releaseOutDirLock(outDirLockAcquired);
  }
}

await main();
