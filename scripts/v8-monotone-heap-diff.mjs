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
import { fileURLToPath } from 'node:url';

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
const OUT_ROOT = arg('outDir', '_evidence/manager-E/v8-playback-heap-slope-20260803');
const RUN_ID = arg('runId', defaultRunId());
const OUT_DIR = path.join(OUT_ROOT, RUN_ID);
const TOTAL_MIN = Number(arg('totalMin', '90'));
const SNAPSHOTS = Math.max(3, Number(arg('snapshots', '3')));
const SNAP_CAP_MB = Number(arg('snapCapMB', '3072'));
const TOP_N = Number(arg('topN', '25'));
const SPEED = Number(arg('speed', '10'));
const SNAPSHOT_INTERVAL_MS = Math.round((TOTAL_MIN * 60_000) / (SNAPSHOTS - 1));
const LOCK_FILE = path.join(OUT_DIR, '.v8-playback-heap-slope.lock');

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function log(...args) {
  console.error(`[v8-playback-heap ${new Date().toISOString()}]`, ...args);
}

function defaultRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function mb(bytes) {
  return +(Number(bytes || 0) / MB).toFixed(3);
}

function save(report) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
}

export async function withTimeout(label, timeoutMs, promise) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function startPhaseWatchdog(report, {
  moment,
  phase,
  expectedMs,
  marginMs,
  everyMs = 60_000,
}) {
  const startedAtMs = Date.now();
  const thresholdMs = expectedMs + marginMs;
  let sequence = 0;
  const timer = setInterval(() => {
    const elapsedMs = Date.now() - startedAtMs;
    if (elapsedMs < thresholdMs) return;
    sequence += 1;
    const event = {
      state: 'PHASE_OVERDUE',
      at: new Date().toISOString(),
      moment,
      phase,
      elapsedMs,
      expectedMs,
      marginMs,
      sequence,
    };
    if (!Array.isArray(report.phaseEvents)) report.phaseEvents = [];
    report.phaseEvents.push(event);
    if (report.moments?.[moment]) {
      report.moments[moment].phaseOverdue = event;
    }
    save(report);
    log(`PHASE_OVERDUE ${moment} ${phase} elapsed=${Math.round(elapsedMs / 1000)}s expected=${Math.round(expectedMs / 1000)}s margin=${Math.round(marginMs / 1000)}s`);
  }, everyMs);
  return () => clearInterval(timer);
}

function existingEvidenceNames() {
  if (!fs.existsSync(OUT_DIR)) return [];
  return fs.readdirSync(OUT_DIR)
    .filter((name) => name === 'report.json' || /\.heapsnapshot$/i.test(name));
}

