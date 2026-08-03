#!/usr/bin/env node
/**
 * V8-AUTHORITATIVE-HEAP-READ-90M
 *
 * Same workload as the disposable three-snapshot run, but read properly:
 * - ~30 continuous JS heap samples at 3-minute cadence
 * - forced-GC settled floor snapshots at 0/45/90 minutes
 * - warm-up window declared and excluded from tail slope fit
 * - B-C floor delta read against a noise band
 * - inline validity checklist for quotability
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sleep } from '../chart v 1.4/chart/multichart-prod/harness/harness-lib.mjs';
import { aggregateHeapSnapshotByConstructor, compareConstructorAggregates } from './lib/heap-snapshot-aggregates.mjs';
import { aggregateRetainerPaths } from './lib/heap-retainer-paths.mjs';
import { takeEndOfArmSnapshot } from './lib/end-of-arm-snapshot.mjs';
import { bootConf01Session, keepConf01Playing, readConf01State } from './lib/conf01-session.mjs';
import { HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL } from './lib/heap-cycle-dataset-config.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';
import { readNodeProcesses, readState } from './measurement-queue.mjs';
import {
  analyzeAuthoritativeV8Read,
  mb,
  runGate01CapabilityProof,
} from './lib/v8-authoritative-analysis.mjs';

const OUT_ROOT = arg('outDir', '_evidence/manager-E/v8-authoritative-heap-read-20260803');
const RUN_ID = arg('runId', defaultRunId());
const OUT_DIR = path.join(OUT_ROOT, RUN_ID);
const TOTAL_MIN = Number(arg('totalMin', '90'));
const SAMPLE_EVERY_MIN = Number(arg('sampleEveryMin', '3'));
const WARMUP_MIN = Number(arg('warmupMin', '15'));
const SPEED = Number(arg('speed', '10'));
const SNAP_CAP_MB = Number(arg('snapCapMB', '3072'));
const TOP_N = Number(arg('topN', '25'));
const QUEUE_OWNER = arg('queueOwner', 'E');
const QUEUE_RUN = arg('queueRun', 'v8-authoritative-heap-read-90m');
const COV01_COVERAGE_PCT = Number(arg('cov01CoveragePct', 'NaN'));
const LOCK_FILE = path.join(OUT_DIR, '.v8-authoritative-heap-read.lock');
const FLOOR_SCHEDULE = [
  { label: 'A', elapsedMin: 0 },
  { label: 'B', elapsedMin: TOTAL_MIN / 2 },
  { label: 'C', elapsedMin: TOTAL_MIN },
];
const NAMED_RETAINER_TARGET = 'm20Q6CapturedClear';

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function defaultRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function log(...args) {
  console.error(`[v8-authoritative ${new Date().toISOString()}]`, ...args);
}

function save(report) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
}

function acquireOutDirLock() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const existing = fs.existsSync(OUT_DIR)
    ? fs.readdirSync(OUT_DIR).filter((name) => name === 'report.json' || /\.heapsnapshot(?:\.failed)?$/i.test(name))
    : [];
  if (existing.length) {
    throw new Error(`OUTDIR_HAS_EXISTING_EVIDENCE: ${OUT_DIR} already contains ${existing.join(', ')}`);
  }
  try {
    const fd = fs.openSync(LOCK_FILE, 'wx');
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), argv: process.argv.slice(2) }, null, 2));
    fs.closeSync(fd);
    return true;
  } catch (e) {
    if (e?.code === 'EEXIST') throw new Error(`OUTDIR_LOCKED: ${LOCK_FILE}`);
    throw e;
  }
}

function currentPhase(report) {
  for (const { label } of [...FLOOR_SCHEDULE].reverse()) {
    const floor = report?.floors?.[label];
    if (floor?.phase && floor.phase !== 'complete') return `${label}:${floor.phase}`;
    if (floor?.phase === 'complete') return `${label}:complete`;
  }
  if (report?.samples?.length) return `sampling:${report.samples.length}`;
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
    const event = { state: 'PHASE_OVERDUE', at: new Date().toISOString(), phase, elapsedMs, expectedMs, marginMs, sequence };
    report.phaseEvents.push(event);
    save(report);
    log(`PHASE_OVERDUE ${phase} elapsed=${Math.round(elapsedMs / 1000)}s`);
  }, everyMs);
  return () => clearInterval(timer);
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
      note: 'Playback plan elapsed; process remains intentionally alive in the named active phase, usually snapshot-C write/analysis.',
    };
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

async function metrics(page, label, startedAtMs) {
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
      elapsedMin: +((Date.now() - startedAtMs) / 60_000).toFixed(3),
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

async function playbackState(page, label) {
  const state = await readConf01State(page, { advanceWindowMs: 6_000 }).catch((e) => ({
    error: String(e?.message || e),
  }));
  return { label, at: new Date().toISOString(), state };
}

function identityLockHeld() {
  const state = readState();
  const claim = state.claim || null;
  const procs = readNodeProcesses();
  return !!claim
    && claim.owner === QUEUE_OWNER
    && claim.run === QUEUE_RUN
    && procs.some((p) => Number(p.pid) === Number(claim.pid));
}

async function sample(page, report, startedAtMs, index) {
  const keep = await withTimeout('sample keepConf01Playing', 45_000, keepConf01Playing(page, SPEED))
    .catch((e) => ({ state: 'SAMPLE_KEEPALIVE_TIMEOUT', error: String(e?.message || e) }));
  const row = await withTimeout('sample metrics', 30_000, metrics(page, `sample-${index}`, startedAtMs))
    .catch((e) => ({ label: `sample-${index}`, at: new Date().toISOString(), elapsedMin: +((Date.now() - startedAtMs) / 60_000).toFixed(3), state: 'SAMPLE_METRICS_TIMEOUT', error: String(e?.message || e) }));
  row.keepPlaying = keep?.state ? keep : { state: 'OK' };
  report.samples.push(row);
  save(report);
  log(`sample ${index} elapsed=${row.elapsedMin} jsHeapUsedMB=${row.jsHeapUsedMB ?? 'n/a'} keep=${row.keepPlaying.state}`);
  return row;
}

async function floorSnapshot(label, page, report, startedAtMs) {
  log(`${label}: floor keep playback alive`);
  const keepBefore = await withTimeout(`${label} keepConf01Playing`, 45_000, keepConf01Playing(page, SPEED))
    .catch((e) => ({ state: 'FLOOR_KEEPALIVE_TIMEOUT', error: String(e?.message || e) }));
  report.floors[label] = {
    ...(report.floors[label] || {}),
    phase: 'force-gc',
    startedAt: new Date().toISOString(),
    keepBefore,
    playheadBefore: await playbackState(page, `${label}-before-gc`),
  };
  save(report);
  let stopWatchdog = startPhaseWatchdog(report, { phase: `${label}:force-gc`, expectedMs: 30_000, marginMs: 60_000 });
  const postGcMetrics = await withTimeout(`${label} forceCollect`, 180_000, forceCollect(page))
    .then(() => metrics(page, `${label}-post-gc-floor`, startedAtMs))
    .finally(() => stopWatchdog());
  const snapFile = path.join(OUT_DIR, `${label}.heapsnapshot`);
  report.floors[label] = {
    ...report.floors[label],
    phase: 'snapshotting',
    snapshotStartedAt: new Date().toISOString(),
    ...postGcMetrics,
  };
  save(report);
  log(`${label}: snapshot -> ${snapFile}`);
  stopWatchdog = startPhaseWatchdog(report, { phase: `${label}:snapshotting`, expectedMs: 120_000, marginMs: 120_000 });
  const snapMeta = await takeEndOfArmSnapshot(page, {
    outFile: snapFile,
    capMB: SNAP_CAP_MB,
    requireFreeMB: SNAP_CAP_MB + 4096,
    timeoutMs: 900_000,
    phase: `${label}:snapshotting`,
  }).finally(() => stopWatchdog());
  report.floors[label] = {
    ...report.floors[label],
    phase: 'complete',
    completedAt: new Date().toISOString(),
    snapMeta,
    playheadAfter: await playbackState(page, `${label}-after-snapshot`),
  };
  save(report);
  return report.floors[label];
}

function loadSnapshot(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function growth(label, beforeAgg, afterAgg) {
  const rows = compareConstructorAggregates(beforeAgg, afterAgg)
    .filter((r) => r.sizeDelta !== 0 || r.countDelta !== 0)
    .sort((x, y) => y.sizeDelta - x.sizeDelta || y.countDelta - x.countDelta);
  const topGrowers = rows.filter((r) => r.sizeDelta > 0).slice(0, TOP_N).map((r) => ({
    constructor: r.constructor,
    countDelta: r.countDelta,
    sizeDeltaMB: mb(r.sizeDelta),
  }));
  return {
    label,
    totalPositiveSizeDeltaMB: mb(rows.filter((r) => r.sizeDelta > 0).reduce((s, r) => s + r.sizeDelta, 0)),
    totalNetSizeDeltaMB: mb(rows.reduce((s, r) => s + r.sizeDelta, 0)),
    topGrowers,
  };
}

function analyzeSnapshots(report) {
  const labels = FLOOR_SCHEDULE.map((f) => f.label);
  const snapshots = {};
  const aggregates = {};
  for (const label of labels) {
    const meta = report.floors[label]?.snapMeta;
    if (!meta?.ok || !meta.file) throw new Error(`${label} snapshot failed: ${meta?.failedWhy || meta?.skippedWhy || 'unknown'}`);
    snapshots[label] = loadSnapshot(meta.file);
    aggregates[label] = aggregateHeapSnapshotByConstructor(snapshots[label]);
  }
  const segments = [];
  for (let i = 0; i < labels.length - 1; i += 1) {
    segments.push(growth(`${labels[i]}-${labels[i + 1]}`, aggregates[labels[i]], aggregates[labels[i + 1]]));
  }
  const endToEnd = growth(`${labels[0]}-${labels.at(-1)}`, aggregates[labels[0]], aggregates[labels.at(-1)]);
  const topTargets = endToEnd.topGrowers.map((r) => r.constructor).slice(0, 8);
  const targets = [...new Set([NAMED_RETAINER_TARGET, ...topTargets])].slice(0, 12);
  return {
    constructorGrowth: { segments, endToEnd },
    retainerTargets: targets,
    retainerPaths: aggregateRetainerPaths(snapshots[labels.at(-1)], {
      constructors: targets,
      topPaths: 12,
      maxDepth: 16,
      samplePerCtor: 3000,
    }),
  };
}

function sidecarsClean(report) {
  return FLOOR_SCHEDULE.every(({ label }) => report.floors[label]?.snapMeta?.ok === true)
    && !Object.values(report.floors).some((f) => String(f?.snapMeta?.file || '').endsWith('.failed'));
}

function allPhasesCompleted(report) {
  return report.samples.length >= Math.floor(TOTAL_MIN / SAMPLE_EVERY_MIN)
    && FLOOR_SCHEDULE.every(({ label }) => report.floors[label]?.phase === 'complete');
}

async function main() {
  let lockAcquired = false;
  let session = null;
  let stopRunOverdueWatchdog = null;
  const gate01 = runGate01CapabilityProof();
  const report = {
    signature: 'V8-AUTHORITATIVE-HEAP-READ-90M',
    startedAt: new Date().toISOString(),
    condition: {
      outRoot: OUT_ROOT,
      outDir: OUT_DIR,
      runId: RUN_ID,
      workload: 'CONF-01 same-symbol four-panel playback',
      requestedSpeed: SPEED,
      totalMin: TOTAL_MIN,
      sampleEveryMin: SAMPLE_EVERY_MIN,
      warmupMin: WARMUP_MIN,
      floorSchedule: FLOOR_SCHEDULE,
      cov01CoveragePct: Number.isFinite(COV01_COVERAGE_PCT) ? COV01_COVERAGE_PCT : null,
      namedRetainerTarget: NAMED_RETAINER_TARGET,
    },
    gate01CapabilityProof: gate01,
    samples: [],
    floors: {},
    phaseEvents: [],
  };
  try {
    lockAcquired = acquireOutDirLock();
    save(report);
    if (!gate01.ok) throw new Error(`GATE_01_NOT_GREEN: ${gate01.state}`);
    const indicators = loadConf05Indicators().pairs;
    session = await bootConf01Session({
      indicators,
      replaySpeed: SPEED,
      placeOrder: false,
      datasetMode: HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL,
      requireDeliveringPanels: 4,
      label: 'v8-authoritative-heap-read',
    });
    const { page, browser } = session;
    report.conf01 = session.conf01;
    report.bootPlaybackState = await playbackState(page, 'boot');
    save(report);

    const startedAtMs = Date.now();
    stopRunOverdueWatchdog = startRunOverdueWatchdog(report, startedAtMs);
    let sampleIndex = 0;
    let floorIndex = 0;
    let nextSampleAtMs = startedAtMs;
    const endAtMs = startedAtMs + TOTAL_MIN * 60_000;

    while (Date.now() <= endAtMs + 1000) {
      const elapsedMin = (Date.now() - startedAtMs) / 60_000;
      while (floorIndex < FLOOR_SCHEDULE.length && elapsedMin + 0.05 >= FLOOR_SCHEDULE[floorIndex].elapsedMin) {
        await floorSnapshot(FLOOR_SCHEDULE[floorIndex].label, page, report, startedAtMs);
        floorIndex += 1;
      }
      if (Date.now() >= nextSampleAtMs) {
        await sample(page, report, startedAtMs, sampleIndex);
        sampleIndex += 1;
        nextSampleAtMs = startedAtMs + sampleIndex * SAMPLE_EVERY_MIN * 60_000;
      }
      const nextFloorAtMs = floorIndex < FLOOR_SCHEDULE.length
        ? startedAtMs + FLOOR_SCHEDULE[floorIndex].elapsedMin * 60_000
        : endAtMs;
      const nextWake = Math.min(nextSampleAtMs, nextFloorAtMs, endAtMs);
      await sleep(Math.min(30_000, Math.max(500, nextWake - Date.now())));
      if (Date.now() >= endAtMs && floorIndex >= FLOOR_SCHEDULE.length) break;
    }

    report.snapshotAnalysis = analyzeSnapshots(report);
    report.analysis = analyzeAuthoritativeV8Read({
      samples: report.samples,
      floors: FLOOR_SCHEDULE.map(({ label }) => ({ label, ...report.floors[label] })),
      warmupMin: WARMUP_MIN,
      validityInputs: {
        identityLockHeld: identityLockHeld(),
        allPhasesCompleted: allPhasesCompleted(report),
        sidecarsClean: sidecarsClean(report),
        cov01CoveragePct: COV01_COVERAGE_PCT,
        gate01,
      },
    });
    report.verdict = report.analysis.quotable ? report.analysis.shape : 'NOT_QUOTABLE';
    report.verdictLine = report.analysis.verdictLine;
    report.completedAt = new Date().toISOString();
    save(report);
    log(report.verdictLine);
    try { await browser.close(); } catch (_) {}
  } catch (e) {
    report.verdict = 'ERROR';
    report.error = String(e?.stack || e).slice(0, 3000);
    report.analysis = report.analysis || analyzeAuthoritativeV8Read({
      samples: report.samples,
      floors: FLOOR_SCHEDULE.map(({ label }) => ({ label, ...report.floors[label] })).filter((f) => f.at),
      warmupMin: WARMUP_MIN,
      validityInputs: {
        identityLockHeld: identityLockHeld(),
        allPhasesCompleted: false,
        sidecarsClean: sidecarsClean(report),
        cov01CoveragePct: COV01_COVERAGE_PCT,
        gate01,
      },
    });
    save(report);
    log(`ERROR ${String(e?.message || e)}`);
    process.exitCode = 1;
  } finally {
    if (stopRunOverdueWatchdog) stopRunOverdueWatchdog();
    try { await session?.browser?.close(); } catch (_) {}
    finalizeOutDirLock(lockAcquired, report);
  }
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  await main();
}
