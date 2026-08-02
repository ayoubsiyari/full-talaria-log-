/**
 * EXHAUSTION-PROBE — how many bars does a real CONF-01 session actually hold, and how long does that
 * last at the shipping ladder? Plus, in the same session, does the floor rise with zero bars delivered?
 *
 * WHY THESE ARE ONE RUN. The second question needs a condition where the product delivers nothing. If the
 * first hypothesis is right, the session produces that condition by itself roughly ten minutes in, which
 * is exactly the window the 57.9 MB rise was observed in. So phase B does not have to be contrived: it
 * starts when phase A proves delivery has stopped.
 *
 * PHASE A — EXHAUSTION. Sample `masterLen` beside the playhead, per panel, on a fixed cadence. Three
 * outcomes are distinguishable and the probe must not collapse them:
 *   EXHAUSTED        every panel's playhead pins at masterLen-1 and the master stops growing
 *   FETCH_FORWARD    the playhead approaches the end and the master GROWS to stay ahead of it
 *   STILL_RUNNING    neither happened inside the budget, so the hypothesis is not supported here
 * The distinction matters because "the playhead stopped" and "the product hung" look identical in every
 * gauge I have published, and I have already reported the second when the evidence only supported asking.
 *
 * PHASE B — THE FLOOR WITH ZERO DELIVERY. The 57.9 MB rise was measured between two PAUSE-AND-WAIT probes,
 * and pause is not a drain: every pause reference in replay-system.js is UI state, and drain B's reading
 * actually ROSE during its own pause. So that number may be nothing but uncollected froth read at two
 * unlucky moments. Here each floor is taken after an explicit HeapProfiler.collectGarbage, and delivery is
 * PROVEN zero at every point by re-reading the playhead — a floor that rises while bars are quietly still
 * being delivered would answer a different question than the one asked.
 *
 * UNIT DISCIPLINE. Bars held is reported per panel and as wall-clock duration at the measured effective
 * speed, not the requested one. Requesting a speed and receiving another is a documented failure in this
 * workstream (a soak once ran at 60 under a 5 label), so the ladder figure is read back from the engine.
 */

import fs from 'fs';
import path from 'path';
import { bootConf01Session } from './lib/conf01-session.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';
import { readFootprint } from './lib/footprint.mjs';
import { computeSeal } from './lib/seal.mjs';
import { readBuildInfo } from './lib/build-info.mjs';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