function acquireOutDirLock() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const existing = existingEvidenceNames();
  if (existing.length) {
    throw new Error(
      `OUTDIR_HAS_EXISTING_EVIDENCE: ${OUT_DIR} already contains ${existing.join(', ')}; `
      + 'choose a fresh --runId or omit it',
    );
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

function currentPhase(report) {
  const labels = Object.keys(report?.moments || {}).sort();
  for (const label of labels.reverse()) {
    const moment = report.moments[label];
    if (moment?.phase && moment.phase !== 'complete') return `${label}:${moment.phase}`;
    if (moment?.phase === 'complete') return `${label}:complete`;
  }
  return 'starting';
}

function finalizeOutDirLock(acquired, report, state = 'PROCESS_EXITING') {
  if (!acquired) return;
  let lock = {};
  try { lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')); } catch (_) {}
  const startedAtMs = Number.isFinite(Date.parse(lock.startedAt)) ? Date.parse(lock.startedAt) : null;
  const finalState = {
    ...lock,
    state,
    finalizedAt: new Date().toISOString(),
    pid: process.pid,
    processStillAliveAtFinalizeWrite: true,
    plannedPlaybackMin: TOTAL_MIN,
    wallElapsedMinAtFinalize: startedAtMs != null ? +((Date.now() - startedAtMs) / 60_000).toFixed(3) : null,
    currentPhase: currentPhase(report),
    note: 'Private outdir lock is not deleted. Completed runs leave this terminal record; live runs keep state=ACTIVE, so a running process never appears silently unlocked.',
  };
  try { fs.writeFileSync(LOCK_FILE, JSON.stringify(finalState, null, 2)); } catch (_) {}
  report.lockState = finalState;
  save(report);
}

function startRunOverdueWatchdog(report, startedAtMs) {
  let sequence = 0;
  const plannedMs = TOTAL_MIN * 60_000;
  const timer = setInterval(() => {
    const elapsedMs = Date.now() - startedAtMs;
    if (elapsedMs < plannedMs || report.completedAt) return;
    sequence += 1;
    const event = {
      state: 'RUN_OVERDUE_ACTIVE_PHASE',
      at: new Date().toISOString(),
      elapsedMs,
      plannedPlaybackMs: plannedMs,
      plannedPlaybackMin: TOTAL_MIN,
      activePhase: currentPhase(report),
      sequence,
      note: 'Playback plan elapsed; process remains intentionally alive in the named active phase, usually final snapshot write/analysis.',
    };
    if (!Array.isArray(report.phaseEvents)) report.phaseEvents = [];
    report.phaseEvents.push(event);
    save(report);
    log(`RUN_OVERDUE_ACTIVE_PHASE ${event.activePhase} elapsed=${Math.round(elapsedMs / 1000)}s`);
  }, 60_000);
  return () => clearInterval(timer);
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

export async function waitWithHeartbeats(ms, report, page, segmentLabel, {
  sleepFn = sleep,
  keepAlive = () => keepConf01Playing(page, SPEED),
  readPlayhead = () => readPlayheadSnapshot(page),
  saveReport = save,
  heartbeatEveryMs = 5 * 60_000,
  keepTimeoutMs = 45_000,
  playheadTimeoutMs = 20_000,
} = {}) {
  const start = Date.now();
  let next = start + heartbeatEveryMs;
  while (Date.now() - start < ms) {
    const remaining = ms - (Date.now() - start);
    await sleepFn(Math.min(30_000, Math.max(0, remaining)));
    if (Date.now() >= next || Date.now() - start >= ms) {
      const keep = await withTimeout(
        `heartbeat ${segmentLabel} keepConf01Playing`,
        keepTimeoutMs,
        keepAlive(),
      ).catch((e) => ({
        state: 'HEARTBEAT_KEEPALIVE_TIMEOUT',
        phase: 'heartbeat.keepConf01Playing',
        error: String(e?.message || e),
      }));
      const playhead = await withTimeout(
        `heartbeat ${segmentLabel} readPlayheadSnapshot`,
        playheadTimeoutMs,
        readPlayhead(),
      ).catch((e) => [{
        state: 'HEARTBEAT_PLAYHEAD_TIMEOUT',
        phase: 'heartbeat.readPlayheadSnapshot',
        error: String(e?.message || e),
      }]);
      const states = [
        keep?.state,
        ...(Array.isArray(playhead) ? playhead.map((p) => p?.state).filter(Boolean) : []),
      ].filter(Boolean);
      const beat = {
        at: new Date().toISOString(),
        segment: segmentLabel,
        elapsedMin: +((Date.now() - start) / 60_000).toFixed(2),
        state: states[0] || 'HEARTBEAT_OK',
        keepPlaying: keep,
        playhead,
      };
      report.heartbeats.push(beat);
      saveReport(report);
      log(`heartbeat ${segmentLabel} elapsed=${beat.elapsedMin}min playing=${keep?.playing ?? 'n/a'}`);
      next += heartbeatEveryMs;
    }
  }
}

async function takeMoment(label, page, report) {
  report.moments[label] = {
    at: new Date().toISOString(),
    phase: 'starting',
  };
  save(report);

  log(`${label}: keep playback alive before GC`);
  let stopWatchdog = startPhaseWatchdog(report, {
    moment: label,
    phase: 'keepConf01Playing',
    expectedMs: 15_000,
    marginMs: 30_000,
  });
  const keepBefore = await withTimeout(
    `${label} keepConf01Playing`,
    60_000,
    keepConf01Playing(page, SPEED),
  ).catch((e) => ({
    error: String(e?.message || e),
  })).finally(() => stopWatchdog());
  report.moments[label].keepBefore = keepBefore;
  report.moments[label].phase = 'force-gc';
  save(report);

  log(`${label}: force collecting`);
  stopWatchdog = startPhaseWatchdog(report, {
    moment: label,
    phase: 'force-gc',
    expectedMs: 30_000,
    marginMs: 60_000,
  });
  await withTimeout(`${label} forceCollect`, 180_000, forceCollect(page)).finally(() => stopWatchdog());
  const postGcMetrics = await withTimeout(
    `${label} metrics`,
    30_000,
    metrics(page, `${label}-post-gc`),
  ).catch((e) => ({ label: `${label}-post-gc`, error: String(e?.message || e), at: new Date().toISOString() }));
  const playhead = await withTimeout(
    `${label} readPlayheadSnapshot`,
    20_000,
    readPlayheadSnapshot(page),
  ).catch((e) => [{ error: String(e?.message || e) }]);
  const advancing = await withTimeout(
    `${label} playbackState`,
    45_000,
    playbackState(page, `${label}-advance-check`),
  ).catch((e) => ({ label: `${label}-advance-check`, error: String(e?.message || e), at: new Date().toISOString() }));
  const snapFile = path.join(OUT_DIR, `${label}.heapsnapshot`);
  report.moments[label] = {
    ...report.moments[label],
    phase: 'snapshotting',
    snapshotStartedAt: new Date().toISOString(),
    metrics: postGcMetrics,
    playhead,
    advancing,
  };
  save(report);
  log(`${label}: snapshot -> ${snapFile}`);
  stopWatchdog = startPhaseWatchdog(report, {
    moment: label,
    phase: 'snapshotting',
    expectedMs: 120_000,
    marginMs: 120_000,
  });
  const snapMeta = await takeEndOfArmSnapshot(page, {
    outFile: snapFile,
    capMB: SNAP_CAP_MB,
    requireFreeMB: SNAP_CAP_MB + 4096,
    timeoutMs: 900_000,
    phase: `${label}:snapshotting`,
  }).finally(() => stopWatchdog());
  report.moments[label] = {
    ...report.moments[label],
    completedAt: new Date().toISOString(),
    phase: 'complete',
    keepBefore,
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

function summarizeRuntimeAnomalies(report) {
  const timeoutBeats = (report.heartbeats || [])
    .filter((beat) => beat?.state && beat.state !== 'HEARTBEAT_OK')
    .map((beat) => ({
      state: beat.state,
      at: beat.at,
      segment: beat.segment,
      elapsedMin: beat.elapsedMin,
      keepPlaying: beat.keepPlaying?.state || null,
      playheadStates: Array.isArray(beat.playhead)
        ? beat.playhead.map((row) => row?.state).filter(Boolean)
        : [],
    }));
  const phaseOverdue = (report.phaseEvents || [])
    .filter((event) => event?.state === 'PHASE_OVERDUE')
    .map((event) => ({
      at: event.at,
      moment: event.moment,
      phase: event.phase,
      elapsedMs: event.elapsedMs,
      expectedMs: event.expectedMs,
      marginMs: event.marginMs,
      sequence: event.sequence,
    }));
  return {
    hasAnomaly: timeoutBeats.length > 0 || phaseOverdue.length > 0,
    heartbeatTimeouts: timeoutBeats,
    phaseOverdue,
  };
}

function buildVerdictLine(report, verdict) {
  const anomalies = report.runtimeAnomalies || summarizeRuntimeAnomalies(report);
  const workload = `workload=CONF-01 same-symbol four panels playing at ${SPEED} bars/s, zero pair switches`;
  const anomalyText = anomalies.hasAnomaly
    ? `runtimeAnomaly=YES heartbeatTimeouts=${anomalies.heartbeatTimeouts.length} phaseOverdue=${anomalies.phaseOverdue.length}`
    : 'runtimeAnomaly=NO heartbeatTimeouts=0 phaseOverdue=0';
  return `V8-PLAYBACK-HEAP-SLOPE-90M ${verdict}: ${workload}; ${anomalyText}`;
}

async function main() {
  let outDirLockAcquired = false;
  const report = {
    signature: 'V8-PLAYBACK-HEAP-SLOPE-90M',
    startedAt: new Date().toISOString(),
    condition: {
      surface: 'CONF-01 same-symbol four-panel dist-v9/backtest',
      datasetMode: HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL,
      outRoot: OUT_ROOT,
      outDir: OUT_DIR,
      runId: RUN_ID,
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
  let stopRunOverdueWatchdog = null;
  try {
    outDirLockAcquired = acquireOutDirLock();
    save(report);
    stopRunOverdueWatchdog = startRunOverdueWatchdog(report, Date.now());

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
    report.runtimeAnomalies = summarizeRuntimeAnomalies(report);
    report.verdictLine = buildVerdictLine(report, report.verdict);
    report.completedAt = new Date().toISOString();
    save(report);
    log(`artifact -> ${path.join(OUT_DIR, 'report.json')}`);

    try { await browser.close(); } catch (_) {}
  } catch (e) {
    report.verdict = 'ERROR';
    report.error = String(e?.stack || e).slice(0, 3000);
    report.runtimeAnomalies = summarizeRuntimeAnomalies(report);
    report.verdictLine = buildVerdictLine(report, report.verdict);
    if (outDirLockAcquired) save(report);
    log(`ERROR ${String(e?.message || e)}`);
    process.exitCode = 1;
  } finally {
    if (stopRunOverdueWatchdog) stopRunOverdueWatchdog();
    try { await session?.browser?.close(); } catch (_) {}
    finalizeOutDirLock(outDirLockAcquired, report);
  }
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  await main();
}
