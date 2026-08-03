/**
 * FORCED-GC HOARD-SLOPE — re-base the published floor / slope under real collection.
 *
 * Director (2026-08-02): pause releases nothing; every published floor level is inflated by the
 * ~281.7 MB a real HeapProfiler.collectGarbage takes; nothing on the slope is quotable until a
 * forced-collection re-base exists. This instrument is that re-base.
 *
 * It deliberately does NOT invent a new arena dump path. Allocator detail stays E's row
 * (arena-reclaim / ind-layer-arena). This answers only: what is the drained-floor slope when
 * both drains are forced collections, on the common-window session.
 *
 * Session: same-symbol (one file, four TFs) with requireDeliveringPanels=4 — the soak boot that
 * actually delivers on all panels. The older distinct-four-file plan is refused here.
 */

import fs from 'fs';
import path from 'path';
import { bootConf01Session } from './lib/conf01-session.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';
import { HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL } from './lib/heap-cycle-dataset-config.mjs';
import { readFootprint } from './lib/footprint.mjs';
import { computeSeal } from './lib/seal.mjs';
import { readBuildInfo } from './lib/build-info.mjs';
import { deliveredRate } from './lib/rate-hold.mjs';
import { gradeHoardSlope } from './a8-hoard-slope.mjs';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

const ORIGIN = arg('origin', 'http://31.97.192.82:3000');
const SPEED = Number(arg('speed', '10'));
const WARMUP_MIN = Number(arg('warmup', '4'));
const PLAY_MIN = Number(arg('play', '20'));
const OUT = arg('out', `_evidence/manager-C/forced-gc-hoard-slope-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[forced-gc-slope ${clockOf(new Date(), { seconds: true })}] ${m}`);

async function pauseAll(page) {
  return page.evaluate(() => {
    const out = [];
    const visit = (w, label) => {
      try {
        const rs = w.replaySystem || w.chart?.replaySystem;
        if (!rs) return;
        const before = !!rs.isPlaying;
        if (typeof rs.pause === 'function') rs.pause();
        else if (typeof rs.togglePlayPause === 'function' && before) rs.togglePlayPause();
        out.push({ realm: label, before, after: !!rs.isPlaying });
      } catch (e) { out.push({ realm: label, error: String(e).slice(0, 80) }); }
    };
    visit(window, 'host');
    for (let i = 0; i < window.frames.length; i++) { try { visit(window.frames[i], `frame${i}`); } catch (_) {} }
    return out;
  });
}

async function resumeAll(page) {
  return page.evaluate(() => {
    const out = [];
    const visit = (w, label) => {
      try {
        const rs = w.replaySystem || w.chart?.replaySystem;
        if (!rs) return;
        if (typeof rs.play === 'function' && !rs.isPlaying) rs.play();
        else if (typeof rs.togglePlayPause === 'function' && !rs.isPlaying) rs.togglePlayPause();
        out.push({ realm: label, after: !!rs.isPlaying });
      } catch (_) {}
    };
    visit(window, 'host');
    for (let i = 0; i < window.frames.length; i++) { try { visit(window.frames[i], `frame${i}`); } catch (_) {} }
    return out;
  });
}

