/**
 * A8 HOARD-SLOPE — is the A8 climb retention or froth?
 *
 * The A8 baseline measured a RUNNING footprint climbing 988.3 -> 1,096.3 MB in six minutes. A running
 * total contains an unknown amount of froth, so that climb cannot be projected against the 1,024 MB bar
 * until the froth is drained out of it.
 *
 * ONE drain answers the froth FRACTION at one instant. It cannot answer whether the growth is retained,
 * because a high reading may be a high boot level rather than accumulation. The quantity the ten-hour
 * arm needs is the HOARD SLOPE: two identical drains, early and late, on one session, differenced.
 *
 *   hoardSlope = (hoard_B - hoard_A) / hours between the two floor readings
 *
 * DRAINING IS BY PAUSE-AND-WAIT, NOT BY FORCED GC. A forced collection measures what the collector can
 * reach, not what the process holds; my own forced collections produced the 1.38 GB false ceiling and
 * confounded the per-trade coefficient. pause-probe.mjs is reused verbatim so this shares an instrument
 * with the published froth work rather than restating it.
 *
 * TWO POINTS ARE A DIFFERENCE, NOT A FIT. The output is a direction and a magnitude class with no CI, and
 * it is labelled as such. I have withdrawn two headlines for extrapolating a slope past its evidence.
 *
 * STALL GATE: the A8 run stalled at ~8 minutes with bars pinned. A stall between the two drains would
 * freeze the hoard and read as a clean flat slope — a false all-clear of exactly the shape that has
 * bitten this workstream before. The playhead must be PROVEN to advance across the play leg or the run
 * is VOID.
 */

import fs from 'fs';
import path from 'path';
import { bootConf01Session } from './lib/conf01-session.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';
import { readFootprint } from './lib/footprint.mjs';
import { pauseProbe } from './lib/pause-probe.mjs';
import { deliveredRate } from './lib/rate-hold.mjs';
import { computeSeal } from './lib/seal.mjs';
import { readBuildInfo } from './lib/build-info.mjs';
import { assertHeapCap } from './lib/heap-cap.mjs';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

