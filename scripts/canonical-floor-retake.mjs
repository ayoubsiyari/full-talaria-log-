/**
 * CANONICAL-FLOOR-RETAKE — checklist item 13. Retires 633 versus 532.6.
 *
 * THE CONFUSION, STATED BEFORE THE FIX. Two floors have been quoted at each other all week:
 *
 *   532.6 MB  E's advisor headline. Four panels, boot, nothing played, read ~1 s after collection.
 *   633.0 MB  My own third census moment. Four-panel session played up to 1,018 MB, then three
 *             panels destroyed, then collected and read.
 *
 * They were never rival estimates of one quantity, and the reconciliation needs no host to see:
 * A reproduced E's headline at 531.84 MB and then re-read the SAME boot after a 20 s settle at
 * 420.70 MB. So 532.6 is the unsettled boot floor, and 633.0 is an unsettled POST-PLAY floor with a
 * retained tile cache inside it. One is a boot, one is a session; neither settled. Comparing them
 * was comparing a cold engine to a hot one and calling the difference a discrepancy.
 *
 * WHAT THIS INSTRUMENT ADDS, because the above does not need a run.
 *
 *   1. Both floors from ONE session, so they are on one build, one host and one gauge, and the
 *      difference between them is the play window and nothing else.
 *   2. A SETTLE CURVE at each floor rather than a reading. A's 20 s stop showed the decay exists;
 *      it did not show where it ends, and 420.70 is only a floor if the curve is flat there. The
 *      curve is read at 0 / 20 / 150 / 300 s of cumulative settle, each rung preceded by a forced
 *      collection, so the published method (~1 s) and A's method (20 s) are both rungs on it and
 *      the artifact shows what each of them would have reported.
 *   3. TOTAL-01 arena columns at every rung, so the floor is never a bare number.
 *
 * IF THE CURVE HAS NOT FLATTENED BY 300 s THE ANSWER IS A BOUND, NOT A FLOOR. `gradeSettleCurve`
 * returns STILL_FALLING and this instrument reports an upper bound. Publishing the last rung as a
 * floor because the run ended is exactly the defect being retired, and it is refused in code.
 *
 * CHECKPOINTED. Every rung is written to the artifact as it is taken, and the file carries
 * `partial: true` plus `verdict: INCOMPLETE_RUNNING` until an orderly finish clears them. A killed
 * run leaves its readings behind and cannot leave anything that reads as a result.
 *
 * GAUGE. `lib/footprint.mjs`, OS private working set summed across every browser process, with the
 * browser/renderer/GPU split. Verified to be the same gauge behind 633.0 and behind A's table, which
 * is what makes any of these numbers comparable at all.
 */

import fs from 'fs';
import path from 'path';
import { bootConf01Session } from './lib/conf01-session.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';
import { HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL } from './lib/heap-cycle-dataset-config.mjs';
import { readFootprint } from './lib/footprint.mjs';
import { computeSeal } from './lib/seal.mjs';
import { readBuildInfo } from './lib/build-info.mjs';
import { readUnderSettleProtocol } from './lib/settle-protocol.mjs';
import { arenaColumns, rankRowGrowth } from './lib/arena-columns.mjs';
import { collectMemoryDump } from './process-memory-census.mjs';
import { gradeSettleCurve, reconcileFloors } from './lib/floor-curve.mjs';
import { acquireRunLockOrExit, lockFlagsFromArgv, writeArtifactAtomic } from './lib/run-lock.mjs';
import { assessQuotability } from './lib/memory-validity.mjs';
import { captureDetailedDump } from './lib/detailed-dump-capture.mjs';
import { assessHeadline } from './lib/known-weakness.mjs';
import { assessAgainstBar } from './lib/bar-basis.mjs';
import { clockOf, both } from './lib/clock.mjs';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

const ORIGIN = arg('origin', 'http://31.97.192.82:3000');
const SPEED = Number(arg('speed', '10'));
/**
 * Warmup before the BOOT floor is forbidden by default. E's 532.6 and A's 420.70 are cold-boot
 * readings — four panels, nothing played. A warm play before the first curve measures a different
 * quantity and cannot retire those figures. `--warmup` remains for deliberate non-cold arms only.
 */