/** Pause (stop delivery), then force-collect. Pause is not the drain; the collection is. */
async function forceGcDrain(page, browser, label) {
  const pause = await pauseAll(page);
  await sleep(2000);
  const cdp = await page.createCDPSession();
  try {
    await cdp.send('HeapProfiler.enable').catch(() => {});
    for (let i = 0; i < 3; i++) {
      try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) {}
      try { await cdp.send('Runtime.collectGarbage'); } catch (_) {}
      await sleep(1000);
    }
    await sleep(4000);
  } finally {
    try { await cdp.detach(); } catch (_) {}
  }
  const fp = await readFootprint(browser);
  const ph = await page.evaluate(() => {
    const c = window.chart; const rs = c && c.replaySystem;
    let sum = 0; let n = 0;
    const visit = (w) => {
      try {
        const r = w.replaySystem || w.chart?.replaySystem;
        if (r && Number.isFinite(r.currentIndex)) { sum += r.currentIndex; n += 1; }
      } catch (_) {}
    };
    visit(window);
    for (let i = 0; i < window.frames.length; i++) { try { visit(window.frames[i]); } catch (_) {} }
    return {
      replayIndex: rs?.currentIndex ?? null,
      replayTimestamp: rs?.replayTimestamp ?? rs?.currentTime ?? null,
      residentBars: c?.rawData?.length ?? null,
      playheadSum: sum,
      panelCount: n,
      jsHeapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : null,
    };
  });
  return {
    signature: 'FORCED-GC-DRAIN-V1',
    label,
    verdict: Number.isFinite(fp.footprintTotalMB) ? 'MEASURED' : 'VOID',
    why: Number.isFinite(fp.footprintTotalMB) ? null : 'footprint unreadable after forced GC',
    pause,
    // Shape compatible with gradeHoardSlope's pause-probe reader:
    hoardFloorMB: fp.footprintTotalMB,
    steps: [{
      stage: 'after-forced-gc',
      atMs: Date.now(),
      footprintTotalMB: fp.footprintTotalMB,
      residentBars: ph.residentBars,
      replayIndex: ph.replayIndex,
      jsHeapMB: ph.jsHeapMB,
    }],
    frothPercentOfRunning: null,
    runningMB: null,
    footprint: fp,
    playhead: ph,
    drain: 'pause + HeapProfiler.collectGarbage x3 — NOT pause-and-wait',
  };
}

async function readPlayhead(page) {
  return page.evaluate(() => {
    const c = window.chart; const rs = c && c.replaySystem;
    return {
      replayIndex: rs?.currentIndex ?? null,
      replayTimestamp: rs?.replayTimestamp ?? rs?.currentTime ?? null,
      residentBars: c?.rawData?.length ?? null,
      isPlaying: !!rs?.isPlaying,
      atMs: Date.now(),
    };
  }).then((r) => ({ ...r, atMs: Date.now(), readOk: true }))
    .catch((e) => ({ atMs: Date.now(), readOk: false, readError: String(e?.message || e).slice(0, 160) }));
}

function advanced(a, b) {
  const idx = Number.isFinite(a?.replayIndex) && Number.isFinite(b?.replayIndex) ? b.replayIndex - a.replayIndex : null;
  const ts = Number.isFinite(a?.replayTimestamp) && Number.isFinite(b?.replayTimestamp) ? b.replayTimestamp - a.replayTimestamp : null;
  return { indexAdvance: idx, timestampAdvanceMs: ts, moved: (idx != null && idx > 0) || (ts != null && ts > 0) };
}

