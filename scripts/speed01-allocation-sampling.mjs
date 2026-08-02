/**
 * SPEED-01 — five-minute allocation sampling session at 10 bars/s.
 *
 * Blocks QW-3. Answers one question: during a steady replay at the labelled
 * ten bars per second, where is the candidate allocating?
 *
 * Uses V8's sampling heap profiler rather than snapshot diffing, because a
 * snapshot tells you what survived and this asks what was *made*. Churn that
 * is collected still costs GC time and still shows up as main-thread
 * occupancy, and it is invisible to a retained-size diff.
 *
 * Runs the same PO workload the heap-cycle gates use, so the numbers are
 * comparable to the existing residency figures rather than a new dialect.
 *
 * Also records `__talariaEffectiveRate` throughout: this is the first
 * in-browser read-back of the SPEED-01 contract, so it doubles as evidence
 * that a nominal 10 really delivers ten bars a second on the candidate.
 *
 * Usage (puppeteer lives in the main worktree, not here):
 *   $env:NODE_PATH="<main>/node_modules"; node scripts/speed01-allocation-sampling.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyDistV9LayoutViaUi,
  loadPuppeteer,
  waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';
import { startServer as startHarnessServer } from '../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import {
  installBuiltProductBoot,
  reactParityUrlWithLayout,
} from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';
import { armHeapCyclePoWorkload } from './lib/heap-cycle-po-workload.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SAMPLE_MS = Number(process.env.SPEED01_SAMPLE_MS || 300_000);
const BARS_PER_SECOND = Number(process.env.SPEED01_BPS || 10);
/** 16 KB: finer than the 32 KB default, so mid-sized per-bar churn is visible. */
const SAMPLING_INTERVAL = 16 * 1024;
const READ_EVERY_MS = 15_000;
// Labelled so the pre-pooling baseline and D's post-pooling re-sample land in
// separate files; the 80% claim is a comparison and needs both to survive.
const OUT_LABEL = process.env.SPEED01_LABEL || '10bps';
const OUT = path.resolve(
  __dirname, `../docs/plan3/evidence/speed01-allocation-${OUT_LABEL}.json`,
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[speed01-alloc] ${new Date().toISOString()} ${m}`);
const mb = (bytes) => Number((bytes / (1024 * 1024)).toFixed(2));

/** Flatten V8's sampling tree into per-call-frame self bytes. */
function aggregateSamplingProfile(head) {
  const bySite = new Map();
  let total = 0;
  const walk = (node) => {
    const f = node.callFrame || {};
    const name = f.functionName || '(anonymous)';
    const url = (f.url || '').split('/').slice(-1)[0] || '(no url)';
    const key = `${name} @ ${url}:${f.lineNumber ?? -1}`;
    const self = Number(node.selfSize) || 0;
    total += self;
    if (self > 0) bySite.set(key, (bySite.get(key) || 0) + self);
    for (const child of node.children || []) walk(child);
  };
  walk(head);
  const sites = [...bySite.entries()]
    .map(([site, bytes]) => ({ site, bytes }))
    .sort((a, b) => b.bytes - a.bytes);
  return { total, sites };
}

/**
 * Rewind and resume any panel whose replay has stopped.
 *
 * Returns how many panels needed reviving, so the report can say plainly how
 * often the workload had to be nursed rather than presenting an uninterrupted
 * run it did not have.
 */
async function restartStalledPanels(page, barsPerSecond) {
  let revived = 0;
  for (const frame of page.frames()) {
    try {
      const did = await frame.evaluate((speed) => {
        // Same handle the PO workload arms through; window.replaySystem is not
        // the one the panels expose.
        const chart = window.chart;
        const rs = chart && chart.replaySystem;
        if (!rs) return false;
        // Deliberately not gated on isPlaying. A replay that has consumed its
        // loaded bars still reports isPlaying true while the playhead no longer
        // advances, which is exactly the stall we are here to clear.
        try {
          if (typeof rs.goToReplayTimestamp === 'function'
            && Array.isArray(chart.data) && chart.data.length > 50) {
            const mark = chart.data[Math.floor(chart.data.length * 0.2)];
            if (mark && mark.t != null) rs.goToReplayTimestamp(Number(mark.t));
          }
          if (typeof rs.setSpeed === 'function') rs.setSpeed(speed);
          if (!rs.isPlaying) {
            if (typeof rs.play === 'function') rs.play();
            else if (typeof rs.togglePlay === 'function') rs.togglePlay();
          }
        } catch (_e) {
          return false;
        }
        return !!rs.isPlaying;
      }, barsPerSecond);
      if (did) revived += 1;
    } catch (_e) {
      // Detached or cross-origin frame; the others still answer.
    }
  }
  return revived;
}

/** Read the governor's published rate from whichever realm carries it. */
async function readRate(page) {
  const probe = () => {
    const w = window;
    const out = {
      rate: typeof w.__talariaEffectiveRate === 'number' ? w.__talariaEffectiveRate : null,
      gov: w.__talariaSpeedGov
        ? {
          target: w.__talariaSpeedGov.target,
          gain: w.__talariaSpeedGov.gain,
          mode: w.__talariaSpeedGov.mode,
          corrections: w.__talariaSpeedGov.corrections,
          playing: w.__talariaSpeedGov.playing,
        }
        : null,
      heapMb: (w.performance && w.performance.memory)
        ? Math.round(w.performance.memory.usedJSHeapSize / (1024 * 1024))
        : null,
    };
    return out;
  };
  const seen = [];
  for (const frame of page.frames()) {
    try {
      const r = await frame.evaluate(probe);
      if (r && (r.rate !== null || r.heapMb !== null)) seen.push(r);
    } catch (_e) {
      // Detached or cross-origin frame; the others still answer.
    }
  }
  const withRate = seen.find((s) => s.rate !== null && s.gov && s.gov.playing);
    return withRate
    || seen.find((s) => s.rate !== null)
    || seen[0]
    || { rate: null, gov: null, heapMb: null };
}

async function main() {
  const distIndex = path.resolve(__dirname, '../chart v 1.4/chart/dist-v9/index.html');
  if (!fs.existsSync(distIndex)) throw new Error(`candidate build missing at ${distIndex}`);

  const puppeteer = await loadPuppeteer();
  const harness = await startHarnessServer(0);
  log(`harness at ${harness.url}`);

  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: SAMPLE_MS + 300_000,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
    ],
    defaultViewport: { width: 1440, height: 960 },
  });

  const started = new Date().toISOString();
  const readings = [];
  let profile = null;
  let workload = null;
  let restarts = 0;

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(180_000);
    await installBuiltProductBoot(page, {});

    const url = reactParityUrlWithLayout(
      `${harness.url}/chart/dist-v9/index.html?mode=backtest`, '1',
    );
    log('booting candidate');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await waitForDistV9SingleReady(page, 180_000);
    log('candidate ready');

    // Four panels: the PO workload the heap gates grade against. A single
    // panel would attribute allocations just as well but would not be
    // comparable to any residency figure already on the board.
    await applyDistV9LayoutViaUi(page, 4);
    await sleep(3_000);

    const cdp = await page.createCDPSession();
    await cdp.send('HeapProfiler.enable');

    log(`arming PO workload at ${BARS_PER_SECOND} bars/s`);
    workload = await armHeapCyclePoWorkload(page, {
      playHoldMs: 4_000,
      replaySpeed: BARS_PER_SECOND,
      retainIndicators: true,
    });
    if (!workload.armed) {
      throw new Error(
        `workload not armed: replayOk=${workload.replayOk} `
        + `indicatorsOk=${workload.indicatorsOk} playing=${workload.observedPlaying}`,
      );
    }
    log(`workload armed, playing=${workload.observedPlaying}`);

    // Settle before sampling so boot and arming allocations are not
    // attributed to steady-state replay.
    await sleep(5_000);
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});

    log(`sampling for ${Math.round(SAMPLE_MS / 1000)}s`);
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: SAMPLING_INTERVAL });

    const deadline = Date.now() + SAMPLE_MS;
    while (Date.now() < deadline) {
      await sleep(Math.min(READ_EVERY_MS, Math.max(0, deadline - Date.now())));
      const r = await readRate(page);
      readings.push({ atMs: SAMPLE_MS - Math.max(0, deadline - Date.now()), ...r });
      log(`t+${Math.round((SAMPLE_MS - (deadline - Date.now())) / 1000)}s `
        + `rate=${r.rate === null ? 'n/a' : r.rate.toFixed(2)} `
        + `gain=${r.gov ? r.gov.gain.toFixed(3) : 'n/a'} heap=${r.heapMb ?? 'n/a'}MB`);

      // Replay runs out of loaded bars well inside a five-minute window and
      // simply stops, which turns the tail of the sample into dead air that
      // dilutes every site's share. Rewind and resume so the profiler sees
      // replay allocation for the whole window; without this the baseline and
      // any post-pooling re-sample differ by how early each one stalled.
      if (r.rate !== null && r.rate <= 0.01) {
        const revived = await restartStalledPanels(page, BARS_PER_SECOND);
        restarts += revived;
        if (revived) log(`  replay had stalled; rewound and resumed ${revived} panel(s)`);
      }
    }

    const res = await cdp.send('HeapProfiler.getSamplingProfile');
    await cdp.send('HeapProfiler.stopSampling').catch(() => {});
    profile = aggregateSamplingProfile(res.profile.head);
    log(`sampled ${mb(profile.total)} MB across ${profile.sites.length} call frames`);
  } finally {
    await browser.close().catch(() => {});
    if (harness && typeof harness.close === 'function') await harness.close().catch(() => {});
  }

  const rated = readings.filter((r) => typeof r.rate === 'number' && r.rate > 0);
  const rates = rated.map((r) => r.rate);
  const mean = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;

  // Share of the window that actually had replay running. Reporting mean rate
  // over only the non-zero readings, as this did, hides a stalled tail
  // completely: a run that died a third of the way in still reports a healthy
  // mean. Any comparison across two samples is meaningless unless both ran
  // replay for the same share of their window, so this figure gates the claim.
  const liveReadings = readings.filter((r) => typeof r.rate === 'number' && r.rate > 0.01);
  const dutyCycle = readings.length
    ? Number((liveReadings.length / readings.length).toFixed(3))
    : null;

  const report = {
    row: 'SPEED-01 allocation sampling',
    startedAt: started,
    finishedAt: new Date().toISOString(),
    nominalBarsPerSecond: BARS_PER_SECOND,
    sampleMs: SAMPLE_MS,
    samplingIntervalBytes: SAMPLING_INTERVAL,
    effectiveRate: {
      mean: mean === null ? null : Number(mean.toFixed(3)),
      min: rates.length ? Number(Math.min(...rates).toFixed(3)) : null,
      max: rates.length ? Number(Math.max(...rates).toFixed(3)) : null,
      readings: readings.length,
      withRate: rated.length,
      gainAtEnd: rated.length ? rated[rated.length - 1].gov?.gain ?? null : null,
      corrections: rated.length ? rated[rated.length - 1].gov?.corrections ?? null : null,
    },
    replayLiveness: {
      dutyCycle,
      liveReadings: liveReadings.length,
      totalReadings: readings.length,
      panelRestarts: restarts,
      note: 'dutyCycle below 1 means part of the window had no replay running; '
        + 'allocation shares are diluted by exactly that fraction and two samples '
        + 'are only comparable at similar duty cycles',
    },
    heapMb: {
      first: readings.find((r) => r.heapMb !== null)?.heapMb ?? null,
      last: [...readings].reverse().find((r) => r.heapMb !== null)?.heapMb ?? null,
    },
    totalSampledMb: profile ? mb(profile.total) : null,
    allocationMbPerMinute: profile ? Number((mb(profile.total) / (SAMPLE_MS / 60000)).toFixed(2)) : null,
    topSites: profile
      ? profile.sites.slice(0, 40).map((s) => ({
        site: s.site,
        mb: mb(s.bytes),
        pct: Number(((s.bytes / profile.total) * 100).toFixed(2)),
      }))
      : [],
    readings,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

  console.log('\n===== SPEED-01 allocation sampling =====');
  console.log(`nominal ${BARS_PER_SECOND} bars/s over ${Math.round(SAMPLE_MS / 1000)}s`);
  console.log(`effective rate: mean=${report.effectiveRate.mean} `
    + `min=${report.effectiveRate.min} max=${report.effectiveRate.max} `
    + `gain=${report.effectiveRate.gainAtEnd} corrections=${report.effectiveRate.corrections}`);
  console.log(`replay live for ${Math.round((report.replayLiveness.dutyCycle ?? 0) * 100)}% `
    + `of the window (${report.replayLiveness.liveReadings}/${report.replayLiveness.totalReadings} `
    + `readings, ${report.replayLiveness.panelRestarts} panel restart(s))`);
  console.log(`heap: ${report.heapMb.first} MB -> ${report.heapMb.last} MB`);
  console.log(`allocated: ${report.totalSampledMb} MB (${report.allocationMbPerMinute} MB/min)`);
  console.log('\ntop allocation sites:');
  for (const s of report.topSites.slice(0, 20)) {
    console.log(`  ${String(s.mb).padStart(8)} MB  ${String(s.pct).padStart(5)}%  ${s.site}`);
  }
  console.log(`\nwritten to ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error(`[speed01-alloc] FAILED: ${err?.stack || err}`);
  process.exitCode = 1;
});