const ORIGIN = arg('origin', 'http://31.97.192.82:3000');
const SPEED = Number(arg('speed', '10'));
const SAMPLE_MS = Number(arg('sampleMs', '15000'));
const PHASE_A_MAX_MS = Number(arg('phaseAMaxMs', '1500000'));   // 25 min ceiling
const PIN_SAMPLES = Number(arg('pinSamples', '4'));             // consecutive pinned samples = exhausted
const PHASE_B_POINTS = Number(arg('phaseBPoints', '6'));
const PHASE_B_GAP_MS = Number(arg('phaseBGapMs', '120000'));
const PHASE = arg('phase', 'ab');           // 'ab' full run, 'b' = zero-delivery floor only
const WARM_MS = Number(arg('warmMs', '0')); // let the session play this long before phase B pauses it
const OUT = arg('out', `_evidence/manager-C/exhaustion-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

const log = (m) => console.log(`[exhaustion ${new Date().toISOString().slice(11, 19)}] ${m}`);

async function readPanels(page) {
  return page.evaluate(() => {
    const out = [];
    const visit = (w, label) => {
      try {
        const chart = w.chart || null;
        const rs = w.replaySystem || (chart && chart.replaySystem) || null;
        if (!rs && !chart) return;
        out.push({
          realm: label,
          tf: chart ? (chart.currentTimeframe ?? null) : null,
          playhead: rs && Number.isFinite(rs.currentIndex) ? rs.currentIndex : null,
          masterLen: Array.isArray(rs && rs.fullRawData) ? rs.fullRawData.length : null,
          rawDataLen: Array.isArray(chart && chart.rawData) ? chart.rawData.length : null,
          playheadTs: (() => {
            try { const b = rs && rs.fullRawData && rs.fullRawData[rs.currentIndex]; return b ? (b.t ?? b.time ?? null) : null; } catch (_) { return null; }
          })(),
          lastBarTs: (() => {
            try { const a = rs && rs.fullRawData; const b = a && a[a.length - 1]; return b ? (b.t ?? b.time ?? null) : null; } catch (_) { return null; }
          })(),
          isPlaying: rs ? !!rs.isPlaying : null,
        });
      } catch (_) { /* a realm may carry no chart */ }
    };
    visit(window, 'host');
    for (let i = 0; i < window.frames.length; i++) { try { visit(window.frames[i], 'frame' + i); } catch (_) {} }
    return { atMs: Date.now(), panels: out };
  });
}

async function readEffectiveSpeed(page) {
  return page.evaluate(() => {
    const routes = [];
    const visit = (w) => {
      try {
        const rs = w.replaySystem || (w.chart && w.chart.replaySystem);
        if (!rs) return;
        for (const [name, val] of [
          ['getTargetBarsPerSecond()', typeof rs.getTargetBarsPerSecond === 'function' ? rs.getTargetBarsPerSecond() : undefined],
          ['targetBarsPerSecond', rs.targetBarsPerSecond],
          ['playbackSpeed', rs.playbackSpeed],
          ['speed', rs.speed],
        ]) if (val !== undefined) routes.push({ route: name, value: val });
      } catch (_) {}
    };
    visit(window);
    for (let i = 0; i < window.frames.length; i++) { try { visit(window.frames[i]); } catch (_) {} }
    return routes;
  });
}

/**
 * Stop delivery in every realm. Pause is not a drain — every pause reference in replay-system.js is UI
 * state and nothing is released by it — but it IS a stop, and a stop is what phase B needs. The drain is
 * done separately by HeapProfiler.collectGarbage.
 */
async function pauseAllRealms(page) {
  return page.evaluate(() => {
    const results = [];
    const visit = (w, label) => {
      try {
        const rs = w.replaySystem || (w.chart && w.chart.replaySystem);
        if (!rs) return;
        const before = !!rs.isPlaying;
        let route = null;
        if (typeof rs.pause === 'function') { rs.pause(); route = 'pause()'; }
        else if (typeof rs.togglePlayPause === 'function' && before) { rs.togglePlayPause(); route = 'togglePlayPause()'; }
        results.push({ realm: label, before, after: !!rs.isPlaying, route });
      } catch (e) { results.push({ realm: label, error: String(e).slice(0, 80) }); }
    };
    visit(window, 'host');
    for (let i = 0; i < window.frames.length; i++) { try { visit(window.frames[i], 'frame' + i); } catch (_) {} }
    return results;
  });
}

/** Phase A verdict. Kept pure and exported so it can be driven without a browser. */
export function gradeExhaustion(samples, { pinSamples = 4 } = {}) {
  if (!samples || samples.length < 2) return { state: 'INSUFFICIENT', why: 'fewer than two samples' };

  const realms = [...new Set(samples.flatMap((s) => s.panels.map((p) => p.realm)))];
  const perPanel = {};
  let anyMasterGrew = false;

  for (const r of realms) {
    const series = samples.map((s) => s.panels.find((p) => p.realm === r)).filter(Boolean);
    if (!series.length) continue;
    const masterLens = series.map((p) => p.masterLen).filter(Number.isFinite);
    const maxMaster = masterLens.length ? Math.max(...masterLens) : null;
    const firstMaster = masterLens.length ? masterLens[0] : null;
    const grew = maxMaster != null && firstMaster != null && maxMaster > firstMaster;
    if (grew) anyMasterGrew = true;

    // Pinned = playhead sits at the last bar of the master.
    const pinnedFlags = series.map((p) => Number.isFinite(p.playhead) && Number.isFinite(p.masterLen) && p.playhead >= p.masterLen - 1);
    let firstPinIdx = -1; let run = 0;
    for (let i = 0; i < pinnedFlags.length; i++) {
      if (pinnedFlags[i]) { run++; if (run >= pinSamples && firstPinIdx < 0) firstPinIdx = i - pinSamples + 1; }
      else run = 0;
    }
    const t0 = samples[0].atMs;
    perPanel[r] = {
      tf: series[0].tf,
      firstMasterLen: firstMaster,
      maxMasterLen: maxMaster,
      finalMasterLen: series[series.length - 1].masterLen,
      masterGrew: grew,
      growthBars: grew ? maxMaster - firstMaster : 0,
      finalPlayhead: series[series.length - 1].playhead,
      pinned: firstPinIdx >= 0,
      minutesToPin: firstPinIdx >= 0 ? +(((samples[firstPinIdx].atMs - t0) / 60000).toFixed(2)) : null,
      // Bars actually delivered over the whole of phase A, the only honest throughput denominator.
      barsDelivered: (() => {
        let total = 0;
        for (let i = 1; i < series.length; i++) {
          const d = (series[i].playhead ?? 0) - (series[i - 1].playhead ?? 0);
          if (d > 0) total += d; // an eviction re-base moves the index backwards; do not count it
        }
        return total;
      })(),
    };
  }

  const panels = Object.values(perPanel);
  const allPinned = panels.length > 0 && panels.every((p) => p.pinned);
  const somePinned = panels.some((p) => p.pinned);

  let state;
  if (allPinned) state = 'EXHAUSTED';
  else if (anyMasterGrew && !somePinned) state = 'FETCH_FORWARD';
  else if (somePinned) state = 'PARTIALLY_EXHAUSTED';
  else state = 'STILL_RUNNING';

  return { state, perPanel, allPinned, anyMasterGrew };
}

/** Phase B verdict: does the COLLECTED floor rise while delivery is proven zero? */
export function gradeZeroDeliveryFloor(points, { minMB = 15 } = {}) {
  const usable = (points || []).filter((p) => Number.isFinite(p.floorMB) && Number.isFinite(p.minutes));
  if (usable.length < 3) return { verdict: 'INSUFFICIENT', why: `only ${usable.length} collected floor readings` };

  const delivered = usable.reduce((a, p) => a + (p.barsSinceLast || 0), 0);
  const n = usable.length;
  const sx = usable.reduce((a, p) => a + p.minutes, 0);
  const sy = usable.reduce((a, p) => a + p.floorMB, 0);
  const sxx = usable.reduce((a, p) => a + p.minutes * p.minutes, 0);
  const sxy = usable.reduce((a, p) => a + p.minutes * p.floorMB, 0);
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? null : (n * sxy - sx * sy) / denom;
  const intercept = denom === 0 ? null : (sy - slope * sx) / n;
  const resid = usable.map((p) => p.floorMB - (intercept + slope * p.minutes));
  const sse = resid.reduce((a, r) => a + r * r, 0);
  const se = n > 2 && denom !== 0 ? Math.sqrt((sse / (n - 2)) / (sxx - (sx * sx) / n)) : null;
  const ci = se != null ? [slope - 2 * se, slope + 2 * se] : null;
  const spanMin = usable[usable.length - 1].minutes - usable[0].minutes;
  const totalRise = usable[usable.length - 1].floorMB - usable[0].floorMB;

  if (delivered > 0) {
    return {
      verdict: 'VOID', deliveredBars: delivered,
      why: `${delivered} bars were delivered during phase B, so this does not measure a zero-delivery floor. The condition the question is about was not held.`,
    };
  }

  const risesMeaningfully = ci != null && ci[0] > 0 && totalRise >= minMB;
  return {
    verdict: risesMeaningfully ? 'FLOOR_RISES_WITH_ZERO_BARS' : 'NO_RISE_DETECTED',
    deliveredBars: delivered,
    points: n, spanMinutes: +spanMin.toFixed(2),
    firstFloorMB: usable[0].floorMB, lastFloorMB: usable[usable.length - 1].floorMB,
    totalRiseMB: +totalRise.toFixed(1),
    slopeMBPerMin: slope == null ? null : +slope.toFixed(3),
    slopeMBPerHour: slope == null ? null : +(slope * 60).toFixed(1),
    ci95MBPerMin: ci ? ci.map((v) => +v.toFixed(3)) : null,
    why: risesMeaningfully
      ? `the collected floor rose ${totalRise.toFixed(1)} MB over ${spanMin.toFixed(1)} min with ZERO bars delivered, slope CI excludes zero. Bars are not the only denominator.`
      : `no rise survives a forced collection: ${totalRise.toFixed(1)} MB over ${spanMin.toFixed(1)} min${ci ? `, slope CI [${ci[0].toFixed(3)}, ${ci[1].toFixed(3)}] MB/min` : ''}. The earlier 57.9 MB was measured between two PAUSE-AND-WAIT probes, and pause is not a drain, so that reading is best explained as uncollected froth rather than retention.`,
  };
}

async function main() {
  const seal = await computeSeal(ORIGIN).catch((e) => ({ error: String(e).slice(0, 120) }));
  const info = await readBuildInfo(ORIGIN).catch((e) => ({ error: String(e).slice(0, 120) }));
  const eSel = loadConf05Indicators();

  const artifact = {
    signature: 'EXHAUSTION-PROBE-V1',
    startedAt: new Date().toISOString(),
    identity: { buildId: seal.badge ?? null, sourceCommit: info.sourceCommitSha ?? null, origin: ORIGIN },
    condition: { requestedSpeed: SPEED, panels: 4, indicatorsPerPanel: 2, trades: 0, sampleMs: SAMPLE_MS },
    phaseA: { samples: [] },
    phaseB: { points: [] },
  };

  let session = null;
  try {
    log(`booting CONF-01 at requested speed ${SPEED} (${seal.badge ?? '?'})`);
    session = await bootConf01Session({ indicators: eSel.pairs, replaySpeed: SPEED, placeOrder: false, label: 'exhaustion-probe' });
    const page = session.page;
    const browser = session.browser;
    const cdp = await page.createCDPSession();
    try { await cdp.send('HeapProfiler.enable'); } catch (_) {}

    artifact.effectiveSpeed = await readEffectiveSpeed(page).catch(() => null);
    log(`effective speed routes: ${JSON.stringify(artifact.effectiveSpeed)}`);

    // ---------------- PHASE A
    if (PHASE === 'b') log('phase A skipped by --phase=b');
    log(`phase A: sampling masterLen beside playhead every ${SAMPLE_MS / 1000}s, ceiling ${PHASE_A_MAX_MS / 60000} min`);
    const tA = Date.now();
    let pinnedRun = 0;
    while (PHASE !== 'b' && Date.now() - tA < PHASE_A_MAX_MS) {
      const s = await readPanels(page);
      artifact.phaseA.samples.push(s);
      const pins = s.panels.filter((p) => Number.isFinite(p.playhead) && Number.isFinite(p.masterLen) && p.playhead >= p.masterLen - 1).length;
      const desc = s.panels.map((p) => `${p.tf}:${p.playhead}/${p.masterLen}`).join(' ');
      log(`  t+${Math.round((Date.now() - tA) / 1000)}s  ${desc}  pinned=${pins}/${s.panels.length}`);
      pinnedRun = (pins === s.panels.length && s.panels.length > 0) ? pinnedRun + 1 : 0;
      if (pinnedRun >= PIN_SAMPLES) { log('  all panels pinned for the required run — phase A ends'); break; }
      await new Promise((r) => setTimeout(r, SAMPLE_MS));
    }
    artifact.phaseA.verdict = PHASE === 'b'
      ? { state: 'SKIPPED', why: 'run invoked with --phase=b' }
      : gradeExhaustion(artifact.phaseA.samples, { pinSamples: PIN_SAMPLES });
    log(`phase A verdict: ${artifact.phaseA.verdict.state}`);

    // ---------------- PHASE B
    if (WARM_MS > 0) {
      log(`warming ${WARM_MS / 60000} min before pausing, so the floor is measured on a session that has done work`);
      const warmStart = await readPanels(page);
      await new Promise((r) => setTimeout(r, WARM_MS));
      const warmEnd = await readPanels(page);
      artifact.phaseB.warm = { warmStart, warmEnd, warmMs: WARM_MS };
    }

    // Stop delivery FIRST, and prove it stopped, before a single floor is read. Without this the run
    // measures a floor under partial delivery and answers a question nobody asked.
    artifact.phaseB.pause = await pauseAllRealms(page).catch((e) => ({ error: String(e).slice(0, 120) }));
    log(`paused: ${JSON.stringify(artifact.phaseB.pause)}`);
    await new Promise((r) => setTimeout(r, 8000));
    const stillA = await readPanels(page);
    await new Promise((r) => setTimeout(r, 12000));
    const stillB = await readPanels(page);
    const sum = (s) => s.panels.reduce((a, p) => a + (Number.isFinite(p.playhead) ? p.playhead : 0), 0);
    artifact.phaseB.stopProof = { before: sum(stillA), after: sum(stillB), static: sum(stillA) === sum(stillB) };
    log(`stop proof: playhead sum ${sum(stillA)} -> ${sum(stillB)} over 12 s, static=${artifact.phaseB.stopProof.static}`);

    log(`phase B: ${PHASE_B_POINTS} collected floors, ${PHASE_B_GAP_MS / 60000} min apart, delivery proven zero at each`);
    const tB = Date.now();
    let prevPh = null;
    for (let i = 0; i < PHASE_B_POINTS; i++) {
      for (let g = 0; g < 3; g++) { try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) {} await new Promise((r) => setTimeout(r, 1200)); }
      await new Promise((r) => setTimeout(r, 4000));
      const fpv = await readFootprint(browser).catch((e) => ({ error: String(e).slice(0, 100) }));
      const ph = await readPanels(page);
      const sumPh = ph.panels.reduce((a, p) => a + (Number.isFinite(p.playhead) ? p.playhead : 0), 0);
      const point = {
        i,
        minutes: +(((Date.now() - tB) / 60000).toFixed(3)),
        floorMB: fpv.footprintTotalMB ?? null,
        playheadSum: sumPh,
        barsSinceLast: prevPh == null ? 0 : Math.max(0, sumPh - prevPh),
        panels: ph.panels.map((p) => ({ tf: p.tf, playhead: p.playhead, masterLen: p.masterLen })),
      };
      prevPh = sumPh;
      artifact.phaseB.points.push(point);
      log(`  B${i}: floor ${point.floorMB} MB at t+${point.minutes} min, barsSinceLast=${point.barsSinceLast}`);
      if (i < PHASE_B_POINTS - 1) await new Promise((r) => setTimeout(r, PHASE_B_GAP_MS));
    }
    artifact.phaseB.verdict = gradeZeroDeliveryFloor(artifact.phaseB.points);
    log(`phase B verdict: ${artifact.phaseB.verdict.verdict}`);

    artifact.verdict = 'CAPTURED';
  } catch (err) {
    artifact.verdict = 'ERROR';
    artifact.error = String(err && err.stack ? err.stack : err).slice(0, 1600);
    log('ERROR ' + artifact.error.split('\n')[0]);
  } finally {
    try { if (session && session.browser) await session.browser.close(); } catch (_) {}
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));
    log(`artifact -> ${OUT}`);
  }
}

if (!process.argv.includes('--noRun')) main();
