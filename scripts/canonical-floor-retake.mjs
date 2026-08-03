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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[floor-retake ${new Date().toISOString().slice(11, 19)}] ${m}`);

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
    const rung = await readUnderSettleProtocol({
      page: session.page,
      settleMs: incrementMs,
      skipSettle: incrementMs === 0,
      label: `${label}@${targetSec}s`,
      log: (m) => log(`  ${m}`),
      read: async () => {
        const fp = await readFootprint(session.browser);
        const arenas = await readArenaColumns(session.browser, fp.footprintTotalMB);
        const ph = await readPlayhead(session.page);
        return { ...fp, ...arenas, ...ph };
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

  const writeArtifact = () => {
    try {
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));
    } catch (e) {
      log(`checkpoint write failed: ${String(e?.message || e).slice(0, 120)}`);
    }
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
    log(`VERDICT ${artifact.verdict}`);
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
    log(`artifact -> ${OUT} (${artifact.verdict})`);
  }
}

import { pathToFileURL } from 'node:url';
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect && !process.argv.includes('--noRun')) main();