const WARMUP_MIN = Number(arg('warmup', '0'));
const PLAY_MIN = Number(arg('play', '20'));
const OUT = arg('out', `_evidence/manager-C/canonical-floor-retake-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

/**
 * Cumulative settle rungs in seconds. 0 and 20 are not arbitrary: they are the two published
 * methods, kept as rungs so this artifact can say what each of them would have reported on this
 * session instead of relying on the older runs being comparable.
 *
 * 600 is required after the b126 first pass: both curves fell another ~10 MB between 150s and 300s
 * (STILL_FALLING / BOUND_ONLY). Quoting 300s as a floor would have repeated the defect. The last
 * rung must be far enough that a 10 MB late drop either flattens or forces another extension.
 */
const RUNGS_SEC = (arg('rungs', '0,20,150,300,600')).split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));

/**
 * WHERE THE ARENA DUMP IS TAKEN — `endpoints` (default) or `every`.
 *
 * A memory-infra detailed dump is not a free observation. It walks every allocator in every process
 * and allocates while doing it, and this instrument was firing one *inside* each settle rung, on the
 * curve it was trying to read. The b126 pass-3 boot curve came back `NOT_IDLE` — 682.5 → 634.2 →
 * 640.7 → 640.8 → 628.2, falling, rising 6.5 MB, flat, then falling again — with the GPU process
 * moving in step. A session with all four panels paused should not do that, and the most likely
 * disturber is the measurement.
 *
 * TOTAL-01 needs the arena columns at both ENDS of the settle, not at every rung, so taking them at
 * the first and last rung only costs nothing that is quoted and removes the suspected perturbation
 * from the middle of the curve. `--dumpAt=every` restores the old behaviour, which is what makes
 * this testable rather than asserted: run both and the difference is the instrument's own footprint.
 */
const DUMP_AT = arg('dumpAt', 'endpoints');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * CLOCK-01. This printed `toISOString().slice(11,19)` — UTC with the `Z` sliced off — while the
 * boards quote this instrument's run times in `+01:00`. That is how one run acquired two identities:
 * A read this instrument's start from the process table as `12:04:34+01:00` and correctly published
 * it, my own log line for the same instant said `11:04`, and a consistent sequence read as an hour
 * of drift. The offset is now emitted rather than remembered.
 */
const log = (m) => console.log(`[floor-retake ${clockOf(new Date(), { seconds: true })}] ${m}`);

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

/**
 * COV-01 capture at one of the four scheduled moments: the first and last rung of each of the two
 * settle curves. E's detailed dump is called INLINE here because the queue hands the box over by
 * emptying it — E's standalone attempt found no browser to attach to, and never could.
 *
 * This runs ALONGSIDE the roots-only row rather than replacing it. The old row is what produced the
 * published 59.84%, and keeping both in the artifact is what lets the new figure be checked against
 * the old one instead of silently superseding it.
 */
async function readDetailedCoverage(browser, totalPrivateMB, moment) {
  return captureDetailedDump(browser, { totalPrivateMB, moment });
}

/** Arena columns for the heaviest renderer, carrying the TOTAL-01 total. */
async function readArenaColumns(browser, totalPrivateMB) {
  try {
    const cdp = await browser.target().createCDPSession();
    const byPid = await collectMemoryDump(cdp);
    let heaviest = null;
    for (const [pid, roots] of byPid) {
      const score = (roots?.v8 || 0) + (roots?.partition_alloc || 0) + (roots?.blink_gc || 0);
      if (!heaviest || score > heaviest.score) heaviest = { pid, score, roots };
    }
    try { await cdp.detach(); } catch (_) {}
    return { ...arenaColumns(heaviest?.roots || null, { totalPrivateMB }), arenaDumpPid: heaviest?.pid ?? null };
  } catch (e) {
    return { ...arenaColumns(null, { totalPrivateMB }), arenaDumpError: String(e?.message || e).slice(0, 140) };
  }
}

async function readPlayhead(page) {
  return page.evaluate(() => {
    const c = window.chart; const rs = c && c.replaySystem;
    return {
      replayIndex: rs?.currentIndex ?? null,
      residentBars: c?.rawData?.length ?? null,
      isPlaying: !!rs?.isPlaying,
      jsHeapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : null,
    };
  }).catch((e) => ({ readError: String(e?.message || e).slice(0, 140) }));
}

/**
 * Walk the settle curve at one floor.
 *
 * Each rung is a real SETTLE-PROTOCOL reading: settle the increment, force collection, then read.
 * The rung's own compliance grade rides along, so the 0 s and 20 s rungs are visibly NON-compliant
 * — they exist to reproduce the published methods, not to be quoted.
 */
async function settleCurve(session, { label, onProgress }) {
  const pause = await pauseAll(session.page);
  await sleep(2000);

  const reads = [];
  let cumulativeSec = 0;

  for (const targetSec of RUNGS_SEC) {
    const incrementMs = Math.max(0, (targetSec - cumulativeSec) * 1000);
    const isEndpoint = targetSec === RUNGS_SEC[0] || targetSec === RUNGS_SEC[RUNGS_SEC.length - 1];
    const wantDump = DUMP_AT === 'every' || isEndpoint;
    const rung = await readUnderSettleProtocol({
      page: session.page,
      settleMs: incrementMs,
      skipSettle: incrementMs === 0,
      label: `${label}@${targetSec}s`,
      log: (m) => log(`  ${m}`),
      read: async () => {
        const fp = await readFootprint(session.browser);
        const arenas = wantDump
          ? await readArenaColumns(session.browser, fp.footprintTotalMB)
          : { arenaDumpSkipped: 'not an endpoint; skipped so the dump does not perturb the settle' };
        // The four scheduled moments: first and last rung of the boot curve and of the post-play curve.
        const detailed = wantDump
          ? await readDetailedCoverage(session.browser, fp.footprintTotalMB,
            `${label}@${targetSec}s${targetSec === RUNGS_SEC[0] ? ' (first)' : ' (last)'}`)
          : null;
        const ph = await readPlayhead(session.page);
        return { ...fp, ...arenas, ...ph, ...(detailed ? { detailedCoverage: detailed } : {}) };
      },
    });
    cumulativeSec = targetSec;
    const totalMB = rung.value?.footprintTotalMB ?? null;
    reads.push({
      settleSec: targetSec,
      totalMB,
      gpuMB: rung.value?.footprintByType?.gpu ?? null,
      rendererMB: rung.value?.footprintByType?.renderer ?? null,
      browserMB: rung.value?.footprintByType?.browser ?? null,
      forcedGcOk: rung.forcedGcOk,
      forcedGcRoute: rung.route,
      protocolCompliant: rung.protocolCompliant,
      settleWaitedMs: rung.settleWaitedMs,
      arenaDumpTaken: wantDump,
      arenas: rung.value,
    });
    log(`  ${label} @${targetSec}s: ${totalMB ?? '?'} MB (gpu ${reads.at(-1).gpuMB ?? '?'}, renderer ${reads.at(-1).rendererMB ?? '?'})`);
    if (onProgress) onProgress({ label, pause, rungsSec: RUNGS_SEC, reads, curveComplete: false });
  }

  const graded = gradeSettleCurve(reads.map((r) => ({ settleSec: r.settleSec, totalMB: r.totalMB })));

  // TOTAL-01: the arena movement across the settle, refused if any endpoint lacks its total.
  const arenaMove = (reads.length >= 2)
    ? rankRowGrowth(reads[0].arenas, reads[reads.length - 1].arenas)
    : null;

  return {
    label,
    pause,
    rungsSec: RUNGS_SEC,
    reads,
    curveComplete: true,
    grade: graded,
    /** What the two published methods would have reported on THIS session. */
    asPublishedMethods: {
      atOneSecondMB: reads.find((r) => r.settleSec === 0)?.totalMB ?? null,
      atTwentySecondsMB: reads.find((r) => r.settleSec === 20)?.totalMB ?? null,
    },
    arenaMoveAcrossSettle: arenaMove,
    gcAvailable: reads.every((r) => r.forcedGcOk === true),
  };
}

async function main() {
  const seal = await computeSeal(ORIGIN).catch((e) => ({ error: String(e).slice(0, 120) }));
  const info = await readBuildInfo(ORIGIN).catch((e) => ({ error: String(e).slice(0, 120) }));

  const artifact = {
    signature: 'CANONICAL-FLOOR-RETAKE-V1',
    startedAt: new Date().toISOString(),
    question: 'What is the canonical floor, settled and force-collected, and does it retire 633 vs 532.6?',
    identity: { buildId: seal.badge ?? null, sourceCommit: info.sourceCommitSha ?? null, origin: ORIGIN },
    gauge: 'lib/footprint.mjs — OS private working set across every browser process, browser/renderer/gpu split',
    condition: {
      speed: SPEED,
      warmupMin: WARMUP_MIN,
      playMin: PLAY_MIN,
      datasetMode: HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL,
      requireDeliveringPanels: 4,
      rungsSec: RUNGS_SEC,
      dumpAt: DUMP_AT,
      protocol: 'SETTLE-PROTOCOL-V1 at every rung: settle -> forced collection -> read',
    },
    retires: {
      '532.6': "E's unsettled four-panel boot headline",
      '531.84': "A's reproduction of it, within 1 MB",
      '420.70': "A's same boot after a 20 s settle",
      '633.0': "C's unsettled POST-PLAY floor after destroying three panels — never comparable to the above",
    },
    /**
     * Set from the first rung onward and cleared only on an orderly finish. A killed run therefore
     * leaves an artifact that says it is a fragment. Two b126 passes were killed mid-curve on this
     * box and the second lost three real readings because the artifact was written once, at the end.
     * Readings are expensive and kills are not rare here, so each rung is checkpointed to disk — but
     * a fragment that could be mistaken for a result would be worse than no fragment at all, hence
     * the verdict below rather than a bare partial file.
     */
    verdict: 'INCOMPLETE_RUNNING',
    partial: true,
    partialWhy: 'run had not finished when this was written; no floor here is quotable and the last '
      + 'rung of an unfinished curve is not an upper bound either, because the curve may still fall.',
    completedAt: null,
  };

  // Atomic, because this file is now written at every rung: a kill landing mid-write would leave
  // truncated JSON that parses as "no data" rather than as "interrupted", which is the failure that
  // cost E an hour. Checkpointing without an atomic write would have traded one loss for a worse one.
  const writeArtifact = () => {
    try {
      writeArtifactAtomic(OUT, JSON.stringify(artifact, null, 2));
    } catch (e) {
      log(`checkpoint write failed: ${String(e?.message || e).slice(0, 120)}`);
    }
  };

  /**
   * RUN-LOCK-01 before anything launches a browser. The queue decides whose turn it is; this is what
   * actually stops two runs sharing the box, and this instrument was one of the runs it was built
   * against — the 12:04 pass ran with no queue claim at all and A parked a canary over it.
   * `await` is harmless on the synchronous form and is what the consumer cell looks for.
   */
  const runLock = await acquireRunLockOrExit({
    artifact: OUT,
    script: 'canonical-floor-retake.mjs',
    ...lockFlagsFromArgv(),
  });
  artifact.runLock = { state: runLock.state, foreignScan: runLock.foreignScan ?? null };

  let session = null;
  try {
    // Both clocks once, at the top, because this is the line another lane will quote back when it
    // cross-references this run against the process table or against an artifact's UTC field.
    log(`started ${both()} — pid ${process.pid}`);
    log(`booting same-symbol CONF-01 speed=${SPEED}`);
    session = await bootConf01Session({
      indicators: loadConf05Indicators().pairs,
      replaySpeed: SPEED,
      placeOrder: false,
      datasetMode: HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL,
      requireDeliveringPanels: 4,
      label: 'canonical-floor-retake',
    });
    artifact.conf01 = {
      datasetMode: session.conf01.datasetMode,
      delivering: session.conf01.delivering,
      fileIds: session.conf01.fileIds,
      commonWindow: session.conf01.commonWindow ?? null,
    };
    log(`boot ok advancing=${session.conf01.delivering?.advancingPanels}`);
    writeArtifact();

    // CONF-01 arms panels into a playing state. The boot floor must be a cold reading, so pause
    // immediately and do not warm-play first. A prior b126 pass warmed 4 min before the boot curve
    // and produced a 728 MB bound that cannot be compared to E's 532.6 cold headline.
    await pauseAll(session.page);
    if (WARMUP_MIN > 0) {
      log(`WARNING: --warmup=${WARMUP_MIN} is set; boot floor is NO LONGER a cold-boot reading`);
      await resumeAll(session.page);
      await sleep(WARMUP_MIN * 60_000);
      await pauseAll(session.page);
    }

    log('BOOT FLOOR — settle curve (cold, nothing played after arm)');
    artifact.bootFloor = await settleCurve(session, {
      label: 'boot',
      onProgress: (partial) => { artifact.bootFloor = partial; writeArtifact(); },
    });
    writeArtifact();
    log(`  boot floor: ${artifact.bootFloor.grade.state} ${artifact.bootFloor.grade.floorMB ?? artifact.bootFloor.grade.upperBoundMB ?? '?'} MB`);

    log(`play leg ${PLAY_MIN} min`);
    const beforePlay = await readPlayhead(session.page);
    const resume = await resumeAll(session.page);
    // Confirm play actually took before sleeping the wall clock — the first b126 pass slept 20 min
    // against a session that delivered 0 bars (index 1260 → 546), and that voided the post-play arm.
    await sleep(8_000);
    const playCheck = await readPlayhead(session.page);
    if (!playCheck?.isPlaying) {
      log('play did not stick after resume — retrying once');
      await resumeAll(session.page);
      await sleep(5_000);
    }
    await sleep(Math.max(0, PLAY_MIN * 60_000 - 8_000));
    const afterPlay = await readPlayhead(session.page);
    const beforeIdx = Number(beforePlay?.replayIndex);
    const afterIdx = Number(afterPlay?.replayIndex);
    let barsDelivered = 0;
    let playNote = null;
    if (Number.isFinite(beforeIdx) && Number.isFinite(afterIdx)) {
      if (afterIdx > beforeIdx) barsDelivered = afterIdx - beforeIdx;
      else if (afterIdx < beforeIdx) {
        // Window wrap / re-seed: not "0 bars". Count forward progress after the reset.
        barsDelivered = afterIdx;
        playNote = `playhead reset during the leg (${beforeIdx} -> ${afterIdx}); barsDelivered counts post-reset only`;
      }
    }
    artifact.playLeg = {
      beforePlay,
      afterPlay,
      resume,
      playCheck,
      barsDelivered,
      playNote,
      wasPlayingAtEnd: !!afterPlay?.isPlaying,
    };
    log(`  played ${barsDelivered} bars${playNote ? ` (${playNote})` : ''}`);
    writeArtifact();

    log('POST-PLAY FLOOR — settle curve');
    artifact.postPlayFloor = await settleCurve(session, {
      label: 'post-play',
      onProgress: (partial) => { artifact.postPlayFloor = partial; writeArtifact(); },
    });
    writeArtifact();
    log(`  post-play floor: ${artifact.postPlayFloor.grade.state} ${artifact.postPlayFloor.grade.floorMB ?? artifact.postPlayFloor.grade.upperBoundMB ?? '?'} MB`);

    const bootMB = artifact.bootFloor.grade.floorMB;
    const postMB = artifact.postPlayFloor.grade.floorMB;
    artifact.reconciliation = reconcileFloors({ bootFloorMB: bootMB, postPlayFloorMB: postMB });

    // The verdict refuses to be a number when either curve failed to reach an asymptote.
    if (bootMB != null && postMB != null) {
      artifact.verdict = 'MEASURED';
      artifact.canonicalFloors = {
        bootFloorMB: bootMB,
        postPlayFloorMB: postMB,
        playCostMB: +(postMB - bootMB).toFixed(3),
        barsDelivered: artifact.playLeg.barsDelivered,
      };
    } else {
      artifact.verdict = 'BOUND_ONLY';
      artifact.why = 'at least one settle curve had not flattened by the last rung, so its reading is an upper '
        + 'bound rather than a floor. Extend --rungs and re-run; do not quote the last rung as a floor.';
      artifact.bounds = {
        bootUpperBoundMB: artifact.bootFloor.grade.upperBoundMB ?? null,
        postPlayUpperBoundMB: artifact.postPlayFloor.grade.upperBoundMB ?? null,
      };
    }
    /**
     * COV-01-VALIDITY, ruled 2026-08-03 16:26+01:00. This instrument produces the authoritative
     * memory number, so it is the place the coverage threshold has to bind. Coverage was already
     * being measured on every rung and consumed by nothing, which meant a 55%-coverage floor
     * published identically to a 99% one.
     *
     * Note the two verdicts are deliberately independent: `FLOOR_FOUND` says the curve flattened,
     * `quotable` says enough of the number has a name. A floor can be genuinely found and still not
     * be quotable, and collapsing those into one word is how the missing half gets forgotten.
     */
    // The COV-01 columns live on the rung's `arenas` sub-object, not on the rung itself. Reading
    // them from the wrong level returns undefined, which assessQuotability would report as
    // COVERAGE_UNKNOWN — a broken-instrument state — so the level matters more than it looks.
    /**
     * COV-01 is graded on the ALL-PROCESS capture when one is present, and on the single-pid row only
     * as a fallback. The published 59.84% was never 271 MB of nameless memory: it was one renderer's
     * arenas divided by every Chrome process's private footprint. My own W90 census had already shown
     * a renderer's roots covering 310.9 of its 311.21 MB, so the gap was arithmetic, not attribution.
     *
     * `OVERLAP_SUSPECTED` and `DUMP_UNAVAILABLE` are deliberately NOT translated into a percentage
     * here. They travel as a null so `assessQuotability` returns COVERAGE_UNKNOWN — a broken
     * instrument — rather than a low reading, which would send someone looking for missing memory
     * that does not exist.
     */
    const coverageOf = (curve) => {
      const reads = curve?.reads || [];
      const detailed = [...reads].reverse().find((r) => r?.detailedCoverage?.covState === 'MEASURED');
      if (detailed) {
        const d = detailed.detailedCoverage;
        return { pct: d.arenaCoveragePct, unattributedMB: d.arenaUnattributedMB,
          hasTotalRow: d.totalPrivateMB != null, basis: `all-process (${d.processCount} processes, ${d.sizeBasis})` };
      }
      const broken = [...reads].reverse().find((r) => r?.detailedCoverage
        && r.detailedCoverage.covState !== 'MEASURED');
      if (broken) {
        return { pct: null, unattributedMB: null, hasTotalRow: true,
          basis: `detailed capture did not measure: ${broken.detailedCoverage.covState}` };
      }
      const last = [...reads].reverse().find((r) => r?.arenas?.arenaCoveragePct != null);
      return { pct: last?.arenas?.arenaCoveragePct ?? null, unattributedMB: last?.arenas?.arenaUnattributedMB ?? null,
        hasTotalRow: last?.arenas?.totalPrivateMB != null,
        basis: 'single-pid roots over an all-process total — the basis that produced 59.84%' };
    };
    const postCov = coverageOf(artifact.postPlayFloor);
    const bootCov = coverageOf(artifact.bootFloor);
    artifact.validity = {
      postPlayFloor: { ...assessQuotability({
        coveragePct: postCov.pct, unattributedMB: postCov.unattributedMB,
        hasTotalRow: postCov.hasTotalRow, what: 'the canonical post-play floor',
      }), coverageBasis: postCov.basis },
      bootFloor: { ...assessQuotability({
        coveragePct: bootCov.pct, unattributedMB: bootCov.unattributedMB, hasTotalRow: bootCov.hasTotalRow,
        what: 'the canonical boot floor' }), coverageBasis: bootCov.basis },
    };
    /**
     * COV-01 BLOCKS AT THE GATE, it does not caveat in prose. Ruled 2026-08-03 18:34+01:00.
     *
     * Stamping `validity` on the artifact was still a caveat — the number sat in `canonicalFloors`,
     * quotable-looking, with a warning elsewhere in the file. **Caveats get dropped when numbers get
     * quoted**; that is not a hypothetical, it is how `633` and `532.6` both entered circulation and
     * cost a day to retire. So the under-covered number is REMOVED from the field a reader quotes
     * from and moved to `blockedFloors`, where taking it requires reading the reason attached to it.
     *
     * The measurement is not deleted — every rung is still in the artifact, and `withheldFloors`
     * names what was withheld and why. Deleting it would be its own dishonesty. The point is that
     * the publish surface refuses, not that the evidence disappears.
     */
    const covBlocked = !artifact.validity.postPlayFloor.quotable;
    if (covBlocked && artifact.canonicalFloors) {
      artifact.blockedFloors = {
        ...artifact.canonicalFloors,
        blockedBy: 'COV-01',
        state: artifact.validity.postPlayFloor.state,
        reason: artifact.validity.postPlayFloor.reason,
        howToUnblock: 'raise named coverage to >=95% (E\'s parsed detailed dumps) and re-grade this artifact; '
          + 'the rungs are unchanged and do not need re-measuring.',
      };
      delete artifact.canonicalFloors;
      artifact.verdict = artifact.verdict === 'MEASURED' ? 'MEASURED_NOT_QUOTABLE' : artifact.verdict;
    }

    /**
     * KNOWN-WEAKNESS-01. A rung that carries a `knownWeakness` cannot publish a headline until that
     * weakness has been dispositioned in writing. Twice today a number I had already measured went
     * unread — coverage, sitting on every arena row since ARENA-COLUMNS-V1, and a renderer at 99.9%
     * attribution sitting in a field named `knownWeakness`. Both were written by the person who then
     * failed to act on them, which is the whole argument for the gate: writing a caveat is not
     * evidence that the caveat was read.
     *
     * The dispositions are declared HERE, in the instrument, rather than passed at the call site, so
     * that adding a weakness to a rung cannot be silently waived by a flag on the command line.
     */
    /**
     * BAR-BASIS-01 on the floor, from the same shared definition the hoard-floor probe uses. Two
     * gates comparing against one bar on two bases can disagree while both read green, which is the
     * failure the PO's three-row ruling exists to close.
     */
    {
      const lastPost = [...(artifact.postPlayFloor?.reads || [])].reverse()
        .find((r) => r?.footprintTotalMB != null);
      if (lastPost) {
        artifact.barBasis = assessAgainstBar(lastPost, {
          settled: artifact.postPlayFloor?.verdict === 'FLOOR_FOUND',
          what: 'the canonical post-play floor',
        });
        log(`BAR-BASIS-01 ${artifact.barBasis.barState} — ${artifact.barBasis.reason}`);
      }
    }

    const weakness = assessHeadline({
      headline: 'the canonical floor',
      rung: artifact,
      dispositions: [{
        weakness: 'summed `size` rather than `effective_size`',
        disposition: 'addressed',
        by: 'C 2026-08-03',
        text: 'DETAILED-DUMP-CAPTURE-V1 sums effective_size and flags any process falling back to size; '
          + 'a named total exceeding the private total is OVERLAP_SUSPECTED rather than a passing grade.',
      }],
    });
    artifact.knownWeaknessGate = weakness;
    if (!weakness.publishable) {
      artifact.verdict = 'MEASURED_NOT_PUBLISHABLE';
      log(`KNOWN-WEAKNESS-01 ${weakness.state} — ${weakness.reason}`);
      for (const u of weakness.unaddressed) log(`  UNADDRESSED  ${u.at}: ${u.text.slice(0, 120)}`);
    }

    log(`VERDICT ${artifact.verdict}`);
    log(`COV-01 post-play: ${artifact.validity.postPlayFloor.state} (${artifact.validity.postPlayFloor.coveragePct ?? 'n/a'}%)`);
    if (covBlocked) {
      log('COV-01 BLOCKED — the floor is in blockedFloors, not canonicalFloors. It is not quotable.');
    }
  } catch (e) {
    artifact.verdict = 'ERROR';
    artifact.error = String(e?.stack || e).slice(0, 1600);
    log('ERROR ' + artifact.error.split('\n')[0]);
  } finally {
    try { if (session?.browser) await session.browser.close(); } catch (_) {}
    // Reaching here at all means the run terminated in an orderly way, error included. A kill skips
    // this, which is exactly what leaves `partial` set on the fragment.
    artifact.partial = false;
    delete artifact.partialWhy;
    artifact.completedAt = new Date().toISOString();
    writeArtifact();
    try { runLock.release(); } catch (_) { /* a lock we cannot release is reaped as stale, not fatal */ }
    log(`artifact -> ${OUT} (${artifact.verdict})`);
    /**
     * The gate has to be legible to something that is not a human reading prose, so the exit code
     * carries it: 0 quotable, 4 measured-but-blocked, 1 error. 4 rather than 1 because a blocked
     * floor is NOT a failed run — the measurement is good and the artifact is complete, it simply
     * may not be published — and a caller that cannot tell those apart will retry a run that needs
     * no retrying, or bury one that does.
     */
    if (artifact.verdict === 'ERROR') process.exitCode = 1;
    else if (artifact.blockedFloors) process.exitCode = 4;
  }
}

import { pathToFileURL } from 'node:url';
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect && !process.argv.includes('--noRun')) main();