const ORIGIN = arg('origin', 'http://31.97.192.82:3000');
const SPEED = Number(arg('speed', 10));
const WARMUP_MIN = Number(arg('warmup', 4));
const PLAY_MIN = Number(arg('play', 20));
const FROTH_MS = Number(arg('frothMs', 60_000));
const RECLAIM_MS = Number(arg('reclaimMs', 600_000));
const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const OUT = arg('out', path.join(EV, `a8-hoard-slope-${new Date().toISOString().replace(/[:.]/g, '-')}.json`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Playhead + resident bars, host realm. Resident bars are RECORDED, never used as a denominator here:
 *  the A8 fit divided by this count while it sawtoothed 881..3,790, which is what made its per-kbar
 *  slope uninterpretable. */
async function readPlayhead(page) {
  return page.evaluate(() => {
    const c = window.chart;
    const rs = c && c.replaySystem;
    let jsHeapMB = null;
    try { if (performance.memory) jsHeapMB = +(performance.memory.usedJSHeapSize / 1048576).toFixed(2); } catch (_) {}
    return {
      replayIndex: rs && rs.currentIndex != null ? rs.currentIndex : null,
      replayTimestamp: rs && rs.currentTime != null ? rs.currentTime : (rs && rs.replayTimestamp) || null,
      isPlaying: !!(rs && rs.isPlaying),
      residentBars: (c && c.data && c.data.length) || null,
      jsHeapMB,
    };
  }).then((r) => ({ ...r, atMs: Date.now(), readOk: true }))
    // The reason is KEPT. My first version returned a bare {atMs} on failure, so when the browser was
    // killed under the run mid-drain the log printed "idx undefined" for twenty minutes and the cause
    // was nowhere. This is the swallowed-catch defect I fixed in the workload library and then wrote
    // again here.
    .catch((e) => ({ atMs: Date.now(), readOk: false, readError: String(e && e.message || e).slice(0, 160) }));
}

/**
 * Is the browser still there at all? A drain is ten minutes of not touching the page, which is ten
 * minutes in which another manager's chrome cleanup can take the browser out from under the run — it
 * happened on the first attempt, and every subsequent reading was an empty string in a log.
 */
async function browserAlive(browser, page) {
  try {
    if (!browser || browser.isConnected() !== true) return { alive: false, why: 'puppeteer browser is no longer connected' };
    if (!page || page.isClosed()) return { alive: false, why: 'the page is closed' };
    await page.evaluate(() => 1);
    return { alive: true };
  } catch (e) {
    return { alive: false, why: `page unreachable: ${String(e && e.message || e).slice(0, 140)}` };
  }
}

/**
 * The grading, exported so the self-test exercises THIS function rather than a restatement of it. A gate
 * that only exists inside a two-hour run is a gate nobody has ever seen fail.
 */
export function gradeHoardSlope({ probeA, probeB, advance, barMB = 1024 }) {
  const gates = {
    probeAMeasured: probeA?.verdict === 'MEASURED',
    probeBMeasured: probeB?.verdict === 'MEASURED',
    playheadAdvancedBetweenDrains: advance?.moved === true,
    advance: advance ?? null,
  };

  // Order matters: a stall is checked FIRST because a stalled product produces a flat hoard, which is
  // the most attractive wrong answer available here.
  if (!gates.playheadAdvancedBetweenDrains) {
    return { gates, verdict: 'VOID', why: 'the playhead did not advance between the two drains, so a flat hoard would mean a stalled product, not a healthy one. This is the false all-clear the gate exists to prevent.' };
  }
  if (!gates.probeAMeasured || !gates.probeBMeasured) {
    return { gates, verdict: 'VOID', why: `a drain failed to measure a floor (A ${probeA?.verdict}, B ${probeB?.verdict}).` };
  }

  const lastAt = (p) => p.steps[p.steps.length - 1].atMs;
  const hoardA = probeA.hoardFloorMB;
  const hoardB = probeB.hoardFloorMB;
  const hours = (lastAt(probeB) - lastAt(probeA)) / 3_600_000;
  if (!(hours > 0) || !Number.isFinite(hoardA) || !Number.isFinite(hoardB)) {
    return { gates, verdict: 'VOID', why: `cannot difference the floors (hoardA=${hoardA}, hoardB=${hoardB}, hours=${hours}). A slope that cannot be computed must never report a pass.` };
  }

  const deltaHoard = +(hoardB - hoardA).toFixed(1);
  const hoardSlope = +(deltaHoard / hours).toFixed(1);
  const runningSlope = Number.isFinite(probeA.runningMB) && Number.isFinite(probeB.runningMB)
    ? +((probeB.runningMB - probeA.runningMB) / hours).toFixed(1) : null;
  const retainedFraction = runningSlope ? +((hoardSlope / runningSlope) * 100).toFixed(1) : null;

  return {
    gates,
    verdict: 'MEASURED',
    result: {
      hoardA_MB: hoardA,
      hoardB_MB: hoardB,
      hoursBetweenFloors: +hours.toFixed(3),
      deltaHoardMB: deltaHoard,
      hoardSlopeMBPerHour: hoardSlope,
      runningSlopeMBPerHour: runningSlope,
      retainedPercentOfRunningClimb: retainedFraction,
      frothPercentA: probeA.frothPercentOfRunning,
      frothPercentB: probeB.frothPercentOfRunning,
      form: 'TWO-POINT DIFFERENCE, not a fit: no CI, no r2, no runs statistic. Direction and magnitude class only.',
    },
    tenHourConsequence: {
      barMB,
      hoardNowMB: hoardB,
      hoursToBarAtThisSlope: hoardSlope > 0 ? +((barMB - hoardB) / hoardSlope).toFixed(2) : null,
      alreadyOverBar: hoardB > barMB,
      caveat: 'projection off a two-point difference. It sizes the decision; it is not a published rate.',
    },
  };
}

function advanced(a, b) {
  const idx = Number.isFinite(a?.replayIndex) && Number.isFinite(b?.replayIndex) ? b.replayIndex - a.replayIndex : null;
  const ts = Number.isFinite(a?.replayTimestamp) && Number.isFinite(b?.replayTimestamp) ? b.replayTimestamp - a.replayTimestamp : null;
  return { indexAdvance: idx, timestampAdvanceMs: ts, moved: (idx != null && idx > 0) || (ts != null && ts > 0) };
}

// Importing this file must not launch a browser: the self-test imports the grader above.
const RUN_DIRECTLY = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

if (RUN_DIRECTLY) (async () => {
  assertHeapCap();
  console.log(`A8 HOARD-SLOPE  origin=${ORIGIN} speed=${SPEED} warmup=${WARMUP_MIN}m play=${PLAY_MIN}m`);
  console.log(`  drains: ${FROTH_MS / 1000}s froth + ${RECLAIM_MS / 60000}min reclaim, twice. No forced GC.`);

  const seal = await computeSeal(ORIGIN);
  const info = await readBuildInfo(ORIGIN).catch((e) => ({ ok: false, why: String(e && e.message).slice(0, 80) }));
  if (!seal.ok || !seal.digest) { console.error('REFUSING: could not seal the origin.'); process.exit(2); }
  if (!info.ok || !info.sourceCommitSha) { console.error('REFUSING: no source commit (PASSPORT-3).'); process.exit(3); }
  console.log(`  build ${seal.badge || '?'}  sha ${String(info.sourceCommitSha).slice(0, 8)}  digest ${String(seal.digest).slice(0, 8)}`);

  const eSel = await loadConf05Indicators();
  let session = null;
  const artifact = {
    signature: 'A8-HOARD-SLOPE-V1',
    at: new Date().toISOString(),
    question: 'is the A8 running climb retention (hoard) or reclaimable froth?',
    identity: { buildId: seal.badge, sealDigest: seal.digest, sourceCommit: info.sourceCommitSha },
    condition: { speed: SPEED, step: 'TF', panels: 4, indicatorsPerPanel: 2, trades: 0, origin: ORIGIN, drain: 'pause-and-wait, no forced GC' },
    probes: {},
  };

  try {
    session = await bootConf01Session({
      indicators: eSel.pairs,
      replaySpeed: SPEED,
      placeOrder: false,
      label: 'a8-hoard-slope',
    });
    const page = session.page;

    // pause-probe records whatever readFootprint returns, so the heap and bar readings ride along with
    // every stage. Distinguishing "V8 freed but the allocator kept the arena" from real retention needs
    // the heap beside the footprint - reading only the OS number is how I published a retention story
    // out of an allocator behaviour once already.
    const readAll = async () => {
      const fp = await readFootprint(session.browser).catch((e) => ({ error: String(e).slice(0, 120) }));
      const ph = await readPlayhead(page);
      return { ...fp, jsHeapMB: ph.jsHeapMB ?? null, residentBars: ph.residentBars ?? null, replayIndex: ph.replayIndex ?? null };
    };

    console.log(`\n[warm-up] ${WARMUP_MIN} min at speed ${SPEED}...`);
    await sleep(WARMUP_MIN * 60_000);

    const beforeA = await readPlayhead(page);
    console.log(`[probe A] running footprint read, then pause + drain (~${(FROTH_MS + RECLAIM_MS) / 60000} min)`);
    const probeA = await pauseProbe(page, { readFootprint: readAll, frothWaitMs: FROTH_MS, reclaimWaitMs: RECLAIM_MS, label: 'A-early', log: (m) => console.log(`  ${m}`) });
    artifact.probes.A = probeA;
    const liveAfterA = await browserAlive(session.browser, page);
    if (!liveAfterA.alive) throw new Error(`BROWSER_LOST during probe A's drain — ${liveAfterA.why}. The floor reading is missing, not zero.`);
    const afterA = await readPlayhead(page);

    if (probeA.verdict !== 'MEASURED') {
      artifact.verdict = 'VOID';
      artifact.why = `probe A did not measure a floor: ${probeA.why}`;
    } else {
      console.log(`\n[play leg] ${PLAY_MIN} min...`);
      const legStart = await readPlayhead(page);
      const legT0 = Date.now();
      // Sampled rather than slept through: a stall discovered only at the end wastes the whole leg, and
      // the A8 stall arrived at ~8 minutes.
      const legSamples = [];
      let prevRate = legStart;
      while (Date.now() - legT0 < PLAY_MIN * 60_000) {
        await sleep(Math.min(120_000, PLAY_MIN * 60_000 - (Date.now() - legT0)));
        const live = await browserAlive(session.browser, page);
        if (!live.alive) throw new Error(`BROWSER_LOST during the play leg — ${live.why}. Nothing after this point can be measured, so the run stops here instead of sampling an absent browser for another half hour.`);
        const ph = await readPlayhead(page);
        const rate = deliveredRate(prevRate, ph);
        prevRate = ph;
        legSamples.push({
          minute: +((Date.now() - legT0) / 60000).toFixed(1),
          replayIndex: ph.replayIndex, residentBars: ph.residentBars, isPlaying: ph.isPlaying,
          marketSecPerWallSec: rate.ok ? rate.marketSecPerWallSec : null,
        });
        const last = legSamples[legSamples.length - 1];
        console.log(`  ${last.minute}m  idx ${last.replayIndex}  bars ${last.residentBars}  rate ${last.marketSecPerWallSec ?? '?'} mkt-s/s`);
      }
      artifact.playLeg = { samples: legSamples, advance: advanced(legStart, await readPlayhead(page)) };

      const beforeB = await readPlayhead(page);
      console.log(`\n[probe B] running footprint read, then pause + drain (~${(FROTH_MS + RECLAIM_MS) / 60000} min)`);
      const probeB = await pauseProbe(page, { readFootprint: readAll, frothWaitMs: FROTH_MS, reclaimWaitMs: RECLAIM_MS, label: 'B-late', log: (m) => console.log(`  ${m}`) });
      artifact.probes.B = probeB;

      const graded = gradeHoardSlope({ probeA, probeB, advance: artifact.playLeg.advance });
      Object.assign(artifact, graded);
    }
  } catch (e) {
    const msg = String(e && e.message);
    artifact.verdict = 'VOID';
    // A browser killed under the run is an ENVIRONMENT loss, not a product finding, and the two must
    // never be filed as the same thing. The first attempt died this way when another manager's chrome
    // cleanup swept the host at 13:07 and took this browser with it.
    artifact.voidClass = /BROWSER_LOST/.test(msg) ? 'ENVIRONMENT_BROWSER_LOST' : 'THREW';
    artifact.why = msg.slice(0, 400);
    console.error(e);
  } finally {
    try { if (session && session.browser) await session.browser.close(); } catch (_) {}
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));
  console.log(`\n=== ${artifact.verdict} ===`);
  if (artifact.result) {
    const r = artifact.result;
    console.log(`  hoard ${r.hoardA_MB} -> ${r.hoardB_MB} MB over ${r.hoursBetweenFloors} h`);
    console.log(`  HOARD slope    ${r.hoardSlopeMBPerHour} MB/h   (running slope ${r.runningSlopeMBPerHour} MB/h)`);
    console.log(`  retained share of the climb: ${r.retainedPercentOfRunningClimb}%   froth ${r.frothPercentA}% -> ${r.frothPercentB}%`);
    if (artifact.tenHourConsequence) {
      const t = artifact.tenHourConsequence;
      console.log(`  hoard now ${t.hoardNowMB} MB vs ${t.barMB} MB bar${t.alreadyOverBar ? '  ALREADY OVER' : `  -> reaches bar in ${t.hoursToBarAtThisSlope} h`}`);
    }
  } else {
    console.log(`  ${artifact.why}`);
  }
  console.log(`  -> ${OUT}`);
  process.exitCode = artifact.verdict === 'MEASURED' ? 0 : 1;
})();