async function main() {
  const seal = await computeSeal(ORIGIN).catch((e) => ({ error: String(e).slice(0, 120) }));
  const info = await readBuildInfo(ORIGIN).catch((e) => ({ error: String(e).slice(0, 120) }));
  const artifact = {
    signature: 'FORCED-GC-HOARD-SLOPE-V1',
    startedAt: new Date().toISOString(),
    question: 'What is the drained-floor slope when BOTH drains are forced collections on the common-window session?',
    identity: { buildId: seal.badge ?? null, sourceCommit: info.sourceCommitSha ?? null, origin: ORIGIN },
    condition: {
      speed: SPEED, warmupMin: WARMUP_MIN, playMin: PLAY_MIN,
      datasetMode: HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL,
      requireDeliveringPanels: 4,
      drain: 'forced HeapProfiler.collectGarbage at both floors',
      supersedes: {
        pauseAndWaitSlopeMBPerKbar: 22.89,
        pauseAndWaitNote: 'NON-QUOTABLE until this artifact lands MEASURED. Pause releases nothing; that slope was taken on pause-and-wait floors.',
        floorLevelInflationMB: 281.7,
      },
    },
    probes: {},
  };

  let session = null;
  try {
    log(`booting same-symbol CONF-01 speed=${SPEED}`);
    session = await bootConf01Session({
      indicators: loadConf05Indicators().pairs,
      replaySpeed: SPEED,
      placeOrder: false,
      datasetMode: HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL,
      requireDeliveringPanels: 4,
      label: 'forced-gc-hoard-slope',
    });
    artifact.conf01 = {
      datasetMode: session.conf01.datasetMode,
      delivering: session.conf01.delivering,
      fileIds: session.conf01.fileIds,
    };
    log(`boot ok advancing=${session.conf01.delivering?.advancingPanels} mode=${session.conf01.datasetMode}`);

    log(`warm ${WARMUP_MIN} min`);
    await sleep(WARMUP_MIN * 60_000);

    log('probe A: forced-GC drain');
    const probeA = await forceGcDrain(session.page, session.browser, 'A');
    artifact.probes.A = probeA;
    log(`  A floor ${probeA.hoardFloorMB} MB`);
    await resumeAll(session.page);

    log(`play leg ${PLAY_MIN} min`);
    const legStart = await readPlayhead(session.page);
    const legSamples = [];
    let prev = legStart;
    const t0 = Date.now();
    while (Date.now() - t0 < PLAY_MIN * 60_000) {
      await sleep(120_000);
      const ph = await readPlayhead(session.page);
      const rate = deliveredRate(prev, ph);
      prev = ph;
      legSamples.push({
        minute: +((Date.now() - t0) / 60000).toFixed(1),
        replayIndex: ph.replayIndex,
        residentBars: ph.residentBars,
        marketSecPerWallSec: rate.ok ? rate.marketSecPerWallSec : null,
      });
      log(`  t+${legSamples.at(-1).minute}m idx=${ph.replayIndex} rate=${legSamples.at(-1).marketSecPerWallSec ?? '?'}`);
    }
    const legEnd = await readPlayhead(session.page);
    let barsDelivered = 0;
    // Host index forward moves only (same-symbol sync keeps peers on shared market time).
    if (Number.isFinite(legStart.replayIndex) && Number.isFinite(legEnd.replayIndex) && legEnd.replayIndex > legStart.replayIndex) {
      barsDelivered = legEnd.replayIndex - legStart.replayIndex;
    }
    artifact.playLeg = {
      samples: legSamples,
      advance: advanced(legStart, legEnd),
      barsDelivered,
      note: 'barsDelivered = host replayIndex forward delta across the leg (same-symbol; peers share market time)',
    };

    log('probe B: forced-GC drain');
    const probeB = await forceGcDrain(session.page, session.browser, 'B');
    artifact.probes.B = probeB;
    log(`  B floor ${probeB.hoardFloorMB} MB`);

    const graded = gradeHoardSlope({
      probeA, probeB,
      advance: artifact.playLeg.advance,
      legSamples,
    });
    artifact.gates = graded.gates;
    artifact.verdict = graded.verdict;
    artifact.why = graded.why;
    artifact.caveat = graded.caveat;
    artifact.result = graded.result;

    // UNIT-01 form the pause-and-wait slope claimed: MB per thousand BARS DELIVERED, not resident sawtooth.
    if (graded.verdict === 'MEASURED' && barsDelivered > 0) {
      const delta = graded.result.deltaHoardMB;
      artifact.forcedGcSlope = {
        floorAMB: graded.result.hoardA_MB,
        floorBMB: graded.result.hoardB_MB,
        deltaMB: delta,
        hours: graded.result.hoursBetweenFloors,
        barsDelivered,
        mbPerKbarDelivered: +(delta / (barsDelivered / 1000)).toFixed(2),
        priorPauseAndWaitMBPerKbar: 22.89,
        form: 'forced-GC floors; per-kbar uses bars delivered on the play leg, not resident-bar delta',
      };
      log(`FORCED-GC slope: ${delta} MB / ${barsDelivered} bars = ${artifact.forcedGcSlope.mbPerKbarDelivered} MB/kbar (prior pause-wait 22.89)`);
    }
  } catch (e) {
    artifact.verdict = 'ERROR';
    artifact.error = String(e?.stack || e).slice(0, 1600);
    log('ERROR ' + artifact.error.split('\n')[0]);
  } finally {
    try { if (session?.browser) await session.browser.close(); } catch (_) {}
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));
    log(`artifact -> ${OUT}`);
  }
}

import { pathToFileURL } from 'node:url';
import { clockOf } from './lib/clock.mjs';
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect && !process.argv.includes('--noRun')) main();
